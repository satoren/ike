import { ITEMS, ITEM_ORDER, type Inventory, type ItemKind } from './ecology';

/**
 * 相場（描画から独立）。
 * - 売値は毎朝変わる。1品が「高値」、1品が「安値」になり、ほかは少しだけ上下する
 * - 明日の高値は前の日から分かる（今日売るか、明日まで待つかを選べるように）
 * - 同じ品をたくさん売ると値下がりし、日がたつと戻る
 */

export const MARKET = {
  /** 高値の日の倍率の幅 */
  hotMin: 2,
  hotMax: 3,
  /** 安値の日の倍率 */
  cheap: 0.6,
  /** ふつうの品が上下する幅 */
  wobble: 0.15,
  /** 売りすぎたときに下がる下限（もとの売値に対する割合） */
  glutFloor: 0.4,
  /** 朝ごとに、売りすぎの影響が残る割合 */
  glutCarry: 0.5,
  /** 1日にこの数を売ると、下限まで値下がりする */
  depth: { fruit: 80, rabbit: 16, duck: 12, fish: 24, fox: 6, bear: 3 } as Record<ItemKind, number>,
} as const;

/** 高値・安値になる品（クマは狙って捕れないので外す） */
export const MARKET_ITEMS: ItemKind[] = ['fruit', 'rabbit', 'duck', 'fish', 'fox'];

export interface MarketState {
  /** きょうの倍率（売りすぎの影響を入れる前） */
  rate: Record<ItemKind, number>;
  hot: ItemKind | null;
  cheap: ItemKind | null;
  /** あす高値になる品 */
  nextHot: ItemKind;
  /** 売りすぎの度合い（売った数。朝ごとに減る） */
  sold: Record<ItemKind, number>;
}

function each<T>(value: () => T): Record<ItemKind, T> {
  const out = {} as Record<ItemKind, T>;
  for (const k of ITEM_ORDER) out[k] = value();
  return out;
}

function pick<T>(list: readonly T[], rand: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}

/** 倍率を 0.05 刻みに丸める（表示と計算をそろえるため） */
function step(v: number): number {
  return Math.round(v * 20) / 20;
}

export type Trend = 'hot' | 'cheap' | 'glut' | 'flat';

export class Market {
  state: MarketState;
  /** 園の評判による上乗せ（★が上がると「名所の産物」として高く売れる）。保存せず、毎フレーム決め直す */
  premium = 1;

  constructor(rand: () => number = Math.random) {
    this.state = Market.fresh(rand);
  }

  /** 相場が動く前（はじめの日）の状態。あすの高値だけ決まっている */
  private static fresh(rand: () => number): MarketState {
    return { rate: each(() => 1), hot: null, cheap: null, nextHot: pick(MARKET_ITEMS, rand), sold: each(() => 0) };
  }

  /** すでに n 個売ったあとの、売りすぎによる値下がりの割合 */
  static glut(kind: ItemKind, sold: number): number {
    const drop = (1 - MARKET.glutFloor) * Math.min(1, sold / MARKET.depth[kind]);
    return 1 - drop;
  }

  /** いま 1個売ったときの値段 */
  price(kind: ItemKind): number {
    return Math.max(1, Math.round(ITEMS[kind].price * this.premium * this.state.rate[kind] * Market.glut(kind, this.state.sold[kind])));
  }

  /** n 個まとめて売ったときの合計（売るほど 1個ごとに値が下がる） */
  quote(kind: ItemKind, n: number): number {
    let total = 0;
    const base = ITEMS[kind].price * this.premium * this.state.rate[kind];
    for (let i = 0; i < n; i++) total += base * Market.glut(kind, this.state.sold[kind] + i);
    return Math.round(total);
  }

  /** かごの中身をいま全部売ったときの合計 */
  valueOf(inv: Inventory): number {
    return ITEM_ORDER.reduce((sum, k) => sum + this.quote(k, inv[k]), 0);
  }

  /** n 個売る。売り上げを返し、その分だけ値下がりさせる */
  sell(kind: ItemKind, n: number): number {
    if (n <= 0) return 0;
    const total = this.quote(kind, n);
    this.state.sold[kind] += n;
    return total;
  }

  /** いまの値動き（表示用）。売りすぎで下がっているときは、それを先に知らせる */
  trend(kind: ItemKind): Trend {
    if (Market.glut(kind, this.state.sold[kind]) < 0.9) return 'glut';
    if (this.state.hot === kind) return 'hot';
    if (this.state.cheap === kind) return 'cheap';
    return 'flat';
  }

  /** 朝に相場を決め直す。きのう予告した品が高値になり、あすの高値を新しく決める */
  onNewDay(rand: () => number = Math.random): void {
    const s = this.state;
    const hot = s.nextHot;
    const cheap = pick(MARKET_ITEMS.filter((k) => k !== hot), rand);
    for (const k of ITEM_ORDER) {
      if (k === hot) s.rate[k] = Math.round((MARKET.hotMin + rand() * (MARKET.hotMax - MARKET.hotMin)) * 10) / 10;
      else if (k === cheap) s.rate[k] = MARKET.cheap;
      else s.rate[k] = step(1 + (rand() * 2 - 1) * MARKET.wobble);
      s.sold[k] = Math.floor(s.sold[k] * MARKET.glutCarry);
    }
    s.hot = hot;
    s.cheap = cheap;
    s.nextHot = pick(MARKET_ITEMS.filter((k) => k !== hot), rand);
  }

  /** きょうとあすの相場をひとことで（かごの下と朝の知らせに出す） */
  note(): string {
    const s = this.state;
    const tomorrow = `あすは${ITEMS[s.nextHot].name}が高値`;
    if (!s.hot) return tomorrow;
    return `きょうは${ITEMS[s.hot].name}が高値 ×${s.rate[s.hot].toFixed(1)}・${tomorrow}`;
  }

  snapshot(): MarketState {
    const s = this.state;
    return { rate: { ...s.rate }, hot: s.hot, cheap: s.cheap, nextHot: s.nextHot, sold: { ...s.sold } };
  }

  restore(saved: Partial<MarketState> | undefined, rand: () => number = Math.random): void {
    const s = Market.fresh(rand);
    if (saved) {
      for (const k of ITEM_ORDER) {
        const rate = saved.rate?.[k];
        if (typeof rate === 'number' && rate > 0) s.rate[k] = rate;
        const sold = saved.sold?.[k];
        if (typeof sold === 'number' && sold > 0) s.sold[k] = sold;
      }
      if (saved.hot && MARKET_ITEMS.includes(saved.hot)) s.hot = saved.hot;
      if (saved.cheap && MARKET_ITEMS.includes(saved.cheap)) s.cheap = saved.cheap;
      if (saved.nextHot && MARKET_ITEMS.includes(saved.nextHot)) s.nextHot = saved.nextHot;
    }
    this.state = s;
  }
}
