import './guide.css';
import { icons } from './icons';
import type { GuideProgress, GuideTarget } from './guide';
import { t } from './i18n';

/** 案内が指す場所（道具のまとまり・かご・ランクの★） */
const TARGETS: Record<GuideTarget, string> = {
  land: '.tool[data-group="land"]',
  nature: '.tool[data-group="nature"]',
  build: '.tool[data-group="build"]',
  collect: '.tool[data-group="collect"]',
  basket: '.basket',
  rank: '.rank-badge',
};

/** 狭い画面で、新しい手順の説明を開いておく時間 */
const FOLD_AFTER_MS = 7000;

/**
 * はじめの案内の表示。
 * 画面の上に、いまやることを 1つだけ出し、使う道具を光らせる。×でいつでもやめられる。
 */
export class GuideView {
  private readonly root: HTMLElement;
  private readonly el: HTMLElement;
  private readonly step: HTMLElement;
  private readonly title: HTMLElement;
  private readonly count: HTMLElement;
  private readonly how: HTMLElement;
  private readonly bar: HTMLElement;
  private target: Element | null = null;
  private key = '';
  private index = -1;
  private foldTimer = 0;

  constructor(root: HTMLElement, onSkip: () => void) {
    this.root = root;
    this.el = document.createElement('section');
    this.el.className = 'guide card';
    this.el.hidden = true;
    this.el.setAttribute('aria-label', t('はじめの案内'));
    this.el.innerHTML = `
      <span class="guide-step"></span>
      <div class="guide-body">
        <p class="guide-line"><b class="guide-title"></b><span class="guide-count"></span></p>
        <p class="guide-how"></p>
        <span class="guide-bar"><i></i></span>
      </div>
      <button type="button" class="guide-skip" aria-label="${t('案内をやめる')}" title="${t('案内をやめる')}">${icons.close}</button>`;
    this.step = this.el.querySelector('.guide-step')!;
    this.title = this.el.querySelector('.guide-title')!;
    this.count = this.el.querySelector('.guide-count')!;
    this.how = this.el.querySelector('.guide-how')!;
    this.bar = this.el.querySelector('.guide-bar i')!;
    this.el.querySelector('.guide-skip')!.addEventListener('click', onSkip);
    // 狭い画面ではやり方の説明を畳んでおき、案内を押すと開く（地図を広く使うため）
    this.el.querySelector('.guide-body')!.addEventListener('click', () => {
      window.clearTimeout(this.foldTimer);
      // 見えている説明を畳むか、見えていなければ開いたままにする
      const show = getComputedStyle(this.how).display === 'none';
      this.el.classList.remove('open');
      this.el.classList.toggle('pinned', show);
    });
    // 通知（.toasts）より前に置き、案内が出ているあいだは通知を下へずらす
    root.insertBefore(this.el, root.querySelector('.toasts'));
  }

  update(p: GuideProgress | null): void {
    const key = p ? `${p.index}:${p.value}` : '';
    if (key === this.key) return;
    this.key = key;
    this.el.hidden = !p;
    if (!p) {
      this.point(null);
      return;
    }
    // 新しい手順になったら、しばらく説明を開いて見せてから畳む
    if (p.index !== this.index) {
      this.index = p.index;
      this.el.classList.add('open');
      window.clearTimeout(this.foldTimer);
      this.foldTimer = window.setTimeout(() => this.el.classList.remove('open'), FOLD_AFTER_MS);
    }
    this.step.innerHTML = `<span class="guide-step-word">${t('案内')} </span>${p.index}/${p.total}`;
    this.title.textContent = p.step.title;
    this.count.textContent = p.text;
    this.how.textContent = p.step.how;
    this.bar.style.width = `${Math.round(p.ratio * 100)}%`;
    this.point(this.root.querySelector(TARGETS[p.step.target]));
  }

  /** 使う道具やパネルを光らせる */
  private point(next: Element | null): void {
    if (next === this.target) return;
    this.target?.classList.remove('guide-target');
    next?.classList.add('guide-target');
    this.target = next;
  }
}
