import Icon, { type IconName } from '../components/Icon';

export type ToolId = 'organizer' | 'uninstaller';

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
    icon: 'package',
    title: 'Uninstaller',
    desc: 'Hapus pasang program dengan cepat, tenang, dan bersih sampai ke akar — termasuk sisa file & pintasan.',
    tool: 'uninstaller',
    accent: 'from-violet-500 to-rose-500',
    glow: 'shadow-violet-500/20',
    chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  },
];

const UPCOMING_TOOLS: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'broom', title: 'Pembersih File Sampah', desc: 'Bersihkan cache, temp, dan file sementara dengan aman.' },
  { icon: 'disc', title: 'Analisis Ruang Disk', desc: 'Petakan penggunaan penyimpanan drive secara visual.' },
  { icon: 'gauge', title: 'Pengelola Startup', desc: 'Kelola aplikasi yang berjalan saat Windows menyala.' },
];

export default function HomeView({ onOpen }: { onOpen: (tool: ToolId) => void }) {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero */}
      <div className="text-center pt-4 pb-2">
        <div className="eyebrow mb-2.5">Suite Tools Lokal</div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          <span className="text-gradient">Semua Tools File-mu dalam Satu Tempat</span>
        </h1>
        <p className="text-sm text-gray-400 mt-3 max-w-xl mx-auto">
          Berjalan 100% lokal — data tidak pernah meninggalkan perangkat. Pilih tools di bawah untuk mulai.
        </p>
      </div>

      {/* Active tools */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Icon name="grid" className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">Tools Tersedia</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {ACTIVE_TOOLS.map((t) => (
            <button
              key={t.title}
              onClick={() => onOpen(t.tool)}
              className="card card-hover p-5 text-left flex flex-col gap-4 group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${t.accent} grid place-items-center text-white shadow-lg ${t.glow} group-hover:scale-105 transition-transform`}>
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
                  <Icon name="arrowRight" className="w-4 h-4 text-indigo-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{t.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Upcoming */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Icon name="sparkle" className="w-4 h-4 text-fuchsia-400" />
          <h2 className="text-sm font-semibold text-white">Segera Hadir</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          {UPCOMING_TOOLS.map((t) => (
            <div key={t.title} className="card p-4 opacity-60 select-none">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 grid place-items-center text-gray-400">
                  <Icon name={t.icon} className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-300 flex items-center gap-1.5">
                    {t.title}
                    <span className="chip bg-white/[0.06] text-gray-500 border border-white/10 text-[10px]">Segera</span>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{t.desc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}