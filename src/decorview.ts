import * as THREE from 'three';
import type { Heightmap } from './heightmap';
import type { DecorItem } from './decor';
import { DECOR_RULES } from './decor';
import type { Season } from './seasons';

/** 花畑 1か所に咲く花の数 */
const BLOSSOMS = 8;

/** 季節ごとの花の色（春は桜草、夏はひまわりと桔梗、秋はコスモス、冬は水仙のつもり） */
const PALETTE: Record<Season, string[]> = {
  spring: ['#f7a1c0', '#fbd3e0', '#f27fa6', '#fff4f7', '#f9e27a'],
  summer: ['#f6c945', '#f39a2e', '#5f8fe3', '#ffffff', '#f6c945'],
  autumn: ['#de5c92', '#b765c7', '#f4acc8', '#ea6a52', '#ffffff'],
  winter: ['#ffffff', '#f6f1c4', '#eaf0f8', '#ffffff', '#f3d86a'],
};

/** 場所ごとに決まった乱数（同じ花畑はいつも同じ形になる） */
function noise(seed: number, k: number): number {
  const v = Math.sin((seed * 977 + k) * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

/** 花畑と岩を描く。InstancedMesh なので、たくさん置いても描画呼び出しは 4回だけ */
export class DecorView {
  readonly group = new THREE.Group();
  private readonly mounds: THREE.InstancedMesh;
  private readonly blossoms: THREE.InstancedMesh;
  private readonly rocks: THREE.InstancedMesh;
  private readonly pebbles: THREE.InstancedMesh;
  private readonly map: Heightmap;
  private readonly waterLevel: number;
  private season: Season = 'spring';
  private items: readonly DecorItem[] = [];

  constructor(map: Heightmap, waterLevel: number) {
    this.map = map;
    this.waterLevel = waterLevel;
    const max = DECOR_RULES.max;

    const moundGeo = new THREE.SphereGeometry(0.44, 10, 6);
    moundGeo.scale(1, 0.3, 1);
    this.mounds = new THREE.InstancedMesh(moundGeo, new THREE.MeshStandardMaterial({ color: '#6f9f52', roughness: 1 }), max);

    const blossomGeo = new THREE.SphereGeometry(0.085, 7, 5);
    blossomGeo.scale(1, 0.7, 1);
    this.blossoms = new THREE.InstancedMesh(
      blossomGeo,
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }),
      max * BLOSSOMS,
    );

    const rockMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true });
    this.rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.42, 0), rockMat, max);
    this.pebbles = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.2, 0), rockMat, max);

    for (const mesh of [this.mounds, this.blossoms, this.rocks, this.pebbles]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this.rocks.castShadow = true;
  }

  /** 季節が変わったら花の色を変える */
  setSeason(season: Season): void {
    if (season === this.season) return;
    this.season = season;
    this.rebuild(this.items);
  }

  /** 置いてあるものや地形が変わったら作り直す */
  rebuild(items: readonly DecorItem[]): void {
    this.items = items;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const e = new THREE.Euler();
    const c = new THREE.Color();
    const palette = PALETTE[this.season];
    let nm = 0;
    let nb = 0;
    let nr = 0;
    for (const d of items) {
      const ground = this.map.heightAt(d.x, d.z);
      if (d.kind === 'flower') {
        p.set(d.x, ground + 0.02, d.z);
        s.setScalar(0.9 + noise(d.seed, 1) * 0.3);
        m.compose(p, q.identity(), s);
        this.mounds.setMatrixAt(nm, m);
        this.mounds.setColorAt(nm, c.setHSL(0.27 + noise(d.seed, 2) * 0.06, 0.4, this.season === 'winter' ? 0.5 : 0.4));
        nm++;
        for (let k = 0; k < BLOSSOMS; k++) {
          const a = (k / BLOSSOMS) * Math.PI * 2 + noise(d.seed, 10 + k) * 0.9;
          const r = k === 0 ? 0 : 0.14 + noise(d.seed, 20 + k) * 0.22;
          const bx = d.x + Math.cos(a) * r;
          const bz = d.z + Math.sin(a) * r;
          p.set(bx, this.map.heightAt(bx, bz) + 0.13 + noise(d.seed, 30 + k) * 0.07 - r * 0.12, bz);
          s.setScalar(0.8 + noise(d.seed, 40 + k) * 0.5);
          m.compose(p, q.identity(), s);
          this.blossoms.setMatrixAt(nb, m);
          this.blossoms.setColorAt(nb, c.set(palette[Math.floor(noise(d.seed, 50 + k) * palette.length) % palette.length]));
          nb++;
        }
      } else {
        const size = 0.8 + noise(d.seed, 1) * 0.6;
        // 水の中の岩は、水面から顔を出す高さに据える
        const base = Math.max(ground, this.waterLevel - 0.12);
        e.set(noise(d.seed, 2) * 0.6, noise(d.seed, 3) * Math.PI * 2, noise(d.seed, 4) * 0.6);
        q.setFromEuler(e);
        p.set(d.x, base + 0.14 * size, d.z);
        s.set(size * (0.9 + noise(d.seed, 5) * 0.4), size * (0.6 + noise(d.seed, 6) * 0.3), size);
        m.compose(p, q, s);
        this.rocks.setMatrixAt(nr, m);
        const grey = 0.5 + noise(d.seed, 7) * 0.12;
        this.rocks.setColorAt(nr, c.setRGB(grey, grey * 0.98, grey * 0.94));
        // そばに小さな石をひとつ
        const a = noise(d.seed, 8) * Math.PI * 2;
        const px = d.x + Math.cos(a) * 0.42 * size;
        const pz = d.z + Math.sin(a) * 0.42 * size;
        p.set(px, Math.max(this.map.heightAt(px, pz), this.waterLevel - 0.1) + 0.06, pz);
        e.set(noise(d.seed, 9) * 3, noise(d.seed, 10) * 3, 0);
        s.setScalar(0.7 + noise(d.seed, 11) * 0.6);
        m.compose(p, q.setFromEuler(e), s);
        this.pebbles.setMatrixAt(nr, m);
        this.pebbles.setColorAt(nr, c.setRGB(grey + 0.06, grey + 0.05, grey + 0.02));
        nr++;
      }
    }
    this.mounds.count = nm;
    this.blossoms.count = nb;
    this.rocks.count = this.pebbles.count = nr;
    for (const mesh of [this.mounds, this.blossoms, this.rocks, this.pebbles]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
