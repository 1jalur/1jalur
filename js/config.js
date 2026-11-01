/* PENGATURAN APLIKASI. Diisi sekali oleh admin, lalu diunggah ke GitHub.
   Pengguna biasa tidak perlu tahu atau mengetik URL ini. */

// URL Web App dari Apps Script (Deploy > Kelola deployment). Harus berakhiran /exec
window.GAS_URL = 'https://script.google.com/macros/s/AKfycbzBAvV3RepYJKySWPNaLv9OzMMHO2B1P2LmQI1f8EpoHAeJj4Mu5j-i0ddt3Jg7SY_D/exec';

// Client ID OAuth dari Google Cloud Console, untuk tombol "Masuk dengan Google" khusus admin.
// Kosongkan jika belum dibuat (admin masih bisa masuk lewat kode pemilik di alamat #pemilik).
window.GOOGLE_CLIENT_ID = '';

// Hanya untuk tampilan. Pemeriksaan yang sebenarnya ada di Kode.gs (ADMIN_EMAIL).
window.ADMIN_EMAIL = '1jalurproduksi@gmail.com';
