/**
 * 来園者のタイプ（描画から独立）。
 * 来園者は 4つのタイプに分かれ、それぞれ求めるものが違う。満足しているタイプほど多く来る。
 * タイプごとに払う入園料も違うので、どの客層に合った園にするかで収入が変わる。
 * プレイヤーは「呼びこむ客層」を 1つ選べる。満足させられている客層ほど、呼びこむ効果が大きい。
 */

export type GuestKind = 'family' | 'walker' | 'angler' | 'photographer';

export const GUEST_ORDER: GuestKind[] = ['family', 'walker', 'angler', 'photographer'];

export interface GuestInfo {
  name: string;
  /** どんな人たちか、ひとことで */
  about: string;
  /** 来園者に占めるもともとの割合 */
  share: number;
  /** 入園料の倍率（釣り券や撮影料を払ってくれる人たちは高い） */
  spend: number;
}

export const GUESTS: Record<GuestKind, GuestInfo> = {
  family: { name: '家族連れ', about: '子どもと安心して歩きたい', share: 0.4, spend: 1 },
  walker: { name: '散策の人', about: '水辺をのんびり歩きたい', share: 0.3, spend: 0.85 },
  angler: { name: '釣り人', about: '魚の多い静かな池がいい（釣り券を買います）', share: 0.15, spend: 1.3 },
  photographer: { name: '写真家', about: '鳥や珍しい生き物を撮りたい（撮影料を払います）', share: 0.15, spend: 1.5 },
};

export const GUEST = {
  /** 満足度 0 のときと 1 のときの、来る人数の倍率 */
  mulMin: 0.9,
  mulMax: 1.25,
  /** 呼びこんだ客層が、満足度 1 のときに増える人数（来園者全体に対する割合） */
  focusGain: 0.2,
} as const;

/** 満足度の計算に使う、いまの園の様子 */
export interface GuestPark {
  /** 魅力から決まる、タイプ分けをする前の来園者数 */
  visitors: number;
  /** 遊歩道で安全に回れる割合（0〜1） */
  safety: number;
  /** 襲撃事件で魅力が下がっている割合（0〜1） */
  incidentPenalty: number;
  /** 採りすぎで魅力が下がっている割合（0〜1） */
  pressurePenalty: number;
  rests: number;
  towers: number;
  /** 出入口につながった遊歩道のマス数 */
  pathCells: number;
  treesNearWater: number;
  waterCells: number;
  deepCells: number;
  fish: number;
  /** カワセミとサギの数 */
  birds: number;
  /** 図鑑に載った生き物の数 */
  species: number;
  /** 珍しい生き物が、いま居るか */
  rare: boolean;
}

export interface Want {
  label: string;
  /** どれだけ満たせているか（0〜1） */
  ratio: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** タイプごとの求めるもの 3つ */
export function wantsOf(kind: GuestKind, p: GuestPark): Want[] {
  switch (kind) {
    case 'family':
      return [
        { label: '安全に歩ける遊歩道', ratio: clamp01(p.safety / 0.9) },
        { label: 'ひと休みできる休憩所', ratio: clamp01(p.rests / Math.max(1, Math.ceil(p.visitors / 150))) },
        { label: '事件が起きていない', ratio: clamp01(1 - p.incidentPenalty / 0.3) },
      ];
    case 'walker':
      return [
        { label: '長い遊歩道', ratio: clamp01(p.pathCells / 120) },
        { label: '水辺の木立', ratio: clamp01(p.treesNearWater / 40) },
        { label: '広い池', ratio: clamp01(p.waterCells / 1200) },
      ];
    case 'angler':
      return [
        { label: '魚の多さ', ratio: clamp01(p.fish / 12) },
        { label: '深い池', ratio: clamp01(p.deepCells / 300) },
        { label: '荒らされていない池', ratio: clamp01(1 - p.pressurePenalty / 0.2) },
      ];
    case 'photographer':
      return [
        { label: 'カワセミやサギ', ratio: clamp01(p.birds / 3) },
        { label: '図鑑に載る生き物の多さ', ratio: clamp01(p.species / 10) },
        { label: '珍しい生き物か展望台', ratio: p.rare ? 1 : clamp01(p.towers * 0.5) },
      ];
  }
}

export interface GuestGroup {
  kind: GuestKind;
  /** 1日に来る人数 */
  count: number;
  /** 満足度（0〜1） */
  satisfaction: number;
  wants: Want[];
  focused: boolean;
}

export interface GuestMix {
  groups: GuestGroup[];
  /** タイプ分けをしたあとの来園者の合計 */
  total: number;
  /** 入園料の倍率（タイプごとの払いの違いをならしたもの） */
  spend: number;
}

/** 来園者をタイプに分ける。満足しているタイプほど多く、呼びこんだタイプはさらに増える */
export function mixGuests(p: GuestPark, focus: GuestKind): GuestMix {
  const base = Math.max(0, p.visitors);
  const groups = GUEST_ORDER.map((kind): GuestGroup => {
    const wants = wantsOf(kind, p);
    const satisfaction = wants.reduce((s, w) => s + w.ratio, 0) / wants.length;
    const mul = GUEST.mulMin + (GUEST.mulMax - GUEST.mulMin) * satisfaction;
    const focused = kind === focus;
    const count = Math.round(base * GUESTS[kind].share * mul + (focused ? base * GUEST.focusGain * satisfaction : 0));
    return { kind, count, satisfaction, wants, focused };
  });
  const total = groups.reduce((s, g) => s + g.count, 0);
  const paid = groups.reduce((s, g) => s + g.count * GUESTS[g.kind].spend, 0);
  return { groups, total, spend: total > 0 ? paid / total : 1 };
}

/** まだ満たせていない求めのうち、いちばん足りないもの（全部満たしていれば null） */
export function weakestWant(g: GuestGroup): Want | null {
  const lacking = g.wants.filter((w) => w.ratio < 1);
  if (lacking.length === 0) return null;
  return lacking.reduce((a, b) => (b.ratio < a.ratio ? b : a));
}

export interface GuestsState {
  /** 呼びこむ客層 */
  focus: GuestKind;
}

export class Guests {
  state: GuestsState = { focus: 'family' };

  get focus(): GuestKind {
    return this.state.focus;
  }

  setFocus(kind: GuestKind): void {
    this.state.focus = kind;
  }

  mix(p: GuestPark): GuestMix {
    return mixGuests(p, this.state.focus);
  }

  snapshot(): GuestsState {
    return { ...this.state };
  }

  restore(s: Partial<GuestsState> | undefined): void {
    this.state = { focus: s?.focus && GUEST_ORDER.includes(s.focus) ? s.focus : 'family' };
  }
}
