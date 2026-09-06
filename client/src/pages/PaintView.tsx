import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon, { type IconName } from '../components/Icon';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { savePngAs, saveJpgAs } from '../lib/platform';
import { useI18n } from '../lib/i18n';

/* ------------------------------------------------------------------ */
/*  Types & helpers                                                    */
/* ------------------------------------------------------------------ */

type PaintTool = 'kuas' | 'penghapus' | 'pipet' | 'isi' | 'garis' | 'persegi' | 'elips' | 'tangan' | 'smudge' | 'teks';
type BrushTex = 'bulat' | 'kapur' | 'arang' | 'semprot' | 'cat air';
type SymMode = 'off' | 'horizontal' | 'vertical' | 'both';
type FillMode = 'datar' | 'linear' | 'radial';

interface Pt {
  x: number;
  y: number;
}

interface PaintLayer {
  id: number;
  name: string;
  visible: boolean;
  opacity: number;
  canvas: HTMLCanvasElement;
}

interface ViewState {
  zoom: number;
  x: number;
  y: number;
}

interface StrokeState {
  active: boolean;
  prev: Pt;
  smooth: Pt;
  origin: Pt;
  shiftActive: boolean;
  eff: number;
  tex: BrushTex;
  sym: SymMode;
  ctx: CanvasRenderingContext2D | null;
  color: string;
  alpha: number;
}

interface ShapeState {
  active: boolean;
  kind: PaintTool;
  start: Pt;
  cur: Pt;
}

interface FillState {
  active: boolean;
  start: Pt;
  cur: Pt;
}

interface ShapePreview {
  kind: PaintTool;
  a: Pt;
  b: Pt;
}

interface ProjectSnapshot {
  layers: { id: number; name: string; visible: boolean; opacity: number; img: ImageData | null }[];
}

const DEFAULT_W = 1600;
const DEFAULT_H = 1200;
const TAU = Math.PI * 2;
const MAX_UNDO = 25;
const SWATCHES = [
  '#000000',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#0ea5e9',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#78716c',
  '#334155',
];

const PAINT_TOOLS: { id: PaintTool; icon: IconName; labelKey: string; kbd: string }[] = [
  { id: 'kuas', icon: 'brush', labelKey: 'Kuas', kbd: 'B' },
  { id: 'penghapus', icon: 'eraser', labelKey: 'Penghapus', kbd: 'E' },
  { id: 'pipet', icon: 'dropper', labelKey: 'Pipet', kbd: 'I' },
  { id: 'isi', icon: 'bucket', labelKey: 'Isi Warna', kbd: 'G' },
  { id: 'garis', icon: 'shapeLine', labelKey: 'Garis', kbd: 'L' },
  { id: 'persegi', icon: 'shapeRect', labelKey: 'Persegi', kbd: 'R' },
  { id: 'elips', icon: 'shapeCircle', labelKey: 'Elips', kbd: 'O' },
  { id: 'smudge', icon: 'smudge', labelKey: 'Coreng', kbd: 'S' },
  { id: 'teks', icon: 'type', labelKey: 'Teks', kbd: 'T' },
  { id: 'tangan', icon: 'handMove', labelKey: 'Tangan', kbd: 'H' },
];

const BRUSH_TEX: { id: BrushTex; labelKey: string }[] = [
  { id: 'bulat', labelKey: 'Bulat' },
  { id: 'kapur', labelKey: 'Kapur' },
  { id: 'arang', labelKey: 'Arang' },
  { id: 'semprot', labelKey: 'Semprot' },
  { id: 'cat air', labelKey: 'Cat air' },
];

const FONT_FAMILIES = ['Arial', 'Georgia', 'Courier New', 'Times New Roman', 'Verdana', 'Impact'];

const SYM_OPTIONS: { id: SymMode; labelKey: string; icon: IconName }[] = [
  { id: 'off', labelKey: 'Mati', icon: 'symOff' },
  { id: 'horizontal', labelKey: 'Horisontal', icon: 'flipH' },
  { id: 'vertical', labelKey: 'Vertikal', icon: 'flipV' },
  { id: 'both', labelKey: 'Keduanya', icon: 'symBoth' },
];

const FILL_MODES: { id: FillMode; labelKey: string }[] = [
  { id: 'datar', labelKey: 'Datar' },
  { id: 'linear', labelKey: 'Linear' },
  { id: 'radial', labelKey: 'Radial' },
];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const constrainShift = (o: Pt, p: Pt): Pt => {
  const dx = p.x - o.x;
  const dy = p.y - o.y;
  if (dx === 0 && dy === 0) return { x: o.x, y: o.y };
  const ang = Math.atan2(dy, dx);
  const snap = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.hypot(dx, dy);
  return { x: o.x + Math.cos(snap) * len, y: o.y + Math.sin(snap) * len };
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function hexToCssRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return `rgba(0,0,0,${clamp(alpha, 0, 1)})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(alpha, 0, 1)})`;
}

function makeLayer(w: number, h: number, name: string, fillWhite: boolean): PaintLayer {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const g = canvas.getContext('2d');
  if (g && fillWhite) {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, canvas.width, canvas.height);
  }
  return { id: 0, name, visible: true, opacity: 1, canvas };
}

/* Pre-rendered brush sprites (soft/round/hard/textured) cached per params. */
const spriteCache = new Map<string, HTMLCanvasElement>();

/* Deterministic PRNG so textured sprites cache stable per size. */
function seedRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Scratch buffer so a stroke segment is composited once (uniform opacity; no
   dark seams where stamps overlap when alpha < 1). */
let segScratch: HTMLCanvasElement | null = null;

/* Mirror transforms for symmetry (flip across document centerlines). */
function mirrorList(sym: SymMode, dw: number, dh: number): { sx: number; sy: number; ox: number; oy: number }[] {
  const id = { sx: 1, sy: 1, ox: 0, oy: 0 };
  if (sym === 'off') return [id];
  const h = { sx: -1, sy: 1, ox: dw, oy: 0 };
  const v = { sx: 1, sy: -1, ox: 0, oy: dh };
  if (sym === 'horizontal') return [id, h];
  if (sym === 'vertical') return [id, v];
  return [id, h, v, { sx: -1, sy: -1, ox: dw, oy: dh }];
}

function paintSegment(
  draw: CanvasRenderingContext2D,
  kind: 'kuas' | 'penghapus' | 'smudge',
  from: Pt & { s: number },
  to: Pt & { s: number },
  alpha: number,
  hardness: number,
  color: string,
  tex: BrushTex,
  sym: SymMode,
  dw: number,
  dh: number
) {
  if (kind === 'smudge') {
    smudgeSegment(draw, from, to, alpha, sym, dw, dh);
    return;
  }
  const stepFactor = tex === 'semprot' ? 0.06 : tex === 'cat air' ? 0.1 : 0.14;
  const step = Math.max(0.5, ((from.s + to.s) / 2) * stepFactor);
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const n = Math.max(1, Math.ceil(dist / step));
  const mir = mirrorList(sym, dw, dh);
  const pad = Math.max(2, (from.s + to.s) / 2);
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const m of mir) {
    for (const p of [from, to]) {
      const mx = m.ox + m.sx * p.x;
      const my = m.oy + m.sy * p.y;
      if (mx < minX) minX = mx;
      if (my < minY) minY = my;
      if (mx > maxX) maxX = mx;
      if (my > maxY) maxY = my;
    }
  }
  minX = Math.floor(minX - pad);
  minY = Math.floor(minY - pad);
  maxX = Math.ceil(maxX + pad);
  maxY = Math.ceil(maxY + pad);
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  if (!segScratch) segScratch = document.createElement('canvas');
  if (segScratch.width < w || segScratch.height < h) {
    segScratch.width = Math.max(segScratch.width, w);
    segScratch.height = Math.max(segScratch.height, h);
  }
  const sg = segScratch.getContext('2d');
  if (!sg) return;
  sg.save();
  sg.setTransform(1, 0, 0, 1, 0, 0);
  sg.clearRect(0, 0, segScratch.width, segScratch.height);
  sg.setTransform(1, 0, 0, 1, -minX, -minY);
  sg.globalCompositeOperation = 'source-over';
  sg.globalAlpha = 1;
  for (let i = 0; i <= n; i++) {
    const tt = i / n;
    const x = from.x + (to.x - from.x) * tt;
    const y = from.y + (to.y - from.y) * tt;
    const s = from.s + (to.s - from.s) * tt;
    const spr = spriteFor(kind, Math.max(1, s), hardness, color, tex);
    for (const m of mir) {
      sg.drawImage(spr, m.ox + m.sx * x - s / 2, m.oy + m.sy * y - s / 2);
    }
  }
  sg.restore();
  draw.save();
  draw.globalCompositeOperation = kind === 'penghapus' ? 'destination-out' : 'source-over';
  draw.globalAlpha = alpha;
  draw.drawImage(segScratch, minX, minY);
  draw.restore();
}

function spriteFor(kind: 'kuas' | 'penghapus', size: number, hardness: number, color: string, tex: BrushTex): HTMLCanvasElement {
  const key = `${kind}:${tex}:${Math.round(size)}:${Math.round(hardness * 100)}:${color}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const px = Math.max(2, Math.ceil(size));
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  if (g) {
    const R = px / 2;
    const rand = seedRand(Math.round(size * 131 + hardness * 10000 + color.length * 7 + color.charCodeAt(1) || 0));
    g.translate(R, R);
    if (tex === 'kapur') {
      g.globalAlpha = 0.85;
      for (let i = 0; i < 26; i++) {
        const a = rand() * TAU;
        const rr = Math.sqrt(rand()) * R * (0.35 + 0.65 * rand());
        const cs = Math.max(0.8, R * 0.16 * (0.6 + rand()));
        g.fillStyle = color;
        g.beginPath();
        g.arc(Math.cos(a) * rr, Math.sin(a) * rr, cs, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
    } else if (tex === 'arang') {
      g.globalAlpha = 0.7;
      for (let i = 0; i < 18; i++) {
        const a = rand() * TAU;
        const rr = rand() * R * 0.9;
        const x0 = Math.cos(a) * rr;
        const y0 = Math.sin(a) * rr;
        const ln = R * (0.25 + 0.5 * rand());
        const la = a + (rand() - 0.5) * 0.9;
        g.lineCap = 'round';
        g.lineWidth = Math.max(1, R * 0.12 * (0.6 + rand()));
        g.strokeStyle = color;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x0 + Math.cos(la) * ln, y0 + Math.sin(la) * ln);
        g.stroke();
      }
      g.globalAlpha = 1;
    } else if (tex === 'semprot') {
      g.globalAlpha = 0.5;
      for (let i = 0; i < 110; i++) {
        const a = rand() * TAU;
        const rr = Math.sqrt(rand()) * R;
        g.fillStyle = color;
        g.beginPath();
        g.arc(Math.cos(a) * rr, Math.sin(a) * rr, Math.max(0.5, R * 0.05), 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
    } else if (tex === 'cat air') {
      for (let i = 0; i < 5; i++) {
        const offa = rand() * TAU;
        const offr = rand() * R * 0.3;
        const cr = R * (0.45 + 0.35 * rand());
        const grad = g.createRadialGradient(Math.cos(offa) * offr, Math.sin(offa) * offr, 0, Math.cos(offa) * offr, Math.sin(offa) * offr, cr);
        grad.addColorStop(0, color);
        grad.addColorStop(0.4, color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(Math.cos(offa) * offr, Math.sin(offa) * offr, cr, 0, TAU);
        g.fill();
      }
    } else if (hardness >= 0.98) {
      g.fillStyle = color;
      g.beginPath();
      g.arc(0, 0, R, 0, TAU);
      g.fill();
    } else {
      const core = Math.max(0.12, clamp(hardness, 0, 1));
      const grad = g.createRadialGradient(0, 0, R * core, 0, 0, R);
      grad.addColorStop(0, color);
      grad.addColorStop(Math.min(0.998, core), color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, R, 0, TAU);
      g.fill();
    }
  }
  if (spriteCache.size > 800) spriteCache.clear();
  spriteCache.set(key, c);
  return c;
}

/* Smudge ("coreng") — pulls paint along the stroke like a wet finger. */
let smudgeTmp: HTMLCanvasElement | null = null;
let smudgeTmpSize = 0;

function smudgeStamp(ctx: CanvasRenderingContext2D, sx: number, sy: number, tx: number, ty: number, size: number, strength: number) {
  const pw = Math.max(2, Math.ceil(size + 2));
  if (!smudgeTmp || smudgeTmpSize !== pw) {
    smudgeTmp = document.createElement('canvas');
    smudgeTmp.width = smudgeTmp.height = pw;
    smudgeTmpSize = pw;
  }
  const tg = smudgeTmp.getContext('2d');
  if (!tg) return;
  tg.setTransform(1, 0, 0, 1, 0, 0);
  tg.clearRect(0, 0, pw, pw);
  tg.save();
  tg.beginPath();
  tg.arc(pw / 2, pw / 2, size / 2, 0, TAU);
  tg.clip();
  tg.drawImage(ctx.canvas, sx - size / 2, sy - size / 2, size, size, 0, 0, pw, pw);
  tg.restore();
  ctx.save();
  ctx.globalAlpha = clamp(strength, 0.05, 1) * 0.45;
  ctx.drawImage(smudgeTmp, tx - size / 2, ty - size / 2, size, size);
  ctx.restore();
}

function smudgeSegment(
  draw: CanvasRenderingContext2D,
  from: Pt & { s: number },
  to: Pt & { s: number },
  strength: number,
  sym: SymMode,
  dw: number,
  dh: number
) {
  const step = Math.max(0.5, ((from.s + to.s) / 2) * 0.22);
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const n = Math.max(1, Math.ceil(dist / step));
  const mir = mirrorList(sym, dw, dh);
  draw.save();
  draw.globalCompositeOperation = 'source-over';
  for (let i = 0; i <= n; i++) {
    const tt = i / n;
    const x = from.x + (to.x - from.x) * tt;
    const y = from.y + (to.y - from.y) * tt;
    const s = from.s + (to.s - from.s) * tt;
    const xp = i === 0 ? from.x : from.x + (to.x - from.x) * ((i - 1) / n);
    const yp = i === 0 ? from.y : from.y + (to.y - from.y) * ((i - 1) / n);
    let dx = x - xp;
    let dy = y - yp;
    const dl = Math.hypot(dx, dy);
    if (dl > 0) {
      dx /= dl;
      dy /= dl;
    }
    for (const m of mir) {
      const tx = m.ox + m.sx * x;
      const ty = m.oy + m.sy * y;
      smudgeStamp(draw, tx + m.sx * dx * (s * 0.6), ty + m.sy * dy * (s * 0.6), tx, ty, s, strength);
    }
  }
  draw.restore();
}

function traceShape(g: CanvasRenderingContext2D, kind: PaintTool, a: Pt, b: Pt) {
  if (kind === 'garis') {
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
  } else if (kind === 'persegi') {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    g.beginPath();
    g.rect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  } else {
    g.beginPath();
    g.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.max(0, Math.abs(b.x - a.x) / 2), Math.max(0, Math.abs(b.y - a.y) / 2), 0, 0, TAU);
  }
}

function drawShape(
  g: CanvasRenderingContext2D,
  kind: PaintTool,
  a: Pt,
  b: Pt,
  size: number,
  color: string,
  alpha: number,
  filled: boolean
) {
  g.save();
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = alpha;
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = Math.max(1, size);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (kind === 'garis') {
    traceShape(g, kind, a, b);
    g.stroke();
  } else {
    traceShape(g, kind, a, b);
    if (filled) g.fill();
    else g.stroke();
  }
  g.restore();
}

/* ------------------------------------------------------------------ */
/*  IndexedDB autosave                                                  */
/* ------------------------------------------------------------------ */

const PAINT_DB = 'helpyou-paint';
const PAINT_STORE = 'projects';
const PAINT_KEY = 'last';

let dbPromise: Promise<IDBDatabase> | null = null;

function idb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(PAINT_DB, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(PAINT_STORE)) d.createObjectStore(PAINT_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
  return dbPromise;
}

async function idbSave(payload: unknown): Promise<void> {
  try {
    const d = await idb();
    await new Promise<void>((res, rej) => {
      const tx = d.transaction(PAINT_STORE, 'readwrite');
      tx.objectStore(PAINT_STORE).put(payload, PAINT_KEY);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    /* ignore persistence errors */
  }
}

async function idbLoad(): Promise<unknown> {
  try {
    const d = await idb();
    return await new Promise((res, rej) => {
      const tx = d.transaction(PAINT_STORE, 'readonly');
      const rq = tx.objectStore(PAINT_STORE).get(PAINT_KEY);
      rq.onsuccess = () => res(rq.result ?? null);
      rq.onerror = () => rej(rq.error);
    });
  } catch {
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('gagal memuat gambar'));
    img.src = src;
  });
}

/* ------------------------------------------------------------------ */
/*  Small UI pieces                                                     */
/* ------------------------------------------------------------------ */

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-[var(--text-2)]">{label}</span>
        <span className="text-xs font-semibold text-[var(--accent-strong)] tabular-nums">
          {format ? format(value) : String(Math.round(value))}
        </span>
      </div>
      <input
        type="range"
        className="paint-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export default function PaintView({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();

  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const docRef = useRef({ w: DEFAULT_W, h: DEFAULT_H });
  const whiteRef = useRef(true);
  const bgRef = useRef('#ffffff');
  const viewRef = useRef<ViewState>({ zoom: 0.6, x: 0, y: 0 });
  const layersRef = useRef<PaintLayer[]>([]);
  const activeIdRef = useRef(0);
  const nextLayerIdRef = useRef(1);
  const nextLayerNameRef = useRef(1);

  const strokeRef = useRef<StrokeState>({ active: false, prev: { x: 0, y: 0 }, smooth: { x: 0, y: 0 }, origin: { x: 0, y: 0 }, shiftActive: false, eff: 1, tex: 'bulat', sym: 'off', ctx: null, color: '#000000', alpha: 1 });
  const shapeRef = useRef<ShapeState>({ active: false, kind: 'garis', start: { x: 0, y: 0 }, cur: { x: 0, y: 0 } });
  const fillRef = useRef<FillState>({ active: false, start: { x: 0, y: 0 }, cur: { x: 0, y: 0 } });
  const textAnchorRef = useRef<Pt>({ x: 24, y: 24 });
  const panRef = useRef<{ active: boolean; sx: number; sy: number; ox: number; oy: number }>({
    active: false,
    sx: 0,
    sy: 0,
    ox: 0,
    oy: 0,
  });
  const cursorRef = useRef<{ x: number; y: number; show: boolean }>({ x: 0, y: 0, show: false });
  const spaceRef = useRef(false);

  const undoRef = useRef<ProjectSnapshot[]>([]);
  const redoRef = useRef<ProjectSnapshot[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didInitRef = useRef(false);
  const handKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});

  const [tool, setTool] = useState<PaintTool>('kuas');
  const [color, setColor] = useState('#ffffff');
  const [hexDraft, setHexDraft] = useState('#ffffff');
  const [size, setSize] = useState(24);
  const [hardness, setHardness] = useState(0.55);
  const [opacity, setOpacity] = useState(1);
  const [pressureOn, setPressureOn] = useState(true);
  const [filled, setFilled] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [brushTex, setBrushTex] = useState<BrushTex>('bulat');
  const [sym, setSym] = useState<SymMode>('off');
  const [fillMode, setFillMode] = useState<FillMode>('datar');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [textOpen, setTextOpen] = useState(false);
  const [textStr, setTextStr] = useState('');
  const [textFont, setTextFont] = useState(FONT_FAMILIES[0]);
  const [textSize, setTextSize] = useState(48);

  const [layers, setLayers] = useState<PaintLayer[]>([]);
  const [activeId, setActiveId] = useState(0);
  const [zoomPct, setZoomPct] = useState(60);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingPng, setSavingPng] = useState(false);
  const [toast, setToast] = useState(false);
  const [okToast, setOkToast] = useState(false);
  const [confirm, setConfirm] = useState<'none' | 'newcanvas' | 'delete'>('none');

  /* Keep refs in sync for imperative handlers. */
  const toolRef = useRef<PaintTool>('kuas');
  const colorRef = useRef('#ffffff');
  const sizeRef = useRef(24);
  const hardnessRef = useRef(0.55);
  const opacityRef = useRef(1);
  const pressureRef = useRef(true);
  const filledRef = useRef(false);
  const texRef = useRef<BrushTex>('bulat');
  const symRef = useRef<SymMode>('off');
  const fillModeRef = useRef<FillMode>('datar');
  const confirmRef = useRef<'none' | 'newcanvas' | 'delete'>('none');

  toolRef.current = tool;
  colorRef.current = color;
  sizeRef.current = size;
  hardnessRef.current = hardness;
  texRef.current = brushTex;
  symRef.current = sym;
  fillModeRef.current = fillMode;
  opacityRef.current = opacity;
  pressureRef.current = pressureOn;
  filledRef.current = filled;
  confirmRef.current = confirm;
  activeIdRef.current = activeId;
  bgRef.current = whiteRef.current ? bgColor : '#000000';

  /* ----------------------------- core operations ----------------------------- */

  const applyLayers = (next: PaintLayer[]) => {
    layersRef.current = next;
    setLayers(next);
    render();
  };

  const selectLayer = (id: number) => {
    activeIdRef.current = id;
    setActiveId(id);
  };

  const activeLayer = (): PaintLayer | null =>
    layersRef.current.find((l) => l.id === activeIdRef.current) ?? null;

  const captureProject = (): ProjectSnapshot => ({
    layers: layersRef.current.map((l) => {
      const g = l.canvas.getContext('2d');
      return {
        id: l.id,
        name: l.name,
        visible: l.visible,
        opacity: l.opacity,
        img: g ? g.getImageData(0, 0, l.canvas.width, l.canvas.height) : null,
      };
    }),
  });

  const restoreLayers = (snap: ProjectSnapshot): PaintLayer[] =>
    snap.layers.map((s) => {
      const c = document.createElement('canvas');
      c.width = s.img ? s.img.width : docRef.current.w;
      c.height = s.img ? s.img.height : docRef.current.h;
      const g = c.getContext('2d');
      if (g && s.img) g.putImageData(s.img, 0, 0);
      return { id: s.id, name: s.name, visible: s.visible, opacity: s.opacity, canvas: c };
    });

  const pushUndo = () => {
    undoRef.current.push(captureProject());
    if (undoRef.current.length > MAX_UNDO) undoRef.current.splice(0, undoRef.current.length - MAX_UNDO);
    redoRef.current = [];
    setRedoCount(0);
    setUndoCount(undoRef.current.length);
  };

  const doUndo = () => {
    cancelShape();
    const u = undoRef.current;
    if (!u.length) return;
    redoRef.current.push(captureProject());
    const snap = u.pop() as ProjectSnapshot;
    const next = restoreLayers(snap);
    applyLayers(next);
    selectLayer(next.length ? next[next.length - 1].id : 0);
    scheduleSave();
    setUndoCount(u.length);
    setRedoCount(redoRef.current.length);
  };

  const doRedo = () => {
    cancelShape();
    const r = redoRef.current;
    if (!r.length) return;
    undoRef.current.push(captureProject());
    const snap = r.pop() as ProjectSnapshot;
    const next = restoreLayers(snap);
    applyLayers(next);
    selectLayer(next.length ? next[next.length - 1].id : 0);
    scheduleSave();
    setUndoCount(undoRef.current.length);
    setRedoCount(r.length);
  };

  const persist = () => {
    const d = docRef.current;
    const payload = {
      v: 1,
      w: d.w,
      h: d.h,
      white: whiteRef.current,
      bg: bgRef.current,
      layers: layersRef.current.map((l) => {
        const g = l.canvas.getContext('2d');
        return { id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, dataUrl: g ? l.canvas.toDataURL('image/png') : null };
      }),
      savedAt: Date.now(),
    };
    void idbSave(payload);
  };

  const scheduleSave = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => persist(), 500);
  };

  /* ----------------------------- rendering ----------------------------- */

  const render = () => {
    const cv = canvasRef.current;
    const wrap = canvasWrapRef.current;
    if (!cv || !wrap) return;
    const g = cv.getContext('2d');
    if (!g) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(1, wrap.clientWidth);
    const H = Math.max(1, wrap.clientHeight);
    const cw = Math.round(W * dpr);
    const ch = Math.round(H * dpr);
    if (cv.width !== cw || cv.height !== ch) {
      cv.width = cw;
      cv.height = ch;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    const v = viewRef.current;
    const d = docRef.current;
    const dx = v.x;
    const dy = v.y;
    const dw = d.w * v.zoom;
    const dh = d.h * v.zoom;

    /* Document backdrop (fill + checkerboard for transparent). */
    const drawBg = () => {
      if (dw <= 0 || dh <= 0 || dx >= W || dy >= H || dx + dw <= 0 || dy + dh <= 0) return;
      const x0 = Math.max(0, dx);
      const y0 = Math.max(0, dy);
      const x1 = Math.min(W, dx + dw);
      const y1 = Math.min(H, dy + dh);
      g.save();
      g.beginPath();
      g.rect(x0, y0, x1 - x0, y1 - y0);
      g.clip();
      if (whiteRef.current) {
        g.fillStyle = bgRef.current === '#ffffff' ? '#ffffff' : bgRef.current;
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
      } else {
        const cs = 12;
        g.fillStyle = '#e2e8f0';
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
        g.fillStyle = '#f8fafc';
        for (let yy = Math.floor(dy / cs) * cs; yy < dy + dh; yy += cs) {
          for (let xx = Math.floor(dx / cs) * cs; xx < dx + dw; xx += cs) {
            if ((((xx / cs) | 0) + ((yy / cs) | 0)) % 2 === 0) g.fillRect(xx, yy, cs, cs);
          }
        }
      }
      g.restore();
    };
    drawBg();

    /* Layers in world space. */
    g.setTransform(dpr * v.zoom, 0, 0, dpr * v.zoom, dpr * v.x, dpr * v.y);
    g.globalCompositeOperation = 'source-over';
    for (const l of layersRef.current) {
      if (!l.visible) continue;
      g.globalAlpha = l.opacity;
      g.drawImage(l.canvas, 0, 0);
    }
    g.globalAlpha = 1;

    /* Symmetry guide lines: dashed centerlines of the document. */
    const sm = symRef.current;
    if (sm !== 'off') {
      const mx = d.w / 2;
      const my = d.h / 2;
      g.save();
      g.setLineDash([6, 5]);
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(80,80,120,0.4)';
      if (sm === 'horizontal' || sm === 'both') {
        g.beginPath();
        g.moveTo(0, my);
        g.lineTo(d.w, my);
        g.stroke();
      }
      if (sm === 'vertical' || sm === 'both') {
        g.beginPath();
        g.moveTo(mx, 0);
        g.lineTo(mx, d.h);
        g.stroke();
      }
      g.restore();
    }

    /* Shift ruler preview: dashed straight line from stroke origin, snapped to nearest 45 deg. */
    const sref = strokeRef.current;
    if (sref.active && sref.shiftActive) {
      const a = sref.origin;
      const b = sref.prev;
      g.save();
      g.lineCap = 'round';
      if (Math.hypot(b.x - a.x, b.y - a.y) > 1) {
        g.setLineDash([6, 5]);
        g.lineWidth = 2;
        g.strokeStyle = 'rgba(0,0,0,0.55)';
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
        g.setLineDash([]);
      }
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.lineWidth = 1.5;
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.beginPath();
      g.arc(a.x, a.y, 4, 0, TAU);
      g.fill();
      g.stroke();
      g.restore();
    }

    /* Shape preview. */
    const sh = shapeRef.current;
    if (sh.active) {
      const col = colorRef.current;
      const sz = sizeRef.current;
      const fit = filledRef.current;
      if (fit) {
        g.save();
        g.globalAlpha = 0.3;
        g.fillStyle = col;
        traceShape(g, sh.kind, sh.start, sh.cur);
        g.fill();
        g.restore();
      }
      g.save();
      g.globalAlpha = 0.6;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = sz + 4;
      traceShape(g, sh.kind, sh.start, sh.cur);
      g.stroke();
      g.strokeStyle = col;
      g.lineWidth = sz;
      traceShape(g, sh.kind, sh.start, sh.cur);
      g.stroke();
      g.restore();
    }

    /* Gradient fill preview: dashed line from start to current + arrowheads. */
    const fl = fillRef.current;
    if (fl.active && fillModeRef.current !== 'datar') {
      g.save();
      g.setLineDash([6, 5]);
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.beginPath();
      g.moveTo(fl.start.x, fl.start.y);
      g.lineTo(fl.cur.x, fl.cur.y);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.lineWidth = 1.5;
      for (const p of [fl.start, fl.cur]) {
        g.beginPath();
        g.arc(p.x, p.y, 4, 0, TAU);
        g.fill();
        g.stroke();
      }
      g.restore();
    }

    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* Brush cursor: high-contrast ring + crosshair, visible on any color. */
    const cur = cursorRef.current;
    if (cur.show && (toolRef.current === 'kuas' || toolRef.current === 'penghapus' || toolRef.current === 'smudge')) {
      const R = Math.max(3, (sizeRef.current * v.zoom) / 2);
      g.save();
      g.globalAlpha = 0.18;
      g.fillStyle = colorRef.current;
      g.beginPath();
      g.arc(cur.x, cur.y, Math.max(1, R - 1), 0, TAU);
      g.fill();
      g.restore();
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,0.75)';
      g.beginPath();
      g.arc(cur.x, cur.y, R + 1, 0, TAU);
      g.stroke();
      g.lineWidth = 1.6;
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.beginPath();
      g.arc(cur.x, cur.y, R, 0, TAU);
      g.stroke();
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.beginPath();
      g.arc(cur.x, cur.y, R - 1.5, 0, TAU);
      g.stroke();
      const cl = Math.max(3, R * 0.35 + 2);
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,0.75)';
      g.beginPath();
      g.moveTo(cur.x - cl, cur.y);
      g.lineTo(cur.x + cl, cur.y);
      g.moveTo(cur.x, cur.y - cl);
      g.lineTo(cur.x, cur.y + cl);
      g.stroke();
      g.lineWidth = 1.2;
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.beginPath();
      g.moveTo(cur.x - cl, cur.y);
      g.lineTo(cur.x + cl, cur.y);
      g.moveTo(cur.x, cur.y - cl);
      g.lineTo(cur.x, cur.y + cl);
      g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.75)';
      g.beginPath();
      g.arc(cur.x, cur.y, 1.4, 0, TAU);
      g.fill();
    }
  };

  /* ----------------------------- view / zoom ----------------------------- */

  const requestRender = () => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      render();
    });
  };

  const fitZoom = () => {
    const wrap = canvasWrapRef.current;
    if (!wrap || wrap.clientWidth < 10 || wrap.clientHeight < 10) return;
    const d = docRef.current;
    const pad = 24;
    const z = clamp(Math.min((wrap.clientWidth - pad) / d.w, (wrap.clientHeight - pad) / d.h), 0.05, 32);
    const v = viewRef.current;
    v.zoom = z;
    v.x = (wrap.clientWidth - d.w * z) / 2;
    v.y = (wrap.clientHeight - d.h * z) / 2;
    setZoomPct(Math.round(z * 100));
    requestRender();
  };

  const fitCover = () => {
    const wrap = canvasWrapRef.current;
    if (!wrap || wrap.clientWidth < 10 || wrap.clientHeight < 10) return;
    const d = docRef.current;
    const z = clamp(Math.max(wrap.clientWidth / d.w, wrap.clientHeight / d.h), 0.05, 32);
    const v = viewRef.current;
    v.zoom = z;
    v.x = (wrap.clientWidth - d.w * z) / 2;
    v.y = (wrap.clientHeight - d.h * z) / 2;
    setZoomPct(Math.round(z * 100));
    requestRender();
  };

  const setZoom = (nz: number) => {
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const v = viewRef.current;
    const z = clamp(nz, 0.05, 32);
    const cx = wrap.clientWidth / 2;
    const cy = wrap.clientHeight / 2;
    v.x = cx - (cx - v.x) * (z / v.zoom);
    v.y = cy - (cy - v.y) * (z / v.zoom);
    v.zoom = z;
    setZoomPct(Math.round(z * 100));
    render();
  };

  /* ----------------------------- pointer math ----------------------------- */

  const toLogical = (e: { clientX: number; clientY: number }): Pt => {
    const cv = canvasRef.current;
    if (!cv) return { x: 0, y: 0 };
    const r = cv.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (e.clientX - r.left - v.x) / v.zoom, y: (e.clientY - r.top - v.y) / v.zoom };
  };

  const insideDoc = (p: Pt) => {
    const d = docRef.current;
    return p.x >= 0 && p.y >= 0 && p.x < d.w && p.y < d.h;
  };

  /* ----------------------------- brush stoke ----------------------------- */

  const startStroke = (lp: Pt, e: { pointerType: string; pressure: number; shiftKey: boolean }) => {
    pushUndo();
    const layer = activeLayer();
    if (!layer) return;
    const draw = layer.canvas.getContext('2d');
    if (!draw) return;
    const kind = toolRef.current === 'penghapus' ? 'penghapus' : toolRef.current === 'smudge' ? 'smudge' : 'kuas';
    const color = kind === 'penghapus' ? '#000000' : colorRef.current;
    const psi = e.pointerType === 'mouse' || e.pressure <= 0 ? 1 : clamp(e.pressure, 0, 1);
    const eff = sizeRef.current * (pressureRef.current && kind !== 'smudge' ? Math.max(0.18, psi) : 1);
    const isSmudge = kind === 'smudge';
    const alpha = isSmudge ? 1 : opacityRef.current;
    const hard = hardnessRef.current;
    const tex = texRef.current;
    const sym = symRef.current;
    const d = docRef.current;
    if (isSmudge) {
      smudgeSegment(draw, { x: lp.x, y: lp.y, s: eff }, { x: lp.x, y: lp.y, s: eff }, opacityRef.current, sym, d.w, d.h);
    } else {
      paintSegment(draw, kind, { x: lp.x, y: lp.y, s: eff }, { x: lp.x, y: lp.y, s: eff }, alpha, hard, color, tex, sym, d.w, d.h);
    }
    strokeRef.current = { active: true, prev: { ...lp }, smooth: { ...lp }, origin: { ...lp }, shiftActive: e.shiftKey, eff, tex, sym, ctx: draw, color, alpha };
    requestRender();
  };

  const moveStroke = (lp: Pt, e: { pointerType: string; pressure: number; clientX: number; clientY: number; shiftKey: boolean }) => {
    const s = strokeRef.current;
    if (!s.active || !s.ctx) return;
    let cx = lp.x;
    let cy = lp.y;
    if (e.shiftKey) {
      const c = constrainShift(s.origin, lp);
      cx = c.x;
      cy = c.y;
      if (!s.shiftActive) {
        s.smooth = { x: cx, y: cy };
        s.shiftActive = true;
      }
    } else {
      s.shiftActive = false;
    }
    const isSmudge = toolRef.current === 'smudge';
    const psi = e.pointerType === 'mouse' || e.pressure <= 0 ? 1 : clamp(e.pressure, 0, 1);
    const eff = sizeRef.current * (pressureRef.current && !isSmudge ? Math.max(0.18, psi) : 1);
    const kind = toolRef.current === 'penghapus' ? 'penghapus' : isSmudge ? 'smudge' : 'kuas';
    const distRaw = Math.hypot(cx - s.prev.x, cy - s.prev.y);
    const blend = e.pointerType === 'mouse' ? 0.45 : 0.22;
    const sm =
      distRaw > 12
        ? { x: cx, y: cy }
        : { x: s.smooth.x + (cx - s.smooth.x) * blend, y: s.smooth.y + (cy - s.smooth.y) * blend };
    const cv = canvasRef.current;
    if (cv) {
      const rr = cv.getBoundingClientRect();
      cursorRef.current = { x: e.clientX - rr.left, y: e.clientY - rr.top, show: true };
    }
    const d = docRef.current;
    if (isSmudge) {
      smudgeSegment(s.ctx, { x: s.prev.x, y: s.prev.y, s: s.eff }, { x: sm.x, y: sm.y, s: eff }, opacityRef.current, s.sym, d.w, d.h);
    } else {
      paintSegment(s.ctx, kind, { x: s.prev.x, y: s.prev.y, s: s.eff }, { x: sm.x, y: sm.y, s: eff }, s.alpha, hardnessRef.current, s.color, s.tex, s.sym, d.w, d.h);
    }
    s.prev = { ...sm };
    s.smooth = { ...sm };
    s.eff = eff;
    requestRender();
  };

  const closeStroke = () => {
    const s = strokeRef.current;
    if (!s.active) return;
    const isSmudge = toolRef.current === 'smudge';
    const kind = toolRef.current === 'penghapus' ? 'penghapus' : 'kuas';
    if (s.ctx) {
      const d = docRef.current;
      if (isSmudge) {
        smudgeSegment(s.ctx, { x: s.prev.x, y: s.prev.y, s: s.eff }, { x: s.prev.x, y: s.prev.y, s: s.eff }, opacityRef.current, s.sym, d.w, d.h);
      } else {
        paintSegment(s.ctx, kind, { x: s.prev.x, y: s.prev.y, s: s.eff }, { x: s.prev.x, y: s.prev.y, s: s.eff }, s.alpha, hardnessRef.current, s.color, s.tex, s.sym, d.w, d.h);
      }
    }
    s.active = false;
    scheduleSave();
    requestRender();
  };

  /* ----------------------------- shapes ----------------------------- */

  const startShape = (lp: Pt) => {
    shapeRef.current = { active: true, kind: toolRef.current, start: { ...lp }, cur: { ...lp } };
    render();
  };

  const commitShape = () => {
    const sh = shapeRef.current;
    if (!sh.active) return;
    if (Math.hypot(sh.cur.x - sh.start.x, sh.cur.y - sh.start.y) >= 0.5) {
      const layer = activeLayer();
      if (layer) {
        const g = layer.canvas.getContext('2d');
        if (g) {
          pushUndo();
          drawShape(g, sh.kind, sh.start, sh.cur, sizeRef.current, colorRef.current, opacityRef.current, filledRef.current);
        }
      }
    }
    sh.active = false;
    scheduleSave();
    render();
  };

  const cancelShape = () => {
    if (shapeRef.current.active) {
      shapeRef.current.active = false;
      render();
    }
  };

  /* ----------------------------- fill & pipette ----------------------------- */

  const floodFill = (lp: Pt, dragFrom?: Pt) => {
    if (!insideDoc(lp)) return;
    const layer = activeLayer();
    if (!layer) return;
    const g = layer.canvas.getContext('2d');
    if (!g) return;
    const d = docRef.current;
    const w = d.w;
    const h = d.h;
    const mode = fillModeRef.current;
    if (mode !== 'datar') {
      pushUndo();
      const c0 = dragFrom ? { x: dragFrom.x, y: dragFrom.y } : { x: -1, y: -1 };
      const c1 = lp;
      const grd =
        mode === 'linear'
          ? g.createLinearGradient(c0.x, c0.y, c1.x, c1.y)
          : g.createRadialGradient(
              c0.x < 0 || c0.x > w ? w / 2 : c0.x,
              c0.y < 0 || c0.y > h ? h / 2 : c0.y,
              0,
              c0.x < 0 || c0.x > w ? w / 2 : c0.x,
              c0.y < 0 || c0.y > h ? h / 2 : c0.y,
              Math.hypot(c1.x - (c0.x < 0 || c0.x > w ? w / 2 : c0.x), c1.y - (c0.y < 0 || c0.y > h ? h / 2 : c0.y))
            );
      grd.addColorStop(0, colorRef.current);
      grd.addColorStop(1, hexToCssRgba(bgRef.current, opacityRef.current));
      g.save();
      g.globalAlpha = opacityRef.current;
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      g.restore();
      scheduleSave();
      render();
      return;
    }
    const img = g.getImageData(0, 0, w, h);
    const data = img.data;
    const tol = 24;
    const idx = (Math.round(lp.y) * w + Math.round(lp.x)) * 4;
    const tr = data[idx];
    const tg = data[idx + 1];
    const tb = data[idx + 2];
    const ta = data[idx + 3];
    const col = hexToRgb(colorRef.current) ?? { r: 0, g: 0, b: 0 };
    const fa = Math.round(opacityRef.current * 255);
    const close = (i: number) =>
      Math.abs(data[i] - tr) <= tol &&
      Math.abs(data[i + 1] - tg) <= tol &&
      Math.abs(data[i + 2] - tb) <= tol &&
      Math.abs(data[i + 3] - ta) <= 64;
    const matchFill = (i: number) =>
      Math.abs(data[i] - col.r) <= tol &&
      Math.abs(data[i + 1] - col.g) <= tol &&
      Math.abs(data[i + 2] - col.b) <= tol &&
      Math.abs(data[i + 3] - fa) <= 64;
    if (matchFill(idx)) return;
    pushUndo();
    const wpx = (y: number) => y * w;
    const stack: number[] = [idx];
    while (stack.length) {
      const i = stack.pop() as number;
      if (!close(i)) continue;
      const x = (i >> 2) % w;
      const y = (i - (x << 2)) / 4 / w;
      let lx = x;
      let rx = x;
      while (lx - 1 >= 0 && close((wpx(y) + lx - 1) << 2)) lx--;
      while (rx + 1 < w && close((wpx(y) + rx + 1) << 2)) rx++;
      for (let k = lx; k <= rx; k++) {
        const at = (wpx(y) + k) << 2;
        data[at] = col.r;
        data[at + 1] = col.g;
        data[at + 2] = col.b;
        data[at + 3] = fa;
      }
      for (let k = lx; k <= rx; k++) {
        if (y + 1 < h && close((wpx(y + 1) + k) << 2)) stack.push((wpx(y + 1) + k) << 2);
        if (y - 1 >= 0 && close((wpx(y - 1) + k) << 2)) stack.push((wpx(y - 1) + k) << 2);
      }
    }
    g.putImageData(img, 0, 0);
    scheduleSave();
    render();
  };

  const pickColor = (lp: Pt) => {
    if (!insideDoc(lp)) return;
    const d = docRef.current;
    const tmp = document.createElement('canvas');
    tmp.width = d.w;
    tmp.height = d.h;
    const g = tmp.getContext('2d');
    if (!g) return;
    if (whiteRef.current) {
      g.fillStyle = bgRef.current;
      g.fillRect(0, 0, d.w, d.h);
    }
    for (const l of layersRef.current) {
      if (!l.visible) continue;
      g.globalAlpha = l.opacity;
      g.drawImage(l.canvas, 0, 0);
    }
    g.globalAlpha = 1;
    const x = Math.max(0, Math.min(d.w - 1, Math.round(lp.x)));
    const y = Math.max(0, Math.min(d.h - 1, Math.round(lp.y)));
    const px = g.getImageData(x, y, 1, 1).data;
    const hex = rgbToHex(px[0], px[1], px[2]);
    setColor(hex);
    setHexDraft(hex);
  };

  /* ----------------------------- pointer handlers ----------------------------- */

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 2 || confirmRef.current !== 'none') return;
    e.preventDefault();
    const el = e.currentTarget as HTMLCanvasElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (e.button === 1) {
      cancelShape();
      cursorRef.current.show = false;
      panRef.current = { active: true, sx: e.clientX, sy: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y };
      return;
    }
    const lp = toLogical(e);
    if (spaceHeld || toolRef.current === 'tangan') {
      cancelShape();
      cursorRef.current.show = false;
      panRef.current = { active: true, sx: e.clientX, sy: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y };
      return;
    }
    const curTool = toolRef.current;
    if (curTool === 'pipet') {
      pickColor(lp);
      return;
    }
    if (curTool === 'isi') {
      if (fillModeRef.current === 'datar') {
        floodFill(lp);
      } else {
        fillRef.current = { active: true, start: { ...lp }, cur: { ...lp } };
      }
      return;
    }
    if (curTool === 'smudge' || curTool === 'kuas' || curTool === 'penghapus') {
      if (!insideDoc(lp)) return;
      startStroke(lp, e);
      return;
    }
    if (curTool === 'teks') {
      if (insideDoc(lp)) {
        textAnchorRef.current = { x: lp.x, y: lp.y };
        setTextOpen(true);
      }
      return;
    }
    startShape(lp);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pan = panRef.current;
    if (pan.active) {
      const v = viewRef.current;
      v.x = pan.ox + (e.clientX - pan.sx);
      v.y = pan.oy + (e.clientY - pan.sy);
      requestRender();
      return;
    }
    const lp = toLogical(e);
    if (strokeRef.current.active) {
      moveStroke(lp, e);
      return;
    }
    if (shapeRef.current.active) {
      shapeRef.current.cur = lp;
      requestRender();
      return;
    }
    if (fillRef.current.active) {
      fillRef.current.cur = lp;
      requestRender();
      return;
    }
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    cursorRef.current = { x: e.clientX - r.left, y: e.clientY - r.top, show: true };
    requestRender();
  };

  const onPointerUp = () => {
    if (panRef.current.active) {
      panRef.current.active = false;
      return;
    }
    if (shapeRef.current.active) {
      commitShape();
      return;
    }
    if (fillRef.current.active) {
      fillRef.current.active = false;
      floodFill(fillRef.current.cur, fillRef.current.start);
      return;
    }
    closeStroke();
  };

  const onPointerCancel = () => {
    if (panRef.current.active) {
      panRef.current.active = false;
      return;
    }
    cancelShape();
    fillRef.current.active = false;
    const s = strokeRef.current;
    if (s.active) {
      s.active = false;
      scheduleSave();
      render();
    }
  };

  const onPointerLeave = () => {
    if (!strokeRef.current.active && !panRef.current.active) {
      cursorRef.current.show = false;
      requestRender();
    }
  };

  /* ----------------------------- layer ops ----------------------------- */

  const changeTool = (nt: PaintTool) => {
    cancelShape();
    fillRef.current.active = false;
    toolRef.current = nt;
    setTool(nt);
  };

  const addLayer = () => {
    pushUndo();
    const d = docRef.current;
    const nl = makeLayer(d.w, d.h, `Lapisan ${nextLayerNameRef.current++}`, false);
    nl.id = nextLayerIdRef.current++;
    const arr = layersRef.current;
    const i = arr.findIndex((l) => l.id === activeIdRef.current);
    const next = [...arr.slice(0, i + 1), nl, ...arr.slice(i + 1)];
    applyLayers(next);
    selectLayer(nl.id);
    scheduleSave();
  };

  const duplicateLayer = () => {
    const arr = layersRef.current;
    const i = arr.findIndex((l) => l.id === activeIdRef.current);
    if (i < 0) return;
    const src = arr[i];
    const c = document.createElement('canvas');
    c.width = src.canvas.width;
    c.height = src.canvas.height;
    const g = c.getContext('2d');
    if (g) g.drawImage(src.canvas, 0, 0);
    const nl: PaintLayer = { id: nextLayerIdRef.current++, name: `Lapisan ${nextLayerNameRef.current++}`, visible: true, opacity: src.opacity, canvas: c };
    pushUndo();
    const next = [...arr.slice(0, i + 1), nl, ...arr.slice(i + 1)];
    applyLayers(next);
    selectLayer(nl.id);
    scheduleSave();
  };

  const mergeLayerDown = () => {
    const arr = layersRef.current;
    const i = arr.findIndex((l) => l.id === activeIdRef.current);
    if (i <= 0) return;
    const above = arr[i];
    const below = arr[i - 1];
    const g = below.canvas.getContext('2d');
    if (!g) return;
    pushUndo();
    g.save();
    g.globalAlpha = above.opacity;
    g.drawImage(above.canvas, 0, 0);
    g.restore();
    const next = [...arr.slice(0, i), ...arr.slice(i + 1)];
    applyLayers(next);
    selectLayer(below.id);
    scheduleSave();
  };

  const moveLayer = (dir: 1 | -1) => {
    const arr = layersRef.current;
    const i = arr.findIndex((l) => l.id === activeIdRef.current);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    const next = [...arr];
    const tmp = next[i];
    next[i] = next[j];
    next[j] = tmp;
    applyLayers(next);
    scheduleSave();
  };

  const toggleLayerVisible = (id: number) => {
    applyLayers(layersRef.current.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
  };

  const setLayerOpacity = (id: number, v: number) => {
    applyLayers(layersRef.current.map((l) => (l.id === id ? { ...l, opacity: clamp(v, 0, 1) } : l)));
  };

  const askDeleteLayer = () => {
    if (layersRef.current.length <= 1) return;
    setConfirm('delete');
  };

  const doDeleteLayer = () => {
    setConfirm('none');
    const arr = layersRef.current;
    if (arr.length <= 1) return;
    const i = arr.findIndex((l) => l.id === activeIdRef.current);
    pushUndo();
    const next = arr.filter((l) => l.id !== activeIdRef.current);
    applyLayers(next);
    const nxt = next[Math.min(Math.max(i - 1, 0), next.length - 1)];
    selectLayer(nxt ? nxt.id : next[0].id);
    scheduleSave();
  };

  const doNewCanvas = () => {
    setConfirm('none');
    cancelShape();
    fillRef.current.active = false;
    resetStacks();
    const d = { w: DEFAULT_W, h: DEFAULT_H };
    docRef.current = d;
    whiteRef.current = true;
    bgRef.current = '#ffffff';
    setBgColor('#ffffff');
    const l1 = makeLayer(d.w, d.h, 'Lapisan 1', true);
    l1.id = nextLayerIdRef.current++;
    nextLayerNameRef.current = 2;
    applyLayers([l1]);
    selectLayer(l1.id);
    fitCover();
    scheduleSave();
  };

  const resetStacks = () => {
    undoRef.current = [];
    redoRef.current = [];
    setUndoCount(0);
    setRedoCount(0);
  };

  const exportCanvas = (type: 'png' | 'jpeg') => {
    const d = docRef.current;
    const c = document.createElement('canvas');
    c.width = d.w;
    c.height = d.h;
    const g = c.getContext('2d');
    if (!g) return null;
    if (whiteRef.current) {
      g.fillStyle = bgRef.current;
      g.fillRect(0, 0, d.w, d.h);
    }
    for (const l of layersRef.current) {
      if (!l.visible) continue;
      g.globalAlpha = l.opacity;
      g.drawImage(l.canvas, 0, 0);
    }
    g.globalAlpha = 1;
    return type === 'jpeg' ? c.toDataURL('image/jpeg', 0.92) : c.toDataURL('image/png');
  };

  const finishExport = (res: { ok: boolean; canceled?: boolean; error?: string } | null | undefined) => {
    if (res && res.ok && !res.canceled) setOkToast(true);
    else if (res && res.error && !res.canceled) setToast(true);
    else if (!res) setToast(true);
  };

  const savePng = async () => {
    if (savingPng) return;
    setSavingPng(true);
    try {
      const dataUrl = exportCanvas('png');
      if (!dataUrl) return;
      const res = await savePngAs(dataUrl);
      finishExport(res);
    } catch {
      setToast(true);
    } finally {
      setSavingPng(false);
    }
  };

  const saveJpg = async () => {
    if (savingPng) return;
    setSavingPng(true);
    try {
      const dataUrl = exportCanvas('jpeg');
      if (!dataUrl) return;
      const res = await saveJpgAs(dataUrl);
      finishExport(res);
    } catch {
      setToast(true);
    } finally {
      setSavingPng(false);
    }
  };

  const setBackground = (hex: string) => {
    pushUndo();
    setBgColor(hex);
    setHexDraft(hex === '#ffffff' ? colorRef.current : hex);
    whiteRef.current = true;
    bgRef.current = hex;
    const layer = activeLayer();
    if (layer) {
      const g = layer.canvas.getContext('2d');
      if (g) {
        g.save();
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = hex;
        g.fillRect(0, 0, docRef.current.w, docRef.current.h);
        g.restore();
      }
    }
    scheduleSave();
    render();
  };

  /* ----------------------------- text tool ----------------------------- */

  const addTextToLayer = () => {
    const layer = activeLayer();
    if (!layer) return;
    const g = layer.canvas.getContext('2d');
    if (!g) return;
    if (!textStr.trim()) return;
    const d = docRef.current;
    pushUndo();
    g.save();
    g.globalAlpha = opacityRef.current;
    g.fillStyle = colorRef.current;
    g.font = `${textSize}px "${textFont}", sans-serif`;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.textRendering = 'optimizeLegibility';
    const anchor = textAnchorRef.current;
    const lines = textStr.split('\n');
    const lh = textSize * 1.25;
    let line = 0;
    const maxW = d.w - anchor.x - 12;
    for (const raw of lines) {
      const words = raw.split(/\s+/).filter(Boolean);
      let curLine = '';
      let y = anchor.y + line * lh;
      for (const w of words) {
        const test = curLine ? curLine + ' ' + w : w;
        if (g.measureText(test).width > maxW && curLine) {
          g.fillText(curLine, anchor.x, y);
          curLine = w;
          y += lh;
          line++;
        } else {
          curLine = test;
        }
      }
      if (curLine) {
        g.fillText(curLine, anchor.x, y);
        line++;
      }
    }
    g.restore();
    setTextOpen(false);
    setTextStr('');
    scheduleSave();
    render();
  };

  /* ----------------------------- keyboard ----------------------------- */

  const handKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    const tag = (el && el.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable)) return;
    if (e.key === ' ' && !e.repeat) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      spaceRef.current = true;
      setSpaceHeld(true);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
        return;
      }
      if (k === 'y') {
        e.preventDefault();
        doRedo();
        return;
      }
      if (k === 's') {
        e.preventDefault();
        void savePng();
        return;
      }
      if (k === '0') {
        e.preventDefault();
        fitZoom();
        return;
      }
      return;
    }
    if (e.altKey || e.metaKey) return;
    switch (e.key.toLowerCase()) {
      case 'b':
        changeTool('kuas');
        break;
      case 'e':
        changeTool('penghapus');
        break;
      case 'i':
        changeTool('pipet');
        break;
      case 'g':
        changeTool('isi');
        break;
      case 'l':
        changeTool('garis');
        break;
      case 'r':
        changeTool('persegi');
        break;
      case 'o':
        changeTool('elips');
        break;
      case 's':
        changeTool('smudge');
        break;
      case 't':
        changeTool('teks');
        break;
      case 'h':
        changeTool('tangan');
        break;
      case '[':
        e.preventDefault();
        setSize((p) => Math.max(1, p - 2));
        break;
      case ']':
        e.preventDefault();
        setSize((p) => Math.min(200, p + 2));
        break;
      case '+':
      case '=':
        e.preventDefault();
        setZoom(viewRef.current.zoom * 1.25);
        break;
      case '-':
        e.preventDefault();
        setZoom(viewRef.current.zoom / 1.25);
        break;
      case 'escape':
        cancelShape();
        fillRef.current.active = false;
        setTextOpen(false);
        break;
      default:
        break;
    }
  };
  handKeyRef.current = handKey;

  /* ----------------------------- effects ----------------------------- */

  useEffect(() => {
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      if (!didInitRef.current) {
        didInitRef.current = true;
        fitCover();
      } else {
        requestRender();
      }
    });
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const wrap = canvasWrapRef.current;
    if (!wrap) return;

    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current;
      if (e.ctrlKey) {
        e.preventDefault();
        const nz = clamp(v.zoom * Math.exp(-e.deltaY * 0.0015), 0.05, 32);
        const cv = canvasRef.current;
        if (cv) {
          const r = cv.getBoundingClientRect();
          const mx = e.clientX - r.left;
          const my = e.clientY - r.top;
          v.x = mx - (mx - v.x) * (nz / v.zoom);
          v.y = my - (my - v.y) * (nz / v.zoom);
        }
        v.zoom = nz;
        setZoomPct(Math.round(nz * 100));
        render();
      } else if (!strokeRef.current.active && !panRef.current.active && !e.deltaX && !e.deltaY) {
        return;
      } else {
        e.preventDefault();
        v.x -= e.deltaX;
        v.y -= e.deltaY;
        render();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        spaceRef.current = false;
        setSpaceHeld(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => handKeyRef.current(e);

    wrap.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      wrap.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    if (spaceHeld || tool === 'tangan') cv.style.cursor = 'grab';
    else if (tool === 'kuas' || tool === 'penghapus' || tool === 'smudge') cv.style.cursor = 'none';
    else cv.style.cursor = 'crosshair';
  }, [tool, spaceHeld]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = (await idbLoad()) as
        | { w?: number; h?: number; white?: boolean; bg?: string; layers?: { id: number; name: string; visible: boolean; opacity: number; dataUrl: string | null }[] }
        | null;
      if (!alive) return;
      if (saved && saved.layers && saved.layers.length) {
        const w = saved.w && saved.w > 0 ? saved.w : DEFAULT_W;
        const h = saved.h && saved.h > 0 ? saved.h : DEFAULT_H;
        docRef.current = { w, h };
        whiteRef.current = saved.white !== false;
        bgRef.current = typeof saved.bg === 'string' && /^#?[0-9a-fA-F]{6}$/.test(saved.bg) ? saved.bg : '#ffffff';
        setBgColor(bgRef.current);
        const restored: PaintLayer[] = [];
        for (const s of saved.layers) {
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const g = c.getContext('2d');
          if (g && s.dataUrl) {
            try {
              const img = await loadImage(s.dataUrl);
              g.drawImage(img, 0, 0);
            } catch {
              /* keep blank */
            }
          }
          restored.push({ id: s.id, name: s.name || 'Lapisan', visible: s.visible !== false, opacity: typeof s.opacity === 'number' ? s.opacity : 1, canvas: c });
        }
        nextLayerIdRef.current = Math.max(1, ...restored.map((l) => l.id + 1));
        applyLayers(restored);
        selectLayer(restored[restored.length - 1].id);
      } else {
        const d = docRef.current;
        const l1 = makeLayer(d.w, d.h, 'Lapisan 1', whiteRef.current);
        l1.id = nextLayerIdRef.current++;
        nextLayerNameRef.current = 2;
        applyLayers([l1]);
        selectLayer(l1.id);
      }
      setLoading(false);
      fitCover();
    })().catch(() => {
      if (!alive) return;
      setLoading(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const tm = setTimeout(() => setToast(false), 4000);
    return () => clearTimeout(tm);
  }, [toast]);

  useEffect(() => {
    if (!okToast) return;
    const tm = setTimeout(() => setOkToast(false), 3500);
    return () => clearTimeout(tm);
  }, [okToast]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      persist();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------------- render ----------------------------- */

  const activeIdx = layers.findIndex((l) => l.id === activeId);
  const pathHint = t(
    'Petunjuk: B Kuas, E Penghapus, I Pipet, G Isi Warna, L Garis, R Persegi, O Elips, H Tangan, S Coreng, T Teks. Shift garis lurus, [ ] ukuran, Spasi geser, Ctrl+Z urungkan, Ctrl+Shift+Z ulangi.'
  );
  const delLayerName = layers.find((l) => l.id === activeId)?.name ?? '';

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        icon="brush"
        title={t('Melukis')}
        desc={t('Gambar bebas dengan kuas, pengisi warna, bentuk, dan lapisan. Simpan sebagai PNG.')}
        onBack={onBack}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="tool-btn" disabled={!undoCount} onClick={doUndo} title={`${t('Urungkan')} (Ctrl+Z)`}>
              <Icon name="undo" className="w-4 h-4" />
            </button>
            <button type="button" className="tool-btn" disabled={!redoCount} onClick={doRedo} title={`${t('Ulangi')} (Ctrl+Shift+Z)`}>
              <Icon name="replay" className="w-4 h-4" />
            </button>
            <button type="button" className="btn-secondary" onClick={() => setConfirm('newcanvas')} title={t('Baru')}>
              <Icon name="plus" className="w-4 h-4" />
              {t('Baru')}
            </button>
            <button type="button" className="btn-primary" onClick={() => void savePng()} disabled={savingPng}>
              {savingPng ? (
                <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              ) : (
                <Icon name="save" className="w-4 h-4" />
              )}
              {t('Simpan PNG')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => void saveJpg()} disabled={savingPng}>
              {t('Simpan JPEG')}
            </button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[52px_minmax(0,1fr)_276px]">
        {/* Tool rail */}
        <aside className="card p-1.5 flex flex-wrap lg:flex-col items-start gap-1 lg:gap-1.5 h-fit">
          {PAINT_TOOLS.map((pt) => {
            const active = tool === pt.id;
            return (
              <button
                key={pt.id}
                type="button"
                onClick={(e) => {
                  changeTool(pt.id);
                  (e.currentTarget as HTMLButtonElement).blur();
                }}
                title={`${t(pt.labelKey)} (${pt.kbd})`}
                aria-label={t(pt.labelKey)}
                className={`h-10 w-10 grid place-items-center rounded-xl border transition-colors select-none ${
                  active
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent-border)] shadow-inner'
                    : 'text-[var(--text-3)] border-transparent hover:bg-[var(--overlay)] hover:text-[var(--text)]'
                }`}
              >
                <Icon name={pt.icon} className="w-5 h-5" />
              </button>
            );
          })}
        </aside>

        {/* Canvas */}
        <section className="card overflow-hidden min-w-0">
          <div ref={canvasWrapRef} className="relative h-[calc(100dvh-235px)] min-h-[480px] bg-[var(--bg-2)]">
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full touch-none select-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onPointerLeave={onPointerLeave}
              onContextMenu={(e) => e.preventDefault()}
            />

            {loading && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-[var(--surface-2)]/60 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 rounded-full border-2 border-[var(--accent-border)] border-t-[var(--accent-strong)] animate-spin" />
                  <p className="text-sm text-[var(--text-3)]">{t('Memuat gambar tersimpan…')}</p>
                </div>
              </div>
            )}

            {okToast && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-[var(--ok-soft)] border border-[var(--ok-border)] px-3.5 py-1.5 text-xs font-medium text-[var(--ok-strong)] shadow-lg whitespace-nowrap">
                <Icon name="check" className="w-3.5 h-3.5" />
                {t('Gambar disimpan.')}
              </div>
            )}

            {toast && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-[var(--danger-soft)] border border-[var(--danger-border)] px-3.5 py-1.5 text-xs font-medium text-[var(--danger-strong)] shadow-lg whitespace-nowrap">
                <Icon name="alert" className="w-3.5 h-3.5" />
                {t('Gagal menyimpan gambar.')}
              </div>
            )}

            {/* Zoom controls */}
            <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 rounded-full border border-[var(--border-2)] bg-[var(--surface-2)] shadow-lg px-1 py-0.5">
              <button
                type="button"
                className="h-7 w-7 grid place-items-center rounded-full text-[var(--text-2)] hover:bg-[var(--overlay-2)] hover:text-[var(--text)]"
                onClick={() => setZoom(viewRef.current.zoom / 1.25)}
                title={t('Perkecil')}
                aria-label={t('Perkecil')}
              >
                <Icon name="minus" className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                className="h-7 px-2.5 rounded-full text-[11px] font-semibold text-[var(--text-2)] hover:bg-[var(--overlay-2)] hover:text-[var(--text)] tabular-nums"
                onClick={fitZoom}
                title={t('Sesuaikan')}
              >
                {zoomPct}%
              </button>
              <button
                type="button"
                className="h-7 w-7 grid place-items-center rounded-full text-[var(--text-2)] hover:bg-[var(--overlay-2)] hover:text-[var(--text)]"
                onClick={() => setZoom(viewRef.current.zoom * 1.25)}
                title={t('Perbesar')}
                aria-label={t('Perbesar')}
              >
                <Icon name="plus" className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-3.5 py-2 border-t border-[var(--border)]">
            <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
              <Icon name="check" className="w-3 h-3 shrink-0" />
              {t('Gambar Anda tersimpan otomatis.')}
            </p>
            <p className="hidden md:block text-[11px] text-[var(--text-3)] truncate" title={pathHint}>
              {pathHint}
            </p>
          </div>
        </section>

        {/* Right panel */}
        <aside className="space-y-4 min-w-0">
          <section className="card p-4 space-y-4">
            <h2 className="eyebrow">{t('Alat')}</h2>
            <SliderRow label={t('Ukuran')} value={size} min={1} max={200} step={1} onChange={setSize} format={(v) => `${Math.round(v)}px`} />
            <SliderRow label={t('Opacity')} value={opacity} min={0} max={1} step={0.01} onChange={setOpacity} format={(v) => `${Math.round(v * 100)}%`} />
            {(tool === 'kuas' || tool === 'penghapus') && (
              <SliderRow
                label={t('Kekerasan')}
                value={hardness}
                min={0}
                max={1}
                step={0.01}
                onChange={setHardness}
                format={(v) => `${Math.round(v * 100)}%`}
              />
            )}
            {tool === 'kuas' && (
              <button
                type="button"
                onClick={() => setPressureOn((v) => !v)}
                aria-pressed={pressureOn}
                className={`w-full h-9 rounded-full border px-3.5 text-xs font-medium flex items-center justify-between gap-2 transition-colors select-none ${
                  pressureOn
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent-border)]'
                    : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--overlay)]'
                }`}
              >
                {t('Tekanan pena')}
                <span className={`h-4 w-4 rounded-full border-2 ${pressureOn ? 'bg-[var(--accent-deep)] border-[var(--accent-border)]' : 'bg-[var(--overlay-2)] border-[var(--border-2)]'}`} />
              </button>
            )}
            {tool === 'kuas' && (
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-3)] mb-1.5">{t('Tekstur Kuas')}</label>
                <select
                  className="input !py-1.5 !px-2 w-full"
                  value={brushTex}
                  onChange={(e) => setBrushTex(e.target.value as BrushTex)}
                >
                  {BRUSH_TEX.map((tx) => (
                    <option key={tx.id} value={tx.id}>
                      {t(tx.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-3)] mb-1.5">{t('Simetri')}</label>
              <div className="grid grid-cols-4 gap-1">
                {SYM_OPTIONS.map((sm) => (
                  <button
                    key={sm.id}
                    type="button"
                    onClick={() => setSym(sm.id)}
                    aria-pressed={sym === sm.id}
                    title={t(sm.labelKey)}
                    className={`h-9 rounded-lg border grid place-items-center transition-colors select-none ${
                      sym === sm.id
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent-border)]'
                        : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--overlay)]'
                    }`}
                  >
                    <Icon name={sm.icon} className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
            {tool === 'isi' && (
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-3)] mb-1.5">{t('Modus Isi')}</label>
                <div className="grid grid-cols-3 gap-1">
                  {FILL_MODES.map((fm) => (
                    <button
                      key={fm.id}
                      type="button"
                      onClick={() => setFillMode(fm.id)}
                      aria-pressed={fillMode === fm.id}
                      className={`h-9 rounded-lg border px-1.5 text-[11px] font-medium transition-colors select-none ${
                        fillMode === fm.id
                          ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent-border)]'
                          : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--overlay)]'
                      }`}
                    >
                      {t(fm.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {(tool === 'persegi' || tool === 'elips') && (
              <button
                type="button"
                onClick={() => setFilled((v) => !v)}
                aria-pressed={filled}
                className={`w-full h-9 rounded-full border px-3.5 text-xs font-medium flex items-center justify-between gap-2 transition-colors select-none ${
                  filled
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent-border)]'
                    : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--overlay)]'
                }`}
              >
                {t('Isi Bentuk')}
                <span className={`h-4 w-4 rounded-full border-2 ${filled ? 'bg-[var(--accent-deep)] border-[var(--accent-border)]' : 'bg-[var(--overlay-2)] border-[var(--border-2)]'}`} />
              </button>
            )}
          </section>

          <section className="card p-4 space-y-4">
            <h2 className="eyebrow">{t('Warna')}</h2>
            <div className="flex items-center gap-2">
              <label className="relative shrink-0 cursor-pointer">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => {
                    setColor(e.target.value);
                    setHexDraft(e.target.value);
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <span className="block h-10 w-10 rounded-xl border-2 border-[var(--border-2)] shadow-inner" style={{ background: color }} />
              </label>
              <input
                className="input-field flex-1 h-9 text-xs uppercase tracking-wide"
                value={hexDraft}
                spellCheck={false}
                onChange={(e) => setHexDraft(e.target.value)}
                onBlur={() => {
                  const m = /^#?[0-9a-fA-F]{6}$/.exec(hexDraft.trim());
                  if (m) {
                    const h = `#${m[0].replace(/^#/, '').toLowerCase()}`;
                    setColor(h);
                    setHexDraft(h);
                  } else {
                    setHexDraft(color);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                }}
              />
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {SWATCHES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setColor(s);
                    setHexDraft(s);
                  }}
                  aria-label={s}
                  className={`h-7 rounded-lg border transition-transform hover:scale-110 select-none ${
                    color === s ? 'ring-2 ring-[var(--accent-border)] border-[var(--accent-border)]' : 'border-[var(--border-2)]'
                  }`}
                  style={{ background: s }}
                />
              ))}
            </div>
          </section>

          <section className="card p-4 space-y-3.5">
            <h2 className="eyebrow">{t('Warna Latar')}</h2>
            <button
              type="button"
              onClick={() => {
                whiteRef.current = false;
                bgRef.current = '#000000';
                setBgColor('#000000');
                render();
              }}
              aria-pressed={!whiteRef.current}
              className={`w-full h-9 rounded-full border px-3.5 text-xs font-medium flex items-center justify-between gap-2 transition-colors select-none ${
                !whiteRef.current
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent-border)]'
                  : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--overlay)]'
              }`}
            >
              {t('Transparan')}
              {!whiteRef.current && <Icon name="check" className="w-3.5 h-3.5" />}
            </button>
            <div className="flex items-center gap-2">
              <label className="relative shrink-0 cursor-pointer">
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(bgColor) ? bgColor : '#ffffff'}
                  onChange={(e) => setBackground(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <span
                  className="block h-8 w-8 rounded-lg border-2 border-[var(--border-2)] shadow-inner"
                  style={{ background: /^#[0-9a-fA-F]{6}$/.test(bgColor) ? bgColor : '#ffffff' }}
                />
              </label>
              <div className="grid grid-cols-8 gap-1.5 flex-1">
                {SWATCHES.slice(0, 8).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setBackground(s)}
                    aria-label={s}
                    className={`h-7 rounded-lg border transition-transform hover:scale-110 select-none ${
                      bgColor === s ? 'ring-2 ring-[var(--accent-border)] border-[var(--accent-border)]' : 'border-[var(--border-2)]'
                    }`}
                    style={{ background: s }}
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="card p-3 space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <h2 className="eyebrow">{t('Lapisan')}</h2>
            </div>
            <div className="flex items-center gap-0.5 flex-wrap">
              <button type="button" className="tool-btn h-7 w-7 px-0" onClick={addLayer} title={t('Tambahkan Lapisan')}>
                <Icon name="plus" className="w-3.5 h-3.5" />
              </button>
              <button type="button" className="tool-btn h-7 w-7 px-0" onClick={duplicateLayer} title={t('Duplikat Lapisan')}>
                <Icon name="duplicate" className="w-3.5 h-3.5" />
              </button>
              <button type="button" className="tool-btn h-7 w-7 px-0" onClick={mergeLayerDown} disabled={activeIdx <= 0} title={t('Gabung ke Bawah')}>
                <Icon name="mergeDown" className="w-3.5 h-3.5" />
              </button>
              <button type="button" className="tool-btn h-7 w-7 px-0" onClick={() => moveLayer(-1)} disabled={activeIdx <= 0} title={t('Pindah ke Atas')}>
                <Icon name="chevronUp" className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                className="tool-btn h-7 w-7 px-0"
                onClick={() => moveLayer(1)}
                disabled={activeIdx < 0 || activeIdx >= layers.length - 1}
                title={t('Pindah ke Bawah')}
              >
                <Icon name="chevronDown" className="w-3.5 h-3.5" />
              </button>
              <button type="button" className="tool-btn h-7 w-7 px-0 !text-[var(--danger-strong)]" onClick={askDeleteLayer} disabled={layers.length <= 1} title={t('Hapus Lapisan')}>
                <Icon name="trash" className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-[190px] overflow-y-auto py-0.5 pr-0.5">
              {layers.map((l, li) => {
                const isActive = l.id === activeId;
                return (
                  <div
                    key={l.id}
                    onClick={() => selectLayer(l.id)}
                    className={`group flex items-center gap-2 rounded-xl border px-2 py-1.5 cursor-pointer transition-colors select-none ${
                      isActive ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]' : 'border-transparent hover:bg-[var(--overlay)]'
                    }`}
                  >
                    <button
                      type="button"
                      className="shrink-0 h-6 w-6 grid place-items-center rounded-md text-[var(--text-3)] hover:text-[var(--text)]"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        toggleLayerVisible(l.id);
                      }}
                      title={l.visible ? t('Sembunyikan') : t('Tampilkan')}
                    >
                      <Icon name={l.visible ? 'eye' : 'eyeOff'} className="w-3.5 h-3.5" />
                    </button>
                    <span className="shrink-0 grid place-items-center h-4 px-1 rounded bg-[var(--overlay)] text-[var(--text-3)] text-[10px] font-bold tabular-nums">
                      {String(li + 1).padStart(2, '0')}
                    </span>
                    <span className={`min-w-0 truncate text-xs font-medium ${isActive ? 'text-[var(--text)]' : 'text-[var(--text-2)]'}`}>
                      {l.name}
                    </span>
                    {!l.visible && <span className="shrink-0 text-[10px] text-[var(--text-3)]">{t('Sembunyikan')}</span>}
                  </div>
                );
              })}
            </div>

            <div className="pt-0.5 px-1">
              <SliderRow
                label={t('Opacity')}
                value={activeLayer()?.opacity ?? 1}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => setLayerOpacity(activeId, v)}
                format={(v) => `${Math.round(v * 100)}%`}
              />
            </div>
          </section>
        </aside>
      </div>

      {textOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={t('Teks')}>
            <div className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm" onClick={() => setTextOpen(false)} />
            <div className="relative card p-6 w-full max-w-md border-[var(--border-2)] animate-scale-in">
              <h3 className="text-[15px] font-semibold text-[var(--text)] mb-1">{t('Teks')}</h3>
              <p className="text-sm text-[var(--text-2)] mb-4">{t('Klik kanvas untuk menulis teks.')}</p>
              <textarea
                className="input w-full h-24 resize-none"
                value={textStr}
                autoFocus
                placeholder={t('Ketik teks…')}
                onChange={(e) => setTextStr(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    addTextToLayer();
                  }
                }}
              />
              <div className="mt-3.5 space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-3)] mb-1.5">{t('Jenis Huruf')}</label>
                  <select className="input !py-1.5 !px-2 w-full" value={textFont} onChange={(e) => setTextFont(e.target.value)}>
                    {FONT_FAMILIES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <SliderRow label={t('Ukuran Teks')} value={textSize} min={8} max={200} step={1} onChange={setTextSize} format={(v) => `${Math.round(v)}px`} />
              </div>
              <div className="flex justify-end gap-2.5 mt-6">
                <button type="button" className="btn-secondary" onClick={() => setTextOpen(false)}>
                  {t('Batal')}
                </button>
                <button type="button" className="btn-primary" onClick={addTextToLayer} disabled={!textStr.trim()}>
                  {t('Terapkan')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      <ConfirmDialog
        open={confirm === 'newcanvas'}
        title={t('Buat Kanvas Baru?')}
        description={t('Gambar saat ini akan diganti.')}
        confirmLabel={t('Buat')}
        cancelLabel={t('Batal')}
        icon="sparkle"
        onConfirm={doNewCanvas}
        onClose={() => setConfirm('none')}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title={t('Hapus Lapisan?')}
        description={t('Lapisan "{name}" akan dihapus.', { name: delLayerName })}
        confirmLabel={t('Hapus')}
        cancelLabel={t('Batal')}
        tone="danger"
        icon="alert"
        onConfirm={doDeleteLayer}
        onClose={() => setConfirm('none')}
      />
    </div>
  );
}