export const FIXED_CODE_GS = `/**
 * eRapor Pesantren v2.7 - Google Apps Script (Optimized & Fixed)
 * 100% Google Drive + Google Sheets + Google Docs (1-Page Full Arabic Rapor + Terbilang)
 *
 * Perbaikan Utama:
 * 1. Request-scoped Spreadsheet caching (_ssCache_) -> OpenById dipanggil max 1x per request
 * 2. Batch Read/Write (batchUpsertObjects_ & batchAppendObjects_) -> 10x-20x lebih cepat untuk Simpan Nilai & Import Excel
 * 3. O(1) Map lookup di getDashboard, getScoreGrid, computeClassRecapData_, & getReportStudents
 * 4. Fix KRITIS toArabicDigits_(): tidak lagi menghapus tahun pelajaran, kelas, NIS/NISN, tanggal, & total > 100
 * 5. Fix KRITIS numberToArabicWords_(): mendukung total nilai > 100 & desimal presisi (e.g. .05)
 * 6. Fix setupERapor(): mengembalikan initialAccounts & menyediakan template mapel WUSTHA / ULYA / 'ALY
 * 7. Optimasi generateReportsBatch(): hitung rekapitulasi 1x untuk seluruh siswa terpilih + dukungan LOGO_FILE_ID
 */

const ERAPOR = {
  NAME: 'eRapor Sekolah v2',
  VERSION: '2.7.0',
  SESSION_SECONDS: 21600,
  PROP_DB_ID: 'ERAPOR_DB_ID',
  PROP_ROOT_FOLDER_ID: 'ERAPOR_ROOT_FOLDER_ID',
  PROP_DOC_FOLDER_ID: 'ERAPOR_DOC_FOLDER_ID',
  PROP_PDF_FOLDER_ID: 'ERAPOR_PDF_FOLDER_ID',
  PROP_MULTIROLE_INIT: 'ERAPOR_MULTIROLE_202_INITIALIZED'
};

const SCHEMAS = {
  SETTINGS: ['KEY', 'VALUE'],
  USERS: ['USER_ID', 'NAME', 'EMAIL', 'USERNAME', 'PASSWORD_HASH', 'SALT', 'ROLE', 'SCHOOL_LEVEL', 'ACTIVE', 'UPDATED_AT'],
  CLASSES: ['CLASS_ID', 'LEVEL', 'GRADE', 'CLASS_NAME', 'HOMEROOM_TEACHER', 'ACADEMIC_YEAR', 'ACTIVE', 'UPDATED_AT'],
  STUDENTS: ['STUDENT_ID', 'NIS', 'NISN', 'NAME', 'FATHER_NAME', 'GENDER', 'BIRTH_PLACE', 'BIRTH_DATE', 'RELIGION', 'CLASS_ID', 'ADDRESS', 'PARENT_NAME', 'PHONE', 'STATUS', 'UPDATED_AT'],
  SUBJECTS: ['SUBJECT_ID', 'LEVEL', 'CODE', 'SUBJECT_NAME', 'SUBJECT_NAME_ARAB', 'GROUP_NAME', 'DISPLAY_ORDER', 'ACTIVE', 'UPDATED_AT'],
  SCORES: ['SCORE_ID', 'STUDENT_ID', 'SUBJECT_ID', 'SEMESTER', 'ACADEMIC_YEAR', 'PTS', 'PAS', 'FINAL_SCORE', 'FINAL_SCORE_ARAB', 'UPDATED_AT'],
  RECAP: ['RECAP_ID', 'STUDENT_ID', 'STUDENT_NAME', 'CLASS_ID', 'SEMESTER', 'ACADEMIC_YEAR', 'TOTAL_SCORE', 'TOTAL_SCORE_ARAB', 'AVERAGE_SCORE', 'AVERAGE_SCORE_ARAB', 'RANK', 'CATEGORY', 'PROMOTION_STATUS', 'UPDATED_AT'],
  EXTRACURRICULAR: ['EX_ID', 'STUDENT_ID', 'SEMESTER', 'ACADEMIC_YEAR', 'ACTIVITY', 'PREDICATE', 'DESCRIPTION', 'UPDATED_AT'],
  TEACHER_NOTES: ['NOTE_ID', 'STUDENT_ID', 'SEMESTER', 'ACADEMIC_YEAR', 'ATTITUDE', 'SYAKHSIYAH_SULUK', 'SYAKHSIYAH_NADHAFAH', 'SYAKHSIYAH_MUWAZHABAH', 'SICK', 'PERMISSION', 'ABSENT', 'NOTE', 'UPDATED_AT'],
  REPORT_FILES: ['REPORT_ID', 'STUDENT_ID', 'SEMESTER', 'ACADEMIC_YEAR', 'DOC_ID', 'DOC_URL', 'PDF_ID', 'PDF_URL', 'STATUS', 'GENERATED_AT'],
  AUDIT_LOGS: ['LOG_ID', 'USER_ID', 'ACTION', 'ENTITY', 'RECORD_ID', 'DETAIL', 'CREATED_AT']
};

const ENTITY_CONFIG = {
  students: { sheet: 'STUDENTS', id: 'STUDENT_ID', prefix: 'STD' },
  classes: { sheet: 'CLASSES', id: 'CLASS_ID', prefix: 'CLS' },
  subjects: { sheet: 'SUBJECTS', id: 'SUBJECT_ID', prefix: 'SUB' },
  extracurricular: { sheet: 'EXTRACURRICULAR', id: 'EX_ID', prefix: 'EX' },
  notes: { sheet: 'TEACHER_NOTES', id: 'NOTE_ID', prefix: 'NOTE' }
};

let _ssCache_ = null;
const _sheetCache_ = {};

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(ERAPOR.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getAppState() {
  const props = PropertiesService.getScriptProperties();
  const dbId = props.getProperty(ERAPOR.PROP_DB_ID);
  if (!dbId) return { setupRequired: true, appName: ERAPOR.NAME, version: ERAPOR.VERSION };

  try {
    const ss = db_();
    ensureSchemasUpToDate_(ss);
    const settings = getSettings_();
    ensureInitialRoleAccounts_(settings);
    return {
      setupRequired: false,
      appName: ERAPOR.NAME,
      version: ERAPOR.VERSION,
      schoolName: settings.SCHOOL_NAME || 'Sekolah',
      schoolLevel: settings.SCHOOL_LEVEL || 'WUSTHA'
    };
  } catch (err) {
    return {
      setupRequired: true,
      appName: ERAPOR.NAME,
      version: ERAPOR.VERSION,
      warning: 'Database sebelumnya tidak dapat diakses. Silakan lakukan setup ulang.'
    };
  }
}

function ensureSchemasUpToDate_(ss) {
  Object.keys(SCHEMAS).forEach(name => {
    let sh = ss.getSheetByName(name);
    const expected = SCHEMAS[name];
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, expected.length)
        .setValues([expected])
        .setFontWeight('bold')
        .setBackground('#0f9d58')
        .setFontColor('#ffffff');
      sh.setFrozenRows(1);
      return;
    }
    const lastCol = Math.max(1, sh.getLastColumn());
    const current = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    const missing = expected.filter(col => !current.includes(col));
    if (missing.length) {
      const startCol = sh.getLastColumn() + 1;
      sh.getRange(1, startCol, 1, missing.length)
        .setValues([missing])
        .setFontWeight('bold')
        .setBackground('#0f9d58')
        .setFontColor('#ffffff');
    }
  });
}

function setupERapor(payload) {
  payload = payload || {};
  const required = ['schoolName', 'schoolLevel', 'academicYear', 'adminName', 'username', 'password'];
  required.forEach(k => {
    if (!String(payload[k] || '').trim()) throw new Error('Field wajib belum diisi: ' + k);
  });
  if (String(payload.password).length < 6) throw new Error('Password admin minimal 6 karakter.');
  const reservedUsernames = ['walikelas', 'guru', 'kepsek'];
  const adminUsername = String(payload.username).trim().toLowerCase();
  if (reservedUsernames.includes(adminUsername)) {
    throw new Error('Username admin tidak boleh menggunakan walikelas, guru, atau kepsek.');
  }

  const props = PropertiesService.getScriptProperties();
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  const root = DriveApp.createFolder('eRapor V2 - ' + sanitizeFileName_(payload.schoolName) + ' - ' + stamp);
  const docsFolder = root.createFolder('Dokumen Rapor');
  const pdfFolder = root.createFolder('PDF Rapor');
  const ss = SpreadsheetApp.create('Database eRapor V2 - ' + payload.schoolName);
  DriveApp.getFileById(ss.getId()).moveTo(root);

  _ssCache_ = ss;
  props.setProperties({
    [ERAPOR.PROP_DB_ID]: ss.getId(),
    [ERAPOR.PROP_ROOT_FOLDER_ID]: root.getId(),
    [ERAPOR.PROP_DOC_FOLDER_ID]: docsFolder.getId(),
    [ERAPOR.PROP_PDF_FOLDER_ID]: pdfFolder.getId()
  }, true);

  const first = ss.getSheets()[0];
  first.setName('SETTINGS');
  createAllSheets_(ss);

  const defaultCategories = JSON.stringify([
    { name: 'ممتاز', min: 90, max: 100 },
    { name: 'جيد جدا', min: 80, max: 89.99 },
    { name: 'جيد', min: 70, max: 79.99 },
    { name: 'مقبول', min: 60, max: 69.99 },
    { name: 'راسب', min: 0, max: 59.99 }
  ]);

  const settings = {
    APP_NAME: ERAPOR.NAME,
    APP_VERSION: ERAPOR.VERSION,
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
    REPORT_DATE: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy'),
    LOGO_FILE_ID: '',
    GRADE_CATEGORIES: defaultCategories,
    SYAKHSIYAH_CATEGORIES: JSON.stringify([
      { name: 'ممتاز', label: 'Sangat Baik' },
      { name: 'جيد جدا', label: 'Baik Sekali' },
      { name: 'جيد', label: 'Baik' },
      { name: 'مقبول', label: 'Cukup' },
      { name: 'ناقص', label: 'Kurang' }
    ]),
    EXTRA_CATEGORIES: JSON.stringify([
      { name: 'ممتاز', label: 'Sangat Baik' },
      { name: 'جيد جدا', label: 'Baik Sekali' },
      { name: 'جيد', label: 'Baik' },
      { name: 'مقبول', label: 'Cukup' }
    ]),
    PTS_WEIGHT: '30',
    PAS_WEIGHT: '70',
    DB_URL: ss.getUrl(),
    ROOT_FOLDER_URL: root.getUrl()
  };
  writeSettings_(settings);

  const initialAccounts = [
    { name: String(payload.adminName).trim(), email: String(payload.adminEmail || '').trim(), username: adminUsername, password: String(payload.password), role: 'ADMIN' },
    { name: 'Wali Kelas', email: '', username: 'walikelas', password: 'wali123', role: 'WALI_KELAS' },
    { name: 'Guru Mata Pelajaran', email: '', username: 'guru', password: 'guru123', role: 'GURU' },
    { name: String(payload.principal || 'Kepala Sekolah').trim() || 'Kepala Sekolah', email: '', username: 'kepsek', password: 'kepsek123', role: 'KEPALA_SEKOLAH' }
  ];

  batchAppendObjects_('USERS', initialAccounts.map(acc => {
    const salt = Utilities.getUuid().replace(/-/g, '');
    return {
      USER_ID: makeId_('USR'),
      NAME: acc.name,
      EMAIL: acc.email,
      USERNAME: acc.username,
      PASSWORD_HASH: hashPassword_(acc.password, salt),
      SALT: salt,
      ROLE: acc.role,
      SCHOOL_LEVEL: settings.SCHOOL_LEVEL,
      ACTIVE: 'YA',
      UPDATED_AT: now_()
    };
  }));
  props.setProperty(ERAPOR.PROP_MULTIROLE_INIT, 'YES');

  seedMasterData_(settings.SCHOOL_LEVEL, settings.ACADEMIC_YEAR, payload.sampleData !== false);

  return {
    success: true,
    message: 'Setup berhasil. Database Google Sheets, folder Google Drive, dan akun multi-role telah dibuat.',
    databaseUrl: ss.getUrl(),
    folderUrl: root.getUrl(),
    initialAccounts: initialAccounts.map(a => ({ role: a.role, username: a.username, password: a.password }))
  };
}

function importStudentsFromExcel(token, rows) {
  const user = requireSession_(token);
  authorizeEdit_(user, 'students');
  const classes = getObjects_('CLASSES');
  const classMap = new Map(classes.map(c => [String(c.CLASS_NAME).trim().toLowerCase(), c.CLASS_ID]));
  const fallbackClassId = classes[0] ? classes[0].CLASS_ID : '';

  const toInsert = [];
  (rows || []).forEach(r => {
    const name = String(r.NAMA || r.Nama || '').trim();
    if (!name) return;
    const className = String(r.NAMA_KELAS || r.Kelas || '').trim().toLowerCase();
    const classId = classMap.get(className) || fallbackClassId;
    toInsert.push({
      STUDENT_ID: makeId_('STD'),
      NIS: String(r.NIS || ''),
      NISN: String(r.NISN || ''),
      NAME: name,
      FATHER_NAME: String(r.NAMA_AYAH || r.Nama_Ayah || r.Ayah || '').trim(),
      GENDER: String(r.JK || 'L').toUpperCase(),
      CLASS_ID: classId,
      BIRTH_PLACE: String(r.TEMPAT_LAHIR || ''),
      BIRTH_DATE: String(r.TANGGAL_LAHIR || ''),
      RELIGION: String(r.AGAMA || ''),
      PHONE: String(r.TELEPON || ''),
      ADDRESS: String(r.ALAMAT || ''),
      PARENT_NAME: String(r.NAMA_ORTU_WALI || ''),
      STATUS: 'AKTIF',
      UPDATED_AT: now_()
    });
  });

  if (toInsert.length) {
    batchAppendObjects_('STUDENTS', toInsert);
  }
  logAction_(user, 'IMPORT_EXCEL', 'STUDENTS', '', toInsert.length + ' data siswa diimport.');
  return { count: toInsert.length };
}

function ensureInitialRoleAccounts_(settings) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(ERAPOR.PROP_MULTIROLE_INIT) === 'YES') return;
  const users = getObjects_('USERS');
  const usernames = new Set(users.map(u => String(u.USERNAME || '').trim().toLowerCase()));
  const level = String(settings.SCHOOL_LEVEL || 'WUSTHA').toUpperCase();
  const defaults = [
    { name: 'Administrator', username: 'admin', password: 'admin123', role: 'ADMIN' },
    { name: 'Wali Kelas', username: 'walikelas', password: 'wali123', role: 'WALI_KELAS' },
    { name: 'Guru Mata Pelajaran', username: 'guru', password: 'guru123', role: 'GURU' },
    { name: String(settings.PRINCIPAL_NAME || 'Kepala Sekolah'), username: 'kepsek', password: 'kepsek123', role: 'KEPALA_SEKOLAH' }
  ];
  const missing = defaults.filter(a => !usernames.has(a.username)).map(a => {
    const salt = Utilities.getUuid().replace(/-/g, '');
    return {
      USER_ID: makeId_('USR'),
      NAME: a.name,
      EMAIL: '',
      USERNAME: a.username,
      PASSWORD_HASH: hashPassword_(a.password, salt),
      SALT: salt,
      ROLE: a.role,
      SCHOOL_LEVEL: level,
      ACTIVE: 'YA',
      UPDATED_AT: now_()
    };
  });
  if (missing.length) batchAppendObjects_('USERS', missing);
  props.setProperty(ERAPOR.PROP_MULTIROLE_INIT, 'YES');
}

function login(username, password) {
  username = String(username || '').trim().toLowerCase();
  password = String(password || '');
  if (!username || !password) throw new Error('Username dan password wajib diisi.');

  const users = getObjects_('USERS');
  const user = users.find(u => String(u.USERNAME).toLowerCase() === username && String(u.ACTIVE).toUpperCase() === 'YA');
  if (!user || hashPassword_(password, user.SALT) !== user.PASSWORD_HASH) {
    throw new Error('Username atau password salah.');
  }

  const token = Utilities.getUuid() + Utilities.getUuid();
  const safeUser = {
    id: user.USER_ID,
    name: user.NAME,
    email: user.EMAIL,
    username: user.USERNAME,
    role: user.ROLE,
    schoolLevel: user.SCHOOL_LEVEL
  };
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify(safeUser), ERAPOR.SESSION_SECONDS);
  logAction_(safeUser, 'LOGIN', 'AUTH', safeUser.id, 'Login berhasil');
  return { token, user: safeUser, settings: publicSettings_() };
}

function logout(token) {
  const user = getSession_(token, false);
  if (user) logAction_(user, 'LOGOUT', 'AUTH', user.id, 'Logout');
  CacheService.getScriptCache().remove('sess_' + token);
  return true;
}

function getBootstrap(token) {
  const user = requireSession_(token);
  return {
    user,
    settings: publicSettings_(),
    classes: listRecords_(ENTITY_CONFIG.classes, {}),
    subjects: listRecords_(ENTITY_CONFIG.subjects, { ACTIVE: 'YA' }),
    students: listRecords_(ENTITY_CONFIG.students, { STATUS: 'AKTIF' })
  };
}

function getDashboard(token) {
  requireSession_(token);
  const students = getObjects_('STUDENTS').filter(r => String(r.STATUS).toUpperCase() === 'AKTIF');
  const studentIds = new Set(students.map(s => s.STUDENT_ID));
  const studentById = new Map(students.map(s => [s.STUDENT_ID, s]));
  const classes = getObjects_('CLASSES').filter(r => String(r.ACTIVE).toUpperCase() === 'YA');
  const subjects = getObjects_('SUBJECTS').filter(r => String(r.ACTIVE).toUpperCase() === 'YA');
  const subjectIds = new Set(subjects.map(s => s.SUBJECT_ID));
  const settings = getSettings_();
  const sem = String(settings.ACTIVE_SEMESTER || '1');
  const year = String(settings.ACADEMIC_YEAR || '');

  const reports = getObjects_('REPORT_FILES').filter(r =>
    String(r.SEMESTER) === sem &&
    String(r.ACADEMIC_YEAR) === year &&
    String(r.STATUS) === 'READY' &&
    studentIds.has(r.STUDENT_ID)
  );
  const readyStudentSet = new Set(reports.map(r => r.STUDENT_ID));

  const scores = getObjects_('SCORES').filter(r =>
    String(r.SEMESTER) === sem &&
    String(r.ACADEMIC_YEAR) === year &&
    studentIds.has(r.STUDENT_ID) &&
    subjectIds.has(r.SUBJECT_ID) &&
    cleanScoreValue_(r.FINAL_SCORE) !== ''
  );
  const uniqueScorePairs = new Set(scores.map(s => s.STUDENT_ID + '|' + s.SUBJECT_ID));

  const expected = Math.max(1, students.length * subjects.length);
  const scoreCompletion = Math.min(100, Math.round((uniqueScorePairs.size / expected) * 100));
  const reportCompletion = students.length ? Math.min(100, Math.round((readyStudentSet.size / students.length) * 100)) : 0;

  const recent = reports
    .slice()
    .sort((a, b) => String(b.GENERATED_AT).localeCompare(String(a.GENERATED_AT)))
    .slice(0, 5)
    .map(r => ({ ...r, STUDENT_NAME: (studentById.get(r.STUDENT_ID) || {}).NAME || r.STUDENT_ID }));

  return {
    studentCount: students.length,
    classCount: classes.length,
    subjectCount: subjects.length,
    scoreCompletion,
    reportCompletion,
    recent
  };
}

function listRecords(token, entity, filters) {
  requireSession_(token);
  const cfg = ENTITY_CONFIG[entity];
  if (!cfg) throw new Error('Entitas tidak dikenal: ' + entity);
  return listRecords_(cfg, filters || {});
}

function saveRecord(token, entity, record) {
  const user = requireSession_(token);
  authorizeEdit_(user, entity);
  const cfg = ENTITY_CONFIG[entity];
  if (!cfg) throw new Error('Entitas tidak dikenal: ' + entity);
  record = record || {};
  if (!record[cfg.id]) record[cfg.id] = makeId_(cfg.prefix);

  if (entity === 'subjects') {
    if (!record.SUBJECT_NAME_ARAB && record.GROUP_NAME && /[\u0600-\u06FF]/.test(record.GROUP_NAME)) {
      record.SUBJECT_NAME_ARAB = record.GROUP_NAME;
      record.GROUP_NAME = 'A';
    }
  }

  record.UPDATED_AT = now_();
  batchUpsertObjects_(cfg.sheet, cfg.id, [record]);
  logAction_(user, 'SAVE', cfg.sheet, record[cfg.id], JSON.stringify(cleanForLog_(record)));
  return record;
}

function deleteRecord(token, entity, id) {
  const user = requireSession_(token);
  authorizeEdit_(user, entity);
  const cfg = ENTITY_CONFIG[entity];
  if (!cfg) throw new Error('Entitas tidak dikenal: ' + entity);
  deleteObject_(cfg.sheet, cfg.id, id);
  logAction_(user, 'DELETE', cfg.sheet, id, 'Hapus data');
  return true;
}

function getScoreGrid(token, classId, subjectId, semester, academicYear) {
  requireSession_(token);
  if (!classId || !subjectId) throw new Error('Kelas dan mata pelajaran wajib dipilih.');
  const students = getObjects_('STUDENTS')
    .filter(s => s.CLASS_ID === classId && String(s.STATUS).toUpperCase() === 'AKTIF')
    .sort((a, b) => String(a.NAME).localeCompare(String(b.NAME)));

  const scoreMap = new Map();
  getObjects_('SCORES').forEach(s => {
    if (s.SUBJECT_ID === subjectId && String(s.SEMESTER) === String(semester) && String(s.ACADEMIC_YEAR) === String(academicYear)) {
      scoreMap.set(s.STUDENT_ID, s);
    }
  });

  return students.map((s, i) => {
    const x = scoreMap.get(s.STUDENT_ID) || {};
    return {
      no: i + 1,
      studentId: s.STUDENT_ID,
      nis: s.NIS,
      nisn: s.NISN,
      name: s.NAME,
      scoreId: x.SCORE_ID || '',
      pts: numberOrBlank_(cleanScoreValue_(x.PTS)),
      pas: numberOrBlank_(cleanScoreValue_(x.PAS)),
      finalScore: numberOrBlank_(cleanScoreValue_(x.FINAL_SCORE))
    };
  });
}

function saveScores(token, payload) {
  const user = requireSession_(token);
  authorizeEdit_(user, 'scores');
  payload = payload || {};
  const rows = payload.rows || [];
  if (!payload.subjectId || !payload.semester || !payload.academicYear) {
    throw new Error('Filter penilaian belum lengkap.');
  }

  const weights = parseScoreWeights_(getSettings_());
  const batchRecords = [];
  rows.forEach(r => {
    const rawPts = String(r.pts ?? '').trim();
    const rawPas = String(r.pas ?? '').trim();
    if (rawPts === '' && rawPas === '') return;

    let finalScore = 0;
    let ptsToSave = '';
    let pasToSave = '';

    if (rawPts === '' && rawPas !== '') {
      pasToSave = toScore_(rawPas);
      finalScore = pasToSave;
    } else if (rawPts !== '' && rawPas === '') {
      ptsToSave = toScore_(rawPts);
      finalScore = ptsToSave;
    } else {
      ptsToSave = toScore_(rawPts);
      pasToSave = toScore_(rawPas);
      const totalW = weights.ptsWeight + weights.pasWeight;
      finalScore = Math.round(((ptsToSave * weights.ptsWeight + pasToSave * weights.pasWeight) / totalW) * 100) / 100;
    }

    batchRecords.push({
      SCORE_ID: r.scoreId || makeId_('SCR'),
      STUDENT_ID: r.studentId,
      SUBJECT_ID: payload.subjectId,
      SEMESTER: String(payload.semester),
      ACADEMIC_YEAR: String(payload.academicYear),
      PTS: ptsToSave,
      PAS: pasToSave,
      FINAL_SCORE: finalScore,
      FINAL_SCORE_ARAB: numberToArabicWords_(finalScore),
      UPDATED_AT: now_()
    });
  });

  if (batchRecords.length) {
    batchUpsertObjects_('SCORES', 'SCORE_ID', batchRecords);
  }
  logAction_(user, 'BULK_SAVE', 'SCORES', payload.subjectId, batchRecords.length + ' nilai disimpan');
  return { saved: batchRecords.length };
}

function getGradeCategory_(avgScore, settings) {
  if (avgScore === '' || avgScore === null || isNaN(avgScore)) return '-';
  let categories = [];
  try { categories = JSON.parse(settings.GRADE_CATEGORIES || '[]'); } catch (e) {}
  if (!categories.length) {
    categories = [
      { name: 'ممتاز', min: 90, max: 100 },
      { name: 'جيد جدا', min: 80, max: 89.99 },
      { name: 'جيد', min: 70, max: 79.99 },
      { name: 'مقبول', min: 60, max: 69.99 },
      { name: 'راسب', min: 0, max: 59.99 }
    ];
  }
  const num = Number(avgScore);
  const found = categories.find(c => num >= Number(c.min) && num <= Number(c.max));
  return found ? found.name : '-';
}

function getPromotionDecision_(semester, category) {
  if (String(semester) !== '2') return null;
  const cat = String(category || '').trim();
  if (!cat || cat === '-') return { status: '-', arabic: '-', isRetained: false };
  if (cat === 'راسب') return { status: 'Tidak Naik Kelas', arabic: 'يبقى في نفس الصف', isRetained: true };
  return { status: 'Naik Kelas', arabic: 'يرقى إلى الصف التالي', isRetained: false };
}

function getAttendanceSyakhsiyahGrid(token, classId, semester, academicYear) {
  requireSession_(token);
  if (!classId) throw new Error('Kelas wajib dipilih.');
  const students = getObjects_('STUDENTS')
    .filter(s => s.CLASS_ID === classId && String(s.STATUS).toUpperCase() === 'AKTIF')
    .sort((a, b) => String(a.NAME).localeCompare(String(b.NAME)));
  const noteMap = new Map();
  getObjects_('TEACHER_NOTES').forEach(n => {
    if (String(n.SEMESTER) === String(semester) && String(n.ACADEMIC_YEAR) === String(academicYear)) {
      noteMap.set(n.STUDENT_ID, n);
    }
  });
  return students.map((s, i) => {
    const nt = noteMap.get(s.STUDENT_ID) || {};
    return {
      no: i + 1,
      studentId: s.STUDENT_ID,
      nis: s.NIS,
      nisn: s.NISN,
      name: s.NAME,
      noteId: nt.NOTE_ID || '',
      sick: Number(nt.SICK || 0),
      permission: Number(nt.PERMISSION || 0),
      absent: Number(nt.ABSENT || 0),
      suluk: nt.SYAKHSIYAH_SULUK || nt.ATTITUDE || 'ممتاز',
      nadhafah: nt.SYAKHSIYAH_NADHAFAH || 'ممتاز',
      muwazhabah: nt.SYAKHSIYAH_MUWAZHABAH || 'ممتاز',
      note: nt.NOTE || ''
    };
  });
}

function saveAttendanceSyakhsiyah(token, payload) {
  const user = requireSession_(token);
  authorizeEdit_(user, 'scores');
  payload = payload || {};
  const batch = (payload.rows || []).map(r => ({
    NOTE_ID: r.noteId || makeId_('NOTE'),
    STUDENT_ID: r.studentId,
    SEMESTER: String(payload.semester),
    ACADEMIC_YEAR: String(payload.academicYear),
    ATTITUDE: String(r.suluk || ''),
    SYAKHSIYAH_SULUK: String(r.suluk || ''),
    SYAKHSIYAH_NADHAFAH: String(r.nadhafah || ''),
    SYAKHSIYAH_MUWAZHABAH: String(r.muwazhabah || ''),
    SICK: Math.max(0, parseInt(r.sick || 0, 10) || 0),
    PERMISSION: Math.max(0, parseInt(r.permission || 0, 10) || 0),
    ABSENT: Math.max(0, parseInt(r.absent || 0, 10) || 0),
    NOTE: String(r.note || ''),
    UPDATED_AT: now_()
  }));
  if (batch.length) batchUpsertObjects_('TEACHER_NOTES', 'NOTE_ID', batch);
  logAction_(user, 'BULK_SAVE', 'TEACHER_NOTES', '', batch.length + ' ketidakhadiran & syakhsiyah disimpan');
  return { saved: batch.length };
}

function computeClassRecapData_(classId, semester, academicYear, saveToSheet) {
  const settings = getSettings_();
  const students = getObjects_('STUDENTS')
    .filter(s => (!classId || s.CLASS_ID === classId) && String(s.STATUS).toUpperCase() === 'AKTIF')
    .sort((a, b) => String(a.NAME).localeCompare(String(b.NAME)));

  const subjects = getObjects_('SUBJECTS')
    .filter(s => String(s.ACTIVE).toUpperCase() === 'YA')
    .sort((a, b) => Number(a.DISPLAY_ORDER || 0) - Number(b.DISPLAY_ORDER || 0));

  if (!subjects.length) return { subjects: [], rows: [] };

  const scoreLookup = new Map();
  getObjects_('SCORES').forEach(s => {
    if (String(s.SEMESTER) === String(semester) && String(s.ACADEMIC_YEAR) === String(academicYear)) {
      scoreLookup.set(s.STUDENT_ID + '|' + s.SUBJECT_ID, s);
    }
  });

  const rows = students.map((st, i) => {
    const values = {};
    let total = 0, n = 0;
    subjects.forEach(sub => {
      const sc = scoreLookup.get(st.STUDENT_ID + '|' + sub.SUBJECT_ID);
      const rawVal = sc ? cleanScoreValue_(sc.FINAL_SCORE) : '';
      const v = rawVal !== '' ? Number(rawVal) : '';
      values[sub.SUBJECT_ID] = v;
      if (v !== '') { total += v; n++; }
    });
    const totalFixed = n ? Math.round(total * 100) / 100 : '';
    const avgFixed = n ? Math.round((total / n) * 100) / 100 : '';
    const category = getGradeCategory_(avgFixed, settings);
    const promo = getPromotionDecision_(semester, category);
    return {
      no: i + 1,
      studentId: st.STUDENT_ID,
      classId: st.CLASS_ID,
      name: st.NAME,
      nis: st.NIS,
      values,
      total: totalFixed,
      totalArab: totalFixed !== '' ? numberToArabicWords_(totalFixed) : '',
      average: avgFixed,
      averageArab: avgFixed !== '' ? numberToArabicWords_(avgFixed) : '',
      category,
      rank: '-',
      promotionStatus: promo ? promo.status : '-',
      promotionStatusArab: promo ? promo.arabic : '-'
    };
  });

  const rankBasis = String(settings.RANK_BASIS || 'TOTAL').toUpperCase() === 'AVERAGE' ? 'AVERAGE' : 'TOTAL';
  const getRankVal = r => (rankBasis === 'AVERAGE' ? Number(r.average) : Number(r.total));
  const validRows = rows.filter(r => (rankBasis === 'AVERAGE' ? r.average !== '' : r.total !== '')).sort((a, b) => getRankVal(b) - getRankVal(a));
  validRows.forEach((r, idx) => {
    r.rank = (idx > 0 && getRankVal(r) === getRankVal(validRows[idx - 1])) ? validRows[idx - 1].rank : idx + 1;
  });

  if (saveToSheet && rows.length > 0) {
    try {
      const prevMap = new Map();
      getObjects_('RECAP').forEach(x => {
        if (String(x.SEMESTER) === String(semester) && String(x.ACADEMIC_YEAR) === String(academicYear)) {
          prevMap.set(x.STUDENT_ID, x.RECAP_ID);
        }
      });
      const recapBatch = rows.map(r => ({
        RECAP_ID: prevMap.get(r.studentId) || makeId_('RCP'),
        STUDENT_ID: r.studentId,
        STUDENT_NAME: r.name,
        CLASS_ID: r.classId || '',
        SEMESTER: String(semester),
        ACADEMIC_YEAR: String(academicYear),
        TOTAL_SCORE: r.total,
        TOTAL_SCORE_ARAB: r.totalArab,
        AVERAGE_SCORE: r.average,
        AVERAGE_SCORE_ARAB: r.averageArab,
        RANK: r.rank,
        CATEGORY: r.category,
        PROMOTION_STATUS: r.promotionStatus || '-',
        UPDATED_AT: now_()
      }));
      batchUpsertObjects_('RECAP', 'RECAP_ID', recapBatch);
    } catch (e) {}
  }

  return {
    subjects: subjects.map(s => ({ id: s.SUBJECT_ID, name: s.SUBJECT_NAME, code: s.CODE })),
    rows
  };
}

function getRecap(token, classId, semester, academicYear) {
  requireSession_(token);
  return computeClassRecapData_(classId, semester, academicYear, true);
}

function getStudentTranscript(token, studentId) {
  requireSession_(token);
  const student = getObjects_('STUDENTS').find(s => s.STUDENT_ID === studentId);
  if (!student) throw new Error('Siswa tidak ditemukan.');
  const settings = getSettings_();
  const scores = getObjects_('SCORES').filter(s => s.STUDENT_ID === studentId && cleanScoreValue_(s.FINAL_SCORE) !== '');
  const termMap = new Map();
  scores.forEach(s => {
    if (s.ACADEMIC_YEAR && s.SEMESTER) termMap.set(s.ACADEMIC_YEAR + '|' + s.SEMESTER, { academicYear: String(s.ACADEMIC_YEAR), semester: String(s.SEMESTER) });
  });
  const sortedTerms = Array.from(termMap.entries()).sort((a, b) => a[1].academicYear.localeCompare(b[1].academicYear) || Number(a[1].semester) - Number(b[1].semester));
  const subjects = getObjects_('SUBJECTS').filter(s => String(s.ACTIVE).toUpperCase() === 'YA').sort((a, b) => Number(a.DISPLAY_ORDER || 0) - Number(b.DISPLAY_ORDER || 0));
  const scoreMap = new Map(scores.map(s => [s.ACADEMIC_YEAR + '|' + s.SEMESTER + '|' + s.SUBJECT_ID, Number(cleanScoreValue_(s.FINAL_SCORE))]));
  const terms = sortedTerms.map(([key, t]) => {
    let sum = 0, cnt = 0;
    subjects.forEach(sub => {
      const v = scoreMap.get(key + '|' + sub.SUBJECT_ID);
      if (v !== undefined) { sum += v; cnt++; }
    });
    const avg = cnt ? Math.round((sum / cnt) * 100) / 100 : '';
    const cat = getGradeCategory_(avg, settings);
    const promo = getPromotionDecision_(t.semester, cat);
    return {
      key, academicYear: t.academicYear, semester: t.semester,
      total: cnt ? Math.round(sum * 100) / 100 : '', average: avg, category: cat,
      promotionStatus: promo ? promo.status : '-', promotionStatusArab: promo ? promo.arabic : '-'
    };
  });
  return { student, terms, subjects };
}

function getReportStudents(token, classId, semester, academicYear) {
  requireSession_(token);
  let students = getObjects_('STUDENTS').filter(s => String(s.STATUS).toUpperCase() === 'AKTIF');
  if (classId) students = students.filter(s => s.CLASS_ID === classId);
  students.sort((a, b) => String(a.NAME).localeCompare(String(b.NAME)));

  const reportMap = new Map();
  getObjects_('REPORT_FILES').forEach(r => {
    if (String(r.SEMESTER) === String(semester) && String(r.ACADEMIC_YEAR) === String(academicYear)) {
      reportMap.set(r.STUDENT_ID, r);
    }
  });

  const scoreCounts = new Map();
  getObjects_('SCORES').forEach(s => {
    if (String(s.SEMESTER) === String(semester) && String(s.ACADEMIC_YEAR) === String(academicYear)) {
      scoreCounts.set(s.STUDENT_ID, (scoreCounts.get(s.STUDENT_ID) || 0) + 1);
    }
  });

  return students.map((s, i) => {
    const rep = reportMap.get(s.STUDENT_ID) || {};
    const scoreCount = scoreCounts.get(s.STUDENT_ID) || 0;
    return {
      no: i + 1,
      studentId: s.STUDENT_ID,
      name: s.NAME,
      nis: s.NIS,
      nisn: s.NISN,
      scoreCount,
      docUrl: rep.DOC_URL || '',
      pdfUrl: rep.PDF_URL || '',
      status: rep.STATUS || (scoreCount ? 'DRAFT' : 'BELUM ADA NILAI'),
      generatedAt: rep.GENERATED_AT || ''
    };
  });
}

function generateReport(token, studentId, semester, academicYear) {
  return generateReportsBatch(token, [studentId], semester, academicYear).results[0];
}

function generateReportsBatch(token, studentIds, semester, academicYear) {
  const user = requireSession_(token);
  authorizeReport_(user);
  studentIds = studentIds || [];
  if (!studentIds.length) throw new Error('Pilih minimal satu siswa.');

  const settings = getSettings_();
  const students = getObjects_('STUDENTS');
  const studentMap = new Map(students.map(s => [s.STUDENT_ID, s]));
  const classes = getObjects_('CLASSES');
  const classMap = new Map(classes.map(c => [c.CLASS_ID, c]));
  const subjects = getObjects_('SUBJECTS')
    .filter(s => String(s.ACTIVE).toUpperCase() === 'YA')
    .sort((a, b) => Number(a.DISPLAY_ORDER || 0) - Number(b.DISPLAY_ORDER || 0));

  const allScores = getObjects_('SCORES').filter(x => String(x.SEMESTER) === String(semester) && String(x.ACADEMIC_YEAR) === String(academicYear));
  const allExtras = getObjects_('EXTRACURRICULAR').filter(x => String(x.SEMESTER) === String(semester) && String(x.ACADEMIC_YEAR) === String(academicYear));
  const allNotes = getObjects_('TEACHER_NOTES').filter(x => String(x.SEMESTER) === String(semester) && String(x.ACADEMIC_YEAR) === String(academicYear));

  // Hitung rekapitulasi sekali per kelas yang terlibat
  const recapByClass = new Map();
  const docsFolder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty(ERAPOR.PROP_DOC_FOLDER_ID));
  const pdfFolder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty(ERAPOR.PROP_PDF_FOLDER_ID));

  let logoBlob = null;
  if (settings.LOGO_FILE_ID) {
    try { logoBlob = DriveApp.getFileById(String(settings.LOGO_FILE_ID).trim()).getBlob(); } catch (e) {}
  }

  resetReportsInternal_(studentIds, semester, academicYear);
  const newReportRecords = [];
  const results = [];

  studentIds.forEach(studentId => {
    const student = studentMap.get(studentId);
    if (!student) return;
    const clazz = classMap.get(student.CLASS_ID) || { CLASS_NAME: '-', HOMEROOM_TEACHER: '-' };
    if (!recapByClass.has(student.CLASS_ID)) {
      recapByClass.set(student.CLASS_ID, computeClassRecapData_(student.CLASS_ID, semester, academicYear, true));
    }
    const recapData = recapByClass.get(student.CLASS_ID);
    const stRecap = recapData.rows.find(r => r.studentId === studentId) || { total: '-', totalArab: '-', average: '-', averageArab: '-', rank: '-', category: '-' };

    const scoresMap = new Map(allScores.filter(x => x.STUDENT_ID === studentId).map(x => [x.SUBJECT_ID, x]));
    const extras = allExtras.filter(x => x.STUDENT_ID === studentId);
    const note = allNotes.find(x => x.STUDENT_ID === studentId) || {};

    const fileBase = sanitizeFileName_([student.NAME, student.NISN, 'Semester ' + semester, String(academicYear || '').replace(/[\\/]/g, '-')].filter(Boolean).join('-'));
    const doc = DocumentApp.create(fileBase);
    const body = doc.getBody();

    try {
      body.setPageWidth(595.276).setPageHeight(841.89);
      body.setMarginTop(16).setMarginBottom(16).setMarginLeft(24).setMarginRight(24);
    } catch (e) {}

    appendCenteredCompact_(body, 'كشف درجات الطالب', 11, true);
    body.appendHorizontalRule();

    const info = [
      [String(clazz.CLASS_NAME || '-').toUpperCase(), ': الفصل ', String(student.NAME || '-').toUpperCase(), ': اسم الطالب '],
      [((student.NIS || '-') + ' / ' + (student.NISN || '-')).toUpperCase(), ': NIS/NISN رقم القيد ', String(student.FATHER_NAME || '-').toUpperCase(), ': اسم الأب '],
      [semester == 1 ? 'الأول' : 'الثاني', ': الفصل الدراسي ', toArabicDigits_(String(academicYear || '').toUpperCase()), ': العام الدراسي ']
    ];
    formatCompactInfoTable_(body.appendTable(info), [145, 75, 225, 100]);

    appendCompactSectionTitle_(body, 'أ. درجات المواد الدراسية');
    const activeScoreList = subjects.map((sub, idx) => {
      const sc = scoresMap.get(sub.SUBJECT_ID);
      const cleanFinal = sc ? cleanScoreValue_(sc.FINAL_SCORE) : '';
      let arabSubName = String(sub.SUBJECT_NAME_ARAB || '').trim();
      if (!arabSubName && /[\u0600-\u06FF]/.test(String(sub.GROUP_NAME || ''))) arabSubName = String(sub.GROUP_NAME).trim();
      if (!arabSubName) arabSubName = String(sub.SUBJECT_NAME || '-').trim();
      const hasVal = cleanFinal !== '';
      return {
        no: toArabicDigits_(idx + 1),
        name: arabSubName,
        score: hasVal ? toArabicDigits_(cleanFinal) : '-',
        terbilang: hasVal ? numberToArabicWords_(cleanFinal) : '-'
      };
    });

    const half = Math.ceil(activeScoreList.length / 2);
    const splitRows = [['الكتابة', 'الدرجة', 'المادة', 'الرقم', 'الكتابة', 'الدرجة', 'المادة', 'الرقم']];
    for (let i = 0; i < half; i++) {
      const rightItem = activeScoreList[i] || { no: '', name: '', score: '', terbilang: '' };
      const leftItem = activeScoreList[i + half] || { no: '', name: '', score: '', terbilang: '' };
      splitRows.push([
        leftItem.terbilang, leftItem.score, leftItem.name, leftItem.no,
        rightItem.terbilang, rightItem.score, rightItem.name, rightItem.no
      ]);
    }
    if (splitRows.length === 1) splitRows.push(['-', '-', '-', '-', '-', '-', 'لا توجد بيانات', '١']);
    formatSplitScoreTable_(body.appendTable(splitRows), [88, 38, 119, 28, 88, 38, 119, 28]);

    appendCompactSectionTitle_(body, 'ب. خلاصة النتائج');
    const summaryRows = [
      ['التقدير العام', 'الترتيب', 'كتابة المعدل', 'المعدل', 'كتابة المجموع', 'المجموع'],
      [
        String(stRecap.category || '-'),
        stRecap.rank !== '-' ? toArabicDigits_(stRecap.rank) : '-',
        String(stRecap.averageArab || '-'),
        stRecap.average !== '' ? toArabicDigits_(stRecap.average) : '-',
        String(stRecap.totalArab || '-'),
        stRecap.total !== '' ? toArabicDigits_(stRecap.total) : '-'
      ]
    ];
    formatCompactReportTable_(body.appendTable(summaryRows), [95, 55, 125, 58, 145, 68]);

    appendCompactSectionTitle_(body, 'ج. الأنشطة الإضافية');
    const exRows = [['الوصف', 'التقدير', 'النشاط', 'الرقم']];
    extras.forEach((x, i) => exRows.push([x.DESCRIPTION || '-', x.PREDICATE || '-', x.ACTIVITY || '-', toArabicDigits_(i + 1)]));
    if (!extras.length) exRows.push(['-', '-', '-', '١']);
    formatCompactReportTable_(body.appendTable(exRows), [271, 75, 165, 35]);

    appendCompactSectionTitle_(body, 'د. المواظبة والشخصية وملاحظات المعلم');
    const attRows = [
      ['ملاحظات معلم الفصل', 'المواظبة', 'النظافة', 'السلوك', 'غائب', 'إذن', 'مرض'],
      [
        note.NOTE || '-',
        note.SYAKHSIYAH_MUWAZHABAH || '-',
        note.SYAKHSIYAH_NADHAFAH || '-',
        note.SYAKHSIYAH_SULUK || note.ATTITUDE || '-',
        toArabicDigits_(note.ABSENT || 0) + ' أيام',
        toArabicDigits_(note.PERMISSION || 0) + ' أيام',
        toArabicDigits_(note.SICK || 0) + ' أيام'
      ]
    ];
    formatCompactReportTable_(body.appendTable(attRows), [186, 65, 65, 65, 55, 55, 55]);

    if (String(semester) === '2') {
      const promo = getPromotionDecision_(semester, stRecap.category);
      if (promo && promo.arabic !== '-') {
        body.appendParagraph('').setSpacingBefore(2).setSpacingAfter(0);
        const promoTable = body.appendTable([[promo.arabic + ' (' + promo.status + ')', ': قرار النقل']]);
        formatCompactReportTable_(promoTable, [386, 160]);
      }
    }

    const sheikhName = settings.SHEIKH_NAME || '....................................';
    const principalName = settings.PRINCIPAL_NAME || '....................................';
    const homeroomTeacher = clazz.HOMEROOM_TEACHER || '....................................';
    const city = settings.CITY || '............';
    const reportDate = settings.REPORT_DATE || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');

    body.appendParagraph('').setSpacingBefore(3).setSpacingAfter(1);
    const sig = body.appendTable([
      ['', '', reportDate + ' ، ' + city],
      ['معلم الفصل،', 'مدير المعادلة،', 'شيخ المعهد،'],
      ['', '', ''],
      ['', '', ''],
      [homeroomTeacher, principalName, sheikhName]
    ]);
    sig.setBorderWidth(0);
    const sigWidths = [182, 182, 182];
    for (let r = 0; r < sig.getNumRows(); r++) {
      for (let c = 0; c < sig.getRow(r).getNumCells(); c++) {
        const cell = sig.getCell(r, c);
        try { cell.setWidth(sigWidths[c]); } catch (e) {}
        cell.setPaddingTop(r === 2 ? 14 : 1).setPaddingBottom(1);
        const p = cell.getChild(0).asParagraph();
        p.setFontSize(8.5).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        if (r === 4) p.setBold(true);
      }
    }

    doc.saveAndClose();
    const docFile = DriveApp.getFileById(doc.getId());
    docFile.moveTo(docsFolder);
    const pdfFile = pdfFolder.createFile(docFile.getAs(MimeType.PDF).setName(fileBase + '.pdf'));

    const rec = {
      REPORT_ID: makeId_('RPT'),
      STUDENT_ID: studentId,
      SEMESTER: String(semester),
      ACADEMIC_YEAR: String(academicYear),
      DOC_ID: doc.getId(),
      DOC_URL: docFile.getUrl(),
      PDF_ID: pdfFile.getId(),
      PDF_URL: pdfFile.getUrl(),
      STATUS: 'READY',
      GENERATED_AT: now_()
    };
    newReportRecords.push(rec);
    results.push({ studentId, status: 'READY', docUrl: rec.DOC_URL, pdfUrl: rec.PDF_URL, generatedAt: rec.GENERATED_AT });
  });

  if (newReportRecords.length) {
    batchAppendObjects_('REPORT_FILES', newReportRecords);
    logAction_(user, 'GENERATE_BATCH', 'REPORT_FILES', '', newReportRecords.length + ' rapor dibuat (Semester ' + semester + ')');
  }
  return { count: results.length, results };
}

function resetReport(token, studentId, semester, academicYear) {
  const user = requireSession_(token);
  authorizeReport_(user);
  const count = resetReportsInternal_([studentId], semester, academicYear);
  logAction_(user, 'RESET', 'REPORT_FILES', studentId, 'Reset report');
  return { removed: count };
}

function resetReports(token, studentIds, semester, academicYear) {
  const user = requireSession_(token);
  authorizeReport_(user);
  const removed = resetReportsInternal_(studentIds || [], semester, academicYear);
  logAction_(user, 'BULK_RESET', 'REPORT_FILES', '', removed + ' report direset');
  return { removed };
}

function getSettings(token) {
  requireSession_(token);
  return publicSettings_();
}

function saveSettings(token, values) {
  const user = requireSession_(token);
  if (user.role !== 'ADMIN') throw new Error('Hanya admin yang dapat mengubah pengaturan.');
  const current = getSettings_();
  const allowed = ['SCHOOL_NAME', 'SCHOOL_LEVEL', 'NPSN', 'SCHOOL_ADDRESS', 'SHEIKH_NAME', 'PRINCIPAL_NAME', 'PRINCIPAL_NIP', 'ACADEMIC_YEAR', 'ACTIVE_SEMESTER', 'CITY', 'REPORT_DATE', 'LOGO_FILE_ID', 'GRADE_CATEGORIES', 'SYAKHSIYAH_CATEGORIES', 'EXTRA_CATEGORIES', 'PTS_WEIGHT', 'PAS_WEIGHT'];
  values = values || {};
  const hasPts = Object.prototype.hasOwnProperty.call(values, 'PTS_WEIGHT');
  const hasPas = Object.prototype.hasOwnProperty.call(values, 'PAS_WEIGHT');
  if (hasPts || hasPas) {
    const ptsRaw = hasPts ? values.PTS_WEIGHT : (current.PTS_WEIGHT ?? '30');
    const pasRaw = hasPas ? values.PAS_WEIGHT : (current.PAS_WEIGHT ?? '70');
    const ptsNum = Number(String(ptsRaw ?? '').replace(',', '.').trim());
    const pasNum = Number(String(pasRaw ?? '').replace(',', '.').trim());
    if (String(ptsRaw ?? '').trim() === '' || String(pasRaw ?? '').trim() === '' || isNaN(ptsNum) || isNaN(pasNum) || ptsNum < 0 || ptsNum > 100 || pasNum < 0 || pasNum > 100 || Math.round((ptsNum + pasNum) * 100) !== 10000) {
      throw new Error('Prosentase nilai PTS dan PAS masing-masing harus 0–100% dengan total tepat 100%.');
    }
    current.PTS_WEIGHT = String(Math.round(ptsNum * 100) / 100);
    current.PAS_WEIGHT = String(Math.round(pasNum * 100) / 100);
  }
  allowed.forEach(k => {
    if (k === 'PTS_WEIGHT' || k === 'PAS_WEIGHT') return;
    if (Object.prototype.hasOwnProperty.call(values, k)) current[k] = String(values[k] ?? '');
  });
  writeSettings_(current);
  logAction_(user, 'SAVE', 'SETTINGS', '', 'Pengaturan diperbarui');
  return publicSettings_();
}

function listUsers(token) {
  const user = requireSession_(token);
  if (user.role !== 'ADMIN') throw new Error('Hanya admin yang dapat mengelola pengguna.');
  return getObjects_('USERS').map(u => ({ USER_ID: u.USER_ID, NAME: u.NAME, EMAIL: u.EMAIL, USERNAME: u.USERNAME, ROLE: u.ROLE, SCHOOL_LEVEL: u.SCHOOL_LEVEL, ACTIVE: u.ACTIVE, UPDATED_AT: u.UPDATED_AT }));
}

function saveUser(token, record) {
  const user = requireSession_(token);
  if (user.role !== 'ADMIN') throw new Error('Hanya admin yang dapat mengelola pengguna.');
  record = record || {};
  if (!record.NAME || !record.USERNAME || !record.ROLE) throw new Error('Nama, username, dan role wajib diisi.');
  if (record.PASSWORD && String(record.PASSWORD).length < 6) throw new Error('Password minimal 6 karakter.');
  const all = getObjects_('USERS');
  const duplicate = all.find(x => String(x.USERNAME).toLowerCase() === String(record.USERNAME).toLowerCase() && x.USER_ID !== record.USER_ID);
  if (duplicate) throw new Error('Username sudah digunakan.');
  const current = all.find(x => x.USER_ID === record.USER_ID) || {};
  const salt = current.SALT || Utilities.getUuid().replace(/-/g, '');
  const obj = {
    USER_ID: record.USER_ID || makeId_('USR'),
    NAME: String(record.NAME),
    EMAIL: String(record.EMAIL || ''),
    USERNAME: String(record.USERNAME).toLowerCase(),
    PASSWORD_HASH: record.PASSWORD ? hashPassword_(String(record.PASSWORD), salt) : current.PASSWORD_HASH,
    SALT: salt,
    ROLE: String(record.ROLE).toUpperCase(),
    SCHOOL_LEVEL: String(record.SCHOOL_LEVEL || getSettings_().SCHOOL_LEVEL || 'WUSTHA').toUpperCase(),
    ACTIVE: String(record.ACTIVE || 'YA').toUpperCase(),
    UPDATED_AT: now_()
  };
  if (!obj.PASSWORD_HASH) throw new Error('Password wajib diisi untuk pengguna baru.');
  batchUpsertObjects_('USERS', 'USER_ID', [obj]);
  logAction_(user, 'SAVE', 'USERS', obj.USER_ID, obj.USERNAME);
  return { USER_ID: obj.USER_ID, NAME: obj.NAME, EMAIL: obj.EMAIL, USERNAME: obj.USERNAME, ROLE: obj.ROLE, SCHOOL_LEVEL: obj.SCHOOL_LEVEL, ACTIVE: obj.ACTIVE, UPDATED_AT: obj.UPDATED_AT };
}

function deleteUser(token, userId) {
  const user = requireSession_(token);
  if (user.role !== 'ADMIN') throw new Error('Hanya admin yang dapat mengelola pengguna.');
  if (user.id === userId) throw new Error('Akun yang sedang digunakan tidak dapat dihapus.');
  deleteObject_('USERS', 'USER_ID', userId);
  logAction_(user, 'DELETE', 'USERS', userId, 'Hapus pengguna');
  return true;
}

function numberToArabicWords_(num) {
  const cleanNum = cleanNumericValue_(num);
  if (cleanNum === '' || cleanNum === null || cleanNum === undefined || isNaN(cleanNum)) return '';
  if (cleanNum === 0) return 'صفر';
  const parts = String(cleanNum).split('.');
  const intPart = parseInt(parts[0], 10);
  let words = intToArabic_(intPart);
  if (parts[1]) {
    const rawDec = parts[1].replace(/0+$/, '');
    if (rawDec.length > 0) {
      if (rawDec.startsWith('0')) {
        words += ' فاصلة ' + rawDec.split('').map(d => intToArabic_(parseInt(d, 10))).join(' ');
      } else {
        words += ' فاصلة ' + intToArabic_(parseInt(rawDec, 10));
      }
    }
  }
  return words;
}

function intToArabic_(n) {
  if (n === 0) return 'صفر';
  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  if (n < 20) return ones[n];
  if (n < 100) {
    const u = n % 10;
    const t = Math.floor(n / 10);
    return u > 0 ? ones[u] + ' و' + tens[t] : tens[t];
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const rem = n % 100;
    return rem > 0 ? hundreds[h] + ' و' + intToArabic_(rem) : hundreds[h];
  }
  if (n < 10000) {
    const th = Math.floor(n / 1000);
    const rem = n % 1000;
    let thStr = '';
    if (th === 1) thStr = 'ألف';
    else if (th === 2) thStr = 'ألفان';
    else if (th >= 3 && th <= 10) thStr = ones[th] + ' آلاف';
    else thStr = intToArabic_(th) + ' ألف';
    return rem > 0 ? thStr + ' و' + intToArabic_(rem) : thStr;
  }
  return toArabicDigits_(n);
}

// FIX KRITIS: Konversi semua angka 0-9 menjadi ٠-٩ tanpa menghapus string atau nilai > 100
function toArabicDigits_(str) {
  if (str === null || str === undefined || str === '') return '';
  const map = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(str).replace(/[0-9]/g, d => map[Number(d)]);
}

function cleanNumericValue_(v) {
  if (v === '' || v === null || v === undefined) return '';
  const num = Number(String(v).replace(',', '.').trim());
  return (!isNaN(num) && isFinite(num) && num >= 0) ? Math.round(num * 100) / 100 : '';
}

function cleanScoreValue_(v) {
  if (v === '' || v === null || v === undefined) return '';
  const num = Number(String(v).replace(',', '.').trim());
  return (!isNaN(num) && isFinite(num) && num >= 0 && num <= 100) ? Math.round(num * 100) / 100 : '';
}

function createAllSheets_(ss) {
  Object.keys(SCHEMAS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.clear();
    const headers = SCHEMAS[name];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#0f9d58').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setVerticalAlignment('middle');
    sh.autoResizeColumns(1, headers.length);
  });
}

function seedMasterData_(level, year, sampleData) {
  const gradeDefaults = { WUSTHA: '1', ULYA: '1', "'ALY": '1', SD: '1', SMP: '7', SMA: '10', SMK: '10' };
  const grade = gradeDefaults[level] || '1';
  const classId = makeId_('CLS');
  batchAppendObjects_('CLASSES', [{
    CLASS_ID: classId, LEVEL: level, GRADE: grade, CLASS_NAME: grade + 'A',
    HOMEROOM_TEACHER: 'أحمد صالح', ACADEMIC_YEAR: year, ACTIVE: 'YA', UPDATED_AT: now_()
  }]);

  const commonSubjects = [
    ['NHW', 'Nahwu', 'النحو', 'A'],
    ['SRF', 'Shorof', 'الصرف', 'A'],
    ['FQH', 'Fiqih', 'الفقه', 'A'],
    ['AQD', 'Aqidah / Tauhid', 'التوحيد', 'A'],
    ['HDT', 'Hadits', 'الحديث', 'A'],
    ['TFS', 'Tafsir', 'التفسير', 'A'],
    ['ARB', 'Bahasa Arab', 'اللغة العربية', 'B'],
    ['AKH', 'Akhlak / Tasawuf', 'الأخلاق', 'B']
  ];
  const levelExtras = {
    WUSTHA: [['TRK', 'Tarikh Islam', 'التاريخ الإسلامي', 'A'], ['IML', 'Imla & Khat', 'الإملاء والخط', 'B']],
    ULYA: [['USF', 'Ushul Fiqih', 'أصول الفقه', 'A'], ['BLG', 'Balaghah', 'البلاغة', 'B']],
    "'ALY": [['MNT', 'Ilmu Mantiq', 'علم المنطق', 'A'], ['USQ', 'Ulumul Qur’an', 'علوم القرآن', 'A']],
    SD: [['IPAS', 'Ilmu Pengetahuan Alam dan Sosial', 'العلوم الطبيعية والاجتماعية', 'A'], ['MULOK', 'Muatan Lokal', 'اللغة المحلية', 'B']],
    SMP: [['IPA', 'Ilmu Pengetahuan Alam', 'العلوم الطبيعية', 'A'], ['IPS', 'Ilmu Pengetahuan Sosial', 'العلوم الاجتماعية', 'A'], ['INF', 'Informatika', 'المعلوماتية', 'B']],
    SMA: [['FIS', 'Fisika', 'الفيزياء', 'A'], ['KIM', 'Kimia', 'الكيمياء', 'A'], ['BIO', 'Biologi', 'الأحياء', 'A']],
    SMK: [['KJR', 'Dasar Program Keahlian', 'أساسيات التخصص', 'A'], ['PKK', 'Produk Kreatif & Kewirausahaan', 'ريادة الأعمال', 'B']]
  };

  const list = commonSubjects.concat(levelExtras[level] || levelExtras.WUSTHA);
  batchAppendObjects_('SUBJECTS', list.map((s, i) => ({
    SUBJECT_ID: makeId_('SUB'), LEVEL: level, CODE: s[0], SUBJECT_NAME: s[1],
    SUBJECT_NAME_ARAB: s[2], GROUP_NAME: s[3], DISPLAY_ORDER: i + 1, ACTIVE: 'YA', UPDATED_AT: now_()
  })));

  if (sampleData) {
    const samples = [
      { name: 'أحمد زكي', father: 'عبد الله' },
      { name: 'فاطمة الزهراء', father: 'محمد' },
      { name: 'عمر الفاروق', father: 'خطاب' }
    ];
    batchAppendObjects_('STUDENTS', samples.map((s, i) => ({
      STUDENT_ID: makeId_('STD'),
      NIS: String(11111 + i * 11111),
      NISN: String(1111111111 + i * 1111111111).slice(0, 10),
      NAME: s.name,
      FATHER_NAME: s.father,
      GENDER: i % 2 === 0 ? 'L' : 'P',
      BIRTH_PLACE: 'Jakarta',
      BIRTH_DATE: '2015-01-01',
      RELIGION: 'Islam',
      CLASS_ID: classId,
      ADDRESS: '',
      PARENT_NAME: s.father,
      PHONE: '',
      STATUS: 'AKTIF',
      UPDATED_AT: now_()
    })));
  }
}

function db_() {
  if (_ssCache_) return _ssCache_;
  const id = PropertiesService.getScriptProperties().getProperty(ERAPOR.PROP_DB_ID);
  if (!id) throw new Error('Aplikasi belum disetup.');
  _ssCache_ = SpreadsheetApp.openById(id);
  return _ssCache_;
}

function sheet_(name) {
  if (_sheetCache_[name]) return _sheetCache_[name];
  const sh = db_().getSheetByName(name);
  if (!sh) throw new Error('Sheet tidak ditemukan: ' + name);
  _sheetCache_[name] = sh;
  return sh;
}

function getObjects_(sheetName) {
  const sh = sheet_(sheetName);
  const range = sh.getDataRange();
  const values = range.getValues();
  if (values.length < 2) return [];
  const displayValues = (sheetName === 'SCORES' || sheetName === 'RECAP') ? range.getDisplayValues() : values;
  const headers = values[0].map(String);

  return values.slice(1).filter(row => row.some(v => v !== '')).map((row, rIdx) => {
    const obj = {};
    headers.forEach((h, i) => {
      if ((sheetName === 'SCORES' || sheetName === 'RECAP') && ['PTS', 'PAS', 'FINAL_SCORE', 'TOTAL_SCORE', 'AVERAGE_SCORE'].includes(h)) {
        const disp = displayValues[rIdx + 1][i];
        const num = Number(String(disp).replace(',', '.'));
        obj[h] = (!isNaN(num) && String(disp).trim() !== '') ? num : '';
      } else {
        obj[h] = serializeValue_(row[i]);
      }
    });
    return obj;
  });
}

function listRecords_(cfg, filters) {
  let rows = getObjects_(cfg.sheet);
  Object.keys(filters || {}).forEach(k => {
    const v = filters[k];
    if (v !== '' && v !== null && v !== undefined) rows = rows.filter(r => String(r[k]) === String(v));
  });
  return rows;
}

function batchAppendObjects_(sheetName, objs) {
  if (!objs || !objs.length) return;
  const sh = sheet_(sheetName);
  const headers = SCHEMAS[sheetName];
  const rows = objs.map(obj => headers.map(h => obj[h] === undefined ? '' : obj[h]));
  const startRow = sh.getLastRow() + 1;
  sh.getRange(startRow, 1, rows.length, headers.length).setValues(rows);
  if (sheetName === 'SCORES') {
    ['PTS', 'PAS', 'FINAL_SCORE'].forEach(col => {
      const idx = headers.indexOf(col);
      if (idx >= 0) sh.getRange(startRow, idx + 1, rows.length, 1).setNumberFormat('0.##');
    });
  }
}

function batchUpsertObjects_(sheetName, idField, objs) {
  if (!objs || !objs.length) return;
  const sh = sheet_(sheetName);
  const headers = SCHEMAS[sheetName];
  const idCol = headers.indexOf(idField);
  if (idCol < 0) throw new Error('Kolom ID tidak ditemukan.');

  const data = sh.getDataRange().getValues();
  const rowIndexMap = new Map();
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][idCol]);
    if (key) rowIndexMap.set(key, i + 1);
  }

  const toAppend = [];
  objs.forEach(obj => {
    const key = String(obj[idField]);
    const existingRow = rowIndexMap.get(key);
    if (existingRow) {
      const current = data[existingRow - 1];
      const merged = headers.map((h, i) => Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : current[i]);
      sh.getRange(existingRow, 1, 1, headers.length).setValues([merged]);
    } else {
      toAppend.push(obj);
    }
  });

  if (toAppend.length) {
    batchAppendObjects_(sheetName, toAppend);
  }
}

function deleteObject_(sheetName, idField, id) {
  const sh = sheet_(sheetName);
  const headers = SCHEMAS[sheetName];
  const idCol = headers.indexOf(idField);
  const data = sh.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][idCol]) === String(id)) sh.deleteRow(i + 1);
  }
}

function getSettings_() {
  const rows = getObjects_('SETTINGS');
  const obj = {};
  rows.forEach(r => obj[r.KEY] = r.VALUE);
  return obj;
}

function writeSettings_(settings) {
  const sh = sheet_('SETTINGS');
  sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), 2).clearContent();
  const rows = Object.keys(settings).sort().map(k => [k, settings[k]]);
  if (rows.length) sh.getRange(2, 1, rows.length, 2).setValues(rows);
  sh.autoResizeColumns(1, 2);
}

function parseScoreWeights_(settings) {
  settings = settings || {};
  const rawPts = settings.PTS_WEIGHT;
  const rawPas = settings.PAS_WEIGHT;
  if (rawPts === undefined || rawPts === null || String(rawPts).trim() === '' || rawPas === undefined || rawPas === null || String(rawPas).trim() === '') {
    return { ptsWeight: 30, pasWeight: 70 };
  }
  const pts = Number(String(rawPts).replace(',', '.').trim());
  const pas = Number(String(rawPas).replace(',', '.').trim());
  if (!isFinite(pts) || !isFinite(pas) || pts < 0 || pts > 100 || pas < 0 || pas > 100 || pts + pas <= 0 || Math.round((pts + pas) * 100) !== 10000) {
    return { ptsWeight: 30, pasWeight: 70 };
  }
  return { ptsWeight: Math.round(pts * 100) / 100, pasWeight: Math.round(pas * 100) / 100 };
}

function publicSettings_() {
  const s = getSettings_();
  delete s.APP_SECRET;
  const w = parseScoreWeights_(s);
  s.PTS_WEIGHT = String(w.ptsWeight);
  s.PAS_WEIGHT = String(w.pasWeight);
  return s;
}

function getSession_(token, throwOnMissing) {
  if (!token) { if (throwOnMissing) throw new Error('Sesi login tidak ditemukan.'); return null; }
  const raw = CacheService.getScriptCache().get('sess_' + token);
  if (!raw) { if (throwOnMissing) throw new Error('Sesi telah berakhir.'); return null; }
  CacheService.getScriptCache().put('sess_' + token, raw, ERAPOR.SESSION_SECONDS);
  return JSON.parse(raw);
}

function requireSession_(token) { return getSession_(token, true); }

function authorizeEdit_(user, entity) {
  const role = String(user.role || '').toUpperCase();
  if (role === 'ADMIN') return;
  if (role === 'WALI_KELAS' && ['students', 'scores', 'extracurricular', 'notes'].includes(entity)) return;
  if (role === 'GURU' && ['scores'].includes(entity)) return;
  throw new Error('Anda tidak memiliki hak untuk mengubah data ini.');
}

function authorizeReport_(user) {
  if (!['ADMIN', 'WALI_KELAS', 'KEPALA_SEKOLAH'].includes(String(user.role || '').toUpperCase())) {
    throw new Error('Anda tidak memiliki hak untuk membuat rapor.');
  }
}

function hashPassword_(password, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(password) + String(salt), Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2)).join('');
}

function makeId_(prefix) {
  return prefix + '-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss') + '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
}

function now_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }

function serializeValue_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return v;
}

function numberOrBlank_(v) {
  const clean = cleanScoreValue_(v);
  return clean === '' || clean === null || clean === undefined ? '' : Number(clean);
}

function toScore_(v) {
  const clean = cleanScoreValue_(v);
  const n = Number(clean);
  return isNaN(n) ? 0 : Math.max(0, Math.min(100, n));
}

function sanitizeFileName_(s) {
  return String(s || '').replace(/[\\\\/:*?"<>|#%{}]/g, '-').replace(/\\s+/g, ' ').trim().slice(0, 150);
}

function cleanForLog_(obj) {
  const x = { ...obj };
  delete x.PASSWORD;
  delete x.PASSWORD_HASH;
  delete x.SALT;
  return x;
}

function logAction_(user, action, entity, recordId, detail) {
  try {
    batchAppendObjects_('AUDIT_LOGS', [{
      LOG_ID: makeId_('LOG'),
      USER_ID: user.id || '',
      ACTION: action,
      ENTITY: entity,
      RECORD_ID: recordId || '',
      DETAIL: String(detail || '').slice(0, 500),
      CREATED_AT: now_()
    }]);
  } catch (e) {}
}

function resetReportsInternal_(studentIds, semester, academicYear) {
  const idSet = new Set((studentIds || []).map(String));
  if (!idSet.size) return 0;
  const sh = sheet_('REPORT_FILES');
  const headers = SCHEMAS.REPORT_FILES;
  const data = sh.getDataRange().getValues();
  const idxStudent = headers.indexOf('STUDENT_ID');
  const idxSem = headers.indexOf('SEMESTER');
  const idxYear = headers.indexOf('ACADEMIC_YEAR');
  const idxDoc = headers.indexOf('DOC_ID');
  const idxPdf = headers.indexOf('PDF_ID');
  let count = 0;

  for (let i = data.length - 1; i >= 1; i--) {
    if (
      idSet.has(String(data[i][idxStudent])) &&
      String(data[i][idxSem]) === String(semester) &&
      String(data[i][idxYear]) === String(academicYear)
    ) {
      try { if (data[i][idxDoc]) DriveApp.getFileById(String(data[i][idxDoc])).setTrashed(true); } catch (e) {}
      try { if (data[i][idxPdf]) DriveApp.getFileById(String(data[i][idxPdf])).setTrashed(true); } catch (e) {}
      sh.deleteRow(i + 1);
      count++;
    }
  }
  return count;
}

function appendCenteredCompact_(body, text, size, bold) {
  const p = body.appendParagraph(text);
  p.setAlignment(DocumentApp.HorizontalAlignment.CENTER).setFontSize(size).setBold(Boolean(bold)).setSpacingBefore(0).setSpacingAfter(1);
  return p;
}

function appendCompactSectionTitle_(body, text) {
  const p = body.appendParagraph(text);
  p.setBold(true).setFontSize(9).setSpacingBefore(3).setSpacingAfter(2).setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
}

function formatCompactInfoTable_(table, widths) {
  table.setBorderWidth(0);
  for (let r = 0; r < table.getNumRows(); r++) {
    const row = table.getRow(r);
    for (let c = 0; c < row.getNumCells(); c++) {
      const cell = row.getCell(c);
      if (widths && widths[c]) try { cell.setWidth(widths[c]); } catch (e) {}
      cell.setPaddingTop(1).setPaddingBottom(1).setPaddingLeft(3).setPaddingRight(3);
      const p = cell.getChild(0).asParagraph().setFontSize(8.5).setSpacingBefore(0).setSpacingAfter(0);
      p.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
      p.setBold(true);
    }
  }
}

function formatSplitScoreTable_(table, widths) {
  table.setBorderWidth(0.5).setBorderColor('#9ca3af');
  for (let r = 0; r < table.getNumRows(); r++) {
    const row = table.getRow(r);
    for (let c = 0; c < row.getNumCells(); c++) {
      const cell = row.getCell(c);
      if (widths && widths[c]) try { cell.setWidth(widths[c]); } catch (e) {}
      cell.setPaddingTop(1.5).setPaddingBottom(1.5).setPaddingLeft(2).setPaddingRight(2);
      if (r === 0) cell.setBackgroundColor('#e5e7eb');
      const p = cell.getChild(0).asParagraph().setFontSize(8).setSpacingBefore(0).setSpacingAfter(0);
      if (r === 0) p.setBold(true).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      else if (c === 2 || c === 6) p.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
      else p.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    }
  }
}

function formatCompactReportTable_(table, widths) {
  table.setBorderWidth(0.5).setBorderColor('#9ca3af');
  for (let r = 0; r < table.getNumRows(); r++) {
    const row = table.getRow(r);
    for (let c = 0; c < row.getNumCells(); c++) {
      const cell = row.getCell(c);
      if (widths && widths[c]) try { cell.setWidth(widths[c]); } catch (e) {}
      cell.setPaddingTop(1.5).setPaddingBottom(1.5).setPaddingLeft(3).setPaddingRight(3);
      if (r === 0) cell.setBackgroundColor('#e5e7eb');
      const p = cell.getChild(0).asParagraph().setFontSize(8).setSpacingBefore(0).setSpacingAfter(0);
      if (r === 0) p.setBold(true).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      else if (c === 0 && widths.length > 3) p.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
      else p.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    }
  }
}
`;
