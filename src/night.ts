import type { PathGrid } from './paths';

/**
 * 夜間営業のロジック（描画から独立）。
 * - 1 日の終わりのほうが夜になる
 * - ライトアップして夜も開けると、夜の部の来園者が加わり入園料が増える（電気代はかかる）
 * - ただし夜は夜行性の肉食動物（キツネ）が寄ってきて活発になり、来園者が襲われやすくなる
 * - 閉めている夜は来園者は帰ってしまう
 */
export const NIGHT = {
  /** 1 日のうち、日が暮れ始める位置（0〜1） */
  duskStart: 0.58,
  /** 真っ暗になる位置 */
  duskEnd: 0.7,
  /** 明け始める位置 */
  dawnStart: 0.92,
  /** 夜の部の来園者は、昼の来園者の何割か */
  visitorRatio: 0.6,
  /** ライトアップの電気代（1 晩あたりの基本料） */
  baseCost: 180,
  /** 灯り 1 基あたりの電気代（1 晩） */
  lanternCost: 12,
  /** 灯りを何マスおきに立てるか */
  lanternSpacing: 4,
  /** 夜にキツネが来園者を襲う確率の倍率 */
  foxDanger: 2.5,
  /** 夜の部の来園者何人ごとに、夜行性のキツネが 1 匹寄ってくるか */
  visitorsPerNightFox: 40,
  /** 一晩に寄ってくる夜行性のキツネの上限 */
  maxNightFoxes: 3,
} as const;

/** 1 日の進み具合（0〜1）から暗さ（0 = 昼、1 = 真夜中）を求める */
export function darkness(dayProgress: number): number {
  const p = dayProgress - Math.floor(dayProgress);
  if (p < NIGHT.duskStart) return 0;
  if (p < NIGHT.duskEnd) return smooth((p - NIGHT.duskStart) / (NIGHT.duskEnd - NIGHT.duskStart));
  if (p < NIGHT.dawnStart) return 1;
  return smooth(1 - (p - NIGHT.dawnStart) / (1 - NIGHT.dawnStart));
}

/** 夜かどうか（客の出入りや動物の行動が切り替わる） */
export function isNight(dayProgress: number): boolean {
  return darkness(dayProgress) >= 0.5;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 夜の部の来園者数。閉めていれば 0 */
export function nightVisitors(dayVisitors: number, open: boolean): number {
  return open ? Math.floor(dayVisitors * NIGHT.visitorRatio) : 0;
}

/** 一晩の電気代 */
export function lightingCost(lanterns: number): number {
  return NIGHT.baseCost + lanterns * NIGHT.lanternCost;
}

/** 夜営業のとき寄ってくる夜行性のキツネの数 */
export function nightFoxCount(nightVisitorCount: number): number {
  if (nightVisitorCount <= 0) return 0;
  return Math.min(NIGHT.maxNightFoxes, 1 + Math.floor(nightVisitorCount / NIGHT.visitorsPerNightFox));
}

/** その時間帯にキツネが来園者を襲う確率の倍率 */
export function foxDangerFactor(night: boolean): number {
  return night ? NIGHT.foxDanger : 1;
}

/**
 * 灯りを立てるマス。出入口とつながった遊歩道のうち、格子状に間引いたマス。
 * 道が細くても途切れないよう、近くに灯りが無いマスにも足していく。
 */
export function lanternCells(grid: PathGrid): [number, number][] {
  const s = NIGHT.lanternSpacing;
  const out: [number, number][] = [];
  const near = (cx: number, cz: number) =>
    out.some(([x, z]) => Math.abs(x - cx) < s - 1 && Math.abs(z - cz) < s - 1);
  for (let cz = 0; cz < grid.size; cz++) {
    for (let cx = 0; cx < grid.size; cx++) {
      if (!grid.isConnected(cx, cz)) continue;
      if (near(cx, cz)) continue;
      out.push([cx, cz]);
    }
  }
  return out;
}
