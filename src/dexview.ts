import './dex.css';
import { icons } from './icons';
import { DEX, DEX_BOOST_PER_ENTRY, DEX_GROUP_LABEL, DEX_GROUPS, type Dex, type DexEntry, type DexGroup, type DexId } from './dex';
import { t } from './i18n';

/** 一覧の 1 項目と、最後に書いた内容 */
interface Item {
  li: HTMLLIElement;
  seenDay: number | undefined;
  now: number;
  /** まだ 1 度も中身を書いていない */
  first: boolean;
  go?: HTMLButtonElement;
  away?: HTMLElement;
}

const ICON: Record<DexId, keyof typeof icons> = {
  fish: 'fish',
  duck: 'duck',
  frog: 'frog',
  dragonfly: 'dragonfly',
  turtle: 'turtle',
  kingfisher: 'kingfisher',
  heron: 'heron',
  rabbit: 'rabbit',
  squirrel: 'squirrel',
  deer: 'deer',
  owl: 'owl',
  fox: 'fox',
  bear: 'bear',
  firefly: 'firefly',
  salamander: 'salamander',
};

/**
 * 生き物図鑑のボタンと、押すと開く一覧。
 * まだ見つけていない生き物は名前を伏せ、どんな場所を作ればいいかのヒントだけを出す。
 */
export class DexPanel {
  private readonly button: HTMLButtonElement;
  private readonly count: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly body: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly items = new Map<DexId, Item>();
  private readonly groupCounts = new Map<DexGroup, HTMLElement>();
  private key = '';

  constructor(root: HTMLElement, onFocus: (id: DexId) => void) {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'dex-btn card';
    this.button.setAttribute('aria-expanded', 'false');
    this.button.setAttribute('aria-label', t('生き物図鑑'));
    this.button.title = t('生き物図鑑');
    this.button.innerHTML = `${icons.book}<span class="dex-count"></span>`;
    this.count = this.button.querySelector('.dex-count')!;
    root.appendChild(this.button);

    this.panel = document.createElement('section');
    this.panel.className = 'dex-panel card';
    this.panel.hidden = true;
    this.panel.setAttribute('aria-label', t('生き物図鑑'));
    this.panel.innerHTML = `
      <div class="dex-head">
        <span class="dex-head-icon">${icons.book}</span>
        <b>${t('生き物図鑑')}</b>
        <span class="dex-total"></span>
        <button type="button" class="dex-close" aria-label="${t('閉じる')}">${icons.close}</button>
      </div>
      <p class="dex-sub"></p>
      <div class="dex-body"></div>`;
    this.body = this.panel.querySelector('.dex-body')!;
    this.sub = this.panel.querySelector('.dex-sub')!;
    root.appendChild(this.panel);

    this.button.addEventListener('click', () => this.toggle(this.panel.hidden));
    // 遊び方と同じ場所に出るので、どちらか片方だけを開く
    const help = root.querySelector<HTMLElement>('.help');
    this.button.addEventListener('click', () => {
      if (help && this.isOpen) help.hidden = true;
    });
    root.querySelector('.help-btn')?.addEventListener('click', () => this.toggle(false));
    this.panel.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.dex-close')) this.toggle(false);
      const go = target.closest<HTMLButtonElement>('button[data-go]');
      if (go) {
        onFocus(go.dataset.go as DexId);
        // 狭い画面では一覧が地図を覆うので、見に行くときは閉じる
        if (window.matchMedia('(max-width: 640px), (max-height: 500px)').matches) this.toggle(false);
      }
    });
  }

  get isOpen(): boolean {
    return !this.panel.hidden;
  }

  toggle(open: boolean): void {
    this.panel.hidden = !open;
    this.button.setAttribute('aria-expanded', String(open));
    this.button.classList.remove('ping');
  }

  /** 新しい生き物を見つけたときに、ボタンを光らせる */
  ping(): void {
    if (this.isOpen) return;
    this.button.classList.remove('ping');
    void this.button.offsetWidth;
    this.button.classList.add('ping');
  }

  /** present は、いま園に居る数（生き物ごと） */
  update(dex: Dex, present: Partial<Record<DexId, number>>, mult = 1): void {
    const key = DEX.map((e) => `${dex.seenDay(e.id) ?? '-'}:${present[e.id] ?? 0}`).join('|') + `*${mult}`;
    if (key === this.key) return;
    this.key = key;

    this.count.textContent = `${dex.count}/${dex.total}`;
    this.panel.querySelector('.dex-total')!.textContent = `${dex.count} / ${dex.total}`;
    const per = Math.round(DEX_BOOST_PER_ENTRY * mult * 100);
    this.sub.textContent =
      dex.count >= dex.total
        ? t('図鑑が完成しました。評判が広まり、来園者 +{0}%', dex.count * per)
        : t('1種見つけるごとに評判が広まり、来園者が {0}% 増えます（いま +{1}%）', per, dex.count * per);

    if (this.items.size === 0) this.build();
    for (const group of DEX_GROUPS) {
      const entries = DEX.filter((e) => e.group === group);
      this.groupCounts.get(group)!.textContent = `${entries.filter((e) => dex.has(e.id)).length}/${entries.length}`;
    }
    // 変わった項目だけ書き換える（毎回作り直すと、押そうとしたボタンが消えて押しにくい）
    for (const e of DEX) {
      const item = this.items.get(e.id)!;
      const seenDay = dex.seenDay(e.id);
      const now = present[e.id] ?? 0;
      if (item.seenDay !== seenDay || item.first) {
        item.first = false;
        item.seenDay = seenDay;
        item.now = -1;
        this.fill(item, e, seenDay);
      }
      if (seenDay !== undefined && item.now !== now) {
        item.now = now;
        item.go!.hidden = now <= 0;
        item.go!.textContent = t('いま {0}', now);
        item.away!.hidden = now > 0;
      }
    }
  }

  /** 一覧の骨組みを 1 度だけ作る */
  private build(): void {
    this.body.innerHTML = '';
    for (const group of DEX_GROUPS) {
      const h = document.createElement('h3');
      h.className = 'dex-group';
      h.textContent = DEX_GROUP_LABEL[group];
      const small = document.createElement('small');
      h.appendChild(small);
      this.groupCounts.set(group, small);
      this.body.appendChild(h);
      const ul = document.createElement('ul');
      ul.className = 'dex-list';
      for (const e of DEX.filter((v) => v.group === group)) {
        const li = document.createElement('li');
        ul.appendChild(li);
        this.items.set(e.id, { li, seenDay: undefined, now: -1, first: true });
      }
      this.body.appendChild(ul);
    }
  }

  /** 1 項目の中身を、見つける前・見つけた後に合わせて書く */
  private fill(item: Item, e: DexEntry, seenDay: number | undefined): void {
    const li = item.li;
    const seen = seenDay !== undefined;
    li.className = `dex-item${seen ? '' : ' unknown'}`;
    li.innerHTML = `
      <span class="dex-icon">${seen ? icons[ICON[e.id]] : '?'}</span>
      <span class="dex-text"><b></b><span class="dex-note"></span></span>
      <span class="dex-side"></span>`;
    li.querySelector('b')!.textContent = seen ? e.name : t('？？？');
    li.querySelector('.dex-note')!.textContent = seen ? e.note : e.hint;
    const side = li.querySelector('.dex-side')!;
    item.go = item.away = undefined;
    if (!seen) {
      side.innerHTML = `<small>${t('発見で +{0}G', e.bonus)}</small>`;
      return;
    }
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'dex-go';
    go.dataset.go = e.id;
    go.title = t('見に行く');
    const away = document.createElement('span');
    away.className = 'dex-away';
    away.textContent = t('いまは居ない');
    const day = document.createElement('small');
    day.textContent = t('{0}日目に発見', seenDay);
    side.append(go, away, day);
    item.go = go;
    item.away = away;
  }
}
