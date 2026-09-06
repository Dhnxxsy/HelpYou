import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { api } from '../lib/api';
import { formatBytes } from '../lib/format';
import { useI18n, tGlobal } from '../lib/i18n';
import type { JunkTarget, JunkScanResult, JunkCleanOutcome } from '@shared/types';

type Phase = 'idle' | 'scanning' | 'done';

interface CleanSummary {
  removed: number;
  freed: number;
  errors: number;
  admin: boolean;
  label: string;
}

export default function JunkCleanerView({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('idle');
  const [scan, setScan] = useState<JunkScanResult | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cleaning, setCleaning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [summary, setSummary] = useState<CleanSummary | null>(null);

  const runScan = async () => {
    setError('');
    setSummary(null);
    setPhase('scanning');
    try {
      const res = await api<{ result: JunkScanResult }>('/api/cleaner/scan');
      setScan(res.result);
      setSelected(new Set(res.result.targets.filter((target) => target.exists && target.sizeBytes > 0).map((target) => target.id)));
      setPhase('done');
    } catch (e: any) {
      setError(e.message || t('Gagal memindai.'));
      setPhase('idle');
    }
  };

  useEffect(() => {
    runScan();
  }, []);

  const hasAdminSelection = useMemo(
    () => !!scan && [...selected].some((id) => scan.targets.find((target) => target.id === id)?.admin),
    [scan, selected]
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const doClean = async () => {
    setConfirmOpen(false);
    if (!scan || selected.size === 0) return;
    setCleaning(true);
    setError('');
    try {
      const targetMap = new Map(scan.targets.map((target) => [target.id, target]));
      const standard = [...selected].filter((id) => !targetMap.get(id)?.admin);
      const admin = [...selected].filter((id) => targetMap.get(id)?.admin);

      const outcomes: JunkCleanOutcome[] = [];
      if (standard.length > 0) {
        const res = await api<{ results: JunkCleanOutcome[] }>('/api/cleaner/clean', {
          method: 'POST',
          body: JSON.stringify({ targetIds: standard }),
        });
        outcomes.push(...res.results);
      }
      if (admin.length > 0) {
        const res = await api<{ results: JunkCleanOutcome[] }>('/api/cleaner/clean/admin', {
          method: 'POST',
          body: JSON.stringify({ targetIds: admin }),
        });
        outcomes.push(...res.results);
      }

      const removed = outcomes.reduce((s, r) => s + r.removed, 0);
      const freed = outcomes.reduce((s, r) => s + r.freed, 0);
      const errors = outcomes.reduce((s, r) => s + r.errors, 0);
      const adminLabel = admin.length > 0 ? t(' (lewat izin admin)') : '';
      setSummary({ removed, freed, errors, admin: admin.length > 0, label: adminLabel });
      await runScan();
    } catch (e: any) {
      setError(e.message || t('Gagal membersihkan.'));
    } finally {
      setCleaning(false);
    }
  };

  const totalSize = scan?.totalBytes || 0;
  const itemCount = scan?.totalFiles || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon="broom"
        title={t('Pembersih File Sampah')}
        desc={t('Bersihkan temp, cache, dan file sementara dengan aman. File yang sedang dipakai otomatis dilewati.')}
        onBack={onBack}
        actions={
          <button className="btn-primary" onClick={runScan} disabled={phase === 'scanning' || cleaning}>
            <Icon name="replay" className="w-4 h-4" /> {phase === 'scanning' ? t('Memindai…') : t('Pindai Ulang')}
          </button>
        }
      />

      {error && (
        <p className="text-sm text-[var(--danger-strong)] flex items-center gap-1.5"><Icon name="alert" className="w-4 h-4 shrink-0" />{error}</p>
      )}

      {phase === 'scanning' && (
        <div className="card p-8 text-center">
          <div className="animate-spin h-6 w-6 border-2 border-[var(--ok-border)] border-t-[var(--ok-strong)] rounded-full mx-auto" />
          <p className="text-sm text-[var(--text-2)] mt-3">{t('Menganalisis lokasi sampah…')}</p>
        </div>
      )}

      {phase === 'done' && scan && (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="card px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">{t('Total Sampah')}</div>
              <div className="text-lg font-semibold tabular-nums text-[var(--text)] mt-0.5">{formatBytes(totalSize)}</div>
            </div>
            <div className="card px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">{t('Item')}</div>
              <div className="text-lg font-semibold tabular-nums text-[var(--text)] mt-0.5">{itemCount.toLocaleString('id-ID')}</div>
            </div>
            <div className="card px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">{t('Lokasi Terdeteksi')}</div>
              <div className="text-lg font-semibold tabular-nums text-[var(--text)] mt-0.5">{scan.targets.filter((target) => target.exists).length}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--overlay)]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <span className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
                <Icon name="box" className="w-4 h-4 text-[var(--ok-strong)]" /> {t('Lokasi Sampah')}
              </span>
              <span className="text-[11px] text-[var(--text-3)]">{t('{n} dipilih', { n: selected.size })}</span>
            </div>
            <div className="divide-y divide-white/5">
              {scan.targets.map((target) => {
                const checked = selected.has(target.id);
                return (
                  <button
                    key={target.id}
                    onClick={() => toggle(target.id)}
                    disabled={!target.exists}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--overlay)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className={`w-5 h-5 rounded-md border grid place-items-center shrink-0 transition-colors ${checked ? 'bg-[var(--ok)] border-[var(--ok-border)]' : 'border-[var(--border-2)]'}`}>
                      {checked && <Icon name="check" className="w-3.5 h-3.5 text-[var(--text)]" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-[var(--text)] flex items-center gap-2">
                        {target.label}
                        {target.admin && (
                          <span className="chip bg-[var(--warn-soft)] text-[var(--warn-strong)] border border-[var(--warn-border)] text-[10px]" title={t('Butuh izin administrator untuk membersihkan')}>
                            <Icon name="lock" className="w-3 h-3" /> {t('Admin')}
                          </span>
                        )}
                      </span>
                      <span className="block text-[11px] text-[var(--text-3)] truncate" title={target.path}>{target.note}</span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-sm font-semibold tabular-nums text-[var(--text)]">{formatBytes(target.sizeBytes)}</span>
                      <span className="block text-[10px] text-[var(--text-3)] tabular-nums">{t('{n} item', { n: target.itemCount.toLocaleString('id-ID') })}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className={hasAdminSelection ? 'btn-primary' : 'btn-primary'}
              onClick={() => setConfirmOpen(true)}
              disabled={cleaning || selected.size === 0}
            >
              <Icon name="broom" className="w-4 h-4" />
              {cleaning ? t('Membersihkan…') : t('Bersihkan {n} Lokasi', { n: selected.size }) + (hasAdminSelection ? t(' (butuh admin)') : '')}
            </button>
            <p className="text-[11px] text-[var(--text-3)]">
              {t('File yang sedang dipakai Windows tidak akan bisa dihapus dan otomatis dilewati. Selalu aman.')}
            </p>
          </div>

          {summary && (
            <div className="card p-4 flex items-start gap-3 border-[var(--ok-border)]">
              <span className="w-9 h-9 rounded-xl bg-[var(--ok-soft)] text-[var(--ok-strong)] grid place-items-center shrink-0"><Icon name="check" className="w-5 h-5" /></span>
              <div className="text-sm">
                <div className="text-[var(--text)] font-medium">{t('Bersih total {freed} dari {removed} item', { freed: formatBytes(summary.freed), removed: summary.removed.toLocaleString('id-ID') })}{summary.admin ? t(' (dengan izin admin)') : ''}.</div>
                {summary.errors > 0 && <div className="text-[var(--text-2)] mt-1 text-xs">{t('{n} file masih dipakai/dikunci dan dilewati.', { n: summary.errors.toLocaleString('id-ID') })}</div>}
              </div>
            </div>
          )}
        </>
      )}

      <button className="btn-ghost !py-2 !px-3 text-xs" onClick={onBack}>
        <Icon name="chevronRight" className="w-3.5 h-3.5 rotate-180" /> {t('Kembali ke Beranda')}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        tone="danger"
        icon="broom"
        title={t('Bersihkan file sampah?')}
        description={t('{n} lokasi akan dibersihkan permanen ({size}). File yang sedang dipakai akan dilewati.{admin}', {
          n: selected.size,
          size: formatBytes(totalSize),
          admin: hasAdminSelection ? t(' Lokasi admin memerlukan persetujuan UAC.') : '',
        })}
        confirmLabel={t('Ya, bersihkan')}
        onClose={() => setConfirmOpen(false)}
        onConfirm={doClean}
      />
    </div>
  );
}