import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import pngToIco from 'png-to-ico';

// --- Minimal PNG encoder (RGBA8) -------------------------------------------------------
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
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Minimal PNG decoder (bit depth 8, color types 0/2/3/6, non-interlaced) ------------
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePNG(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw new Error(`${file}: bukan file PNG`);
  }
  let off = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const palette = [];
  let trns = null;
  const idat = [];

  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') {
      for (let i = 0; i + 2 < len; i += 3) palette.push([data[i], data[i + 1], data[i + 2]]);
    } else if (type === 'tRNS') {
      trns = Array.from(data);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }

  if (bitDepth !== 8) throw new Error(`${file}: bit depth ${bitDepth} tidak didukung (harus 8)`);
  if (interlace !== 0) throw new Error(`${file}: PNG interlaced tidak didukung`);

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 3;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error(`${file}: data IDAT tidak lengkap`);

  const rows = [];
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const row = Buffer.alloc(stride);
    raw.copy(row, 0, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const prev = y === 0 ? null : rows[y - 1];
    if (f === 1) {
      for (let i = channels; i < stride; i++) row[i] = (row[i] + row[i - channels]) & 0xff;
    } else if (f === 2) {
      for (let i = 0; i < stride; i++) row[i] = (row[i] + prev[i]) & 0xff;
    } else if (f === 3) {
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? row[i - channels] : 0;
        const b = prev ? prev[i] : 0;
        row[i] = (row[i] + ((a + b) >> 1)) & 0xff;
      }
    } else if (f === 4) {
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? row[i - channels] : 0;
        const b = prev ? prev[i] : 0;
        const c = prev && i >= channels ? prev[i - channels] : 0;
        row[i] = (row[i] + paeth(a, b, c)) & 0xff;
      }
    } else if (f !== 0) {
      throw new Error(`${file}: filter ${f} tidak diketahui`);
    }
    rows.push(row);
  }

  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = rows[y];
    for (let x = 0; x < width; x++) {
      const si = x * channels;
      const di = (y * width + x) * 4;
      if (colorType === 6) {
        row.copy(out, di, si, si + 4);
      } else if (colorType === 2) {
        out[di] = row[si];
        out[di + 1] = row[si + 1];
        out[di + 2] = row[si + 2];
        out[di + 3] = 255;
      } else if (colorType === 0) {
        out[di] = out[di + 1] = out[di + 2] = row[si];
        out[di + 3] = 255;
      } else {
        const idx = row[si];
        const c = palette[idx] || [0, 0, 0];
        out[di] = c[0];
        out[di + 1] = c[1];
        out[di + 2] = c[2];
        out[di + 3] = trns && trns[idx] !== undefined ? trns[idx] : 255;
      }
    }
  }
  return { width, height, rgba: out };
}

// --- Area-averaging square center-crop + resize ----------------------------------------
function squareCropResize(src, size) {
  const side = Math.min(src.width, src.height);
  const ox = Math.floor((src.width - side) / 2);
  const oy = Math.floor((src.height - side) / 2);
  const out = Buffer.alloc(size * size * 4);
  const scale = side / size;
  for (let py = 0; py < size; py++) {
    const y0 = oy + Math.floor(py * scale);
    const y1 = oy + Math.max(Math.floor((py + 1) * scale), y0 + 1);
    for (let px = 0; px < size; px++) {
      const x0 = ox + Math.floor(px * scale);
      const x1 = ox + Math.max(Math.floor((px + 1) * scale), x0 + 1);
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * src.width + x) * 4;
          const aa = src.rgba[i + 3];
          r += src.rgba[i] * aa;
          g += src.rgba[i + 1] * aa;
          b += src.rgba[i + 2] * aa;
          a += aa;
          n++;
        }
      }
      const i = (py * size + px) * 4;
      if (a === 0) {
        out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0;
      } else {
        out[i] = Math.round(r / a);
        out[i + 1] = Math.round(g / a);
        out[i + 2] = Math.round(b / a);
        out[i + 3] = Math.round(a / n);
      }
    }
  }
  return out;
}

// --- Build -----------------------------------------------------------------------------
const srcFile = path.join(process.cwd(), 'scripts', 'helpyou-icon.png');
const outDir = path.join(process.cwd(), 'electron', 'assets');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(process.cwd(), 'build'), { recursive: true });

const src = decodePNG(srcFile);
console.log(`source: ${src.width}x${src.height}`);

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map((s) => ({
  size: s,
  buf: encodePNG(s, s, squareCropResize(src, s)),
}));

const master = encodePNG(512, 512, squareCropResize(src, 512));
fs.writeFileSync(path.join(process.cwd(), 'build', 'icon-512.png'), master);
fs.writeFileSync(path.join(outDir, 'icon-256.png'), pngs.find((p) => p.size === 256).buf);
const ico = await pngToIco(pngs.map((p) => p.buf));
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);

console.log(`icons written: electron/assets/icon.ico (${sizes.length} sizes), electron/assets/icon-256.png, build/icon-512.png`);