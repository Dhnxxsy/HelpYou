import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { isDesktop } from '../lib/platform';

interface SessionRow {
  pid: number;
  name: string;
  title: string;
  volume: number;
  muted: boolean;
  system: boolean;
}

interface MixerSnapshotData {
  master: { volume: number; muted: boolean };
  sessions: SessionRow[];
}

type Tab = 'suara' | 'chat' | 'jelajah';

const LS_OVERLAY_URL = 'helpyou-overlay-url';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function normalizeUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
  } catch {
    /* keep going */
  }
  return /^https?:\/\//i.test(s) ? s : null;
}

function storedOverlayUrl(): string {
  try {
    const v = localStorage.getItem(LS_OVERLAY_URL);
    return v && /^https?:\/\//i.test(v) ? v : '';
  } catch {
    return '';
  }
}

interface WvWebview extends HTMLElement {
  canGoBack?: () => boolean;
  canGoForward?: () => boolean;
  getURL?: () => string;
  goBack?: () => void;
  goForward?: () => void;
  reload?: () => void;
  setUserAgent?: (ua: string) => void;
}

export default function OverlayView() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('suara');

  const hideOverlay = () => {
    if (isDesktop && window.electron) window.electron.overlay.hide();
  };

  return (
    <div className="ov-root">
      <header className="ov-header">
        <div className="ov-drag flex flex-1 min-w-0 items-center gap-2">
          <span className="ov-logo">
            <Icon name="sparkle" className="w-3.5 h-3.5" />
          </span>
          <span className="ov-title">{t('Overlay')}</span>
        </div>
        <button type="button" className="ov-no-drag ov-close" onClick={hideOverlay} title={t('Tutup')}>
          <Icon name="x" className="w-4 h-4" />
        </button>
      </header>

      <nav className="ov-tabs">
        {(
          [
            ['suara', 'volume', t('Suara')],
            ['chat', 'bot', t('Chat')],
            ['jelajah', 'globe', t('Jelajah')],
          ] as [Tab, 'volume' | 'bot' | 'globe', string][]
        ).map(([id, icon, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'ov-tab ov-tab-active' : 'ov-tab'}
            onClick={() => setTab(id)}
          >
            <Icon name={icon} className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="flex-1 min-h-0">
        {tab === 'suara' && <MixerTab />}
        {tab === 'chat' && <ChatTab />}
        {tab === 'jelajah' && <WebTab />}
      </div>
    </div>
  );
}

/* ------------------------------ Volume mixer ------------------------------ */

function AppSlider({
  value,
  onCommit,
  disabled,
}: {
  value: number;
  onCommit: (v: number) => void;
  disabled?: boolean;
}) {
  const [val, setVal] = useState(value);
  const dragging = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!dragging.current) setVal(value);
  }, [value]);

  const change = (v: number) => {
    setVal(v);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onCommit(v), 130);
  };

  const commitNow = (v: number) => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    onCommit(v);
  };

  return (
    <input
      type="range"
      min={0}
      max={100}
      value={val}
      disabled={disabled}
      className="ov-slider"
      style={{ ['--ov-fill' as string]: `${val}%` }}
      aria-label="volume"
      onPointerDown={() => {
        dragging.current = true;
      }}
      onPointerUp={() => {
        dragging.current = false;
        commitNow(val);
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onChange={(e) => change(Number(e.currentTarget.value))}
    />
  );
}

function MixerTab() {
  const { t } = useI18n();
  const [snap, setSnap] = useState<MixerSnapshotData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(0);

  const refresh = useCallback(async (silent = false) => {
    try {
      const s = await api<MixerSnapshotData>('/api/mixer/snapshot');
      setSnap(s);
      setError('');
    } catch (e: any) {
      if (!silent) setError(e?.message || 'Gagal membaca mixer.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(() => refresh(true), 3500);
    return () => window.clearInterval(id);
  }, [refresh]);

  const setMaster = async (v: number) => {
    setChanging((c) => c + 1);
    try {
      await api('/api/mixer/master', { method: 'POST', body: JSON.stringify({ volume: v / 100 }) });
    } catch (e: any) {
      setError(e?.message || 'Gagal mengubah volume.');
    } finally {
      setChanging((c) => c - 1);
    }
  };

  const toggleMasterMute = async () => {
    if (!snap) return;
    try {
      await api('/api/mixer/master', { method: 'POST', body: JSON.stringify({ muted: !snap.master.muted }) });
      setSnap({ ...snap, master: { ...snap.master, muted: !snap.master.muted } });
    } catch (e: any) {
      setError(e?.message || 'Gagal mengubah mute.');
    }
  };

  const setSessionVol = async (pid: number, v: number) => {
    try {
      await api('/api/mixer/session', { method: 'POST', body: JSON.stringify({ pid, volume: v / 100 }) });
    } catch (e: any) {
      setError(e?.message || 'Gagal mengubah volume aplikasi.');
    }
  };

  const toggleSessionMute = async (row: SessionRow) => {
    try {
      await api('/api/mixer/session', { method: 'POST', body: JSON.stringify({ pid: row.pid, muted: !row.muted }) });
      setSnap((s) =>
        s ? { ...s, sessions: s.sessions.map((x) => (x.pid === row.pid ? { ...x, muted: !x.muted } : x)) } : s,
      );
    } catch (e: any) {
      setError(e?.message || 'Gagal mengubah mute.');
    }
  };

  if (loading) {
    return (
      <div className="ov-center">
        <div className="ov-spin" />
        <p className="text-xs text-[var(--text-3)]">{t('Memuat {item}…', { item: t('Mixer') })}</p>
      </div>
    );
  }

  const sessions = snap?.sessions ?? [];

  return (
    <div className="ov-scroll h-full px-3.5 pb-4">
      {error && (
        <p className="mt-2 rounded-lg px-3 py-2 text-[11px] leading-snug text-[var(--accent-strong)] bg-[var(--accent-soft)] border border-[var(--accent-border)]">
          {error}
        </p>
      )}

      <div className="ov-card mt-2">
        <div className="ov-row">
          <button
            type="button"
            className="ov-icobtn"
            onClick={toggleMasterMute}
            title={snap?.master.muted ? t('Aktifkan suara') : t('Bisukan')}
          >
            <Icon name={snap?.master.muted ? 'volumeOff' : 'volume'} className="w-4 h-4" />
          </button>
          <span className="ov-row-name">{t('Volume sistem')}</span>
          <span className="ov-pct">{Math.round((snap?.master.volume ?? 0) * 100)}%</span>
        </div>
        <AppSlider
          value={Math.round((snap?.master.volume ?? 0) * 100)}
          onCommit={setMaster}
          disabled={changing > 2}
        />
      </div>

      <p className="ov-group-label">{t('Aplikasi')}</p>

      {sessions.length === 0 && (
        <div className="ov-center py-8">
          <Icon name="volume" className="w-6 h-6 text-[var(--text-3)]" />
          <p className="text-xs text-[var(--text-3)] mt-2">{t('Tidak ada aplikasi yang memutar suara.')}</p>
        </div>
      )}

      <div className="space-y-2">
        {sessions.map((s, i) => (
          <div key={s.pid} className="ov-card">
            <div className="ov-row">
              <span className="ov-avatar" style={avatarStyle(i)}>
                {initialOf(s.name)}
              </span>
              <span className="ov-row-name" title={s.title || s.name}>
                {s.name}
              </span>
              <span className="ov-pct">{Math.round(s.volume * 100)}%</span>
              <button
                type="button"
                className={s.muted ? 'ov-icobtn ov-icobtn-on' : 'ov-icobtn'}
                onClick={() => toggleSessionMute(s)}
                title={s.muted ? t('Aktifkan suara') : t('Bisukan')}
              >
                <Icon name={s.muted ? 'volumeOff' : 'volume'} className="w-3.5 h-3.5" />
              </button>
            </div>
            <AppSlider value={Math.round(s.volume * 100)} onCommit={(v) => setSessionVol(s.pid, v)} />
          </div>
        ))}
      </div>
    </div>
  );
}

const AVATAR_COLORS = ['#818cf8', '#c084fc', '#34d399', '#fbbf24', '#38bdf8', '#fb7185', '#a3e635'];

function avatarStyle(i: number): React.CSSProperties {
  const c = AVATAR_COLORS[i % AVATAR_COLORS.length];
  return { background: `color-mix(in srgb, ${c} 22%, transparent)`, color: c };
}

function initialOf(name: string): string {
  const clean = name.trim().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (!clean) return '?';
  const parts = clean.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

/* --------------------------------- Chat --------------------------------- */

interface ChatMsg {
  role: 'user' | 'ai';
  content: string;
}

function ChatTab() {
  const { t } = useI18n();
  const [online, setOnline] = useState<boolean | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    api<{ up: boolean; models: string[]; error?: string }>('/api/ollama/status')
      .then((s) => {
        if (!alive) return;
        setOnline(s.up);
        setModels(s.models);
        setModel((m) => m || s.models[0] || '');
        if (!s.up) setError(s.error || t('Ollama tidak terhubung.'));
      })
      .catch(() => {
        if (!alive) return;
        setOnline(false);
        setError(t('Ollama tidak terhubung.'));
      });
    return () => {
      alive = false;
    };
  }, [t]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming || !model) return;
    const next: ChatMsg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setStreaming(true);
    setError('');
    const abort = new AbortController();
    abortRef.current = abort;
    setMessages([...next, { role: 'ai', content: '' }]);
    try {
      const res = await fetch('/api/ollama/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: next }),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        let msg = 'Gagal menghubungi Ollama.';
        try {
          const b = await res.json();
          if (b?.error) msg = b.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          try {
            const j = JSON.parse(line);
            if (typeof j?.message?.content === 'string') acc += j.message.content;
            if (typeof j?.error === 'string') throw new Error(j.error);
          } catch {
            /* skip malformed line */
          }
        }
        setMessages((m) => {
          const c = [...m];
          c[c.length - 1] = { role: 'ai', content: acc };
          return c;
        });
      }
      setMessages((m) => {
        const c = [...m];
        c[c.length - 1] = { role: 'ai', content: acc };
        return c;
      });
    } catch (e: any) {
      if ((e?.name || '') !== 'AbortError') {
        setMessages((m) => [...m, { role: 'ai', content: `⚠ ${e?.message || 'Error'}` }]);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="ov-chat-toolbar">
        <div className="flex items-center gap-2">
          <span className={`ov-dot ${online ? 'ov-dot-on' : ''}`} />
          <span className="text-[11px] text-[var(--text-2)]">
            {online === true ? t('Terhubung') : online === false ? t('Offline') : t('Memeriksa…')}
          </span>
        </div>
        <select
          className="ov-select"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={!online}
          title={t('Model')}
        >
          {!model && <option value="">{t('Model')}…</option>}
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div ref={scrollRef} className="ov-scroll ov-chat">
        {messages.length === 0 && (
          <div className="ov-center py-8">
            <span className="ov-logo ov-logo-lg">
              <Icon name="bot" className="w-6 h-6" />
            </span>
            <p className="text-xs text-[var(--text-3)] mt-3 max-w-[240px] text-center leading-relaxed">
              {t('Mulai percakapan dengan model lokalmu. Privasi dan tanpa internet.')}
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'ov-bubble ov-bubble-user' : 'ov-bubble ov-bubble-ai'}>
            {m.content || (m.role === 'ai' && streaming && i === messages.length - 1 ? '…' : '')}
          </div>
        ))}
        {streaming && (
          <div className="ov-bubble ov-bubble-ai ov-bubble-typing">
            <span className="ov-typing">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
        {error && (
          <p className="mx-3 my-2 rounded-lg px-3 py-2 text-[11px] leading-snug text-[var(--accent-strong)] bg-[var(--accent-soft)] border border-[var(--accent-border)]">
            {error}
          </p>
        )}
      </div>

      <div className="ov-chat-input">
        <textarea
          ref={inputRef}
          value={input}
          disabled={!online}
          placeholder={t('Pesan ke AI…')}
          rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          className="ov-textarea"
        />
        {streaming ? (
          <button type="button" className="ov-send ov-send-stop" onClick={stop} title={t('Hentikan')}>
            <Icon name="stop" className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            className="ov-send"
            disabled={!online || !input.trim()}
            onClick={send}
            title={t('Kirim')}
          >
            <Icon name="arrowRight" className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Web (jelajah) ----------------------------- */

function WebTab() {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const wvRef = useRef<WvWebview | null>(null);
  const [urlInput, setUrlInput] = useState(storedOverlayUrl() || 'https://www.google.com');
  const [canBack, setCanBack] = useState(false);
  const [canFwd, setCanFwd] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;
    const host = hostRef.current;
    if (!host) return;
    const wv = document.createElement('webview') as unknown as WvWebview;
    wv.setAttribute('useragent', BROWSER_UA);
    wv.style.cssText = 'height:100%;width:100%;display:flex;';
    host.appendChild(wv);
    wvRef.current = wv;
    const nav = () => {
      setCanBack(!!wv.canGoBack?.());
      setCanFwd(!!wv.canGoForward?.());
      let u = '';
      try {
        u = wv.getURL?.() || '';
      } catch {
        u = '';
      }
      if (u) {
        try {
          localStorage.setItem(LS_OVERLAY_URL, u);
        } catch {
          /* ignore */
        }
      }
    };
    wv.addEventListener('did-start-loading', () => setLoading(true));
    wv.addEventListener('did-stop-loading', () => setLoading(false));
    wv.addEventListener('did-navigate', nav);
    wv.addEventListener('did-navigate-in-page', nav);
    wv.addEventListener('did-fail-load', () => setLoading(false));
    const initial = storedOverlayUrl() || 'https://www.google.com';
    wv.setAttribute('src', initial);
    setUrlInput(initial);
    return () => {
      try {
        host.removeChild(wv);
      } catch {
        /* ignore */
      }
    };
  }, []);

  const go = (raw: string) => {
    const u = normalizeUrl(raw);
    if (!u) return;
    wvRef.current?.setAttribute('src', u);
    setUrlInput(u);
    try {
      localStorage.setItem(LS_OVERLAY_URL, u);
    } catch {
      /* ignore */
    }
  };

  const back = () => wvRef.current?.canGoBack?.() && wvRef.current?.goBack?.();
  const fwd = () => wvRef.current?.canGoForward?.() && wvRef.current?.goForward?.();
  const reload = () => wvRef.current?.reload?.();

  return (
    <div className="h-full flex flex-col">
      <div className="ov-webbar">
        <button type="button" className="ov-icobtn" onClick={back} disabled={!canBack} title={t('Mundur')}>
          <Icon name="arrowLeft" className="w-3.5 h-3.5" />
        </button>
        <button type="button" className="ov-icobtn" onClick={fwd} disabled={!canFwd} title={t('Maju')}>
          <Icon name="arrowRight" className="w-3.5 h-3.5" />
        </button>
        <button type="button" className="ov-icobtn" onClick={reload} title={t('Muat ulang')}>
          {loading ? <Icon name="x" className="w-3.5 h-3.5" /> : <Icon name="replay" className="w-3.5 h-3.5" />}
        </button>
        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            go(urlInput);
          }}
        >
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder={t('Alamat web')}
            className="ov-url"
            spellCheck={false}
          />
        </form>
      </div>
      <div ref={hostRef} className="flex-1 min-h-0 ov-webhost" />
    </div>
  );
}