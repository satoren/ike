/**
 * 園のランク（★1〜★5）と、ランクアップの目標。
 * 目標を全部達成するとランクが上がり、賞金・入園料の上乗せ・新しい施設がもらえる。
 * 一度達成した目標は、あとで数字が下がっても達成のまま（遊ぶ人が積み上げを感じられるように）。
 */

import type { FacilityKind } from './facilities';

/** 目標の判定に使う、いまの園の数字 */
export interface ParkStats {
  visitors: number;
  waterCells: number;
  treesNearWater: number;
  pathCells: number;
  /** これまでの収入の合計（入園料・売り上げ・売店。賞金は含めない） */
  earned: number;
  /** いま居る生き物の数 */
  wild: { rabbit: number; duck: number; fish: number };
  /** カワセミかサギが来ているか */
  birds: number;
  /** 口コミの平均（まだ無ければ null） */
  reviewAvg: number | null;
  /** 珍しい生き物を見たことがあるか */
  rareSeen: boolean;
  facilities: Record<FacilityKind, number>;
}

export interface Goal {
  id: string;
  label: string;
  /** 進み具合（0〜1）と、表示用の「いま / 目標」 */
  check: (s: ParkStats) => { ratio: number; text: string };
}

export interface Rank {
  stars: number;
  name: string;
  /** 入園料の倍率 */
  ticket: number;
  /** このランクになったときの賞金 */
  reward: number;
  /** このランクで建てられるようになる施設 */
  unlocks: FacilityKind[];
  /** 次のランクへの目標（最後のランクは空） */
  goals: Goal[];
}

function atLeast(id: string, label: string, target: number, value: (s: ParkStats) => number, unit = ''): Goal {
  return {
    id,
    label,
    check: (s) => {
      const v = value(s);
      const fmt = (n: number) => (Number.isInteger(target) ? Math.floor(n).toLocaleString() : n.toFixed(1));
      return { ratio: Math.min(1, v / target), text: `${fmt(v)} / ${fmt(target)}${unit}` };
    },
  };
}

function flag(id: string, label: string, value: (s: ParkStats) => boolean): Goal {
  return { id, label, check: (s) => (value(s) ? { ratio: 1, text: '達成' } : { ratio: 0, text: 'まだ' }) };
}

export const RANKS: Rank[] = [
  {
    stars: 1,
    name: '小さな池',
    ticket: 1,
    reward: 0,
    unlocks: [],
    goals: [
      atLeast('v220', '来園者 220人/日', 220, (s) => s.visitors, '人'),
      atLeast('w600', '池を 600マス に広げる', 600, (s) => s.waterCells, 'マス'),
      atLeast('p40', '遊歩道を 40マス つなぐ', 40, (s) => s.pathCells, 'マス'),
    ],
  },
  {
    stars: 2,
    name: '村の水辺',
    ticket: 1.25,
    reward: 500,
    unlocks: ['rest'],
    goals: [
      atLeast('v320', '来園者 320人/日', 320, (s) => s.visitors, '人'),
      atLeast('t30', '水辺の木 30本', 30, (s) => s.treesNearWater, '本'),
      flag('trio', 'ウサギ・カモ・魚がそろう', (s) => s.wild.rabbit > 0 && s.wild.duck > 0 && s.wild.fish > 0),
      atLeast('e5k', '収入の合計 5,000G', 5000, (s) => s.earned, 'G'),
    ],
  },
  {
    stars: 3,
    name: '町の自然園',
    ticket: 1.5,
    reward: 1500,
    unlocks: ['shop', 'mill'],
    goals: [
      atLeast('v450', '来園者 450人/日', 450, (s) => s.visitors, '人'),
      atLeast('w1500', '池を 1,500マス に広げる', 1500, (s) => s.waterCells, 'マス'),
      flag('bird', 'カワセミかサギが来る', (s) => s.birds > 0),
      atLeast('f3', '休憩所・売店を 3軒 建てる', 3, (s) => s.facilities.rest + s.facilities.shop, '軒'),
    ],
  },
  {
    stars: 4,
    name: '県の名所',
    ticket: 1.8,
    reward: 3000,
    unlocks: ['tower', 'center'],
    goals: [
      atLeast('v600', '来園者 600人/日', 600, (s) => s.visitors, '人'),
      atLeast('r35', '口コミの平均 ★3.5', 3.5, (s) => s.reviewAvg ?? 0),
      flag('rare', '珍しい生き物が現れる', (s) => s.rareSeen),
      atLeast('e30k', '収入の合計 30,000G', 30000, (s) => s.earned, 'G'),
    ],
  },
  {
    stars: 5,
    name: '全国の名所',
    ticket: 2.2,
    reward: 6000,
    unlocks: ['bigtree'],
    goals: [],
  },
];

/** 保存する進み具合 */
export interface ProgressState {
  /** RANKS の添字 */
  rank: number;
  earned: number;
  /** いまのランクで達成済みの目標 */
  done: string[];
  rareSeen: boolean;
}

export function emptyProgress(): ProgressState {
  return { rank: 0, earned: 0, done: [], rareSeen: false };
}

export interface GoalView {
  goal: Goal;
  done: boolean;
  ratio: number;
  text: string;
}

export class Progress {
  state: ProgressState = emptyProgress();

  get rank(): Rank {
    return RANKS[this.state.rank];
  }

  get next(): Rank | null {
    return RANKS[this.state.rank + 1] ?? null;
  }

  /** いまのランクで建てられる施設 */
  unlocked(kind: FacilityKind): boolean {
    return RANKS.slice(0, this.state.rank + 1).some((r) => r.unlocks.includes(kind));
  }

  /** その施設が解放されるランク */
  static unlockRank(kind: FacilityKind): Rank | undefined {
    return RANKS.find((r) => r.unlocks.includes(kind));
  }

  earn(amount: number): void {
    if (amount > 0) this.state.earned += amount;
  }

  goals(s: ParkStats): GoalView[] {
    return this.rank.goals.map((goal) => {
      const done = this.state.done.includes(goal.id);
      const c = goal.check(s);
      return { goal, done, ratio: done ? 1 : c.ratio, text: done ? '達成' : c.text };
    });
  }

  /**
   * 目標を判定する。新しく達成した目標と、上がったランク（あれば）を返す。
   * ランクが上がると、次のランクの目標は改めて最初から数える。
   */
  evaluate(s: ParkStats): { achieved: Goal[]; rankedUp: Rank | null } {
    if (s.rareSeen) this.state.rareSeen = true;
    const stats = { ...s, rareSeen: this.state.rareSeen };
    const achieved: Goal[] = [];
    for (const goal of this.rank.goals) {
      if (this.state.done.includes(goal.id)) continue;
      if (goal.check(stats).ratio >= 1) {
        this.state.done.push(goal.id);
        achieved.push(goal);
      }
    }
    const goals = this.rank.goals;
    if (goals.length > 0 && goals.every((g) => this.state.done.includes(g.id))) {
      this.state.rank++;
      this.state.done = [];
      return { achieved, rankedUp: this.rank };
    }
    return { achieved, rankedUp: null };
  }

  restore(s: Partial<ProgressState> | undefined): void {
    const base = emptyProgress();
    this.state = {
      rank: Math.max(0, Math.min(RANKS.length - 1, s?.rank ?? base.rank)),
      earned: s?.earned ?? base.earned,
      done: [...(s?.done ?? [])],
      rareSeen: s?.rareSeen ?? false,
    };
  }

  snapshot(): ProgressState {
    return { ...this.state, done: [...this.state.done] };
  }
}
