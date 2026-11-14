import { describe, expect, it } from 'vitest';
import { Yearbook, commentOf, incomeOf } from './yearbook';

/** 1年ぶんを決まった数字で埋める */
function playYear(y: Yearbook, visitorsPerDay: number, ticketsPerDay: number): void {
  for (let d = 0; d < 20; d++) {
    y.addDay(visitorsPerDay);
    y.earn('tickets', ticketsPerDay);
  }
}

describe('1年のまとめ', () => {
  it('来園者・収入・できごとを 1年ぶん数える', () => {
    const y = new Yearbook();
    y.begin(1, 1);
    playYear(y, 100, 1200);
    y.addDay(0); // 数え方の確認用（来園者 0 の日）
    y.earn('shop', 300);
    y.earn('sales', 450);
    y.earn('rewards', 500);
    y.earn('sales', -10); // 負の値は足さない
    y.note('found', 2);
    y.note('requests');
    y.note('incidents', 3);
    y.note('bears');
    const s = y.closeYear(2);
    expect(s).toMatchObject({
      year: 1,
      days: 21,
      visitors: 2000,
      bestDay: 100,
      tickets: 24000,
      shop: 300,
      sales: 450,
      rewards: 500,
      income: 25250,
      found: 2,
      requests: 1,
      incidents: 3,
      bears: 1,
      rankStart: 1,
      rankEnd: 2,
    });
    expect(incomeOf(s)).toBe(s.income);
  });

  it('はじめての年は記録更新にしない。次の年に上回ると記録更新になる', () => {
    const y = new Yearbook();
    y.begin(1, 1);
    playYear(y, 100, 1000);
    const first = y.closeYear(1);
    expect(first.records).toEqual({ visitors: false, income: false, bestDay: false });

    playYear(y, 150, 900);
    const second = y.closeYear(1);
    expect(second.year).toBe(2);
    expect(second.records).toEqual({ visitors: true, income: false, bestDay: true });

    // 最高は下がらない：3年目が 2年目より少なければ記録更新ではない
    playYear(y, 120, 950);
    const third = y.closeYear(1);
    expect(third.records).toEqual({ visitors: false, income: false, bestDay: false });
    expect(y.state.best).toEqual({ visitors: 3000, income: 20000, bestDay: 150 });
  });

  it('年を締めると次の年を数え始め、直前のまとめを見返せる', () => {
    const y = new Yearbook();
    y.begin(3, 2);
    y.addDay(50);
    const s = y.closeYear(4);
    expect(y.state.last).toEqual(s);
    expect(y.state.current).toMatchObject({ year: 4, days: 0, visitors: 0, rankStart: 4 });
  });

  it('その年をひとことで言う', () => {
    const y = new Yearbook();
    y.begin(1, 1);
    y.addDay(100);
    expect(commentOf(y.state.current, 3)).toMatch(/★1から★3/);
    expect(commentOf(y.state.current, 1)).toMatch(/事件が 1件も無い/);
    y.note('found', 3);
    expect(commentOf(y.state.current, 1)).toMatch(/3種/);
    const rough = new Yearbook();
    rough.begin(1, 1);
    rough.addDay(100);
    rough.note('incidents', 6);
    expect(commentOf(rough.state.current, 1)).toMatch(/事件の多い/);
  });

  it('保存して読み直せる。記録の無いセーブは、いまの年の途中から数え始める', () => {
    const y = new Yearbook();
    y.begin(1, 1);
    playYear(y, 80, 700);
    y.closeYear(2);
    y.addDay(90);
    const again = new Yearbook();
    again.restore(JSON.parse(JSON.stringify(y.snapshot())), 2, 2);
    expect(again.state).toEqual(y.state);

    const old = new Yearbook();
    old.restore(undefined, 3, 4);
    expect(old.state.current).toMatchObject({ year: 3, days: 0, rankStart: 4 });
    expect(old.state.last).toBeNull();
    expect(old.state.best).toBeNull();
  });
});
