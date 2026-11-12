import { describe, expect, it } from 'vitest';
import { Heightmap } from './heightmap';
import { computeHabitat } from './economy';
import {
  Ecosystem,
  FRUIT,
  addPressure,
  capacity,
  computeAppeal,
  decayPressure,
  emptyInventory,
  growTree,
  harvestFruit,
  inventoryValue,
  type FruitTree,
} from './ecology';

const WATER = 0.5;

function flatMap(): Heightmap {
  const map = new Heightmap(32);
  map.heights.fill(2);
  return map;
}

/** 決まった順に値を返す乱数 */
function seq(seed = 1): () => number {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
}

describe('木の実り', () => {
  it('育つまでは実らず、育つと一定間隔で最大数まで実る', () => {
    const t: FruitTree = { x: 0, z: 0, age: 0, fruit: 0, fruitTimer: 0 };
    growTree(t, FRUIT.matureAge - 1);
    expect(t.fruit).toBe(0);
    for (let i = 0; i < 100; i++) growTree(t, 1);
    expect(t.fruit).toBe(FRUIT.max);
  });

  it('範囲内の木からだけ収穫する', () => {
    const trees: FruitTree[] = [
      { x: 0, z: 0, age: 99, fruit: 2, fruitTimer: 0 },
      { x: 10, z: 0, age: 99, fruit: 3, fruitTimer: 0 },
    ];
    expect(harvestFruit(trees, 0, 0, 2)).toBe(2);
    expect(trees[0].fruit).toBe(0);
    expect(trees[1].fruit).toBe(3);
  });
});

describe('すみか', () => {
  it('池がなければ魚もカモも来ない。深い池を掘ると魚が来られる', () => {
    const map = flatMap();
    expect(capacity(computeHabitat(map, WATER, [])).fish).toBe(0);
    map.applyBrush(0, 0, 8, -3);
    const h = computeHabitat(map, WATER, []);
    expect(h.deepCells).toBeGreaterThan(0);
    expect(capacity(h).fish).toBeGreaterThan(0);
  });

  it('呼び寄せた生き物はすみかの中にいる', () => {
    const map = flatMap();
    map.applyBrush(0, 0, 8, -3);
    const eco = new Ecosystem(map, WATER, seq(3));
    const fish = eco.spawn('fish');
    expect(fish).not.toBeNull();
    expect(map.heightAt(fish!.x, fish!.z)).toBeLessThan(WATER - 0.45);
    // しばらく泳がせても池の外へは出ない
    const habitat = computeHabitat(map, WATER, []);
    for (let i = 0; i < 200; i++) eco.update(0.1, habitat, []);
    for (const c of eco.creatures.filter((c) => c.kind === 'fish')) {
      expect(map.heightAt(c.x, c.z)).toBeLessThan(WATER - 0.45);
    }
  });

  it('池を埋めると魚は去る', () => {
    const map = flatMap();
    map.applyBrush(0, 0, 8, -3);
    const eco = new Ecosystem(map, WATER, seq(5));
    eco.spawn('fish');
    map.heights.fill(2);
    eco.update(0.1, computeHabitat(map, WATER, []), []);
    expect(eco.count('fish')).toBe(0);
  });

  it('捕まえると数が減る', () => {
    const map = flatMap();
    const eco = new Ecosystem(map, WATER, seq(7));
    const r = eco.spawn('rabbit');
    expect(eco.catchWithin(r!.x, r!.z, 1)).toEqual({ rabbit: 1 });
    expect(eco.count('rabbit')).toBe(0);
  });
});

describe('魅力と採りすぎ', () => {
  const habitat = { waterCells: 400, deepCells: 100, trees: 100, treesNearWater: 30 };
  const wildlife = { fruitOnTrees: 50, rabbit: 5, duck: 2, fish: 10 };

  it('生き物や実を採ると、その分魅力が下がる', () => {
    const before = computeAppeal(habitat, wildlife, 0);
    const after = computeAppeal(habitat, { ...wildlife, fish: 0 }, 0);
    expect(after.appeal).toBeLessThan(before.appeal);
  });

  it('荒らされ度が高いほど魅力が下がり、時間で回復する', () => {
    let p = 0;
    p = addPressure(p, 'duck', 5);
    const stressed = computeAppeal(habitat, wildlife, p);
    expect(stressed.appeal).toBeLessThan(stressed.base);
    expect(stressed.penalty).toBeLessThan(0.7);
    p = decayPressure(p, 200);
    expect(computeAppeal(habitat, wildlife, p).appeal).toBeGreaterThan(stressed.appeal);
  });
});

describe('かご', () => {
  it('売値の合計を出す', () => {
    const inv = emptyInventory();
    inv.fruit = 10;
    inv.fish = 1;
    expect(inventoryValue(inv)).toBe(10 * 6 + 30);
  });
});
