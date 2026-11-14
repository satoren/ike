/**
 * 多言語対応。
 *
 * 文言は日本語のまま書き、`t('日本語')` で包む。日本語そのものが辞書のキーになり、
 * 訳が無い言語では日本語がそのまま出る。差し込む値は `{0}` `{1}` … で書き、引数で渡す。
 *   t('{0}G で売れました', price)
 *
 * 言語は起動時に一度だけ決める（保存した選択 → ブラウザの言語 → 日本語）。
 * 画面の多くは起動時に組み立てるので、切り替えたら保存してページを読み直す。
 * 辞書は選んだ言語の分だけ読み込む（日本語なら何も読まない）。
 */

export const LOCALES = ['ja', 'en', 'zh-Hans', 'zh-Hant', 'ko', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

/** 言語の選択肢に出す名前（その言語自身の書き方） */
export const LOCALE_NAMES: Record<Locale, string> = {
  ja: '日本語',
  en: 'English',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  ko: '한국어',
  es: 'Español',
};

/** html の lang 属性に入れる値 */
const HTML_LANG: Record<Locale, string> = {
  ja: 'ja',
  en: 'en',
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  ko: 'ko',
  es: 'es',
};

export const LOCALE_KEY = 'ike-locale';

export type Dictionary = Record<string, string>;

/** ブラウザの言語（'en-US' や 'zh-TW' など）を、対応している言語に寄せる */
export function matchLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const lower = tag.toLowerCase();
  if ((LOCALES as readonly string[]).includes(tag)) return tag as Locale;
  if (lower.startsWith('zh')) {
    // 繁体字を使う地域（台湾・香港・マカオ）と、明示的な Hant
    if (/hant|-tw|-hk|-mo/.test(lower)) return 'zh-Hant';
    return 'zh-Hans';
  }
  const base = lower.split('-')[0];
  return (LOCALES as readonly string[]).includes(base) ? (base as Locale) : null;
}

/** 保存した選択、無ければブラウザの言語の順に選ぶ。どれも合わなければ英語（日本語の人は ja が当たる） */
export function detectLocale(saved: string | null, languages: readonly string[]): Locale {
  const fromSaved = matchLocale(saved);
  if (fromSaved) return fromSaved;
  for (const l of languages) {
    const m = matchLocale(l);
    if (m) return m;
  }
  return languages.length > 0 ? 'en' : 'ja';
}

function readSaved(): string | null {
  try {
    return localStorage.getItem(LOCALE_KEY);
  } catch {
    return null;
  }
}

const loaders: Record<Exclude<Locale, 'ja'>, () => Promise<{ default: Dictionary }>> = {
  en: () => import('./locales/en'),
  'zh-Hans': () => import('./locales/zh-Hans'),
  'zh-Hant': () => import('./locales/zh-Hant'),
  ko: () => import('./locales/ko'),
  es: () => import('./locales/es'),
};

// テスト（node）では画面が無いので日本語のまま
const inBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

export const locale: Locale = inBrowser
  ? detectLocale(readSaved(), navigator.languages?.length ? navigator.languages : [navigator.language])
  : 'ja';

let dict: Dictionary = {};
if (locale !== 'ja') {
  try {
    dict = (await loaders[locale]()).default;
  } catch {
    dict = {};
  }
}
if (inBrowser) {
  document.documentElement.lang = HTML_LANG[locale];
  document.title = t('池づくり');
}

/** 辞書を差し替える（テスト用） */
export function setDictionary(d: Dictionary): void {
  dict = d;
}

/** 文言を訳し、{0} {1} … に値を入れる */
export function t(key: string, ...args: unknown[]): string {
  const s = dict[key] ?? key;
  if (args.length === 0) return s;
  return s.replace(/\{(\d+)\}/g, (m, i) => (Number(i) < args.length ? String(args[Number(i)]) : m));
}

/** 言語を切り替える。保存してから読み直す（画面を作り直すため） */
export function changeLocale(next: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, next);
  } catch {
    // 保存できなくても、このページの間は切り替える
  }
  location.reload();
}
