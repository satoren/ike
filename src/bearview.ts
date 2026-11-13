import * as THREE from 'three';
import type { Heightmap } from './heightmap';
import type { Bear, BearSign, Trap } from './bears';
import { CreatureMeshes, bearParts } from './creatures';

const MAX_BEARS = 8;
const MAX_TRAPS = 200;
const MAX_PRINTS = 600;
/** 足跡の間隔 */
const PRINT_GAP = 0.9;

/** クマ（頭上に赤い目印つき）と罠を描く */
export class BearView {
  readonly group = new THREE.Group();
  private readonly bears = new CreatureMeshes(bearParts(), MAX_BEARS);
  private readonly markers: THREE.InstancedMesh;
  private readonly traps: THREE.InstancedMesh;
  private readonly trapTeeth: THREE.InstancedMesh;
  private readonly prints: THREE.InstancedMesh;
  private readonly signMarker: THREE.Mesh;
  private sign: BearSign | null = null;
  private trail: { x: number; z: number }[] = [];
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
    // 足跡：地面に貼りつく小さな楕円。予想される獣道と、歩いているクマの行き先に並べる
    const print = new THREE.CircleGeometry(0.22, 10);
    print.rotateX(-Math.PI / 2);
    print.scale(0.75, 1, 1.25);
    this.prints = new THREE.InstancedMesh(
      print,
      new THREE.MeshBasicMaterial({ color: '#4a3524', transparent: true, opacity: 0.75, depthWrite: false }),
      MAX_PRINTS,
    );
    this.prints.renderOrder = 5;
    // 足跡が見つかった場所の目印（琥珀色のひし形）
    this.signMarker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5),
      new THREE.MeshBasicMaterial({ color: '#d99a2b', depthTest: false, transparent: true, opacity: 0.9 }),
    );
    this.signMarker.renderOrder = 20;
    this.signMarker.visible = false;
    this.group.add(this.signMarker);
    for (const mesh of [this.markers, this.traps, this.trapTeeth, this.prints]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }

  /** 足跡の場所と、そこから予想される獣道を受け取る */
  setTrail(sign: BearSign | null, trail: { x: number; z: number }[]): void {
    this.sign = sign;
    this.trail = trail;
  }

  /** 折れ線に沿って足跡を左右交互に並べる。置いた数を返す */
  private layPrints(from: { x: number; z: number }, line: readonly { x: number; z: number }[], n: number): number {
    let prev = from;
    let carry = PRINT_GAP / 2;
    let side = 1;
    for (const pt of line) {
      const dx = pt.x - prev.x;
      const dz = pt.z - prev.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const ux = dx / len;
      const uz = dz / len;
      this.q.setFromAxisAngle(this.up, Math.atan2(ux, uz));
      while (carry <= len) {
        if (n >= MAX_PRINTS) return n;
        const x = prev.x + ux * carry - uz * 0.16 * side;
        const z = prev.z + uz * carry + ux * 0.16 * side;
        const h = this.map.heightAt(x, z);
        // 水の中の足跡は見えない
        if (h >= this.waterLevel) {
          this.p.set(x, h + 0.06, z);
          this.m.compose(this.p, this.q, this.one);
          this.prints.setMatrixAt(n++, this.m);
        }
        side = -side;
        carry += PRINT_GAP;
      }
      carry -= len;
      prev = pt;
    }
    return n;
  }

  update(bears: readonly Bear[], traps: readonly Trap[], time: number): void {
    let prints = 0;
    if (this.sign && this.trail.length > 1) prints = this.layPrints(this.trail[0], this.trail.slice(1), prints);
    for (const b of bears) if (b.route?.length) prints = this.layPrints(b, b.route, prints);
    this.prints.count = prints;
    this.prints.instanceMatrix.needsUpdate = true;
    this.signMarker.visible = this.sign !== null;
    if (this.sign) {
      const g = Math.max(this.map.heightAt(this.sign.x, this.sign.z), this.waterLevel);
      this.signMarker.position.set(this.sign.x, g + 2 + Math.sin(time * 3) * 0.15, this.sign.z);
      this.signMarker.rotation.y = time * 1.5;
    }

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
