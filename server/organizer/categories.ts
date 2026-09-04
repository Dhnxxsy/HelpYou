import type { FileCategory, SizeBand } from '../../shared/types.js';

const CATEGORY_LABELS: Record<FileCategory, string> = {
  video: 'Video',
  image: 'Gambar',
  audio: 'Audio',
  document: 'Dokumen',
  archive: 'Arsip',
  program: 'Program',
  code: 'Kode / Source',
  design: 'Desain',
  ebook: 'Buku',
  font: 'Font',
  data: 'Data & Database',
  virtual: 'Virtual Machine',
  'disc-image': 'Image Disk',
  torrent: 'Torrent',
  other: 'Lainnya',
};

export const CATEGORY_ICONS: Record<FileCategory, string> = {
  video: '🎬',
  image: '🖼️',
  audio: '🎵',
  document: '📄',
  archive: '🗜️',
  program: '💿',
  code: '🧑‍💻',
  design: '🎨',
  ebook: '📚',
  font: '🔤',
  data: '🗃️',
  virtual: '🖥️',
  'disc-image': '💽',
  torrent: '🧲',
  other: '📁',
};

export function categoryLabel(c: FileCategory): string {
  return CATEGORY_LABELS[c];
}

// Extension -> category mapping
const EXT_MAP: Record<string, FileCategory> = {
  // Video
  mp4: 'video', mkv: 'video', avi: 'video', mov: 'video', wmv: 'video',
  flv: 'video', webm: 'video', m4v: 'video', mpg: 'video', mpeg: 'video',
  '3gp': 'video', mts: 'video', vob: 'video', ogv: 'video', m2ts: 'video',
  // Image
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', bmp: 'image',
  webp: 'image', svg: 'image', tiff: 'image', tif: 'image', heic: 'image',
  raw: 'image', cr2: 'image', nef: 'image', ico: 'image', psd: 'image',
  ai: 'design', eps: 'design', crw: 'image', avif: 'image', jpe: 'image',
  // Audio
  mp3: 'audio', wav: 'audio', flac: 'audio', aac: 'audio', ogg: 'audio',
  m4a: 'audio', wma: 'audio', opus: 'audio', mid: 'audio', midi: 'audio',
  // Documents
  pdf: 'document', doc: 'document', docx: 'document', xls: 'document',
  xlsx: 'document', ppt: 'document', pptx: 'document', txt: 'document',
  rtf: 'document', pages: 'document', numbers: 'document', keynote: 'document',
  odp: 'document', odt: 'document', ods: 'document', csv: 'document',
  // Ebooks
  epub: 'ebook', mobi: 'ebook', azw: 'ebook', azw3: 'ebook', djvu: 'ebook',
  // Archives
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive',
  gz: 'archive', bz2: 'archive', xz: 'archive', z: 'archive', cab: 'archive',
  iso: 'disc-image', img: 'disc-image', dmg: 'disc-image', mdf: 'disc-image',
  // Programs / executables
  exe: 'program', msi: 'program', appx: 'program', apk: 'program',
  deb: 'program', rpm: 'program', run: 'program', sh: 'program', bat: 'program',
  cmd: 'program', jar: 'program', dmg2: 'program',
  // Code
  js: 'code', jsx: 'code', ts: 'code', tsx: 'code', py: 'code', java: 'code',
  c: 'code', cpp: 'code', h: 'code', hpp: 'code', cs: 'code', go: 'code',
  rb: 'code', php: 'code', html: 'code', css: 'code', scss: 'code', sql: 'code',
  json: 'code', xml: 'code', yaml: 'code', yml: 'code', toml: 'code', ini: 'code',
  vue: 'code', svelte: 'code', rs: 'code', dart: 'code', swift: 'code', kt: 'code',
  lua: 'code', pl: 'code', r: 'code', ipynb: 'code', lock: 'code', gradle: 'code',
  // Fonts
  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font', eot: 'font',
  // Data / database
  db: 'data', sqlite: 'data', sqlite3: 'data', mdb: 'data', accdb: 'data',
  bak: 'data', dat: 'data', log: 'data', dump: 'data',
  // Virtual machine
  vmdk: 'virtual', vhdx: 'virtual', vdi: 'virtual', vhd: 'virtual', vmcx: 'virtual', ovf: 'virtual', ova: 'virtual',
  // Torrent
  torrent: 'torrent', magnet: 'torrent',
};

// Folder/design extensions mapped directly
const EXT_MAP_EXTRA: Record<string, FileCategory> = {
  xcf: 'design', sketch: 'design', fig: 'design', blend: 'design', indd: 'design',
};

export function categoryForExtension(ext: string): FileCategory {
  const e = (ext || '').toLowerCase().replace('.', '');
  if (!e) return 'other';
  if (EXT_MAP[e]) return EXT_MAP[e];
  if (EXT_MAP_EXTRA[e]) return EXT_MAP_EXTRA[e];
  return 'other';
}

export function sizeBandForSize(size: number): SizeBand {
  // tiny: < 100KB, small: < 1MB, medium: < 10MB, large: < 100MB, huge: >= 100MB
  if (size < 100 * 1024) return 'tiny';
  if (size < 1 * 1024 * 1024) return 'small';
  if (size < 10 * 1024 * 1024) return 'medium';
  if (size < 100 * 1024 * 1024) return 'large';
  return 'huge';
}

export const SIZE_BAND_LABELS: Record<SizeBand, string> = {
  tiny: '< 100 KB',
  small: '100 KB – 1 MB',
  medium: '1 – 10 MB',
  large: '10 – 100 MB',
  huge: '≥ 100 MB',
};

export const SIZE_BAND_FOLDERS: Record<SizeBand, string> = {
  tiny: 'Di bawah 100KB',
  small: '100KB - 1MB',
  medium: '1MB - 10MB',
  large: '10MB - 100MB',
  huge: 'Lebih dari 100MB',
};

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}
