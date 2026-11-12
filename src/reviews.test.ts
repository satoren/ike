import { describe, expect, it } from 'vitest';
import { ReviewFeed, writeReview, type ReviewContext } from './reviews';

const calm: ReviewContext = {
  visitors: 30,
  penalty: 0,
  safety: 1,
  pathCells: 40,
  waterCells: 80,
  trees: 12,
  treesNearWater: 6,
  wild: { fruit: 20, rabbit: 3, duck: 4, fish: 10, fox: 0, bear: 0 },
  recent: new Set(),
};

function sample(c: ReviewContext, n = 200) {
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, () => writeReview(c, 1, rand)!);
}

describe('口コミ', () => {
  it('よく整った園ではほとんどがよい感想になる', () => {
    const rs = sample(calm);
    expect(rs.filter((r) => r.good).length / rs.length).toBeGreaterThan(0.9);
    expect(rs.every((r) => r.stars >= 1 && r.stars <= 5)).toBe(true);
  });

  it('クマの襲撃直後は事件の口コミが多くなり、評価が低い', () => {
    const rs = sample({ ...calm, recent: new Set(['bearAttack']) });
    const incidents = rs.filter((r) => r.factor === 'incident');
    expect(incidents.length / rs.length).toBeGreaterThan(0.25);
    expect(incidents.every((r) => r.stars === 1)).toBe(true);
  });

  it('採りすぎると採りすぎの口コミが出る', () => {
    const rs = sample({ ...calm, penalty: 0.4, wild: { ...calm.wild, fruit: 0, duck: 0, fish: 0, rabbit: 0 } });
    expect(rs.some((r) => r.factor === 'harvest')).toBe(true);
  });

  it('遊歩道がないと遊歩道への不満が出る', () => {
    const rs = sample({ ...calm, pathCells: 0, safety: 0 });
    expect(rs.some((r) => r.factor === 'safety' && !r.good)).toBe(true);
  });

  it('来園者がいなければ口コミは届かない', () => {
    const feed = new ReviewFeed(() => 0.5);
    const { recent: _, ...ctx } = calm;
    for (let i = 0; i < 100; i++) feed.update(0.5, { ...ctx, visitors: 0 }, 1);
    expect(feed.reviews.length).toBe(0);
  });

  it('事件があるとすぐ口コミが届き、件数は上限で止まる', () => {
    const feed = new ReviewFeed(() => 0.1);
    const { recent: _, ...ctx } = calm;
    feed.update(0.1, ctx, 1);
    feed.note('bearAttack');
    expect(feed.update(0.7, ctx, 1)?.factor).toBe('incident');
    for (let i = 0; i < 400; i++) feed.update(0.5, ctx, 1);
    expect(feed.reviews.length).toBe(12);
  });
});
