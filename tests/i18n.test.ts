import { describe, it, expect, beforeAll } from 'vitest';
import { translate, translateServerMessage, getStoredLang, setModuleLang, tGlobal } from '@/lib/i18n';
import en from '@/i18n/en';
import es from '@/i18n/es';
import fr from '@/i18n/fr';
import de from '@/i18n/de';
import pt from '@/i18n/pt';
import nld from '@/i18n/nl';
import ru from '@/i18n/ru';
import ar from '@/i18n/ar';
import tr from '@/i18n/tr';
import zh from '@/i18n/zh';
import ja from '@/i18n/ja';
import ko from '@/i18n/ko';
import { default as itDict } from '@/i18n/it';

const DICTS: Record<string, Record<string, string>> = { es, fr, de, pt, it: itDict, nl: nld, ru, ar, tr, zh, ja, ko };
const LANGS = Object.keys(DICTS);

describe('dictionary parity', () => {
  it('every dictionary has exactly the same key set as en', () => {
    const enKeys = Object.keys(en).sort();
    expect(enKeys.length).toBeGreaterThan(700);
    for (const code of LANGS) {
      const keys = Object.keys(DICTS[code]).sort();
      expect(keys).toEqual(enKeys);
      expect(keys.length).toBe(enKeys.length);
    }
  });

  it('no dictionary has empty or duplicated keys', () => {
    for (const code of LANGS) {
      const entries = Object.entries(DICTS[code]);
      const seen = new Set<string>();
      for (const [k, v] of entries) {
        expect(k).toBeTruthy();
        expect(v).toBeTruthy();
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    }
  });

  it('all values preserve their {placeholder} tokens', () => {
    for (const code of LANGS) {
      for (const [k, v] of Object.entries(DICTS[code])) {
        const placeholders = k.match(/\{[a-zA-Z0-9]+\}/g) ?? [];
        for (const ph of placeholders) {
          expect(v).toContain(ph);
        }
      }
    }
  });
});

describe('translate', () => {
  it('en interpolates placeholders', () => {
    expect(translate('en', '{n} file', { n: 5 })).toBe('5 files');
    expect(translate('en', '{n} hari lalu', { n: 2 })).toBe('2 days ago');
  });

  it('id is identity (returns the key)', () => {
    expect(translate('id', '{n} file')).toBe('{n} file');
    expect(translate('id', 'Ya, bersihkan')).toBe('Ya, bersihkan');
  });

  it('each language returns a real translation (not the raw key) for a sample', () => {
    for (const code of LANGS) {
      expect(translate(code, 'Ya, bersihkan')).not.toBe('Ya, bersihkan');
      expect(translate(code, '{n} file')).not.toBe('{n} file');
      expect(translate(code, '{n} file')).toContain('{n}');
    }
  });

  it('falls back to the raw key for unknown keys', () => {
    expect(translate('en', 'Tidak ada kunci ini')).toBe('Tidak ada kunci ini');
    expect(translate('fr', 'Tidak ada kunci ini')).toBe('Tidak ada kunci ini');
  });

  it('tGlobal uses the module-level language and interpolates', () => {
    setModuleLang('en');
    expect(tGlobal('{n} file', { n: 3 })).toBe('3 files');
    setModuleLang('id');
    expect(tGlobal('{n} file', { n: 3 })).toBe('3 file');
  });
});

describe('translateServerMessage', () => {
  it('translates exact server messages in English', () => {
    setModuleLang('en');
    expect(translateServerMessage('Sumber tidak ditemukan')).toBe('Source not found');
    expect(translateServerMessage('Target tidak dikenal.')).toBe('Unknown target.');
    expect(translateServerMessage('Izin administrator (UAC) dibatalkan.')).toBe('Administrator permission (UAC) was cancelled.');
  });

  it('translates prefixed dynamic messages and keeps the path', () => {
    setModuleLang('en');
    expect(translateServerMessage('Bukan folder: C:\\Data')).toBe('Not a folder: C:\\Data');
    expect(translateServerMessage('Folder tidak ditemukan: C:\\Data\\X')).toBe('Folder not found: C:\\Data\\X');
    expect(translateServerMessage('Tidak dapat membaca folder: D:\\Y')).toBe('Cannot read folder: D:\\Y');
  });

  it('translates the dynamic password-min-length message', () => {
    setModuleLang('en');
    expect(translateServerMessage('Sandi minimal 8 karakter.')).toBe('The password must be at least 8 characters.');
  });

  it('returns unknown messages unchanged and id keeps Indonesian', () => {
    setModuleLang('en');
    expect(translateServerMessage('sesuatu yang tidak dikenal 123')).toBe('sesuatu yang tidak dikenal 123');
    setModuleLang('id');
    expect(translateServerMessage('Sumber tidak ditemukan')).toBe('Sumber tidak ditemukan');
    expect(translateServerMessage('')).toBe('');
  });
});

describe('language persistence', () => {
  beforeAll(() => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
    };
  });

  it('getStoredLang reads a valid stored language and falls back to id otherwise', () => {
    expect(getStoredLang()).toBe('id');
    (globalThis as any).localStorage.setItem('helpyou-lang', 'fr');
    expect(getStoredLang()).toBe('fr');
    (globalThis as any).localStorage.setItem('helpyou-lang', 'zz');
    expect(getStoredLang()).toBe('id');
    (globalThis as any).localStorage.removeItem('helpyou-lang');
  });
});