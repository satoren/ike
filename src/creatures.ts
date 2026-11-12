import * as THREE from 'three';
import type { Heightmap } from './heightmap';
import type { Creature, CreatureKind } from './ecology';

const MAX_PER_KIND = 400;

export interface Part {
  geometry: THREE.BufferGeometry;
  color: THREE.ColorRepresentation;
}

/** 生き物の形。どれも簡単な図形の組み合わせ（頭が +X 方向） */
function rabbitParts(): Part[] {
  const body = new THREE.SphereGeometry(0.22, 10, 8);
  body.scale(1.25, 1, 1);
  body.translate(0, 0.22, 0);
  const head = new THREE.SphereGeometry(0.14, 10, 8);
  head.translate(0.26, 0.38, 0);
  const earL = new THREE.CapsuleGeometry(0.035, 0.18, 2, 6);
  earL.rotateZ(-0.25);
  earL.translate(0.24, 0.6, 0.06);
  const earR = earL.clone();
  earR.translate(0, 0, -0.12);
  const tail = new THREE.SphereGeometry(0.07, 6, 5);
  tail.translate(-0.28, 0.26, 0);
  return [
    { geometry: body, color: '#d9c3a3' },
    { geometry: head, color: '#e3d0b2' },
    { geometry: earL, color: '#cfb592' },
    { geometry: earR, color: '#cfb592' },
    { geometry: tail, color: '#ffffff' },
  ];
}

function foxParts(): Part[] {
  const body = new THREE.SphereGeometry(0.22, 10, 8);
  body.scale(1.7, 0.85, 0.8);
  body.translate(0, 0.32, 0);
  const head = new THREE.SphereGeometry(0.15, 10, 8);
  head.translate(0.4, 0.46, 0);
  const snout = new THREE.ConeGeometry(0.07, 0.18, 6);
  snout.rotateZ(-Math.PI / 2);
  snout.translate(0.6, 0.43, 0);
  const earL = new THREE.ConeGeometry(0.05, 0.14, 4);
  earL.translate(0.38, 0.64, 0.07);
  const earR = earL.clone();
  earR.translate(0, 0, -0.14);
  const tail = new THREE.CapsuleGeometry(0.08, 0.32, 2, 6);
  tail.rotateZ(Math.PI / 2.6);
  tail.translate(-0.48, 0.4, 0);
  const tip = new THREE.SphereGeometry(0.075, 6, 5);
  tip.translate(-0.66, 0.5, 0);
  const legs = new THREE.CylinderGeometry(0.035, 0.035, 0.22, 5);
  legs.translate(0.2, 0.11, 0);
  const legs2 = legs.clone();
  legs2.translate(-0.4, 0, 0);
  return [
    { geometry: body, color: '#d2692c' },
    { geometry: head, color: '#d97433' },
    { geometry: snout, color: '#f1e6d6' },
    { geometry: earL, color: '#3a2a20' },
    { geometry: earR, color: '#3a2a20' },
    { geometry: tail, color: '#d2692c' },
    { geometry: tip, color: '#f6efe4' },
    { geometry: legs, color: '#3a2a20' },
    { geometry: legs2, color: '#3a2a20' },
  ];
}

function duckParts(): Part[] {
  const body = new THREE.SphereGeometry(0.25, 10, 8);
  body.scale(1.4, 0.75, 0.95);
  body.translate(0, 0.08, 0);
  const head = new THREE.SphereGeometry(0.13, 10, 8);
  head.translate(0.28, 0.32, 0);
  const beak = new THREE.ConeGeometry(0.05, 0.14, 6);
  beak.rotateZ(-Math.PI / 2);
  beak.translate(0.45, 0.3, 0);
  return [
    { geometry: body, color: '#8a6b4a' },
    { geometry: head, color: '#2f6b45' },
    { geometry: beak, color: '#e0a92e' },
  ];
}

function fishParts(): Part[] {
  const body = new THREE.SphereGeometry(0.16, 10, 8);
  body.scale(1.6, 0.7, 0.55);
  const tail = new THREE.ConeGeometry(0.11, 0.18, 4);
  tail.rotateZ(Math.PI / 2);
  tail.scale(1, 1, 0.3);
  tail.translate(-0.3, 0, 0);
  return [
    { geometry: body, color: '#f08a3c' },
    { geometry: tail, color: '#f3b24a' },
  ];
}

/** 1 種類の生き物を、部位ごとの InstancedMesh で描く */
export class CreatureMeshes {
  readonly meshes: THREE.InstancedMesh[];

  constructor(parts: Part[], max = MAX_PER_KIND) {
    this.meshes = parts.map((p) => {
      const mesh = new THREE.InstancedMesh(
        p.geometry,
        new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.8 }),
        max,
      );
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return mesh;
    });
  }

  set(i: number, m: THREE.Matrix4): void {
    for (const mesh of this.meshes) mesh.setMatrixAt(i, m);
  }

  finish(count: number): void {
    for (const mesh of this.meshes) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

export class CreatureView {
  readonly group = new THREE.Group();
  private readonly kinds: Record<CreatureKind, CreatureMeshes>;
  private readonly map: Heightmap;
  /** 水面の高さ。季節で水位が変わると外から書き換える */
  waterLevel: number;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(map: Heightmap, waterLevel: number) {
    this.map = map;
    this.waterLevel = waterLevel;
    this.kinds = {
      rabbit: new CreatureMeshes(rabbitParts()),
      duck: new CreatureMeshes(duckParts()),
      fish: new CreatureMeshes(fishParts()),
      fox: new CreatureMeshes(foxParts()),
    };
    // 魚は水面より先に描かれるよう、不透明物として普通に追加する（水面は透明）
    for (const k of Object.values(this.kinds)) for (const mesh of k.meshes) this.group.add(mesh);
  }

  update(creatures: readonly Creature[]): void {
    const counts: Record<CreatureKind, number> = { rabbit: 0, duck: 0, fish: 0, fox: 0 };
    for (const c of creatures) {
      const i = counts[c.kind];
      if (i >= MAX_PER_KIND) continue;
      let y = 0;
      switch (c.kind) {
        case 'fox':
          y = this.map.heightAt(c.x, c.z) + Math.abs(Math.sin(c.phase * 0.7)) * 0.04;
          break;
        case 'rabbit':
          // 歩いているときだけぴょんぴょん跳ねる
          y = this.map.heightAt(c.x, c.z) + (c.speed > 0 ? Math.abs(Math.sin(c.phase)) * 0.18 : 0);
          break;
        case 'duck':
          y = this.waterLevel - 0.02 + Math.sin(c.phase) * 0.02;
          break;
        case 'fish':
          y = this.waterLevel - 0.3 + Math.sin(c.phase) * 0.05;
          break;
      }
      this.p.set(c.x, y, c.z);
      this.q.setFromAxisAngle(this.up, -c.heading);
      this.m.compose(this.p, this.q, this.s);
      this.kinds[c.kind].set(i, this.m);
      counts[c.kind]++;
    }
    for (const kind of Object.keys(this.kinds) as CreatureKind[]) this.kinds[kind].finish(counts[kind]);
  }
}

/** クマの形（頭が +X 方向）。ほかの生き物よりずっと大きい */
export function bearParts(): Part[] {
  const body = new THREE.SphereGeometry(0.5, 12, 10);
  body.scale(1.5, 0.95, 0.95);
  body.translate(0, 0.75, 0);
  const head = new THREE.SphereGeometry(0.32, 12, 10);
  head.translate(0.78, 1.0, 0);
  const snout = new THREE.SphereGeometry(0.14, 8, 6);
  snout.scale(1.3, 0.9, 1);
  snout.translate(1.06, 0.94, 0);
  const earL = new THREE.SphereGeometry(0.1, 6, 5);
  earL.translate(0.72, 1.3, 0.2);
  const earR = earL.clone();
  earR.translate(0, 0, -0.4);
  const legs: THREE.BufferGeometry[] = [];
  for (const [lx, lz] of [[0.45, 0.28], [0.45, -0.28], [-0.45, 0.28], [-0.45, -0.28]]) {
    const leg = new THREE.CylinderGeometry(0.13, 0.13, 0.5, 8);
    leg.translate(lx, 0.25, lz);
    legs.push(leg);
  }
  return [
    { geometry: body, color: '#4a3324' },
    { geometry: head, color: '#533a29' },
    { geometry: snout, color: '#b58f6b' },
    { geometry: earL, color: '#3d2a1d' },
    { geometry: earR, color: '#3d2a1d' },
    ...legs.map((geometry) => ({ geometry, color: '#3a281b' })),
  ];
}
