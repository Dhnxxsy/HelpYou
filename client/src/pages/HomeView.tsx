import Icon from '../components/Icon';
import { ACTIVE_TOOLS, type ToolId } from '../lib/tools';

const FEATURES = [
  { icon: 'shield' as const, label: 'Privasi penuh' },
  { icon: 'lock' as const, label: 'Tanpa iklan' },
  { icon: 'play' as const, label: 'Langsung jalan' },
];

const STATS = [
  { value: '10', label: 'Tools siap pakai', icon: 'grid' as const },
  { value: '100%', label: 'Berjalan lokal', icon: 'shield' as const },
  { value: 'AES-256', label: 'Enkripsi brankas', icon: 'lock' as const },
  { value: '0', label: 'Data dikirim keluar', icon: 'eyeOff' as const },
];

export default function HomeView({ onOpen }: { onOpen: (tool: ToolId) => void }) {
  return (
    <div className="space-y-10 animate-fade-in">
      {/* Hero */}
      <section className="pt-6 pb-2 px-1">
        <div className="flex items-center gap-1.5 chip bg-indigo-500/[0.08] text-indigo-300 border-indigo-500/25 px-3 py-1 w-fit mb-6">
          <Icon name="sparkle" className="w-3.5 h-3.5" />
          Suite Tools Lokal untuk Windows
        </div>
        <h1 className="text-3xl sm:text-[44px] font-bold tracking-[-0.02em] leading-[1.12] text-balance max-w-3xl">
          <span className="text-gradient drop-shadow-[0_0_36px_rgba(129,140,248,0.28)]">
            Semua Tools File-mu,
            <br />
            dalam Satu Tempat.
          </span>
        </h1>
        <p className="text-[15px] text-gray-400 mt-5 max-w-2xl leading-relaxed text-balance">
          Rapikan file, bersihkan sampah, kelola startup, hingga kunci data pribadi — semuanya berjalan{' '}
          <span className="text-emerald-300 font-medium">100% lokal</span>. Data tidak pernah meninggalkan perangkatmu.
        </p>

        <div className="flex flex-wrap items-center gap-2.5 mt-6">
          {FEATURES.map((f) => (
            <span key={f.label} className="chip bg-white/[0.04] text-gray-300 px-3 py-1 gap-1.5">
              <Icon name={f.icon} className="w-3.5 h-3.5 text-indigo-400" />
              {f.label}
            </span>
          ))}
        </div>
      </section>

      {/* Stat strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {STATS.map((s) => (
          <div key={s.label} className="card card-hover p-4 flex items-center gap-3.5">
            <span className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] grid place-items-center text-indigo-300 shrink-0">
              <Icon name={s.icon} className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <div className="text-lg font-bold text-white leading-none tabular-nums">{s.value}</div>
              <div className="text-[11px] text-gray-500 mt-1 truncate">{s.label}</div>
            </div>
          </div>
        ))}
      </section>

      {/* Tools */}
      <section>
        <div className="flex items-center justify-between gap-2 mb-5">
          <div className="flex items-center">
            <span className="section-bar" />
            <h2 className="text-sm font-semibold text-white">Tools Tersedia</h2>
          </div>
          <span className="chip bg-white/[0.04] text-gray-500">{ACTIVE_TOOLS.length} tools</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {ACTIVE_TOOLS.map((t, i) => (
            <button
              key={t.title}
              onClick={() => onOpen(t.tool)}
              className="card card-hover p-5 text-left flex items-start gap-4 group animate-slide-up"
              style={{ animationDelay: `${i * 45}ms` }}
            >
              <div
                className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${t.accent} grid place-items-center text-white shadow-lg ${t.glow} group-hover:scale-105 group-hover:-rotate-3 transition-transform shrink-0`}
              >
                <Icon name={t.icon} className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-white flex items-center gap-1.5">
                  {t.title}
                  <span className="w-5 h-5 grid place-items-center rounded-full bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0">
                    <Icon name="arrowRight" className="w-3.5 h-3.5" />
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1.5 leading-relaxed line-clamp-2">{t.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}