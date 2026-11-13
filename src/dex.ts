import { BIOTOPE, FAUNA, type FaunaKind } from './fauna';
import { BIRD_NEEDS, type BirdKind } from './foodweb';
import type { RareKind } from './rare';
import type { CreatureKind } from './ecology';

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
    name: 'サカナ',
    group: '水辺',
    hint: '深い池に棲むらしい',
    note: '池を深く掘り、水草を植えると増えます。売れます',
    bonus: 50,
  },
  {
    id: 'duck',
    name: 'カモ',
    group: '水辺',
    hint: '広い池と、水辺の木を好むらしい',
    note: '池が広く、水辺の木が多いほど集まります。冬は去ります。売れます',
    bonus: 50,
  },
  {
    id: 'frog',
    name: FAUNA.frog.name,
    group: '水辺',
    hint: '春から秋、足首ほどの浅い水辺で鳴くらしい',
    note: `浅瀬 ${BIOTOPE.shallowPerFrog}マスごとに 1匹（最大 ${FAUNA.frog.max}匹）。雨の日は多く、秋は少なく、冬は冬眠します`,
    bonus: 100,
  },
  {
    id: 'dragonfly',
    name: FAUNA.dragonfly.name,
    group: '水辺',
    hint: '夏から秋、水草のある池の浅瀬を飛ぶらしい',
    note: `浅瀬 ${BIOTOPE.shallowPerDragonfly}マスと水草 ${BIOTOPE.weedsPerDragonfly}株ごとに 1匹（最大 ${FAUNA.dragonfly.max}匹）。夏と秋だけ現れます`,
    bonus: 150,
  },
  {
    id: 'turtle',
    name: FAUNA.turtle.name,
    group: '水辺',
    hint: '池の中の小島で甲羅干しをするらしい',
    note: `岸とつながっていない小島 ${BIOTOPE.islandPerTurtle}マスごとに 1匹（最大 ${FAUNA.turtle.max}匹）。深い池も必要です。冬は冬眠します`,
    bonus: 300,
  },
  {
    id: 'kingfisher',
    name: 'カワセミ',
    group: '水辺',
    hint: '魚の多い池と、水辺の止まり木を好むらしい',
    note: `魚 ${BIRD_NEEDS.fishPerKingfisher}匹ごとに 1羽（最大 ${BIRD_NEEDS.maxKingfisher}羽）。水辺の木が ${BIRD_NEEDS.perchTrees}本以上必要です`,
    bonus: 150,
  },
  {
    id: 'heron',
    name: 'サギ',
    group: '水辺',
    hint: '魚のとても多い池の、浅瀬に立つらしい',
    note: `魚 ${BIRD_NEEDS.fishPerHeron}匹ごとに 1羽（最大 ${BIRD_NEEDS.maxHeron}羽）。浅瀬に立って魚をねらいます`,
    bonus: 150,
  },
  {
    id: 'rabbit',
    name: 'ウサギ',
    group: '林',
    hint: '木の多いところに棲むらしい',
    note: '木、とくに水辺の木が多いほど集まります。売れます',
    bonus: 50,
  },
  {
    id: 'squirrel',
    name: FAUNA.squirrel.name,
    group: '林',
    hint: '木を寄せて植えた林で、木の実を食べるらしい',
    note: `林の木 ${BIOTOPE.grovePerSquirrel}本と、採らずに残した木の実 ${BIOTOPE.fruitPerSquirrel}個ごとに 1匹（最大 ${FAUNA.squirrel.max}匹）`,
    bonus: 150,
  },
  {
    id: 'deer',
    name: FAUNA.deer.name,
    group: '林',
    hint: '遊歩道から遠い、静かな林にだけ姿を見せるらしい',
    note: `遊歩道から ${BIOTOPE.quietCells}マス以上離れた林の木 ${BIOTOPE.quietPerDeer}本ごとに 1頭（最大 ${FAUNA.deer.max}頭）。採りすぎて荒らすと逃げます`,
    bonus: 400,
  },
  {
    id: 'owl',
    name: FAUNA.owl.name,
    group: '林',
    hint: '夜、ウサギのいる林の木に止まるらしい',
    note: `夜だけ現れます。林の木 ${BIOTOPE.grovePerOwl}本ごとに 1羽（最大 ${FAUNA.owl.max}羽）。ウサギが ${BIOTOPE.owlRabbits}匹以上必要です`,
    bonus: 400,
  },
  {
    id: 'fox',
    name: 'キツネ',
    group: '林',
    hint: 'ウサギが増えると、それを狙って現れるらしい',
    note: 'ウサギ 5匹ごとに 1匹集まり、ウサギを食べます。来園者を襲うことがあります。売れます',
    bonus: 50,
  },
  {
    id: 'bear',
    name: 'クマ',
    group: '林',
    hint: '森が育つと、ある朝やってくるらしい',
    note: '木が多いほど出やすくなります。道を壊して来園者を襲います。冬は冬眠します',
    bonus: 100,
  },
  {
    id: 'firefly',
    name: 'ホタル',
    group: '珍しい生き物',
    hint: '水辺の木がとても多く、荒らされていない園に光るらしい',
    note: '水辺の木 45本以上、池 600マス以上で、採りすぎていないとまれに現れます。話題になって来園者が増えます',
    bonus: 300,
  },
  {
    id: 'salamander',
    name: 'オオサンショウウオ',
    group: '珍しい生き物',
    hint: '深く広い池に魚が多く、少しも荒らされていないと現れるらしい',
    note: '深い池 250マス以上、水辺の木 30本以上、魚 8匹以上で、ほとんど採っていないとまれに現れます',
    bonus: 500,
  },
];

export const DEX_GROUPS: DexGroup[] = ['水辺', '林', '珍しい生き物'];

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
