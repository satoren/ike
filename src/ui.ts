import { COSTS } from './economy';
import { ITEMS, ITEM_ORDER, inventoryValue, type Inventory, type ItemKind } from './ecology';
import { icons } from './icons';
import { SAFETY } from './paths';
import { SHOT_COST, TRAP_COST } from './bears';
import { WEED } from './foodweb';
import { FACILITIES, FACILITY_ORDER, type FacilityKind } from './facilities';

export type Tool = 'pan' | 'dig' | 'raise' | 'smooth' | 'tree' | 'path' | 'collect' | 'trap' | 'gun' | 'weed' | 'build';

/** 狭い（縦持ちのスマホ）または低い（横持ち）画面。パネルを畳んで地図を広く見せる */
export const COMPACT_QUERY = '(max-width: 640px), (max-height: 500px)';

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
    hint: '手前の出入口からつなげて敷く柵付きの道。客が安全に回れ、キツネは入れません（Shift か「撤去」でなぞると撤去）',
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
  {
    id: 'weed',
    label: '水草',
    key: '0',
    hint: '池の中に植えます。育つと魚のすみかになって魚が増え、魚を食べにカワセミやサギが来ます。魚を採りすぎると鳥は去ります',
    cost: `${WEED.cost}G/株`,
  },
  {
    id: 'build',
    label: '施設',
    key: '-',
    hint: '遊歩道のすぐ横に施設を建てます。園のランクが上がると建てられる施設が増えます（「撤去」で取り壊すと半額戻ります）',
    cost: '300G〜',
  },
];

/** 道具を種類ごとにまとめたもの。ドックにはまとまりごとに 1 つのボタンを置く */
const GROUPS: { id: string; label: string; tools: Tool[] }[] = [
  { id: 'move', label: '移動', tools: ['pan'] },
  { id: 'land', label: '地形', tools: ['dig', 'raise', 'smooth'] },
  { id: 'nature', label: '自然', tools: ['tree', 'weed'] },
  { id: 'build', label: '建てる', tools: ['path', 'build'] },
  { id: 'collect', label: '集める', tools: ['collect'] },
  { id: 'hunt', label: '狩り', tools: ['trap', 'gun'] },
];

const groupOf = (tool: Tool) => GROUPS.find((g) => g.tools.includes(tool))!;
const toolInfo = (tool: Tool) => TOOLS.find((t) => t.id === tool)!;

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
  /** 夜間営業の切り替え */
  onToggleNight: () => void;
  /** 保存データを消して最初からやり直す */
  onReset: () => void;
  /** 遊歩道の「撤去」モードの切り替え（タッチでは Shift が使えないため） */
  onPathErase: (on: boolean) => void;
  /** 建てる施設の切り替え */
  onFacilityChange: (kind: FacilityKind) => void;
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
  /** 暗さ（0 = 昼、1 = 夜） */
  darkness: number;
  /** ライトアップして夜も営業しているか */
  nightOpen: boolean;
  /** 夜の部の来園者数（営業していなければ 0） */
  nightVisitors: number;
  /** 一晩の電気代 */
  lightingCost: number;
}

type ToastKind = 'info' | 'good' | 'bad';
type ChipName = 'money' | 'visitors' | 'appeal' | 'safety' | 'water' | 'trees';

/**
 * 画面上の UI。運営ゲームは UI が多くなるので、three.js ではなく普通の HTML/CSS で組む。
 */
export class Hud {
  private readonly root: HTMLElement;
  /** まとまりごとのボタン */
  private readonly buttons = new Map<string, HTMLButtonElement>();
  /** まとまりの中の道具を選ぶボタン（選んでいるまとまりの分だけ出す） */
  private readonly subtools: HTMLElement;
  /** まとまりごとに最後に使った道具（ボタンを押すとそれに戻る） */
  private readonly lastInGroup = new Map<string, Tool>();
  private readonly sizeButtons: HTMLButtonElement[] = [];
  private readonly hint: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly values: Record<string, HTMLElement> = {};
  private readonly dayRing: SVGCircleElement;
  private readonly basketRows = new Map<ItemKind, HTMLElement>();
  private readonly sellAll: HTMLButtonElement;
  private readonly basketSum: HTMLElement;
  private readonly pathErase: HTMLButtonElement;
  private readonly nightToggle: HTMLButtonElement;
  private readonly facilityButtons = new Map<FacilityKind, HTMLButtonElement>();
  private tool: Tool = 'pan';
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
          <button type="button" class="night-toggle" aria-pressed="false">
            <span class="night-icon">${icons.moon}</span>
            <span class="night-label">夜間営業</span>
          </button>
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
        <button type="button" class="basket-head" aria-expanded="true">
          <span class="basket-icon">${icons.collect}</span>
          <b>かご</b>
          <span class="basket-hint">いま居る数 / かご</span>
          <span class="basket-sum"></span>
          <span class="basket-toggle" aria-hidden="true"></span>
        </button>
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
        <div class="subtools card" role="group" hidden></div>
        <nav class="dock card" aria-label="道具">
          <div class="tools"></div>
          <div class="divider"></div>
          <div class="sizes" role="group" aria-label="ブラシの大きさ">
            <span class="sizes-label">ブラシ</span>
            <div class="sizes-row"></div>
            <div class="facility-row" hidden></div>
            <button type="button" class="path-erase" aria-pressed="false" hidden>撤去</button>
          </div>
        </nav>
      </footer>

      <button class="help-btn card" type="button" aria-label="操作方法">${icons.help}</button>
      <button class="map-btn card" type="button" aria-pressed="false" aria-label="パネルを隠して地図を広く見る" title="パネルを隠す">${icons.expand}</button>
      <div class="help card" hidden>
        <div class="help-head"><b>遊び方</b><button type="button" class="help-close" aria-label="閉じる">${icons.close}</button></div>
        <p class="help-text">池を掘り、木を植えて自然を育てましょう。実った果物や集まってきた生き物を「集める」でかごに入れて売るとお金になります。ただし採りすぎると景観の魅力が下がり、入園料が減ります。ウサギが増えるとキツネもやってきます。来園者が襲われると魅力が大きく下がります。来園者は手前の出入口から入って帰ります。出入口から柵付きの遊歩道をつなげて、来園者の数に見合うだけ敷けば、客は安全に回れて魅力も上がります（つながっていない道は灰色になり、使われません）。ときどきクマが現れ、柵と道を壊して来園者を襲います。罠を仕掛けるか銃で狩りましょう。夜には密猟者が忍び込んで魚や動物を盗んでいきます。紫の目印の人を「集める」でなぞると捕まえられ、報奨金がもらえます。来園者に見つかると逃げ出すので、遊歩道を広く巡らせておくと被害を減らせます。かごの下の「駆除係」で係を雇うと、日給と引き換えに園内を巡回し、クマを撃ち、キツネや密猟者を捕まえてくれます（給料が払えないと辞めてしまいます）。左上の「夜間営業」で遊歩道をライトアップすると夜も客が来て入園料が増えますが、電気代がかかり、夜行性のキツネが寄ってきて遊歩道の外が危険になります。水辺の木を増やし、池を深くして荒らさずにいると、ホタルやオオサンショウウオがまれに現れて話題になり、来園者が一気に増えます（捕まえることはできません）。左上の★は園のランクです。押すと次のランクへの目標が見られます。目標を全部達成するとランクが上がり、賞金がもらえて入園料が上がり、休憩所・売店・展望台などの施設を「施設」で遊歩道のそばに建てられるようになります。本のボタンの「生き物図鑑」には、園に現れた生き物が載ります。浅瀬、池の中の小島、木を寄せて植えた林、遊歩道から離れた静かな林など、場所を作り分けると、そこを好む新しい生き物が現れます。まだ見つけていない生き物はヒントだけが載っています。見つけるたびにボーナスがもらえ、評判が広まって来園者が増えます。</p>
        <dl class="help-mouse">
          <dt>左ドラッグ</dt><dd>道具を使う（移動ではカメラ移動）</dd>
          <dt>右ドラッグ</dt><dd>カメラ移動</dd>
          <dt>中ドラッグ</dt><dd>カメラ回転</dd>
          <dt>ホイール</dt><dd>ズーム</dd>
          <dt>Shift+ドラッグ</dt><dd>遊歩道を撤去</dd>
        </dl>
        <dl class="help-touch">
          <dt>1本指</dt><dd>道具を使う（移動ではカメラ移動）</dd>
          <dt>2本指ドラッグ</dt><dd>カメラ移動（移動では回転）</dd>
          <dt>ピンチ</dt><dd>ズーム</dd>
          <dt>撤去ボタン</dt><dd>遊歩道を撤去</dd>
        </dl>
        <dl class="help-keys">
          <dt><kbd>1</kbd>〜<kbd>0</kbd> <kbd>-</kbd></dt><dd>道具の切り替え</dd>
          <dt><kbd>[</kbd> <kbd>]</kbd></dt><dd>ブラシの大きさ</dd>
          <dt><kbd>T</kbd></dt><dd>時間の速さ（ゆっくり・ふつう・はやい）</dd>
        </dl>
        <div class="help-save">
          <span>進捗はこのブラウザに自動で保存されます</span>
          <button type="button" class="reset">最初からやり直す</button>
        </div>
      </div>
    `;
    this.root.querySelectorAll<HTMLElement>('[data-v]').forEach((el) => (this.values[el.dataset.v!] = el));
    this.dayRing = this.root.querySelector('.ring-fg')!;
    this.hint = this.root.querySelector('.hint')!;
    this.toasts = this.root.querySelector('.toasts')!;

    // 道具：まとまりごとのボタン。押すと、そのまとまりで最後に使った道具になる
    const tools = this.root.querySelector('.tools')!;
    for (const g of GROUPS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `tool${g.tools.length > 1 ? ' has-sub' : ''}`;
      b.addEventListener('click', () => handlers.onToolChange(this.lastInGroup.get(g.id) ?? g.tools[0]));
      tools.appendChild(b);
      this.buttons.set(g.id, b);
    }
    this.subtools = this.root.querySelector('.subtools')!;
    // ドック（と上の吹き出し・道具の中身）の高さは道具で変わる。
    // 狭い画面ではその上にパネルを積むので、ドックの上端の位置を CSS に渡す
    const dockWrap = this.root.querySelector<HTMLElement>('.dock-wrap')!;
    const syncDockTop = () =>
      this.root.style.setProperty('--dock-top', `${Math.round(window.innerHeight - dockWrap.getBoundingClientRect().top)}px`);
    new ResizeObserver(syncDockTop).observe(dockWrap);
    window.addEventListener('resize', syncDockTop);

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

    // 施設の選択
    const facilityRow = this.root.querySelector('.facility-row')!;
    for (const kind of FACILITY_ORDER) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'facility';
      b.addEventListener('click', () => handlers.onFacilityChange(kind));
      facilityRow.appendChild(b);
      this.facilityButtons.set(kind, b);
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
    this.basketSum = this.root.querySelector('.basket-sum')!;
    // 狭い・低い画面ではかごを畳んでおき、押すと広げる（地図を広く見せるため）
    const basket = this.root.querySelector<HTMLElement>('.basket')!;
    const basketHead = basket.querySelector<HTMLButtonElement>('.basket-head')!;
    const compact = window.matchMedia(COMPACT_QUERY).matches;
    basket.classList.toggle('collapsed', compact);
    basketHead.setAttribute('aria-expanded', String(!compact));
    basketHead.addEventListener('click', () => {
      const collapsed = basket.classList.toggle('collapsed');
      basketHead.setAttribute('aria-expanded', String(!collapsed));
    });

    this.pathErase = this.root.querySelector('.path-erase')!;
    this.pathErase.addEventListener('click', () => this.setPathErase(this.pathErase.getAttribute('aria-pressed') !== 'true'));

    this.nightToggle = this.root.querySelector('.night-toggle')!;
    this.nightToggle.addEventListener('click', () => handlers.onToggleNight());
    this.root.querySelector('.bear-focus')!.addEventListener('click', () => handlers.onFocusBear());
    this.root.querySelector('.reset')!.addEventListener('click', () => handlers.onReset());

    // 地図を広く見たいときは、数字やかごなどのパネルを隠す（道具とこのボタンは残す）
    const mapBtn = this.root.querySelector<HTMLButtonElement>('.map-btn')!;
    mapBtn.addEventListener('click', () => {
      const on = this.root.classList.toggle('map-mode');
      mapBtn.setAttribute('aria-pressed', String(on));
      mapBtn.title = on ? 'パネルを表示' : 'パネルを隠す';
      mapBtn.innerHTML = on ? icons.shrink : icons.expand;
    });

    const help = this.root.querySelector<HTMLElement>('.help')!;
    this.root.querySelector('.help-btn')!.addEventListener('click', () => (help.hidden = !help.hidden));
    this.root.querySelector('.help-close')!.addEventListener('click', () => (help.hidden = true));
  }

  setTool(tool: Tool): void {
    const group = groupOf(tool);
    this.lastInGroup.set(group.id, tool);
    for (const g of GROUPS) {
      const b = this.buttons.get(g.id)!;
      const t = toolInfo(this.lastInGroup.get(g.id) ?? g.tools[0]);
      const active = g === group;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
      b.title = g.tools.length > 1 ? `${g.label}：${g.tools.map((id) => toolInfo(id).label).join('・')}` : `${t.label}（${t.key}）`;
      // まとまりのボタンには、いま選ばれている（押すと使う）道具を出す
      b.innerHTML = `
        <kbd>${t.key}</kbd>
        <span class="tool-icon">${icons[t.id]}</span>
        <span class="tool-label">${g.tools.length > 1 ? g.label : t.label}</span>
        <span class="tool-cost">${g.tools.length > 1 ? t.label : t.cost || '&nbsp;'}</span>`;
    }
    // 複数の道具があるまとまりを選んだら、その中の道具をドックの上に並べる
    this.subtools.hidden = group.tools.length < 2;
    this.subtools.setAttribute('aria-label', group.label);
    this.subtools.innerHTML = '';
    for (const id of group.tools) {
      const t = toolInfo(id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `subtool${id === tool ? ' active' : ''}`;
      b.setAttribute('aria-pressed', String(id === tool));
      b.title = `${t.label}（${t.key}）`;
      b.innerHTML = `${icons[id]}<span>${t.label}</span><small>${t.cost}</small>`;
      b.addEventListener('click', () => this.handlers.onToolChange(id));
      this.subtools.appendChild(b);
    }
    this.hint.textContent = TOOLS.find((t) => t.id === tool)?.hint ?? '';
    this.root.querySelector('.sizes')!.classList.toggle('disabled', tool === 'pan');
    // 施設のときはブラシの代わりに建てる施設を選ぶ
    const building = tool === 'build';
    this.root.querySelector<HTMLElement>('.sizes-row')!.hidden = building;
    this.root.querySelector<HTMLElement>('.facility-row')!.hidden = !building;
    this.root.querySelector<HTMLElement>('.sizes-label')!.textContent = building ? '建てる施設' : 'ブラシ';
    const erasable = tool === 'path' || building;
    this.pathErase.hidden = !erasable;
    if (tool !== this.tool) this.setPathErase(false);
    this.tool = tool;
  }

  /** 施設の選択肢を、選んでいるものと解放の状態に合わせて描き直す */
  setFacilities(selected: FacilityKind, lockedBy: Partial<Record<FacilityKind, number>>): void {
    for (const [kind, b] of this.facilityButtons) {
      const info = FACILITIES[kind];
      const lock = lockedBy[kind];
      b.classList.toggle('active', kind === selected && lock === undefined);
      b.classList.toggle('locked', lock !== undefined);
      b.setAttribute('aria-pressed', String(kind === selected));
      b.title = lock !== undefined ? `${info.name}：★${lock}で解放` : `${info.name}（${info.cost}G）：${info.hint}`;
      b.innerHTML = `${lock !== undefined ? icons.lock : icons[kind]}<span>${info.name}</span><small>${lock !== undefined ? `★${lock}で解放` : `${info.cost}G`}</small>`;
    }
    if (this.tool === 'build') {
      const lock = lockedBy[selected];
      this.hint.textContent = lock !== undefined
        ? `${FACILITIES[selected].name}は園のランクが★${lock}になると建てられます`
        : `${FACILITIES[selected].name}：${FACILITIES[selected].hint}`;
    }
  }

  private setPathErase(on: boolean): void {
    this.pathErase.setAttribute('aria-pressed', String(on));
    this.pathErase.classList.toggle('active', on);
    this.handlers.onPathErase(on);
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
    this.root.querySelector('.brand')!.classList.toggle('is-night', d.darkness >= 0.5);

    // 値が変わったときだけ DOM を書き換える
    const inv = d.inventory;
    const key = [
      d.money, d.day, d.visitors, d.appeal, Math.round(d.penalty * 100), Math.round(d.incidentPenalty * 100), Math.round(d.safety * 100), d.pathCells, d.pathCellsTotal, d.waterCells, d.trees, d.treesNearWater,
      ...ITEM_ORDER.map((k) => `${inv[k]}/${d.wild[k]}`), d.bears, d.traps, d.nightOpen, d.nightVisitors, d.lightingCost,
    ].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.values.day.textContent = `${d.day}日目`;
    const alert = this.root.querySelector<HTMLElement>('.bear-alert')!;
    alert.hidden = d.bears === 0;
    this.values.bears.textContent = `${d.bears}頭`;
    this.set('money', d.money, d.money.toLocaleString(), 'G');
    this.set('visitors', d.visitors, String(d.visitors), `人${d.nightOpen ? ` <small>+夜${d.nightVisitors}</small>` : ''}`);
    this.nightToggle.classList.toggle('active', d.nightOpen);
    this.nightToggle.setAttribute('aria-pressed', String(d.nightOpen));
    this.nightToggle.title = d.nightOpen
      ? `夜間営業中：夜の部 ${d.nightVisitors}人、電気代 ${d.lightingCost}G/晩。夜はキツネが寄ってきて危険が増します（クリックでやめる）`
      : `ライトアップして夜も営業する（電気代 ${d.lightingCost}G/晩）。客は増えますが、夜行性のキツネも寄ってきます`;
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
    this.basketSum.textContent = total > 0 ? `+${total.toLocaleString()}G` : '';
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
