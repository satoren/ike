import { describe, expect, it } from 'vitest';
import { Heightmap } from './heightmap';
import { PathGrid } from './paths';
import { NIGHT, darkness, foxDangerFactor, isNight, lanternCells, lightingCost, nightFoxCount, nightVisitors } from './night';

describe('昼夜', () => {
  it('朝と昼は明るく、終わりごろが夜', () => {
    expect(darkness(0)).toBe(0);
    expect(darkness(0.4)).toBe(0);
    expect(darkness(0.8)).toBe(1);
    expect(isNight(0.3)).toBe(false);
    expect(isNight(0.8)).toBe(true);
  });

  it('夕暮れと明け方はなめらかに変わる', () => {
    const mid = darkness((NIGHT.duskStart + NIGHT.duskEnd) / 2);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    expect(darkness(0.999)).toBeLessThan(0.05);
  });
});

describe('夜間営業', () => {
  it('営業すると夜の部の客が来る。閉めていれば 0', () => {
    expect(nightVisitors(100, true)).toBe(60);
    expect(nightVisitors(100, false)).toBe(0);
  });

  it('客が多いほど夜行性のキツネが寄ってくる（上限あり）', () => {
    expect(nightFoxCount(0)).toBe(0);
    expect(nightFoxCount(10)).toBe(1);
    expect(nightFoxCount(90)).toBe(3);
    expect(nightFoxCount(10000)).toBe(NIGHT.maxNightFoxes);
  });

  it('夜はキツネが危険になる', () => {
    expect(foxDangerFactor(true)).toBeGreaterThan(foxDangerFactor(false));
  });

  it('電気代は灯りの数で増える', () => {
    expect(lightingCost(10)).toBeGreaterThan(lightingCost(0));
  });

  it('灯りは出入口とつながった道にだけ、間をあけて立つ', () => {
    const map = new Heightmap(32);
    map.heights.fill(2);
    const grid = new PathGrid(map);
    const before = lanternCells(grid).length;
    // 出入口から北へまっすぐ道を延ばす
    const gate = grid.center(grid.entrance[0][0], grid.entrance[0][1]);
    grid.paintSegment(gate.x, gate.z, gate.x, gate.z - 20, 0.6);
    const cells = lanternCells(grid);
    expect(cells.length).toBeGreaterThan(before);
    expect(cells.length).toBeLessThan(grid.connectedCount);
    for (const [cx, cz] of cells) expect(grid.isConnected(cx, cz)).toBe(true);
    // つながっていない道には立たない
    grid.paintSegment(-12, -12, -10, -12, 0.6);
    expect(lanternCells(grid).length).toBe(cells.length);
  });
});
