import * as THREE from 'three';
import type { Heightmap } from './heightmap';
import type { Poacher } from './poachers';
import { CreatureMeshes, type Part } from './creatures';

const MAX_POACHERS = 8;

/** 密猟者の形（頭が +X 方向）。黒っぽい服に頬かむり、背中に袋 */
function poacherParts(): Part[] {
  const body = new THREE.CapsuleGeometry(0.17, 0.42, 2, 8);
  body.translate(0, 0.5, 0);
  const head = new THREE.SphereGeometry(0.15, 10, 8);
  head.translate(0.02, 0.98, 0);
  const hood = new THREE.SphereGeometry(0.165, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  hood.rotateZ(0.35);
  hood.translate(-0.01, 0.99, 0);
  const sack = new THREE.SphereGeometry(0.2, 8, 6);
  sack.scale(0.8, 1.1, 1);
  sack.translate(-0.24, 0.62, 0);
  const net = new THREE.CylinderGeometry(0.015, 0.015, 0.9, 4);
  net.rotateZ(-0.9);
  net.translate(0.3, 0.75, 0.16);
  const hoop = new THREE.TorusGeometry(0.13, 0.015, 4, 12);
  hoop.rotateY(Math.PI / 2);
  hoop.translate(0.66, 1.0, 0.16);
  return [
    { geometry: body, color: '#2f3438' },
    { geometry: head, color: '#e2bf9b' },
    { geometry: hood, color: '#3c3a4a' },
    { geometry: sack, color: '#9b8460' },
    { geometry: net, color: '#6b5436' },
    { geometry: hoop, color: '#6b5436' },
  ];
}

/** 密猟者（頭上に紫の目印つき）を描く */
export class PoacherView {
  readonly group = new THREE.Group();
  private readonly people = new CreatureMeshes(poacherParts(), MAX_POACHERS);
  private readonly markers: THREE.InstancedMesh;
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
    for (const mesh of this.people.meshes) this.group.add(mesh);

    // クマ（赤）と見分けがつくよう、紫の逆さ三角
    const markerGeo = new THREE.ConeGeometry(0.35, 0.7, 4);
    markerGeo.rotateX(Math.PI);
    this.markers = new THREE.InstancedMesh(
      markerGeo,
      new THREE.MeshBasicMaterial({ color: '#7d4fc4', depthTest: false, transparent: true, opacity: 0.9 }),
      MAX_POACHERS,
    );
    this.markers.renderOrder = 20;
    this.markers.count = 0;
    this.markers.frustumCulled = false;
    this.group.add(this.markers);
  }

  update(poachers: readonly Poacher[], time: number): void {
    let n = 0;
    for (const pc of poachers) {
      if (n >= MAX_POACHERS) break;
      const ground = Math.max(this.map.heightAt(pc.x, pc.z), this.waterLevel - 0.45);
      // 忍び足は小さく、逃げるときは大きく弾む
      const bob = Math.abs(Math.sin(pc.phase)) * (pc.mode === 'flee' ? 0.08 : 0.03);
      this.p.set(pc.x, ground + bob, pc.z);
      this.q.setFromAxisAngle(this.up, -pc.heading);
      this.m.compose(this.p, this.q, this.one);
      this.people.set(n, this.m);
      this.p.set(pc.x, ground + 1.75 + Math.sin(time * 4 + pc.id) * 0.12, pc.z);
      this.m.compose(this.p, this.q.identity(), this.one);
      this.markers.setMatrixAt(n, this.m);
      n++;
    }
    this.people.finish(n);
    this.markers.count = n;
    this.markers.instanceMatrix.needsUpdate = true;
  }
}
