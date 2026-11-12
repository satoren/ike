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

const BUILDERS: Record<FacilityKind, () => THREE.Group> = { rest, shop, tower };

/** 施設を描く。数は少ないので、変わったときに作り直す */
export class FacilityView {
  readonly group = new THREE.Group();
  private readonly map: Heightmap;
  private key = '';

  constructor(map: Heightmap) {
    this.map = map;
  }

  update(list: readonly Facility[]): void {
    const key = list.map((f) => `${f.id}:${f.x.toFixed(2)}:${f.z.toFixed(2)}:${this.map.heightAt(f.x, f.z).toFixed(2)}`).join('|');
    if (key === this.key) return;
    this.key = key;
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      c.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    for (const f of list) {
      const g = BUILDERS[f.kind]();
      g.position.set(f.x, this.map.heightAt(f.x, f.z), f.z);
      // 施設ごとに向きを少し変えて、並べても単調にならないように
      g.rotation.y = ((f.id * 137) % 360) * (Math.PI / 180);
      this.group.add(g);
    }
  }
}
