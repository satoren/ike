import './progress.css';
import { icons } from './icons';
import { FACILITIES } from './facilities';
import { RANKS, type GoalView, type Progress, type Rank } from './progress';

function stars(n: number): string {
  return `${'★'.repeat(n)}<i>${'★'.repeat(RANKS.length - n)}</i>`;
}

/**
 * 上部のランク表示（★と目標の達成数）と、押すと開く目標の一覧。
 */
export class RankBadge {
  /** 目標のパネルを開いたときに呼ぶ（はじめの案内が使う） */
  onOpen?: () => void;
  private readonly button: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private readonly list: HTMLElement;
  private readonly head: HTMLElement;
  private key = '';

  constructor(brand: HTMLElement, root: HTMLElement) {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'rank-badge';
    this.button.setAttribute('aria-expanded', 'false');
    this.button.title = '園のランクと、次のランクへの目標';
    brand.appendChild(this.button);

    this.panel = document.createElement('section');
    this.panel.className = 'rank-panel card';
    this.panel.hidden = true;
    this.panel.setAttribute('aria-label', '園のランク');
    this.panel.innerHTML = `
      <div class="rank-head"></div>
      <ul class="rank-goals"></ul>
      <p class="rank-foot"></p>`;
    this.head = this.panel.querySelector('.rank-head')!;
    this.list = this.panel.querySelector('.rank-goals')!;
    root.appendChild(this.panel);

    this.button.addEventListener('click', () => this.toggle(this.panel.hidden));
    this.panel.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.rank-close')) this.toggle(false);
    });
    window.addEventListener('resize', () => this.place());
  }

  toggle(open: boolean): void {
    this.panel.hidden = !open;
    if (open) this.onOpen?.();
    this.button.setAttribute('aria-expanded', String(open));
    this.button.classList.remove('ping');
    if (open) this.place();
  }

  /** 上部のバーのすぐ下に出す（画面幅で上部の高さが変わるため） */
  private place(): void {
    const top = this.button.closest('.topbar')?.getBoundingClientRect().bottom ?? 80;
    this.panel.style.top = `${Math.round(top + 8)}px`;
  }

  /** 目標を達成したときなどに、ランク表示を光らせる */
  ping(): void {
    if (!this.panel.hidden) return;
    this.button.classList.remove('ping');
    void this.button.offsetWidth;
    this.button.classList.add('ping');
  }

  update(progress: Progress, goals: GoalView[]): void {
    const rank = progress.rank;
    const done = goals.filter((g) => g.done).length;
    const key = `${progress.state.rank}|${goals.map((g) => `${g.done}:${g.text}`).join('|')}`;
    if (key === this.key) return;
    this.key = key;

    this.button.innerHTML = `
      <span class="rank-star">${icons.star}</span><b>${rank.stars}</b>
      ${goals.length > 0 ? `<small>${done}/${goals.length}</small>` : ''}`;

    this.head.innerHTML = `
      <span class="rank-stars" aria-label="5段階で${rank.stars}">${stars(rank.stars)}</span>
      <b class="rank-name">${rank.name}</b>
      <button type="button" class="rank-close" aria-label="閉じる">${icons.close}</button>
      <span class="rank-sub">入園料 ×${rank.ticket}</span>`;

    const next = progress.next;
    this.list.innerHTML = '';
    if (!next) {
      this.list.innerHTML = '<li class="rank-max">最高ランクです。全国から客が訪れる名所になりました</li>';
    }
    for (const g of goals) {
      const li = document.createElement('li');
      li.className = `rank-goal${g.done ? ' done' : ''}`;
      li.innerHTML = `
        <span class="rank-check" aria-hidden="true"></span>
        <span class="rank-label"></span>
        <span class="rank-value">${g.text}</span>
        <span class="rank-bar"><i style="width:${Math.round(g.ratio * 100)}%"></i></span>`;
      li.querySelector('.rank-label')!.textContent = g.goal.label;
      this.list.appendChild(li);
    }
    this.panel.querySelector('.rank-foot')!.innerHTML = next ? `<b>★${next.stars} ${next.name}</b> になると ${rewardText(next)}` : '';
  }
}

export function rewardText(rank: Rank): string {
  const parts = [`賞金 ${rank.reward.toLocaleString()}G`, `入園料 ×${rank.ticket}`];
  for (const k of rank.unlocks) parts.push(`${FACILITIES[k].name}が建てられる`);
  return parts.join('・');
}
