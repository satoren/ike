import './style.css';
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { Heightmap, generateGentleTerrain, type BrushResult } from './heightmap';
import { TerrainMesh } from './terrain';
import { Water } from './water';
import { Forest } from './trees';
import { BrushCursor } from './cursor';
import { COSTS, computeHabitat } from './economy';
import {
  ATTACK,
  Ecosystem,
  ITEMS,
  ITEM_ORDER,
  TICKET_PRICE,
  addPressure,
  attackChance,
  decayIncident,
  computeAppeal,
  decayPressure,
  emptyInventory,
  harvestFruit,
  inventoryValue,
  type CreatureKind,
  type Habitat,
  type ItemKind,
} from './ecology';
import { CreatureView } from './creatures';
import { PathGrid, PathView, SAFETY, Strollers, safety } from './paths';
import { BEAR, Bears, SHOT_COST, TRAP_COST } from './bears';
import { BearView } from './bearview';
import { RARE, RareLife, applyRareBoost, rareBoost, type RareKind } from './rare';
import { RareBadge, RareView } from './rareview';
import { POACHER, POACHER_TARGETS, Poachers } from './poachers';
import { PoacherView } from './poacherview';
import { SAVE_VERSION, SaveSlot, decodeFloats, base64ToBytes, bytesToBase64, encodeFloats, type SaveData } from './save';
import { Hud, type Tool } from './ui';
import { darkness, foxDangerFactor, isNight, lanternCells, lightingCost, nightFoxCount, nightVisitors } from './night';
import { NightView } from './nightview';
import { ReviewFeed } from './reviews';
import { ReviewPanel } from './reviewview';
import { BIRDS, FoodWeb, WEED, fishCapacity } from './foodweb';
import { FoodWebPanel, FoodWebView } from './foodwebview';

// ---- ワールドの設定 ----
const MAP_SIZE = 128; // マス数（一辺）
const WATER_LEVEL = 0.5; // 地下水位。これより低い地面が池になる
const SECONDS_PER_DAY = 10; // 実時間何秒でゲーム内 1 日か
const TERRAIN_BASE = 1.9; // 地形の基準の高さ（地図の縁もこの高さ）

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
camera.position.set(0, 42, 88);

const controls = new MapControls(camera, renderer.domElement);
controls.target.set(0, 0, 52); // 手前の出入口も画面に入るように
controls.enableDamping = true;
controls.screenSpacePanning = false;
controls.minDistance = 12;
controls.maxDistance = 140;
controls.minPolarAngle = 0.15;
controls.maxPolarAngle = 1.15; // 真横にはならないようにして「見下ろし」を保つ

// ---- 光 ----
const hemi = new THREE.HemisphereLight('#dff1ff', '#4b5a33', 1.4);
scene.add(hemi);
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
generateGentleTerrain(map, 7, TERRAIN_BASE);

const terrain = new TerrainMesh(map, WATER_LEVEL);
scene.add(terrain.mesh);

// 地図の外に広がる地面（遊べる範囲の外。縁の高さに合わせて置く）
{
  const outer = new THREE.Mesh(
    new THREE.RingGeometry(map.worldSize * 0.7, 400, 4, 1, Math.PI / 4),
    new THREE.MeshStandardMaterial({ color: '#64a043', roughness: 1 }),
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = TERRAIN_BASE - 0.02;
  outer.receiveShadow = true;
  scene.add(outer);
}

const water = new Water(map.worldSize, WATER_LEVEL);
scene.add(water.mesh);

const forest = new Forest(map, WATER_LEVEL);
scene.add(forest.group);

const paths = new PathGrid(map);
const pathView = new PathView(paths, map, WATER_LEVEL);
scene.add(pathView.group);
pathView.rebuild(); // 出入口と最初の道を表示
const strollers = new Strollers(paths, pathView);
scene.add(strollers.group);

// 昼夜の空と光、夜間営業の灯り
const nightView = new NightView(scene, sun, hemi);
scene.add(nightView.group);
let lanterns = 0;
function refreshLanterns(): void {
  const cells = lanternCells(paths);
  lanterns = cells.length;
  nightView.setLanterns(cells, paths, pathView);
}
refreshLanterns();

// キツネは柵付きの遊歩道に入れない
const ecosystem = new Ecosystem(map, WATER_LEVEL, Math.random, (kind, x, z) => kind === 'fox' && paths.isPathAt(x, z));
const creatureView = new CreatureView(map, WATER_LEVEL);
scene.add(creatureView.group);

const bears = new Bears(map, WATER_LEVEL);
const bearView = new BearView(map, WATER_LEVEL);
scene.add(bearView.group);

// 珍しい生き物（ホタル・オオサンショウウオ）
const rare = new RareLife(map, WATER_LEVEL);
const rareView = new RareView(map, WATER_LEVEL);
scene.add(rareView.group);
// 水草 → 魚 → カワセミ・サギ のつながり
const foodweb = new FoodWeb(map, WATER_LEVEL);
const foodwebView = new FoodWebView(map, WATER_LEVEL);
scene.add(foodwebView.group);
const poachers = new Poachers(map, WATER_LEVEL);
const poacherView = new PoacherView(map, WATER_LEVEL);
scene.add(poacherView.group);

const cursor = new BrushCursor(map);
scene.add(cursor.line);

// 最初からいくつか木を生やしておく（再現できる乱数）
{
  let s = 12345;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
  const half = map.worldSize / 2 - 2;
  for (let i = 0; i < 160; i++) forest.plant((rand() * 2 - 1) * half, (rand() * 2 - 1) * half, rand, true);
}

// ---- 運営の状態 ----
const state = {
  money: 1000,
  day: 1,
  dayTimer: 0,
  tool: 'dig' as Tool,
  brushRadius: 3,
  inventory: emptyInventory(),
  /** 採りすぎによる荒らされ度。時間で回復する */
  pressure: 0,
  /** キツネの襲撃事件の影響（1 = 起きた直後）。時間で薄れる */
  incident: 0,
  /** ライトアップして夜も営業するか */
  nightOpen: false,
  /** 夜営業に寄ってきた夜行性のキツネ（朝には去る） */
  nightFoxes: [] as number[],
};
/** 今夜のうち、営業していた時間と夜の長さ（入園料の割合に使う） */
let nightOpenTime = 0;
let nightTime = 0;
let wasNight = false;
/** すみかの状態。育った水草の数も入れる（魚の数の上限が決まる） */
function habitatNow(): Habitat {
  return { ...computeHabitat(map, WATER_LEVEL, forest.trees), weeds: foodweb.matureWeeds };
}
let habitat: Habitat = habitatNow();
let scenic = 0;
let statsDirty = false;

// 最初から少し生き物がいる状態にする
for (const kind of ['rabbit', 'rabbit', 'rabbit', 'duck', 'fish', 'fish', 'fish', 'fish'] as CreatureKind[]) {
  ecosystem.spawn(kind, forest.trees);
}
// 池に少し水草を生やしておく（植えた水草でつながりが育つことが分かるように）
for (let i = 0, n = 0; i < 4000 && n < 12; i++) {
  const half = map.worldSize / 2 - 2;
  if (foodweb.plantWeed((Math.random() * 2 - 1) * half, (Math.random() * 2 - 1) * half, true)) n++;
}
habitat = habitatNow();

/** タッチでも遊歩道を撤去できるよう、ドックの「撤去」ボタンで切り替える */
let pathErase = false;
const reviews = new ReviewFeed();
const hud = new Hud({
  onToolChange: (tool) => setTool(tool),
  onBrushChange: (r) => {
    state.brushRadius = r;
    updateCursorRadius();
  },
  onSell: (kind) => sell(kind),
  onFocusBear: () => focusBear(),
  onToggleNight: () => toggleNight(),
  onReset: () => resetGame(),
  onPathErase: (on) => (pathErase = on),
});
// HUD を組んだあとに足す（HUD は中身を作り直すため）
const rareBadge = new RareBadge((kind) => focusRare(kind));
const foodwebPanel = new FoodWebPanel(document.querySelector('#hud .basket'));
hud.setTool(state.tool);
const reviewPanel = new ReviewPanel(document.getElementById('hud')!);
hud.setBrush(state.brushRadius);
updateCursorRadius();

/** 遊歩道はブラシより細く敷くので、カーソルの円もそれに合わせる */
function updateCursorRadius(): void {
  cursor.setRadius(state.tool === 'path' ? pathWidth() : state.brushRadius);
}

function pathWidth(): number {
  return Math.max(0.6, state.brushRadius / 3);
}

function setTool(tool: Tool): void {
  state.tool = tool;
  hud.setTool(tool);
  // 「移動」のときだけ左ドラッグでカメラを動かす。それ以外は左ボタンを道具に使う
  controls.mouseButtons = {
    LEFT: tool === 'pan' ? THREE.MOUSE.PAN : null,
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: THREE.MOUSE.PAN,
  };
  // タッチ：「移動」では 1 本指で移動・2 本指で回転と拡大縮小。
  // 他の道具では 1 本指を道具に使うので、2 本指で移動と拡大縮小（地図アプリと同じ）
  controls.touches = {
    ONE: tool === 'pan' ? THREE.TOUCH.PAN : null,
    TWO: tool === 'pan' ? THREE.TOUCH.DOLLY_ROTATE : THREE.TOUCH.DOLLY_PAN,
  };
  cursor.line.visible = tool !== 'pan';
  updateCursorRadius();
}
setTool(state.tool);

// ---- 入力 ----
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerOnCanvas = false;
let toolActive = false;
let lastHit: THREE.Vector3 | null = null;
/** 遊歩道を敷いている途中の、前回の地点（線でつなぐため） */
let lastPathPoint: { x: number; z: number } | null = null;

// iOS Safari：ピンチでページ自体が拡大されないようにする（地図のズームは 2 本指で別に扱う）
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

function setPointer(e: PointerEvent): void {
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
}

// タッチでは 1 本指で道具、2 本指でカメラ（ピンチで拡大縮小・ドラッグで移動）。
// 2 本目の指が少し遅れて触れても地形をいじってしまわないよう、1 本指の操作は少し待ってから始める
const TOUCH_DELAY_MS = 90;
const touchIds = new Set<number>();
let pendingTouch: { id: number; timer: number } | null = null;

function startTool(): void {
  pointerOnCanvas = true;
  toolActive = true;
  if (state.tool === 'tree') {
    const hit = pick();
    if (hit) plantTrees(hit);
  }
  if (state.tool === 'weed') {
    const hit = pick();
    if (hit) plantWeeds(hit);
  }
  if (state.tool === 'trap') {
    const hit = pick();
    if (hit) placeTrap(hit);
  }
  if (state.tool === 'gun') {
    const hit = pick();
    if (hit) shoot(hit);
  }
}

function stopTool(): void {
  toolActive = false;
  lastPathPoint = null;
}

function cancelPendingTouch(): void {
  if (pendingTouch) window.clearTimeout(pendingTouch.timer);
  pendingTouch = null;
}

renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' && (touchIds.size > 1 || (pendingTouch && pendingTouch.id !== e.pointerId))) return;
  setPointer(e);
  // タッチは指が離れているときにカーソルを出さない
  if (e.pointerType !== 'touch' || toolActive) pointerOnCanvas = true;
});
renderer.domElement.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'touch') return;
  pointerOnCanvas = false;
  stopTool();
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') {
    touchIds.add(e.pointerId);
    if (touchIds.size > 1) {
      // 2 本目の指：カメラ操作に切り替え、道具は止める
      cancelPendingTouch();
      stopTool();
      pointerOnCanvas = false;
      return;
    }
  }
  if (e.button !== 0 || state.tool === 'pan') return;
  setPointer(e);
  if (e.pointerType === 'touch') {
    const id = e.pointerId;
    pendingTouch = {
      id,
      timer: window.setTimeout(() => {
        pendingTouch = null;
        if (touchIds.size === 1 && touchIds.has(id)) startTool();
      }, TOUCH_DELAY_MS),
    };
    return;
  }
  renderer.domElement.setPointerCapture(e.pointerId);
  startTool();
});
function onPointerEnd(e: PointerEvent): void {
  if (e.pointerType === 'touch') {
    const wasOnlyFinger = touchIds.size === 1 && touchIds.has(e.pointerId);
    touchIds.delete(e.pointerId);
    // 待っている間に指を離した＝素早いタップ。植える・罠などはその場で使う
    if (pendingTouch?.id === e.pointerId) {
      cancelPendingTouch();
      if (wasOnlyFinger && e.type === 'pointerup') {
        startTool();
        lastHit = pick();
        applyTool(1 / 30);
      }
    }
    pointerOnCanvas = false;
  }
  stopTool();
}
window.addEventListener('pointerup', onPointerEnd);
window.addEventListener('pointercancel', onPointerEnd);
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  const keys: Record<string, Tool> = {
    '1': 'pan',
    '2': 'dig',
    '3': 'raise',
    '4': 'smooth',
    '5': 'tree',
    '6': 'path',
    '7': 'collect',
    '8': 'trap',
    '9': 'gun',
    '0': 'weed',
  };
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
  pathView.rebuild();
  refreshLanterns();
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

/** ブラシの範囲の水の中に水草をまとめて植える */
function plantWeeds(at: THREE.Vector3): void {
  const n = Math.max(2, Math.round(state.brushRadius * 1.5));
  let planted = 0;
  for (let i = 0; i < n * 4 && planted < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = i === 0 ? 0 : Math.sqrt(Math.random()) * state.brushRadius;
    const x = at.x + Math.cos(a) * r;
    const z = at.z + Math.sin(a) * r;
    if (!foodweb.canPlantWeed(x, z)) continue;
    if (!spend(WEED.cost)) break;
    foodweb.plantWeed(x, z);
    planted++;
  }
  if (planted === 0 && state.money >= WEED.cost) hud.flash('水草は池の浅いところ〜中くらいの深さに植えられます', 'bad');
}

/** なぞった範囲の果物と生き物をかごに入れる */
function collect(at: THREE.Vector3): void {
  const r = state.brushRadius;
  const got: Partial<Record<ItemKind, number>> = {};
  const fruit = harvestFruit(forest.trees, at.x, at.z, r);
  if (fruit > 0) {
    got.fruit = fruit;
    forest.markFruitDirty();
  }
  Object.assign(got, ecosystem.catchWithin(at.x, at.z, r));
  const parts: string[] = [];
  for (const kind of ITEM_ORDER) {
    const n = got[kind] ?? 0;
    if (n === 0) continue;
    state.inventory[kind] += n;
    state.pressure = addPressure(state.pressure, kind, n);
    parts.push(`${ITEMS[kind].name} ×${n}`);
  }
  if (parts.length > 0) hud.flash(`かごへ: ${parts.join('、')}`);

  // なぞった範囲に密猟者がいれば捕まえる
  const caught = poachers.catchWithin(at.x, at.z, r);
  if (caught.length > 0) catchPoachers(caught);
}

/** 捕まえた密猟者の報奨金を受け取り、盗まれた生き物を自然へ戻す */
function catchPoachers(caught: CreatureKind[][]): void {
  const reward = caught.length * POACHER.reward;
  state.money += reward;
  let released = 0;
  for (const loot of caught) {
    for (const kind of loot) if (ecosystem.spawn(kind, forest.trees)) released++;
  }
  const back = released > 0 ? `盗まれた生き物 ${released} 匹を自然へ戻しました` : '';
  hud.flash(`密猟者を捕まえました！報奨金 +${reward.toLocaleString()} G ${back}`, 'good');
}

function placeTrap(at: THREE.Vector3): void {
  if (state.money < TRAP_COST) {
    hud.flash('資金が足りません', 'bad');
    return;
  }
  if (!bears.placeTrap(at.x, at.z)) {
    hud.flash('ここには罠を置けません（水の中や、ほかの罠のすぐ近く）', 'bad');
    return;
  }
  state.money -= TRAP_COST;
}

function shoot(at: THREE.Vector3): void {
  if (!spend(SHOT_COST)) return;
  const result = bears.shoot(at.x, at.z);
  if (result === 'killed') {
    state.inventory.bear++;
    hud.flash('クマを仕留めました！かごに入れました', 'good');
    reviews.note('bearHunted');
    return;
  }
  if (result === 'hit') {
    hud.flash('命中！もう1発で仕留められます');
    return;
  }
  // クマに当たらなければキツネを狙う
  const fox = ecosystem.catchWithin(at.x, at.z, 1.2, 1, ['fox']);
  if (fox.fox) {
    state.inventory.fox++;
    hud.flash('キツネを仕留めました', 'good');
    return;
  }
  hud.flash('外れました');
}

function sell(kind: ItemKind | 'all'): void {
  const kinds = kind === 'all' ? ITEM_ORDER : [kind];
  const sold = emptyInventory();
  for (const k of kinds) sold[k] = state.inventory[k];
  const total = inventoryValue(sold);
  if (total === 0) return;
  for (const k of kinds) state.inventory[k] = 0;
  state.money += total;
  hud.flash(`売り上げ +${total.toLocaleString()} G`, 'good');
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
    case 'collect':
      collect(lastHit);
      return;
    case 'path': {
      // Shift を押しながらなぞると撤去
      const width = pathWidth();
      const from = lastPathPoint ?? { x, z };
      // 前回の地点から一気に遠くへ飛んだ（斜面の向こうを指したなど）ときは線でつながない
      const jump = Math.hypot(x - from.x, z - from.z) > 6;
      const x0 = jump ? x : from.x;
      const z0 = jump ? z : from.z;
      lastPathPoint = { x, z };
      if (shiftDown || pathErase) {
        const before = paths.connectedCount;
        if (paths.paintSegment(x0, z0, x, z, width, true) > 0) {
          onPathsChanged();
          if (paths.connectedCount < before - 1 && paths.count > paths.connectedCount) {
            hud.flash('出入口から切り離された道は使われません', 'bad');
          }
        }
        return;
      }
      if (state.money < SAFETY.cost) {
        hud.flash('資金が足りません', 'bad');
        return;
      }
      const before = paths.count;
      paths.paintSegment(x0, z0, x, z, width);
      const added = paths.count - before;
      if (added > 0) {
        state.money -= added * SAFETY.cost;
        onPathsChanged();
      }
      return;
    }
    default:
      return;
  }
  if (region) onTerrainEdited(region);
}

function onPathsChanged(): void {
  pathView.rebuild();
  refreshLanterns();
  statsDirty = true;
}

let shiftDown = false;
window.addEventListener('keydown', (e) => (shiftDown = e.shiftKey));
window.addEventListener('keyup', (e) => (shiftDown = e.shiftKey));

// ---- 保存と再開 ----
const SAVE_INTERVAL = 5; // 秒
const saveSlot = new SaveSlot();

function snapshot(): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    mapSize: map.size,
    heights: encodeFloats(map.heights),
    paths: bytesToBase64(paths.cells),
    trees: forest.trees.map((t) => ({ ...t })),
    creatures: ecosystem.creatures.map((c) => ({ ...c })),
    bears: bears.bears.map((b) => ({ ...b })),
    traps: bears.traps.map((t) => ({ ...t })),
    rare: rare.snapshot(),
    foodweb: { weeds: foodweb.weeds.map((w) => ({ ...w })), birds: foodweb.birds.map((b) => ({ ...b })) },
    poachers: poachers.poachers.map((p) => ({ ...p, loot: [...p.loot] })),
    state: {
      money: state.money,
      day: state.day,
      dayTimer: state.dayTimer,
      inventory: { ...state.inventory },
      pressure: state.pressure,
      incident: state.incident,
      nightOpen: state.nightOpen,
      nightFoxes: [...state.nightFoxes],
    },
    camera: {
      position: camera.position.toArray() as [number, number, number],
      target: controls.target.toArray() as [number, number, number],
    },
  };
}

function restore(data: SaveData): void {
  const heights = decodeFloats(data.heights);
  if (heights.length === map.heights.length) map.heights.set(heights);
  terrain.refresh();
  forest.restore(data.trees);
  paths.load(base64ToBytes(data.paths));
  pathView.rebuild();
  ecosystem.restore(data.creatures);
  bears.restore(data.bears ?? [], data.traps ?? []);
  rare.restore(data.rare);
  foodweb.restore(data.foodweb);
  poachers.restore(data.poachers ?? []);
  Object.assign(state, data.state, {
    inventory: { ...emptyInventory(), ...data.state.inventory },
    nightOpen: data.state.nightOpen ?? false,
    nightFoxes: data.state.nightFoxes ?? [],
  });
  refreshLanterns();
  camera.position.fromArray(data.camera.position);
  controls.target.fromArray(data.camera.target);
  habitat = habitatNow();
  scenic = paths.scenicValue(WATER_LEVEL);
}

function saveNow(): void {
  saveSlot.save(snapshot());
}

function resetGame(): void {
  if (!window.confirm('保存データを消して、最初からやり直しますか？')) return;
  saveSlot.clear();
  location.reload();
}

{
  const saved = saveSlot.load(map.size);
  if (saved) {
    restore(saved);
    hud.flash(`${saved.state.day}日目の続きから再開しました`, 'good');
  }
}
// タブを閉じる・切り替えるときにも保存する
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveNow();
});

// 確認用：URL に ?bear を付けると、最初からクマが 1 頭出る
if (new URLSearchParams(location.search).has('bear')) {
  const b = bears.spawn();
  b.x *= 0.45;
  b.z *= 0.45;
}

// 確認用：URL に ?firefly / ?salamander を付けると、最初からその生き物が現れる
for (const kind of ['firefly', 'salamander'] as RareKind[]) {
  if (new URLSearchParams(location.search).has(kind) && !rare.has(kind)) rare.appear(kind, waterTrees());
}

/** 水辺の木（ホタルが舞う場所） */
function waterTrees(): { x: number; z: number }[] {
  return forest.trees.filter((t) => {
    for (const [dx, dz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) {
      if (map.heightAt(t.x + dx, t.z + dz) < WATER_LEVEL) return true;
    }
    return false;
  });
}

// 確認用：URL に ?poacher を付けると、最初から密猟者が 1 人忍び込む
if (new URLSearchParams(location.search).has('poacher')) {
  const p = poachers.spawn();
  p.x *= 0.5;
  p.z *= 0.5;
}

/** 夜間営業の切り替え */
function toggleNight(): void {
  state.nightOpen = !state.nightOpen;
  hud.flash(
    state.nightOpen
      ? `夜間営業を始めます。灯り ${lanterns} 基、電気代 ${lightingCost(lanterns)}G/晩`
      : '夜間営業をやめます。夜は閉園します',
    state.nightOpen ? 'good' : 'info',
  );
}

/** 夜になった・朝になったときの出来事 */
function onNightChange(night: boolean, dayVisitors: number): void {
  if (night) {
    if (!state.nightOpen) return;
    // ライトアップした夜は、夜行性のキツネが寄ってくる
    const want = nightFoxCount(nightVisitors(dayVisitors, true));
    let came = 0;
    for (let i = 0; i < want; i++) {
      const fox = ecosystem.spawn('fox', forest.trees);
      if (fox) {
        state.nightFoxes.push(fox.id);
        came++;
      }
    }
    if (came > 0) hud.flash(`夜行性のキツネが ${came} 匹寄ってきました。遊歩道の外は危険です`, 'bad');
    return;
  }
  // 朝になると、夜に来たキツネは森へ帰る
  const leaving = new Set(state.nightFoxes);
  for (let i = ecosystem.creatures.length - 1; i >= 0; i--) {
    if (leaving.has(ecosystem.creatures[i].id)) ecosystem.creatures.splice(i, 1);
  }
  state.nightFoxes = [];
}

/** クマの居る場所へカメラを向ける */
function removeCreature(id: number): void {
  const i = ecosystem.creatures.findIndex((c) => c.id === id);
  if (i >= 0) ecosystem.creatures.splice(i, 1);
}

function focusBear(): void {
  const b = bears.bears[0];
  if (!b) return;
  focusAt(b.x, b.z);
}

/** 珍しい生き物の居る場所へカメラを向ける */
function focusRare(kind: RareKind): void {
  const s = rare.state.sightings.find((v) => v.kind === kind);
  if (s) focusAt(s.x, s.z);
}

function focusAt(x: number, z: number): void {
  // 少し寄って見えるようにする
  const offset = camera.position.clone().sub(controls.target).setLength(28);
  controls.target.set(x, 0, z);
  camera.position.copy(controls.target).add(offset);
}

// ---- メインループ ----
const clock = new THREE.Clock();
let statsTimer = 0;
let saveTimer = 0;

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  lastHit = pointerOnCanvas && state.tool !== 'pan' ? pick() : null;
  cursor.update(lastHit);
  applyTool(dt);

  // 統計は重めなので、変化があったときだけ間引いて計算する
  statsTimer += dt;
  if (statsDirty && statsTimer > 0.25) {
    habitat = habitatNow();
    scenic = paths.scenicValue(WATER_LEVEL);
    statsDirty = false;
    statsTimer = 0;
  }

  // 自然の時間を進める：木が育って実り、生き物が集まって動き回る
  forest.update(dt);
  const arrived = ecosystem.update(dt, habitat, forest.trees);
  for (const kind of new Set(arrived)) {
    if (kind === 'duck') hud.flash(`${ITEMS[kind].name}がやってきました`);
    if (kind === 'fox') hud.flash('キツネが現れました。来園者が襲われるかもしれません', 'bad');
  }
  creatureView.update(ecosystem.creatures);

  // 水草が育つと魚が増え、魚が増えると鳥が食べに来る。魚が減ると鳥は去る
  const web = foodweb.update(
    dt,
    {
      fish: () => ecosystem.creatures.filter((c) => c.kind === 'fish'),
      eat: (x, z) => Object.keys(ecosystem.catchWithin(x, z, 1.2, 1, ['fish'])).length > 0,
    },
    habitat.treesNearWater,
  );
  if (web.weedsChanged) statsDirty = true;
  for (const kind of new Set(web.arrived)) hud.flash(`${BIRDS[kind].name}が魚を食べにやってきました`, 'good');
  for (const kind of new Set(web.left)) hud.flash(`魚が減って${BIRDS[kind].name}が去っていきました`, 'bad');
  foodwebView.update(foodweb.weeds, foodweb.birds, t);
  state.pressure = decayPressure(state.pressure, dt);

  const wild = {
    fruit: forest.fruitCount,
    rabbit: ecosystem.count('rabbit'),
    duck: ecosystem.count('duck'),
    fish: ecosystem.count('fish'),
    fox: ecosystem.count('fox'),
    bear: bears.bears.length,
  };

  // クマ：柵と道を壊し、来園者を襲う。罠にかかれば狩れる
  const bearEvents = bears.update(dt, paths, strollers);
  if (bearEvents.smashed > 0) onPathsChanged();
  if (bearEvents.attacked > 0) {
    state.incident = Math.min(2, state.incident + ATTACK.bearSeverity * bearEvents.attacked);
    hud.flash('クマが来園者を襲いました！魅力が大幅に下がります', 'bad');
    reviews.note('bearAttack');
  }
  if (bearEvents.trapped > 0) {
    state.inventory.bear += bearEvents.trapped;
    hud.flash('クマが罠にかかりました！かごに入れました', 'good');
    reviews.note('bearHunted');
  }
  // 罠にはキツネもかかる
  for (const c of ecosystem.creatures) {
    if (c.kind !== 'fox') continue;
    if (bears.springTrapNear(c.x, c.z, BEAR.trapRange)) {
      ecosystem.catchWithin(c.x, c.z, 0.01, 1, ['fox']);
      state.inventory.fox++;
      hud.flash('キツネが罠にかかりました', 'good');
      break;
    }
  }
  bearView.update(bears.bears, bears.traps, t);
  rareView.update(rare.state, t);

  // 密猟者：夜に忍び込んで魚や動物を盗む。来園者に見つかると逃げる
  const poacherEvents = poachers.update(
    dt,
    { creatures: ecosystem.creatures, remove: (id) => removeCreature(id) },
    strollers.positions(),
  );
  for (const kind of poacherEvents.stolen) state.pressure = addPressure(state.pressure, kind, 1);
  if (poacherEvents.stolen.length > 0) {
    const names = poacherEvents.stolen.map((k) => ITEMS[k].name).join('、');
    hud.flash(`密猟者が${names}を盗みました！「集める」でなぞって捕まえましょう`, 'bad');
  }
  if (poacherEvents.spotted > 0) hud.flash('来園者が密猟者を見つけました。逃げていきます');
  for (const loot of poacherEvents.escapedWith) {
    // 持ち去られると、盗まれた分だけさらに荒らされる
    for (const kind of loot) state.pressure = addPressure(state.pressure, kind, 1);
    hud.flash(`密猟者に逃げられました（${loot.length} 匹を持ち去られました）`, 'bad');
  }
  poacherView.update(poachers.poachers, t);

  state.incident = decayIncident(state.incident, dt);
  const access = {
    scenic: scenic + foodweb.appealBonus(),
    safetyFor: (v: number) => safety(paths.connectedCount, v),
    unsafePenalty: SAFETY.unsafePenalty,
  };
  const wildlife = { fruitOnTrees: wild.fruit, ...wild };
  // 珍しい生き物：荒らすと去ってしまう。居る間と、現れた直後の話題で客が増える
  const rareEnv = { habitat, fish: wild.fish, pressure: state.pressure };
  for (const e of rare.update(dt, rareEnv)) {
    if (e.type === 'fled') hud.flash(`荒らされて、${RARE[e.kind].name}が去ってしまいました`, 'bad');
  }
  const boost = rareBoost(rare.state);
  const evaluate = () =>
    applyRareBoost(computeAppeal(habitat, wildlife, state.pressure, state.incident, access), boost);
  let appeal = evaluate();

  // 昼と夜。夜は営業していなければ来園者は帰り、営業していればキツネが活発になる
  const dayProgress = state.dayTimer / SECONDS_PER_DAY;
  const night = isNight(dayProgress);
  if (night !== wasNight) {
    wasNight = night;
    onNightChange(night, appeal.visitors);
  }
  if (night) {
    nightTime += dt;
    if (state.nightOpen) nightOpenTime += dt;
  }
  const present = night && !state.nightOpen ? 0 : appeal.visitors;
  nightView.update(darkness(dayProgress), state.nightOpen);

  // キツネがいると、遊歩道の外を歩く来園者が襲われることがある（夜はより危険）
  const foxRisk = wild.fox * foxDangerFactor(night);
  if (wild.fox > 0 && Math.random() < attackChance(foxRisk, present, dt, appeal.safety)) {
    state.incident = 1;
    hud.flash('キツネが来園者を襲いました！魅力が大きく下がります', 'bad');
    reviews.note('foxAttack');
    appeal = evaluate();
  }
  strollers.update(dt, present);

  // 来園者の口コミ：いまの園の状態から感想が届く
  const review = reviews.update(
    dt,
    {
      visitors: appeal.visitors,
      penalty: appeal.penalty,
      safety: appeal.safety,
      pathCells: paths.connectedCount,
      waterCells: habitat.waterCells,
      trees: forest.trees.length,
      treesNearWater: habitat.treesNearWater,
      wild,
    },
    state.day,
  );
  if (review) reviewPanel.render(reviews, review);

  // 数秒ごとに自動保存
  saveTimer += dt;
  if (saveTimer >= SAVE_INTERVAL) {
    saveTimer = 0;
    saveNow();
  }

  // 1 日が過ぎるごとに入園料が入る
  state.dayTimer += dt;
  if (state.dayTimer >= SECONDS_PER_DAY) {
    state.dayTimer -= SECONDS_PER_DAY;
    state.day++;
    const income = appeal.visitors * TICKET_PRICE;
    state.money += income;
    hud.flash(`${state.day - 1}日目の入園料  +${income.toLocaleString()} G`, 'good');
    // 夜も営業していれば、営業していた時間の分だけ夜の部の入園料が入り、電気代を払う
    if (nightOpenTime > 0) {
      const share = Math.min(1, nightOpenTime / Math.max(nightTime, 0.001));
      const nightIncome = Math.floor(nightVisitors(appeal.visitors, true) * share) * TICKET_PRICE;
      const cost = lightingCost(lanterns);
      state.money += nightIncome - cost;
      hud.flash(`夜の部  +${nightIncome.toLocaleString()} G（電気代 -${cost} G）`, nightIncome >= cost ? 'good' : 'bad');
    }
    nightOpenTime = 0;
    nightTime = 0;
    // 日が変わるとき、森が育っているほどクマが出やすい
    if (state.day >= BEAR.firstDay && bears.bears.length === 0 && Math.random() < BEAR.chance(forest.trees.length)) {
      bears.spawn();
      hud.flash('クマが現れました！罠を仕掛けるか、銃で狩りましょう', 'bad');
    }
    for (const e of rare.onNewDay(rareEnv, waterTrees())) {
      if (e.type === 'arrived') {
        hud.flash(RARE[e.kind].arrive, 'good');
        reviews.note(e.kind);
      }
      if (e.type === 'left') hud.flash(`${RARE[e.kind].name}はどこかへ去っていきました`);
    }
    // 夜のあいだ、獲物が多いほど密猟者に狙われやすい
    const prey = ecosystem.creatures.filter((c) => POACHER_TARGETS.includes(c.kind)).length;
    if (state.day >= POACHER.firstDay && poachers.poachers.length < POACHER.max && Math.random() < POACHER.chance(prey)) {
      poachers.spawn();
      hud.flash('夜のうちに密猟者が忍び込みました！「集める」でなぞって捕まえましょう', 'bad');
    }
  }

  foodwebPanel.update({
    weeds: foodweb.matureWeeds,
    weedsGrowing: foodweb.weeds.length - foodweb.matureWeeds,
    fish: wild.fish,
    fishCap: fishCapacity(habitat.deepCells, habitat.weeds ?? 0),
    kingfisher: foodweb.count('kingfisher'),
    heron: foodweb.count('heron'),
  });

  hud.update({
    money: state.money,
    day: state.day,
    dayProgress: state.dayTimer / SECONDS_PER_DAY,
    trees: forest.trees.length,
    treesNearWater: habitat.treesNearWater,
    waterCells: habitat.waterCells,
    wild,
    appeal: appeal.appeal,
    penalty: appeal.penalty,
    incidentPenalty: appeal.incidentPenalty,
    safety: appeal.safety,
    pathCells: paths.connectedCount,
    pathCellsTotal: paths.count,
    visitors: appeal.visitors,
    inventory: state.inventory,
    bears: bears.bears.length,
    traps: bears.traps.length,
    darkness: darkness(dayProgress),
    nightOpen: state.nightOpen,
    nightVisitors: nightVisitors(appeal.visitors, state.nightOpen),
    lightingCost: lightingCost(lanterns),
  });

  rareBadge.update(rare.state, boost);
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
