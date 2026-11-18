import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { listWilayah, wilayahName } from '@lokal-id/core/wilayah';
import type {
  AcademicYearRecord,
  AppSettings,
  AuditLogRecord,
  ClassRecord,
  ExtraRecord,
  PromotionCandidateRow,
  RecapRecord,
  ReportFileRecord,
  ReportPreviewData,
  SafeUser,
  ScoreRecord,
  StudentEnrollmentRecord,
  StudentRecord,
  StudentTranscriptResponse,
  SubjectRecord,
  TeacherNoteRecord,
  TranscriptTermInfo,
  UserRecord,
  UserRole,
} from './src/types/erapor.ts';
import {
  cleanScoreValue,
  computeFinalScore,
  DEFAULT_EXTRA_CATEGORIES,
  DEFAULT_SYAKHSIYAH_CATEGORIES,
  formatGradeCategoryArabic,
  formatTahfidzKitabah,
  getGradeCategory,
  getPromotionDecision,
  isFemaleGender,
  numberToArabicWords,
  parseScoreWeights,
  parseSubjectLevels,
  subjectMatchesLevel,
  toArabicDigits,
} from './src/utils/arabic.ts';
import {
  computeMasaBelajar,
  findParentsByKk,
  formatDateDDMMYYYY,
  normalizeDateInput,
  parseNikInfo,
  todayIsoDate,
  validateStudentIdentifiers,
  validateStudentStatusDate,
} from './src/utils/studentUtils.ts';
import {
  normalizeImportedDateDDMMYYYY,
  normalizeImportedDateIso,
  normalizeImportedGender,
  normalizeImportedIdentifier,
  normalizeImportedLatinTitle,
  normalizeImportedStatus,
  normalizeImportedTahfidzType,
  normalizeImportedYesNo,
  sanitizeImportedText,
} from './src/utils/importNormalizer.ts';

function lookupWilayahFromNik(nikRaw: unknown): {
  province: string;
  regency: string;
  district: string;
  villages: string[];
  defaultVillage: string;
} | null {
  const digits = String(nikRaw ?? '').replace(/\D/g, '');
  if (digits.length < 6) return null;
  const provCode = digits.slice(0, 2);
  const regCode = `${provCode}.${digits.slice(2, 4)}`;
  const distCode = `${regCode}.${digits.slice(4, 6)}`;
  const province = wilayahName(provCode) || '';
  const regency = wilayahName(regCode) || '';
  const district = wilayahName(distCode) || '';
  if (!province && !regency && !district) return null;
  const villages = district
    ? listWilayah(distCode)
        .map((v) => v.name)
        .filter(Boolean)
    : [];
  return {
    province,
    regency,
    district,
    villages,
    defaultVillage: villages[0] || '',
  };
}

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'erapor-db.json');

interface DatabaseSchema {
  initialized: boolean;
  SETTINGS: AppSettings;
  ACADEMIC_YEARS: AcademicYearRecord[];
  USERS: UserRecord[];
  CLASSES: ClassRecord[];
  STUDENTS: StudentRecord[];
  ENROLLMENTS: StudentEnrollmentRecord[];
  SUBJECTS: SubjectRecord[];
  SCORES: ScoreRecord[];
  RECAP: RecapRecord[];
  EXTRACURRICULAR: ExtraRecord[];
  TEACHER_NOTES: TeacherNoteRecord[];
  REPORT_FILES: ReportFileRecord[];
  AUDIT_LOGS: AuditLogRecord[];
}

const DEFAULT_CATEGORIES = JSON.stringify([
  { name: 'ممتاز', min: 90, max: 100 },
  { name: 'جيد جدا', min: 80, max: 89.99 },
  { name: 'جيد', min: 70, max: 79.99 },
  { name: 'مقبول', min: 60, max: 69.99 },
  { name: 'راسب', min: 0, max: 59.99 },
]);

const DEFAULT_SYAKHSIYAH = JSON.stringify(DEFAULT_SYAKHSIYAH_CATEGORIES);
const DEFAULT_EXTRA = JSON.stringify(DEFAULT_EXTRA_CATEGORIES);

function nowStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function todayFormatted(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function makeId(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}

function hashPassword(password: string, salt: string): string {
  return crypto.createHash('sha256').update(`${password}${salt}`, 'utf8').digest('hex');
}

function emptyDb(): DatabaseSchema {
  return {
    initialized: false,
    SETTINGS: {
      APP_NAME: 'eRapor Sekolah v2',
      APP_VERSION: '2.6.0',
      SCHOOL_NAME: '',
      SCHOOL_LEVEL: 'WUSTHA',
      NPSN: '',
      SCHOOL_ADDRESS: '',
      SHEIKH_NAME: '',
      SHEIKH_SIGNATURE: '',
      PRINCIPAL_NAME: '',
      PRINCIPAL_NIP: '',
      ACADEMIC_YEAR: '2026/2027',
      ACTIVE_SEMESTER: '1',
      CITY: '',
      REPORT_DATE: todayFormatted(),
      LOGO_FILE_ID: '',
      GRADE_CATEGORIES: DEFAULT_CATEGORIES,
      SYAKHSIYAH_CATEGORIES: DEFAULT_SYAKHSIYAH,
      EXTRA_CATEGORIES: DEFAULT_EXTRA,
      PTS_WEIGHT: '30',
      PAS_WEIGHT: '70',
      RANK_BASIS: 'TOTAL',
      APPS_SCRIPT_WEBHOOK_URL: '',
      APPS_SCRIPT_SYNC_KEY: '',
      GOOGLE_SHEET_NAME: '',
      GOOGLE_SHEET_URL: '',
      GOOGLE_AUTO_SYNC: 'TIDAK',
      GOOGLE_LAST_SYNC: '',
      GOOGLE_LAST_SYNC_ERROR: '',
    },
    ACADEMIC_YEARS: [],
    USERS: [],
    CLASSES: [],
    STUDENTS: [],
    ENROLLMENTS: [],
    SUBJECTS: [],
    SCORES: [],
    RECAP: [],
    EXTRACURRICULAR: [],
    TEACHER_NOTES: [],
    REPORT_FILES: [],
    AUDIT_LOGS: [],
  };
}

function ensureMultiYearIntegrity(db: DatabaseSchema): boolean {
  let dirty = false;
  if (!Array.isArray(db.ACADEMIC_YEARS)) {
    db.ACADEMIC_YEARS = [];
    dirty = true;
  }
  if (!Array.isArray(db.ENROLLMENTS)) {
    db.ENROLLMENTS = [];
    dirty = true;
  }

  const activeYear = String(db.SETTINGS.ACADEMIC_YEAR || '2026/2027').trim() || '2026/2027';
  const activeSem = String(db.SETTINGS.ACTIVE_SEMESTER || '1').trim() || '1';

  const yearSet = new Set<string>([activeYear]);
  for (const c of db.CLASSES) if (c.ACADEMIC_YEAR) yearSet.add(String(c.ACADEMIC_YEAR).trim());
  for (const s of db.SCORES) if (s.ACADEMIC_YEAR) yearSet.add(String(s.ACADEMIC_YEAR).trim());
  for (const r of db.RECAP) if (r.ACADEMIC_YEAR) yearSet.add(String(r.ACADEMIC_YEAR).trim());
  for (const n of db.TEACHER_NOTES) if (n.ACADEMIC_YEAR) yearSet.add(String(n.ACADEMIC_YEAR).trim());
  for (const x of db.EXTRACURRICULAR) if (x.ACADEMIC_YEAR) yearSet.add(String(x.ACADEMIC_YEAR).trim());
  for (const f of db.REPORT_FILES) if (f.ACADEMIC_YEAR) yearSet.add(String(f.ACADEMIC_YEAR).trim());
  for (const e of db.ENROLLMENTS) if (e.ACADEMIC_YEAR) yearSet.add(String(e.ACADEMIC_YEAR).trim());

  const existingYears = new Set(db.ACADEMIC_YEARS.map((y) => String(y.YEAR_NAME).trim()));
  for (const yName of Array.from(yearSet).sort()) {
    if (!yName || existingYears.has(yName)) continue;
    db.ACADEMIC_YEARS.push({
      YEAR_ID: makeId('YR'),
      YEAR_NAME: yName,
      ACTIVE_SEMESTER: yName === activeYear ? activeSem : '1',
      IS_ACTIVE: yName === activeYear ? 'YA' : 'TIDAK',
      UPDATED_AT: nowStr(),
    });
    existingYears.add(yName);
    dirty = true;
  }

  let hasActive = false;
  for (const y of db.ACADEMIC_YEARS) {
    if (String(y.YEAR_NAME).trim() === activeYear) {
      if (y.IS_ACTIVE !== 'YA' || String(y.ACTIVE_SEMESTER) !== activeSem) {
        y.IS_ACTIVE = 'YA';
        y.ACTIVE_SEMESTER = activeSem;
        dirty = true;
      }
      hasActive = true;
    } else if (y.IS_ACTIVE === 'YA') {
      y.IS_ACTIVE = 'TIDAK';
      dirty = true;
    }
  }
  if (!hasActive && db.ACADEMIC_YEARS.length > 0) {
    db.ACADEMIC_YEARS[0].IS_ACTIVE = 'YA';
    dirty = true;
  }

  // Backfill enrollments from STUDENTS & historical RECAP / SCORES
  const enrollKeys = new Set(db.ENROLLMENTS.map((e) => `${e.STUDENT_ID}|${String(e.ACADEMIC_YEAR).trim()}`));
  const classYearMap = new Map(db.CLASSES.map((c) => [c.CLASS_ID, String(c.ACADEMIC_YEAR || activeYear).trim()]));

  for (const st of db.STUDENTS) {
    if (!st.CLASS_ID) continue;
    const yr = classYearMap.get(st.CLASS_ID) || activeYear;
    const key = `${st.STUDENT_ID}|${yr}`;
    if (!enrollKeys.has(key)) {
      db.ENROLLMENTS.push({
        ENROLLMENT_ID: makeId('ENR'),
        STUDENT_ID: st.STUDENT_ID,
        CLASS_ID: st.CLASS_ID,
        ACADEMIC_YEAR: yr,
        STATUS: String(st.STATUS).toUpperCase() === 'NONAKTIF' ? 'NONAKTIF' : 'AKTIF',
        PROMOTION_RESULT: 'BELUM',
        UPDATED_AT: nowStr(),
      });
      enrollKeys.add(key);
      dirty = true;
    }
  }

  for (const rc of db.RECAP) {
    const yr = String(rc.ACADEMIC_YEAR || '').trim();
    if (!yr || !rc.STUDENT_ID) continue;
    const key = `${rc.STUDENT_ID}|${yr}`;
    if (!enrollKeys.has(key)) {
      const st = db.STUDENTS.find((s) => s.STUDENT_ID === rc.STUDENT_ID);
      const clsId = rc.CLASS_ID || st?.CLASS_ID || '';
      if (clsId) {
        db.ENROLLMENTS.push({
          ENROLLMENT_ID: makeId('ENR'),
          STUDENT_ID: rc.STUDENT_ID,
          CLASS_ID: clsId,
          ACADEMIC_YEAR: yr,
          STATUS: 'AKTIF',
          PROMOTION_RESULT: 'BELUM',
          UPDATED_AT: nowStr(),
        });
        enrollKeys.add(key);
        dirty = true;
      }
    }
  }

  return dirty;
}

let dbCache: DatabaseSchema | null = null;

function loadDb(): DatabaseSchema {
  if (dbCache) return dbCache;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const fresh = emptyDb();
    dbCache = fresh;
    saveDb(fresh);
    return fresh;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const defaults = emptyDb();
    const loaded: DatabaseSchema = {
      ...defaults,
      ...parsed,
      SETTINGS: {
        ...defaults.SETTINGS,
        ...(parsed.SETTINGS || {}),
      },
    };
    const migrated = ensureMultiYearIntegrity(loaded);
    dbCache = loaded;
    if (migrated && loaded.initialized) {
      saveDb(loaded);
    }
    return loaded;
  } catch {
    const fallback = emptyDb();
    dbCache = fallback;
    return fallback;
  }
}

function writeDbFileOnly(db: DatabaseSchema): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
  dbCache = db;
}

function nowSyncFormatted(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function buildExportSheetsPayload(db: DatabaseSchema): Record<string, Record<string, unknown>[]> {
  return {
    SETTINGS: Object.entries(db.SETTINGS).map(([KEY, VALUE]) => ({ KEY, VALUE: VALUE ?? '' })),
    ACADEMIC_YEARS: db.ACADEMIC_YEARS as unknown as Record<string, unknown>[],
    USERS: db.USERS as unknown as Record<string, unknown>[],
    CLASSES: db.CLASSES as unknown as Record<string, unknown>[],
    STUDENTS: db.STUDENTS as unknown as Record<string, unknown>[],
    ENROLLMENTS: db.ENROLLMENTS as unknown as Record<string, unknown>[],
    SUBJECTS: db.SUBJECTS as unknown as Record<string, unknown>[],
    SCORES: db.SCORES as unknown as Record<string, unknown>[],
    RECAP: db.RECAP as unknown as Record<string, unknown>[],
    EXTRACURRICULAR: db.EXTRACURRICULAR as unknown as Record<string, unknown>[],
    TEACHER_NOTES: db.TEACHER_NOTES as unknown as Record<string, unknown>[],
    REPORT_FILES: db.REPORT_FILES as unknown as Record<string, unknown>[],
    AUDIT_LOGS: db.AUDIT_LOGS as unknown as Record<string, unknown>[],
  };
}

function validateWebhookUrl(rawUrl: string): string {
  const url = String(rawUrl || '').trim();
  if (!url) {
    throw new Error('URL Web App Google Apps Script wajib diisi.');
  }
  if (
    !url.startsWith('https://script.google.com/') &&
    !url.startsWith('https://script.googleusercontent.com/')
  ) {
    throw new Error(
      'URL harus berupa Web App Google Apps Script yang diawali dengan https://script.google.com/...'
    );
  }
  return url;
}

async function callAppsScriptWebhook(
  rawUrl: string,
  payload: Record<string, unknown>
): Promise<{
  ok: boolean;
  spreadsheetName?: string;
  spreadsheetUrl?: string;
  sheetCount?: number;
  syncedSheets?: number;
  totalRows?: number;
  sheets?: Record<string, Record<string, unknown>[]>;
  error?: string;
}> {
  const url = validateWebhookUrl(rawUrl);
  const res = await fetch(url, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (text.trim().startsWith('<')) {
    throw new Error(
      "Google Apps Script menolak akses (mengembalikan halaman HTML). Pastikan saat Deploy Web App, pilihan 'Who has access / Yang memiliki akses' diset ke 'Anyone / Siapa saja'."
    );
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Respons tidak valid dari Apps Script (HTTP ${res.status}).`);
  }
  if (!res.ok || parsed.ok === false) {
    throw new Error(String(parsed.error || `Gagal menghubungi Apps Script (HTTP ${res.status}).`));
  }
  return parsed as {
    ok: boolean;
    spreadsheetName?: string;
    spreadsheetUrl?: string;
    sheetCount?: number;
    syncedSheets?: number;
    totalRows?: number;
    sheets?: Record<string, Record<string, unknown>[]>;
  };
}

let webhookSyncTimer: ReturnType<typeof setTimeout> | null = null;
let webhookSyncInFlight = false;
let webhookSyncQueued = false;

async function runWebhookPushInternal(): Promise<{
  sheetName: string;
  sheetUrl: string;
  syncedSheets: number;
  totalRows: number;
  lastSync: string;
}> {
  const db = loadDb();
  const webhookUrl = String(db.SETTINGS.APPS_SCRIPT_WEBHOOK_URL || '').trim();
  const syncKey = String(db.SETTINGS.APPS_SCRIPT_SYNC_KEY || '').trim();
  if (!webhookUrl) {
    throw new Error('URL Web App Apps Script belum dikonfigurasi.');
  }

  webhookSyncInFlight = true;
  try {
    const res = await callAppsScriptWebhook(webhookUrl, {
      action: 'push',
      syncKey,
      sheets: buildExportSheetsPayload(db),
    });
    const stamp = nowSyncFormatted();
    const latest = loadDb();
    latest.SETTINGS.GOOGLE_LAST_SYNC = stamp;
    latest.SETTINGS.GOOGLE_LAST_SYNC_ERROR = '';
    if (res.spreadsheetName) latest.SETTINGS.GOOGLE_SHEET_NAME = res.spreadsheetName;
    if (res.spreadsheetUrl) latest.SETTINGS.GOOGLE_SHEET_URL = res.spreadsheetUrl;
    writeDbFileOnly(latest);
    return {
      sheetName: latest.SETTINGS.GOOGLE_SHEET_NAME || 'Google Spreadsheet',
      sheetUrl: latest.SETTINGS.GOOGLE_SHEET_URL || '',
      syncedSheets: Number(res.syncedSheets ?? 13),
      totalRows: Number(res.totalRows ?? 0),
      lastSync: stamp,
    };
  } catch (err) {
    const latest = loadDb();
    latest.SETTINGS.GOOGLE_LAST_SYNC_ERROR =
      err instanceof Error ? err.message : 'Gagal sinkronisasi ke Google Sheets.';
    writeDbFileOnly(latest);
    throw err;
  } finally {
    webhookSyncInFlight = false;
    if (webhookSyncQueued) {
      webhookSyncQueued = false;
      scheduleWebhookAutoSync();
    }
  }
}

function scheduleWebhookAutoSync(): void {
  const db = loadDb();
  if (
    !db.initialized ||
    db.SETTINGS.GOOGLE_AUTO_SYNC !== 'YA' ||
    !String(db.SETTINGS.APPS_SCRIPT_WEBHOOK_URL || '').trim()
  ) {
    return;
  }
  if (webhookSyncTimer) clearTimeout(webhookSyncTimer);
  webhookSyncTimer = setTimeout(() => {
    webhookSyncTimer = null;
    if (webhookSyncInFlight) {
      webhookSyncQueued = true;
      return;
    }
    runWebhookPushInternal().catch((err) => {
      console.error('[Webhook Auto-Sync Error]:', err instanceof Error ? err.message : err);
    });
  }, 1200);
}

function saveDb(db: DatabaseSchema, skipAutoSync = false): void {
  writeDbFileOnly(db);
  if (!skipAutoSync) {
    scheduleWebhookAutoSync();
  }
}

const sessions = new Map<string, { user: SafeUser; expiresAt: number }>();
const SESSION_TTL_MS = 21600 * 1000;

function getSessionUser(req: Request): SafeUser | null {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const entry = sessions.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    sessions.delete(token);
    return null;
  }
  entry.expiresAt = Date.now() + SESSION_TTL_MS;
  return entry.user;
}

interface AuthedRequest extends Request {
  user?: SafeUser;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Sesi login tidak ditemukan atau telah berakhir.' });
    return;
  }
  req.user = user;
  next();
}

function authorizeEdit(user: SafeUser, entity: string): void {
  const role = user.role;
  if (role === 'ADMIN') return;
  if (role === 'WALI_KELAS' && ['students', 'scores', 'extracurricular', 'notes'].includes(entity)) return;
  if (role === 'GURU' && entity === 'scores') return;
  throw new Error('Anda tidak memiliki hak untuk mengubah data ini.');
}

function authorizeReport(user: SafeUser): void {
  if (!['ADMIN', 'WALI_KELAS', 'KEPALA_SEKOLAH'].includes(user.role)) {
    throw new Error('Anda tidak memiliki hak untuk mengelola rapor.');
  }
}

function logAction(db: DatabaseSchema, user: SafeUser, action: string, entity: string, recordId: string, detail: string): void {
  db.AUDIT_LOGS.push({
    LOG_ID: makeId('LOG'),
    USER_ID: user.id,
    ACTION: action,
    ENTITY: entity,
    RECORD_ID: recordId,
    DETAIL: detail.slice(0, 500),
    CREATED_AT: nowStr(),
  });
  if (db.AUDIT_LOGS.length > 500) {
    db.AUDIT_LOGS = db.AUDIT_LOGS.slice(-500);
  }
}

const ENTITY_MAP = {
  students: { table: 'STUDENTS' as const, idField: 'STUDENT_ID' as const, prefix: 'STD' },
  classes: { table: 'CLASSES' as const, idField: 'CLASS_ID' as const, prefix: 'CLS' },
  subjects: { table: 'SUBJECTS' as const, idField: 'SUBJECT_ID' as const, prefix: 'SUB' },
  extracurricular: { table: 'EXTRACURRICULAR' as const, idField: 'EX_ID' as const, prefix: 'EX' },
  notes: { table: 'TEACHER_NOTES' as const, idField: 'NOTE_ID' as const, prefix: 'NOTE' },
};

function getStudentClassIdForYear(
  db: DatabaseSchema,
  student: StudentRecord,
  academicYear: string
): string {
  const yr = String(academicYear || '').trim();
  if (yr) {
    const enr = db.ENROLLMENTS.find(
      (e) => e.STUDENT_ID === student.STUDENT_ID && String(e.ACADEMIC_YEAR).trim() === yr
    );
    if (enr?.CLASS_ID) return enr.CLASS_ID;
    const rec = db.RECAP.find(
      (r) => r.STUDENT_ID === student.STUDENT_ID && String(r.ACADEMIC_YEAR).trim() === yr
    );
    if (rec?.CLASS_ID) return rec.CLASS_ID;
  }
  return student.CLASS_ID;
}

function getStudentsForYearAndClass(
  db: DatabaseSchema,
  academicYear: string,
  classId: string
): { student: StudentRecord; classId: string; enrollment?: StudentEnrollmentRecord }[] {
  const yr = String(academicYear || '').trim();
  const studentMap = new Map(db.STUDENTS.map((s) => [s.STUDENT_ID, s]));

  if (yr) {
    const yearEnrs = db.ENROLLMENTS.filter((e) => String(e.ACADEMIC_YEAR).trim() === yr);
    const hasYearMeta =
      yearEnrs.length > 0 ||
      db.ACADEMIC_YEARS.some((y) => String(y.YEAR_NAME).trim() === yr) ||
      db.CLASSES.some((c) => String(c.ACADEMIC_YEAR).trim() === yr);

    if (hasYearMeta) {
      const seen = new Set<string>();
      const list: { student: StudentRecord; classId: string; enrollment: StudentEnrollmentRecord }[] = [];
      for (const e of yearEnrs) {
        if (String(e.STATUS).toUpperCase() === 'NONAKTIF') continue;
        if (classId && e.CLASS_ID !== classId) continue;
        if (seen.has(e.STUDENT_ID)) continue;
        const st = studentMap.get(e.STUDENT_ID);
        if (!st) continue;
        seen.add(e.STUDENT_ID);
        list.push({ student: st, classId: e.CLASS_ID, enrollment: e });
      }
      return list.sort((a, b) => String(a.student.NAME).localeCompare(String(b.student.NAME)));
    }
  }

  return db.STUDENTS
    .filter((s) => (!classId || s.CLASS_ID === classId) && String(s.STATUS).toUpperCase() === 'AKTIF')
    .sort((a, b) => String(a.NAME).localeCompare(String(b.NAME)))
    .map((s) => ({ student: s, classId: s.CLASS_ID }));
}

function upsertStudentEnrollment(
  db: DatabaseSchema,
  studentId: string,
  classId: string,
  academicYear: string,
  status: string = 'AKTIF'
): void {
  const yr = String(academicYear || db.SETTINGS.ACADEMIC_YEAR || '').trim();
  if (!yr || !studentId || !classId) return;
  const existing = db.ENROLLMENTS.find(
    (e) => e.STUDENT_ID === studentId && String(e.ACADEMIC_YEAR).trim() === yr
  );
  if (existing) {
    existing.CLASS_ID = classId;
    existing.STATUS = status === 'NONAKTIF' ? 'NONAKTIF' : 'AKTIF';
    existing.UPDATED_AT = nowStr();
  } else {
    db.ENROLLMENTS.push({
      ENROLLMENT_ID: makeId('ENR'),
      STUDENT_ID: studentId,
      CLASS_ID: classId,
      ACADEMIC_YEAR: yr,
      STATUS: status === 'NONAKTIF' ? 'NONAKTIF' : 'AKTIF',
      PROMOTION_RESULT: 'BELUM',
      UPDATED_AT: nowStr(),
    });
  }
}

function cloneClassesBetweenYears(
  db: DatabaseSchema,
  sourceYear: string,
  targetYear: string
): { cloned: number; skipped: number } {
  const srcYr = String(sourceYear || '').trim();
  const tgtYr = String(targetYear || '').trim();
  if (!srcYr || !tgtYr || srcYr === tgtYr) {
    return { cloned: 0, skipped: 0 };
  }
  const sourceClasses = db.CLASSES.filter((c) => String(c.ACADEMIC_YEAR).trim() === srcYr);
  const existingTargetNames = new Set(
    db.CLASSES.filter((c) => String(c.ACADEMIC_YEAR).trim() === tgtYr).map((c) =>
      `${String(c.LEVEL).trim()}|${String(c.CLASS_NAME).trim().toLowerCase()}`
    )
  );
  let cloned = 0;
  let skipped = 0;
  for (const c of sourceClasses) {
    const sig = `${String(c.LEVEL).trim()}|${String(c.CLASS_NAME).trim().toLowerCase()}`;
    if (existingTargetNames.has(sig)) {
      skipped++;
      continue;
    }
    db.CLASSES.push({
      CLASS_ID: makeId('CLS'),
      LEVEL: c.LEVEL,
      GRADE: c.GRADE,
      CLASS_NAME: c.CLASS_NAME,
      HOMEROOM_TEACHER: c.HOMEROOM_TEACHER,
      ACADEMIC_YEAR: tgtYr,
      ACTIVE: c.ACTIVE || 'YA',
      UPDATED_AT: nowStr(),
    });
    existingTargetNames.add(sig);
    cloned++;
  }
  return { cloned, skipped };
}

function computeRecapData(
  db: DatabaseSchema,
  classId: string,
  semester: string,
  academicYear: string,
  persist: boolean
) {
  const settings = db.SETTINGS;
  const enrolled = getStudentsForYearAndClass(db, academicYear, classId);
  const clazz = classId ? db.CLASSES.find((c) => c.CLASS_ID === classId) : undefined;

  const subjects = db.SUBJECTS
    .filter(
      (s) =>
        String(s.ACTIVE).toUpperCase() === 'YA' &&
        (!clazz?.LEVEL || subjectMatchesLevel(s.LEVEL, clazz.LEVEL))
    )
    .sort((a, b) => Number(a.DISPLAY_ORDER || 0) - Number(b.DISPLAY_ORDER || 0));

  if (!subjects.length) {
    return { subjects: [], rows: [] };
  }

  const scoreMap = new Map<string, ScoreRecord>();
  for (const s of db.SCORES) {
    if (String(s.SEMESTER) === String(semester) && String(s.ACADEMIC_YEAR) === String(academicYear)) {
      scoreMap.set(`${s.STUDENT_ID}|${s.SUBJECT_ID}`, s);
    }
  }

  const noteMap = new Map<string, TeacherNoteRecord>();
  for (const n of db.TEACHER_NOTES) {
    if (String(n.SEMESTER) === String(semester) && String(n.ACADEMIC_YEAR) === String(academicYear)) {
      noteMap.set(n.STUDENT_ID, n);
    }
  }

  const rows = enrolled.map(({ student: st, classId: stClassId }, idx) => {
    const values: Record<string, number | ''> = {};
    let total = 0;
    let count = 0;

    for (const sub of subjects) {
      const sc = scoreMap.get(`${st.STUDENT_ID}|${sub.SUBJECT_ID}`);
      const val = sc ? cleanScoreValue(sc.FINAL_SCORE) : '';
      values[sub.SUBJECT_ID] = val;
      if (val !== '') {
        total += Number(val);
        count++;
      }
    }

    const totalFixed = count ? Math.round((total + Number.EPSILON) * 10) / 10 : '';
    const avgFixed = count ? Math.round((total / count + Number.EPSILON) * 10) / 10 : '';
    const isFemale = isFemaleGender(st.GENDER);
    const rawCategory = getGradeCategory(avgFixed, settings.GRADE_CATEGORIES);
    const category = formatGradeCategoryArabic(rawCategory, isFemale);
    const promo = getPromotionDecision(semester, rawCategory, isFemale);
    const nt = noteMap.get(st.STUDENT_ID);
    const tahfidzType = String(nt?.TAHFIDZ_TYPE || '').trim();
    const tahfidzScore = nt ? cleanScoreValue(nt.TAHFIDZ_SCORE) : '';

    return {
      no: idx + 1,
      studentId: st.STUDENT_ID,
      classId: stClassId,
      name: st.NAME,
      nis: st.NIS,
      tahfidzType,
      tahfidzScore,
      values,
      total: totalFixed,
      totalArab: totalFixed !== '' ? numberToArabicWords(totalFixed) : '',
      average: avgFixed,
      averageArab: avgFixed !== '' ? numberToArabicWords(avgFixed) : '',
      category,
      rank: '-' as number | '-',
      promotionStatus: promo ? promo.status : '-',
      promotionStatusArab: promo ? promo.arabic : '-',
    };
  });

  const rankBasis =
    String(settings.RANK_BASIS || 'TOTAL').toUpperCase() === 'AVERAGE' ? 'AVERAGE' : 'TOTAL';
  const getRankValue = (r: (typeof rows)[number]): number =>
    rankBasis === 'AVERAGE' ? Number(r.average) : Number(r.total);
  const ranked = rows
    .filter((r) => (rankBasis === 'AVERAGE' ? r.average !== '' : r.total !== ''))
    .sort((a, b) => getRankValue(b) - getRankValue(a));
  ranked.forEach((r, idx) => {
    r.rank =
      idx > 0 && getRankValue(r) === getRankValue(ranked[idx - 1])
        ? ranked[idx - 1].rank
        : idx + 1;
  });

  if (persist && rows.length > 0) {
    const existingMap = new Map<string, RecapRecord>();
    for (const rec of db.RECAP) {
      if (String(rec.SEMESTER) === String(semester) && String(rec.ACADEMIC_YEAR) === String(academicYear)) {
        existingMap.set(rec.STUDENT_ID, rec);
      }
    }
    for (const r of rows) {
      const prev = existingMap.get(r.studentId);
      const nextRec: RecapRecord = {
        RECAP_ID: prev ? prev.RECAP_ID : makeId('RCP'),
        STUDENT_ID: r.studentId,
        STUDENT_NAME: r.name,
        CLASS_ID: r.classId,
        SEMESTER: String(semester),
        ACADEMIC_YEAR: String(academicYear),
        TOTAL_SCORE: r.total,
        TOTAL_SCORE_ARAB: r.totalArab,
        AVERAGE_SCORE: r.average,
        AVERAGE_SCORE_ARAB: r.averageArab,
        RANK: r.rank,
        CATEGORY: r.category,
        PROMOTION_STATUS: r.promotionStatus || '-',
        UPDATED_AT: nowStr(),
      };
      if (prev) {
        Object.assign(prev, nextRec);
      } else {
        db.RECAP.push(nextRec);
      }
    }
    saveDb(db);
  }

  return {
    subjects: subjects.map((s) => ({
      id: s.SUBJECT_ID,
      name: s.SUBJECT_NAME,
      nameArab: s.SUBJECT_NAME_ARAB || s.SUBJECT_NAME,
      code: s.CODE,
    })),
    rows,
  };
}

function buildReportPreview(db: DatabaseSchema, studentId: string, semester: string, academicYear: string): ReportPreviewData {
  const student = db.STUDENTS.find((s) => s.STUDENT_ID === studentId);
  if (!student) throw new Error('Data siswa tidak ditemukan.');
  const resolvedClassId = getStudentClassIdForYear(db, student, academicYear);
  const clazz = db.CLASSES.find((c) => c.CLASS_ID === resolvedClassId) || {
    CLASS_NAME: '-',
    HOMEROOM_TEACHER: '-',
    LEVEL: '',
  };

  const subjects = db.SUBJECTS
    .filter(
      (s) =>
        String(s.ACTIVE).toUpperCase() === 'YA' &&
        (!clazz.LEVEL || subjectMatchesLevel(s.LEVEL, clazz.LEVEL))
    )
    .sort((a, b) => Number(a.DISPLAY_ORDER || 0) - Number(b.DISPLAY_ORDER || 0));

  const scoreMap = new Map<string, ScoreRecord>();
  for (const sc of db.SCORES) {
    if (
      sc.STUDENT_ID === studentId &&
      String(sc.SEMESTER) === String(semester) &&
      String(sc.ACADEMIC_YEAR) === String(academicYear)
    ) {
      scoreMap.set(sc.SUBJECT_ID, sc);
    }
  }

  const extras = db.EXTRACURRICULAR.filter(
    (x) =>
      x.STUDENT_ID === studentId &&
      String(x.SEMESTER) === String(semester) &&
      String(x.ACADEMIC_YEAR) === String(academicYear)
  );

  const note =
    db.TEACHER_NOTES.find(
      (n) =>
        n.STUDENT_ID === studentId &&
        String(n.SEMESTER) === String(semester) &&
        String(n.ACADEMIC_YEAR) === String(academicYear)
    ) || {};

  const recap = computeRecapData(db, resolvedClassId, semester, academicYear, false);
  const stRecap = recap.rows.find((r) => r.studentId === studentId);

  const subjectRows = subjects.map((sub, idx) => {
    const sc = scoreMap.get(sub.SUBJECT_ID);
    const val = sc ? cleanScoreValue(sc.FINAL_SCORE) : '';
    let arabSubName = String(sub.SUBJECT_NAME_ARAB || '').trim();
    if (!arabSubName && /[\u0600-\u06FF]/.test(String(sub.GROUP_NAME || ''))) {
      arabSubName = String(sub.GROUP_NAME).trim();
    }
    if (!arabSubName) arabSubName = sub.SUBJECT_NAME;

    return {
      no: toArabicDigits(idx + 1),
      name: arabSubName,
      score: val !== '' ? toArabicDigits(val) : '-',
      terbilang: val !== '' ? numberToArabicWords(val) : '-',
    };
  });

  const isFemale = isFemaleGender(student.GENDER);
  const promotion = getPromotionDecision(semester, stRecap?.category || '-', isFemale);
  const noteRecord = note as Partial<TeacherNoteRecord>;
  const tahfidzType = String(noteRecord.TAHFIDZ_TYPE || '').trim();
  const tahfidzVal = cleanScoreValue(noteRecord.TAHFIDZ_SCORE);
  const tahfidz = {
    type: tahfidzType,
    score: tahfidzVal !== '' ? toArabicDigits(tahfidzVal) : '-',
    terbilang: tahfidzVal !== '' ? formatTahfidzKitabah(tahfidzType, tahfidzVal) : '-',
  };

  return {
    settings: db.SETTINGS,
    student,
    clazz,
    semester: String(semester),
    academicYear: String(academicYear),
    tahfidz,
    subjects: subjectRows,
    summary: {
      total: stRecap && stRecap.total !== '' ? toArabicDigits(stRecap.total) : '-',
      totalArab: stRecap?.totalArab || '-',
      average: stRecap && stRecap.average !== '' ? toArabicDigits(stRecap.average) : '-',
      averageArab: stRecap?.averageArab || '-',
      rank: stRecap && stRecap.rank !== '-' ? toArabicDigits(stRecap.rank) : '-',
      category:
        stRecap?.category && stRecap.category !== '-'
          ? formatGradeCategoryArabic(stRecap.category, isFemale)
          : '-',
    },
    promotion,
    extras,
    note,
  };
}

function seedMasterData(db: DatabaseSchema, level: string, year: string, sampleData: boolean): void {
  const gradeDefaults: Record<string, string> = {
    WUSTHA: '1',
    ULYA: '1',
    "'ALY": '1',
    MUADALAH: '1',
    SMP: '7',
    SMA: '10',
    SMK: '10',
  };
  const grade = gradeDefaults[level] || '1';
  const classId = makeId('CLS');

  db.CLASSES.push({
    CLASS_ID: classId,
    LEVEL: level,
    GRADE: grade,
    CLASS_NAME: `${grade}A`,
    HOMEROOM_TEACHER: 'أحمد صالح',
    ACADEMIC_YEAR: year,
    ACTIVE: 'YA',
    UPDATED_AT: nowStr(),
  });

  const commonSubjects: [string, string, string, string][] = [
    ['NHW', 'Nahwu', 'النحو', 'A'],
    ['SRF', 'Shorof', 'الصرف', 'A'],
    ['FQH', 'Fiqih', 'الفقه', 'A'],
    ['AQD', 'Aqidah / Tauhid', 'التوحيد', 'A'],
    ['HDT', 'Hadits', 'الحديث', 'A'],
    ['TFS', 'Tafsir', 'التفسير', 'A'],
    ['ARB', 'Bahasa Arab', 'اللغة العربية', 'B'],
    ['AKH', 'Akhlak / Tasawuf', 'الأخلاق', 'B'],
  ];
  const levelExtras: Record<string, [string, string, string, string][]> = {
    WUSTHA: [
      ['TRK', 'Tarikh Islam', 'التاريخ الإسلامي', 'A'],
      ['IML', 'Imla & Khat', 'الإملاء والخط', 'B'],
    ],
    ULYA: [
      ['USF', 'Ushul Fiqih', 'أصول الفقه', 'A'],
      ['BLG', 'Balaghah', 'البلاغة', 'B'],
    ],
    "'ALY": [
      ['MNT', 'Ilmu Mantiq', 'علم المنطق', 'A'],
      ['USQ', 'Ulumul Qur’an', 'علوم القرآن', 'A'],
    ],
    SD: [
      ['IPAS', 'Ilmu Pengetahuan Alam dan Sosial', 'العلوم الطبيعية والاجتماعية', 'A'],
      ['MULOK', 'Muatan Lokal', 'اللغة المحلية', 'B'],
    ],
    SMP: [
      ['IPA', 'Ilmu Pengetahuan Alam', 'العلوم الطبيعية', 'A'],
      ['IPS', 'Ilmu Pengetahuan Sosial', 'العلوم الاجتماعية', 'A'],
    ],
    SMA: [
      ['FIS', 'Fisika', 'الفيزياء', 'A'],
      ['KIM', 'Kimia', 'الكيمياء', 'A'],
    ],
    SMK: [
      ['KJR', 'Dasar Program Keahlian', 'أساسيات التخصص', 'A'],
      ['PKK', 'Produk Kreatif & Kewirausahaan', 'ريادة الأعمال', 'B'],
    ],
  };

  const subjectList = commonSubjects.concat(levelExtras[level] || levelExtras.WUSTHA);
  subjectList.forEach((s, i) => {
    db.SUBJECTS.push({
      SUBJECT_ID: makeId('SUB'),
      LEVEL: level,
      CODE: s[0],
      SUBJECT_NAME: s[1],
      SUBJECT_NAME_ARAB: s[2],
      GROUP_NAME: s[3],
      DISPLAY_ORDER: i + 1,
      ACTIVE: 'YA',
      UPDATED_AT: nowStr(),
    });
  });

  if (sampleData) {
    const samples = [
      { name: 'أحمد زكي', father: 'عبد الله', gender: 'L', pts: 88, pas: 92 },
      { name: 'فاطمة الزهراء', father: 'محمد', gender: 'P', pts: 92, pas: 95 },
      { name: 'عمر الفاروق', father: 'خطاب', gender: 'L', pts: 84, pas: 87 },
    ];
    samples.forEach((s, i) => {
      const studentId = makeId('STD');
      db.STUDENTS.push({
        STUDENT_ID: studentId,
        NIS: String(11111 + i * 11111),
        NISN: String(1111111111 + i * 1111111111).slice(0, 10),
        NAME: s.name,
        FATHER_NAME: s.father,
        GENDER: s.gender,
        BIRTH_PLACE: 'Jakarta',
        BIRTH_DATE: '2015-01-01',
        RELIGION: 'Islam',
        CLASS_ID: classId,
        ADDRESS: '',
        PARENT_NAME: s.father,
        PHONE: '',
        STATUS: 'AKTIF',
        UPDATED_AT: nowStr(),
      });

      // Seed sample scores for first 4 subjects so dashboard & preview work immediately
      db.SUBJECTS.slice(0, 6).forEach((sub, sIdx) => {
        const pts = Math.min(100, s.pts + ((sIdx % 3) - 1) * 2);
        const pas = Math.min(100, s.pas + ((sIdx % 2) === 0 ? 1 : -2));
        const finalScore = Math.round(((pts * 0.3 + pas * 0.7) + Number.EPSILON) * 10) / 10;
        db.SCORES.push({
          SCORE_ID: makeId('SCR'),
          STUDENT_ID: studentId,
          SUBJECT_ID: sub.SUBJECT_ID,
          SEMESTER: '1',
          ACADEMIC_YEAR: year,
          PTS: pts,
          PAS: pas,
          FINAL_SCORE: finalScore,
          FINAL_SCORE_ARAB: numberToArabicWords(finalScore),
          UPDATED_AT: nowStr(),
        });
      });

      db.EXTRACURRICULAR.push({
        EX_ID: makeId('EX'),
        STUDENT_ID: studentId,
        SEMESTER: '1',
        ACADEMIC_YEAR: year,
        ACTIVITY: 'الكشافة',
        PREDICATE: 'ممتاز',
        DESCRIPTION: 'نشيط ومتميز في الأنشطة',
        UPDATED_AT: nowStr(),
      });

      db.TEACHER_NOTES.push({
        NOTE_ID: makeId('NOTE'),
        STUDENT_ID: studentId,
        SEMESTER: '1',
        ACADEMIC_YEAR: year,
        ATTITUDE: 'ممتاز',
        SYAKHSIYAH_SULUK: 'ممتاز',
        SYAKHSIYAH_NADHAFAH: 'ممتاز',
        SYAKHSIYAH_MUWAZHABAH: 'جيد جدا',
        SICK: 0,
        PERMISSION: 1,
        ABSENT: 0,
        NOTE: 'حافظ على تفوقك واجتهادك',
        UPDATED_AT: nowStr(),
      });
    });
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/app-state', (_req, res) => {
    const db = loadDb();
    if (!db.initialized) {
      res.json({
        setupRequired: true,
        appName: 'eRapor Sekolah v2',
        version: '2.6.0',
      });
      return;
    }
    res.json({
      setupRequired: false,
      appName: db.SETTINGS.APP_NAME || 'eRapor Sekolah v2',
      version: db.SETTINGS.APP_VERSION || '2.6.0',
      schoolName: db.SETTINGS.SCHOOL_NAME || 'Sekolah',
      schoolLevel: db.SETTINGS.SCHOOL_LEVEL || 'WUSTHA',
    });
  });

  app.post('/api/setup', (req, res) => {
    try {
      const payload = req.body || {};
      const required = ['schoolName', 'schoolLevel', 'academicYear', 'adminName', 'username', 'password'];
      for (const k of required) {
        if (!String(payload[k] || '').trim()) {
          res.status(400).json({ error: `Field wajib belum diisi: ${k}` });
          return;
        }
      }
      if (String(payload.password).length < 6) {
        res.status(400).json({ error: 'Password admin minimal 6 karakter.' });
        return;
      }
      const adminUsername = String(payload.username).trim().toLowerCase();
      if (['walikelas', 'guru', 'kepsek'].includes(adminUsername)) {
        res.status(400).json({ error: 'Username admin tidak boleh menggunakan walikelas, guru, atau kepsek.' });
        return;
      }

      const db = emptyDb();
      db.initialized = true;
      db.SETTINGS = {
        ...db.SETTINGS,
        SCHOOL_NAME: String(payload.schoolName).trim(),
        SCHOOL_LEVEL: String(payload.schoolLevel).trim().toUpperCase(),
        NPSN: String(payload.npsn || '').trim(),
        SCHOOL_ADDRESS: String(payload.address || '').trim(),
        SHEIKH_NAME: String(payload.sheikhName || '').trim(),
        PRINCIPAL_NAME: String(payload.principal || '').trim(),
        PRINCIPAL_NIP: String(payload.principalNip || '').trim(),
        ACADEMIC_YEAR: String(payload.academicYear).trim(),
        ACTIVE_SEMESTER: '1',
        CITY: String(payload.city || '').trim(),
        REPORT_DATE: todayFormatted(),
        LOGO_FILE_ID: '',
        GRADE_CATEGORIES: DEFAULT_CATEGORIES,
        SYAKHSIYAH_CATEGORIES: DEFAULT_SYAKHSIYAH,
        EXTRA_CATEGORIES: DEFAULT_EXTRA,
        PTS_WEIGHT: '30',
        PAS_WEIGHT: '70',
      };

      const initialAccounts: { name: string; email: string; username: string; password: string; role: UserRole }[] = [
        { name: String(payload.adminName).trim(), email: String(payload.adminEmail || '').trim(), username: adminUsername, password: String(payload.password), role: 'ADMIN' },
        { name: 'Wali Kelas', email: '', username: 'walikelas', password: 'wali123', role: 'WALI_KELAS' },
        { name: 'Guru Mata Pelajaran', email: '', username: 'guru', password: 'guru123', role: 'GURU' },
        { name: String(payload.principal || 'Kepala Sekolah').trim() || 'Kepala Sekolah', email: '', username: 'kepsek', password: 'kepsek123', role: 'KEPALA_SEKOLAH' },
      ];

      for (const acc of initialAccounts) {
        const salt = crypto.randomBytes(16).toString('hex');
        db.USERS.push({
          USER_ID: makeId('USR'),
          NAME: acc.name,
          EMAIL: acc.email,
          USERNAME: acc.username,
          PASSWORD_HASH: hashPassword(acc.password, salt),
          SALT: salt,
          ROLE: acc.role,
          SCHOOL_LEVEL: db.SETTINGS.SCHOOL_LEVEL,
          ACTIVE: 'YA',
          UPDATED_AT: nowStr(),
        });
      }

      seedMasterData(db, db.SETTINGS.SCHOOL_LEVEL, db.SETTINGS.ACADEMIC_YEAR, payload.sampleData !== false);
      ensureMultiYearIntegrity(db);
      saveDb(db);

      res.json({
        success: true,
        message: 'Setup berhasil. Akun multi-role dan struktur database siap digunakan.',
        initialAccounts: initialAccounts.map((a) => ({
          role: a.role,
          username: a.username,
          password: a.password,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal melakukan setup.' });
    }
  });

  app.post('/api/login', (req, res) => {
    const db = loadDb();
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!username || !password) {
      res.status(400).json({ error: 'Username dan password wajib diisi.' });
      return;
    }

    const user = db.USERS.find(
      (u) => String(u.USERNAME).toLowerCase() === username && String(u.ACTIVE).toUpperCase() === 'YA'
    );
    if (!user || !user.SALT || hashPassword(password, user.SALT) !== user.PASSWORD_HASH) {
      res.status(401).json({ error: 'Username atau password salah.' });
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const safeUser: SafeUser = {
      id: user.USER_ID,
      name: user.NAME,
      email: user.EMAIL,
      username: user.USERNAME,
      role: user.ROLE,
      schoolLevel: user.SCHOOL_LEVEL,
    };
    sessions.set(token, { user: safeUser, expiresAt: Date.now() + SESSION_TTL_MS });
    logAction(db, safeUser, 'LOGIN', 'AUTH', safeUser.id, 'Login berhasil');
    saveDb(db);

    res.json({ token, user: safeUser, settings: db.SETTINGS });
  });

  app.post('/api/logout', (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (token) sessions.delete(token);
    res.json({ ok: true });
  });

  app.get('/api/bootstrap', requireAuth, (req: AuthedRequest, res) => {
    const db = loadDb();
    res.json({
      user: req.user,
      settings: db.SETTINGS,
      academicYears: db.ACADEMIC_YEARS,
      classes: db.CLASSES,
      subjects: db.SUBJECTS.filter((s) => String(s.ACTIVE).toUpperCase() === 'YA'),
      students: db.STUDENTS,
      enrollments: db.ENROLLMENTS,
    });
  });

  app.get('/api/dashboard', requireAuth, (req, res) => {
    const db = loadDb();
    const sem = String(req.query.semester || db.SETTINGS.ACTIVE_SEMESTER || '1');
    const year = String(req.query.academicYear || db.SETTINGS.ACADEMIC_YEAR || '');

    const enrolled = getStudentsForYearAndClass(db, year, '');
    const studentIds = new Set(enrolled.map((e) => e.student.STUDENT_ID));
    const studentById = new Map(enrolled.map((e) => [e.student.STUDENT_ID, e.student]));
    const classes = db.CLASSES.filter(
      (r) =>
        String(r.ACTIVE).toUpperCase() === 'YA' &&
        (!year || String(r.ACADEMIC_YEAR).trim() === year)
    );
    const subjects = db.SUBJECTS.filter((r) => String(r.ACTIVE).toUpperCase() === 'YA');
    const subjectIds = new Set(subjects.map((s) => s.SUBJECT_ID));

    const reports = db.REPORT_FILES.filter(
      (r) =>
        String(r.SEMESTER) === sem &&
        String(r.ACADEMIC_YEAR) === year &&
        String(r.STATUS) === 'READY' &&
        studentIds.has(r.STUDENT_ID)
    );
    const readySet = new Set(reports.map((r) => r.STUDENT_ID));

    const scorePairs = new Set<string>();
    for (const s of db.SCORES) {
      if (
        String(s.SEMESTER) === sem &&
        String(s.ACADEMIC_YEAR) === year &&
        studentIds.has(s.STUDENT_ID) &&
        subjectIds.has(s.SUBJECT_ID) &&
        cleanScoreValue(s.FINAL_SCORE) !== ''
      ) {
        scorePairs.add(`${s.STUDENT_ID}|${s.SUBJECT_ID}`);
      }
    }

    const expected = Math.max(1, enrolled.length * subjects.length);
    const scoreCompletion = enrolled.length
      ? Math.min(100, Math.round((scorePairs.size / expected) * 100))
      : 0;
    const reportCompletion = enrolled.length
      ? Math.min(100, Math.round((readySet.size / enrolled.length) * 100))
      : 0;

    const recent = [...reports]
      .sort((a, b) => String(b.GENERATED_AT).localeCompare(String(a.GENERATED_AT)))
      .slice(0, 5)
      .map((r) => ({
        ...r,
        STUDENT_NAME: studentById.get(r.STUDENT_ID)?.NAME || r.STUDENT_ID,
      }));

    const provMap = new Map<
      string,
      {
        male: number;
        female: number;
        total: number;
        regencies: Map<string, { male: number; female: number; total: number }>;
      }
    >();
    for (const { student: st } of enrolled) {
      const prov = String(st.PROVINCE || '').trim() || 'Belum Diisi';
      const reg = String(st.REGENCY || '').trim() || 'Belum Diisi';
      const female = isFemaleGender(st.GENDER);
      let provEntry = provMap.get(prov);
      if (!provEntry) {
        provEntry = { male: 0, female: 0, total: 0, regencies: new Map() };
        provMap.set(prov, provEntry);
      }
      if (female) provEntry.female += 1;
      else provEntry.male += 1;
      provEntry.total += 1;

      let regEntry = provEntry.regencies.get(reg);
      if (!regEntry) {
        regEntry = { male: 0, female: 0, total: 0 };
        provEntry.regencies.set(reg, regEntry);
      }
      if (female) regEntry.female += 1;
      else regEntry.male += 1;
      regEntry.total += 1;
    }

    const provinceStats = Array.from(provMap.entries())
      .map(([province, info]) => ({
        province,
        male: info.male,
        female: info.female,
        total: info.total,
        regencies: Array.from(info.regencies.entries())
          .map(([regency, rInfo]) => ({
            regency,
            male: rInfo.male,
            female: rInfo.female,
            total: rInfo.total,
          }))
          .sort((a, b) => {
            if (a.regency === 'Belum Diisi') return 1;
            if (b.regency === 'Belum Diisi') return -1;
            return b.total - a.total || a.regency.localeCompare(b.regency);
          }),
      }))
      .sort((a, b) => {
        if (a.province === 'Belum Diisi') return 1;
        if (b.province === 'Belum Diisi') return -1;
        return b.total - a.total || a.province.localeCompare(b.province);
      });

    res.json({
      academicYear: year,
      semester: sem,
      studentCount: enrolled.length,
      classCount: classes.length,
      subjectCount: subjects.length,
      scoreCompletion,
      reportCompletion,
      recent,
      provinceStats,
    });
  });

  app.get('/api/records/:entity', requireAuth, (req, res) => {
    const entity = req.params.entity as keyof typeof ENTITY_MAP;
    const cfg = ENTITY_MAP[entity];
    if (!cfg) {
      res.status(400).json({ error: `Entitas tidak dikenal: ${entity}` });
      return;
    }
    const db = loadDb();
    res.json(db[cfg.table]);
  });

  app.post('/api/records/:entity', requireAuth, (req: AuthedRequest, res) => {
    try {
      const entity = req.params.entity as keyof typeof ENTITY_MAP;
      const cfg = ENTITY_MAP[entity];
      if (!cfg) {
        res.status(400).json({ error: `Entitas tidak dikenal: ${entity}` });
        return;
      }
      authorizeEdit(req.user!, entity);
      const db = loadDb();
      const record = { ...(req.body || {}) };
      if (!record[cfg.idField]) {
        record[cfg.idField] = makeId(cfg.prefix);
      }
      if (entity === 'subjects') {
        if (!record.SUBJECT_NAME_ARAB && record.GROUP_NAME && /[\u0600-\u06FF]/.test(record.GROUP_NAME)) {
          record.SUBJECT_NAME_ARAB = record.GROUP_NAME;
          record.GROUP_NAME = 'A';
        }
        const parsedLevels = parseSubjectLevels(record.LEVEL);
        record.LEVEL = parsedLevels.length
          ? parsedLevels.join(', ')
          : String(db.SETTINGS.SCHOOL_LEVEL || 'WUSTHA').trim().toUpperCase();
      }
      record.UPDATED_AT = nowStr();

      const list = db[cfg.table] as unknown as Record<string, unknown>[];
      const idx = list.findIndex((item) => String(item[cfg.idField]) === String(record[cfg.idField]));
      const enrollmentYear = String(record.ENROLLMENT_YEAR || '').trim();
      if (entity === 'students') {
        delete record.ENROLLMENT_YEAR;
        record.NIS = normalizeImportedIdentifier(record.NIS);
        record.NISN = normalizeImportedIdentifier(record.NISN);
        record.NIK = normalizeImportedIdentifier(record.NIK);
        record.KK_NUMBER = normalizeImportedIdentifier(record.KK_NUMBER);
        record.NAME = sanitizeImportedText(record.NAME);
        record.BIRTH_PLACE = normalizeImportedLatinTitle(record.BIRTH_PLACE);
        record.BIRTH_DATE = normalizeImportedDateIso(record.BIRTH_DATE);
        record.FATHER_NAME = sanitizeImportedText(record.FATHER_NAME);
        record.MOTHER_NAME = sanitizeImportedText(record.MOTHER_NAME);
        record.RT_RW = sanitizeImportedText(record.RT_RW);
        record.VILLAGE = normalizeImportedLatinTitle(record.VILLAGE);
        record.DISTRICT = normalizeImportedLatinTitle(record.DISTRICT);
        record.REGENCY = normalizeImportedLatinTitle(record.REGENCY);
        record.PROVINCE = normalizeImportedLatinTitle(record.PROVINCE);
        record.PHONE = normalizeImportedIdentifier(record.PHONE);
        record.ADDRESS = sanitizeImportedText(record.ADDRESS);

        const nikInfo = parseNikInfo(record.NIK);
        if (nikInfo) {
          if (!String(record.BIRTH_DATE ?? '').trim()) {
            record.BIRTH_DATE = nikInfo.birthDate;
          }
          if (!String(record.GENDER ?? '').trim()) {
            record.GENDER = nikInfo.gender;
          }
        }

        const wilayah = lookupWilayahFromNik(record.NIK);
        if (wilayah) {
          if (!String(record.PROVINCE ?? '').trim() && wilayah.province) {
            record.PROVINCE = wilayah.province;
          }
          if (!String(record.REGENCY ?? '').trim() && wilayah.regency) {
            record.REGENCY = wilayah.regency;
          }
          if (!String(record.DISTRICT ?? '').trim() && wilayah.district) {
            record.DISTRICT = wilayah.district;
          }
          if (!String(record.VILLAGE ?? '').trim() && wilayah.defaultVillage) {
            record.VILLAGE = wilayah.defaultVillage;
          }
        }

        if (record.KK_NUMBER) {
          const kkParents = findParentsByKk(
            record.KK_NUMBER,
            db.STUDENTS,
            String(record.STUDENT_ID || '')
          );
          if (kkParents) {
            if (!String(record.FATHER_NAME ?? '').trim() && kkParents.fatherName) {
              record.FATHER_NAME = kkParents.fatherName;
            }
            if (!String(record.MOTHER_NAME ?? '').trim() && kkParents.motherName) {
              record.MOTHER_NAME = kkParents.motherName;
            }
          }
        }

        const dupErr = validateStudentIdentifiers(
          {
            STUDENT_ID: String(record.STUDENT_ID || ''),
            NIS: record.NIS,
            NISN: record.NISN,
            NIK: record.NIK,
          },
          db.STUDENTS
        );
        if (dupErr) {
          res.status(400).json({ error: dupErr });
          return;
        }

        const normalizedStatus = String(record.STATUS || 'AKTIF').trim().toUpperCase();
        record.STATUS = ['AKTIF', 'LULUS', 'NONAKTIF'].includes(normalizedStatus)
          ? normalizedStatus
          : 'AKTIF';

        const normalizedKedatangan = normalizeDateInput(record.KEDATANGAN);
        if (normalizedKedatangan) {
          record.KEDATANGAN = normalizedKedatangan;
        } else {
          record.KEDATANGAN = String(record.KEDATANGAN ?? '').trim();
        }

        if (record.STATUS === 'AKTIF') {
          record.STATUS_DATE = '';
        } else {
          record.STATUS_DATE = normalizeDateInput(record.STATUS_DATE) || String(record.STATUS_DATE ?? '').trim();
        }

        const statusDateErr = validateStudentStatusDate(
          record.STATUS,
          record.STATUS_DATE,
          record.KEDATANGAN
        );
        if (statusDateErr) {
          res.status(400).json({ error: statusDateErr });
          return;
        }

        const computedMasa = computeMasaBelajar(
          record.KEDATANGAN,
          record.STATUS,
          record.STATUS_DATE,
          record.MASA_BELAJAR
        );
        record.MASA_BELAJAR = computedMasa;

        const waliModeRaw = String(record.WALI_MODE ?? '').trim().toUpperCase();
        const waliMode = ['AYAH', 'IBU', 'ORANG_TUA', 'MANUAL'].includes(waliModeRaw)
          ? waliModeRaw
          : '';
        record.WALI_MODE = waliMode;
        let waliName = String(record.WALI_NAME ?? '').trim();
        let waliRelation = String(record.WALI_RELATION ?? '').trim();
        if (waliMode === 'AYAH') {
          if (!waliName) waliName = String(record.FATHER_NAME ?? '').trim();
          if (!waliRelation) waliRelation = 'Ayah Kandung';
        } else if (waliMode === 'IBU') {
          if (!waliName) waliName = String(record.MOTHER_NAME ?? '').trim();
          if (!waliRelation) waliRelation = 'Ibu Kandung';
        }
        record.WALI_NAME = waliName;
        record.WALI_RELATION = waliRelation;
        record.WALI_ADDRESS = String(record.WALI_ADDRESS ?? '').trim();
        record.PARENT_NAME =
          waliName ||
          String(record.PARENT_NAME ?? '').trim() ||
          String(record.FATHER_NAME ?? '').trim() ||
          String(record.MOTHER_NAME ?? '').trim();

        const rawPhoto = typeof record.PHOTO === 'string' ? record.PHOTO.trim() : '';
        if (rawPhoto && (!rawPhoto.startsWith('data:image/') || rawPhoto.length > 2_500_000)) {
          res.status(400).json({ error: 'Format atau ukuran foto siswa tidak valid (maksimal ~1.5 MB).' });
          return;
        }
        record.PHOTO = rawPhoto;
      }

      if (idx >= 0) {
        list[idx] = { ...list[idx], ...record };
      } else {
        list.push(record);
      }

      if (entity === 'students' && record.CLASS_ID) {
        const cls = db.CLASSES.find((c) => c.CLASS_ID === String(record.CLASS_ID));
        const targetYear =
          enrollmentYear || String(cls?.ACADEMIC_YEAR || db.SETTINGS.ACADEMIC_YEAR || '').trim();
        upsertStudentEnrollment(
          db,
          String(record.STUDENT_ID),
          String(record.CLASS_ID),
          targetYear,
          String(record.STATUS || 'AKTIF')
        );
      }
      if (entity === 'classes' && record.ACADEMIC_YEAR) {
        ensureMultiYearIntegrity(db);
      }

      logAction(db, req.user!, 'SAVE', cfg.table, String(record[cfg.idField]), 'Simpan data');
      saveDb(db);
      res.json(record);
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : 'Gagal menyimpan data.' });
    }
  });

  app.delete('/api/records/:entity/:id', requireAuth, (req: AuthedRequest, res) => {
    try {
      const entity = req.params.entity as keyof typeof ENTITY_MAP;
      const cfg = ENTITY_MAP[entity];
      if (!cfg) {
        res.status(400).json({ error: `Entitas tidak dikenal: ${entity}` });
        return;
      }
      authorizeEdit(req.user!, entity);
      const db = loadDb();
      const id = req.params.id;
      const list = db[cfg.table] as unknown as Record<string, unknown>[];
      const filtered = list.filter((item) => String(item[cfg.idField]) !== String(id));
      (db[cfg.table] as unknown as Record<string, unknown>[]) = filtered;
      if (entity === 'students') {
        db.ENROLLMENTS = db.ENROLLMENTS.filter((e) => e.STUDENT_ID !== id);
      }
      logAction(db, req.user!, 'DELETE', cfg.table, id, 'Hapus data');
      saveDb(db);
      res.json({ ok: true });
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : 'Gagal menghapus data.' });
    }
  });

  app.get('/api/wilayah/nik/:nik', requireAuth, (req, res) => {
    const info = lookupWilayahFromNik(req.params.nik);
    res.json(
      info || {
        province: '',
        regency: '',
        district: '',
        villages: [],
        defaultVillage: '',
      }
    );
  });

  app.post('/api/students/import', requireAuth, (req: AuthedRequest, res) => {
    try {
      authorizeEdit(req.user!, 'students');
      const db = loadDb();
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const targetYear = String(req.body?.academicYear || db.SETTINGS.ACADEMIC_YEAR || '').trim();
      const yearClasses = db.CLASSES.filter((c) => !targetYear || String(c.ACADEMIC_YEAR).trim() === targetYear);
      const classPool = yearClasses.length ? yearClasses : db.CLASSES;
      const classMap = new Map(classPool.map((c) => [String(c.CLASS_NAME).trim().toLowerCase(), c.CLASS_ID]));
      const fallbackClassId = classPool[0]?.CLASS_ID || db.CLASSES[0]?.CLASS_ID || '';

      const normalizeKey = (k: string) => k.trim().toUpperCase().replace(/[\s_/-]+/g, '');
      const getField = (row: Record<string, unknown>, ...aliases: string[]): unknown => {
        const mapped = new Map<string, unknown>();
        for (const [k, v] of Object.entries(row)) {
          mapped.set(normalizeKey(k), v);
        }
        for (const alias of aliases) {
          const val = mapped.get(normalizeKey(alias));
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            return val;
          }
        }
        return '';
      };
      const formatExcelDate = (val: unknown): string => normalizeImportedDateIso(val);

      const pendingStudents: StudentRecord[] = [];
      const pendingEnrollments: { studentId: string; classId: string; year: string }[] = [];

      for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const r = rows[rowIdx] as Record<string, unknown>;
        const name = sanitizeImportedText(getField(r, 'NAMA LENGKAP', 'NAMA_LENGKAP', 'NAMA', 'NAME'));
        if (!name) continue;
        const className = sanitizeImportedText(getField(r, 'NAMA_KELAS', 'KELAS', 'CLASS_NAME')).toLowerCase();
        const studentId = makeId('STD');
        const resolvedClassId = classMap.get(className) || fallbackClassId;

        const nis = normalizeImportedIdentifier(getField(r, 'NIS'));
        const nisn = normalizeImportedIdentifier(getField(r, 'NISN'));
        const nik = normalizeImportedIdentifier(getField(r, 'NIK'));
        const kkNumber = normalizeImportedIdentifier(getField(r, 'NOMOR KK', 'NO KK', 'KK_NUMBER'));

        const combinedPool = [...db.STUDENTS, ...pendingStudents];
        const dupErr = validateStudentIdentifiers({ NIS: nis, NISN: nisn, NIK: nik }, combinedPool);
        if (dupErr) {
          res.status(400).json({ error: `Baris ${rowIdx + 2} (${name}): ${dupErr}` });
          return;
        }

        const nikInfo = parseNikInfo(nik);
        const rawGenderField = sanitizeImportedText(getField(r, 'JENIS KELAMIN', 'JK', 'GENDER'));
        const birthPlace = normalizeImportedLatinTitle(getField(r, 'TEMPAT LAHIR', 'TEMPAT_LAHIR', 'BIRTH_PLACE'));
        let birthDate = formatExcelDate(getField(r, 'TANGGAL LAHIR', 'TANGGAL_LAHIR', 'BIRTH_DATE'));
        if (!birthDate && nikInfo) {
          birthDate = nikInfo.birthDate;
        }
        const gender = rawGenderField
          ? normalizeImportedGender(rawGenderField)
          : nikInfo
            ? nikInfo.gender
            : 'L';

        let fatherName = sanitizeImportedText(getField(r, 'NAMA AYAH', 'NAMA_AYAH', 'AYAH', 'FATHER_NAME'));
        let motherName = sanitizeImportedText(getField(r, 'NAMA IBU', 'NAMA_IBU', 'IBU', 'MOTHER_NAME'));
        if (kkNumber && (!fatherName || !motherName)) {
          const kkParents = findParentsByKk(kkNumber, combinedPool);
          if (kkParents) {
            if (!fatherName && kkParents.fatherName) fatherName = kkParents.fatherName;
            if (!motherName && kkParents.motherName) motherName = kkParents.motherName;
          }
        }

        const rtRw = sanitizeImportedText(getField(r, 'RT/RW', 'RT_RW', 'RTRW'));
        let village = normalizeImportedLatinTitle(getField(r, 'DESA/KEL', 'DESA', 'KELURAHAN', 'VILLAGE'));
        let district = normalizeImportedLatinTitle(getField(r, 'KECAMATAN', 'DISTRICT'));
        let regency = normalizeImportedLatinTitle(getField(r, 'KABUPATEN/KOTA', 'KABUPATEN', 'KOTA', 'REGENCY'));
        let province = normalizeImportedLatinTitle(getField(r, 'PROVINSI', 'PROVINCE'));

        const wilayah = lookupWilayahFromNik(nik);
        if (wilayah) {
          if (!province && wilayah.province) province = wilayah.province;
          if (!regency && wilayah.regency) regency = wilayah.regency;
          if (!district && wilayah.district) district = wilayah.district;
          if (!village && wilayah.defaultVillage) village = wilayah.defaultVillage;
        }

        const kedatangan = formatExcelDate(getField(r, 'KEDATANGAN'));
        const status = normalizeImportedStatus(getField(r, 'STATUS') || 'AKTIF');
        const rawStatusDate = formatExcelDate(
          getField(r, 'TANGGAL NONAKTIF', 'TANGGAL LULUS', 'TGL NONAKTIF', 'TGL LULUS', 'STATUS_DATE')
        );
        const statusDate = status === 'AKTIF' ? '' : rawStatusDate;

        const statusDateErr = validateStudentStatusDate(status, statusDate, kedatangan);
        if (statusDateErr) {
          res.status(400).json({ error: `Baris ${rowIdx + 2} (${name}): ${statusDateErr}` });
          return;
        }

        const rawMasaBelajar = sanitizeImportedText(getField(r, 'MASABELAJAR', 'MASA BELAJAR', 'MASA_BELAJAR'));
        const masaBelajar = computeMasaBelajar(kedatangan, status, statusDate, rawMasaBelajar);
        const explicitAddress = sanitizeImportedText(getField(r, 'ALAMAT', 'ADDRESS'));
        const composedAddress =
          explicitAddress ||
          [rtRw ? `RT/RW ${rtRw}` : '', village, district, regency, province].filter(Boolean).join(', ');

        const waliName = sanitizeImportedText(
          getField(r, 'NAMA WALI', 'WALI', 'WALI_NAME', 'NAMA_ORTU_WALI') || ''
        );
        const waliRelation = normalizeImportedLatinTitle(
          getField(r, 'HUBUNGAN WALI', 'HUBUNGAN KELUARGA', 'HUBUNGAN', 'WALI_RELATION') || ''
        );
        const waliAddress = sanitizeImportedText(
          getField(r, 'ALAMAT WALI', 'WALI_ADDRESS') || ''
        );
        const waliMode = waliName ? 'MANUAL' : '';

        pendingStudents.push({
          STUDENT_ID: studentId,
          NIS: nis,
          NAME: name,
          NIK: nik,
          KK_NUMBER: kkNumber,
          BIRTH_PLACE: birthPlace,
          BIRTH_DATE: birthDate,
          GENDER: gender,
          NISN: nisn,
          FATHER_NAME: fatherName,
          MOTHER_NAME: motherName,
          RT_RW: rtRw,
          VILLAGE: village,
          DISTRICT: district,
          REGENCY: regency,
          PROVINCE: province,
          KEDATANGAN: kedatangan,
          MASA_BELAJAR: masaBelajar,
          CLASS_ID: resolvedClassId,
          RELIGION: normalizeImportedLatinTitle(getField(r, 'AGAMA', 'RELIGION') || 'Islam') || 'Islam',
          PHONE: normalizeImportedIdentifier(getField(r, 'TELEPON', 'NO HP', 'PHONE')),
          ADDRESS: composedAddress,
          PARENT_NAME: waliName || fatherName || motherName,
          WALI_MODE: waliMode,
          WALI_NAME: waliName,
          WALI_RELATION: waliRelation,
          WALI_ADDRESS: waliAddress,
          PHOTO: '',
          STATUS: status,
          STATUS_DATE: statusDate,
          UPDATED_AT: nowStr(),
        });

        const clsObj = db.CLASSES.find((c) => c.CLASS_ID === resolvedClassId);
        pendingEnrollments.push({
          studentId,
          classId: resolvedClassId,
          year: String(clsObj?.ACADEMIC_YEAR || targetYear || db.SETTINGS.ACADEMIC_YEAR),
        });
      }

      for (const st of pendingStudents) {
        db.STUDENTS.push(st);
      }
      for (const enr of pendingEnrollments) {
        upsertStudentEnrollment(db, enr.studentId, enr.classId, enr.year, 'AKTIF');
      }

      const importedCount = pendingStudents.length;
      logAction(db, req.user!, 'IMPORT_EXCEL', 'STUDENTS', '', `${importedCount} siswa diimport`);
      saveDb(db);
      res.json({ count: importedCount });
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : 'Gagal import siswa.' });
    }
  });

  app.get('/api/scores/grid', requireAuth, (req, res) => {
    const classId = String(req.query.classId || '');
    const subjectId = String(req.query.subjectId || '');
    const semester = String(req.query.semester || '1');
    const academicYear = String(req.query.academicYear || '');
    if (!classId || !subjectId) {
      res.status(400).json({ error: 'Kelas dan mata pelajaran wajib dipilih.' });
      return;
    }

    const db = loadDb();
    const students = getStudentsForYearAndClass(db, academicYear, classId).map((e) => e.student);

    const scoreMap = new Map<string, ScoreRecord>();
    for (const s of db.SCORES) {
      if (s.SUBJECT_ID === subjectId && String(s.SEMESTER) === semester && String(s.ACADEMIC_YEAR) === academicYear) {
        scoreMap.set(s.STUDENT_ID, s);
      }
    }

    const grid = students.map((s, i) => {
      const sc = scoreMap.get(s.STUDENT_ID);
      const pts = sc ? cleanScoreValue(sc.PTS) : '';
      const pas = sc ? cleanScoreValue(sc.PAS) : '';
      const finalScore = sc ? cleanScoreValue(sc.FINAL_SCORE) : '';
      return {
        no: i + 1,
        studentId: s.STUDENT_ID,
        nis: s.NIS,
        nisn: s.NISN,
        name: s.NAME,
        scoreId: sc?.SCORE_ID || '',
        pts,
        pas,
        finalScore,
        finalScoreArab: finalScore !== '' ? numberToArabicWords(finalScore) : '',
      };
    });

    res.json(grid);
  });

  app.post('/api/scores/save', requireAuth, (req: AuthedRequest, res) => {
    try {
      authorizeEdit(req.user!, 'scores');
      const { subjectId, semester, academicYear, rows } = req.body || {};
      if (!subjectId || !semester || !academicYear) {
        res.status(400).json({ error: 'Filter penilaian belum lengkap.' });
        return;
      }

      const db = loadDb();
      const scoreById = new Map(db.SCORES.map((s, idx) => [s.SCORE_ID, idx]));
      const scoreByKey = new Map(
        db.SCORES.map((s, idx) => [`${s.STUDENT_ID}|${s.SUBJECT_ID}|${s.SEMESTER}|${s.ACADEMIC_YEAR}`, idx])
      );

      const { ptsWeight, pasWeight } = parseScoreWeights(db.SETTINGS);
      let saved = 0;
      for (const r of rows || []) {
        const calc = computeFinalScore(r.pts, r.pas, ptsWeight, pasWeight);
        if (calc.finalScore === '') {
          // If both cleared, remove existing score if present
          const key = `${r.studentId}|${subjectId}|${semester}|${academicYear}`;
          const existingIdx = r.scoreId ? scoreById.get(r.scoreId) : scoreByKey.get(key);
          if (existingIdx !== undefined) {
            db.SCORES[existingIdx] = null as unknown as ScoreRecord;
          }
          continue;
        }

        const key = `${r.studentId}|${subjectId}|${semester}|${academicYear}`;
        const existingIdx = r.scoreId ? scoreById.get(r.scoreId) : scoreByKey.get(key);
        const rec: ScoreRecord = {
          SCORE_ID: existingIdx !== undefined && db.SCORES[existingIdx] ? db.SCORES[existingIdx].SCORE_ID : makeId('SCR'),
          STUDENT_ID: r.studentId,
          SUBJECT_ID: subjectId,
          SEMESTER: String(semester),
          ACADEMIC_YEAR: String(academicYear),
          PTS: calc.pts,
          PAS: calc.pas,
          FINAL_SCORE: calc.finalScore,
          FINAL_SCORE_ARAB: numberToArabicWords(calc.finalScore),
          UPDATED_AT: nowStr(),
        };

        if (existingIdx !== undefined && db.SCORES[existingIdx]) {
          db.SCORES[existingIdx] = rec;
        } else {
          db.SCORES.push(rec);
        }
        saved++;
      }

      db.SCORES = db.SCORES.filter(Boolean);
      logAction(db, req.user!, 'BULK_SAVE', 'SCORES', subjectId, `${saved} nilai disimpan`);
      saveDb(db);
      res.json({ saved });
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : 'Gagal menyimpan nilai.' });
    }
  });

  app.get('/api/attendance-syakhsiyah/grid', requireAuth, (req, res) => {
    const classId = String(req.query.classId || '');
    const semester = String(req.query.semester || '1');
    const academicYear = String(req.query.academicYear || '');
    if (!classId) {
      res.status(400).json({ error: 'Kelas wajib dipilih.' });
      return;
    }

    const db = loadDb();
    const students = getStudentsForYearAndClass(db, academicYear, classId).map((e) => e.student);

    const noteMap = new Map<string, TeacherNoteRecord>();
    for (const n of db.TEACHER_NOTES) {
      if (String(n.SEMESTER) === semester && String(n.ACADEMIC_YEAR) === academicYear) {
        noteMap.set(n.STUDENT_ID, n);
      }
    }

    const grid = students.map((s, i) => {
      const nt = noteMap.get(s.STUDENT_ID);
      return {
        no: i + 1,
        studentId: s.STUDENT_ID,
        nis: s.NIS,
        nisn: s.NISN,
        name: s.NAME,
        noteId: nt?.NOTE_ID || '',
        sick: nt ? Number(nt.SICK || 0) : 0,
        permission: nt ? Number(nt.PERMISSION || 0) : 0,
        absent: nt ? Number(nt.ABSENT || 0) : 0,
        suluk: nt?.SYAKHSIYAH_SULUK || nt?.ATTITUDE || 'ممتاز',
        nadhafah: nt?.SYAKHSIYAH_NADHAFAH || 'ممتاز',
        muwazhabah: nt?.SYAKHSIYAH_MUWAZHABAH || 'ممتاز',
        note: nt?.NOTE || '',
      };
    });

    res.json(grid);
  });

  app.post('/api/attendance-syakhsiyah/save', requireAuth, (req: AuthedRequest, res) => {
    try {
      authorizeEdit(req.user!, 'scores');
      const { semester, academicYear, rows } = req.body || {};
      if (!semester || !academicYear) {
        res.status(400).json({ error: 'Filter semester dan tahun pelajaran belum lengkap.' });
        return;
      }

      const db = loadDb();
      const noteById = new Map(db.TEACHER_NOTES.map((n, idx) => [n.NOTE_ID, idx]));
      const noteByKey = new Map(
        db.TEACHER_NOTES.map((n, idx) => [`${n.STUDENT_ID}|${n.SEMESTER}|${n.ACADEMIC_YEAR}`, idx])
      );

      let saved = 0;
      for (const r of rows || []) {
        const key = `${r.studentId}|${semester}|${academicYear}`;
        const existingIdx = r.noteId ? noteById.get(r.noteId) : noteByKey.get(key);
        const existing = existingIdx !== undefined ? db.TEACHER_NOTES[existingIdx] : undefined;

        const clampInt = (v: unknown) => {
          const n = Math.floor(Number(v));
          return Number.isFinite(n) && n >= 0 ? n : 0;
        };

        const suluk = String(r.suluk ?? '').trim();
        const nadhafah = String(r.nadhafah ?? '').trim();
        const muwazhabah = String(r.muwazhabah ?? '').trim();

        const rec: TeacherNoteRecord = {
          NOTE_ID: existing ? existing.NOTE_ID : makeId('NOTE'),
          STUDENT_ID: r.studentId,
          SEMESTER: String(semester),
          ACADEMIC_YEAR: String(academicYear),
          ATTITUDE: suluk || existing?.ATTITUDE || '',
          SYAKHSIYAH_SULUK: suluk,
          SYAKHSIYAH_NADHAFAH: nadhafah,
          SYAKHSIYAH_MUWAZHABAH: muwazhabah,
          SICK: clampInt(r.sick),
          PERMISSION: clampInt(r.permission),
          ABSENT: clampInt(r.absent),
          NOTE: r.note !== undefined ? String(r.note) : existing?.NOTE || '',
          TAHFIDZ_TYPE: existing?.TAHFIDZ_TYPE || '',
          TAHFIDZ_SCORE: existing?.TAHFIDZ_SCORE ?? '',
          UPDATED_AT: nowStr(),
        };

        if (existingIdx !== undefined && db.TEACHER_NOTES[existingIdx]) {
          db.TEACHER_NOTES[existingIdx] = rec;
        } else {
          db.TEACHER_NOTES.push(rec);
        }
        saved++;
      }

      logAction(db, req.user!, 'BULK_SAVE', 'TEACHER_NOTES', '', `${saved} ketidakhadiran & syakhsiyah disimpan`);
      saveDb(db);
      res.json({ saved });
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : 'Gagal menyimpan ketidakhadiran & syakhsiyah.' });
    }
  });

  const normalizeTahfidzType = (raw: unknown): string => {
    const val = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!val || val === '-') return '';
    if (val === 'yanbua' || val === "yanbu'a") return 'Yanbua';
    if (val === 'binnadzor' || val === 'bin nadzor' || val === 'bin-nadzor') return 'Binnadzor';
    if (val === 'bil ghoib' || val === 'bilghoib' || val === 'bil-ghoib' || val === 'bil ghaib') {
      return 'Bil Ghoib';
    }
    return '';
  };

  app.get('/api/tahfidz/grid', requireAuth, (req, res) => {
    const classId = String(req.query.classId || '');
    const semester = String(req.query.semester || '1');
    const academicYear = String(req.query.academicYear || '');
    if (!classId) {
      res.status(400).json({ error: 'Kelas wajib dipilih.' });
      return;
    }

    const db = loadDb();
    const students = getStudentsForYearAndClass(db, academicYear, classId).map((e) => e.student);
    const noteMap = new Map<string, TeacherNoteRecord>();
    for (const n of db.TEACHER_NOTES) {
      if (String(n.SEMESTER) === semester && String(n.ACADEMIC_YEAR) === academicYear) {
        noteMap.set(n.STUDENT_ID, n);
      }
    }

    const grid = students.map((s, i) => {
      const nt = noteMap.get(s.STUDENT_ID);
      const score = nt ? cleanScoreValue(nt.TAHFIDZ_SCORE) : '';
      const tahfidzType = normalizeTahfidzType(nt?.TAHFIDZ_TYPE);
      return {
        no: i + 1,
        studentId: s.STUDENT_ID,
        nis: s.NIS,
        nisn: s.NISN,
        name: s.NAME,
        noteId: nt?.NOTE_ID || '',
        tahfidzType,
        tahfidzScore: score,
        tahfidzScoreArab: score !== '' ? formatTahfidzKitabah(tahfidzType, score) : '',
      };
    });

    res.json(grid);
  });

  app.post('/api/tahfidz/save', requireAuth, (req: AuthedRequest, res) => {
    try {
      authorizeEdit(req.user!, 'scores');
      const { semester, academicYear, rows } = req.body || {};
      if (!semester || !academicYear) {
        res.status(400).json({ error: 'Filter semester dan tahun pelajaran belum lengkap.' });
        return;
      }

      const db = loadDb();
      const noteById = new Map(db.TEACHER_NOTES.map((n, idx) => [n.NOTE_ID, idx]));
      const noteByKey = new Map(
        db.TEACHER_NOTES.map((n, idx) => [`${n.STUDENT_ID}|${n.SEMESTER}|${n.ACADEMIC_YEAR}`, idx])
      );

      let saved = 0;
      for (const r of rows || []) {
        const key = `${r.studentId}|${semester}|${academicYear}`;
        const existingIdx = r.noteId ? noteById.get(r.noteId) : noteByKey.get(key);
        const existing = existingIdx !== undefined ? db.TEACHER_NOTES[existingIdx] : undefined;

        const tahfidzType = normalizeTahfidzType(r.tahfidzType);
        const tahfidzScore = cleanScoreValue(r.tahfidzScore);

        const rec: TeacherNoteRecord = {
          NOTE_ID: existing ? existing.NOTE_ID : makeId('NOTE'),
          STUDENT_ID: r.studentId,
          SEMESTER: String(semester),
          ACADEMIC_YEAR: String(academicYear),
          ATTITUDE: existing?.ATTITUDE || 'ممتاز',
          SYAKHSIYAH_SULUK: existing?.SYAKHSIYAH_SULUK || 'ممتاز',
          SYAKHSIYAH_NADHAFAH: existing?.SYAKHSIYAH_NADHAFAH || 'ممتاز',
          SYAKHSIYAH_MUWAZHABAH: existing?.SYAKHSIYAH_MUWAZHABAH || 'ممتاز',
          SICK: existing ? Number(existing.SICK || 0) : 0,
          PERMISSION: existing ? Number(existing.PERMISSION || 0) : 0,
          ABSENT: existing ? Number(existing.ABSENT || 0) : 0,
          NOTE: existing?.NOTE || '',
          TAHFIDZ_TYPE: tahfidzType,
          TAHFIDZ_SCORE: tahfidzScore,
          UPDATED_AT: nowStr(),
        };

        if (existingIdx !== undefined && db.TEACHER_NOTES[existingIdx]) {
          db.TEACHER_NOTES[existingIdx] = rec;
        } else {
          db.TEACHER_NOTES.push(rec);
        }
        saved++;
      }

      logAction(db, req.user!, 'BULK_SAVE', 'TEACHER_NOTES', '', `${saved} nilai tahfidz disimpan`);
      saveDb(db);
      res.json({ saved });
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : 'Gagal menyimpan nilai tahfidz.' });
    }
  });

  app.get('/api/recap', requireAuth, (req, res) => {
    const classId = String(req.query.classId || '');
    const semester = String(req.query.semester || '1');
    const academicYear = String(req.query.academicYear || '');
    const db = loadDb();
    res.json(computeRecapData(db, classId, semester, academicYear, true));
  });

  app.get('/api/recap/transcript/:studentId', requireAuth, (req, res) => {
    const studentId = req.params.studentId;
    const db = loadDb();
    const student = db.STUDENTS.find((s) => s.STUDENT_ID === studentId);
    if (!student) {
      res.status(404).json({ error: 'Siswa tidak ditemukan.' });
      return;
    }

    const classMap = new Map(db.CLASSES.map((c) => [c.CLASS_ID, c.CLASS_NAME]));
    const termMap = new Map<string, { academicYear: string; semester: string }>();

    for (const sc of db.SCORES) {
      if (sc.STUDENT_ID === studentId && cleanScoreValue(sc.FINAL_SCORE) !== '') {
        const y = String(sc.ACADEMIC_YEAR || '').trim();
        const sem = String(sc.SEMESTER || '').trim();
        if (y && sem) termMap.set(`${y}|${sem}`, { academicYear: y, semester: sem });
      }
    }
    for (const rc of db.RECAP) {
      if (rc.STUDENT_ID === studentId) {
        const y = String(rc.ACADEMIC_YEAR || '').trim();
        const sem = String(rc.SEMESTER || '').trim();
        if (y && sem) termMap.set(`${y}|${sem}`, { academicYear: y, semester: sem });
      }
    }
    for (const nt of db.TEACHER_NOTES) {
      if (nt.STUDENT_ID === studentId) {
        const y = String(nt.ACADEMIC_YEAR || '').trim();
        const sem = String(nt.SEMESTER || '').trim();
        if (y && sem) termMap.set(`${y}|${sem}`, { academicYear: y, semester: sem });
      }
    }

    const sortedTerms = Array.from(termMap.entries())
      .sort((a, b) => {
        const yCmp = a[1].academicYear.localeCompare(b[1].academicYear);
        if (yCmp !== 0) return yCmp;
        return Number(a[1].semester) - Number(b[1].semester);
      });

    // Gather subjects: subjects matching any class level the student enrolled in + any scored historical subject
    const isFemale = isFemaleGender(student.GENDER);
    const studentScoreSubjectIds = new Set(
      db.SCORES.filter((sc) => sc.STUDENT_ID === studentId && cleanScoreValue(sc.FINAL_SCORE) !== '').map(
        (sc) => sc.SUBJECT_ID
      )
    );
    const studentLevelSet = new Set<string>();
    const currentCls = db.CLASSES.find((c) => c.CLASS_ID === student.CLASS_ID);
    if (currentCls?.LEVEL) studentLevelSet.add(String(currentCls.LEVEL).trim().toUpperCase());
    for (const [, { academicYear }] of sortedTerms) {
      const cid = getStudentClassIdForYear(db, student, academicYear);
      const cls = db.CLASSES.find((c) => c.CLASS_ID === cid);
      if (cls?.LEVEL) studentLevelSet.add(String(cls.LEVEL).trim().toUpperCase());
    }
    const levelArr = Array.from(studentLevelSet);

    const subjectList = db.SUBJECTS
      .filter(
        (s) =>
          studentScoreSubjectIds.has(s.SUBJECT_ID) ||
          (String(s.ACTIVE).toUpperCase() === 'YA' &&
            (levelArr.length === 0 || levelArr.some((lvl) => subjectMatchesLevel(s.LEVEL, lvl))))
      )
      .sort((a, b) => Number(a.DISPLAY_ORDER || 0) - Number(b.DISPLAY_ORDER || 0));

    const scoreLookup = new Map<string, number | ''>();
    for (const sc of db.SCORES) {
      if (sc.STUDENT_ID === studentId) {
        const val = cleanScoreValue(sc.FINAL_SCORE);
        if (val !== '') {
          scoreLookup.set(`${sc.ACADEMIC_YEAR}|${sc.SEMESTER}|${sc.SUBJECT_ID}`, val);
        }
      }
    }

    const terms: TranscriptTermInfo[] = [];
    const allTermAverages: number[] = [];

    for (const [key, { academicYear, semester }] of sortedTerms) {
      const termClassId = getStudentClassIdForYear(db, student, academicYear);
      const computed = computeRecapData(db, termClassId, semester, academicYear, false);
      const stRow = computed.rows.find((r) => r.studentId === studentId);

      // Compute student's own total/average across all scored subjects if classId changed
      let total: number | '' = stRow && stRow.total !== '' ? Number(stRow.total) : '';
      let average: number | '' = stRow && stRow.average !== '' ? Number(stRow.average) : '';
      if (total === '' || average === '') {
        let sum = 0;
        let cnt = 0;
        for (const sub of subjectList) {
          const val = scoreLookup.get(`${key}|${sub.SUBJECT_ID}`);
          if (val !== undefined && val !== '') {
            sum += Number(val);
            cnt++;
          }
        }
        if (cnt > 0) {
          total = Math.round((sum + Number.EPSILON) * 10) / 10;
          average = Math.round((sum / cnt + Number.EPSILON) * 10) / 10;
        }
      }

      const rawCat =
        stRow?.category && stRow.category !== '-'
          ? stRow.category
          : getGradeCategory(average, db.SETTINGS.GRADE_CATEGORIES);
      const category = formatGradeCategoryArabic(rawCat, isFemale);
      const promo = getPromotionDecision(semester, rawCat, isFemale);

      const note = db.TEACHER_NOTES.find(
        (n) =>
          n.STUDENT_ID === studentId &&
          String(n.SEMESTER) === semester &&
          String(n.ACADEMIC_YEAR) === academicYear
      );
      const tahfidzType = String(note?.TAHFIDZ_TYPE || '').trim();
      const tahfidzScore = note ? cleanScoreValue(note.TAHFIDZ_SCORE) : '';

      if (average !== '') allTermAverages.push(Number(average));

      terms.push({
        key,
        academicYear,
        semester,
        label: `${academicYear} · Sem ${semester}`,
        className: classMap.get(termClassId) || '-',
        total,
        totalArab: total !== '' ? numberToArabicWords(total) : '-',
        average,
        averageArab: average !== '' ? numberToArabicWords(average) : '-',
        rank: stRow?.rank ?? '-',
        category,
        promotionStatus: promo ? promo.status : '-',
        promotionStatusArab: promo ? promo.arabic : '-',
        tahfidz: {
          type: tahfidzType,
          score: tahfidzScore,
          kitabah: tahfidzScore !== '' ? formatTahfidzKitabah(tahfidzType, tahfidzScore) : '-',
        },
        attendance: {
          sick: Number(note?.SICK || 0),
          permission: Number(note?.PERMISSION || 0),
          absent: Number(note?.ABSENT || 0),
          suluk: note?.SYAKHSIYAH_SULUK || note?.ATTITUDE || '-',
          nadhafah: note?.SYAKHSIYAH_NADHAFAH || '-',
          muwazhabah: note?.SYAKHSIYAH_MUWAZHABAH || '-',
        },
      });
    }

    const subjects = subjectList.map((sub) => {
      const scoresByTerm: Record<string, number | ''> = {};
      let sum = 0;
      let cnt = 0;
      for (const [key] of sortedTerms) {
        const val = scoreLookup.get(`${key}|${sub.SUBJECT_ID}`);
        scoresByTerm[key] = val !== undefined ? val : '';
        if (val !== undefined && val !== '') {
          sum += Number(val);
          cnt++;
        }
      }
      const avg: number | '' = cnt > 0 ? Math.round((sum / cnt + Number.EPSILON) * 10) / 10 : '';
      return {
        id: sub.SUBJECT_ID,
        code: sub.CODE,
        name: sub.SUBJECT_NAME,
        nameArab: sub.SUBJECT_NAME_ARAB || sub.SUBJECT_NAME,
        scoresByTerm,
        average: avg,
      };
    });

    const cumulativeAverage: number | '' = allTermAverages.length
      ? Math.round((allTermAverages.reduce((a, b) => a + b, 0) / allTermAverages.length + Number.EPSILON) * 10) / 10
      : '';

    const payload: StudentTranscriptResponse = {
      student,
      className: classMap.get(student.CLASS_ID) || '-',
      terms,
      subjects,
      overall: {
        termCount: terms.length,
        subjectCount: subjects.length,
        cumulativeAverage,
        cumulativeAverageArab: cumulativeAverage !== '' ? numberToArabicWords(cumulativeAverage) : '-',
        cumulativeCategory: formatGradeCategoryArabic(
          getGradeCategory(cumulativeAverage, db.SETTINGS.GRADE_CATEGORIES),
          isFemale
        ),
      },
    };

    res.json(payload);
  });

  app.get('/api/reports/students', requireAuth, (req, res) => {
    const classId = String(req.query.classId || '');
    const semester = String(req.query.semester || '1');
    const academicYear = String(req.query.academicYear || '');
    const db = loadDb();

    const classMap = new Map(db.CLASSES.map((c) => [c.CLASS_ID, c.CLASS_NAME]));
    const enrolled = getStudentsForYearAndClass(db, academicYear, classId);

    const reportMap = new Map<string, ReportFileRecord>();
    for (const r of db.REPORT_FILES) {
      if (String(r.SEMESTER) === semester && String(r.ACADEMIC_YEAR) === academicYear) {
        reportMap.set(r.STUDENT_ID, r);
      }
    }

    const scoreCountMap = new Map<string, number>();
    for (const sc of db.SCORES) {
      if (String(sc.SEMESTER) === semester && String(sc.ACADEMIC_YEAR) === academicYear && cleanScoreValue(sc.FINAL_SCORE) !== '') {
        scoreCountMap.set(sc.STUDENT_ID, (scoreCountMap.get(sc.STUDENT_ID) || 0) + 1);
      }
    }

    res.json(
      enrolled.map(({ student: s, classId: stClassId }, idx) => {
        const rep = reportMap.get(s.STUDENT_ID);
        const scoreCount = scoreCountMap.get(s.STUDENT_ID) || 0;
        return {
          no: idx + 1,
          studentId: s.STUDENT_ID,
          name: s.NAME,
          fatherName: s.FATHER_NAME,
          nis: s.NIS,
          nisn: s.NISN,
          classId: stClassId,
          className: classMap.get(stClassId) || '-',
          scoreCount,
          docUrl: rep?.DOC_URL || '',
          pdfUrl: rep?.PDF_URL || '',
          status: rep?.STATUS || (scoreCount ? 'DRAFT' : 'BELUM ADA NILAI'),
          generatedAt: rep?.GENERATED_AT || '',
        };
      })
    );
  });

  app.get('/api/reports/preview/:studentId', requireAuth, (req, res) => {
    try {
      const db = loadDb();
      const semester = String(req.query.semester || '1');
      const academicYear = String(req.query.academicYear || db.SETTINGS.ACADEMIC_YEAR);
      res.json(buildReportPreview(db, req.params.studentId, semester, academicYear));
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Preview gagal dibuat.' });
    }
  });

  app.post('/api/reports/generate', requireAuth, (req: AuthedRequest, res) => {
    try {
      authorizeReport(req.user!);
      const { studentIds, semester, academicYear } = req.body || {};
      const ids: string[] = Array.isArray(studentIds) ? studentIds : [];
      if (!ids.length) {
        res.status(400).json({ error: 'Pilih minimal satu siswa.' });
        return;
      }
      const db = loadDb();
      const idSet = new Set(ids);
      db.REPORT_FILES = db.REPORT_FILES.filter(
        (r) => !(idSet.has(r.STUDENT_ID) && String(r.SEMESTER) === String(semester) && String(r.ACADEMIC_YEAR) === String(academicYear))
      );

      const touchedClasses = new Set<string>();
      for (const sid of ids) {
        const st = db.STUDENTS.find((s) => s.STUDENT_ID === sid);
        if (st) {
          const cid = getStudentClassIdForYear(db, st, String(academicYear));
          if (cid) touchedClasses.add(cid);
        }
      }
      touchedClasses.forEach((cid) => computeRecapData(db, cid, String(semester), String(academicYear), true));

      const generatedAt = nowStr();
      for (const sid of ids) {
        db.REPORT_FILES.push({
          REPORT_ID: makeId('RPT'),
          STUDENT_ID: sid,
          SEMESTER: String(semester),
          ACADEMIC_YEAR: String(academicYear),
          DOC_ID: `preview://${sid}`,
          DOC_URL: `#preview:${sid}`,
          PDF_ID: `pdf://${sid}`,
          PDF_URL: `#print:${sid}`,
          STATUS: 'READY',
          GENERATED_AT: generatedAt,
        });
      }

      logAction(db, req.user!, 'GENERATE_BATCH', 'REPORT_FILES', '', `${ids.length} rapor disiapkan`);
      saveDb(db);
      res.json({ count: ids.length });
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : 'Gagal memproses rapor.' });
    }
  });

  app.post('/api/reports/reset', requireAuth, (req: AuthedRequest, res) => {
    try {
      authorizeReport(req.user!);
      const { studentIds, semester, academicYear } = req.body || {};
      const idSet = new Set(Array.isArray(studentIds) ? studentIds : []);
      const db = loadDb();
      const before = db.REPORT_FILES.length;
      db.REPORT_FILES = db.REPORT_FILES.filter(
        (r) => !(idSet.has(r.STUDENT_ID) && String(r.SEMESTER) === String(semester) && String(r.ACADEMIC_YEAR) === String(academicYear))
      );
      const removed = before - db.REPORT_FILES.length;
      logAction(db, req.user!, 'BULK_RESET', 'REPORT_FILES', '', `${removed} rapor direset`);
      saveDb(db);
      res.json({ removed });
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : 'Gagal mereset rapor.' });
    }
  });

  app.get('/api/settings', requireAuth, (_req, res) => {
    const db = loadDb();
    res.json(db.SETTINGS);
  });

  app.post('/api/settings', requireAuth, (req: AuthedRequest, res) => {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Hanya admin yang dapat mengubah pengaturan.' });
      return;
    }
    const db = loadDb();
    const allowed = [
      'SCHOOL_NAME',
      'SCHOOL_LEVEL',
      'NPSN',
      'SCHOOL_ADDRESS',
      'SHEIKH_NAME',
      'SHEIKH_SIGNATURE',
      'PRINCIPAL_NAME',
      'PRINCIPAL_NIP',
      'ACADEMIC_YEAR',
      'ACTIVE_SEMESTER',
      'CITY',
      'REPORT_DATE',
      'LOGO_FILE_ID',
      'GRADE_CATEGORIES',
      'SYAKHSIYAH_CATEGORIES',
      'EXTRA_CATEGORIES',
      'PTS_WEIGHT',
      'PAS_WEIGHT',
      'RANK_BASIS',
      'APPS_SCRIPT_WEBHOOK_URL',
      'APPS_SCRIPT_SYNC_KEY',
      'GOOGLE_SHEET_NAME',
      'GOOGLE_SHEET_URL',
      'GOOGLE_AUTO_SYNC',
      'GOOGLE_LAST_SYNC',
      'GOOGLE_LAST_SYNC_ERROR',
    ];
    const body = req.body || {};
    const hasPts = Object.prototype.hasOwnProperty.call(body, 'PTS_WEIGHT');
    const hasPas = Object.prototype.hasOwnProperty.call(body, 'PAS_WEIGHT');
    if (hasPts || hasPas) {
      const ptsRaw = hasPts ? body.PTS_WEIGHT : (db.SETTINGS.PTS_WEIGHT ?? '30');
      const pasRaw = hasPas ? body.PAS_WEIGHT : (db.SETTINGS.PAS_WEIGHT ?? '70');
      const ptsNum = Number(String(ptsRaw ?? '').replace(',', '.').trim());
      const pasNum = Number(String(pasRaw ?? '').replace(',', '.').trim());
      if (
        String(ptsRaw ?? '').trim() === '' ||
        String(pasRaw ?? '').trim() === '' ||
        !Number.isFinite(ptsNum) ||
        !Number.isFinite(pasNum) ||
        ptsNum < 0 ||
        ptsNum > 100 ||
        pasNum < 0 ||
        pasNum > 100 ||
        Math.round((ptsNum + pasNum) * 100) !== 10000
      ) {
        res.status(400).json({
          error: 'Prosentase nilai PTS dan PAS masing-masing harus 0–100% dengan total tepat 100%.',
        });
        return;
      }
      db.SETTINGS.PTS_WEIGHT = String(Math.round(ptsNum * 100) / 100);
      db.SETTINGS.PAS_WEIGHT = String(Math.round(pasNum * 100) / 100);
    }

    for (const k of allowed) {
      if (k === 'PTS_WEIGHT' || k === 'PAS_WEIGHT') continue;
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        if (k === 'REPORT_DATE') {
          const formatted = formatDateDDMMYYYY(body[k]);
          db.SETTINGS[k] = formatted || sanitizeImportedText(body[k]);
        } else if (k === 'RANK_BASIS') {
          const basis = String(body[k] ?? '').trim().toUpperCase();
          db.SETTINGS[k] = basis === 'AVERAGE' ? 'AVERAGE' : 'TOTAL';
        } else {
          db.SETTINGS[k] = String(body[k] ?? '');
        }
      }
    }
    ensureMultiYearIntegrity(db);
    logAction(db, req.user!, 'SAVE', 'SETTINGS', '', 'Pengaturan diperbarui');
    saveDb(db);
    res.json(db.SETTINGS);
  });

  app.get('/api/sync/status', requireAuth, (_req, res) => {
    const db = loadDb();
    res.json({
      autoSync: db.SETTINGS.GOOGLE_AUTO_SYNC === 'YA',
      webhookUrl: db.SETTINGS.APPS_SCRIPT_WEBHOOK_URL || '',
      sheetName: db.SETTINGS.GOOGLE_SHEET_NAME || '',
      sheetUrl: db.SETTINGS.GOOGLE_SHEET_URL || '',
      lastSync: db.SETTINGS.GOOGLE_LAST_SYNC || '',
      lastError: db.SETTINGS.GOOGLE_LAST_SYNC_ERROR || '',
      syncing: webhookSyncInFlight,
    });
  });

  app.post('/api/sync/test', requireAuth, async (req: AuthedRequest, res) => {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Hanya admin yang dapat mengatur koneksi Google Sheets.' });
      return;
    }
    try {
      const webhookUrl = validateWebhookUrl(String(req.body?.webhookUrl || ''));
      const syncKey = String(req.body?.syncKey || '').trim();
      const pingRes = await callAppsScriptWebhook(webhookUrl, { action: 'ping', syncKey });
      const db = loadDb();
      db.SETTINGS.APPS_SCRIPT_WEBHOOK_URL = webhookUrl;
      db.SETTINGS.APPS_SCRIPT_SYNC_KEY = syncKey;
      db.SETTINGS.GOOGLE_SHEET_NAME = pingRes.spreadsheetName || 'Google Spreadsheet';
      db.SETTINGS.GOOGLE_SHEET_URL = pingRes.spreadsheetUrl || '';
      db.SETTINGS.GOOGLE_LAST_SYNC_ERROR = '';
      logAction(db, req.user!, 'CONNECT', 'GOOGLE_SHEETS', '', `Terhubung ke ${db.SETTINGS.GOOGLE_SHEET_NAME}`);
      saveDb(db, true);
      res.json({
        ok: true,
        sheetName: db.SETTINGS.GOOGLE_SHEET_NAME,
        sheetUrl: db.SETTINGS.GOOGLE_SHEET_URL,
        sheetCount: pingRes.sheetCount || 0,
        settings: db.SETTINGS,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Gagal menghubungkan ke URL Apps Script.',
      });
    }
  });

  app.post('/api/sync/push', requireAuth, async (_req, res) => {
    try {
      const result = await runWebhookPushInternal();
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Gagal menyinkronkan ke Google Sheets.',
      });
    }
  });

  app.post('/api/sync/pull', requireAuth, async (req: AuthedRequest, res) => {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Hanya admin yang dapat menarik database dari Google Sheets.' });
      return;
    }
    try {
      const db = loadDb();
      const webhookUrl = validateWebhookUrl(String(db.SETTINGS.APPS_SCRIPT_WEBHOOK_URL || ''));
      const syncKey = String(db.SETTINGS.APPS_SCRIPT_SYNC_KEY || '').trim();
      const pullRes = await callAppsScriptWebhook(webhookUrl, { action: 'pull', syncKey });
      const sheets = pullRes.sheets;
      if (!sheets || Object.keys(sheets).length === 0) {
        res.status(400).json({ error: 'Tidak ada data sheet yang ditemukan pada Google Spreadsheet.' });
        return;
      }
      applyImportedDatabasePayload(db, sheets);
      const stamp = nowSyncFormatted();
      db.SETTINGS.GOOGLE_LAST_SYNC = stamp;
      db.SETTINGS.GOOGLE_LAST_SYNC_ERROR = '';
      if (pullRes.spreadsheetName) db.SETTINGS.GOOGLE_SHEET_NAME = pullRes.spreadsheetName;
      if (pullRes.spreadsheetUrl) db.SETTINGS.GOOGLE_SHEET_URL = pullRes.spreadsheetUrl;
      ensureMultiYearIntegrity(db);
      logAction(db, req.user!, 'PULL_SHEETS', 'DATABASE', '', 'Database ditarik dari Google Sheets');
      saveDb(db, true);
      res.json({
        ok: true,
        sheetName: db.SETTINGS.GOOGLE_SHEET_NAME || 'Google Spreadsheet',
        sheetUrl: db.SETTINGS.GOOGLE_SHEET_URL || '',
        lastSync: stamp,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Gagal menarik data dari Google Sheets.',
      });
    }
  });

  app.get('/api/users', requireAuth, (req: AuthedRequest, res) => {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Hanya admin yang dapat mengelola pengguna.' });
      return;
    }
    const db = loadDb();
    res.json(
      db.USERS.map((u) => ({
        USER_ID: u.USER_ID,
        NAME: u.NAME,
        EMAIL: u.EMAIL,
        USERNAME: u.USERNAME,
        ROLE: u.ROLE,
        SCHOOL_LEVEL: u.SCHOOL_LEVEL,
        ACTIVE: u.ACTIVE,
        UPDATED_AT: u.UPDATED_AT,
      }))
    );
  });

  app.post('/api/users', requireAuth, (req: AuthedRequest, res) => {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Hanya admin yang dapat mengelola pengguna.' });
      return;
    }
    const record = req.body || {};
    if (!record.NAME || !record.USERNAME || !record.ROLE) {
      res.status(400).json({ error: 'Nama, username, dan role wajib diisi.' });
      return;
    }
    if (record.PASSWORD && String(record.PASSWORD).length < 6) {
      res.status(400).json({ error: 'Password minimal 6 karakter.' });
      return;
    }

    const db = loadDb();
    const username = String(record.USERNAME).trim().toLowerCase();
    const duplicate = db.USERS.find((u) => String(u.USERNAME).toLowerCase() === username && u.USER_ID !== record.USER_ID);
    if (duplicate) {
      res.status(400).json({ error: 'Username sudah digunakan.' });
      return;
    }

    const existing = db.USERS.find((u) => u.USER_ID === record.USER_ID);
    const salt = existing?.SALT || crypto.randomBytes(16).toString('hex');
    const passwordHash = record.PASSWORD
      ? hashPassword(String(record.PASSWORD), salt)
      : existing?.PASSWORD_HASH;

    if (!passwordHash) {
      res.status(400).json({ error: 'Password wajib diisi untuk pengguna baru.' });
      return;
    }

    const userObj: UserRecord = {
      USER_ID: record.USER_ID || makeId('USR'),
      NAME: String(record.NAME).trim(),
      EMAIL: String(record.EMAIL || '').trim(),
      USERNAME: username,
      PASSWORD_HASH: passwordHash,
      SALT: salt,
      ROLE: String(record.ROLE).toUpperCase() as UserRole,
      SCHOOL_LEVEL: String(record.SCHOOL_LEVEL || db.SETTINGS.SCHOOL_LEVEL || 'WUSTHA').toUpperCase(),
      ACTIVE: String(record.ACTIVE || 'YA').toUpperCase(),
      UPDATED_AT: nowStr(),
    };

    if (existing) {
      Object.assign(existing, userObj);
    } else {
      db.USERS.push(userObj);
    }

    logAction(db, req.user!, 'SAVE', 'USERS', userObj.USER_ID, userObj.USERNAME);
    saveDb(db);
    res.json({
      USER_ID: userObj.USER_ID,
      NAME: userObj.NAME,
      EMAIL: userObj.EMAIL,
      USERNAME: userObj.USERNAME,
      ROLE: userObj.ROLE,
      SCHOOL_LEVEL: userObj.SCHOOL_LEVEL,
      ACTIVE: userObj.ACTIVE,
      UPDATED_AT: userObj.UPDATED_AT,
    });
  });

  app.delete('/api/users/:id', requireAuth, (req: AuthedRequest, res) => {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Hanya admin yang dapat mengelola pengguna.' });
      return;
    }
    if (req.user!.id === req.params.id) {
      res.status(400).json({ error: 'Akun yang sedang digunakan tidak dapat dihapus.' });
      return;
    }
    const db = loadDb();
    db.USERS = db.USERS.filter((u) => u.USER_ID !== req.params.id);
    logAction(db, req.user!, 'DELETE', 'USERS', req.params.id, 'Hapus pengguna');
    saveDb(db);
    res.json({ ok: true });
  });

  /* ===================== MULTI ACADEMIC YEAR & PROMOTION ===================== */
  app.get('/api/academic-years', requireAuth, (_req, res) => {
    const db = loadDb();
    const list = [...db.ACADEMIC_YEARS]
      .sort((a, b) => String(b.YEAR_NAME).localeCompare(String(a.YEAR_NAME)))
      .map((y) => {
        const yName = String(y.YEAR_NAME).trim();
        const classCount = db.CLASSES.filter((c) => String(c.ACADEMIC_YEAR).trim() === yName).length;
        const studentCount = new Set(
          db.ENROLLMENTS.filter(
            (e) => String(e.ACADEMIC_YEAR).trim() === yName && String(e.STATUS).toUpperCase() !== 'NONAKTIF'
          ).map((e) => e.STUDENT_ID)
        ).size;
        return { ...y, classCount, studentCount };
      });
    res.json(list);
  });

  app.post('/api/academic-years', requireAuth, (req: AuthedRequest, res) => {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Hanya admin yang dapat mengelola tahun ajaran.' });
      return;
    }
    const db = loadDb();
    const yearName = String(req.body?.yearName || '').trim();
    const activeSemester = String(req.body?.activeSemester || '1').trim() === '2' ? '2' : '1';
    const setActive = Boolean(req.body?.setActive);
    const cloneFromYear = String(req.body?.cloneFromYear || '').trim();
    const notes = String(req.body?.notes || '').trim();

    if (!yearName) {
      res.status(400).json({ error: 'Nama tahun ajaran wajib diisi (contoh: 2027/2028).' });
      return;
    }

    const yearId = String(req.body?.yearId || '').trim();
    const existing = db.ACADEMIC_YEARS.find(
      (y) => (yearId && y.YEAR_ID === yearId) || String(y.YEAR_NAME).trim() === yearName
    );

    let savedYear: AcademicYearRecord;
    if (existing) {
      existing.YEAR_NAME = yearName;
      existing.ACTIVE_SEMESTER = activeSemester;
      existing.NOTES = notes;
      existing.UPDATED_AT = nowStr();
      savedYear = existing;
    } else {
      savedYear = {
        YEAR_ID: makeId('YR'),
        YEAR_NAME: yearName,
        ACTIVE_SEMESTER: activeSemester,
        IS_ACTIVE: 'TIDAK',
        NOTES: notes,
        UPDATED_AT: nowStr(),
      };
      db.ACADEMIC_YEARS.push(savedYear);
    }

    let clonedClasses = 0;
    if (cloneFromYear && cloneFromYear !== yearName) {
      clonedClasses = cloneClassesBetweenYears(db, cloneFromYear, yearName).cloned;
    }

    if (setActive) {
      for (const y of db.ACADEMIC_YEARS) {
        y.IS_ACTIVE = y.YEAR_ID === savedYear.YEAR_ID ? 'YA' : 'TIDAK';
      }
      db.SETTINGS.ACADEMIC_YEAR = savedYear.YEAR_NAME;
      db.SETTINGS.ACTIVE_SEMESTER = activeSemester;
    }

    logAction(db, req.user!, 'SAVE', 'ACADEMIC_YEARS', savedYear.YEAR_ID, `${yearName} (cloned ${clonedClasses} kelas)`);
    saveDb(db);
    res.json({ year: savedYear, clonedClasses });
  });

  app.post('/api/academic-years/:id/activate', requireAuth, (req: AuthedRequest, res) => {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Hanya admin yang dapat mengaktifkan tahun ajaran.' });
      return;
    }
    const db = loadDb();
    const target = db.ACADEMIC_YEARS.find((y) => y.YEAR_ID === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Tahun ajaran tidak ditemukan.' });
      return;
    }
    const sem = req.body?.semester ? (String(req.body.semester) === '2' ? '2' : '1') : target.ACTIVE_SEMESTER || '1';
    for (const y of db.ACADEMIC_YEARS) {
      y.IS_ACTIVE = y.YEAR_ID === target.YEAR_ID ? 'YA' : 'TIDAK';
    }
    target.ACTIVE_SEMESTER = sem;
    target.UPDATED_AT = nowStr();
    db.SETTINGS.ACADEMIC_YEAR = target.YEAR_NAME;
    db.SETTINGS.ACTIVE_SEMESTER = sem;

    logAction(db, req.user!, 'ACTIVATE', 'ACADEMIC_YEARS', target.YEAR_ID, `Aktifkan ${target.YEAR_NAME} Sem ${sem}`);
    saveDb(db);
    res.json({ year: target, settings: db.SETTINGS });
  });

  app.delete('/api/academic-years/:id', requireAuth, (req: AuthedRequest, res) => {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Hanya admin yang dapat menghapus tahun ajaran.' });
      return;
    }
    const db = loadDb();
    const target = db.ACADEMIC_YEARS.find((y) => y.YEAR_ID === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Tahun ajaran tidak ditemukan.' });
      return;
    }
    if (target.IS_ACTIVE === 'YA' || target.YEAR_NAME === db.SETTINGS.ACADEMIC_YEAR) {
      res.status(400).json({ error: 'Tahun ajaran yang sedang aktif tidak dapat dihapus.' });
      return;
    }
    const yr = String(target.YEAR_NAME).trim();
    const hasUsage =
      db.SCORES.some((s) => String(s.ACADEMIC_YEAR).trim() === yr) ||
      db.ENROLLMENTS.some((e) => String(e.ACADEMIC_YEAR).trim() === yr) ||
      db.REPORT_FILES.some((f) => String(f.ACADEMIC_YEAR).trim() === yr);
    if (hasUsage) {
      res.status(400).json({ error: `Tahun ajaran ${yr} memiliki riwayat nilai/siswa/rapor sehingga tidak dapat dihapus.` });
      return;
    }
    db.ACADEMIC_YEARS = db.ACADEMIC_YEARS.filter((y) => y.YEAR_ID !== target.YEAR_ID);
    logAction(db, req.user!, 'DELETE', 'ACADEMIC_YEARS', target.YEAR_ID, `Hapus ${yr}`);
    saveDb(db);
    res.json({ ok: true });
  });

  app.post('/api/classes/clone', requireAuth, (req: AuthedRequest, res) => {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Hanya admin yang dapat menyalin struktur kelas.' });
      return;
    }
    const sourceYear = String(req.body?.sourceYear || '').trim();
    const targetYear = String(req.body?.targetYear || '').trim();
    if (!sourceYear || !targetYear || sourceYear === targetYear) {
      res.status(400).json({ error: 'Tahun asal dan tahun tujuan harus valid dan berbeda.' });
      return;
    }
    const db = loadDb();
    if (!db.ACADEMIC_YEARS.some((y) => String(y.YEAR_NAME).trim() === targetYear)) {
      db.ACADEMIC_YEARS.push({
        YEAR_ID: makeId('YR'),
        YEAR_NAME: targetYear,
        ACTIVE_SEMESTER: '1',
        IS_ACTIVE: 'TIDAK',
        UPDATED_AT: nowStr(),
      });
    }
    const result = cloneClassesBetweenYears(db, sourceYear, targetYear);
    logAction(db, req.user!, 'CLONE_CLASSES', 'CLASSES', '', `${sourceYear} -> ${targetYear} (${result.cloned} kelas)`);
    saveDb(db);
    res.json(result);
  });

  app.get('/api/promotions/preview', requireAuth, (req, res) => {
    const sourceYear = String(req.query.sourceYear || '').trim();
    const sourceClassId = String(req.query.sourceClassId || '').trim();
    const targetYear = String(req.query.targetYear || '').trim();
    if (!sourceYear || !sourceClassId) {
      res.status(400).json({ error: 'Tahun ajaran asal dan kelas asal wajib dipilih.' });
      return;
    }
    const db = loadDb();
    const sourceClass = db.CLASSES.find((c) => c.CLASS_ID === sourceClassId) || null;
    const targetClasses = db.CLASSES.filter(
      (c) => String(c.ACTIVE).toUpperCase() === 'YA' && (!targetYear || String(c.ACADEMIC_YEAR).trim() === targetYear)
    );

    const enrolled = getStudentsForYearAndClass(db, sourceYear, sourceClassId);
    const sem2Recap = computeRecapData(db, sourceClassId, '2', sourceYear, false);
    const recapByStudent = new Map(sem2Recap.rows.map((r) => [r.studentId, r]));

    // Smart target class matcher
    const srcGradeNum = Number(String(sourceClass?.GRADE || '').replace(/[^\d]/g, ''));
    const srcClassName = String(sourceClass?.CLASS_NAME || '').trim();
    const srcSuffix = srcClassName.replace(/^\d+/, '').trim().toLowerCase();

    const findMatchedClassId = (desiredGradeNum: number, fallbackSameName: boolean): string => {
      if (!targetClasses.length) return '';
      const sameLevelPool = targetClasses.filter(
        (c) => !sourceClass?.LEVEL || String(c.LEVEL) === String(sourceClass.LEVEL)
      );
      const pool = sameLevelPool.length ? sameLevelPool : targetClasses;

      if (fallbackSameName) {
        const exact = pool.find(
          (c) => String(c.CLASS_NAME).trim().toLowerCase() === srcClassName.toLowerCase()
        );
        if (exact) return exact.CLASS_ID;
      }

      if (Number.isFinite(desiredGradeNum) && desiredGradeNum > 0) {
        const desiredGradeStr = String(desiredGradeNum);
        const withSuffix = pool.find(
          (c) =>
            String(c.GRADE).trim() === desiredGradeStr &&
            (!srcSuffix || String(c.CLASS_NAME).trim().toLowerCase().endsWith(srcSuffix))
        );
        if (withSuffix) return withSuffix.CLASS_ID;
        const anyGrade = pool.find((c) => String(c.GRADE).trim() === desiredGradeStr);
        if (anyGrade) return anyGrade.CLASS_ID;
      }
      return pool[0]?.CLASS_ID || '';
    };

    const nextGradeClassId = Number.isFinite(srcGradeNum) && srcGradeNum > 0
      ? findMatchedClassId(srcGradeNum + 1, false)
      : '';
    const sameGradeClassId = findMatchedClassId(srcGradeNum, true);

    const rows: PromotionCandidateRow[] = enrolled.map(({ student, enrollment }, idx) => {
      const r = recapByStudent.get(student.STUDENT_ID);
      const sem2Avg: number | '' =
        r && r.average !== '' && Number.isFinite(Number(r.average)) ? Number(r.average) : '';
      const sem2Cat = r ? r.category : '-';
      const sem2Rank = r ? r.rank : '-';
      const isFemale = isFemaleGender(student.GENDER);
      const promoRule = getPromotionDecision('2', sem2Cat, isFemale);

      let ruleDecision: 'NAIK' | 'TINGGAL' | 'BELUM' = 'BELUM';
      let ruleLabel = 'Belum Ada Nilai Sem 2';
      if (sem2Cat && sem2Cat !== '-') {
        if (promoRule?.isRetained) {
          ruleDecision = 'TINGGAL';
          ruleLabel = isFemale ? 'Tidak Naik (راسبة)' : 'Tidak Naik (راسب)';
        } else {
          ruleDecision = 'NAIK';
          ruleLabel = isFemale ? 'Naik Kelas (ترقى)' : 'Naik Kelas (يرقى)';
        }
      }

      const existingDecision = enrollment?.PROMOTION_RESULT || 'BELUM';
      const existingNextClassId = enrollment?.NEXT_CLASS_ID || '';

      let recommendedAction: 'NAIK' | 'TINGGAL' | 'LULUS' | 'PINDAH' =
        ruleDecision === 'TINGGAL' ? 'TINGGAL' : 'NAIK';
      if (['NAIK', 'TINGGAL', 'LULUS', 'PINDAH'].includes(existingDecision)) {
        recommendedAction = existingDecision as 'NAIK' | 'TINGGAL' | 'LULUS' | 'PINDAH';
      } else if (ruleDecision === 'NAIK' && !nextGradeClassId && srcGradeNum >= 3) {
        // Common terminal grade (e.g., Grade 3 Wustha/Ulya/'Aly)
        recommendedAction = 'LULUS';
      }

      let recommendedTargetClassId = '';
      if (existingNextClassId && targetClasses.some((c) => c.CLASS_ID === existingNextClassId)) {
        recommendedTargetClassId = existingNextClassId;
      } else if (recommendedAction === 'NAIK') {
        recommendedTargetClassId = nextGradeClassId || targetClasses[0]?.CLASS_ID || '';
      } else if (recommendedAction === 'TINGGAL') {
        recommendedTargetClassId = sameGradeClassId || targetClasses[0]?.CLASS_ID || '';
      }

      return {
        no: idx + 1,
        studentId: student.STUDENT_ID,
        nis: student.NIS,
        nisn: student.NISN,
        name: student.NAME,
        currentStatus: student.STATUS,
        sem2Average: sem2Avg,
        sem2Category: sem2Cat,
        sem2Rank,
        ruleDecision,
        ruleLabel,
        existingDecision,
        existingNextClassId,
        recommendedAction,
        recommendedTargetClassId,
      };
    });

    res.json({
      sourceYear,
      targetYear,
      sourceClass,
      targetClasses,
      rows,
    });
  });

  app.post('/api/promotions/execute', requireAuth, (req: AuthedRequest, res) => {
    try {
      if (!['ADMIN', 'WALI_KELAS'].includes(req.user!.role)) {
        throw new Error('Hanya Admin atau Wali Kelas yang dapat memproses kenaikan kelas.');
      }
      const sourceYear = String(req.body?.sourceYear || '').trim();
      const sourceClassId = String(req.body?.sourceClassId || '').trim();
      const targetYear = String(req.body?.targetYear || '').trim();
      const items = Array.isArray(req.body?.items) ? req.body.items : [];

      if (!sourceYear || !sourceClassId) {
        res.status(400).json({ error: 'Tahun asal dan kelas asal wajib ditentukan.' });
        return;
      }
      if (!items.length) {
        res.status(400).json({ error: 'Tidak ada siswa untuk diproses.' });
        return;
      }

      const db = loadDb();
      const needsTargetYear = items.some((it: { action?: string }) =>
        it.action === 'NAIK' || it.action === 'TINGGAL'
      );
      if (needsTargetYear) {
        if (!targetYear) {
          res.status(400).json({ error: 'Tahun ajaran tujuan wajib dipilih.' });
          return;
        }
        if (targetYear === sourceYear) {
          res.status(400).json({ error: 'Tahun ajaran tujuan tidak boleh sama dengan tahun asal.' });
          return;
        }
        if (!db.ACADEMIC_YEARS.some((y) => String(y.YEAR_NAME).trim() === targetYear)) {
          db.ACADEMIC_YEARS.push({
            YEAR_ID: makeId('YR'),
            YEAR_NAME: targetYear,
            ACTIVE_SEMESTER: '1',
            IS_ACTIVE: 'TIDAK',
            UPDATED_AT: nowStr(),
          });
        }
      }

      const classSet = new Set(db.CLASSES.map((c) => c.CLASS_ID));
      let processed = 0;
      let promoted = 0;
      let retained = 0;
      let graduated = 0;
      let moved = 0;

      for (const item of items) {
        const studentId = String(item.studentId || '').trim();
        const action = String(item.action || 'SKIP').toUpperCase();
        const targetClassId = String(item.targetClassId || '').trim();
        if (!studentId || action === 'SKIP') continue;

        const student = db.STUDENTS.find((s) => s.STUDENT_ID === studentId);
        if (!student) continue;

        if ((action === 'NAIK' || action === 'TINGGAL') && (!targetClassId || !classSet.has(targetClassId))) {
          throw new Error(`Kelas tujuan belum dipilih atau tidak valid untuk siswa ${student.NAME}.`);
        }

        // Record decision on source year enrollment
        let srcEnr = db.ENROLLMENTS.find(
          (e) => e.STUDENT_ID === studentId && String(e.ACADEMIC_YEAR).trim() === sourceYear
        );
        if (!srcEnr) {
          srcEnr = {
            ENROLLMENT_ID: makeId('ENR'),
            STUDENT_ID: studentId,
            CLASS_ID: sourceClassId,
            ACADEMIC_YEAR: sourceYear,
            STATUS: 'AKTIF',
            PROMOTION_RESULT: action,
            UPDATED_AT: nowStr(),
          };
          db.ENROLLMENTS.push(srcEnr);
        }
        srcEnr.PROMOTION_RESULT = action;
        srcEnr.NEXT_ACADEMIC_YEAR = action === 'NAIK' || action === 'TINGGAL' ? targetYear : '';
        srcEnr.NEXT_CLASS_ID = action === 'NAIK' || action === 'TINGGAL' ? targetClassId : '';
        srcEnr.UPDATED_AT = nowStr();

        if (action === 'NAIK' || action === 'TINGGAL') {
          upsertStudentEnrollment(db, studentId, targetClassId, targetYear, 'AKTIF');
          student.CLASS_ID = targetClassId;
          student.STATUS = 'AKTIF';
          student.STATUS_DATE = '';
          student.MASA_BELAJAR = computeMasaBelajar(student.KEDATANGAN, 'AKTIF', '', student.MASA_BELAJAR);
          student.UPDATED_AT = nowStr();
          if (action === 'NAIK') promoted++;
          else retained++;
        } else if (action === 'LULUS') {
          student.STATUS = 'LULUS';
          student.STATUS_DATE = student.STATUS_DATE || todayIsoDate();
          student.MASA_BELAJAR = computeMasaBelajar(
            student.KEDATANGAN,
            'LULUS',
            student.STATUS_DATE,
            student.MASA_BELAJAR
          );
          student.UPDATED_AT = nowStr();
          graduated++;
        } else if (action === 'PINDAH') {
          srcEnr.STATUS = 'PINDAH';
          student.STATUS = 'NONAKTIF';
          student.STATUS_DATE = student.STATUS_DATE || todayIsoDate();
          student.MASA_BELAJAR = computeMasaBelajar(
            student.KEDATANGAN,
            'NONAKTIF',
            student.STATUS_DATE,
            student.MASA_BELAJAR
          );
          student.UPDATED_AT = nowStr();
          moved++;
        }
        processed++;
      }

      logAction(
        db,
        req.user!,
        'PROMOTION',
        'ENROLLMENTS',
        sourceClassId,
        `${sourceYear} -> ${targetYear || '-'}: ${processed} diproses (${promoted} naik, ${retained} tinggal, ${graduated} lulus, ${moved} pindah)`
      );
      saveDb(db);
      res.json({ processed, promoted, retained, graduated, moved });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memproses kenaikan kelas.' });
    }
  });

  app.get('/api/database/export', requireAuth, (_req, res) => {
    const db = loadDb();
    res.json(buildExportSheetsPayload(db));
  });

  app.post('/api/database/import', requireAuth, (req: AuthedRequest, res) => {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Hanya admin yang dapat melakukan restore database.' });
      return;
    }
    const payload = (req.body || {}) as Record<string, unknown>;
    const db = loadDb();
    applyImportedDatabasePayload(db, payload);
    ensureMultiYearIntegrity(db);
    logAction(db, req.user!, 'RESTORE_WORKBOOK', 'DATABASE', '', 'Database diimpor dari workbook');
    saveDb(db);
    res.json({ ok: true });
  });

  function applyImportedDatabasePayload(db: DatabaseSchema, payload: Record<string, unknown>): void {
    const sanitizeRowStrings = (row: Record<string, unknown>): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        out[k] = typeof v === 'string' ? sanitizeImportedText(v) : v;
      }
      return out;
    };

    if (Array.isArray(payload.SETTINGS)) {
      const nextSettings = { ...db.SETTINGS };
      for (const rawRow of payload.SETTINGS) {
        const row = rawRow as Record<string, unknown>;
        const key = sanitizeImportedText(row.KEY);
        if (!key) continue;
        const rawVal = sanitizeImportedText(row.VALUE);
        if (rawVal === '[GAMBAR_TERLALU_BESAR_UNTUK_SEL]') continue;
        if (key === 'REPORT_DATE') {
          nextSettings[key] = normalizeImportedDateDDMMYYYY(row.VALUE) || rawVal;
        } else if (key === 'RANK_BASIS') {
          nextSettings[key] = rawVal.toUpperCase() === 'AVERAGE' ? 'AVERAGE' : 'TOTAL';
        } else {
          nextSettings[key] = rawVal;
        }
      }
      db.SETTINGS = nextSettings;
    }
    if (Array.isArray(payload.ACADEMIC_YEARS)) {
      db.ACADEMIC_YEARS = payload.ACADEMIC_YEARS.map((raw: Record<string, unknown>) => {
        const r = sanitizeRowStrings(raw);
        return {
          ...(r as unknown as AcademicYearRecord),
          YEAR_NAME: sanitizeImportedText(r.YEAR_NAME),
          ACTIVE_SEMESTER: sanitizeImportedText(r.ACTIVE_SEMESTER || '1') || '1',
          IS_ACTIVE: normalizeImportedYesNo(r.IS_ACTIVE, 'TIDAK'),
          NOTES: sanitizeImportedText(r.NOTES),
          UPDATED_AT: sanitizeImportedText(r.UPDATED_AT) || nowStr(),
        };
      });
    }
    if (Array.isArray(payload.CLASSES)) {
      db.CLASSES = payload.CLASSES.map((raw: Record<string, unknown>) => {
        const r = sanitizeRowStrings(raw);
        return {
          ...(r as unknown as ClassRecord),
          LEVEL: sanitizeImportedText(r.LEVEL || 'WUSTHA').toUpperCase(),
          GRADE: sanitizeImportedText(r.GRADE),
          CLASS_NAME: sanitizeImportedText(r.CLASS_NAME),
          HOMEROOM_TEACHER: sanitizeImportedText(r.HOMEROOM_TEACHER),
          ACADEMIC_YEAR: sanitizeImportedText(r.ACADEMIC_YEAR),
          ACTIVE: normalizeImportedYesNo(r.ACTIVE, 'YA'),
          UPDATED_AT: sanitizeImportedText(r.UPDATED_AT) || nowStr(),
        };
      });
    }
    if (Array.isArray(payload.STUDENTS)) {
      const prevPhotoById = new Map(db.STUDENTS.map((s) => [s.STUDENT_ID, s.PHOTO || '']));
      db.STUDENTS = payload.STUDENTS.map((raw: Record<string, unknown>) => {
        const r = sanitizeRowStrings(raw);
        const status = normalizeImportedStatus(r.STATUS || 'AKTIF');
        const birthDate = normalizeImportedDateIso(r.BIRTH_DATE);
        const kedatangan = normalizeImportedDateIso(r.KEDATANGAN);
        const statusDate = status === 'AKTIF' ? '' : normalizeImportedDateIso(r.STATUS_DATE);
        const rtRw = sanitizeImportedText(r.RT_RW);
        const village = normalizeImportedLatinTitle(r.VILLAGE);
        const district = normalizeImportedLatinTitle(r.DISTRICT);
        const regency = normalizeImportedLatinTitle(r.REGENCY);
        const province = normalizeImportedLatinTitle(r.PROVINCE);
        const explicitAddress = sanitizeImportedText(r.ADDRESS);
        const address =
          explicitAddress ||
          [rtRw ? `RT/RW ${rtRw}` : '', village, district, regency, province].filter(Boolean).join(', ');
        const rawPhoto = sanitizeImportedText(r.PHOTO);
        const resolvedPhoto =
          rawPhoto === '[GAMBAR_TERLALU_BESAR_UNTUK_SEL]'
            ? prevPhotoById.get(String(r.STUDENT_ID || '')) || ''
            : rawPhoto;
        return {
          ...(r as unknown as StudentRecord),
          NIS: normalizeImportedIdentifier(r.NIS),
          NISN: normalizeImportedIdentifier(r.NISN),
          NIK: normalizeImportedIdentifier(r.NIK),
          KK_NUMBER: normalizeImportedIdentifier(r.KK_NUMBER),
          NAME: sanitizeImportedText(r.NAME),
          FATHER_NAME: sanitizeImportedText(r.FATHER_NAME),
          MOTHER_NAME: sanitizeImportedText(r.MOTHER_NAME),
          GENDER: normalizeImportedGender(r.GENDER),
          BIRTH_PLACE: normalizeImportedLatinTitle(r.BIRTH_PLACE),
          BIRTH_DATE: birthDate,
          RELIGION: normalizeImportedLatinTitle(r.RELIGION || 'Islam') || 'Islam',
          RT_RW: rtRw,
          VILLAGE: village,
          DISTRICT: district,
          REGENCY: regency,
          PROVINCE: province,
          ADDRESS: address,
          KEDATANGAN: kedatangan,
          STATUS: status,
          STATUS_DATE: statusDate,
          MASA_BELAJAR: computeMasaBelajar(kedatangan, status, statusDate, r.MASA_BELAJAR),
          WALI_NAME: sanitizeImportedText(r.WALI_NAME),
          WALI_RELATION: normalizeImportedLatinTitle(r.WALI_RELATION),
          WALI_ADDRESS: sanitizeImportedText(r.WALI_ADDRESS),
          PARENT_NAME: sanitizeImportedText(r.PARENT_NAME || r.WALI_NAME || r.FATHER_NAME || r.MOTHER_NAME),
          PHOTO: resolvedPhoto,
          PHONE: normalizeImportedIdentifier(r.PHONE),
          UPDATED_AT: sanitizeImportedText(r.UPDATED_AT) || nowStr(),
        };
      });
    }
    if (Array.isArray(payload.ENROLLMENTS)) {
      db.ENROLLMENTS = payload.ENROLLMENTS.map((raw: Record<string, unknown>) => ({
        ...(sanitizeRowStrings(raw) as unknown as StudentEnrollmentRecord),
      }));
    }
    if (Array.isArray(payload.SUBJECTS)) {
      db.SUBJECTS = payload.SUBJECTS.map((raw: Record<string, unknown>) => {
        const r = sanitizeRowStrings(raw);
        const levels = parseSubjectLevels(r.LEVEL);
        return {
          ...(r as unknown as SubjectRecord),
          CODE: sanitizeImportedText(r.CODE).toUpperCase(),
          SUBJECT_NAME: sanitizeImportedText(r.SUBJECT_NAME),
          SUBJECT_NAME_ARAB: sanitizeImportedText(r.SUBJECT_NAME_ARAB),
          LEVEL: levels.length ? levels.join(', ') : String(db.SETTINGS.SCHOOL_LEVEL || 'WUSTHA').toUpperCase(),
          GROUP_NAME: sanitizeImportedText(r.GROUP_NAME || 'A').toUpperCase(),
          ACTIVE: normalizeImportedYesNo(r.ACTIVE, 'YA'),
          UPDATED_AT: sanitizeImportedText(r.UPDATED_AT) || nowStr(),
        };
      });
    }
    if (Array.isArray(payload.SCORES)) {
      const { ptsWeight, pasWeight } = parseScoreWeights(db.SETTINGS);
      db.SCORES = payload.SCORES.map((raw: Record<string, unknown>) => {
        const r = sanitizeRowStrings(raw);
        const calc = computeFinalScore(r.PTS, r.PAS, ptsWeight, pasWeight);
        return {
          ...(r as unknown as ScoreRecord),
          PTS: calc.pts,
          PAS: calc.pas,
          FINAL_SCORE: calc.finalScore,
          FINAL_SCORE_ARAB: calc.finalScore !== '' ? numberToArabicWords(calc.finalScore) : '',
          UPDATED_AT: sanitizeImportedText(r.UPDATED_AT) || nowStr(),
        };
      });
    }
    if (Array.isArray(payload.RECAP)) {
      db.RECAP = payload.RECAP.map((raw: Record<string, unknown>) => ({
        ...(sanitizeRowStrings(raw) as unknown as RecapRecord),
      }));
    }
    if (Array.isArray(payload.EXTRACURRICULAR)) {
      db.EXTRACURRICULAR = payload.EXTRACURRICULAR.map((raw: Record<string, unknown>) => ({
        ...(sanitizeRowStrings(raw) as unknown as ExtraRecord),
      }));
    }
    if (Array.isArray(payload.TEACHER_NOTES)) {
      db.TEACHER_NOTES = payload.TEACHER_NOTES.map((raw: Record<string, unknown>) => {
        const r = sanitizeRowStrings(raw);
        return {
          ...(r as unknown as TeacherNoteRecord),
          TAHFIDZ_TYPE: normalizeImportedTahfidzType(r.TAHFIDZ_TYPE),
          UPDATED_AT: sanitizeImportedText(r.UPDATED_AT) || nowStr(),
        };
      });
    }
    if (Array.isArray(payload.REPORT_FILES)) {
      db.REPORT_FILES = payload.REPORT_FILES.map((raw: Record<string, unknown>) => ({
        ...(sanitizeRowStrings(raw) as unknown as ReportFileRecord),
      }));
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`eRapor v2 server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
