import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEED, SPEEDS, clampSpeed, secondsPerDay } from './speed';

describe('時間の速さ', () => {
  it('3 段階あり、ふつうが既定', () => {
    expect(SPEEDS).toHaveLength(3);
    expect(SPEEDS[DEFAULT_SPEED].scale).toBe(1);
  });

  it('ゆっくりは 1 日が長く、はやいは短い', () => {
    expect(secondsPerDay(0, 60)).toBeGreaterThan(60);
    expect(secondsPerDay(1, 60)).toBe(60);
    expect(secondsPerDay(2, 60)).toBeLessThan(60);
  });

  it('保存データのおかしな値はふつうに戻す', () => {
    expect(clampSpeed(2)).toBe(2);
    expect(clampSpeed(undefined)).toBe(DEFAULT_SPEED);
    expect(clampSpeed(7)).toBe(DEFAULT_SPEED);
    expect(clampSpeed('1')).toBe(DEFAULT_SPEED);
  });
});
