import * as THREE from 'three';
import type { Heightmap } from './heightmap';
import { RARE, RARE_ORDER, type RareKind, type RareState } from './rare';

const FIREFLIES_PER_SPOT = 14;
const MAX_SPOTS = 10;

/** 1 匹ごとに決まった揺れ方をさせるための値 */
interface FlyMotion {
  spot: number;
  dx: number;
  dz: number;
  y: number;
  speed: number;
  phase: number;
}

/**
 * 珍しい生き物を描く。
 * - ホタル：水辺の木のまわりで点滅しながら舞う、黄緑色の光
 * - オオサンショウウオ：浅瀬をゆっくり歩く、まだら模様の大きな体
 * どちらも見つけやすいよう、頭上に金色の目印を出す。
 */
export class RareView {
  readonly group = new THREE.Group();
  private readonly map: Heightmap;
  private readonly waterLevel: number;
  private readonly flies: THREE.Points;
  private readonly flyPos: Float32Array;
  private readonly flyGlow: Float32Array;
  private readonly motions: FlyMotion[] = [];
  private readonly salamander: THREE.Group;
  private readonly markers: THREE.Mesh[] = [];

  constructor(map: Heightmap, waterLevel: number) {
    this.map = map;
    this.waterLevel = waterLevel;

    const n = FIREFLIES_PER_SPOT * MAX_SPOTS;
    this.flyPos = new Float32Array(n * 3);
    this.flyGlow = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.motions.push({
        spot: Math.floor(i / FIREFLIES_PER_SPOT),
        dx: (Math.random() * 2 - 1) * 2.2,
        dz: (Math.random() * 2 - 1) * 2.2,
        y: 0.6 + Math.random() * 2.2,
        speed: 0.4 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.flyPos, 3));
    geo.setAttribute('glow', new THREE.BufferAttribute(this.flyGlow, 1));
    this.flies = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { color: { value: new THREE.Color('#d8ff6a') } },
        vertexShader: /* glsl */ `
          attribute float glow;
          varying float vGlow;
          void main() {
            vGlow = glow;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = max(3.0, (260.0 + 420.0 * glow) / -mv.z);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 color;
          varying float vGlow;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            a = a * a * (0.25 + 0.75 * vGlow);
            gl_FragColor = vec4(color * (1.0 + vGlow), a);
          }
        `,
      }),
    );
    this.flies.frustumCulled = false;
    this.flies.visible = false;
    this.group.add(this.flies);

    this.salamander = salamanderMesh();
    this.salamander.visible = false;
    this.group.add(this.salamander);

    const markerGeo = new THREE.OctahedronGeometry(0.3, 0);
    markerGeo.scale(1, 1.4, 1);
    for (let i = 0; i < RARE_ORDER.length; i++) {
      const m = new THREE.Mesh(
        markerGeo,
        new THREE.MeshBasicMaterial({ color: '#f2c14e', depthTest: false, transparent: true, opacity: 0.9 }),
      );
      m.renderOrder = 20;
      m.visible = false;
      this.markers.push(m);
      this.group.add(m);
    }
  }

  update(state: RareState, time: number): void {
    const fly = state.sightings.find((s) => s.kind === 'firefly');
    this.flies.visible = !!fly;
    if (fly) {
      const spots = fly.spots.slice(0, MAX_SPOTS);
      const count = spots.length * FIREFLIES_PER_SPOT;
      for (let i = 0; i < count; i++) {
        const m = this.motions[i];
        const [sx, sz] = spots[m.spot];
        const t = time * m.speed + m.phase;
        const x = sx + m.dx + Math.sin(t * 0.7) * 0.8;
        const z = sz + m.dz + Math.cos(t * 0.9) * 0.8;
        const ground = Math.max(this.map.heightAt(x, z), this.waterLevel);
        this.flyPos[i * 3] = x;
        this.flyPos[i * 3 + 1] = ground + m.y + Math.sin(t * 1.3) * 0.3;
        this.flyPos[i * 3 + 2] = z;
        // ゆっくり明滅する（ときどき強く光る）
        this.flyGlow[i] = Math.max(0, Math.sin(time * 2.2 * m.speed + m.phase * 3)) ** 3;
      }
      const geo = this.flies.geometry;
      geo.setDrawRange(0, count);
      geo.getAttribute('position').needsUpdate = true;
      geo.getAttribute('glow').needsUpdate = true;
    }

    const sal = state.sightings.find((s) => s.kind === 'salamander');
    this.salamander.visible = !!sal;
    if (sal) {
      const ground = this.map.heightAt(sal.x, sal.z);
      // 水面すれすれを泳ぐように見せる
      const y = Math.max(ground, this.waterLevel - 0.1) + Math.sin(time * 1.5) * 0.02;
      this.salamander.position.set(sal.x, y, sal.z);
      this.salamander.rotation.y = -sal.heading;
      const tail = this.salamander.getObjectByName('tail');
      if (tail) tail.rotation.y = Math.sin(time * 2.4) * 0.35;
    }

    RARE_ORDER.forEach((kind, i) => {
      const s = state.sightings.find((v) => v.kind === kind);
      const m = this.markers[i];
      m.visible = !!s;
      if (!s) return;
      const ground = Math.max(this.map.heightAt(s.x, s.z), this.waterLevel);
      m.position.set(s.x, ground + (kind === 'firefly' ? 4.6 : 2) + Math.sin(time * 3 + i) * 0.15, s.z);
      m.rotation.y = time * 1.5;
    });
  }
}

/** オオサンショウウオ（頭が +X 方向）。平たい体に、黒いまだら模様 */
function salamanderMesh(): THREE.Group {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: '#6b5a43', roughness: 0.85 });
  const spot = new THREE.MeshStandardMaterial({ color: '#2f271d', roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), skin);
  body.scale.set(1.6, 0.32, 0.7);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), skin);
  head.scale.set(1, 0.32, 1.05);
  head.position.set(0.85, 0.02, 0);
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(-0.75, 0, 0);
  const tailMesh = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), skin);
  tailMesh.scale.set(1.3, 0.28, 0.3);
  tailMesh.position.set(-0.5, 0, 0);
  tail.add(tailMesh);
  g.add(body, head, tail);
  for (const [x, z] of [
    [0.6, 0.18],
    [0.3, -0.22],
    [0, 0.25],
    [-0.35, -0.12],
    [-0.1, 0],
    [0.95, -0.15],
  ] as const) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), spot);
    s.scale.set(1.2, 0.4, 1);
    s.position.set(x, 0.14, z);
    g.add(s);
  }
  for (const [x, z] of [
    [0.5, 0.42],
    [0.5, -0.42],
    [-0.45, 0.38],
    [-0.45, -0.38],
  ] as const) {
    const leg = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), skin);
    leg.scale.set(1, 0.5, 1.4);
    leg.position.set(x, -0.04, z);
    g.add(leg);
  }
  for (const z of [0.2, -0.2]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), spot);
    eye.position.set(1.05, 0.12, z);
    g.add(eye);
  }
  g.traverse((o) => (o.castShadow = true));
  g.scale.setScalar(1.3);
  return g;
}

/** 画面左上の「話題」バッジ。居る生き物と、いま客がどれだけ増えているかを出す */
export class RareBadge {
  private readonly el: HTMLElement;
  private readonly text: HTMLElement;
  private lastKey = '';
  private lastPct = -1;
  private boost: HTMLElement | null = null;

  constructor(onFocus: (kind: RareKind) => void) {
    this.el = document.createElement('div');
    this.el.className = 'rare-badge card';
    this.el.hidden = true;
    this.el.innerHTML = `<span class="rare-badge-star" aria-hidden="true">✦</span><span class="rare-badge-text"></span>`;
    this.text = this.el.querySelector('.rare-badge-text')!;
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-kind]');
      if (b) onFocus(b.dataset.kind as RareKind);
    });
    document.getElementById('hud')!.appendChild(this.el);
  }

  update(state: RareState, boost: number): void {
    const kinds = state.sightings.map((s) => s.kind);
    const pct = Math.round((boost - 1) * 100);
    this.el.hidden = kinds.length === 0 && pct <= 0;
    // ボタンは居る生き物が変わったときだけ作り直す（毎回作ると押しにくい）
    const key = kinds.join(',');
    if (key !== this.lastKey || !this.boost) {
      this.lastKey = key;
      const buttons = kinds
        .map((k) => `<button type="button" class="rare-chip" data-kind="${k}" title="見に行く">${RARE[k].name}</button>`)
        .join('');
      this.text.innerHTML = `<b>話題</b>${buttons}<span class="rare-boost"></span>`;
      this.boost = this.text.querySelector('.rare-boost');
      this.lastPct = -1;
    }
    if (pct !== this.lastPct && this.boost) {
      this.lastPct = pct;
      this.boost.textContent = `来園者 +${pct}%`;
    }
  }
}
