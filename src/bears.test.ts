import { describe, expect, it } from 'vitest';
import { Heightmap } from './heightmap';
import { PathGrid } from './paths';
import { BEAR, Bears, type Walkers } from './bears';
import { ATTACK, computeAppeal } from './ecology';

function setup() {
  const map = new Heightmap(32);
  map.heights.fill(2);
  const paths = new PathGrid(map);
  let s = 11;
  const bears = new Bears(map, 0.5, () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff));
  return { map, paths, bears };
}

/** 決まった位置に立っている来園者 */
function fixedWalkers(list: { x: number; z: number }[]): Walkers {
  return {
    positions: () => list,
    removeNear(x, z, r) {
      const i = list.findIndex((w) => (w.x - x) ** 2 + (w.z - z) ** 2 < r * r);
      if (i < 0) return false;
      list.splice(i, 1);
      return true;
    },
  };
}

describe('クマ', () => {
  it('地図の端から現れ、来園者へ向かって襲う', () => {
    const { paths, bears } = setup();
    const bear = bears.spawn();
    expect(Math.max(Math.abs(bear.x), Math.abs(bear.z))).toBeGreaterThan(13);
    const walkers = fixedWalkers([{ x: 0, z: 0 }]);
    let attacked = 0;
    for (let i = 0; i < 400 && attacked === 0; i++) attacked += bears.update(0.1, paths, walkers).attacked;
    expect(attacked).toBe(1);
    expect(walkers.positions()).toHaveLength(0);
  });

  it('通り道の遊歩道を壊す', () => {
    const { paths, bears } = setup();
    const before = paths.count;
    const bear = bears.spawn();
    // 出入口の道の上に立たせる
    const c = paths.center(paths.entrance[0][0], paths.entrance[0][1] - 2);
    bear.x = c.x;
    bear.z = c.z;
    const ev = bears.update(0.1, paths, fixedWalkers([]));
    expect(ev.smashed).toBeGreaterThan(0);
    expect(paths.count).toBeLessThan(before);
  });

  it('罠にかかると居なくなり、罠も使い切る', () => {
    const { paths, bears } = setup();
    const bear = bears.spawn();
    expect(bears.placeTrap(bear.x * 0.9, bear.z * 0.9)).toBe(true);
    bear.x *= 0.9;
    bear.z *= 0.9;
    const ev = bears.update(0.1, paths, fixedWalkers([]));
    expect(ev.trapped).toBe(1);
    expect(bears.bears).toHaveLength(0);
    expect(bears.traps).toHaveLength(0);
  });

  it('銃は 2 発で仕留める。離れた所を撃つと外れる', () => {
    const { bears } = setup();
    const bear = bears.spawn();
    expect(bears.shoot(bear.x + 10, bear.z)).toBe('miss');
    expect(bears.shoot(bear.x, bear.z)).toBe('hit');
    expect(bears.shoot(bear.x, bear.z)).toBe('killed');
    expect(bears.bears).toHaveLength(0);
  });

  it('クマに襲われるとキツネのときより魅力が大きく下がる', () => {
    const habitat = { waterCells: 400, deepCells: 100, trees: 100, treesNearWater: 30 };
    const wild = { fruitOnTrees: 0, rabbit: 0, duck: 0, fish: 0 };
    const fox = computeAppeal(habitat, wild, 0, 1);
    const bear = computeAppeal(habitat, wild, 0, ATTACK.bearSeverity);
    expect(bear.appeal).toBeLessThan(fox.appeal);
    expect(bear.incidentPenalty).toBeLessThanOrEqual(ATTACK.maxPenalty);
  });

  it('森が育つほど出やすい', () => {
    expect(BEAR.chance(300)).toBeGreaterThan(BEAR.chance(50));
  });
});
