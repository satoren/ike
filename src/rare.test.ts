import { describe, expect, it } from 'vitest';
import { Heightmap } from './heightmap';
import { computeAppeal } from './ecology';
import { RARE, RareLife, applyRareBoost, rareBoost, type RareEnv } from './rare';

const WATER = 0.5;

/** 真ん中に浅い池がある地図 */
function pondMap(): Heightmap {
  const map = new Heightmap(32);
  for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) {
    const d = Math.hypot(x - 16, z - 16);
    map.set(x, z, d < 8 ? WATER - 0.6 : 2);
  }
  return map;
}

const always = () => 0;
const never = () => 0.999;

function goodEnv(): RareEnv {
  return {
    habitat: { waterCells: 800, deepCells: 300, trees: 200, treesNearWater: 60 },
    fish: 12,
    pressure: 0,
  };
}

const trees = [
  { x: 8, z: 0 },
  { x: -8, z: 0 },
  { x: 0, z: 8 },
];

describe('珍しい生き物', () => {
  it('環境が良く荒らされていなければ現れる', () => {
    const rare = new RareLife(pondMap(), WATER, always);
    const events = rare.onNewDay(goodEnv(), trees);
    expect(events.map((e) => e.kind).sort()).toEqual(['firefly', 'salamander']);
    expect(rare.has('firefly')).toBe(true);
    expect(rare.has('salamander')).toBe(true);
  });

  it('環境が足りないか、採りすぎていると現れない', () => {
    const poor = goodEnv();
    poor.habitat.treesNearWater = 10;
    expect(new RareLife(pondMap(), WATER, always).onNewDay(poor, trees)).toEqual([]);
    const harvested = { ...goodEnv(), pressure: 30 };
    expect(new RareLife(pondMap(), WATER, always).onNewDay(harvested, trees)).toEqual([]);
  });

  it('まれにしか現れない', () => {
    expect(new RareLife(pondMap(), WATER, never).onNewDay(goodEnv(), trees)).toEqual([]);
  });

  it('話題になって魅力と来園者が増え、話題は時間で薄れる', () => {
    const rare = new RareLife(pondMap(), WATER, always);
    rare.appear('salamander', trees);
    const fresh = rareBoost(rare.state);
    expect(fresh).toBeCloseTo(1 + RARE.salamander.presence + RARE.salamander.buzz);
    rare.update(120, goodEnv());
    const later = rareBoost(rare.state);
    expect(later).toBeLessThan(fresh);
    expect(later).toBeGreaterThan(1 + RARE.salamander.presence - 1e-9);

    const base = computeAppeal(goodEnv().habitat, { fruitOnTrees: 0, rabbit: 0, duck: 0, fish: 0 }, 0);
    const boosted = applyRareBoost(base, fresh);
    expect(boosted.visitors).toBeGreaterThan(base.visitors);
  });

  it('決まった日数で去り、しばらくは現れない', () => {
    const rare = new RareLife(pondMap(), WATER, always);
    rare.appear('firefly', trees);
    for (let d = 0; d < RARE.firefly.stayDays - 1; d++) rare.onNewDay({ ...goodEnv(), pressure: 99 }, trees);
    expect(rare.has('firefly')).toBe(true);
    const events = rare.onNewDay({ ...goodEnv(), pressure: 99 }, trees);
    expect(events).toContainEqual({ kind: 'firefly', type: 'left' });
    expect(rare.onNewDay(goodEnv(), trees).some((e) => e.kind === 'firefly')).toBe(false);
  });

  it('荒らされると去ってしまう', () => {
    const rare = new RareLife(pondMap(), WATER, always);
    rare.appear('firefly', trees);
    const events = rare.update(0.1, { ...goodEnv(), pressure: 80 });
    expect(events).toEqual([{ kind: 'firefly', type: 'fled' }]);
    expect(rareBoost(rare.state)).toBe(1);
  });

  it('オオサンショウウオは浅瀬から出ない', () => {
    const rare = new RareLife(pondMap(), WATER, Math.random);
    const s = rare.appear('salamander', trees)!;
    for (let i = 0; i < 2000; i++) rare.update(0.05, goodEnv());
    expect(rare.has('salamander')).toBe(true);
    expect(rare.isShallows(s.x, s.z, true)).toBe(true);
  });

  it('保存データから戻せる', () => {
    const rare = new RareLife(pondMap(), WATER, always);
    rare.appear('firefly', trees);
    const copy = new RareLife(pondMap(), WATER, always);
    copy.restore(JSON.parse(JSON.stringify(rare.snapshot())));
    expect(copy.has('firefly')).toBe(true);
    copy.restore(undefined);
    expect(copy.state.sightings).toEqual([]);
  });
});
