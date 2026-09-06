import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Icon from '../components/Icon';
import { api } from '../lib/api';
import type { Note } from '@shared/types';
import { useI18n, tGlobal } from '../lib/i18n';

interface NotepadViewProps {
  onBack: () => void;
}

interface MatchRange {
  start: number;
  end: number;
}

const WELCOME_CONTENT = tGlobal(`Selamat datang di Notepad HelpYou.

Semua catatan tersimpan otomatis dan 100% lokal. Data tidak pernah dikirim ke mana pun.

Panduan singkat:
- Tulis saja; setiap perubahan akan tersimpan otomatis, ada indikator simpan di pojok kanan atas editor.
- Panel kiri untuk berpindah antar catatan. Tombol "Catatan Baru" atau Ctrl+N untuk membuat catatan.
- Gunakan toolbar di atas editor untuk format teks: tebal, miring, judul, kutipan, kode, daftar, checklist, tautan, dan pemisah.
- Ctrl+F untuk mencari, Ctrl+H untuk mencari & mengganti di dalam catatan.
- "Buka File" untuk membaca file teks apa pun, dan "Simpan Sebagai" untuk mengekspor catatan ke file.
- Aktifkan pin pada catatan favorit agar selalu muncul di urutan teratas.`);

function sortNotes(list: Note[]): Note[] {
  return [...list].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 5) return tGlobal('baru saja');
  if (s < 60) return tGlobal('{n} dtk lalu', { n: s });
  const m = Math.floor(s / 60);
  if (m < 60) return tGlobal('{n} mnt lalu', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return tGlobal('{n} jam lalu', { n: h });
  const d = Math.floor(h / 24);
  if (d === 1) return tGlobal('kemarin');
  if (d < 7) return tGlobal('{n} hari lalu', { n: d });
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function snippetOf(content: string): string {
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (t) return t;
  }
  return '';
}

export default function NotepadView({ onBack }: NotepadViewProps) {
  const { t } = useI18n();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [contentDraft, setContentDraft] = useState('');
  const [search, setSearch] = useState('');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [mono, setMono] = useState(false);

  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchIdx, setMatchIdx] = useState(-1);
  const [looped, setLooped] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<number>(0);
  const currentIdRef = useRef<string | null>(null);
  const titleRef = useRef('');
  const contentRef = useRef('');
  const notesRef = useRef<Note[]>([]);

  const hasFileApi = !!window.electron?.notes;

  const persist = useCallback(async (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'pinned'>>) => {
    setSaveState('saving');
    try {
      const { note } = await api<{ note: Note }>(`/api/notes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      setNotes((prev) => sortNotes(prev.map((n) => (n.id === note.id ? note : n))));
      setSaveState('saved');
      setSavedAt(Date.now());
      setError(null);
    } catch (e: any) {
      setSaveState('dirty');
      setError(e?.message || t('Gagal menyimpan catatan.'));
    }
  }, []);

  const flushCurrent = useCallback(async () => {
    const id = currentIdRef.current;
    window.clearTimeout(saveTimerRef.current);
    if (!id) return;
    const list = notesRef.current.find((n) => n.id === id);
    if (!list) return;
    const title = titleRef.current;
    const content = contentRef.current;
    if (title === list.title && content === list.content) return;
    return persist(id, { title, content });
  }, [persist]);

  const scheduleSave = useCallback(() => {
    const id = currentIdRef.current;
    if (!id) return;
    window.clearTimeout(saveTimerRef.current);
    setSaveState('dirty');
    saveTimerRef.current = window.setTimeout(() => {
      persist(id, { title: titleRef.current, content: contentRef.current });
    }, 700);
  }, [persist]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    titleRef.current = titleDraft;
  }, [titleDraft]);
  useEffect(() => {
    contentRef.current = contentDraft;
  }, [contentDraft]);

  useEffect(() => {
    currentIdRef.current = currentId;
  }, [currentId]);

  const openLocalNote = useCallback((note: Note) => {
    setCurrentId(note.id);
    setTitleDraft(note.title);
    setContentDraft(note.content);
    setSavedAt(note.updatedAt);
    setSaveState('saved');
    setMatchIdx(-1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let list = (await api<{ notes: Note[] }>('/api/notes')).notes;
        if (list.length === 0) {
          const { note } = await api<{ note: Note }>('/api/notes', {
            method: 'POST',
            body: JSON.stringify({ title: t('Catatan Pertama'), content: WELCOME_CONTENT }),
          });
          list = [note];
        }
        const sorted = sortNotes(list);
        if (cancelled) return;
        setNotes(sorted);
        if (sorted[0]) openLocalNote(sorted[0]);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || t('Gagal memuat catatan.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openLocalNote]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!looped) return;
    const timer = window.setTimeout(() => setLooped(false), 1200);
    return () => window.clearTimeout(timer);
  }, [looped]);

  // flush pending autosave when the view unmounts
  useEffect(() => {
    return () => {
      const id = currentIdRef.current;
      window.clearTimeout(saveTimerRef.current);
      if (!id) return;
      fetch(`/api/notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titleRef.current, content: contentRef.current }),
      }).catch(() => undefined);
    };
  }, []);

  function selectNote(note: Note) {
    if (note.id === currentIdRef.current) return;
    void flushCurrent();
    openLocalNote(note);
  }

  async function newNote() {
    await flushCurrent();
    try {
      const { note } = await api<{ note: Note }>('/api/notes', {
        method: 'POST',
        body: JSON.stringify({ title: '', content: '' }),
      });
      setNotes((prev) => sortNotes([note, ...prev]));
      openLocalNote(note);
      requestAnimationFrame(() => titleInputRef.current?.focus());
    } catch (e: any) {
      setError(e?.message || t('Gagal membuat catatan.'));
    }
  }

  async function removeNote(id: string) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    if (!window.confirm(t('Hapus catatan "{title}"? Tindakan ini tidak bisa dibatalkan.', { title: note.title }))) return;
    try {
      await api(`/api/notes/${id}`, { method: 'DELETE' });
      const next = notes.filter((n) => n.id !== id);
      setNotes(next);
      if (currentIdRef.current === id) {
        setCurrentId(null);
        setTitleDraft('');
        setContentDraft('');
        setSaveState('saved');
        if (next[0]) openLocalNote(next[0]);
      }
    } catch (e: any) {
      setError(e?.message || t('Gagal menghapus catatan.'));
    }
  }

  async function duplicateNote(id: string) {
    const n = notes.find((x) => x.id === id);
    if (!n) return;
    try {
      const { note } = await api<{ note: Note }>('/api/notes', {
        method: 'POST',
        body: JSON.stringify({ title: t('{title} (salinan)', { title: n.title }), content: n.content, pinned: n.pinned }),
      });
      setNotes((prev) => sortNotes([note, ...prev]));
      setNotice(t('Catatan digandakan.'));
    } catch (e: any) {
      setError(e?.message || t('Gagal menggandakan catatan.'));
    }
  }

  async function togglePin(note: Note) {
    try {
      const { note: updated } = await api<{ note: Note }>(`/api/notes/${note.id}`, {
        method: 'PUT',
        body: JSON.stringify({ pinned: !note.pinned }),
      });
      setNotes((prev) => sortNotes(prev.map((n) => (n.id === updated.id ? updated : n))));
    } catch (e: any) {
      setError(e?.message || t('Gagal mengubah pin.'));
    }
  }

  /* ---------------- file open / save ---------------- */

  function openImported({ name, content }: { name: string; content: string }) {
    void (async () => {
      await flushCurrent();
      try {
        const { note } = await api<{ note: Note }>('/api/notes', {
          method: 'POST',
          body: JSON.stringify({ title: name.replace(/\.[a-zA-Z0-9]+$/, '') || t('Catatan'), content }),
        });
        setNotes((prev) => sortNotes([note, ...prev]));
        openLocalNote(note);
      } catch (e: any) {
        setError(e?.message || t('Gagal mengimpor file.'));
      }
    })();
  }

  async function handleOpenFile() {
    if (hasFileApi) {
      const res = await window.electron!.notes.openFile();
      if (!res) return;
      if (res.error) {
        setError(res.error);
        return;
      }
      if (typeof res.content === 'string') openImported({ name: res.name || t('Catatan'), content: res.content });
    } else {
      fileInputRef.current?.click();
    }
  }

  async function handleSaveAs() {
    if (!currentIdRef.current) return;
    if (hasFileApi) {
      const res = await window.electron!.notes.saveFile(titleRef.current || t('catatan'), contentRef.current);
      if (!res) return;
      if (res.error) {
        setError(res.error);
      } else if (res.path) {
        setNotice(t('Tersimpan di {path}', { path: res.path }));
      }
    } else {
      const blob = new Blob([contentRef.current], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${titleRef.current.replace(/[\\/:*?"<>|]/g, '_') || t('catatan')}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  /* ---------------- markdown formatting ---------------- */

  function wrapMarkdown(prefix: string, suffix: string = prefix) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const value = contentRef.current;
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
    setContentDraft(next);
    setSaveState('dirty');
    requestAnimationFrame(() => {
      ta.focus();
      const s = start + prefix.length;
      ta.setSelectionRange(selected ? s + selected.length : s, selected ? s + selected.length : s);
    });
  }

  /** Toggle a block prefix (e.g. '# ', '> ', '- ') across the selected lines. */
  function applyBlock(prefix: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const value = contentRef.current;
    let s = ta.selectionStart;
    let e = ta.selectionEnd;
    const whole = s === e;
    if (whole) {
      s = value.lastIndexOf('\n', s - 1) + 1;
      const nl = value.indexOf('\n', e);
      e = nl === -1 ? value.length : nl;
    }
    const selected = value.slice(s, e);
    const lines = selected.split('\n');
    const allHave = lines.every((l) => l.startsWith(prefix));
    const nextLines = allHave ? lines.map((l) => l.slice(prefix.length)) : lines.map((l) => prefix + l);
    const next = nextLines.join('\n');
    setContentDraft(value.slice(0, s) + next + value.slice(e));
    setSaveState('dirty');
    requestAnimationFrame(() => {
      ta.focus();
      const end = s + next.length;
      const start = whole ? s : allHave ? s : s + prefix.length;
      ta.setSelectionRange(start, end);
    });
  }

  function applyChecklist() {
    const ta = textareaRef.current;
    if (!ta) return;
    const value = contentRef.current;
    let s = ta.selectionStart;
    let e = ta.selectionEnd;
    const whole = s === e;
    if (whole) {
      s = value.lastIndexOf('\n', s - 1) + 1;
      const nl = value.indexOf('\n', e);
      e = nl === -1 ? value.length : nl;
    }
    const selected = value.slice(s, e);
    const next = selected
      .split('\n')
      .map((l) => {
        if (l.startsWith('- [ ] ')) return '- [x] ' + l.slice(6);
        if (l.startsWith('- [x] ')) return '- [ ] ' + l.slice(6);
        return '- [ ] ' + l;
      })
      .join('\n');
    setContentDraft(value.slice(0, s) + next + value.slice(e));
    setSaveState('dirty');
    requestAnimationFrame(() => {
      ta.focus();
      const end = s + next.length;
      const start = whole ? s : s + 6;
      ta.setSelectionRange(start, end);
    });
  }

  /** Insert or wrap inline code, switching to a fenced block for multi-line selections. */
  function applyCode() {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const value = contentRef.current;
    const selected = value.slice(start, end);
    if (selected.includes('\n')) {
      const next = value.slice(0, start) + '```\n' + selected + '\n```' + value.slice(end);
      setContentDraft(next);
      setSaveState('dirty');
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(start + 4, start + 4 + selected.length);
      });
    } else {
      wrapMarkdown('`');
    }
  }

  function applyHeading(level: 1 | 2 | 3) {
    applyBlock('#'.repeat(level) + ' ');
  }
  function applyQuote() {
    applyBlock('> ');
  }
  function applyBullet() {
    applyBlock('- ');
  }
  function applyOrdered() {
    const ta = textareaRef.current;
    if (!ta) return;
    const value = contentRef.current;
    let s = ta.selectionStart;
    let e = ta.selectionEnd;
    const whole = s === e;
    if (whole) {
      s = value.lastIndexOf('\n', s - 1) + 1;
      const nl = value.indexOf('\n', e);
      e = nl === -1 ? value.length : nl;
    }
    const selected = value.slice(s, e);
    const lines = selected.split('\n');
    const numbered = lines.map((l) => l.replace(/^\d+\. /, ''));
    const plain = lines.every((l) => /^\d+\. /.test(l));
    const nextLines = plain
      ? numbered
      : numbered.map((l, i) => `${i + 1}. ${l}`);
    const next = nextLines.join('\n');
    setContentDraft(value.slice(0, s) + next + value.slice(e));
    setSaveState('dirty');
    requestAnimationFrame(() => {
      ta.focus();
      const end = s + next.length;
      const start = whole ? s : plain ? s : s + 4;
      ta.setSelectionRange(start, end);
    });
  }

  function applyLink() {
    const url = window.prompt(t('Masukkan URL/alamat tujuan:'));
    if (url === null || url === undefined) return;
    const cleaned = url.trim() || 'https://';
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart || 0;
    const end = ta.selectionEnd ?? start;
    const selected = contentRef.current.slice(start, end);
    const text = selected || t('teks');
    const next = contentRef.current.slice(0, start) + `[${text}](${cleaned})` + contentRef.current.slice(end);
    setContentDraft(next);
    setSaveState('dirty');
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + 1, start + 1 + text.length);
    });
  }

  function applyHr() {
    const ta = textareaRef.current;
    if (!ta) return;
    const value = contentRef.current;
    const at = ta.selectionStart ?? value.length;
    const needNl = at > 0 && value[at - 1] !== '\n';
    const next = value.slice(0, at) + (needNl ? '\n' : '') + '---\n' + value.slice(at);
    setContentDraft(next);
    setSaveState('dirty');
    requestAnimationFrame(() => {
      ta.focus();
      const pos = at + (needNl ? 1 : 0) + 4;
      ta.setSelectionRange(pos, pos);
    });
  }

  /* ---------------- find & replace ---------------- */

  const matches = useMemo<MatchRange[]>(() => {
    const q = findText;
    if (!q || !contentDraft) return [];
    const src = caseSensitive ? contentDraft : contentDraft.toLowerCase();
    const needle = caseSensitive ? q : q.toLowerCase();
    const out: MatchRange[] = [];
    let i = 0;
    while (i < src.length) {
      const idx = src.indexOf(needle, i);
      if (idx === -1) break;
      out.push({ start: idx, end: idx + needle.length });
      i = idx + needle.length;
    }
    return out;
  }, [findText, contentDraft, caseSensitive]);

  function gotoMatch(dir: 1 | -1) {
    const ta = textareaRef.current;
    if (!ta || matches.length === 0) return;
    const caret = ta.selectionStart ?? 0;
    let idx = matchIdx;
    if (dir === 1) {
      idx = matches.findIndex((m) => m.start >= caret + 1);
      if (idx === -1) {
        idx = 0;
        setLooped(true);
      }
    } else {
      idx = -1;
      for (let i = matches.length - 1; i >= 0; i--) {
        if (matches[i].end <= caret) {
          idx = i;
          break;
        }
      }
      if (idx === -1) {
        idx = matches.length - 1;
        setLooped(true);
      }
    }
    setMatchIdx(idx);
    const m = matches[idx];
    ta.focus();
    ta.setSelectionRange(m.start, m.end);
  }

  function replaceOne() {
    if (!findText) return;
    const ta = textareaRef.current;
    if (!ta) return;
    const s = ta.selectionStart ?? 0;
    const e = ta.selectionEnd ?? s;
    const selected = contentDraft.slice(s, e);
    const needle = caseSensitive ? findText : findText.toLowerCase();
    const sel = caseSensitive ? selected : selected.toLowerCase();
    if (sel !== needle) {
      gotoMatch(1);
      return;
    }
    const next = contentDraft.slice(0, s) + replaceText + contentDraft.slice(e);
    setContentDraft(next);
    setSaveState('dirty');
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s, s + replaceText.length);
      gotoMatch(1);
    });
  }

  function replaceAll() {
    if (!findText) return;
    const needle = caseSensitive ? findText : findText.toLowerCase();
    const src = caseSensitive ? contentDraft : contentDraft.toLowerCase();
    if (!src.includes(needle)) return;
    const parts: string[] = [];
    let last = 0;
    let i = src.indexOf(needle);
    while (i !== -1) {
      parts.push(contentDraft.slice(last, i), replaceText);
      last = i + needle.length;
      i = src.indexOf(needle, last);
    }
    parts.push(contentDraft.slice(last));
    setContentDraft(parts.join(''));
    setSaveState('dirty');
    setMatchIdx(-1);
  }

  function copySelection() {
    const ta = textareaRef.current;
    const text = ta?.selectionStart !== ta?.selectionEnd ? contentDraft.slice(ta!.selectionStart!, ta!.selectionEnd!) : '';
    void navigator.clipboard?.writeText(text || contentDraft).catch(() => undefined);
    setNotice(text ? t('Teks terpilih disalin.') : t('Seluruh isi catatan disalin.'));
  }

  function doUndoRedo(cmd: 'undo' | 'redo') {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    document.execCommand(cmd);
  }

  /* ---------------- keyboard shortcuts ---------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'f') {
        e.preventDefault();
        setFindOpen(true);
        requestAnimationFrame(() => findInputRef.current?.focus());
      } else if (mod && k === 'h') {
        e.preventDefault();
        setFindOpen(true);
        requestAnimationFrame(() => replaceInputRef.current?.focus());
      } else if (mod && k === 'n' && !e.shiftKey) {
        e.preventDefault();
        void newNote();
      } else if (mod && k === 's') {
        e.preventDefault();
        void handleSaveAs();
      } else if (e.key === 'Escape') {
        setFindOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const stats = useMemo(() => {
    const text = contentDraft;
    const words = (text.trim().match(/\S+/g) || []).length;
    const chars = text.length;
    const lines = text ? text.split('\n').length : 0;
    const mins = Math.max(1, Math.round(words / 220));
    return { words, chars, lines, mins };
  }, [contentDraft]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
  }, [notes, search]);

  const currentNote = notes.find((n) => n.id === currentId) ?? null;

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        icon="fileText"
        title="Notepad"
        desc={t('Catat ide, daftar, dan catatan penting dalam editor yang nyaman — auto-save, format teks, cari & ganti, dan ekspor kapan saja.')}
        onBack={onBack}
        actions={
          <>
            <button className="btn-ghost" onClick={handleOpenFile} title={t('Buka file teks (Ctrl+O)')}>
              <Icon name="upload" className="w-4 h-4" />
              {t('Buka File')}
            </button>
            <button className="btn-outline" onClick={handleSaveAs} disabled={!currentId} title={t('Ekspor ke file (Ctrl+S)')}>
              <Icon name="save" className="w-4 h-4" />
              {t('Simpan Sebagai')}
            </button>
            <button className="btn-primary" onClick={newNote} title={t('Catatan baru (Ctrl+N)')}>
              <Icon name="sparkle" className="w-4 h-4" />
              {t('Catatan Baru')}
            </button>
          </>
        }
      />

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger-strong)] animate-scale-in">
          <span>{error}</span>
          <button className="shrink-0 text-[var(--danger-strong)] hover:text-[var(--text)]" onClick={() => setError(null)} aria-label={t('Tutup')}>
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--ok-border)] bg-[var(--ok-soft)] px-4 py-3 text-sm text-[var(--ok-strong)] animate-scale-in">
          <Icon name="check" className="w-4 h-4 shrink-0" />
          {notice}
        </div>
      )}
      {looped && (
        <div className="text-xs text-[var(--accent-strong)] animate-scale-in">
          {t('Sudah di akhir — dilanjutkan dari awal.')}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.markdown,.log,.json,.csv,.ini,.xml,.html,.css,.js,.ts,.tsx,.py,.yml,.yaml,text/plain,*/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const reader = new FileReader();
          reader.onload = () => openImported({ name: f.name, content: String(reader.result || '') });
          reader.readAsText(f);
        }}
      />

      <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
        {/* ---------- sidebar ---------- */}
        <aside className="card p-2.5">
          <div className="px-1.5 pt-1 pb-2">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="eyebrow">{t('Catatan')}</span>
              <span className="chip bg-[var(--overlay)] text-[var(--text-3)]">{filtered.length}</span>
            </div>
            <div className="relative">
              <Icon name="search" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)] pointer-events-none" />
              <input
                className="input-field !pl-9 !py-2 text-[13px]"
                placeholder={t('Cari catatan…')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1 max-h-[46vh] overflow-y-auto pr-1 pb-1">
            {filtered.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-[var(--text-3)]">{t('Tidak ada catatan.')}</div>
            )}
            {filtered.map((note) => {
              const active = note.id === currentId;
              return (
                <div
                  key={note.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectNote(note)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectNote(note);
                    }
                  }}
                  className={`group relative w-full text-left rounded-xl px-3 py-2.5 cursor-pointer transition-colors border ${
                    active
                      ? 'bg-[var(--accent-soft)] border-[var(--accent-border)]'
                      : 'border-transparent hover:bg-[var(--overlay)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {note.pinned ? (
                      <Icon name="pin" className="w-3.5 h-3.5 text-[var(--warn-strong)] shrink-0" />
                    ) : (
                      <Icon name="pinOff" className="w-3.5 h-3.5 text-[var(--text-3)] shrink-0" />
                    )}
                    <span className={`flex-1 truncate text-sm ${active ? 'text-[var(--text)] font-medium' : 'text-[var(--text)]'}`}>
                      {note.title}
                    </span>
                    <button
                      className="hidden sm:grid w-6 h-6 place-items-center rounded-xl text-[var(--text-3)] hover:text-[var(--danger-strong)] hover:bg-[var(--danger-soft)] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      title={t('Hapus catatan')}
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeNote(note.id);
                      }}
                    >
                      <Icon name="trash" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {(() => {
                    const sn = snippetOf(note.content);
                    return sn ? (
                      <p className="mt-0.5 ml-5 pl-0 truncate text-[11px] text-[var(--text-3)] line-clamp-1">{sn}</p>
                    ) : null;
                  })()}
                  <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--text-3)]">
                    <span>{timeAgo(note.updatedAt)}</span>
                    {note.pinned && <span className="text-[var(--warn-strong)]">{t('disematkan')}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* ---------- editor ---------- */}
        <section className="card overflow-hidden flex flex-col min-h-[480px]">
          {loading ? (
            <div className="p-6 space-y-4">
              <div className="skeleton h-8 w-1/2" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-11/12" />
              <div className="skeleton h-4 w-4/5" />
              <div className="skeleton h-64 w-full" />
            </div>
          ) : !currentId ? (
            <div className="flex-1 grid place-items-center p-10 text-center">
              <div className="flex flex-col items-center gap-4 max-w-sm">
                <div className="icon-tile w-16 h-16 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-600 shadow-lg shadow-[0_10px_30px_-10px_var(--warn-glow)]">
                  <Icon name="fileText" className="w-8 h-8" />
                </div>
                <h2 className="text-lg font-semibold text-[var(--text)]">{t('Belum ada catatan')}</h2>
                <p className="text-sm text-[var(--text-2)] leading-relaxed">
                  {t('Buat catatan baru untuk mulai menulis, atau buka file teks yang sudah ada.')}
                </p>
                <button className="btn-primary" onClick={newNote}>
                  <Icon name="sparkle" className="w-4 h-4" />
                  {t('Buat Catatan Baru')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* title row */}
              <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5 border-b border-[var(--border)]">
                <input
                  ref={titleInputRef}
                  className="flex-1 min-w-0 bg-transparent text-lg font-semibold text-[var(--text)] placeholder-gray-600 focus:outline-none truncate"
                  placeholder={t('Judul catatan…')}
                  value={titleDraft}
                  onChange={(e) => {
                    setTitleDraft(e.target.value);
                    scheduleSave();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') textareaRef.current?.focus();
                  }}
                />
                <button
                  className={`w-9 h-9 grid place-items-center rounded-xl transition-colors ${
                    currentNote?.pinned
                      ? 'bg-[var(--warn-soft)] text-[var(--warn-strong)]'
                      : 'text-[var(--text-3)] hover:bg-[var(--overlay)] hover:text-[var(--text)]'
                  }`}
                  title={currentNote?.pinned ? t('Lepas pin') : t('Sematkan di atas')}
                  onClick={() => currentNote && void togglePin(currentNote)}
                >
                  <Icon name={currentNote?.pinned ? 'pin' : 'pinOff'} className="w-[18px] h-[18px]" />
                </button>
                <button
                  className={`w-9 h-9 grid place-items-center rounded-xl transition-colors ${
                    findOpen ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'text-[var(--text-3)] hover:bg-[var(--overlay)] hover:text-[var(--text)]'
                  }`}
                  title={t('Cari & ganti (Ctrl+F)')}
                  onClick={() => {
                    setFindOpen((v) => !v);
                    requestAnimationFrame(() => findInputRef.current?.focus());
                  }}
                >
                  <Icon name="search" className="w-[18px] h-[18px]" />
                </button>
                <span
                  className={`chip ml-1 ${saveState === 'saved' ? 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]' : saveState === 'saving' ? 'bg-[var(--warn-soft)] text-[var(--warn-strong)] border-[var(--warn-border)]' : 'bg-[var(--danger-soft)] text-[var(--danger-strong)] border-[var(--danger-border)]'}`}
                >
                  {saveState === 'saved'
                    ? t('Tersimpan {time}', { time: savedAt ? ' ' + new Date(savedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '' })
                    : saveState === 'saving'
                      ? t('Menyimpan…')
                      : t('Belum tersimpan')}
                </span>
              </div>

              {/* formatting toolbar */}
              <div className="flex flex-wrap items-center gap-0.5 px-3 py-2 border-b border-[var(--border)] bg-[var(--overlay)]">
                <ToolButton label="B" title={t('Tebal (Ctrl+B)')} className="font-bold" onClick={() => wrapMarkdown('**')} />
                <ToolButton label="I" title={t('Miring (Ctrl+I)')} className="italic" onClick={() => wrapMarkdown('*')} />
                <ToolButton label="U" title={t('Garis bawah (Ctrl+U)')} className="underline" onClick={() => wrapMarkdown('<u>', '</u>')} />
                <ToolButton label="S" title={t('Coret (markdown)')} className="line-through" onClick={() => wrapMarkdown('~~')} />
                <ToolDivider />
                <ToolButton label="H1" title={t('Judul 1')} className="text-[11px]" onClick={() => applyHeading(1)} />
                <ToolButton label="H2" title={t('Judul 2')} className="text-[11px]" onClick={() => applyHeading(2)} />
                <ToolButton label="H3" title={t('Judul 3')} className="text-[11px]" onClick={() => applyHeading(3)} />
                <ToolDivider />
                <ToolIcon name="quote" title={t('Kutipan')} onClick={applyQuote} />
                <ToolIcon name="code" title={t('Kode')} onClick={applyCode} />
                <ToolDivider />
                <ToolIcon name="listOrdered" title={t('Daftar bernomor')} onClick={applyOrdered} />
                <ToolButton label="•" title={t('Daftar berpoin')} onClick={applyBullet} />
                <ToolIcon name="checkSquare" title={t('Checklist')} onClick={applyChecklist} />
                <ToolDivider />
                <ToolIcon name="link" title={t('Tautan')} onClick={applyLink} />
                <ToolIcon name="minus" title={t('Pemisah (----)')} onClick={applyHr} />
                <ToolDivider />
                <ToolIcon name="duplicate" title={t('Salin teks')} onClick={copySelection} />
                <button className="tool-btn" title={t('Urungkan (Ctrl+Z)')} onClick={() => doUndoRedo('undo')}>
                  <Icon name="undo" className="w-4 h-4" />
                </button>
                <button className="tool-btn" title={t('Ulangi (Ctrl+Y)')} onClick={() => doUndoRedo('redo')}>
                  <Icon name="replay" className="w-4 h-4" />
                </button>
                <div className="flex-1" />
                <button
                  className={`tool-btn ${mono ? 'text-[var(--accent-strong)] bg-[var(--accent-soft)]' : ''}`}
                  title={t('Ganti jenis huruf (monospace)')}
                  onClick={() => setMono((v) => !v)}
                >
                  Aa
                </button>
              </div>

              {/* find & replace */}
              {findOpen && (
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--overlay)] animate-scale-in">
                  <div className="relative">
                    <Icon name="search" className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3)] pointer-events-none" />
                    <input
                      ref={findInputRef}
                      className="input-field !pl-8 !py-1.5 !text-xs w-40"
                      placeholder={t('Cari…')}
                      value={findText}
                      onChange={(e) => {
                        setFindText(e.target.value);
                        setMatchIdx(-1);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          gotoMatch(e.shiftKey ? -1 : 1);
                        }
                      }}
                    />
                  </div>
                  <input
                    ref={replaceInputRef}
                    className="input-field !py-1.5 !text-xs w-40"
                    placeholder={t('Ganti dengan…')}
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        replaceOne();
                      }
                    }}
                  />
                  <button
                    className={`tool-btn ${caseSensitive ? 'text-[var(--accent-strong)] bg-[var(--accent-soft)]' : ''}`}
                    title={t('Cocokkan huruf besar/kecil')}
                    onClick={() => setCaseSensitive((v) => !v)}
                  >
                    Aa
                  </button>
                  <button className="tool-btn" title={t('Sebelumnya (Shift+Enter)')} onClick={() => gotoMatch(-1)}>
                    <Icon name="chevronRight" className="w-4 h-4 rotate-180" />
                  </button>
                  <button className="tool-btn" title={t('Berikutnya (Enter)')} onClick={() => gotoMatch(1)}>
                    <Icon name="chevronRight" className="w-4 h-4" />
                  </button>
                  <button className="btn-ghost !px-2.5 !py-1.5 !text-xs" onClick={replaceOne} disabled={!findText}>
                    {t('Ganti')}
                  </button>
                  <button className="btn-ghost !px-2.5 !py-1.5 !text-xs" onClick={replaceAll} disabled={!findText || !matches.length}>
                    {t('Ganti Semua')}
                  </button>
                  <span className="text-[11px] tabular-nums text-[var(--text-3)]">
                    {matches.length ? `${Math.min((matchIdx < 0 ? 0 : matchIdx) + 1, matches.length)}/${matches.length}` : '0/0'}
                  </span>
                  <div className="flex-1" />
                  <button className="tool-btn" title={t('Tutup (Esc)')} onClick={() => setFindOpen(false)}>
                    <Icon name="x" className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* content */}
              <textarea
                ref={textareaRef}
                className={`flex-1 w-full min-h-[360px] resize-none bg-transparent px-4 py-3 text-sm leading-relaxed text-[var(--text)] placeholder-gray-600 focus:outline-none ${
                  mono ? 'font-mono' : 'font-sans'
                }`}
                placeholder={t('Tulis catatan di sini…')}
                value={contentDraft}
                onChange={(e) => {
                  setContentDraft(e.target.value);
                  scheduleSave();
                }}
                spellCheck={true}
              />

              {/* status bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-t border-[var(--border)] bg-[var(--overlay)] text-[11px] text-[var(--text-3)]">
                <span className="tabular-nums">
                  {stats.words} {t('kata')} &middot; {stats.chars} {t('karakter')} &middot; {stats.lines} {t('baris')} &middot; &plusmn;{stats.mins} {t('mnt baca')}
                </span>
                <span className="flex items-center gap-1.5 text-[var(--text-3)]">
                  <span className={`w-1.5 h-1.5 rounded-full ${saveState === 'saved' ? 'bg-[var(--ok)]' : saveState === 'saving' ? 'bg-[var(--warn)] animate-pulse' : 'bg-rose-400'}`} />
                  {t('Auto-simpan')} {saveState === 'saved' ? t('aktif') : saveState === 'saving' ? t('sedang menyimpan') : t('menunggu…')}
                </span>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  title,
  className = '',
  onClick,
}: {
  label: string;
  title: string;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button className={`tool-btn font-medium ${className}`} title={title} onClick={onClick}>
      {label}
    </button>
  );
}

function ToolIcon({ name, title, onClick }: { name: Parameters<typeof Icon>[0]['name']; title: string; onClick: () => void }) {
  return (
    <button className="tool-btn" title={title} onClick={onClick}>
      <Icon name={name} className="w-4 h-4" />
    </button>
  );
}

function ToolDivider() {
  return <span className="inline-block w-px h-5 bg-[var(--overlay-2)] mx-1.5 self-center" aria-hidden="true" />;
}