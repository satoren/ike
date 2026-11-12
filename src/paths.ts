import * as THREE from 'three';
import type { Heightmap } from './heightmap';

/**
 * 柵付きの遊歩道。来園者はこの上を歩けば安全で、キツネは柵の中に入れない。
 * 池の上に敷くと木道になる。マス単位（Heightmap の 1 マス）で管理する。
 */
export class PathGrid {
  readonly size: number;
  readonly cells: Uint8Array;
  private readonly map: Heightmap;
  private _count = 0;

  constructor(map: Heightmap) {
    this.map = map;
    this.size = map.size;
    this.cells = new Uint8Array(map.size * map.size);
  }

  get count(): number {
    return this._count;
  }

  private cellOf(x: number, z: number): { cx: number; cz: number } | null {
    const { gx, gz } = this.map.toGrid(x, z);
    const cx = Math.floor(gx);
    const cz = Math.floor(gz);
    if (cx < 0 || cz < 0 || cx >= this.size || cz >= this.size) return null;
    return { cx, cz };
  }

  has(cx: number, cz: number): boolean {
    if (cx < 0 || cz < 0 || cx >= this.size || cz >= this.size) return false;
    return this.cells[cz * this.size + cx] === 1;
  }

  /** 世界座標の地点が遊歩道の上か */
  isPathAt(x: number, z: number): boolean {
    const c = this.cellOf(x, z);
    return c ? this.has(c.cx, c.cz) : false;
  }

  /** 地点を中心に半径内のマスに道を敷く（remove なら撤去）。変わったマス数を返す */
  paint(x: number, z: number, radius: number, remove = false): number {
    const { gx, gz } = this.map.toGrid(x, z);
    const r = radius / this.map.cellSize;
    let changed = 0;
    for (let cz = Math.floor(gz - r); cz <= Math.ceil(gz + r); cz++) {
      for (let cx = Math.floor(gx - r); cx <= Math.ceil(gx + r); cx++) {
        if (cx < 0 || cz < 0 || cx >= this.size || cz >= this.size) continue;
        if (Math.hypot(cx + 0.5 - gx, cz + 0.5 - gz) > r) continue;
        const i = cz * this.size + cx;
        const v = remove ? 0 : 1;
        if (this.cells[i] === v) continue;
        this.cells[i] = v;
        this._count += remove ? -1 : 1;
        changed++;
      }
    }
    return changed;
  }

  /** マスの中心の世界座標 */
  center(cx: number, cz: number): { x: number; z: number } {
    const half = this.map.worldSize / 2;
    const cs = this.map.cellSize;
    return { x: (cx + 0.5) * cs - half, z: (cz + 0.5) * cs - half };
  }

  /**
   * 道からの眺めの良さ。水辺や木道のマスほど高い。
   * 魅力の計算に使う。
   */
  scenicValue(waterLevel: number): number {
    let v = 0;
    for (let cz = 0; cz < this.size; cz++) {
      for (let cx = 0; cx < this.size; cx++) {
        if (!this.has(cx, cz)) continue;
        v += this.nearWater(cx, cz, waterLevel) ? 0.6 : 0.15;
      }
    }
    return v;
  }

  private nearWater(cx: number, cz: number, waterLevel: number): boolean {
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (this.map.get(cx + dx, cz + dz) < waterLevel) return true;
      }
    }
    return false;
  }
}

/** 遊歩道の安全さ */
export const SAFETY = {
  /** 道 1 マスで安全に案内できる来園者数 */
  visitorsPerCell: 3,
  /** 安全度 0 のとき魅力が何割下がるか */
  unsafePenalty: 0.25,
  /** 道 1 マスの費用 */
  cost: 3,
} as const;

/** 来園者のうち、遊歩道で安全に回れる割合（0〜1） */
export function safety(pathCells: number, visitors: number): number {
  if (visitors <= 0) return 1;
  return Math.min(1, (pathCells * SAFETY.visitorsPerCell) / visitors);
}

const PLANK = new THREE.Color('#c9a777');
const BOARDWALK = new THREE.Color('#a8794b');

/** 遊歩道を描く。板の床と、外周に柵の杭を立てる */
export class PathView {
  readonly group = new THREE.Group();
  private readonly floor: THREE.InstancedMesh;
  private readonly posts: THREE.InstancedMesh;
  private readonly rails: THREE.InstancedMesh;
  private readonly grid: PathGrid;
  private readonly map: Heightmap;
  private readonly waterLevel: number;

  constructor(grid: PathGrid, map: Heightmap, waterLevel: number) {
    this.grid = grid;
    this.map = map;
    this.waterLevel = waterLevel;
    const max = grid.size * grid.size;
    const floorGeo = new THREE.BoxGeometry(map.cellSize * 1.001, 0.08, map.cellSize * 1.001);
    this.floor = new THREE.InstancedMesh(floorGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), max);
    const postGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.42, 5);
    postGeo.translate(0, 0.21, 0);
    this.posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: '#7a5634' }), max);
    const railGeo = new THREE.BoxGeometry(map.cellSize, 0.04, 0.04);
    railGeo.translate(0, 0.36, 0);
    this.rails = new THREE.InstancedMesh(railGeo, new THREE.MeshStandardMaterial({ color: '#8a6440' }), max * 2);
    for (const m of [this.floor, this.posts, this.rails]) {
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }
  }

  /** 道の床の高さ。池の上では水面より少し上の木道になる */
  floorY(x: number, z: number): number {
    return Math.max(this.map.heightAt(x, z), this.waterLevel + 0.06) + 0.04;
  }

  rebuild(): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const qRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const one = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    const half = this.map.cellSize / 2;
    let nf = 0;
    let np = 0;
    let nr = 0;
    for (let cz = 0; cz < this.grid.size; cz++) {
      for (let cx = 0; cx < this.grid.size; cx++) {
        if (!this.grid.has(cx, cz)) continue;
        const { x, z } = this.grid.center(cx, cz);
        const y = this.floorY(x, z);
        p.set(x, y - 0.04, z);
        m.compose(p, q, one);
        this.floor.setMatrixAt(nf, m);
        this.floor.setColorAt(nf, this.map.heightAt(x, z) < this.waterLevel ? BOARDWALK : PLANK);
        nf++;
        // 隣が道でない辺に柵を立てる
        const edges: [number, number, number, number, boolean][] = [
          [1, 0, half, 0, true],
          [-1, 0, -half, 0, true],
          [0, 1, 0, half, false],
          [0, -1, 0, -half, false],
        ];
        for (const [dx, dz, ox, oz, alongZ] of edges) {
          if (this.grid.has(cx + dx, cz + dz)) continue;
          p.set(x + ox, y, z + oz);
          m.compose(p, alongZ ? qRot : q, one);
          this.rails.setMatrixAt(nr++, m);
          // 杭は辺の端に。重なっても見た目は変わらないので簡単に置く
          const px = alongZ ? x + ox : x + ox - half;
          const pz = alongZ ? z + oz - half : z + oz;
          p.set(px, y, pz);
          m.compose(p, q, one);
          this.posts.setMatrixAt(np++, m);
        }
      }
    }
    this.floor.count = nf;
    this.posts.count = np;
    this.rails.count = nr;
    for (const mesh of [this.floor, this.posts, this.rails]) mesh.instanceMatrix.needsUpdate = true;
    if (this.floor.instanceColor) this.floor.instanceColor.needsUpdate = true;
  }
}

/** 遊歩道の上を歩く来園者の姿（見た目だけ） */
export class Strollers {
  readonly group = new THREE.Group();
  private readonly bodies: THREE.InstancedMesh;
  private readonly heads: THREE.InstancedMesh;
  private walkers: { cx: number; cz: number; tx: number; tz: number; t: number; speed: number }[] = [];
  private readonly grid: PathGrid;
  private readonly view: PathView;
  private readonly max = 80;

  constructor(grid: PathGrid, view: PathView) {
    this.grid = grid;
    this.view = view;
    const body = new THREE.CapsuleGeometry(0.09, 0.22, 2, 6);
    body.translate(0, 0.2, 0);
    const head = new THREE.SphereGeometry(0.08, 8, 6);
    head.translate(0, 0.46, 0);
    this.bodies = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.8 }), this.max);
    this.heads = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ color: '#f1cfae' }), this.max);
    const colors = ['#e05a47', '#3d7fc4', '#f2b134', '#6bb36b', '#9b6cc6', '#ffffff'];
    for (let i = 0; i < this.max; i++) this.bodies.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    for (const m of [this.bodies, this.heads]) {
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      this.group.add(m);
    }
  }

  update(dt: number, visitors: number): void {
    const want = Math.min(this.max, Math.ceil(visitors / 6), this.grid.count);
    // 道が消えた場所の人は退場させる
    this.walkers = this.walkers.filter((w) => this.grid.has(w.cx, w.cz) && this.grid.has(w.tx, w.tz));
    while (this.walkers.length < want) {
      const start = this.randomCell();
      if (!start) break;
      this.walkers.push({ cx: start[0], cz: start[1], tx: start[0], tz: start[1], t: 1, speed: 0.8 + Math.random() * 0.6 });
    }
    if (this.walkers.length > want) this.walkers.length = want;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    this.walkers.forEach((w, i) => {
      w.t += dt * w.speed;
      if (w.t >= 1) {
        // 隣の道のマスへ進む（来た道はなるべく戻らない）
        const options: [number, number][] = [];
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = w.tx + dx;
          const nz = w.tz + dz;
          if (this.grid.has(nx, nz) && !(nx === w.cx && nz === w.cz)) options.push([nx, nz]);
        }
        if (options.length === 0 && this.grid.has(w.cx, w.cz) && (w.cx !== w.tx || w.cz !== w.tz)) options.push([w.cx, w.cz]);
        w.cx = w.tx;
        w.cz = w.tz;
        if (options.length > 0) [w.tx, w.tz] = options[Math.floor(Math.random() * options.length)];
        w.t = 0;
      }
      const a = this.grid.center(w.cx, w.cz);
      const b = this.grid.center(w.tx, w.tz);
      const x = a.x + (b.x - a.x) * w.t;
      const z = a.z + (b.z - a.z) * w.t;
      p.set(x, this.view.floorY(x, z), z);
      m.compose(p, q, one);
      this.bodies.setMatrixAt(i, m);
      this.heads.setMatrixAt(i, m);
    });
    this.bodies.count = this.heads.count = this.walkers.length;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
  }

  private randomCell(): [number, number] | null {
    if (this.grid.count === 0) return null;
    for (let i = 0; i < 200; i++) {
      const cx = Math.floor(Math.random() * this.grid.size);
      const cz = Math.floor(Math.random() * this.grid.size);
      if (this.grid.has(cx, cz)) return [cx, cz];
    }
    // 道が少ないときは総当たり
    for (let cz = 0; cz < this.grid.size; cz++) for (let cx = 0; cx < this.grid.size; cx++) if (this.grid.has(cx, cz)) return [cx, cz];
    return null;
  }
}
