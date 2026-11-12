import type { Heightmap } from './heightmap';

/**
 * 害獣駆除係（描画から独立）。
 * - お金を払って雇う。毎朝、日給を払う（払えないと 1 人辞める）
 * - ふだんは園内を巡回し、見回り範囲のキツネ・密猟者に駆けつける。クマは園内のどこに出ても向かう
 * - クマは近づいて撃つ（2 発で仕留める）。キツネと密猟者は追いついて捕まえる
 * - どの相手を狙うかは「危ない順」: クマ → 密猟者 → キツネ
 */

export interface Ranger {
  id: number;
  x: number;
  z: number;
  heading: number;
  /** 次に撃てるまでの秒数 */
  cooldown: number;
  /** 巡回先 */
  patrolX: number;
  patrolZ: number;
  /** 巡回先を選び直すまでの秒数 */
  retarget: number;
  phase: number;
}

export const RANGER = {
  /** 雇うときの支度金 */
  hireCost: 200,
  /** 1 人あたりの日給 */
  wage: 40,
  /** 雇える最大人数 */
  max: 3,
  /** 歩く速さ。クマ（1.4）や忍び足の密猟者（1.5）より速く、逃げる密猟者（2.6）より遅い */
  speed: 2.2,
  /** 水の中を進むときの速さの倍率 */
  wadeFactor: 0.45,
  /** 見回り範囲（この距離以内のキツネ・密猟者に気づいて駆けつける。クマは距離に関係なく向かう） */
  sight: 14,
  /** クマを撃てる距離 */
  shotRange: 4,
  /** 撃ったあと次に撃てるまでの秒数 */
  reload: 1.5,
  /** キツネ・密猟者を捕まえられる距離 */
  catchRange: 0.9,
} as const;

/** 駆除係から見た相手 */
export interface Threat {
  kind: 'bear' | 'poacher' | 'fox';
  id: number;
  x: number;
  z: number;
}

const PRIORITY: Record<Threat['kind'], number> = { bear: 0, poacher: 1, fox: 2 };

/** 駆除係がしたこと。実際の処理（撃つ・捕まえる）は呼び出し側で行う */
export interface RangerAction {
  kind: 'shoot' | 'catch';
  target: Threat;
}

export class Rangers {
  readonly rangers: Ranger[] = [];
  private nextId = 1;
  private readonly map: Heightmap;
  private readonly waterLevel: number;
  private readonly rand: () => number;

  constructor(map: Heightmap, waterLevel: number, rand: () => number = Math.random) {
    this.map = map;
    this.waterLevel = waterLevel;
    this.rand = rand;
  }

  get count(): number {
    return this.rangers.length;
  }

  /** 1 日に払う給料の合計 */
  get payroll(): number {
    return this.rangers.length * RANGER.wage;
  }

  restore(list: readonly Ranger[]): void {
    this.rangers.length = 0;
    for (const r of list) this.rangers.push({ ...r });
    this.nextId = this.rangers.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  }

  /** 出入口（南端の中央）から 1 人やって来る。満員なら null */
  hire(): Ranger | null {
    if (this.rangers.length >= RANGER.max) return null;
    const z = this.map.worldSize / 2 - 2;
    const r: Ranger = {
      id: this.nextId++,
      x: (this.rand() - 0.5) * 2,
      z,
      heading: -Math.PI / 2,
      cooldown: 0,
      patrolX: 0,
      patrolZ: z,
      retarget: 0,
      phase: 0,
    };
    this.rangers.push(r);
    return r;
  }

  /** 最後に雇った人に辞めてもらう */
  dismiss(): boolean {
    return this.rangers.pop() !== undefined;
  }

  /**
   * 時間を進める。
   * @param threats いま園内にいる相手
   * @param patrolPoint 巡回先を 1 か所選ぶ（遊歩道のマスなど）。無ければ null
   */
  update(dt: number, threats: readonly Threat[], patrolPoint: () => { x: number; z: number } | null): RangerAction[] {
    const actions: RangerAction[] = [];
    // 同じ相手を 2 人で同時に捕まえたり、倒れたクマを撃ち直したりしないように
    const handled = new Set<string>();
    for (const r of this.rangers) {
      r.phase += dt * 7;
      r.cooldown = Math.max(0, r.cooldown - dt);
      const target = this.pickTarget(r, threats.filter((t) => !handled.has(`${t.kind}:${t.id}`)));
      if (target) {
        const d = Math.hypot(target.x - r.x, target.z - r.z);
        r.heading = Math.atan2(target.z - r.z, target.x - r.x);
        if (target.kind === 'bear' && d <= RANGER.shotRange) {
          // 立ち止まって撃つ
          if (r.cooldown <= 0) {
            r.cooldown = RANGER.reload;
            actions.push({ kind: 'shoot', target });
            handled.add(`bear:${target.id}`);
          }
          continue;
        }
        if (target.kind !== 'bear' && d <= RANGER.catchRange) {
          actions.push({ kind: 'catch', target });
          handled.add(`${target.kind}:${target.id}`);
          continue;
        }
        this.moveToward(r, target.x, target.z, dt);
        continue;
      }

      // 巡回：遊歩道のどこかへ歩き、着いたら次の場所へ
      r.retarget -= dt;
      if (r.retarget <= 0 || Math.hypot(r.patrolX - r.x, r.patrolZ - r.z) < 0.3) {
        const p = patrolPoint();
        if (p) {
          r.patrolX = p.x;
          r.patrolZ = p.z;
        }
        r.retarget = 8 + this.rand() * 6;
      }
      this.moveToward(r, r.patrolX, r.patrolZ, dt, 0.6);
    }
    return actions;
  }

  /** 見回り範囲の中で、危ない順・近い順に 1 つ選ぶ */
  private pickTarget(r: Ranger, threats: readonly Threat[]): Threat | null {
    let best: Threat | null = null;
    let bestScore = Infinity;
    for (const t of threats) {
      const d = Math.hypot(t.x - r.x, t.z - r.z);
      if (t.kind !== 'bear' && d > RANGER.sight) continue;
      const score = PRIORITY[t.kind] * 1000 + d;
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  private moveToward(r: Ranger, tx: number, tz: number, dt: number, pace = 1): void {
    const dx = tx - r.x;
    const dz = tz - r.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01) return;
    r.heading = Math.atan2(dz, dx);
    const inWater = this.map.heightAt(r.x, r.z) < this.waterLevel;
    const step = Math.min(dist, RANGER.speed * pace * (inWater ? RANGER.wadeFactor : 1) * dt);
    r.x += (dx / dist) * step;
    r.z += (dz / dist) * step;
  }
}
