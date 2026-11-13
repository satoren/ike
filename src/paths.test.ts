import { describe, expect, it } from 'vitest';
import { Heightmap } from './heightmap';
import { PathGrid, PathView, Strollers, safety } from './paths';
import { Ecosystem, attackChance, computeAppeal } from './ecology';

function flatMap(): Heightmap {
  const map = new Heightmap(32);
  map.heights.fill(2);
  return map;
}

describe('遊歩道', () => {
  it('敷くと数が増え、撤去すると減る', () => {
    const grid = new PathGrid(flatMap());
    const initial = grid.count;
    const added = grid.paint(0, 0, 1);
    expect(added).toBeGreaterThan(0);
    expect(grid.count).toBe(initial + added);
    expect(grid.isPathAt(0.1, 0.1)).toBe(true);
    grid.paint(0, 0, 1, true);
    expect(grid.count).toBe(initial);
  });

  it('最初から出入口と短い道があり、出入口は撤去できない', () => {
    const grid = new PathGrid(flatMap());
    expect(grid.count).toBeGreaterThan(0);
    expect(grid.connectedCount).toBe(grid.count);
    const [cx, cz] = grid.entrance[0];
    const { x, z } = grid.center(cx, cz);
    grid.paint(x, z, 0.4, true);
    expect(grid.has(cx, cz)).toBe(true);
  });

  it('出入口とつながった道だけが数えられ、歩数が求まる', () => {
    const map = flatMap(); // 32 マス。出入口は (15,31)(16,31) で、z=27 まで道がある
    const grid = new PathGrid(map);
    const base = grid.connectedCount;
    // 離れた場所の道はつながっていない
    const far = grid.center(3, 3);
    const n = grid.paint(far.x, far.z, 0.6);
    expect(grid.connectedCount).toBe(base);
    expect(grid.isConnected(3, 3)).toBe(false);
    // 出入口の道の先に 1 マス足すとつながる
    const next = grid.center(15, 26);
    grid.paint(next.x, next.z, 0.4);
    expect(grid.isConnected(15, 26)).toBe(true);
    expect(grid.distanceAt(15, 26)).toBe(5);
    expect(grid.count).toBe(base + n + 1);
  });

  it('来園者に対して道が足りているほど安全', () => {
    expect(safety(0, 100)).toBe(0);
    expect(safety(10, 100)).toBeCloseTo(0.3);
    expect(safety(100, 100)).toBe(1);
  });

  it('安全に回れている客は襲われない', () => {
    expect(attackChance(3, 200, 1, 0)).toBeGreaterThan(0);
    expect(attackChance(3, 200, 1, 1)).toBe(0);
  });

  it('安全度が低いと魅力が下がる', () => {
    const habitat = { waterCells: 400, deepCells: 100, trees: 100, treesNearWater: 30 };
    const wild = { fruitOnTrees: 0, rabbit: 0, duck: 0, fish: 0 };
    const unsafe = computeAppeal(habitat, wild, 0, 0, { scenic: 0, safetyFor: () => 0, unsafePenalty: 0.25 });
    const safe = computeAppeal(habitat, wild, 0, 0, { scenic: 0, safetyFor: () => 1, unsafePenalty: 0.25 });
    expect(safe.appeal).toBeGreaterThan(unsafe.appeal);
  });

  it('キツネは遊歩道に入れない', () => {
    const map = flatMap();
    const grid = new PathGrid(map);
    // 地図のほぼ全面を道にすると、キツネの居場所がなくなる
    grid.paint(0, 0, 40);
    const eco = new Ecosystem(map, 0.5, Math.random, (kind, x, z) => kind === 'fox' && grid.isPathAt(x, z));
    expect(eco.spawn('fox')).toBeNull();
    expect(eco.spawn('rabbit')).not.toBeNull();
  });
});

describe('キツネ', () => {
  it('ウサギが増えるとキツネも来るようになり、近くのウサギを食べる', () => {
    const map = flatMap();
    let s = 9;
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
    const eco = new Ecosystem(map, 0.5, rand);
    const fox = eco.spawn('fox')!;
    const rabbit = eco.spawn('rabbit')!;
    rabbit.x = fox.x + 0.1;
    rabbit.z = fox.z;
    rabbit.speed = 0;
    eco.update(0.01, { waterCells: 0, deepCells: 0, trees: 0, treesNearWater: 0 }, []);
    expect(eco.count('rabbit')).toBe(0);
  });
});

describe('来園者の散策', () => {
  it('長い遊歩道でも奥の突き当たりまで歩いていく', () => {
    const grid = new PathGrid(flatMap());
    // 出入口から先を、つづら折りの長い道（約 100 歩）にする
    const pts: [number, number][] = [[15, 26], [15, 23], [2, 23], [2, 17], [29, 17], [29, 11], [2, 11], [2, 5]];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = grid.center(...pts[i]);
      const b = grid.center(...pts[i + 1]);
      grid.paintSegment(a.x, a.z, b.x, b.z, 0.4);
    }
    expect(grid.isConnected(2, 5)).toBe(true);
    expect(grid.maxDistance).toBeGreaterThanOrEqual(90);
    const view = { floorY: () => 0 } as unknown as PathView;
    const strollers = new Strollers(grid, view);
    const end = grid.center(2, 5);
    let reached = 0;
    for (let i = 0; i < 3000; i++) {
      strollers.update(0.1, 60);
      reached = Math.max(reached, strollers.positions().filter((p) => Math.hypot(p.x - end.x, p.z - end.z) < 1.5).length);
    }
    expect(reached).toBeGreaterThan(0);
  });
});
