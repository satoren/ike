import type { Heightmap } from './heightmap';
import type { Creature, CreatureKind } from './ecology';

/**
 * 密猟者イベント（描画から独立）。
 * - 夜になると地図の端から忍び込み、魚・カモ・ウサギを盗んでいく
 * - 盗めるだけ盗むと（または見つかると）地図の端へ逃げ、逃げ切られると盗まれたまま
 * - 「集める」でなぞると捕まえられる。報奨金がもらえ、盗まれた生き物は池や森へ戻る
 * - 来園者に見つかると慌てて逃げ出す（遊歩道が広く行き渡っているほど忍び込みにくい）
 */

export type PoacherMode = 'sneak' | 'flee';

export interface Poacher {
  id: number;
  x: number;
  z: number;
  heading: number;
  mode: PoacherMode;
  /** 盗んだ生き物 */
  loot: CreatureKind[];
  /** 盗んだあとに立ち止まる残り秒数 */
  pause: number;
  /** 忍び込んでいられる残り秒数。0 になると逃げ出す */
  stay: number;
  /** 逃げ先 */
  exitX: number;
  exitZ: number;
  phase: number;
}

/** 密猟者が狙う生き物 */
export const POACHER_TARGETS: readonly CreatureKind[] = ['fish', 'duck', 'rabbit'];

export const POACHER = {
  /** 忍び足の速さ（秒あたり） */
  speed: 1.5,
  /** 逃げるときの速さ */
  fleeSpeed: 2.6,
  /** 水の中を進むときの速さの倍率 */
  wadeFactor: 0.5,
  /** 生き物を盗める距離 */
  stealRange: 0.8,
  /** 1 人が盗める数 */
  maxLoot: 4,
  /** 来園者に見つかる距離 */
  spotRange: 2.5,
  /** 「集める」の範囲にこの距離まで入れば捕まえられる */
  catchSlack: 0.4,
  /** 忍び込んでいられる秒数（ゲーム内で 1 日の 3 分の 1 ほど） */
  stay: 20,
  /** 捕まえたときの報奨金 */
  reward: 150,
  /** 出没し始める日 */
  firstDay: 4,
  /** 同時に忍び込む最大人数 */
  max: 2,
  /** 日が変わる（夜になる）ときに忍び込む確率。獲物が多いほど狙われやすい */
  chance(prey: number): number {
    return Math.min(0.3, 0.04 + prey / 250);
  },
} as const;

export interface PoacherEvents {
  /** いま盗まれた生き物 */
  stolen: CreatureKind[];
  /** 逃げ切った密猟者が持ち去った生き物 */
  escapedWith: CreatureKind[][];
  /** 来園者に見つかって逃げ出した人数 */
  spotted: number;
}

/** 密猟者から見た生き物の群れ */
export interface Prey {
  readonly creatures: readonly Creature[];
  /** id の生き物を取り除く（盗まれた） */
  remove(id: number): void;
}

export class Poachers {
  readonly poachers: Poacher[] = [];
  private nextId = 1;
  private readonly map: Heightmap;
  private readonly waterLevel: number;
  private readonly rand: () => number;

  constructor(map: Heightmap, waterLevel: number, rand: () => number = Math.random) {
    this.map = map;
    this.waterLevel = waterLevel;
    this.rand = rand;
  }

  /** 保存データから戻す */
  restore(list: readonly Poacher[]): void {
    this.poachers.length = 0;
    for (const p of list) this.poachers.push({ ...p, loot: [...p.loot] });
    this.nextId = this.poachers.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  }

  /** 地図の端（出入口のある南側以外）から 1 人忍び込ませる */
  spawn(): Poacher {
    const half = this.map.worldSize / 2 - 1.5;
    const side = Math.floor(this.rand() * 3); // 0: 北, 1: 西, 2: 東
    const t = (this.rand() * 2 - 1) * half;
    const [x, z] = side === 0 ? [t, -half] : side === 1 ? [-half, t] : [half, t];
    const p: Poacher = {
      id: this.nextId++,
      x,
      z,
      heading: Math.atan2(-z, -x),
      mode: 'sneak',
      loot: [],
      pause: 0,
      stay: POACHER.stay,
      exitX: x,
      exitZ: z,
      phase: 0,
    };
    this.poachers.push(p);
    return p;
  }

  /** 半径内の密猟者を捕まえる。捕まえた人の盗品を（人ごとに）返す */
  catchWithin(x: number, z: number, r: number): CreatureKind[][] {
    const caught: CreatureKind[][] = [];
    const rr = (r + POACHER.catchSlack) ** 2;
    for (let i = this.poachers.length - 1; i >= 0; i--) {
      const p = this.poachers[i];
      if ((p.x - x) ** 2 + (p.z - z) ** 2 > rr) continue;
      caught.push(p.loot);
      this.poachers.splice(i, 1);
    }
    return caught;
  }

  update(dt: number, prey: Prey, visitors: readonly { x: number; z: number }[]): PoacherEvents {
    const events: PoacherEvents = { stolen: [], escapedWith: [], spotted: 0 };
    for (let i = this.poachers.length - 1; i >= 0; i--) {
      const p = this.poachers[i];
      p.phase += dt * 7;

      if (p.mode === 'sneak') {
        // 来園者に見つかったら逃げる
        const seen = visitors.some((v) => (v.x - p.x) ** 2 + (v.z - p.z) ** 2 < POACHER.spotRange ** 2);
        if (seen) {
          events.spotted++;
          this.flee(p);
        } else {
          p.stay -= dt;
          if (p.stay <= 0 || p.loot.length >= POACHER.maxLoot) this.flee(p);
        }
      }

      if (p.pause > 0) {
        p.pause -= dt;
        continue;
      }

      let tx: number;
      let tz: number;
      if (p.mode === 'flee') {
        tx = p.exitX;
        tz = p.exitZ;
        if ((tx - p.x) ** 2 + (tz - p.z) ** 2 < 0.3 ** 2) {
          this.poachers.splice(i, 1);
          if (p.loot.length > 0) events.escapedWith.push(p.loot);
          continue;
        }
      } else {
        const target = this.nearestPrey(p, prey.creatures);
        if (!target) {
          // 獲物がいなければ、うろつきながら待つ
          tx = p.x + Math.cos(p.heading + 0.3);
          tz = p.z + Math.sin(p.heading + 0.3);
        } else if ((target.x - p.x) ** 2 + (target.z - p.z) ** 2 < POACHER.stealRange ** 2) {
          prey.remove(target.id);
          p.loot.push(target.kind);
          events.stolen.push(target.kind);
          p.pause = 1.2;
          continue;
        } else {
          tx = target.x;
          tz = target.z;
        }
      }
      this.moveToward(p, tx, tz, dt);
    }
    return events;
  }

  /** 一番近い地図の端へ逃げ出す */
  private flee(p: Poacher): void {
    p.mode = 'flee';
    p.pause = Math.min(p.pause, 0.3);
    const half = this.map.worldSize / 2 - 1;
    const exits = [
      { x: p.x, z: -half },
      { x: -half, z: p.z },
      { x: half, z: p.z },
    ];
    let best = exits[0];
    let bestD = Infinity;
    for (const e of exits) {
      const d = (e.x - p.x) ** 2 + (e.z - p.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    p.exitX = best.x;
    p.exitZ = best.z;
  }

  private nearestPrey(p: Poacher, creatures: readonly Creature[]): Creature | null {
    let best: Creature | null = null;
    let bestD = Infinity;
    for (const c of creatures) {
      if (!POACHER_TARGETS.includes(c.kind)) continue;
      const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  private moveToward(p: Poacher, tx: number, tz: number, dt: number): void {
    const dx = tx - p.x;
    const dz = tz - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01) return;
    p.heading = Math.atan2(dz, dx);
    const inWater = this.map.heightAt(p.x, p.z) < this.waterLevel;
    const speed = (p.mode === 'flee' ? POACHER.fleeSpeed : POACHER.speed) * (inWater ? POACHER.wadeFactor : 1);
    const step = Math.min(dist, speed * dt);
    p.x += (dx / dist) * step;
    p.z += (dz / dist) * step;
    const half = this.map.worldSize / 2 - 0.5;
    p.x = Math.max(-half, Math.min(half, p.x));
    p.z = Math.max(-half, Math.min(half, p.z));
  }
}
