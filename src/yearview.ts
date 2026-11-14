import './yearbook.css';
import { icons } from './icons';
import type { YearSummary } from './yearbook';
import { t } from './i18n';

const G = (n: number) => `${n.toLocaleString()}G`;

/**
 * 1年のまとめの表示。冬が終わると画面の中央に出る。閉じたあとも、遊び方の「去年のまとめ」から見返せる。
 */
export class YearPanel {
  private readonly panel: HTMLElement;
  private readonly body: HTMLElement;

  constructor(root: HTMLElement) {
    this.panel = document.createElement('section');
    this.panel.className = 'year-panel card';
    this.panel.hidden = true;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', t('1年のまとめ'));
    this.panel.innerHTML = `
      <button type="button" class="year-close" aria-label="${t('閉じる')}">${icons.close}</button>
      <div class="year-body"></div>
      <button type="button" class="year-ok">${t('つぎの年へ')}</button>`;
    this.body = this.panel.querySelector('.year-body')!;
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
    const record = (on: boolean) => (on ? `<em class="year-record">${t('記録更新')}</em>` : '');
    const row = (label: string, value: string, extra = '') => `<li><span>${label}</span><b>${value}</b>${extra}</li>`;
    const sub = (label: string, value: number) => (value > 0 ? `<li class="year-sub"><span>${label}</span><b>${G(value)}</b></li>` : '');
    const partial = y.days < 20 ? `<small>${t('（途中から数えた {0}日ぶん）', y.days)}</small>` : '';
    const rank = y.rankEnd > y.rankStart ? `★${y.rankStart} → ★${y.rankEnd}` : `★${y.rankEnd}`;
    this.body.innerHTML = `
      <p class="year-title"><b>${t('{0}年目のまとめ', y.year)}</b>${partial}</p>
      <p class="year-comment"></p>
      <ul class="year-list">
        ${row(t('来園者の合計'), t('{0}人', y.visitors.toLocaleString()), record(y.records.visitors))}
        ${row(t('いちばん多かった日'), t('{0}人', y.bestDay.toLocaleString()), record(y.records.bestDay))}
        ${row(t('収入の合計'), G(y.income), record(y.records.income))}
        ${sub(t('入園料'), y.tickets)}${sub(t('売店'), y.shop)}${sub(t('売り上げ'), y.sales)}${sub(t('賞金・報酬'), y.rewards)}
        ${row(t('園のランク'), rank)}
        ${row(t('図鑑に載った生き物'), t('{0}種', y.found))}
        ${row(t('応えたお願い'), t('{0}件', y.requests))}
        ${row(t('客が襲われた事件'), t('{0}件', y.incidents))}
        ${y.bears > 0 ? row(t('仕留めたクマ'), t('{0}頭', y.bears)) : ''}
      </ul>`;
    this.body.querySelector('.year-comment')!.textContent = y.comment;
    this.panel.hidden = false;
  }
}
