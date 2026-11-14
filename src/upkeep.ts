import type { FacilityKind } from './facilities';

/**
 * 毎日の出費（描画から独立）。
 * - 人件費：来園者 40人ごとに案内係が 1人いる（客が少ない日は短い時間だけ働く）。★が上がると腕のいい係が要るので日給も上がる
 *   （入園料の上乗せと同じ倍率）。だから客が増えても、入園料の 4分の3ほどは係の給料に消える
 * - 維持費：池・遊歩道・木・飾り・施設の手入れ。広げるほど毎日かかる
 * 入園料だけで放っておいても大きくは儲からず、採って売る稼ぎが効いてくるようにするための仕組み。
 */
export const UPKEEP = {
  /** 案内係 1人が相手できる来園者（昼と夜の部の合計） */
  visitorsPerStaff: 40,
  /** 案内係 1人の日給（★1のとき） */
  staffWage: 360,
  /** 池 1マスあたり（水の入れ替え・岸の手入れ） */
  water: 0.4,
  /** つながった遊歩道 1マスあたり（柵と道の補修） */
  path: 1.5,
  /** 木 1本あたり（剪定） */
  tree: 0.5,
  /** 花畑・岩 1つあたり */
  decor: 1,
  /** 施設 1軒あたり */
  facility: { rest: 20, shop: 40, tower: 60, mill: 150, center: 400, bigtree: 600 } as Record<FacilityKind, number>,
} as const;

export interface UpkeepPark {
  /** 1日の来園者（昼と夜の部の合計） */
  visitors: number;
  /** ランクの入園料の倍率（日給にも掛かる） */
  rankTicket: number;
  waterCells: number;
  pathCells: number;
  trees: number;
  decor: number;
  facilities: Record<FacilityKind, number>;
}

export interface DailyCosts {
  staff: number;
  wages: number;
  upkeep: number;
  total: number;
}

/** 赤字のときの決まりごと。赤字でも園を守る最低限のことはでき、必ず立て直せるようにする */
export const DEBT = {
  /** クマを撃つなど、最低限のことに払える借りの限度 */
  floor: -2000,
  /** 維持費を後回しにしているあいだの、来園者の減り方 */
  visitorMul: 0.9,
} as const;

/** 赤字（維持費を後回し）のあいだ、来園者に掛かる倍率 */
export function debtFactor(money: number): number {
  return money < 0 ? DEBT.visitorMul : 1;
}

export function staffFor(visitors: number): number {
  return Math.ceil(Math.max(0, visitors) / UPKEEP.visitorsPerStaff);
}

export function dailyCosts(p: UpkeepPark): DailyCosts {
  const staff = staffFor(p.visitors);
  // 日給は来園者の数に比例させる（客が少ない日は短い時間だけ働く）。だから入園料が人件費を下回ることはない
  const wages = Math.round((Math.max(0, p.visitors) / UPKEEP.visitorsPerStaff) * UPKEEP.staffWage * p.rankTicket);
  let facility = 0;
  for (const kind of Object.keys(UPKEEP.facility) as FacilityKind[]) facility += (p.facilities[kind] ?? 0) * UPKEEP.facility[kind];
  const upkeep = Math.round(
    p.waterCells * UPKEEP.water + p.pathCells * UPKEEP.path + p.trees * UPKEEP.tree + p.decor * UPKEEP.decor + facility,
  );
  return { staff, wages, upkeep, total: wages + upkeep };
}
