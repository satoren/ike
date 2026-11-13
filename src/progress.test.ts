import { describe, expect, it } from 'vitest';
import { Heightmap } from './heightmap';
import { PathGrid } from './paths';
import { Facilities, FACILITY } from './facilities';
import { Progress, RANKS, type ParkStats } from './progress';

function stats(over: Partial<ParkStats> = {}): ParkStats {
  return {
    visitors: 0,
    waterCells: 0,
    treesNearWater: 0,
    pathCells: 0,
    earned: 0,
    wild: { rabbit: 0, duck: 0, fish: 0 },
    birds: 0,
    reviewAvg: null,
    rareSeen: false,
    facilities: { rest: 0, shop: 0, tower: 0, mill: 0, center: 0, bigtree: 0 },
    ...over,
  };
}

describe('園のランク', () => {
  it('目標を全部達成するとランクが上がり、次の目標に変わる', () => {
    const p = new Progress();
    expect(p.rank.stars).toBe(1);
    let r = p.evaluate(stats({ visitors: 230 }));
    expect(r.achieved.map((g) => g.id)).toEqual(['v220']);
    expect(r.rankedUp).toBeNull();
    // 来園者が減っても、一度達成した目標は達成のまま
    r = p.evaluate(stats({ visitors: 10, waterCells: 700, pathCells: 50 }));
    expect(r.rankedUp?.stars).toBe(2);
    expect(p.state.done).toEqual([]);
    expect(p.unlocked('rest')).toBe(true);
    expect(p.unlocked('shop')).toBe(false);
  });

  it('珍しい生き物は一度見れば覚えておく', () => {
    const p = new Progress();
    p.restore({ rank: 3 });
    p.evaluate(stats({ rareSeen: true }));
    expect(p.goals(stats()).find((g) => g.goal.id === 'rare')?.done).toBe(true);
  });

  it('最高ランクでは目標がなく、それ以上上がらない', () => {
    const p = new Progress();
    p.restore({ rank: RANKS.length - 1 });
    expect(p.next).toBeNull();
    expect(p.evaluate(stats({ visitors: 9999 })).rankedUp).toBeNull();
  });

  it('ランクが上がるほど入園料が高く、施設が解放されていく', () => {
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i].ticket).toBeGreaterThan(RANKS[i - 1].ticket);
    expect(Progress.unlockRank('tower')?.stars).toBe(4);
  });

  it('保存した内容から戻せる', () => {
    const p = new Progress();
    p.earn(1234);
    p.evaluate(stats({ visitors: 300 }));
    const q = new Progress();
    q.restore(JSON.parse(JSON.stringify(p.snapshot())));
    expect(q.state).toEqual(p.state);
  });
});

function flatMap(): Heightmap {
  const map = new Heightmap(32);
  map.heights.fill(2);
  return map;
}

describe('施設', () => {
  it('つながった遊歩道のすぐ横にだけ建てられる', () => {
    const map = flatMap();
    const paths = new PathGrid(map); // 出入口から z=27 まで道がある（中央の 15,16 列）
    const fs = new Facilities(map, 0.5);
    const beside = paths.center(18, 28);
    expect(fs.whyNot(beside.x, beside.z, paths)).toBeNull();
    const far = paths.center(3, 3);
    expect(fs.whyNot(far.x, far.z, paths)).toMatch(/遊歩道/);
    const on = paths.center(15, 28);
    expect(fs.whyNot(on.x, on.z, paths)).toMatch(/上には/);
    fs.build('rest', beside.x, beside.z);
    expect(fs.whyNot(beside.x + 1, beside.z, paths)).toMatch(/近すぎ/);
  });

  it('休憩所は来園者の数に見合う分だけ魅力が上がる', () => {
    const fs = new Facilities(flatMap(), 0.5);
    for (let i = 0; i < 5; i++) fs.build('rest', i * 4, 0);
    expect(fs.appealBonus(10)).toBe(FACILITY.restAppeal);
    expect(fs.appealBonus(400)).toBe(FACILITY.restAppeal * 5);
  });

  it('売店は 1軒で相手できる客の数だけ売り上げる', () => {
    const fs = new Facilities(flatMap(), 0.5);
    expect(fs.shopIncome(300)).toBe(0);
    fs.build('shop', 0, 0);
    expect(fs.shopIncome(100)).toBe(200);
    expect(fs.shopIncome(300)).toBe(FACILITY.shopPerVisitors * FACILITY.shopPerVisitor);
  });

  it('展望台は池を見渡せるほど魅力が上がり、水に沈んだ施設は消える', () => {
    const map = flatMap();
    const fs = new Facilities(map, 0.5);
    const dry = fs.build('tower', 0, 0);
    expect(dry.view).toBe(0);
    for (let iz = 0; iz <= 10; iz++) for (let ix = 0; ix <= 32; ix++) map.set(ix, iz, 0);
    fs.refreshViews([]);
    expect(fs.facilities[0].view).toBeGreaterThan(0);
    fs.build('rest', 0, -14);
    expect(fs.removeDrowned()).toBe(1);
    expect(fs.facilities).toHaveLength(1);
  });

  it('水車小屋は水ぎわにだけ建てられ、水のほうを向く', () => {
    const map = flatMap();
    const paths = new PathGrid(map);
    const fs = new Facilities(map, 0.5);
    const beside = paths.center(18, 28);
    expect(fs.whyNot(beside.x, beside.z, paths, 'mill')).toMatch(/水ぎわ/);
    // 東どなりに池を掘る
    for (let iz = 26; iz <= 30; iz++) for (let ix = 20; ix <= 24; ix++) map.set(ix, iz, 0);
    expect(fs.whyNot(beside.x, beside.z, paths, 'mill')).toBeNull();
    const mill = fs.build('mill', beside.x, beside.z);
    expect(Math.cos(mill.angle!)).toBeGreaterThan(0.5); // 東（+x）向き
    expect(fs.appealBonus(100)).toBe(FACILITY.millAppeal);
    // 池を埋めると水車は回らず、魅力にならない
    for (let iz = 26; iz <= 30; iz++) for (let ix = 20; ix <= 24; ix++) map.set(ix, iz, 2);
    expect(fs.appealBonus(100)).toBe(0);
  });

  it('自然館と大ケヤキは園に 1つだけ。自然館は図鑑の評判を 2倍にする', () => {
    const map = flatMap();
    const paths = new PathGrid(map);
    const fs = new Facilities(map, 0.5);
    const a = paths.center(18, 28);
    const b = paths.center(13, 28);
    expect(fs.dexBoost).toBe(1);
    expect(fs.whyNot(a.x, a.z, paths, 'center')).toBeNull();
    fs.build('center', a.x, a.z);
    expect(fs.dexBoost).toBe(FACILITY.centerDexBoost);
    expect(fs.whyNot(b.x, b.z, paths, 'center')).toMatch(/1つだけ/);
    expect(fs.whyNot(b.x, b.z, paths, 'bigtree')).toBeNull();
    fs.build('bigtree', b.x, b.z);
    expect(fs.appealBonus(0)).toBe(FACILITY.bigtreeAppeal);
    expect(fs.whyNot(b.x, b.z - 6, paths, 'bigtree')).toMatch(/1つだけ/);
    expect(fs.counts()).toEqual({ rest: 0, shop: 0, tower: 0, mill: 0, center: 1, bigtree: 1 });
    // 取り壊せば建て直せる
    fs.removeNear(b.x, b.z);
    expect(fs.whyNot(b.x, b.z, paths, 'bigtree')).toBeNull();
  });

  it('大きな買い物はランクが上がると解放される', () => {
    const p = new Progress();
    expect(p.unlocked('mill')).toBe(false);
    expect(Progress.unlockRank('mill')?.stars).toBe(3);
    expect(Progress.unlockRank('center')?.stars).toBe(4);
    expect(Progress.unlockRank('bigtree')?.stars).toBe(5);
    p.state.rank = RANKS.length - 1;
    expect(p.unlocked('mill') && p.unlocked('center') && p.unlocked('bigtree')).toBe(true);
  });
});
