import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Printer, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../api/client.ts';
import type {
  AcademicYearRecord,
  AppSettings,
  ClassRecord,
  ReportPreviewData,
  ReportStudentRow,
} from '../types/erapor.ts';
import { isFemaleGender, toArabicDigits } from '../utils/arabic.ts';
import { ConfirmDialog, Modal } from './Modal.tsx';

interface ReportsViewProps {
  semester: number;
  classes: ClassRecord[];
  academicYears: AcademicYearRecord[];
  selectedYear: string;
  settings: AppSettings;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

export function ReportsView({
  semester,
  classes,
  academicYears,
  selectedYear,
  settings,
  onToast,
}: ReportsViewProps) {
  const [classId, setClassId] = useState('');
  const [academicYear, setAcademicYear] = useState(
    selectedYear || settings.ACADEMIC_YEAR || '2026/2027'
  );
  const yearClasses = useMemo(
    () => classes.filter((c) => !academicYear || String(c.ACADEMIC_YEAR).trim() === academicYear),
    [classes, academicYear]
  );
  const [rows, setRows] = useState<ReportStudentRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resetTargets, setResetTargets] = useState<string[] | null>(null);
  const [preview, setPreview] = useState<ReportPreviewData | null>(null);
  const [batchPreviews, setBatchPreviews] = useState<ReportPreviewData[] | null>(null);

  useEffect(() => {
    if (selectedYear) setAcademicYear(selectedYear);
  }, [selectedYear]);

  useEffect(() => {
    if (classId && !yearClasses.some((c) => c.CLASS_ID === classId)) {
      setClassId('');
    }
  }, [yearClasses, classId]);

  const loadRows = async () => {
    setLoading(true);
    try {
      const data = await api.getReportStudents(classId, String(semester), academicYear);
      setRows(data);
      setSelectedIds(new Set());
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal memuat daftar rapor', 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, [semester, classId, academicYear]);

  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.studentId));

  const toggleAll = () => {
    if (allChecked) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.studentId)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerateSelected = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) {
      onToast('Pilih minimal satu siswa terlebih dahulu.', 'err');
      return;
    }
    setBusy(true);
    try {
      const res = await api.generateReports(ids, String(semester), academicYear);
      await loadRows();
      const loaded = await Promise.all(
        ids.map((id) => api.getReportPreview(id, String(semester), academicYear))
      );
      if (loaded.length === 1) {
        setPreview(loaded[0]);
      } else if (loaded.length > 1) {
        setBatchPreviews(loaded);
      }
      onToast(`${res.count} rapor berhasil digenerate dan siap dicetak ke PDF.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menyiapkan rapor', 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleBatchPrintSelected = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) {
      onToast('Pilih minimal satu siswa terlebih dahulu.', 'err');
      return;
    }
    setBusy(true);
    try {
      const loaded = await Promise.all(
        ids.map((id) => api.getReportPreview(id, String(semester), academicYear))
      );
      if (loaded.length === 1) {
        setPreview(loaded[0]);
      } else if (loaded.length > 1) {
        setBatchPreviews(loaded);
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal memuat rapor terpilih', 'err');
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = async () => {
    if (!resetTargets?.length) return;
    setBusy(true);
    try {
      const res = await api.resetReports(resetTargets, String(semester), academicYear);
      onToast(`${res.removed} status/file rapor berhasil direset.`);
      setResetTargets(null);
      await loadRows();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal mereset rapor', 'err');
    } finally {
      setBusy(false);
    }
  };

  const openPreview = async (studentId: string) => {
    setBusy(true);
    try {
      const data = await api.getReportPreview(studentId, String(semester), academicYear);
      setPreview(data);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal memuat pratinjau rapor', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="no-print space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-5 shadow-[0_6px_20px_rgba(6,78,59,0.06)]">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[#042f24]">
              Rapor Semester {semester}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Generate status rapor, pratinjau layout A4 1 lembar bahasa Arab dengan Terbilang, dan
              cetak langsung ke PDF.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || selectedIds.size === 0}
              onClick={handleGenerateSelected}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#c89b2b] to-[#dfb547] px-3.5 py-2 text-xs font-bold text-[#042f24] shadow-xs hover:brightness-95 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
              Generate Rapor ({selectedIds.size})
            </button>
            <button
              type="button"
              disabled={busy || selectedIds.size === 0}
              onClick={handleBatchPrintSelected}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#064e3b] px-3.5 py-2 text-xs font-semibold text-white ring-1 ring-[#d4af37]/35 hover:bg-[#043b2c] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Printer className="h-3.5 w-3.5 text-[#f3d16c]" />
              Cetak PDF Terpilih ({selectedIds.size})
            </button>
            <button
              type="button"
              disabled={busy || selectedIds.size === 0}
              onClick={() => setResetTargets(Array.from(selectedIds))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Terpilih
            </button>
          </div>
        </div>

      <div className="no-print rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-4 shadow-[0_4px_16px_rgba(6,78,59,0.05)]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas</label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="w-full rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-sm focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none"
            >
              <option value="">Semua Kelas</option>
              {yearClasses.map((c) => (
                <option key={c.CLASS_ID} value={c.CLASS_ID}>
                  {c.CLASS_NAME}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tahun Pelajaran
            </label>
            <select
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-sm font-mono-tabular focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none"
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
        </div>
      </div>

      <div className="no-print overflow-hidden rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 shadow-[0_6px_22px_rgba(6,78,59,0.06)]">
        <div className="overflow-x-auto max-h-[68vh]">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[#064e3b] text-xs font-semibold text-amber-50 border-b border-[#d4af37]/40">
              <tr>
                <th className="px-4 py-3 text-center w-12">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-amber-200/70"
                  />
                </th>
                <th className="px-4 py-3 w-12">No.</th>
                <th className="px-4 py-3">Nama Murid</th>
                <th className="px-4 py-3">Kelas</th>
                <th className="px-4 py-3">NIS / NISN</th>
                <th className="px-4 py-3 text-center">Pratinjau &amp; PDF</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee5d3]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    Memuat data siswa...
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((r) => (
                  <tr
                    key={r.studentId}
                    className={
                      r.status === 'READY'
                        ? 'bg-emerald-50/55 hover:bg-emerald-50/85'
                        : 'hover:bg-amber-50/45'
                    }
                  >
                    <td className="px-4 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.studentId)}
                        onChange={() => toggleOne(r.studentId)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-700"
                      />
                    </td>
                    <td className="px-4 py-2.5 font-mono-tabular text-slate-500">{r.no}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-slate-900 font-arabic text-base">
                        {r.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        Nilai terisi: <span className="font-mono-tabular">{r.scoreCount}</span> mapel
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-700">{r.className}</td>
                    <td className="px-4 py-2.5 font-mono-tabular text-xs text-slate-600">
                      {r.nis || '-'} / {r.nisn || '-'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openPreview(r.studentId)}
                          className="inline-flex items-center gap-1 rounded-md border border-[#d9ceb5] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#064e3b] hover:bg-amber-50/60 whitespace-nowrap"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Lihat / Cetak PDF
                        </button>
                        {r.status === 'READY' && (
                          <button
                            type="button"
                            onClick={() => setResetTargets([r.studentId])}
                            className="rounded-md border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
                            title="Reset Rapor"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-semibold">
                      <span
                        className={
                          r.status === 'READY'
                            ? 'text-emerald-800'
                            : r.status === 'DRAFT'
                              ? 'text-amber-700'
                              : 'text-red-600'
                        }
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    Tidak ada siswa aktif.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {resetTargets && (
        <ConfirmDialog
          title="Reset Rapor"
          message={`Apakah Anda yakin ingin mereset status rapor untuk ${resetTargets.length} siswa terpilih?`}
          confirmLabel="Ya, Reset"
          busy={busy}
          onCancel={() => setResetTargets(null)}
          onConfirm={confirmReset}
        />
      )}

      {preview && (
        <ArabicReportPreviewModal preview={preview} onClose={() => setPreview(null)} />
      )}

      {batchPreviews && batchPreviews.length > 0 && (
        <BatchArabicReportModal
          previews={batchPreviews}
          onClose={() => setBatchPreviews(null)}
        />
      )}
      </div>

      {preview && (
        <div className="hidden print:block">
          <ArabicReportSheet preview={preview} />
        </div>
      )}

      {batchPreviews && batchPreviews.length > 0 && !preview && (
        <div className="hidden print:block">
          {batchPreviews.map((p, idx) => (
            <div
              key={p.student.STUDENT_ID}
              className={idx < batchPreviews.length - 1 ? 'print:break-after-page' : ''}
            >
              <ArabicReportSheet preview={p} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ArabicReportSheet({ preview }: { preview: ReportPreviewData }) {
  const half = Math.ceil(preview.subjects.length / 2);
  const splitRows = Array.from({ length: Math.max(1, half) }, (_, i) => ({
    right: preview.subjects[i] || { no: '', name: '', score: '', terbilang: '' },
    left: preview.subjects[i + half] || { no: '', name: '', score: '', terbilang: '' },
  }));

  const reportDateArabic = toArabicDigits(preview.settings.REPORT_DATE || '');
  const city = preview.settings.CITY || '............';
  const isFemale = isFemaleGender(preview.student.GENDER);

  const validExtras = (preview.extras || []).filter(
    (ex) =>
      String(ex.ACTIVITY || '').trim() !== '' ||
      String(ex.PREDICATE || '').trim() !== '' ||
      String(ex.DESCRIPTION || '').trim() !== ''
  );

  const displayCategory =
    isFemale && preview.summary.category === 'راسب' ? 'راسبة' : preview.summary.category;

  return (
    <div
      dir="rtl"
      className="print-only-sheet mx-auto w-full max-w-[794px] bg-white p-6 text-black font-arabic border border-slate-300"
    >
      <div className="text-center border-b-2 border-black pb-2.5 mb-3">
        <div className="text-xl font-bold text-black">
          {preview.settings.SCHOOL_NAME || 'المدرسة الإسلامية'}
        </div>
        <div className="text-base font-bold mt-0.5 text-black">
          {isFemale ? 'كشف درجات الطالبة' : 'كشف درجات الطالب'}
        </div>
        <div className="text-xs text-black mt-0.5">
          الفصل الدراسي {preview.semester === '1' ? 'الأول' : 'الثاني'} · العام الدراسي{' '}
          {toArabicDigits(preview.academicYear)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mb-3 text-black">
        <div className="flex justify-between border-b border-dotted border-slate-400 pb-0.5">
          <span className="font-bold">{isFemale ? 'اسم الطالبة :' : 'اسم الطالب :'}</span>
          <span>{preview.student.NAME}</span>
        </div>
        <div className="flex justify-between border-b border-dotted border-slate-400 pb-0.5">
          <span className="font-bold">الفصل :</span>
          <span>{toArabicDigits(preview.clazz.CLASS_NAME || '-')}</span>
        </div>
        <div className="flex justify-between border-b border-dotted border-slate-400 pb-0.5">
          <span className="font-bold">اسم الأب :</span>
          <span>{preview.student.FATHER_NAME || '-'}</span>
        </div>
        <div className="flex justify-between border-b border-dotted border-slate-400 pb-0.5">
          <span className="font-bold">رقم القيد :</span>
          <span>{toArabicDigits(`${preview.student.NIS || '-'} / ${preview.student.NISN || '-'}`)}</span>
        </div>
      </div>

      <div className="text-xs font-bold mb-1 text-black">تحفيظ القرآن</div>
      <table className="w-full border-collapse border border-slate-500 text-[11px] mb-2.5 text-center text-black">
        <thead>
          <tr className="bg-slate-200 font-bold">
            <th className="border border-slate-500 px-2 py-1 w-1/3">البرنامج / القسم</th>
            <th className="border border-slate-500 px-2 py-1 w-1/6">الدرجة</th>
            <th className="border border-slate-500 px-2 py-1 w-1/2">الكتابة</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-slate-500 px-2 py-1 font-bold">
              {preview.tahfidz?.type === 'Yanbua'
                ? 'ينبوعا (Yanbua)'
                : preview.tahfidz?.type === 'Binnadzor'
                  ? 'بالنظر (Binnadzor)'
                  : preview.tahfidz?.type === 'Bil Ghoib'
                    ? 'بالغيب (Bil Ghoib)'
                    : preview.tahfidz?.type || '-'}
            </td>
            <td className="border border-slate-500 px-2 py-1 font-bold">
              {preview.tahfidz?.score || '-'}
            </td>
            <td className="border border-slate-500 px-2 py-1">
              {preview.tahfidz?.terbilang || '-'}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="text-xs font-bold mb-1 text-black">أ. درجات المواد الدراسية</div>
      <table className="w-full border-collapse border border-slate-500 text-[11px] mb-3 text-black">
        <thead>
          <tr className="bg-slate-200 font-bold text-center">
            <th className="border border-slate-500 px-1.5 py-1 w-8">الرقم</th>
            <th className="border border-slate-500 px-2 py-1">المادة</th>
            <th className="border border-slate-500 px-1.5 py-1 w-12">الدرجة</th>
            <th className="border border-slate-500 px-2 py-1">الكتابة</th>
            <th className="border border-slate-500 px-1.5 py-1 w-8">الرقم</th>
            <th className="border border-slate-500 px-2 py-1">المادة</th>
            <th className="border border-slate-500 px-1.5 py-1 w-12">الدرجة</th>
            <th className="border border-slate-500 px-2 py-1">الكتابة</th>
          </tr>
        </thead>
        <tbody>
          {splitRows.map((pair, idx) => (
            <tr key={idx}>
              <td className="border border-slate-500 px-1 py-1 text-center">{pair.right.no}</td>
              <td className="border border-slate-500 px-2 py-1 text-right">{pair.right.name}</td>
              <td className="border border-slate-500 px-1 py-1 text-center font-bold">
                {pair.right.score}
              </td>
              <td className="border border-slate-500 px-1.5 py-1 text-center">
                {pair.right.terbilang}
              </td>
              <td className="border border-slate-500 px-1 py-1 text-center">{pair.left.no}</td>
              <td className="border border-slate-500 px-2 py-1 text-right">{pair.left.name}</td>
              <td className="border border-slate-500 px-1 py-1 text-center font-bold">
                {pair.left.score}
              </td>
              <td className="border border-slate-500 px-1.5 py-1 text-center">
                {pair.left.terbilang}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="text-xs font-bold mb-1 text-black">ب. خلاصة النتائج</div>
      <table className="w-full border-collapse border border-slate-500 text-[11px] mb-3 text-center text-black">
        <thead>
          <tr className="bg-slate-200 font-bold">
            <th className="border border-slate-500 px-2 py-1">المجموع</th>
            <th className="border border-slate-500 px-2 py-1">المعدل</th>
            <th className="border border-slate-500 px-2 py-1">الترتيب</th>
            <th className="border border-slate-500 px-2 py-1">التقدير العام</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-slate-500 px-2 py-1 font-bold">{preview.summary.total}</td>
            <td className="border border-slate-500 px-2 py-1 font-bold">
              {preview.summary.average}
            </td>
            <td className="border border-slate-500 px-2 py-1 font-bold">{preview.summary.rank}</td>
            <td className="border border-slate-500 px-2 py-1 font-bold">{displayCategory}</td>
          </tr>
        </tbody>
      </table>

      {validExtras.length > 0 && (
        <>
          <div className="text-xs font-bold mb-1 text-black">ج. الأنشطة الإضافية</div>
          <table className="w-full border-collapse border border-slate-500 text-[11px] mb-3 text-center text-black">
            <thead>
              <tr className="bg-slate-200 font-bold">
                <th className="border border-slate-500 px-2 py-1 w-10">الرقم</th>
                <th className="border border-slate-500 px-2 py-1">النشاط</th>
                <th className="border border-slate-500 px-2 py-1">التقدير</th>
                <th className="border border-slate-500 px-2 py-1">الوصف</th>
              </tr>
            </thead>
            <tbody>
              {validExtras.map((ex, i) => (
                <tr key={ex.EX_ID}>
                  <td className="border border-slate-500 px-2 py-1">{toArabicDigits(i + 1)}</td>
                  <td className="border border-slate-500 px-2 py-1">{ex.ACTIVITY || '-'}</td>
                  <td className="border border-slate-500 px-2 py-1">{ex.PREDICATE || '-'}</td>
                  <td className="border border-slate-500 px-2 py-1 text-right">
                    {ex.DESCRIPTION || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="text-xs font-bold mb-1 text-black">
        {validExtras.length > 0 ? 'د' : 'ج'}. المواظبة والشخصية وملاحظات المعلم
      </div>
      <table className="w-full border-collapse border border-slate-500 text-[11px] mb-3 text-center text-black">
        <thead>
          <tr className="bg-slate-200 font-bold">
            <th className="border border-slate-500 px-1.5 py-1 w-14">مرض</th>
            <th className="border border-slate-500 px-1.5 py-1 w-14">إذن</th>
            <th className="border border-slate-500 px-1.5 py-1 w-14">
              {isFemale ? 'غائبة' : 'غائب'}
            </th>
            <th className="border border-slate-500 px-1.5 py-1 w-20">السلوك</th>
            <th className="border border-slate-500 px-1.5 py-1 w-20">النظافة</th>
            <th className="border border-slate-500 px-1.5 py-1 w-20">المواظبة</th>
            <th className="border border-slate-500 px-2 py-1">ملاحظات معلم الفصل</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-slate-500 px-1.5 py-1">
              {toArabicDigits(preview.note.SICK || 0)} أيام
            </td>
            <td className="border border-slate-500 px-1.5 py-1">
              {toArabicDigits(preview.note.PERMISSION || 0)} أيام
            </td>
            <td className="border border-slate-500 px-1.5 py-1">
              {toArabicDigits(preview.note.ABSENT || 0)} أيام
            </td>
            <td className="border border-slate-500 px-1.5 py-1">
              {preview.note.SYAKHSIYAH_SULUK || preview.note.ATTITUDE || '-'}
            </td>
            <td className="border border-slate-500 px-1.5 py-1">
              {preview.note.SYAKHSIYAH_NADHAFAH || '-'}
            </td>
            <td className="border border-slate-500 px-1.5 py-1">
              {preview.note.SYAKHSIYAH_MUWAZHABAH || '-'}
            </td>
            <td className="border border-slate-500 px-2 py-1 text-right">
              {preview.note.NOTE || '-'}
            </td>
          </tr>
        </tbody>
      </table>

      {preview.semester === '2' && preview.promotion && (
        <div className="mb-3 border border-slate-500 bg-slate-100 px-3 py-1.5 text-xs flex items-center justify-between text-black">
          <span className="font-bold">قرار النقل :</span>
          <span className="font-bold">
            {preview.promotion.arabic !== '-'
              ? `${preview.promotion.arabic} (${preview.promotion.status})`
              : '-'}
          </span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 text-center text-xs pt-2 text-black">
        <div>
          <div className="h-4" />
          <div>شيخ المعهد،</div>
          <div className="h-10" />
          <div className="font-bold">
            {preview.settings.SHEIKH_NAME || '....................................'}
          </div>
        </div>
        <div>
          <div className="h-4" />
          <div>مدير المعادلة،</div>
          <div className="h-10" />
          <div className="font-bold">
            {preview.settings.PRINCIPAL_NAME || '....................................'}
          </div>
        </div>
        <div>
          <div>
            {city}، {reportDateArabic}
          </div>
          <div>معلم الفصل،</div>
          <div className="h-10" />
          <div className="font-bold">
            {preview.clazz.HOMEROOM_TEACHER || '....................................'}
          </div>
        </div>
      </div>
    </div>
  );
}

function ArabicReportPreviewModal({
  preview,
  onClose,
}: {
  preview: ReportPreviewData;
  onClose: () => void;
}) {
  return (
    <Modal
      title={`Pratinjau Rapor A4 — ${preview.student.NAME}`}
      onClose={onClose}
      maxWidthClass="max-w-5xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#043b2c]"
          >
            <Printer className="h-4 w-4 text-[#f3d16c]" />
            Cetak / Simpan PDF (A4)
          </button>
        </>
      }
    >
      <ArabicReportSheet preview={preview} />
    </Modal>
  );
}

function BatchArabicReportModal({
  previews,
  onClose,
}: {
  previews: ReportPreviewData[];
  onClose: () => void;
}) {
  return (
    <Modal
      title={`Cetak Rapor Terpilih (${previews.length} Siswa)`}
      onClose={onClose}
      maxWidthClass="max-w-5xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#043b2c]"
          >
            <Printer className="h-4 w-4 text-[#f3d16c]" />
            Cetak / Simpan PDF Semua ({previews.length} Rapor)
          </button>
        </>
      }
    >
      <div className="space-y-6">
        {previews.map((p) => (
          <ArabicReportSheet key={p.student.STUDENT_ID} preview={p} />
        ))}
      </div>
    </Modal>
  );
}
