import { describe, expect, it } from 'vitest';
import { Heightmap } from './heightmap';
import type { Creature, CreatureKind } from './ecology';
import { POACHER, Poachers, type Prey } from './poachers';

function setup() {
  const map = new Heightmap(32);
  map.heights.fill(2);
  let s = 7;
  const poachers = new Poachers(map, 0.5, () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff));
  return { map, poachers };
}

function creature(id: number, kind: CreatureKind, x: number, z: number): Creature {
  return { id, kind, x, z, heading: 0, speed: 0, turnTimer: 1, phase: 0 };
}

function prey(list: Creature[]): Prey {
  return {
    creatures: list,
    remove(id) {
      const i = list.findIndex((c) => c.id === id);
      if (i >= 0) list.splice(i, 1);
    },
  };
}

function run(poachers: Poachers, p: Prey, visitors: { x: number; z: number }[], seconds: number) {
  const stolen: CreatureKind[] = [];
  const escaped: CreatureKind[][] = [];
  let spotted = 0;
  for (let t = 0; t < seconds; t += 0.1) {
    const ev = poachers.update(0.1, p, visitors);
    stolen.push(...ev.stolen);
    escaped.push(...ev.escapedWith);
    spotted += ev.spotted;
  }
  return { stolen, escaped, spotted };
}

describe('密猟者', () => {
  it('地図の端から忍び込み、魚や動物を盗むがキツネは狙わない', () => {
    const { poachers } = setup();
    const p = poachers.spawn();
    expect(Math.max(Math.abs(p.x), Math.abs(p.z))).toBeGreaterThan(13);
    const list = [creature(1, 'fox', 0, 0), creature(2, 'fish', 1, 1), creature(3, 'rabbit', -1, 2)];
    const { stolen } = run(poachers, prey(list), [], 30);
    expect(stolen.sort()).toEqual(['fish', 'rabbit']);
    expect(list.map((c) => c.kind)).toEqual(['fox']);
  });

  it('盗めるだけ盗むと逃げ出し、逃げ切ると持ち去られる', () => {
    const { poachers } = setup();
    poachers.spawn();
    const list = Array.from({ length: 8 }, (_, i) => creature(i + 1, 'fish', (i % 3) - 1, Math.floor(i / 3) - 1));
    const { stolen, escaped } = run(poachers, prey(list), [], 60);
    expect(stolen).toHaveLength(POACHER.maxLoot);
    expect(escaped).toHaveLength(1);
    expect(escaped[0]).toHaveLength(POACHER.maxLoot);
    expect(poachers.poachers).toHaveLength(0);
  });

  it('来園者に見つかると逃げる', () => {
    const { poachers } = setup();
    const p = poachers.spawn();
    const { spotted } = run(poachers, prey([]), [{ x: p.x, z: p.z }], 0.1);
    expect(spotted).toBe(1);
    expect(poachers.poachers[0].mode).toBe('flee');
  });

  it('「集める」でなぞると捕まえられ、盗品が返ってくる', () => {
    const { poachers } = setup();
    const p = poachers.spawn();
    p.loot.push('duck');
    expect(poachers.catchWithin(p.x + 10, p.z, 2)).toHaveLength(0);
    expect(poachers.catchWithin(p.x + 1, p.z, 1)).toEqual([['duck']]);
    expect(poachers.poachers).toHaveLength(0);
  });

  it('獲物が多いほど狙われやすい', () => {
    expect(POACHER.chance(60)).toBeGreaterThan(POACHER.chance(5));
  });
});
