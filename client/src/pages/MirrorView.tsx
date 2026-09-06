import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';
import {
  mirrorConnect,
  mirrorDisconnect,
  mirrorInput,
  mirrorLaunch,
  mirrorList,
  mirrorPair,
  mirrorScreencap,
  savePngAs,
  type MirDevice,
} from '../lib/platform';
import { useI18n } from '../lib/i18n';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function MirrorView({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [devices, setDevices] = useState<MirDevice[]>([]);
  const [busy, setBusy] = useState(false);
  const [addr, setAddr] = useState('');
  const [pairCode, setPairCode] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [mirroring, setMirroring] = useState(false);
  const [frame, setFrame] = useState('');
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const pollRef = useRef(false);
  const selRef = useRef<string | null>(null);
  const errCountRef = useRef(0);
  const dragRef = useRef<{ active: boolean; last: { x: number; y: number } }>({ active: false, last: { x: 0, y: 0 } });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const listTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    const res = await mirrorList();
    if (res.ok && res.devices) {
      setDevices(res.devices);
      if (!selRef.current) {
        const d = res.devices.find((x) => x.state === 'device');
        if (d) {
          setSelected(d.serial);
          selRef.current = d.serial;
        }
      }
    } else if (res.error) {
      setError(res.error);
    }
    setBusy(false);
  };

  useEffect(() => {
    void refresh();
    listTimerRef.current = setInterval(() => void refresh(), 5000);
    return () => {
      if (listTimerRef.current) clearInterval(listTimerRef.current);
      pollRef.current = false;
    };
  }, []);

  const startMirror = (serial: string) => {
    pollRef.current = false;
    selRef.current = serial;
    setSelected(serial);
    setFrame('');
    setImgSize(null);
    errCountRef.current = 0;
    setInfo('');
    pollRef.current = true;
    setMirroring(true);
    void frameLoop(serial);
  };

  const stopMirror = () => {
    pollRef.current = false;
    setMirroring(false);
  };

  const frameLoop = async (serial: string) => {
    while (pollRef.current && selRef.current === serial) {
      const res = await mirrorScreencap(serial);
      if (!pollRef.current || selRef.current !== serial) break;
      if (res.ok && res.base64) {
        errCountRef.current = 0;
        setFrame('data:image/png;base64,' + res.base64);
      } else if (res.busy) {
        /* previous capture still in flight — wait */
      } else {
        errCountRef.current++;
        if (errCountRef.current >= 3) {
          pollRef.current = false;
          setMirroring(false);
          setError(res.error || t('Perangkat tidak ditemukan.'));
          break;
        }
      }
      await sleep(450);
    }
    if (selRef.current === serial) setMirroring(false);
  };

  const pickDevice = (d: MirDevice) => {
    if (d.state !== 'device') {
      setError(t('Terima koneksi di HP bila diminta.'));
      return;
    }
    if (selRef.current === d.serial && mirroring) {
      stopMirror();
      return;
    }
    setError('');
    startMirror(d.serial);
  };

  const doConnect = async () => {
    if (connecting) return;
    const ip = addr.trim();
    if (!ip || !/^\S+:\d+$/.test(ip)) {
      setError(t('IP:port HP (mis. 192.168.1.5:5555)'));
      return;
    }
    setConnecting(true);
    setError('');
    setInfo(t('Menghubungkan…'));
    const res = await mirrorConnect(ip);
    if (res.ok) {
      setInfo(t('Berhasil terhubung.'));
    } else {
      setInfo('');
      setError(res.error || t('Perangkat tidak ditemukan.'));
    }
    setConnecting(false);
    await refresh();
  };

  const doPair = async () => {
    if (connecting) return;
    const ip = addr.trim();
    const code = pairCode.trim();
    if (!/^\S+:\d+$/.test(ip) || !code) {
      setError(t('Kode Pairing (Android 11+, opsional)'));
      return;
    }
    setConnecting(true);
    setError('');
    setInfo(t('Menghubungkan…'));
    const res = await mirrorPair(ip, code);
    if (res.ok) {
      setInfo(t('Pairing berhasil. Sekarang hubungkan IP:port debugging.'));
      setPairCode('');
    } else {
      setInfo('');
      setError(res.message || res.error || t('Perangkat tidak ditemukan.'));
    }
    setConnecting(false);
  };

  const toDevice = (e: PointerEvent | React.PointerEvent<HTMLDivElement>) => {
    const img = imgRef.current;
    if (!img || !imgSize) return null;
    const r = img.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    const x = ((e.clientX - r.left) / r.width) * imgSize.w;
    const y = ((e.clientY - r.top) / r.height) * imgSize.h;
    return { x: Math.max(0, Math.min(imgSize.w, x)), y: Math.max(0, Math.min(imgSize.h, y)) };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = selRef.current;
    if (!s || !mirroring) return;
    const p = toDevice(e);
    if (!p) return;
    dragRef.current = { active: true, last: p };
    void mirrorInput(s, 'tap', p);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = selRef.current;
    const drag = dragRef.current;
    if (!s || !drag.active) return;
    const p = toDevice(e);
    if (!p) return;
    const dist = Math.hypot(p.x - drag.last.x, p.y - drag.last.y);
    if (dist < 28) return;
    void mirrorInput(s, 'swipe', { x1: drag.last.x, y1: drag.last.y, x2: p.x, y2: p.y, dur: 45 });
    dragRef.current.last = p;
  };

  const onPointerUp = () => {
    dragRef.current.active = false;
  };

  const sendKey = (code: number) => {
    const s = selRef.current;
    if (!s) return;
    void mirrorInput(s, 'key', { code });
  };

  const sendText = () => {
    const s = selRef.current;
    if (!s || !text.trim()) return;
    void mirrorInput(s, 'text', { text: text.trim() });
    setText('');
  };

  const saveShot = async () => {
    if (saving || !frame) return;
    setSaving(true);
    setError('');
    const res = await savePngAs(frame);
    if (!res.ok) setError(t('Gagal menyimpan tangkapan.'));
    setSaving(false);
  };

  const openSmooth = async () => {
    const s = selRef.current;
    if (!s) return;
    setError('');
    setInfo('');
    const res = await mirrorLaunch(s);
    if (res.ok) setInfo(t('scrcpy dibuka di jendela terpisah.'));
    else setError(res.error || t('Perangkat tidak ditemukan.'));
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        icon="phone"
        title={t('Mirror HP')}
        desc={t('Cerminkan layar HP Android ke PC, kendalikan dari jauh, nirkabel atau via USB.')}
        onBack={onBack}
        actions={
          <button type="button" className="btn-secondary" onClick={() => void refresh()} disabled={busy}>
            <Icon name="replay" className="w-4 h-4" />
            {t('Muat Ulang')}
          </button>
        }
      />

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger-strong)]">
          <Icon name="alert" className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
      {info && (
        <div className="flex items-center gap-2.5 rounded-xl border border-[var(--ok-border)] bg-[var(--ok-soft)] px-3.5 py-2.5 text-sm text-[var(--ok-strong)]">
          <Icon name="check" className="w-4 h-4 shrink-0" />
          {info}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Koneksi */}
        <div className="space-y-4 min-w-0">
          <section className="card p-4 space-y-3.5">
            <h2 className="eyebrow">{t('Hubungkan')}</h2>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-3)] mb-1.5">{t('IP:port HP (mis. 192.168.1.5:5555)')}</label>
              <input
                className="input w-full"
                value={addr}
                spellCheck={false}
                placeholder="192.168.1.5:5555"
                onChange={(e) => setAddr(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void doConnect();
                }}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-3)] mb-1.5">{t('Kode Pairing (Android 11+, opsional)')}</label>
              <input
                className="input w-full"
                type="password"
                value={pairCode}
                placeholder="123456"
                onChange={(e) => setPairCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void doPair();
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-primary" onClick={() => void doConnect()} disabled={connecting}>
                {connecting ? (
                  <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                ) : (
                  <Icon name="link" className="w-4 h-4" />
                )}
                {t('Hubungkan')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => void doPair()} disabled={connecting}>
                {t('Pair & Hubungkan')}
              </button>
            </div>
            <button type="button" className="btn-secondary w-full" onClick={() => void mirrorDisconnect()}>
              <Icon name="x" className="w-4 h-4" />
              {t('Putuskan Semua')}
            </button>
            <p className="text-[11px] text-[var(--text-3)] leading-relaxed">
              {t('Android 11+ (Nirkabel): Setting › Opsi pengembang › Wireless debugging › Pair device dengan kode. Isi IP:port utama di kolom pertama dan kode di kolom kedua. Android lama: colok USB sekali lalu adb tcpip di komputer.')}
            </p>
          </section>

          <section className="card p-4 space-y-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="eyebrow">{t('Perangkat')}</h2>
              <span className="chip">{devices.length}</span>
            </div>
            {devices.length === 0 ? (
              <p className="text-sm text-[var(--text-3)] px-1 py-2">{t('Tidak ada perangkat terdeteksi.')}</p>
            ) : (
              <div className="space-y-1.5">
                {devices.map((d) => {
                  const active = selRef.current === d.serial && mirroring;
                  const connected = d.state === 'device';
                  return (
                    <button
                      key={d.serial}
                      type="button"
                      onClick={() => pickDevice(d)}
                      className={`w-full flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors select-none ${
                        active
                          ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]'
                          : 'border-[var(--border)] hover:bg-[var(--overlay)]'
                      }`}
                    >
                      <span className={`shrink-0 grid place-items-center w-8 h-8 rounded-lg ${connected ? 'bg-[var(--ok-soft)] text-[var(--ok-strong)]' : 'bg-[var(--overlay)] text-[var(--text-3)]'}`}>
                        <Icon name="phone" className="w-4 h-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-[var(--text)]">{d.model || d.product || d.serial}</span>
                        <span className="block truncate text-[11px] text-[var(--text-3)]">
                          {d.serial} · {d.usb ? 'USB' : d.wireless ? 'Nirkabel' : connected ? t('Siap Cermin') : d.state}
                        </span>
                      </span>
                      {active && <Icon name="check" className="w-4 h-4 shrink-0 text-[var(--accent-strong)]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Preview */}
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <Icon name="cast" className="w-4 h-4 text-[var(--accent-strong)]" />
              <span className="text-sm font-semibold text-[var(--text)]">{t('Pratinjau Langsung')}</span>
              {mirroring && (
                <span className="inline-flex items-center gap-1.5 chip bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok-strong)] animate-pulse" />
                  LIVE
                </span>
              )}
            </div>
            {selected && (
              <div className="flex items-center gap-2">
                <button type="button" className="btn-primary !py-2" onClick={() => void openSmooth()} title={t('Buka Mode Lancar (scrcpy)')}>
                  <Icon name="cast" className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('Mode Lancar')}</span>
                </button>
                <button type="button" className="btn-secondary !py-2" onClick={() => void saveShot()} disabled={!frame || saving}>
                  <Icon name="save" className="w-4 h-4" />
                  {t('Simpan Tangkapan')}
                </button>
              </div>
            )}
          </div>

          <div className="p-4 bg-[var(--bg-2)]">
            <div className="relative w-full aspect-[9/19] max-h-[62vh] mx-auto rounded-xl border border-[var(--border-2)] bg-black/60 overflow-hidden grid place-items-center">
              {frame ? (
                <>
                  <img
                    ref={imgRef}
                    src={frame}
                    alt={t('Pratinjau Langsung')}
                    draggable={false}
                    className="max-w-full max-h-full object-contain touch-none select-none"
                    style={{ pointerEvents: mirroring ? 'none' : undefined }}
                    onLoad={() => {
                      const im = imgRef.current;
                      if (im && im.naturalWidth && im.naturalHeight) setImgSize({ w: im.naturalWidth, h: im.naturalHeight });
                    }}
                  />
                  {mirroring && (
                    <div
                      className="absolute inset-0"
                      style={{ cursor: 'crosshair', touchAction: 'none' }}
                      onPointerDown={onPointerDown}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerLeave={onPointerUp}
                    />
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 text-[var(--text-3)] p-6 text-center">
                  <Icon name="cast" className="w-8 h-8" />
                  <p className="text-sm max-w-[240px]">{selected ? t('Mengambil layar…') : t('Klik perangkat untuk mulai cermin.')}</p>
                </div>
              )}
            </div>

            {selected && (
              <>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <button type="button" className="tool-btn h-9 w-12" onClick={() => sendKey(4)} title={t('Kembali')}>
                    <Icon name="arrowLeft" className="w-4 h-4" />
                  </button>
                  <button type="button" className="tool-btn h-9 w-12" onClick={() => sendKey(3)} title={t('Beranda')}>
                    <Icon name="home" className="w-4 h-4" />
                  </button>
                  <button type="button" className="tool-btn h-9 w-12" onClick={() => sendKey(187)} title={t('Terkini')}>
                    <Icon name="layers" className="w-4 h-4" />
                  </button>
                  {mirroring && (
                    <button type="button" className="btn-secondary !py-2 ml-1" onClick={stopMirror}>
                      <Icon name="stop" className="w-4 h-4" />
                      {t('Berhenti')}
                    </button>
                  )}
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <input
                    className="input flex-1"
                    value={text}
                    placeholder={t('Ketik teks ke HP…')}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') sendText();
                    }}
                  />
                  <button type="button" className="btn-primary !py-2" onClick={sendText} disabled={!text.trim()}>
                    <Icon name="type" className="w-4 h-4" />
                    {t('Kirim')}
                  </button>
                </div>
              </>
            )}

            <p className="mt-3 text-[11px] text-[var(--text-3)] text-center">
              {t('Pratinjau 2-5 fps. Untuk streaming mulus, gunakan Mode Lancar.')}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}