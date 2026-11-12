import * as THREE from 'three';

/**
 * 地下水位の高さに置いた水面。地形がこの高さより低いところが池として見える。
 * 今はシンプルな平面＋流れる法線マップだけ。将来は水の流れのシミュレーションに置き換える想定。
 */
export class Water {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshPhysicalMaterial>;
  private readonly normalMap: THREE.Texture;

  constructor(size: number, level: number) {
    this.normalMap = createRippleNormalMap(128);
    this.normalMap.wrapS = this.normalMap.wrapT = THREE.RepeatWrapping;
    this.normalMap.repeat.set(size / 8, size / 8);

    const geometry = new THREE.PlaneGeometry(size, size);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshPhysicalMaterial({
      color: '#3f7f9a',
      roughness: 0.08,
      metalness: 0,
      transparent: true,
      opacity: 0.72,
      normalMap: this.normalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = level;
    this.mesh.renderOrder = 1;
  }

  update(time: number): void {
    // 法線マップを少しずつずらしてさざ波に見せる
    this.normalMap.offset.set(time * 0.01, time * 0.006);
  }
}

/** タイル可能なノイズから法線マップを作る（外部画像なし） */
function createRippleNormalMap(n: number): THREE.DataTexture {
  const height = new Float32Array(n * n);
  // 周期的なサイン波の合成なので継ぎ目なしでタイルできる
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = (x / n) * Math.PI * 2;
      const v = (y / n) * Math.PI * 2;
      height[y * n + x] =
        Math.sin(u * 3 + v * 2) * 0.5 +
        Math.sin(u * 5 - v * 4 + 1.3) * 0.3 +
        Math.sin(u * 9 + v * 7 + 2.1) * 0.15 +
        Math.sin(-u * 13 + v * 11 + 0.7) * 0.08;
    }
  }
  const data = new Uint8Array(n * n * 4);
  const at = (x: number, y: number) => height[((y + n) % n) * n + ((x + n) % n)];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = at(x + 1, y) - at(x - 1, y);
      const dy = at(x, y + 1) - at(x, y - 1);
      const v = new THREE.Vector3(-dx, -dy, 1).normalize();
      const i = (y * n + x) * 4;
      data[i] = (v.x * 0.5 + 0.5) * 255;
      data[i + 1] = (v.y * 0.5 + 0.5) * 255;
      data[i + 2] = (v.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}
