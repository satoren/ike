import './ranking.css';
import { icons } from './icons';
import type { YearSummary } from './yearbook';
import {
  BOARDS,
  RANKING_KEY,
  NAME_MAX,
  eligibility,
  errorText,
  parseMemo,
  rankText,
  sentKey,
  toPayload,
  validateName,
  type BoardId,
  type Boards,
  type RankingMemo,
} from './ranking';

/**
 * 1年のランキングの表示と送信。
 * 送り先は本番ビルドならゲームと同じ URL の ./scores（VITE_SCORES_ENDPOINT で変えられる。
 * 開発中は VITE_FEEDBACK_ENDPOINT の /feedback を /scores に読みかえる）。送り先が無いビルドでは何も出さない。
 */
const FEEDBACK = import.meta.env.VITE_FEEDBACK_ENDPOINT as string | undefined;
const ENDPOINT =
  (import.meta.env.VITE_SCORES_ENDPOINT as string | undefined) ||
  (FEEDBACK ? FEEDBACK.replace(/feedback\/?$/, 'scores') : undefined) ||
  (import.meta.env.PROD ? './scores' : undefined);

export const rankingEnabled = (): boolean => Boolean(ENDPOINT);

const fmt = (unit: 'people' | 'gold', n: number) => (unit === 'gold' ? `${n.toLocaleString()}G` : `${n.toLocaleString()}人`);

function loadMemo(): RankingMemo {
  let text: string | null = null;
  try {
    text = localStorage.getItem(RANKING_KEY);
  } catch {
    // 読めなくても、その場かぎりの番号で遊べる
  }
  const memo = parseMemo(text);
  saveMemo(memo);
  return memo;
}

function saveMemo(m: RankingMemo): void {
  try {
    localStorage.setItem(RANKING_KEY, JSON.stringify(m));
  } catch {
    // 保存できない環境では覚えておけないだけ
  }
}

/** みんなのランキング（部門ごとの上位と自分の順位）。遊び方と 1年のまとめから開く */
export class RankingPanel {
  private readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly memo: RankingMemo;
  private boards: Boards | null = null;
  private board: BoardId = 'visitors';

  constructor(hud: HTMLElement) {
    this.memo = loadMemo();
    this.el = document.createElement('section');
    this.el.className = 'ranking card';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'みんなのランキング');
    this.el.innerHTML = `
      <div class="ranking-head"><b>みんなのランキング</b><button type="button" class="ranking-close" aria-label="閉じる">${icons.close}</button></div>
      <div class="ranking-tabs" role="tablist"></div>
      <p class="ranking-about"></p>
      <div class="ranking-list" aria-live="polite"></div>
      <p class="ranking-note">冬の終わりの「1年のまとめ」から、ニックネームを付けて載せられます。いちばん良かった年が載ります。</p>`;
    this.list = this.el.querySelector('.ranking-list')!;
    this.tabs = this.el.querySelector('.ranking-tabs')!;
    for (const b of BOARDS) {
      const t = document.createElement('button');
      t.type = 'button';
      t.textContent = b.label;
      t.dataset.board = b.id;
      t.setAttribute('role', 'tab');
      t.addEventListener('click', () => this.select(b.id));
      this.tabs.append(t);
    }
    this.el.querySelector('.ranking-close')!.addEventListener('click', () => (this.el.hidden = true));
    hud.append(this.el);

    // 遊び方の「去年のまとめ」の隣に開くボタンを置く
    const more = hud.querySelector('.help-more');
    if (more) {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'help-ranking';
      open.textContent = 'みんなのランキング';
      open.addEventListener('click', () => {
        const help = hud.querySelector<HTMLElement>('.help');
        if (help) help.hidden = true;
        this.open();
      });
      more.append(open);
    }
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  get player(): RankingMemo {
    return this.memo;
  }

  open(board?: BoardId): void {
    if (board) this.board = board;
    this.el.hidden = false;
    this.render();
    void this.refresh();
  }

  close(): void {
    this.el.hidden = true;
  }

  /** 送った直後など、手もとにある最新の順位を使う */
  setBoards(b: Boards): void {
    this.boards = b;
    if (this.isOpen) this.render();
  }

  private select(id: BoardId): void {
    this.board = id;
    this.render();
  }

  private async refresh(): Promise<void> {
    if (!this.boards) this.list.innerHTML = '<p class="ranking-empty">読み込み中…</p>';
    try {
      const res = await fetch(`${ENDPOINT}?player=${encodeURIComponent(this.memo.player)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { boards: Boards };
      this.boards = data.boards;
      this.render();
    } catch {
      if (!this.boards) this.list.innerHTML = '<p class="ranking-empty">読み込めませんでした。時間をおいて試してください</p>';
    }
  }

  private render(): void {
    const meta = BOARDS.find((b) => b.id === this.board)!;
    for (const t of this.tabs.querySelectorAll<HTMLButtonElement>('button')) {
      const on = t.dataset.board === this.board;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', String(on));
    }
    this.el.querySelector('.ranking-about')!.textContent = meta.about;
    const b = this.boards?.[this.board];
    if (!b) return;
    this.list.replaceChildren();
    if (!b.top.length) {
      this.list.innerHTML = '<p class="ranking-empty">まだ誰も載っていません。最初の 1人になりましょう</p>';
      return;
    }
    const ol = document.createElement('ol');
    ol.className = 'ranking-rows';
    let rank = 0;
    let prev = -1;
    b.top.forEach((e, i) => {
      if (e.score !== prev) rank = i + 1;
      prev = e.score;
      ol.append(this.row(rank, e.name, e.year, fmt(meta.unit, e.score), e.me));
    });
    this.list.append(ol);
    if (b.me && !b.top.some((e) => e.me)) {
      const mine = document.createElement('ol');
      mine.className = 'ranking-rows ranking-mine';
      mine.append(this.row(b.me.rank, this.memo.name || 'あなた', b.me.year, fmt(meta.unit, b.me.score), true));
      this.list.append(mine);
    }
    const foot = document.createElement('p');
    foot.className = 'ranking-count';
    foot.textContent = b.me ? `あなたは ${rankText(b)}` : `${b.players}人が参加しています`;
    this.list.append(foot);
  }

  private row(rank: number, name: string, year: number, score: string, me: boolean): HTMLElement {
    const li = document.createElement('li');
    if (me) li.className = 'me';
    const medal = rank <= 3 ? ` medal-${rank}` : '';
    li.innerHTML = `<span class="ranking-rank${medal}"></span><span class="ranking-name"></span><small></small><b></b>`;
    li.querySelector('.ranking-rank')!.textContent = String(rank);
    // 名前はほかのプレイヤーが付けたものなので、必ず文字として入れる
    li.querySelector('.ranking-name')!.textContent = name;
    li.querySelector('small')!.textContent = `${year}年目`;
    li.querySelector('b')!.textContent = score;
    return li;
  }

  /**
   * 1年のまとめの下に出す「ランキングに載せる」欄を作る。
   * run はこの遊びの番号（新しく始めるたびに変わる）。
   */
  renderSubmit(slot: HTMLElement, y: YearSummary, run: string): void {
    slot.replaceChildren();
    const box = document.createElement('div');
    box.className = 'year-rank';
    slot.append(box);
    const why = eligibility(y);
    if (why) {
      box.innerHTML = `<p class="year-rank-note"></p><button type="button" class="year-rank-view">みんなのランキングを見る</button>`;
      box.querySelector('.year-rank-note')!.textContent = why;
      box.querySelector('.year-rank-view')!.addEventListener('click', () => this.open());
      return;
    }
    const sent = this.memo.sent.includes(sentKey(run, y.year));
    box.innerHTML = `
      <form class="year-rank-form">
        <label><span>ランキングに載せる</span>
          <input type="text" name="name" maxlength="${NAME_MAX * 2}" placeholder="ニックネーム（${NAME_MAX}文字まで）" autocomplete="nickname" enterkeyhint="send" />
        </label>
        <button type="submit" class="year-rank-send">${sent ? '載せ直す' : '載せる'}</button>
      </form>
      <p class="year-rank-status" aria-live="polite"></p>
      <ul class="year-rank-result" hidden></ul>
      <button type="button" class="year-rank-view">みんなのランキングを見る</button>`;
    const form = box.querySelector<HTMLFormElement>('form')!;
    const input = form.querySelector<HTMLInputElement>('input')!;
    const status = box.querySelector<HTMLElement>('.year-rank-status')!;
    const result = box.querySelector<HTMLElement>('.year-rank-result')!;
    input.value = this.memo.name;
    // 入力中のキーで道具が切り替わらないようにする
    box.addEventListener('keydown', (e) => e.stopPropagation());
    box.querySelector('.year-rank-view')!.addEventListener('click', () => this.open());
    const say = (text: string, tone: '' | 'good' | 'bad' = '') => {
      status.textContent = text;
      status.dataset.tone = tone;
    };
    if (sent) say('この年はもう載っています。名前を変えて載せ直すこともできます');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = validateName(input.value);
      if (err) return say(err, 'bad');
      const btn = form.querySelector<HTMLButtonElement>('button')!;
      btn.disabled = true;
      say('送信中…');
      const payload = toPayload(this.memo, run, input.value, y);
      try {
        const res = await fetch(ENDPOINT!, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = (await res.json().catch(() => ({}))) as { error?: string; boards?: Boards };
        if (!res.ok || !data.boards) return say(errorText(data.error, res.status), 'bad');
        this.memo.name = payload.name;
        const key = sentKey(run, y.year);
        if (!this.memo.sent.includes(key)) this.memo.sent.push(key);
        saveMemo(this.memo);
        this.setBoards(data.boards);
        say('載りました！', 'good');
        btn.textContent = '載せ直す';
        result.hidden = false;
        result.replaceChildren(
          ...BOARDS.map((b) => {
            const li = document.createElement('li');
            li.innerHTML = '<span></span><b></b>';
            li.querySelector('span')!.textContent = b.label;
            li.querySelector('b')!.textContent = rankText(data.boards![b.id]);
            return li;
          }),
        );
      } catch {
        say(errorText(undefined, 0), 'bad');
      } finally {
        btn.disabled = false;
      }
    });
  }
}
