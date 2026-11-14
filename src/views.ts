import type { Heightmap } from './heightmap';
import type { PathGrid } from './paths';

/**
 * 道からの眺め（描画から独立）。
 * 遊歩道の 1マスごとに、そこから見えるものの「種類」を数える。
 * 種類が多いほど眺めがよく、魅力が上がる。同じものをたくさん並べても増えないので、
 * 道のまわりに何を置くか、道をどこに通すかが効く。
 */

export type ViewKind = 'water' | 'grove' | 'flower' | 'rock' | 'island' | 'landmark';

export const VIEW_ORDER: ViewKind[] = ['water', 'grove', 'flower', 'rock', 'island', 'landmark'];

export const VIEWS: Record<ViewKind, { name: string; how: string }> = {
  water: { name: '水面', how: '道の近くに池を掘る' },
  grove: { name: '木立', how: '道の近くに木を 3本以上植える' },
  flower: { name: '花畑', how: '「自然」の花畑を道の近くに植える' },
  rock: { name: '岩', how: '「自然」の岩を道の近くに置く' },
  island: { name: '小島', how: '池の中に、岸から離れた島を残す' },
  landmark: { name: '名所', how: '展望台・水車小屋・自然館・大ケヤキを建てる' },
};

export const VIEW = {
  /** 道のマスから、このマス数以内にあるものが見える */
  radius: 5,
  /** 木立とみなす木の本数 */
  groveTrees: 3,
  /** 何も見えない道 1マスの魅力 */
  plain: 0.15,
  /** 1種類めで増える魅力（水辺の道はこれまでと同じ 0.6 になる） */
  first: 0.45,
  /** 2種類めからの、1種類ごとに増える魅力 */
  more: 0.25,
  /** 数える種類の上限 */
  maxKinds: 4,
  /** この種類数以上が見えるマスを「変化のある眺め」とする */
  rich: 3,
} as const;

/** 見える種類の数から、道 1マスの魅力を決める */
export function viewScore(kinds: number): number {
  if (kinds <= 0) return VIEW.plain;
  return VIEW.plain + VIEW.first + VIEW.more * (Math.min(kinds, VIEW.maxKinds) - 1);
}

interface Point {
  x: number;
  z: number;
}

/** 眺めになるものの場所（ワールド座標） */
export interface ViewScene {
  trees: readonly Point[];
  flowers: readonly Point[];
  rocks: readonly Point[];
  /** 小島の陸地（Biotope.island） */
  islands: readonly Point[];
  /** 名所になる施設 */
  landmarks: readonly Point[];
}

const BIT: Record<Exclude<ViewKind, 'grove'>, number> = { water: 1, flower: 2, rock: 4, island: 8, landmark: 16 };
const GROVE_BIT = 32;
const BIT_OF: Record<ViewKind, number> = { ...BIT, grove: GROVE_BIT };

/** 道ではない（または出入口とつながっていない）マスの印 */
export const NO_VIEW = 255;

export class ViewMap {
  readonly size: number;
  /** マスごとの、見える種類の数。つながった道でなければ NO_VIEW */
  readonly counts: Uint8Array;
  /** 眺めによる魅力の合計 */
  total = 0;
  /** つながった道のマス数 */
  cells = 0;
  /** 変化のある眺め（VIEW.rich 種類以上）のマス数 */
  rich = 0;
  /** 何も見えないマス数 */
  plain = 0;
  private readonly masks: Uint8Array;
  private readonly map: Heightmap;
  private readonly waterLevel: number;
  private readonly offsets: [number, number][] = [];

  constructor(map: Heightmap, waterLevel: number) {
    this.map = map;
    this.waterLevel = waterLevel;
    this.size = map.size;
    this.counts = new Uint8Array(map.size * map.size).fill(NO_VIEW);
    this.masks = new Uint8Array(map.size * map.size);
    const r = VIEW.radius;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz <= r * r) this.offsets.push([dx, dz]);
      }
    }
  }

  /** 道のマスごとに、見える種類を調べ直す */
  survey(paths: PathGrid, scene: ViewScene): void {
    const size = this.size;
    const half = this.map.worldSize / 2;
    const cs = this.map.cellSize;
    const cellOf = (p: Point): number => {
      const cx = Math.floor((p.x + half) / cs);
      const cz = Math.floor((p.z + half) / cs);
      return cx < 0 || cz < 0 || cx >= size || cz >= size ? -1 : cz * size + cx;
    };

    // 何がどのマスにあるか
    const feat = new Uint8Array(size * size);
    const treeCount = new Uint8Array(size * size);
    for (let cz = 0; cz < size; cz++) {
      for (let cx = 0; cx < size; cx++) {
        if (this.map.get(cx, cz) < this.waterLevel) feat[cz * size + cx] |= BIT.water;
      }
    }
    const mark = (list: readonly Point[], bit: number) => {
      for (const p of list) {
        const i = cellOf(p);
        if (i >= 0) feat[i] |= bit;
      }
    };
    mark(scene.flowers, BIT.flower);
    mark(scene.rocks, BIT.rock);
    mark(scene.islands, BIT.island);
    mark(scene.landmarks, BIT.landmark);
    for (const t of scene.trees) {
      const i = cellOf(t);
      if (i >= 0 && treeCount[i] < 250) treeCount[i]++;
    }

    this.counts.fill(NO_VIEW);
    this.masks.fill(0);
    this.total = this.cells = this.rich = this.plain = 0;
    for (let cz = 0; cz < size; cz++) {
      for (let cx = 0; cx < size; cx++) {
        if (!paths.isConnected(cx, cz)) continue;
        let mask = 0;
        let trees = 0;
        for (const [dx, dz] of this.offsets) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
          const j = nz * size + nx;
          mask |= feat[j];
          trees += treeCount[j];
        }
        if (trees >= VIEW.groveTrees) mask |= GROVE_BIT;
        let n = 0;
        for (let b = mask; b; b >>= 1) n += b & 1;
        const i = cz * size + cx;
        this.masks[i] = mask;
        this.counts[i] = n;
        this.cells++;
        this.total += viewScore(n);
        if (n >= VIEW.rich) this.rich++;
        if (n === 0) this.plain++;
      }
    }
  }

  /** そのマスから見えるもの。つながった道でなければ null */
  kindsAt(cx: number, cz: number): ViewKind[] | null {
    if (cx < 0 || cz < 0 || cx >= this.size || cz >= this.size) return null;
    const i = cz * this.size + cx;
    if (this.counts[i] === NO_VIEW) return null;
    return VIEW_ORDER.filter((k) => this.masks[i] & BIT_OF[k]);
  }

  /** 道の平均の眺め（見える種類の数の平均）。道が無ければ 0 */
  get average(): number {
    if (this.cells === 0) return 0;
    let sum = 0;
    for (const n of this.counts) if (n !== NO_VIEW) sum += n;
    return sum / this.cells;
  }
}

/** そのマスの眺めをひとことで（道具のヒントに出す） */
export function describeView(kinds: readonly ViewKind[]): string {
  if (kinds.length === 0) return 'ここからの眺め：何も見えません。近くに池・木立・花畑・岩などを';
  const more = kinds.length >= VIEW.maxKinds ? '' : `。あと ${VIEW.maxKinds - kinds.length}種類まで増やせます`;
  return `ここからの眺め：${kinds.map((k) => VIEWS[k].name).join('・')}（${kinds.length}種類）${more}`;
}
