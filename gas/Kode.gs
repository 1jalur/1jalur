/**
 * KODE.GS v3 — PRODUKSI: akun, sesi, dan data di Google Drive
 *
 * Cara kerja akses:
 *  - Pengguna biasa masuk hanya dengan NAMA PENGGUNA + KATA SANDI. Kata sandi diperiksa di sini
 *    (server), bukan di browser. Akun dan kata sandi HANYA dibuat/diubah admin; bawaan "Hanya lihat".
 *  - ADMIN hanya bisa masuk dengan akun Google ADMIN_EMAIL (tombol "Masuk dengan Google").
 *  - TOKEN adalah kunci darurat PEMILIK. Tidak pernah tampil di layar login biasa.
 *  - Browser tidak pernah menyimpan kode rahasia: hanya sesi sementara (12 jam).
 *
 * Data: folder Drive "PRODUKSI - Data Aplikasi" berisi produksi_data.json, produksi_users.json,
 * Foto Reimburse/, Backup Harian/, Pengaman/ dan laporan Google Sheet (baca saja).
 *
 * PASANG PERTAMA KALI
 *  1. script.google.com > Proyek baru > tempel seluruh kode ini.
 *  2. Ganti TOKEN (minimal 6 karakter). Isi GOOGLE_CLIENT_ID (lihat README, bagian "Login Google admin").
 *  3. Jalankan fungsi "pasang" dan izinkan semua akses (Drive, Sheets, dan koneksi eksternal).
 *  4. Deploy > Deployment baru > Aplikasi web: Jalankan sebagai "Saya", akses "Siapa saja".
 *  5. Salin URL /exec ke js/config.js (window.GAS_URL) lalu unggah ke GitHub.
 *
 * MEMPERBARUI KODE: simpan, lalu Deploy > Kelola deployment > ikon pensil > Versi baru > Deploy.
 * CEK VERSI: URL_WEB_APP?action=versi
 */

const VERSI = '3.0.3-akun';
var LOCK_HELD_ = false;   // true saat eksekusi ini sudah memegang kunci skrip (kunci tidak boleh diminta dua kali)

const ADMIN_EMAIL = '1jalurproduksi@gmail.com';   // satu-satunya akun Google yang boleh jadi admin
const GOOGLE_CLIENT_ID = '';                       // contoh: 1234567890-abc.apps.googleusercontent.com
const TOKEN = 'GANTI_DENGAN_KODE_RAHASIA';         // kunci darurat pemilik (jangan dibagikan)

const FOLDER_NAME = 'PRODUKSI - Data Aplikasi';
const FILE_NAME = 'produksi_data.json';
const USERS_FILE = 'produksi_users.json';
const KEEP_BACKUPS = 30;
const KEEP_PENGAMAN = 10;
const WRITE_SHEETS = true;
const SHEET_NAME = 'PRODUKSI - Laporan (baca saja)';
const SHEET_ID = '';                // isi ID spreadsheet lama jika ingin dipakai; kosong = dibuat otomatis
const SKIP_KEYS = ['USERS'];

const SESI_JAM = 12;                // lama sesi login
const MAX_GAGAL = 5;                // salah kata sandi per akun sebelum dikunci
const MAX_GAGAL_GLOBAL = 60;        // total percobaan gagal sebelum semua login dikunci sementara
const KUNCI_DETIK = 600;            // lama kunci (10 menit)
const BELUM_DIATUR_ = ['GANTI_DENGAN_KODE_RAHASIA', ''];
const RESERVED_ = ['admin', 'pemilik'];

/* ================= Pintu masuk ================= */

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const a = p.action || 'ping';
    if (a === 'versi') return out_({ ok: true, versi: VERSI, siap: siap_(), google: !!GOOGLE_CLIENT_ID });
    if (!siap_()) return out_(gagal_('Kode.gs belum diatur: ganti TOKEN lalu terbitkan ulang.'));
    const me = who_(p);
    if (!me) return out_(sesiHabis_());
    const sp = props_();

    if (a === 'ping') {
      if (me.r !== 'admin') return out_({ ok: true, main: false, versi: VERSI, u: me.u, r: me.r });
      const f = folder_();
      let su = '';
      if (WRITE_SHEETS) { try { su = sheet_().getUrl(); } catch (x) {} }
      return out_({ ok: true, main: true, versi: VERSI, u: me.u, r: me.r, nama: f.getName(), folderUrl: f.getUrl(), sheetUrl: su });
    }
    if (a === 'info') {
      const ts = +sp.getProperty('ts') || 0;
      return out_({ ok: true, versi: VERSI, ts: ts, edited: ts, r: me.r,
        err: sp.getProperty('err') || '', errTs: +sp.getProperty('errTs') || 0 });
    }
    if (a === 'load') {
      migrasi_();
      const txt = dataFile_().getBlob().getDataAsString();
      if (!txt || txt === '{}') return out_(gagal_('Belum ada data di Drive. Kirim dulu dari aplikasi.'));
      const o = JSON.parse(txt);
      delete o.USERS;
      return out_({ ok: true, data: o, ts: +sp.getProperty('ts') || 0 });
    }
    if (a === 'fotos') return out_({ ok: true, fotos: readFotos_(p.id) });
    if (a === 'users') {
      if (me.r !== 'admin') return out_(gagal_('Hanya admin.'));
      return out_({ ok: true, users: users_().map(x => ({ u: x.u, r: x.r })).sort((x, y) => x.u.localeCompare(y.u)) });
    }
    return out_(gagal_('Aksi tidak dikenal'));
  } catch (err) {
    return out_(gagal_(err));
  }
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (x) { return out_(gagal_('Data tidak terbaca')); }
  const a = b.action || (b.data ? 'simpan' : '');
  try {
    if (!siap_()) return out_(gagal_('Kode.gs belum diatur: ganti TOKEN lalu terbitkan ulang.'));
    if (a === 'login') return out_(login_(b.u, b.p));
    if (a === 'loginGoogle') return out_(loginGoogle_(b.credential));
    if (a === 'loginOwner') return out_(loginOwner_(b.token));
    if (a === 'logout') {
      if (/^[a-f0-9]{40,80}$/.test(String(b.sid || ''))) props_().deleteProperty('S_' + b.sid);
      return out_({ ok: true });
    }
    const me = who_(b);
    if (!me) {
      if (a === 'simpan') catatErr_('Sesi berakhir. Silakan masuk lagi.', b.ts);
      return out_(sesiHabis_());
    }
    const lock = LockService.getScriptLock();
    try { lock.waitLock(30000); }
    catch (x) {
      const m = 'Server sedang sibuk menyimpan data lain. Coba lagi sebentar lagi.';
      if (a === 'simpan') catatErr_(m, b.ts);
      return out_(gagal_(m));
    }
    LOCK_HELD_ = true;
    try { return out_(aksiTulis_(a, b, me)); }
    finally { LOCK_HELD_ = false; try { lock.releaseLock(); } catch (x) {} }
  } catch (err) {
    if (a === 'simpan') catatErr_(String(err && err.message || err), b.ts);
    return out_(gagal_(err));
  }
}

function aksiTulis_(a, b, me) {
  const boleh = me.r === 'admin' || me.r === 'staff';
  if (a === 'simpan') {
    if (!boleh) throw new Error('Akun Hanya lihat tidak boleh menyimpan data.');
    if (!b.data || typeof b.data !== 'object') throw new Error('Data kosong');
    migrasi_();
    delete b.data.USERS;                      // akun dikelola server, tidak lewat data aplikasi
    const sp = props_(), file = dataFile_();
    const lama = file.getBlob().getDataAsString();
    const baru = JSON.stringify(b.data);
    jagaTimpa_(lama, baru);
    file.setContent(baru);
    sp.setProperty('ts', String(b.ts || Date.now()));
    sp.deleteProperty('err');
    try { if (WRITE_SHEETS) writeSheets_(b.data); sp.deleteProperty('sheetErr'); }
    catch (se) { sp.setProperty('sheetErr', String(se)); }
    return { ok: true };
  }
  if (a === 'fotos') { if (!boleh) throw new Error('Akun Hanya lihat tidak boleh mengunggah.'); return { ok: true, n: saveFotos_(b.id, b.fotos || []) }; }
  if (a === 'delfotos') { if (!boleh) throw new Error('Akun Hanya lihat tidak boleh menghapus.'); delFotos_(b.id); return { ok: true }; }
  if (a === 'chpass') return gagal_('Hanya admin yang boleh mengubah kata sandi anggota.');
  if (me.r !== 'admin') return gagal_('Hanya admin.');
  if (a === 'adduser') return adduser_(b);
  if (a === 'deluser') return deluser_(b);
  if (a === 'setrole') return setrole_(b);
  if (a === 'setpass') return setpass_(b);
  return gagal_('Aksi tidak dikenal');
}

/* ================= Hasil & sesi ================= */

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function gagal_(m) { return { ok: false, error: String(m && m.message || m) }; }
function sesiHabis_() { return { ok: false, kode: 'sesi', error: 'Sesi berakhir. Silakan masuk lagi.' }; }
function props_() { return PropertiesService.getScriptProperties(); }
function catatErr_(m, ts) { const sp = props_(); sp.setProperty('err', String(m)); sp.setProperty('errTs', String(ts || Date.now())); }

function siap_() { return BELUM_DIATUR_.indexOf(TOKEN) < 0 && TOKEN.length >= 6; }
function pemilik_(t) { return siap_() && String(t || '') === TOKEN; }
function who_(p) { return pemilik_(p.token) ? { u: 'pemilik', r: 'admin' } : sesi_(p.sid); }

function sesiBuat_(u, r) {
  const sp = props_();
  bersihSesi_();
  const sid = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const e = Date.now() + SESI_JAM * 36e5;
  sp.setProperty('S_' + sid, JSON.stringify({ u: u, r: r, e: e }));
  return { ok: true, sid: sid, u: u, r: r, exp: e };
}
function sesi_(sid) {
  sid = String(sid || '');
  if (!/^[a-f0-9]{40,80}$/.test(sid)) return null;
  const sp = props_(), v = sp.getProperty('S_' + sid);
  if (!v) return null;
  let o;
  try { o = JSON.parse(v); } catch (x) { return null; }
  if (!o || o.e < Date.now()) { sp.deleteProperty('S_' + sid); return null; }
  return o;
}
function bersihSesi_() {
  const sp = props_(), all = sp.getProperties(), now = Date.now(), live = [];
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('S_') !== 0) return;
    try { const o = JSON.parse(all[k]); if (!o || o.e < now) sp.deleteProperty(k); else live.push([k, o.e]); }
    catch (x) { sp.deleteProperty(k); }
  });
  if (live.length > 200) { live.sort((a, b) => a[1] - b[1]); live.slice(0, live.length - 200).forEach(x => sp.deleteProperty(x[0])); }
}
function cabutSesi_(u) {
  const sp = props_(), all = sp.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('S_') !== 0) return;
    try { if (JSON.parse(all[k]).u === u) sp.deleteProperty(k); } catch (x) {}
  });
}

/* ================= Pembatasan percobaan masuk ================= */

function terkunci_(key, max) { return +(CacheService.getScriptCache().get('F_' + key) || 0) >= max; }
function catatGagal_(key) { const c = CacheService.getScriptCache(), k = 'F_' + key; c.put(k, String((+c.get(k) || 0) + 1), KUNCI_DETIK); }
function bersihGagal_(key) { CacheService.getScriptCache().remove('F_' + key); }
const PESAN_KUNCI_ = 'Terlalu banyak percobaan. Coba lagi dalam 10 menit.';

/* ================= Login ================= */

function login_(u, p) {
  u = String(u || '').trim().toLowerCase();
  p = String(p || '');
  if (!u || !p) return gagal_('Isi nama pengguna dan kata sandi.');
  if (terkunci_('u:' + u, MAX_GAGAL) || terkunci_('GLOBAL', MAX_GAGAL_GLOBAL)) return gagal_(PESAN_KUNCI_);
  const arr = users_(), x = arr.find(a => a.u === u);
  let ok = false;
  if (x) {
    if (x.lama) { ok = cocokLama_(p, x); if (ok) upgradeHash_(u, p); }
    else ok = sama_(hash_(p, x.s), x.h);
  } else { hash_(p, 'x'); }
  if (!ok) { catatGagal_('u:' + u); catatGagal_('GLOBAL'); return gagal_('Nama pengguna atau kata sandi salah.'); }
  bersihGagal_('u:' + u);
  return sesiBuat_(x.u, x.r);
}

function loginGoogle_(cred) {
  if (!GOOGLE_CLIENT_ID) return gagal_('Login Google belum diatur di Kode.gs (GOOGLE_CLIENT_ID).');
  if (terkunci_('GLOBAL', MAX_GAGAL_GLOBAL)) return gagal_(PESAN_KUNCI_);
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(String(cred || '')), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) { catatGagal_('GLOBAL'); return gagal_('Token Google tidak valid. Coba masuk lagi.'); }
  const t = JSON.parse(r.getContentText());
  const iss = ['accounts.google.com', 'https://accounts.google.com'];
  if (t.aud !== GOOGLE_CLIENT_ID || iss.indexOf(t.iss) < 0 || String(t.email_verified) !== 'true' || +t.exp * 1000 < Date.now()) {
    catatGagal_('GLOBAL'); return gagal_('Token Google ditolak.');
  }
  if (String(t.email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    catatGagal_('GLOBAL');
    return gagal_('Akun Google ini bukan admin. Masuk dengan nama pengguna dan kata sandi dari admin.');
  }
  return sesiBuat_('admin', 'admin');
}

function loginOwner_(token) {
  if (terkunci_('GLOBAL', MAX_GAGAL_GLOBAL) || terkunci_('owner', MAX_GAGAL)) return gagal_(PESAN_KUNCI_);
  if (!pemilik_(token)) { catatGagal_('owner'); catatGagal_('GLOBAL'); return gagal_('Kode pemilik salah.'); }
  bersihGagal_('owner');
  return sesiBuat_('pemilik', 'admin');
}

/* ================= Akun pengguna ================= */

function hex_(bytes) { return bytes.map(b => ('0' + ((b < 0 ? b + 256 : b).toString(16))).slice(-2)).join(''); }
function pepper_() {
  const sp = props_();
  let p = sp.getProperty('PEPPER');
  if (!p) { p = Utilities.getUuid() + Utilities.getUuid(); sp.setProperty('PEPPER', p); }
  return p;
}
function hash_(pw, salt) { return hex_(Utilities.computeHmacSha256Signature(salt + '|' + pw, pepper_())); }
function hashLama_(pw, salt) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pw, Utilities.Charset.UTF_8)); }
function hashDjb_(pw, salt) {
  let h = 5381;
  Array.from(salt + '|' + pw).forEach(function (c) { h = (((h << 5) + h + c.charCodeAt(0)) >>> 0); });
  return 'x' + h.toString(16);
}
// Akun lama: SHA-256 dari "garam|sandi"; cadangan 'x...' dibuat aplikasi lama bila browser tanpa crypto.subtle
function cocokLama_(pw, x) {
  return sama_(hashLama_(pw, x.s), x.h) || (String(x.h).charAt(0) === 'x' && sama_(hashDjb_(pw, x.s), x.h));
}
function salt_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 16); }
function sama_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function usersFile_() {
  const f = folder_(), it = f.getFilesByName(USERS_FILE);
  return it.hasNext() ? it.next() : f.createFile(USERS_FILE, '[]', MimeType.PLAIN_TEXT);
}
function users_() {
  migrasi_();
  try { const a = JSON.parse(usersFile_().getBlob().getDataAsString()); return Array.isArray(a) ? a : []; }
  catch (x) { return []; }
}
function simpanUsers_(a) { usersFile_().setContent(JSON.stringify(a)); }

// Pindahkan akun lama (di dalam data aplikasi) ke file akun server. Admin lama menjadi Staf.
function migrasi_() {
  const sp = props_();
  if (sp.getProperty('USERS_MIG') === '1') return;
  const lock = LockService.getScriptLock();
  let got = false;
  if (!LOCK_HELD_) { try { lock.waitLock(10000); got = true; } catch (x) {} }
  try {
    if (sp.getProperty('USERS_MIG') === '1') return;
    const f = dataFile_(), txt = f.getBlob().getDataAsString();
    let o = null;
    try { o = JSON.parse(txt); } catch (x) {}
    const uf = usersFile_();
    let cur = [];
    try { cur = JSON.parse(uf.getBlob().getDataAsString()); } catch (x) {}
    if (o && Array.isArray(o.USERS) && o.USERS.length && !cur.length) {
      simpanPengaman_(txt, 'sebelum_migrasi');
      uf.setContent(JSON.stringify(o.USERS.filter(x => x && x.u && x.s && x.h)
        .map(x => ({ u: String(x.u).toLowerCase(), s: x.s, h: x.h, r: x.r === 'viewer' ? 'viewer' : 'staff', lama: 1 }))));
    }
    if (o && 'USERS' in o) { delete o.USERS; f.setContent(JSON.stringify(o)); }
    sp.setProperty('USERS_MIG', '1');
  } finally { if (got) { try { lock.releaseLock(); } catch (x) {} } }
}
function upgradeHash_(u, p) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return;
  LOCK_HELD_ = true;
  try {
    const arr = users_(), x = arr.find(a => a.u === u);
    if (x && x.lama) { x.h = hash_(p, x.s); delete x.lama; simpanUsers_(arr); }
  } finally { LOCK_HELD_ = false; try { lock.releaseLock(); } catch (e) {} }
}

function adduser_(b) {
  const u = String(b.u || '').trim().toLowerCase(), p = String(b.p || '');
  if (b.r === 'admin') return gagal_('Admin hanya untuk akun Google ' + ADMIN_EMAIL + '.');
  const r = b.r === 'staff' ? 'staff' : 'viewer';
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) return gagal_('Nama pengguna minimal 3 karakter (huruf kecil, angka, titik, strip).');
  if (RESERVED_.indexOf(u) >= 0) return gagal_('Nama ini tidak boleh dipakai.');
  if (p.length < 6) return gagal_('Kata sandi minimal 6 karakter.');
  const arr = users_();
  if (arr.some(x => x.u === u)) return gagal_('Nama pengguna sudah dipakai.');
  const s = salt_();
  arr.push({ u: u, s: s, h: hash_(p, s), r: r });
  simpanUsers_(arr);
  return { ok: true };
}
function deluser_(b) {
  const u = String(b.u || '').toLowerCase(), arr = users_(), n = arr.filter(x => x.u !== u);
  if (n.length === arr.length) return gagal_('Pengguna tidak ditemukan.');
  simpanUsers_(n); cabutSesi_(u);
  return { ok: true };
}
function setrole_(b) {
  if (b.r === 'admin') return gagal_('Admin hanya untuk akun Google ' + ADMIN_EMAIL + '.');
  if (b.r !== 'staff' && b.r !== 'viewer') return gagal_('Peran tidak dikenal.');
  const u = String(b.u || '').toLowerCase(), arr = users_(), x = arr.find(a => a.u === u);
  if (!x) return gagal_('Pengguna tidak ditemukan.');
  x.r = b.r; simpanUsers_(arr); cabutSesi_(u);
  return { ok: true };
}
function setpass_(b) {
  const u = String(b.u || '').toLowerCase(), p = String(b.p || '');
  if (p.length < 6) return gagal_('Kata sandi minimal 6 karakter.');
  const arr = users_(), x = arr.find(a => a.u === u);
  if (!x) return gagal_('Pengguna tidak ditemukan.');
  x.s = salt_(); x.h = hash_(p, x.s); delete x.lama; simpanUsers_(arr); cabutSesi_(u);
  return { ok: true };
}
/* ================= Drive: folder & data ================= */

function folder_() {
  const sp = props_(), id = sp.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  const f = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
  sp.setProperty('FOLDER_ID', f.getId());
  return f;
}
function sub_(parent, name) { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }
function dataFile_() {
  const f = folder_(), it = f.getFilesByName(FILE_NAME);
  return it.hasNext() ? it.next() : f.createFile(FILE_NAME, '{}', MimeType.PLAIN_TEXT);
}
const safeId_ = id => String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');

/* ---------- Pengaman penimpaan data ---------- */
function jagaTimpa_(lama, baru) {
  if (!lama || lama === '{}') return;
  if (lama.length > 2000 && baru.length < lama.length * 0.5) simpanPengaman_(lama, 'menyusut');
}
function simpanPengaman_(isi, label) {
  const pf = sub_(folder_(), 'Pengaman'), tz = Session.getScriptTimeZone();
  const nm = 'pengaman_' + (label || 'data') + '_' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd_HHmmss') + '.json';
  pf.createFile(nm, isi, MimeType.PLAIN_TEXT);
  const all = [], it = pf.getFiles();
  while (it.hasNext()) all.push(it.next());
  all.sort((a, b) => b.getName().localeCompare(a.getName()));
  all.slice(KEEP_PENGAMAN).forEach(f => f.setTrashed(true));
}

/* ---------- Foto reimburse ---------- */
function fotoFolder_(id, create) {
  const sid = safeId_(id);
  if (!sid) throw new Error('ID foto kosong');
  const root = sub_(folder_(), 'Foto Reimburse'), it = root.getFoldersByName(sid);
  if (it.hasNext()) return it.next();
  return create ? root.createFolder(sid) : null;
}
function saveFotos_(id, fotos) {
  const f = fotoFolder_(id, true), old = f.getFiles();
  while (old.hasNext()) old.next().setTrashed(true);
  let n = 0;
  fotos.forEach(function (d, i) {
    const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(String(d));
    if (!m) return;
    f.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], 'foto_' + String(i + 1).padStart(2, '0') + '.jpg'));
    n++;
  });
  return n;
}
function readFotos_(id) {
  const f = fotoFolder_(id, false);
  if (!f) return [];
  const arr = [], it = f.getFiles();
  while (it.hasNext()) arr.push(it.next());
  arr.sort((a, b) => a.getName().localeCompare(b.getName()));
  return arr.map(function (x) {
    const bl = x.getBlob();
    return 'data:' + bl.getContentType() + ';base64,' + Utilities.base64Encode(bl.getBytes());
  });
}
function delFotos_(id) { const f = fotoFolder_(id, false); if (f) f.setTrashed(true); }

/* ---------- Laporan Google Sheet (baca saja) ---------- */
function sheet_() {
  const sp = props_(), id = SHEET_ID || sp.getProperty('SHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  const ss = SpreadsheetApp.create(SHEET_NAME);
  DriveApp.getFileById(ss.getId()).moveTo(folder_());
  sp.setProperty('SHEET_ID', ss.getId());
  return ss;
}
function cellVal_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') v = JSON.stringify(v);
  v = String(v);
  return v.length > 40000 ? v.slice(0, 40000) : v;
}
function writeSheets_(data) {
  const ss = sheet_();
  Object.keys(data).forEach(function (k) {
    if (SKIP_KEYS.indexOf(k) >= 0) return;
    const rows = data[k];
    if (!Array.isArray(rows) || !rows.length || typeof rows[0] !== 'object') return;
    const cols = [];
    rows.forEach(r => Object.keys(r || {}).forEach(c => { if (cols.indexOf(c) < 0) cols.push(c); }));
    const values = [cols].concat(rows.map(r => cols.map(c => cellVal_((r || {})[c]))));
    let sh = ss.getSheetByName(k);
    if (!sh) sh = ss.insertSheet(k);
    sh.clearContents();
    sh.getRange(1, 1, values.length, cols.length).setValues(values);
    sh.setFrozenRows(1);
  });
  const first = ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 1) ss.deleteSheet(first);
}

/* ---------- Backup harian ---------- */
function backupHarian() {
  const bf = sub_(folder_(), 'Backup Harian'), tz = Session.getScriptTimeZone();
  const nm = 'produksi_' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd') + '.json';
  const old = bf.getFilesByName(nm);
  while (old.hasNext()) old.next().setTrashed(true);
  bf.createFile(nm, dataFile_().getBlob().getDataAsString(), MimeType.PLAIN_TEXT);
  const all = [], it = bf.getFiles();
  while (it.hasNext()) all.push(it.next());
  all.sort((a, b) => b.getName().localeCompare(a.getName()));
  all.slice(KEEP_BACKUPS).forEach(f => f.setTrashed(true));
}

/* ================= Dijalankan manual dari editor ================= */

function pasang() {
  if (!siap_()) throw new Error('Ganti TOKEN di bagian atas Kode.gs dulu (minimal 6 karakter), lalu jalankan lagi.');
  const f = folder_();
  dataFile_();
  users_();                                   // memindahkan akun lama (jika ada) ke server
  if (WRITE_SHEETS) sheet_();
  try { UrlFetchApp.fetch('https://www.google.com/generate_204', { muteHttpExceptions: true }); } catch (e) {}  // meminta izin koneksi (untuk login Google)
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupHarian') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupHarian').timeBased().everyDays(1).atHour(1).create();
  Logger.log('Versi kode      : ' + VERSI);
  Logger.log('Folder Drive    : ' + f.getUrl());
  Logger.log('Login Google    : ' + (GOOGLE_CLIENT_ID ? 'aktif untuk ' + ADMIN_EMAIL : 'BELUM diatur (isi GOOGLE_CLIENT_ID)'));
  Logger.log('Jumlah pengguna : ' + users_().length);
  Logger.log('Siap. Deploy > Deployment baru > Aplikasi web (akses: Siapa saja).');
}

function cek() {
  Logger.log('Versi kode        : ' + VERSI);
  Logger.log('TOKEN diatur      : ' + siap_());
  Logger.log('Login Google      : ' + (GOOGLE_CLIENT_ID ? 'aktif untuk ' + ADMIN_EMAIL : 'belum diatur'));
  Logger.log('Folder Drive      : ' + folder_().getUrl());
  Logger.log('Jumlah pengguna   : ' + users_().length);
  const t = props_().getProperty('ts');
  Logger.log('Simpan terakhir   : ' + (t ? new Date(+t).toString() : 'belum pernah'));
  Logger.log('Galat terakhir    : ' + (props_().getProperty('err') || '-'));
}

// Darurat: keluarkan semua orang yang sedang login (jalankan dari editor).
function resetSemuaSesi() {
  const sp = props_(), all = sp.getProperties();
  Object.keys(all).forEach(k => { if (k.indexOf('S_') === 0) sp.deleteProperty(k); });
  bukaKunci();
}

// Membuka kunci "terlalu banyak percobaan" untuk semua akun (jalankan dari editor).
function bukaKunci() {
  CacheService.getScriptCache().removeAll(['F_GLOBAL', 'F_owner'].concat(users_().map(x => 'F_u:' + x.u)));
  Logger.log('Kunci percobaan masuk dibuka untuk semua akun.');
}

// Melihat daftar akun (tanpa kata sandi) di Log eksekusi.
function daftarAkun() {
  const a = users_();
  Logger.log('Jumlah akun: ' + a.length);
  a.forEach(x => Logger.log('  ' + x.u + '  (' + (x.r === 'staff' ? 'Staf' : 'Hanya lihat') + ')' + (x.lama ? '  [masih sandi lama]' : '')));
  Logger.log('Admin = akun Google ' + ADMIN_EMAIL + ' atau kode pemilik di alamat-situs/#pemilik');
}

// DARURAT: atur kata sandi sebuah akun (atau buat akun baru) tanpa lewat aplikasi.
// Cara: isi NAMA dan SANDI_BARU di bawah, pilih fungsi "aturSandi", klik Jalankan, lalu KOSONGKAN lagi SANDI_BARU.
function aturSandi() {
  const NAMA = 'endo';       // nama pengguna (huruf kecil)
  const SANDI_BARU = '';     // isi kata sandi baru (minimal 6 karakter)
  const PERAN = 'staff';     // 'staff' atau 'viewer' (hanya dipakai jika akun belum ada)
  const u = String(NAMA).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(u) || RESERVED_.indexOf(u) >= 0) throw new Error('NAMA tidak valid.');
  if (String(SANDI_BARU).length < 6) throw new Error('Isi SANDI_BARU (minimal 6 karakter) lalu jalankan lagi.');
  const arr = users_();
  let x = arr.find(a => a.u === u);
  const baru = !x;
  if (!x) { x = { u: u, r: PERAN === 'viewer' ? 'viewer' : 'staff' }; arr.push(x); }
  x.s = salt_(); x.h = hash_(String(SANDI_BARU), x.s); delete x.lama;
  simpanUsers_(arr); cabutSesi_(u); bukaKunci();
  Logger.log((baru ? 'Akun dibuat: ' : 'Kata sandi diganti: ') + u + ' (' + (x.r === 'staff' ? 'Staf' : 'Hanya lihat') + '). KOSONGKAN SANDI_BARU di kode sekarang.');
}
