import { describe, expect, it } from 'vitest';
import { DEBT, UPKEEP, dailyCosts, debtFactor, staffFor } from './upkeep';
import { TICKET_PRICE } from './ecology';

const none = { rest: 0, shop: 0, tower: 0, mill: 0, center: 0, bigtree: 0 };
const park = { visitors: 0, rankTicket: 1, waterCells: 0, pathCells: 0, trees: 0, decor: 0, facilities: none };

describe('毎日の出費', () => {
  it('来園者 40人ごとに案内係が 1人いる', () => {
    expect(staffFor(0)).toBe(0);
    expect(staffFor(1)).toBe(1);
    expect(staffFor(40)).toBe(1);
    expect(staffFor(41)).toBe(2);
  });

  it('人件費は来園者に比例し、★の倍率が掛かる', () => {
    expect(dailyCosts({ ...park, visitors: 200 }).wages).toBe(200 / 40 * UPKEEP.staffWage);
    expect(dailyCosts({ ...park, visitors: 200, rankTicket: 2 }).wages).toBe(200 / 40 * UPKEEP.staffWage * 2);
  });

  it('客がいくら少なくても、いちばん払いの安い客層でも、入園料が人件費を上回る', () => {
    for (const v of [1, 7, 39, 333]) {
      const ticket = v * TICKET_PRICE * 0.85;
      expect(dailyCosts({ ...park, visitors: v }).wages).toBeLessThan(ticket);
    }
  });

  it('池・道・木・飾り・施設を広げるほど維持費がかかる', () => {
    const small = dailyCosts({ ...park, waterCells: 600, pathCells: 40, trees: 40 }).upkeep;
    const big = dailyCosts({ ...park, waterCells: 2500, pathCells: 250, trees: 250, decor: 20, facilities: { ...none, tower: 2, bigtree: 1 } }).upkeep;
    expect(small).toBe(Math.round(600 * UPKEEP.water + 40 * UPKEEP.path + 40 * UPKEEP.tree));
    expect(big).toBeGreaterThan(small * 5);
  });

  it('赤字のあいだだけ客が少し減る', () => {
    expect(debtFactor(0)).toBe(1);
    expect(debtFactor(-1)).toBe(DEBT.visitorMul);
    expect(DEBT.floor).toBeLessThan(0);
  });
});
