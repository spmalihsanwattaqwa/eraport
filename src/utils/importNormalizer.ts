import { formatDateDDMMYYYY, normalizeDateInput } from './studentUtils.ts';

const ARABIC_INDIC_MAP: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
};

export function toAsciiDigits(val: unknown): string {
  return String(val ?? '').replace(/[٠-٩۰-۹]/g, (ch) => ARABIC_INDIC_MAP[ch] ?? ch);
}

/**
 * Normalize imported / pasted text to standard application plain-text font & whitespace:
 * - Strips HTML tags, rich-text styling, and common HTML entities
 * - Applies Unicode NFKC normalization (converts stylized/bold/italic/fullwidth Unicode fonts to standard text)
 * - Removes zero-width/control characters and normalizes whitespace
 */
export function sanitizeImportedText(val: unknown): string {
  if (val === null || val === undefined) return '';
  let s = String(val);
  if (!s) return '';

  // Strip HTML tags if Excel/HTML clipboard included <font>, <span>, <b>, etc.
  s = s.replace(/<[^>]*>/g, ' ');
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // NFKC converts Unicode mathematical bold/italic/script/sans/monospace & fullwidth chars to standard characters
  s = s.normalize('NFKC');

  // Remove zero-width / soft-hyphen / BOM / control chars (preserve normal spaces)
  s = s
    .replace(/[\u200B-\u200D\uFEFF\u00AD\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\u00A0\t\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return s;
}

/**
 * Clean ID / numeric code fields (NIS, NISN, NIK, No. KK, Telepon) from Excel artifacts.
 */
export function normalizeImportedIdentifier(val: unknown): string {
  if (val === null || val === undefined) return '';
  let s = toAsciiDigits(sanitizeImportedText(val));
  if (!s) return '';
  // Strip leading apostrophe often used in Excel to preserve leading zeros
  s = s.replace(/^'+/, '').trim();
  // Strip accidental ".0" from numeric Excel cells
  if (/^\d+\.0+$/.test(s)) {
    s = s.replace(/\.0+$/, '');
  }
  return s;
}

const UPPER_ACRONYMS = new Set(['DKI', 'DIY', 'NAD', 'NTB', 'NTT', 'RI', 'RT', 'RW', 'II', 'III', 'IV']);

/**
 * Standardize Latin text casing (places, relation, etc.) to clean Title Case when all-caps or all-lowercase,
 * while leaving Arabic script untouched aside from whitespace/Unicode normalization.
 */
export function normalizeImportedLatinTitle(val: unknown): string {
  const s = sanitizeImportedText(val);
  if (!s) return '';
  if (/[\u0600-\u06FF]/.test(s)) return s;

  const isAllUpper = s === s.toUpperCase() && s !== s.toLowerCase();
  const isAllLower = s === s.toLowerCase() && s !== s.toUpperCase();
  if (!isAllUpper && !isAllLower) return s;

  return s
    .split(/\s+/)
    .map((word) => {
      const bare = word.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (UPPER_ACRONYMS.has(bare)) return word.toUpperCase();
      return word.toLowerCase().replace(/(^|[/\-(])([a-z])/g, (_, sep, ch) => `${sep}${ch.toUpperCase()}`);
    })
    .join(' ');
}

export function normalizeImportedGender(val: unknown): 'L' | 'P' {
  const g = sanitizeImportedText(val).toUpperCase();
  if (
    g === 'P' ||
    g === 'PR' ||
    g === 'F' ||
    g === 'FEMALE' ||
    g === 'PEREMPUAN' ||
    g === 'WANITA' ||
    g === 'أنثى' ||
    g === 'مؤنث' ||
    g.startsWith('P')
  ) {
    return 'P';
  }
  return 'L';
}

export function normalizeImportedStatus(val: unknown): 'AKTIF' | 'LULUS' | 'NONAKTIF' {
  const s = sanitizeImportedText(val).toUpperCase();
  if (s === 'LULUS') return 'LULUS';
  if (s === 'NONAKTIF' || s === 'NON AKTIF' || s === 'TIDAK AKTIF' || s === 'KELUAR' || s === 'PINDAH') {
    return 'NONAKTIF';
  }
  return 'AKTIF';
}

export function normalizeImportedYesNo(val: unknown, fallback: 'YA' | 'TIDAK' = 'YA'): 'YA' | 'TIDAK' {
  const s = sanitizeImportedText(val).toUpperCase();
  if (!s) return fallback;
  if (s === 'TIDAK' || s === 'NO' || s === 'N' || s === 'FALSE' || s === '0' || s === 'NONAKTIF') {
    return 'TIDAK';
  }
  if (s === 'YA' || s === 'YES' || s === 'Y' || s === 'TRUE' || s === '1' || s === 'AKTIF') {
    return 'YA';
  }
  return fallback;
}

export function normalizeImportedTahfidzType(val: unknown): string {
  const raw = sanitizeImportedText(val).toLowerCase();
  if (!raw || raw === '-') return '';
  if (raw === 'yanbua' || raw === "yanbu'a") return 'Yanbua';
  if (raw === 'binnadzor' || raw === 'bin nadzor' || raw === 'bin-nadzor') return 'Binnadzor';
  if (raw === 'bil ghoib' || raw === 'bilghoib' || raw === 'bil-ghoib' || raw === 'bil ghaib') {
    return 'Bil Ghoib';
  }
  return sanitizeImportedText(val);
}

export function normalizeImportedDateIso(val: unknown): string {
  const cleaned = typeof val === 'string' ? toAsciiDigits(sanitizeImportedText(val)) : val;
  return normalizeDateInput(cleaned) || (typeof cleaned === 'string' ? cleaned : '');
}

export function normalizeImportedDateDDMMYYYY(val: unknown): string {
  const cleaned = typeof val === 'string' ? toAsciiDigits(sanitizeImportedText(val)) : val;
  return formatDateDDMMYYYY(cleaned);
}
