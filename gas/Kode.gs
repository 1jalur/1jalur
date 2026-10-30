/**
 * KODE.GS — PRODUKSI x GOOGLE DRIVE
 *
 * Fungsi:
 *  1. Data utama aplikasi disimpan sebagai file JSON di folder Google Drive
 *     (folder dibuat otomatis: "PRODUKSI - Data Aplikasi").
 *  2. Foto laporan reimburse disimpan di Drive: Foto Reimburse / <id laporan>.
 *  3. Backup harian otomatis (30 hari terakhir) di subfolder "Backup Harian".
 *  4. Laporan Google Sheet (hanya untuk dibaca) ikut diperbarui tiap simpan.
 *
 * CARA PASANG:
 *  1. Buka script.google.com > Proyek baru. Hapus isi, tempel seluruh kode ini.
 *  2. Ganti TOKEN (kode rahasia utama) dan TOKEN_BACA (kode baca) di bawah dengan kode Anda sendiri.
 *  3. Pilih fungsi "pasang" di toolbar > Jalankan > izinkan akses (Drive & Sheets).
 *  4. Deploy > Deployment baru > jenis "Aplikasi web":
 *       Jalankan sebagai : Saya
 *       Yang memiliki akses : Siapa saja
 *     Salin URL yang berakhiran /exec.
 *  5. Di aplikasi: tombol "Google Drive" > isi URL + kode rahasia (sama dengan TOKEN)
 *     > Simpan & kirim sekarang.
 *
 * Setiap kali kode ini diubah, buat "Deployment baru" lagi (atau Kelola deployment > Edit > Versi baru).
 */

const TOKEN = 'GANTI_DENGAN_KODE_RAHASIA';   // KODE RAHASIA UTAMA: boleh membaca dan menyimpan (untuk Admin/Staf)
const TOKEN_BACA = 'GANTI_DENGAN_KODE_BACA'; // KODE BACA: hanya boleh membaca data (untuk pengguna "Hanya lihat"). Harus beda dari TOKEN
const FOLDER_NAME = 'PRODUKSI - Data Aplikasi';
const FILE_NAME = 'produksi_data.json';
const KEEP_BACKUPS = 30;
const WRITE_SHEETS = true;          // false = tidak membuat laporan Google Sheet
const SHEET_NAME = 'PRODUKSI - Laporan (baca saja)';
// Isi dengan ID spreadsheet backup Anda yang sudah ada (bagian di antara /d/ dan /edit pada URL Google Sheet).
// Kosongkan jika ingin dibuatkan spreadsheet baru otomatis di folder Drive.
const SHEET_ID = '';
const SKIP_KEYS = ['USERS'];        // data yang tidak ditulis ke Sheet (berisi hash kata sandi)

/* ---------- Pintu masuk ---------- */

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (!okRead_(p.token)) return out_({ ok: false, error: 'Kode salah' });
    const a = p.action || 'ping';
    const sp = props_();

    if (a === 'ping') {
      if (!ok_(p.token)) return out_({ ok: true, main: false });   // kode baca: tidak diberi info folder
      const f = folder_();
      let su = '';
      if (WRITE_SHEETS) { try { su = sheet_().getUrl(); } catch (e) {} }
      return out_({ ok: true, main: true, nama: f.getName(), folderUrl: f.getUrl(), sheetUrl: su });
    }
    if (a === 'info') {
      const ts = +sp.getProperty('ts') || 0;
      return out_({
        ok: true, ts: ts, edited: ts,
        err: sp.getProperty('err') || '', errTs: +sp.getProperty('errTs') || 0
      });
    }
    if (a === 'load') {
      const txt = dataFile_().getBlob().getDataAsString();
      if (!txt || txt === '{}') return out_({ ok: false, error: 'Belum ada data di Drive. Kirim dulu dari aplikasi.' });
      return out_({ ok: true, data: JSON.parse(txt), ts: +sp.getProperty('ts') || 0 });
    }
    if (a === 'fotos') {
      return out_({ ok: true, fotos: readFotos_(p.id) });
    }
    return out_({ ok: false, error: 'Aksi tidak dikenal' });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  const sp = props_();
  let b = {};
  try {
    b = JSON.parse(e.postData.contents);
  } catch (err) {
    return out_({ ok: false, error: 'Data tidak terbaca' });
  }
  if (!ok_(b.token)) return out_({ ok: false, error: 'Kode rahasia utama salah (kode baca tidak boleh menyimpan)' });

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    if (b.action === 'fotos') {
      const n = saveFotos_(b.id, b.fotos || []);
      return out_({ ok: true, n: n });
    }
    if (b.action === 'delfotos') {
      delFotos_(b.id);
      return out_({ ok: true });
    }

    // Simpan data utama
    if (!b.data || typeof b.data !== 'object') throw new Error('Data kosong');
    dataFile_().setContent(JSON.stringify(b.data));
    sp.setProperty('ts', String(b.ts || Date.now()));
    sp.deleteProperty('err');
    try { if (WRITE_SHEETS) writeSheets_(b.data); } catch (se) { sp.setProperty('sheetErr', String(se)); }
    return out_({ ok: true });
  } catch (err) {
    sp.setProperty('err', String(err));
    sp.setProperty('errTs', String(b.ts || Date.now()));
    return out_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/* ---------- Fungsi bantu ---------- */

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function ok_(t) { return String(t || '') === TOKEN; }
function okRead_(t) { t = String(t || ''); return t === TOKEN || (TOKEN_BACA !== '' && t === TOKEN_BACA); }
function props_() { return PropertiesService.getScriptProperties(); }

function folder_() {
  const sp = props_();
  const id = sp.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  const f = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
  sp.setProperty('FOLDER_ID', f.getId());
  return f;
}
function sub_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function dataFile_() {
  const f = folder_();
  const it = f.getFilesByName(FILE_NAME);
  return it.hasNext() ? it.next() : f.createFile(FILE_NAME, '{}', MimeType.PLAIN_TEXT);
}
const safeId_ = id => String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');

/* ---------- Foto reimburse ---------- */

function fotoFolder_(id, create) {
  const sid = safeId_(id);
  if (!sid) throw new Error('ID foto kosong');
  const root = sub_(folder_(), 'Foto Reimburse');
  const it = root.getFoldersByName(sid);
  if (it.hasNext()) return it.next();
  return create ? root.createFolder(sid) : null;
}
function saveFotos_(id, fotos) {
  const f = fotoFolder_(id, true);
  const old = f.getFiles();
  while (old.hasNext()) old.next().setTrashed(true);
  let n = 0;
  fotos.forEach(function (d, i) {
    const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(String(d));
    if (!m) return;
    const nm = 'foto_' + String(i + 1).padStart(2, '0') + '.jpg';
    f.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], nm));
    n++;
  });
  return n;
}
function readFotos_(id) {
  const f = fotoFolder_(id, false);
  if (!f) return [];
  const arr = [];
  const it = f.getFiles();
  while (it.hasNext()) arr.push(it.next());
  arr.sort((a, b) => a.getName().localeCompare(b.getName()));
  return arr.map(function (x) {
    const bl = x.getBlob();
    return 'data:' + bl.getContentType() + ';base64,' + Utilities.base64Encode(bl.getBytes());
  });
}
function delFotos_(id) {
  const f = fotoFolder_(id, false);
  if (f) f.setTrashed(true);
}

/* ---------- Laporan Google Sheet (baca saja) ---------- */

function sheet_() {
  const sp = props_();
  const id = SHEET_ID || sp.getProperty('SHEET_ID');
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
  const bf = sub_(folder_(), 'Backup Harian');
  const tz = Session.getScriptTimeZone();
  const nm = 'produksi_' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd') + '.json';
  const old = bf.getFilesByName(nm);
  while (old.hasNext()) old.next().setTrashed(true);
  bf.createFile(nm, dataFile_().getBlob().getDataAsString(), MimeType.PLAIN_TEXT);

  const all = [];
  const it = bf.getFiles();
  while (it.hasNext()) all.push(it.next());
  all.sort((a, b) => b.getName().localeCompare(a.getName()));
  all.slice(KEEP_BACKUPS).forEach(f => f.setTrashed(true));
}

/* ---------- Pemasangan (jalankan sekali) ---------- */

function pasang() {
  const f = folder_();
  dataFile_();
  if (WRITE_SHEETS) sheet_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupHarian') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupHarian').timeBased().everyDays(1).atHour(1).create();
  Logger.log('Folder Drive : ' + f.getUrl());
  Logger.log('Siap. Sekarang Deploy > Deployment baru > Aplikasi web (akses: Siapa saja).');
}
