import { COSTS } from './economy';
import { ITEMS, ITEM_ORDER, type Inventory, type ItemKind } from './ecology';
import type { Market, Trend } from './market';
import { icons } from './icons';
import { SAFETY } from './paths';
import { SHOT_COST, TRAP_COST } from './bears';
import { WEED } from './foodweb';
import { FACILITIES, FACILITY_ORDER, type FacilityKind } from './facilities';
import { DECOR } from './decor';
import type { DailyCosts } from './upkeep';
import { changeLocale, locale, LOCALE_NAMES, LOCALES, t, type Locale } from './i18n';

export type Tool =
  | 'pan'
  | 'dig'
  | 'raise'
  | 'smooth'
  | 'tree'
  | 'path'
  | 'collect'
  | 'trap'
  | 'gun'
  | 'weed'
  | 'build'
  | 'flower'
  | 'rock';

/** 狭い（縦持ちのスマホ）または低い（横持ち）画面。パネルを畳んで地図を広く見せる */
export const COMPACT_QUERY = '(max-width: 640px), (max-height: 500px)';

const TOOLS: { id: Tool; label: string; key: string; hint: string; cost: string }[] = [
  { id: 'pan', label: t('移動'), key: '1', hint: t('左ドラッグでカメラを動かします'), cost: '' },
  { id: 'dig', label: t('掘る'), key: '2', hint: t('水位より深く掘ると池になり、カモや魚が集まります'), cost: t('{0}G/回', COSTS.terraform) },
  { id: 'raise', label: t('盛る'), key: '3', hint: t('土を盛って丘や岸を作ります'), cost: t('{0}G/回', COSTS.terraform) },
  { id: 'smooth', label: t('ならす'), key: '4', hint: t('でこぼこを滑らかにします'), cost: t('{0}G/回', COSTS.terraform) },
  { id: 'tree', label: t('植える'), key: '5', hint: t('育つと実がなります。水辺の木にはウサギやカモが集まります'), cost: t('{0}G/本', COSTS.tree) },
  {
    id: 'path',
    label: t('遊歩道'),
    key: '6',
    hint: t('手前の出入口からつなげて敷く柵付きの道。客が安全に回れ、キツネは入れません（Shift か「撤去」でなぞると撤去）。道の色は眺めのよさです。見えるものの種類が多い道ほど魅力が上がります'),
    cost: t('{0}G/マス', SAFETY.cost),
  },
  { id: 'collect', label: t('集める'), key: '7', hint: t('なぞった範囲の木の実・動物・魚をかごに入れます'), cost: t('無料') },
  {
    id: 'trap',
    label: t('罠'),
    key: '8',
    hint: t('クリックで罠を置きます。クマは林や水辺を通るので、足跡の続く獣道に先回りして仕掛けます。クマの近くや遊歩道の上には置けず、道のすぐ脇だと来園者がかかります（1回で壊れます）'),
    cost: t('{0}G/個', TRAP_COST),
  },
  {
    id: 'gun',
    label: t('銃'),
    key: '9',
    hint: t('クリックした場所を撃ちます。クマは2発、キツネは1発で狩れます'),
    cost: t('{0}G/発', SHOT_COST),
  },
  {
    id: 'weed',
    label: t('水草'),
    key: '0',
    hint: t('池の中に植えます。育つと魚のすみかになって魚が増え、魚を食べにカワセミやサギが来ます。魚を採りすぎると鳥は去ります'),
    cost: t('{0}G/株', WEED.cost),
  },
  {
    id: 'flower',
    label: t('花畑'),
    key: 'F',
    hint: t('遊歩道の近くに植えると、道からの眺めに「花畑」が加わります。同じものを並べても増えないので、足りない道のそばに（「撤去」で片づけ）'),
    cost: t('{0}G/か所', DECOR.flower.cost),
  },
  {
    id: 'rock',
    label: t('岩'),
    key: 'R',
    hint: t('遊歩道の近くに置くと、道からの眺めに「岩」が加わります。陸にも、池の浅いところにも置けます（「撤去」で片づけ）'),
    cost: t('{0}G/個', DECOR.rock.cost),
  },
  {
    id: 'build',
    label: t('施設'),
    key: '-',
    hint: t('遊歩道のすぐ横に施設を建てます。園のランクが上がると建てられる施設が増えます（「撤去」で取り壊すと半額戻ります）'),
    cost: t('{0}G〜', 300),
  },
];

/** 道具を種類ごとにまとめたもの。ドックにはまとまりごとに 1 つのボタンを置く */
const GROUPS: { id: string; label: string; tools: Tool[] }[] = [
  { id: 'move', label: t('移動'), tools: ['pan'] },
  { id: 'land', label: t('地形'), tools: ['dig', 'raise', 'smooth'] },
  { id: 'nature', label: t('自然'), tools: ['tree', 'weed', 'flower', 'rock'] },
  { id: 'build', label: t('建てる'), tools: ['path', 'build'] },
  { id: 'collect', label: t('集める'), tools: ['collect'] },
  { id: 'hunt', label: t('狩り'), tools: ['trap', 'gun'] },
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
  /** はじめの案内を最初からやり直す */
  onGuideRestart: () => void;
  /** 去年のまとめを見返す */
  onYearReview: () => void;
  /** 遊歩道の「撤去」モードの切り替え（タッチでは Shift が使えないため） */
  onPathErase: (on: boolean) => void;
  /** 建てる施設の切り替え */
  onFacilityChange: (kind: FacilityKind) => void;
}

const TREND_MARK: Record<Trend, string> = { hot: ' ▲', cheap: ' ▼', glut: ' ▼', flat: '' };
const TREND_TITLE: Record<Trend, string> = {
  hot: t('きょうは高く売れます'),
  cheap: t('きょうは安値です。急がなければ待ちましょう'),
  glut: t('売りすぎて値下がりしています。日がたつと戻ります'),
  flat: t('きょうの売値'),
};

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
  /** 相場（きょうの売値と、あすの高値） */
  market: Market;
  /** いま出没しているクマの数 */
  bears: number;
  /** 翌日クマが現れる足跡が見つかっている */
  bearSign: boolean;
  traps: number;
  /** 暗さ（0 = 昼、1 = 夜） */
  darkness: number;
  /** ライトアップして夜も営業しているか */
  nightOpen: boolean;
  /** 夜の部の来園者数（営業していなければ 0） */
  nightVisitors: number;
  /** 一晩の電気代 */
  lightingCost: number;
  /** いまの来園者で見積もった、きょうの人件費と維持費 */
  costs: DailyCosts;
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
  private readonly marketNote: HTMLElement;
  private readonly basketSum: HTMLElement;
  private readonly pathErase: HTMLButtonElement;
  private readonly nightToggle: HTMLButtonElement;
  private readonly facilityButtons = new Map<FacilityKind, HTMLButtonElement>();
  private tool: Tool = 'pan';
  private hintText = '';
  private hintNote: string | null = null;
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
          <span class="brand-name">${t('池づくり')}</span>
          <span class="day" title="${t('ゲーム内の日数')}">
            <svg class="ring" viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r="15" class="ring-bg"/>
              <circle cx="18" cy="18" r="15" class="ring-fg"/>
            </svg>
            <span data-v="day"></span>
          </span>
          <button type="button" class="night-toggle" aria-pressed="false">
            <span class="night-icon">${icons.moon}</span>
            <span class="night-label">${t('夜間営業')}</span>
          </button>
        </div>
        <div class="chips">
          ${chip('money', 'coin', t('資金'))}
          ${chip('visitors', 'people', t('来園者 / 日'))}
          ${chip('appeal', 'sparkle', t('景観の魅力'))}
          ${chip('safety', 'shield', t('客の安全（遊歩道）'))}
          ${chip('water', 'drop', t('池の広さ'))}
          ${chip('trees', 'tree', t('木（うち水辺）'))}
        </div>
      </header>

      <aside class="basket card" aria-label="${t('かご')}">
        <button type="button" class="basket-head" aria-expanded="true">
          <span class="basket-icon">${icons.collect}</span>
          <b>${t('かご')}</b>
          <span class="basket-hint">${t('いま居る数 / かご')}</span>
          <span class="basket-sum"></span>
          <span class="basket-toggle" aria-hidden="true"></span>
        </button>
        <ul class="basket-list"></ul>
        <p class="market-note" title="${t('売値は毎朝変わります。同じ品をたくさん売ると値下がりし、日がたつと戻ります')}"></p>
        <button type="button" class="sell-all"></button>
      </aside>

      <div class="bear-alert" hidden role="alert">
        <span class="bear-alert-icon">${icons.alert}</span>
        <span class="bear-alert-text"><b>${t('クマ出没中')}</b> <span data-v="bears"></span> ${t('罠か銃で狩ってください')}</span>
        <span class="bear-sign-text" hidden><b>${t('クマの足跡')}</b> ${t('明日現れそうです。獣道に罠を')}</span>
        <button type="button" class="bear-focus">${t('見に行く')}</button>
      </div>

      <div class="toasts" aria-live="polite"></div>

      <footer class="dock-wrap">
        <p class="hint"></p>
        <p class="view-legend" hidden title="${t('遊歩道の色は、そこから見えるものの種類の数です')}">
          <span>${t('道からの眺め')}</span>
          <span class="view-scale">${t('少')}<i></i><i></i><i></i><i></i><i></i>${t('多')}</span>
        </p>
        <div class="subtools card" role="group" hidden></div>
        <nav class="dock card" aria-label="${t('道具')}">
          <div class="tools"></div>
          <div class="divider"></div>
          <div class="sizes" role="group" aria-label="${t('ブラシの大きさ')}">
            <span class="sizes-label">${t('ブラシ')}</span>
            <div class="sizes-row"></div>
            <div class="facility-row" hidden></div>
            <button type="button" class="path-erase" aria-pressed="false" hidden>${t('撤去')}</button>
          </div>
        </nav>
      </footer>

      <button class="help-btn card" type="button" aria-label="${t('操作方法')}">${icons.help}</button>
      <button class="map-btn card" type="button" aria-pressed="false" aria-label="${t('パネルを隠して地図を広く見る')}" title="${t('パネルを隠す')}">${icons.expand}</button>
      <div class="help card" hidden>
        <div class="help-head"><b>${t('遊び方')}</b><button type="button" class="help-close" aria-label="${t('閉じる')}">${icons.close}</button></div>
        <label class="help-lang">
          <span>${locale === 'en' ? 'Language' : `${t('言語')} · Language`}</span>
          <select class="lang-select">
            ${LOCALES.map((l) => `<option value="${l}"${l === locale ? ' selected' : ''}>${LOCALE_NAMES[l]}</option>`).join('')}
          </select>
        </label>
        <div class="help-text">
          <h3>${t('基本')}</h3>
          <p>${t('池を掘り、木を植えて自然を育てましょう。')}</p>
          <p>${t('実った果物や集まってきた生き物を「集める」でかごに入れて売るとお金になります。ただし採りすぎると景観の魅力が下がり、入園料が減ります。')}</p>
          <h3>${t('遊歩道と出入口')}</h3>
          <p>${t('来園者は手前の出入口から入って帰ります。出入口から柵付きの遊歩道をつなげて、来園者の数に見合うだけ敷けば、客は安全に回れて魅力も上がります。')}</p>
          <p>${t('つながっていない道は灰色になり、使われません。')}</p>
          <h3>${t('道からの眺め')}</h3>
          <p>${t('遊歩道は、そこから見えるものの種類が多いほど魅力が上がります。道から 5マス以内にあるものが見えます。')}</p>
          <p>${t('見えるものは、水面・木立（木 3本以上）・花畑・岩・池の中の小島・名所（展望台や水車小屋など）の 6種類です。同じものをたくさん並べても増えないので、道ごとに違う見どころを作りましょう。')}</p>
          <p>${t('「遊歩道」「花畑」「岩」を選ぶと、道が眺めのよさで色分けされます。花畑と岩は「自然」から置けます。')}</p>
          <h3>${t('来園者のタイプ')}</h3>
          <p>${t('家族連れ・散策の人・釣り人・写真家の 4つのタイプがいて、求めるものが違います。')}</p>
          <p>${t('上の「来園者」の数字を押すと、タイプごとの人数と満足度、足りないものが見られます。満足している客層ほど多く来て、釣り人と写真家は入園料を多く払います。呼びこむ客層を 1つ選べます。')}</p>
          <h3>${t('危ない生き物と密猟者')}</h3>
          <p>${t('ウサギが増えるとキツネもやってきます。来園者が襲われると魅力が大きく下がります。')}</p>
          <p>${t('ときどきクマが現れ、柵と道を壊して来園者を襲います。現れる前の日には地図の端に足跡が見つかり、そこから続く点線が予想される獣道です。クマは身を隠せる林や水辺を通り、開けた草地を避けるので、木の植え方で通り道が変わります。')}</p>
          <p>${t('獣道に先回りして罠を仕掛けるか、銃で狩りましょう。クマの近くには罠を置けません。遊歩道のすぐ脇の罠には来園者がかかってしまいます。')}</p>
          <p>${t('夜には密猟者が忍び込んで魚や動物を盗んでいきます。紫の目印の人を「集める」でなぞると捕まえられ、報奨金がもらえます。来園者に見つかると逃げ出すので、遊歩道を広く巡らせておくと被害を減らせます。')}</p>
          <p>${t('かごの下の「駆除係」で係を雇うと、日給と引き換えに園内を巡回し、クマを撃ち、キツネや密猟者を捕まえてくれます（給料が払えないと辞めてしまいます）。')}</p>
          <h3>${t('毎日の出費と赤字')}</h3>
          <p>${t('来園者 40人ごとに案内係の人件費がかかり、池・遊歩道・木・施設には維持費がかかります。★が上がると入園料も係の日給も上がります。入園料の 4分の3ほどは人件費に消えるので、ほどほどに採って売る稼ぎが大切です。★が上がると、採れたものは「名所の産物」として高く売れます。')}</p>
          <p>${t('上の「資金」にさわると、毎日の出費の見込みが見られます。お金が足りない日は維持費を後回しにします（園が少し荒れて、客が 1割減ります）。赤字でも、集める・売る・撤去・クマを撃つ・夜間営業をやめることはできるので、売って立て直しましょう。')}</p>
          <h3>${t('夜間営業')}</h3>
          <p>${t('左上の「夜間営業」で遊歩道をライトアップすると、夜も客が来て入園料が増えます。ただし電気代がかかり、夜行性のキツネが寄ってきて遊歩道の外が危険になります。')}</p>
          <h3>${t('図鑑と珍しい生き物')}</h3>
          <p>${t('本のボタンの「生き物図鑑」には、園に現れた生き物が載ります。浅瀬、池の中の小島、木を寄せて植えた林、遊歩道から離れた静かな林など、場所を作り分けると、そこを好む新しい生き物が現れます。')}</p>
          <p>${t('まだ見つけていない生き物はヒントだけが載っています。見つけるたびにボーナスがもらえ、評判が広まって来園者が増えます。')}</p>
          <p>${t('水辺の木を増やし、池を深くして荒らさずにいると、ホタルやオオサンショウウオがまれに現れて話題になり、来園者が一気に増えます（捕まえることはできません）。')}</p>
          <h3>${t('ランクと施設')}</h3>
          <p>${t('左上の★は園のランクです。押すと次のランクへの目標が見られます。')}</p>
          <p>${t('目標を全部達成するとランクが上がり、賞金がもらえて入園料が上がります。休憩所・売店・展望台などの施設を「施設」で遊歩道のそばに建てられるようになり、さらに水車小屋・自然館・大ケヤキといった大きな買い物もできるようになります。')}</p>
          <h3>${t('お願いと売値')}</h3>
          <p>${t('毎朝、町の人から「お願い」が 1件届きます（手紙のボタン）。魚を届ける、生き物を増やす、水辺に木を植える、今日は何も採らない、などです。期限までに応えると報酬がもらえます。応えられなくても罰はなく、見送ることもできます。')}</p>
          <p>${t('売値は毎朝変わります。きょうの高値とあすの高値は、かごの下に出ます。同じ品をたくさん売ると値下がりし、日がたつと戻るので、高い日に少しずつ売るのが得です。')}</p>
          <h3>${t('1年のまとめ')}</h3>
          <p>${t('1年（春から冬までの 20日）が終わると、その年の来園者や収入のまとめが出ます。')}</p>
          <h3>${t('操作')}</h3>
        </div>
        <dl class="help-mouse">
          <dt>${t('左ドラッグ')}</dt><dd>${t('道具を使う（移動ではカメラ移動）')}</dd>
          <dt>${t('右ドラッグ')}</dt><dd>${t('カメラ移動')}</dd>
          <dt>${t('中ドラッグ')}</dt><dd>${t('カメラ回転')}</dd>
          <dt>${t('ホイール')}</dt><dd>${t('ズーム')}</dd>
          <dt>${t('Shift+ドラッグ')}</dt><dd>${t('遊歩道を撤去（Shift+クリックで花畑・岩を片づけ）')}</dd>
        </dl>
        <dl class="help-touch">
          <dt>${t('1本指')}</dt><dd>${t('道具を使う（移動ではカメラ移動）')}</dd>
          <dt>${t('2本指ドラッグ')}</dt><dd>${t('カメラ移動（移動では回転）')}</dd>
          <dt>${t('ピンチ')}</dt><dd>${t('ズーム')}</dd>
          <dt>${t('撤去ボタン')}</dt><dd>${t('遊歩道・施設・花畑・岩を撤去')}</dd>
        </dl>
        <dl class="help-keys">
          <dt><kbd>1</kbd>〜<kbd>0</kbd> <kbd>-</kbd> <kbd>F</kbd> <kbd>R</kbd></dt><dd>${t('道具の切り替え')}</dd>
          <dt><kbd>[</kbd> <kbd>]</kbd></dt><dd>${t('ブラシの大きさ')}</dd>
          <dt><kbd>T</kbd></dt><dd>${t('時間の速さ（ゆっくり・ふつう・はやい）')}</dd>
        </dl>
        <div class="help-more">
          <button type="button" class="help-guide">${t('はじめの案内をもう一度')}</button>
          <button type="button" class="help-year" disabled>${t('去年のまとめ')}</button>
        </div>
        <div class="help-save">
          <span>${t('進捗はこのブラウザに自動で保存されます')}</span>
          <button type="button" class="reset">${t('最初からやり直す')}</button>
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
      b.dataset.group = g.id;
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
    // 上の数字のバーの下端も渡す（案内や警報をそのすぐ下に出す）
    const topbar = this.root.querySelector<HTMLElement>('.topbar')!;
    const syncTopBottom = () => this.root.style.setProperty('--top-bottom', `${Math.round(topbar.getBoundingClientRect().bottom)}px`);
    new ResizeObserver(syncTopBottom).observe(topbar);
    window.addEventListener('resize', syncTopBottom);

    // ブラシの大きさ
    const sizes = this.root.querySelector('.sizes-row')!;
    for (const s of BRUSH_SIZES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'size';
      b.dataset.radius = String(s.radius);
      b.title = t('半径 {0}', s.radius);
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
        <span class="item-name">${info.name}<small data-price>${info.price}G</small></span>
        <span class="item-wild" data-wild title="${t('野外にいま居る数')}">0</span>
        <span class="item-count" data-count>0</span>
        <button type="button" class="sell" title="${t('{0}を売る', info.name)}">${t('売る')}<small data-sell-price></small></button>`;
      li.querySelector('.sell')!.addEventListener('click', () => handlers.onSell(kind));
      list.appendChild(li);
      this.basketRows.set(kind, li);
    }
    this.marketNote = this.root.querySelector('.market-note')!;
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
    const langSelect = this.root.querySelector<HTMLSelectElement>('.lang-select')!;
    langSelect.addEventListener('change', () => changeLocale(langSelect.value as Locale));

    // 地図を広く見たいときは、数字やかごなどのパネルを隠す（道具とこのボタンは残す）
    const mapBtn = this.root.querySelector<HTMLButtonElement>('.map-btn')!;
    mapBtn.addEventListener('click', () => {
      const on = this.root.classList.toggle('map-mode');
      mapBtn.setAttribute('aria-pressed', String(on));
      mapBtn.title = on ? t('パネルを表示') : t('パネルを隠す');
      mapBtn.innerHTML = on ? icons.shrink : icons.expand;
    });

    const help = this.root.querySelector<HTMLElement>('.help')!;
    this.root.querySelector('.help-btn')!.addEventListener('click', () => (help.hidden = !help.hidden));
    this.root.querySelector('.help-close')!.addEventListener('click', () => (help.hidden = true));
    this.root.querySelector('.help-guide')!.addEventListener('click', () => {
      help.hidden = true;
      handlers.onGuideRestart();
    });
    this.root.querySelector('.help-year')!.addEventListener('click', () => {
      help.hidden = true;
      handlers.onYearReview();
    });
  }

  setTool(tool: Tool): void {
    const group = groupOf(tool);
    this.lastInGroup.set(group.id, tool);
    for (const g of GROUPS) {
      const b = this.buttons.get(g.id)!;
      const ti = toolInfo(this.lastInGroup.get(g.id) ?? g.tools[0]);
      const active = g === group;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
      b.title = g.tools.length > 1 ? t('{0}：{1}', g.label, g.tools.map((id) => toolInfo(id).label).join(t('・'))) : t('{0}（{1}）', ti.label, ti.key);
      // まとまりのボタンには、いま選ばれている（押すと使う）道具を出す
      b.innerHTML = `
        <kbd>${ti.key}</kbd>
        <span class="tool-icon">${icons[ti.id]}</span>
        <span class="tool-label">${g.tools.length > 1 ? g.label : ti.label}</span>
        <span class="tool-cost">${g.tools.length > 1 ? ti.label : ti.cost || '&nbsp;'}</span>`;
    }
    // 複数の道具があるまとまりを選んだら、その中の道具をドックの上に並べる
    this.subtools.hidden = group.tools.length < 2;
    this.subtools.setAttribute('aria-label', group.label);
    this.subtools.innerHTML = '';
    for (const id of group.tools) {
      const ti = toolInfo(id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `subtool${id === tool ? ' active' : ''}`;
      b.setAttribute('aria-pressed', String(id === tool));
      b.title = t('{0}（{1}）', ti.label, ti.key);
      b.innerHTML = `${icons[id]}<span>${ti.label}</span><small>${ti.cost}</small>`;
      b.addEventListener('click', () => this.handlers.onToolChange(id));
      this.subtools.appendChild(b);
    }
    this.setHint(TOOLS.find((ti) => ti.id === tool)?.hint ?? '');
    this.root.querySelector('.sizes')!.classList.toggle('disabled', tool === 'pan');
    // 施設のときはブラシの代わりに建てる施設を選ぶ
    const building = tool === 'build';
    this.root.querySelector<HTMLElement>('.sizes-row')!.hidden = building;
    this.root.querySelector<HTMLElement>('.facility-row')!.hidden = !building;
    this.root.querySelector<HTMLElement>('.sizes-label')!.textContent = building ? t('建てる施設') : t('ブラシ');
    const erasable = tool === 'path' || building || tool === 'flower' || tool === 'rock';
    this.pathErase.hidden = !erasable;
    if (tool !== this.tool) this.setPathErase(false);
    this.tool = tool;
  }

  /** 去年のまとめがあるときだけ、遊び方の「去年のまとめ」を押せるようにする */
  setYearReview(available: boolean): void {
    this.root.querySelector<HTMLButtonElement>('.help-year')!.disabled = !available;
  }

  /** 施設の選択肢を、選んでいるものと解放の状態に合わせて描き直す */
  setFacilities(selected: FacilityKind, lockedBy: Partial<Record<FacilityKind, number>>): void {
    for (const [kind, b] of this.facilityButtons) {
      const info = FACILITIES[kind];
      const lock = lockedBy[kind];
      b.classList.toggle('active', kind === selected && lock === undefined);
      b.classList.toggle('locked', lock !== undefined);
      b.setAttribute('aria-pressed', String(kind === selected));
      b.title = lock !== undefined ? t('{0}：★{1}で解放', info.name, lock) : t('{0}（{1}G）：{2}', info.name, info.cost.toLocaleString(), info.hint);
      b.innerHTML = `${lock !== undefined ? icons.lock : icons[kind]}<span>${info.name}</span><small>${lock !== undefined ? t('★{0}で解放', lock) : `${info.cost.toLocaleString()}G`}</small>`;
    }
    if (this.tool === 'build') {
      const lock = lockedBy[selected];
      this.setHint(
        lock !== undefined
          ? t('{0}は園のランクが★{1}になると建てられます', FACILITIES[selected].name, lock)
          : t('{0}：{1}', FACILITIES[selected].name, FACILITIES[selected].hint),
      );
    }
  }

  /** 道具の説明。指している場所の知らせ（hintNote）があるあいだは、そちらを出す */
  private setHint(text: string): void {
    this.hintText = text;
    this.hint.textContent = this.hintNote ?? text;
  }

  /** 道具の説明の代わりに、指している場所についての知らせを出す（null で元に戻す） */
  setHintNote(note: string | null): void {
    this.hintNote = note;
    this.hint.textContent = note ?? this.hintText;
    this.hint.classList.toggle('hint-note', note !== null);
  }

  /** 遊歩道を眺めのよさで色分けしているあいだ、色の見方を出す */
  setViewLegend(on: boolean): void {
    this.root.querySelector<HTMLElement>('.view-legend')!.hidden = !on;
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
      lastToast.dataset.timer = String(window.setTimeout(() => this.dismiss(lastToast), toastMs(message)));
      return;
    }
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = message;
    this.toasts.appendChild(el);
    // 狭い画面では重なって読めなくならないよう、並べるのは 2つまで
    const max = window.matchMedia(COMPACT_QUERY).matches ? 2 : 3;
    while (this.toasts.children.length > max) this.toasts.firstElementChild!.remove();
    el.dataset.timer = String(window.setTimeout(() => this.dismiss(el), toastMs(message)));
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
      ...ITEM_ORDER.map((k) => `${inv[k]}/${d.wild[k]}`), d.bears, d.bearSign, d.traps, d.nightOpen, d.nightVisitors, d.lightingCost, d.costs.total,
    ].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.values.day.textContent = t('{0}日目', d.day);
    const alert = this.root.querySelector<HTMLElement>('.bear-alert')!;
    alert.hidden = d.bears === 0 && !d.bearSign;
    alert.classList.toggle('sign', d.bears === 0 && d.bearSign);
    alert.querySelector<HTMLElement>('.bear-alert-text')!.hidden = d.bears === 0;
    alert.querySelector<HTMLElement>('.bear-sign-text')!.hidden = d.bears > 0;
    this.values.bears.textContent = t('{0}頭', d.bears);
    this.set('money', d.money, d.money.toLocaleString(), 'G');
    const moneyChip = this.values.money.closest<HTMLElement>('.chip')!;
    moneyChip.classList.toggle('stressed', d.money < 0);
    moneyChip.title =
      t('毎日の出費の見込み 約{0}G（案内係 {1}人の人件費 {2}G・池や道や施設の維持費 {3}G）', d.costs.total.toLocaleString(), d.costs.staff, d.costs.wages.toLocaleString(), d.costs.upkeep.toLocaleString()) +
      (d.money < 0 ? t('。赤字のあいだは維持費を後回しにします（園が少し荒れて客が 1割減ります）。集めて売って立て直しましょう') : '');
    this.set('visitors', d.visitors, String(d.visitors), t('人') + (d.nightOpen ? ` <small>${t('+夜{0}', d.nightVisitors)}</small>` : ''));
    this.nightToggle.classList.toggle('active', d.nightOpen);
    this.nightToggle.setAttribute('aria-pressed', String(d.nightOpen));
    this.nightToggle.title = d.nightOpen
      ? t('夜間営業中：夜の部 {0}人、電気代 {1}G/晩。夜はキツネが寄ってきて危険が増します（クリックでやめる）', d.nightVisitors, d.lightingCost)
      : t('ライトアップして夜も営業する（電気代 {0}G/晩）。客は増えますが、夜行性のキツネも寄ってきます', d.lightingCost);
    const pct = Math.round(d.penalty * 100);
    const inc = Math.round(d.incidentPenalty * 100);
    const notes = [
      inc >= 3 ? `<em class="penalty">${t('事件 -{0}%', inc)}</em>` : '',
      pct >= 3 ? `<em class="penalty">${t('採りすぎ -{0}%', pct)}</em>` : '',
    ].join('');
    this.set('appeal', d.appeal, String(d.appeal), notes);
    this.values.appeal.closest('.chip')!.classList.toggle('stressed', pct >= 3 || inc >= 3);
    const safe = Math.round(d.safety * 100);
    const loose = d.pathCellsTotal - d.pathCells;
    this.set(
      'safety',
      safe,
      String(safe),
      `% <small>${t('({0}マス)', d.pathCells)}</small>${loose > 0 ? `<em class="penalty">${t('未接続 {0}マス', loose)}</em>` : ''}`,
    );
    this.values.safety.closest('.chip')!.classList.toggle('stressed', safe < 50);
    this.set('water', d.waterCells, String(d.waterCells), t('マス'));
    this.set('trees', d.trees, String(d.trees), `${t('本')} <small>(${d.treesNearWater})</small>`);

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
      // きょうの売値。高値・安値・売りすぎを色と印で知らせる
      const trend = d.market.trend(kind);
      const priceEl = row.querySelector<HTMLElement>('[data-price]')!;
      const priceText = `${d.market.price(kind)}G${TREND_MARK[trend]}`;
      // 狭い画面では名前の欄を出さないので、「売る」ボタンの中にも同じ値段を出す
      const sellPriceEl = row.querySelector<HTMLElement>('[data-sell-price]')!;
      if (sellPriceEl.textContent !== priceText) priceEl.textContent = sellPriceEl.textContent = priceText;
      if (sellPriceEl.dataset.trend !== trend) {
        priceEl.dataset.trend = sellPriceEl.dataset.trend = trend;
        priceEl.title = TREND_TITLE[trend];
      }
    }
    const note = d.market.note();
    if (this.marketNote.textContent !== note) this.marketNote.textContent = note;
    const total = d.market.valueOf(inv);
    this.sellAll.disabled = total === 0;
    this.basketSum.textContent = total > 0 ? `+${total.toLocaleString()}G` : '';
    this.sellAll.innerHTML = total > 0 ? `${t('まとめて売る')} <b>+${total.toLocaleString()}G</b>` : t('かごは空です');
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

/** 通知を出しておく時間。長い文は読み切れるよう長めに */
function toastMs(message: string): number {
  return Math.min(6000, 2200 + message.length * 60);
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
