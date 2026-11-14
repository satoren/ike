import { BIOTOPE, FAUNA, type FaunaKind } from './fauna';
import { BIRD_NEEDS, type BirdKind } from './foodweb';
import type { RareKind } from './rare';
import type { CreatureKind } from './ecology';
import { t } from './i18n';

/**
 * 生き物図鑑（描画から独立）。
 * 園に現れた生き物を記録する。まだ見ていない生き物は、名前を伏せてヒントだけを見せる。
 * 見つけると発見ボーナスがもらえ、図鑑が埋まるほど園の評判（来園者）が上がる。
 */

export type DexId = CreatureKind | 'bear' | BirdKind | RareKind | FaunaKind;

export type DexGroup = '水辺' | '林' | '珍しい生き物';

export interface DexEntry {
  id: DexId;
  name: string;
  group: DexGroup;
  /** 見つける前に出すヒント（どんな場所を作ればいいか） */
  hint: string;
  /** 見つけたあとに出す、くわしい条件 */
  note: string;
  /** はじめて見つけたときのボーナス（G） */
  bonus: number;
}

export const DEX: DexEntry[] = [
  {
    id: 'fish',
    name: t('サカナ'),
    group: '水辺',
    hint: t('深い池に棲むらしい'),
    note: t('池を深く掘り、水草を植えると増えます。売れます'),
    bonus: 50,
  },
  {
    id: 'duck',
    name: t('カモ'),
    group: '水辺',
    hint: t('広い池と、水辺の木を好むらしい'),
    note: t('池が広く、水辺の木が多いほど集まります。冬は去ります。売れます'),
    bonus: 50,
  },
  {
    id: 'frog',
    name: FAUNA.frog.name,
    group: '水辺',
    hint: t('春から秋、足首ほどの浅い水辺で鳴くらしい'),
    note: t('浅瀬 {0}マスごとに 1匹（最大 {1}匹）。雨の日は多く、秋は少なく、冬は冬眠します', BIOTOPE.shallowPerFrog, FAUNA.frog.max),
    bonus: 100,
  },
  {
    id: 'dragonfly',
    name: FAUNA.dragonfly.name,
    group: '水辺',
    hint: t('夏から秋、水草のある池の浅瀬を飛ぶらしい'),
    note: t('浅瀬 {0}マスと水草 {1}株ごとに 1匹（最大 {2}匹）。夏と秋だけ現れます', BIOTOPE.shallowPerDragonfly, BIOTOPE.weedsPerDragonfly, FAUNA.dragonfly.max),
    bonus: 150,
  },
  {
    id: 'turtle',
    name: FAUNA.turtle.name,
    group: '水辺',
    hint: t('池の中の小島で甲羅干しをするらしい'),
    note: t('岸とつながっていない小島 {0}マスごとに 1匹（最大 {1}匹）。深い池も必要です。冬は冬眠します', BIOTOPE.islandPerTurtle, FAUNA.turtle.max),
    bonus: 300,
  },
  {
    id: 'kingfisher',
    name: t('カワセミ'),
    group: '水辺',
    hint: t('魚の多い池と、水辺の止まり木を好むらしい'),
    note: t('魚 {0}匹ごとに 1羽（最大 {1}羽）。水辺の木が {2}本以上必要です', BIRD_NEEDS.fishPerKingfisher, BIRD_NEEDS.maxKingfisher, BIRD_NEEDS.perchTrees),
    bonus: 150,
  },
  {
    id: 'heron',
    name: t('サギ'),
    group: '水辺',
    hint: t('魚のとても多い池の、浅瀬に立つらしい'),
    note: t('魚 {0}匹ごとに 1羽（最大 {1}羽）。浅瀬に立って魚をねらいます', BIRD_NEEDS.fishPerHeron, BIRD_NEEDS.maxHeron),
    bonus: 150,
  },
  {
    id: 'rabbit',
    name: t('ウサギ'),
    group: '林',
    hint: t('木の多いところに棲むらしい'),
    note: t('木、とくに水辺の木が多いほど集まります。売れます'),
    bonus: 50,
  },
  {
    id: 'squirrel',
    name: FAUNA.squirrel.name,
    group: '林',
    hint: t('木を寄せて植えた林で、木の実を食べるらしい'),
    note: t('林の木 {0}本と、採らずに残した木の実 {1}個ごとに 1匹（最大 {2}匹）', BIOTOPE.grovePerSquirrel, BIOTOPE.fruitPerSquirrel, FAUNA.squirrel.max),
    bonus: 150,
  },
  {
    id: 'deer',
    name: FAUNA.deer.name,
    group: '林',
    hint: t('遊歩道から遠い、静かな林にだけ姿を見せるらしい'),
    note: t('遊歩道から {0}マス以上離れた林の木 {1}本ごとに 1頭（最大 {2}頭）。採りすぎて荒らすと逃げます', BIOTOPE.quietCells, BIOTOPE.quietPerDeer, FAUNA.deer.max),
    bonus: 400,
  },
  {
    id: 'owl',
    name: FAUNA.owl.name,
    group: '林',
    hint: t('夜、ウサギのいる林の木に止まるらしい'),
    note: t('夜だけ現れます。林の木 {0}本ごとに 1羽（最大 {1}羽）。ウサギが {2}匹以上必要です', BIOTOPE.grovePerOwl, FAUNA.owl.max, BIOTOPE.owlRabbits),
    bonus: 400,
  },
  {
    id: 'fox',
    name: t('キツネ'),
    group: '林',
    hint: t('ウサギが増えると、それを狙って現れるらしい'),
    note: t('ウサギ 5匹ごとに 1匹集まり、ウサギを食べます。来園者を襲うことがあります。売れます'),
    bonus: 50,
  },
  {
    id: 'bear',
    name: t('クマ'),
    group: '林',
    hint: t('森が育つと、ある朝やってくるらしい'),
    note: t('木が多いほど出やすくなります。道を壊して来園者を襲います。冬は冬眠します'),
    bonus: 100,
  },
  {
    id: 'firefly',
    name: t('ホタル'),
    group: '珍しい生き物',
    hint: t('水辺の木がとても多く、荒らされていない園に光るらしい'),
    note: t('水辺の木 45本以上、池 600マス以上で、採りすぎていないとまれに現れます。話題になって来園者が増えます'),
    bonus: 300,
  },
  {
    id: 'salamander',
    name: t('オオサンショウウオ'),
    group: '珍しい生き物',
    hint: t('深く広い池に魚が多く、少しも荒らされていないと現れるらしい'),
    note: t('深い池 250マス以上、水辺の木 30本以上、魚 8匹以上で、ほとんど採っていないとまれに現れます'),
    bonus: 500,
  },
];

export const DEX_GROUPS: DexGroup[] = ['水辺', '林', '珍しい生き物'];

/** 図鑑のまとまりの見出し */
export const DEX_GROUP_LABEL: Record<DexGroup, string> = { 水辺: t('水辺'), 林: t('林'), 珍しい生き物: t('珍しい生き物') };

/** 図鑑に 1種載るごとに、来園者が増える割合 */
export const DEX_BOOST_PER_ENTRY = 0.01;

/** 保存する内容：はじめて見つけた日（生き物ごと） */
export interface DexState {
  seen: Partial<Record<DexId, number>>;
}

export class Dex {
  state: DexState = { seen: {} };

  get total(): number {
    return DEX.length;
  }

  get count(): number {
    return DEX.reduce((n, e) => n + (this.state.seen[e.id] !== undefined ? 1 : 0), 0);
  }

  has(id: DexId): boolean {
    return this.state.seen[id] !== undefined;
  }

  /** はじめて見つけた日（まだなら undefined） */
  seenDay(id: DexId): number | undefined {
    return this.state.seen[id];
  }

  /** 図鑑の充実による、魅力と来園者の倍率 */
  get boost(): number {
    return this.boostWith(1);
  }

  /** 図鑑の評判に倍率を掛けたときの来園者の倍率（自然館があると評判が 2倍になる） */
  boostWith(mult: number): number {
    return 1 + this.count * DEX_BOOST_PER_ENTRY * mult;
  }

  /**
   * いま園に居る生き物を記録する。はじめて見つけた生き物の項目を返す。
   * present は生き物ごとの数（0 や未指定は居ない）。
   */
  record(present: Partial<Record<DexId, number>>, day: number): DexEntry[] {
    const found: DexEntry[] = [];
    for (const e of DEX) {
      if ((present[e.id] ?? 0) <= 0 || this.has(e.id)) continue;
      this.state.seen[e.id] = day;
      found.push(e);
    }
    return found;
  }

  restore(s: Partial<DexState> | undefined): void {
    this.state = { seen: {} };
    for (const e of DEX) {
      const day = s?.seen?.[e.id];
      if (typeof day === 'number') this.state.seen[e.id] = day;
    }
  }

  snapshot(): DexState {
    return { seen: { ...this.state.seen } };
  }
}
