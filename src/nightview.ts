import * as THREE from 'three';
import type { PathGrid, PathView } from './paths';

/** 昼・夕方・夜の空と光の色 */
const SKY = {
  day: new THREE.Color('#a9cfe3'),
  dusk: new THREE.Color('#e7a77e'),
  night: new THREE.Color('#18213b'),
};
const SUN = {
  day: { color: new THREE.Color('#fff3dd'), intensity: 2.2 },
  dusk: { color: new THREE.Color('#ffb070'), intensity: 1.2 },
  night: { color: new THREE.Color('#9fb4ff'), intensity: 0.35 },
};
const HEMI = {
  day: { sky: new THREE.Color('#dff1ff'), ground: new THREE.Color('#4b5a33'), intensity: 1.4 },
  night: { sky: new THREE.Color('#5d74b8'), ground: new THREE.Color('#1c2418'), intensity: 0.45 },
};

const MAX_LANTERNS = 400;
const POST_HEIGHT = 0.9;

/**
 * 昼夜の見た目。暗さに合わせて空と光の色を変え、夜間営業中は遊歩道の灯りをともす。
 */
export class NightView {
  readonly group = new THREE.Group();
  private readonly posts: THREE.InstancedMesh;
  private readonly bulbs: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly pools: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly tmp = new THREE.Color();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly sun: THREE.DirectionalLight,
    private readonly hemi: THREE.HemisphereLight,
  ) {
    const post = new THREE.CylinderGeometry(0.035, 0.05, POST_HEIGHT, 6);
    post.translate(0, POST_HEIGHT / 2, 0);
    this.posts = new THREE.InstancedMesh(post, new THREE.MeshStandardMaterial({ color: '#4a3a2c', roughness: 0.9 }), MAX_LANTERNS);
    this.posts.castShadow = true;

    const bulb = new THREE.SphereGeometry(0.11, 10, 8);
    bulb.translate(0, POST_HEIGHT + 0.06, 0);
    this.bulbs = new THREE.InstancedMesh(bulb, new THREE.MeshBasicMaterial({ color: '#fff1c4' }), MAX_LANTERNS);

    // 灯りの足もとに広がる光（加算合成の丸い板）
    const pool = new THREE.PlaneGeometry(4.2, 4.2);
    pool.rotateX(-Math.PI / 2);
    pool.translate(0, 0.04, 0);
    this.pools = new THREE.InstancedMesh(
      pool,
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: '#ffcf7a',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      MAX_LANTERNS,
    );
    this.pools.renderOrder = 2;

    for (const m of [this.posts, this.bulbs, this.pools]) {
      m.count = 0;
      m.frustumCulled = false;
      this.group.add(m);
    }
  }

  /** 灯りを道に合わせて立て直す */
  setLanterns(cells: readonly [number, number][], grid: PathGrid, view: PathView): void {
    const m = new THREE.Matrix4();
    const n = Math.min(cells.length, MAX_LANTERNS);
    for (let i = 0; i < n; i++) {
      const { x, z } = grid.center(cells[i][0], cells[i][1]);
      m.makeTranslation(x, view.floorY(x, z), z);
      this.posts.setMatrixAt(i, m);
      this.bulbs.setMatrixAt(i, m);
      this.pools.setMatrixAt(i, m);
    }
    for (const mesh of [this.posts, this.bulbs, this.pools]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** 暗さ（0〜1）と、灯りをともしているかで見た目を更新する */
  update(dark: number, lit: boolean): void {
    // 空：昼 → 夕焼け → 夜
    const sky = this.tmp;
    if (dark < 0.5) sky.copy(SKY.day).lerp(SKY.dusk, dark * 2);
    else sky.copy(SKY.dusk).lerp(SKY.night, dark * 2 - 1);
    (this.scene.background as THREE.Color).copy(sky);
    this.scene.fog?.color.copy(sky);

    if (dark < 0.5) {
      this.sun.color.copy(SUN.day.color).lerp(SUN.dusk.color, dark * 2);
      this.sun.intensity = THREE.MathUtils.lerp(SUN.day.intensity, SUN.dusk.intensity, dark * 2);
    } else {
      this.sun.color.copy(SUN.dusk.color).lerp(SUN.night.color, dark * 2 - 1);
      this.sun.intensity = THREE.MathUtils.lerp(SUN.dusk.intensity, SUN.night.intensity, dark * 2 - 1);
    }
    this.hemi.color.copy(HEMI.day.sky).lerp(HEMI.night.sky, dark);
    this.hemi.groundColor.copy(HEMI.day.ground).lerp(HEMI.night.ground, dark);
    this.hemi.intensity = THREE.MathUtils.lerp(HEMI.day.intensity, HEMI.night.intensity, dark);

    // 灯りは夜間営業のときだけ立てる。暗いほど明るく光る
    this.group.visible = lit;
    const glow = lit ? Math.max(0, (dark - 0.15) / 0.85) : 0;
    this.pools.material.opacity = glow * 0.85;
    this.bulbs.material.color.set('#8a7a5a').lerp(new THREE.Color('#fff1c4'), glow);
  }
}

/** 中心が明るく外へ向かって消えていく丸 */
function glowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
