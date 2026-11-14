import type { YearSummary } from './yearbook';
import { t } from './i18n';

/**
 * 1年のランキング（描画から独立）。ログイン不要。
 * ブラウザごとに見えない番号（player）を作って localStorage に覚え、名前は好きなニックネームを付けてもらう。
 * 冬の終わりの「1年のまとめ」から成績を中継（feedback-worker の /scores）に送り、部門ごとの順位を見る。
 * 途中から数えた年（20日に満たない年）は載せられない。
 */

export const RANKING_KEY = 'ike-ranking';
export const YEAR_DAYS = 20;
export const NAME_MAX = 12;

export type BoardId = 'visitors' | 'income' | 'safe';

export const BOARDS: readonly { id: BoardId; label: string; about: string; unit: 'people' | 'gold' }[] = [
  { id: 'visitors', label: t('来園者'), about: t('1年の来園者の合計'), unit: 'people' },
  { id: 'income', label: t('収入'), about: t('1年の収入の合計'), unit: 'gold' },
  { id: 'safe', label: t('安心な園'), about: t('客が襲われる事件が 1件も無かった年の来園者'), unit: 'people' },
];

export interface BoardEntry {
  name: string;
  year: number;
  score: number;
  me: boolean;
}

export interface Board {
  label: string;
  top: BoardEntry[];
  players: number;
  me: { score: number; year: number; rank: number } | null;
}

export type Boards = Record<BoardId, Board>;

/** ブラウザに覚えておくこと */
export interface RankingMemo {
  player: string;
  name: string;
  /** 送った年（"遊びの番号:年"） */
  sent: string[];
}

export interface ScorePayload {
  player: string;
  run: string;
  name: string;
  year: Pick<
    YearSummary,
    'year' | 'days' | 'visitors' | 'bestDay' | 'tickets' | 'shop' | 'sales' | 'rewards' | 'found' | 'requests' | 'incidents' | 'bears' | 'rankStart' | 'rankEnd'
  >;
}

function randomId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** 覚えている内容を読む。無ければ新しい番号を作る */
export function parseMemo(text: string | null): RankingMemo {
  try {
    const m = JSON.parse(text ?? '');
    if (m && typeof m.player === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(m.player)) {
      return { player: m.player, name: typeof m.name === 'string' ? m.name : '', sent: Array.isArray(m.sent) ? m.sent.filter((s: unknown) => typeof s === 'string').slice(-50) : [] };
    }
  } catch {
    // 読めなければ作り直す
  }
  return { player: randomId(), name: '', sent: [] };
}

/** 送る前の名前の確認（中継でもう一度確かめる）。問題があれば理由を返す */
export function validateName(raw: string): string | null {
  const name = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!name) return t('名前を入れてください');
  if ([...name].length > NAME_MAX) return t('{0}文字までにしてください', NAME_MAX);
  if (/[<>]/.test(name)) return t('< と > は使えません');
  return null;
}

/** この年をランキングに載せられるか。載せられなければ理由 */
export function eligibility(y: YearSummary): string | null {
  if (y.days < YEAR_DAYS) return t('途中から数えた年は、ランキングに載せられません');
  if (y.visitors < 1) return t('来園者がいなかった年は、ランキングに載せられません');
  return null;
}

export const sentKey = (run: string, year: number): string => `${run}:${year}`;

export function toPayload(memo: RankingMemo, run: string, name: string, y: YearSummary): ScorePayload {
  return {
    player: memo.player,
    run,
    name: name.normalize('NFKC').replace(/\s+/g, ' ').trim(),
    year: {
      year: y.year,
      days: y.days,
      visitors: y.visitors,
      bestDay: y.bestDay,
      tickets: y.tickets,
      shop: y.shop,
      sales: y.sales,
      rewards: y.rewards,
      found: y.found,
      requests: y.requests,
      incidents: y.incidents,
      bears: y.bears,
      rankStart: y.rankStart,
      rankEnd: y.rankEnd,
    },
  };
}

/** 中継が返したエラーを、プレイヤー向けの言葉にする */
export function errorText(code: string | undefined, status: number): string {
  switch (code) {
    case 'name':
      return t('その名前は使えません。別の名前にしてください');
    case 'partial':
      return t('途中から数えた年は、ランキングに載せられません');
    case 'empty':
      return t('来園者がいなかった年は、ランキングに載せられません');
    case 'unlikely':
      return t('この成績は受け付けられませんでした');
    case 'rate':
      return t('続けて送りすぎです。少し時間をおいてください');
    default:
      return status >= 500 || status === 0 ? t('送れませんでした。時間をおいて試してください') : t('送れませんでした');
  }
}

/** 順位をひとことで（"3位 / 42人"） */
export function rankText(b: Board): string {
  return b.me ? t('{0}位 / {1}人', b.me.rank, b.players) : '—';
}
