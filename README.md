# PRODUKSI (Manufactur)

Aplikasi manajemen produksi: timeline proyek, absensi tim (+ catatan kegiatan harian dan lembur), RAP awal/akhir,
stok gudang, belanja, operasional (SOP, surat jalan, QC, reimburse), dan investasi.
Data, akun pengguna, dan foto disimpan di **Google Drive** lewat Google Apps Script. Situs ini statis (tanpa build).

## Cara akses

| Siapa | Cara masuk | Hak |
|---|---|---|
| Pengguna biasa | Nama pengguna + kata sandi yang dibuat admin | **Hanya lihat** (bawaan). Admin boleh menjadikannya **Staf** (input dan edit data). |
| Admin | Tombol **Masuk dengan Google**, hanya akun `1jalurproduksi@gmail.com` | Semua hak: kelola pengguna, Google Drive, simpan data |
| Pemilik (darurat) | Buka `alamat-situs/#pemilik`, isi `TOKEN` dari Kode.gs | Setara admin. Dipakai jika login Google belum diatur atau bermasalah |

Pengguna tidak pernah mengetik URL server atau kode rahasia. Kata sandi diperiksa di server (Kode.gs), bukan di browser.
Hak akses dijaga di server: sesi Hanya lihat ditolak jika mencoba menyimpan, walau aplikasinya dimodifikasi.

## Struktur

```
index.html            Kerangka halaman dan urutan pemuatan file
css/                  base, layout, dashboard, components, gantt, pages, login, responsive (responsive.css harus terakhir)
img/                  Logo, favicon, foto latar login (login-bg.jpg)
js/
  config.js           URL server dan Client ID Google (diisi admin)
  core/               Data, penyimpanan, kolom, konstanta, router, registry halaman
  components/         Tabel, Gantt, folder, cetak, form material, kotak cari
  pages/              Satu file per halaman / fitur
  services/           drive-sync.js (sinkron), auth.js (login dan pengguna), viewer-mode.js, idb.js
  main.js             Titik mulai (dimuat terakhir)
gas/Kode.gs           Skrip Google Apps Script (ditempel di script.google.com)
```

Urutan `<script>` di `index.html` tidak boleh diubah sembarangan (semua file memakai fungsi global yang sama;
`core/registry.js` setelah semua `pages/`, `main.js` paling akhir).

## Pemasangan (sekali saja)

### 1. Apps Script
1. Buka script.google.com dengan akun **1jalurproduksi@gmail.com**, buat proyek, tempel isi `gas/Kode.gs`.
2. Ganti `TOKEN` (minimal 6 karakter, rahasia). `GOOGLE_CLIENT_ID` diisi pada langkah 2.
3. Jalankan fungsi **`pasang`** dan izinkan semua akses, termasuk "koneksi ke layanan eksternal" (untuk login Google).
   Akun lama (jika ada) otomatis dipindah ke server: admin lama menjadi **Staf**, pengguna lain tetap dengan kata sandi yang sama.
   Salinan pengaman data dibuat di folder Drive `Pengaman`.
4. **Deploy > Deployment baru > Aplikasi web**: Jalankan sebagai **Saya**, akses **Siapa saja**. Salin URL `/exec`.
   (Jika sudah ada deployment: **Kelola deployment > pensil > Versi baru**; URL tetap sama.)
5. Cek: `URL_WEB_APP?action=versi` harus menampilkan `"versi":"3.0.0-akun"`.

### 2. Login Google admin
1. Buka console.cloud.google.com dengan akun 1jalurproduksi@gmail.com, buat proyek baru.
2. **APIs & Services > OAuth consent screen** (atau *Google Auth Platform*): tipe **External**, isi nama aplikasi dan email.
   Jika statusnya *Testing*, tambahkan 1jalurproduksi@gmail.com sebagai **Test user**.
3. **Credentials > Create credentials > OAuth client ID > Web application**.
   Pada **Authorized JavaScript origins** tambahkan alamat situs, misalnya `https://1jalurpro.vercel.app`
   (tanpa garis miring di ujung; tambahkan juga alamat lain yang dipakai). Perubahan bisa butuh beberapa menit.
4. Salin **Client ID** (berakhiran `.apps.googleusercontent.com`) ke dua tempat:
   `GOOGLE_CLIENT_ID` di `gas/Kode.gs` (lalu terbitkan ulang versi baru) dan `window.GOOGLE_CLIENT_ID` di `js/config.js`.

### 3. Situs
Isi `js/config.js` (`window.GAS_URL` = URL `/exec`, `window.GOOGLE_CLIENT_ID`), unggah ke GitHub, tunggu deploy,
lalu **Ctrl+F5**. Setelah mengubah CSS/JS, naikkan nomor versi: `sed -i 's/?v=1.0.5/?v=1.0.6/g' index.html`.

## Mengelola pengguna
Masuk sebagai admin > **Pengguna**: tambah akun (otomatis Hanya lihat), ubah peran (Hanya lihat / Staf), ubah kata sandi,
hapus. Lupa kata sandi pengguna: admin cukup **Ubah sandi**. Pengguna bisa mengganti sandinya sendiri (tombol **Ganti sandi**).
Salah kata sandi 5 kali mengunci akun itu 10 menit.

## Jika admin terkunci
Buka `alamat-situs/#pemilik` dan masukkan `TOKEN`. Untuk mengeluarkan semua orang yang sedang login, jalankan
fungsi `resetSemuaSesi` di Apps Script. Jika `TOKEN` bocor, ganti dan terbitkan ulang.

## Menjalankan di komputer
```bash
python3 -m http.server 8080   # lalu buka http://localhost:8080
```

## Keamanan
- Jangan commit `TOKEN` yang asli ke GitHub; isi hanya di Apps Script. `GAS_URL` dan Client ID boleh ada di repo
  (keduanya tidak memberi akses tanpa login).
- Jangan commit file ekspor data (`.json`, `.xlsx`); `.gitignore` sudah memblokirnya.
- Semua pengguna yang login (termasuk Hanya lihat) dapat membaca seluruh data produksi. Itu disengaja.
