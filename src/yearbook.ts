/**
 * 1年のまとめ（描画から独立）。
 * 春から冬までの 1年のあいだの来園者・収入・できごとを数え、冬の終わりに成績として見せる。
 * これまでの最高を覚えておき、上回ったら「記録更新」と知らせる。
 */

export type IncomeKind = 'tickets' | 'shop' | 'sales' | 'rewards';
export type EventKind = 'found' | 'requests' | 'incidents' | 'bears';

export interface YearStats {
  year: number;
  /** 数えた日数（途中から数え始めた年は 1年に満たない） */
  days: number;
  /** 来園者の合計と、いちばん多かった日 */
  visitors: number;
  bestDay: number;
  /** 収入の内訳：入園料（夜の部を含む）・売店・売り上げ・賞金や報酬 */
  tickets: number;
  shop: number;
  sales: number;
  rewards: number;
  /** 図鑑で新しく見つけた数・応えたお願いの数・客が襲われた事件の数・仕留めたクマの数 */
  found: number;
  requests: number;
  incidents: number;
  bears: number;
  /** 年の初めのランク（星の数） */
  rankStart: number;
}

export interface YearSummary extends YearStats {
  income: number;
  rankEnd: number;
  /** これまでの最高を上回ったか（はじめての年は false） */
  records: { visitors: boolean; income: boolean; bestDay: boolean };
  /** この年をひとことで */
  comment: string;
}

export interface YearbookState {
  current: YearStats;
  /** 直前の年のまとめ（あとから見返せるように） */
  last: YearSummary | null;
  /** これまでの最高（1年を終えるまでは null） */
  best: { visitors: number; income: number; bestDay: number } | null;
}

function emptyYear(year: number, rank: number): YearStats {
  return { year, days: 0, visitors: 0, bestDay: 0, tickets: 0, shop: 0, sales: 0, rewards: 0, found: 0, requests: 0, incidents: 0, bears: 0, rankStart: rank };
}

export function incomeOf(y: YearStats): number {
  return y.tickets + y.shop + y.sales + y.rewards;
}

/** その年をひとことで言う。良かったことを先に探す */
export function commentOf(y: YearStats, rankEnd: number): string {
  if (rankEnd > y.rankStart) return `園のランクが★${y.rankStart}から★${rankEnd}に上がった、飛躍の 1年でした`;
  if (y.found >= 3) return `新しい生き物が ${y.found}種も見つかった、にぎやかな 1年でした`;
  if (y.incidents === 0 && y.visitors > 0) return '事件が 1件も無い、安心して歩ける 1年でした';
  if (y.requests >= 8) return `町の人のお願いに ${y.requests}回も応えた、頼りにされた 1年でした`;
  if (y.incidents >= 5) return '事件の多い 1年でした。遊歩道と狩りで、来年は安全な園にしましょう';
  if (y.sales > y.tickets) return '採って売ることで稼いだ 1年でした。採りすぎには気をつけましょう';
  return '少しずつ園が育った 1年でした';
}

export class Yearbook {
  state: YearbookState = { current: emptyYear(1, 1), last: null, best: null };

  /** 新しく始めたとき・記録の無いセーブを読んだときに、その年から数え始める */
  begin(year: number, rank: number): void {
    this.state = { current: emptyYear(year, rank), last: null, best: null };
  }

  /** 1日の来園者（昼と夜の合計）を足す */
  addDay(visitors: number): void {
    const c = this.state.current;
    c.days++;
    c.visitors += Math.max(0, Math.round(visitors));
    c.bestDay = Math.max(c.bestDay, Math.round(visitors));
  }

  earn(kind: IncomeKind, amount: number): void {
    if (amount > 0) this.state.current[kind] += Math.round(amount);
  }

  note(kind: EventKind, n = 1): void {
    if (n > 0) this.state.current[kind] += n;
  }

  /** 冬が終わったときに 1年を締める。まとめを返し、次の年を数え始める */
  closeYear(rank: number): YearSummary {
    const y = this.state.current;
    const income = incomeOf(y);
    const best = this.state.best;
    const summary: YearSummary = {
      ...y,
      income,
      rankEnd: rank,
      records: {
        visitors: best !== null && y.visitors > best.visitors,
        income: best !== null && income > best.income,
        bestDay: best !== null && y.bestDay > best.bestDay,
      },
      comment: commentOf(y, rank),
    };
    this.state.best = {
      visitors: Math.max(best?.visitors ?? 0, y.visitors),
      income: Math.max(best?.income ?? 0, income),
      bestDay: Math.max(best?.bestDay ?? 0, y.bestDay),
    };
    this.state.last = summary;
    this.state.current = emptyYear(y.year + 1, rank);
    return summary;
  }

  snapshot(): YearbookState {
    const s = this.state;
    return {
      current: { ...s.current },
      last: s.last ? { ...s.last, records: { ...s.last.records } } : null,
      best: s.best ? { ...s.best } : null,
    };
  }

  /** 記録の無いセーブは、いまの年の途中から数え始める */
  restore(s: Partial<YearbookState> | undefined, year: number, rank: number): void {
    if (!s || !s.current || typeof s.current.year !== 'number') {
      this.begin(year, rank);
      return;
    }
    this.state = {
      current: { ...emptyYear(year, rank), ...s.current },
      last: s.last ? { ...s.last, records: { ...s.last.records } } : null,
      best: s.best ? { ...s.best } : null,
    };
  }
}
