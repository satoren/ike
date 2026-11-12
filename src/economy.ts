import type { Heightmap } from './heightmap';
import type { Habitat } from './ecology';

/** 道具ごとの費用。運営ゲームとしての最低限の手応えを出すための仮の値 */
export const COSTS = {
  /** 掘る・盛る・ならすを 1 回適用するごと */
  terraform: 1,
  /** 木 1 本 */
  tree: 15,
} as const;

/** 地形と木の配置から、生き物のすみかとしての状態を数える */
export function computeHabitat(
  map: Heightmap,
  waterLevel: number,
  trees: readonly { x: number; z: number }[],
): Habitat {
  let waterCells = 0;
  let deepCells = 0;
  for (let iz = 0; iz < map.size; iz++) {
    for (let ix = 0; ix < map.size; ix++) {
      const h = map.get(ix, iz);
      if (h < waterLevel) waterCells++;
      if (h < waterLevel - 0.5) deepCells++;
    }
  }

  let treesNearWater = 0;
  for (const t of trees) {
    if (isNearWater(map, waterLevel, t.x, t.z, 4)) treesNearWater++;
  }

  return { waterCells, deepCells, trees: trees.length, treesNearWater };
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
