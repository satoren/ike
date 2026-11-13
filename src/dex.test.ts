import { describe, expect, it } from 'vitest';
import { DEX, DEX_BOOST_PER_ENTRY, Dex } from './dex';
import { FAUNA_ORDER } from './fauna';

describe('Dex', () => {
  it('はじめて現れた生き物だけを、見つけた日と一緒に記録する', () => {
    const dex = new Dex();
    expect(dex.count).toBe(0);
    const first = dex.record({ rabbit: 3, fish: 0, frog: 1 }, 2);
    expect(first.map((e) => e.id).sort()).toEqual(['frog', 'rabbit']);
    expect(dex.seenDay('frog')).toBe(2);
    expect(dex.has('fish')).toBe(false);

    // 2度目は新発見にならず、日付も変わらない
    expect(dex.record({ rabbit: 5, frog: 2 }, 9)).toHaveLength(0);
    expect(dex.seenDay('rabbit')).toBe(2);
    expect(dex.record({ fish: 1 }, 9).map((e) => e.id)).toEqual(['fish']);
    expect(dex.count).toBe(3);
  });

  it('図鑑が埋まるほど来園者の倍率が上がる', () => {
    const dex = new Dex();
    expect(dex.boost).toBe(1);
    dex.record({ rabbit: 1, duck: 1 }, 1);
    expect(dex.boost).toBeCloseTo(1 + 2 * DEX_BOOST_PER_ENTRY);
    dex.record(Object.fromEntries(DEX.map((e) => [e.id, 1])), 3);
    expect(dex.count).toBe(dex.total);
    expect(dex.boost).toBeCloseTo(1 + DEX.length * DEX_BOOST_PER_ENTRY);
  });

  it('保存と読み込みで記録が残る。知らない項目は捨てる', () => {
    const dex = new Dex();
    dex.record({ deer: 1, owl: 2 }, 12);
    const again = new Dex();
    again.restore(JSON.parse(JSON.stringify({ seen: { ...dex.snapshot().seen, unicorn: 4 } })));
    expect(again.count).toBe(2);
    expect(again.seenDay('deer')).toBe(12);
    again.restore(undefined);
    expect(again.count).toBe(0);
  });

  it('場所で現れる生き物はすべて図鑑に載っていて、項目は重複しない', () => {
    const ids = DEX.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const k of FAUNA_ORDER) expect(ids).toContain(k);
  });
});
