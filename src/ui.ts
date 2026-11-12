import { COSTS } from './economy';
import { ITEMS, ITEM_ORDER, inventoryValue, type Inventory, type ItemKind } from './ecology';
import { icons } from './icons';
import { SAFETY } from './paths';
import { SHOT_COST, TRAP_COST } from './bears';

export type Tool = 'pan' | 'dig' | 'raise' | 'smooth' | 'tree' | 'path' | 'collect' | 'trap' | 'gun';

const TOOLS: { id: Tool; label: string; key: string; hint: string; cost: string }[] = [
  { id: 'pan', label: '移動', key: '1', hint: '左ドラッグでカメラを動かします', cost: '' },
  { id: 'dig', label: '掘る', key: '2', hint: '水位より深く掘ると池になり、カモや魚が集まります', cost: `${COSTS.terraform}G/回` },
  { id: 'raise', label: '盛る', key: '3', hint: '土を盛って丘や岸を作ります', cost: `${COSTS.terraform}G/回` },
  { id: 'smooth', label: 'ならす', key: '4', hint: 'でこぼこを滑らかにします', cost: `${COSTS.terraform}G/回` },
  { id: 'tree', label: '植える', key: '5', hint: '育つと実がなります。水辺の木にはウサギやカモが集まります', cost: `${COSTS.tree}G/本` },
  {
    id: 'path',
    label: '遊歩道',
    key: '6',
    hint: '手前の出入口からつなげて敷く柵付きの道。客が安全に回れ、キツネは入れません（Shift でなぞると撤去）',
    cost: `${SAFETY.cost}G/マス`,
  },
  { id: 'collect', label: '集める', key: '7', hint: 'なぞった範囲の木の実・動物・魚をかごに入れます', cost: '無料' },
  {
    id: 'trap',
    label: '罠',
    key: '8',
    hint: 'クリックで罠を置きます。近づいたクマやキツネがかかります（1回で壊れます）',
    cost: `${TRAP_COST}G/個`,
  },
  {
    id: 'gun',
    label: '銃',
    key: '9',
    hint: 'クリックした場所を撃ちます。クマは2発、キツネは1発で狩れます',
    cost: `${SHOT_COST}G/発`,
  },
];

const ITEM_ICON: Record<ItemKind, keyof typeof icons> = {
  fruit: 'apple',
  rabbit: 'rabbit',
  duck: 'duck',
  fish: 'fish',
  fox: 'fox',
  bear: 'bear',
};

const BRUSH_SIZES = [
  { label: 'S', radius: 2 },
  { label: 'M', radius: 3 },
  { label: 'L', radius: 5 },
  { label: 'XL', radius: 8 },
];

interface HudHandlers {
  onToolChange: (tool: Tool) => void;
  onBrushChange: (radius: number) => void;
  /** かごの中身を売る。'all' はまとめて */
  onSell: (kind: ItemKind | 'all') => void;
  /** クマの居る場所を見に行く */
  onFocusBear: () => void;
}

export interface HudData {
  money: number;
  day: number;
  dayProgress: number;
  trees: number;
  /** 野外にいま居る数（果物は木に実っている数） */
  wild: Record<ItemKind, number>;
  appeal: number;
  /** 採りすぎで魅力が下がっている割合（0〜1） */
  penalty: number;
  /** 襲撃事件で魅力が下がっている割合（0〜1） */
  incidentPenalty: number;
  /** 来園者のうち遊歩道で安全に回れる割合（0〜1） */
  safety: number;
  /** 出入口とつながった遊歩道のマス数 */
  pathCells: number;
  /** 敷いてある遊歩道の総マス数 */
  pathCellsTotal: number;
  visitors: number;
  waterCells: number;
  treesNearWater: number;
  inventory: Inventory;
  /** いま出没しているクマの数 */
  bears: number;
  traps: number;
}

type ToastKind = 'info' | 'good' | 'bad';
type ChipName = 'money' | 'visitors' | 'appeal' | 'safety' | 'water' | 'trees';

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
  private readonly basketRows = new Map<ItemKind, HTMLElement>();
  private readonly sellAll: HTMLButtonElement;
  private readonly handlers: HudHandlers;
  private lastNums: Partial<Record<ChipName, number>> = {};
  private lastKey = '';

  constructor(handlers: HudHandlers) {
    this.handlers = handlers;
    this.root = document.getElementById('hud')!;
    this.root.innerHTML = `
      <header class="topbar">
        <div class="brand card">
          <span class="brand-icon">${icons.leaf}</span>
          <span class="brand-name">池づくり</span>
          <span class="day" title="ゲーム内の日数">
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
          ${chip('safety', 'shield', '客の安全（遊歩道）')}
          ${chip('water', 'drop', '池の広さ')}
          ${chip('trees', 'tree', '木（うち水辺）')}
        </div>
      </header>

      <aside class="basket card" aria-label="かご">
        <div class="basket-head">
          <span class="basket-icon">${icons.collect}</span>
          <b>かご</b>
          <span class="basket-hint">いま居る数 / かご</span>
        </div>
        <ul class="basket-list"></ul>
        <button type="button" class="sell-all"></button>
      </aside>

      <div class="bear-alert" hidden role="alert">
        <span class="bear-alert-icon">${icons.alert}</span>
        <span><b>クマ出没中</b> <span data-v="bears"></span> 罠か銃で狩ってください</span>
        <button type="button" class="bear-focus">見に行く</button>
      </div>

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
        <div class="help-head"><b>遊び方</b><button type="button" class="help-close" aria-label="閉じる">${icons.close}</button></div>
        <p class="help-text">池を掘り、木を植えて自然を育てましょう。実った果物や集まってきた生き物を「集める」でかごに入れて売るとお金になります。ただし採りすぎると景観の魅力が下がり、入園料が減ります。ウサギが増えるとキツネもやってきます。来園者が襲われると魅力が大きく下がります。来園者は手前の出入口から入って帰ります。出入口から柵付きの遊歩道をつなげて、来園者の数に見合うだけ敷けば、客は安全に回れて魅力も上がります（つながっていない道は灰色になり、使われません）。ときどきクマが現れ、柵と道を壊して来園者を襲います。罠を仕掛けるか銃で狩りましょう。</p>
        <dl>
          <dt>左ドラッグ</dt><dd>道具を使う（移動ではカメラ移動）</dd>
          <dt>右ドラッグ</dt><dd>カメラ移動</dd>
          <dt>中ドラッグ</dt><dd>カメラ回転</dd>
          <dt>ホイール</dt><dd>ズーム</dd>
          <dt>Shift+ドラッグ</dt><dd>遊歩道を撤去</dd>
          <dt><kbd>1</kbd>〜<kbd>9</kbd></dt><dd>道具の切り替え</dd>
          <dt><kbd>[</kbd> <kbd>]</kbd></dt><dd>ブラシの大きさ</dd>
        </dl>
      </div>
    `;
    this.root.querySelectorAll<HTMLElement>('[data-v]').forEach((el) => (this.values[el.dataset.v!] = el));
    this.dayRing = this.root.querySelector('.ring-fg')!;
    this.hint = this.root.querySelector('.hint')!;
    this.toasts = this.root.querySelector('.toasts')!;

    // 道具
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

    // ブラシの大きさ
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

    // かご
    const list = this.root.querySelector('.basket-list')!;
    for (const kind of ITEM_ORDER) {
      const info = ITEMS[kind];
      const li = document.createElement('li');
      li.className = `basket-row item-${kind}`;
      li.innerHTML = `
        <span class="item-icon">${icons[ITEM_ICON[kind]]}</span>
        <span class="item-name">${info.name}<small>${info.price}G</small></span>
        <span class="item-wild" data-wild title="野外にいま居る数">0</span>
        <span class="item-count" data-count>0</span>
        <button type="button" class="sell" title="${info.name}を売る">売る</button>`;
      li.querySelector('.sell')!.addEventListener('click', () => handlers.onSell(kind));
      list.appendChild(li);
      this.basketRows.set(kind, li);
    }
    this.sellAll = this.root.querySelector('.sell-all')!;
    this.sellAll.addEventListener('click', () => handlers.onSell('all'));

    this.root.querySelector('.bear-focus')!.addEventListener('click', () => handlers.onFocusBear());

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
    const inv = d.inventory;
    const key = [
      d.money, d.day, d.visitors, d.appeal, Math.round(d.penalty * 100), Math.round(d.incidentPenalty * 100), Math.round(d.safety * 100), d.pathCells, d.pathCellsTotal, d.waterCells, d.trees, d.treesNearWater,
      ...ITEM_ORDER.map((k) => `${inv[k]}/${d.wild[k]}`), d.bears, d.traps,
    ].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.values.day.textContent = `${d.day}日目`;
    const alert = this.root.querySelector<HTMLElement>('.bear-alert')!;
    alert.hidden = d.bears === 0;
    this.values.bears.textContent = `${d.bears}頭`;
    this.set('money', d.money, d.money.toLocaleString(), 'G');
    this.set('visitors', d.visitors, String(d.visitors), '人');
    const pct = Math.round(d.penalty * 100);
    const inc = Math.round(d.incidentPenalty * 100);
    const notes = [
      inc >= 3 ? `<em class="penalty">事件 -${inc}%</em>` : '',
      pct >= 3 ? `<em class="penalty">採りすぎ -${pct}%</em>` : '',
    ].join('');
    this.set('appeal', d.appeal, String(d.appeal), notes);
    this.values.appeal.closest('.chip')!.classList.toggle('stressed', pct >= 3 || inc >= 3);
    const safe = Math.round(d.safety * 100);
    const loose = d.pathCellsTotal - d.pathCells;
    this.set(
      'safety',
      safe,
      String(safe),
      `% <small>(${d.pathCells}マス)</small>${loose > 0 ? `<em class="penalty">未接続 ${loose}マス</em>` : ''}`,
    );
    this.values.safety.closest('.chip')!.classList.toggle('stressed', safe < 50);
    this.set('water', d.waterCells, String(d.waterCells), 'マス');
    this.set('trees', d.trees, String(d.trees), `本 <small>(${d.treesNearWater})</small>`);

    for (const kind of ITEM_ORDER) {
      const row = this.basketRows.get(kind)!;
      const n = inv[kind];
      row.querySelector<HTMLElement>('[data-wild]')!.textContent = String(d.wild[kind]);
      const countEl = row.querySelector<HTMLElement>('[data-count]')!;
      if (countEl.textContent !== String(n)) {
        countEl.textContent = String(n);
        row.classList.remove('pop');
        void row.offsetWidth;
        row.classList.add('pop');
      }
      row.classList.toggle('empty', n === 0);
    }
    const total = inventoryValue(inv);
    this.sellAll.disabled = total === 0;
    this.sellAll.innerHTML = total > 0 ? `まとめて売る <b>+${total.toLocaleString()}G</b>` : 'かごは空です';
  }

  /** 数値を書き換え、増減に応じてチップを一瞬光らせる */
  private set(name: ChipName, value: number, text: string, unit = ''): void {
    const el = this.values[name];
    el.innerHTML = `${text}${unit ? `<span class="unit">${unit}</span>` : ''}`;
    const prev = this.lastNums[name];
    this.lastNums[name] = value;
    if (prev === undefined || prev === value) return;
    const chipEl = el.closest('.chip') as HTMLElement;
    chipEl.classList.remove('up', 'down');
    void chipEl.offsetWidth; // アニメーションをやり直すためのリフロー
    chipEl.classList.add(value > prev ? 'up' : 'down');
  }
}

function chip(name: ChipName, icon: keyof typeof icons, label: string): string {
  return `
    <div class="chip card chip-${name}" title="${label}">
      <span class="chip-icon">${icons[icon]}</span>
      <span class="chip-body">
        <span class="chip-label">${label}</span>
        <span class="chip-value" data-v="${name}"></span>
      </span>
    </div>`;
}
