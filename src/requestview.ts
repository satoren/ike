import './requests.css';
import { icons } from './icons';
import { clientOf, describe, dueText, type Request, type RequestProgress } from './requests';
import { t } from './i18n';

interface Handlers {
  /** かごの中身を届ける */
  onDeliver: () => void;
  /** お願いを見送る */
  onDismiss: () => void;
}

/**
 * 日替わりのお願いの表示。
 * お願いがあるあいだ、小さなボタンに進み具合を出し、押すとくわしい内容と「届ける」「見送る」を出す。
 */
export class RequestPanel {
  private readonly button: HTMLButtonElement;
  private readonly label: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly client: HTMLElement;
  private readonly title: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly value: HTMLElement;
  private readonly meta: HTMLElement;
  private readonly deliver: HTMLButtonElement;
  private key = '';

  constructor(root: HTMLElement, handlers: Handlers) {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'req-btn card';
    this.button.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    this.button.title = t('今日のお願い');
    this.button.innerHTML = `<span class="req-btn-icon">${icons.mail}</span><span class="req-btn-text"></span>`;
    this.label = this.button.querySelector('.req-btn-text')!;
    root.appendChild(this.button);

    this.panel = document.createElement('section');
    this.panel.className = 'req-panel card';
    this.panel.hidden = true;
    this.panel.setAttribute('aria-label', t('今日のお願い'));
    this.panel.innerHTML = `
      <div class="req-head">
        <span class="req-head-icon">${icons.mail}</span>
        <b class="req-client"></b>
        <button type="button" class="req-close" aria-label="${t('閉じる')}">${icons.close}</button>
      </div>
      <p class="req-title"></p>
      <p class="req-detail"></p>
      <div class="req-progress"><span class="req-bar"><i></i></span><span class="req-value"></span></div>
      <p class="req-meta"></p>
      <div class="req-actions">
        <button type="button" class="req-deliver">${t('届ける')}</button>
        <button type="button" class="req-dismiss">${t('見送る')}</button>
      </div>`;
    this.client = this.panel.querySelector('.req-client')!;
    this.title = this.panel.querySelector('.req-title')!;
    this.detail = this.panel.querySelector('.req-detail')!;
    this.bar = this.panel.querySelector('.req-bar i')!;
    this.value = this.panel.querySelector('.req-value')!;
    this.meta = this.panel.querySelector('.req-meta')!;
    this.deliver = this.panel.querySelector('.req-deliver')!;
    root.appendChild(this.panel);

    this.button.addEventListener('click', () => this.toggle(this.panel.hidden));
    this.panel.querySelector('.req-close')!.addEventListener('click', () => this.toggle(false));
    this.deliver.addEventListener('click', () => handlers.onDeliver());
    this.panel.querySelector('.req-dismiss')!.addEventListener('click', () => handlers.onDismiss());
  }

  toggle(open: boolean): void {
    this.panel.hidden = !open;
    this.button.setAttribute('aria-expanded', String(open));
    this.button.classList.remove('ping');
  }

  /** 新しいお願いが届いたときに、ボタンを光らせる */
  ping(): void {
    if (!this.panel.hidden) return;
    this.button.classList.remove('ping');
    void this.button.offsetWidth;
    this.button.classList.add('ping');
  }

  update(r: Request | null, progress: RequestProgress | null, day: number): void {
    if (!r || !progress) {
      if (this.key !== '') {
        this.key = '';
        this.button.hidden = true;
        this.toggle(false);
      }
      return;
    }
    const due = dueText(r, day);
    const key = `${r.issuedAt}|${progress.text}|${Math.round(progress.ratio * 100)}|${progress.ready}|${due}`;
    if (key === this.key) return;
    this.key = key;

    const text = describe(r);
    this.button.hidden = false;
    this.button.classList.toggle('ready', progress.ready);
    this.label.innerHTML = `<span class="req-short"></span><b></b>`;
    this.label.querySelector('.req-short')!.textContent = text.short;
    this.label.querySelector('b')!.textContent = progress.brief;

    this.client.textContent = t('{0}からのお願い', clientOf(r));
    this.title.textContent = text.title;
    this.detail.textContent = text.detail;
    this.bar.style.width = `${Math.round(progress.ratio * 100)}%`;
    this.value.textContent = progress.text;
    this.meta.innerHTML = `${t('報酬')} <b>${r.reward.toLocaleString()}G</b>${t('　')}${t('期限')} <b>${due}</b>`;
    this.deliver.hidden = r.kind !== 'deliver';
    this.deliver.disabled = !progress.ready;
  }
}
