import { describe, expect, it } from 'vitest';
import { Heightmap, generateGentleTerrain } from './heightmap';
import { computeStats } from './economy';

describe('Heightmap', () => {
  it('掘ると中心が一番深くなり、半径の外は変わらない', () => {
    const map = new Heightmap(16);
    map.heights.fill(2);
    const region = map.applyBrush(0, 0, 3, -1);
    expect(region).not.toBeNull();
    expect(map.get(8, 8)).toBeCloseTo(1);
    expect(map.get(9, 8)).toBeGreaterThan(map.get(8, 8));
    expect(map.get(12, 8)).toBe(2);
  });

  it('高さは下限と上限に収まる', () => {
    const map = new Heightmap(8, 1, -1, 3);
    map.applyBrush(0, 0, 2, -100);
    expect(map.get(4, 4)).toBe(-1);
    map.applyBrush(0, 0, 2, 100);
    expect(map.get(4, 4)).toBe(3);
  });

  it('heightAt は格子の間を補間する', () => {
    const map = new Heightmap(2);
    map.set(1, 1, 0);
    map.set(2, 1, 2);
    expect(map.heightAt(0.5, 0)).toBeCloseTo(1);
  });

  it('同じ seed なら同じ地形になる', () => {
    const a = new Heightmap(16);
    const b = new Heightmap(16);
    generateGentleTerrain(a, 42);
    generateGentleTerrain(b, 42);
    expect(Array.from(a.heights)).toEqual(Array.from(b.heights));
  });
});

describe('computeStats', () => {
  it('池を掘ると水面と魅力が増える', () => {
    const map = new Heightmap(32);
    map.heights.fill(2);
    const before = computeStats(map, 0.5, []);
    expect(before.waterCells).toBe(0);
    map.applyBrush(0, 0, 5, -3);
    const after = computeStats(map, 0.5, []);
    expect(after.waterCells).toBeGreaterThan(0);
    expect(after.appeal).toBeGreaterThan(before.appeal);
  });

  it('水辺の木を数える', () => {
    const map = new Heightmap(32);
    map.heights.fill(2);
    map.applyBrush(0, 0, 4, -3);
    const stats = computeStats(map, 0.5, [
      { x: 4, z: 0, scale: 1, rotation: 0 },
      { x: 14, z: 14, scale: 1, rotation: 0 },
    ]);
    expect(stats.treesNearWater).toBe(1);
  });
});
