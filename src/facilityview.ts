import * as THREE from 'three';
import type { Heightmap } from './heightmap';
import type { Facility, FacilityKind } from './facilities';

const wood = new THREE.MeshStandardMaterial({ color: '#8a5a36', roughness: 0.9 });
const darkWood = new THREE.MeshStandardMaterial({ color: '#5e3b22', roughness: 0.9 });
const roofGreen = new THREE.MeshStandardMaterial({ color: '#4f7f4a', roughness: 0.8, flatShading: true });
const cream = new THREE.MeshStandardMaterial({ color: '#f2e6cc', roughness: 0.9 });
const awningRed = new THREE.MeshStandardMaterial({ color: '#d9644a', roughness: 0.8 });

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** 4 本柱と三角屋根、ベンチ */
function rest(): THREE.Group {
  const g = new THREE.Group();
  for (const [x, z] of [[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.6], [0.8, 0.6]]) g.add(box(0.12, 1.3, 0.12, wood, x, 0.65, z));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.7, 4), roofGreen);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.85);
  roof.position.y = 1.65;
  roof.castShadow = true;
  g.add(roof);
  g.add(box(1.2, 0.08, 0.35, darkWood, 0, 0.42, 0));
  g.add(box(1.2, 0.3, 0.06, darkWood, 0, 0.6, -0.16));
  return g;
}

/** 小屋と赤白の日よけ */
function shop(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.6, 1.1, 1.1, cream, 0, 0.55, -0.1));
  g.add(box(1.75, 0.12, 1.25, darkWood, 0, 1.16, -0.1));
  for (let i = 0; i < 4; i++) {
    const s = box(0.42, 0.05, 0.6, i % 2 ? cream : awningRed, -0.63 + i * 0.42, 0.95, 0.62);
    s.rotation.x = 0.35;
    g.add(s);
  }
  g.add(box(1.4, 0.08, 0.3, wood, 0, 0.6, 0.55));
  return g;
}

/** 4 本脚の見晴らし台と手すり */
function tower(): THREE.Group {
  const g = new THREE.Group();
  for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) g.add(box(0.16, 3.2, 0.16, wood, x, 1.6, z));
  g.add(box(1.9, 0.12, 1.9, darkWood, 0, 3.2, 0));
  for (const [w, d, x, z] of [[1.9, 0.06, 0, 0.92], [1.9, 0.06, 0, -0.92], [0.06, 1.9, 0.92, 0], [0.06, 1.9, -0.92, 0]]) {
    g.add(box(w, 0.4, d, wood, x, 3.45, z));
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.8, 4), roofGreen);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 4.6;
  roof.castShadow = true;
  g.add(roof);
  for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) g.add(box(0.08, 0.9, 0.08, wood, x, 3.75, z));
  return g;
}

const leafDeep = new THREE.MeshStandardMaterial({ color: '#3f7a3c', roughness: 0.9, flatShading: true });
const leafLight = new THREE.MeshStandardMaterial({ color: '#5c9a4c', roughness: 0.9, flatShading: true });
const stone = new THREE.MeshStandardMaterial({ color: '#b9b2a3', roughness: 1, flatShading: true });
const signGreen = new THREE.MeshStandardMaterial({ color: '#6b9a5a', roughness: 0.8 });

/** 切妻屋根（棟が z 方向）。底の中心が原点 */
function gable(w: number, h: number, len: number, mat: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
  geo.translate(0, 0, -len / 2);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

/** 小屋と、+x 側で回る水車（+x を水のほうへ向けて置く） */
function mill(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.5, 0.3, 1.5, stone, -0.3, 0.15, 0));
  g.add(box(1.4, 1.3, 1.4, cream, -0.3, 0.95, 0));
  const roof = gable(1.7, 0.8, 1.7, roofGreen);
  roof.position.set(-0.3, 1.6, 0);
  g.add(roof);
  g.add(box(0.4, 0.7, 0.06, darkWood, -0.3, 0.65, 0.71));
  // 水車：輪と 8枚の羽根。車軸（x 軸）まわりに回す
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.07, 6, 20), darkWood);
  rim.rotation.y = Math.PI / 2;
  rim.castShadow = true;
  wheel.add(rim);
  for (let i = 0; i < 4; i++) {
    const spoke = box(0.07, 1.7, 0.07, wood);
    spoke.rotation.x = (i * Math.PI) / 4;
    wheel.add(spoke);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const paddle = box(0.34, 0.05, 0.3, wood, 0, Math.cos(a) * 0.85, Math.sin(a) * 0.85);
    paddle.rotation.x = a;
    wheel.add(paddle);
  }
  wheel.position.set(0.68, 0.8, 0);
  wheel.userData.spin = 0.9;
  g.add(wheel);
  g.add(box(0.5, 0.1, 0.1, darkWood, 0.5, 0.8, 0));
  g.scale.setScalar(1.25);
  return g;
}

/** 横に長い建物と切妻屋根、入口のひさし */
function center(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(3.2, 0.2, 2, stone, 0, 0.1, 0));
  g.add(box(3, 1.4, 1.8, cream, 0, 0.9, 0));
  const roof = gable(2.2, 0.9, 3.3, roofGreen);
  roof.rotation.y = Math.PI / 2;
  roof.position.y = 1.6;
  g.add(roof);
  // 入口のひさしと看板
  for (const x of [-0.6, 0.6]) g.add(box(0.1, 1.2, 0.1, wood, x, 0.8, 1.35));
  g.add(box(1.5, 0.08, 0.6, darkWood, 0, 1.42, 1.15));
  g.add(box(0.6, 0.95, 0.06, darkWood, 0, 0.68, 0.91));
  g.add(box(1, 0.3, 0.06, signGreen, 0, 1.68, 1.4));
  for (const x of [-1.05, 1.05]) g.add(box(0.5, 0.5, 0.06, wood, x, 1.05, 0.91));
  return g;
}

/** 太い幹と、いくつもの葉のかたまり */
function bigtree(): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.75, 3.6, 8), darkWood);
  trunk.position.y = 1.8;
  trunk.castShadow = true;
  g.add(trunk);
  for (const [x, y, z, rz, rx] of [[0.7, 3.4, 0.2, -0.8, 0], [-0.7, 3.2, -0.3, 0.8, 0], [0.1, 3.5, -0.7, 0, -0.8]]) {
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 1.8, 6), darkWood);
    branch.position.set(x, y, z);
    branch.rotation.set(rx, 0, rz);
    branch.castShadow = true;
    g.add(branch);
  }
  const blobs: [number, number, number, number][] = [
    [0, 5.9, 0, 2.3],
    [1.9, 4.9, 0.4, 1.7],
    [-1.8, 4.7, -0.5, 1.8],
    [0.3, 4.8, -1.9, 1.6],
    [-0.4, 4.9, 1.8, 1.6],
    [1.1, 6.6, -0.8, 1.4],
    [-1, 6.5, 0.7, 1.4],
  ];
  blobs.forEach(([x, y, z, r], i) => {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), i % 2 ? leafLight : leafDeep);
    leaf.position.set(x, y, z);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    g.add(leaf);
  });
  return g;
}

const BUILDERS: Record<FacilityKind, () => THREE.Group> = { rest, shop, tower, mill, center, bigtree };

/** 施設を描く。数は少ないので、変わったときに作り直す */
export class FacilityView {
  readonly group = new THREE.Group();
  private readonly map: Heightmap;
  private key = '';
  /** 回して見せる部品（水車） */
  private spinners: THREE.Object3D[] = [];

  constructor(map: Heightmap) {
    this.map = map;
  }

  update(list: readonly Facility[]): void {
    const key = list
      .map((f) => `${f.id}:${f.x.toFixed(2)}:${f.z.toFixed(2)}:${this.map.heightAt(f.x, f.z).toFixed(2)}:${(f.angle ?? 0).toFixed(2)}`)
      .join('|');
    if (key === this.key) return;
    this.key = key;
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      c.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    this.spinners = [];
    for (const f of list) {
      const g = BUILDERS[f.kind]();
      g.position.set(f.x, this.map.heightAt(f.x, f.z), f.z);
      // 施設ごとに向きを少し変えて、並べても単調にならないように。向きが決まっている施設（水車小屋）はそれに従う
      g.rotation.y = f.angle !== undefined ? -f.angle : ((f.id * 137) % 360) * (Math.PI / 180);
      g.traverse((o) => {
        if (typeof o.userData.spin === 'number') this.spinners.push(o);
      });
      this.group.add(g);
    }
  }

  /** 水車を回す */
  animate(t: number): void {
    for (const o of this.spinners) o.rotation.x = t * (o.userData.spin as number);
  }
}
