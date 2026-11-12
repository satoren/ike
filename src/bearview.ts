import * as THREE from 'three';
import type { Heightmap } from './heightmap';
import type { Bear, Trap } from './bears';
import { CreatureMeshes, bearParts } from './creatures';

const MAX_BEARS = 8;
const MAX_TRAPS = 200;

/** クマ（頭上に赤い目印つき）と罠を描く */
export class BearView {
  readonly group = new THREE.Group();
  private readonly bears = new CreatureMeshes(bearParts(), MAX_BEARS);
  private readonly markers: THREE.InstancedMesh;
  private readonly traps: THREE.InstancedMesh;
  private readonly trapTeeth: THREE.InstancedMesh;
  private readonly map: Heightmap;
  private readonly waterLevel: number;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(map: Heightmap, waterLevel: number) {
    this.map = map;
    this.waterLevel = waterLevel;
    for (const mesh of this.bears.meshes) this.group.add(mesh);

    // 遠くからでも見つけられるよう、頭上に逆さの赤い三角
    const markerGeo = new THREE.ConeGeometry(0.45, 0.9, 4);
    markerGeo.rotateX(Math.PI);
    this.markers = new THREE.InstancedMesh(
      markerGeo,
      new THREE.MeshBasicMaterial({ color: '#e0412f', depthTest: false, transparent: true, opacity: 0.9 }),
      MAX_BEARS,
    );
    this.markers.renderOrder = 20;

    const ring = new THREE.TorusGeometry(0.32, 0.05, 6, 16);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, 0.05, 0);
    this.traps = new THREE.InstancedMesh(
      ring,
      new THREE.MeshStandardMaterial({ color: '#6f7479', metalness: 0.6, roughness: 0.4 }),
      MAX_TRAPS,
    );
    const teeth = new THREE.ConeGeometry(0.05, 0.14, 4);
    teeth.translate(0, 0.12, 0.3);
    const all: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) all.push(teeth.clone().rotateY((i / 8) * Math.PI * 2));
    this.trapTeeth = new THREE.InstancedMesh(
      mergeAll(all),
      new THREE.MeshStandardMaterial({ color: '#9aa0a6', metalness: 0.7, roughness: 0.35 }),
      MAX_TRAPS,
    );
    for (const mesh of [this.markers, this.traps, this.trapTeeth]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }

  update(bears: readonly Bear[], traps: readonly Trap[], time: number): void {
    let n = 0;
    for (const b of bears) {
      if (n >= MAX_BEARS) break;
      const ground = Math.max(this.map.heightAt(b.x, b.z), this.waterLevel - 0.6);
      // 歩くたびに体が少し上下する
      this.p.set(b.x, ground + Math.abs(Math.sin(b.phase)) * 0.06, b.z);
      this.q.setFromAxisAngle(this.up, -b.heading);
      this.m.compose(this.p, this.q, this.one);
      this.bears.set(n, this.m);
      this.p.set(b.x, ground + 2.3 + Math.sin(time * 4) * 0.15, b.z);
      this.m.compose(this.p, this.q.identity(), this.one);
      this.markers.setMatrixAt(n, this.m);
      n++;
    }
    this.bears.finish(n);
    this.markers.count = n;
    this.markers.instanceMatrix.needsUpdate = true;

    let t = 0;
    for (const trap of traps) {
      if (t >= MAX_TRAPS) break;
      this.p.set(trap.x, this.map.heightAt(trap.x, trap.z), trap.z);
      this.m.compose(this.p, this.q.identity(), this.one);
      this.traps.setMatrixAt(t, this.m);
      this.trapTeeth.setMatrixAt(t, this.m);
      t++;
    }
    this.traps.count = this.trapTeeth.count = t;
    this.traps.instanceMatrix.needsUpdate = true;
    this.trapTeeth.instanceMatrix.needsUpdate = true;
  }
}

/** いくつかの形を 1 つにまとめる（位置・法線だけの簡単な結合） */
function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const g of geos) {
    const ng = g.index ? g.toNonIndexed() : g;
    pos.push(...(ng.getAttribute('position').array as Float32Array));
    nor.push(...(ng.getAttribute('normal').array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
