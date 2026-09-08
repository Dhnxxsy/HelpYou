import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Icon from '../components/Icon';
import { isDesktop, captureListSources, captureScreenshot, captureSaveData, captureCopyImage, type CaptureSource } from '../lib/platform';
import { useI18n } from '../lib/i18n';

interface ScreenCaptureViewProps {
  onBack: () => void;
}

type Mode = 'shot' | 'rec';
type ShotFormat = 'png' | 'jpg';
type RecFormat = 'mp4' | 'webm9' | 'webm8';
type RecQuality = 'rendah' | 'sedang' | 'tinggi' | 'kustom';
type RecAudio = 'none' | 'mic';

interface ShotResult {
  dataUrl: string;
  width: number;
  height: number;
}

const FPS_OPTIONS = [15, 24, 30, 60];
const BITRATE_MIN = 1;
const BITRATE_MAX = 50;

const QUALITY_PRESETS: { id: RecQuality; fps: number; bitrate: number }[] = [
  { id: 'rendah', fps: 15, bitrate: 2 },
  { id: 'sedang', fps: 30, bitrate: 4 },
  { id: 'tinggi', fps: 30, bitrate: 8 },
];

function desktopVideoConstraints(sourceId: string, maxFps: number): MediaTrackConstraints {
  return {
    mandatory: {
      chromeMediaSource: 'desktop',
      chromeMediaSourceId: sourceId,
      maxFrameRate: maxFps,
    },
  } as unknown as MediaTrackConstraints;
}

function mimeForFormat(f: RecFormat): string | null {
  const candidates: string[] =
    f === 'mp4' ? ['video/mp4'] : f === 'webm9' ? ['video/webm;codecs=vp9'] : ['video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((c) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) || null;
}

function extForFormat(f: RecFormat): string {
  return f === 'mp4' ? 'mp4' : 'webm';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error || new Error('Gagal membaca data'));
    r.readAsDataURL(blob);
  });
}

function pngToJpeg(dataUrl: string, quality: number): Promise<ShotResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        if (!ctx) throw new Error('Canvas tidak tersedia');
        ctx.drawImage(img, 0, 0);
        resolve({ dataUrl: c.toDataURL('image/jpeg', quality), width: c.width, height: c.height });
      } catch (e: any) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Gagal memuat gambar'));
    img.src = dataUrl;
  });
}

function resizeImage(dataUrl: string, scale: number): Promise<ShotResult> {
  if (scale === 1) return Promise.resolve({ dataUrl, width: 0, height: 0 });
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) throw new Error('Canvas tidak tersedia');
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ dataUrl: c.toDataURL('image/png'), width: w, height: h });
      } catch (e: any) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Gagal memuat gambar'));
    img.src = dataUrl;
  });
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function screenLabel(name: string): string {
  const m = /Screen (\d+)/.exec(name);
  return m ? `Layar ${m[1]}` : (name || 'Layar');
}

export default function ScreenCaptureView({ onBack }: ScreenCaptureViewProps) {
  const { t } = useI18n();

  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sourceId, setSourceId] = useState('');

  const [mode, setMode] = useState<Mode>('shot');

  const [shotFormat, setShotFormat] = useState<ShotFormat>('png');
  const [shotQuality, setShotQuality] = useState(90);
  const [shotScale, setShotScale] = useState(1);
  const [shot, setShot] = useState<ShotResult | null>(null);
  const [shotBusy, setShotBusy] = useState(false);

  const [recQuality, setRecQuality] = useState<RecQuality>('sedang');
  const [recFps, setRecFps] = useState(30);
  const [recBitrate, setRecBitrate] = useState(4);
  const [recFormat, setRecFormat] = useState<RecFormat>('mp4');
  const [recAudio, setRecAudio] = useState<RecAudio>('none');
  const [recording, setRecording] = useState(false);
  const [recDoneUrl, setRecDoneUrl] = useState<string | null>(null);
  const [recErr, setRecErr] = useState('');
  const [elapsed, setElapsed] = useState(0);

  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  const chunksRef = useRef<Blob[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number>(0);
  const blobRef = useRef<Blob | null>(null);
  const prevUrlRef = useRef<string | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);

  const selected = useMemo(() => sources.find((s) => s.id === sourceId) || null, [sources, sourceId]);

  const loadSources = useCallback(async () => {
    setSourcesLoading(true);
    setSources([]);
    const res = await captureListSources();
    setSourcesLoading(false);
    if (!res.ok) {
      setNotice(res.error || t('Gagal memuat layar.'));
      return;
    }
    const list = res.sources || [];
    setSources(list);
    setSourceId((cur) => (list.some((s) => s.id === cur) ? cur : list[0]?.id || ''));
  }, [t]);

  useEffect(() => {
    if (isDesktop) loadSources();
    else setSourcesLoading(false);
  }, [loadSources]);

  useEffect(() => {
    return () => {
      stopAllTracks();
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
      window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopAllTracks() {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }

  function flashNotice(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice((cur) => (cur === msg ? '' : cur)), 4000);
  }

  /* ------------------------------- Screenshot ------------------------------- */

  const takeShot = async () => {
    if (!selected) return;
    setShotBusy(true);
    setShot(null);
    try {
      const res = await captureScreenshot({ displayId: selected.displayId });
      if (!res.ok || !res.dataUrl) throw new Error(res.error || t('Gagal mengambil gambar.'));
      let result: ShotResult = { dataUrl: res.dataUrl, width: res.width || 0, height: res.height || 0 };
      if (shotScale !== 1) result = await resizeImage(result.dataUrl, shotScale);
      if (shotFormat === 'jpg') result = await pngToJpeg(result.dataUrl, shotQuality / 100);
      setShot(result);
    } catch (e: any) {
      flashNotice(t('Gagal mengambil gambar: {msg}', { msg: e?.message || String(e) }));
    } finally {
      setShotBusy(false);
    }
  };

  const saveShot = async () => {
    if (!shot) return;
    setBusy(t('Menyimpan…'));
    try {
      const ext = shotFormat === 'jpg' ? 'jpg' : 'png';
      const res = await captureSaveData({
        dataUrl: shot.dataUrl,
        defaultName: `Tangkapan-HelpYou-${stamp()}.${ext}`,
        filters: [
          { name: ext === 'jpg' ? 'Gambar JPEG' : 'Gambar PNG', extensions: [ext] },
          { name: t('Semua File'), extensions: ['*'] },
        ],
      });
      if (res.canceled) return;
      if (!res.ok) throw new Error(res.error || t('Gagal menyimpan.'));
      flashNotice(t('Tersimpan ke {path}', { path: res.path || '' }));
    } catch (e: any) {
      flashNotice(t('Gagal menyimpan: {msg}', { msg: e?.message || String(e) }));
    } finally {
      setBusy('');
    }
  };

  const copyShot = async () => {
    if (!shot) return;
    const res = await captureCopyImage(shot.dataUrl);
    if (res.ok) flashNotice(t('Gambar disalin ke papan klip.'));
    else flashNotice(res.error || t('Gagal menyalin gambar.'));
  };

  /* -------------------------------- Recording -------------------------------- */

  const pickPreset = (p: RecQuality) => {
    setRecQuality(p);
    if (p === 'kustom') return;
    const preset = QUALITY_PRESETS.find((q) => q.id === p);
    if (preset) {
      setRecFps(preset.fps);
      setRecBitrate(preset.bitrate);
    }
  };

  const startRecord = async () => {
    if (!selected) return;
    if (recording) return;
    setRecErr('');
    setRecDoneUrl(null);
    try {
      const video = desktopVideoConstraints(selected.id, recFps);
      const opts: MediaStreamConstraints = { video, audio: recAudio === 'mic' ? { echoCancellation: true, noiseSuppression: true } : false };
      const stream = await navigator.mediaDevices.getUserMedia(opts);
      streamRef.current = stream;

      const mime = mimeForFormat(recFormat);
      if (!mime) {
        stopAllTracks();
        throw new Error(t('Format video tidak didukung. Coba WebM.'));
      }

      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        liveVideoRef.current.play().catch(() => {});
      }

      const chunks: Blob[] = [];
      chunksRef.current = chunks;
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: recBitrate * 1_000_000 });
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mime });
        stopAllTracks();
        window.clearInterval(timerRef.current);
        setRecording(false);
        if (blob.size === 0) {
          setRecErr(t('Hasil rekaman kosong.'));
          return;
        }
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        prevUrlRef.current = url;
        setRecDoneUrl(url);
      };
      recorder.start(1000);
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((v) => v + 1), 1000);
    } catch (e: any) {
      stopAllTracks();
      setRecErr(t('Gagal merekam: {msg}', { msg: e?.message || String(e) }));
    }
  };

  const stopRecord = () => {
    const r = recorderRef.current;
    recorderRef.current = null;
    if (r && r.state !== 'inactive') {
      try {
        r.stop();
      } catch {
        /* already stopped */
      }
    }
  };

  const saveRecord = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    setBusy(t('Menyimpan…'));
    try {
      const dataUrl = await blobToDataUrl(blob);
      const ext = extForFormat(recFormat);
      const res = await captureSaveData({
        dataUrl,
        defaultName: `Rekaman-HelpYou-${stamp()}.${ext}`,
        filters: [
          { name: ext === 'mp4' ? 'Video MP4' : 'Video WebM', extensions: [ext] },
          { name: t('Semua File'), extensions: ['*'] },
        ],
      });
      if (res.canceled) return;
      if (!res.ok) throw new Error(res.error || t('Gagal menyimpan.'));
      flashNotice(t('Tersimpan ke {path}', { path: res.path || '' }));
    } catch (e: any) {
      setRecErr(t('Gagal merekam: {msg}', { msg: e?.message || String(e) }));
    } finally {
      setBusy('');
    }
  };

  const resetRecording = () => {
    if (recording) return;
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = null;
    }
    blobRef.current = null;
    setRecDoneUrl(null);
    setRecErr('');
    setElapsed(0);
  };

  /* --------------------------------- Render --------------------------------- */

  if (!isDesktop) {
    return (
      <div className="animate-fade-in">
        <PageHeader icon="monitorPlay" title={t('Rekam & Jepret Layar')} desc={t('Jepret tangkapan layar atau rekam layar dengan pilihan kualitas, bitrate, dan FPS. Semua diproses 100% lokal.')} onBack={onBack} />
        <div className="card p-8 grid place-items-center text-center">
          <Icon name="monitorPlay" className="w-10 h-10 text-[var(--text-3)]" />
          <p className="text-sm text-[var(--text-2)] mt-3 max-w-md">{t('Fitur ini berjalan di aplikasi desktop HelpYou.')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader icon="monitorPlay" title={t('Rekam & Jepret Layar')} desc={t('Jepret tangkapan layar atau rekam layar dengan pilihan kualitas, bitrate, dan FPS. Semua diproses 100% lokal.')} onBack={onBack} />

      {notice && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-[var(--ok-border)] bg-[var(--ok-soft)] text-[13px] text-[var(--ok-strong)] flex items-center gap-2 animate-fade-in">
          <Icon name="check" className="w-4 h-4 shrink-0" />
          <span className="min-w-0 break-words">{notice}</span>
        </div>
      )}

      <div className="grid lg:grid-cols-[380px_1fr] gap-4 items-start">
        {/* ------------------------------- Controls ------------------------------- */}
        <div className="space-y-4">
          <div className="card p-4 space-y-4">
            <div className="flex items-center gap-1 bg-[var(--overlay-2)] rounded-xl p-1">
              <button
                type="button"
                onClick={() => setMode('shot')}
                className={`flex-1 grid place-items-center gap-1 py-2 rounded-lg text-xs font-medium transition-all ${
                  mode === 'shot' ? 'bg-white/[0.06] shadow-sm text-[var(--text)]' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
                }`}
              >
                <Icon name="camera" className="w-4 h-4" />
                {t('Jepret')}
              </button>
              <button
                type="button"
                onClick={() => setMode('rec')}
                className={`flex-1 grid place-items-center gap-1 py-2 rounded-lg text-xs font-medium transition-all ${
                  mode === 'rec' ? 'bg-white/[0.06] shadow-sm text-[var(--text)]' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
                }`}
              >
                <Icon name="video" className="w-4 h-4" />
                {t('Rekam')}
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">{t('Pilih Layar')}</label>
                <button type="button" className="tool-btn text-[var(--text-3)] hover:text-[var(--accent-strong)]" onClick={loadSources} disabled={sourcesLoading || recording}>
                  <Icon name="replay" className="w-3.5 h-3.5" />
                </button>
              </div>
              {sourcesLoading ? (
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="aspect-video rounded-lg bg-[var(--overlay-2)] animate-pulse" />
                  ))}
                </div>
              ) : sources.length === 0 ? (
                <p className="text-xs text-[var(--text-3)]">{t('Tidak ada layar terdeteksi.')}</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {sources.map((s) => {
                    const active = s.id === sourceId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSourceId(s.id)}
                        disabled={recording}
                        title={`${screenLabel(s.name)} · ${s.width}×${s.height}`}
                        className={`group relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                          active ? 'border-[var(--accent-strong)] ring-2 ring-[var(--accent-glow)]' : 'border-[var(--border-2)] hover:border-[var(--accent-border)]'
                        }`}
                      >
                        {s.thumb ? (
                          <img src={s.thumb} alt={screenLabel(s.name)} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full grid place-items-center bg-[var(--overlay-2)] text-[var(--text-3)]">
                            <Icon name="monitor" className="w-4 h-4" />
                          </div>
                        )}
                        <span className="absolute bottom-0 inset-x-0 px-1.5 py-0.5 text-[10px] text-white bg-black/60 truncate text-left">
                          {screenLabel(s.name)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {selected && (
                <p className="text-[11px] text-[var(--text-3)] mt-1.5 tabular-nums">
                  {selected.width}×{selected.height}px
                </p>
              )}
            </div>

            {mode === 'shot' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">{t('Format')}</label>
                  <div className="flex gap-1 bg-[var(--overlay-2)] rounded-lg p-1">
                    {(['png', 'jpg'] as ShotFormat[]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setShotFormat(f)}
                        className={`px-3 py-1 rounded-md text-xs font-medium uppercase transition-all ${
                          shotFormat === f ? 'bg-white/[0.06] text-[var(--text)]' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {shotFormat === 'jpg' && (
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">{t('Kualitas JPG')}</label>
                      <span className="text-xs text-[var(--text-2)] tabular-nums">{shotQuality}%</span>
                    </div>
                    <input
                      type="range"
                      min={30}
                      max={100}
                      value={shotQuality}
                      onChange={(e) => setShotQuality(Number(e.target.value))}
                      className="w-full accent-[var(--accent-strong)]"
                    />
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">{t('Skala')}</label>
                    <span className="text-xs text-[var(--text-2)] tabular-nums">{Math.round(shotScale * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={1.5}
                    step={0.25}
                    value={shotScale}
                    onChange={(e) => setShotScale(Number(e.target.value))}
                    className="w-full accent-[var(--accent-strong)]"
                  />
                </div>

                <button type="button" className="btn-primary w-full !h-11" onClick={takeShot} disabled={!selected || shotBusy || shotScale < 0.5}>
                  {shotBusy ? (
                    <span className="flex items-center gap-2">
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      {t('Mengambil gambar…')}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Icon name="camera" className="w-4 h-4" />
                      {t('Jepret Layar')}
                    </span>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">{t('Kualitas')}</label>
                    <div className="flex gap-1 bg-[var(--overlay-2)] rounded-lg p-1">
                      {QUALITY_PRESETS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => pickPreset(p.id)}
                          disabled={recording}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                            recQuality === p.id ? 'bg-white/[0.06] text-[var(--text)]' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
                          }`}
                        >
                          {t(p.id === 'rendah' ? 'Rendah' : p.id === 'sedang' ? 'Sedang' : 'Tinggi')}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => pickPreset('kustom')}
                        disabled={recording}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                          recQuality === 'kustom' ? 'bg-white/[0.06] text-[var(--text)]' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
                        }`}
                      >
                        {t('Kustom')}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">{t('FPS')}</label>
                    <select
                      className="input mt-1"
                      value={recFps}
                      onChange={(e) => {
                        setRecFps(Number(e.target.value));
                        setRecQuality('kustom');
                      }}
                      disabled={recording}
                    >
                      {FPS_OPTIONS.map((f) => (
                        <option key={f} value={f}>
                          {f} fps
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">{t('Format')}</label>
                    <select
                      className="input mt-1"
                      value={recFormat}
                      onChange={(e) => setRecFormat(e.target.value as RecFormat)}
                      disabled={recording}
                    >
                      <option value="mp4">MP4 (H.264)</option>
                      <option value="webm9">WebM (VP9)</option>
                      <option value="webm8">WebM (VP8)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">{t('Bitrate')}</label>
                    <span className="text-xs text-[var(--text-2)] tabular-nums">{recBitrate} Mbps</span>
                  </div>
                  <input
                    type="range"
                    min={BITRATE_MIN}
                    max={BITRATE_MAX}
                    step={1}
                    value={recBitrate}
                    onChange={(e) => {
                      setRecBitrate(Number(e.target.value));
                      setRecQuality('kustom');
                    }}
                    disabled={recording}
                    className="w-full accent-[var(--accent-strong)]"
                  />
                  <div className="flex justify-between text-[10px] text-[var(--text-3)] tabular-nums mt-0.5">
                    <span>{BITRATE_MIN} Mbps</span>
                    <span>{BITRATE_MAX} Mbps</span>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">{t('Audio')}</label>
                  <div className="flex gap-1 bg-[var(--overlay-2)] rounded-lg p-1 mt-1">
                    <button
                      type="button"
                      onClick={() => setRecAudio('none')}
                      disabled={recording}
                      className={`flex-1 grid place-items-center gap-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                        recAudio === 'none' ? 'bg-white/[0.06] text-[var(--text)]' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
                      }`}
                    >
                      {t('Tanpa Audio')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecAudio('mic')}
                      disabled={recording}
                      className={`flex-1 grid place-items-center gap-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                        recAudio === 'mic' ? 'bg-white/[0.06] text-[var(--text)]' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
                      }`}
                    >
                      <Icon name="mic" className="w-3.5 h-3.5" />
                      {t('Mikrofon')}
                    </button>
                  </div>
                </div>

                {recording ? (
                  <button
                    type="button"
                    className="btn-danger w-full !h-11 !bg-[var(--danger-strong)] hover:!bg-[var(--danger-strong)]"
                    onClick={stopRecord}
                  >
                    <span className="flex items-center gap-2">
                      <span className="rec-pulse-dot" />
                      {t('Berhenti & Simpan')} · {formatElapsed(elapsed)}
                    </span>
                  </button>
                ) : (
                  <button type="button" className="btn-primary w-full !h-11" onClick={startRecord} disabled={!selected}>
                    <span className="flex items-center gap-2">
                      <Icon name="video" className="w-4 h-4" />
                      {t('Mulai Rekam')}
                    </span>
                  </button>
                )}
                {recErr && <p className="text-xs text-[var(--danger-strong)]">{recErr}</p>}
              </div>
            )}
          </div>
        </div>

        {/* -------------------------------- Preview -------------------------------- */}
        <div className="card p-4 min-h-[320px]">
          <div className="flex items-center justify-between mb-3">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">{t('Pratinjau')}</label>
            {mode === 'shot' && shot && (
              <span className="text-[11px] text-[var(--text-3)] tabular-nums">
                {shot.width}×{shot.height}px · {shotFormat.toUpperCase()}
              </span>
            )}
          </div>

          {mode === 'shot' && !shot && (
            <div className="grid place-items-center py-16 text-[var(--text-3)]">
              <div className="flex flex-col items-center gap-3">
                <Icon name="camera" className="w-9 h-9" />
                <p className="text-xs max-w-[220px] text-center leading-relaxed">{t('Klik “Jepret Layar” untuk mengambil gambar dari layar yang dipilih.')}</p>
              </div>
            </div>
          )}

          {mode === 'shot' && shot && (
            <div className="space-y-3">
              <div className="rounded-xl overflow-hidden border border-[var(--border-2)] bg-black">
                <img src={shot.dataUrl} alt={t('Pratinjau')} className="w-full max-h-[420px] object-contain" />
              </div>
              {(busy || shotBusy) && (
                <div className="h-6 relative overflow-hidden rounded-lg bg-[var(--overlay-2)]">
                  <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-[var(--accent-strong)] to-transparent animate-[shimmer_1.4s_infinite]" />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary !h-10" onClick={saveShot} disabled={busy === t('Menyimpan…')}>
                  <Icon name="download" className="w-4 h-4" />
                  {t('Simpan')}
                </button>
                <button type="button" className="btn-secondary !h-10" onClick={copyShot}>
                  <Icon name="link" className="w-4 h-4" />
                  {t('Salin')}
                </button>
                <button type="button" className="btn-ghost !h-10" onClick={takeShot} disabled={shotBusy}>
                  <Icon name="replay" className="w-4 h-4" />
                  {t('Jepret Lagi')}
                </button>
              </div>
              {shotFormat === 'jpg' && <p className="text-[11px] text-[var(--text-3)]">{t('JPG berkualitas {q}%', { q: shotQuality })}</p>}
            </div>
          )}

          {mode === 'rec' && !recording && !recDoneUrl && (
            <div className="grid place-items-center py-16 text-[var(--text-3)]">
              <div className="flex flex-col items-center gap-3">
                <Icon name="video" className="w-9 h-9" />
                <p className="text-xs max-w-[240px] text-center leading-relaxed">
                  {t('Pilih layar dan atur kualitas, lalu klik “Mulai Rekam”.')}
                </p>
              </div>
            </div>
          )}

          {mode === 'rec' && recording && (
            <div className="relative rounded-xl overflow-hidden border border-[var(--danger-border)] bg-black">
              <video ref={liveVideoRef} autoPlay muted playsInline className="w-full max-h-[420px] object-contain" />
              <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/70 text-white text-[11px] font-medium">
                <span className="rec-pulse-dot" />
                REC · {formatElapsed(elapsed)}
              </div>
            </div>
          )}

          {mode === 'rec' && !recording && recDoneUrl && (
            <div className="space-y-3">
              <div className="rounded-xl overflow-hidden border border-[var(--border-2)] bg-black">
                <video src={recDoneUrl} controls playsInline className="w-full max-h-[420px] object-contain" />
              </div>
              {(busy === t('Menyimpan…')) && (
                <div className="h-6 relative overflow-hidden rounded-lg bg-[var(--overlay-2)]">
                  <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-[var(--accent-strong)] to-transparent animate-[shimmer_1.4s_infinite]" />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary !h-10" onClick={saveRecord} disabled={busy === t('Menyimpan…')}>
                  <Icon name="download" className="w-4 h-4" />
                  {t('Simpan')}
                </button>
                <button type="button" className="btn-ghost !h-10" onClick={resetRecording}>
                  <Icon name="replay" className="w-4 h-4" />
                  {t('Rekam Lagi')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  function stamp(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }
}