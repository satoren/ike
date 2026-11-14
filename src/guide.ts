/**
 * はじめの案内（描画から独立）。
 * 新しく始めた人に、池を掘る→木を植える→道をのばす→集める→売る→目標を見る、を 1つずつ案内する。
 * 進み具合は「案内を始めたとき」からの増えた分で数えるので、順番どおりでなくても先の分が無駄にならない。
 * 途中でやめることもでき、前からのセーブ（案内の記録が無い）には出さない。
 */

/** 案内が指す場所（光らせる道具やパネル） */
export type GuideTarget = 'land' | 'nature' | 'build' | 'collect' | 'basket' | 'rank';

/** 案内の判定に使う、いまの園の数字 */
export interface GuideNow {
  waterCells: number;
  trees: number;
  /** 出入口につながった遊歩道のマス数 */
  pathCells: number;
}

export interface GuideStep {
  id: 'dig' | 'tree' | 'path' | 'collect' | 'sell' | 'goals';
  title: string;
  /** やり方をひとことで */
  how: string;
  target: GuideTarget;
  /** 終わりまでに要る数 */
  goal: number;
  unit: string;
}

export const GUIDE_STEPS: GuideStep[] = [
  { id: 'dig', title: '池を広げる', how: '「地形」の「掘る」で、池のふちをなぞって掘りましょう', target: 'land', goal: 40, unit: 'マス' },
  { id: 'tree', title: '木を植える', how: '「自然」で、池のまわりに木を植えましょう。水辺の木は生き物を呼びます', target: 'nature', goal: 5, unit: '本' },
  { id: 'path', title: '遊歩道をのばす', how: '「建てる」の遊歩道で、出入口の道から続けてなぞりましょう。つながった道を客が歩きます', target: 'build', goal: 10, unit: 'マス' },
  { id: 'collect', title: '木の実を集める', how: '「集める」で実のなった木をなぞると、かごに入ります', target: 'collect', goal: 3, unit: '個' },
  { id: 'sell', title: 'かごの中身を売る', how: 'かごの「売る」でお金になります。採りすぎると魅力が下がるので、ほどほどに', target: 'basket', goal: 1, unit: '回' },
  { id: 'goals', title: '次の目標を見る', how: '左上の★を押すと、園のランクを上げる目標が見られます', target: 'rank', goal: 1, unit: '回' },
];

/** 1つ終えるごとのごほうび（G） */
export const GUIDE_REWARD = 50;

export interface GuideState {
  /** いまの手順（GUIDE_STEPS の添字）。全部終えたか、やめたら GUIDE_STEPS.length */
  step: number;
  /** 案内を始めたときの園の数字 */
  base: GuideNow;
  /** 案内を始めてから集めた数・売った回数・目標を見た回数 */
  collected: number;
  sold: number;
  goals: number;
}

export interface GuideProgress {
  step: GuideStep;
  /** 何番目か（1 始まり）と全体の数 */
  index: number;
  total: number;
  value: number;
  ratio: number;
  text: string;
}

const DONE = GUIDE_STEPS.length;

export class Guide {
  /** はじめは「終わった」状態。新しく始めたときだけ start で動き出す */
  state: GuideState = { step: DONE, base: { waterCells: 0, trees: 0, pathCells: 0 }, collected: 0, sold: 0, goals: 0 };

  get active(): boolean {
    return this.state.step < DONE;
  }

  /** 新しく始めたときに、いまの園の数字を覚えて案内を始める */
  start(now: GuideNow): void {
    this.state = { step: 0, base: { ...now }, collected: 0, sold: 0, goals: 0 };
  }

  /** 途中でやめる */
  skip(): void {
    this.state.step = DONE;
  }

  /** 集めた・売った・目標を見た、を記録する（案内の途中だけ） */
  note(kind: 'collect' | 'sell' | 'goals', n = 1): void {
    if (!this.active || n <= 0) return;
    if (kind === 'collect') this.state.collected += n;
    else if (kind === 'sell') this.state.sold += n;
    else this.state.goals += n;
  }

  private valueOf(step: GuideStep, now: GuideNow): number {
    const s = this.state;
    switch (step.id) {
      case 'dig':
        return now.waterCells - s.base.waterCells;
      case 'tree':
        return now.trees - s.base.trees;
      case 'path':
        return now.pathCells - s.base.pathCells;
      case 'collect':
        return s.collected;
      case 'sell':
        return s.sold;
      case 'goals':
        return s.goals;
    }
  }

  /** いまの手順の進み具合（案内が終わっていれば null） */
  progress(now: GuideNow): GuideProgress | null {
    if (!this.active) return null;
    const step = GUIDE_STEPS[this.state.step];
    const value = Math.max(0, Math.min(step.goal, Math.floor(this.valueOf(step, now))));
    return {
      step,
      index: this.state.step + 1,
      total: GUIDE_STEPS.length,
      value,
      ratio: value / step.goal,
      text: step.goal > 1 ? `${value} / ${step.goal}${step.unit}` : '',
    };
  }

  /**
   * 手順を終えていたら次へ進める。終えた手順を返す（先に済ませていた分は、まとめて進む）。
   */
  update(now: GuideNow): GuideStep[] {
    const finished: GuideStep[] = [];
    while (this.active) {
      const step = GUIDE_STEPS[this.state.step];
      if (this.valueOf(step, now) < step.goal) break;
      finished.push(step);
      this.state.step++;
    }
    return finished;
  }

  snapshot(): GuideState {
    return { ...this.state, base: { ...this.state.base } };
  }

  /** 案内の記録が無いセーブ（前から遊んでいる人）には出さない */
  restore(s: Partial<GuideState> | undefined): void {
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    this.state = {
      step: s && typeof s.step === 'number' ? Math.max(0, Math.min(DONE, Math.floor(s.step))) : DONE,
      base: { waterCells: num(s?.base?.waterCells), trees: num(s?.base?.trees), pathCells: num(s?.base?.pathCells) },
      collected: num(s?.collected),
      sold: num(s?.sold),
      goals: num(s?.goals),
    };
  }
}
