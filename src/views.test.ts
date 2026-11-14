import { describe, expect, it } from 'vitest';
import { Heightmap } from './heightmap';
import { PathGrid } from './paths';
import { NO_VIEW, VIEW, ViewMap, describeView, viewScore, type ViewScene } from './views';

const WATER = 0.5;

function flatMap(): Heightmap {
  const map = new Heightmap(32);
  map.heights.fill(2);
  return map;
}

const empty = (): ViewScene => ({ trees: [], flowers: [], rocks: [], islands: [], landmarks: [] });

/** 出入口の道（z=27〜31）の、いちばん奥のマスの中心 */
function pathEnd(grid: PathGrid): { x: number; z: number; cx: number; cz: number } {
  const [cx] = grid.entrance[0];
  return { ...grid.center(cx, 27), cx, cz: 27 };
}

describe('道からの眺め', () => {
  it('種類が増えるほど 1マスの魅力が上がり、4種類で頭打ちになる', () => {
    expect(viewScore(0)).toBeCloseTo(0.15);
    expect(viewScore(1)).toBeCloseTo(0.6); // これまでの水辺の道と同じ
    expect(viewScore(2)).toBeGreaterThan(viewScore(1));
    expect(viewScore(4)).toBeGreaterThan(viewScore(3));
    expect(viewScore(6)).toBe(viewScore(VIEW.maxKinds));
  });

  it('何も無い園では、どの道も眺めが無い', () => {
    const map = flatMap();
    const grid = new PathGrid(map);
    const views = new ViewMap(map, WATER);
    views.survey(grid, empty());
    expect(views.cells).toBe(grid.connectedCount);
    expect(views.plain).toBe(views.cells);
    expect(views.total).toBeCloseTo(views.cells * 0.15);
    expect(views.rich).toBe(0);
  });

  it('道でないマスや、つながっていない道は数えない', () => {
    const map = flatMap();
    const grid = new PathGrid(map);
    const far = grid.center(3, 3);
    grid.paint(far.x, far.z, 0.6);
    const views = new ViewMap(map, WATER);
    views.survey(grid, empty());
    expect(views.counts[3 * 32 + 3]).toBe(NO_VIEW);
    expect(views.kindsAt(3, 3)).toBeNull();
    expect(views.kindsAt(0, 0)).toBeNull();
    expect(views.cells).toBe(grid.connectedCount);
  });

  it('近くの池は水面として見え、遠い池は見えない', () => {
    const map = flatMap();
    const grid = new PathGrid(map);
    const end = pathEnd(grid);
    map.set(end.cx, end.cz - 3, 0); // 3マス先に水
    map.set(2, 2, 0); // 遠くの水
    const views = new ViewMap(map, WATER);
    views.survey(grid, empty());
    expect(views.kindsAt(end.cx, end.cz)).toEqual(['water']);
    // 出入口のマス（z=31）からは 7マス離れているので見えない
    expect(views.kindsAt(end.cx, 31)).toEqual([]);
  });

  it('木は 3本そろって木立になる', () => {
    const map = flatMap();
    const grid = new PathGrid(map);
    const end = pathEnd(grid);
    const views = new ViewMap(map, WATER);
    const tree = (dx: number) => ({ x: end.x + dx, z: end.z - 2 });
    views.survey(grid, { ...empty(), trees: [tree(-1), tree(0)] });
    expect(views.kindsAt(end.cx, end.cz)).toEqual([]);
    views.survey(grid, { ...empty(), trees: [tree(-1), tree(0), tree(1)] });
    expect(views.kindsAt(end.cx, end.cz)).toEqual(['grove']);
  });

  it('同じものを増やしても種類は増えず、違うものを足すと増える', () => {
    const map = flatMap();
    const grid = new PathGrid(map);
    const end = pathEnd(grid);
    const views = new ViewMap(map, WATER);
    const at = (dx: number, dz: number) => ({ x: end.x + dx, z: end.z + dz });
    views.survey(grid, { ...empty(), flowers: [at(-2, 0)] });
    const one = views.total;
    views.survey(grid, { ...empty(), flowers: [at(-2, 0), at(-3, 0), at(-2, -1), at(-3, -1)] });
    expect(views.kindsAt(end.cx, end.cz)).toEqual(['flower']);
    expect(views.total).toBeCloseTo(one); // 花畑だけを増やしても魅力は増えない
    views.survey(grid, { ...empty(), flowers: [at(-2, 0)], rocks: [at(2, 0)], landmarks: [at(0, -2)] });
    expect(views.kindsAt(end.cx, end.cz)).toEqual(['flower', 'rock', 'landmark']);
    expect(views.total).toBeGreaterThan(one);
    expect(views.rich).toBeGreaterThan(0);
  });

  it('小島も眺めになる', () => {
    const map = flatMap();
    const grid = new PathGrid(map);
    const end = pathEnd(grid);
    const views = new ViewMap(map, WATER);
    views.survey(grid, { ...empty(), islands: [{ x: end.x, z: end.z - 4 }] });
    expect(views.kindsAt(end.cx, end.cz)).toEqual(['island']);
  });

  it('眺めをひとことで説明する', () => {
    expect(describeView([])).toContain('何も見えません');
    expect(describeView(['water', 'grove'])).toContain('水面・木立（2種類）');
    expect(describeView(['water', 'grove'])).toContain('あと 2種類');
    expect(describeView(['water', 'grove', 'flower', 'rock'])).not.toContain('あと');
  });

  it('平均の眺めが求まる', () => {
    const map = flatMap();
    const grid = new PathGrid(map);
    const views = new ViewMap(map, WATER);
    views.survey(grid, empty());
    expect(views.average).toBe(0);
    const end = pathEnd(grid);
    views.survey(grid, { ...empty(), rocks: [{ x: end.x, z: end.z + 2 }] });
    expect(views.average).toBeCloseTo(1); // 道は 5マスの長さなので、どのマスからも岩が見える
  });
});
