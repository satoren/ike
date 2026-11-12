import { describe, expect, it } from 'vitest';
import { Heightmap } from './heightmap';
import { PathGrid, safety } from './paths';
import { Ecosystem, attackChance, computeAppeal } from './ecology';

function flatMap(): Heightmap {
  const map = new Heightmap(32);
  map.heights.fill(2);
  return map;
}

describe('遊歩道', () => {
  it('敷くと数が増え、撤去すると減る', () => {
    const grid = new PathGrid(flatMap());
    const added = grid.paint(0, 0, 1);
    expect(added).toBeGreaterThan(0);
    expect(grid.count).toBe(added);
    expect(grid.isPathAt(0.1, 0.1)).toBe(true);
    grid.paint(0, 0, 1, true);
    expect(grid.count).toBe(0);
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
