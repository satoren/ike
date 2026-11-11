import type { EcoStats } from './economy';

export type Tool = 'pan' | 'dig' | 'raise' | 'smooth' | 'tree';

const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  { id: 'pan', label: '移動', key: '1', hint: '左ドラッグでカメラを動かす' },
  { id: 'dig', label: '掘る', key: '2', hint: '地下水位より深く掘ると池になる' },
  { id: 'raise', label: '盛る', key: '3', hint: '土を盛って丘や岸を作る' },
  { id: 'smooth', label: 'ならす', key: '4', hint: 'でこぼこを滑らかにする' },
  { id: 'tree', label: '木を植える', key: '5', hint: 'クリックで植樹。水辺の木は魅力が高い' },
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

/**
 * 画面上の UI。運営ゲームは UI が多くなるので、three.js ではなく普通の HTML/CSS で組む。
 */
export class Hud {
  private readonly buttons = new Map<Tool, HTMLButtonElement>();
  private readonly brush: HTMLInputElement;
  private readonly brushValue: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly fields: Record<string, HTMLElement> = {};
  private readonly dayBar: HTMLElement;
  private readonly handlers: HudHandlers;
  private toastTimer = 0;
  private last = '';

  constructor(handlers: HudHandlers) {
    this.handlers = handlers;
    const root = document.getElementById('hud')!;
    root.innerHTML = `
      <section class="panel stats">
        <h1>池づくり</h1>
        <dl>
          <dt>資金</dt><dd data-f="money"></dd>
          <dt>日数</dt><dd><span data-f="day"></span><span class="daybar"><i></i></span></dd>
          <dt>池の広さ</dt><dd data-f="water"></dd>
          <dt>木</dt><dd data-f="trees"></dd>
          <dt>景観の魅力</dt><dd data-f="appeal"></dd>
          <dt>来園者</dt><dd data-f="visitors"></dd>
        </dl>
      </section>
      <section class="panel toolbar">
        <div class="tools"></div>
        <label class="brush">ブラシ <input type="range" min="1" max="10" step="1"> <span></span></label>
        <p class="hint"></p>
      </section>
      <div class="toast" hidden></div>
      <p class="help">右ドラッグ: 移動 / 中ドラッグ: 回転 / ホイール: ズーム / 1〜5: 道具 / [ ]: ブラシ</p>
    `;
    root.querySelectorAll<HTMLElement>('[data-f]').forEach((el) => (this.fields[el.dataset.f!] = el));
    this.dayBar = root.querySelector('.daybar i')!;
    this.hint = root.querySelector('.hint')!;
    this.toast = root.querySelector('.toast')!;
    this.brush = root.querySelector('.brush input')!;
    this.brushValue = root.querySelector('.brush span')!;
    this.brush.addEventListener('input', () => this.setBrush(Number(this.brush.value), true));

    const tools = root.querySelector('.tools')!;
    for (const t of TOOLS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<kbd>${t.key}</kbd>${t.label}`;
      b.addEventListener('click', () => handlers.onToolChange(t.id));
      tools.appendChild(b);
      this.buttons.set(t.id, b);
    }
  }

  setTool(tool: Tool): void {
    for (const [id, b] of this.buttons) b.classList.toggle('active', id === tool);
    this.hint.textContent = TOOLS.find((t) => t.id === tool)?.hint ?? '';
  }

  setBrush(radius: number, notify = false): void {
    this.brush.value = String(radius);
    this.brushValue.textContent = String(radius);
    if (notify) this.handlers.onBrushChange(radius);
  }

  flash(message: string): void {
    this.toast.textContent = message;
    this.toast.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast.hidden = true), 2200);
  }

  update(d: HudData): void {
    this.dayBar.style.width = `${(d.dayProgress * 100).toFixed(1)}%`;
    // 値が変わったときだけ DOM を書き換える
    const key = [d.money, d.day, d.waterCells, d.trees, d.appeal, d.visitors].join('|');
    if (key === this.last) return;
    this.last = key;
    this.fields.money.textContent = `${d.money.toLocaleString()} G`;
    this.fields.day.textContent = `${d.day} 日目`;
    this.fields.water.textContent = `${d.waterCells} マス`;
    this.fields.trees.textContent = `${d.trees} 本（水辺 ${d.treesNearWater}）`;
    this.fields.appeal.textContent = String(d.appeal);
    this.fields.visitors.textContent = `${d.visitors} 人/日`;
  }
}
