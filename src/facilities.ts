import type { Heightmap } from './heightmap';
import type { PathGrid } from './paths';

/**
 * 遊歩道沿いに建てる施設。園のランクが上がると解放される。
 * - 休憩所：客がひと息つけて魅力が上がる（来園者が多いほど多く建てる意味がある）
 * - 売店：来園者数に応じて毎日売り上げが入る
 * - 展望台：まわりの池と水辺の木が広いほど魅力が上がる
 */
export type FacilityKind = 'rest' | 'shop' | 'tower';

export const FACILITY_ORDER: FacilityKind[] = ['rest', 'shop', 'tower'];

export const FACILITIES: Record<FacilityKind, { name: string; cost: number; hint: string }> = {
  rest: { name: '休憩所', cost: 300, hint: '客がひと息つけて魅力が上がります。来園者 80人ごとに 1軒まで効きます' },
  shop: { name: '売店', cost: 600, hint: '来園者 1人あたり 2G の売り上げが毎日入ります。1軒で 150人まで相手できます' },
  tower: { name: '展望台', cost: 1200, hint: 'まわりの池と木が広いほど魅力が上がります。池を見渡せる場所に建てましょう' },
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
} as const;

export interface Facility {
  id: number;
  kind: FacilityKind;
  x: number;
  z: number;
  /** 展望台の景色の良さ（建てたときと地形が変わったときに数え直す） */
  view?: number;
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
    return { rest: this.count('rest'), shop: this.count('shop'), tower: this.count('tower') };
  }

  /** 建てられない理由（建てられるなら null） */
  whyNot(x: number, z: number, paths: PathGrid): string | null {
    const half = this.map.worldSize / 2 - 1.5;
    if (Math.abs(x) > half || Math.abs(z) > half) return '地図の端には建てられません';
    if (this.map.heightAt(x, z) < this.waterLevel + 0.05) return '水の中には建てられません';
    if (paths.isPathAt(x, z)) return '遊歩道の上には建てられません（道のすぐ横に建てます）';
    if (this.facilities.some((f) => Math.hypot(f.x - x, f.z - z) < FACILITY.spacing)) return 'ほかの施設に近すぎます';
    if (!this.nearConnectedPath(x, z, paths)) return '出入口につながった遊歩道のすぐ横に建ててください';
    return null;
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
    for (const f of this.facilities) if (f.kind === 'tower') f.view = this.viewAt(f.x, f.z, trees);
  }

  /** 施設による魅力の上乗せ */
  appealBonus(visitors: number): number {
    const rest = effective(this.count('rest'), visitors, FACILITY.restPerVisitors) * FACILITY.restAppeal;
    const shop = effective(this.count('shop'), visitors, FACILITY.shopPerVisitors) * FACILITY.shopAppeal;
    const tower = this.facilities.reduce((s, f) => s + (f.kind === 'tower' ? f.view ?? 0 : 0), 0);
    return rest + shop + tower;
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
