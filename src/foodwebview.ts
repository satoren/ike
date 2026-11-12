import * as THREE from 'three';
import type { Heightmap } from './heightmap';
import { CreatureMeshes, type Part } from './creatures';
import { BIRDS, WEED, type Bird, type BirdKind, type Weed } from './foodweb';

const MAX_WEEDS = 3000;

/** カワセミ：青い背中とオレンジのおなか、長いくちばし（頭が +X 方向） */
function kingfisherParts(): Part[] {
  const body = new THREE.SphereGeometry(0.14, 10, 8);
  body.scale(1.35, 0.95, 0.9);
  const belly = new THREE.SphereGeometry(0.12, 10, 8);
  belly.scale(1.1, 0.8, 0.85);
  belly.translate(0.02, -0.04, 0);
  const head = new THREE.SphereGeometry(0.1, 10, 8);
  head.translate(0.16, 0.07, 0);
  const beak = new THREE.ConeGeometry(0.025, 0.16, 6);
  beak.rotateZ(-Math.PI / 2);
  beak.translate(0.32, 0.06, 0);
  const wing = new THREE.SphereGeometry(0.11, 8, 6);
  wing.scale(1.2, 0.25, 1.9);
  wing.translate(-0.02, 0.06, 0);
  return [
    { geometry: body, color: '#1f8fc4' },
    { geometry: belly, color: '#ef8a35' },
    { geometry: head, color: '#1c7fb3' },
    { geometry: beak, color: '#1d1d1d' },
    { geometry: wing, color: '#2aa7d6' },
  ];
}

/** サギ：白くて首と脚の長い鳥 */
function heronParts(): Part[] {
  const body = new THREE.SphereGeometry(0.22, 10, 8);
  body.scale(1.5, 0.9, 0.8);
  body.translate(0, 0.95, 0);
  const neck = new THREE.CylinderGeometry(0.045, 0.06, 0.55, 6);
  neck.rotateZ(-0.35);
  neck.translate(0.3, 1.25, 0);
  const head = new THREE.SphereGeometry(0.08, 8, 6);
  head.translate(0.4, 1.52, 0);
  const beak = new THREE.ConeGeometry(0.03, 0.26, 6);
  beak.rotateZ(-Math.PI / 2);
  beak.translate(0.58, 1.5, 0);
  const legs = new THREE.CylinderGeometry(0.018, 0.018, 0.85, 4);
  legs.translate(0.02, 0.42, 0.06);
  const legs2 = legs.clone();
  legs2.translate(0, 0, -0.12);
  return [
    { geometry: body, color: '#f3f1ea' },
    { geometry: neck, color: '#f3f1ea' },
    { geometry: head, color: '#f6f4ee' },
    { geometry: beak, color: '#e2b23a' },
    { geometry: legs, color: '#2d2a26' },
    { geometry: legs2, color: '#2d2a26' },
  ];
}

/** 水草の株：細長い葉を数枚、扇のように広げる */
function weedGeometry(): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.ConeGeometry(0.06, 1, 4);
    g.translate(0, 0.5, 0);
    g.rotateZ(0.25 * (i % 2 ? 1 : -1));
    g.rotateY((i * Math.PI) / 2);
    blades.push(g);
  }
  return mergeAll(blades);
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // three の BufferGeometryUtils を使わず、非インデックス化してつなげる
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = flat.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  let o = 0;
  for (const g of flat) {
    pos.set(g.attributes.position.array as Float32Array, o);
    o += g.attributes.position.count * 3;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}

export class FoodWebView {
  readonly group = new THREE.Group();
  private readonly weedMesh: THREE.InstancedMesh;
  private readonly birds: Record<BirdKind, CreatureMeshes>;
  private readonly map: Heightmap;
  private readonly waterLevel: number;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly e = new THREE.Euler();

  constructor(map: Heightmap, waterLevel: number) {
    this.map = map;
    this.waterLevel = waterLevel;
    this.weedMesh = new THREE.InstancedMesh(
      weedGeometry(),
      new THREE.MeshStandardMaterial({ color: '#5aae4f', roughness: 0.9, side: THREE.DoubleSide }),
      MAX_WEEDS,
    );
    this.weedMesh.count = 0;
    this.weedMesh.frustumCulled = false;
    this.group.add(this.weedMesh);
    this.birds = { kingfisher: new CreatureMeshes(kingfisherParts(), 16), heron: new CreatureMeshes(heronParts(), 16) };
    for (const k of Object.values(this.birds)) for (const mesh of k.meshes) this.group.add(mesh);
  }

  update(weeds: readonly Weed[], birds: readonly Bird[], t: number): void {
    let n = 0;
    for (const w of weeds) {
      if (n >= MAX_WEEDS) break;
      const ground = this.map.heightAt(w.x, w.z);
      // 育つにつれて伸び、水面から少し顔を出す。ゆらゆら揺れる
      const grow = Math.min(1, 0.25 + (0.75 * w.age) / WEED.matureAge);
      const height = (this.waterLevel - ground + 0.4) * grow;
      const sway = Math.sin(t * 1.3 + w.x * 0.7 + w.z * 0.5) * 0.12;
      this.q.setFromEuler(this.e.set(sway, w.x * 3.1 + w.z * 1.7, sway * 0.6));
      this.p.set(w.x, ground, w.z);
      this.s.set(1, height, 1);
      this.m.compose(this.p, this.q, this.s);
      this.weedMesh.setMatrixAt(n++, this.m);
    }
    this.weedMesh.count = n;
    this.weedMesh.instanceMatrix.needsUpdate = true;

    const counts: Record<BirdKind, number> = { kingfisher: 0, heron: 0 };
    for (const b of birds) {
      const i = counts[b.kind];
      if (i >= 16) continue;
      let y: number;
      if (b.kind === 'kingfisher') {
        // はばたきで少し上下する
        y = this.waterLevel + b.y + Math.sin(b.phase) * 0.03;
        this.s.set(1, 1, 1 + Math.sin(b.phase) * 0.25);
      } else {
        y = this.map.heightAt(b.x, b.z);
        this.s.set(1, 1, 1);
      }
      this.p.set(b.x, y, b.z);
      this.q.setFromAxisAngle(this.up, -b.heading);
      this.m.compose(this.p, this.q, this.s);
      this.birds[b.kind].set(i, this.m);
      counts[b.kind]++;
    }
    for (const k of Object.keys(this.birds) as BirdKind[]) this.birds[k].finish(counts[k]);
  }
}

/** かごの下に「水草 → 魚 → 鳥」のつながりを表示する小さな欄 */
export class FoodWebPanel {
  private readonly el: HTMLElement;
  private last = '';

  constructor(parent: Element | null) {
    this.el = document.createElement('div');
    this.el.className = 'foodweb';
    this.el.title = '水草が魚のすみかになり、魚が増えると鳥が食べに来ます。魚を採りすぎると鳥は去ります';
    parent?.appendChild(this.el);
  }

  update(d: { weeds: number; weedsGrowing: number; fish: number; fishCap: number; kingfisher: number; heron: number }): void {
    const key = Object.values(d).join('|');
    if (key === this.last) return;
    this.last = key;
    const birds = d.kingfisher + d.heron;
    const growing = d.weedsGrowing > 0 ? `<small>+${d.weedsGrowing}</small>` : '';
    this.el.innerHTML = `
      <span class="fw-title">つながり</span>
      <span class="fw-step${d.weeds ? '' : ' off'}">水草 <b>${d.weeds}</b>${growing}</span>
      <span class="fw-arrow">›</span>
      <span class="fw-step${d.fish ? '' : ' off'}">魚 <b>${d.fish}</b></span>
      <span class="fw-arrow">›</span>
      <span class="fw-step${birds ? '' : ' off'}">${BIRDS.kingfisher.name} <b>${d.kingfisher}</b> ${BIRDS.heron.name} <b>${d.heron}</b></span>
      ${d.fish >= d.fishCap ? '<span class="fw-tip">池を深く掘り、水草を植えると魚が増えます</span>' : ''}`;
  }
}
