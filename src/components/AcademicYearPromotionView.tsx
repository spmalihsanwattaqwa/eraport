import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  Copy,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { api } from '../api/client.ts';
import type {
  AcademicYearRecord,
  AppSettings,
  ClassRecord,
  PromotionPreviewResponse,
  SafeUser,
} from '../types/erapor.ts';
import { ConfirmDialog, Modal } from './Modal.tsx';

type DraftAction = 'NAIK' | 'TINGGAL' | 'LULUS' | 'PINDAH' | 'SKIP';

interface DraftPromotionRow {
  studentId: string;
  action: DraftAction;
  targetClassId: string;
}

interface AcademicYearPromotionViewProps {
  user: SafeUser;
  settings: AppSettings;
  academicYears: AcademicYearRecord[];
  classes: ClassRecord[];
  selectedYear: string;
  onSelectYear: (year: string) => void;
  onRefresh: () => Promise<void>;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

const INPUT_CLASS =
  'w-full rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-sm text-slate-900 transition-colors focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none';

function suggestNextAcademicYear(yearStr: string): string {
  const m = String(yearStr || '').match(/^(\d{4})\/(\d{4})$/);
  if (m) {
    return `${Number(m[1]) + 1}/${Number(m[2]) + 1}`;
  }
  const single = String(yearStr || '').match(/(\d{4})/);
  if (single) {
    const y = Number(single[1]) + 1;
    return `${y}/${y + 1}`;
  }
  return '2027/2028';
}

export function AcademicYearPromotionView({
  user,
  settings,
  academicYears,
  classes,
  selectedYear,
  onSelectYear,
  onRefresh,
  onToast,
}: AcademicYearPromotionViewProps) {
  const isAdmin = user.role === 'ADMIN';
  const [activeTab, setActiveTab] = useState<'promotion' | 'years'>('promotion');

  // --- Promotion State ---
  const [sourceYear, setSourceYear] = useState(selectedYear || settings.ACADEMIC_YEAR);
  const sourceClasses = useMemo(
    () =>
      classes.filter(
        (c) =>
          String(c.ACTIVE).toUpperCase() === 'YA' &&
          (!sourceYear || String(c.ACADEMIC_YEAR).trim() === sourceYear)
      ),
    [classes, sourceYear]
  );
  const [sourceClassId, setSourceClassId] = useState(sourceClasses[0]?.CLASS_ID || '');

  const otherYears = useMemo(
    () => academicYears.map((y) => y.YEAR_NAME).filter((y) => y !== sourceYear),
    [academicYears, sourceYear]
  );
  const [targetYear, setTargetYear] = useState(
    () => otherYears.find((y) => y > sourceYear) || suggestNextAcademicYear(sourceYear)
  );
  const [preview, setPreview] = useState<PromotionPreviewResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftPromotionRow>>({});
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [confirmExecuteOpen, setConfirmExecuteOpen] = useState(false);

  // --- Academic Year Master State ---
  const [yearModalOpen, setYearModalOpen] = useState(false);
  const [newYearName, setNewYearName] = useState(() => suggestNextAcademicYear(settings.ACADEMIC_YEAR));
  const [newYearSem, setNewYearSem] = useState('1');
  const [cloneFromYear, setCloneFromYear] = useState(settings.ACADEMIC_YEAR);
  const [newYearNotes, setNewYearNotes] = useState('');
  const [setNewYearActive, setSetNewYearActive] = useState(false);
  const [deleteYearTarget, setDeleteYearTarget] = useState<AcademicYearRecord | null>(null);
  const [yearBusy, setYearBusy] = useState(false);

  useEffect(() => {
    if (selectedYear && academicYears.some((y) => y.YEAR_NAME === selectedYear)) {
      setSourceYear(selectedYear);
    }
  }, [selectedYear, academicYears]);

  useEffect(() => {
    if (!sourceClasses.some((c) => c.CLASS_ID === sourceClassId)) {
      setSourceClassId(sourceClasses[0]?.CLASS_ID || '');
    }
  }, [sourceClasses, sourceClassId]);

  useEffect(() => {
    if (!targetYear || targetYear === sourceYear) {
      const next =
        otherYears.find((y) => y > sourceYear) || suggestNextAcademicYear(sourceYear);
      setTargetYear(next);
    }
  }, [sourceYear, otherYears, targetYear]);

  const targetClassesForYear = useMemo(
    () =>
      classes.filter(
        (c) =>
          String(c.ACTIVE).toUpperCase() === 'YA' &&
          String(c.ACADEMIC_YEAR).trim() === targetYear.trim()
      ),
    [classes, targetYear]
  );

  const buildInitialDrafts = (res: PromotionPreviewResponse) => {
    const next: Record<string, DraftPromotionRow> = {};
    for (const r of res.rows) {
      next[r.studentId] = {
        studentId: r.studentId,
        action: r.recommendedAction,
        targetClassId: r.recommendedTargetClassId || res.targetClasses[0]?.CLASS_ID || '',
      };
    }
    return next;
  };

  const loadPreview = async () => {
    if (!sourceYear || !sourceClassId) {
      onToast('Pilih tahun ajaran asal dan kelas asal terlebih dahulu.', 'err');
      return;
    }
    if (!targetYear.trim()) {
      onToast('Tahun ajaran tujuan wajib ditentukan.', 'err');
      return;
    }
    if (targetYear.trim() === sourceYear.trim()) {
      onToast('Tahun ajaran tujuan harus berbeda dengan tahun ajaran asal.', 'err');
      return;
    }
    setLoadingPreview(true);
    try {
      const res = await api.getPromotionPreview(sourceYear, sourceClassId, targetYear.trim());
      setPreview(res);
      setDrafts(buildInitialDrafts(res));
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal memuat pratinjau kenaikan kelas', 'err');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleCloneForTarget = async () => {
    if (!isAdmin) {
      onToast('Hanya Admin yang dapat menyalin struktur kelas.', 'err');
      return;
    }
    if (!sourceYear || !targetYear.trim() || sourceYear === targetYear.trim()) {
      onToast('Tahun asal dan tahun tujuan harus berbeda.', 'err');
      return;
    }
    setYearBusy(true);
    try {
      const res = await api.cloneClasses(sourceYear, targetYear.trim());
      onToast(
        res.cloned > 0
          ? `${res.cloned} kelas berhasil disalin ke tahun ${targetYear.trim()}.`
          : `Semua kelas sudah tersedia di tahun ${targetYear.trim()}.`
      );
      await onRefresh();
      if (sourceClassId) {
        const refreshed = await api.getPromotionPreview(sourceYear, sourceClassId, targetYear.trim());
        setPreview(refreshed);
        setDrafts(buildInitialDrafts(refreshed));
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menyalin kelas', 'err');
    } finally {
      setYearBusy(false);
    }
  };

  const applySem2Rules = () => {
    if (!preview) return;
    const srcGradeNum = Number(String(preview.sourceClass?.GRADE || '').replace(/[^\d]/g, ''));
    const nextGradeStr = Number.isFinite(srcGradeNum) && srcGradeNum > 0 ? String(srcGradeNum + 1) : '';
    const sameGradeStr = Number.isFinite(srcGradeNum) && srcGradeNum > 0 ? String(srcGradeNum) : '';
    const srcName = String(preview.sourceClass?.CLASS_NAME || '').trim().toLowerCase();
    const srcSuffix = srcName.replace(/^\d+/, '').trim();

    const pickClass = (gradeStr: string, fallbackSameName: boolean) => {
      const pool = preview.targetClasses;
      if (!pool.length) return '';
      if (fallbackSameName) {
        const exact = pool.find((c) => String(c.CLASS_NAME).trim().toLowerCase() === srcName);
        if (exact) return exact.CLASS_ID;
      }
      if (gradeStr) {
        const matchSuffix = pool.find(
          (c) =>
            String(c.GRADE).trim() === gradeStr &&
            (!srcSuffix || String(c.CLASS_NAME).trim().toLowerCase().endsWith(srcSuffix))
        );
        if (matchSuffix) return matchSuffix.CLASS_ID;
        const anyGrade = pool.find((c) => String(c.GRADE).trim() === gradeStr);
        if (anyGrade) return anyGrade.CLASS_ID;
      }
      return pool[0]?.CLASS_ID || '';
    };

    const nextClass = pickClass(nextGradeStr, false);
    const sameClass = pickClass(sameGradeStr, true);

    const updated: Record<string, DraftPromotionRow> = {};
    for (const r of preview.rows) {
      let action: DraftAction = r.ruleDecision === 'TINGGAL' ? 'TINGGAL' : 'NAIK';
      if (action === 'NAIK' && !nextClass && srcGradeNum >= 3) {
        action = 'LULUS';
      }
      updated[r.studentId] = {
        studentId: r.studentId,
        action,
        targetClassId: action === 'NAIK' ? nextClass : action === 'TINGGAL' ? sameClass : '',
      };
    }
    setDrafts(updated);
    onToast('Rekomendasi kenaikan kelas berdasarkan nilai Semester 2 diterapkan.');
  };

  const updateDraft = (studentId: string, patch: Partial<DraftPromotionRow>) => {
    setDrafts((prev) => {
      const cur = prev[studentId] || { studentId, action: 'NAIK', targetClassId: '' };
      const next = { ...cur, ...patch };
      if ((next.action === 'LULUS' || next.action === 'PINDAH' || next.action === 'SKIP')) {
        next.targetClassId = '';
      } else if (!next.targetClassId && preview?.targetClasses.length) {
        next.targetClassId = preview.targetClasses[0].CLASS_ID;
      }
      return { ...prev, [studentId]: next };
    });
  };

  const summaryCounts = useMemo(() => {
    const vals = Object.values(drafts) as DraftPromotionRow[];
    return {
      naik: vals.filter((d) => d.action === 'NAIK').length,
      tinggal: vals.filter((d) => d.action === 'TINGGAL').length,
      lulus: vals.filter((d) => d.action === 'LULUS').length,
      pindah: vals.filter((d) => d.action === 'PINDAH').length,
      skip: vals.filter((d) => d.action === 'SKIP').length,
      actionable: vals.filter((d) => d.action !== 'SKIP').length,
    };
  }, [drafts]);

  const handleExecute = async () => {
    if (!preview) return;
    const items = preview.rows.map((r) => {
      const d = drafts[r.studentId] || {
        studentId: r.studentId,
        action: 'SKIP' as DraftAction,
        targetClassId: '',
      };
      return {
        studentId: r.studentId,
        action: d.action,
        targetClassId: d.targetClassId,
      };
    });

    setExecuting(true);
    try {
      const res = await api.executePromotions({
        sourceYear: preview.sourceYear,
        sourceClassId,
        targetYear: preview.targetYear,
        items,
      });
      setConfirmExecuteOpen(false);
      onToast(
        `${res.processed} siswa diproses (${res.promoted} naik, ${res.retained} tinggal, ${res.graduated} lulus, ${res.moved} pindah).`
      );
      await onRefresh();
      const reloaded = await api.getPromotionPreview(
        preview.sourceYear,
        sourceClassId,
        preview.targetYear
      );
      setPreview(reloaded);
      setDrafts(buildInitialDrafts(reloaded));
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal memproses kenaikan kelas', 'err');
    } finally {
      setExecuting(false);
    }
  };

  const handleCreateYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newYearName.trim()) return;
    setYearBusy(true);
    try {
      const res = await api.saveAcademicYear({
        yearName: newYearName.trim(),
        activeSemester: newYearSem,
        setActive: setNewYearActive,
        cloneFromYear: cloneFromYear || undefined,
        notes: newYearNotes.trim(),
      });
      onToast(
        `Tahun ajaran ${res.year.YEAR_NAME} tersimpan${
          res.clonedClasses ? ` (${res.clonedClasses} kelas disalin)` : ''
        }.`
      );
      setYearModalOpen(false);
      await onRefresh();
      if (setNewYearActive) {
        onSelectYear(res.year.YEAR_NAME);
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menyimpan tahun ajaran', 'err');
    } finally {
      setYearBusy(false);
    }
  };

  const handleActivateYear = async (yr: AcademicYearRecord) => {
    setYearBusy(true);
    try {
      await api.activateAcademicYear(yr.YEAR_ID, yr.ACTIVE_SEMESTER || '1');
      onToast(`Tahun ajaran ${yr.YEAR_NAME} diaktifkan.`);
      await onRefresh();
      onSelectYear(yr.YEAR_NAME);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal mengaktifkan tahun ajaran', 'err');
    } finally {
      setYearBusy(false);
    }
  };

  const handleDeleteYear = async () => {
    if (!deleteYearTarget) return;
    setYearBusy(true);
    try {
      await api.deleteAcademicYear(deleteYearTarget.YEAR_ID);
      onToast(`Tahun ajaran ${deleteYearTarget.YEAR_NAME} dihapus.`);
      setDeleteYearTarget(null);
      await onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menghapus tahun ajaran', 'err');
    } finally {
      setYearBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-5 shadow-[0_6px_20px_rgba(6,78,59,0.06)]">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#042f24]">
            Tahun Ajaran &amp; Kenaikan Kelas
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Kelola multi-tahun ajaran, salin struktur rombongan belajar, dan proses kenaikan kelas
            siswa tanpa merusak arsip nilai dan rapor tahun sebelumnya.
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-[#e2d6bc] bg-[#f5efe0] p-1 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('promotion')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'promotion'
                ? 'bg-[#064e3b] text-[#f3d16c] shadow-xs'
                : 'text-slate-700 hover:text-emerald-950'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Proses Kenaikan Kelas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('years')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'years'
                ? 'bg-[#064e3b] text-[#f3d16c] shadow-xs'
                : 'text-slate-700 hover:text-emerald-950'
            }`}
          >
            <CalendarRange className="h-3.5 w-3.5" />
            Master Tahun Ajaran ({academicYears.length})
          </button>
        </div>
      </div>

      {/* TAB 1: PROSES KENAIKAN KELAS */}
      {activeTab === 'promotion' && (
        <>
          <div className="rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-5 shadow-[0_4px_16px_rgba(6,78,59,0.05)] space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tahun Ajaran Asal
                </label>
                <select
                  value={sourceYear}
                  onChange={(e) => {
                    setSourceYear(e.target.value);
                    setPreview(null);
                  }}
                  className={`${INPUT_CLASS} font-mono-tabular`}
                >
                  {academicYears.map((y) => (
                    <option key={y.YEAR_ID} value={y.YEAR_NAME}>
                      {y.YEAR_NAME} {y.IS_ACTIVE === 'YA' ? '(Aktif)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas Asal</label>
                <select
                  value={sourceClassId}
                  onChange={(e) => {
                    setSourceClassId(e.target.value);
                    setPreview(null);
                  }}
                  className={INPUT_CLASS}
                >
                  <option value="">Pilih Kelas Asal</option>
                  {sourceClasses.map((c) => (
                    <option key={c.CLASS_ID} value={c.CLASS_ID}>
                      {c.CLASS_NAME} ({c.LEVEL} · Tingkat {c.GRADE})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tahun Ajaran Tujuan
                </label>
                <input
                  list="target-year-options"
                  value={targetYear}
                  onChange={(e) => {
                    setTargetYear(e.target.value);
                    setPreview(null);
                  }}
                  placeholder="Contoh: 2027/2028"
                  className={`${INPUT_CLASS} font-mono-tabular`}
                />
                <datalist id="target-year-options">
                  {otherYears.map((y) => (
                    <option key={y} value={y} />
                  ))}
                  {!otherYears.includes(suggestNextAcademicYear(sourceYear)) && (
                    <option value={suggestNextAcademicYear(sourceYear)} />
                  )}
                </datalist>
              </div>

              <button
                type="button"
                onClick={loadPreview}
                disabled={loadingPreview || !sourceClassId}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white ring-1 ring-[#d4af37]/35 hover:bg-[#043b2c] disabled:opacity-50 whitespace-nowrap"
              >
                <Search className="h-4 w-4 text-[#f3d16c]" />
                {loadingPreview ? 'Memuat...' : 'Muat Siswa & Nilai Sem 2'}
              </button>
            </div>

            {targetYear.trim() &&
              targetYear.trim() !== sourceYear &&
              targetClassesForYear.length === 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-amber-300/80 bg-amber-50/90 px-4 py-3 text-xs text-amber-950">
                  <div>
                    <span className="font-bold">Kelas di tahun ajaran {targetYear} belum ada.</span>{' '}
                    Salin struktur kelas dari {sourceYear} agar siswa dapat langsung ditempatkan ke
                    rombel tahun baru.
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      disabled={yearBusy}
                      onClick={handleCloneForTarget}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#064e3b] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#043b2c] disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      <Copy className="h-3.5 w-3.5 text-[#f3d16c]" />
                      {yearBusy ? 'Menyalin...' : `Salin Kelas ke ${targetYear}`}
                    </button>
                  )}
                </div>
              )}
          </div>

          {preview && (
            <div className="space-y-4">
              {/* Summary Strip + Bulk Helpers */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-3.5">
                  <div className="text-[11px] font-semibold text-slate-500">Naik Kelas</div>
                  <div className="mt-1 text-2xl font-bold font-mono-tabular text-emerald-800">
                    {summaryCounts.naik}
                  </div>
                </div>
                <div className="rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-3.5">
                  <div className="text-[11px] font-semibold text-slate-500">Tinggal Kelas</div>
                  <div className="mt-1 text-2xl font-bold font-mono-tabular text-red-700">
                    {summaryCounts.tinggal}
                  </div>
                </div>
                <div className="rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-3.5">
                  <div className="text-[11px] font-semibold text-slate-500">Lulus / Tamat</div>
                  <div className="mt-1 text-2xl font-bold font-mono-tabular text-amber-800">
                    {summaryCounts.lulus}
                  </div>
                </div>
                <div className="rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-3.5">
                  <div className="text-[11px] font-semibold text-slate-500">Pindah / Mutasi</div>
                  <div className="mt-1 text-2xl font-bold font-mono-tabular text-slate-700">
                    {summaryCounts.pindah}
                  </div>
                </div>
                <div className="rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-3.5">
                  <div className="text-[11px] font-semibold text-slate-500">Dilewati (Skip)</div>
                  <div className="mt-1 text-2xl font-bold font-mono-tabular text-slate-400">
                    {summaryCounts.skip}
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 shadow-[0_6px_22px_rgba(6,78,59,0.06)]">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#e6dcc6] px-5 py-3.5">
                  <div className="text-xs text-slate-700">
                    Memproses{' '}
                    <span className="font-bold text-[#042f24]">
                      {preview.sourceClass?.CLASS_NAME || '-'} ({preview.sourceYear})
                    </span>{' '}
                    <ArrowRight className="inline h-3.5 w-3.5 mx-1 text-amber-700" />{' '}
                    <span className="font-bold font-mono-tabular text-[#042f24]">
                      {preview.targetYear}
                    </span>
                    . Aturan Semester 2: kategori <span className="font-arabic font-bold">راسب</span>{' '}
                    otomatis disarankan <span className="font-bold text-red-700">Tinggal Kelas</span>.
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={applySem2Rules}
                      disabled={!preview.rows.length}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-amber-50/60 disabled:opacity-50"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-amber-700" />
                      Terapkan Rekomendasi Nilai Sem 2
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmExecuteOpen(true)}
                      disabled={executing || summaryCounts.actionable === 0}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#c89b2b] to-[#dfb547] px-4 py-2 text-xs font-bold text-[#042f24] shadow-xs hover:brightness-95 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {executing
                        ? 'Memproses...'
                        : `Proses Kenaikan (${summaryCounts.actionable} Siswa)`}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[65vh]">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-[#064e3b] text-xs font-semibold text-amber-50 border-b border-[#d4af37]/40">
                      <tr>
                        <th className="px-4 py-3 w-12">No.</th>
                        <th className="px-4 py-3 min-w-[180px]">Nama Murid</th>
                        <th className="px-4 py-3 text-center">Nilai &amp; Predikat Sem 2</th>
                        <th className="px-4 py-3 text-center">Aturan Sem 2</th>
                        <th className="px-4 py-3 w-44">Keputusan Proses</th>
                        <th className="px-4 py-3 min-w-[200px]">
                          Kelas Tujuan ({preview.targetYear})
                        </th>
                        <th className="px-4 py-3 text-center">Riwayat Proses</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eee5d3]">
                      {preview.rows.length ? (
                        preview.rows.map((r) => {
                          const d = drafts[r.studentId] || {
                            studentId: r.studentId,
                            action: r.recommendedAction,
                            targetClassId: r.recommendedTargetClassId,
                          };
                          const needsTargetClass = d.action === 'NAIK' || d.action === 'TINGGAL';
                          const isRasib = r.sem2Category.trim() === 'راسب';
                          return (
                            <tr key={r.studentId} className="hover:bg-amber-50/45">
                              <td className="px-4 py-2.5 font-mono-tabular text-slate-500">
                                {r.no}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="font-semibold text-slate-900 font-arabic text-base">
                                  {r.name}
                                </div>
                                <div className="text-[11px] font-mono-tabular text-slate-500">
                                  {r.nis || '-'} / {r.nisn || '-'}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {r.sem2Average !== '' ? (
                                  <div>
                                    <span className="font-mono-tabular font-bold text-slate-900">
                                      {r.sem2Average}
                                    </span>{' '}
                                    <span
                                      className={`font-arabic font-bold text-base ${
                                        isRasib ? 'text-red-700' : 'text-emerald-800'
                                      }`}
                                    >
                                      ({r.sem2Category})
                                    </span>
                                    {r.sem2Rank !== '-' && (
                                      <div className="text-[11px] font-mono-tabular text-slate-500">
                                        Rank #{r.sem2Rank}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-400">Belum ada nilai</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-center text-xs font-semibold">
                                <span
                                  className={
                                    r.ruleDecision === 'TINGGAL'
                                      ? 'text-red-700'
                                      : r.ruleDecision === 'NAIK'
                                        ? 'text-emerald-800'
                                        : 'text-slate-500'
                                  }
                                >
                                  {r.ruleLabel}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <select
                                  value={d.action}
                                  onChange={(e) =>
                                    updateDraft(r.studentId, {
                                      action: e.target.value as DraftAction,
                                    })
                                  }
                                  className={`w-full rounded-lg border border-[#d9ceb5] bg-white px-2.5 py-1.5 text-xs font-bold focus:border-emerald-700 focus:outline-none ${
                                    d.action === 'NAIK'
                                      ? 'text-emerald-800'
                                      : d.action === 'TINGGAL'
                                        ? 'text-red-700'
                                        : d.action === 'LULUS'
                                          ? 'text-amber-800'
                                          : 'text-slate-600'
                                  }`}
                                >
                                  <option value="NAIK">Naik Kelas</option>
                                  <option value="TINGGAL">Tinggal Kelas</option>
                                  <option value="LULUS">Lulus / Tamat</option>
                                  <option value="PINDAH">Pindah / Mutasi</option>
                                  <option value="SKIP">Lewati (Belum Diproses)</option>
                                </select>
                              </td>
                              <td className="px-4 py-2.5">
                                {needsTargetClass ? (
                                  preview.targetClasses.length ? (
                                    <select
                                      value={d.targetClassId}
                                      onChange={(e) =>
                                        updateDraft(r.studentId, { targetClassId: e.target.value })
                                      }
                                      className="w-full rounded-lg border border-[#d9ceb5] bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
                                    >
                                      <option value="">Pilih Kelas Tujuan</option>
                                      {preview.targetClasses.map((tc) => (
                                        <option key={tc.CLASS_ID} value={tc.CLASS_ID}>
                                          {tc.CLASS_NAME} ({tc.LEVEL} · Tkt {tc.GRADE})
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="text-xs font-semibold text-red-600">
                                      Belum ada kelas di {preview.targetYear}
                                    </span>
                                  )
                                ) : (
                                  <span className="text-xs text-slate-400">
                                    {d.action === 'LULUS'
                                      ? 'Status diubah ke LULUS'
                                      : d.action === 'PINDAH'
                                        ? 'Status diubah ke NONAKTIF'
                                        : 'Tidak berubah'}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-center text-xs font-semibold">
                                {r.existingDecision && r.existingDecision !== 'BELUM' ? (
                                  <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-800 border border-emerald-200">
                                    {r.existingDecision}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">Belum</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-sm text-slate-400">
                            Tidak ada siswa terdaftar pada kelas &amp; tahun ajaran asal ini.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB 2: MASTER TAHUN AJARAN */}
      {activeTab === 'years' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-4 shadow-[0_4px_16px_rgba(6,78,59,0.05)]">
            <div className="text-xs text-slate-700">
              Tahun Ajaran Aktif saat ini:{' '}
              <span className="font-mono-tabular font-bold text-[#042f24]">
                {settings.ACADEMIC_YEAR}
              </span>{' '}
              (Semester {settings.ACTIVE_SEMESTER}). Menambah atau mengganti tahun aktif akan
              membuat seluruh arsip tahun sebelumnya tetap tersimpan rapi.
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  const latest = academicYears[0]?.YEAR_NAME || settings.ACADEMIC_YEAR;
                  setNewYearName(suggestNextAcademicYear(latest));
                  setCloneFromYear(settings.ACADEMIC_YEAR);
                  setNewYearSem('1');
                  setNewYearNotes('');
                  setSetNewYearActive(false);
                  setYearModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#064e3b] px-3.5 py-2 text-xs font-semibold text-white ring-1 ring-[#d4af37]/35 shadow-xs hover:bg-[#043b2c] whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5 text-[#f3d16c]" />
                Tambah Tahun Ajaran
              </button>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 shadow-[0_6px_22px_rgba(6,78,59,0.06)]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#064e3b] text-xs font-semibold text-amber-50 border-b border-[#d4af37]/40">
                  <tr>
                    <th className="px-4 py-3 w-12">No.</th>
                    <th className="px-4 py-3">Tahun Ajaran</th>
                    <th className="px-4 py-3 text-center">Semester Aktif</th>
                    <th className="px-4 py-3 text-center">Jumlah Kelas</th>
                    <th className="px-4 py-3 text-center">Siswa Terdaftar</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Catatan</th>
                    <th className="px-4 py-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eee5d3]">
                  {academicYears.length ? (
                    academicYears.map((y, idx) => {
                      const isActive =
                        y.IS_ACTIVE === 'YA' || y.YEAR_NAME === settings.ACADEMIC_YEAR;
                      const isSelected = y.YEAR_NAME === selectedYear;
                      return (
                        <tr key={y.YEAR_ID} className="hover:bg-amber-50/45">
                          <td className="px-4 py-3 font-mono-tabular text-slate-500">{idx + 1}</td>
                          <td className="px-4 py-3 font-mono-tabular font-bold text-slate-900">
                            {y.YEAR_NAME}
                          </td>
                          <td className="px-4 py-3 text-center font-mono-tabular">
                            Semester {y.ACTIVE_SEMESTER || '1'}
                          </td>
                          <td className="px-4 py-3 text-center font-mono-tabular font-semibold">
                            {y.classCount ?? 0}
                          </td>
                          <td className="px-4 py-3 text-center font-mono-tabular font-semibold">
                            {y.studentCount ?? 0}
                          </td>
                          <td className="px-4 py-3 text-xs font-bold">
                            {isActive ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-emerald-900">
                                AKTIF
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">
                                ARSIP
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">{y.NOTES || '-'}</td>
                          <td className="px-4 py-3 text-center">
                            <div className="inline-flex items-center gap-1.5">
                              {!isSelected && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSelectYear(y.YEAR_NAME);
                                    onToast(`Tampilan kerja diarahkan ke tahun ${y.YEAR_NAME}.`);
                                  }}
                                  className="rounded-md border border-[#d9ceb5] bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-amber-50/60 whitespace-nowrap"
                                >
                                  Lihat Tahun Ini
                                </button>
                              )}
                              {isAdmin && !isActive && (
                                <button
                                  type="button"
                                  disabled={yearBusy}
                                  onClick={() => handleActivateYear(y)}
                                  className="inline-flex items-center gap-1 rounded-md bg-[#064e3b] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#043b2c] disabled:opacity-50 whitespace-nowrap"
                                >
                                  <RefreshCw className="h-3 w-3 text-[#f3d16c]" />
                                  Jadikan Aktif
                                </button>
                              )}
                              {isAdmin && !isActive && (
                                <button
                                  type="button"
                                  disabled={yearBusy}
                                  onClick={() => setDeleteYearTarget(y)}
                                  className="rounded-md border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
                                  title="Hapus Tahun Ajaran"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-sm text-slate-400">
                        Belum ada data tahun ajaran.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah Tahun Ajaran */}
      {yearModalOpen && (
        <Modal
          title="Tambah Tahun Ajaran Baru"
          onClose={() => setYearModalOpen(false)}
          maxWidthClass="max-w-lg"
          footer={
            <>
              <button
                type="button"
                onClick={() => setYearModalOpen(false)}
                className="rounded-lg border border-[#d9ceb5] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-amber-50/60"
              >
                Batal
              </button>
              <button
                type="submit"
                form="newYearForm"
                disabled={yearBusy}
                className="rounded-lg bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white ring-1 ring-[#d4af37]/35 hover:bg-[#043b2c] disabled:opacity-50"
              >
                {yearBusy ? 'Menyimpan...' : 'Simpan Tahun Ajaran'}
              </button>
            </>
          }
        >
          <form id="newYearForm" onSubmit={handleCreateYear} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Tahun Ajaran *
                </label>
                <input
                  required
                  placeholder="Contoh: 2027/2028"
                  value={newYearName}
                  onChange={(e) => setNewYearName(e.target.value)}
                  className={`${INPUT_CLASS} font-mono-tabular`}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Semester Awal
                </label>
                <select
                  value={newYearSem}
                  onChange={(e) => setNewYearSem(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="1">Semester 1 (Ganjil)</option>
                  <option value="2">Semester 2 (Genap)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Salin Struktur Rombel / Kelas Dari
              </label>
              <select
                value={cloneFromYear}
                onChange={(e) => setCloneFromYear(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">Jangan salin kelas (buat manual nanti)</option>
                {academicYears.map((y) => (
                  <option key={y.YEAR_ID} value={y.YEAR_NAME}>
                    {y.YEAR_NAME} ({y.classCount ?? 0} kelas)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Catatan (Opsional)
              </label>
              <input
                value={newYearNotes}
                onChange={(e) => setNewYearNotes(e.target.value)}
                placeholder="Misal: Tahun ajaran baru pasca kenaikan kelas"
                className={INPUT_CLASS}
              />
            </div>

            <label className="flex items-center gap-2.5 rounded-lg border border-[#e2d6bc] bg-[#fdfaf3] px-3 py-2.5 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={setNewYearActive}
                onChange={(e) => setSetNewYearActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-700"
              />
              <span>Langsung jadikan sebagai Tahun Ajaran Aktif sekolah</span>
            </label>
          </form>
        </Modal>
      )}

      {confirmExecuteOpen && preview && (
        <ConfirmDialog
          title="Konfirmasi Proses Kenaikan Kelas"
          message={`Proses ${summaryCounts.actionable} siswa dari kelas ${preview.sourceClass?.CLASS_NAME || ''} (${preview.sourceYear}) menuju tahun ajaran ${preview.targetYear}? Riwayat nilai dan rapor ${preview.sourceYear} akan tetap terjaga.`}
          confirmLabel="Ya, Proses Sekarang"
          busy={executing}
          onCancel={() => setConfirmExecuteOpen(false)}
          onConfirm={handleExecute}
        />
      )}

      {deleteYearTarget && (
        <ConfirmDialog
          title="Hapus Tahun Ajaran"
          message={`Yakin ingin menghapus tahun ajaran "${deleteYearTarget.YEAR_NAME}"?`}
          confirmLabel="Hapus"
          busy={yearBusy}
          onCancel={() => setDeleteYearTarget(null)}
          onConfirm={handleDeleteYear}
        />
      )}
    </div>
  );
}
