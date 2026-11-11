import * as THREE from 'three';
import type { BrushResult, Heightmap } from './heightmap';

export interface Tree {
  x: number;
  z: number;
  scale: number;
  rotation: number;
}

/**
 * 木を InstancedMesh で描く。数千本置いても描画呼び出しは幹と葉の 2 回だけ。
 */
export class Forest {
  readonly group = new THREE.Group();
  readonly trees: Tree[] = [];
  private readonly trunks: THREE.InstancedMesh;
  private readonly leaves: THREE.InstancedMesh;
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
    for (const mesh of [this.trunks, this.leaves]) {
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

  plant(x: number, z: number, rand: () => number = Math.random): boolean {
    if (!this.canPlant(x, z)) return false;
    const tree: Tree = { x, z, scale: 0.7 + rand() * 0.6, rotation: rand() * Math.PI * 2 };
    this.trees.push(tree);
    const i = this.trees.length - 1;
    // 葉の色を一本ずつ少し変える
    const c = new THREE.Color().setHSL(0.27 + rand() * 0.08, 0.45 + rand() * 0.2, 0.28 + rand() * 0.1);
    this.leaves.setColorAt(i, c);
    if (this.leaves.instanceColor) this.leaves.instanceColor.needsUpdate = true;
    this.writeMatrix(i);
    this.trunks.count = this.leaves.count = this.trees.length;
    return true;
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
  }

  private writeMatrix(i: number): void {
    const t = this.trees[i];
    this.p.set(t.x, this.map.heightAt(t.x, t.z) - 0.05, t.z);
    this.q.setFromAxisAngle(this.up, t.rotation);
    this.s.setScalar(t.scale);
    this.m.compose(this.p, this.q, this.s);
    this.trunks.setMatrixAt(i, this.m);
    this.leaves.setMatrixAt(i, this.m);
    this.trunks.instanceMatrix.needsUpdate = true;
    this.leaves.instanceMatrix.needsUpdate = true;
  }
}
