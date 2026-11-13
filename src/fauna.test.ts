import { describe, expect, it } from 'vitest';
import { Heightmap } from './heightmap';
import { BIOTOPE, FAUNA, Fauna, emptyBiotope, faunaCapacity, surveyBiotope, type Biotope, type FaunaEnv } from './fauna';

const WATER = 0.5;

function flatMap(size = 48): Heightmap {
  const map = new Heightmap(size);
  map.heights.fill(2);
  return map;
}

function seq(seed = 1): () => number {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
}

/** (x, z) のまわりに木を n 本、寄せて植える */
function grove(x: number, z: number, n: number, age = 100): { x: number; z: number; age: number }[] {
  return Array.from({ length: n }, (_, i) => ({ x: x + (i % 4) * 0.8, z: z + Math.floor(i / 4) * 0.8, age }));
}

const env = (over: Partial<FaunaEnv> = {}): FaunaEnv => ({
  season: 'summer',
  weather: 'sunny',
  night: false,
  weeds: 0,
  deepCells: 0,
  fruit: 0,
  rabbits: 0,
  pressure: 0,
  ...over,
});

const spots = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i * 0.1, z: 0 }));

describe('surveyBiotope', () => {
  it('平らな陸地には浅瀬も小島も無い', () => {
    const b = surveyBiotope(flatMap(), WATER, []);
    expect(b.shallow).toHaveLength(0);
    expect(b.island).toHaveLength(0);
  });

  it('池の縁の浅いところが浅瀬になり、深いところは数えない', () => {
    const map = flatMap();
    map.applyBrush(0, 0, 10, -4);
    const b = surveyBiotope(map, WATER, []);
    expect(b.shallow.length).toBeGreaterThan(0);
    for (const s of b.shallow) {
      const d = WATER - map.heightAt(s.x, s.z);
      expect(d).toBeGreaterThanOrEqual(BIOTOPE.shallowMin - 1e-6);
      expect(d).toBeLessThanOrEqual(BIOTOPE.shallowMax + 1e-6);
    }
    // 真ん中は深いので浅瀬ではない
    expect(b.shallow.some((s) => Math.hypot(s.x, s.z) < 2)).toBe(false);
  });

  it('池に囲まれた陸地は小島になり、岸とつなぐと小島でなくなる', () => {
    const map = flatMap();
    map.applyBrush(0, 0, 12, -4);
    map.applyBrush(0, 0, 3, 6); // 真ん中に土を盛る
    const b = surveyBiotope(map, WATER, []);
    expect(b.island.length).toBeGreaterThan(0);
    for (const s of b.island) expect(Math.hypot(s.x, s.z)).toBeLessThan(5);

    for (let x = 0; x <= 14; x++) map.applyBrush(x, 0, 2.5, 6); // 岸まで陸の橋を架ける
    expect(surveyBiotope(map, WATER, []).island).toHaveLength(0);
  });

  it('寄せて植えた育った木だけが林になる', () => {
    const map = flatMap();
    const scattered = [
      { x: -20, z: -20, age: 100 },
      { x: 20, z: -20, age: 100 },
      { x: -20, z: 20, age: 100 },
    ];
    expect(surveyBiotope(map, WATER, scattered).grove).toHaveLength(0);
    expect(surveyBiotope(map, WATER, [...scattered, ...grove(5, 5, 8)]).grove).toHaveLength(8);
    // 植えたばかりの若木は林に数えない
    expect(surveyBiotope(map, WATER, grove(5, 5, 8, 0)).grove).toHaveLength(0);
  });

  it('遊歩道の近くの林は静かな林ではない', () => {
    const map = flatMap();
    const trees = [...grove(-15, -15, 8), ...grove(12, 12, 8)];
    // (12, 12) の林のすぐ横に道がある
    const path = (cx: number, cz: number) => cx === 38 && cz >= 30 && cz <= 40;
    const b = surveyBiotope(map, WATER, trees, path);
    expect(b.grove).toHaveLength(16);
    expect(b.quiet).toHaveLength(8);
    for (const s of b.quiet) expect(s.x).toBeLessThan(0);
    // 道が無ければ、どちらも静か
    expect(surveyBiotope(map, WATER, trees).quiet).toHaveLength(16);
  });
});

describe('faunaCapacity', () => {
  const b: Biotope = { shallow: spots(800), island: spots(30), grove: spots(60), quiet: spots(60) };
  const rich = env({ weeds: 100, deepCells: 200, fruit: 200, rabbits: 6, night: true });

  it('場所が無ければ何も来ない', () => {
    const cap = faunaCapacity(emptyBiotope(), rich);
    for (const n of Object.values(cap)) expect(n).toBe(0);
  });

  it('上限を超えては集まらない', () => {
    const cap = faunaCapacity(b, rich);
    for (const [kind, n] of Object.entries(cap)) expect(n).toBe(FAUNA[kind as keyof typeof FAUNA].max);
  });

  it('カエルは冬眠し、秋は減り、雨の日は増える', () => {
    const few: Biotope = { ...emptyBiotope(), shallow: spots(BIOTOPE.shallowPerFrog * 4) };
    expect(faunaCapacity(few, env({ season: 'spring' })).frog).toBe(4);
    expect(faunaCapacity(few, env({ season: 'autumn' })).frog).toBe(2);
    expect(faunaCapacity(few, env({ season: 'winter' })).frog).toBe(0);
    expect(faunaCapacity(few, env({ season: 'spring', weather: 'rain' })).frog).toBe(6);
  });

  it('トンボは夏と秋だけ、浅瀬と水草の両方が要る', () => {
    expect(faunaCapacity(b, env({ season: 'spring', weeds: 100 })).dragonfly).toBe(0);
    expect(faunaCapacity(b, env({ season: 'summer', weeds: 0 })).dragonfly).toBe(0);
    expect(faunaCapacity(b, env({ season: 'summer', weeds: BIOTOPE.weedsPerDragonfly * 3 })).dragonfly).toBe(3);
    expect(faunaCapacity({ ...b, shallow: [] }, env({ season: 'autumn', weeds: 100 })).dragonfly).toBe(0);
  });

  it('カメは小島と深い池が要り、冬は冬眠する', () => {
    expect(faunaCapacity(b, env({ deepCells: 0 })).turtle).toBe(0);
    expect(faunaCapacity(b, env({ deepCells: 200 })).turtle).toBe(FAUNA.turtle.max);
    expect(faunaCapacity(b, env({ deepCells: 200, season: 'winter' })).turtle).toBe(0);
  });

  it('リスは木の実を採りつくすと居なくなる', () => {
    expect(faunaCapacity(b, env({ fruit: 0 })).squirrel).toBe(0);
    expect(faunaCapacity(b, env({ fruit: BIOTOPE.fruitPerSquirrel * 2 })).squirrel).toBe(2);
  });

  it('シカは荒らされると寄りつかない', () => {
    expect(faunaCapacity(b, env()).deer).toBe(FAUNA.deer.max);
    expect(faunaCapacity(b, env({ pressure: BIOTOPE.deerFleePressure })).deer).toBe(0);
  });

  it('フクロウは夜だけ、ウサギがいるときに来る', () => {
    expect(faunaCapacity(b, env({ rabbits: 6, night: false })).owl).toBe(0);
    expect(faunaCapacity(b, env({ rabbits: 0, night: true })).owl).toBe(0);
    expect(faunaCapacity(b, env({ rabbits: 6, night: true })).owl).toBe(FAUNA.owl.max);
  });
});

describe('Fauna', () => {
  function world() {
    const map = flatMap();
    map.applyBrush(0, 0, 12, -4);
    map.applyBrush(0, 0, 3, 6);
    // 隅に広い浅瀬を作る
    for (let iz = 34; iz <= 46; iz++) for (let ix = 34; ix <= 46; ix++) map.set(ix, iz, WATER - 0.2);
    const trees = grove(-18, -18, 40);
    return { map, b: surveyBiotope(map, WATER, trees) };
  }

  it('条件に合う数まで少しずつ集まり、居場所の近くに居る', () => {
    const { map, b } = world();
    const fauna = new Fauna(map, seq(3));
    const e = env({ weeds: 100, deepCells: 200, fruit: 200, rabbits: 6, night: true });
    const cap = faunaCapacity(b, e);
    const arrived = new Set<string>();
    for (let i = 0; i < 600; i++) for (const k of fauna.update(0.25, b, e, WATER).arrived) arrived.add(k);
    for (const [kind, n] of Object.entries(cap)) {
      expect(fauna.count(kind as keyof typeof FAUNA)).toBe(n);
      if (n > 0) expect(arrived.has(kind)).toBe(true);
    }
    expect(cap.turtle).toBeGreaterThan(0);
    expect(cap.deer).toBeGreaterThan(0);
    // カメは小島の上、シカとリスは陸の上に居る
    for (const a of fauna.animals) {
      if (a.kind === 'turtle') expect(Math.hypot(a.x, a.z)).toBeLessThan(6);
      if (a.kind === 'deer' || a.kind === 'squirrel') expect(map.heightAt(a.x, a.z)).toBeGreaterThan(WATER);
    }
    expect(fauna.appealBonus()).toBe(
      Object.entries(cap).reduce((s, [k, n]) => s + n * FAUNA[k as keyof typeof FAUNA].appeal, 0),
    );
  });

  it('条件が合わなくなると去っていく（朝のフクロウ、冬のカエル）', () => {
    const { map, b } = world();
    const fauna = new Fauna(map, seq(5));
    const night = env({ rabbits: 6, night: true, fruit: 200 });
    for (let i = 0; i < 400; i++) fauna.update(0.25, b, night, WATER);
    expect(fauna.count('owl')).toBeGreaterThan(0);
    expect(fauna.count('frog')).toBeGreaterThan(0);

    const left = new Set<string>();
    const winterDay = env({ season: 'winter', rabbits: 6, night: false, fruit: 200 });
    for (let i = 0; i < 400; i++) for (const k of fauna.update(0.25, b, winterDay, WATER).left) left.add(k);
    expect(fauna.count('owl')).toBe(0);
    expect(fauna.count('frog')).toBe(0);
    expect(left.has('owl')).toBe(true);
    expect(left.has('frog')).toBe(true);
    // 林はそのままなので、リスは残る
    expect(fauna.count('squirrel')).toBeGreaterThan(0);
  });

  it('保存した生き物を戻せる', () => {
    const { map, b } = world();
    const fauna = new Fauna(map, seq(7));
    for (let i = 0; i < 200; i++) fauna.update(0.25, b, env({ fruit: 200 }), WATER);
    const saved = fauna.animals.map((a) => ({ ...a }));
    const again = new Fauna(map, seq(9));
    again.restore(saved);
    expect(again.counts()).toEqual(fauna.counts());
    again.restore(undefined);
    expect(again.animals).toHaveLength(0);
  });
});
