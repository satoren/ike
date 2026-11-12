import * as THREE from 'three';
import type { BrushResult, Heightmap } from './heightmap';
import { FRUIT, growTree, type FruitTree } from './ecology';

export interface Tree extends FruitTree {
  scale: number;
  rotation: number;
}

/** 実の付く位置（葉の表面あたり、木の大きさ 1 のとき） */
const FRUIT_SLOTS = [
  [0.42, 1.0, 0.18],
  [-0.3, 1.2, 0.36],
  [0.05, 0.95, -0.46],
];
const FRUIT_COLORS = ['#e2493b', '#f08a2c', '#e8c43a'];

/**
 * 木を InstancedMesh で描く。数千本置いても描画呼び出しは幹と葉の 2 回だけ。
 */
export class Forest {
  readonly group = new THREE.Group();
  readonly trees: Tree[] = [];
  private readonly trunks: THREE.InstancedMesh;
  private readonly leaves: THREE.InstancedMesh;
  private readonly fruits: THREE.InstancedMesh;
  private fruitDirty = true;
  private readonly map: Heightmap;
  private readonly waterLevel: number;
  private readonly max: number;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(map: Heightmap, waterLevel: number, max = 4000) {
    this.map = map;
    this.waterLevel = waterLevel;
    this.max = max;

    const trunkGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.8, 6);
    trunkGeo.translate(0, 0.4, 0);
    const leafGeo = new THREE.IcosahedronGeometry(0.55, 0);
    leafGeo.scale(1, 1.25, 1);
    leafGeo.translate(0, 1.15, 0);

    this.trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 1 }), max);
    this.leaves = new THREE.InstancedMesh(
      leafGeo,
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }),
      max,
    );
    const fruitGeo = new THREE.SphereGeometry(0.12, 8, 6);
    this.fruits = new THREE.InstancedMesh(
      fruitGeo,
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45 }),
      max * FRUIT.max,
    );

    for (const mesh of [this.trunks, this.leaves, this.fruits]) {
      mesh.count = 0;
      mesh.frustumCulled = false; // 木は地図全体に散らばるので個別の判定は省く
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
    }
  }

  /** その地点に木を植えられるか（水中や密集地は不可） */
  canPlant(x: number, z: number): boolean {
    if (this.trees.length >= this.max) return false;
    if (this.map.heightAt(x, z) < this.waterLevel + 0.15) return false;
    return !this.trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 0.6 ** 2);
  }

  /** 木を植える。grown を true にすると最初から育った状態（実が付き始める）で植える */
  plant(x: number, z: number, rand: () => number = Math.random, grown = false): boolean {
    if (!this.canPlant(x, z)) return false;
    const tree: Tree = {
      x,
      z,
      scale: 0.7 + rand() * 0.6,
      rotation: rand() * Math.PI * 2,
      age: grown ? FRUIT.matureAge + rand() * 10 : 0,
      fruit: grown ? Math.floor(rand() * (FRUIT.max + 1)) : 0,
      fruitTimer: rand() * FRUIT.interval,
    };
    this.trees.push(tree);
    const i = this.trees.length - 1;
    // 葉の色を一本ずつ少し変える
    const c = new THREE.Color().setHSL(0.27 + rand() * 0.08, 0.45 + rand() * 0.2, 0.28 + rand() * 0.1);
    this.leaves.setColorAt(i, c);
    if (this.leaves.instanceColor) this.leaves.instanceColor.needsUpdate = true;
    this.writeMatrix(i);
    this.trunks.count = this.leaves.count = this.trees.length;
    this.fruitDirty = true;
    return true;
  }

  /** 保存データから木をまとめて戻す（今ある木は消す） */
  restore(trees: readonly Tree[]): void {
    this.trees.length = 0;
    const c = new THREE.Color();
    for (const t of trees.slice(0, this.max)) {
      this.trees.push({ ...t });
      const i = this.trees.length - 1;
      this.leaves.setColorAt(i, c.setHSL(0.27 + Math.random() * 0.08, 0.45 + Math.random() * 0.2, 0.28 + Math.random() * 0.1));
      this.writeMatrix(i);
    }
    if (this.leaves.instanceColor) this.leaves.instanceColor.needsUpdate = true;
    this.trunks.count = this.leaves.count = this.trees.length;
    this.fruitDirty = true;
  }

  /** 木を育てる。若木は少しずつ大きくなり、育った木は実をつける */
  update(dt: number): void {
    for (let i = 0; i < this.trees.length; i++) {
      const t = this.trees[i];
      const young = t.age < FRUIT.matureAge;
      if (growTree(t, dt)) this.fruitDirty = true;
      if (young) this.writeMatrix(i);
    }
    if (this.fruitDirty) this.rebuildFruit();
  }

  /** 葉のマテリアル（季節で色を変えるのに使う） */
  get foliageMaterial(): THREE.MeshStandardMaterial {
    return this.leaves.material as THREE.MeshStandardMaterial;
  }

  /** 実の数が外から変わったとき（収穫など）に呼ぶ */
  markFruitDirty(): void {
    this.fruitDirty = true;
  }

  get fruitCount(): number {
    let n = 0;
    for (const t of this.trees) n += t.fruit;
    return n;
  }

  private rebuildFruit(): void {
    this.fruitDirty = false;
    const c = new THREE.Color();
    const local = new THREE.Vector3();
    let n = 0;
    for (const t of this.trees) {
      if (t.fruit === 0) continue;
      const ground = this.map.heightAt(t.x, t.z) - 0.05;
      const cos = Math.cos(-t.rotation);
      const sin = Math.sin(-t.rotation);
      for (let k = 0; k < t.fruit; k++) {
        const [sx, sy, sz] = FRUIT_SLOTS[k];
        // 木の回転と大きさに合わせて実の位置を置く
        local.set(sx * cos - sz * sin, sy, sx * sin + sz * cos).multiplyScalar(t.scale);
        this.p.set(t.x + local.x, ground + local.y, t.z + local.z);
        this.s.setScalar(t.scale);
        this.m.compose(this.p, this.q.identity(), this.s);
        this.fruits.setMatrixAt(n, this.m);
        this.fruits.setColorAt(n, c.set(FRUIT_COLORS[(Math.floor(t.x * 7 + t.z * 13) >>> 0) % FRUIT_COLORS.length]));
        n++;
      }
    }
    this.fruits.count = n;
    this.fruits.instanceMatrix.needsUpdate = true;
    if (this.fruits.instanceColor) this.fruits.instanceColor.needsUpdate = true;
  }

  /** 地形が変わった範囲の木を地面に合わせる。水没した木は取り除く。取り除いた本数を返す */
  onTerrainChanged(region: BrushResult): number {
    const half = this.map.worldSize / 2;
    const cs = this.map.cellSize;
    const minX = region.minX * cs - half - 1;
    const maxX = region.maxX * cs - half + 1;
    const minZ = region.minZ * cs - half - 1;
    const maxZ = region.maxZ * cs - half + 1;

    let removed = 0;
    for (let i = this.trees.length - 1; i >= 0; i--) {
      const t = this.trees[i];
      if (t.x < minX || t.x > maxX || t.z < minZ || t.z > maxZ) continue;
      if (this.map.heightAt(t.x, t.z) < this.waterLevel + 0.05) {
        this.removeAt(i);
        removed++;
      } else {
        this.writeMatrix(i);
        if (t.fruit > 0) this.fruitDirty = true;
      }
    }
    return removed;
  }

  private removeAt(i: number): void {
    // 末尾の木を空いた位置へ移して詰める
    const last = this.trees.length - 1;
    if (i !== last) {
      this.trees[i] = this.trees[last];
      const c = new THREE.Color();
      this.leaves.getColorAt(last, c);
      this.leaves.setColorAt(i, c);
      if (this.leaves.instanceColor) this.leaves.instanceColor.needsUpdate = true;
      this.writeMatrix(i);
    }
    this.trees.pop();
    this.trunks.count = this.leaves.count = this.trees.length;
    this.fruitDirty = true;
  }

  private writeMatrix(i: number): void {
    const t = this.trees[i];
    this.p.set(t.x, this.map.heightAt(t.x, t.z) - 0.05, t.z);
    this.q.setFromAxisAngle(this.up, t.rotation);
    // 若木は小さく、育つにつれて本来の大きさになる
    const growth = Math.min(1, 0.35 + (t.age / FRUIT.matureAge) * 0.65);
    this.s.setScalar(t.scale * growth);
    this.m.compose(this.p, this.q, this.s);
    this.trunks.setMatrixAt(i, this.m);
    this.leaves.setMatrixAt(i, this.m);
    this.trunks.instanceMatrix.needsUpdate = true;
    this.leaves.instanceMatrix.needsUpdate = true;
  }
}
