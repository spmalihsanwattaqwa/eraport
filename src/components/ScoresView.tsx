import React, { useEffect, useMemo, useState } from 'react';
import { Save, Search } from 'lucide-react';
import { api } from '../api/client.ts';
import type {
  AcademicYearRecord,
  AppSettings,
  AttendanceSyakhsiyahGridRow,
  ClassRecord,
  ScoreGridRow,
  SubjectRecord,
  TahfidzGridRow,
} from '../types/erapor.ts';
import {
  computeFinalScore,
  DEFAULT_SYAKHSIYAH_CATEGORIES,
  formatTahfidzKitabah,
  numberToArabicWords,
  parsePredicateCategories,
  parseScoreWeights,
  subjectMatchesLevel,
} from '../utils/arabic.ts';
import { sanitizeImportedText, toAsciiDigits } from '../utils/importNormalizer.ts';

interface ScoresViewProps {
  classes: ClassRecord[];
  subjects: SubjectRecord[];
  academicYears: AcademicYearRecord[];
  selectedYear: string;
  settings: AppSettings;
  canEdit: boolean;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

const ATT_FIELDS = [
  'sick',
  'permission',
  'absent',
  'suluk',
  'nadhafah',
  'muwazhabah',
  'note',
] as const;

type AttField = (typeof ATT_FIELDS)[number];

export function ScoresView({
  classes,
  subjects,
  academicYears,
  selectedYear,
  settings,
  canEdit,
  onToast,
}: ScoresViewProps) {
  const { ptsWeight, pasWeight } = parseScoreWeights(settings);
  const syakhsiyahCategories = useMemo(
    () => parsePredicateCategories(settings.SYAKHSIYAH_CATEGORIES, DEFAULT_SYAKHSIYAH_CATEGORIES),
    [settings.SYAKHSIYAH_CATEGORIES]
  );
  const defaultSyakhsiyah = syakhsiyahCategories[0]?.name || 'ممتاز';

  const TAHFIDZ_OPTIONS = ['Yanbua', 'Binnadzor', 'Bil Ghoib'] as const;

  const [activeTab, setActiveTab] = useState<'scores' | 'attendance' | 'tahfidz'>('scores');
  const [academicYear, setAcademicYear] = useState(
    selectedYear || settings.ACADEMIC_YEAR || '2026/2027'
  );
  const yearClasses = useMemo(
    () => classes.filter((c) => !academicYear || String(c.ACADEMIC_YEAR).trim() === academicYear),
    [classes, academicYear]
  );
  const [classId, setClassId] = useState(yearClasses[0]?.CLASS_ID || '');
  const selectedClassObj = useMemo(
    () => yearClasses.find((c) => c.CLASS_ID === classId) || classes.find((c) => c.CLASS_ID === classId),
    [yearClasses, classes, classId]
  );
  const filteredSubjects = useMemo(() => {
    const level = selectedClassObj?.LEVEL;
    if (!level) return subjects;
    const matched = subjects.filter((s) => subjectMatchesLevel(s.LEVEL, level));
    return matched.length ? matched : subjects;
  }, [subjects, selectedClassObj]);
  const [subjectId, setSubjectId] = useState(filteredSubjects[0]?.SUBJECT_ID || '');
  const [semester, setSemester] = useState(settings.ACTIVE_SEMESTER || '1');

  useEffect(() => {
    if (selectedYear) setAcademicYear(selectedYear);
  }, [selectedYear]);

  useEffect(() => {
    if (!yearClasses.some((c) => c.CLASS_ID === classId)) {
      setClassId(yearClasses[0]?.CLASS_ID || '');
    }
  }, [yearClasses, classId]);

  useEffect(() => {
    if (!filteredSubjects.some((s) => s.SUBJECT_ID === subjectId)) {
      setSubjectId(filteredSubjects[0]?.SUBJECT_ID || '');
    }
  }, [filteredSubjects, subjectId]);

  // Tab 1: PTS & PAS
  const [rows, setRows] = useState<ScoreGridRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Tab 2: Ketidakhadiran & Syakhsiyah
  const [attRows, setAttRows] = useState<AttendanceSyakhsiyahGridRow[] | null>(null);
  const [attLoading, setAttLoading] = useState(false);
  const [attSaving, setAttSaving] = useState(false);

  // Tab 3: Tahfidz
  const [tahfidzRows, setTahfidzRows] = useState<TahfidzGridRow[] | null>(null);
  const [tahfidzLoading, setTahfidzLoading] = useState(false);
  const [tahfidzSaving, setTahfidzSaving] = useState(false);
  const [bulkTahfidzType, setBulkTahfidzType] = useState<(typeof TAHFIDZ_OPTIONS)[number]>('Yanbua');

  const loadGrid = async () => {
    if (!classId || !subjectId) {
      onToast('Pilih kelas dan mata pelajaran terlebih dahulu.', 'err');
      return;
    }
    setLoading(true);
    try {
      const data = await api.getScoreGrid(classId, subjectId, semester, academicYear);
      setRows(data);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal memuat daftar nilai', 'err');
    } finally {
      setLoading(false);
    }
  };

  const loadAttendanceGrid = async () => {
    if (!classId) {
      onToast('Pilih kelas terlebih dahulu.', 'err');
      return;
    }
    setAttLoading(true);
    try {
      const data = await api.getAttendanceSyakhsiyahGrid(classId, semester, academicYear);
      setAttRows(data);
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'Gagal memuat data ketidakhadiran & syakhsiyah',
        'err'
      );
    } finally {
      setAttLoading(false);
    }
  };

  const loadTahfidzGrid = async () => {
    if (!classId) {
      onToast('Pilih kelas terlebih dahulu.', 'err');
      return;
    }
    setTahfidzLoading(true);
    try {
      const data = await api.getTahfidzGrid(classId, semester, academicYear);
      setTahfidzRows(data);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal memuat data tahfidz', 'err');
    } finally {
      setTahfidzLoading(false);
    }
  };

  const updateCell = (idx: number, field: 'pts' | 'pas', rawVal: string) => {
    if (!rows) return;
    setRows((prev) => {
      if (!prev) return prev;
      const copy = [...prev];
      const item = { ...copy[idx] };
      const cleaned = rawVal.trim() === '' ? '' : Number(rawVal);
      if (field === 'pts') item.pts = cleaned as number | '';
      else item.pas = cleaned as number | '';

      const calc = computeFinalScore(item.pts, item.pas, ptsWeight, pasWeight);
      item.finalScore = calc.finalScore;
      item.finalScoreArab = calc.finalScore !== '' ? numberToArabicWords(calc.finalScore) : '';
      copy[idx] = item;
      return copy;
    });
  };

  const handlePaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    startIdx: number,
    field: 'pts' | 'pas'
  ) => {
    const text = e.clipboardData.getData('text');
    if (!text || (!text.includes('\n') && !text.includes('\t'))) return;
    e.preventDefault();
    if (!rows) return;

    const lines = text.replace(/\r?\n$/, '').split(/\r\n|\n|\r/);
    if (!lines.some((l) => l.trim() !== '')) return;

    const copy = [...rows];
    let count = 0;

    lines.forEach((line, offset) => {
      const targetIdx = startIdx + offset;
      if (!copy[targetIdx]) return;
      const cols = line.split('\t');
      const item = { ...copy[targetIdx] };

      if (cols.length >= 2 && field === 'pts') {
        const raw1 = toAsciiDigits(sanitizeImportedText(cols[0]));
        const raw2 = toAsciiDigits(sanitizeImportedText(cols[1]));
        const v1 = raw1 === '' ? NaN : Number(raw1.replace(',', '.'));
        const v2 = raw2 === '' ? NaN : Number(raw2.replace(',', '.'));
        if (!Number.isNaN(v1)) {
          item.pts = Math.round((Math.max(0, Math.min(100, v1)) + Number.EPSILON) * 10) / 10;
        }
        if (!Number.isNaN(v2)) {
          item.pas = Math.round((Math.max(0, Math.min(100, v2)) + Number.EPSILON) * 10) / 10;
        }
        if (!Number.isNaN(v1) || !Number.isNaN(v2)) count++;
      } else {
        const raw0 = toAsciiDigits(sanitizeImportedText(cols[0]));
        if (raw0 !== '') {
          const v = Number(raw0.replace(',', '.'));
          if (!Number.isNaN(v)) {
            const clamped = Math.round((Math.max(0, Math.min(100, v)) + Number.EPSILON) * 10) / 10;
            if (field === 'pts') item.pts = clamped;
            else item.pas = clamped;
            count++;
          }
        }
      }

      const calc = computeFinalScore(item.pts, item.pas, ptsWeight, pasWeight);
      item.finalScore = calc.finalScore;
      item.finalScoreArab = calc.finalScore !== '' ? numberToArabicWords(calc.finalScore) : '';
      copy[targetIdx] = item;
    });

    setRows(copy);
    if (count > 0) {
      onToast(`${count} baris nilai berhasil di-paste dari Excel.`);
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    idx: number,
    field: string
  ) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = document.querySelector<HTMLInputElement>(
        `input[data-row="${idx + 1}"][data-field="${field}"]`
      );
      next?.focus();
      next?.select();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = document.querySelector<HTMLInputElement>(
        `input[data-row="${idx - 1}"][data-field="${field}"]`
      );
      prev?.focus();
      prev?.select();
    }
  };

  const handleSave = async () => {
    if (!rows) return;
    setSaving(true);
    try {
      const res = await api.saveScores({
        subjectId,
        semester,
        academicYear,
        rows: rows.map((r) => ({
          studentId: r.studentId,
          scoreId: r.scoreId,
          pts: r.pts,
          pas: r.pas,
        })),
      });
      onToast(`${res.saved} nilai berhasil disimpan.`);
      await loadGrid();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menyimpan nilai', 'err');
    } finally {
      setSaving(false);
    }
  };

  const updateAttCell = (idx: number, field: AttField, val: string) => {
    setAttRows((prev) => {
      if (!prev) return prev;
      const copy = [...prev];
      const item = { ...copy[idx] };
      if (field === 'sick' || field === 'permission' || field === 'absent') {
        item[field] = val.trim() === '' ? '' : Math.max(0, Math.floor(Number(val) || 0));
      } else {
        item[field] = val;
      }
      copy[idx] = item;
      return copy;
    });
  };

  const handleAttPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    startIdx: number,
    field: AttField
  ) => {
    const text = e.clipboardData.getData('text');
    if (!text || (!text.includes('\n') && !text.includes('\t'))) return;
    e.preventDefault();
    if (!attRows) return;

    const lines = text.replace(/\r?\n$/, '').split(/\r\n|\n|\r/);
    const startColIdx = ATT_FIELDS.indexOf(field);
    if (startColIdx === -1) return;

    const copy = [...attRows];
    let count = 0;

    lines.forEach((line, offset) => {
      const targetIdx = startIdx + offset;
      if (!copy[targetIdx]) return;
      const cols = line.split('\t');
      const item = { ...copy[targetIdx] };
      let rowUpdated = false;

      cols.forEach((rawCol, colOffset) => {
        const targetField = ATT_FIELDS[startColIdx + colOffset];
        if (!targetField) return;
        const trimmed = sanitizeImportedText(rawCol);

        if (
          targetField === 'sick' ||
          targetField === 'permission' ||
          targetField === 'absent'
        ) {
          const numStr = toAsciiDigits(trimmed);
          if (numStr !== '') {
            const n = Math.floor(Number(numStr.replace(',', '.')));
            if (Number.isFinite(n) && n >= 0) {
              item[targetField] = n;
              rowUpdated = true;
            }
          }
        } else if (trimmed !== '' || cols.length > 1 || lines.length > 1) {
          item[targetField] = trimmed;
          rowUpdated = true;
        }
      });

      if (rowUpdated) {
        copy[targetIdx] = item;
        count++;
      }
    });

    setAttRows(copy);
    if (count > 0) {
      onToast(`${count} baris data berhasil di-paste dari Excel.`);
    }
  };

  const handleSaveAttendance = async () => {
    if (!attRows) return;
    setAttSaving(true);
    try {
      const res = await api.saveAttendanceSyakhsiyah({
        semester,
        academicYear,
        rows: attRows.map((r) => ({
          studentId: r.studentId,
          noteId: r.noteId,
          sick: r.sick === '' ? 0 : r.sick,
          permission: r.permission === '' ? 0 : r.permission,
          absent: r.absent === '' ? 0 : r.absent,
          suluk: r.suluk,
          nadhafah: r.nadhafah,
          muwazhabah: r.muwazhabah,
          note: r.note,
        })),
      });
      onToast(`${res.saved} data ketidakhadiran & syakhsiyah berhasil disimpan.`);
      await loadAttendanceGrid();
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'Gagal menyimpan ketidakhadiran & syakhsiyah',
        'err'
      );
    } finally {
      setAttSaving(false);
    }
  };

  const normalizeTahfidzChoice = (raw: string): string => {
    const val = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!val || val === '-') return '';
    if (val === 'yanbua' || val === "yanbu'a") return 'Yanbua';
    if (val === 'binnadzor' || val === 'bin nadzor' || val === 'bin-nadzor') return 'Binnadzor';
    if (val === 'bil ghoib' || val === 'bilghoib' || val === 'bil-ghoib' || val === 'bil ghaib') {
      return 'Bil Ghoib';
    }
    return '';
  };

  const updateTahfidzCell = (
    idx: number,
    field: 'tahfidzType' | 'tahfidzScore',
    rawVal: string
  ) => {
    setTahfidzRows((prev) => {
      if (!prev) return prev;
      const copy = [...prev];
      const item = { ...copy[idx] };
      if (field === 'tahfidzType') {
        item.tahfidzType = rawVal;
        item.tahfidzScoreArab =
          item.tahfidzScore !== '' ? formatTahfidzKitabah(rawVal, item.tahfidzScore) : '';
      } else {
        const cleaned = rawVal.trim() === '' ? '' : Number(rawVal);
        item.tahfidzScore = cleaned as number | '';
        item.tahfidzScoreArab =
          cleaned !== '' && Number.isFinite(cleaned as number)
            ? formatTahfidzKitabah(item.tahfidzType, cleaned)
            : '';
      }
      copy[idx] = item;
      return copy;
    });
  };

  const handleTahfidzPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    startIdx: number
  ) => {
    const text = e.clipboardData.getData('text');
    if (!text || (!text.includes('\n') && !text.includes('\t'))) return;
    e.preventDefault();
    if (!tahfidzRows) return;

    const lines = text.replace(/\r?\n$/, '').split(/\r\n|\n|\r/);
    if (!lines.some((l) => l.trim() !== '')) return;

    const copy = [...tahfidzRows];
    let count = 0;

    lines.forEach((line, offset) => {
      const targetIdx = startIdx + offset;
      if (!copy[targetIdx]) return;
      const cols = line.split('\t');
      const item = { ...copy[targetIdx] };

      if (cols.length >= 2) {
        const choice = normalizeTahfidzChoice(sanitizeImportedText(cols[0]));
        if (choice) item.tahfidzType = choice;
        const scoreRaw = toAsciiDigits(sanitizeImportedText(cols[1]));
        if (scoreRaw !== '') {
          const v = Number(scoreRaw.replace(',', '.'));
          if (Number.isFinite(v)) {
            const clamped = Math.round((Math.max(0, Math.min(100, v)) + Number.EPSILON) * 10) / 10;
            item.tahfidzScore = clamped;
          }
        }
        item.tahfidzScoreArab =
          item.tahfidzScore !== '' ? formatTahfidzKitabah(item.tahfidzType, item.tahfidzScore) : '';
        count++;
      } else {
        const cleanCol0 = toAsciiDigits(sanitizeImportedText(cols[0]));
        if (cleanCol0 !== '') {
          const v = Number(cleanCol0.replace(',', '.'));
          if (Number.isFinite(v)) {
            const clamped = Math.round((Math.max(0, Math.min(100, v)) + Number.EPSILON) * 10) / 10;
            item.tahfidzScore = clamped;
            item.tahfidzScoreArab = formatTahfidzKitabah(item.tahfidzType, clamped);
            count++;
          }
        }
      }

      copy[targetIdx] = item;
    });

    setTahfidzRows(copy);
    if (count > 0) {
      onToast(`${count} baris data tahfidz berhasil di-paste dari Excel.`);
    }
  };

  const handleSaveTahfidz = async () => {
    if (!tahfidzRows) return;
    setTahfidzSaving(true);
    try {
      const res = await api.saveTahfidz({
        semester,
        academicYear,
        rows: tahfidzRows.map((r) => ({
          studentId: r.studentId,
          noteId: r.noteId,
          tahfidzType: r.tahfidzType,
          tahfidzScore: r.tahfidzScore,
        })),
      });
      onToast(`${res.saved} nilai tahfidz berhasil disimpan.`);
      await loadTahfidzGrid();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menyimpan nilai tahfidz', 'err');
    } finally {
      setTahfidzSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-5 shadow-[0_6px_20px_rgba(6,78,59,0.06)]">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#042f24]">
            {activeTab === 'scores'
              ? 'Penilaian PTS & PAS'
              : activeTab === 'tahfidz'
                ? 'Penilaian Tahfidz'
                : 'Ketidakhadiran & Penilaian Syakhsiyah'}
          </h2>
          <p className="mt-1 text-sm text-slate-800">
            {activeTab === 'scores'
              ? `Input nilai PTS (${ptsWeight}%) dan PAS (${pasWeight}%). Jika PTS kosong, PAS otomatis 100%. Mendukung Paste 1 atau 2 kolom langsung dari Excel.`
              : activeTab === 'tahfidz'
                ? 'Input program Tahfidz (Yanbua, Binnadzor, Bil Ghoib) beserta nilai angka siswa. Ditampilkan di rapor tepat di atas tabel nilai mata pelajaran.'
                : 'Input ketidakhadiran (Sakit, Izin, Alpa), penilaian Syakhsiyah (السلوك، النظافة، المواظبة), dan Catatan Guru. Semua kolom mendukung Paste langsung dari Excel.'}
          </p>
        </div>

        <div className="inline-flex flex-wrap rounded-lg border border-[#e2d6bc] bg-[#f5efe0] p-1 self-start sm:self-auto shrink-0 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('scores')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'scores'
                ? 'bg-[#064e3b] text-[#f3d16c] shadow-xs'
                : 'text-slate-900 hover:text-emerald-950'
            }`}
          >
            Nilai PTS &amp; PAS
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tahfidz')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'tahfidz'
                ? 'bg-[#064e3b] text-[#f3d16c] shadow-xs'
                : 'text-slate-900 hover:text-emerald-950'
            }`}
          >
            Tahfidz
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('attendance')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'attendance'
                ? 'bg-[#064e3b] text-[#f3d16c] shadow-xs'
                : 'text-slate-900 hover:text-emerald-950'
            }`}
          >
            Ketidakhadiran &amp; Syakhsiyah
          </button>
        </div>
      </div>

      {/* Filter Cream-White Card */}
      <div className="rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-4 shadow-[0_4px_16px_rgba(6,78,59,0.05)]">
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 ${
            activeTab === 'scores' ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
          } gap-3 items-end`}
        >
          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-1">Kelas</label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="w-full rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-sm text-slate-950 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none"
            >
              <option value="">Pilih Kelas</option>
              {yearClasses.map((c) => (
                <option key={c.CLASS_ID} value={c.CLASS_ID}>
                  {c.CLASS_NAME}
                </option>
              ))}
            </select>
          </div>

          {activeTab === 'scores' && (
            <div>
              <label className="block text-xs font-semibold text-slate-900 mb-1">
                Mata Pelajaran
              </label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-sm text-slate-950 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none"
              >
                <option value="">Pilih Mapel</option>
                {filteredSubjects.map((s) => (
                  <option key={s.SUBJECT_ID} value={s.SUBJECT_ID}>
                    {s.SUBJECT_NAME}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-1">Semester</label>
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="w-full rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-sm text-slate-950 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none"
            >
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-1">
              Tahun Pelajaran
            </label>
            <select
              value={academicYear}
              onChange={(e) => {
                setAcademicYear(e.target.value);
                setRows(null);
                setAttRows(null);
                setTahfidzRows(null);
              }}
              className="w-full rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-sm font-mono-tabular text-slate-950 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none"
            >
              {academicYears.map((y) => (
                <option key={y.YEAR_ID} value={y.YEAR_NAME}>
                  {y.YEAR_NAME}
                </option>
              ))}
              {academicYear && !academicYears.some((y) => y.YEAR_NAME === academicYear) && (
                <option value={academicYear}>{academicYear}</option>
              )}
            </select>
          </div>
          <button
            type="button"
            onClick={
              activeTab === 'scores'
                ? loadGrid
                : activeTab === 'tahfidz'
                  ? loadTahfidzGrid
                  : loadAttendanceGrid
            }
            disabled={
              activeTab === 'scores'
                ? loading
                : activeTab === 'tahfidz'
                  ? tahfidzLoading
                  : attLoading
            }
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white ring-1 ring-[#d4af37]/30 hover:bg-[#043b2c] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Search className="h-4 w-4 text-[#f3d16c]" />
            {(activeTab === 'scores'
              ? loading
              : activeTab === 'tahfidz'
                ? tahfidzLoading
                : attLoading)
              ? 'Memuat...'
              : 'Tampilkan'}
          </button>
        </div>
      </div>

      {/* TAB 1: SCORES GRID */}
      {activeTab === 'scores' && rows !== null && (
        <div className="overflow-hidden rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 shadow-[0_6px_22px_rgba(6,78,59,0.06)]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#e6dcc6] px-5 py-3.5">
            <div className="text-xs font-medium text-slate-800">
              Tip: Blok kolom PTS atau PTS+PAS di Excel, klik sel target, lalu tekan{' '}
              <kbd className="rounded border border-[#d9ceb5] bg-white px-1.5 py-0.5 font-mono-tabular text-[11px] text-slate-950">
                Ctrl+V
              </kbd>
              . Gunakan Enter / Panah Atas-Bawah untuk pindah baris.
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#c89b2b] to-[#dfb547] px-4 py-2 text-xs font-bold text-[#042f24] shadow-xs hover:brightness-95 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Menyimpan...' : 'Simpan Semua Nilai'}
              </button>
            )}
          </div>

          <div className="overflow-x-auto max-h-[65vh]">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[#064e3b] text-xs font-semibold text-amber-50 border-b border-[#d4af37]/40">
                <tr>
                  <th className="px-4 py-3 w-12">No.</th>
                  <th className="px-4 py-3">Nama Murid</th>
                  <th className="px-4 py-3 text-center w-32">PTS ({ptsWeight}%)</th>
                  <th className="px-4 py-3 text-center w-32">PAS ({pasWeight}%)</th>
                  <th className="px-4 py-3 text-center w-28">Nilai Akhir</th>
                  <th className="px-4 py-3 text-right">Terbilang Arab (الكتابة)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee5d3]">
                {rows.length ? (
                  rows.map((r, idx) => (
                    <tr key={r.studentId} className="hover:bg-amber-50/45">
                      <td className="px-4 py-2 font-mono-tabular font-semibold text-slate-800">{r.no}</td>
                      <td className="px-4 py-2">
                        <div className="font-semibold text-slate-950 font-arabic text-base">
                          {r.name}
                        </div>
                        <div className="text-[11px] font-mono-tabular font-medium text-slate-800">
                          {r.nis || '-'} / {r.nisn || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          disabled={!canEdit}
                          data-row={idx}
                          data-field="pts"
                          value={r.pts}
                          onChange={(e) => updateCell(idx, 'pts', e.target.value)}
                          onBlur={(e) => {
                            if (e.target.value.trim() !== '') {
                              const rounded =
                                Math.round(
                                  (Math.max(0, Math.min(100, Number(e.target.value))) +
                                    Number.EPSILON) *
                                    10
                                ) / 10;
                              if (Number.isFinite(rounded)) updateCell(idx, 'pts', String(rounded));
                            }
                          }}
                          onPaste={(e) => handlePaste(e, idx, 'pts')}
                          onKeyDown={(e) => handleKeyDown(e, idx, 'pts')}
                          className="w-24 rounded-md border border-[#d9ceb5] bg-white px-2 py-1.5 text-center text-sm font-mono-tabular font-semibold text-slate-950 focus:border-emerald-700 focus:bg-emerald-50/30 focus:outline-none disabled:bg-slate-100"
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          disabled={!canEdit}
                          data-row={idx}
                          data-field="pas"
                          value={r.pas}
                          onChange={(e) => updateCell(idx, 'pas', e.target.value)}
                          onBlur={(e) => {
                            if (e.target.value.trim() !== '') {
                              const rounded =
                                Math.round(
                                  (Math.max(0, Math.min(100, Number(e.target.value))) +
                                    Number.EPSILON) *
                                    10
                                ) / 10;
                              if (Number.isFinite(rounded)) updateCell(idx, 'pas', String(rounded));
                            }
                          }}
                          onPaste={(e) => handlePaste(e, idx, 'pas')}
                          onKeyDown={(e) => handleKeyDown(e, idx, 'pas')}
                          className="w-24 rounded-md border border-[#d9ceb5] bg-white px-2 py-1.5 text-center text-sm font-mono-tabular font-semibold text-slate-950 focus:border-emerald-700 focus:bg-emerald-50/30 focus:outline-none disabled:bg-slate-100"
                        />
                      </td>
                      <td className="px-4 py-2 text-center font-mono-tabular font-bold text-[#042f24]">
                        {r.finalScore !== '' ? r.finalScore : '-'}
                      </td>
                      <td className="px-4 py-2 text-right font-arabic text-base font-medium text-slate-950">
                        {r.finalScoreArab || '-'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm font-medium text-slate-800">
                      Tidak ada siswa aktif di kelas ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: KETIDAKHADIRAN & SYAKHSIYAH */}
      {activeTab === 'attendance' && attRows !== null && (
        <div className="overflow-hidden rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 shadow-[0_6px_22px_rgba(6,78,59,0.06)]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#e6dcc6] px-5 py-3.5">
            <div className="text-xs font-medium text-slate-800">
              Tip: Blok satu atau beberapa kolom di Excel (Ketidakhadiran, Syakhsiyah السلوك/النظافة/المواظبة, atau Catatan Guru), klik sel target, lalu tekan{' '}
              <kbd className="rounded border border-[#d9ceb5] bg-white px-1.5 py-0.5 font-mono-tabular text-[11px] text-slate-950">
                Ctrl+V
              </kbd>
              .
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {canEdit && attRows.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setAttRows((prev) =>
                      prev
                        ? prev.map((r) => ({
                            ...r,
                            suluk: r.suluk || defaultSyakhsiyah,
                            nadhafah: r.nadhafah || defaultSyakhsiyah,
                            muwazhabah: r.muwazhabah || defaultSyakhsiyah,
                          }))
                        : prev
                    )
                  }
                  className="rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-amber-50/50 whitespace-nowrap"
                >
                  Lengkapi Kosong dg {defaultSyakhsiyah}
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={handleSaveAttendance}
                  disabled={attSaving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#c89b2b] to-[#dfb547] px-4 py-2 text-xs font-bold text-[#042f24] shadow-xs hover:brightness-95 disabled:opacity-50 whitespace-nowrap"
                >
                  <Save className="h-3.5 w-3.5" />
                  {attSaving ? 'Menyimpan...' : 'Simpan Ketidakhadiran & Syakhsiyah'}
                </button>
              )}
            </div>
          </div>

          <datalist id="syakhsiyah-presets">
            {syakhsiyahCategories.map((opt) => (
              <option key={opt.name} value={opt.name}>
                {opt.label ? `${opt.name} (${opt.label})` : opt.name}
              </option>
            ))}
          </datalist>

          <div className="overflow-x-auto max-h-[65vh]">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[#064e3b] text-xs font-semibold text-amber-50 border-b border-[#d4af37]/40">
                <tr>
                  <th className="px-3 py-3 w-10">No.</th>
                  <th className="px-3 py-3 min-w-[170px]">Nama Murid</th>
                  <th className="px-2 py-3 text-center w-20 bg-[#053f30]">Sakit (مرض)</th>
                  <th className="px-2 py-3 text-center w-20 bg-[#053f30]">Izin (إذن)</th>
                  <th className="px-2 py-3 text-center w-20 bg-[#053f30]">Alpa (غائب)</th>
                  <th className="px-2 py-3 text-center w-32 bg-[#043427]">السلوك</th>
                  <th className="px-2 py-3 text-center w-32 bg-[#043427]">النظافة</th>
                  <th className="px-2 py-3 text-center w-32 bg-[#043427]">المواظبة</th>
                  <th className="px-3 py-3 min-w-[180px] text-right">ملاحظات المعلم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee5d3]">
                {attRows.length ? (
                  attRows.map((r, idx) => (
                    <tr key={r.studentId} className="hover:bg-amber-50/45">
                      <td className="px-3 py-2 font-mono-tabular font-semibold text-slate-800">{r.no}</td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-950 font-arabic text-base">
                          {r.name}
                        </div>
                        <div className="text-[11px] font-mono-tabular font-medium text-slate-800">
                          {r.nis || '-'}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="number"
                          min={0}
                          disabled={!canEdit}
                          data-row={idx}
                          data-field="sick"
                          value={r.sick}
                          onChange={(e) => updateAttCell(idx, 'sick', e.target.value)}
                          onPaste={(e) => handleAttPaste(e, idx, 'sick')}
                          onKeyDown={(e) => handleKeyDown(e, idx, 'sick')}
                          className="w-16 rounded-md border border-[#d9ceb5] bg-white px-1.5 py-1.5 text-center text-sm font-mono-tabular font-semibold focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="number"
                          min={0}
                          disabled={!canEdit}
                          data-row={idx}
                          data-field="permission"
                          value={r.permission}
                          onChange={(e) => updateAttCell(idx, 'permission', e.target.value)}
                          onPaste={(e) => handleAttPaste(e, idx, 'permission')}
                          onKeyDown={(e) => handleKeyDown(e, idx, 'permission')}
                          className="w-16 rounded-md border border-[#d9ceb5] bg-white px-1.5 py-1.5 text-center text-sm font-mono-tabular font-semibold focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="number"
                          min={0}
                          disabled={!canEdit}
                          data-row={idx}
                          data-field="absent"
                          value={r.absent}
                          onChange={(e) => updateAttCell(idx, 'absent', e.target.value)}
                          onPaste={(e) => handleAttPaste(e, idx, 'absent')}
                          onKeyDown={(e) => handleKeyDown(e, idx, 'absent')}
                          className="w-16 rounded-md border border-[#d9ceb5] bg-white px-1.5 py-1.5 text-center text-sm font-mono-tabular font-semibold focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          dir="rtl"
                          list="syakhsiyah-presets"
                          disabled={!canEdit}
                          data-row={idx}
                          data-field="suluk"
                          value={r.suluk}
                          onChange={(e) => updateAttCell(idx, 'suluk', e.target.value)}
                          onPaste={(e) => handleAttPaste(e, idx, 'suluk')}
                          onKeyDown={(e) => handleKeyDown(e, idx, 'suluk')}
                          placeholder={defaultSyakhsiyah}
                          className="w-28 rounded-md border border-[#d9ceb5] bg-white px-2 py-1.5 text-center text-base font-arabic focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          dir="rtl"
                          list="syakhsiyah-presets"
                          disabled={!canEdit}
                          data-row={idx}
                          data-field="nadhafah"
                          value={r.nadhafah}
                          onChange={(e) => updateAttCell(idx, 'nadhafah', e.target.value)}
                          onPaste={(e) => handleAttPaste(e, idx, 'nadhafah')}
                          onKeyDown={(e) => handleKeyDown(e, idx, 'nadhafah')}
                          placeholder={defaultSyakhsiyah}
                          className="w-28 rounded-md border border-[#d9ceb5] bg-white px-2 py-1.5 text-center text-base font-arabic focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          dir="rtl"
                          list="syakhsiyah-presets"
                          disabled={!canEdit}
                          data-row={idx}
                          data-field="muwazhabah"
                          value={r.muwazhabah}
                          onChange={(e) => updateAttCell(idx, 'muwazhabah', e.target.value)}
                          onPaste={(e) => handleAttPaste(e, idx, 'muwazhabah')}
                          onKeyDown={(e) => handleKeyDown(e, idx, 'muwazhabah')}
                          placeholder={defaultSyakhsiyah}
                          className="w-28 rounded-md border border-[#d9ceb5] bg-white px-2 py-1.5 text-center text-base font-arabic focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          dir="rtl"
                          disabled={!canEdit}
                          data-row={idx}
                          data-field="note"
                          value={r.note}
                          onChange={(e) => updateAttCell(idx, 'note', e.target.value)}
                          onPaste={(e) => handleAttPaste(e, idx, 'note')}
                          onKeyDown={(e) => handleKeyDown(e, idx, 'note')}
                          placeholder="ملاحظات..."
                          className="w-full min-w-[160px] rounded-md border border-[#d9ceb5] bg-white px-2.5 py-1.5 text-sm font-arabic focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
                        />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-sm text-slate-500">
                      Tidak ada siswa aktif di kelas ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: TAHFIDZ */}
      {activeTab === 'tahfidz' && tahfidzRows !== null && (
        <div className="overflow-hidden rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 shadow-[0_6px_22px_rgba(6,78,59,0.06)]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#e6dcc6] px-5 py-3.5">
            <div className="text-xs font-medium text-slate-800">
              Tip: Pilih kategori Tahfidz (<span className="font-semibold text-slate-950">Yanbua</span>,{' '}
              <span className="font-semibold text-slate-950">Binnadzor</span>, atau{' '}
              <span className="font-semibold text-slate-950">Bil Ghoib</span>) lalu isi nilai angka. Bisa paste
              kolom nilai angka langsung dari Excel via{' '}
              <kbd className="rounded border border-[#d9ceb5] bg-white px-1.5 py-0.5 font-mono-tabular text-[11px] text-slate-950">
                Ctrl+V
              </kbd>
              .
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {canEdit && tahfidzRows.length > 0 && (
                <div className="inline-flex items-center gap-1.5">
                  <select
                    value={bulkTahfidzType}
                    onChange={(e) =>
                      setBulkTahfidzType(e.target.value as (typeof TAHFIDZ_OPTIONS)[number])
                    }
                    className="rounded-lg border border-[#d9ceb5] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:border-emerald-700 focus:outline-none"
                  >
                    {TAHFIDZ_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      setTahfidzRows((prev) =>
                        prev
                          ? prev.map((r) => {
                              const nextType = r.tahfidzType || bulkTahfidzType;
                              return {
                                ...r,
                                tahfidzType: nextType,
                                tahfidzScoreArab:
                                  r.tahfidzScore !== ''
                                    ? formatTahfidzKitabah(nextType, r.tahfidzScore)
                                    : '',
                              };
                            })
                          : prev
                      )
                    }
                    className="rounded-lg border border-[#d9ceb5] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-amber-50/50 whitespace-nowrap"
                  >
                    Isi Pilihan Kosong
                  </button>
                </div>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={handleSaveTahfidz}
                  disabled={tahfidzSaving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#c89b2b] to-[#dfb547] px-4 py-2 text-xs font-bold text-[#042f24] shadow-xs hover:brightness-95 disabled:opacity-50 whitespace-nowrap"
                >
                  <Save className="h-3.5 w-3.5" />
                  {tahfidzSaving ? 'Menyimpan...' : 'Simpan Nilai Tahfidz'}
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto max-h-[65vh]">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[#064e3b] text-xs font-semibold text-amber-50 border-b border-[#d4af37]/40">
                <tr>
                  <th className="px-4 py-3 w-12">No.</th>
                  <th className="px-4 py-3">Nama Murid</th>
                  <th className="px-4 py-3 w-48">Pilihan Tahfidz</th>
                  <th className="px-4 py-3 text-center w-36">Nilai (Angka)</th>
                  <th className="px-4 py-3 text-right">Terbilang Arab (الكتابة)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee5d3]">
                {tahfidzRows.length ? (
                  tahfidzRows.map((r, idx) => (
                    <tr key={r.studentId} className="hover:bg-amber-50/45">
                      <td className="px-4 py-2 font-mono-tabular font-semibold text-slate-800">{r.no}</td>
                      <td className="px-4 py-2">
                        <div className="font-semibold text-slate-950 font-arabic text-base">
                          {r.name}
                        </div>
                        <div className="text-[11px] font-mono-tabular font-medium text-slate-800">
                          {r.nis || '-'} / {r.nisn || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <select
                          disabled={!canEdit}
                          value={r.tahfidzType}
                          onChange={(e) => updateTahfidzCell(idx, 'tahfidzType', e.target.value)}
                          className="w-full rounded-md border border-[#d9ceb5] bg-white px-2.5 py-1.5 text-sm font-medium text-slate-950 focus:border-emerald-700 focus:bg-emerald-50/30 focus:outline-none disabled:bg-slate-100"
                        >
                          <option value="">-- Pilih --</option>
                          {TAHFIDZ_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          disabled={!canEdit}
                          data-row={idx}
                          data-field="tahfidzScore"
                          value={r.tahfidzScore}
                          onChange={(e) => updateTahfidzCell(idx, 'tahfidzScore', e.target.value)}
                          onBlur={(e) => {
                            if (e.target.value.trim() !== '') {
                              const rounded =
                                Math.round(
                                  (Math.max(0, Math.min(100, Number(e.target.value))) +
                                    Number.EPSILON) *
                                    10
                                ) / 10;
                              if (Number.isFinite(rounded)) {
                                updateTahfidzCell(idx, 'tahfidzScore', String(rounded));
                              }
                            }
                          }}
                          onPaste={(e) => handleTahfidzPaste(e, idx)}
                          onKeyDown={(e) => handleKeyDown(e, idx, 'tahfidzScore')}
                          className="w-24 rounded-md border border-[#d9ceb5] bg-white px-2 py-1.5 text-center text-sm font-mono-tabular font-semibold text-slate-950 focus:border-emerald-700 focus:bg-emerald-50/30 focus:outline-none disabled:bg-slate-100"
                        />
                      </td>
                      <td className="px-4 py-2 text-right font-arabic text-base font-medium text-slate-950">
                        {r.tahfidzScoreArab || '-'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-sm font-medium text-slate-800">
                      Tidak ada siswa aktif di kelas ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
