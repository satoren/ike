import { describe, expect, it } from 'vitest';
import { Heightmap } from './heightmap';
import { DECOR_RULES, Decor } from './decor';

const WATER = 0.5;

function flatMap(): Heightmap {
  const map = new Heightmap(32);
  map.heights.fill(2);
  return map;
}

describe('花畑と岩', () => {
  it('陸に置けて、数えられる', () => {
    const decor = new Decor(flatMap(), WATER);
    expect(decor.whyNot('flower', 0, 0)).toBeNull();
    decor.place('flower', 0, 0);
    decor.place('rock', 3, 0);
    expect(decor.count('flower')).toBe(1);
    expect(decor.count('rock')).toBe(1);
    expect(decor.of('rock')[0].x).toBe(3);
  });

  it('近すぎる場所・遊歩道の上・地図の端には置けない', () => {
    const decor = new Decor(flatMap(), WATER);
    decor.place('flower', 0, 0);
    expect(decor.whyNot('rock', 0.3, 0.3)).toContain('近すぎ');
    expect(decor.whyNot('rock', DECOR_RULES.spacing + 0.1, 0)).toBeNull();
    expect(decor.whyNot('flower', 5, 5, () => true)).toContain('遊歩道');
    expect(decor.whyNot('flower', 15.8, 0)).toContain('端');
  });

  it('花畑は水の中に植えられないが、岩は浅いところなら置ける', () => {
    const map = flatMap();
    map.heights.fill(WATER - 0.2); // 浅い池
    const decor = new Decor(map, WATER);
    expect(decor.whyNot('flower', 0, 0)).toContain('水の中');
    expect(decor.whyNot('rock', 0, 0)).toBeNull();
    map.heights.fill(WATER - 1); // 深い池
    expect(decor.whyNot('rock', 0, 0)).toContain('浅い');
  });

  it('範囲を指定して取り除ける', () => {
    const decor = new Decor(flatMap(), WATER);
    decor.place('flower', 0, 0);
    decor.place('rock', 1, 0);
    decor.place('rock', 8, 8);
    const removed = decor.removeWithin(0, 0, 2);
    expect(removed.map((d) => d.kind).sort()).toEqual(['flower', 'rock']);
    expect(decor.items).toHaveLength(1);
  });

  it('水に沈んだものは取り除かれる', () => {
    const map = flatMap();
    const decor = new Decor(map, WATER);
    decor.place('flower', 0, 0);
    decor.place('rock', 4, 0);
    map.heights.fill(WATER - 0.2);
    expect(decor.removeDrowned()).toBe(1); // 花畑だけ沈む
    map.heights.fill(WATER - 1);
    expect(decor.removeDrowned()).toBe(1);
    expect(decor.items).toHaveLength(0);
  });

  it('保存して戻せる。壊れたデータは捨てる', () => {
    const decor = new Decor(flatMap(), WATER);
    decor.place('flower', 1, 2, () => 0.25);
    const saved = decor.snapshot();
    const other = new Decor(flatMap(), WATER);
    other.restore([...saved, { kind: 'tree' as never, x: 0, z: 0, seed: 0 }, { kind: 'rock', x: NaN, z: 0, seed: 0 }]);
    expect(other.items).toEqual([{ kind: 'flower', x: 1, z: 2, seed: 0.25 }]);
    other.restore(undefined);
    expect(other.items).toHaveLength(0);
  });
});
