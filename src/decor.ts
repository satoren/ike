import type { Heightmap } from './heightmap';

/**
 * 花畑と岩（描画から独立）。
 * 生き物は集まらないが、遊歩道からの眺めに種類を足す。安いので、道のそばに少しずつ置いていける。
 */

export type DecorKind = 'flower' | 'rock';

export const DECOR: Record<DecorKind, { name: string; cost: number; counter: string }> = {
  flower: { name: '花畑', cost: 25, counter: 'か所' },
  rock: { name: '岩', cost: 40, counter: '個' },
};

export const DECOR_RULES = {
  /** ほかの花畑・岩とこれだけ離す */
  spacing: 0.9,
  /** 岩は、このくらいの深さまでなら水の中にも置ける（水面から顔を出す） */
  rockDepth: 0.3,
  max: 1500,
} as const;

export interface DecorItem {
  kind: DecorKind;
  x: number;
  z: number;
  /** 見た目のばらつき（0〜1） */
  seed: number;
}

export class Decor {
  items: DecorItem[] = [];
  private readonly map: Heightmap;
  private readonly waterLevel: number;

  constructor(map: Heightmap, waterLevel: number) {
    this.map = map;
    this.waterLevel = waterLevel;
  }

  count(kind: DecorKind): number {
    return this.items.reduce((n, d) => n + (d.kind === kind ? 1 : 0), 0);
  }

  of(kind: DecorKind): DecorItem[] {
    return this.items.filter((d) => d.kind === kind);
  }

  /** 沈まずにいられる地面の高さか */
  private standsAt(kind: DecorKind, x: number, z: number): boolean {
    const h = this.map.heightAt(x, z);
    return kind === 'rock' ? h >= this.waterLevel - DECOR_RULES.rockDepth : h >= this.waterLevel + 0.05;
  }

  /** 置けない理由（置けるなら null） */
  whyNot(kind: DecorKind, x: number, z: number, isPath: (x: number, z: number) => boolean = () => false): string | null {
    const half = this.map.worldSize / 2 - 1;
    if (Math.abs(x) > half || Math.abs(z) > half) return '地図の端には置けません';
    if (this.items.length >= DECOR_RULES.max) return 'これ以上は置けません';
    if (!this.standsAt(kind, x, z)) {
      return kind === 'rock' ? '岩は陸か、池の浅いところに置けます' : '花畑は水の中には植えられません';
    }
    if (isPath(x, z)) return '遊歩道の上には置けません（道のそばに置きます）';
    const s = DECOR_RULES.spacing;
    if (this.items.some((d) => (d.x - x) ** 2 + (d.z - z) ** 2 < s * s)) return 'ほかの花畑や岩に近すぎます';
    return null;
  }

  place(kind: DecorKind, x: number, z: number, rand: () => number = Math.random): DecorItem {
    const item: DecorItem = { kind, x, z, seed: rand() };
    this.items.push(item);
    return item;
  }

  /** 範囲の中の花畑と岩を取り除いて返す */
  removeWithin(x: number, z: number, r: number): DecorItem[] {
    const removed: DecorItem[] = [];
    this.items = this.items.filter((d) => {
      if ((d.x - x) ** 2 + (d.z - z) ** 2 > r * r) return true;
      removed.push(d);
      return false;
    });
    return removed;
  }

  /** 条件に合うものを取り除き、その数を返す（道を上に敷いたときなど） */
  removeWhere(test: (d: DecorItem) => boolean): number {
    const before = this.items.length;
    this.items = this.items.filter((d) => !test(d));
    return before - this.items.length;
  }

  /** 地形が変わって水に沈んだものを取り除き、その数を返す */
  removeDrowned(): number {
    return this.removeWhere((d) => !this.standsAt(d.kind, d.x, d.z));
  }

  snapshot(): DecorItem[] {
    return this.items.map((d) => ({ ...d }));
  }

  restore(list: DecorItem[] | undefined): void {
    this.items = (list ?? [])
      .filter((d) => (d.kind === 'flower' || d.kind === 'rock') && Number.isFinite(d.x) && Number.isFinite(d.z))
      .slice(0, DECOR_RULES.max)
      .map((d) => ({ kind: d.kind, x: d.x, z: d.z, seed: typeof d.seed === 'number' ? d.seed : 0.5 }));
  }
}
