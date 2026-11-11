import type { Heightmap } from './heightmap';
import type { Tree } from './trees';

/** 道具ごとの費用。運営ゲームとしての最低限の手応えを出すための仮の値 */
export const COSTS = {
  /** 掘る・盛る・ならすを 1 回適用するごと */
  terraform: 1,
  /** 木 1 本 */
  tree: 15,
} as const;

export interface EcoStats {
  /** 池になっている頂点の割合から求めた水面の広さ（マス数） */
  waterCells: number;
  /** 水辺（池から 4 マス以内）に生えている木の本数 */
  treesNearWater: number;
  /** 景観の魅力。来園者数の元になる */
  appeal: number;
  /** 1 日あたりの来園者数 */
  visitors: number;
}

/**
 * 池と木の配置から景観の魅力と来園者数を計算する。
 * 水辺の木ほど価値が高い、という「自然環境づくり」の核になるルールの叩き台。
 */
export function computeStats(map: Heightmap, waterLevel: number, trees: readonly Tree[]): EcoStats {
  let waterCells = 0;
  for (let iz = 0; iz < map.size; iz++) {
    for (let ix = 0; ix < map.size; ix++) {
      if (map.get(ix, iz) < waterLevel) waterCells++;
    }
  }

  let treesNearWater = 0;
  for (const t of trees) {
    if (isNearWater(map, waterLevel, t.x, t.z, 4)) treesNearWater++;
  }

  const appeal = Math.round(Math.sqrt(waterCells) * 4 + trees.length * 0.5 + treesNearWater * 2);
  const visitors = Math.floor(appeal * 0.8);
  return { waterCells, treesNearWater, appeal, visitors };
}

function isNearWater(map: Heightmap, waterLevel: number, x: number, z: number, radius: number): boolean {
  const { gx, gz } = map.toGrid(x, z);
  const r = Math.ceil(radius / map.cellSize);
  const cx = Math.round(gx);
  const cz = Math.round(gz);
  for (let dz = -r; dz <= r; dz += 2) {
    for (let dx = -r; dx <= r; dx += 2) {
      if (dx * dx + dz * dz > r * r) continue;
      if (map.get(cx + dx, cz + dz) < waterLevel) return true;
    }
  }
  return false;
}

/** 1 日の収入。来園者 1 人あたりの入園料 */
export function dailyIncome(stats: EcoStats, ticketPrice = 2): number {
  return stats.visitors * ticketPrice;
}
