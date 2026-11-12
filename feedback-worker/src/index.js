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
/** 1 日のまとめに入れる、種類ごとの最大件数（同じ内容はまとめて 1 件と数える） */
const DIGEST_PER_KIND = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
/** 日付の区切りは日本時間 */
const JST_MS = 9 * 60 * 60 * 1000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/admin') return new Response(ADMIN_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    if (url.pathname.startsWith('/api/')) return api(request, env, url);
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
export function normalize(text) {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

/**
 * 投稿の並びを、種類ごと・同じ内容ごとにまとめる。
 * 同じ内容が多いものから並べ、各まとまりに件数・最初と最後の時刻・代表の環境を付ける。
 */
export function summarize(rows) {
  const counts = Object.fromEntries(Object.keys(KINDS).map((k) => [k, 0]));
  const groups = Object.fromEntries(Object.keys(KINDS).map((k) => [k, new Map()]));
  const versions = {};
  for (const r of rows) {
    if (!Object.hasOwn(KINDS, r.kind)) continue;
    counts[r.kind]++;
    versions[r.version || '?'] = (versions[r.version || '?'] ?? 0) + 1;
    const key = normalize(r.message);
    const g = groups[r.kind].get(key);
    if (g) {
      g.count++;
      g.first = Math.min(g.first, r.created_at);
      g.last = Math.max(g.last, r.created_at);
    } else {
      groups[r.kind].set(key, { message: r.message, count: 1, first: r.created_at, last: r.created_at, version: r.version, env: r.env });
    }
  }
  const items = {};
  let truncated = 0;
  for (const k of Object.keys(KINDS)) {
    const list = [...groups[k].values()].sort((a, b) => b.count - a.count || a.first - b.first);
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
  return json(404, { error: 'path' });
}
