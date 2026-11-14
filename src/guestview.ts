import './guests.css';
import { icons } from './icons';
import { GUESTS, GUEST_ORDER, weakestWant, type GuestKind, type GuestMix } from './guests';
import { t } from './i18n';

/**
 * 来園者のタイプの表示。上の「来園者」の数字を押すと開く。
 * タイプごとの人数・満足度・いちばん足りないものを見せ、呼びこむ客層を選べる。
 */
export class GuestPanel {
  private readonly panel: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly rows = new Map<GuestKind, { count: HTMLElement; bar: HTMLElement; pct: HTMLElement; lack: HTMLElement; focus: HTMLButtonElement }>();
  private readonly foot: HTMLElement;
  private key = '';

  constructor(root: HTMLElement, onFocus: (kind: GuestKind) => void) {
    this.chip = root.querySelector<HTMLElement>('.chip-visitors')!;
    this.chip.classList.add('chip-button');
    this.chip.setAttribute('role', 'button');
    this.chip.setAttribute('tabindex', '0');
    this.chip.setAttribute('aria-expanded', 'false');
    this.chip.title = t('来園者の内わけを見る');

    this.panel = document.createElement('section');
    this.panel.className = 'guest-panel card';
    this.panel.hidden = true;
    this.panel.setAttribute('aria-label', t('来園者の内わけ'));
    this.panel.innerHTML = `
      <div class="guest-head">
        <span class="guest-head-icon">${icons.people}</span>
        <b>${t('来園者の内わけ')}</b>
        <button type="button" class="guest-close" aria-label="${t('閉じる')}">${icons.close}</button>
      </div>
      <p class="guest-sub">${t('満足している客層ほど多く来ます。呼びこむ客層を 1つ選べます')}</p>
      <ul class="guest-list"></ul>
      <p class="guest-foot"></p>`;
    this.foot = this.panel.querySelector('.guest-foot')!;
    const list = this.panel.querySelector('.guest-list')!;
    for (const kind of GUEST_ORDER) {
      const info = GUESTS[kind];
      const li = document.createElement('li');
      li.className = `guest guest-${kind}`;
      li.innerHTML = `
        <span class="guest-dot" aria-hidden="true"></span>
        <span class="guest-name"><b>${info.name}</b><small>${t('入園料 ×{0}', info.spend)}</small></span>
        <span class="guest-count"></span>
        <button type="button" class="guest-focus" aria-pressed="false">${t('呼びこむ')}</button>
        <span class="guest-meter"><span class="guest-bar"><i></i></span><span class="guest-pct"></span></span>
        <span class="guest-lack"></span>`;
      li.title = info.about;
      const focus = li.querySelector<HTMLButtonElement>('.guest-focus')!;
      focus.addEventListener('click', () => onFocus(kind));
      list.appendChild(li);
      this.rows.set(kind, {
        count: li.querySelector('.guest-count')!,
        bar: li.querySelector('.guest-bar i')!,
        pct: li.querySelector('.guest-pct')!,
        lack: li.querySelector('.guest-lack')!,
        focus,
      });
    }
    root.appendChild(this.panel);

    const toggle = () => this.toggle(this.panel.hidden);
    this.chip.addEventListener('click', toggle);
    this.chip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
    this.panel.querySelector('.guest-close')!.addEventListener('click', () => this.toggle(false));
    window.addEventListener('resize', () => this.place());
  }

  toggle(open: boolean): void {
    this.panel.hidden = !open;
    this.chip.setAttribute('aria-expanded', String(open));
    if (open) this.place();
  }

  /** 上の数字の並びのすぐ下に出す（画面幅で高さが変わるため） */
  private place(): void {
    const bottom = this.chip.closest('.topbar')?.getBoundingClientRect().bottom ?? 80;
    this.panel.style.top = `${Math.round(bottom + 8)}px`;
  }

  update(mix: GuestMix): void {
    const key = mix.groups.map((g) => `${g.count}:${Math.round(g.satisfaction * 100)}:${g.focused ? 1 : 0}:${weakestWant(g)?.label ?? ''}`).join('|');
    if (key === this.key) return;
    this.key = key;
    for (const g of mix.groups) {
      const row = this.rows.get(g.kind)!;
      const pct = Math.round(g.satisfaction * 100);
      row.count.textContent = t('{0}人', g.count.toLocaleString());
      row.bar.style.width = `${pct}%`;
      row.pct.textContent = t('満足 {0}%', pct);
      const lack = weakestWant(g);
      row.lack.textContent = lack ? t('足りないもの：{0}', lack.label) : t('求めるものが全部そろっています');
      row.lack.classList.toggle('ok', !lack);
      row.focus.setAttribute('aria-pressed', String(g.focused));
      row.focus.textContent = g.focused ? t('呼びこみ中') : t('呼びこむ');
    }
    const spend = Math.round(mix.spend * 100);
    this.foot.textContent = t('いまの客層だと、入園料は 1人あたり {0}% 入ります', spend);
  }
}
