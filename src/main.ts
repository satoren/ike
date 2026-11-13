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
  capacity,
  decayIncident,
  computeAppeal,
  decayPressure,
  emptyInventory,
  harvestFruit,
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
import { RANGER, Rangers, type Threat } from './rangers';
import { RangerPanel, RangerView } from './rangerview';
import { SAVE_VERSION, SaveSlot, decodeFloats, base64ToBytes, bytesToBase64, encodeFloats, type SaveData } from './save';
import { Hud, type Tool } from './ui';
import {
  DAYS_PER_SEASON,
  SEASONS,
  WEATHER,
  applySeason,
  calendarOf,
  isFrozen,
  rollWeather,
  seasonalBonus,
  seasonalHabitat,
  stepWater,
  waterBlocked,
  waterTarget,
  type Weather,
} from './seasons';
import { SeasonBadge, SeasonView } from './seasonview';
import { DEFAULT_SPEED, SPEEDS, SpeedButton, clampSpeed } from './speed';
import { FeedbackDialog, feedbackEnabled } from './feedback';
import { darkness, foxDangerFactor, isNight, lanternCells, lightingCost, nightFoxCount, nightVisitors } from './night';
import { NightView } from './nightview';
import { ReviewFeed } from './reviews';
import { ReviewPanel } from './reviewview';
import { BIRDS, BIRD_NEEDS, FoodWeb, WEED, birdCapacity, fishCapacity } from './foodweb';
import { FoodWebPanel, FoodWebView } from './foodwebview';
import { FACILITIES, FACILITY, FACILITY_ORDER, Facilities, type FacilityKind } from './facilities';
import { FacilityView } from './facilityview';
import { Progress, RANKS, type ParkStats } from './progress';
import { RankBadge, rewardText } from './progressview';
import {
  FAUNA,
  FAUNA_ORDER,
  Fauna,
  emptyBiotope,
  faunaCapacity,
  surveyBiotope,
  type Biotope,
  type FaunaEnv,
} from './fauna';
import { FaunaView } from './faunaview';
import { Dex, type DexId } from './dex';
import { DexPanel } from './dexview';
import { Market } from './market';
import { Requests, clientOf, describe, progressOf, type ParkNow, type RequestEvent } from './requests';
import { RequestPanel } from './requestview';

// ---- ワールドの設定 ----
const MAP_SIZE = 128; // マス数（一辺）
const WATER_LEVEL = 0.5; // 地下水位。これより低い地面が池になる
const SECONDS_PER_DAY = 60; // 実時間何秒でゲーム内 1 日か（昼が約 35 秒、夜が約 20 秒）
const TERRAIN_BASE = 1.9; // 地形の基準の高さ（地図の縁もこの高さ）

// ---- レンダラーとシーン ----
const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// 見た目の大きさは CSS（画面いっぱいに固定）に任せ、描画の解像度だけ合わせる
renderer.setSize(window.innerWidth, window.innerHeight, false);
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
const outerMaterial = new THREE.MeshStandardMaterial({ color: '#64a043', roughness: 1 });
{
  const outer = new THREE.Mesh(new THREE.RingGeometry(map.worldSize * 0.7, 400, 4, 1, Math.PI / 4), outerMaterial);
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

// ---- 季節と天気 ----
const seasonState = {
  weather: rollWeather('spring') as Weather,
  /** 地下水位からの水面の差（夏の日照りで下がる） */
  waterOffset: 0,
  /** 最後にすみかを数えたときの水面の差 */
  habitatOffset: 0,
  droughtWarned: false,
};
const waterSurface = () => WATER_LEVEL + seasonState.waterOffset;

// キツネは柵付きの遊歩道に入れない。カモと魚は、凍った池や水位が下がって浅くなった場所に居られない
const ecosystem = new Ecosystem(
  map,
  WATER_LEVEL,
  Math.random,
  (kind, x, z) =>
    (kind === 'fox' && paths.isPathAt(x, z)) ||
    waterBlocked(kind, map.heightAt(x, z), waterSurface(), isFrozen(calendarOf(state.day).season)),
);
const creatureView = new CreatureView(map, WATER_LEVEL);
scene.add(creatureView.group);

const bears = new Bears(map, WATER_LEVEL);
const bearView = new BearView(map, WATER_LEVEL);
/** 予想される獣道を見直すまでの秒数 */
let trailTimer = 0;
scene.add(bearView.group);

// 珍しい生き物（ホタル・オオサンショウウオ）
const rare = new RareLife(map, WATER_LEVEL);
const rareView = new RareView(map, WATER_LEVEL);
scene.add(rareView.group);
// 水草 → 魚 → カワセミ・サギ のつながり
const foodweb = new FoodWeb(map, WATER_LEVEL);
const foodwebView = new FoodWebView(map, WATER_LEVEL);
scene.add(foodwebView.group);
// 場所の作り方で現れる生き物（カエル・トンボ・カメ・リス・シカ・フクロウ）と、生き物図鑑
const fauna = new Fauna(map);
const faunaView = new FaunaView(map, WATER_LEVEL);
scene.add(faunaView.group);
const dex = new Dex();
// 日替わりのお願い
const requests = new Requests();
const market = new Market();
const poachers = new Poachers(map, WATER_LEVEL);
const poacherView = new PoacherView(map, WATER_LEVEL);
scene.add(poacherView.group);
// 雇った害獣駆除係
const rangers = new Rangers(map, WATER_LEVEL);
const rangerView = new RangerView(map, WATER_LEVEL);
scene.add(rangerView.group);

// 施設（休憩所・売店・展望台）と園のランク
const facilities = new Facilities(map, WATER_LEVEL);
const facilityView = new FacilityView(map);
scene.add(facilityView.group);
const progress = new Progress();

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
  /** 「施設」で建てるもの */
  facility: 'rest' as FacilityKind,
  /** 時間の速さ（SPEEDS の番号） */
  speed: DEFAULT_SPEED,
};
/** 前のフレームの来園者数（施設の効き目は来園者数で決まるため） */
let lastVisitors = 0;
/** 今夜のうち、営業していた時間と夜の長さ（入園料の割合に使う） */
let nightOpenTime = 0;
let nightTime = 0;
let wasNight = false;
/** すみかの状態。育った水草の数も入れる（魚の数の上限が決まる） */
function habitatNow(): Habitat {
  return { ...computeHabitat(map, waterSurface(), forest.trees), weeds: foodweb.matureWeeds };
}
let habitat: Habitat = habitatNow();
/** 生き物の居場所になる場所（浅瀬・小島・林・静かな林）。地形や木、遊歩道が変わると調べ直す */
function biotopeNow(): Biotope {
  return surveyBiotope(map, waterSurface(), forest.trees, (cx, cz) => paths.cells[cz * paths.size + cx] !== 0);
}
let biotope: Biotope = emptyBiotope();
/** 生き物が集まる条件（季節・夜・水草など）。毎フレーム作り直す */
let faunaEnv: FaunaEnv | null = null;
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
biotope = biotopeNow();

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
  onFacilityChange: (kind) => {
    state.facility = kind;
    refreshFacilityUi();
  },
});
const seasonView = new SeasonView({
  scene,
  sun,
  hemi,
  water: water.mesh,
  ground: [terrain.mesh.material as THREE.MeshStandardMaterial, outerMaterial],
  foliage: forest.foliageMaterial,
  map,
  waterLevel: WATER_LEVEL,
});
const seasonBadge = new SeasonBadge(document.querySelector<HTMLElement>('#hud .brand')!);
seasonView.set(calendarOf(state.day).season, seasonState.weather, true);
const speedButton = new SpeedButton(document.querySelector('#hud .brand .day')!, SECONDS_PER_DAY, () => cycleSpeed());
speedButton.set(state.speed);
function cycleSpeed(): void {
  state.speed = (state.speed + 1) % SPEEDS.length;
  speedButton.set(state.speed);
  hud.flash(`時間の速さ：${SPEEDS[state.speed].label}`);
}
// HUD を組んだあとに足す（HUD は中身を作り直すため）
const rareBadge = new RareBadge((kind) => focusRare(kind));
const foodwebPanel = new FoodWebPanel(document.querySelector('#hud .basket'));
const rankBadge = new RankBadge(document.querySelector<HTMLElement>('#hud .brand')!, document.getElementById('hud')!);
const dexPanel = new DexPanel(document.getElementById('hud')!, (id) => focusCreature(id));
const requestPanel = new RequestPanel(document.getElementById('hud')!, {
  onDeliver: () => {
    const e = requests.deliver(state.inventory);
    if (e) onRequestEvent(e);
  },
  onDismiss: () => {
    const r = requests.dismiss();
    if (r) hud.flash(`${clientOf(r)}のお願いを見送りました。明日の朝、また新しいお願いが届きます`);
  },
});
// 「?」の遊び方パネルから、不具合や要望を送れるようにする（送るときに今の状況を添える。送り先が無いビルドでは出さない）
const feedbackDialog = feedbackEnabled() ? new FeedbackDialog(document.getElementById('hud')!, () => {
  const cal = calendarOf(state.day);
  return {
    日付: `${cal.year}年目 ${SEASONS[cal.season].name} ${cal.dayInSeason}日目（${state.day}日目）`,
    ランク: `★${progress.rank.stars} ${progress.rank.name}`,
    お金: Math.round(state.money),
    来園者: lastVisitors,
    木: forest.trees.length,
    遊歩道: paths.connectedCount,
    夜間営業: state.nightOpen,
    速さ: SPEEDS[state.speed].label,
  };
}) : null;
const rangerPanel = new RangerPanel(document.querySelector('#hud .basket'), {
  onHire: () => hireRanger(),
  onDismiss: () => dismissRanger(),
});
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
  if (tool === 'build') refreshFacilityUi();
}

/** 施設の選択肢を、いまのランクで建てられるかに合わせて表示する */
function refreshFacilityUi(): void {
  const lockedBy: Partial<Record<FacilityKind, number>> = {};
  for (const kind of FACILITY_ORDER) {
    if (!progress.unlocked(kind)) lockedBy[kind] = Progress.unlockRank(kind)?.stars;
  }
  hud.setFacilities(state.facility, lockedBy);
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
  if (state.tool === 'build') {
    const hit = pick();
    if (hit) buildFacility(hit);
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
// 地図を触っている間はパネルを薄くして、下の地面が見えるようにする
const hudEl = document.getElementById('hud')!;
let mouseDown = false;
function updateGesturing(): void {
  hudEl.classList.toggle('gesturing', touchIds.size > 0 || mouseDown);
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') mouseDown = true;
  if (e.pointerType === 'touch') touchIds.add(e.pointerId);
  updateGesturing();
  if (e.pointerType === 'touch') {
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
  } else {
    mouseDown = false;
  }
  updateGesturing();
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
    '-': 'build',
  };
  if (keys[e.key]) setTool(keys[e.key]);
  if (e.key === 't' || e.key === 'T') cycleSpeed();
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
  const sunk = facilities.removeDrowned();
  if (sunk > 0) hud.flash(`施設が ${sunk} 軒、水に沈みました`, 'bad');
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
  if (parts.length > 0) {
    hud.flash(`かごへ: ${parts.join('、')}`);
    const e = requests.noteHarvest();
    if (e) onRequestEvent(e);
  }

  // なぞった範囲に密猟者がいれば捕まえる
  const caught = poachers.catchWithin(at.x, at.z, r);
  if (caught.length > 0) catchPoachers(caught);
}

/** 捕まえた密猟者の報奨金を受け取り、盗まれた生き物を自然へ戻す */
function catchPoachers(caught: CreatureKind[][], who = ''): void {
  const reward = caught.length * POACHER.reward;
  state.money += reward;
  let released = 0;
  for (const loot of caught) {
    for (const kind of loot) if (ecosystem.spawn(kind, forest.trees)) released++;
  }
  const back = released > 0 ? `盗まれた生き物 ${released} 匹を自然へ戻しました` : '';
  hud.flash(`${who}密猟者を捕まえました！報奨金 +${reward.toLocaleString()} G ${back}`, 'good');
}

/** 施設を建てる（「撤去」のときは近くの施設を取り壊して半額戻す） */
function buildFacility(at: THREE.Vector3): void {
  if (pathErase || shiftDown) {
    const removed = facilities.removeNear(at.x, at.z);
    if (!removed) return;
    const back = Math.floor(FACILITIES[removed.kind].cost * FACILITY.refund);
    state.money += back;
    hud.flash(`${FACILITIES[removed.kind].name}を取り壊しました（+${back}G）`);
    statsDirty = true;
    return;
  }
  const kind = state.facility;
  const info = FACILITIES[kind];
  if (!progress.unlocked(kind)) {
    hud.flash(`${info.name}は園のランクが★${Progress.unlockRank(kind)?.stars}になると建てられます`, 'bad');
    return;
  }
  const why = facilities.whyNot(at.x, at.z, paths, kind);
  if (why) {
    hud.flash(why, 'bad');
    return;
  }
  if (!spend(info.cost)) return;
  const f = facilities.build(kind, at.x, at.z, forest.trees);
  const extra =
    kind === 'tower' ? `（景色の良さ +${f.view}）` : kind === 'center' ? '（図鑑の評判が 2倍になりました）' : '';
  hud.flash(`${info.name}を${kind === 'bigtree' ? '植えました' : '建てました'}${extra}`, 'good');
  statsDirty = true;
}

function placeTrap(at: THREE.Vector3): void {
  if (state.money < TRAP_COST) {
    hud.flash('資金が足りません', 'bad');
    return;
  }
  const result = bears.placeTrap(at.x, at.z, paths);
  if (result !== 'ok') {
    const why = {
      water: '水の中には罠を置けません',
      path: '遊歩道の上には罠を置けません',
      'near-trap': 'ほかの罠のすぐ近くには置けません',
      'bear-near': 'クマに気づかれます。もっと離れた、クマの通り道に先回りして仕掛けましょう',
    }[result];
    hud.flash(why, 'bad');
    return;
  }
  state.money -= TRAP_COST;
}

function shoot(at: THREE.Vector3): void {
  if (!spend(SHOT_COST)) return;
  const result = bears.shoot(at.x, at.z);
  if (result === 'killed') {
    onBearKilled('クマを仕留めました！かごに入れました');
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

function onBearKilled(message: string): void {
  state.inventory.bear++;
  hud.flash(message, 'good');
  reviews.note('bearHunted');
}

/** 害獣駆除係を 1 人雇う */
function hireRanger(): void {
  if (rangers.count >= RANGER.max) return;
  if (!spend(RANGER.hireCost)) return;
  rangers.hire();
  hud.flash(`駆除係を雇いました（日給 ${RANGER.wage}G）。遊歩道を巡回してクマ・キツネ・密猟者に対処します`, 'good');
}

function dismissRanger(): void {
  if (rangers.dismiss()) hud.flash('駆除係に辞めてもらいました');
}

/** 駆除係の巡回先：半分は出入口とつながった遊歩道のどこか、残りは園内の陸地のどこか */
function patrolPoint(): { x: number; z: number } {
  const half = map.worldSize / 2 - 3;
  if (paths.connectedCount < 20 || Math.random() < 0.5) {
    for (let i = 0; i < 50; i++) {
      const x = (Math.random() * 2 - 1) * half;
      const z = (Math.random() * 2 - 1) * half;
      if (map.heightAt(x, z) > WATER_LEVEL) return { x, z };
    }
  }
  for (let i = 0; i < 200; i++) {
    const cx = Math.floor(Math.random() * paths.size);
    const cz = Math.floor(Math.random() * paths.size);
    if (paths.distance[cz * paths.size + cx] >= 0) return paths.center(cx, cz);
  }
  return { x: (Math.random() - 0.5) * 10, z: map.worldSize / 2 - 4 };
}

/** 駆除係の見回り：クマを撃ち、キツネと密猟者を捕まえる */
function updateRangers(dt: number): void {
  if (rangers.count === 0) return;
  const threats: Threat[] = [
    ...bears.bears.map((b) => ({ kind: 'bear' as const, id: b.id, x: b.x, z: b.z })),
    ...poachers.poachers.map((p) => ({ kind: 'poacher' as const, id: p.id, x: p.x, z: p.z })),
    ...ecosystem.creatures.filter((c) => c.kind === 'fox').map((c) => ({ kind: 'fox' as const, id: c.id, x: c.x, z: c.z })),
  ];
  for (const { kind, target } of rangers.update(dt, threats, patrolPoint)) {
    if (kind === 'shoot') {
      const result = bears.shoot(target.x, target.z);
      if (result === 'killed') onBearKilled('駆除係がクマを仕留めました！かごに入れました');
      else if (result === 'hit') hud.flash('駆除係がクマを撃ちました');
    } else if (target.kind === 'poacher') {
      const caught = poachers.catchWithin(target.x, target.z, 0);
      if (caught.length > 0) catchPoachers(caught, '駆除係が');
    } else if (target.kind === 'fox') {
      removeCreature(target.id);
      state.inventory.fox++;
      hud.flash('駆除係がキツネを捕まえました', 'good');
    }
  }
}

function sell(kind: ItemKind | 'all'): void {
  const kinds = kind === 'all' ? ITEM_ORDER : [kind];
  // 売るほど値が下がる。売り上げは相場（きょうの倍率と売りすぎ）で決まる
  let total = 0;
  for (const k of kinds) {
    total += market.sell(k, state.inventory[k]);
    state.inventory[k] = 0;
  }
  if (total === 0) return;
  state.money += total;
  progress.earn(total);
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
    bearSign: bears.sign ? { ...bears.sign } : null,
    rare: rare.snapshot(),
    foodweb: { weeds: foodweb.weeds.map((w) => ({ ...w })), birds: foodweb.birds.map((b) => ({ ...b })) },
    poachers: poachers.poachers.map((p) => ({ ...p, loot: [...p.loot] })),
    facilities: facilities.facilities.map((f) => ({ ...f })),
    progress: progress.snapshot(),
    rangers: rangers.rangers.map((r) => ({ ...r })),
    fauna: fauna.animals.map((a) => ({ ...a })),
    dex: dex.snapshot(),
    requests: requests.snapshot(),
    market: market.snapshot(),
    state: {
      money: state.money,
      day: state.day,
      dayTimer: state.dayTimer,
      speed: state.speed,
      inventory: { ...state.inventory },
      pressure: state.pressure,
      incident: state.incident,
      nightOpen: state.nightOpen,
      nightFoxes: [...state.nightFoxes],
    },
    seasons: { weather: seasonState.weather, waterOffset: seasonState.waterOffset },
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
  bears.restore(data.bears ?? [], data.traps ?? [], data.bearSign ?? null);
  trailTimer = 0;
  rare.restore(data.rare);
  foodweb.restore(data.foodweb);
  poachers.restore(data.poachers ?? []);
  facilities.restore(data.facilities);
  progress.restore(data.progress);
  rangers.restore(data.rangers ?? []);
  fauna.restore(data.fauna);
  dex.restore(data.dex);
  requests.restore(data.requests);
  market.restore(data.market);
  Object.assign(state, data.state, {
    inventory: { ...emptyInventory(), ...data.state.inventory },
    nightOpen: data.state.nightOpen ?? false,
    nightFoxes: data.state.nightFoxes ?? [],
    speed: clampSpeed(data.state.speed),
  });
  speedButton.set(state.speed);
  refreshLanterns();
  camera.position.fromArray(data.camera.position);
  controls.target.fromArray(data.camera.target);
  if (data.seasons) {
    seasonState.weather = data.seasons.weather;
    seasonState.waterOffset = seasonState.habitatOffset = data.seasons.waterOffset;
  }
  seasonView.set(calendarOf(state.day).season, seasonState.weather, true);
  habitat = habitatNow();
  biotope = biotopeNow();
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

// 確認用：URL に ?bearsign を付けると、最初からクマの足跡が見つかっている
if (new URLSearchParams(location.search).has('bearsign') && !bears.sign) bears.scout();

// 確認用：URL に ?season=winter のように付けると、その季節から始まる（&weather=snow で天気も）
{
  const q = new URLSearchParams(location.search);
  const order = ['spring', 'summer', 'autumn', 'winter'];
  const si = order.indexOf(q.get('season') ?? '');
  if (si >= 0) {
    state.day = si * DAYS_PER_SEASON + 1;
    const w = q.get('weather') as Weather | null;
    seasonState.weather = w && w in WEATHER ? w : rollWeather(calendarOf(state.day).season);
    if (si === 1 && q.has('drought')) seasonState.waterOffset = -0.2;
    seasonView.set(calendarOf(state.day).season, seasonState.weather, true);
    statsDirty = true;
  }
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

// 確認用：URL に ?rank=3 のように付けると、そのランク（★）から始まる
{
  const r = Number(new URLSearchParams(location.search).get('rank'));
  if (r >= 1 && r <= RANKS.length) progress.restore({ ...progress.snapshot(), rank: r - 1, done: [] });
}
// 確認用：URL に ?ranger を付けると、最初から駆除係が 1 人いる
if (new URLSearchParams(location.search).has('ranger') && rangers.count === 0) rangers.hire();

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
  const b = bears.bears[0] ?? bears.sign;
  if (!b) return;
  focusAt(b.x, b.z);
}

/** 珍しい生き物の居る場所へカメラを向ける */
function focusRare(kind: RareKind): void {
  const s = rare.state.sightings.find((v) => v.kind === kind);
  if (s) focusAt(s.x, s.z);
}

/** 図鑑から、その生き物がいま居る場所へカメラを向ける */
function focusCreature(id: DexId): void {
  const at =
    ecosystem.creatures.find((c) => c.kind === id) ??
    fauna.animals.find((a) => a.kind === id) ??
    foodweb.birds.find((b) => b.kind === id) ??
    rare.state.sightings.find((v) => v.kind === id) ??
    (id === 'bear' ? bears.bears[0] : undefined);
  if (at) focusAt(at.x, at.z);
}

function focusAt(x: number, z: number): void {
  // 少し寄って見えるようにする
  const offset = camera.position.clone().sub(controls.target).setLength(28);
  controls.target.set(x, 0, z);
  camera.position.copy(controls.target).add(offset);
}

/** 目標の判定に使う、いまの園の数字 */
function parkStats(visitors: number, wild: { rabbit: number; duck: number; fish: number }): ParkStats {
  return {
    visitors,
    waterCells: habitat.waterCells,
    treesNearWater: habitat.treesNearWater,
    pathCells: paths.connectedCount,
    earned: progress.state.earned,
    wild,
    birds: foodweb.birds.length,
    reviewAvg: reviews.average(),
    rareSeen: rare.state.sightings.length > 0,
    facilities: facilities.counts(),
  };
}

/** お願いを決めたり判定したりするための、いまの園の様子 */
function parkNow(
  appeal: { safety: number; visitors: number },
  wild: { fruit: number; rabbit: number; duck: number; fish: number; fox: number },
): ParkNow {
  const fc = fauna.counts();
  // いまの園の作りで、それぞれ何匹まで集まるか
  const season = calendarOf(state.day).season;
  const duckCap = capacity(seasonalHabitat(habitat, season)).duck;
  const birdCap = birdCapacity(wild.fish, habitat.treesNearWater);
  const faunaCap = faunaEnv ? faunaCapacity(biotope, faunaEnv) : null;
  // 増やしてほしいと頼まれるのは、図鑑に載っている生き物だけ（夜しか出ないフクロウは除く）
  const watchable = [
    { id: 'duck', name: ITEMS.duck.name, counter: '羽', count: wild.duck, cap: duckCap, max: Infinity },
    {
      id: 'kingfisher',
      name: BIRDS.kingfisher.name,
      counter: '羽',
      count: foodweb.count('kingfisher'),
      cap: birdCap.kingfisher,
      max: BIRD_NEEDS.maxKingfisher,
    },
    { id: 'heron', name: BIRDS.heron.name, counter: '羽', count: foodweb.count('heron'), cap: birdCap.heron, max: BIRD_NEEDS.maxHeron },
    ...FAUNA_ORDER.filter((k) => k !== 'owl').map((k) => ({
      id: k,
      name: FAUNA[k].name,
      counter: FAUNA[k].counter,
      count: fc[k],
      cap: faunaCap ? faunaCap[k] : FAUNA[k].max,
      max: FAUNA[k].max,
    })),
  ].filter((w) => dex.has(w.id as DexId));
  return {
    time: state.day + state.dayTimer / SECONDS_PER_DAY,
    wild,
    inventory: state.inventory,
    watchable,
    treesNearWater: habitat.treesNearWater,
    waterCells: habitat.waterCells,
    safety: appeal.safety,
    pressure: state.pressure,
    incident: state.incident > 0.05,
    income: Math.round(appeal.visitors * TICKET_PRICE * progress.rank.ticket),
  };
}

/** お願いが届いた・達成した・だめになったときの知らせと報酬 */
function onRequestEvent(e: RequestEvent): void {
  const client = clientOf(e.request);
  switch (e.type) {
    case 'offered':
      hud.flash(`${client}からお願いが届きました：${describe(e.request).title}（報酬 ${e.request.reward.toLocaleString()}G）`, 'good');
      requestPanel.ping();
      break;
    case 'done':
      state.money += e.request.reward;
      progress.earn(e.request.reward);
      hud.flash(`お願い達成！${client}から報酬 +${e.request.reward.toLocaleString()} G`, 'good');
      break;
    case 'failed':
      hud.flash(`${client}のお願いに応えられませんでした（${e.why}）`, 'bad');
      break;
    case 'expired':
      hud.flash(`${client}のお願いは期限が過ぎました`);
      break;
  }
}

/** ランクが上がったとき：賞金を渡し、大きく知らせる */
function onRankUp(): void {
  const rank = progress.rank;
  state.money += rank.reward;
  const el = document.createElement('div');
  el.className = 'rank-up card';
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <span class="rank-stars">${'★'.repeat(rank.stars)}<i>${'★'.repeat(RANKS.length - rank.stars)}</i></span>
    <b>${rank.name}になりました</b>
    <p>${rewardText(rank)}</p>`;
  document.getElementById('hud')!.appendChild(el);
  window.setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 4200);
  rankBadge.ping();
  refreshFacilityUi();
}

// ---- メインループ ----
const clock = new THREE.Clock();
let progressTimer = 0.5;
let statsTimer = 0;
let saveTimer = 0;
let biotopeTimer = 0;
/** 図鑑の最初の記録は、もう居る生き物を黙って載せるだけにする（始めた直後や再開時に知らせが並ばないように） */
let dexSynced = false;

function frame(): void {
  // realDt は実際に過ぎた時間、dt はゲーム内の時間（時間の速さを掛けたもの）
  // ご意見を書いているあいだは園の時間を止める（カメラなどは動く）
  const realDt = Math.min(clock.getDelta(), 0.1);
  const dt = feedbackDialog?.isOpen ? 0 : realDt * SPEEDS[state.speed].scale;
  const t = clock.elapsedTime;

  lastHit = pointerOnCanvas && state.tool !== 'pan' ? pick() : null;
  cursor.update(lastHit);
  applyTool(realDt);

  // 統計は重めなので、変化があったときだけ間引いて計算する
  statsTimer += realDt;
  if (statsDirty && statsTimer > 0.25) {
    habitat = habitatNow();
    biotope = biotopeNow();
    biotopeTimer = 0;
    scenic = paths.scenicValue(WATER_LEVEL);
    facilities.refreshViews(forest.trees);
    statsDirty = false;
    statsTimer = 0;
  }
  // 若木が育つと林になるので、何も変えていなくても数秒ごとに場所を調べ直す
  biotopeTimer += realDt;
  if (biotopeTimer > 3) {
    biotopeTimer = 0;
    biotope = biotopeNow();
  }

  // 季節と天気：夏の晴れが続くと池の水位が下がる
  const cal = calendarOf(state.day);
  seasonState.waterOffset = stepWater(seasonState.waterOffset, waterTarget(cal.season, seasonState.weather), dt);
  if (Math.abs(seasonState.waterOffset - seasonState.habitatOffset) > 0.02) {
    seasonState.habitatOffset = seasonState.waterOffset;
    statsDirty = true;
  }
  if (seasonState.waterOffset < -0.15 && !seasonState.droughtWarned) {
    seasonState.droughtWarned = true;
    hud.flash('日照りで池の水位が下がっています。浅瀬のカモや魚が居られなくなります', 'bad');
  }
  if (seasonState.waterOffset > -0.05) seasonState.droughtWarned = false;
  creatureView.waterLevel = waterSurface();

  // 自然の時間を進める：木が育って実り、生き物が集まって動き回る（季節で速さや集まる生き物が変わる）
  forest.update(dt * SEASONS[cal.season].growth);
  const arrived = ecosystem.update(dt, seasonalHabitat(habitat, cal.season), forest.trees);
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

  // 浅瀬・小島・林などの場所があると、そこを好む生き物が集まる
  faunaEnv = {
    season: cal.season,
    weather: seasonState.weather,
    night: isNight(state.dayTimer / SECONDS_PER_DAY),
    weeds: foodweb.matureWeeds,
    deepCells: habitat.deepCells,
    fruit: forest.fruitCount,
    rabbits: ecosystem.count('rabbit'),
    pressure: state.pressure,
  };
  fauna.update(dt, biotope, faunaEnv, waterSurface());
  faunaView.waterLevel = waterSurface();
  faunaView.update(fauna.animals);

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
    const e = requests.noteIncident();
    if (e) onRequestEvent(e);
  }
  if (bearEvents.guestsTrapped > 0) {
    state.incident = Math.min(2, state.incident + ATTACK.trapSeverity * bearEvents.guestsTrapped);
    hud.flash('来園者が罠にかかってけがをしました。遊歩道のそばの罠は危険です', 'bad');
    reviews.note('guestTrapped');
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
  // 木の茂り具合と予想される獣道は、ときどき見直す
  trailTimer -= dt;
  if (trailTimer <= 0) {
    trailTimer = 1;
    bears.updateCover(forest.trees);
    bearView.setTrail(bears.sign, bears.predictTrail(paths));
  }
  bearView.update(bears.bears, bears.traps, t);
  rareView.update(rare.state, t);
  facilityView.update(facilities.facilities);
  facilityView.animate(t);

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
  updateRangers(dt);
  rangerView.update(rangers.rangers, t);

  state.incident = decayIncident(state.incident, dt);
  const access = {
    scenic: scenic + foodweb.appealBonus() + fauna.appealBonus() + facilities.appealBonus(lastVisitors),
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
  const bonus = seasonalBonus(cal.season, habitat);
  const evaluate = () =>
    applySeason(
      // 図鑑が埋まるほど評判が広まり、客が増える
      applyRareBoost(computeAppeal(habitat, wildlife, state.pressure, state.incident, access), boost * dex.boostWith(facilities.dexBoost)),
      cal.season,
      seasonState.weather,
      bonus,
    );
  let appeal = evaluate();
  lastVisitors = appeal.visitors;

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
    const e = requests.noteIncident();
    if (e) onRequestEvent(e);
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
  saveTimer += realDt;
  if (saveTimer >= SAVE_INTERVAL) {
    saveTimer = 0;
    saveNow();
  }

  // 1 日が過ぎるごとに入園料が入る
  state.dayTimer += dt;
  if (state.dayTimer >= SECONDS_PER_DAY) {
    state.dayTimer -= SECONDS_PER_DAY;
    state.day++;
    const income = Math.round(appeal.visitors * TICKET_PRICE * progress.rank.ticket);
    const shopIncome = facilities.shopIncome(appeal.visitors);
    state.money += income + shopIncome;
    progress.earn(income + shopIncome);
    hud.flash(
      `${state.day - 1}日目の入園料  +${income.toLocaleString()} G${shopIncome > 0 ? `　売店 +${shopIncome.toLocaleString()} G` : ''}`,
      'good',
    );
    // 朝になると天気が決まる。季節が変わったら知らせる
    const next = calendarOf(state.day);
    const prevWeather = seasonState.weather;
    seasonState.weather = rollWeather(next.season);
    if (next.season !== cal.season) hud.flash(SEASONS[next.season].arrival, 'good');
    else if (seasonState.weather === 'rain' && prevWeather !== 'rain') hud.flash('雨が降ってきました。今日は客が少なめです');
    else if (seasonState.weather === 'snow' && prevWeather !== 'snow') hud.flash('雪が降ってきました');
    seasonView.set(next.season, seasonState.weather);
    // 夜も営業していれば、営業していた時間の分だけ夜の部の入園料が入り、電気代を払う
    if (nightOpenTime > 0) {
      const share = Math.min(1, nightOpenTime / Math.max(nightTime, 0.001));
      const nightIncome = Math.round(Math.floor(nightVisitors(appeal.visitors, true) * share) * TICKET_PRICE * progress.rank.ticket);
      const cost = lightingCost(lanterns);
      state.money += nightIncome - cost;
      progress.earn(nightIncome);
      hud.flash(`夜の部  +${nightIncome.toLocaleString()} G（電気代 -${cost} G）`, nightIncome >= cost ? 'good' : 'bad');
    }
    nightOpenTime = 0;
    nightTime = 0;
    // 駆除係の日給。払えなければ 1 人辞めていく
    if (rangers.count > 0) {
      if (state.money >= rangers.payroll) {
        state.money -= rangers.payroll;
        hud.flash(`駆除係の日給  -${rangers.payroll} G`);
      } else {
        rangers.dismiss();
        hud.flash('給料が払えず、駆除係が 1 人辞めてしまいました', 'bad');
      }
    }
    // 日が変わるとき、森が育っているほどクマが出やすい（冬は冬眠して出ない）
    // 前の日に足跡が見つかっていれば、そこからクマが現れる
    if (bears.sign) {
      if (SEASONS[next.season].bears) {
        bears.updateCover(forest.trees);
        bears.spawn();
        hud.flash('クマが現れました！仕掛けた罠へ来るのを待つか、銃で狩りましょう', 'bad');
      } else {
        bears.sign = null; // 冬眠の季節になった
      }
      trailTimer = 0;
    } else if (
      // 日が変わるとき、森が育っているほどクマが出やすい（冬は冬眠して出ない）。まず足跡が見つかる
      SEASONS[next.season].bears &&
      state.day >= BEAR.firstDay &&
      bears.bears.length === 0 &&
      Math.random() < BEAR.chance(forest.trees.length)
    ) {
      const sign = bears.scout();
      trailTimer = 0;
      hud.flash(`${Bears.sideName(sign)}の端でクマの足跡が見つかりました。明日現れそうです。足跡の続く獣道に罠を仕掛けましょう`, 'bad');
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
    // 朝ごとに相場が動く。きのう予告した品が高値になる
    market.onNewDay();
    hud.flash(`相場：${market.note()}`);
    // 朝ごとに、期限の過ぎたお願いを片付けて新しいお願いを受ける
    for (const e of requests.onNewDay(parkNow(appeal, wild))) onRequestEvent(e);
  }

  foodwebPanel.update({
    weeds: foodweb.matureWeeds,
    weedsGrowing: foodweb.weeds.length - foodweb.matureWeeds,
    fish: wild.fish,
    fishCap: fishCapacity(habitat.deepCells, habitat.weeds ?? 0),
    kingfisher: foodweb.count('kingfisher'),
    heron: foodweb.count('heron'),
  });

  // 園のランク：目標を判定し、全部達成したらランクアップ
  progressTimer += dt;
  if (progressTimer >= 0.5) {
    progressTimer = 0;
    const stats = parkStats(appeal.visitors, wild);
    const result = progress.evaluate(stats);
    for (const g of result.achieved) {
      if (result.rankedUp) break;
      hud.flash(`目標達成：${g.label}`, 'good');
      rankBadge.ping();
    }
    if (result.rankedUp) onRankUp();
    rankBadge.update(progress, progress.goals(stats));

    // 生き物図鑑：はじめて現れた生き物を記録し、発見ボーナスを渡す
    const present: Partial<Record<DexId, number>> = {
      rabbit: wild.rabbit,
      duck: wild.duck,
      fish: wild.fish,
      fox: wild.fox,
      bear: wild.bear,
      kingfisher: foodweb.count('kingfisher'),
      heron: foodweb.count('heron'),
      firefly: rare.has('firefly') ? 1 : 0,
      salamander: rare.has('salamander') ? 1 : 0,
      ...fauna.counts(),
    };
    const found = dex.record(present, state.day);
    if (dexSynced) {
      for (const e of found) {
        state.money += e.bonus;
        hud.flash(`図鑑に登録：${e.name}（${dex.count}/${dex.total}） 発見ボーナス +${e.bonus}G`, 'good');
        dexPanel.ping();
      }
    }
    dexSynced = true;
    dexPanel.update(dex, present, facilities.dexBoost);

    // 日替わりのお願い：数を満たしたら達成
    const now = parkNow(appeal, wild);
    for (const e of requests.update(now)) onRequestEvent(e);
    requestPanel.update(requests.active, requests.active ? progressOf(requests.active, now) : null, state.day);
  }

  rangerPanel.update(rangers.count, state.money);
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
    market,
    bears: bears.bears.length,
    bearSign: bears.sign !== null,
    traps: bears.traps.length,
    darkness: darkness(dayProgress),
    nightOpen: state.nightOpen,
    nightVisitors: nightVisitors(appeal.visitors, state.nightOpen),
    lightingCost: lightingCost(lanterns),
  });

  seasonBadge.update(cal, seasonState.weather, bonus);
  seasonView.update(realDt, t, seasonState.waterOffset, isFrozen(cal.season) ? Math.floor(appeal.visitors / 15) : 0, controls.target, darkness(dayProgress));
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
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});

// iPhone：文字入力（キーボード）などでページがずれたまま残ると、スクロールバーが出て
// 地図の操作がしづらくなる。ページ自体は動かないものなので、ずれたら元に戻す
// （入力中はキーボードで隠れないよう iPhone がずらすので、入力が終わってから戻す）
function resetPageScroll(): void {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
  if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
}
window.addEventListener('scroll', resetPageScroll);
document.addEventListener('focusout', () => setTimeout(resetPageScroll, 100));
