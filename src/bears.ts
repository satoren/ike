import type { Heightmap } from './heightmap';
import type { PathGrid } from './paths';

/**
 * クマの出没イベント（描画から独立）。
 * - ときどき地図の端からクマが現れ、来園者のいる遊歩道へ向かう
 * - 通り道の柵と遊歩道を壊し、来園者に近づくと襲う
 * - 罠にかけるか、銃で撃って狩るまで居座る
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
} as const;

export const TRAP_COST = 60;
export const SHOT_COST = 20;

export interface BearEvents {
  /** 壊した遊歩道のマス数 */
  smashed: number;
  /** 襲われた来園者の数 */
  attacked: number;
  /** 罠にかかったクマの数 */
  trapped: number;
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
  private nextId = 1;
  private readonly map: Heightmap;
  private readonly waterLevel: number;
  private readonly rand: () => number;

  constructor(map: Heightmap, waterLevel: number, rand: () => number = Math.random) {
    this.map = map;
    this.waterLevel = waterLevel;
    this.rand = rand;
  }

  /** 地図の端（出入口のある南側以外）からクマを 1 頭出す */
  spawn(): Bear {
    const half = this.map.worldSize / 2 - 1.5;
    const side = Math.floor(this.rand() * 3); // 0: 北, 1: 西, 2: 東
    const t = (this.rand() * 2 - 1) * half;
    const [x, z] = side === 0 ? [t, -half] : side === 1 ? [-half, t] : [half, t];
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
    };
    this.bears.push(bear);
    return bear;
  }

  /** 罠を置く。近くに別の罠があれば置かない */
  placeTrap(x: number, z: number): boolean {
    if (this.traps.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 1.5 ** 2)) return false;
    if (this.map.heightAt(x, z) < this.waterLevel) return false;
    this.traps.push({ x, z });
    return true;
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
    const events: BearEvents = { smashed: 0, attacked: 0, trapped: 0 };
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
      if (b.retarget <= 0) {
        this.chooseTarget(b, paths, walkers);
        b.retarget = 1;
      }
      const dx = b.targetX - b.x;
      const dz = b.targetZ - b.z;
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
    if (!best) {
      for (let cz = 0; cz < paths.size; cz++) {
        for (let cx = 0; cx < paths.size; cx++) {
          if (!paths.has(cx, cz)) continue;
          const c = paths.center(cx, cz);
          const d = (c.x - b.x) ** 2 + (c.z - b.z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
      }
    }
    const target = best ?? { x: 0, z: 0 };
    b.targetX = target.x;
    b.targetZ = target.z;
  }
}
