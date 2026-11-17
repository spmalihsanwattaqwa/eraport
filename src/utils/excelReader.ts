import * as XLSX from 'xlsx';
import { sanitizeImportedText } from './importNormalizer.ts';

function extractCleanCellValue(cell: XLSX.CellObject | undefined): string | number {
  if (!cell || cell.t === 'z') return '';

  // Handle Excel numeric date cells cleanly using SSF parser
  if (cell.t === 'n' && typeof cell.v === 'number') {
    const fmt = typeof cell.z === 'string' ? cell.z : '';
    if (fmt && XLSX.SSF.is_date(fmt)) {
      const parsed = XLSX.SSF.parse_date_code(cell.v);
      if (parsed && parsed.y && parsed.m && parsed.d) {
        return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
      }
    }
    // Preserve formatted digit strings if they retain leading zeros (e.g. NISN "0012345678")
    if (typeof cell.w === 'string' && /^\d+$/.test(cell.w.trim()) && cell.w.trim().startsWith('0')) {
      return cell.w.trim();
    }
    // Avoid scientific notation for large integer IDs (e.g. NIK / No. KK)
    if (Number.isInteger(cell.v) && Math.abs(cell.v) >= 1e10) {
      return cell.v.toFixed(0);
    }
    return cell.v;
  }

  if (cell.t === 'd' && cell.v instanceof Date && !Number.isNaN(cell.v.getTime())) {
    const d = cell.v;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  if (cell.t === 'b') {
    return cell.v ? 'TRUE' : 'FALSE';
  }

  const rawText = cell.v !== undefined && cell.v !== null ? cell.v : cell.w ?? '';
  return sanitizeImportedText(rawText);
}

/**
 * Parse an XLSX/XLS/CSV sheet into plain objects stripped of foreign fonts, HTML,
 * rich-text runs, and weird whitespace, while normalizing Excel date cells.
 */
export function parseCleanSheetRows(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  const ref = sheet['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  if (range.e.r <= range.s.r) return [];

  const headers: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
    const val = sanitizeImportedText(extractCleanCellValue(sheet[addr]));
    headers.push(val);
  }

  const rows: Record<string, unknown>[] = [];
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const rowObj: Record<string, unknown> = {};
    let hasValue = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const header = headers[c - range.s.c];
      if (!header) continue;
      const addr = XLSX.utils.encode_cell({ r, c });
      const val = extractCleanCellValue(sheet[addr]);
      if (val !== '' && val !== undefined && val !== null) {
        hasValue = true;
      }
      rowObj[header] = val;
    }
    if (hasValue) {
      rows.push(rowObj);
    }
  }
  return rows;
}

export function readCleanExcelWorkbook(buf: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(new Uint8Array(buf), {
    type: 'array',
    cellStyles: false,
    cellHTML: false,
    cellNF: true,
    cellDates: false,
  });
}
