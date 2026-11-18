export const SYNC_WEBHOOK_GS = `/**
 * SyncWebhook.gs — Jembatan Sinkronisasi Gratis eRapor <-> Google Sheets
 * Tanpa Google Cloud Billing / Tanpa OAuth / Tanpa Kartu Kredit
 *
 * Cara Pasang (1 Menit):
 * 1. Buka atau buat Google Spreadsheet baru di https://sheets.google.com
 * 2. Klik menu: Ekstensi (Extensions) -> Apps Script
 * 3. Hapus semua kode bawaan, lalu tempel seluruh kode ini dan Simpan (Ctrl + S)
 * 4. Klik Terapkan (Deploy) -> Deployment baru (New deployment) -> Aplikasi web (Web app):
 *    - Jalankan sebagai (Execute as): Saya (Me)
 *    - Yang memiliki akses (Who has access): Siapa saja (Anyone)
 * 5. Salin URL Web App yang muncul, lalu tempel di menu:
 *    Pengaturan -> Google Drive & Script pada aplikasi eRapor.
 */

// Opsional: isi jika ingin menambahkan kunci keamanan tambahan (harus sama dengan di Pengaturan eRapor)
const SYNC_KEY = '';

const MAX_CELL_CHARS = 49000;
const OVERSIZED_PLACEHOLDER = '[GAMBAR_TERLALU_BESAR_UNTUK_SEL]';

const CANONICAL_HEADERS = {
  SETTINGS: ['KEY', 'VALUE'],
  ACADEMIC_YEARS: ['YEAR_ID', 'YEAR_NAME', 'ACTIVE_SEMESTER', 'IS_ACTIVE', 'NOTES', 'UPDATED_AT'],
  USERS: ['USER_ID', 'NAME', 'EMAIL', 'USERNAME', 'PASSWORD_HASH', 'SALT', 'ROLE', 'SCHOOL_LEVEL', 'ACTIVE', 'UPDATED_AT'],
  CLASSES: ['CLASS_ID', 'LEVEL', 'GRADE', 'CLASS_NAME', 'HOMEROOM_TEACHER', 'ACADEMIC_YEAR', 'ACTIVE', 'UPDATED_AT'],
  STUDENTS: [
    'STUDENT_ID', 'NIS', 'NISN', 'NIK', 'KK_NUMBER', 'NAME', 'FATHER_NAME', 'MOTHER_NAME',
    'GENDER', 'BIRTH_PLACE', 'BIRTH_DATE', 'RELIGION', 'CLASS_ID', 'ADDRESS', 'RT_RW',
    'VILLAGE', 'DISTRICT', 'REGENCY', 'PROVINCE', 'KEDATANGAN', 'MASA_BELAJAR',
    'PARENT_NAME', 'WALI_MODE', 'WALI_NAME', 'WALI_RELATION', 'WALI_ADDRESS',
    'PHOTO', 'PHONE', 'STATUS', 'STATUS_DATE', 'UPDATED_AT'
  ],
  ENROLLMENTS: ['ENROLLMENT_ID', 'STUDENT_ID', 'CLASS_ID', 'ACADEMIC_YEAR', 'STATUS', 'PROMOTION_RESULT', 'NEXT_CLASS_ID', 'NEXT_ACADEMIC_YEAR', 'UPDATED_AT'],
  SUBJECTS: ['SUBJECT_ID', 'LEVEL', 'CODE', 'SUBJECT_NAME', 'SUBJECT_NAME_ARAB', 'GROUP_NAME', 'DISPLAY_ORDER', 'ACTIVE', 'UPDATED_AT'],
  SCORES: ['SCORE_ID', 'STUDENT_ID', 'SUBJECT_ID', 'SEMESTER', 'ACADEMIC_YEAR', 'PTS', 'PAS', 'FINAL_SCORE', 'FINAL_SCORE_ARAB', 'UPDATED_AT'],
  RECAP: ['RECAP_ID', 'STUDENT_ID', 'STUDENT_NAME', 'CLASS_ID', 'SEMESTER', 'ACADEMIC_YEAR', 'TOTAL_SCORE', 'TOTAL_SCORE_ARAB', 'AVERAGE_SCORE', 'AVERAGE_SCORE_ARAB', 'RANK', 'CATEGORY', 'PROMOTION_STATUS', 'UPDATED_AT'],
  EXTRACURRICULAR: ['EX_ID', 'STUDENT_ID', 'SEMESTER', 'ACADEMIC_YEAR', 'ACTIVITY', 'PREDICATE', 'DESCRIPTION', 'UPDATED_AT'],
  TEACHER_NOTES: ['NOTE_ID', 'STUDENT_ID', 'SEMESTER', 'ACADEMIC_YEAR', 'ATTITUDE', 'SYAKHSIYAH_SULUK', 'SYAKHSIYAH_NADHAFAH', 'SYAKHSIYAH_MUWAZHABAH', 'SICK', 'PERMISSION', 'ABSENT', 'NOTE', 'TAHFIDZ_TYPE', 'TAHFIDZ_SCORE', 'UPDATED_AT'],
  REPORT_FILES: ['REPORT_ID', 'STUDENT_ID', 'SEMESTER', 'ACADEMIC_YEAR', 'DOC_ID', 'DOC_URL', 'PDF_ID', 'PDF_URL', 'STATUS', 'GENERATED_AT'],
  AUDIT_LOGS: ['LOG_ID', 'USER_ID', 'ACTION', 'ENTITY', 'RECORD_ID', 'DETAIL', 'CREATED_AT']
};

const SHEET_ORDER = Object.keys(CANONICAL_HEADERS);

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return jsonResponse_({
    ok: true,
    service: 'eRapor Webhook Sync',
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl(),
    sheetCount: ss.getSheets().length
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const body = JSON.parse(raw);

    if (SYNC_KEY && String(body.syncKey || '') !== String(SYNC_KEY)) {
      return jsonResponse_({ ok: false, error: 'Kode keamanan (SYNC_KEY) tidak cocok.' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const action = String(body.action || 'ping').toLowerCase();

    if (action === 'ping') {
      return jsonResponse_({
        ok: true,
        spreadsheetName: ss.getName(),
        spreadsheetUrl: ss.getUrl(),
        sheetCount: ss.getSheets().length
      });
    }

    if (action === 'push') {
      const sheets = body.sheets || {};
      let syncedSheets = 0;
      let totalRows = 0;

      const targetNames = SHEET_ORDER.filter(name => Object.prototype.hasOwnProperty.call(sheets, name));
      Object.keys(sheets).forEach(name => {
        if (!targetNames.includes(name)) targetNames.push(name);
      });

      targetNames.forEach(sheetName => {
        const rows = Array.isArray(sheets[sheetName]) ? sheets[sheetName] : [];
        const headers = resolveHeaders_(sheetName, rows);
        if (!headers.length) return;

        let sh = ss.getSheetByName(sheetName);
        if (!sh) {
          sh = ss.insertSheet(sheetName);
        }

        const matrix = [headers];
        rows.forEach(row => {
          matrix.push(headers.map(h => serializeCell_(row ? row[h] : '')));
        });

        sh.clearContents();
        const range = sh.getRange(1, 1, matrix.length, headers.length);
        range.setNumberFormat('@');
        range.setValues(matrix);
        sh.getRange(1, 1, 1, headers.length)
          .setFontWeight('bold')
          .setBackground('#064e3b')
          .setFontColor('#ffffff');
        sh.setFrozenRows(1);

        syncedSheets += 1;
        totalRows += rows.length;
      });

      return jsonResponse_({
        ok: true,
        spreadsheetName: ss.getName(),
        spreadsheetUrl: ss.getUrl(),
        syncedSheets: syncedSheets,
        totalRows: totalRows
      });
    }

    if (action === 'pull') {
      const resultSheets = {};
      SHEET_ORDER.forEach(sheetName => {
        const sh = ss.getSheetByName(sheetName);
        if (!sh) return;
        const values = sh.getDataRange().getValues();
        if (!values || values.length === 0) {
          resultSheets[sheetName] = [];
          return;
        }
        const headers = values[0].map(h => String(h || '').trim());
        const outRows = [];
        for (let r = 1; r < values.length; r++) {
          const rawRow = values[r];
          const obj = {};
          let hasData = false;
          for (let c = 0; c < headers.length; c++) {
            const key = headers[c];
            if (!key) continue;
            const v = rawRow[c];
            if (v !== '' && v !== null && v !== undefined) hasData = true;
            obj[key] = v === null || v === undefined ? '' : v;
          }
          if (hasData) outRows.push(obj);
        }
        resultSheets[sheetName] = outRows;
      });

      return jsonResponse_({
        ok: true,
        spreadsheetName: ss.getName(),
        spreadsheetUrl: ss.getUrl(),
        sheets: resultSheets
      });
    }

    return jsonResponse_({ ok: false, error: 'Aksi tidak dikenal: ' + action });
  } catch (err) {
    return jsonResponse_({ ok: false, error: err && err.message ? err.message : String(err) });
  } finally {
    lock.releaseLock();
  }
}

function resolveHeaders_(sheetName, rows) {
  const base = (CANONICAL_HEADERS[sheetName] || []).slice();
  const seen = new Set(base);
  rows.forEach(row => {
    if (!row || typeof row !== 'object') return;
    Object.keys(row).forEach(k => {
      if (!seen.has(k)) {
        seen.add(k);
        base.push(k);
      }
    });
  });
  return base;
}

function serializeCell_(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'YA' : 'TIDAK';
  const str = String(val);
  if (str.length > MAX_CELL_CHARS) return OVERSIZED_PLACEHOLDER;
  return str;
}
`;
