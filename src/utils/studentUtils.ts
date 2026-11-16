import type { StudentRecord } from '../types/erapor.ts';

export interface ParsedNikInfo {
  birthDate: string;
  gender: 'L' | 'P';
}

/**
 * Parse Indonesian 16-digit NIK to extract Birth Date (YYYY-MM-DD) and Gender ('L' | 'P').
 * Digits 7..12 (0-indexed 6..11) are DDMMYY; for females, DD has +40 added.
 */
export function parseNikInfo(nikRaw: unknown): ParsedNikInfo | null {
  const digits = String(nikRaw ?? '').replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 16) return null;

  const rawDay = Number(digits.slice(6, 8));
  const month = Number(digits.slice(8, 10));
  const yy = Number(digits.slice(10, 12));

  if (!Number.isFinite(rawDay) || !Number.isFinite(month) || !Number.isFinite(yy)) return null;

  let gender: 'L' | 'P' = 'L';
  let day = rawDay;
  if (rawDay > 40) {
    gender = 'P';
    day = rawDay - 40;
  }

  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  const currentYY = new Date().getFullYear() % 100;
  const fullYear = yy <= currentYY ? 2000 + yy : 1900 + yy;

  const probe = new Date(Date.UTC(fullYear, month - 1, day));
  if (
    probe.getUTCFullYear() !== fullYear ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  const mmStr = String(month).padStart(2, '0');
  const ddStr = String(day).padStart(2, '0');
  return {
    birthDate: `${fullYear}-${mmStr}-${ddStr}`,
    gender,
  };
}

/**
 * Validate that NIS, NISN, and NIK are distinct from one another on the same student
 * and unique across all other students.
 */
export function validateStudentIdentifiers(
  candidate: {
    STUDENT_ID?: string;
    NIS?: unknown;
    NISN?: unknown;
    NIK?: unknown;
  },
  existingStudents: Pick<StudentRecord, 'STUDENT_ID' | 'NAME' | 'NIS' | 'NISN' | 'NIK'>[]
): string | null {
  const nis = String(candidate.NIS ?? '').trim();
  const nisn = String(candidate.NISN ?? '').trim();
  const nik = String(candidate.NIK ?? '').trim();

  if (nis && nisn && nis === nisn) {
    return 'NIS dan NISN tidak boleh sama.';
  }
  if (nis && nik && nis === nik) {
    return 'NIS dan NIK tidak boleh sama.';
  }
  if (nisn && nik && nisn === nik) {
    return 'NISN dan NIK tidak boleh sama.';
  }

  for (const other of existingStudents) {
    if (candidate.STUDENT_ID && other.STUDENT_ID === candidate.STUDENT_ID) continue;
    const otherNis = String(other.NIS ?? '').trim();
    const otherNisn = String(other.NISN ?? '').trim();
    const otherNik = String(other.NIK ?? '').trim();

    if (nis && otherNis && nis === otherNis) {
      return `NIS "${nis}" sudah digunakan oleh siswa lain (${other.NAME}).`;
    }
    if (nisn && otherNisn && nisn === otherNisn) {
      return `NISN "${nisn}" sudah digunakan oleh siswa lain (${other.NAME}).`;
    }
    if (nik && otherNik && nik === otherNik) {
      return `NIK "${nik}" sudah digunakan oleh siswa lain (${other.NAME}).`;
    }
  }

  return null;
}

/**
 * Find Father & Mother names from an existing student sharing the same Nomor KK.
 */
export function findParentsByKk(
  kkRaw: unknown,
  existingStudents: Pick<StudentRecord, 'STUDENT_ID' | 'KK_NUMBER' | 'FATHER_NAME' | 'MOTHER_NAME'>[],
  excludeStudentId?: string
): { fatherName: string; motherName: string } | null {
  const kk = String(kkRaw ?? '').trim();
  if (!kk) return null;

  for (const s of existingStudents) {
    if (excludeStudentId && s.STUDENT_ID === excludeStudentId) continue;
    if (String(s.KK_NUMBER ?? '').trim() === kk) {
      const fatherName = String(s.FATHER_NAME ?? '').trim();
      const motherName = String(s.MOTHER_NAME ?? '').trim();
      if (fatherName || motherName) {
        return { fatherName, motherName };
      }
    }
  }
  return null;
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface SimpleDateParts {
  year: number;
  month: number;
  day: number;
}

export function parseStudentDate(val: unknown): SimpleDateParts | null {
  const s = String(val ?? '').trim();
  if (!s) return null;

  let year = 0;
  let month = 0;
  let day = 0;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) {
      day = Number(dmy[1]);
      month = Number(dmy[2]);
      year = Number(dmy[3]);
    } else if (/^\d{4}$/.test(s)) {
      year = Number(s);
      month = 1;
      day = 1;
    } else {
      return null;
    }
  }

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
    return null;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function normalizeDateInput(val: unknown): string {
  const p = parseStudentDate(val);
  if (!p) return '';
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function validateStudentStatusDate(
  statusRaw: unknown,
  statusDateRaw: unknown,
  kedatanganRaw?: unknown
): string | null {
  const status = String(statusRaw ?? 'AKTIF').trim().toUpperCase();
  if (status !== 'NONAKTIF' && status !== 'LULUS') {
    return null;
  }
  const parsedStatusDate = parseStudentDate(statusDateRaw);
  if (!parsedStatusDate) {
    return `Tanggal ${status === 'LULUS' ? 'Lulus' : 'Nonaktif'} wajib diisi jika status ${status}.`;
  }
  const parsedKedatangan = parseStudentDate(kedatanganRaw);
  if (parsedKedatangan) {
    const startUtc = Date.UTC(parsedKedatangan.year, parsedKedatangan.month - 1, parsedKedatangan.day);
    const endUtc = Date.UTC(parsedStatusDate.year, parsedStatusDate.month - 1, parsedStatusDate.day);
    if (endUtc < startUtc) {
      return `Tanggal ${status === 'LULUS' ? 'Lulus' : 'Nonaktif'} tidak boleh lebih awal dari tanggal kedatangan.`;
    }
  }
  return null;
}

export function computeMasaBelajar(
  kedatanganRaw: unknown,
  statusRaw: unknown,
  statusDateRaw?: unknown,
  fallbackText?: unknown,
  todayOverride?: string
): string {
  const start = parseStudentDate(kedatanganRaw);
  if (!start) {
    return String(fallbackText ?? '').trim();
  }

  const status = String(statusRaw ?? 'AKTIF').trim().toUpperCase();
  const isStopped = status === 'NONAKTIF' || status === 'LULUS';
  const end = isStopped
    ? parseStudentDate(statusDateRaw)
    : parseStudentDate(todayOverride || todayIsoDate());

  if (!end) {
    return String(fallbackText ?? '').trim();
  }

  const startUtc = Date.UTC(start.year, start.month - 1, start.day);
  const endUtc = Date.UTC(end.year, end.month - 1, end.day);
  if (endUtc < startUtc) {
    return '0 Hari';
  }

  let years = end.year - start.year;
  let months = end.month - start.month;
  let days = end.day - start.day;

  if (days < 0) {
    months -= 1;
    const prevMonthDays = new Date(Date.UTC(end.year, end.month - 1, 0)).getUTCDate();
    days += prevMonthDays;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} Tahun`);
  if (months > 0) parts.push(`${months} Bulan`);
  if (days > 0 || parts.length === 0) parts.push(`${days} Hari`);
  return parts.join(' ');
}

export function composeStudentAddress(student: Partial<StudentRecord>): string {
  const explicit = String(student.ADDRESS ?? '').trim();
  if (explicit) return explicit;
  return [
    student.RT_RW ? `RT/RW ${student.RT_RW}` : '',
    student.VILLAGE || '',
    student.DISTRICT || '',
    student.REGENCY || '',
    student.PROVINCE || '',
  ]
    .filter(Boolean)
    .join(', ');
}

const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function formatIndonesianDate(val: unknown): string {
  const parsed = parseStudentDate(val);
  if (!parsed) return String(val ?? '').trim();
  const s = String(val ?? '').trim();
  if (/^\d{4}$/.test(s)) return s;
  return `${parsed.day} ${INDONESIAN_MONTHS[parsed.month - 1]} ${parsed.year}`;
}

export interface ParentDirectoryEntry {
  key: string;
  name: string;
  roleLabel: 'Ayah' | 'Ibu' | 'Wali';
  defaultRelation: string;
  studentName: string;
  kkNumber: string;
  address: string;
  phone: string;
}

export function buildParentDirectory(
  students: StudentRecord[],
  excludeStudentId?: string
): ParentDirectoryEntry[] {
  const seen = new Map<string, ParentDirectoryEntry>();

  const pushEntry = (
    nameRaw: unknown,
    roleLabel: 'Ayah' | 'Ibu' | 'Wali',
    defaultRelation: string,
    addressRaw: unknown,
    s: StudentRecord
  ) => {
    const name = String(nameRaw ?? '').trim();
    if (!name) return;
    const address = String(addressRaw ?? '').trim() || composeStudentAddress(s);
    const dedupKey = `${name.toLowerCase()}|${roleLabel}|${address.toLowerCase()}`;
    if (seen.has(dedupKey)) return;
    seen.set(dedupKey, {
      key: `${s.STUDENT_ID}-${roleLabel}-${seen.size}`,
      name,
      roleLabel,
      defaultRelation,
      studentName: s.NAME,
      kkNumber: String(s.KK_NUMBER ?? '').trim(),
      address,
      phone: String(s.PHONE ?? '').trim(),
    });
  };

  for (const s of students) {
    if (excludeStudentId && s.STUDENT_ID === excludeStudentId) continue;
    const studentAddr = composeStudentAddress(s);
    pushEntry(s.FATHER_NAME, 'Ayah', 'Ayah Kandung', studentAddr, s);
    pushEntry(s.MOTHER_NAME, 'Ibu', 'Ibu Kandung', studentAddr, s);
    const waliName = String(s.WALI_NAME || '').trim();
    if (
      waliName &&
      waliName.toLowerCase() !== String(s.FATHER_NAME || '').trim().toLowerCase() &&
      waliName.toLowerCase() !== String(s.MOTHER_NAME || '').trim().toLowerCase()
    ) {
      pushEntry(
        waliName,
        'Wali',
        String(s.WALI_RELATION || '').trim() || 'Wali',
        s.WALI_ADDRESS || studentAddr,
        s
      );
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function compressImageToDataUrl(
  file: File,
  maxWidth = 420,
  maxHeight = 560,
  quality = 0.85
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File harus berupa gambar (JPG, PNG, atau WEBP).');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Format gambar tidak valid atau rusak.'));
    image.src = rawDataUrl;
  });

  const ratio = Math.min(1, maxWidth / img.width, maxHeight / img.height);
  const targetW = Math.max(1, Math.round(img.width * ratio));
  const targetH = Math.max(1, Math.round(img.height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return rawDataUrl;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);

  return canvas.toDataURL('image/jpeg', quality);
}

