import type { Appeal, CreatureKind, Habitat } from './ecology';
import { t } from './i18n';

/**
 * 季節と天気のロジック（描画から独立）。
 * - 1 年は春→夏→秋→冬。季節ごとに DAYS_PER_SEASON 日
 * - 天気は毎朝決まる。雨や雪の日は客が減る
 * - 春は花見客、冬は凍った池でスケート客が来る
 * - 夏は日照りで池の水位が下がり、浅瀬の生き物が居られなくなる
 * - 冬は池が凍ってカモが去り、ウサギは減り、クマは冬眠する
 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Weather = 'sunny' | 'cloudy' | 'rain' | 'snow';

export const SEASON_ORDER: Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const DAYS_PER_SEASON = 5;

export interface SeasonInfo {
  name: string;
  /** 季節が変わったときの知らせ */
  arrival: string;
  /** その季節の来園者の倍率 */
  visitorMul: number;
  /** 晴れが続いたときに水位がどこまで下がるか（地下水位からの差） */
  waterTarget: number;
  /** 木の育ち・実りの速さの倍率 */
  growth: number;
  /** 天気の出やすさ */
  weather: [Weather, number][];
  /** 生き物の集まりやすさ（すみかの広さに掛ける） */
  habitat: { trees: number; treesNearWater: number; waterCells: number };
  /** クマが出るか（冬は冬眠） */
  bears: boolean;
}

export const SEASONS: Record<Season, SeasonInfo> = {
  spring: {
    name: t('春'),
    arrival: t('春になりました。桜が咲き、花見客が増えます'),
    visitorMul: 1,
    waterTarget: 0,
    growth: 1.2,
    weather: [['sunny', 0.5], ['cloudy', 0.3], ['rain', 0.2]],
    // 子ウサギが生まれて増える
    habitat: { trees: 1.3, treesNearWater: 1.2, waterCells: 1 },
    bears: true,
  },
  summer: {
    name: t('夏'),
    arrival: t('夏になりました。晴れが続くと池の水位が下がります'),
    visitorMul: 1.05,
    waterTarget: -0.2,
    growth: 1,
    weather: [['sunny', 0.65], ['cloudy', 0.15], ['rain', 0.2]],
    habitat: { trees: 1, treesNearWater: 1, waterCells: 1 },
    bears: true,
  },
  autumn: {
    name: t('秋'),
    arrival: t('秋になりました。木の実がよく実り、渡り鳥のカモが増えます'),
    visitorMul: 1,
    waterTarget: -0.1,
    growth: 1.6,
    weather: [['sunny', 0.45], ['cloudy', 0.35], ['rain', 0.2]],
    habitat: { trees: 1, treesNearWater: 1.3, waterCells: 1.5 },
    bears: true,
  },
  winter: {
    name: t('冬'),
    arrival: t('冬になりました。池が凍ってスケート場になります。カモは去り、クマは冬眠します'),
    visitorMul: 0.75,
    waterTarget: 0,
    growth: 0.2,
    weather: [['sunny', 0.35], ['cloudy', 0.3], ['snow', 0.35]],
    // 凍った池にカモは居られない。ウサギは巣ごもりして減る
    habitat: { trees: 0.4, treesNearWater: 0.4, waterCells: 0 },
    bears: false,
  },
};

export interface WeatherInfo {
  name: string;
  visitorMul: number;
  /** 水位の目標をどれだけ押し上げるか */
  water: number;
}

export const WEATHER: Record<Weather, WeatherInfo> = {
  sunny: { name: t('晴れ'), visitorMul: 1.1, water: 0 },
  cloudy: { name: t('くもり'), visitorMul: 1, water: 0.1 },
  rain: { name: t('雨'), visitorMul: 0.6, water: 0.3 },
  snow: { name: t('雪'), visitorMul: 0.85, water: 0 },
};

export interface Calendar {
  season: Season;
  /** その季節の何日目か（1 始まり） */
  dayInSeason: number;
  /** 何年目か（1 始まり） */
  year: number;
}

/** ゲーム内の日（1 日目 = 1 年目の春の 1 日目）から季節を求める */
export function calendarOf(day: number): Calendar {
  const d = Math.max(0, Math.floor(day) - 1);
  const s = Math.floor(d / DAYS_PER_SEASON);
  return {
    season: SEASON_ORDER[s % 4],
    dayInSeason: (d % DAYS_PER_SEASON) + 1,
    year: Math.floor(s / 4) + 1,
  };
}

/** その季節の天気を決める */
export function rollWeather(season: Season, rand: () => number = Math.random): Weather {
  const table = SEASONS[season].weather;
  let r = rand();
  for (const [w, p] of table) {
    if (r < p) return w;
    r -= p;
  }
  return table[0][0];
}

/** 季節と天気から、水位がどこへ向かうか（地下水位からの差、0 以下） */
export function waterTarget(season: Season, weather: Weather): number {
  return Math.min(0, SEASONS[season].waterTarget + WEATHER[weather].water);
}

/** 水位の変わる速さ（1 秒あたり） */
export const WATER_RATE = 0.003;

/** 水位を目標へ少しずつ近づける */
export function stepWater(current: number, target: number, dt: number): number {
  const step = WATER_RATE * dt;
  if (Math.abs(target - current) <= step) return target;
  return current + Math.sign(target - current) * step;
}

/** 池が凍っているか */
export function isFrozen(season: Season): boolean {
  return season === 'winter';
}

/** 季節に合わせて、生き物の集まりやすさを変えたすみか */
export function seasonalHabitat(h: Habitat, season: Season): Habitat {
  const m = SEASONS[season].habitat;
  return {
    ...h,
    waterCells: Math.floor(h.waterCells * m.waterCells),
    trees: Math.floor(h.trees * m.trees),
    treesNearWater: Math.floor(h.treesNearWater * m.treesNearWater),
  };
}

/**
 * 季節の名物による魅力。
 * 春は花見（木、とくに水辺の木が多いほど）、秋は紅葉、冬は凍った池のスケート（池が広いほど）。
 */
export function seasonalBonus(season: Season, h: Habitat): number {
  switch (season) {
    case 'spring':
      return Math.round(h.trees * 0.5 + h.treesNearWater * 1);
    case 'autumn':
      return Math.round(h.trees * 0.2);
    case 'winter':
      return Math.round(Math.sqrt(h.waterCells) * 6);
    default:
      return 0;
  }
}

/** 季節の名物の名前（UI 用） */
export function bonusLabel(season: Season): string {
  return { spring: t('花見'), summer: '', autumn: t('紅葉'), winter: t('スケート') }[season];
}

/**
 * 季節と天気の影響を魅力に加える。名物の魅力も採りすぎや事件の影響は受ける。
 */
export function applySeason(a: Appeal, season: Season, weather: Weather, bonus: number): Appeal {
  const mul = SEASONS[season].visitorMul * WEATHER[weather].visitorMul;
  const extra = bonus * (1 - a.penalty) * (1 - a.incidentPenalty) * (1 - a.unsafePenalty);
  const appeal = Math.round((a.appeal + extra) * mul);
  return { ...a, appeal, visitors: Math.floor(appeal * 0.8) };
}

/**
 * 今の水位・凍結で、水の生き物がその地点に居られないか。
 * カモは凍った池や干上がった浅瀬に、魚は浅くなりすぎた場所に居られない。
 */
export function waterBlocked(
  kind: CreatureKind,
  groundHeight: number,
  waterLevel: number,
  frozen: boolean,
): boolean {
  if (kind === 'duck') return frozen || groundHeight > waterLevel - 0.1;
  if (kind === 'fish') return groundHeight > waterLevel - 0.45;
  return false;
}
