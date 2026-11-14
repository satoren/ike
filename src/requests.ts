import { ITEMS, type Inventory, type ItemKind } from './ecology';
import { t } from './i18n';

/**
 * 日替わりのお願い（描画から独立）。
 * 毎朝、園の様子に合ったお願いが 1件届く。期限までに応えると報酬がもらえる。
 * 応えられなくても罰は無い（見送ることもできる）。お願いは一度に 1件だけ。
 *
 * お願いの種類:
 *   deliver    … かごの中身を届ける（採りすぎとの兼ね合いを考えることになる）
 *   watch      … ある生き物を今より増やす
 *   plant      … 水辺の木を増やす
 *   dig        … 池を広げる
 *   safety     … 客の安全を 100% にする
 *   noHarvest  … 期限まで何も採らない
 *   noIncident … 期限まで襲撃事件を起こさない
 */

export type RequestKind = 'deliver' | 'watch' | 'plant' | 'dig' | 'safety' | 'noHarvest' | 'noIncident';

/** 数を増やしてほしいと頼まれる生き物と、その上限（上限が無いものは Infinity） */
export interface Watchable {
  id: string;
  name: string;
  counter: string;
  /** いま居る数 */
  count: number;
  /** いまの園の作りで集まる数（これ以上は、場所を広げないと増えない） */
  cap: number;
  max: number;
}

/** お願いを決めたり、進み具合を見たりするための、いまの園の様子 */
export interface ParkNow {
  /** 日付と、その日の進み具合（0〜1）を足したもの */
  time: number;
  /** 野外に居る数（木の実は木に実っている数） */
  wild: Record<'fruit' | 'rabbit' | 'duck' | 'fish' | 'fox', number>;
  inventory: Inventory;
  /** 増やしてほしいと頼める生き物（図鑑に載っていて、いま居るもの） */
  watchable: Watchable[];
  treesNearWater: number;
  waterCells: number;
  /** 客の安全（0〜1） */
  safety: number;
  /** 採りすぎによる荒らされ度 */
  pressure: number;
  /** 襲撃事件の影響が残っているか */
  incident: boolean;
  /** 1日の入園料の目安（報酬の大きさを決める） */
  income: number;
}

export interface Request {
  kind: RequestKind;
  /** 届ける品物・増やす生き物の id */
  subject?: string;
  /** 表示用の名前と数え方（届ける品物・増やす生き物） */
  name?: string;
  counter?: string;
  /** 目標の数（届ける数・居てほしい数・増やす本数など） */
  target: number;
  /** お願いが届いたときの数（増やすお願いの出発点） */
  base: number;
  reward: number;
  /** 届いた時刻（ParkNow.time と同じ単位） */
  issuedAt: number;
  /** この日の終わりまでが期限 */
  dueDay: number;
}

const CLIENT: Record<RequestKind, string> = {
  deliver: t('料理店'),
  watch: t('写真家'),
  plant: t('町内会'),
  dig: t('釣り好きの会'),
  safety: t('小学校'),
  noHarvest: t('自然保護の会'),
  noIncident: t('旅行会社'),
};

const DELIVER_CLIENT: Partial<Record<ItemKind, string>> = {
  fruit: t('ジャム工房'),
  rabbit: t('ふれあい牧場'),
};

/** 期限まで「起こさない」ことを守るお願い（期限が来たら達成） */
export function isKeeping(kind: RequestKind): boolean {
  return kind === 'noHarvest' || kind === 'noIncident';
}

export function clientOf(r: Request): string {
  return (r.kind === 'deliver' && DELIVER_CLIENT[r.subject as ItemKind]) || CLIENT[r.kind];
}

/** お願いの文面 */
export function describe(r: Request): { title: string; detail: string; short: string } {
  switch (r.kind) {
    case 'deliver':
      return {
        title: t('{0}を {1}{2} 届けてほしい', r.name, r.target, r.counter),
        detail: t('「集める」でかごに入れてから「届ける」を押します。採りすぎると魅力が下がるので、ほどほどに'),
        short: t('{0}を届ける', r.name),
      };
    case 'watch':
      return {
        title: t('{0}が {1}{2} いるところを撮りたい', r.name, r.target, r.counter),
        detail: t('図鑑に、その生き物が増える条件が載っています'),
        short: t('{0}を増やす', r.name),
      };
    case 'plant':
      return {
        title: t('水辺の木を {0}本 増やしてほしい', r.target),
        detail: t('池のすぐそばに木を植えます。育つ前の若木も数えます'),
        short: t('水辺に木を植える'),
      };
    case 'dig':
      return {
        title: t('池を {0}マス 広げてほしい', r.target),
        detail: t('「掘る」で水位より深く掘ると池になります'),
        short: t('池を広げる'),
      };
    case 'safety':
      return {
        title: t('遠足で行くので、客の安全を 100% にしてほしい'),
        detail: t('出入口につながった遊歩道を、来園者の数に見合うだけ敷きます'),
        short: t('客の安全'),
      };
    case 'noHarvest':
      return {
        title: t('調査をするので、期限まで何も採らないでほしい'),
        detail: t('木の実も生き物も「集める」で採らずにいれば達成です'),
        short: t('何も採らない'),
      };
    case 'noIncident':
      return {
        title: t('団体客を連れて行くので、期限まで襲撃事件を起こさないでほしい'),
        detail: t('キツネやクマを罠や銃で減らすか、遊歩道を広げて客を守ります'),
        short: t('事件を起こさない'),
      };
  }
}

export interface RequestProgress {
  /** 0〜1 */
  ratio: number;
  text: string;
  /** 小さなボタンに出す短い表示 */
  brief: string;
  /** いますぐ達成できるか（届けるお願いは、かごに数がそろっているか） */
  ready: boolean;
}

export function progressOf(r: Request, now: ParkNow): RequestProgress {
  const of = (value: number, target: number, unit = '') => ({
    ratio: Math.max(0, Math.min(1, value / target)),
    text: `${Math.max(0, Math.floor(value))} / ${target}${unit}`,
    brief: `${Math.max(0, Math.floor(value))}/${target}`,
    ready: value >= target,
  });
  switch (r.kind) {
    case 'deliver':
      return of(Math.min(now.inventory[r.subject as ItemKind] ?? 0, r.target), r.target, r.counter);
    case 'watch':
      return of(now.watchable.find((w) => w.id === r.subject)?.count ?? 0, r.target, r.counter);
    case 'plant':
      return of(now.treesNearWater - r.base, r.target, t('本'));
    case 'dig':
      return of(now.waterCells - r.base, r.target, t('マス'));
    case 'safety': {
      const pct = Math.floor(now.safety * 100 + 1e-6);
      return { ratio: now.safety, text: `${pct}% / 100%`, brief: `${pct}%`, ready: pct >= 100 };
    }
    case 'noHarvest':
    case 'noIncident': {
      const span = r.dueDay + 1 - r.issuedAt;
      return {
        ratio: Math.max(0, Math.min(1, (now.time - r.issuedAt) / span)),
        text: t('ここまで守れています'),
        brief: dueText(r, Math.floor(now.time)),
        ready: false,
      };
    }
  }
}

/** 期限の言い方 */
export function dueText(r: Request, day: number): string {
  const left = r.dueDay - day;
  return left <= 0 ? t('今日中') : left === 1 ? t('明日まで') : t('あと {0}日', left + 1);
}

const round10 = (v: number) => Math.round(v / 10) * 10;

/** 報酬：入園料の何割かを目安に、最低額を下回らないようにする */
function rewardFor(now: ParkNow, share: number, min: number): number {
  return round10(Math.max(min, now.income * share));
}

/** 届けてもらう品物ごとの、数の幅と、野外に残しておきたい数 */
const DELIVERY: { item: ItemKind; counter: string; n: [number, number]; spare: number }[] = [
  { item: 'fish', counter: t('匹'), n: [3, 5], spare: 3 },
  { item: 'duck', counter: t('羽'), n: [2, 3], spare: 2 },
  { item: 'rabbit', counter: t('匹'), n: [3, 4], spare: 3 },
  { item: 'fruit', counter: t('個'), n: [20, 40], spare: 20 },
];

/** いまの園で頼めるお願いの候補をすべて作る */
export function candidates(now: ParkNow, rand: () => number = Math.random): Request[] {
  const day = Math.floor(now.time);
  const pick = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const make = (r: Omit<Request, 'issuedAt' | 'dueDay' | 'base'> & { base?: number }, days: number): Request => ({
    base: 0,
    ...r,
    issuedAt: now.time,
    dueDay: day + days - 1,
  });
  const out: Request[] = [];

  // 届ける：野外に十分いるものだけ頼む（採りつくさせない）
  const deliverable = DELIVERY.filter((d) => now.wild[d.item as keyof ParkNow['wild']] >= d.n[0] + d.spare);
  if (deliverable.length > 0) {
    const d = deliverable[Math.floor(rand() * deliverable.length)];
    const have = now.wild[d.item as keyof ParkNow['wild']];
    const n = Math.min(pick(d.n[0], d.n[1]), have - d.spare);
    out.push(
      make(
        {
          kind: 'deliver',
          subject: d.item,
          name: ITEMS[d.item].name,
          counter: d.counter,
          target: n,
          reward: rewardFor(now, 0.25, ITEMS[d.item].price * n * 3),
        },
        2,
      ),
    );
  }

  // 増やす：いまの園の作りで集まるだけ集まっていて、まだ上限に届いていない生き物
  // （待っているだけで達成にならないよう、場所を広げないと届かない数を頼む）
  const growable = now.watchable.filter((w) => w.count >= 1 && w.count >= w.cap && w.cap < w.max);
  if (growable.length > 0) {
    const w = growable[Math.floor(rand() * growable.length)];
    out.push(
      make(
        {
          kind: 'watch',
          subject: w.id,
          name: w.name,
          counter: w.counter,
          target: Math.min(w.max, Math.max(w.count, w.cap) + pick(1, 2)),
          reward: rewardFor(now, 0.35, 300),
        },
        2,
      ),
    );
  }

  out.push(make({ kind: 'plant', target: pick(4, 6) * 2, base: now.treesNearWater, reward: rewardFor(now, 0.2, 300) }, 2));
  if (now.waterCells < 3000) {
    out.push(make({ kind: 'dig', target: pick(2, 4) * 50, base: now.waterCells, reward: rewardFor(now, 0.2, 250) }, 2));
  }
  if (now.safety < 0.95) out.push(make({ kind: 'safety', target: 100, reward: rewardFor(now, 0.3, 300) }, 2));
  // 採ってばかりのときに、ひと休みを頼まれる
  if (now.pressure >= 5) out.push(make({ kind: 'noHarvest', target: 1, reward: rewardFor(now, 0.2, 200) }, 1));
  // キツネがうろついているときに、安全な園にしてほしいと頼まれる
  if (now.wild.fox >= 1 && !now.incident) {
    out.push(make({ kind: 'noIncident', target: 1, reward: rewardFor(now, 0.4, 400) }, 2));
  }
  return out;
}

export type RequestEvent =
  | { type: 'offered'; request: Request }
  | { type: 'done'; request: Request }
  | { type: 'failed'; request: Request; why: string }
  | { type: 'expired'; request: Request };

/** 保存する内容 */
export interface RequestsState {
  active: Request | null;
  /** これまでに応えた数 */
  completed: number;
  /** 最後に届いたお願いの種類（同じ種類が続かないようにする） */
  lastKind: RequestKind | null;
  /** 最後にお願いが届いた日（1日に 1件まで） */
  lastOfferDay: number;
}

export function emptyRequests(): RequestsState {
  return { active: null, completed: 0, lastKind: null, lastOfferDay: 0 };
}

export class Requests {
  state: RequestsState = emptyRequests();
  private readonly rand: () => number;

  constructor(rand: () => number = Math.random) {
    this.rand = rand;
  }

  get active(): Request | null {
    return this.state.active;
  }

  private finish(type: 'done'): RequestEvent;
  private finish(type: 'expired'): RequestEvent;
  private finish(type: 'failed', why: string): RequestEvent;
  private finish(type: 'done' | 'expired' | 'failed', why = ''): RequestEvent {
    const request = this.state.active!;
    this.state.active = null;
    if (type === 'done') this.state.completed++;
    return type === 'failed' ? { type, request, why } : { type, request };
  }

  /**
   * 朝になったときに呼ぶ。期限の過ぎたお願いを片付け、空いていれば新しいお願いを受ける。
   */
  onNewDay(now: ParkNow): RequestEvent[] {
    const events: RequestEvent[] = [];
    const day = Math.floor(now.time);
    const r = this.state.active;
    if (r && day > r.dueDay) {
      // 「起こさない」お願いは、期限まで守りきれば達成
      events.push(isKeeping(r.kind) ? this.finish('done') : this.finish('expired'));
    }
    if (!this.state.active && this.state.lastOfferDay < day) {
      const all = candidates(now, this.rand);
      const fresh = all.filter((c) => c.kind !== this.state.lastKind);
      const pool = fresh.length > 0 ? fresh : all;
      if (pool.length > 0) {
        const request = pool[Math.floor(this.rand() * pool.length)];
        this.state.active = request;
        this.state.lastKind = request.kind;
        this.state.lastOfferDay = day;
        events.push({ type: 'offered', request });
      }
    }
    return events;
  }

  /** 数を満たせば達成になるお願いを判定する（届けるお願いは「届ける」を押したときだけ） */
  update(now: ParkNow): RequestEvent[] {
    const r = this.state.active;
    if (!r || r.kind === 'deliver' || isKeeping(r.kind)) return [];
    return progressOf(r, now).ready ? [this.finish('done')] : [];
  }

  /** かごの中身を届ける。数がそろっていれば、かごから減らして達成にする */
  deliver(inventory: Inventory): RequestEvent | null {
    const r = this.state.active;
    if (!r || r.kind !== 'deliver') return null;
    const item = r.subject as ItemKind;
    if ((inventory[item] ?? 0) < r.target) return null;
    inventory[item] -= r.target;
    return this.finish('done');
  }

  /** 何かを採ったとき */
  noteHarvest(): RequestEvent | null {
    return this.state.active?.kind === 'noHarvest' ? this.finish('failed', t('採ってしまいました')) : null;
  }

  /** 来園者が襲われたとき */
  noteIncident(): RequestEvent | null {
    return this.state.active?.kind === 'noIncident' ? this.finish('failed', t('襲撃事件が起きました')) : null;
  }

  /** お願いを見送る */
  dismiss(): Request | null {
    const r = this.state.active;
    this.state.active = null;
    return r;
  }

  restore(s: Partial<RequestsState> | undefined): void {
    const base = emptyRequests();
    this.state = {
      active: s?.active ? { ...s.active } : null,
      completed: s?.completed ?? base.completed,
      lastKind: s?.lastKind ?? base.lastKind,
      lastOfferDay: s?.lastOfferDay ?? base.lastOfferDay,
    };
  }

  snapshot(): RequestsState {
    return { ...this.state, active: this.state.active ? { ...this.state.active } : null };
  }
}
