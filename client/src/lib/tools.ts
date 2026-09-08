import type { IconName } from '../components/Icon';

export type ToolId =
  | 'organizer'
  | 'uninstaller'
  | 'junk'
  | 'disk'
  | 'startup'
  | 'system'
  | 'rename'
  | 'recycle'
  | 'notepad'
  | 'vault'
  | 'browser'
  | 'paint'
  | 'mirror'
  | 'apps'
  | 'capture';

export interface ActiveTool {
  icon: IconName;
  title: string;
  short: string;
  desc: string;
  tool: ToolId;
  accent: string;
  glow: string;
  chip: string;
}

export const ACTIVE_TOOLS: ActiveTool[] = [
  {
    icon: 'organize',
    title: 'File Organizer',
    short: 'Organizer',
    desc: 'Rapihkan folder, kelompokkan file otomatis, temukan duplikat & folder kosong. Bisa di-undo kapan saja.',
    tool: 'organizer',
    accent: 'from-indigo-500 to-fuchsia-500',
    glow: 'shadow-indigo-500/20',
    chip: 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]',
  },
  {
    icon: 'trash',
    title: 'Uninstaller',
    short: 'Uninstaller',
    desc: 'Hapus pasang program dengan cepat, tenang, dan bersih sampai ke akar — termasuk sisa file & pintasan.',
    tool: 'uninstaller',
    accent: 'from-violet-500 to-rose-500',
    glow: 'shadow-violet-500/20',
    chip: 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]',
  },
  {
    icon: 'broom',
    title: 'Pembersih Sampah',
    short: 'Pembersih',
    desc: 'Bersihkan cache, temp, dan file sementara dengan aman. File yang dipakai Windows otomatis dilewati.',
    tool: 'junk',
    accent: 'from-emerald-500 to-teal-500',
    glow: 'shadow-emerald-500/20',
    chip: 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]',
  },
  {
    icon: 'disc',
    title: 'Analisis Ruang Disk',
    short: 'Ruang Disk',
    desc: 'Petakan pemakaian ruang drive secara visual dan temukan folder & file terbesar yang bisa diringkas.',
    tool: 'disk',
    accent: 'from-violet-500 to-indigo-500',
    glow: 'shadow-violet-500/20',
    chip: 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]',
  },
  {
    icon: 'gauge',
    title: 'Pengelola Startup',
    short: 'Startup',
    desc: 'Kelola aplikasi yang berjalan otomatis saat Windows menyala — nonaktifkan atau hapus yang tak dipakai.',
    tool: 'startup',
    accent: 'from-cyan-500 to-blue-600',
    glow: 'shadow-cyan-500/20',
    chip: 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]',
  },
  {
    icon: 'cpu',
    title: 'Info & Laporan Sistem',
    short: 'Info Sistem',
    desc: 'Ringkasan lengkap PC-mu: OS, prosesor, RAM, kartu grafis, baterai, dan pemakaian setiap drive.',
    tool: 'system',
    accent: 'from-amber-500 to-orange-600',
    glow: 'shadow-amber-500/20',
    chip: 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]',
  },
  {
    icon: 'rename',
    title: 'Ganti Nama Massal',
    short: 'Rename Massal',
    desc: 'Rename banyak file sekaligus: cari & ganti teks, awalan/akhiran, atau penomoran otomatis. Aman tanpa menimpa.',
    tool: 'rename',
    accent: 'from-fuchsia-500 to-indigo-600',
    glow: 'shadow-fuchsia-500/20',
    chip: 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]',
  },
  {
    icon: 'recycle',
    title: 'Tempat Sampah',
    short: 'Recycle Bin',
    desc: 'Pulihkan file yang terhapus ke lokasi asalnya, atau kosongkan isi Tempat Sampah sekaligus.',
    tool: 'recycle',
    accent: 'from-emerald-500 to-teal-600',
    glow: 'shadow-emerald-500/20',
    chip: 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]',
  },
  {
    icon: 'fileText',
    title: 'Notepad',
    short: 'Notepad',
    desc: 'Catat ide dan catatan penting dengan editor nyaman: auto-save, format teks, cari & ganti, dan ekspor ke file.',
    tool: 'notepad',
    accent: 'from-amber-400 to-orange-600',
    glow: 'shadow-amber-500/20',
    chip: 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]',
  },
  {
    icon: 'lock',
    title: 'Brankas Rahasia',
    short: 'Brankas',
    desc: 'Sembunyikan file atau folder dengan enkripsi AES-256-GCM berkata sandi. Nama file ikut terenkripsi dan aslinya dihapus aman.',
    tool: 'vault',
    accent: 'from-violet-500 to-purple-600',
    glow: 'shadow-violet-500/20',
    chip: 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]',
  },
  {
    icon: 'globe',
    title: 'Browser Web',
    short: 'Browser',
    desc: 'Buka situs web langsung di dalam HelpYou tanpa perlu browser eksternal. Jelajah Shopee dan situs lain dengan mudah.',
    tool: 'browser',
    accent: 'from-sky-500 to-blue-600',
    glow: 'shadow-sky-500/20',
    chip: 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]',
  },
  {
    icon: 'brush',
    title: 'Melukis',
    short: 'Melukis',
    desc: 'Melukis digital lengkap: kuas dengan tekanan, penghapus, pengisi warna, bentuk, pipet, lapisan, dan ekspor PNG.',
    tool: 'paint',
    accent: 'from-rose-500 to-pink-600',
    glow: 'shadow-rose-500/20',
    chip: 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]',
  },
  {
    icon: 'phone',
    title: 'Mirror HP',
    short: 'Mirror HP',
    desc: 'Cerminkan layar HP Android ke PC, kendalikan dari jauh, nirkabel atau via USB.',
    tool: 'mirror',
    accent: 'from-teal-500 to-emerald-600',
    glow: 'shadow-teal-500/20',
    chip: 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]',
  },
  {
    icon: 'gamepad',
    title: 'Pusat Aplikasi & Game',
    short: 'Apps & Game',
    desc: 'Katalog semua aplikasi dan game terpasang di PC-mu — buka langsung dalam sekali klik atau telusuri lokasi berkasnya.',
    tool: 'apps',
    accent: 'from-sky-500 to-violet-600',
    glow: 'shadow-sky-500/20',
    chip: 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]',
  },
  {
    icon: 'monitorPlay',
    title: 'Rekam & Jepret Layar',
    short: 'Rekam Layar',
    desc: 'Jepret tangkapan layar atau rekam layar dengan pilihan kualitas, bitrate, dan FPS. Semua diproses 100% lokal.',
    tool: 'capture',
    accent: 'from-slate-500 to-slate-700',
    glow: 'shadow-slate-500/20',
    chip: 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]',
  },
];