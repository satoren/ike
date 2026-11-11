import type { EcoStats } from './economy';
import { COSTS } from './economy';
import { icons } from './icons';

export type Tool = 'pan' | 'dig' | 'raise' | 'smooth' | 'tree';

const TOOLS: { id: Tool; label: string; key: string; hint: string; cost: string }[] = [
  { id: 'pan', label: '移動', key: '1', hint: '左ドラッグでカメラを動かします', cost: '' },
  { id: 'dig', label: '掘る', key: '2', hint: '水位より深く掘ると池になります', cost: `${COSTS.terraform}G/回` },
  { id: 'raise', label: '盛る', key: '3', hint: '土を盛って丘や岸を作ります', cost: `${COSTS.terraform}G/回` },
  { id: 'smooth', label: 'ならす', key: '4', hint: 'でこぼこを滑らかにします', cost: `${COSTS.terraform}G/回` },
  { id: 'tree', label: '植える', key: '5', hint: 'クリックで植樹。水辺の木ほど魅力が上がります', cost: `${COSTS.tree}G/本` },
];

const BRUSH_SIZES = [
  { label: 'S', radius: 2 },
  { label: 'M', radius: 3 },
  { label: 'L', radius: 5 },
  { label: 'XL', radius: 8 },
];

interface HudHandlers {
  onToolChange: (tool: Tool) => void;
  onBrushChange: (radius: number) => void;
}

export interface HudData extends EcoStats {
  money: number;
  day: number;
  dayProgress: number;
  trees: number;
}

type ToastKind = 'info' | 'good' | 'bad';

/**
 * 画面上の UI。運営ゲームは UI が多くなるので、three.js ではなく普通の HTML/CSS で組む。
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly buttons = new Map<Tool, HTMLButtonElement>();
  private readonly sizeButtons: HTMLButtonElement[] = [];
  private readonly hint: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly values: Record<string, HTMLElement> = {};
  private readonly dayRing: SVGCircleElement;
  private readonly handlers: HudHandlers;
  private last: Partial<HudData> = {};
  private lastKey = '';

  constructor(handlers: HudHandlers) {
    this.handlers = handlers;
    this.root = document.getElementById('hud')!;
    this.root.innerHTML = `
      <header class="topbar">
        <div class="brand card">
          <span class="brand-icon">${icons.leaf}</span>
          <span class="brand-name">池づくり</span>
          <span class="day" title="ゲーム内の 1 日が終わると入園料が入ります">
            <svg class="ring" viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r="15" class="ring-bg"/>
              <circle cx="18" cy="18" r="15" class="ring-fg"/>
            </svg>
            <span data-v="day"></span>
          </span>
        </div>
        <div class="chips">
          ${chip('money', 'coin', '資金')}
          ${chip('visitors', 'people', '来園者 / 日')}
          ${chip('appeal', 'sparkle', '景観の魅力')}
          ${chip('water', 'drop', '池の広さ')}
          ${chip('trees', 'tree', '木（うち水辺）')}
        </div>
      </header>

      <div class="toasts" aria-live="polite"></div>

      <footer class="dock-wrap">
        <p class="hint"></p>
        <nav class="dock card" aria-label="道具">
          <div class="tools"></div>
          <div class="divider"></div>
          <div class="sizes" role="group" aria-label="ブラシの大きさ">
            <span class="sizes-label">ブラシ</span>
            <div class="sizes-row"></div>
          </div>
        </nav>
      </footer>

      <button class="help-btn card" type="button" aria-label="操作方法">${icons.help}</button>
      <div class="help card" hidden>
        <div class="help-head"><b>操作方法</b><button type="button" class="help-close" aria-label="閉じる">${icons.close}</button></div>
        <dl>
          <dt>左ドラッグ</dt><dd>道具を使う（移動ではカメラ移動）</dd>
          <dt>右ドラッグ</dt><dd>カメラ移動</dd>
          <dt>中ドラッグ</dt><dd>カメラ回転</dd>
          <dt>ホイール</dt><dd>ズーム</dd>
          <dt><kbd>1</kbd>〜<kbd>5</kbd></dt><dd>道具の切り替え</dd>
          <dt><kbd>[</kbd> <kbd>]</kbd></dt><dd>ブラシの大きさ</dd>
        </dl>
      </div>
    `;
    this.root.querySelectorAll<HTMLElement>('[data-v]').forEach((el) => (this.values[el.dataset.v!] = el));
    this.dayRing = this.root.querySelector('.ring-fg')!;
    this.hint = this.root.querySelector('.hint')!;
    this.toasts = this.root.querySelector('.toasts')!;

    const tools = this.root.querySelector('.tools')!;
    for (const t of TOOLS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tool';
      b.title = `${t.label}（${t.key}）`;
      b.innerHTML = `
        <kbd>${t.key}</kbd>
        <span class="tool-icon">${icons[t.id]}</span>
        <span class="tool-label">${t.label}</span>
        <span class="tool-cost">${t.cost || '&nbsp;'}</span>`;
      b.addEventListener('click', () => handlers.onToolChange(t.id));
      tools.appendChild(b);
      this.buttons.set(t.id, b);
    }

    const sizes = this.root.querySelector('.sizes-row')!;
    for (const s of BRUSH_SIZES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'size';
      b.dataset.radius = String(s.radius);
      b.title = `半径 ${s.radius}`;
      b.innerHTML = `<i style="--d:${6 + s.radius * 1.6}px"></i><span>${s.label}</span>`;
      b.addEventListener('click', () => this.setBrush(s.radius, true));
      sizes.appendChild(b);
      this.sizeButtons.push(b);
    }

    const help = this.root.querySelector<HTMLElement>('.help')!;
    this.root.querySelector('.help-btn')!.addEventListener('click', () => (help.hidden = !help.hidden));
    this.root.querySelector('.help-close')!.addEventListener('click', () => (help.hidden = true));
  }

  setTool(tool: Tool): void {
    for (const [id, b] of this.buttons) {
      b.classList.toggle('active', id === tool);
      b.setAttribute('aria-pressed', String(id === tool));
    }
    this.hint.textContent = TOOLS.find((t) => t.id === tool)?.hint ?? '';
    this.root.querySelector('.sizes')!.classList.toggle('disabled', tool === 'pan');
  }

  /** ブラシの大きさ。プリセットにない値でも一番近いボタンを選択表示にする */
  setBrush(radius: number, notify = false): void {
    let best = this.sizeButtons[0];
    for (const b of this.sizeButtons) {
      if (Math.abs(Number(b.dataset.radius) - radius) < Math.abs(Number(best.dataset.radius) - radius)) best = b;
    }
    for (const b of this.sizeButtons) b.classList.toggle('active', b === best);
    if (notify) this.handlers.onBrushChange(radius);
  }

  /** 次に大きい／小さいプリセットへ */
  stepBrush(current: number, dir: 1 | -1): void {
    const radii = BRUSH_SIZES.map((s) => s.radius);
    const next = dir > 0 ? radii.find((r) => r > current) : [...radii].reverse().find((r) => r < current);
    if (next !== undefined) this.setBrush(next, true);
  }

  flash(message: string, kind: ToastKind = 'info'): void {
    // 同じ文言が連続したら重ねずに表示時間だけ延ばす
    const lastToast = this.toasts.lastElementChild as HTMLElement | null;
    if (lastToast && lastToast.textContent === message && !lastToast.classList.contains('out')) {
      window.clearTimeout(Number(lastToast.dataset.timer));
      lastToast.dataset.timer = String(window.setTimeout(() => this.dismiss(lastToast), 2200));
      return;
    }
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = message;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild!.remove();
    el.dataset.timer = String(window.setTimeout(() => this.dismiss(el), 2200));
  }

  private dismiss(el: HTMLElement): void {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  update(d: HudData): void {
    // 円周 2πr = 94.25 を進み具合で塗る
    this.dayRing.style.strokeDashoffset = String(94.25 * (1 - d.dayProgress));

    // 値が変わったときだけ DOM を書き換える
    const key = [d.money, d.day, d.waterCells, d.trees, d.treesNearWater, d.appeal, d.visitors].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.values.day.textContent = `${d.day}日目`;
    this.set('money', d.money, `${d.money.toLocaleString()}`, 'G');
    this.set('visitors', d.visitors, `${d.visitors}`, '人');
    this.set('appeal', d.appeal, `${d.appeal}`);
    this.set('water', d.waterCells, `${d.waterCells}`, 'マス');
    this.set('trees', d.trees, `${d.trees}`, `本 <small>(${d.treesNearWater})</small>`);
    this.last = d;
  }

  /** 数値を書き換え、増減に応じてチップを一瞬光らせる */
  private set(name: keyof HudData | 'water', value: number, text: string, unit = ''): void {
    const el = this.values[name];
    el.innerHTML = `${text}${unit ? `<span class="unit">${unit}</span>` : ''}`;
    const prevKey = name === 'water' ? 'waterCells' : name;
    const prev = this.last[prevKey as keyof HudData];
    if (typeof prev !== 'number' || prev === value) return;
    const chipEl = el.closest('.chip')!;
    chipEl.classList.remove('up', 'down');
    void (chipEl as HTMLElement).offsetWidth; // アニメーションをやり直すためのリフロー
    chipEl.classList.add(value > prev ? 'up' : 'down');
  }
}

function chip(name: string, icon: keyof typeof icons, label: string): string {
  return `
    <div class="chip card chip-${name}" title="${label}">
      <span class="chip-icon">${icons[icon]}</span>
      <span class="chip-body">
        <span class="chip-label">${label}</span>
        <span class="chip-value" data-v="${name}"></span>
      </span>
    </div>`;
}
