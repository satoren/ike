import { describe, expect, it } from 'vitest';
// @ts-expect-error 型定義（@types/node）は入れていない
import { createRequire } from 'node:module';
import { eligibility, errorText, parseMemo, rankText, sentKey, toPayload, validateName } from './ranking';
import type { YearSummary } from './yearbook';
import { Yearbook } from './yearbook';
// @ts-expect-error 中継は JS で書いてある
import { LIMITS, YEAR_DAYS, boards, cleanName, submitScore, toScore } from '../feedback-worker/src/scores.js';

const year = (over: Partial<YearSummary> = {}): YearSummary => ({
  year: 2,
  days: 20,
  visitors: 4000,
  bestDay: 260,
  tickets: 60000,
  shop: 3000,
  sales: 9000,
  rewards: 2000,
  found: 3,
  requests: 6,
  incidents: 1,
  bears: 1,
  rankStart: 2,
  rankEnd: 3,
  income: 74000,
  records: { visitors: false, income: false, bestDay: false },
  comment: '',
  ...over,
});

const PLAYER = 'p1234567-89ab-cdef-0123-456789abcdef';
const RUN = 'run-1234-5678';
const payload = (over: Partial<YearSummary> = {}, name = 'いけ太郎', player = PLAYER, run = RUN) =>
  toPayload({ player, name: '', sent: [] }, run, name, year(over));

describe('ランキング（ゲーム側）', () => {
  it('覚えた番号を読み、無ければ作る', () => {
    const fresh = parseMemo(null);
    expect(fresh.player).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    const back = parseMemo(JSON.stringify({ player: PLAYER, name: 'あ', sent: ['x:1', 3] }));
    expect(back).toEqual({ player: PLAYER, name: 'あ', sent: ['x:1'] });
    expect(parseMemo('{"player":"短い"}').player).not.toBe('短い');
  });

  it('名前を確かめる', () => {
    expect(validateName('  ')).toBeTruthy();
    expect(validateName('池の番人')).toBeNull();
    expect(validateName('あ'.repeat(13))).toBeTruthy();
    expect(validateName('<b>')).toBeTruthy();
  });

  it('途中から数えた年と、客のいない年は載せられない', () => {
    expect(eligibility(year())).toBeNull();
    expect(eligibility(year({ days: 12 }))).toMatch('途中');
    expect(eligibility(year({ visitors: 0, bestDay: 0 }))).toBeTruthy();
  });

  it('送る中身には合計を入れない（中継が足し直す）', () => {
    const p = payload();
    expect(p.year).not.toHaveProperty('income');
    expect(p.name).toBe('いけ太郎');
    expect(sentKey('r', 2)).toBe('r:2');
    expect(errorText('name', 422)).toMatch('名前');
    expect(errorText(undefined, 0)).toMatch('時間をおいて');
    expect(rankText({ label: '', top: [], players: 9, me: { rank: 2, score: 1, year: 1 } })).toBe('2位 / 9人');
  });

  it('新しく始めるたびに遊びの番号が変わり、セーブから戻せる', () => {
    const a = new Yearbook();
    a.begin(1, 1);
    const b = new Yearbook();
    b.begin(1, 1);
    expect(a.state.run).toBeTruthy();
    expect(a.state.run).not.toBe(b.state.run);
    const c = new Yearbook();
    c.restore(a.snapshot(), 1, 1);
    expect(c.state.run).toBe(a.state.run);
    // 番号の無い古いセーブにも付ける
    const d = new Yearbook();
    d.restore({ ...a.snapshot(), run: undefined }, 1, 1);
    expect(d.state.run).toBeTruthy();
  });

  it('1年の日数はゲームと中継で同じ', () => {
    expect(YEAR_DAYS).toBe(20);
  });
});

describe('ランキング（中継の確認）', () => {
  it('ふつうの成績は通り、収入は足し直す', () => {
    const s = toScore({ ...payload(), year: { ...payload().year } });
    expect(s.error).toBeUndefined();
    expect(s.income).toBe(60000 + 3000 + 9000 + 2000);
    expect(s.name).toBe('いけ太郎');
  });

  it('ありえない数字ははじく', () => {
    expect(toScore(payload({ days: 19 })).error).toBe('partial');
    expect(toScore(payload({ bestDay: 100, visitors: 4000 })).error).toBe('unlikely'); // 100人×20日 < 4000人
    expect(toScore(payload({ bestDay: 5000, visitors: 4000 })).error).toBe('unlikely');
    expect(toScore(payload({ tickets: 4000 * LIMITS.ticketPerVisitor + 1 })).error).toBe('unlikely');
    expect(toScore(payload({ shop: 4000 * 3 })).error).toBe('unlikely');
    expect(toScore(payload({ found: 99 })).error).toBe('unlikely');
    expect(toScore(payload({ bestDay: LIMITS.dayVisitors + 1, visitors: LIMITS.dayVisitors + 1 })).error).toBe('unlikely');
    expect(toScore(payload({ visitors: 1.5 })).error).toBe('invalid');
    expect(toScore(payload({ rankEnd: 6 })).error).toBe('invalid');
    expect(toScore({ ...payload(), player: 'x' }).error).toBe('invalid');
  });

  it('名前を整え、使えない名前ははじく', () => {
    expect(cleanName(' ＩＫＥ​  たろう ')).toBe('IKE たろう');
    expect(cleanName('シネ')).toBeNull();
    expect(cleanName('www.example')).toBeNull();
    expect(cleanName('F U C K')).toBeNull();
    expect(cleanName('')).toBeNull();
    expect(cleanName('あ'.repeat(13))).toBeNull();
    expect(cleanName('池の番人')).toBe('池の番人');
  });
});

/** node:sqlite で D1 のまねをする（prepare / bind / first / all / run / batch） */
function fakeD1() {
  const require = createRequire(import.meta.url);
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => {
      const r = db.prepare(sql).run(...args);
      return { meta: { last_row_id: Number(r.lastInsertRowid) } };
    },
    exec: () => (/^\s*select/i.test(sql) ? { results: db.prepare(sql).all(...args) } : (db.prepare(sql).run(...args), { results: [] })),
  });
  return {
    prepare: (sql: string) => stmt(sql),
    batch: async (list: ReturnType<typeof stmt>[]) => list.map((s) => s.exec()),
  };
}

describe('ランキング（中継と D1）', () => {
  it('部門ごとの上位と自分の順位を返し、プレビューの成績は混ぜない', async () => {
    const DB = fakeD1();
    const prod = { DB, RANKING_ENV: 'production' };
    const other = 'q1234567-89ab-cdef-0123-456789abcdef';
    let ip = 0;
    const send = async (env: object, p: object) => submitScore(p, env, `10.0.0.${ip++}`, 1000 + ip);

    expect((await send(prod, payload({ visitors: 4000, incidents: 1 }))).status).toBe(200);
    expect((await send(prod, payload({ year: 3, visitors: 3000, bestDay: 200, incidents: 0 }))).status).toBe(200);
    const r = await send(prod, payload({ visitors: 5000, bestDay: 300, incidents: 0 }, 'ほかの人', other, 'run-other-1'));
    expect(r.status).toBe(200);
    // プレビュー版からの成績
    await send({ DB, RANKING_ENV: 'preview' }, payload({ visitors: 9000, bestDay: 500 }, 'ためし', 'z1234567-89ab-cdef-0123-456789abcdef'));

    const b = (await boards(prod, PLAYER)).boards;
    expect(b.visitors.players).toBe(2);
    expect(b.visitors.top.map((e: { name: string }) => e.name)).toEqual(['ほかの人', 'いけ太郎']);
    expect(b.visitors.me).toEqual({ score: 4000, year: 2, rank: 2 });
    // 事件ゼロの年だけ：自分は 3年目の 3000人
    expect(b.safe.me).toEqual({ score: 3000, year: 3, rank: 2 });
    // 他人の番号は返さない
    expect(JSON.stringify(b)).not.toContain(other);

    // 同じ年を送り直すと上書きし、名前も変わる
    await send(prod, payload({ visitors: 6000, bestDay: 320 }, '新しい名前'));
    const b2 = (await boards(prod, PLAYER)).boards;
    expect(b2.visitors.top[0]).toMatchObject({ name: '新しい名前', score: 6000, me: true });
    expect(b2.safe.top.find((e: { me: boolean }) => e.me)?.name).toBe('新しい名前');
    expect(b2.visitors.players).toBe(2);
  });

  it('同じ IP からの送りすぎを断る', async () => {
    const env = { DB: fakeD1(), RANKING_ENV: 'production' };
    const codes = [];
    for (let i = 0; i < 12; i++) codes.push((await submitScore(payload({ year: i + 1 }), env, '1.1.1.1', 5000 + i)).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});
