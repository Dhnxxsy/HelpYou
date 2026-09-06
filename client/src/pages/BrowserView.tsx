import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';
import { ACTIVE_TOOLS } from '../lib/tools';
import { useI18n, tGlobal } from '../lib/i18n';
import { isDesktop, openExternal } from '../lib/platform';

interface WvEl extends HTMLElement {
  loadURL: (url: string) => void;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  getURL: () => string;
}

const LS_URL = 'helpyou-browser-url';

const QUICK_LINKS = [
  { name: 'Shopee', url: 'https://shopee.co.id', grad: 'from-orange-500 to-amber-500' },
  { name: 'YouTube', url: 'https://youtube.com', grad: 'from-red-500 to-rose-600' },
  { name: 'Google', url: 'https://google.com', grad: 'from-blue-500 to-indigo-500' },
  { name: 'Wikipedia', url: 'https://wikipedia.org', grad: 'from-slate-500 to-slate-700' },
  { name: 'Instagram', url: 'https://instagram.com', grad: 'from-pink-500 to-rose-500' },
  { name: 'ChatGPT', url: 'https://chatgpt.com', grad: 'from-emerald-500 to-teal-600' },
  { name: 'Gmail', url: 'https://mail.google.com', grad: 'from-red-400 to-pink-500' },
  { name: 'GitHub', url: 'https://github.com', grad: 'from-purple-500 to-indigo-600' },
];

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
  if (/^https?:\/\//i.test(s)) return s;
  return null;
}

function storedUrl(): string {
  try {
    const v = localStorage.getItem(LS_URL);
    return v && /^https?:\/\//i.test(v) ? v : '';
  } catch {
    return '';
  }
}

export default function BrowserView({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const meta = ACTIVE_TOOLS.find((x) => x.tool === 'browser') ?? ACTIVE_TOOLS[0];
  const hostRef = useRef<HTMLDivElement>(null);
  const wvRef = useRef<WvEl | null>(null);

  const [urlInput, setUrlInput] = useState(storedUrl);
  const [loaded, setLoaded] = useState<string | null>(() => storedUrl() || null);
  const [loading, setLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loaded || !isDesktop) return;
    const host = hostRef.current;
    if (!host) return;

    const wv = document.createElement('webview') as unknown as WvEl;
    wvRef.current = wv;
    wv.setAttribute('src', loaded);
    wv.setAttribute('webpreferences', 'contextIsolation=yes, nodeIntegration=no');
    wv.classList.add('h-full', 'w-full');
    host.appendChild(wv);

    const refresh = () => {
      try {
        setCanGoBack(wv.canGoBack());
        setCanGoForward(wv.canGoForward());
      } catch {
        /* not ready yet */
      }
    };
    const onStart = () => {
      setLoading(true);
      setError('');
    };
    const onStop = () => {
      setLoading(false);
      refresh();
    };
    const onNavigated = (e: { url?: string }) => {
      const u = e?.url || wv.getURL();
      if (/^https?:\/\//i.test(u)) {
        setUrlInput(u);
        try {
          localStorage.setItem(LS_URL, u);
        } catch {
          /* ignore */
        }
      }
      refresh();
    };
    const onFail = (e: { isMainFrame?: boolean }) => {
      if (e && e.isMainFrame === false) return;
      setLoading(false);
      setError(tGlobal('Halaman gagal dimuat.'));
    };
    const onNewWindow = (e: { url?: string; preventDefault?: () => void }) => {
      e?.preventDefault?.();
      const u = e?.url;
      if (typeof u === 'string' && /^https?:\/\//i.test(u)) openExternal(u);
    };

    wv.addEventListener('did-start-loading', onStart);
    wv.addEventListener('did-stop-loading', onStop);
    wv.addEventListener('did-navigate', onNavigated as EventListener);
    wv.addEventListener('did-navigate-in-page', onNavigated as EventListener);
    wv.addEventListener('did-fail-load', onFail as EventListener);
    wv.addEventListener('render-process-gone', onFail as EventListener);
    wv.addEventListener('new-window', onNewWindow as EventListener);
    wv.addEventListener('did-attach', refresh as EventListener);

    return () => {
      wvRef.current = null;
      wv.remove();
    };
  }, [loaded]);

  const navigateTo = (raw: string) => {
    const u = normalizeUrl(raw);
    if (!u) return;
    setError('');
    const wv = wvRef.current;
    if (wv) {
      setUrlInput(u);
      try {
        wv.loadURL(u);
      } catch {
        /* recreate instead */
        setLoaded(u);
      }
    } else {
      setUrlInput(u);
      setLoaded(u);
    }
  };

  const goHome = () => {
    setLoaded(null);
    setUrlInput('');
    setError('');
    setCanGoBack(false);
    setCanGoForward(false);
    try {
      localStorage.removeItem(LS_URL);
    } catch {
      /* ignore */
    }
  };

  const back = () => {
    const wv = wvRef.current;
    if (wv) {
      try {
        wv.goBack();
      } catch {
        /* ignore */
      }
    }
  };

  const forward = () => {
    const wv = wvRef.current;
    if (wv) {
      try {
        wv.goForward();
      } catch {
        /* ignore */
      }
    }
  };

  const reload = () => {
    const wv = wvRef.current;
    if (wv) {
      try {
        wv.reload();
      } catch {
        /* ignore */
      }
    }
  };

  const openCurrentExternal = () => {
    const wv = wvRef.current;
    if (!wv) return;
    try {
      const u = wv.getURL();
      if (/^https?:\/\//i.test(u)) openExternal(u);
    } catch {
      /* ignore */
    }
  };

  const toolbarBtn =
    'w-9 h-9 grid place-items-center rounded-xl text-[var(--text-3)] hover:bg-[var(--overlay)] hover:text-[var(--text)] transition-colors disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent shrink-0';

  const urlBar = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        navigateTo(urlInput);
      }}
      className="flex-1 min-w-0 flex items-center gap-1.5 rounded-xl bg-[var(--bg-3)] border border-[var(--border)] focus-within:ring-2 focus-within:ring-[var(--ring)]"
    >
      <input
        value={urlInput}
        onChange={(e) => setUrlInput(e.target.value)}
        inputMode="url"
        spellCheck={false}
        placeholder={t('Masukkan alamat situs (contoh: shopee.co.id)')}
        className="w-full min-w-0 bg-transparent text-sm text-[var(--text)] placeholder-[var(--text-3)] px-3 py-2 focus:outline-none"
        aria-label={t('Masukkan alamat situs (contoh: shopee.co.id)')}
      />
      {loading && (
        <span className="shrink-0">
          <span className="block h-4 w-4 rounded-full border-2 border-[var(--accent-border)] border-t-[var(--accent-strong)] animate-spin" />
        </span>
      )}
      <button
        type="submit"
        title={t('Buka')}
        aria-label={t('Buka')}
        className="w-8 h-8 grid place-items-center rounded-lg bg-[var(--accent-deep)] text-white hover:opacity-90 transition-opacity shrink-0"
      >
        <Icon name="search" className="w-4 h-4" />
      </button>
    </form>
  );

  const toolbar = (
    <div className="card p-2 flex items-center gap-1.5">
      <button onClick={back} disabled={!canGoBack} title={t('Kembali')} aria-label={t('Kembali')} className={toolbarBtn}>
        <Icon name="arrowLeft" className="w-4 h-4" />
      </button>
      <button onClick={forward} disabled={!canGoForward} title={t('Maju')} aria-label={t('Maju')} className={toolbarBtn}>
        <Icon name="arrowRight" className="w-4 h-4" />
      </button>
      <button onClick={reload} title={t('Muat Ulang')} aria-label={t('Muat Ulang')} className={toolbarBtn}>
        <Icon name="replay" className="w-4 h-4" />
      </button>
      <button onClick={goHome} title={t('Beranda')} aria-label={t('Beranda')} className={toolbarBtn}>
        <Icon name="home" className="w-4 h-4" />
      </button>
      {urlBar}
      <button
        onClick={openCurrentExternal}
        disabled={!loaded}
        title={t('Buka di browser eksternal')}
        aria-label={t('Buka di browser eksternal')}
        className={toolbarBtn}
      >
        <Icon name="external" className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        icon={meta.icon}
        title={t(meta.title)}
        desc={t(meta.desc)}
        onBack={onBack}
      />

      {!isDesktop ? (
        <div className="card p-8 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-[var(--overlay)] grid place-items-center text-[var(--text-3)]">
            <Icon name="globe" className="w-6 h-6" />
          </div>
          <p className="text-sm text-[var(--text-2)]">{t('Browser Web hanya tersedia di aplikasi desktop.')}</p>
        </div>
      ) : loaded === null ? (
        <div className="card p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[var(--text)]">{t('Beranda Browser')}</h2>
            <p className="text-sm text-[var(--text-2)] mt-1">{t('Jelajah situs favoritmu langsung dari sini.')}</p>
          </div>
          {urlBar}
          <div>
            <div className="eyebrow mb-3">{t('Situs Pilihan')}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {QUICK_LINKS.map((q) => (
                <button
                  key={q.url}
                  onClick={() => navigateTo(q.url)}
                  className="card card-hover p-3 text-left flex items-center gap-3"
                >
                  <span className={`w-9 h-9 rounded-xl bg-gradient-to-br ${q.grad} grid place-items-center text-white shadow-lg shrink-0`}>
                    <Icon name="globe" className="w-4 h-4" />
                  </span>
                  <span className="text-sm font-semibold text-[var(--text)] truncate">{q.name}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-[var(--text-3)]">
            <Icon name="lock" className="w-3.5 h-3.5 text-[var(--accent-strong)]" />
            {t('Sesi browsing berjalan lokal di aplikasi ini — tidak dikirim ke mana pun.')}
          </p>
        </div>
      ) : (
        <>
          {toolbar}
          {error && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--warn-soft)] border border-[var(--warn-border)] text-[var(--warn-strong)] px-4 py-2.5 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <Icon name="alert" className="w-4 h-4 shrink-0" />
                <span className="truncate">{error}</span>
              </span>
              <button
                onClick={reload}
                className="shrink-0 rounded-lg bg-[var(--warn-strong)] text-white text-xs font-semibold px-3 py-1.5 hover:opacity-90 transition-opacity"
              >
                {t('Coba lagi')}
              </button>
            </div>
          )}
          <div
            className="card overflow-hidden flex flex-col"
            style={{ height: 'min(calc(100vh - 300px), 720px)', minHeight: 420 }}
          >
            <div ref={hostRef} className="flex-1 min-h-0 w-full" />
          </div>
        </>
      )}
    </div>
  );
}