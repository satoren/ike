/**
 * ゲームのフィードバックを受け取って溜め、1 日 1 回まとめる中継（Cloudflare Workers + D1）。
 * GitHub には何も書かない。まとめは合言葉付きの管理ページ（/admin）で見る。
 * プレイヤーは GitHub アカウント不要。
 *
 * 設定（wrangler.toml / secret）:
 *   DB              … D1 データベース（schema.sql）
 *   ADMIN_KEY       … 管理ページの合言葉（secret）。長めのランダムな文字列にする
 *   ALLOWED_ORIGINS … 投稿を受け付ける送信元（カンマ区切り）
 */
import { ADMIN_HTML } from './admin.js';

export const KINDS = { bug: '不具合', idea: '要望・アイデア', comment: '感想' };
const MESSAGE_MAX = 2000;
/** 同じ IP から 10 分に送れる数 */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;
/** まとめた後の元の投稿を残す日数 */
const KEEP_RAW_DAYS = 30;
/** 1 日のまとめに入れる、種類ごとの最大件数 */
const DIGEST_PER_KIND = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
/** 日付の区切りは日本時間 */
const JST_MS = 9 * 60 * 60 * 1000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/admin') return new Response(ADMIN_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(request, env, url);
      } catch (e) {
        // 管理用 API の中で起きたエラーは、中身を返して原因を追えるようにする（合言葉が通ったときだけ）
        const auth = request.headers.get('Authorization') ?? '';
        const detail = sameKey(auth.replace(/^Bearer\s+/i, ''), env.ADMIN_KEY) ? String(e?.message ?? e) : undefined;
        return json(500, { error: 'server', detail, hasDB: Boolean(env.DB) });
      }
    }
    return submit(request, env);
  },

  /** 毎日 0:00（日本時間）に、前の日の投稿をまとめる */
  async scheduled(event, env) {
    await runDaily(env, event.scheduledTime ?? Date.now());
  },
};

// ---------- 投稿 ----------

async function submit(request, env) {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const cors = {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] ?? ''),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
  const reply = (status, body) => json(status, body, cors);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return reply(405, { error: 'method' });
  if (!allowed.includes(origin)) return reply(403, { error: 'origin' });

  let p;
  try {
    p = await request.json();
  } catch {
    return reply(400, { error: 'json' });
  }
  // ボット避けの見えない欄が埋まっていたら、成功したふりをして捨てる
  if (p.website) return reply(200, { ok: true });
  const entry = toEntry(p, Date.now());
  if (!entry) return reply(400, { error: 'invalid' });

  // 先に入れてから数える（同時にたくさん来ても上限を超えないように）。超えた分は取り消す
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const { meta } = await env.DB.prepare('INSERT INTO feedback (created_at, ip, kind, message, version, env) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(entry.created_at, ip, entry.kind, entry.message, entry.version, JSON.stringify(entry.env))
    .run();
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM feedback WHERE ip = ? AND created_at > ? AND id <= ?')
    .bind(ip, entry.created_at - RATE_WINDOW_MS, meta.last_row_id)
    .first();
  if (n > RATE_LIMIT) {
    await env.DB.prepare('DELETE FROM feedback WHERE id = ?').bind(meta.last_row_id).run();
    return reply(429, { error: 'rate' });
  }
  return reply(200, { ok: true });
}

/** 届いた JSON を、保存する形に整える。おかしければ null */
export function toEntry(p, now) {
  if (!p || !Object.hasOwn(KINDS, p.kind)) return null;
  const message = String(p.message ?? '').trim();
  if (message.length < 3 || message.length > MESSAGE_MAX) return null;
  const env = { 画面: p.screen, ブラウザ: p.userAgent };
  if (p.context && typeof p.context === 'object') for (const [k, v] of Object.entries(p.context).slice(0, 20)) env[k] = v;
  for (const k of Object.keys(env)) env[k] = String(env[k] ?? '').slice(0, 300);
  return { created_at: now, kind: p.kind, message, version: String(p.version ?? '').slice(0, 40), env };
}

// ---------- まとめ ----------

/** 日本時間の日付 "YYYY-MM-DD" と、その日の始まり（UTC ミリ秒） */
export function jstDay(ms) {
  const start = Math.floor((ms + JST_MS) / DAY_MS) * DAY_MS - JST_MS;
  return { day: new Date(start + JST_MS).toISOString().slice(0, 10), start };
}

/** 比べるための形（空白・句読点・大小文字の違いを無視） */
/**
 * 投稿の並びを、種類ごとに 1 件ずつ届いた順に並べる（同じ文面でも束ねない）。
 * 各投稿に時刻・版・環境を付ける。count/first/last は前の形式との互換のため残す（count は常に 1）。
 */
export function summarize(rows) {
  const counts = Object.fromEntries(Object.keys(KINDS).map((k) => [k, 0]));
  const lists = Object.fromEntries(Object.keys(KINDS).map((k) => [k, []]));
  const versions = {};
  for (const r of rows) {
    if (!Object.hasOwn(KINDS, r.kind)) continue;
    counts[r.kind]++;
    versions[r.version || '?'] = (versions[r.version || '?'] ?? 0) + 1;
    lists[r.kind].push({ message: r.message, count: 1, first: r.created_at, last: r.created_at, version: r.version, env: r.env });
  }
  const items = {};
  let truncated = 0;
  for (const k of Object.keys(KINDS)) {
    const list = lists[k].sort((a, b) => a.first - b.first);
    truncated += Math.max(0, list.length - DIGEST_PER_KIND);
    items[k] = list.slice(0, DIGEST_PER_KIND);
  }
  return { total: rows.length, counts, versions, items, truncated };
}

/** その日の投稿をまとめて保存する（同じ日をもう一度まとめると上書き） */
export async function digestDay(env, day, start) {
  const { results } = await env.DB.prepare('SELECT created_at, kind, message, version, env FROM feedback WHERE created_at >= ? AND created_at < ? ORDER BY id')
    .bind(start, start + DAY_MS)
    .all();
  const rows = results.map((r) => ({ ...r, env: JSON.parse(r.env || '{}') }));
  const s = summarize(rows);
  await env.DB.prepare('INSERT OR REPLACE INTO digests (day, total, counts, data) VALUES (?, ?, ?, ?)')
    .bind(day, s.total, JSON.stringify(s.counts), JSON.stringify(s))
    .run();
  return s;
}

/** 毎日の処理：前の日をまとめ、古い元の投稿を消す */
export async function runDaily(env, now) {
  const today = jstDay(now);
  const yesterday = jstDay(today.start - 1);
  const s = await digestDay(env, yesterday.day, yesterday.start);
  await env.DB.prepare('DELETE FROM feedback WHERE created_at < ?').bind(today.start - KEEP_RAW_DAYS * DAY_MS).run();
  return { day: yesterday.day, total: s.total };
}

// ---------- 管理用 API（合言葉が要る） ----------

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/** 長さに関わらず同じ手間で比べる */
export function sameKey(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

async function api(request, env, url) {
  const auth = request.headers.get('Authorization') ?? '';
  if (!sameKey(auth.replace(/^Bearer\s+/i, ''), env.ADMIN_KEY)) return json(401, { error: 'key' });

  // まとめの一覧（新しい順）
  if (url.pathname === '/api/digests') {
    const limit = Math.min(Number(url.searchParams.get('limit')) || 60, 365);
    const { results } = await env.DB.prepare('SELECT day, total, counts FROM digests ORDER BY day DESC LIMIT ?').bind(limit).all();
    return json(200, results.map((r) => ({ day: r.day, total: r.total, counts: JSON.parse(r.counts) })));
  }
  // ある日のまとめ
  const m = url.pathname.match(/^\/api\/digests\/(\d{4}-\d{2}-\d{2})$/);
  if (m) {
    const r = await env.DB.prepare('SELECT data FROM digests WHERE day = ?').bind(m[1]).first();
    return r ? json(200, { day: m[1], ...JSON.parse(r.data) }) : json(404, { error: 'none' });
  }
  // 今日（まだまとめていない分）をその場でまとめる
  if (url.pathname === '/api/today') {
    const t = jstDay(Date.now());
    const { results } = await env.DB.prepare('SELECT created_at, kind, message, version, env FROM feedback WHERE created_at >= ? ORDER BY id').bind(t.start).all();
    return json(200, { day: t.day, live: true, ...summarize(results.map((r) => ({ ...r, env: JSON.parse(r.env || '{}') }))) });
  }
  // 手動でまとめ直す（POST /api/digest?day=YYYY-MM-DD）
  if (url.pathname === '/api/digest' && request.method === 'POST') {
    const day = url.searchParams.get('day');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) return json(400, { error: 'day' });
    const start = Date.parse(`${day}T00:00:00+09:00`);
    const s = await digestDay(env, day, start);
    return json(200, { day, total: s.total });
  }
  if (url.pathname === '/api/backlog' || url.pathname.startsWith('/api/backlog/')) return backlogApi(request, env, url);
  return json(404, { error: 'path' });
}

// ---------- 改善リスト ----------

export const STATUSES = { open: '未対応', doing: '対応中', done: '済', wontfix: '見送り' };
const SAMPLES_MAX = 5;

/** 改善リストの項目に、新しい件数・日付・例・状態などを足す（DB に依らない部分） */
export function mergeBacklog(item, patch, now) {
  const next = { ...item, samples: [...(item.samples ?? [])] };
  if (patch.title != null) next.title = String(patch.title).slice(0, 200);
  if (patch.kind != null && Object.hasOwn(KINDS, patch.kind)) next.kind = patch.kind;
  if (patch.status != null) {
    if (!Object.hasOwn(STATUSES, patch.status)) throw new Error('status');
    next.status = patch.status;
  }
  const add = Math.max(0, Math.floor(Number(patch.add_count) || 0));
  if (add) {
    next.count += add;
    // 済・見送りのものに同じ話がまた来たら、未対応に戻して気づけるようにする
    if (patch.status == null && (next.status === 'done' || next.status === 'wontfix') && patch.day && patch.day > item.last_day) next.status = 'open';
  }
  if (patch.day) {
    if (!next.first_day || patch.day < next.first_day) next.first_day = patch.day;
    if (!next.last_day || patch.day > next.last_day) next.last_day = patch.day;
  }
  for (const s of patch.samples ?? []) {
    const t = String(s).slice(0, 300);
    if (t && !next.samples.includes(t)) next.samples.push(t);
  }
  next.samples = next.samples.slice(-SAMPLES_MAX);
  if (patch.note != null) next.note = String(patch.note).slice(0, 2000);
  if (patch.pr != null) next.pr = String(patch.pr).slice(0, 300);
  next.updated_at = now;
  return next;
}

const rowToItem = (r) => ({ ...r, samples: JSON.parse(r.samples || '[]') });

async function backlogApi(request, env, url) {
  const id = Number(url.pathname.split('/')[3]);
  // 一覧（状態で絞れる。件数の多い順）
  if (request.method === 'GET' && !id) {
    const status = url.searchParams.get('status');
    const q = status
      ? env.DB.prepare('SELECT * FROM backlog WHERE status = ? ORDER BY count DESC, last_day DESC').bind(status)
      : env.DB.prepare("SELECT * FROM backlog ORDER BY CASE status WHEN 'doing' THEN 0 WHEN 'open' THEN 1 ELSE 2 END, count DESC, last_day DESC");
    const { results } = await q.all();
    return json(200, results.map(rowToItem));
  }
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'json' });
  }
  const now = Date.now();
  // 新しい項目
  if (request.method === 'POST' && !id) {
    if (!body.title || !Object.hasOwn(KINDS, body.kind) || !/^\d{4}-\d{2}-\d{2}$/.test(body.day ?? '')) return json(400, { error: 'fields' });
    let item;
    try {
      item = mergeBacklog({ title: '', kind: body.kind, status: 'open', count: 0, first_day: body.day, last_day: body.day, samples: [], note: '', pr: '' }, { ...body, add_count: body.count ?? 1 }, now);
    } catch {
      return json(400, { error: 'status' });
    }
    const { meta } = await env.DB.prepare('INSERT INTO backlog (title, kind, status, count, first_day, last_day, samples, note, pr, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(item.title, item.kind, item.status, item.count, item.first_day, item.last_day, JSON.stringify(item.samples), item.note, item.pr, now)
      .run();
    return json(200, { id: meta.last_row_id, ...item });
  }
  // 既にある項目に足す・状態を変える
  if ((request.method === 'PATCH' || request.method === 'POST') && id) {
    const row = await env.DB.prepare('SELECT * FROM backlog WHERE id = ?').bind(id).first();
    if (!row) return json(404, { error: 'none' });
    let item;
    try {
      item = mergeBacklog(rowToItem(row), body, now);
    } catch {
      return json(400, { error: 'status' });
    }
    await env.DB.prepare('UPDATE backlog SET title = ?, kind = ?, status = ?, count = ?, first_day = ?, last_day = ?, samples = ?, note = ?, pr = ?, updated_at = ? WHERE id = ?')
      .bind(item.title, item.kind, item.status, item.count, item.first_day, item.last_day, JSON.stringify(item.samples), item.note, item.pr, now, id)
      .run();
    return json(200, item);
  }
  return json(405, { error: 'method' });
}
