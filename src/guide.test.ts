import { describe, expect, it } from 'vitest';
import { GUIDE_STEPS, Guide, type GuideNow } from './guide';

const start: GuideNow = { waterCells: 400, trees: 100, pathCells: 8 };

describe('はじめの案内', () => {
  it('新しく始めるまでは出ない。前からのセーブ（記録なし）にも出さない', () => {
    const g = new Guide();
    expect(g.active).toBe(false);
    expect(g.progress(start)).toBeNull();
    g.restore(undefined);
    expect(g.active).toBe(false);
  });

  it('池を掘る→木→道→集める→売る→目標、の順に進む', () => {
    const g = new Guide();
    g.start(start);
    expect(g.progress(start)).toMatchObject({ index: 1, total: GUIDE_STEPS.length, value: 0, ratio: 0 });
    expect(g.progress(start)!.step.id).toBe('dig');

    const now = { ...start };
    now.waterCells += 20;
    expect(g.update(now)).toEqual([]);
    expect(g.progress(now)).toMatchObject({ value: 20, ratio: 0.5, text: '20 / 40マス' });
    now.waterCells += 20;
    expect(g.update(now).map((s) => s.id)).toEqual(['dig']);
    expect(g.progress(now)!.step.id).toBe('tree');

    now.trees += 5;
    expect(g.update(now).map((s) => s.id)).toEqual(['tree']);
    now.pathCells += 10;
    expect(g.update(now).map((s) => s.id)).toEqual(['path']);
    g.note('collect', 3);
    expect(g.update(now).map((s) => s.id)).toEqual(['collect']);
    g.note('sell');
    expect(g.update(now).map((s) => s.id)).toEqual(['sell']);
    expect(g.progress(now)!.step.id).toBe('goals');
    expect(g.progress(now)!.text).toBe('');
    g.note('goals');
    expect(g.update(now).map((s) => s.id)).toEqual(['goals']);
    expect(g.active).toBe(false);
    expect(g.progress(now)).toBeNull();
  });

  it('先に済ませていた手順は、まとめて進む', () => {
    const g = new Guide();
    g.start(start);
    // 池を掘る前に、木を植えて道ものばしていた
    const now = { waterCells: start.waterCells, trees: start.trees + 8, pathCells: start.pathCells + 12 };
    expect(g.update(now)).toEqual([]);
    now.waterCells += 40;
    expect(g.update(now).map((s) => s.id)).toEqual(['dig', 'tree', 'path']);
    expect(g.progress(now)!.step.id).toBe('collect');
  });

  it('数が減っても進み具合は 0 より下がらず、目標より上にも出ない', () => {
    const g = new Guide();
    g.start(start);
    // 夏の日照りで池が小さくなった
    expect(g.progress({ ...start, waterCells: 350 })).toMatchObject({ value: 0, ratio: 0 });
    expect(g.progress({ ...start, waterCells: 1000 })).toMatchObject({ value: 40, ratio: 1 });
  });

  it('途中でやめられる。やめたあとの記録は数えない', () => {
    const g = new Guide();
    g.start(start);
    g.skip();
    expect(g.active).toBe(false);
    g.note('sell');
    expect(g.state.sold).toBe(0);
    expect(g.update({ ...start, waterCells: 9999 })).toEqual([]);
    // 遊び方から、もう一度始められる
    g.start(start);
    expect(g.progress(start)!.index).toBe(1);
  });

  it('保存して読み直せる', () => {
    const g = new Guide();
    g.start(start);
    g.update({ ...start, waterCells: 470 });
    g.note('collect', 2);
    const again = new Guide();
    again.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(again.state).toEqual(g.state);
    expect(again.progress(start)!.step.id).toBe('tree');
  });
});
