import { describe as suite, expect, it } from 'vitest';
import { emptyInventory } from './ecology';
import {
  Requests,
  candidates,
  clientOf,
  describe,
  dueText,
  progressOf,
  type ParkNow,
  type Request,
  type RequestKind,
} from './requests';

function seq(seed = 1): () => number {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
}

const park = (over: Partial<ParkNow> = {}): ParkNow => ({
  time: 2,
  wild: { fruit: 0, rabbit: 0, duck: 0, fish: 0, fox: 0 },
  inventory: emptyInventory(),
  watchable: [],
  treesNearWater: 10,
  waterCells: 400,
  safety: 1,
  pressure: 0,
  incident: false,
  income: 2000,
  ...over,
});

const kinds = (list: Request[]) => list.map((r) => r.kind).sort();

/** 決まった種類のお願いが届いた状態にする */
function withActive(kind: RequestKind, now: ParkNow, seed = 1): { requests: Requests; request: Request } {
  for (let s = seed; s < seed + 200; s++) {
    const requests = new Requests(seq(s));
    const e = requests.onNewDay(now);
    if (e[0]?.type === 'offered' && e[0].request.kind === kind) return { requests, request: e[0].request };
  }
  throw new Error(`${kind} のお願いが出ません`);
}

suite('candidates', () => {
  it('何も無い園でも、木を植える・池を広げるお願いは出る', () => {
    expect(kinds(candidates(park(), seq()))).toEqual(['dig', 'plant']);
  });

  it('届けるお願いは、野外に十分いるものだけを、残りが出る数で頼む', () => {
    expect(candidates(park({ wild: { fruit: 0, rabbit: 0, duck: 0, fish: 5, fox: 0 } }), seq()).some((r) => r.kind === 'deliver')).toBe(false);
    for (let s = 1; s < 20; s++) {
      const r = candidates(park({ wild: { fruit: 0, rabbit: 0, duck: 0, fish: 7, fox: 0 } }), seq(s)).find((c) => c.kind === 'deliver')!;
      expect(r.subject).toBe('fish');
      expect(r.target).toBeGreaterThanOrEqual(3);
      expect(r.target).toBeLessThanOrEqual(4); // 7匹のうち 3匹は残す
    }
  });

  it('増やすお願いは、いま居て上限に届いていない生き物だけ', () => {
    const w = (count: number, cap: number, max = 3) => [{ id: 'kingfisher', name: 'カワセミ', counter: '羽', count, cap, max }];
    const has = (list: ReturnType<typeof w>) => candidates(park({ watchable: list }), seq()).some((r) => r.kind === 'watch');
    expect(has(w(0, 0))).toBe(false);
    expect(has(w(3, 3))).toBe(false);
    // まだ集まっている途中（待てば増える）なら頼まない
    expect(has(w(1, 2))).toBe(false);
    for (let s = 1; s < 20; s++) {
      const r = candidates(park({ watchable: w(2, 2) }), seq(s)).find((c) => c.kind === 'watch')!;
      expect(r.target).toBe(3);
      expect(r.name).toBe('カワセミ');
    }
    // いまの園の作りでは届かない数を頼む
    for (let s = 1; s < 20; s++) {
      const r = candidates(park({ watchable: w(3, 3, 8) }), seq(s)).find((c) => c.kind === 'watch')!;
      expect(r.target).toBeGreaterThan(3);
      expect(r.target).toBeLessThanOrEqual(5);
    }
  });

  it('園の様子に合ったお願いだけが出る', () => {
    expect(candidates(park({ safety: 0.5 }), seq()).some((r) => r.kind === 'safety')).toBe(true);
    expect(candidates(park({ safety: 1 }), seq()).some((r) => r.kind === 'safety')).toBe(false);
    expect(candidates(park({ pressure: 20 }), seq()).some((r) => r.kind === 'noHarvest')).toBe(true);
    expect(candidates(park({ pressure: 0 }), seq()).some((r) => r.kind === 'noHarvest')).toBe(false);
    const foxes = { fruit: 0, rabbit: 0, duck: 0, fish: 0, fox: 2 };
    expect(candidates(park({ wild: foxes }), seq()).some((r) => r.kind === 'noIncident')).toBe(true);
    expect(candidates(park({ wild: foxes, incident: true }), seq()).some((r) => r.kind === 'noIncident')).toBe(false);
    expect(candidates(park({ waterCells: 5000 }), seq()).some((r) => r.kind === 'dig')).toBe(false);
  });

  it('報酬は入園料に合わせて増え、最低額を下回らない', () => {
    const plant = (income: number) => candidates(park({ income }), seq()).find((r) => r.kind === 'plant')!.reward;
    expect(plant(0)).toBe(300);
    expect(plant(10000)).toBe(2000);
    expect(plant(10000) % 10).toBe(0);
  });
});

suite('Requests', () => {
  it('朝に 1件届き、同じ日にもう 1件は届かない', () => {
    const requests = new Requests(seq(2));
    const first = requests.onNewDay(park({ time: 2 }));
    expect(first.map((e) => e.type)).toEqual(['offered']);
    expect(requests.active).not.toBeNull();
    requests.dismiss();
    expect(requests.active).toBeNull();
    expect(requests.onNewDay(park({ time: 2.5 }))).toHaveLength(0);
    expect(requests.onNewDay(park({ time: 3 })).map((e) => e.type)).toEqual(['offered']);
  });

  it('同じ種類のお願いは続かない', () => {
    const requests = new Requests(seq(4));
    let last: RequestKind | null = null;
    for (let day = 2; day < 40; day++) {
      const e = requests.onNewDay(park({ time: day }));
      const offered = e.find((v) => v.type === 'offered')!;
      expect(offered.request.kind).not.toBe(last);
      last = offered.request.kind;
      requests.dismiss();
    }
  });

  it('増やすお願いは、数を満たすと達成になる', () => {
    const now = park({ treesNearWater: 10, waterCells: 5000 });
    const { requests, request } = withActive('plant', now);
    expect(requests.update(park({ treesNearWater: 10 + request.target - 1, waterCells: 5000 }))).toHaveLength(0);
    const p = progressOf(request, park({ treesNearWater: 10 + request.target - 1 }));
    expect(p.text).toBe(`${request.target - 1} / ${request.target}本`);
    const done = requests.update(park({ treesNearWater: 10 + request.target, waterCells: 5000 }));
    expect(done.map((e) => e.type)).toEqual(['done']);
    expect(requests.active).toBeNull();
    expect(requests.state.completed).toBe(1);
  });

  it('届けるお願いは、かごに数がそろってから届けると達成。かごから減る', () => {
    const wild = { fruit: 0, rabbit: 0, duck: 0, fish: 12, fox: 0 };
    const { requests, request } = withActive('deliver', park({ wild, waterCells: 5000 }));
    const inventory = emptyInventory();
    inventory.fish = request.target - 1;
    // かごに入れただけでは達成にならない
    expect(requests.update(park({ wild, inventory }))).toHaveLength(0);
    expect(requests.deliver(inventory)).toBeNull();
    expect(progressOf(request, park({ inventory })).ready).toBe(false);
    inventory.fish = request.target + 2;
    expect(progressOf(request, park({ inventory })).ready).toBe(true);
    expect(requests.deliver(inventory)?.type).toBe('done');
    expect(inventory.fish).toBe(2);
    expect(requests.deliver(inventory)).toBeNull();
  });

  it('期限が過ぎると、応えられなかったお願いは流れる', () => {
    const { requests, request } = withActive('plant', park({ time: 2, waterCells: 5000 }));
    expect(request.dueDay).toBe(3);
    expect(dueText(request, 2)).toBe('明日まで');
    expect(dueText(request, 3)).toBe('今日中');
    // 期限の日の朝はまだ続いている
    expect(requests.onNewDay(park({ time: 3 }))).toHaveLength(0);
    const e = requests.onNewDay(park({ time: 4 }));
    expect(e[0].type).toBe('expired');
    expect(e[1].type).toBe('offered');
    expect(requests.state.completed).toBe(0);
  });

  it('採らないお願いは、採ると失敗、期限まで守ると達成', () => {
    const now = park({ time: 2, pressure: 30, waterCells: 5000 });
    const a = withActive('noHarvest', now);
    expect(a.requests.noteIncident()).toBeNull();
    expect(a.requests.noteHarvest()?.type).toBe('failed');
    expect(a.requests.active).toBeNull();

    const b = withActive('noHarvest', now);
    expect(b.request.dueDay).toBe(2);
    expect(progressOf(b.request, park({ time: 2.5 })).ratio).toBeCloseTo(0.5);
    expect(b.requests.update(park({ time: 2.9 }))).toHaveLength(0);
    const e = b.requests.onNewDay(park({ time: 3 }));
    expect(e[0].type).toBe('done');
    expect(b.requests.state.completed).toBe(1);
  });

  it('事件を起こさないお願いは、襲撃があると失敗する', () => {
    const wild = { fruit: 0, rabbit: 0, duck: 0, fish: 0, fox: 2 };
    const { requests } = withActive('noIncident', park({ wild, waterCells: 5000 }));
    expect(requests.noteHarvest()).toBeNull();
    const e = requests.noteIncident();
    expect(e?.type).toBe('failed');
  });

  it('お願いが無いときは、採っても事件があっても何も起きない', () => {
    const requests = new Requests(seq());
    expect(requests.noteHarvest()).toBeNull();
    expect(requests.noteIncident()).toBeNull();
    expect(requests.update(park())).toHaveLength(0);
    expect(requests.deliver(emptyInventory())).toBeNull();
    expect(requests.dismiss()).toBeNull();
  });

  it('保存と読み込みで、進行中のお願いと応えた数が残る', () => {
    const { requests, request } = withActive('plant', park({ waterCells: 5000 }));
    requests.state.completed = 3;
    const again = new Requests(seq());
    again.restore(JSON.parse(JSON.stringify(requests.snapshot())));
    expect(again.active).toEqual(request);
    expect(again.state.completed).toBe(3);
    again.restore(undefined);
    expect(again.active).toBeNull();
  });

  it('どのお願いにも依頼主と文面がある', () => {
    const now = park({
      wild: { fruit: 100, rabbit: 10, duck: 10, fish: 10, fox: 2 },
      watchable: [{ id: 'frog', name: 'カエル', counter: '匹', count: 2, cap: 2, max: 8 }],
      safety: 0.4,
      pressure: 20,
    });
    const all = candidates(now, seq());
    expect(kinds(all)).toEqual(['deliver', 'dig', 'noHarvest', 'noIncident', 'plant', 'safety', 'watch']);
    for (const r of all) {
      expect(clientOf(r).length).toBeGreaterThan(0);
      const t = describe(r);
      expect(t.title).not.toContain('undefined');
      expect(t.short.length).toBeGreaterThan(0);
    }
  });
});
