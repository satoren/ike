import type { Heightmap } from './heightmap';
import { t } from './i18n';

/**
 * 生態系のつながり（描画から独立）。
 *   水草 → 魚が増える → 魚を食べにカワセミやサギが来る
 * 魚を採りすぎると鳥が食べられなくなって去り、景観の魅力も下がる。
 * 鳥は守られた野鳥なので、かごには入れられない。
 */

export type BirdKind = 'kingfisher' | 'heron';

export const BIRDS: Record<BirdKind, { name: string; appeal: number }> = {
  kingfisher: { name: t('カワセミ'), appeal: 12 },
  heron: { name: t('サギ'), appeal: 8 },
};

export const WEED = {
  /** 1 株の値段 */
  cost: 5,
  /** 植えてから魚のすみかになるまでの秒数 */
  matureAge: 20,
  /** 育った 1 株で、池に棲める魚が何匹増えるか */
  fishPerWeed: 1,
  /** 水草が育つ深さ（水面からの深さ）。浅すぎると干上がり、深すぎると光が届かない */
  minDepth: 0.05,
  maxDepth: 1.6,
  /** 株どうしの最小距離 */
  spacing: 0.9,
} as const;

/** 鳥が来るのに必要な魚の数など */
export const BIRD_NEEDS = {
  /** カワセミ 1 羽を養える魚の数 */
  fishPerKingfisher: 6,
  /** カワセミが止まり木にする水辺の木の最低本数 */
  perchTrees: 3,
  maxKingfisher: 3,
  /** サギ 1 羽を養える魚の数 */
  fishPerHeron: 10,
  maxHeron: 2,
  /** 1 羽が魚を 1 匹食べるまでの平均秒数 */
  eatInterval: 25,
  /** 魚が足りなくなってから去るまでの秒数 */
  leaveDelay: 6,
} as const;

export interface Weed {
  x: number;
  z: number;
  age: number;
}

export interface Bird {
  id: number;
  kind: BirdKind;
  x: number;
  z: number;
  /** 水面からの高さ（飛んでいるとき > 0） */
  y: number;
  heading: number;
  /** 飛んでいく先 */
  tx: number;
  tz: number;
  /** 立ち止まっている残り秒数 */
  rest: number;
  /** 次に魚を食べるまでの秒数 */
  hunger: number;
  phase: number;
}

/** 魚の居場所を見たり、食べたりするための窓口 */
export interface FishPond {
  fish(): readonly { x: number; z: number }[];
  /** その近くの魚を 1 匹食べる。食べられたら true */
  eat(x: number, z: number): boolean;
}

/** 魚が何匹まで棲めるか。水草がないと深い池でも少ししか棲めない */
export function fishCapacity(deepCells: number, matureWeeds: number): number {
  return Math.floor(Math.min(deepCells / 6, deepCells / 16 + matureWeeds * WEED.fishPerWeed));
}

/** 魚の数と水辺の木から、鳥が何羽まで来るか */
export function birdCapacity(fish: number, treesNearWater: number): Record<BirdKind, number> {
  return {
    kingfisher:
      treesNearWater >= BIRD_NEEDS.perchTrees
        ? Math.min(BIRD_NEEDS.maxKingfisher, Math.floor(fish / BIRD_NEEDS.fishPerKingfisher))
        : 0,
    heron: Math.min(BIRD_NEEDS.maxHeron, Math.floor(fish / BIRD_NEEDS.fishPerHeron)),
  };
}

export interface FoodWebEvents {
  arrived: BirdKind[];
  left: BirdKind[];
}

export class FoodWeb {
  readonly weeds: Weed[] = [];
  readonly birds: Bird[] = [];
  private nextId = 1;
  private spawnTimer = 0;
  private checkTimer = 0;
  /** 魚が足りない状態が続いている秒数（種類ごと） */
  private readonly starving: Record<BirdKind, number> = { kingfisher: 0, heron: 0 };
  private readonly map: Heightmap;
  private readonly waterLevel: number;
  private readonly rand: () => number;

  constructor(map: Heightmap, waterLevel: number, rand: () => number = Math.random) {
    this.map = map;
    this.waterLevel = waterLevel;
    this.rand = rand;
  }

  get matureWeeds(): number {
    let n = 0;
    for (const w of this.weeds) if (w.age >= WEED.matureAge) n++;
    return n;
  }

  count(kind: BirdKind): number {
    let n = 0;
    for (const b of this.birds) if (b.kind === kind) n++;
    return n;
  }

  /** 鳥がいることで加わる景観の魅力 */
  appealBonus(): number {
    return this.birds.reduce((s, b) => s + BIRDS[b.kind].appeal, 0);
  }

  private depth(x: number, z: number): number {
    return this.waterLevel - this.map.heightAt(x, z);
  }

  canPlantWeed(x: number, z: number): boolean {
    const half = this.map.worldSize / 2 - 1;
    if (Math.abs(x) > half || Math.abs(z) > half) return false;
    const d = this.depth(x, z);
    if (d < WEED.minDepth || d > WEED.maxDepth) return false;
    const s2 = WEED.spacing * WEED.spacing;
    return !this.weeds.some((w) => (w.x - x) ** 2 + (w.z - z) ** 2 < s2);
  }

  plantWeed(x: number, z: number, grown = false): boolean {
    if (!this.canPlantWeed(x, z)) return false;
    this.weeds.push({ x, z, age: grown ? WEED.matureAge : 0 });
    return true;
  }

  restore(data: { weeds?: Weed[]; birds?: Bird[] } | undefined): void {
    this.weeds.length = 0;
    this.birds.length = 0;
    for (const w of data?.weeds ?? []) this.weeds.push({ ...w });
    for (const b of data?.birds ?? []) this.birds.push({ ...b });
    this.nextId = this.birds.reduce((m, b) => Math.max(m, b.id), 0) + 1;
  }

  /**
   * 時間を進める。水草を育て、魚の数に応じて鳥を呼び寄せたり去らせたりし、鳥に魚を食べさせる。
   * 戻り値の weedsChanged は、水草が枯れて数が変わったとき true（すみかの再計算用）。
   */
  update(dt: number, pond: FishPond, treesNearWater: number): FoodWebEvents & { weedsChanged: boolean } {
    const events: FoodWebEvents = { arrived: [], left: [] };
    let weedsChanged = false;
    for (const w of this.weeds) {
      const before = w.age < WEED.matureAge;
      w.age += dt;
      if (before && w.age >= WEED.matureAge) weedsChanged = true;
    }

    // 地形が変わって干上がった・深くなりすぎた水草は枯れる
    this.checkTimer += dt;
    if (this.checkTimer >= 1) {
      this.checkTimer = 0;
      for (let i = this.weeds.length - 1; i >= 0; i--) {
        const d = this.depth(this.weeds[i].x, this.weeds[i].z);
        if (d < WEED.minDepth || d > WEED.maxDepth) {
          this.weeds.splice(i, 1);
          weedsChanged = true;
        }
      }
    }

    const fish = pond.fish();
    const cap = birdCapacity(fish.length, treesNearWater);
    for (const kind of ['kingfisher', 'heron'] as BirdKind[]) {
      const n = this.count(kind);
      if (n > cap[kind]) {
        // 魚が足りない。しばらく続くと 1 羽去っていく
        this.starving[kind] += dt;
        if (this.starving[kind] >= BIRD_NEEDS.leaveDelay) {
          this.starving[kind] = 0;
          const i = this.birds.findIndex((b) => b.kind === kind);
          this.birds.splice(i, 1);
          events.left.push(kind);
        }
      } else {
        this.starving[kind] = 0;
      }
    }

    this.spawnTimer += dt;
    if (this.spawnTimer >= 4) {
      this.spawnTimer = 0;
      for (const kind of ['kingfisher', 'heron'] as BirdKind[]) {
        if (this.count(kind) < cap[kind] && this.rand() < 0.4 && this.spawn(kind)) events.arrived.push(kind);
      }
    }

    for (const b of this.birds) this.move(b, dt, pond, fish);
    return { ...events, weedsChanged };
  }

  /** 水辺の場所を探して 1 羽呼び寄せる */
  spawn(kind: BirdKind): Bird | null {
    const p = this.randomSpot(kind);
    if (!p) return null;
    const b: Bird = {
      id: this.nextId++,
      kind,
      x: p.x,
      z: p.z,
      y: kind === 'kingfisher' ? 1.5 : 0,
      heading: this.rand() * Math.PI * 2,
      tx: p.x,
      tz: p.z,
      rest: 1 + this.rand() * 3,
      hunger: BIRD_NEEDS.eatInterval * (0.5 + this.rand()),
      phase: this.rand() * Math.PI * 2,
    };
    this.birds.push(b);
    return b;
  }

  /** サギは浅瀬に立つ。カワセミは池の上ならどこでも */
  private spotOk(kind: BirdKind, x: number, z: number): boolean {
    const half = this.map.worldSize / 2 - 1;
    if (Math.abs(x) > half || Math.abs(z) > half) return false;
    const d = this.depth(x, z);
    return kind === 'heron' ? d > 0.05 && d < 0.7 : d > 0.05;
  }

  private randomSpot(kind: BirdKind): { x: number; z: number } | null {
    const cells: number[] = [];
    const half = this.map.worldSize / 2;
    const cs = this.map.cellSize;
    for (let cz = 0; cz < this.map.size; cz++) {
      for (let cx = 0; cx < this.map.size; cx++) {
        if (this.spotOk(kind, (cx + 0.5) * cs - half, (cz + 0.5) * cs - half)) cells.push(cz * this.map.size + cx);
      }
    }
    if (cells.length === 0) return null;
    const c = cells[Math.floor(this.rand() * cells.length)];
    return { x: ((c % this.map.size) + 0.5) * cs - half, z: (Math.floor(c / this.map.size) + 0.5) * cs - half };
  }

  private move(b: Bird, dt: number, pond: FishPond, fish: readonly { x: number; z: number }[]): void {
    b.phase += dt * (b.kind === 'kingfisher' ? 14 : 2);
    b.hunger -= dt;

    // 住んでいた浅瀬が無くなったら、別の場所へ移る
    if (!this.spotOk(b.kind, b.x, b.z) && b.kind === 'heron') {
      const p = this.randomSpot(b.kind);
      if (p) Object.assign(b, { x: p.x, z: p.z, tx: p.x, tz: p.z });
    }

    // おなかが空いたら近くの魚をねらう
    if (b.hunger <= 0 && fish.length > 0) {
      const range = b.kind === 'kingfisher' ? 12 : 4;
      let best: { x: number; z: number } | null = null;
      let bestD = range * range;
      for (const f of fish) {
        const d = (f.x - b.x) ** 2 + (f.z - b.z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      if (best && (b.kind === 'kingfisher' || this.spotOk('heron', best.x, best.z))) {
        b.tx = best.x;
        b.tz = best.z;
        b.rest = 0;
      }
    }

    const dx = b.tx - b.x;
    const dz = b.tz - b.z;
    const dist = Math.hypot(dx, dz);
    const speed = b.kind === 'kingfisher' ? 5 : 0.6;
    if (dist > 0.15) {
      b.heading = Math.atan2(dz, dx);
      const step = Math.min(dist, speed * dt);
      b.x += (dx / dist) * step;
      b.z += (dz / dist) * step;
      if (b.kind === 'kingfisher') b.y += (1.5 - b.y) * Math.min(1, dt * 3);
      return;
    }

    // 着いた。おなかが空いていれば魚を食べる
    if (b.hunger <= 0) {
      if (pond.eat(b.x, b.z)) b.hunger = BIRD_NEEDS.eatInterval * (0.6 + this.rand() * 0.8);
      else b.hunger = 2; // 逃げられた。少し待ってまたねらう
      if (b.kind === 'kingfisher') b.y = 0.1; // 水面に飛び込む
    }
    b.rest -= dt;
    if (b.kind === 'kingfisher') b.y += (1.5 - b.y) * Math.min(1, dt * 2);
    if (b.rest > 0) return;
    // 次の行き先を決める
    b.rest = b.kind === 'kingfisher' ? 1 + this.rand() * 3 : 3 + this.rand() * 6;
    const reach = b.kind === 'kingfisher' ? 14 : 3;
    for (let i = 0; i < 12; i++) {
      const x = b.x + (this.rand() * 2 - 1) * reach;
      const z = b.z + (this.rand() * 2 - 1) * reach;
      if (this.spotOk(b.kind, x, z)) {
        b.tx = x;
        b.tz = z;
        return;
      }
    }
  }
}
