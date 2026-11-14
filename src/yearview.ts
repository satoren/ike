import './yearbook.css';
import { icons } from './icons';
import type { YearSummary } from './yearbook';

const G = (n: number) => `${n.toLocaleString()}G`;

/**
 * 1年のまとめの表示。冬が終わると画面の中央に出る。閉じたあとも、遊び方の「去年のまとめ」から見返せる。
 */
export class YearPanel {
  private readonly panel: HTMLElement;
  private readonly body: HTMLElement;
  private readonly extra: HTMLElement;
  /** まとめを出すたびに、下の欄（ランキングに載せるなど）を作る */
  onShow: ((y: YearSummary, slot: HTMLElement) => void) | null = null;

  constructor(root: HTMLElement) {
    this.panel = document.createElement('section');
    this.panel.className = 'year-panel card';
    this.panel.hidden = true;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', '1年のまとめ');
    this.panel.innerHTML = `
      <button type="button" class="year-close" aria-label="閉じる">${icons.close}</button>
      <div class="year-body"></div>
      <div class="year-extra"></div>
      <button type="button" class="year-ok">つぎの年へ</button>`;
    this.body = this.panel.querySelector('.year-body')!;
    this.extra = this.panel.querySelector('.year-extra')!;
    for (const b of this.panel.querySelectorAll('.year-close, .year-ok')) b.addEventListener('click', () => this.close());
    root.appendChild(this.panel);
  }

  get open(): boolean {
    return !this.panel.hidden;
  }

  close(): void {
    this.panel.hidden = true;
  }

  show(y: YearSummary): void {
    const record = (on: boolean) => (on ? '<em class="year-record">記録更新</em>' : '');
    const row = (label: string, value: string, extra = '') => `<li><span>${label}</span><b>${value}</b>${extra}</li>`;
    const sub = (label: string, value: number) => (value > 0 ? `<li class="year-sub"><span>${label}</span><b>${G(value)}</b></li>` : '');
    const partial = y.days < 20 ? `<small>（途中から数えた ${y.days}日ぶん）</small>` : '';
    const rank = y.rankEnd > y.rankStart ? `★${y.rankStart} → ★${y.rankEnd}` : `★${y.rankEnd}`;
    this.body.innerHTML = `
      <p class="year-title"><b>${y.year}年目のまとめ</b>${partial}</p>
      <p class="year-comment"></p>
      <ul class="year-list">
        ${row('来園者の合計', `${y.visitors.toLocaleString()}人`, record(y.records.visitors))}
        ${row('いちばん多かった日', `${y.bestDay.toLocaleString()}人`, record(y.records.bestDay))}
        ${row('収入の合計', G(y.income), record(y.records.income))}
        ${sub('入園料', y.tickets)}${sub('売店', y.shop)}${sub('売り上げ', y.sales)}${sub('賞金・報酬', y.rewards)}
        ${row('園のランク', rank)}
        ${row('図鑑に載った生き物', `${y.found}種`)}
        ${row('応えたお願い', `${y.requests}件`)}
        ${row('客が襲われた事件', `${y.incidents}件`)}
        ${y.bears > 0 ? row('仕留めたクマ', `${y.bears}頭`) : ''}
      </ul>`;
    this.body.querySelector('.year-comment')!.textContent = y.comment;
    this.extra.replaceChildren();
    this.onShow?.(y, this.extra);
    this.panel.hidden = false;
  }
}
