import './reviews.css';
import { icons } from './icons';
import { FACTOR_LABEL, type Review, type ReviewFeed } from './reviews';

const SHOWN = 4;

/** 客の口コミを並べるカード。新しいものが上に来る */
export class ReviewPanel {
  private readonly root: HTMLElement;
  private readonly list: HTMLUListElement;
  private readonly avg: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('aside');
    this.root.className = 'reviews card';
    this.root.setAttribute('aria-label', '客の口コミ');
    this.root.innerHTML = `
      <button type="button" class="reviews-head" aria-expanded="true">
        <span class="reviews-icon">${icons.people}</span>
        <b>口コミ</b>
        <span class="reviews-avg"></span>
        <span class="reviews-toggle" aria-hidden="true"></span>
      </button>
      <ul class="reviews-list" aria-live="polite"><li class="reviews-empty">まだ口コミはありません</li></ul>`;
    this.list = this.root.querySelector('.reviews-list')!;
    this.avg = this.root.querySelector('.reviews-avg')!;
    const head = this.root.querySelector<HTMLButtonElement>('.reviews-head')!;
    // 狭い画面では最新の 1 件だけ見せ、押すと広げる
    const narrow = window.matchMedia('(max-width: 640px)').matches;
    this.root.classList.toggle('open', !narrow);
    head.setAttribute('aria-expanded', String(!narrow));
    head.addEventListener('click', () => {
      const open = this.root.classList.toggle('open');
      head.setAttribute('aria-expanded', String(open));
    });
    parent.appendChild(this.root);
  }

  render(feed: ReviewFeed, fresh: Review | null): void {
    const avg = feed.average();
    this.avg.innerHTML = avg === null ? '' : `<span class="stars">★</span>${avg.toFixed(1)}`;
    this.list.innerHTML = '';
    if (feed.reviews.length === 0) {
      this.list.innerHTML = '<li class="reviews-empty">まだ口コミはありません</li>';
      return;
    }
    feed.reviews.slice(0, SHOWN).forEach((r) => {
      const li = document.createElement('li');
      li.className = `review ${r.good ? 'good' : 'bad'}${r === fresh ? ' fresh' : ''}`;
      li.innerHTML = `
        <span class="review-meta">
          <span class="stars" aria-label="5段階で${r.stars}">${'★'.repeat(r.stars)}<i>${'★'.repeat(5 - r.stars)}</i></span>
          <span class="review-factor">${FACTOR_LABEL[r.factor]}${r.good ? '＋' : '−'}</span>
          <span class="review-day">${r.day}日目</span>
        </span>
        <span class="review-text"></span>`;
      li.querySelector('.review-text')!.textContent = `「${r.text}」`;
      this.list.appendChild(li);
    });
  }
}
