import type { AppSettings, GradeCategory, PredicateCategory } from '../types/erapor.ts';

export const DEFAULT_SYAKHSIYAH_CATEGORIES: PredicateCategory[] = [
  { name: 'ممتاز', label: 'Sangat Baik' },
  { name: 'جيد جدا', label: 'Baik Sekali' },
  { name: 'جيد', label: 'Baik' },
  { name: 'مقبول', label: 'Cukup' },
  { name: 'ناقص', label: 'Kurang' },
];

export const DEFAULT_EXTRA_CATEGORIES: PredicateCategory[] = [
  { name: 'ممتاز', label: 'Sangat Baik' },
  { name: 'جيد جدا', label: 'Baik Sekali' },
  { name: 'جيد', label: 'Baik' },
  { name: 'مقبول', label: 'Cukup' },
];

export function parsePredicateCategories(
  jsonStr?: string,
  fallback: PredicateCategory[] = DEFAULT_SYAKHSIYAH_CATEGORIES
): PredicateCategory[] {
  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        const cleaned = parsed
          .map((item) => {
            if (typeof item === 'string') {
              return { name: item.trim(), label: '' };
            }
            if (item && typeof item === 'object') {
              return {
                name: String((item as { name?: unknown }).name ?? '').trim(),
                label: String((item as { label?: unknown }).label ?? '').trim(),
              };
            }
            return { name: '', label: '' };
          })
          .filter((c) => c.name);
        if (cleaned.length > 0) return cleaned;
      }
    } catch {
      // fall back
    }
  }
  return fallback.map((x) => ({ ...x }));
}

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/**
 * Clean a score value strictly within [0, 100].
 * Returns '' for empty or invalid entries.
 */
export function cleanScoreValue(v: unknown): number | '' {
  if (v === '' || v === null || v === undefined) return '';
  const num = Number(String(v).replace(',', '.').trim());
  if (!Number.isFinite(num) || num < 0 || num > 100) return '';
  return Math.round((num + Number.EPSILON) * 10) / 10;
}

/**
 * Clean any non-negative numeric value (used for totals > 100 as well as scores).
 */
export function cleanNumericValue(v: unknown): number | '' {
  if (v === '' || v === null || v === undefined) return '';
  const num = Number(String(v).replace(',', '.').trim());
  if (!Number.isFinite(num) || num < 0) return '';
  return Math.round((num + Number.EPSILON) * 10) / 10;
}

/**
 * Convert ASCII digits (0-9) in ANY string or number to Eastern Arabic digits (٠-٩).
 * Fixed: Does NOT filter out strings like "2026/2027", "1A", dates, or totals > 100!
 */
export function toArabicDigits(input: unknown): string {
  if (input === null || input === undefined || input === '') return '';
  return String(input).replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)]);
}

const ONES = [
  '',
  'واحد',
  'اثنان',
  'ثلاثة',
  'أربعة',
  'خمسة',
  'ستة',
  'سبعة',
  'ثمانية',
  'تسعة',
  'عشرة',
  'أحد عشر',
  'اثنا عشر',
  'ثلاثة عشر',
  'أربعة عشر',
  'خمسة عشر',
  'ستة عشر',
  'سبعة عشر',
  'ثمانية عشر',
  'تسعة عشر',
];

const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];

const HUNDREDS = [
  '',
  'مائة',
  'مائتان',
  'ثلاثمائة',
  'أربعمائة',
  'خمسمائة',
  'ستمائة',
  'سبعمائة',
  'ثمانمائة',
  'تسعمائة',
];

export function intToArabicWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  const int = Math.floor(n);
  if (int === 0) return 'صفر';
  if (int < 20) return ONES[int];
  if (int < 100) {
    const u = int % 10;
    const t = Math.floor(int / 10);
    return u > 0 ? `${ONES[u]} و${TENS[t]}` : TENS[t];
  }
  if (int < 1000) {
    const h = Math.floor(int / 100);
    const rem = int % 100;
    return rem > 0 ? `${HUNDREDS[h]} و${intToArabicWords(rem)}` : HUNDREDS[h];
  }
  if (int < 10000) {
    const th = Math.floor(int / 1000);
    const rem = int % 1000;
    let thStr = '';
    if (th === 1) thStr = 'ألف';
    else if (th === 2) thStr = 'ألفان';
    else if (th >= 3 && th <= 10) thStr = `${ONES[th]} آلاف`;
    else thStr = `${intToArabicWords(th)} ألف`;
    return rem > 0 ? `${thStr} و${intToArabicWords(rem)}` : thStr;
  }
  return toArabicDigits(int);
}

/**
 * Convert any valid number (scores 0..100 AND class totals > 100) into Arabic words (Terbilang).
 * Properly handles decimal precision (e.g. 85.05 -> خمسة وثمانون فاصلة صفر خمسة).
 */
export function numberToArabicWords(num: unknown): string {
  const cleanNum = cleanNumericValue(num);
  if (cleanNum === '') return '';
  if (cleanNum === 0) return 'صفر';

  const parts = String(cleanNum).split('.');
  const intPart = parseInt(parts[0], 10);
  let words = intToArabicWords(intPart);

  if (parts[1]) {
    const rawDec = parts[1].replace(/0+$/, '');
    if (rawDec.length > 0) {
      if (rawDec.startsWith('0')) {
        const digitWords = rawDec
          .split('')
          .map((d) => intToArabicWords(parseInt(d, 10)))
          .join(' ');
        words += ` فاصلة ${digitWords}`;
      } else {
        const decVal = parseInt(rawDec, 10);
        words += ` فاصلة ${intToArabicWords(decVal)}`;
      }
    }
  }
  return words;
}

/**
 * Format Tahfidz Kitabah (الكتابة) based on program type:
 * - Yanbua: مجلد + Arabic number words (Jilid)
 * - Binnadzor / Bil Ghoib: singular / dual / plural Juz (جزء / جزءان / أجزاء / جزءًا)
 */
export function formatTahfidzKitabah(tahfidzType: string, score: unknown): string {
  const val = cleanScoreValue(score);
  if (val === '') return '';

  const t = String(tahfidzType || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

  if (t === 'yanbua' || t === "yanbu'a") {
    return `مجلد ${numberToArabicWords(val)}`;
  }

  if (
    t === 'binnadzor' ||
    t === 'bin nadzor' ||
    t === 'bin-nadzor' ||
    t === 'bil ghoib' ||
    t === 'bilghoib' ||
    t === 'bil-ghoib' ||
    t === 'bil ghaib'
  ) {
    if (!Number.isInteger(val)) {
      return `${numberToArabicWords(val)} جزءًا`;
    }
    const n = Math.floor(val);
    if (n === 0) return 'صفر جزء';
    if (n === 1) return 'جزء واحد';
    if (n === 2) return 'جزءان اثنان';
    if (n >= 3 && n <= 10) return `${intToArabicWords(n)} أجزاء`;
    if (n >= 11 && n <= 99) return `${intToArabicWords(n)} جزءًا`;
    return `${intToArabicWords(n)} جزء`;
  }

  return numberToArabicWords(val);
}

export function getGradeCategory(avgScore: number | '', categoriesJson?: string): string {
  if (avgScore === '' || avgScore === null || !Number.isFinite(Number(avgScore))) return '-';
  let categories: GradeCategory[] = [];
  if (categoriesJson) {
    try {
      categories = JSON.parse(categoriesJson);
    } catch {
      categories = [];
    }
  }
  if (!categories.length) {
    categories = [
      { name: 'ممتاز', min: 90, max: 100 },
      { name: 'جيد جدا', min: 80, max: 89.99 },
      { name: 'جيد', min: 70, max: 79.99 },
      { name: 'مقبول', min: 60, max: 69.99 },
      { name: 'راسب', min: 0, max: 59.99 },
    ];
  }
  const num = Number(avgScore);
  const found = categories.find((c) => num >= Number(c.min) && num <= Number(c.max));
  return found ? found.name : '-';
}

export function getPromotionDecision(
  semester: string | number,
  category: string
): { status: string; arabic: string; isRetained: boolean } | null {
  if (String(semester).trim() !== '2') return null;
  const cat = String(category || '').trim();
  if (!cat || cat === '-') {
    return { status: '-', arabic: '-', isRetained: false };
  }
  if (cat === 'راسب') {
    return {
      status: 'Tidak Naik Kelas',
      arabic: 'يبقى في نفس الصف',
      isRetained: true,
    };
  }
  return {
    status: 'Naik Kelas',
    arabic: 'يرقى إلى الصف التالي',
    isRetained: false,
  };
}

export function parseScoreWeights(
  settings?: Partial<AppSettings> | { PTS_WEIGHT?: unknown; PAS_WEIGHT?: unknown } | null
): { ptsWeight: number; pasWeight: number } {
  const rawPts = settings?.PTS_WEIGHT;
  const rawPas = settings?.PAS_WEIGHT;
  if (
    rawPts === undefined ||
    rawPts === null ||
    String(rawPts).trim() === '' ||
    rawPas === undefined ||
    rawPas === null ||
    String(rawPas).trim() === ''
  ) {
    return { ptsWeight: 30, pasWeight: 70 };
  }
  const pts = Number(String(rawPts).replace(',', '.').trim());
  const pas = Number(String(rawPas).replace(',', '.').trim());
  if (
    !Number.isFinite(pts) ||
    !Number.isFinite(pas) ||
    pts < 0 ||
    pts > 100 ||
    pas < 0 ||
    pas > 100 ||
    pts + pas <= 0 ||
    Math.round((pts + pas) * 100) !== 10000
  ) {
    return { ptsWeight: 30, pasWeight: 70 };
  }
  return {
    ptsWeight: Math.round(pts * 100) / 100,
    pasWeight: Math.round(pas * 100) / 100,
  };
}

export function computeFinalScore(
  ptsRaw: unknown,
  pasRaw: unknown,
  ptsWeightRaw: unknown = 30,
  pasWeightRaw: unknown = 70
): {
  pts: number | '';
  pas: number | '';
  finalScore: number | '';
} {
  const ptsStr = String(ptsRaw ?? '').trim();
  const pasStr = String(pasRaw ?? '').trim();
  if (ptsStr === '' && pasStr === '') {
    return { pts: '', pas: '', finalScore: '' };
  }

  const ptsVal = ptsStr === '' ? '' : cleanScoreValue(ptsStr);
  const pasVal = pasStr === '' ? '' : cleanScoreValue(pasStr);

  if (ptsVal === '' && pasVal === '') {
    return { pts: '', pas: '', finalScore: '' };
  }
  if (ptsVal === '' && pasVal !== '') {
    return { pts: '', pas: pasVal, finalScore: pasVal };
  }
  if (ptsVal !== '' && pasVal === '') {
    return { pts: ptsVal, pas: '', finalScore: ptsVal };
  }

  const { ptsWeight, pasWeight } = parseScoreWeights({
    PTS_WEIGHT: ptsWeightRaw,
    PAS_WEIGHT: pasWeightRaw,
  });
  const totalWeight = ptsWeight + pasWeight;
  const finalScore =
    Math.round(
      (((Number(ptsVal) * ptsWeight + Number(pasVal) * pasWeight) / totalWeight) + Number.EPSILON) *
        10
    ) / 10;
  return { pts: ptsVal, pas: pasVal, finalScore };
}
