import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import pngToIco from 'png-to-ico';

// Minimal PNG encoder (RGBA8, no deps) --------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Vector-ish logo renderer (viewBox 0..64, matching public/favicon.svg) ------------------
const clamp = (v, a, b) => Math.max(a, Math.min(v, b));
const lerp = (a, b, t) => a + (b - a) * t;

function inRoundRect(x, y, l, t, r, b, rad) {
  if (x < l || x > r || y < t || y > b) return false;
  const cx = clamp(x, l + rad, r - rad);
  const cy = clamp(y, t + rad, b - rad);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= rad * rad;
}

function inCircle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function segDistance(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / len2;
  t = clamp(t, 0, 1);
  const px = ax + t * dx;
  const py = ay + t * dy;
  return Math.hypot(x - px, y - py);
}

const C_INDIGO = [99, 102, 241];
const C_FUCHSIA = [217, 70, 239];
const WHITE = [255, 255, 255];

function mix(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function gradientAt(x, y) {
  const t = clamp((y - 6) / 54 + (x - 8) / 38 * 0.18, 0, 1);
  return mix(C_INDIGO, C_FUCHSIA, t);
}

function colorAt(x, y) {
  if (!inRoundRect(x, y, 6, 8, 58, 56, 10)) return [0, 0, 0, 0];

  const grad = gradientAt(x, y);
  let c = [grad[0], grad[1], grad[2], 255];

  // top highlight panel
  if (inRoundRect(x, y, 10, 12, 54, 42, 6)) c = mix(c, WHITE, 0.14);

  // folder bars
  const rows = [
    [18, 10],
    [26, 16],
    [34, 22],
  ];
  for (const [ry, w] of rows) {
    if (inRoundRect(x, y, 16, ry, 20, ry + 4, 1)) {
      c = WHITE;
    } else if (inRoundRect(x, y, 24, ry, 24 + w, ry + 4, 1)) {
      c = mix(c, WHITE, 0.55);
    }
  }

  // magnifier: white ring with gradient cross
  if (inCircle(x, y, 46, 38, 8)) {
    const vert = segDistance(x, y, 46, 33, 46, 43);
    const horz = segDistance(x, y, 41, 38, 51, 38);
    if (vert <= 1.3 || horz <= 1.3) {
      c = [grad[0], grad[1], grad[2], 255];
    } else {
      c = WHITE;
    }
  }

  return c;
}

function render(size) {
  const SS = 4; // supersample factor
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (px + (sx + 0.5) / SS) / size * 64;
          const v = (py + (sy + 0.5) / SS) / size * 64;
          const col = colorAt(u, v);
          r += col[0];
          g += col[1];
          b += col[2];
          a += col[3];
        }
      }
      const n = SS * SS;
      const i = (py * size + px) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return encodePNG(size, size, rgba);
}

const outDir = path.join(process.cwd(), 'electron', 'assets');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(process.cwd(), 'build'), { recursive: true });

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map((s) => ({ size: s, buf: render(s) }));

// keep a 512 master too
const master = render(512);
fs.writeFileSync(path.join(path.join(process.cwd(), 'build'), 'icon-512.png'), master);

fs.writeFileSync(path.join(outDir, 'icon-256.png'), pngs.find((p) => p.size === 256).buf);
const ico = await pngToIco(pngs.map((p) => p.buf));
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);

console.log(`icons written: electron/assets/icon.ico (${sizes.length} sizes), build/icon-512.png`);