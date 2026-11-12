import { describe, expect, it } from 'vitest';
import { validateFeedback, type FeedbackPayload } from './feedback';
// @ts-expect-error 中継は素の JS
import { jstDay, normalize, sameKey, summarize, toEntry } from '../feedback-worker/src/index.js';

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
  });

  it('日付の区切りは日本時間', () => {
    // 2026-11-12 14:59 UTC = 23:59 JST、15:00 UTC = 翌 0:00 JST
    expect(jstDay(Date.UTC(2026, 10, 12, 14, 59)).day).toBe('2026-11-12');
    expect(jstDay(Date.UTC(2026, 10, 12, 15, 0)).day).toBe('2026-11-13');
    expect(jstDay(Date.UTC(2026, 10, 12, 15, 0)).start).toBe(Date.UTC(2026, 10, 12, 15, 0));
  });

  it('同じ内容（空白や記号の違いは無視）はまとめて数え、多い順に並べる', () => {
    expect(normalize('橋が ほしい！')).toBe(normalize('橋がほしい'));
    const row = (t: number, kind: string, message: string) => ({ ...toEntry({ ...base, kind, message }, t) });
    const s = summarize([row(1, 'idea', '池に魚を'), row(2, 'idea', '橋がほしい'), row(3, 'idea', '橋が ほしい！'), row(4, 'bug', '止まった'), row(5, 'idea', '橋がほしい')]);
    expect(s.total).toBe(5);
    expect(s.counts).toEqual({ bug: 1, idea: 4, comment: 0 });
    expect(s.items.idea.map((g: { count: number }) => g.count)).toEqual([3, 1]);
    expect(s.items.idea[0]).toMatchObject({ message: '橋がほしい', first: 2, last: 5 });
    expect(s.versions).toEqual({ abc1234: 5 });
  });

  it('合言葉は完全に一致したときだけ通す', () => {
    expect(sameKey('secret', 'secret')).toBe(true);
    expect(sameKey('secre', 'secret')).toBe(false);
    expect(sameKey('', '')).toBe(false);
    expect(sameKey('x', undefined)).toBe(false);
  });
});
