import './speed.css';
import { t } from './i18n';

/**
 * 時間の速さ（ゆっくり・ふつう・はやい）。
 * ゲーム内の時間（1 日の進み、木や生き物、事件など）だけを速め・遅め、カメラや道具の手応えは変えない。
 */
export const SPEEDS = [
  { label: t('ゆっくり'), scale: 0.5 },
  { label: t('ふつう'), scale: 1 },
  { label: t('はやい'), scale: 3 },
] as const;

export const DEFAULT_SPEED = 1;

/** 保存データなどから来た値を、使える段階の番号に直す */
export function clampSpeed(i: unknown): number {
  return typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < SPEEDS.length ? i : DEFAULT_SPEED;
}

/** 1 日が実時間で何秒か（表示用） */
export function secondsPerDay(index: number, baseSecondsPerDay: number): number {
  return baseSecondsPerDay / SPEEDS[index].scale;
}

const arrow = (x: number) => `<path d="M${x} 7l5 5-5 5"/>`;
const icon = (n: number) => {
  const xs = n === 1 ? [10] : n === 2 ? [7, 12] : [4.5, 9.5, 14.5];
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${xs.map(arrow).join('')}</svg>`;
};

/** 上部の日付の横に置く、時間の速さの切り替えボタン（押すたびに次の段階へ） */
export class SpeedButton {
  private readonly el: HTMLButtonElement;
  private readonly baseSecondsPerDay: number;

  /** anchor の直後に置く */
  constructor(anchor: Element, baseSecondsPerDay: number, onClick: () => void) {
    this.baseSecondsPerDay = baseSecondsPerDay;
    this.el = document.createElement('button');
    this.el.type = 'button';
    this.el.className = 'speed-btn';
    this.el.addEventListener('click', onClick);
    anchor.after(this.el);
  }

  set(index: number): void {
    const s = SPEEDS[index];
    this.el.dataset.speed = String(index);
    this.el.innerHTML = `${icon(index + 1)}<span class="speed-label">${s.label}</span>`;
    const sec = Math.round(secondsPerDay(index, this.baseSecondsPerDay));
    this.el.title = t('時間の速さ：{0}（1 日 {1} 秒）。クリックか T キーで切り替え', s.label, sec);
    this.el.setAttribute('aria-label', this.el.title);
  }
}
