import * as THREE from 'three';
import type { BrushResult, Heightmap } from './heightmap';

const COLOR_DEEP = new THREE.Color('#5b4a36'); // 水底の泥
const COLOR_SAND = new THREE.Color('#c9b27c'); // 岸辺の砂
const COLOR_GRASS = new THREE.Color('#5f9a3e'); // 草地
const COLOR_GRASS_DARK = new THREE.Color('#3f7a2c');
const COLOR_ROCK = new THREE.Color('#8a8578'); // 高地の岩

/** Heightmap を three.js のメッシュとして表示し、編集に合わせて更新する */
export class TerrainMesh {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly map: Heightmap;
  private readonly waterLevel: number;
  private readonly tmp = new THREE.Color();

  constructor(map: Heightmap, waterLevel: number) {
    this.map = map;
    this.waterLevel = waterLevel;

    const geometry = new THREE.PlaneGeometry(map.worldSize, map.worldSize, map.size, map.size);
    // XY 平面を XZ 平面へ。行 0 が z = -half、列 0 が x = -half になり Heightmap の添字と一致する
    geometry.rotateX(-Math.PI / 2);
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(map.verts * map.verts * 3), 3));

    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.refresh();
  }

  /** 変更された範囲だけ高さと色を書き戻す。省略時は全体 */
  refresh(region?: BrushResult): void {
    const { map } = this;
    const geo = this.mesh.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = geo.getAttribute('color') as THREE.BufferAttribute;
    const r = region ?? { minX: 0, maxX: map.size, minZ: 0, maxZ: map.size };

    for (let iz = r.minZ; iz <= r.maxZ; iz++) {
      for (let ix = r.minX; ix <= r.maxX; ix++) {
        const i = map.index(ix, iz);
        const h = map.heights[i];
        pos.setY(i, h);
        this.colorFor(h, ix, iz);
        col.setXYZ(i, this.tmp.r, this.tmp.g, this.tmp.b);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    // 16k 頂点程度なら全体の法線再計算でも十分速い
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
  }

  private colorFor(h: number, ix: number, iz: number): void {
    const w = this.waterLevel;
    const c = this.tmp;
    if (h < w - 0.4) {
      c.copy(COLOR_DEEP);
    } else if (h < w + 0.25) {
      c.copy(COLOR_DEEP).lerp(COLOR_SAND, THREE.MathUtils.smoothstep(h, w - 0.4, w + 0.05));
    } else if (h < 3.5) {
      // 格子ごとの小さなムラで単調さを消す
      const n = (Math.sin(ix * 12.9898 + iz * 78.233) * 43758.5453) % 1;
      c.copy(COLOR_SAND).lerp(COLOR_GRASS, THREE.MathUtils.smoothstep(h, w + 0.25, w + 0.7));
      c.lerp(COLOR_GRASS_DARK, Math.abs(n) * 0.35);
    } else {
      c.copy(COLOR_GRASS).lerp(COLOR_ROCK, THREE.MathUtils.smoothstep(h, 3.5, 5));
    }
  }
}
