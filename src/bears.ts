import type { Heightmap } from './heightmap';
import type { PathGrid } from './paths';

/**
 * クマの出没イベント（描画から独立）。
 * - 出没の前日、地図の端に足跡（予兆）が見つかる。翌日そこからクマが現れる
 * - クマは身を隠せる林や水辺を好み、開けた草地や遊歩道を避けながら来園者へ近づく（獣道）
 * - 通り道の柵と遊歩道を壊し、来園者に近づくと襲う
 * - 罠にかけるか、銃で撃って狩るまで居座る。クマから見える近さには罠を置けない
 */

export interface Bear {
  id: number;
  x: number;
  z: number;
  heading: number;
  /** 残りの体力。銃で撃つと減る */
  hp: number;
  /** 襲ったあと・壊したあとに立ち止まる残り秒数 */
  pause: number;
  /** 次に目標を探し直すまでの秒数 */
  retarget: number;
  targetX: number;
  targetZ: number;
  phase: number;
  /** これから歩く獣道（マスの中心の並び）。先頭が次に向かう地点 */
  route?: { x: number; z: number }[];
}

/** 出没の予兆（足跡）。翌日ここからクマが現れる */
export interface BearSign {
  x: number;
  z: number;
}

export interface Trap {
  x: number;
  z: number;
}

export const BEAR = {
  /** 歩く速さ（秒あたり） */
  speed: 1.4,
  /** 水の中を進むときの速さの倍率 */
  swimFactor: 0.4,
  hp: 2,
  /** 来園者を襲う距離 */
  attackRange: 0.9,
  /** 罠にかかる距離 */
  trapRange: 1.0,
  /** 撃って当たる距離（狙った地点から） */
  shotRange: 1.6,
  /** 道を壊す幅 */
  smashRadius: 0.8,
  /** 1 日の終わりに出没する確率（木の数で増える） */
  chance(trees: number): number {
    return Math.min(0.35, 0.08 + trees / 1000);
  },
  /** 出没し始める日 */
  firstDay: 3,
  /** クマがこの距離より近いと、気づかれて罠を置けない */
  wary: 6,
  /** 来園者が罠にかかる距離（遊歩道のすぐ脇の罠は危ない） */
  guestTrapRange: 0.8,
} as const;

/**
 * 獣道の歩きにくさ（1 マスあたり）。クマは合計が一番小さい道を選ぶ。
 * 林の中は 1、まわりに木のない草地は open だけ足される
 */
export const BEAR_ROUTE = {
  /** 木が 1 本もない開けた場所に足される重み */
  open: 4,
  /** これだけ周りに木があれば身を隠せる（重みが足されない） */
  coverTrees: 3,
  /** 木を数える範囲（マス） */
  coverRadius: 2,
  /** 水の中に足される重み（泳ぐと遅いので避けるが、草地よりはまし） */
  water: 2,
  /** 来園者が歩く遊歩道に足される重み（人目を避ける） */
  path: 3,
} as const;

export type TrapResult = 'ok' | 'water' | 'near-trap' | 'path' | 'bear-near';

export const TRAP_COST = 60;
export const SHOT_COST = 20;

export interface BearEvents {
  /** 壊した遊歩道のマス数 */
  smashed: number;
  /** 襲われた来園者の数 */
  attacked: number;
  /** 罠にかかったクマの数 */
  trapped: number;
  /** 罠にかかってけがをした来園者の数 */
  guestsTrapped: number;
}

export interface Walkers {
  /** 来園者の位置 */
  positions(): { x: number; z: number }[];
  /** 地点の近くの来園者を 1 人取り除く（襲われた）。取り除けたら true */
  removeNear(x: number, z: number, r: number): boolean;
}

export class Bears {
  readonly bears: Bear[] = [];
  readonly traps: Trap[] = [];
  /** 出没の予兆（足跡）。無ければ null */
  sign: BearSign | null = null;
  private nextId = 1;
  /** マスごとの周りの木の数 */
  private readonly cover: Uint8Array;
  private readonly map: Heightmap;
  private readonly waterLevel: number;
  private readonly rand: () => number;

  constructor(map: Heightmap, waterLevel: number, rand: () => number = Math.random) {
    this.map = map;
    this.waterLevel = waterLevel;
    this.rand = rand;
    this.cover = new Uint8Array(map.size * map.size);
  }

  /** 保存データからクマと罠と足跡を戻す */
  restore(bears: readonly Bear[], traps: readonly Trap[], sign: BearSign | null = null): void {
    this.bears.length = 0;
    this.traps.length = 0;
    for (const b of bears) this.bears.push({ ...b, route: [] });
    for (const t of traps) this.traps.push({ ...t });
    this.sign = sign ? { ...sign } : null;
    this.nextId = this.bears.reduce((m, b) => Math.max(m, b.id), 0) + 1;
  }

  /** 木の位置から、マスごとの「身の隠しやすさ」を数え直す */
  updateCover(trees: readonly { x: number; z: number }[]): void {
    const n = this.map.size;
    const r = BEAR_ROUTE.coverRadius;
    this.cover.fill(0);
    for (const t of trees) {
      const [cx, cz] = this.cellOf(t.x, t.z);
      for (let z = Math.max(0, cz - r); z <= Math.min(n - 1, cz + r); z++) {
        for (let x = Math.max(0, cx - r); x <= Math.min(n - 1, cx + r); x++) {
          const i = z * n + x;
          if (this.cover[i] < 255) this.cover[i]++;
        }
      }
    }
  }

  /** 地図の端（出入口のある南側以外）に、翌日クマが現れる足跡を残す */
  scout(): BearSign {
    const half = this.map.worldSize / 2 - 1.5;
    const side = Math.floor(this.rand() * 3); // 0: 北, 1: 西, 2: 東
    const t = (this.rand() * 2 - 1) * half;
    const [x, z] = side === 0 ? [t, -half] : side === 1 ? [-half, t] : [half, t];
    this.sign = { x, z };
    return this.sign;
  }

  /** 足跡の場所から何方向か（北・西・東） */
  static sideName(sign: BearSign): string {
    if (Math.abs(sign.z) >= Math.abs(sign.x)) return sign.z < 0 ? '北' : '南';
    return sign.x < 0 ? '西' : '東';
  }

  /** クマを 1 頭出す。足跡があればそこから、無ければ地図の端のどこかから */
  spawn(): Bear {
    const at = this.sign ?? this.scout();
    this.sign = null;
    const { x, z } = at;
    const bear: Bear = {
      id: this.nextId++,
      x,
      z,
      heading: Math.atan2(-z, -x),
      hp: BEAR.hp,
      pause: 0,
      retarget: 0,
      targetX: 0,
      targetZ: 0,
      phase: 0,
      route: [],
    };
    this.bears.push(bear);
    return bear;
  }

  /**
   * 罠を置く。水の中・遊歩道の上・ほかの罠のすぐ近く・クマから見える近さには置けない。
   * クマが出てから目の前に置くのではなく、獣道を読んで先回りして仕掛ける
   */
  placeTrap(x: number, z: number, paths?: PathGrid): TrapResult {
    if (this.map.heightAt(x, z) < this.waterLevel) return 'water';
    if (paths?.isPathAt(x, z)) return 'path';
    if (this.traps.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 1.5 ** 2)) return 'near-trap';
    if (this.bears.some((b) => (b.x - x) ** 2 + (b.z - z) ** 2 < BEAR.wary ** 2)) return 'bear-near';
    this.traps.push({ x, z });
    return 'ok';
  }

  /** 半径内の罠を 1 つ取り除いて、その位置を返す（キツネがかかったときなど） */
  springTrapNear(x: number, z: number, r: number): Trap | null {
    const i = this.traps.findIndex((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < r * r);
    if (i < 0) return null;
    return this.traps.splice(i, 1)[0];
  }

  /**
   * 撃つ。狙った地点の近くのクマに当たれば体力が減り、0 になれば狩れる。
   * 'killed' | 'hit' | 'miss' を返す
   */
  shoot(x: number, z: number): 'killed' | 'hit' | 'miss' {
    let best = -1;
    let bestD = BEAR.shotRange ** 2;
    this.bears.forEach((b, i) => {
      const d = (b.x - x) ** 2 + (b.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0) return 'miss';
    const bear = this.bears[best];
    bear.hp--;
    bear.pause = 0.6; // ひるむ
    if (bear.hp > 0) return 'hit';
    this.bears.splice(best, 1);
    return 'killed';
  }

  update(dt: number, paths: PathGrid, walkers: Walkers): BearEvents {
    const events: BearEvents = { smashed: 0, attacked: 0, trapped: 0, guestsTrapped: 0 };
    // 遊歩道のすぐ脇の罠には来園者がかかってしまう
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const t = this.traps[i];
      if (walkers.removeNear(t.x, t.z, BEAR.guestTrapRange)) {
        this.traps.splice(i, 1);
        events.guestsTrapped++;
      }
    }
    for (let i = this.bears.length - 1; i >= 0; i--) {
      const b = this.bears[i];
      b.phase += dt * 6;

      // 罠にかかった
      if (this.springTrapNear(b.x, b.z, BEAR.trapRange)) {
        this.bears.splice(i, 1);
        events.trapped++;
        continue;
      }

      if (b.pause > 0) {
        b.pause -= dt;
        continue;
      }

      // 近くの来園者を襲う
      if (walkers.removeNear(b.x, b.z, BEAR.attackRange)) {
        events.attacked++;
        b.pause = 3;
        continue;
      }

      // 柵ごと遊歩道を壊しながら進む
      if (paths.isPathAt(b.x, b.z)) {
        const n = paths.paint(b.x, b.z, BEAR.smashRadius, true);
        if (n > 0) {
          events.smashed += n;
          b.pause = 0.8;
          continue;
        }
      }

      b.retarget -= dt;
      if (b.retarget <= 0 || !b.route) {
        this.chooseTarget(b, paths, walkers);
        b.route = this.route(b.x, b.z, b.targetX, b.targetZ, paths);
        b.retarget = 1;
      }
      // 獣道の次の地点へ。着いたら次へ
      let next = b.route[0];
      while (next && (next.x - b.x) ** 2 + (next.z - b.z) ** 2 < 0.3 ** 2) {
        b.route.shift();
        next = b.route[0];
      }
      const goal = next ?? { x: b.targetX, z: b.targetZ };
      const dx = goal.x - b.x;
      const dz = goal.z - b.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.05) {
        b.heading = Math.atan2(dz, dx);
        const inWater = this.map.heightAt(b.x, b.z) < this.waterLevel;
        const step = Math.min(dist, BEAR.speed * (inWater ? BEAR.swimFactor : 1) * dt);
        b.x += (dx / dist) * step;
        b.z += (dz / dist) * step;
      }
    }
    return events;
  }

  /**
   * 獣道を探す（A*）。林の中を好み、開けた草地・水・遊歩道を避ける。
   * 返すのは (fromX, fromZ) の次のマスから (toX, toZ) のマスまでの中心の並び
   */
  route(fromX: number, fromZ: number, toX: number, toZ: number, paths: PathGrid): { x: number; z: number }[] {
    const n = this.map.size;
    const [sx, sz] = this.cellOf(fromX, fromZ);
    const [gx, gz] = this.cellOf(toX, toZ);
    const start = sz * n + sx;
    const goal = gz * n + gx;
    if (start === goal) return [{ x: toX, z: toZ }];
    const g = new Float32Array(n * n).fill(Infinity);
    const from = new Int32Array(n * n).fill(-1);
    const closed = new Uint8Array(n * n);
    const heap = new MinHeap();
    g[start] = 0;
    heap.push(start, 0);
    const h = (i: number) => Math.hypot((i % n) - gx, Math.floor(i / n) - gz);
    while (heap.size > 0) {
      const cur = heap.pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % n;
      const cz = Math.floor(cur / n);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= n || z >= n) continue;
          const i = z * n + x;
          if (closed[i]) continue;
          const step = (dx && dz ? Math.SQRT2 : 1) * this.cellCost(x, z, paths, i === goal);
          const ng = g[cur] + step;
          if (ng < g[i]) {
            g[i] = ng;
            from[i] = cur;
            heap.push(i, ng + h(i));
          }
        }
      }
    }
    if (from[goal] < 0) return [{ x: toX, z: toZ }];
    const out: { x: number; z: number }[] = [];
    for (let i = goal; i !== start; i = from[i]) out.push(this.cellCenter(i % n, Math.floor(i / n)));
    out.reverse();
    out[out.length - 1] = { x: toX, z: toZ };
    return out;
  }

  /**
   * 足跡から予想される獣道。来園者が居なくても、一番近い出入口とつながった遊歩道を目指すと考える。
   * 足跡が無ければ空
   */
  predictTrail(paths: PathGrid): { x: number; z: number }[] {
    if (!this.sign) return [];
    const target = this.nearestPath(this.sign.x, this.sign.z, paths, true) ?? { x: 0, z: 0 };
    return [{ ...this.sign }, ...this.route(this.sign.x, this.sign.z, target.x, target.z, paths)];
  }

  /** 1 マス進む重み */
  private cellCost(cx: number, cz: number, paths: PathGrid, isGoal: boolean): number {
    let cost = 1;
    const c = this.cellCenter(cx, cz);
    if (this.map.heightAt(c.x, c.z) < this.waterLevel) cost += BEAR_ROUTE.water;
    else {
      const trees = this.cover[cz * this.map.size + cx];
      cost += BEAR_ROUTE.open * Math.max(0, 1 - trees / BEAR_ROUTE.coverTrees);
    }
    if (!isGoal && paths.has(cx, cz)) cost += BEAR_ROUTE.path;
    return cost;
  }

  private cellOf(x: number, z: number): [number, number] {
    const n = this.map.size;
    const half = this.map.worldSize / 2;
    const cs = this.map.cellSize;
    const cx = Math.min(n - 1, Math.max(0, Math.floor((x + half) / cs)));
    const cz = Math.min(n - 1, Math.max(0, Math.floor((z + half) / cs)));
    return [cx, cz];
  }

  private cellCenter(cx: number, cz: number): { x: number; z: number } {
    const half = this.map.worldSize / 2;
    const cs = this.map.cellSize;
    return { x: (cx + 0.5) * cs - half, z: (cz + 0.5) * cs - half };
  }

  private nearestPath(x: number, z: number, paths: PathGrid, connectedOnly: boolean): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (let cz = 0; cz < paths.size; cz++) {
      for (let cx = 0; cx < paths.size; cx++) {
        if (!paths.has(cx, cz)) continue;
        if (connectedOnly && !paths.isConnected(cx, cz)) continue;
        const c = paths.center(cx, cz);
        const d = (c.x - x) ** 2 + (c.z - z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
    }
    return best;
  }

  /** 一番近い来園者へ。いなければ一番近い遊歩道へ。それもなければ地図の中央へ */
  private chooseTarget(b: Bear, paths: PathGrid, walkers: Walkers): void {
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (const w of walkers.positions()) {
      const d = (w.x - b.x) ** 2 + (w.z - b.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    if (!best) best = this.nearestPath(b.x, b.z, paths, false);
    const target = best ?? { x: 0, z: 0 };
    b.targetX = target.x;
    b.targetZ = target.z;
  }
}

/** 獣道探し用の小さな優先度つきキュー */
class MinHeap {
  private readonly ids: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: number, key: number): void {
    const ids = this.ids;
    const keys = this.keys;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p];
      keys[i] = keys[p];
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }

  pop(): number {
    const ids = this.ids;
    const keys = this.keys;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastKey = keys.pop()!;
    const n = ids.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r] < keys[l] ? r : l;
        if (keys[c] >= lastKey) break;
        ids[i] = ids[c];
        keys[i] = keys[c];
        i = c;
      }
      ids[i] = lastId;
      keys[i] = lastKey;
    }
    return top;
  }
}
