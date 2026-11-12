import type { Heightmap } from './heightmap';
import type { Appeal, Habitat } from './ecology';

/**
 * 珍しい生き物（描画から独立したロジック）。
 * 環境がとても良く、荒らされていないときだけ、日が変わるときにまれに現れる。
 * 現れると「話題」になって一気に客が増え、居てくれる間も魅力が上がり続ける。
 * 捕まえることはできない（保護の対象）。採りすぎたり環境を壊したりすると去ってしまう。
 */

export type RareKind = 'firefly' | 'salamander';

export interface RareEnv {
  habitat: Habitat;
  /** 池にいるサカナの数 */
  fish: number;
  /** 採りすぎによる荒らされ度 */
  pressure: number;
}

export interface RareInfo {
  name: string;
  /** 現れる条件 */
  needs: (env: RareEnv) => boolean;
  /** 条件を満たした日に現れる確率 */
  chance: number;
  /** 居てくれる日数 */
  stayDays: number;
  /** 去ってから次に現れうるまでの日数 */
  cooldownDays: number;
  /** 居る間、魅力が何割上がるか */
  presence: number;
  /** 現れた直後の話題で、魅力が何割上がるか（時間で薄れる） */
  buzz: number;
  /** 現れたときの知らせ */
  arrive: string;
}

export const RARE: Record<RareKind, RareInfo> = {
  firefly: {
    name: 'ホタル',
    needs: ({ habitat: h, pressure }) => h.treesNearWater >= 45 && h.waterCells >= 600 && pressure < 20,
    chance: 0.25,
    stayDays: 6,
    cooldownDays: 6,
    presence: 0.15,
    buzz: 0.5,
    arrive: 'ホタルが現れました！水辺が光って話題になり、来園者が増えています',
  },
  salamander: {
    name: 'オオサンショウウオ',
    needs: ({ habitat: h, fish, pressure }) =>
      h.deepCells >= 250 && h.treesNearWater >= 30 && fish >= 8 && pressure < 10,
    chance: 0.12,
    stayDays: 8,
    cooldownDays: 10,
    presence: 0.25,
    buzz: 0.8,
    arrive: 'オオサンショウウオが現れました！大きな話題になり、来園者が押し寄せています',
  },
};

export const RARE_ORDER: RareKind[] = ['firefly', 'salamander'];

/** 話題が半分に薄れるまでの秒数 */
export const BUZZ_HALF_LIFE = 30;
/** 荒らされ度がこれを超えると、居ても去ってしまう */
export const RARE_FLEE_PRESSURE = 45;

export interface RareSighting {
  kind: RareKind;
  daysLeft: number;
  /** 今いる場所（ホタルは群れの中心） */
  x: number;
  z: number;
  heading: number;
  /** ホタルが舞う水辺の木の場所 */
  spots: [number, number][];
}

export interface RareState {
  sightings: RareSighting[];
  /** 話題の強さ（種類ごと、1 = 現れた直後） */
  buzz: Record<RareKind, number>;
  /** 次に現れうるまでの残り日数 */
  cooldown: Record<RareKind, number>;
}

export function emptyRareState(): RareState {
  return {
    sightings: [],
    buzz: { firefly: 0, salamander: 0 },
    cooldown: { firefly: 0, salamander: 0 },
  };
}

export interface RareEvent {
  kind: RareKind;
  type: 'arrived' | 'left' | 'fled';
}

/** 魅力を何倍にするか（居る分＋話題の分） */
export function rareBoost(state: RareState): number {
  let boost = 1;
  for (const s of state.sightings) boost += RARE[s.kind].presence;
  for (const k of RARE_ORDER) boost += RARE[k].buzz * state.buzz[k];
  return boost;
}

/** 魅力と来園者数に、珍しい生き物の効果をかける */
export function applyRareBoost(appeal: Appeal, boost: number): Appeal {
  if (boost === 1) return appeal;
  const value = Math.round(appeal.appeal * boost);
  return { ...appeal, appeal: value, visitors: Math.floor(value * 0.8) };
}

export class RareLife {
  state: RareState = emptyRareState();
  private readonly map: Heightmap;
  private readonly waterLevel: number;
  private readonly rand: () => number;

  constructor(map: Heightmap, waterLevel: number, rand: () => number = Math.random) {
    this.map = map;
    this.waterLevel = waterLevel;
    this.rand = rand;
  }

  restore(state: RareState | undefined): void {
    const base = emptyRareState();
    if (!state) {
      this.state = base;
      return;
    }
    this.state = {
      sightings: (state.sightings ?? []).map((s) => ({ ...s, spots: s.spots.map((p) => [p[0], p[1]]) })),
      buzz: { ...base.buzz, ...state.buzz },
      cooldown: { ...base.cooldown, ...state.cooldown },
    };
  }

  snapshot(): RareState {
    return JSON.parse(JSON.stringify(this.state)) as RareState;
  }

  has(kind: RareKind): boolean {
    return this.state.sightings.some((s) => s.kind === kind);
  }

  /**
   * 日が変わるときに呼ぶ。居る日数を減らし、条件がそろっていればまれに新しく現れる。
   * waterTrees は水辺の木の場所（ホタルが舞う場所に使う）。
   */
  onNewDay(env: RareEnv, waterTrees: readonly { x: number; z: number }[]): RareEvent[] {
    const events: RareEvent[] = [];
    const st = this.state;
    for (const k of RARE_ORDER) st.cooldown[k] = Math.max(0, st.cooldown[k] - 1);
    for (let i = st.sightings.length - 1; i >= 0; i--) {
      const s = st.sightings[i];
      s.daysLeft--;
      if (s.daysLeft <= 0) {
        st.sightings.splice(i, 1);
        st.cooldown[s.kind] = RARE[s.kind].cooldownDays;
        events.push({ kind: s.kind, type: 'left' });
      }
    }
    for (const k of RARE_ORDER) {
      if (this.has(k) || st.cooldown[k] > 0 || !RARE[k].needs(env)) continue;
      if (this.rand() >= RARE[k].chance) continue;
      if (this.appear(k, waterTrees)) events.push({ kind: k, type: 'arrived' });
    }
    return events;
  }

  /** 条件を無視してすぐに呼び寄せる（確認用・テスト用） */
  appear(kind: RareKind, waterTrees: readonly { x: number; z: number }[]): RareSighting | null {
    let sighting: RareSighting | null = null;
    if (kind === 'firefly') {
      if (waterTrees.length === 0) return null;
      const spots: [number, number][] = [];
      const n = Math.min(10, waterTrees.length);
      // 水辺の木のどこか 1 本を中心に、近い木を集めて群れの場所にする
      const c = waterTrees[Math.floor(this.rand() * waterTrees.length)];
      const near = [...waterTrees].sort(
        (a, b) => (a.x - c.x) ** 2 + (a.z - c.z) ** 2 - ((b.x - c.x) ** 2 + (b.z - c.z) ** 2),
      );
      for (let i = 0; i < n; i++) spots.push([near[i].x, near[i].z]);
      sighting = { kind, daysLeft: RARE[kind].stayDays, x: c.x, z: c.z, heading: 0, spots };
    } else {
      const p = this.findShallows();
      if (!p) return null;
      sighting = { kind, daysLeft: RARE[kind].stayDays, x: p.x, z: p.z, heading: this.rand() * Math.PI * 2, spots: [] };
    }
    this.state.sightings.push(sighting);
    this.state.buzz[kind] = 1;
    return sighting;
  }

  /** 毎フレーム呼ぶ。話題を薄れさせ、オオサンショウウオを動かし、荒らされたら去らせる */
  update(dt: number, env: RareEnv): RareEvent[] {
    const events: RareEvent[] = [];
    const st = this.state;
    const decay = Math.pow(0.5, dt / BUZZ_HALF_LIFE);
    for (const k of RARE_ORDER) st.buzz[k] *= decay;
    for (let i = st.sightings.length - 1; i >= 0; i--) {
      const s = st.sightings[i];
      const gone = env.pressure > RARE_FLEE_PRESSURE || (s.kind === 'salamander' && !this.isShallows(s.x, s.z, true));
      if (gone) {
        st.sightings.splice(i, 1);
        st.cooldown[s.kind] = RARE[s.kind].cooldownDays * 2;
        st.buzz[s.kind] = 0;
        events.push({ kind: s.kind, type: 'fled' });
        continue;
      }
      if (s.kind === 'salamander') this.crawl(s, dt);
    }
    return events;
  }

  /** オオサンショウウオは池の浅い岸辺を、ゆっくり歩き回る */
  private crawl(s: RareSighting, dt: number): void {
    if (this.rand() < dt * 0.4) s.heading += (this.rand() * 2 - 1) * 1.2;
    const speed = 0.35;
    const nx = s.x + Math.cos(s.heading) * speed * dt;
    const nz = s.z + Math.sin(s.heading) * speed * dt;
    if (this.isShallows(nx, nz)) {
      s.x = nx;
      s.z = nz;
    } else {
      s.heading += Math.PI * (0.6 + this.rand() * 0.8);
    }
  }

  /** 岸に近い浅瀬か。loose は「少し外れても居続ける」ための緩い判定 */
  isShallows(x: number, z: number, loose = false): boolean {
    const half = this.map.worldSize / 2 - 1;
    if (Math.abs(x) > half || Math.abs(z) > half) return false;
    const h = this.map.heightAt(x, z);
    return loose ? h < this.waterLevel - 0.05 : h < this.waterLevel - 0.15 && h > this.waterLevel - 1.2;
  }

  private findShallows(): { x: number; z: number } | null {
    const cells: [number, number][] = [];
    const half = this.map.worldSize / 2;
    for (let cz = 0; cz < this.map.size; cz += 2) {
      for (let cx = 0; cx < this.map.size; cx += 2) {
        const x = (cx + 0.5) * this.map.cellSize - half;
        const z = (cz + 0.5) * this.map.cellSize - half;
        if (this.isShallows(x, z)) cells.push([x, z]);
      }
    }
    if (cells.length === 0) return null;
    const [x, z] = cells[Math.floor(this.rand() * cells.length)];
    return { x, z };
  }
}
