import './style.css';
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { Heightmap, generateGentleTerrain, type BrushResult } from './heightmap';
import { TerrainMesh } from './terrain';
import { Water } from './water';
import { Forest } from './trees';
import { BrushCursor } from './cursor';
import { COSTS, computeStats, dailyIncome, type EcoStats } from './economy';
import { Hud, type Tool } from './ui';

// ---- ワールドの設定 ----
const MAP_SIZE = 128; // マス数（一辺）
const WATER_LEVEL = 0.5; // 地下水位。これより低い地面が池になる
const SECONDS_PER_DAY = 10; // 実時間何秒でゲーム内 1 日か

// ---- レンダラーとシーン ----
const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9cfe3');
scene.fog = new THREE.Fog('#a9cfe3', 120, 260);

// 見下ろし型のカメラ。斜め上から見て、右ドラッグで移動・中ドラッグで回転・ホイールで拡大縮小
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 55, 45);

const controls = new MapControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.screenSpacePanning = false;
controls.minDistance = 12;
controls.maxDistance = 140;
controls.minPolarAngle = 0.15;
controls.maxPolarAngle = 1.15; // 真横にはならないようにして「見下ろし」を保つ

// ---- 光 ----
scene.add(new THREE.HemisphereLight('#dff1ff', '#4b5a33', 1.4));
const sun = new THREE.DirectionalLight('#fff3dd', 2.2);
sun.position.set(-40, 70, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = sc.bottom = -80;
sc.right = sc.top = 80;
sc.near = 1;
sc.far = 200;
sun.shadow.bias = -0.0005;
scene.add(sun);

// ---- ワールド ----
const map = new Heightmap(MAP_SIZE);
generateGentleTerrain(map, 7, 1.9);

const terrain = new TerrainMesh(map, WATER_LEVEL);
scene.add(terrain.mesh);

const water = new Water(map.worldSize, WATER_LEVEL);
scene.add(water.mesh);

const forest = new Forest(map, WATER_LEVEL);
scene.add(forest.group);

const cursor = new BrushCursor(map);
scene.add(cursor.line);

// 最初からいくつか木を生やしておく（再現できる乱数）
{
  let s = 12345;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
  const half = map.worldSize / 2 - 2;
  for (let i = 0; i < 160; i++) forest.plant((rand() * 2 - 1) * half, (rand() * 2 - 1) * half, rand);
}

// ---- 運営の状態 ----
const state = {
  money: 1000,
  day: 1,
  dayTimer: 0,
  tool: 'dig' as Tool,
  brushRadius: 3,
};
let stats: EcoStats = computeStats(map, WATER_LEVEL, forest.trees);
let statsDirty = false;

const hud = new Hud({
  onToolChange: (tool) => setTool(tool),
  onBrushChange: (r) => {
    state.brushRadius = r;
    cursor.setRadius(r);
  },
});
hud.setTool(state.tool);
hud.setBrush(state.brushRadius);
cursor.setRadius(state.brushRadius);

function setTool(tool: Tool): void {
  state.tool = tool;
  hud.setTool(tool);
  // 「移動」のときだけ左ドラッグでカメラを動かす。それ以外は左ボタンを道具に使う
  controls.mouseButtons = {
    LEFT: tool === 'pan' ? THREE.MOUSE.PAN : null,
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.touches = {
    ONE: tool === 'pan' ? THREE.TOUCH.PAN : null,
    TWO: THREE.TOUCH.DOLLY_ROTATE,
  };
  cursor.line.visible = tool !== 'pan';
}
setTool(state.tool);

// ---- 入力 ----
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerOnCanvas = false;
let toolActive = false;
let lastHit: THREE.Vector3 | null = null;

renderer.domElement.addEventListener('pointermove', (e) => {
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  pointerOnCanvas = true;
});
renderer.domElement.addEventListener('pointerleave', () => {
  pointerOnCanvas = false;
  toolActive = false;
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || state.tool === 'pan') return;
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  pointerOnCanvas = true;
  toolActive = true;
  renderer.domElement.setPointerCapture(e.pointerId);
  if (state.tool === 'tree') {
    const hit = pick();
    if (hit) plantTrees(hit);
  }
});
window.addEventListener('pointerup', () => {
  toolActive = false;
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  const keys: Record<string, Tool> = { '1': 'pan', '2': 'dig', '3': 'raise', '4': 'smooth', '5': 'tree' };
  if (keys[e.key]) setTool(keys[e.key]);
  if (e.key === '[') hud.stepBrush(state.brushRadius, -1);
  if (e.key === ']') hud.stepBrush(state.brushRadius, 1);
});

function pick(): THREE.Vector3 | null {
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(terrain.mesh, false)[0];
  return hit ? hit.point : null;
}

function spend(cost: number): boolean {
  if (state.money < cost) {
    hud.flash('資金が足りません', 'bad');
    return false;
  }
  state.money -= cost;
  return true;
}

function onTerrainEdited(region: BrushResult): void {
  terrain.refresh(region);
  const drowned = forest.onTerrainChanged(region);
  if (drowned > 0) hud.flash(`木が ${drowned} 本、水に沈みました`, 'bad');
  statsDirty = true;
}

function plantTrees(at: THREE.Vector3): void {
  // ブラシの範囲に数本まとめて植える
  const n = Math.max(1, Math.round(state.brushRadius * 0.7));
  let planted = 0;
  for (let i = 0; i < n * 3 && planted < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = i === 0 ? 0 : Math.sqrt(Math.random()) * state.brushRadius;
    const x = at.x + Math.cos(a) * r;
    const z = at.z + Math.sin(a) * r;
    if (!forest.canPlant(x, z)) continue;
    if (!spend(COSTS.tree)) break;
    forest.plant(x, z);
    planted++;
  }
  if (planted > 0) statsDirty = true;
}

/** 押している間、毎フレーム少しずつ地形を変える */
function applyTool(dt: number): void {
  if (!toolActive || !lastHit) return;
  const { x, z } = lastHit;
  const r = state.brushRadius;
  let region: BrushResult | null = null;
  switch (state.tool) {
    case 'dig':
      if (!spend(COSTS.terraform)) return;
      region = map.applyBrush(x, z, r, -2.5 * dt);
      break;
    case 'raise':
      if (!spend(COSTS.terraform)) return;
      region = map.applyBrush(x, z, r, 2.5 * dt);
      break;
    case 'smooth':
      if (!spend(COSTS.terraform)) return;
      region = map.smooth(x, z, r, Math.min(1, 6 * dt));
      break;
    default:
      return;
  }
  if (region) onTerrainEdited(region);
}

// ---- メインループ ----
const clock = new THREE.Clock();
let statsTimer = 0;

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  lastHit = pointerOnCanvas && state.tool !== 'pan' ? pick() : null;
  cursor.update(lastHit);
  applyTool(dt);

  // 統計は重めなので、変化があったときだけ間引いて計算する
  statsTimer += dt;
  if (statsDirty && statsTimer > 0.25) {
    stats = computeStats(map, WATER_LEVEL, forest.trees);
    statsDirty = false;
    statsTimer = 0;
  }

  // 1 日が過ぎるごとに入園料が入る
  state.dayTimer += dt;
  if (state.dayTimer >= SECONDS_PER_DAY) {
    state.dayTimer -= SECONDS_PER_DAY;
    state.day++;
    const income = dailyIncome(stats);
    state.money += income;
    hud.flash(`${state.day - 1}日目の入園料  +${income.toLocaleString()} G`, 'good');
  }

  hud.update({
    money: state.money,
    day: state.day,
    dayProgress: state.dayTimer / SECONDS_PER_DAY,
    trees: forest.trees.length,
    ...stats,
  });

  water.update(t);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
