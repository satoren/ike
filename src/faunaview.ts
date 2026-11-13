import * as THREE from 'three';
import type { Heightmap } from './heightmap';
import { CreatureMeshes, type Part } from './creatures';
import { FAUNA_ORDER, type Animal, type FaunaKind } from './fauna';

const MAX_PER_KIND = 16;

/** 見下ろしでも見つけやすいよう、小さな生き物は実物より大きめに描く */
const SIZE: Record<FaunaKind, number> = { frog: 1.4, dragonfly: 1.6, turtle: 1.1, squirrel: 1.5, deer: 1, owl: 1.35 };

/** カエル：平たい体に、飛び出た目と後ろ脚（頭が +X 方向） */
function frogParts(): Part[] {
  const body = new THREE.SphereGeometry(0.16, 10, 8);
  body.scale(1.25, 0.7, 1.05);
  body.translate(0, 0.1, 0);
  const head = new THREE.SphereGeometry(0.11, 10, 8);
  head.scale(1.1, 0.75, 1.15);
  head.translate(0.17, 0.14, 0);
  const eyeL = new THREE.SphereGeometry(0.045, 6, 5);
  eyeL.translate(0.2, 0.23, 0.07);
  const eyeR = eyeL.clone();
  eyeR.translate(0, 0, -0.14);
  const legL = new THREE.SphereGeometry(0.09, 8, 6);
  legL.scale(1.3, 0.55, 0.7);
  legL.translate(-0.12, 0.06, 0.15);
  const legR = legL.clone();
  legR.translate(0, 0, -0.3);
  return [
    { geometry: body, color: '#5fae3f' },
    { geometry: head, color: '#6dbb49' },
    { geometry: eyeL, color: '#f2e9a0' },
    { geometry: eyeR, color: '#f2e9a0' },
    { geometry: legL, color: '#4c9434' },
    { geometry: legR, color: '#4c9434' },
  ];
}

/** トンボ：細い体と、左右に広げた 2 対の羽 */
function dragonflyParts(): Part[] {
  const body = new THREE.CylinderGeometry(0.018, 0.012, 0.42, 6);
  body.rotateZ(Math.PI / 2);
  body.translate(-0.12, 0, 0);
  const chest = new THREE.SphereGeometry(0.045, 8, 6);
  chest.scale(1.5, 1, 1);
  chest.translate(0.1, 0, 0);
  const head = new THREE.SphereGeometry(0.04, 8, 6);
  head.translate(0.19, 0.005, 0);
  const wings: THREE.BufferGeometry[] = [];
  for (const [x, len] of [[0.12, 0.34], [0.04, 0.3]] as const) {
    for (const side of [1, -1]) {
      const w = new THREE.BoxGeometry(0.07, 0.004, len);
      w.translate(x, 0.03, side * (len / 2 + 0.02));
      wings.push(w);
    }
  }
  return [
    { geometry: body, color: '#c8452f' },
    { geometry: chest, color: '#a83a28' },
    { geometry: head, color: '#7a2a1c' },
    ...wings.map((geometry) => ({ geometry, color: '#eef7f8' })),
  ];
}

/** カメ：丸い甲羅から頭と脚を出す */
function turtleParts(): Part[] {
  const shell = new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  shell.scale(1.2, 0.7, 1);
  shell.translate(0, 0.05, 0);
  const rim = new THREE.CylinderGeometry(0.25, 0.25, 0.05, 12);
  rim.scale(1.2, 1, 1);
  rim.translate(0, 0.05, 0);
  const head = new THREE.SphereGeometry(0.07, 8, 6);
  head.scale(1.3, 0.9, 0.9);
  head.translate(0.34, 0.1, 0);
  const feet: THREE.BufferGeometry[] = [];
  for (const [fx, fz] of [[0.2, 0.2], [0.2, -0.2], [-0.2, 0.2], [-0.2, -0.2]]) {
    const f = new THREE.SphereGeometry(0.06, 6, 5);
    f.scale(1.2, 0.6, 1);
    f.translate(fx, 0.03, fz);
    feet.push(f);
  }
  return [
    { geometry: shell, color: '#4f6b3a' },
    { geometry: rim, color: '#8a7a4a' },
    { geometry: head, color: '#7d8f4e' },
    ...feet.map((geometry) => ({ geometry, color: '#7d8f4e' })),
  ];
}

/** リス：小さな体と、立てた大きなしっぽ */
function squirrelParts(): Part[] {
  const body = new THREE.SphereGeometry(0.13, 10, 8);
  body.scale(1.3, 1, 0.85);
  body.translate(0, 0.15, 0);
  const head = new THREE.SphereGeometry(0.09, 10, 8);
  head.translate(0.17, 0.26, 0);
  const earL = new THREE.ConeGeometry(0.025, 0.07, 4);
  earL.translate(0.16, 0.36, 0.045);
  const earR = earL.clone();
  earR.translate(0, 0, -0.09);
  const tail = new THREE.CapsuleGeometry(0.07, 0.24, 2, 8);
  tail.rotateZ(-0.35);
  tail.translate(-0.2, 0.32, 0);
  const belly = new THREE.SphereGeometry(0.09, 8, 6);
  belly.translate(0.07, 0.13, 0);
  return [
    { geometry: body, color: '#a8683a' },
    { geometry: head, color: '#b4733f' },
    { geometry: earL, color: '#8a5230' },
    { geometry: earR, color: '#8a5230' },
    { geometry: tail, color: '#8f552f' },
    { geometry: belly, color: '#ead9bf' },
  ];
}

/** シカ：脚と首の長い体に、小さな角 */
function deerParts(): Part[] {
  const body = new THREE.SphereGeometry(0.3, 12, 10);
  body.scale(1.55, 0.85, 0.75);
  body.translate(0, 0.82, 0);
  const neck = new THREE.CylinderGeometry(0.08, 0.12, 0.5, 8);
  neck.rotateZ(-0.5);
  neck.translate(0.45, 1.15, 0);
  const head = new THREE.SphereGeometry(0.13, 10, 8);
  head.scale(1.4, 0.95, 0.9);
  head.translate(0.66, 1.4, 0);
  const nose = new THREE.SphereGeometry(0.04, 6, 5);
  nose.translate(0.84, 1.37, 0);
  const tail = new THREE.SphereGeometry(0.08, 6, 5);
  tail.translate(-0.47, 0.95, 0);
  const legs: THREE.BufferGeometry[] = [];
  for (const [lx, lz] of [[0.3, 0.12], [0.3, -0.12], [-0.3, 0.12], [-0.3, -0.12]]) {
    const leg = new THREE.CylinderGeometry(0.035, 0.03, 0.68, 6);
    leg.translate(lx, 0.34, lz);
    legs.push(leg);
  }
  const antlers: THREE.BufferGeometry[] = [];
  for (const side of [1, -1]) {
    const a = new THREE.CylinderGeometry(0.014, 0.02, 0.3, 5);
    a.rotateX(side * 0.35);
    a.translate(0.6, 1.62, side * 0.1);
    const b = new THREE.CylinderGeometry(0.012, 0.014, 0.16, 5);
    b.rotateZ(-0.9);
    b.translate(0.67, 1.66, side * 0.13);
    antlers.push(a, b);
    const ear = new THREE.ConeGeometry(0.035, 0.12, 4);
    ear.rotateX(side * 1.1);
    ear.translate(0.58, 1.48, side * 0.14);
    antlers.push(ear);
  }
  return [
    { geometry: body, color: '#b98554' },
    { geometry: neck, color: '#b98554' },
    { geometry: head, color: '#c08c5a' },
    { geometry: nose, color: '#2b211b' },
    { geometry: tail, color: '#f5efe2' },
    ...legs.map((geometry) => ({ geometry, color: '#8f6540' })),
    ...antlers.map((geometry) => ({ geometry, color: '#d9c7a4' })),
  ];
}

/** フクロウ：ずんぐりした体に、光る大きな目 */
function owlParts(): Part[] {
  const body = new THREE.SphereGeometry(0.17, 10, 8);
  body.scale(0.9, 1.25, 0.95);
  body.translate(0, 0.2, 0);
  const head = new THREE.SphereGeometry(0.15, 10, 8);
  head.scale(0.95, 0.85, 1.05);
  head.translate(0.02, 0.44, 0);
  const face = new THREE.SphereGeometry(0.11, 10, 8);
  face.scale(0.5, 0.9, 1.15);
  face.translate(0.12, 0.44, 0);
  const eyeL = new THREE.SphereGeometry(0.038, 8, 6);
  eyeL.translate(0.165, 0.46, 0.055);
  const eyeR = eyeL.clone();
  eyeR.translate(0, 0, -0.11);
  const beak = new THREE.ConeGeometry(0.022, 0.06, 4);
  beak.rotateZ(-Math.PI / 2 - 0.5);
  beak.translate(0.19, 0.41, 0);
  const tuftL = new THREE.ConeGeometry(0.035, 0.1, 4);
  tuftL.translate(0.02, 0.59, 0.09);
  const tuftR = tuftL.clone();
  tuftR.translate(0, 0, -0.18);
  const wingL = new THREE.SphereGeometry(0.13, 8, 6);
  wingL.scale(0.7, 1.2, 0.3);
  wingL.translate(-0.02, 0.2, 0.15);
  const wingR = wingL.clone();
  wingR.translate(0, 0, -0.3);
  return [
    { geometry: body, color: '#8a6a47' },
    { geometry: head, color: '#94734e' },
    { geometry: face, color: '#e6d6b8' },
    { geometry: eyeL, color: '#f5c53a', emissive: '#c98a12' },
    { geometry: eyeR, color: '#f5c53a', emissive: '#c98a12' },
    { geometry: beak, color: '#3a2f24' },
    { geometry: tuftL, color: '#6e5336' },
    { geometry: tuftR, color: '#6e5336' },
    { geometry: wingL, color: '#6e5336' },
    { geometry: wingR, color: '#6e5336' },
  ];
}

const PARTS: Record<FaunaKind, () => Part[]> = {
  frog: frogParts,
  dragonfly: dragonflyParts,
  turtle: turtleParts,
  squirrel: squirrelParts,
  deer: deerParts,
  owl: owlParts,
};

/** 場所の作り方で現れる生き物（カエル・トンボ・カメ・リス・シカ・フクロウ）を描く */
export class FaunaView {
  readonly group = new THREE.Group();
  /** 水面の高さ。季節で水位が変わると外から書き換える */
  waterLevel: number;
  private readonly kinds: Record<FaunaKind, CreatureMeshes>;
  private readonly map: Heightmap;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(map: Heightmap, waterLevel: number) {
    this.map = map;
    this.waterLevel = waterLevel;
    this.kinds = Object.fromEntries(
      FAUNA_ORDER.map((k) => [k, new CreatureMeshes(PARTS[k](), MAX_PER_KIND)]),
    ) as Record<FaunaKind, CreatureMeshes>;
    for (const k of Object.values(this.kinds)) for (const mesh of k.meshes) this.group.add(mesh);
  }

  update(animals: readonly Animal[]): void {
    const counts: Record<FaunaKind, number> = { frog: 0, dragonfly: 0, turtle: 0, squirrel: 0, deer: 0, owl: 0 };
    for (const a of animals) {
      const i = counts[a.kind];
      if (i >= MAX_PER_KIND) continue;
      const ground = this.map.heightAt(a.x, a.z);
      const moving = Math.hypot(a.tx - a.x, a.tz - a.z) > 0.12;
      let y = ground + a.y;
      const size = SIZE[a.kind];
      this.s.setScalar(size);
      switch (a.kind) {
        case 'frog':
          // 水面に顔を出して浮かび、動くときはぴょんと跳ねる
          y = Math.max(ground, this.waterLevel - 0.06) + (moving ? Math.abs(Math.sin(a.phase)) * 0.35 : 0);
          break;
        case 'dragonfly':
          // 水面（陸の上では地面）の少し上を、ふわふわ上下しながら飛ぶ
          y = Math.max(ground, this.waterLevel) + a.y + Math.sin(a.phase * 0.08) * 0.05;
          break;
        case 'turtle':
          y = Math.max(ground, this.waterLevel - 0.1);
          break;
        case 'squirrel':
          y = ground + (moving ? Math.abs(Math.sin(a.phase)) * 0.12 : 0);
          break;
        case 'deer':
          y = ground + (moving ? Math.abs(Math.sin(a.phase)) * 0.03 : 0);
          break;
        case 'owl':
          // 飛んでいる間は羽を広げて見せる
          if (moving) this.s.set(size, size * 0.9, size * (1.9 + Math.sin(a.phase) * 0.5));
          break;
      }
      this.p.set(a.x, y, a.z);
      this.q.setFromAxisAngle(this.up, -a.heading);
      this.m.compose(this.p, this.q, this.s);
      this.kinds[a.kind].set(i, this.m);
      counts[a.kind]++;
    }
    for (const kind of FAUNA_ORDER) this.kinds[kind].finish(counts[kind]);
  }
}
