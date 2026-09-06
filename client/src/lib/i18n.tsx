import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_LANG, isLangCode, langToLocale, isRtl, type LangCode } from '../i18n/languages';
import id from '../i18n/id';
import en from '../i18n/en';
import es from '../i18n/es';
import fr from '../i18n/fr';
import de from '../i18n/de';
import pt from '../i18n/pt';
import it from '../i18n/it';
import nl from '../i18n/nl';
import ru from '../i18n/ru';
import ar from '../i18n/ar';
import tr from '../i18n/tr';
import zh from '../i18n/zh';
import ja from '../i18n/ja';
import ko from '../i18n/ko';

type Dict = Record<string, string>;

const DICTS: Record<string, Dict> = { id, en, es, fr, de, pt, it, nl, ru, ar, tr, zh, ja, ko };

const STORAGE_KEY = 'helpyou-lang';

export function getStoredLang(): LangCode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && isLangCode(v)) return v;
  } catch { /* ignore */ }
  return DEFAULT_LANG;
}

export function translate(lang: LangCode, key: string, vars?: Record<string, string | number | null | undefined>): string {
  let out = DICTS[lang]?.[key] ?? key;
  if (out === key && lang !== 'id' && lang !== 'en') out = DICTS.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v ?? ''));
  }
  return out;
}

export interface I18nValue {
  lang: LangCode;
  t: (key: string, vars?: Record<string, string | number | null | undefined>) => string;
  setLang: (code: LangCode) => void;
  locale: string;
  rtl: boolean;
}

export const I18nContext = createContext<I18nValue>({
  lang: DEFAULT_LANG,
  t: (key) => key,
  setLang: () => {},
  locale: 'id-ID',
  rtl: false,
});

let currentLang: LangCode = getStoredLang();

export function setModuleLang(code: LangCode): void {
  currentLang = code;
}

/** Hook-free translator for helper modules that render strings outside React components. */
export function tGlobal(key: string, vars?: Record<string, string | number | null | undefined>): string {
  return translate(currentLang, key, vars);
}

/** Hook-free locale code (e.g. 'id-ID') for formatting in helper modules. */
export function getCurrentLocale(): string {
  return langToLocale(currentLang);
}

const SERVER_PREFIXES = [
  { prefix: 'Folder tidak ditemukan: ', key: 'Folder tidak ditemukan: ' },
  { prefix: 'Bukan folder: ', key: 'Bukan folder: ' },
  { prefix: 'Tidak dapat membaca folder: ', key: 'Tidak dapat membaca folder: ' },
];

/** Translates a server/electron error message (Indonesian) into the current language. */
export function translateServerMessage(msg: string): string {
  if (!msg) return msg;
  const exact = translate(currentLang, msg);
  if (exact !== msg) return exact;
  for (const { prefix, key } of SERVER_PREFIXES) {
    if (msg.startsWith(prefix)) return translate(currentLang, key) + msg.slice(prefix.length);
  }
  const pw = msg.match(/^Sandi minimal (\d+) karakter\.$/);
  if (pw) return translate(currentLang, 'Sandi minimal {n} karakter.', { n: Number(pw[1]) });
  return msg;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(getStoredLang);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('dir', isRtl(lang) ? 'rtl' : 'ltr');
    root.setAttribute('lang', lang);
  }, [lang]);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      t: (key, vars) => translate(lang, key, vars),
      setLang: (code) => {
        try {
          localStorage.setItem(STORAGE_KEY, code);
        } catch { /* ignore */ }
        setModuleLang(code);
        setLangState(code);
      },
      locale: langToLocale(lang),
      rtl: isRtl(lang),
    }),
    [lang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}