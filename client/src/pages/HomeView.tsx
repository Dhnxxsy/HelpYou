import Icon from '../components/Icon';
import { ACTIVE_TOOLS, type ToolId } from '../lib/tools';
import { useI18n, tGlobal } from '../lib/i18n';

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
  const { t } = useI18n();
  return (
    <div className="space-y-10 animate-fade-in">
      {/* Hero */}
      <section className="pt-6 pb-2 px-1">
        <div className="flex items-center gap-1.5 chip bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent-border)] px-3 py-1 w-fit mb-6">
          <Icon name="sparkle" className="w-3.5 h-3.5" />
          {t('Suite Tools Lokal untuk Windows')}
        </div>
        <h1 className="text-3xl sm:text-[44px] font-bold tracking-[-0.02em] leading-[1.12] text-balance max-w-3xl">
          <span className="text-gradient drop-shadow-[0_0_36px_rgba(129,140,248,0.28)]">
            {t('Semua Tools File-mu,')}
            <br />
            {t('dalam Satu Tempat.')}
          </span>
        </h1>
        <p className="text-[15px] text-[var(--text-2)] mt-5 max-w-2xl leading-relaxed text-balance">
          {t('Rapikan file, bersihkan sampah, kelola startup, hingga kunci data pribadi — semuanya berjalan')}{' '}
          <span className="text-[var(--ok-strong)] font-medium">100% lokal</span>{t('. Data tidak pernah meninggalkan perangkatmu.')}
        </p>

        <div className="flex flex-wrap items-center gap-2.5 mt-6">
          {FEATURES.map((f) => (
            <span key={f.label} className="chip bg-[var(--overlay)] text-[var(--text-2)] px-3 py-1 gap-1.5">
              <Icon name={f.icon} className="w-3.5 h-3.5 text-[var(--accent-strong)]" />
              {t(f.label)}
            </span>
          ))}
        </div>
      </section>

      {/* Stat strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {STATS.map((s) => (
          <div key={s.label} className="card card-hover p-4 flex items-center gap-3.5">
            <span className="w-10 h-10 rounded-xl bg-[var(--overlay)] border border-[var(--border-2)] grid place-items-center text-[var(--accent-strong)] shrink-0">
              <Icon name={s.icon} className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <div className="text-lg font-bold text-[var(--text)] leading-none tabular-nums">{s.value}</div>
              <div className="text-[11px] text-[var(--text-3)] mt-1 truncate">{t(s.label)}</div>
            </div>
          </div>
        ))}
      </section>

      {/* Tools */}
      <section>
        <div className="flex items-center justify-between gap-2 mb-5">
          <div className="flex items-center">
            <span className="section-bar" />
            <h2 className="text-sm font-semibold text-[var(--text)]">{t('Tools Tersedia')}</h2>
          </div>
          <span className="chip bg-[var(--overlay)] text-[var(--text-3)]">{t('{n} tools', { n: ACTIVE_TOOLS.length })}</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {ACTIVE_TOOLS.map((tool, i) => (
            <button
              key={tool.title}
              onClick={() => onOpen(tool.tool)}
              className="card card-hover p-5 text-left flex items-start gap-4 group animate-slide-up"
              style={{ animationDelay: `${i * 45}ms` }}
            >
              <div
                className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${tool.accent} grid place-items-center text-white shadow-lg ${tool.glow} group-hover:scale-105 group-hover:-rotate-3 transition-transform shrink-0`}
              >
                <Icon name={tool.icon} className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-[var(--text)] flex items-center gap-1.5">
                  {t(tool.title)}
                  <span className="w-5 h-5 grid place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] group-hover:bg-[var(--accent-deep)] group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0">
                    <Icon name="arrowRight" className="w-3.5 h-3.5" />
                  </span>
                </div>
                <p className="text-xs text-[var(--text-2)] mt-1.5 leading-relaxed line-clamp-2">{t(tool.desc)}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}