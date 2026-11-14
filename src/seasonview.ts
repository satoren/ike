import * as THREE from 'three';
import './seasons.css';
import type { Heightmap } from './heightmap';
import { DAYS_PER_SEASON, SEASONS, WEATHER, bonusLabel, type Calendar, type Season, type Weather } from './seasons';
import { t } from './i18n';

/** 季節ごとの見た目 */
const LOOK: Record<Season, { foliage: string; foliageAmount: number; ground: string; groundAmount: number }> = {
  spring: { foliage: '#f6b9cb', foliageAmount: 0.78, ground: '#ffffff', groundAmount: 0 }, // 桜
  summer: { foliage: '#2f7d3a', foliageAmount: 0.15, ground: '#ffffff', groundAmount: 0 },
  autumn: { foliage: '#d8702a', foliageAmount: 0.7, ground: '#c9a25a', groundAmount: 0.2 }, // 紅葉
  winter: { foliage: '#dfe6e3', foliageAmount: 0.55, ground: '#f3f6f8', groundAmount: 0.6 }, // 雪
};

/**
 * 天気ごとの空と光。昼夜の空と光（夜間営業）の上に重ねる：
 * 空の色を sky へ mix の割合で寄せ、日差しと空の明るさに倍率を掛ける。
 */
const SKY: Record<Weather, { sky: string; mix: number; sun: number; hemi: number }> = {
  sunny: { sky: '#a9cfe3', mix: 0, sun: 1, hemi: 1 },
  cloudy: { sky: '#b8c4cb', mix: 0.75, sun: 0.5, hemi: 1.07 },
  rain: { sky: '#8796a0', mix: 0.85, sun: 0.25, hemi: 0.9 },
  snow: { sky: '#d3dce2', mix: 0.8, sun: 0.36, hemi: 1.15 },
};

const WATER_COLOR = new THREE.Color('#3f7f9a');
const ICE_COLOR = new THREE.Color('#d9eaf1');

interface Tint {
  color: { value: THREE.Color };
  amount: { value: number };
}

/** マテリアルの色を、指定した色へ amount の割合で寄せられるようにする（複数のマテリアルで共有できる） */
function addTint(materials: THREE.MeshStandardMaterial[]): Tint {
  const tint: Tint = { color: { value: new THREE.Color('#ffffff') }, amount: { value: 0 } };
  for (const material of materials) applyTint(material, tint);
  return tint;
}

function applyTint(material: THREE.MeshStandardMaterial, tint: Tint): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSeasonTint = tint.color;
    shader.uniforms.uSeasonAmount = tint.amount;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 uSeasonTint;\nuniform float uSeasonAmount;\nvoid main() {')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, uSeasonTint, uSeasonAmount);',
      );
  };
  material.needsUpdate = true;
}

/** 現在値を目標へなめらかに寄せる（季節や天気が変わったときのフェード） */
function approach(current: number, target: number, dt: number, speed = 1.5): number {
  return current + (target - current) * Math.min(1, dt * speed);
}

export interface SeasonViewTargets {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  water: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  /** 地面のマテリアル（冬は雪で白くなる） */
  ground: THREE.MeshStandardMaterial[];
  foliage: THREE.MeshStandardMaterial;
  map: Heightmap;
  waterLevel: number;
}

/**
 * 季節と天気の見た目：空の色・光、葉の色（桜・紅葉・雪）、地面の雪、凍った池、
 * 雨や雪の粒、冬の池で滑るスケート客。
 */
export class SeasonView {
  private readonly t: SeasonViewTargets;
  private readonly foliageTint: Tint;
  private readonly groundTint: Tint;
  private season: Season = 'spring';
  private weather: Weather = 'sunny';
  private frozen = 0;
  private readonly sky = new THREE.Color('#a9cfe3');
  private skyMix = 0;
  private sunMul = 1;
  private hemiMul = 1;
  private readonly rain: Precipitation;
  private readonly snow: Precipitation;
  private readonly skaters: Skaters;

  constructor(targets: SeasonViewTargets) {
    this.t = targets;
    this.foliageTint = addTint([targets.foliage]);
    this.groundTint = addTint(targets.ground);
    this.rain = new Precipitation('rain', 1800);
    this.snow = new Precipitation('snow', 1400);
    this.skaters = new Skaters(targets.map);
    targets.scene.add(this.rain.object, this.snow.object, this.skaters.group);
  }

  set(season: Season, weather: Weather, immediate = false): void {
    this.season = season;
    this.weather = weather;
    if (immediate) this.update(10, 0, 0, 0, new THREE.Vector3());
  }

  /**
   * 昼夜の空と光を設定したあとに毎フレーム呼ぶ。
   * waterOffset: 地下水位からの水面の差。skaters: 滑っている客の数。dark: 夜の暗さ（0〜1）
   */
  update(dt: number, time: number, waterOffset: number, skaters: number, center: THREE.Vector3, dark = 0): void {
    const look = LOOK[this.season];
    const sky = SKY[this.weather];

    // 空と光：昼夜の色の上に天気を重ねる（夜は空の色を変えず、暗さを保つ）
    this.sky.lerp(new THREE.Color(sky.sky), Math.min(1, dt * 1.5));
    this.skyMix = approach(this.skyMix, sky.mix, dt);
    this.sunMul = approach(this.sunMul, sky.sun, dt);
    this.hemiMul = approach(this.hemiMul, sky.hemi, dt);
    const scene = this.t.scene;
    const bg = scene.background as THREE.Color;
    bg.lerp(this.sky, this.skyMix * (1 - dark));
    if (scene.fog) scene.fog.color.copy(bg);
    this.t.sun.intensity *= this.sunMul;
    this.t.hemi.intensity *= this.hemiMul;

    // 葉と地面の色
    this.foliageTint.color.value.lerp(new THREE.Color(look.foliage), Math.min(1, dt * 1.5));
    this.foliageTint.amount.value = approach(this.foliageTint.amount.value, look.foliageAmount, dt);
    this.groundTint.color.value.lerp(new THREE.Color(look.ground), Math.min(1, dt * 1.5));
    this.groundTint.amount.value = approach(this.groundTint.amount.value, look.groundAmount, dt);

    // 池：水位と凍結
    const level = this.t.waterLevel + waterOffset;
    this.frozen = approach(this.frozen, this.season === 'winter' ? 1 : 0, dt, 0.8);
    const w = this.t.water;
    w.position.y = level;
    const m = w.material;
    m.color.copy(WATER_COLOR).lerp(ICE_COLOR, this.frozen);
    m.opacity = 0.72 + 0.24 * this.frozen;
    m.roughness = 0.08 + 0.3 * this.frozen;
    m.normalScale.setScalar(0.35 * (1 - this.frozen) + 0.04);

    // 雨と雪
    this.rain.update(dt, center, this.weather === 'rain');
    this.snow.update(dt, center, this.weather === 'snow');

    this.skaters.update(dt, time, this.frozen > 0.9 ? skaters : 0, level);
  }
}

/** カメラの注視点のまわりに降らせる雨や雪 */
class Precipitation {
  readonly object: THREE.LineSegments | THREE.Points;
  private readonly pos: Float32Array;
  private readonly kind: 'rain' | 'snow';
  private readonly n: number;
  private visibleAmount = 0;
  private readonly area = 90;
  private readonly height = 40;
  private readonly offsets: Float32Array;

  constructor(kind: 'rain' | 'snow', n: number) {
    this.kind = kind;
    this.n = n;
    // 粒ごとの位置（注視点からの相対）
    this.offsets = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.offsets[i * 3] = (Math.random() - 0.5) * this.area;
      this.offsets[i * 3 + 1] = Math.random() * this.height;
      this.offsets[i * 3 + 2] = (Math.random() - 0.5) * this.area;
    }
    const geo = new THREE.BufferGeometry();
    if (kind === 'rain') {
      this.pos = new Float32Array(n * 6);
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      this.object = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({ color: '#dbe7ef', transparent: true, opacity: 0, depthWrite: false }),
      );
    } else {
      this.pos = new Float32Array(n * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      this.object = new THREE.Points(
        geo,
        new THREE.PointsMaterial({ color: '#ffffff', size: 0.35, transparent: true, opacity: 0, depthWrite: false, map: dotTexture() }),
      );
    }
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  update(dt: number, center: THREE.Vector3, active: boolean): void {
    this.visibleAmount = approach(this.visibleAmount, active ? 1 : 0, dt, 1);
    const mat = this.object.material as THREE.Material & { opacity: number };
    mat.opacity = this.visibleAmount * (this.kind === 'rain' ? 0.55 : 0.95);
    this.object.visible = this.visibleAmount > 0.02;
    if (!this.object.visible) return;

    const fall = this.kind === 'rain' ? 28 : 2.5;
    const o = this.offsets;
    const half = this.area / 2;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      o[k + 1] -= fall * dt;
      if (this.kind === 'snow') {
        // ひらひらと横に揺れる
        o[k] += Math.sin(o[k + 1] * 0.7 + i) * dt * 0.6;
      }
      if (o[k + 1] < 0) o[k + 1] += this.height;
      // 注視点が動いても粒が付いてくるように、範囲の外に出たら反対側へ回す
      const x = wrap(o[k] - center.x, half) + center.x;
      const z = wrap(o[k + 2] - center.z, half) + center.z;
      const y = o[k + 1];
      if (this.kind === 'rain') {
        const j = i * 6;
        this.pos[j] = x;
        this.pos[j + 1] = y;
        this.pos[j + 2] = z;
        this.pos[j + 3] = x + 0.08;
        this.pos[j + 4] = y + 0.9;
        this.pos[j + 5] = z;
      } else {
        this.pos[k] = x;
        this.pos[k + 1] = y;
        this.pos[k + 2] = z;
      }
    }
    (this.object.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}

function wrap(v: number, half: number): number {
  const size = half * 2;
  return ((((v + half) % size) + size) % size) - half;
}

function dotTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

interface Skater {
  mesh: THREE.Group;
  x: number;
  z: number;
  heading: number;
  turn: number;
}

const SKATER_COLORS = ['#c8553d', '#3a8bb0', '#d29a26', '#7a5aa6', '#3d9b6e'];
const MAX_SKATERS = 14;

/** 凍った池を滑るスケート客 */
class Skaters {
  readonly group = new THREE.Group();
  private readonly list: Skater[] = [];
  private readonly map: Heightmap;

  constructor(map: Heightmap) {
    this.map = map;
    const body = new THREE.CapsuleGeometry(0.16, 0.4, 3, 8);
    body.translate(0, 0.38, 0);
    const head = new THREE.SphereGeometry(0.13, 10, 8);
    head.translate(0, 0.82, 0);
    const scarf = new THREE.TorusGeometry(0.12, 0.04, 6, 12);
    scarf.rotateX(Math.PI / 2);
    scarf.translate(0, 0.66, 0);
    const skin = new THREE.MeshStandardMaterial({ color: '#f1d2b4', roughness: 0.8 });
    const white = new THREE.MeshStandardMaterial({ color: '#f7f4ec', roughness: 0.8 });
    for (let i = 0; i < MAX_SKATERS; i++) {
      const g = new THREE.Group();
      const coat = new THREE.MeshStandardMaterial({ color: SKATER_COLORS[i % SKATER_COLORS.length], roughness: 0.8 });
      const b = new THREE.Mesh(body, coat);
      b.castShadow = true;
      g.add(b, new THREE.Mesh(head, skin), new THREE.Mesh(scarf, white));
      g.visible = false;
      this.group.add(g);
      this.list.push({ mesh: g, x: 0, z: 0, heading: 0, turn: 0 });
    }
  }

  private onIce(x: number, z: number, level: number): boolean {
    const half = this.map.worldSize / 2 - 1;
    if (Math.abs(x) > half || Math.abs(z) > half) return false;
    return this.map.heightAt(x, z) < level - 0.15;
  }

  /** 池の中のどこかに置く。見つからなければ false */
  private place(s: Skater, level: number): boolean {
    const half = this.map.worldSize / 2 - 2;
    for (let i = 0; i < 300; i++) {
      const x = (Math.random() * 2 - 1) * half;
      const z = (Math.random() * 2 - 1) * half;
      if (!this.onIce(x, z, level)) continue;
      s.x = x;
      s.z = z;
      s.heading = Math.random() * Math.PI * 2;
      s.turn = (Math.random() - 0.5) * 0.8;
      return true;
    }
    return false;
  }

  update(dt: number, time: number, count: number, level: number): void {
    const n = Math.min(MAX_SKATERS, count);
    for (let i = 0; i < this.list.length; i++) {
      const s = this.list[i];
      if (i >= n) {
        s.mesh.visible = false;
        continue;
      }
      if (!s.mesh.visible) {
        if (!this.place(s, level)) continue;
        s.mesh.visible = true;
      }
      if (!this.onIce(s.x, s.z, level)) {
        // 足元が氷でなくなった（池が埋め立てられたなど）
        s.mesh.visible = false;
        continue;
      }
      // ゆるやかに弧を描いて滑る。岸に近づいたら向きを変える
      s.heading += s.turn * dt;
      const speed = 2.2;
      const nx = s.x + Math.cos(s.heading) * speed * dt;
      const nz = s.z + Math.sin(s.heading) * speed * dt;
      if (this.onIce(nx, nz, level)) {
        s.x = nx;
        s.z = nz;
      } else {
        s.heading += Math.PI * (0.5 + Math.random() * 0.5);
        s.turn = -s.turn;
      }
      s.mesh.position.set(s.x, level, s.z);
      s.mesh.rotation.set(0, -s.heading + Math.PI / 2, Math.sin(time * 3 + i) * 0.12);
    }
  }
}

// ---- 画面上の季節と天気の表示 ----

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const WEATHER_ICON: Record<Weather, string> = {
  sunny: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  cloudy: svg('<path d="M7 18h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 18z"/>'),
  rain: svg('<path d="M7 14h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 14z"/><path d="M8 17.5 7 20M12 17.5l-1 2.5M16 17.5l-1 2.5"/>'),
  snow: svg('<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M10 4.5 12 6l2-1.5M10 19.5 12 18l2 1.5"/>'),
};

const SEASON_ICON: Record<Season, string> = {
  spring: svg('<circle cx="12" cy="12" r="2"/><path d="M12 10c-1.8-3-1-6 0-7 1 1 1.8 4 0 7zM14 12c3-1.8 6-1 7 0-1 1-4 1.8-7 0zM12 14c1.8 3 1 6 0 7-1-1-1.8-4 0-7zM10 12c-3 1.8-6 1-7 0 1-1 4-1.8 7 0z"/>'),
  summer: WEATHER_ICON.sunny,
  autumn: svg('<path d="M12 21v-5"/><path d="M12 16 6 18l1.5-3.5L3 12l3.5-1-1-4 3.5 2L12 3l3 6 3.5-2-1 4 3.5 1-4.5 2.5L18 18z"/>'),
  winter: WEATHER_ICON.snow,
};

const SEASON_HINT: Record<Season, string> = {
  spring: t('桜の季節。木、とくに水辺の木が多いほど花見客が来ます'),
  summer: t('晴れが続くと池の水位が下がり、浅瀬のカモや魚が居られなくなります'),
  autumn: t('木の実がよく実り、渡り鳥のカモが増えます。紅葉目当ての客も来ます'),
  winter: t('池が凍ってスケート場に。池が広いほど客が来ます。カモは去り、ウサギは減り、クマは冬眠します'),
};

/** 上部の「池づくり」の横に季節と天気を出す */
export class SeasonBadge {
  private readonly el: HTMLElement;
  private key = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('span');
    this.el.className = 'season-badge';
    parent.appendChild(this.el);
  }

  update(cal: Calendar, weather: Weather, bonus: number): void {
    const key = `${cal.season}/${cal.dayInSeason}/${weather}/${bonus}`;
    if (key === this.key) return;
    this.key = key;
    const label = bonusLabel(cal.season);
    this.el.dataset.season = cal.season;
    this.el.title =
      t('{0}年目の{1}（{2}/{3}日）\n', cal.year, SEASONS[cal.season].name, cal.dayInSeason, DAYS_PER_SEASON) +
      SEASON_HINT[cal.season] +
      (label ? t('\n{0}の魅力 +{1}', label, bonus) : '') +
      t('\n{0}：来園者 ×{1}', WEATHER[weather].name, WEATHER[weather].visitorMul);
    this.el.innerHTML = `
      <span class="season-name">${SEASON_ICON[cal.season]}${SEASONS[cal.season].name}</span>
      <span class="season-weather" data-weather="${weather}" aria-label="${WEATHER[weather].name}">${WEATHER_ICON[weather]}</span>
    `;
  }
}
