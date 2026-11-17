export const APP_DEFAULT_TITLE =
  'eRapor Sekolah v2 — Pengolahan Nilai & Rapor Bahasa Arab';

export function sanitizeFilePart(value: unknown, fallback = ''): string {
  const cleaned = String(value ?? '')
    .replace(/^'+/, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/^[-.\s]+|[-.\s]+$/g, '')
    .trim();
  return cleaned || fallback;
}

export function formatSemesterPart(semester: string | number): string {
  const clean = sanitizeFilePart(semester);
  if (!clean) return '';
  if (/^sem(ester)?\b/i.test(clean)) return clean;
  return `Semester ${clean}`;
}

function joinFileParts(parts: string[], fallback = 'eRapor'): string {
  const joined = parts.filter(Boolean).join('-').slice(0, 160).replace(/-+$/, '').trim();
  return joined || fallback;
}

export function buildRecapFileName(
  className: string,
  semester: string | number,
  academicYear: string
): string {
  return joinFileParts(
    [
      sanitizeFilePart(className, 'Semua Kelas'),
      formatSemesterPart(semester),
      sanitizeFilePart(academicYear),
    ],
    'Rekapitulasi'
  );
}

export function buildTranscriptFileName(student: {
  NAME?: string;
  NISN?: string;
  REGENCY?: string;
}): string {
  return joinFileParts(
    [
      sanitizeFilePart(student.NAME, 'Siswa'),
      sanitizeFilePart(student.NISN),
      sanitizeFilePart(student.REGENCY),
    ],
    'Transkrip'
  );
}

export function buildReportFileName(
  student: { NAME?: string; NISN?: string },
  semester: string | number,
  academicYear: string
): string {
  return joinFileParts(
    [
      sanitizeFilePart(student.NAME, 'Siswa'),
      sanitizeFilePart(student.NISN),
      formatSemesterPart(semester),
      sanitizeFilePart(academicYear),
    ],
    'Rapor'
  );
}

export function buildBiodataFileName(student: {
  NAME?: string;
  REGENCY?: string;
  NISN?: string;
}): string {
  return joinFileParts(
    [
      sanitizeFilePart(student.NAME, 'Siswa'),
      sanitizeFilePart(student.REGENCY),
      sanitizeFilePart(student.NISN),
    ],
    'Biodata'
  );
}

export function printWithDocumentTitle(fileNameBase: string): void {
  if (typeof document !== 'undefined' && fileNameBase.trim()) {
    document.title = fileNameBase.trim();
  }
  window.print();
}
