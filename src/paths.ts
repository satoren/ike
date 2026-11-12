import * as THREE from 'three';
import type { Heightmap } from './heightmap';

/**
 * 柵付きの遊歩道。来園者はこの上を歩けば安全で、キツネは柵の中に入れない。
 * 池の上に敷くと木道になる。マス単位（Heightmap の 1 マス）で管理する。
 *
 * 来園者は地図の端にある出入口から入って帰る。出入口とつながっている道だけが役に立つ。
 */
export class PathGrid {
  readonly size: number;
  readonly cells: Uint8Array;
  /** 出入口のマス（撤去できない） */
  readonly entrance: [number, number][];
  /** 出入口からの歩数。つながっていないマスは -1 */
  readonly distance: Int32Array;
  private readonly map: Heightmap;
  private _count = 0;
  private _connected = 0;

  constructor(map: Heightmap) {
    this.map = map;
    this.size = map.size;
    this.cells = new Uint8Array(map.size * map.size);
    this.distance = new Int32Array(map.size * map.size).fill(-1);
    // 南端（画面の手前側）の中央に、幅 2 マスの出入口を置く
    const mid = Math.floor(map.size / 2);
    const edge = map.size - 1;
    this.entrance = [
      [mid - 1, edge],
      [mid, edge],
    ];
    // 出入口から少しだけ道を伸ばしておく
    for (let cz = edge; cz > edge - 5; cz--) {
      for (const [cx] of this.entrance) this.setCell(cx, cz, 1);
    }
    this.updateConnectivity();
  }

  /** 敷いてある道のマス数 */
  get count(): number {
    return this._count;
  }

  /** 出入口とつながっている道のマス数 */
  get connectedCount(): number {
    return this._connected;
  }

  isEntrance(cx: number, cz: number): boolean {
    return this.entrance.some(([x, z]) => x === cx && z === cz);
  }

  isConnected(cx: number, cz: number): boolean {
    if (cx < 0 || cz < 0 || cx >= this.size || cz >= this.size) return false;
    return this.distance[cz * this.size + cx] >= 0;
  }

  distanceAt(cx: number, cz: number): number {
    if (cx < 0 || cz < 0 || cx >= this.size || cz >= this.size) return -1;
    return this.distance[cz * this.size + cx];
  }

  private setCell(cx: number, cz: number, v: 0 | 1): boolean {
    const i = cz * this.size + cx;
    if (this.cells[i] === v) return false;
    this.cells[i] = v;
    this._count += v ? 1 : -1;
    return true;
  }

  /** 出入口から道をたどって、つながっているマスと歩数を求め直す */
  updateConnectivity(): void {
    this.distance.fill(-1);
    const queue: number[] = [];
    for (const [cx, cz] of this.entrance) {
      const i = cz * this.size + cx;
      if (this.cells[i]) {
        this.distance[i] = 0;
        queue.push(i);
      }
    }
    let n = 0;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      n++;
      const cx = i % this.size;
      const cz = (i - cx) / this.size;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= this.size || nz >= this.size) continue;
        const j = nz * this.size + nx;
        if (!this.cells[j] || this.distance[j] >= 0) continue;
        this.distance[j] = this.distance[i] + 1;
        queue.push(j);
      }
    }
    this._connected = n;
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
        if (remove && this.isEntrance(cx, cz)) continue; // 出入口は撤去できない
        if (this.setCell(cx, cz, remove ? 0 : 1)) changed++;
      }
    }
    if (changed > 0) this.updateConnectivity();
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
   * 来園者が歩けるのは出入口とつながった道だけなので、それだけを数える。
   */
  scenicValue(waterLevel: number): number {
    let v = 0;
    for (let cz = 0; cz < this.size; cz++) {
      for (let cx = 0; cx < this.size; cx++) {
        if (!this.isConnected(cx, cz)) continue;
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
/** 出入口とつながっていない道は色を落として見分けやすくする */
const DISCONNECTED = new THREE.Color('#8f8a80');

/** 遊歩道を描く。板の床と、外周に柵の杭を立てる */
export class PathView {
  readonly group = new THREE.Group();
  private readonly floor: THREE.InstancedMesh;
  private readonly posts: THREE.InstancedMesh;
  private readonly rails: THREE.InstancedMesh;
  private readonly gate = new THREE.Group();
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
    this.buildGate();
    this.group.add(this.gate);
  }

  /** 出入口のアーチ（門柱・梁・看板）と、外から来る道 */
  private buildGate(): void {
    const wood = new THREE.MeshStandardMaterial({ color: '#6e4a2c', roughness: 0.9 });
    const roof = new THREE.MeshStandardMaterial({ color: '#3f6f4f', roughness: 0.8 });
    const sign = new THREE.MeshStandardMaterial({ color: '#f3e7cc', roughness: 0.7 });
    const cs = this.map.cellSize;
    const [[ax, az], [bx]] = this.grid.entrance;
    const a = this.grid.center(ax, az);
    const b = this.grid.center(bx, az);
    const cx = (a.x + b.x) / 2;
    const z = a.z + cs / 2; // 地図の端
    const pillarGeo = new THREE.BoxGeometry(0.22, 1.8, 0.22);
    for (const x of [cx - cs - 0.05, cx + cs + 0.05]) {
      const pillar = new THREE.Mesh(pillarGeo, wood);
      pillar.position.set(x, 0.9, z);
      pillar.castShadow = true;
      this.gate.add(pillar);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(cs * 2 + 0.7, 0.18, 0.3), wood);
    beam.position.set(cx, 1.75, z);
    const top = new THREE.Mesh(new THREE.BoxGeometry(cs * 2 + 1.0, 0.12, 0.5), roof);
    top.position.set(cx, 1.9, z);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.36, 0.06), sign);
    board.position.set(cx, 1.45, z + 0.12);
    for (const m of [beam, top, board]) {
      m.castShadow = true;
      this.gate.add(m);
    }
    // 地図の外へ続く道（駐車場や駅からの道のイメージ）
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(cs * 2, 0.06, 6),
      new THREE.MeshStandardMaterial({ color: '#b9a888', roughness: 1 }),
    );
    road.position.set(cx, 0, z + 3);
    road.receiveShadow = true;
    this.gate.add(road);
    this.gateBaseX = cx;
    this.gateBaseZ = z;
  }

  private gateBaseX = 0;
  private gateBaseZ = 0;

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
        const color = !this.grid.isConnected(cx, cz)
          ? DISCONNECTED
          : this.map.heightAt(x, z) < this.waterLevel
            ? BOARDWALK
            : PLANK;
        this.floor.setColorAt(nf, color);
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
          // 出入口の外側（地図の端）は開けておく
          if (dz === 1 && this.grid.isEntrance(cx, cz)) continue;
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
    // 門は地面の高さに合わせる
    this.gate.position.y = this.floorY(this.gateBaseX, this.gateBaseZ - 0.5) - 0.04;
    this.floor.count = nf;
    this.posts.count = np;
    this.rails.count = nr;
    for (const mesh of [this.floor, this.posts, this.rails]) mesh.instanceMatrix.needsUpdate = true;
    if (this.floor.instanceColor) this.floor.instanceColor.needsUpdate = true;
  }
}

/** 来園者 1 人。出入口から入り、しばらく散策したら出入口へ戻って帰る */
interface Walker {
  /** いま居るマスと、向かっているマス */
  cx: number;
  cz: number;
  tx: number;
  tz: number;
  t: number;
  speed: number;
  /** 散策する残り秒数。0 になったら帰り始める */
  stay: number;
  leaving: boolean;
}

/** 遊歩道の上を歩く来園者の姿（見た目だけ） */
export class Strollers {
  readonly group = new THREE.Group();
  private readonly bodies: THREE.InstancedMesh;
  private readonly heads: THREE.InstancedMesh;
  private walkers: Walker[] = [];
  private readonly grid: PathGrid;
  private readonly view: PathView;
  private readonly max = 80;
  private arriveTimer = 0;

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

  get count(): number {
    return this.walkers.length;
  }

  update(dt: number, visitors: number): void {
    const want = Math.min(this.max, Math.ceil(visitors / 6), this.grid.connectedCount);

    // 道が切れて出入口へ戻れなくなった人は、その場で退場させる
    this.walkers = this.walkers.filter((w) => this.grid.isConnected(w.cx, w.cz) && this.grid.isConnected(w.tx, w.tz));

    // 人数が足りなければ、出入口から少しずつ入ってくる
    this.arriveTimer -= dt;
    if (this.walkers.length < want && this.arriveTimer <= 0) {
      const gate = this.grid.entrance.filter(([cx, cz]) => this.grid.isConnected(cx, cz));
      if (gate.length > 0) {
        const [cx, cz] = gate[Math.floor(Math.random() * gate.length)];
        this.walkers.push({
          cx,
          cz,
          tx: cx,
          tz: cz,
          t: 1,
          speed: 0.8 + Math.random() * 0.6,
          stay: 20 + Math.random() * 40,
          leaving: false,
        });
      }
      this.arriveTimer = 0.6;
    }
    // 多すぎるときは、散策中の人から順に帰ってもらう
    let extra = this.walkers.length - want;
    for (const w of this.walkers) {
      if (extra <= 0) break;
      if (!w.leaving) {
        w.leaving = true;
        extra--;
      }
    }

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    const exited = new Set<Walker>();
    this.walkers.forEach((w) => {
      w.stay -= dt;
      if (w.stay <= 0) w.leaving = true;
      w.t += dt * w.speed;
      if (w.t < 1) return;
      w.cx = w.tx;
      w.cz = w.tz;
      w.t = 0;
      if (w.leaving && this.grid.isEntrance(w.cx, w.cz)) {
        exited.add(w); // 出入口に着いたので帰る
        return;
      }
      const next = w.leaving ? this.stepHome(w) : this.stepWander(w);
      if (next) [w.tx, w.tz] = next;
    });
    if (exited.size > 0) this.walkers = this.walkers.filter((w) => !exited.has(w));

    this.walkers.forEach((w, i) => {
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

  private neighbors(cx: number, cz: number): [number, number][] {
    const out: [number, number][] = [];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (this.grid.isConnected(cx + dx, cz + dz)) out.push([cx + dx, cz + dz]);
    }
    return out;
  }

  /** 散策中：来た道はなるべく戻らず、奥へ奥へと進む */
  private stepWander(w: Walker): [number, number] | null {
    const all = this.neighbors(w.cx, w.cz);
    const forward = all.filter(([x, z]) => this.grid.distanceAt(x, z) >= this.grid.distanceAt(w.cx, w.cz));
    const options = forward.length > 0 && Math.random() < 0.8 ? forward : all;
    return options.length > 0 ? options[Math.floor(Math.random() * options.length)] : null;
  }

  /** 帰り道：出入口までの歩数が減る方へ進む */
  private stepHome(w: Walker): [number, number] | null {
    const d = this.grid.distanceAt(w.cx, w.cz);
    const options = this.neighbors(w.cx, w.cz).filter(([x, z]) => this.grid.distanceAt(x, z) < d);
    return options.length > 0 ? options[Math.floor(Math.random() * options.length)] : null;
  }
}
