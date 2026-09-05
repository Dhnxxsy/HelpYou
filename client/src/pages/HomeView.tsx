import Icon, { type IconName } from '../components/Icon';

export type ToolId = 'organizer' | 'uninstaller' | 'junk' | 'disk' | 'startup' | 'system' | 'rename' | 'recycle' | 'notepad' | 'vault';

interface ActiveTool {
  icon: IconName;
  title: string;
  desc: string;
  tool: ToolId;
  accent: string;
  glow: string;
  chip: string;
}

const ACTIVE_TOOLS: ActiveTool[] = [
  {
    icon: 'organize',
    title: 'File Organizer',
    desc: 'Rapihkan folder, kelompokkan file otomatis, temukan duplikat & folder kosong. Bisa di-undo kapan saja.',
    tool: 'organizer',
    accent: 'from-indigo-500 to-fuchsia-500',
    glow: 'shadow-indigo-500/20',
    chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  },
  {
    icon: 'trash',
    title: 'Uninstaller',
    desc: 'Hapus pasang program dengan cepat, tenang, dan bersih sampai ke akar — termasuk sisa file & pintasan.',
    tool: 'uninstaller',
    accent: 'from-violet-500 to-rose-500',
    glow: 'shadow-violet-500/20',
    chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  },
  {
    icon: 'broom',
    title: 'Pembersih File Sampah',
    desc: 'Bersihkan cache, temp, dan file sementara dengan aman. File yang dipakai Windows otomatis dilewati.',
    tool: 'junk',
    accent: 'from-emerald-500 to-teal-500',
    glow: 'shadow-emerald-500/20',
    chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  },
  {
    icon: 'disc',
    title: 'Analisis Ruang Disk',
    desc: 'Petakan pemakaian ruang drive secara visual dan temukan folder & file terbesar yang bisa diringkas.',
    tool: 'disk',
    accent: 'from-violet-500 to-indigo-500',
    glow: 'shadow-violet-500/20',
    chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  },
  {
    icon: 'gauge',
    title: 'Pengelola Startup',
    desc: 'Kelola aplikasi yang berjalan otomatis saat Windows menyala — nonaktifkan atau hapus yang tak dipakai.',
    tool: 'startup',
    accent: 'from-cyan-500 to-blue-600',
    glow: 'shadow-cyan-500/20',
    chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  },
  {
    icon: 'cpu',
    title: 'Info & Laporan Sistem',
    desc: 'Ringkasan lengkap PC-mu: OS, prosesor, RAM, kartu grafis, baterai, dan pemakaian setiap drive.',
    tool: 'system',
    accent: 'from-amber-500 to-orange-600',
    glow: 'shadow-amber-500/20',
    chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  },
  {
    icon: 'rename',
    title: 'Ganti Nama Massal',
    desc: 'Rename banyak file sekaligus: cari & ganti teks, awalan/akhiran, atau penomoran otomatis. Aman tanpa menimpa.',
    tool: 'rename',
    accent: 'from-fuchsia-500 to-indigo-600',
    glow: 'shadow-fuchsia-500/20',
    chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  },
  {
    icon: 'recycle',
    title: 'Tempat Sampah',
    desc: 'Pulihkan file yang terhapus ke lokasi asalnya, atau kosongkan isi Tempat Sampah sekaligus.',
    tool: 'recycle',
    accent: 'from-emerald-500 to-teal-600',
    glow: 'shadow-emerald-500/20',
    chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  },
  {
    icon: 'fileText',
    title: 'Notepad',
    desc: 'Catat ide dan catatan penting dengan editor nyaman: auto-save, format teks, cari & ganti, dan ekspor ke file.',
    tool: 'notepad',
    accent: 'from-amber-400 to-orange-600',
    glow: 'shadow-amber-500/20',
    chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  },
  {
    icon: 'lock',
    title: 'Brankas Rahasia',
    desc: 'Sembunyikan file atau folder dengan enkripsi AES-256-GCM berkata sandi. Nama file ikut terenkripsi dan aslinya dihapus aman.',
    tool: 'vault',
    accent: 'from-violet-500 to-purple-600',
    glow: 'shadow-violet-500/20',
    chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  },
];

const FEATURES = [
  { icon: 'shield' as IconName, label: 'Privasi penuh' },
  { icon: 'lock' as IconName, label: 'Tanpa iklan' },
  { icon: 'play' as IconName, label: 'Langsung jalan' },
];

export default function HomeView({ onOpen }: { onOpen: (tool: ToolId) => void }) {
  return (
    <div className="space-y-10 animate-fade-in">
      {/* Hero */}
      <section className="text-center pt-8 pb-2 px-2">
        <div className="chip bg-white/[0.05] text-indigo-300 border-indigo-500/20 mx-auto mb-5 px-3 py-1">
          <Icon name="sparkle" className="w-3.5 h-3.5" />
          Suite Tools Lokal untuk Windows
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-balance">
          <span className="text-gradient drop-shadow-[0_0_30px_rgba(129,140,248,0.25)]">
            Semua Tools File-mu dalam Satu Tempat
          </span>
        </h1>
        <p className="text-sm sm:text-base text-gray-400 mt-4 max-w-2xl mx-auto leading-relaxed text-balance">
          Rapikan file, bersihkan sampah, kelola sistem — semuanya berjalan{' '}
          <span className="text-emerald-300 font-medium">100% lokal</span>.
          Data tidak pernah meninggalkan perangkatmu.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2.5 mt-6">
          {FEATURES.map((f) => (
            <span key={f.label} className="chip bg-white/[0.04] text-gray-300 px-3 py-1 gap-1.5">
              <Icon name={f.icon} className="w-3.5 h-3.5 text-indigo-400" />
              {f.label}
            </span>
          ))}
        </div>
      </section>

      {/* Active tools */}
      <section>
        <div className="flex items-center justify-between gap-2 mb-5">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 grid place-items-center shadow-md shadow-indigo-500/25">
              <Icon name="grid" className="w-3.5 h-3.5 text-white" />
            </span>
            <h2 className="text-sm font-semibold text-white">Tools Tersedia</h2>
          </div>
          <span className="chip bg-white/[0.04] text-gray-500">{ACTIVE_TOOLS.length} tools</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {ACTIVE_TOOLS.map((t, i) => (
            <button
              key={t.title}
              onClick={() => onOpen(t.tool)}
              className="card card-hover p-5 text-left flex flex-col gap-4 group animate-slide-up"
              style={{ animationDelay: `${i * 55}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${t.accent} grid place-items-center text-white shadow-lg ${t.glow} group-hover:scale-105 group-hover:rotate-3 transition-transform`}>
                  <Icon name={t.icon} className="w-6 h-6" />
                </div>
                <span className={`chip ${t.chip}`}>
                  <span className="relative flex w-1.5 h-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping-slow" />
                    <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-emerald-400" />
                  </span>
                  Tersedia
                </span>
              </div>
              <div>
                <div className="text-base font-semibold text-white flex items-center gap-1.5">
                  {t.title}
                  <span className="w-5 h-5 grid place-items-center rounded-full bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white group-hover:translate-x-0.5 transition-all">
                    <Icon name="arrowRight" className="w-3.5 h-3.5" />
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{t.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}