import { describe, expect, it } from 'vitest';
import {
  DAYS_PER_SEASON,
  applySeason,
  calendarOf,
  rollWeather,
  seasonalBonus,
  seasonalHabitat,
  stepWater,
  waterBlocked,
  waterTarget,
} from './seasons';
import { computeAppeal, type Habitat } from './ecology';

const habitat: Habitat = { waterCells: 400, deepCells: 100, trees: 100, treesNearWater: 30 };

describe('季節と天気', () => {
  it('1 日目は春、季節は DAYS_PER_SEASON 日ごとに巡り、4 季節で 1 年', () => {
    expect(calendarOf(1)).toEqual({ season: 'spring', dayInSeason: 1, year: 1 });
    expect(calendarOf(DAYS_PER_SEASON)).toMatchObject({ season: 'spring', dayInSeason: DAYS_PER_SEASON });
    expect(calendarOf(DAYS_PER_SEASON + 1)).toMatchObject({ season: 'summer', dayInSeason: 1 });
    expect(calendarOf(DAYS_PER_SEASON * 3 + 1).season).toBe('winter');
    expect(calendarOf(DAYS_PER_SEASON * 4 + 1)).toEqual({ season: 'spring', dayInSeason: 1, year: 2 });
  });

  it('雪は冬にしか降らず、冬に雨は降らない', () => {
    for (let i = 0; i < 100; i++) {
      const r = i / 100;
      expect(rollWeather('summer', () => r)).not.toBe('snow');
      expect(rollWeather('winter', () => r)).not.toBe('rain');
    }
  });

  it('夏の晴れでは水位が下がり、雨なら下がりにくい。地下水位より上がることはない', () => {
    expect(waterTarget('summer', 'sunny')).toBeLessThan(waterTarget('summer', 'rain'));
    expect(waterTarget('spring', 'rain')).toBe(0);
    let w = 0;
    for (let i = 0; i < 100; i++) w = stepWater(w, waterTarget('summer', 'sunny'), 1);
    expect(w).toBeCloseTo(-0.2);
  });

  it('冬は池が凍ってカモの居場所が無くなり、ウサギも減る', () => {
    const winter = seasonalHabitat(habitat, 'winter');
    expect(winter.waterCells).toBe(0);
    expect(winter.trees).toBeLessThan(habitat.trees);
    expect(waterBlocked('duck', 0, 0.5, true)).toBe(true);
    expect(waterBlocked('duck', 0, 0.5, false)).toBe(false);
  });

  it('水位が下がると浅瀬の魚は居られなくなる', () => {
    expect(waterBlocked('fish', 0, 0.5, false)).toBe(false);
    expect(waterBlocked('fish', 0, 0.2, false)).toBe(true);
    expect(waterBlocked('rabbit', 0, 0.2, true)).toBe(false);
  });

  it('春は花見、冬はスケートで魅力が上がり、雨の日は客が減る', () => {
    expect(seasonalBonus('spring', habitat)).toBeGreaterThan(0);
    expect(seasonalBonus('winter', habitat)).toBeGreaterThan(0);
    expect(seasonalBonus('summer', habitat)).toBe(0);
    const base = computeAppeal(habitat, { fruitOnTrees: 0, rabbit: 0, duck: 0, fish: 0 }, 0);
    const spring = applySeason(base, 'spring', 'cloudy', seasonalBonus('spring', habitat));
    expect(spring.visitors).toBeGreaterThan(base.visitors);
    const rainy = applySeason(base, 'summer', 'rain', 0);
    expect(rainy.visitors).toBeLessThan(base.visitors);
  });
});
