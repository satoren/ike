import { describe, expect, it } from 'vitest';
import { Heightmap } from './heightmap';
import { PathGrid } from './paths';
import { BEAR, BEAR_ROUTE, Bears, type Walkers } from './bears';
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
    // 罠はクマが来る前に仕掛けておく
    const sign = bears.scout();
    expect(bears.placeTrap(sign.x * 0.9, sign.z * 0.9)).toBe('ok');
    const bear = bears.spawn();
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

  it('足跡の場所からクマが現れ、足跡は消える', () => {
    const { bears } = setup();
    const sign = bears.scout();
    expect(bears.sign).toEqual(sign);
    const bear = bears.spawn();
    expect([bear.x, bear.z]).toEqual([sign.x, sign.z]);
    expect(bears.sign).toBeNull();
  });

  it('開けた草地を避け、遠回りでも林の中を通る', () => {
    const { paths, bears } = setup();
    // z = 4 の列に東西へ伸びる林の帯。出発点と目的地は z = 0 の草地の両端
    const trees: { x: number; z: number }[] = [];
    for (let x = -12; x <= 12; x += 0.5) for (let z = 3; z <= 5; z += 0.5) trees.push({ x, z });
    const straight = bears.route(-12, 0, 12, 0, paths);
    expect(Math.max(...straight.map((p) => Math.abs(p.z)))).toBeLessThan(1);
    bears.updateCover(trees);
    const viaWoods = bears.route(-12, 0, 12, 0, paths);
    const inWoods = viaWoods.filter((p) => p.z > 1 && p.z < 7).length;
    expect(inWoods).toBeGreaterThan(viaWoods.length / 2);
    expect(viaWoods.at(-1)).toEqual({ x: 12, z: 0 });
  });

  it('林がなければまっすぐ来る（重みは草地どうしで同じ）', () => {
    const { paths, bears } = setup();
    const r = bears.route(-10, -10, 10, -10, paths);
    expect(r.length).toBeLessThanOrEqual(21);
    expect(BEAR_ROUTE.open).toBeGreaterThan(BEAR_ROUTE.water);
  });

  it('足跡から出入口とつながった遊歩道までの獣道を予想できる', () => {
    const { paths, bears } = setup();
    expect(bears.predictTrail(paths)).toEqual([]);
    const sign = bears.scout();
    const trail = bears.predictTrail(paths);
    expect(trail[0]).toEqual(sign);
    const end = trail.at(-1)!;
    expect(paths.isPathAt(end.x, end.z)).toBe(true);
  });

  it('クマの近く・遊歩道の上・水の中・罠のすぐ隣には罠を置けない', () => {
    const { map, paths, bears } = setup();
    const bear = bears.spawn();
    expect(bears.placeTrap(bear.x * 0.9, bear.z * 0.9, paths)).toBe('bear-near');
    const far = { x: -bear.x * 0.5, z: -bear.z * 0.5 - 3 };
    expect(Math.hypot(far.x - bear.x, far.z - bear.z)).toBeGreaterThan(BEAR.wary);
    expect(bears.placeTrap(far.x, far.z, paths)).toBe('ok');
    expect(bears.placeTrap(far.x + 0.5, far.z, paths)).toBe('near-trap');
    const c = paths.center(paths.entrance[0][0], paths.entrance[0][1]);
    expect(bears.placeTrap(c.x, c.z, paths)).toBe('path');
    map.heights.fill(0);
    expect(bears.placeTrap(far.x + 5, far.z, paths)).toBe('water');
  });

  it('遊歩道のすぐ脇の罠には来園者がかかる', () => {
    const { paths, bears } = setup();
    expect(bears.placeTrap(5, 5)).toBe('ok');
    expect(bears.placeTrap(-5, 5)).toBe('ok');
    const walkers = fixedWalkers([{ x: 5.5, z: 5 }]);
    const ev = bears.update(0.1, paths, walkers);
    expect(ev.guestsTrapped).toBe(1);
    expect(walkers.positions()).toHaveLength(0);
    expect(bears.traps).toEqual([{ x: -5, z: 5 }]);
  });

  it('森が育つほど出やすい', () => {
    expect(BEAR.chance(300)).toBeGreaterThan(BEAR.chance(50));
  });
});
