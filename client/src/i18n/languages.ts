export type LangCode =
  | 'id'
  | 'en'
  | 'es'
  | 'fr'
  | 'de'
  | 'pt'
  | 'it'
  | 'nl'
  | 'ru'
  | 'ar'
  | 'tr'
  | 'zh'
  | 'ja'
  | 'ko';

export interface LangDef {
  code: LangCode;
  english: string;
  native: string;
  locale: string;
  rtl?: boolean;
}

export const LANGUAGES: LangDef[] = [
  { code: 'id', english: 'Indonesian', native: 'Bahasa Indonesia', locale: 'id-ID' },
  { code: 'en', english: 'English', native: 'English', locale: 'en-US' },
  { code: 'es', english: 'Spanish', native: 'Español', locale: 'es-ES' },
  { code: 'fr', english: 'French', native: 'Français', locale: 'fr-FR' },
  { code: 'de', english: 'German', native: 'Deutsch', locale: 'de-DE' },
  { code: 'pt', english: 'Portuguese', native: 'Português', locale: 'pt-BR' },
  { code: 'it', english: 'Italian', native: 'Italiano', locale: 'it-IT' },
  { code: 'nl', english: 'Dutch', native: 'Nederlands', locale: 'nl-NL' },
  { code: 'ru', english: 'Russian', native: 'Русский', locale: 'ru-RU' },
  { code: 'ar', english: 'Arabic', native: 'العربية', locale: 'ar-SA', rtl: true },
  { code: 'tr', english: 'Turkish', native: 'Türkçe', locale: 'tr-TR' },
  { code: 'zh', english: 'Chinese (Simplified)', native: '中文（简体）', locale: 'zh-CN' },
  { code: 'ja', english: 'Japanese', native: '日本語', locale: 'ja-JP' },
  { code: 'ko', english: 'Korean', native: '한국어', locale: 'ko-KR' },
];

export const DEFAULT_LANG: LangCode = 'id';

export function isLangCode(v: unknown): v is LangCode {
  return typeof v === 'string' && LANGUAGES.some((l) => l.code === v);
}

export function langToLocale(code: LangCode): string {
  return LANGUAGES.find((l) => l.code === code)?.locale ?? 'id-ID';
}

export function isRtl(code: LangCode): boolean {
  return !!LANGUAGES.find((l) => l.code === code)?.rtl;
}