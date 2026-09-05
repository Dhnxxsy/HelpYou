# ✨ HelpYou

Tools lokal (web) untuk merapikan folder & file di PC menjadi struktur yang rapi dan terstruktur. Bekerja **100% offline / local** — tidak ada file yang dikirim ke internet.

## Fitur

- 🧭 **Pilih Disk/Folder** — pilih drive (C:, D:, dst.) atau navigasi ke folder mana pun, atau ketik path manual.
- ⚡ **Scan & Analisis Cepat** — memindai seluruh isi folder (rekursif, stat paralel) dengan progress real-time.
- 🗂️ **Sortir Otomatis per Jenis** — Video, Gambar, Audio, Dokumen, Arsip, Program, Kode, Desain, Buku, Font, Data, Virtual, Image Disk, Torrent, Lainnya.
- 📊 **Sub-sortir per Ukuran** — `<100KB`, `100KB–1MB`, `1–10MB`, `10–100MB`, `≥100MB`.
- 🧬 **Deteksi File Duplikat** — temukan file kembar berdasarkan isi (hash), dengan perkiraan ruang yang bisa dihemat; duplikat dipindahkan ke `_TerSortir\Duplikat` (bisa di-Undo).
- 🗑️ **Hapus Folder Kosong** — deteksi folder kosong sekarang + folder yang akan kosong setelah sortir (dengan verifikasi ulang otomatis).
- 🏋️ **File Terbesar** — daftar 25 file terbesar untuk menemukan barang "gemuk" yang menyita disk.
- 🔍 **Pencarian & Filter** — cari dan saring rencana sortir berdasarkan nama/ekstensi/kategori.
- ⬇️ **Ekspor CSV** — unduh rekap rencana sortir (Excel-compatible).
- ⚙️ **Pengaturan Scan** — lewati folder tertentu, batas kedalaman, ukuran min, dan toggle deteksi duplikat (disimpan otomatis).
- ⏹️ **Batal Scan** — hentikan pemindaian kapan saja.
- 🧪 **Mode Simulasi** — lihat rencana pemindahan tanpa mengubah apa pun.
- 🚀 **Mode Nyata** — pindahkan file ke struktur rapi: `_TerSortir/<Jenis>/<Ukuran>/`.
- 🖱️ **Buka Folder** — buka folder hasil langsung di Windows Explorer.
- ↩️ **Undo / Riwayat** — kembalikan pemindahan kapan saja.

## Cara Menjalankan

> Butuh Node.js 18+.

### Mode Development (disarankan saat mengembangkan)

```
npm install
npm run dev
```

- Backend: http://localhost:3010
- Frontend (Vite): http://localhost:5510 → buka **http://localhost:5510** di browser

### Mode Production

```
npm run build
npm start
```

- Buka **http://localhost:3010**

## Cara Pakai

1. Buka app, pilih folder/drive yang ingin dirapikan (atau ketik path).
2. (Opsional) atur pengambilan scan: lewati folder, kedalaman, ukuran min, deteksi duplikat.
3. Klik **Scan & Analisis Folder** → tunggu progres pemindaian (bisa **Batal**).
4. Tinjau hasil via tab:
   - **Rencana** — rincian per kategori + daftar perpindahan (bisa cari/ekspor CSV).
   - **Duplikat** — grup file kembar, pilih yang mau dipindahkan → **Pindahkan N duplikat**.
   - **Folder Kosong** — folder yang sudah kosong (bisa langsung dihapus) + yang akan kosong setelah sortir.
   - **File Terbesar** — 25 file paling besar.
5. Klik **Simulasikan sortir** dulu (tidak mengubah file).
6. Jika sudah yakin, klik **Pindahkan N file** (mode nyata).
7. Setelah sortir: klik **Buka Folder Hasil**, atau **Scan Ulang** untuk menghapus folder kosong.
8. Untuk mengembalikan, buka tab **Riwayat** → **Undo**.

## Struktur Hasil Sortir

Semua file dipindahkan ke folder baru bernama `_TerSortir` di dalam folder yang dipilih:

```
Kamu Pilih: D:\Downloads
  └─ _TerSortir/
      ├─ Video/
      │   ├─ 10-100MB/  (video ukuran sedang)
      │   └─ Lebih-100MB/  (video besar)
      ├─ Gambar/
      │   ├─ Di-bawah-100KB/
      │   └─ 1-10MB/
      ├─ Dokumen/...
      ├─ Audio/...
      └─ ...
```

File dengan nama sama otomatis diberi akhiran `(1)`, `(2)`, dst. agar tidak tertimpa.

## Keamanan

- Semua proses **di mesin lokal sendiri** (Node.js), tidak ada data keluar.
- File **tidak pernah diubah isinya** — hanya dipindahkan lokasinya.
- Diperlukan **mode Simulasi** untuk meninjau sebelum pemindahan nyata.
- Folder sistem (Windows, Program Files, AppData, node_modules, dsb.) otomatis dilewati saat scan.
- Penghapusan folder kosong selalu **diverifikasi ulang** di sisi server — folder yang masih berisi item tidak akan dihapus.
- Semua pemindahan (termasuk duplikat) tercatat & bisa **di-Undo**. Pengaturan scan tersimpan lokal di `.file-organizer/settings.json`.

## Perintah Lain

| Perintah | Fungsi |
|----------|--------|
| `npm run build:server` | Compile server (tsc) |
| `npm run build:client` | Build frontend (vite) |
| `npm run test` | Jalankan unit test (vitest) |
| `npm run typecheck` | Cek type error |