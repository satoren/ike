import { describe, expect, it } from 'vitest';
import { Heightmap } from './heightmap';
import { BIRD_NEEDS, FoodWeb, WEED, birdCapacity, fishCapacity, type FishPond } from './foodweb';
import { capacity } from './ecology';

const WATER = 0.5;

function pondMap(): Heightmap {
  const map = new Heightmap(32);
  map.heights.fill(2);
  map.applyBrush(0, 0, 8, -3);
  return map;
}

function seq(seed = 1): () => number {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
}

/** 決まった数の魚がいる池 */
function fakePond(n: number): FishPond & { fishList: { x: number; z: number }[] } {
  const fishList = Array.from({ length: n }, (_, i) => ({ x: (i % 5) - 2, z: Math.floor(i / 5) - 2 }));
  return {
    fishList,
    fish: () => fishList,
    eat: (x, z) => {
      const i = fishList.findIndex((f) => (f.x - x) ** 2 + (f.z - z) ** 2 < 1.5);
      if (i < 0) return false;
      fishList.splice(i, 1);
      return true;
    },
  };
}

describe('水草と魚', () => {
  it('育った水草が多いほど魚が多く棲める（池の広さが上限）', () => {
    expect(fishCapacity(160, 0)).toBe(10);
    expect(fishCapacity(160, 10)).toBe(20);
    expect(fishCapacity(160, 1000)).toBe(Math.floor(160 / 6));
    const h = { waterCells: 200, deepCells: 160, trees: 0, treesNearWater: 0 };
    expect(capacity({ ...h, weeds: 10 }).fish).toBeGreaterThan(capacity(h).fish);
  });

  it('水草は水の中にだけ植えられ、育つと数に入る', () => {
    const web = new FoodWeb(pondMap(), WATER, seq());
    expect(web.plantWeed(14, 14)).toBe(false); // 陸
    expect(web.plantWeed(2, 0)).toBe(true);
    expect(web.plantWeed(2, 0)).toBe(false); // 近すぎる
    expect(web.matureWeeds).toBe(0);
    web.update(WEED.matureAge, fakePond(0), 0);
    expect(web.matureWeeds).toBe(1);
  });

  it('池を埋めると水草は枯れる', () => {
    const map = pondMap();
    const web = new FoodWeb(map, WATER, seq());
    expect(web.plantWeed(2, 0, true)).toBe(true);
    map.heights.fill(2);
    web.update(1.1, fakePond(0), 0);
    expect(web.weeds.length).toBe(0);
  });
});

describe('魚と鳥', () => {
  it('魚が増えると鳥が来る。カワセミには止まり木になる水辺の木が要る', () => {
    expect(birdCapacity(0, 10)).toEqual({ kingfisher: 0, heron: 0 });
    expect(birdCapacity(30, 0).kingfisher).toBe(0);
    expect(birdCapacity(30, 10).kingfisher).toBeGreaterThan(0);
    expect(birdCapacity(30, 0).heron).toBeGreaterThan(0);
  });

  it('魚がたくさんいれば鳥がやってきて、魅力が上がる', () => {
    const web = new FoodWeb(pondMap(), WATER, seq(3));
    const pond = fakePond(30);
    for (let i = 0; i < 60; i++) web.update(1, pond, 10);
    expect(web.count('kingfisher') + web.count('heron')).toBeGreaterThan(0);
    expect(web.appealBonus()).toBeGreaterThan(0);
  });

  it('魚を採りつくすと鳥は去っていく', () => {
    const web = new FoodWeb(pondMap(), WATER, seq(5));
    web.spawn('kingfisher');
    web.spawn('heron');
    const pond = fakePond(0);
    for (let i = 0; i < BIRD_NEEDS.leaveDelay * 2 + 2; i++) web.update(1, pond, 10);
    expect(web.birds.length).toBe(0);
  });

  it('鳥は魚を食べる', () => {
    const web = new FoodWeb(pondMap(), WATER, seq(7));
    const pond = fakePond(30);
    const b = web.spawn('kingfisher')!;
    b.hunger = 0;
    for (let i = 0; i < 100; i++) web.update(0.1, pond, 10);
    expect(pond.fishList.length).toBeLessThan(30);
  });
});
