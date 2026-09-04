import type { FileCategory, SizeBand } from '@shared/types';

export const CATEGORY_META: Record<FileCategory, { icon: string; label: string; color: string }> = {
  video: { icon: '🎬', label: 'Video', color: '#f43f5e' },
  image: { icon: '🖼️', label: 'Gambar', color: '#22d3ee' },
  audio: { icon: '🎵', label: 'Audio', color: '#a3e635' },
  document: { icon: '📄', label: 'Dokumen', color: '#60a5fa' },
  archive: { icon: '🗜️', label: 'Arsip', color: '#fb923c' },
  program: { icon: '💿', label: 'Program', color: '#c084fc' },
  code: { icon: '🧑‍💻', label: 'Kode', color: '#34d399' },
  design: { icon: '🎨', label: 'Desain', color: '#f472b6' },
  ebook: { icon: '📚', label: 'Buku', color: '#fbbf24' },
  font: { icon: '🔤', label: 'Font', color: '#e879f9' },
  data: { icon: '🗃️', label: 'Data', color: '#94a3b8' },
  virtual: { icon: '🖥️', label: 'Virtual', color: '#38bdf8' },
  'disc-image': { icon: '💽', label: 'Image Disk', color: '#84cc16' },
  torrent: { icon: '🧲', label: 'Torrent', color: '#fb7185' },
  other: { icon: '📁', label: 'Lainnya', color: '#848a94' },
};

export const CATEGORIES: FileCategory[] = Object.keys(CATEGORY_META) as FileCategory[];

export const SIZE_BANDS: Record<SizeBand, { label: string; folder: string }> = {
  tiny: { label: '< 100 KB', folder: 'Di-bawah-100KB' },
  small: { label: '100 KB – 1 MB', folder: '100KB-1MB' },
  medium: { label: '1 – 10 MB', folder: '1-10MB' },
  large: { label: '10 – 100 MB', folder: '10-100MB' },
  huge: { label: '≥ 100 MB', folder: 'Lebih-100MB' },
};
