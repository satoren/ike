import type { Heightmap } from './heightmap';
import type { PathGrid } from './paths';
import { t } from './i18n';

/**
 * 遊歩道沿いに建てる施設。園のランクが上がると解放される。
 * - 休憩所：客がひと息つけて魅力が上がる（来園者が多いほど多く建てる意味がある）
 * - 売店：来園者数に応じて毎日売り上げが入る
 * - 展望台：まわりの池と水辺の木が広いほど魅力が上がる
 * 大きな買い物（貯めたお金の使い道）
 * - 水車小屋：水ぎわにだけ建てられ、魅力が大きく上がる
 * - 自然館：図鑑の評判が 2倍になる（園に 1軒）
 * - 大ケヤキ：園のシンボル。魅力がとても大きく上がる（園に 1本）
 */
export type FacilityKind = 'rest' | 'shop' | 'tower' | 'mill' | 'center' | 'bigtree';

export const FACILITY_ORDER: FacilityKind[] = ['rest', 'shop', 'tower', 'mill', 'center', 'bigtree'];

/** 遊歩道からの眺めで「名所」になる施設 */
export const LANDMARK_KINDS: readonly FacilityKind[] = ['tower', 'mill', 'center', 'bigtree'];

export interface FacilityInfo {
  name: string;
  cost: number;
  hint: string;
  /** 園に建てられる数の上限（無ければいくつでも） */
  limit?: number;
  /** 水ぎわにしか建てられない */
  waterside?: boolean;
}

export const FACILITIES: Record<FacilityKind, FacilityInfo> = {
  rest: { name: t('休憩所'), cost: 300, hint: t('客がひと息つけて魅力が上がります。来園者 80人ごとに 1軒まで効きます') },
  shop: { name: t('売店'), cost: 600, hint: t('来園者 1人あたり 2G の売り上げが毎日入ります。1軒で 150人まで相手できます') },
  tower: { name: t('展望台'), cost: 1200, hint: t('まわりの池と木が広いほど魅力が上がります。池を見渡せる場所に建てましょう') },
  mill: {
    name: t('水車小屋'),
    cost: 3000,
    hint: t('水ぎわに建てます。水車の回る景色で魅力が大きく上がります。来園者 200人ごとに 1軒まで効きます'),
    waterside: true,
  },
  center: {
    name: t('自然館'),
    cost: 8000,
    hint: t('図鑑の評判が 2倍になります（生き物 1種につき来園者 +2%）。園に 1軒だけ建てられます'),
    limit: 1,
  },
  bigtree: {
    name: t('大ケヤキ'),
    cost: 20000,
    hint: t('園のシンボルになる大木です。魅力がとても大きく上がります。園に 1本だけ植えられます'),
    limit: 1,
  },
};

export const FACILITY = {
  /** 遊歩道からこの距離（ワールド単位）以内に建てる */
  pathReach: 2.6,
  /** ほかの施設とこれだけ離す */
  spacing: 3,
  /** 撤去したときに戻る割合 */
  refund: 0.5,
  restAppeal: 14,
  restPerVisitors: 80,
  shopPerVisitor: 2,
  shopPerVisitors: 150,
  shopAppeal: 4,
  /** 展望台から見渡せる半径（ワールド単位） */
  towerRadius: 14,
  towerMax: 90,
  millAppeal: 60,
  millPerVisitors: 200,
  /** 水車小屋は、水からこの距離（ワールド単位）以内に建てる */
  millReach: 2.5,
  /** 自然館があるときの、図鑑の評判の倍率 */
  centerDexBoost: 2,
  bigtreeAppeal: 200,
} as const;

export interface Facility {
  id: number;
  kind: FacilityKind;
  x: number;
  z: number;
  /** 展望台の景色の良さ（建てたときと地形が変わったときに数え直す） */
  view?: number;
  /** 建物の向き（ラジアン）。水車小屋は水のほうを向く */
  angle?: number;
}

/** 来園者の数に見合うだけ効く数 */
function effective(count: number, visitors: number, per: number): number {
  return Math.min(count, 1 + Math.floor(visitors / per));
}

export class Facilities {
  facilities: Facility[] = [];
  private nextId = 1;
  private readonly map: Heightmap;
  private readonly waterLevel: number;

  constructor(map: Heightmap, waterLevel: number) {
    this.map = map;
    this.waterLevel = waterLevel;
  }

  count(kind: FacilityKind): number {
    return this.facilities.filter((f) => f.kind === kind).length;
  }

  counts(): Record<FacilityKind, number> {
    const out = {} as Record<FacilityKind, number>;
    for (const kind of FACILITY_ORDER) out[kind] = this.count(kind);
    return out;
  }

  /** 建てられない理由（建てられるなら null）。kind を渡すと、その施設だけの決まりも調べる */
  whyNot(x: number, z: number, paths: PathGrid, kind?: FacilityKind): string | null {
    const info = kind ? FACILITIES[kind] : undefined;
    if (info?.limit !== undefined && this.count(kind!) >= info.limit) {
      return t('{0}は園に {1}つだけです（「撤去」で取り壊すと建て直せます）', info.name, info.limit);
    }
    const half = this.map.worldSize / 2 - 1.5;
    if (Math.abs(x) > half || Math.abs(z) > half) return t('地図の端には建てられません');
    if (this.map.heightAt(x, z) < this.waterLevel + 0.05) return t('水の中には建てられません');
    if (paths.isPathAt(x, z)) return t('遊歩道の上には建てられません（道のすぐ横に建てます）');
    if (this.facilities.some((f) => Math.hypot(f.x - x, f.z - z) < FACILITY.spacing)) return t('ほかの施設に近すぎます');
    if (!this.nearConnectedPath(x, z, paths)) return t('出入口につながった遊歩道のすぐ横に建ててください');
    if (info?.waterside && this.towardWater(x, z) === null) return t('{0}は水ぎわに建ててください', info.name);
    return null;
  }

  /** いちばん近い水の方角（ラジアン、+x が 0）。millReach 以内に水が無ければ null */
  towardWater(x: number, z: number): number | null {
    const { gx, gz } = this.map.toGrid(x, z);
    const r = FACILITY.millReach / this.map.cellSize;
    let best = Infinity;
    let angle: number | null = null;
    for (let cz = Math.floor(gz - r); cz <= Math.ceil(gz + r); cz++) {
      for (let cx = Math.floor(gx - r); cx <= Math.ceil(gx + r); cx++) {
        const d = Math.hypot(cx - gx, cz - gz);
        if (d > r || d >= best) continue;
        if (this.map.get(cx, cz) >= this.waterLevel) continue;
        best = d;
        angle = Math.atan2(cz - gz, cx - gx);
      }
    }
    return angle;
  }

  private nearConnectedPath(x: number, z: number, paths: PathGrid): boolean {
    const { gx, gz } = this.map.toGrid(x, z);
    const r = FACILITY.pathReach / this.map.cellSize;
    for (let cz = Math.floor(gz - r); cz <= Math.ceil(gz + r); cz++) {
      for (let cx = Math.floor(gx - r); cx <= Math.ceil(gx + r); cx++) {
        if (Math.hypot(cx + 0.5 - gx, cz + 0.5 - gz) > r) continue;
        if (paths.isConnected(cx, cz)) return true;
      }
    }
    return false;
  }

  build(kind: FacilityKind, x: number, z: number, trees: readonly { x: number; z: number }[] = []): Facility {
    const f: Facility = { id: this.nextId++, kind, x, z };
    if (kind === 'tower') f.view = this.viewAt(x, z, trees);
    if (kind === 'mill') f.angle = this.towardWater(x, z) ?? 0;
    this.facilities.push(f);
    return f;
  }

  /** 近くの施設を撤去して返す */
  removeNear(x: number, z: number, r = 1.8): Facility | null {
    let best = -1;
    let bestD = r;
    this.facilities.forEach((f, i) => {
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best >= 0 ? this.facilities.splice(best, 1)[0] : null;
  }

  /** 地形が変わって水に沈んだ施設を取り除き、その数を返す */
  removeDrowned(): number {
    const before = this.facilities.length;
    this.facilities = this.facilities.filter((f) => this.map.heightAt(f.x, f.z) >= this.waterLevel);
    return before - this.facilities.length;
  }

  /** 見渡せる範囲の池のマス数をもとにした景色の良さ */
  viewAt(x: number, z: number, trees: readonly { x: number; z: number }[] = []): number {
    const { gx, gz } = this.map.toGrid(x, z);
    const r = Math.ceil(FACILITY.towerRadius / this.map.cellSize);
    let water = 0;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r) continue;
        if (this.map.get(Math.round(gx) + dx, Math.round(gz) + dz) < this.waterLevel) water++;
      }
    }
    const near = trees.filter((t) => Math.hypot(t.x - x, t.z - z) < FACILITY.towerRadius).length;
    return Math.min(FACILITY.towerMax, Math.round(water * 0.12 + near * 0.6));
  }

  /** 木の数も入れて展望台の景色を数え直す（木は植えるたびに変わるので、時々呼ぶ） */
  refreshViews(trees: readonly { x: number; z: number }[]): void {
    for (const f of this.facilities) {
      if (f.kind === 'tower') f.view = this.viewAt(f.x, f.z, trees);
      if (f.kind === 'mill') f.angle = this.towardWater(f.x, f.z) ?? f.angle;
    }
  }

  /** 施設による魅力の上乗せ */
  appealBonus(visitors: number): number {
    const rest = effective(this.count('rest'), visitors, FACILITY.restPerVisitors) * FACILITY.restAppeal;
    const shop = effective(this.count('shop'), visitors, FACILITY.shopPerVisitors) * FACILITY.shopAppeal;
    const tower = this.facilities.reduce((s, f) => s + (f.kind === 'tower' ? f.view ?? 0 : 0), 0);
    // 水車は水が無いと回らない（あとから池を埋めた水車小屋は数えない）
    const turning = this.facilities.filter((f) => f.kind === 'mill' && this.towardWater(f.x, f.z) !== null).length;
    const mill = effective(turning, visitors, FACILITY.millPerVisitors) * FACILITY.millAppeal;
    const bigtree = Math.min(1, this.count('bigtree')) * FACILITY.bigtreeAppeal;
    return rest + shop + tower + mill + bigtree;
  }

  /** 図鑑の評判（1種ごとの来園者の増え方）に掛かる倍率。自然館があると上がる */
  get dexBoost(): number {
    return this.count('center') > 0 ? FACILITY.centerDexBoost : 1;
  }

  /** 売店の 1日の売り上げ。1軒で来園者 150人まで相手できる */
  shopIncome(visitors: number): number {
    return Math.min(visitors, this.count('shop') * FACILITY.shopPerVisitors) * FACILITY.shopPerVisitor;
  }

  restore(list: Facility[] | undefined): void {
    this.facilities = (list ?? []).map((f) => ({ ...f }));
    this.nextId = this.facilities.reduce((m, f) => Math.max(m, f.id), 0) + 1;
  }
}
