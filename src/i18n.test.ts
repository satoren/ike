import { describe, expect, it } from 'vitest';
import { detectLocale, matchLocale, setDictionary, t, LOCALES } from './i18n';
import en from './locales/en';
import zhHans from './locales/zh-Hans';
import zhHant from './locales/zh-Hant';
import ko from './locales/ko';
import es from './locales/es';

const DICTS = { en, 'zh-Hans': zhHans, 'zh-Hant': zhHant, ko, es };

/** ソースの t('…') に書かれた日本語（辞書のキー）を集める */
function usedKeys(): Set<string> {
  const sources = import.meta.glob(['./*.ts', '!./*.test.ts', '!./i18n.ts'], { query: '?raw', import: 'default', eager: true });
  const keys = new Set<string>();
  for (const src of Object.values(sources) as string[]) {
    for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) {
      keys.add(m[1].replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
    }
  }
  return keys;
}

const placeholders = (s: string) => new Set(s.match(/\{\d+\}/g) ?? []);

describe('i18n', () => {
  it('ブラウザの言語を対応する言語に寄せる', () => {
    expect(matchLocale('ja-JP')).toBe('ja');
    expect(matchLocale('en-GB')).toBe('en');
    expect(matchLocale('zh-CN')).toBe('zh-Hans');
    expect(matchLocale('zh-TW')).toBe('zh-Hant');
    expect(matchLocale('zh-HK')).toBe('zh-Hant');
    expect(matchLocale('zh-Hant-TW')).toBe('zh-Hant');
    expect(matchLocale('ko-KR')).toBe('ko');
    expect(matchLocale('es-MX')).toBe('es');
    expect(matchLocale('fr-FR')).toBeNull();
  });

  it('保存した選択を優先し、合う言語が無ければ英語', () => {
    expect(detectLocale('ko', ['ja-JP'])).toBe('ko');
    expect(detectLocale(null, ['fr-FR', 'es-ES'])).toBe('es');
    expect(detectLocale(null, ['fr-FR'])).toBe('en');
    expect(detectLocale('xx', ['ja'])).toBe('ja');
  });

  it('値を差し込み、訳が無ければ日本語のまま', () => {
    setDictionary({ '{0}日目': 'Day {0}' });
    expect(t('{0}日目', 3)).toBe('Day 3');
    expect(t('未訳の文言')).toBe('未訳の文言');
    setDictionary({ 匹: '' });
    expect(t('匹')).toBe('');
    setDictionary({});
    expect(t('{0}を{1}', 'A', 'B')).toBe('AをB');
  });

  it('すべての言語に辞書がある', () => {
    expect(Object.keys(DICTS).sort()).toEqual(LOCALES.filter((l) => l !== 'ja').sort());
  });

  const keys = usedKeys();
  for (const [name, dict] of Object.entries(DICTS)) {
    it(`${name}: 画面の文言がすべて訳されている`, () => {
      const missing = [...keys].filter((k) => !(k in dict));
      expect(missing).toEqual([]);
    });
    it(`${name}: 使われていない訳が無く、差し込む値が合っている`, () => {
      const extra = Object.keys(dict).filter((k) => !keys.has(k));
      expect(extra).toEqual([]);
      const bad = Object.entries(dict).filter(([k, v]) => [...placeholders(v)].some((p) => !placeholders(k).has(p)));
      expect(bad).toEqual([]);
    });
  }
});
