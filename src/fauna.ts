import type { Heightmap } from './heightmap';
import type { Season, Weather } from './seasons';
import { FRUIT } from './ecology';

/**
 * 場所の作り方で現れる生き物（描画から独立）。
 * 池の広さや木の本数の合計ではなく、「どんな場所があるか」で集まる種類が決まる。
 *   カエル   … 浅瀬（春〜秋）
 *   トンボ   … 水草のある浅瀬（夏・秋）
 *   カメ     … 池の中の小島
 *   リス     … 木を寄せて植えた林と、採らずに残した木の実
 *   シカ     … 遊歩道から離れた静かな林
 *   フクロウ … 夜、ウサギのいる林
 * どれも捕まえられない（見て楽しむ生き物）。居るだけで景観の魅力が上がる。
 */

export type FaunaKind = 'frog' | 'dragonfly' | 'turtle' | 'squirrel' | 'deer' | 'owl';

export const FAUNA_ORDER: FaunaKind[] = ['frog', 'dragonfly', 'turtle', 'squirrel', 'deer', 'owl'];

export const FAUNA: Record<FaunaKind, { name: string; appeal: number; max: number; counter: string }> = {
  frog: { name: 'カエル', appeal: 2, max: 8, counter: '匹' },
  dragonfly: { name: 'トンボ', appeal: 3, max: 8, counter: '匹' },
  turtle: { name: 'カメ', appeal: 6, max: 4, counter: '匹' },
  squirrel: { name: 'リス', appeal: 4, max: 6, counter: '匹' },
  deer: { name: 'シカ', appeal: 10, max: 4, counter: '頭' },
  owl: { name: 'フクロウ', appeal: 12, max: 2, counter: '羽' },
};

/** 場所の見分け方と、生き物 1 匹に必要な広さ */
export const BIOTOPE = {
  /** 浅瀬とみなす水深（魚が棲むには浅すぎる深さ） */
  shallowMin: 0.03,
  shallowMax: 0.45,
  /** この距離以内に、ほかの木がこの本数以上あれば「林の木」 */
  groveRadius: 3.5,
  groveNeighbors: 4,
  /** 遊歩道からこのマス数以上離れた林の木は「静かな林」 */
  quietCells: 10,
  shallowPerFrog: 80,
  shallowPerDragonfly: 60,
  weedsPerDragonfly: 6,
  islandPerTurtle: 6,
  /** カメが泳げる深い池の広さ */
  turtleDeepCells: 80,
  grovePerSquirrel: 6,
  fruitPerSquirrel: 10,
  quietPerDeer: 10,
  /** 荒らされ度がこれ以上だとシカは寄りつかない */
  deerFleePressure: 40,
  grovePerOwl: 15,
  /** フクロウが狙うウサギの最低数 */
  owlRabbits: 4,
} as const;

/** 木が育ったとみなす年齢（実をつけ始めるころ） */
const GROWN_AGE = FRUIT.matureAge;

export interface Spot {
  x: number;
  z: number;
  /** 木のてっぺんの高さ（止まり木用。木の場所だけ） */
  top?: number;
}

/** 園の中の「場所」の一覧。地形・木・遊歩道が変わったときに調べ直す */
export interface Biotope {
  /** 浅瀬 */
  shallow: Spot[];
  /** 岸とつながっていない小島 */
  island: Spot[];
  /** 林の木（まわりに木が集まっている木） */
  grove: Spot[];
  /** 林の木のうち、遊歩道から離れているもの */
  quiet: Spot[];
}

export function emptyBiotope(): Biotope {
  return { shallow: [], island: [], grove: [], quiet: [] };
}

/**
 * 地形・木・遊歩道から、生き物の居場所になる場所を調べる。
 * isPath は遊歩道のマスかどうか（マス座標）。
 */
export function surveyBiotope(
  map: Heightmap,
  waterLevel: number,
  allTrees: readonly { x: number; z: number; scale?: number; age?: number }[],
  isPath: (cx: number, cz: number) => boolean = () => false,
): Biotope {
  // 林になるのは育った木だけ（植えたばかりの若木は数えない）
  const trees = allTrees.filter((t) => (t.age ?? GROWN_AGE) >= GROWN_AGE);
  const n = map.verts;
  const half = map.worldSize / 2;
  const cs = map.cellSize;
  const pos = (i: number): Spot => ({ x: (i % n) * cs - half, z: Math.floor(i / n) * cs - half });

  // 浅瀬：水深が浅い頂点
  const shallow: Spot[] = [];
  const land = new Uint8Array(n * n);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const d = waterLevel - map.get(ix, iz);
      const i = iz * n + ix;
      if (d <= 0) land[i] = 1;
      const edge = Math.min(ix, iz, n - 1 - ix, n - 1 - iz);
      if (edge >= 2 && d >= BIOTOPE.shallowMin && d <= BIOTOPE.shallowMax) shallow.push(pos(i));
    }
  }

  // 小島：地図の縁から陸づたいにたどり着けない陸地
  const reached = new Uint8Array(n * n);
  const queue: number[] = [];
  const seed = (i: number) => {
    if (land[i] && !reached[i]) {
      reached[i] = 1;
      queue.push(i);
    }
  };
  for (let k = 0; k < n; k++) {
    seed(k);
    seed((n - 1) * n + k);
    seed(k * n);
    seed(k * n + n - 1);
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const ix = i % n;
    if (ix > 0) seed(i - 1);
    if (ix < n - 1) seed(i + 1);
    if (i >= n) seed(i - n);
    if (i < n * (n - 1)) seed(i + n);
  }
  const island: Spot[] = [];
  for (let i = 0; i < n * n; i++) if (land[i] && !reached[i]) island.push(pos(i));

  // 林の木：近くにほかの木が集まっている木（マス目に分けて数える）
  const r = BIOTOPE.groveRadius;
  const buckets = new Map<number, number[]>();
  const key = (bx: number, bz: number) => bx * 4096 + bz;
  const bucketOf = (v: number) => Math.floor((v + half) / r);
  trees.forEach((t, i) => {
    const k = key(bucketOf(t.x), bucketOf(t.z));
    const list = buckets.get(k);
    if (list) list.push(i);
    else buckets.set(k, [i]);
  });
  const grove: Spot[] = [];
  trees.forEach((t, i) => {
    const bx = bucketOf(t.x);
    const bz = bucketOf(t.z);
    let near = 0;
    for (let dz = -1; dz <= 1 && near < BIOTOPE.groveNeighbors; dz++) {
      for (let dx = -1; dx <= 1 && near < BIOTOPE.groveNeighbors; dx++) {
        for (const j of buckets.get(key(bx + dx, bz + dz)) ?? []) {
          if (j === i) continue;
          const o = trees[j];
          if ((o.x - t.x) ** 2 + (o.z - t.z) ** 2 <= r * r && ++near >= BIOTOPE.groveNeighbors) break;
        }
      }
    }
    if (near >= BIOTOPE.groveNeighbors) {
      grove.push({ x: t.x, z: t.z, top: 1.78 * (t.scale ?? 1) });
    }
  });

  // 静かな林：どの遊歩道からも離れている林の木
  const size = map.size;
  const dist = new Int32Array(size * size).fill(-1);
  const pq: number[] = [];
  for (let cz = 0; cz < size; cz++) {
    for (let cx = 0; cx < size; cx++) {
      if (isPath(cx, cz)) {
        dist[cz * size + cx] = 0;
        pq.push(cz * size + cx);
      }
    }
  }
  for (let head = 0; head < pq.length; head++) {
    const i = pq[head];
    const d = dist[i] + 1;
    if (d >= BIOTOPE.quietCells) continue;
    const cx = i % size;
    const visit = (j: number) => {
      if (dist[j] < 0) {
        dist[j] = d;
        pq.push(j);
      }
    };
    if (cx > 0) visit(i - 1);
    if (cx < size - 1) visit(i + 1);
    if (i >= size) visit(i - size);
    if (i < size * (size - 1)) visit(i + size);
  }
  const cell = (v: number) => Math.min(size - 1, Math.max(0, Math.floor((v + half) / cs)));
  const quiet = grove.filter((t) => dist[cell(t.z) * size + cell(t.x)] < 0);

  return { shallow, island, grove, quiet };
}

/** 場所のほかに、生き物が集まるかどうかを決めるもの */
export interface FaunaEnv {
  season: Season;
  weather: Weather;
  night: boolean;
  /** 育った水草の株数 */
  weeds: number;
  /** 魚が棲める深さの池のマス数 */
  deepCells: number;
  /** いま木に実っている木の実の数 */
  fruit: number;
  rabbits: number;
  /** 採りすぎによる荒らされ度 */
  pressure: number;
}

/** いまの場所と季節で、それぞれ何匹まで集まるか */
export function faunaCapacity(b: Biotope, env: FaunaEnv): Record<FaunaKind, number> {
  const winter = env.season === 'winter';
  const cap = (kind: FaunaKind, v: number) => Math.max(0, Math.min(FAUNA[kind].max, Math.floor(v)));

  // カエル：冬は冬眠。秋は半分。雨の日はよく出てくる
  let frog = winter ? 0 : b.shallow.length / BIOTOPE.shallowPerFrog;
  if (env.season === 'autumn') frog /= 2;
  if (frog >= 1 && env.weather === 'rain') frog += 2;

  const dragonfly =
    env.season === 'summer' || env.season === 'autumn'
      ? Math.min(b.shallow.length / BIOTOPE.shallowPerDragonfly, env.weeds / BIOTOPE.weedsPerDragonfly)
      : 0;

  const turtle = !winter && env.deepCells >= BIOTOPE.turtleDeepCells ? b.island.length / BIOTOPE.islandPerTurtle : 0;
  const squirrel = Math.min(b.grove.length / BIOTOPE.grovePerSquirrel, env.fruit / BIOTOPE.fruitPerSquirrel);
  const deer = env.pressure < BIOTOPE.deerFleePressure ? b.quiet.length / BIOTOPE.quietPerDeer : 0;
  const owl = env.night && env.rabbits >= BIOTOPE.owlRabbits ? b.grove.length / BIOTOPE.grovePerOwl : 0;

  return {
    frog: cap('frog', frog),
    dragonfly: cap('dragonfly', dragonfly),
    turtle: cap('turtle', turtle),
    squirrel: cap('squirrel', squirrel),
    deer: cap('deer', deer),
    owl: cap('owl', owl),
  };
}

export interface Animal {
  id: number;
  kind: FaunaKind;
  x: number;
  z: number;
  /** 地面（トンボは水面）からの高さ */
  y: number;
  heading: number;
  /** 向かっている先 */
  tx: number;
  tz: number;
  ty: number;
  /** 立ち止まっている残り秒数 */
  rest: number;
  phase: number;
}

export interface FaunaEvents {
  arrived: FaunaKind[];
  left: FaunaKind[];
}

/** 種類ごとの動き方：速さ、次の行き先を探す距離、休む秒数 [最短, 最長] */
const MOVE: Record<FaunaKind, { speed: number; reach: number; rest: [number, number]; phase: number }> = {
  frog: { speed: 2.6, reach: 3, rest: [2, 7], phase: 9 },
  dragonfly: { speed: 4.2, reach: 7, rest: [0.6, 2.5], phase: 40 },
  turtle: { speed: 0.25, reach: 2.5, rest: [6, 16], phase: 2 },
  squirrel: { speed: 3, reach: 5, rest: [1, 4], phase: 14 },
  deer: { speed: 0.9, reach: 7, rest: [4, 10], phase: 5 },
  owl: { speed: 5, reach: 14, rest: [6, 14], phase: 6 },
};

/** 条件が合わなくなってから 1 匹去るまでの秒数 */
const LEAVE_DELAY = 5;

export class Fauna {
  readonly animals: Animal[] = [];
  private nextId = 1;
  private spawnTimer = 0;
  private checkTimer = 0;
  private readonly over: Record<FaunaKind, number> = { frog: 0, dragonfly: 0, turtle: 0, squirrel: 0, deer: 0, owl: 0 };
  private readonly map: Heightmap;
  private readonly rand: () => number;

  constructor(map: Heightmap, rand: () => number = Math.random) {
    this.map = map;
    this.rand = rand;
  }

  count(kind: FaunaKind): number {
    let n = 0;
    for (const a of this.animals) if (a.kind === kind) n++;
    return n;
  }

  counts(): Record<FaunaKind, number> {
    const out: Record<FaunaKind, number> = { frog: 0, dragonfly: 0, turtle: 0, squirrel: 0, deer: 0, owl: 0 };
    for (const a of this.animals) out[a.kind]++;
    return out;
  }

  /** 居ることで加わる景観の魅力 */
  appealBonus(): number {
    return this.animals.reduce((s, a) => s + FAUNA[a.kind].appeal, 0);
  }

  restore(list: readonly Animal[] | undefined): void {
    this.animals.length = 0;
    for (const a of list ?? []) if (a.kind in FAUNA) this.animals.push({ ...a });
    this.nextId = this.animals.reduce((m, a) => Math.max(m, a.id), 0) + 1;
  }

  private spots(kind: FaunaKind, b: Biotope): readonly Spot[] {
    switch (kind) {
      case 'frog':
      case 'dragonfly':
        return b.shallow;
      case 'turtle':
        return b.island;
      case 'squirrel':
      case 'owl':
        return b.grove;
      case 'deer':
        return b.quiet;
    }
  }

  /** 居場所の近くの、実際に立つ地点（木なら根元の横、フクロウは木のてっぺん） */
  private standAt(kind: FaunaKind, s: Spot): { x: number; z: number; y: number } {
    if (kind === 'owl') return { x: s.x, z: s.z, y: (s.top ?? 1.7) - 0.12 };
    if (kind === 'squirrel' || kind === 'deer') {
      const a = this.rand() * Math.PI * 2;
      const d = kind === 'deer' ? 0.9 + this.rand() * 0.8 : 0.7 + this.rand() * 1.1;
      return { x: s.x + Math.cos(a) * d, z: s.z + Math.sin(a) * d, y: 0 };
    }
    const j = kind === 'turtle' ? 0.3 : 0.8;
    return {
      x: s.x + (this.rand() - 0.5) * j,
      z: s.z + (this.rand() - 0.5) * j,
      y: kind === 'dragonfly' ? 0.35 + this.rand() * 0.5 : 0,
    };
  }

  /** 居場所を選んで 1 匹呼び寄せる */
  spawn(kind: FaunaKind, b: Biotope): Animal | null {
    const spots = this.spots(kind, b);
    if (spots.length === 0) return null;
    const p = this.standAt(kind, spots[Math.floor(this.rand() * spots.length)]);
    const a: Animal = {
      id: this.nextId++,
      kind,
      x: p.x,
      z: p.z,
      y: p.y,
      heading: this.rand() * Math.PI * 2,
      tx: p.x,
      tz: p.z,
      ty: p.y,
      rest: 1 + this.rand() * 3,
      phase: this.rand() * Math.PI * 2,
    };
    this.animals.push(a);
    return a;
  }

  /** 時間を進める。条件に合う数まで少しずつ集まり、合わなくなると去っていく */
  update(dt: number, b: Biotope, env: FaunaEnv, waterLevel: number): FaunaEvents {
    const events: FaunaEvents = { arrived: [], left: [] };
    const cap = faunaCapacity(b, env);
    const counts = this.counts();

    for (const kind of FAUNA_ORDER) {
      if (counts[kind] > cap[kind]) {
        this.over[kind] += dt;
        if (this.over[kind] >= LEAVE_DELAY) {
          this.over[kind] = 0;
          this.animals.splice(
            this.animals.findIndex((a) => a.kind === kind),
            1,
          );
          counts[kind]--;
          if (counts[kind] === 0) events.left.push(kind);
        }
      } else {
        this.over[kind] = 0;
      }
    }

    this.spawnTimer += dt;
    if (this.spawnTimer >= 2) {
      this.spawnTimer = 0;
      for (const kind of FAUNA_ORDER) {
        if (counts[kind] < cap[kind] && this.rand() < 0.5 && this.spawn(kind, b)) events.arrived.push(kind);
      }
    }

    // 居場所が無くなった（埋められた・木が沈んだ・道が通った）ものは、別の場所へ移る
    this.checkTimer += dt;
    if (this.checkTimer >= 1) {
      this.checkTimer = 0;
      for (const a of this.animals) {
        const spots = this.spots(a.kind, b);
        if (spots.length === 0 || this.near(spots, a.tx, a.tz, 3) !== null) continue;
        const p = this.standAt(a.kind, spots[Math.floor(this.rand() * spots.length)]);
        Object.assign(a, { x: p.x, z: p.z, y: p.y, tx: p.x, tz: p.z, ty: p.y });
      }
    }

    for (const a of this.animals) this.move(a, dt, b, waterLevel);
    return events;
  }

  private near(spots: readonly Spot[], x: number, z: number, range: number): Spot | null {
    for (const s of spots) if ((s.x - x) ** 2 + (s.z - z) ** 2 <= range * range) return s;
    return null;
  }

  /** 近くの居場所からランダムに 1 つ選ぶ */
  private pickNear(kind: FaunaKind, a: Animal, b: Biotope): Spot | null {
    const reach = MOVE[kind].reach;
    let chosen: Spot | null = null;
    let seen = 0;
    for (const s of this.spots(kind, b)) {
      if ((s.x - a.x) ** 2 + (s.z - a.z) ** 2 > reach * reach) continue;
      if (this.rand() * ++seen < 1) chosen = s;
    }
    return chosen;
  }

  private move(a: Animal, dt: number, b: Biotope, waterLevel: number): void {
    const m = MOVE[a.kind];
    const dx = a.tx - a.x;
    const dz = a.tz - a.z;
    const dist = Math.hypot(dx, dz);

    if (dist > 0.12) {
      a.phase += dt * m.phase;
      a.heading = Math.atan2(dz, dx);
      const step = Math.min(dist, m.speed * dt);
      const nx = a.x + (dx / dist) * step;
      const nz = a.z + (dz / dist) * step;
      // 地面を歩く生き物は水に入らない。行き先を選び直す
      const walker = a.kind === 'squirrel' || a.kind === 'deer';
      if (walker && this.map.heightAt(nx, nz) < waterLevel + 0.05) {
        a.tx = a.x;
        a.tz = a.z;
        a.rest = 0.5;
        return;
      }
      a.x = nx;
      a.z = nz;
      // フクロウは木から木へ、いったん高く飛んでから降りる
      const arc = a.kind === 'owl' ? Math.min(1.2, dist * 0.25) : 0;
      a.y += (a.ty + arc - a.y) * Math.min(1, dt * 4);
      return;
    }

    a.y += (a.ty - a.y) * Math.min(1, dt * 4);
    if (a.kind === 'dragonfly') a.phase += dt * m.phase; // 止まらずに羽ばたき続ける
    a.rest -= dt;
    if (a.rest > 0) return;
    a.rest = m.rest[0] + this.rand() * (m.rest[1] - m.rest[0]);
    const s = this.pickNear(a.kind, a, b);
    if (!s) return;
    const p = this.standAt(a.kind, s);
    a.tx = p.x;
    a.tz = p.z;
    a.ty = p.y;
  }
}
