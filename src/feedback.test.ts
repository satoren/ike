import { describe, expect, it } from 'vitest';
import { validateFeedback, type FeedbackPayload } from './feedback';
// @ts-expect-error 中継は素の JS
import { jstDay, mergeBacklog, sameKey, summarize, toEntry } from '../feedback-worker/src/index.js';

const base: FeedbackPayload = { kind: 'bug', message: 'キツネが遊歩道で客を襲った', version: 'abc1234', userAgent: 'UA', screen: '390×844 @3x', context: { ランク: '★2' } };

describe('フィードバックの入力', () => {
  it('短すぎる・長すぎる・種類違いは送れない', () => {
    expect(validateFeedback({ kind: 'bug', message: ' a ' })).not.toBeNull();
    expect(validateFeedback({ kind: 'bug', message: 'x'.repeat(2001) })).not.toBeNull();
    expect(validateFeedback({ kind: 'nope' as never, message: 'ちゃんとした文' })).not.toBeNull();
    expect(validateFeedback({ kind: 'idea', message: '橋をかけたい' })).toBeNull();
  });
});

describe('中継', () => {
  it('おかしな投稿は保存しない', () => {
    expect(toEntry({ ...base, kind: 'x' }, 0)).toBeNull();
    expect(toEntry({ ...base, kind: 'toString' }, 0)).toBeNull();
    expect(toEntry({ ...base, message: 'a' }, 0)).toBeNull();
    expect(toEntry(base, 0).env['ランク']).toBe('★2');
    expect(toEntry({ ...base, locale: 'en' }, 0).env['言語']).toBe('en');
    expect(toEntry(base, 0).env['言語']).toBeUndefined();
  });

  it('日付の区切りは日本時間', () => {
    // 2026-11-12 14:59 UTC = 23:59 JST、15:00 UTC = 翌 0:00 JST
    expect(jstDay(Date.UTC(2026, 10, 12, 14, 59)).day).toBe('2026-11-12');
    expect(jstDay(Date.UTC(2026, 10, 12, 15, 0)).day).toBe('2026-11-13');
    expect(jstDay(Date.UTC(2026, 10, 12, 15, 0)).start).toBe(Date.UTC(2026, 10, 12, 15, 0));
  });

  it('種類ごとに 1 件ずつ届いた順に並べる（同じ文面でも束ねない）', () => {
    const row = (t: number, kind: string, message: string) => ({ ...toEntry({ ...base, kind, message }, t) });
    const s = summarize([row(1, 'idea', '池に魚を'), row(2, 'idea', '橋がほしい'), row(3, 'idea', '橋が ほしい！'), row(4, 'bug', '止まった'), row(5, 'idea', '橋がほしい')]);
    expect(s.total).toBe(5);
    expect(s.counts).toEqual({ bug: 1, idea: 4, comment: 0 });
    expect(s.items.idea.map((g: { message: string }) => g.message)).toEqual(['池に魚を', '橋がほしい', '橋が ほしい！', '橋がほしい']);
    expect(s.items.idea[1]).toMatchObject({ count: 1, first: 2, last: 2 });
    expect(s.versions).toEqual({ abc1234: 5 });
  });

  it('合言葉は完全に一致したときだけ通す', () => {
    expect(sameKey('secret', 'secret')).toBe(true);
    expect(sameKey('secre', 'secret')).toBe(false);
    expect(sameKey('', '')).toBe(false);
    expect(sameKey('x', undefined)).toBe(false);
  });

  describe('改善リスト', () => {
    const item = { title: '橋をかけたい', kind: 'idea', status: 'open', count: 3, first_day: '2026-11-10', last_day: '2026-11-11', samples: ['橋がほしい'], note: '', pr: '' };

    it('翌日も同じ話が来たら件数と日付を足し、例は重ならず 5 件まで', () => {
      const n = mergeBacklog(item, { add_count: 4, day: '2026-11-12', samples: ['橋がほしい', 'a', 'b', 'c', 'd', 'e'] }, 1);
      expect(n).toMatchObject({ count: 7, first_day: '2026-11-10', last_day: '2026-11-12', status: 'open' });
      expect(n.samples).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(item.count).toBe(3);
    });

    it('済にしたものにまた同じ話が来たら未対応に戻す', () => {
      const done = mergeBacklog(item, { status: 'done', pr: 'https://github.com/satoren/ike/pull/99' }, 1);
      expect(done.status).toBe('done');
      expect(mergeBacklog(done, { add_count: 1, day: '2026-11-12' }, 2).status).toBe('open');
      // 同じ日の残りを足しただけなら戻さない
      expect(mergeBacklog(done, { add_count: 1, day: '2026-11-11' }, 2).status).toBe('done');
    });

    it('知らない状態は受け付けない', () => {
      expect(() => mergeBacklog(item, { status: 'nope' }, 1)).toThrow();
    });
  });
});
