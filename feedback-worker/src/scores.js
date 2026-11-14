/**
 * 1年のランキング（ログイン不要）。
 * ゲームの「1年のまとめ」から成績が届く。プレイヤーはブラウザごとの見えない番号（player）と、好きなニックネームで載る。
 * ゲームはブラウザの中だけで動くので改ざんは防ぎきれない。そのため、
 *   ・ありえない数字（1日の来園者と入園料・売店の上限から計算）をはじく
 *   ・同じ IP から送れる回数を制限する
 *   ・名前は NG ワードではじき、管理ページから 1 件ずつ隠せる
 *   ・プレビュー版から届いた成績は本番のランキングに混ぜない（RANKING_ENV で分ける）
 */

/** 1年の日数（季節 5日 × 4）。途中から数えた年は載せない */
export const YEAR_DAYS = 20;
export const NAME_MAX = 12;
/** 上位何人まで見せるか */
export const TOP_N = 20;
/** 同じ IP から 10 分に送れる数 */
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;

/**
 * ありえない数字の線。ゲームの式から、どんなに上手くても超えない値を少し余裕を持って決める。
 * 入園料 = 来園者 × 12G × ランク倍率(最大2.2) × 客層の払い(最大1.5) ≒ 39.6G/人
 * 売店 = 来園者 × 2G まで
 */
export const LIMITS = {
  dayVisitors: 50_000,
  ticketPerVisitor: 40,
  shopPerVisitor: 2,
  sales: 2_000_000,
  rewards: 300_000,
  found: 15,
  requests: YEAR_DAYS,
  bears: 200,
  incidents: 10_000,
};

/** 部門。score は表の列、safe は「事件ゼロの年」だけを数える */
export const BOARDS = {
  visitors: { label: '来園者', column: 'visitors', where: '' },
  income: { label: '収入', column: 'income', where: '' },
  safe: { label: '安心な園', column: 'visitors', where: ' AND incidents = 0' },
};

/** 名前に使えない言葉（ひらがな・小文字にそろえてから探す） */
const NG_WORDS = [
  'しね', 'ころす', 'ころせ', 'ちんこ', 'ちんぽ', 'まんこ', 'せっくす', 'おっぱい', 'れいぷ', 'きちがい', 'がいじ',
  'fuck', 'shit', 'sex', 'porn', 'nigger', 'nigga', 'bitch', 'dick', 'pussy', 'http', 'www', '.com', '.jp', 'admin', '運営', '公式',
];

/** 比べるための形：全角半角・カタカナひらがな・大小文字をそろえ、空白と記号を消す */
function fold(s) {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s_\-・。、,!！?？~〜ー]/g, '');
}

/** ニックネームを整える。使えなければ null */
export function cleanName(raw) {
  // 制御文字・見えない文字を消し、空白をまとめる
  const name = String(raw ?? '')
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length < 1 || [...name].length > NAME_MAX) return null;
  if (/[<>]/.test(name)) return null;
  const f = fold(name);
  if (NG_WORDS.some((w) => f.includes(w))) return null;
  return name;
}

const int = (v) => (Number.isInteger(v) && v >= 0 ? v : null);

/**
 * 届いた成績を確かめて、保存する形にする。おかしければ { error } を返す。
 * 収入の合計はサーバーで足し直す（送られてきた合計は信じない）。
 */
export function toScore(p) {
  if (!p || typeof p !== 'object') return { error: 'invalid' };
  const player = String(p.player ?? '');
  const run = String(p.run ?? '');
  if (!/^[A-Za-z0-9-]{16,64}$/.test(player) || !/^[A-Za-z0-9-]{8,64}$/.test(run)) return { error: 'invalid' };
  const name = cleanName(p.name);
  if (!name) return { error: 'name' };

  const y = p.year && typeof p.year === 'object' ? p.year : {};
  const keys = ['year', 'days', 'visitors', 'bestDay', 'tickets', 'shop', 'sales', 'rewards', 'found', 'requests', 'incidents', 'bears', 'rankStart', 'rankEnd'];
  const v = {};
  for (const k of keys) {
    v[k] = int(y[k]);
    if (v[k] === null) return { error: 'invalid' };
  }
  if (v.days !== YEAR_DAYS) return { error: 'partial' };
  if (v.year < 1 || v.year > 9999) return { error: 'invalid' };
  if (v.rankStart < 1 || v.rankEnd > 5 || v.rankEnd < v.rankStart) return { error: 'invalid' };
  if (v.visitors < 1) return { error: 'empty' };

  // 来園者：いちばん多い日 ≤ 合計 ≤ いちばん多い日 × 日数
  const ok =
    v.bestDay <= LIMITS.dayVisitors &&
    v.bestDay <= v.visitors &&
    v.visitors <= v.bestDay * YEAR_DAYS &&
    v.tickets <= v.visitors * LIMITS.ticketPerVisitor &&
    v.shop <= v.visitors * LIMITS.shopPerVisitor &&
    v.sales <= LIMITS.sales &&
    v.rewards <= LIMITS.rewards &&
    v.found <= LIMITS.found &&
    v.requests <= LIMITS.requests &&
    v.bears <= LIMITS.bears &&
    v.incidents <= LIMITS.incidents;
  if (!ok) return { error: 'unlikely' };

  const income = v.tickets + v.shop + v.sales + v.rewards;
  return {
    player,
    run,
    name,
    year: v.year,
    visitors: v.visitors,
    income,
    best_day: v.bestDay,
    incidents: v.incidents,
    found: v.found,
    rank_end: v.rankEnd,
    data: JSON.stringify(v),
  };
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player TEXT NOT NULL,
    run TEXT NOT NULL,
    year INTEGER NOT NULL,
    name TEXT NOT NULL,
    visitors INTEGER NOT NULL,
    income INTEGER NOT NULL,
    best_day INTEGER NOT NULL,
    incidents INTEGER NOT NULL,
    found INTEGER NOT NULL,
    rank_end INTEGER NOT NULL,
    data TEXT NOT NULL,
    env TEXT NOT NULL,
    ip TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0,
    UNIQUE (player, run, year)
  )`,
  'CREATE INDEX IF NOT EXISTS scores_env ON scores (env, hidden, player)',
  'CREATE INDEX IF NOT EXISTS scores_ip_time ON scores (ip, created_at)',
];

const ready = new WeakSet();
/** 表が無ければ作る（D1 に手で schema を流さなくても動くように。1 つの Worker で 1 回だけ） */
export async function ensureScores(db) {
  if (ready.has(db)) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  ready.add(db);
}

const rankEnv = (env) => (env.RANKING_ENV === 'preview' ? 'preview' : 'production');

/** POST /scores：成績を載せる。同じ遊び・同じ年をもう一度送ると上書き */
export async function submitScore(p, env, ip, now) {
  const s = toScore(p);
  if (s.error) return { status: s.error === 'invalid' ? 400 : 422, body: { error: s.error } };
  await ensureScores(env.DB);
  const e = rankEnv(env);
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE ip = ? AND created_at > ?').bind(ip, now - RATE_WINDOW_MS).first();
  if (n >= RATE_LIMIT) return { status: 429, body: { error: 'rate' } };
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO scores (player, run, year, name, visitors, income, best_day, incidents, found, rank_end, data, env, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (player, run, year) DO UPDATE SET name = excluded.name, visitors = excluded.visitors, income = excluded.income,
         best_day = excluded.best_day, incidents = excluded.incidents, found = excluded.found, rank_end = excluded.rank_end,
         data = excluded.data, env = excluded.env, ip = excluded.ip, created_at = excluded.created_at`,
    ).bind(s.player, s.run, s.year, s.name, s.visitors, s.income, s.best_day, s.incidents, s.found, s.rank_end, s.data, e, ip, now),
    // 名前を変えたら、その人の前の成績も新しい名前で載せる
    env.DB.prepare('UPDATE scores SET name = ? WHERE player = ?').bind(s.name, s.player),
  ]);
  return { status: 200, body: { ok: true, ...(await boards(env, s.player)) } };
}

/** 3 つの部門の上位と、その人の順位 */
export async function boards(env, player) {
  await ensureScores(env.DB);
  const e = rankEnv(env);
  const db = env.DB;
  const ids = Object.keys(BOARDS);
  const stmts = [];
  for (const id of ids) {
    const { column, where } = BOARDS[id];
    const base = `FROM scores WHERE env = ? AND hidden = 0${where}`;
    // SQLite では MAX() と一緒に選んだ列は、その最大の行の値になる
    stmts.push(db.prepare(`SELECT player, name, year, MAX(${column}) AS score ${base} GROUP BY player ORDER BY score DESC, MIN(created_at) LIMIT ${TOP_N}`).bind(e));
    stmts.push(db.prepare(`SELECT MAX(${column}) AS score, year ${base} AND player = ?`).bind(e, player || ''));
    stmts.push(db.prepare(`SELECT COUNT(DISTINCT player) AS n ${base}`).bind(e));
  }
  const res = await db.batch(stmts);
  const mine = [];
  const out = {};
  ids.forEach((id, i) => {
    const top = res[i * 3].results.map((r) => ({ name: r.name, year: r.year, score: r.score, me: Boolean(player) && r.player === player }));
    const me = res[i * 3 + 1].results[0];
    out[id] = { label: BOARDS[id].label, top, players: res[i * 3 + 2].results[0]?.n ?? 0, me: me && me.score != null ? { score: me.score, year: me.year, rank: 0 } : null };
    if (out[id].me) mine.push(id);
  });
  // 自分の順位 = 自分より上の人数 + 1
  if (mine.length) {
    const rs = await db.batch(
      mine.map((id) => {
        const { column, where } = BOARDS[id];
        return db.prepare(`SELECT COUNT(*) AS n FROM (SELECT MAX(${column}) AS m FROM scores WHERE env = ? AND hidden = 0${where} GROUP BY player) WHERE m > ?`).bind(e, out[id].me.score);
      }),
    );
    mine.forEach((id, i) => (out[id].me.rank = (rs[i].results[0]?.n ?? 0) + 1));
  }
  return { boards: out };
}

// ---------- 管理用（合言葉が要る。index.js の api() から呼ぶ） ----------

export async function scoresAdminApi(request, env, url, json) {
  await ensureScores(env.DB);
  const id = Number(url.pathname.split('/')[3]);
  if (request.method === 'GET' && !id) {
    const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 1000);
    const { results } = await env.DB.prepare('SELECT id, name, year, visitors, income, incidents, found, rank_end, env, created_at, hidden, substr(player, 1, 8) AS player FROM scores ORDER BY created_at DESC LIMIT ?').bind(limit).all();
    return json(200, results);
  }
  if ((request.method === 'PATCH' || request.method === 'POST') && id) {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'json' });
    }
    await env.DB.prepare('UPDATE scores SET hidden = ? WHERE id = ?').bind(body.hidden ? 1 : 0, id).run();
    return json(200, { id, hidden: Boolean(body.hidden) });
  }
  return json(405, { error: 'method' });
}
