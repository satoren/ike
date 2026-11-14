import type { ItemKind } from './ecology';
import type { GuestKind } from './guests';

/**
 * 客の口コミ。来園者がひとこと感想を残し、それを読めば魅力が上がった／下がった理由がわかる。
 * 文面は「いまの園の状態」から重み付きで選ぶ。新しい話題は TOPICS に足すだけで増やせる。
 */

/** 口コミを書くときに見る園の状態 */
export interface ReviewContext {
  visitors: number;
  /** 採りすぎで魅力が下がっている割合（0〜1） */
  penalty: number;
  /** 来園者のうち遊歩道で安全に回れる割合（0〜1） */
  safety: number;
  pathCells: number;
  waterCells: number;
  trees: number;
  treesNearWater: number;
  /** 野外にいま居る数（果物は木に実っている数） */
  wild: Record<ItemKind, number>;
  /** 最近あった出来事（ReviewFeed が覚えておく） */
  recent: ReadonlySet<ReviewEvent>;
}

/** 口コミの話題になる出来事 */
export type ReviewEvent = 'bearAttack' | 'foxAttack' | 'bearHunted' | 'guestTrapped' | 'firefly' | 'salamander';

/** 口コミが魅力のどの要素について語っているか（画面で理由として見せる） */
export type ReviewFactor = 'incident' | 'danger' | 'safety' | 'wildlife' | 'harvest' | 'scenery';

export const FACTOR_LABEL: Record<ReviewFactor, string> = {
  incident: '事件',
  danger: '危険',
  safety: '遊歩道',
  wildlife: '生き物',
  harvest: '採りすぎ',
  scenery: '景色',
};

/** その話題を口にしそうな来園者のタイプ（口コミに書いた人として出す） */
export const FACTOR_GUESTS: Record<ReviewFactor, readonly GuestKind[]> = {
  incident: ['family'],
  danger: ['family', 'walker'],
  safety: ['family', 'walker'],
  wildlife: ['photographer', 'family'],
  harvest: ['angler', 'photographer'],
  scenery: ['walker', 'photographer'],
};

export interface Review {
  text: string;
  /** 書いた人のタイプ */
  by: GuestKind;
  /** 1〜5 */
  stars: number;
  factor: ReviewFactor;
  /** よい感想か */
  good: boolean;
  day: number;
}

interface Topic {
  factor: ReviewFactor;
  good: boolean;
  /** この話題が出やすい度合い。0 なら出ない */
  weight: (c: ReviewContext) => number;
  lines: readonly string[];
}

export const TOPICS: readonly Topic[] = [
  // ---- 珍しい生き物 ----
  {
    factor: 'wildlife',
    good: true,
    weight: (c) => (c.recent.has('firefly') ? 10 : 0),
    lines: ['ホタルが綺麗！水辺が光っていて夢みたい', 'ホタルが出たと聞いて飛んできました', 'こんなところでホタルが見られるなんて'],
  },
  {
    factor: 'wildlife',
    good: true,
    weight: (c) => (c.recent.has('salamander') ? 12 : 0),
    lines: ['オオサンショウウオを見た！本物は迫力がすごい', 'ニュースで見てオオサンショウウオに会いに来ました', '池にオオサンショウウオがいるなんて、よほど水がきれいなんだね'],
  },
  // ---- 事件・危険 ----
  {
    factor: 'incident',
    good: false,
    weight: (c) => (c.recent.has('bearAttack') ? 12 : 0),
    lines: ['クマに襲われた人がいたらしい。怖くてすぐ帰りました', '目の前でクマが柵を壊した…二度と来ません', 'クマが出るなんて聞いてない！'],
  },
  {
    factor: 'incident',
    good: false,
    weight: (c) => (c.recent.has('foxAttack') ? 10 : 0),
    lines: ['キツネにかまれた人がいたって。子どもは連れて来られない', '道のない草むらでキツネに追いかけられた', 'キツネが怖かった'],
  },
  {
    factor: 'incident',
    good: false,
    weight: (c) => (c.recent.has('guestTrapped') ? 10 : 0),
    lines: ['遊歩道のすぐ脇に罠があって、足をはさまれた人がいた', '罠でけがをした人がいたらしい。道のそばに置かないでほしい', '子どもが罠に近づきそうでヒヤッとした'],
  },
  {
    factor: 'danger',
    good: false,
    weight: (c) => (c.wild.bear > 0 ? 6 : 0),
    lines: ['遠くにクマが見えた。柵は大丈夫なの？', 'クマ出没中の貼り紙がこわい', 'クマがうろついていて落ち着かない'],
  },
  {
    factor: 'danger',
    good: false,
    weight: (c) => (c.wild.fox > 0 ? 1.5 + 3 * (1 - c.safety) : 0),
    lines: ['キツネがこっちを見ていてドキッとした', 'キツネがうろうろしていて、道の外は歩けない'],
  },
  {
    factor: 'safety',
    good: true,
    weight: (c) => (c.recent.has('bearHunted') ? 4 : 0),
    lines: ['クマが退治されたと聞いて安心して来ました', 'クマ騒ぎも落ち着いたみたい'],
  },
  // ---- 遊歩道 ----
  {
    factor: 'safety',
    good: false,
    weight: (c) => (c.pathCells === 0 ? 4 : c.safety < 0.5 ? 3 * (1 - c.safety) : 0),
    lines: ['歩ける道がなくて、ぬかるみで靴が泥だらけ', '道が足りなくて人であふれていた', '柵がなくて池に落ちそうになった'],
  },
  {
    factor: 'safety',
    good: true,
    weight: (c) => (c.pathCells > 0 && c.safety >= 0.8 ? 2 + c.safety : 0),
    lines: ['柵付きの遊歩道で子ども連れでも安心', '遊歩道が歩きやすくて、ぐるっと一周できた', '道がきれいに整っていて気持ちいい'],
  },
  // ---- 採りすぎ ----
  {
    factor: 'harvest',
    good: false,
    weight: (c) => (c.penalty >= 0.05 ? 3 + 10 * c.penalty : 0),
    lines: ['生き物がほとんどいない。採りすぎでは？', '前に来たときより寂しくなった', '網を持った人ばかり目につく'],
  },
  {
    factor: 'harvest',
    good: false,
    weight: (c) => (c.trees >= 5 && c.wild.fruit === 0 ? 2 : 0),
    lines: ['木はあるのに実がひとつもない', '実が全部もがれていて残念'],
  },
  // ---- 生き物 ----
  {
    factor: 'wildlife',
    good: true,
    weight: (c) => Math.min(3, c.wild.duck * 0.6),
    lines: ['カモがのんびり泳いでいてかわいい', 'カモの親子に癒やされた', '水辺でカモにえさをあげたくなった'],
  },
  {
    factor: 'wildlife',
    good: true,
    weight: (c) => Math.min(3, c.wild.fish * 0.3),
    lines: ['池をのぞくと魚がたくさん泳いでいた', '魚がはねるのが見えた！', '水が澄んでいて魚がよく見える'],
  },
  {
    factor: 'wildlife',
    good: true,
    weight: (c) => Math.min(3, c.wild.rabbit * 0.5),
    lines: ['ウサギがぴょんぴょん跳ねていた', '木の根元でウサギが休んでいた'],
  },
  {
    factor: 'wildlife',
    good: false,
    weight: (c) => (c.wild.duck + c.wild.fish + c.wild.rabbit === 0 ? 2 : 0),
    lines: ['生き物が一匹も見当たらない', '静かすぎて何もいない'],
  },
  // ---- 景色 ----
  {
    factor: 'scenery',
    good: true,
    weight: (c) => Math.min(3, c.wild.fruit * 0.1),
    lines: ['木いっぱいに実がなっていて見事', '甘い香りがして実がおいしそう'],
  },
  {
    factor: 'scenery',
    good: true,
    weight: (c) => (c.waterCells >= 60 ? 2 : c.waterCells >= 20 ? 1 : 0),
    lines: ['広い池が気持ちいい', '水面がきらきらしていて写真映えする', '池のほとりでぼんやりするのが最高'],
  },
  {
    factor: 'scenery',
    good: true,
    weight: (c) => Math.min(2.5, c.treesNearWater * 0.3),
    lines: ['水辺の木陰でひと休みできた', '木と池の組み合わせがきれい'],
  },
  {
    factor: 'scenery',
    good: false,
    weight: (c) => (c.waterCells === 0 ? 3 : c.waterCells < 15 ? 1 : 0),
    lines: ['池づくりと聞いたのに池が小さい', '水たまりしかなかった'],
  },
  {
    factor: 'scenery',
    good: false,
    weight: (c) => (c.trees < 3 ? 2 : 0),
    lines: ['木陰がなくて暑かった', '殺風景で、もっと木がほしい'],
  },
];

/** 状態から 1 件の口コミを書く。話す話題がなければ null */
export function writeReview(c: ReviewContext, day: number, rand: () => number = Math.random): Review | null {
  const weighted = TOPICS.map((t) => ({ t, w: Math.max(0, t.weight(c)) })).filter((x) => x.w > 0);
  const total = weighted.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return null;
  let r = rand() * total;
  let topic = weighted[weighted.length - 1].t;
  for (const x of weighted) {
    r -= x.w;
    if (r < 0) {
      topic = x.t;
      break;
    }
  }
  const text = topic.lines[Math.floor(rand() * topic.lines.length)];
  const severe = topic.factor === 'incident';
  const stars = topic.good ? 4 + (rand() < 0.5 ? 1 : 0) : severe ? 1 : 1 + (rand() < 0.6 ? 1 : 0);
  const writers = FACTOR_GUESTS[topic.factor];
  const by = writers[Math.min(writers.length - 1, Math.floor(rand() * writers.length))];
  return { text, by, stars, factor: topic.factor, good: topic.good, day };
}

/** 口コミの頻度など */
export const REVIEW = {
  /** 残しておく件数 */
  keep: 12,
  /** 出来事を口コミが覚えている秒数 */
  eventMemory: 40,
  /** 次の口コミまでの秒数。来園者が多いほど早い */
  interval: (visitors: number) => Math.max(3, 14 - visitors / 8),
} as const;

/** 口コミの流れ。時間がたつと新しい口コミが届き、事件があればすぐ書かれる */
export class ReviewFeed {
  readonly reviews: Review[] = [];
  private readonly events = new Map<ReviewEvent, number>();
  private timer = 3;
  private readonly rand: () => number;

  constructor(rand: () => number = Math.random) {
    this.rand = rand;
  }

  /** 出来事を記録する。事件は次のフレームですぐ口コミになる */
  note(e: ReviewEvent): void {
    this.events.set(e, REVIEW.eventMemory);
    if (e !== 'bearHunted') this.timer = Math.min(this.timer, 0.6);
  }

  /** 新しい口コミが届いたらそれを返す */
  update(dt: number, ctx: Omit<ReviewContext, 'recent'>, day: number): Review | null {
    for (const [e, left] of this.events) {
      if (left - dt <= 0) this.events.delete(e);
      else this.events.set(e, left - dt);
    }
    this.timer -= dt;
    if (this.timer > 0) return null;
    this.timer = REVIEW.interval(ctx.visitors) * (0.7 + this.rand() * 0.6);
    if (ctx.visitors <= 0) return null; // 誰も来ていなければ感想もない
    const review = writeReview({ ...ctx, recent: new Set(this.events.keys()) }, day, this.rand);
    if (!review) return null;
    this.reviews.unshift(review);
    this.reviews.length = Math.min(this.reviews.length, REVIEW.keep);
    return review;
  }

  /** 最近の口コミの平均評価（なければ null） */
  average(): number | null {
    if (this.reviews.length === 0) return null;
    return this.reviews.reduce((s, r) => s + r.stars, 0) / this.reviews.length;
  }
}
