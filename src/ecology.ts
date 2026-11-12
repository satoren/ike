import type { Heightmap } from './heightmap';

/**
 * 生態系のロジック（描画から独立）。
 * - 木は育つと果物を実らせる
 * - 水辺の木が多いほど動物が、池が広く深いほど水生生物が集まってくる
 * - ウサギが増えると、それを狙って肉食動物（キツネ）も集まる
 * - プレイヤーはそれらを集めて売り、収入にする
 */

export type ItemKind = 'fruit' | 'rabbit' | 'duck' | 'fish' | 'fox' | 'bear';
/** 生態系の中で暮らす生き物（クマは出没イベントとして別に扱う） */
export type CreatureKind = Exclude<ItemKind, 'fruit' | 'bear'>;

export interface ItemInfo {
  name: string;
  /** 売値 */
  price: number;
  group: '果物' | '動物' | '水生生物';
}

export const ITEMS: Record<ItemKind, ItemInfo> = {
  fruit: { name: '木の実', price: 6, group: '果物' },
  rabbit: { name: 'ウサギ', price: 45, group: '動物' },
  duck: { name: 'カモ', price: 70, group: '動物' },
  fish: { name: 'サカナ', price: 30, group: '水生生物' },
  fox: { name: 'キツネ', price: 120, group: '動物' },
  bear: { name: 'クマ', price: 300, group: '動物' },
};

export const ITEM_ORDER: ItemKind[] = ['fruit', 'rabbit', 'duck', 'fish', 'fox', 'bear'];

/** 木の実り方 */
export const FRUIT = {
  /** 植えてから実をつけ始めるまでの秒数 */
  matureAge: 25,
  /** 1 個実るまでの秒数 */
  interval: 12,
  /** 1 本あたりの最大個数 */
  max: 3,
} as const;

export interface FruitTree {
  x: number;
  z: number;
  age: number;
  fruit: number;
  fruitTimer: number;
}

export interface Creature {
  id: number;
  kind: CreatureKind;
  x: number;
  z: number;
  heading: number;
  speed: number;
  /** 次に向きを変えるまでの秒数 */
  turnTimer: number;
  /** 見た目の揺れなどに使う位相 */
  phase: number;
}

export type Inventory = Record<ItemKind, number>;

export function emptyInventory(): Inventory {
  return { fruit: 0, rabbit: 0, duck: 0, fish: 0, fox: 0, bear: 0 };
}

export function inventoryValue(inv: Inventory): number {
  return ITEM_ORDER.reduce((sum, k) => sum + inv[k] * ITEMS[k].price, 0);
}

/** 木を 1 ステップ育てる。実が増えたら true */
export function growTree(tree: FruitTree, dt: number): boolean {
  tree.age += dt;
  if (tree.age < FRUIT.matureAge || tree.fruit >= FRUIT.max) return false;
  tree.fruitTimer += dt;
  if (tree.fruitTimer < FRUIT.interval) return false;
  tree.fruitTimer -= FRUIT.interval;
  tree.fruit++;
  return true;
}

export interface Habitat {
  /** 池になっているマス数 */
  waterCells: number;
  /** 魚が棲める深さ（水位 -0.5 以下）のマス数 */
  deepCells: number;
  trees: number;
  treesNearWater: number;
}

/**
 * 環境から、それぞれの生き物が何匹まで集まるかを決める。
 * キツネは環境ではなく、えさになるウサギの数で決まる。
 */
export function capacity(h: Habitat, rabbits = 0): Record<CreatureKind, number> {
  return {
    fox: Math.floor(rabbits / 5),
    rabbit: Math.floor(h.trees / 25 + h.treesNearWater / 6),
    duck: Math.floor(Math.min(h.waterCells / 120, h.treesNearWater / 5)),
    fish: Math.floor(h.deepCells / 12),
  };
}

/** 生き物が今いる地点に棲めるか */
export function habitable(kind: CreatureKind, map: Heightmap, waterLevel: number, x: number, z: number): boolean {
  const half = map.worldSize / 2 - 1;
  if (Math.abs(x) > half || Math.abs(z) > half) return false;
  const h = map.heightAt(x, z);
  switch (kind) {
    case 'rabbit':
    case 'fox':
      return h > waterLevel + 0.15;
    case 'duck':
      return h < waterLevel - 0.1;
    case 'fish':
      return h < waterLevel - 0.45;
  }
}

/** 生き物の動きの速さ（秒あたり） */
const SPEED: Record<CreatureKind, [number, number]> = {
  rabbit: [0.6, 1.6],
  duck: [0.3, 0.7],
  fish: [0.5, 1.2],
  fox: [1.0, 2.2],
};

/** キツネがウサギに気づく距離と、捕まえる距離 */
const FOX_SIGHT = 10;
const FOX_CATCH = 0.6;

export class Ecosystem {
  readonly creatures: Creature[] = [];
  private nextId = 1;
  private spawnTimer = 0;
  private readonly map: Heightmap;
  private readonly waterLevel: number;
  private readonly rand: () => number;
  /** 柵などで入れない場所（遊歩道にキツネは入れない、など） */
  private readonly isBlocked: (kind: CreatureKind, x: number, z: number) => boolean;

  constructor(
    map: Heightmap,
    waterLevel: number,
    rand: () => number = Math.random,
    isBlocked: (kind: CreatureKind, x: number, z: number) => boolean = () => false,
  ) {
    this.map = map;
    this.waterLevel = waterLevel;
    this.rand = rand;
    this.isBlocked = isBlocked;
  }

  private ok(kind: CreatureKind, x: number, z: number): boolean {
    return habitable(kind, this.map, this.waterLevel, x, z) && !this.isBlocked(kind, x, z);
  }

  /** 保存データから生き物を戻す（今いる生き物は消す） */
  restore(list: readonly Creature[]): void {
    this.creatures.length = 0;
    for (const c of list) this.creatures.push({ ...c });
    this.nextId = this.creatures.reduce((m, c) => Math.max(m, c.id), 0) + 1;
  }

  count(kind: CreatureKind): number {
    let n = 0;
    for (const c of this.creatures) if (c.kind === kind) n++;
    return n;
  }

  /**
   * 時間を進める。足りない種類の生き物を少しずつ呼び寄せ、今いる生き物を歩かせる。
   * 新しく来た生き物の種類を返す（通知用）。
   */
  update(dt: number, habitat: Habitat, trees: readonly FruitTree[]): CreatureKind[] {
    const arrived: CreatureKind[] = [];
    this.spawnTimer += dt;
    if (this.spawnTimer >= 1.5) {
      this.spawnTimer = 0;
      const cap = capacity(habitat, this.count('rabbit'));
      for (const kind of ['rabbit', 'duck', 'fish', 'fox'] as CreatureKind[]) {
        if (this.count(kind) < cap[kind] && this.rand() < 0.5) {
          if (this.spawn(kind, trees)) arrived.push(kind);
        }
      }
    }
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const c = this.creatures[i];
      if (!this.ok(c.kind, c.x, c.z)) {
        // すみかが無くなった（埋め立てられた・水が引いた）ので去っていく
        this.creatures.splice(i, 1);
        continue;
      }
      this.move(c, dt);
    }
    this.hunt();
    return arrived;
  }

  /** キツネのそばにいるウサギは食べられてしまう */
  private hunt(): void {
    for (const fox of this.creatures) {
      if (fox.kind !== 'fox') continue;
      const i = this.creatures.findIndex(
        (c) => c.kind === 'rabbit' && (c.x - fox.x) ** 2 + (c.z - fox.z) ** 2 < FOX_CATCH * FOX_CATCH,
      );
      if (i >= 0) this.creatures.splice(i, 1);
    }
  }

  private nearest(from: Creature, kind: CreatureKind, range: number): Creature | null {
    let best: Creature | null = null;
    let bestD = range * range;
    for (const c of this.creatures) {
      if (c.kind !== kind) continue;
      const d = (c.x - from.x) ** 2 + (c.z - from.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  /** すみかに合う場所を探して 1 匹呼び寄せる */
  spawn(kind: CreatureKind, trees: readonly FruitTree[] = []): Creature | null {
    const half = this.map.worldSize / 2 - 2;
    // 水の生き物は、池のマスの中から場所を選ぶ（地図全体から探すと池が小さいときに見つからない）
    const waterCells = kind === 'duck' || kind === 'fish' ? this.waterCellsFor(kind) : null;
    if (waterCells && waterCells.length === 0) return null;
    for (let attempt = 0; attempt < 40; attempt++) {
      let x: number;
      let z: number;
      if (waterCells) {
        const [cx, cz] = waterCells[Math.floor(this.rand() * waterCells.length)];
        const p = this.cellCenter(cx, cz);
        x = p.x + (this.rand() - 0.5) * this.map.cellSize;
        z = p.z + (this.rand() - 0.5) * this.map.cellSize;
      } else if ((kind === 'rabbit' || kind === 'fox') && trees.length > 0) {
        // ウサギは木の近くに現れる
        const t = trees[Math.floor(this.rand() * trees.length)];
        x = t.x + (this.rand() * 2 - 1) * 3;
        z = t.z + (this.rand() * 2 - 1) * 3;
      } else {
        x = (this.rand() * 2 - 1) * half;
        z = (this.rand() * 2 - 1) * half;
      }
      if (!this.ok(kind, x, z)) continue;
      const [lo, hi] = SPEED[kind];
      const c: Creature = {
        id: this.nextId++,
        kind,
        x,
        z,
        heading: this.rand() * Math.PI * 2,
        speed: lo + this.rand() * (hi - lo),
        turnTimer: 1 + this.rand() * 3,
        phase: this.rand() * Math.PI * 2,
      };
      this.creatures.push(c);
      return c;
    }
    return null;
  }

  private waterCellsFor(kind: 'duck' | 'fish'): [number, number][] {
    const out: [number, number][] = [];
    for (let cz = 0; cz < this.map.size; cz++) {
      for (let cx = 0; cx < this.map.size; cx++) {
        const p = this.cellCenter(cx, cz);
        if (this.ok(kind, p.x, p.z)) out.push([cx, cz]);
      }
    }
    return out;
  }

  private cellCenter(cx: number, cz: number): { x: number; z: number } {
    const half = this.map.worldSize / 2;
    return { x: (cx + 0.5) * this.map.cellSize - half, z: (cz + 0.5) * this.map.cellSize - half };
  }

  private move(c: Creature, dt: number): void {
    c.phase += dt * (c.kind === 'rabbit' ? 9 : 3);
    c.turnTimer -= dt;
    if (c.turnTimer <= 0) {
      c.heading += (this.rand() * 2 - 1) * 1.6;
      c.turnTimer = 1 + this.rand() * 3;
      // キツネは近くのウサギへ向かう
      if (c.kind === 'fox') {
        const prey = this.nearest(c, 'rabbit', FOX_SIGHT);
        if (prey) {
          c.heading = Math.atan2(prey.z - c.z, prey.x - c.x);
          c.turnTimer = 0.5;
        }
      }
      // ウサギはときどき立ち止まる
      if (c.kind === 'rabbit') {
        const [lo, hi] = SPEED.rabbit;
        c.speed = this.rand() < 0.35 ? 0 : lo + this.rand() * (hi - lo);
      }
    }
    const nx = c.x + Math.cos(c.heading) * c.speed * dt;
    const nz = c.z + Math.sin(c.heading) * c.speed * dt;
    if (this.ok(c.kind, nx, nz)) {
      c.x = nx;
      c.z = nz;
    } else {
      // すみかの外へは出ず、向きを変える
      c.heading += Math.PI * (0.6 + this.rand() * 0.8);
    }
  }

  /** 半径内の生き物を捕まえて取り除く。捕まえた種類ごとの数を返す */
  catchWithin(
    x: number,
    z: number,
    radius: number,
    max = Infinity,
    kinds?: readonly CreatureKind[],
  ): Partial<Record<CreatureKind, number>> {
    const caught: Partial<Record<CreatureKind, number>> = {};
    let n = 0;
    for (let i = this.creatures.length - 1; i >= 0 && n < max; i--) {
      const c = this.creatures[i];
      if (kinds && !kinds.includes(c.kind)) continue;
      if ((c.x - x) ** 2 + (c.z - z) ** 2 > radius * radius) continue;
      caught[c.kind] = (caught[c.kind] ?? 0) + 1;
      this.creatures.splice(i, 1);
      n++;
    }
    return caught;
  }
}

/** 半径内の木から果物を収穫する。収穫した個数を返す */
export function harvestFruit(trees: readonly FruitTree[], x: number, z: number, radius: number): number {
  let n = 0;
  for (const t of trees) {
    if (t.fruit === 0) continue;
    if ((t.x - x) ** 2 + (t.z - z) ** 2 > radius * radius) continue;
    n += t.fruit;
    t.fruit = 0;
    t.fruitTimer = 0;
  }
  return n;
}

/** 採取するたびにたまる「荒らされ度」。時間がたつと自然に回復する */
export const PRESSURE = {
  /** 1 つ採るごとに増える量 */
  weight: { fruit: 1, rabbit: 8, duck: 10, fish: 4, fox: 0, bear: 0 } as Record<ItemKind, number>,
  /** 半分に戻るまでの秒数 */
  halfLife: 25,
  /** 魅力が最大で何割まで下がるか */
  maxPenalty: 0.7,
  /** この値で魅力が半分の下がり幅（maxPenalty / 2）になる */
  half: 60,
} as const;

export function addPressure(current: number, kind: ItemKind, n: number): number {
  return current + PRESSURE.weight[kind] * n;
}

export function decayPressure(current: number, dt: number): number {
  return current * Math.pow(0.5, dt / PRESSURE.halfLife);
}

/** 荒らされ度から魅力の下がる割合（0〜maxPenalty）を求める */
export function pressurePenalty(pressure: number): number {
  return (PRESSURE.maxPenalty * pressure) / (pressure + PRESSURE.half);
}

export interface Wildlife {
  fruitOnTrees: number;
  rabbit: number;
  duck: number;
  fish: number;
}

/** 来園者がキツネに襲われる事件。起きると魅力が大きく下がり、日がたつと回復する */
export const ATTACK = {
  /** キツネ 1 匹・来園者 1 人あたり、1 秒に事件が起きる確率 */
  ratePerFoxVisitor: 1 / 12000,
  /** キツネの事件直後に魅力が下がる割合 */
  penalty: 0.6,
  /** クマに襲われたときの事件の重さ（キツネを 1 として） */
  bearSeverity: 1.5,
  /** 事件で魅力が下がる上限 */
  maxPenalty: 0.9,
  /** 影響が半分に戻るまでの秒数 */
  halfLife: 45,
} as const;

/** この dt の間に襲撃が起きる確率。遊歩道で安全に回れている人は襲われない */
export function attackChance(foxes: number, visitors: number, dt: number, safety = 0): number {
  const exposed = visitors * (1 - safety);
  return 1 - Math.exp(-ATTACK.ratePerFoxVisitor * foxes * exposed * dt);
}

export function decayIncident(current: number, dt: number): number {
  return current * Math.pow(0.5, dt / ATTACK.halfLife);
}

/** 遊歩道による客の回りやすさ */
export interface Access {
  /** 道からの眺めの良さ（魅力に加わる） */
  scenic: number;
  /** 遊歩道を作ったときの安全度を計算する関数（来園者数 → 0〜1） */
  safetyFor: (visitors: number) => number;
  /** 安全度 0 のとき魅力が何割下がるか */
  unsafePenalty: number;
}

const NO_ACCESS: Access = { scenic: 0, safetyFor: () => 0, unsafePenalty: 0 };

export interface Appeal {
  /** 採りすぎ・事件の影響を入れる前の魅力 */
  base: number;
  /** 採りすぎで下がっている割合（0〜1） */
  penalty: number;
  /** 襲撃事件で下がっている割合（0〜1） */
  incidentPenalty: number;
  /** 来園者のうち遊歩道で安全に回れる割合（0〜1） */
  safety: number;
  /** 安全が足りないことで下がっている割合（0〜1） */
  unsafePenalty: number;
  appeal: number;
  /** 1 日の来園者数 */
  visitors: number;
}

/** 入園料 1 人あたり */
export const TICKET_PRICE = 2;

/**
 * 景観の魅力。池や水辺の木といった「環境」に加え、いま実っている果物や
 * 暮らしている生き物も魅力になる。だから採りすぎると、その分と荒らされ度の分だけ魅力が下がる。
 */
export function computeAppeal(
  h: Habitat,
  w: Wildlife,
  pressure: number,
  incident = 0,
  access: Access = NO_ACCESS,
): Appeal {
  const base = Math.round(
    access.scenic +
    Math.sqrt(h.waterCells) * 3 +
      h.trees * 0.3 +
      h.treesNearWater * 1.5 +
      w.fruitOnTrees * 0.3 +
      w.rabbit * 3 +
      w.duck * 5 +
      w.fish * 2,
  );
  const penalty = pressurePenalty(pressure);
  const incidentPenalty = Math.min(ATTACK.maxPenalty, incident * ATTACK.penalty);
  const before = base * (1 - penalty) * (1 - incidentPenalty);
  // 安全度は「安全対策の前に来るはずの人数」に対して道が足りているかで決める
  const safety = access.safetyFor(Math.floor(before * 0.8));
  const unsafePenalty = access.unsafePenalty * (1 - safety);
  const appeal = Math.round(before * (1 - unsafePenalty));
  return { base, penalty, incidentPenalty, safety, unsafePenalty, appeal, visitors: Math.floor(appeal * 0.8) };
}
