import { describe, expect, it } from 'vitest';
import { GUEST, GUESTS, GUEST_ORDER, Guests, mixGuests, wantsOf, weakestWant, type GuestPark } from './guests';
import { FACTOR_GUESTS, TOPICS, writeReview } from './reviews';

/** 何もそろっていない園 */
function bare(over: Partial<GuestPark> = {}): GuestPark {
  return {
    visitors: 1000,
    safety: 0,
    incidentPenalty: 0.6,
    pressurePenalty: 0.4,
    rests: 0,
    towers: 0,
    pathCells: 0,
    richViews: 0,
    waterCells: 0,
    deepCells: 0,
    fish: 0,
    birds: 0,
    species: 0,
    rare: false,
    ...over,
  };
}

/** 全部そろった園 */
function rich(over: Partial<GuestPark> = {}): GuestPark {
  return bare({
    safety: 1,
    incidentPenalty: 0,
    pressurePenalty: 0,
    rests: 10,
    towers: 2,
    pathCells: 200,
    richViews: 90,
    waterCells: 2000,
    deepCells: 500,
    fish: 20,
    birds: 4,
    species: 12,
    rare: true,
    ...over,
  });
}

describe('来園者のタイプ', () => {
  it('もともとの割合は合わせて 1 になる', () => {
    expect(GUEST_ORDER.reduce((s, k) => s + GUESTS[k].share, 0)).toBeCloseTo(1);
  });

  it('何もそろっていないと少なめ、全部そろうと多めに来る', () => {
    const low = mixGuests(bare(), 'family');
    expect(low.total).toBeCloseTo(1000 * GUEST.mulMin, -1);
    for (const g of low.groups) expect(g.satisfaction).toBe(0);

    const high = mixGuests(rich(), 'family');
    for (const g of high.groups) expect(g.satisfaction).toBe(1);
    // 満足の分と、呼びこんだ分
    expect(high.total).toBeCloseTo(1000 * (GUEST.mulMax + GUEST.focusGain), -1);
  });

  it('求めるものがそろった客層だけが増える', () => {
    // 魚が多く深い、荒らされていない池（釣り人向け）
    const pond = bare({ fish: 20, deepCells: 500, pressurePenalty: 0 });
    const mix = mixGuests(pond, 'family');
    const by = Object.fromEntries(mix.groups.map((g) => [g.kind, g]));
    expect(by.angler.satisfaction).toBe(1);
    expect(by.photographer.satisfaction).toBe(0);
    expect(by.angler.count).toBe(Math.round(1000 * GUESTS.angler.share * GUEST.mulMax));
    expect(by.photographer.count).toBe(Math.round(1000 * GUESTS.photographer.share * GUEST.mulMin));
  });

  it('呼びこむ効果は、その客層が満足しているほど大きい', () => {
    const pond = bare({ fish: 20, deepCells: 500, pressurePenalty: 0 });
    const none = mixGuests(pond, 'family'); // 家族連れは満足していないので増えない
    const angler = mixGuests(pond, 'angler');
    expect(none.groups.find((g) => g.kind === 'family')!.count).toBe(Math.round(1000 * GUESTS.family.share * GUEST.mulMin));
    expect(angler.total - none.total).toBe(Math.round(1000 * GUEST.focusGain));
    expect(angler.groups.find((g) => g.kind === 'angler')!.focused).toBe(true);
  });

  it('払いのいい客層が増えると、1人あたりの入園料が上がる', () => {
    const park = rich();
    const family = mixGuests(park, 'family');
    const photo = mixGuests(park, 'photographer');
    expect(photo.spend).toBeGreaterThan(family.spend);
    // 人数は同じだけ増えるので、収入は写真家を呼んだほうが多い
    expect(photo.total).toBe(family.total);
    expect(photo.total * photo.spend).toBeGreaterThan(family.total * family.spend);
  });

  it('来園者がいなければ、誰も来ない', () => {
    const mix = mixGuests(rich({ visitors: 0 }), 'walker');
    expect(mix.total).toBe(0);
    expect(mix.spend).toBe(1);
  });

  it('求めるものは 3つずつで、0〜1 に収まる', () => {
    for (const park of [bare(), rich(), bare({ safety: 5, fish: 999, incidentPenalty: 9 })]) {
      for (const kind of GUEST_ORDER) {
        const wants = wantsOf(kind, park);
        expect(wants).toHaveLength(3);
        for (const w of wants) {
          expect(w.ratio).toBeGreaterThanOrEqual(0);
          expect(w.ratio).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('休憩所は、来園者の数に見合うだけ要る', () => {
    const few = wantsOf('family', rich({ visitors: 100, rests: 1 }))[1];
    const many = wantsOf('family', rich({ visitors: 600, rests: 1 }))[1];
    expect(few.ratio).toBe(1);
    expect(many.ratio).toBeCloseTo(0.25);
  });

  it('写真家は、珍しい生き物が居なくても展望台 2つで満たせる', () => {
    expect(wantsOf('photographer', bare({ rare: true }))[2].ratio).toBe(1);
    expect(wantsOf('photographer', bare({ towers: 1 }))[2].ratio).toBe(0.5);
    expect(wantsOf('photographer', bare({ towers: 2 }))[2].ratio).toBe(1);
  });

  it('いちばん足りないものを言える', () => {
    const mix = mixGuests(rich({ rests: 0 }), 'family');
    const family = mix.groups.find((g) => g.kind === 'family')!;
    expect(weakestWant(family)?.label).toMatch(/休憩所/);
    expect(weakestWant(mix.groups.find((g) => g.kind === 'walker')!)).toBeNull();
  });

  it('呼びこむ客層を保存して読み直せる。古いセーブは家族連れ', () => {
    const g = new Guests();
    expect(g.focus).toBe('family');
    g.setFocus('angler');
    const again = new Guests();
    again.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(again.focus).toBe('angler');
    again.restore(undefined);
    expect(again.focus).toBe('family');
    again.restore({ focus: 'nobody' as never });
    expect(again.focus).toBe('family');
  });
});

describe('口コミを書いた人', () => {
  it('どの話題にも、書きそうなタイプが決まっている', () => {
    for (const t of TOPICS) expect(FACTOR_GUESTS[t.factor].length).toBeGreaterThan(0);
  });

  it('口コミには、話題に合ったタイプが付く', () => {
    const ctx = {
      visitors: 300,
      penalty: 0,
      safety: 1,
      pathCells: 100,
      waterCells: 900,
      trees: 80,
      treesNearWater: 40,
      wild: { fruit: 100, rabbit: 6, duck: 4, fish: 10, fox: 0, bear: 0 },
      recent: new Set<never>(),
    };
    for (let i = 0; i < 40; i++) {
      const r = writeReview(ctx, 3);
      expect(r).not.toBeNull();
      expect(FACTOR_GUESTS[r!.factor]).toContain(r!.by);
    }
  });

  it('散策の人は、変化のある眺めの道が多いほど満足する', () => {
    const want = (richViews: number) => wantsOf('walker', bare({ richViews })).find((w) => w.label === '変化のある眺め')!;
    expect(want(0).ratio).toBe(0);
    expect(want(30).ratio).toBeCloseTo(0.5);
    expect(want(200).ratio).toBe(1);
  });
});
