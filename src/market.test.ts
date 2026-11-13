import { describe, expect, it } from 'vitest';
import { ITEMS, ITEM_ORDER, emptyInventory } from './ecology';
import { MARKET, MARKET_ITEMS, Market } from './market';

/** 決まった順に値を返す乱数 */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('相場', () => {
  it('はじめの日は、もとの売値のまま売れる', () => {
    const m = new Market(seq(0));
    for (const k of ITEM_ORDER) expect(m.price(k)).toBe(ITEMS[k].price);
    expect(m.state.hot).toBeNull();
    expect(MARKET_ITEMS).toContain(m.state.nextHot);
  });

  it('朝になると、きのう予告した品が高値になる', () => {
    const m = new Market(seq(0.5));
    const forecast = m.state.nextHot;
    m.onNewDay(seq(0.5));
    expect(m.state.hot).toBe(forecast);
    expect(m.state.rate[forecast]).toBeGreaterThanOrEqual(MARKET.hotMin);
    expect(m.state.rate[forecast]).toBeLessThanOrEqual(MARKET.hotMax);
    expect(m.price(forecast)).toBeGreaterThanOrEqual(ITEMS[forecast].price * MARKET.hotMin);
    // あすの高値は、きょうの高値とは別の品
    expect(m.state.nextHot).not.toBe(forecast);
  });

  it('安値の品は高値の品と重ならず、ほかの品は少しだけ上下する', () => {
    for (let i = 0; i < 50; i++) {
      const m = new Market();
      m.onNewDay();
      const { hot, cheap, rate } = m.state;
      expect(cheap).not.toBe(hot);
      expect(rate[cheap!]).toBe(MARKET.cheap);
      for (const k of ITEM_ORDER) {
        if (k === hot || k === cheap) continue;
        expect(rate[k]).toBeGreaterThanOrEqual(1 - MARKET.wobble - 1e-9);
        expect(rate[k]).toBeLessThanOrEqual(1 + MARKET.wobble + 1e-9);
      }
      // クマは高値にも安値にもならない
      expect(hot).not.toBe('bear');
      expect(cheap).not.toBe('bear');
    }
  });

  it('たくさん売ると値下がりし、下限で止まる', () => {
    const m = new Market(seq(0));
    const first = m.price('rabbit');
    m.sell('rabbit', MARKET.depth.rabbit / 2);
    expect(m.price('rabbit')).toBeLessThan(first);
    expect(m.trend('rabbit')).toBe('glut');
    m.sell('rabbit', 1000);
    expect(m.price('rabbit')).toBe(Math.round(ITEMS.rabbit.price * MARKET.glutFloor));
    // ほかの品には響かない
    expect(m.price('duck')).toBe(ITEMS.duck.price);
  });

  it('まとめて売ると、1個ずつ売ったのと同じだけ値が下がっていく', () => {
    const a = new Market(seq(0));
    const b = new Market(seq(0));
    const all = a.sell('fish', 10);
    let oneByOne = 0;
    for (let i = 0; i < 10; i++) oneByOne += b.sell('fish', 1);
    expect(Math.abs(all - oneByOne)).toBeLessThanOrEqual(5);
    expect(all).toBeLessThan(ITEMS.fish.price * 10);
    expect(a.state.sold.fish).toBe(10);
  });

  it('見積もりと売り上げが一致する', () => {
    const m = new Market(seq(0.3));
    m.onNewDay(seq(0.3, 0.8, 0.1));
    const inv = { ...emptyInventory(), fruit: 30, duck: 4, fish: 9 };
    const quoted = m.valueOf(inv);
    const paid = ITEM_ORDER.reduce((sum, k) => sum + m.sell(k, inv[k]), 0);
    expect(paid).toBe(quoted);
  });

  it('売りすぎの影響は、朝ごとに半分ずつ戻る', () => {
    const m = new Market(seq(0));
    m.sell('fruit', 40);
    m.onNewDay(seq(0.5));
    expect(m.state.sold.fruit).toBe(20);
    m.onNewDay(seq(0.5));
    m.onNewDay(seq(0.5));
    m.onNewDay(seq(0.5));
    m.onNewDay(seq(0.5));
    m.onNewDay(seq(0.5));
    expect(m.state.sold.fruit).toBe(0);
  });

  it('保存して読み直せる。古いセーブ（相場なし）でも動く', () => {
    const m = new Market();
    m.onNewDay();
    m.sell('duck', 3);
    const again = new Market();
    again.restore(JSON.parse(JSON.stringify(m.snapshot())));
    expect(again.state).toEqual(m.state);
    for (const k of ITEM_ORDER) expect(again.price(k)).toBe(m.price(k));

    const old = new Market();
    old.restore(undefined);
    for (const k of ITEM_ORDER) expect(old.price(k)).toBe(ITEMS[k].price);
    expect(old.note()).toMatch(/あすは.+が高値/);
  });

  it('相場をひとことで言える', () => {
    const m = new Market(seq(0));
    m.onNewDay(seq(0.5));
    expect(m.note()).toMatch(/きょうは.+が高値 ×\d\.\d・あすは.+が高値/);
  });
});
