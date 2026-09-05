export type ThemeId =
  | 'gelap'
  | 'terang'
  | 'anime'
  | 'comic'
  | 'green'
  | 'red'
  | 'purple'
  | 'whitepink'
  | 'whitered'
  | 'whitepurple'
  | 'ocean';

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  mode: 'dark' | 'light';
  chip: string;
  swatches: [string, string];
}

export const THEMES: ThemeMeta[] = [
  { id: 'gelap', label: 'Gelap', mode: 'dark', chip: 'bg-[#0b0d18] border-white/10', swatches: ['#818cf8', '#c084fc'] },
  { id: 'terang', label: 'Terang', mode: 'light', chip: 'bg-[#f4f5fa] border-black/10', swatches: ['#6366f1', '#a855f7'] },
  { id: 'anime', label: 'Anime', mode: 'dark', chip: 'bg-[#0b0518] border-white/10', swatches: ['#ec4899', '#22d3ee'] },
  { id: 'comic', label: 'Comic', mode: 'light', chip: 'bg-[#f7ead1] border-black/20', swatches: ['#e11d48', '#f59e0b'] },
  { id: 'green', label: 'Dark Green', mode: 'dark', chip: 'bg-[#06120c] border-white/10', swatches: ['#34d399', '#a3e635'] },
  { id: 'red', label: 'Dark Red', mode: 'dark', chip: 'bg-[#150606] border-white/10', swatches: ['#f87171', '#fb923c'] },
  { id: 'purple', label: 'Dark Purple', mode: 'dark', chip: 'bg-[#0d0618] border-white/10', swatches: ['#a78bfa', '#e879f9'] },
  { id: 'whitepink', label: 'White Pink', mode: 'light', chip: 'bg-[#ffffff] border-black/10', swatches: ['#ec4899', '#f9a8d4'] },
  { id: 'whitered', label: 'White Red', mode: 'light', chip: 'bg-[#ffffff] border-black/10', swatches: ['#ef4444', '#fb923c'] },
  { id: 'whitepurple', label: 'White Purple', mode: 'light', chip: 'bg-[#ffffff] border-black/10', swatches: ['#8b5cf6', '#a78bfa'] },
  { id: 'ocean', label: 'Biru Malam', mode: 'dark', chip: 'bg-[#04121f] border-white/10', swatches: ['#38bdf8', '#818cf8'] },
];

const STORAGE_KEY = 'helpyou-theme';

export function getStoredTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (raw && THEMES.some((t) => t.id === raw)) return raw;
  } catch {
    /* private mode etc. */
  }
  return 'gelap';
}

export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function getThemeLabel(id: ThemeId): string {
  return THEMES.find((t) => t.id === id)?.label ?? id;
}