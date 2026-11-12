import * as THREE from 'three';
import type { Heightmap } from './heightmap';
import { RANGER, type Ranger } from './rangers';
import { CreatureMeshes, type Part } from './creatures';
import { icons } from './icons';

/** 駆除係の形（頭が +X 方向）。緑の作業着につば広の帽子、肩に猟銃 */
function rangerParts(): Part[] {
  const body = new THREE.CapsuleGeometry(0.18, 0.44, 2, 8);
  body.translate(0, 0.52, 0);
  const vest = new THREE.CylinderGeometry(0.2, 0.2, 0.26, 10);
  vest.translate(0, 0.66, 0);
  const head = new THREE.SphereGeometry(0.15, 10, 8);
  head.translate(0.02, 1.0, 0);
  const brim = new THREE.CylinderGeometry(0.27, 0.27, 0.03, 14);
  brim.translate(0.02, 1.1, 0);
  const crown = new THREE.CylinderGeometry(0.12, 0.15, 0.14, 12);
  crown.translate(0.02, 1.18, 0);
  const rifle = new THREE.CylinderGeometry(0.022, 0.022, 0.95, 5);
  rifle.rotateZ(-1.1);
  rifle.translate(0.08, 0.82, 0.2);
  return [
    { geometry: body, color: '#5c7a45' },
    { geometry: vest, color: '#e08a2e' },
    { geometry: head, color: '#e2bf9b' },
    { geometry: brim, color: '#7a5a34' },
    { geometry: crown, color: '#7a5a34' },
    { geometry: rifle, color: '#3a2c22' },
  ];
}

/** 駆除係（頭上に緑の目印つき）を描く */
export class RangerView {
  readonly group = new THREE.Group();
  private readonly people = new CreatureMeshes(rangerParts(), RANGER.max);
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
    // クマ（赤）・密猟者（紫）と見分けがつくよう、緑のひし形
    this.markers = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.22),
      new THREE.MeshBasicMaterial({ color: '#3d9b6e', depthTest: false, transparent: true, opacity: 0.85 }),
      RANGER.max,
    );
    this.markers.renderOrder = 20;
    this.markers.count = 0;
    this.markers.frustumCulled = false;
    this.group.add(this.markers);
  }

  update(rangers: readonly Ranger[], time: number): void {
    let n = 0;
    for (const r of rangers) {
      if (n >= RANGER.max) break;
      const ground = Math.max(this.map.heightAt(r.x, r.z), this.waterLevel - 0.45);
      const bob = Math.abs(Math.sin(r.phase)) * 0.05;
      this.p.set(r.x, ground + bob, r.z);
      this.q.setFromAxisAngle(this.up, -r.heading);
      this.m.compose(this.p, this.q, this.one);
      this.people.set(n, this.m);
      this.p.set(r.x, ground + 1.6 + Math.sin(time * 3 + r.id) * 0.08, r.z);
      this.q.setFromAxisAngle(this.up, time * 1.5);
      this.m.compose(this.p, this.q, this.one);
      this.markers.setMatrixAt(n, this.m);
      n++;
    }
    this.people.finish(n);
    this.markers.count = n;
    this.markers.instanceMatrix.needsUpdate = true;
  }
}

/** かごの下に出す「駆除係」の欄。人数と日給、雇う・辞めてもらうボタン */
export class RangerPanel {
  private readonly el: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly hireBtn: HTMLButtonElement;
  private readonly fireBtn: HTMLButtonElement;
  private last = '';

  constructor(parent: Element | null, handlers: { onHire: () => void; onDismiss: () => void }) {
    this.el = document.createElement('div');
    this.el.className = 'rangers';
    this.el.title = '日給を払うと園内を巡回し、クマを撃ち、キツネや密猟者を捕まえます';
    this.el.innerHTML = `
      <span class="rg-icon">${icons.shield}</span>
      <span class="rg-text"><b>駆除係</b> <span class="rg-count"></span></span>
      <button type="button" class="rg-fire" aria-label="1 人辞めてもらう">−</button>
      <button type="button" class="rg-hire"></button>`;
    this.countEl = this.el.querySelector('.rg-count')!;
    this.hireBtn = this.el.querySelector('.rg-hire')!;
    this.fireBtn = this.el.querySelector('.rg-fire')!;
    this.hireBtn.addEventListener('click', handlers.onHire);
    this.fireBtn.addEventListener('click', handlers.onDismiss);
    parent?.appendChild(this.el);
  }

  update(count: number, money: number): void {
    const key = `${count}|${money >= RANGER.hireCost}`;
    if (key === this.last) return;
    this.last = key;
    this.countEl.innerHTML =
      count > 0 ? `${count}人 <small>日給 ${count * RANGER.wage}G</small>` : `<small>日給 ${RANGER.wage}G/人</small>`;
    const full = count >= RANGER.max;
    this.hireBtn.textContent = full ? '満員' : `雇う ${RANGER.hireCost}G`;
    this.hireBtn.disabled = full || money < RANGER.hireCost;
    this.fireBtn.hidden = count === 0;
  }
}
