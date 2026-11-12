import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, base64ToBytes, bytesToBase64, decodeFloats, encodeFloats, parseSave } from './save';
import { Heightmap, generateGentleTerrain } from './heightmap';
import { PathGrid } from './paths';

describe('保存データ', () => {
  it('地形の高さを base64 にして元に戻せる', () => {
    const map = new Heightmap(32);
    generateGentleTerrain(map, 3);
    const back = decodeFloats(encodeFloats(map.heights));
    expect(Array.from(back)).toEqual(Array.from(map.heights));
  });

  it('遊歩道を保存して戻すと、数とつながりも戻る', () => {
    const map = new Heightmap(32);
    map.heights.fill(2);
    const a = new PathGrid(map);
    const c = a.center(15, 24);
    a.paintSegment(c.x, c.z, c.x, c.z + 3, 0.6);
    const b = new PathGrid(map);
    b.load(base64ToBytes(bytesToBase64(a.cells)));
    expect(b.count).toBe(a.count);
    expect(b.connectedCount).toBe(a.connectedCount);
  });

  it('壊れたデータや古い形式は読まない', () => {
    expect(parseSave(null, 32)).toBeNull();
    expect(parseSave('{broken', 32)).toBeNull();
    expect(parseSave(JSON.stringify({ version: SAVE_VERSION + 1, mapSize: 32 }), 32)).toBeNull();
    expect(parseSave(JSON.stringify({ version: SAVE_VERSION, mapSize: 64, heights: '', trees: [], state: {} }), 32)).toBeNull();
  });
});
