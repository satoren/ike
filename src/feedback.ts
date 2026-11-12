import './feedback.css';

/**
 * プレイヤーのフィードバック（不具合・要望・感想）。
 * アカウント無しで送れるよう、中継（feedback-worker/）に POST する。中継が溜めて毎日まとめ、開発者が管理ページで読む。
 * 中継の URL はビルド時の VITE_FEEDBACK_ENDPOINT。未設定ならボタンを出さない。
 */

export const FEEDBACK_KINDS = [
  { id: 'bug', label: '不具合' },
  { id: 'idea', label: '要望・アイデア' },
  { id: 'comment', label: '感想' },
] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]['id'];

export const MESSAGE_MAX = 2000;

export interface FeedbackPayload {
  kind: FeedbackKind;
  message: string;
  /** ゲームの状況（日付・ランクなど）。プレイヤーが外せる */
  context?: Record<string, string | number | boolean>;
  version: string;
  userAgent: string;
  screen: string;
  /** ボット避け。人には見えない欄で、埋まっていたら中継が捨てる */
  website?: string;
}

export function isFeedbackKind(v: unknown): v is FeedbackKind {
  return FEEDBACK_KINDS.some((k) => k.id === v);
}

/** 送る前の確認。問題があれば理由を返す */
export function validateFeedback(p: Pick<FeedbackPayload, 'kind' | 'message'>): string | null {
  if (!isFeedbackKind(p.kind)) return '種類を選んでください';
  const m = p.message.trim();
  if (m.length < 3) return 'もう少し詳しく書いてください';
  if (m.length > MESSAGE_MAX) return `${MESSAGE_MAX} 文字までにしてください`;
  return null;
}

export const APP_VERSION: string = (import.meta.env.VITE_APP_VERSION as string | undefined)?.slice(0, 7) || 'dev';
const ENDPOINT = import.meta.env.VITE_FEEDBACK_ENDPOINT as string | undefined;

/** 送り先が決まっていて、フォームを出せるか */
export const feedbackEnabled = (): boolean => Boolean(ENDPOINT);

type Context = () => FeedbackPayload['context'];

/** 「?」の遊び方パネルの中に置く「ご意見を送る」ボタンと、その入力画面 */
export class FeedbackDialog {
  private readonly el: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly status: HTMLElement;
  private readonly getContext: Context;

  constructor(hud: HTMLElement, getContext: Context) {
    this.getContext = getContext;

    const open = document.createElement('div');
    open.className = 'help-feedback';
    open.innerHTML = `<span>気づいたこと・ほしい機能を教えてください</span><button type="button" class="feedback-open">ご意見を送る</button>`;
    // 長い遊び方の文の下だと気づかれないので、見出しのすぐ下に置く
    const help = hud.querySelector<HTMLElement>('.help');
    const head = help?.querySelector('.help-head');
    if (head) head.after(open);
    else help?.prepend(open);

    this.el = document.createElement('div');
    this.el.className = 'feedback card';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'ご意見を送る');
    this.el.innerHTML = `
      <form>
        <div class="feedback-head"><b>ご意見を送る</b><button type="button" class="feedback-close" aria-label="閉じる">×</button></div>
        <div class="feedback-kinds" role="radiogroup" aria-label="種類">
          ${FEEDBACK_KINDS.map((k, i) => `<label><input type="radio" name="kind" value="${k.id}" ${i === 0 ? 'checked' : ''}/><span>${k.label}</span></label>`).join('')}
        </div>
        <textarea name="message" rows="5" maxlength="${MESSAGE_MAX}" placeholder="例：キツネが遊歩道の上でも客を襲っていた／池に橋をかけたい" required></textarea>
        <input class="feedback-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
        <label class="feedback-ctx"><input type="checkbox" name="ctx" checked /> ゲームの状況（日付・ランク・お金など）と端末の種類を添える</label>
        <p class="feedback-note">送った内容は開発者が読み、改善に使います。返信はできないので、名前や連絡先は書かないでください。</p>
        <div class="feedback-foot">
          <span class="feedback-status" aria-live="polite"></span>
          <button type="submit" class="feedback-send">送る</button>
        </div>
      </form>`;
    hud.append(this.el);

    this.form = this.el.querySelector('form')!;
    this.status = this.el.querySelector('.feedback-status')!;
    open.querySelector('button')!.addEventListener('click', () => {
      if (help) help.hidden = true;
      this.open();
    });
    this.el.querySelector('.feedback-close')!.addEventListener('click', () => (this.el.hidden = true));
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.send();
    });
    // 入力中のキーで道具が切り替わらないようにする
    this.el.addEventListener('keydown', (e) => e.stopPropagation());
  }

  open(): void {
    this.el.hidden = false;
    this.setStatus('');
    this.form.querySelector('textarea')!.focus();
  }

  private setStatus(text: string, tone: '' | 'good' | 'bad' = ''): void {
    this.status.textContent = text;
    this.status.dataset.tone = tone;
  }

  private payload(): FeedbackPayload {
    const f = new FormData(this.form);
    return {
      kind: f.get('kind') as FeedbackKind,
      message: String(f.get('message') ?? '').trim(),
      context: f.get('ctx') ? this.getContext() : undefined,
      version: APP_VERSION,
      userAgent: f.get('ctx') ? navigator.userAgent : '（添えない）',
      screen: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
      website: String(f.get('website') ?? ''),
    };
  }

  private async send(): Promise<void> {
    const p = this.payload();
    const err = validateFeedback(p);
    if (err) return this.setStatus(err, 'bad');

    const btn = this.form.querySelector<HTMLButtonElement>('.feedback-send')!;
    btn.disabled = true;
    this.setStatus('送信中…');
    try {
      const res = await fetch(ENDPOINT!, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (!res.ok) throw new Error(String(res.status));
      this.form.querySelector('textarea')!.value = '';
      this.setStatus('ありがとうございます！届きました', 'good');
    } catch {
      this.setStatus('送れませんでした。時間をおいて試してください', 'bad');
    } finally {
      btn.disabled = false;
    }
  }
}
