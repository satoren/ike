/**
 * 地形の高さデータ。描画（three.js）から切り離した純粋なロジックで、テストしやすくしている。
 * 頂点は (size + 1) x (size + 1) の格子で、1 マスの幅は cellSize。
 */
export class Heightmap {
  readonly size: number;
  readonly cellSize: number;
  readonly heights: Float32Array;
  readonly minHeight: number;
  readonly maxHeight: number;

  constructor(size: number, cellSize = 1, minHeight = -4, maxHeight = 8) {
    this.size = size;
    this.cellSize = cellSize;
    this.minHeight = minHeight;
    this.maxHeight = maxHeight;
    this.heights = new Float32Array((size + 1) * (size + 1));
  }

  /** 頂点の一辺の数 */
  get verts(): number {
    return this.size + 1;
  }

  /** 世界全体の幅（原点中心に置く） */
  get worldSize(): number {
    return this.size * this.cellSize;
  }

  index(ix: number, iz: number): number {
    return iz * this.verts + ix;
  }

  get(ix: number, iz: number): number {
    const cx = Math.min(Math.max(ix, 0), this.size);
    const cz = Math.min(Math.max(iz, 0), this.size);
    return this.heights[this.index(cx, cz)];
  }

  set(ix: number, iz: number, h: number): void {
    this.heights[this.index(ix, iz)] = Math.min(Math.max(h, this.minHeight), this.maxHeight);
  }

  /** 世界座標 (x, z) を格子座標に変換 */
  toGrid(x: number, z: number): { gx: number; gz: number } {
    const half = this.worldSize / 2;
    return { gx: (x + half) / this.cellSize, gz: (z + half) / this.cellSize };
  }

  /** 世界座標 (x, z) の地面の高さ（双線形補間） */
  heightAt(x: number, z: number): number {
    const { gx, gz } = this.toGrid(x, z);
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const fx = gx - x0;
    const fz = gz - z0;
    const h00 = this.get(x0, z0);
    const h10 = this.get(x0 + 1, z0);
    const h01 = this.get(x0, z0 + 1);
    const h11 = this.get(x0 + 1, z0 + 1);
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
  }

  /**
   * 円形のブラシで地形を上げ下げする。amount が負なら掘る。
   * 中心ほど強く効く（滑らかな減衰）。変化があった格子範囲を返す。
   */
  applyBrush(x: number, z: number, radius: number, amount: number): BrushResult | null {
    const { gx, gz } = this.toGrid(x, z);
    const r = radius / this.cellSize;
    const minX = Math.max(0, Math.floor(gx - r));
    const maxX = Math.min(this.size, Math.ceil(gx + r));
    const minZ = Math.max(0, Math.floor(gz - r));
    const maxZ = Math.min(this.size, Math.ceil(gz + r));
    if (minX > maxX || minZ > maxZ) return null;

    let changed = false;
    for (let iz = minZ; iz <= maxZ; iz++) {
      for (let ix = minX; ix <= maxX; ix++) {
        const d = Math.hypot(ix - gx, iz - gz) / r;
        if (d >= 1) continue;
        const falloff = 0.5 * (1 + Math.cos(Math.PI * d)); // 1 → 0 の滑らかな山
        const before = this.get(ix, iz);
        this.set(ix, iz, before + amount * falloff);
        if (this.get(ix, iz) !== before) changed = true;
      }
    }
    return changed ? { minX, maxX, minZ, maxZ } : null;
  }

  /** 周りとの平均に近づけて地形をならす */
  smooth(x: number, z: number, radius: number, strength: number): BrushResult | null {
    const { gx, gz } = this.toGrid(x, z);
    const r = radius / this.cellSize;
    const minX = Math.max(0, Math.floor(gx - r));
    const maxX = Math.min(this.size, Math.ceil(gx + r));
    const minZ = Math.max(0, Math.floor(gz - r));
    const maxZ = Math.min(this.size, Math.ceil(gz + r));
    if (minX > maxX || minZ > maxZ) return null;

    const copy = this.heights.slice();
    const at = (ix: number, iz: number) =>
      copy[this.index(Math.min(Math.max(ix, 0), this.size), Math.min(Math.max(iz, 0), this.size))];
    for (let iz = minZ; iz <= maxZ; iz++) {
      for (let ix = minX; ix <= maxX; ix++) {
        const d = Math.hypot(ix - gx, iz - gz) / r;
        if (d >= 1) continue;
        const avg = (at(ix - 1, iz) + at(ix + 1, iz) + at(ix, iz - 1) + at(ix, iz + 1)) / 4;
        const t = strength * (1 - d);
        this.set(ix, iz, at(ix, iz) * (1 - t) + avg * t);
      }
    }
    return { minX, maxX, minZ, maxZ };
  }
}

export interface BrushResult {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** 決まった seed から再現できる、なだらかな初期地形を作る */
export function generateGentleTerrain(map: Heightmap, seed = 1, base = 1.5): void {
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  // 低周波のうねりをいくつか重ねる（サイン波の合成）
  const waves = Array.from({ length: 6 }, (_, i) => ({
    fx: (rand() * 2 - 1) * (0.02 + i * 0.015),
    fz: (rand() * 2 - 1) * (0.02 + i * 0.015),
    phase: rand() * Math.PI * 2,
    amp: 0.9 / (i + 1),
  }));
  for (let iz = 0; iz <= map.size; iz++) {
    for (let ix = 0; ix <= map.size; ix++) {
      let h = base;
      for (const w of waves) h += w.amp * Math.sin(ix * w.fx * Math.PI * 2 + iz * w.fz * Math.PI * 2 + w.phase);
      map.set(ix, iz, h);
    }
  }
}
