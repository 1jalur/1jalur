/* PENGATURAN APLIKASI. Diisi sekali oleh admin, lalu diunggah ke GitHub.
   Pengguna biasa tidak perlu tahu atau mengetik URL ini. */

// URL Web App dari Apps Script (Deploy > Kelola deployment). Harus berakhiran /exec
window.GAS_URL = 'https://script.google.com/macros/s/AKfycbz3D_kHUVRZFL-PNLe9RrsXPTvY7iBgFx0UH7yXOblDZaK7dFv-_Z65jPNHg6eiQLMI/exec';

// Client ID OAuth dari Google Cloud Console, untuk tombol "Masuk dengan Google" khusus admin.
// Kosongkan jika belum dibuat (admin masih bisa masuk lewat kode pemilik di alamat #pemilik).
window.GOOGLE_CLIENT_ID = '';

// Hanya untuk tampilan. Pemeriksaan yang sebenarnya ada di Kode.gs (ADMIN_EMAIL).
window.ADMIN_EMAIL = '1jalurproduksi@gmail.com';
