import * as THREE from 'three';
import type { Heightmap } from './heightmap';

const SEGMENTS = 64;

/** 地面に沿って描くブラシ範囲の円 */
export class BrushCursor {
  readonly line: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly map: Heightmap;
  private radius = 3;

  constructor(map: Heightmap) {
    this.map = map;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEGMENTS * 3), 3));
    this.line = new THREE.LineLoop(
      geo,
      new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthTest: false }),
    );
    this.line.renderOrder = 10;
    this.line.frustumCulled = false;
  }

  setRadius(r: number): void {
    this.radius = r;
  }

  update(center: THREE.Vector3 | null): void {
    if (!center) {
      this.line.geometry.setDrawRange(0, 0);
      return;
    }
    const pos = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      const x = center.x + Math.cos(a) * this.radius;
      const z = center.z + Math.sin(a) * this.radius;
      pos.setXYZ(i, x, this.map.heightAt(x, z) + 0.08, z);
    }
    pos.needsUpdate = true;
    this.line.geometry.setDrawRange(0, SEGMENTS);
  }
}
