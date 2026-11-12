import { describe, expect, it } from 'vitest';
import { Heightmap } from './heightmap';
import { RANGER, Rangers, type Threat } from './rangers';

function setup() {
  const map = new Heightmap(32);
  map.heights.fill(2);
  let s = 3;
  const rangers = new Rangers(map, 0.5, () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff));
  return { map, rangers };
}

describe('Rangers', () => {
  it('雇える人数に上限があり、給料は人数分', () => {
    const { rangers } = setup();
    for (let i = 0; i < RANGER.max + 2; i++) rangers.hire();
    expect(rangers.count).toBe(RANGER.max);
    expect(rangers.payroll).toBe(RANGER.max * RANGER.wage);
    expect(rangers.dismiss()).toBe(true);
    expect(rangers.count).toBe(RANGER.max - 1);
  });

  it('見回り範囲のキツネに駆け寄って捕まえる', () => {
    const { rangers } = setup();
    const r = rangers.hire()!;
    r.x = 0;
    r.z = 0;
    const fox: Threat = { kind: 'fox', id: 1, x: 5, z: 0 };
    let caught = false;
    for (let i = 0; i < 200 && !caught; i++) {
      caught = rangers.update(0.05, [fox], () => null).some((a) => a.kind === 'catch' && a.target.id === 1);
    }
    expect(caught).toBe(true);
  });

  it('クマは近づいて撃つ。撃ったあとは少し間をあける', () => {
    const { rangers } = setup();
    const r = rangers.hire()!;
    r.x = 0;
    r.z = 0;
    const bear: Threat = { kind: 'bear', id: 9, x: 2, z: 0 };
    expect(rangers.update(0.05, [bear], () => null).map((a) => a.kind)).toEqual(['shoot']);
    expect(rangers.update(0.05, [bear], () => null)).toEqual([]);
    let shots = 0;
    for (let i = 0; i < 40; i++) shots += rangers.update(0.05, [bear], () => null).length;
    expect(shots).toBe(1);
  });

  it('クマを密猟者やキツネより先に狙い、遠すぎるキツネ・密猟者は無視する', () => {
    const { rangers } = setup();
    const r = rangers.hire()!;
    r.x = 0;
    r.z = 0;
    const threats: Threat[] = [
      { kind: 'fox', id: 1, x: 0.5, z: 0 },
      { kind: 'bear', id: 2, x: 3, z: 0 },
    ];
    expect(rangers.update(0.05, threats, () => null)[0].target.kind).toBe('bear');
    const far: Threat = { kind: 'poacher', id: 3, x: RANGER.sight + 2, z: 0 };
    // クマは遠くても向かう
    const before = r.x;
    rangers.update(0.05, [{ kind: 'bear', id: 4, x: RANGER.sight * 3, z: 0 }], () => null);
    expect(r.x).toBeGreaterThan(before);
    r.x = 0;
    rangers.update(0.05, [far], () => ({ x: -5, z: 0 }));
    expect(r.x).toBeLessThan(0); // 巡回先へ向かった
  });

  it('2 人いても同じ相手を同時に捕まえない', () => {
    const { rangers } = setup();
    for (const r of [rangers.hire()!, rangers.hire()!]) {
      r.x = 0;
      r.z = 0;
    }
    const actions = rangers.update(0.05, [{ kind: 'poacher', id: 1, x: 0.3, z: 0 }], () => null);
    expect(actions).toHaveLength(1);
  });
});
