import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client.ts';
import {
  SCHOOL_LEVELS,
  type AcademicYearRecord,
  type AppSettings,
  type ClassRecord,
  type ExtraRecord,
  type SchoolLevel,
  type StudentRecord,
  type SubjectRecord,
  type TeacherNoteRecord,
} from '../types/erapor.ts';
import {
  DEFAULT_EXTRA_CATEGORIES,
  DEFAULT_SYAKHSIYAH_CATEGORIES,
  parsePredicateCategories,
  parseSubjectLevels,
} from '../utils/arabic.ts';
import { ConfirmDialog, Modal } from './Modal.tsx';

const INPUT_CLASS =
  'w-full rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-sm text-slate-950 transition-colors focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none';

/* ===================== CLASSES VIEW ===================== */
export function ClassesView({
  classes,
  academicYears,
  selectedYear,
  settings,
  canEdit,
  onRefresh,
  onToast,
}: {
  classes: ClassRecord[];
  academicYears: AcademicYearRecord[];
  selectedYear: string;
  settings: AppSettings;
  canEdit: boolean;
  onRefresh: () => Promise<void>;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}) {
  const [yearFilter, setYearFilter] = useState(selectedYear || settings.ACADEMIC_YEAR);
  const [editing, setEditing] = useState<Partial<ClassRecord> | null>(null);
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [cloneSourceYear, setCloneSourceYear] = useState(selectedYear || settings.ACADEMIC_YEAR);
  const [cloneTargetYear, setCloneTargetYear] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ClassRecord | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (selectedYear) {
      setYearFilter(selectedYear);
      setCloneSourceYear(selectedYear);
    }
  }, [selectedYear]);

  const filteredClasses = useMemo(() => {
    if (!yearFilter || yearFilter === 'ALL') return classes;
    return classes.filter((c) => String(c.ACADEMIC_YEAR).trim() === yearFilter);
  }, [classes, yearFilter]);

  const defaultLevel = SCHOOL_LEVELS.includes(settings.SCHOOL_LEVEL as SchoolLevel)
    ? settings.SCHOOL_LEVEL
    : 'WUSTHA';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await api.saveRecord('classes', editing);
      onToast('Data kelas tersimpan.');
      setEditing(null);
      await onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menyimpan kelas.', 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleCloneClasses = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneSourceYear.trim() || !cloneTargetYear.trim()) {
      onToast('Pilih tahun asal dan masukkan tahun tujuan.', 'err');
      return;
    }
    if (cloneSourceYear.trim() === cloneTargetYear.trim()) {
      onToast('Tahun ajaran asal dan tujuan harus berbeda.', 'err');
      return;
    }
    setBusy(true);
    try {
      const res = await api.cloneClasses(cloneSourceYear.trim(), cloneTargetYear.trim());
      onToast(
        `${res.cloned} kelas disalin ke ${cloneTargetYear.trim()}${
          res.skipped ? ` (${res.skipped} sudah ada)` : ''
        }.`
      );
      setCloneModalOpen(false);
      setYearFilter(cloneTargetYear.trim());
      await onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menyalin kelas.', 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.deleteRecord('classes', deleteTarget.CLASS_ID);
      onToast('Kelas dihapus.');
      setDeleteTarget(null);
      await onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menghapus kelas.', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-5 shadow-[0_6px_20px_rgba(6,78,59,0.06)]">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#042f24]">Data Kelas</h2>
          <p className="mt-1 text-sm text-slate-800">
            Kelola tingkat, nama rombel, wali kelas (معلم الفصل), dan tahun pelajaran.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-xs font-mono-tabular font-semibold text-slate-950 focus:border-emerald-700 focus:outline-none"
          >
            <option value="ALL">Semua Tahun ({classes.length})</option>
            {academicYears.map((y) => (
              <option key={y.YEAR_ID} value={y.YEAR_NAME}>
                TA {y.YEAR_NAME}
              </option>
            ))}
          </select>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => {
                  const baseYear = yearFilter !== 'ALL' ? yearFilter : selectedYear;
                  setCloneSourceYear(baseYear);
                  const m = baseYear.match(/^(\d{4})\/(\d{4})$/);
                  setCloneTargetYear(m ? `${Number(m[1]) + 1}/${Number(m[2]) + 1}` : '');
                  setCloneModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#d4af37]/60 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap shrink-0"
              >
                <Copy className="h-3.5 w-3.5" />
                Salin Kelas ke Tahun Lain
              </button>
              <button
                type="button"
                onClick={() =>
                  setEditing({
                    LEVEL: defaultLevel,
                    ACADEMIC_YEAR:
                      (yearFilter !== 'ALL' ? yearFilter : selectedYear) || settings.ACADEMIC_YEAR,
                    ACTIVE: 'YA',
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#064e3b] px-3.5 py-2 text-xs font-semibold text-white ring-1 ring-[#d4af37]/35 shadow-xs hover:bg-[#043b2c] whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah Kelas
              </button>
            </>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 shadow-[0_6px_22px_rgba(6,78,59,0.06)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#064e3b] text-xs font-semibold text-amber-50 border-b border-[#d4af37]/40">
              <tr>
                <th className="px-4 py-3 w-12">No.</th>
                <th className="px-4 py-3">Jenjang</th>
                <th className="px-4 py-3">Tingkat</th>
                <th className="px-4 py-3">Nama Kelas</th>
                <th className="px-4 py-3">Wali Kelas</th>
                <th className="px-4 py-3">Tahun Pelajaran</th>
                <th className="px-4 py-3">Status</th>
                {canEdit && <th className="px-4 py-3 text-center w-28">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee5d3]">
              {filteredClasses.length ? (
                filteredClasses.map((r, i) => (
                  <tr key={r.CLASS_ID} className="hover:bg-amber-50/45">
                    <td className="px-4 py-2.5 font-mono-tabular font-semibold text-slate-800">{i + 1}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{r.LEVEL}</td>
                    <td className="px-4 py-2.5 font-mono-tabular font-medium text-slate-900">{r.GRADE}</td>
                    <td className="px-4 py-2.5 font-bold text-slate-950">{r.CLASS_NAME}</td>
                    <td className="px-4 py-2.5 font-arabic text-base font-medium text-slate-950">{r.HOMEROOM_TEACHER}</td>
                    <td className="px-4 py-2.5 font-mono-tabular font-medium text-slate-900">{r.ACADEMIC_YEAR}</td>
                    <td className="px-4 py-2.5 text-xs font-bold">
                      <span className={r.ACTIVE === 'YA' ? 'text-emerald-900' : 'text-red-700'}>
                        {r.ACTIVE}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-2.5 text-center">
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditing({ ...r })}
                            className="rounded-md border border-slate-300 p-1.5 text-slate-800 hover:bg-slate-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(r)}
                            className="rounded-md border border-red-200 p-1.5 text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="py-12 text-center text-sm font-medium text-slate-800">
                    Belum ada data kelas pada tahun ajaran ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal
          title={editing.CLASS_ID ? 'Edit Kelas' : 'Tambah Kelas'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-[#d9ceb5] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-amber-50/60"
              >
                Batal
              </button>
              <button
                type="submit"
                form="classForm"
                disabled={busy}
                className="rounded-lg bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white ring-1 ring-[#d4af37]/35 hover:bg-[#043b2c]"
              >
                {busy ? 'Menyimpan...' : 'Simpan'}
              </button>
            </>
          }
        >
          <form id="classForm" onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Jenjang</label>
              <select
                className={INPUT_CLASS}
                value={editing.LEVEL || defaultLevel}
                onChange={(e) => setEditing({ ...editing, LEVEL: e.target.value })}
              >
                {SCHOOL_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
                {editing.LEVEL && !SCHOOL_LEVELS.includes(editing.LEVEL as SchoolLevel) && (
                  <option value={editing.LEVEL}>{editing.LEVEL}</option>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tingkat *</label>
              <input
                required
                className={INPUT_CLASS}
                value={editing.GRADE || ''}
                onChange={(e) => setEditing({ ...editing, GRADE: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Rombel *</label>
              <input
                required
                className={INPUT_CLASS}
                value={editing.CLASS_NAME || ''}
                onChange={(e) => setEditing({ ...editing, CLASS_NAME: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Wali Kelas (Arab / Latin)
              </label>
              <input
                className={`${INPUT_CLASS} font-arabic`}
                value={editing.HOMEROOM_TEACHER || ''}
                onChange={(e) => setEditing({ ...editing, HOMEROOM_TEACHER: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tahun Pelajaran
              </label>
              <input
                list="class-academic-years"
                className={`${INPUT_CLASS} font-mono-tabular`}
                value={editing.ACADEMIC_YEAR || settings.ACADEMIC_YEAR}
                onChange={(e) => setEditing({ ...editing, ACADEMIC_YEAR: e.target.value })}
              />
              <datalist id="class-academic-years">
                {academicYears.map((y) => (
                  <option key={y.YEAR_ID} value={y.YEAR_NAME} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                className={INPUT_CLASS}
                value={editing.ACTIVE || 'YA'}
                onChange={(e) => setEditing({ ...editing, ACTIVE: e.target.value })}
              >
                <option value="YA">YA</option>
                <option value="TIDAK">TIDAK</option>
              </select>
            </div>
          </form>
        </Modal>
      )}

      {cloneModalOpen && (
        <Modal
          title="Salin Struktur Kelas Antar Tahun Ajaran"
          onClose={() => setCloneModalOpen(false)}
          maxWidthClass="max-w-md"
          footer={
            <>
              <button
                type="button"
                onClick={() => setCloneModalOpen(false)}
                className="rounded-lg border border-[#d9ceb5] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-amber-50/60"
              >
                Batal
              </button>
              <button
                type="submit"
                form="cloneClassForm"
                disabled={busy}
                className="rounded-lg bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white ring-1 ring-[#d4af37]/35 hover:bg-[#043b2c]"
              >
                {busy ? 'Menyalin...' : 'Salin Kelas'}
              </button>
            </>
          }
        >
          <form id="cloneClassForm" onSubmit={handleCloneClasses} className="space-y-4">
            <p className="text-xs leading-relaxed text-slate-600">
              Duplikasi seluruh kelas aktif dari satu tahun ajaran ke tahun ajaran tujuan. Kelas
              yang namanya sudah ada di tahun tujuan tidak akan diduplikasi.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tahun Ajaran Asal
              </label>
              <select
                value={cloneSourceYear}
                onChange={(e) => setCloneSourceYear(e.target.value)}
                className={`${INPUT_CLASS} font-mono-tabular`}
              >
                {academicYears.map((y) => (
                  <option key={y.YEAR_ID} value={y.YEAR_NAME}>
                    {y.YEAR_NAME}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tahun Ajaran Tujuan *
              </label>
              <input
                required
                list="clone-target-years"
                placeholder="Contoh: 2027/2028"
                value={cloneTargetYear}
                onChange={(e) => setCloneTargetYear(e.target.value)}
                className={`${INPUT_CLASS} font-mono-tabular`}
              />
              <datalist id="clone-target-years">
                {academicYears
                  .filter((y) => y.YEAR_NAME !== cloneSourceYear)
                  .map((y) => (
                    <option key={y.YEAR_ID} value={y.YEAR_NAME} />
                  ))}
              </datalist>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Hapus Kelas"
          message={`Yakin ingin menghapus kelas "${deleteTarget.CLASS_NAME}"?`}
          confirmLabel="Hapus Kelas"
          busy={busy}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

/* ===================== SUBJECTS VIEW ===================== */
export function SubjectsView({
  settings,
  canEdit,
  onRefresh,
  onToast,
}: {
  settings: AppSettings;
  canEdit: boolean;
  onRefresh: () => Promise<void>;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}) {
  const [rows, setRows] = useState<SubjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<SubjectRecord> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubjectRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const defaultLevel = SCHOOL_LEVELS.includes(settings.SCHOOL_LEVEL as SchoolLevel)
    ? settings.SCHOOL_LEVEL
    : 'WUSTHA';

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.listRecords<SubjectRecord>('subjects');
      setRows(res.sort((a, b) => Number(a.DISPLAY_ORDER || 0) - Number(b.DISPLAY_ORDER || 0)));
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal memuat mapel', 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const levels = parseSubjectLevels(editing.LEVEL);
    if (!levels.length) {
      onToast('Pilih minimal satu jenjang untuk mata pelajaran ini.', 'err');
      return;
    }
    setBusy(true);
    try {
      await api.saveRecord('subjects', {
        ...editing,
        LEVEL: levels.join(', '),
      });
      onToast('Mata pelajaran tersimpan.');
      setEditing(null);
      await load();
      await onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menyimpan mapel', 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.deleteRecord('subjects', deleteTarget.SUBJECT_ID);
      onToast('Mata pelajaran dihapus.');
      setDeleteTarget(null);
      await load();
      await onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menghapus mapel', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-5 shadow-[0_6px_20px_rgba(6,78,59,0.06)]">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#042f24]">Mata Pelajaran</h2>
          <p className="mt-1 text-sm text-slate-800">
            Master mata pelajaran beserta nama aksara Arab (اسم المادة) dan urutan cetak rapor.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() =>
              setEditing({
                LEVEL: defaultLevel,
                GROUP_NAME: 'A',
                DISPLAY_ORDER: rows.length + 1,
                ACTIVE: 'YA',
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#064e3b] px-3.5 py-2 text-xs font-semibold text-white ring-1 ring-[#d4af37]/35 shadow-xs hover:bg-[#043b2c] whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah Mapel
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 shadow-[0_6px_22px_rgba(6,78,59,0.06)]">
        <div className="overflow-x-auto max-h-[68vh]">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[#064e3b] text-xs font-semibold text-amber-50 border-b border-[#d4af37]/40">
              <tr>
                <th className="px-4 py-3 w-12">No.</th>
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Mata Pelajaran</th>
                <th className="px-4 py-3 text-right">Nama Arab (اسم المادة)</th>
                <th className="px-4 py-3">Jenjang</th>
                <th className="px-4 py-3 text-center">Kelompok</th>
                <th className="px-4 py-3 text-center">Urutan</th>
                <th className="px-4 py-3">Status</th>
                {canEdit && <th className="px-4 py-3 text-center w-28">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee5d3]">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-sm font-medium text-slate-800">
                    Memuat mata pelajaran...
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((r, i) => (
                  <tr key={r.SUBJECT_ID} className="hover:bg-amber-50/45">
                    <td className="px-4 py-2.5 font-mono-tabular font-semibold text-slate-800">{i + 1}</td>
                    <td className="px-4 py-2.5 font-mono-tabular font-bold text-slate-950">
                      {r.CODE}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-950">{r.SUBJECT_NAME}</td>
                    <td className="px-4 py-2.5 text-right font-arabic text-base font-bold text-slate-950">
                      {r.SUBJECT_NAME_ARAB || '-'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-900">
                      <div className="flex flex-wrap gap-1">
                        {parseSubjectLevels(r.LEVEL).map((lvl) => (
                          <span
                            key={lvl}
                            className="inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-950 border border-emerald-300"
                          >
                            {lvl}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono-tabular font-semibold text-slate-900">{r.GROUP_NAME}</td>
                    <td className="px-4 py-2.5 text-center font-mono-tabular font-semibold text-slate-900">{r.DISPLAY_ORDER}</td>
                    <td className="px-4 py-2.5 text-xs font-bold">
                      <span
                        className={
                          String(r.ACTIVE).toUpperCase() === 'YA'
                            ? 'text-emerald-900'
                            : 'text-red-700'
                        }
                      >
                        {r.ACTIVE}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-2.5 text-center">
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditing({ ...r })}
                            className="rounded-md border border-slate-300 p-1.5 text-slate-800 hover:bg-slate-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(r)}
                            className="rounded-md border border-red-200 p-1.5 text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-sm font-medium text-slate-800">
                    Belum ada data mata pelajaran.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal
          title={editing.SUBJECT_ID ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-[#d9ceb5] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-amber-50/60"
              >
                Batal
              </button>
              <button
                type="submit"
                form="subjectForm"
                disabled={busy}
                className="rounded-lg bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white ring-1 ring-[#d4af37]/35 hover:bg-[#043b2c]"
              >
                {busy ? 'Menyimpan...' : 'Simpan'}
              </button>
            </>
          }
        >
          <form id="subjectForm" onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kode *</label>
              <input
                required
                className={`${INPUT_CLASS} font-mono-tabular`}
                value={editing.CODE || ''}
                onChange={(e) => setEditing({ ...editing, CODE: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mata Pelajaran (Indonesia) *
              </label>
              <input
                required
                className={INPUT_CLASS}
                value={editing.SUBJECT_NAME || ''}
                onChange={(e) => setEditing({ ...editing, SUBJECT_NAME: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Arab (اسم المادة) *
              </label>
              <input
                required
                dir="rtl"
                placeholder="Contoh: اللغة العربية"
                className={`${INPUT_CLASS} text-base font-arabic`}
                value={editing.SUBJECT_NAME_ARAB || ''}
                onChange={(e) => setEditing({ ...editing, SUBJECT_NAME_ARAB: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Jenjang (Bisa Multi Jenjang) *
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const current = parseSubjectLevels(editing.LEVEL);
                    const allSelected = SCHOOL_LEVELS.every((l) => current.includes(l));
                    setEditing({
                      ...editing,
                      LEVEL: allSelected ? defaultLevel : SCHOOL_LEVELS.join(', '),
                    });
                  }}
                  className="text-[11px] font-semibold text-emerald-800 hover:underline"
                >
                  {SCHOOL_LEVELS.every((l) => parseSubjectLevels(editing.LEVEL).includes(l))
                    ? 'Reset ke Jenjang Default'
                    : 'Pilih Semua Jenjang'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2 rounded-lg border border-[#d9ceb5] bg-white p-2.5">
                {Array.from(new Set([...SCHOOL_LEVELS, ...parseSubjectLevels(editing.LEVEL)])).map(
                  (lvl) => {
                    const selectedLevels = parseSubjectLevels(editing.LEVEL);
                    const checked = selectedLevels.includes(lvl);
                    return (
                      <label
                        key={lvl}
                        className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
                          checked
                            ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-amber-50/40'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? Array.from(new Set([...selectedLevels, lvl]))
                              : selectedLevels.filter((x) => x !== lvl);
                            setEditing({ ...editing, LEVEL: next.join(', ') });
                          }}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                        />
                        <span>{lvl}</span>
                      </label>
                    );
                  }
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kelompok</label>
              <select
                className={INPUT_CLASS}
                value={editing.GROUP_NAME || 'A'}
                onChange={(e) => setEditing({ ...editing, GROUP_NAME: e.target.value })}
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Urutan Cetak</label>
              <input
                type="number"
                className={`${INPUT_CLASS} font-mono-tabular`}
                value={editing.DISPLAY_ORDER ?? 1}
                onChange={(e) => setEditing({ ...editing, DISPLAY_ORDER: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                className={INPUT_CLASS}
                value={editing.ACTIVE || 'YA'}
                onChange={(e) => setEditing({ ...editing, ACTIVE: e.target.value })}
              >
                <option value="YA">YA</option>
                <option value="TIDAK">TIDAK</option>
              </select>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Hapus Mata Pelajaran"
          message={`Yakin ingin menghapus mata pelajaran "${deleteTarget.SUBJECT_NAME}"?`}
          confirmLabel="Hapus Mapel"
          busy={busy}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

/* ===================== EXTRACURRICULAR & TEACHER NOTES ===================== */
export function ExtraAndNotesView({
  mode,
  students,
  academicYears,
  selectedYear,
  settings,
  canEdit,
  onToast,
}: {
  mode: 'extracurricular' | 'notes';
  students: StudentRecord[];
  academicYears: AcademicYearRecord[];
  selectedYear: string;
  settings: AppSettings;
  canEdit: boolean;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}) {
  const [extraRows, setExtraRows] = useState<ExtraRecord[]>([]);
  const [noteRows, setNoteRows] = useState<TeacherNoteRecord[]>([]);
  const [yearFilter, setYearFilter] = useState(selectedYear || settings.ACADEMIC_YEAR);
  const [loading, setLoading] = useState(true);
  const [editingExtra, setEditingExtra] = useState<Partial<ExtraRecord> | null>(null);
  const [editingNote, setEditingNote] = useState<Partial<TeacherNoteRecord> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (selectedYear) setYearFilter(selectedYear);
  }, [selectedYear]);

  const studentMap = useMemo(() => new Map(students.map((s) => [s.STUDENT_ID, s.NAME])), [students]);
  const extraCategories = useMemo(
    () => parsePredicateCategories(settings.EXTRA_CATEGORIES, DEFAULT_EXTRA_CATEGORIES),
    [settings.EXTRA_CATEGORIES]
  );
  const syakhsiyahCategories = useMemo(
    () => parsePredicateCategories(settings.SYAKHSIYAH_CATEGORIES, DEFAULT_SYAKHSIYAH_CATEGORIES),
    [settings.SYAKHSIYAH_CATEGORIES]
  );
  const defaultExtraPred = extraCategories[0]?.name || 'ممتاز';
  const defaultSyakhsiyahPred = syakhsiyahCategories[0]?.name || 'ممتاز';

  const load = async () => {
    setLoading(true);
    try {
      if (mode === 'extracurricular') {
        setExtraRows(await api.listRecords<ExtraRecord>('extracurricular'));
      } else {
        setNoteRows(await api.listRecords<TeacherNoteRecord>('notes'));
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal memuat data', 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [mode]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'extracurricular' && editingExtra) {
        await api.saveRecord('extracurricular', editingExtra);
        setEditingExtra(null);
      } else if (mode === 'notes' && editingNote) {
        await api.saveRecord('notes', editingNote);
        setEditingNote(null);
      }
      onToast('Data berhasil disimpan.');
      await load();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menyimpan data', 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setBusy(true);
    try {
      await api.deleteRecord(mode, deleteId);
      onToast('Data dihapus.');
      setDeleteId(null);
      await load();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menghapus data', 'err');
    } finally {
      setBusy(false);
    }
  };

  const filteredExtraRows = useMemo(
    () =>
      !yearFilter || yearFilter === 'ALL'
        ? extraRows
        : extraRows.filter((r) => String(r.ACADEMIC_YEAR).trim() === yearFilter),
    [extraRows, yearFilter]
  );

  const filteredNoteRows = useMemo(
    () =>
      !yearFilter || yearFilter === 'ALL'
        ? noteRows
        : noteRows.filter((r) => String(r.ACADEMIC_YEAR).trim() === yearFilter),
    [noteRows, yearFilter]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-5 shadow-[0_6px_20px_rgba(6,78,59,0.06)]">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#042f24]">
            {mode === 'extracurricular' ? 'Ekstrakurikuler' : 'Catatan Guru & Kehadiran'}
          </h2>
          <p className="mt-1 text-sm text-slate-800">
            {mode === 'extracurricular'
              ? 'Catat kegiatan, predikat, dan deskripsi ekstrakurikuler (disarankan aksara Arab).'
              : 'Catat sikap, ketidakhadiran (مرض، إذن، غائب), dan pesan wali kelas.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-xs font-mono-tabular font-semibold text-slate-950 focus:border-emerald-700 focus:outline-none"
          >
            <option value="ALL">Semua Tahun</option>
            {academicYears.map((y) => (
              <option key={y.YEAR_ID} value={y.YEAR_NAME}>
                TA {y.YEAR_NAME}
              </option>
            ))}
          </select>

          {canEdit && (
            <button
              type="button"
              onClick={() => {
                const base = {
                  STUDENT_ID: students[0]?.STUDENT_ID || '',
                  SEMESTER: settings.ACTIVE_SEMESTER || '1',
                  ACADEMIC_YEAR:
                    (yearFilter !== 'ALL' ? yearFilter : selectedYear) || settings.ACADEMIC_YEAR,
                };
                if (mode === 'extracurricular') {
                  setEditingExtra({ ...base, PREDICATE: defaultExtraPred });
                } else {
                  setEditingNote({ ...base, SICK: 0, PERMISSION: 0, ABSENT: 0 });
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#064e3b] px-3.5 py-2 text-xs font-semibold text-white ring-1 ring-[#d4af37]/35 shadow-xs hover:bg-[#043b2c] whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah Data
            </button>
          )}
        </div>
      </div>

      <datalist id="extra-presets">
        {extraCategories.map((opt) => (
          <option key={opt.name} value={opt.name}>
            {opt.label ? `${opt.name} (${opt.label})` : opt.name}
          </option>
        ))}
      </datalist>

      <datalist id="syakhsiyah-modal-presets">
        {syakhsiyahCategories.map((opt) => (
          <option key={opt.name} value={opt.name}>
            {opt.label ? `${opt.name} (${opt.label})` : opt.name}
          </option>
        ))}
      </datalist>

      <div className="overflow-hidden rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 shadow-[0_6px_22px_rgba(6,78,59,0.06)]">
        <div className="overflow-x-auto max-h-[68vh]">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[#064e3b] text-xs font-semibold text-amber-50 border-b border-[#d4af37]/40">
              <tr>
                <th className="px-4 py-3 w-12">No.</th>
                <th className="px-4 py-3">Nama Murid</th>
                <th className="px-4 py-3 text-center">Sem / Tahun</th>
                {mode === 'extracurricular' ? (
                  <>
                    <th className="px-4 py-3">Kegiatan</th>
                    <th className="px-4 py-3">Predikat</th>
                    <th className="px-4 py-3">Deskripsi</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3 text-right">السلوك</th>
                    <th className="px-4 py-3 text-right">النظافة</th>
                    <th className="px-4 py-3 text-right">المواظبة</th>
                    <th className="px-4 py-3 text-center">Sakit</th>
                    <th className="px-4 py-3 text-center">Izin</th>
                    <th className="px-4 py-3 text-center">Alpa</th>
                    <th className="px-4 py-3">Catatan</th>
                  </>
                )}
                {canEdit && <th className="px-4 py-3 text-center w-28">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee5d3]">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-sm font-medium text-slate-800">
                    Memuat data...
                  </td>
                </tr>
              ) : mode === 'extracurricular' ? (
                filteredExtraRows.length ? (
                  filteredExtraRows.map((r, i) => (
                    <tr key={r.EX_ID} className="hover:bg-amber-50/45">
                      <td className="px-4 py-2.5 font-mono-tabular font-semibold text-slate-800">{i + 1}</td>
                      <td className="px-4 py-2.5 font-semibold font-arabic text-base text-slate-950">
                        {studentMap.get(r.STUDENT_ID) || r.STUDENT_ID}
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono-tabular text-xs font-medium text-slate-900">
                        {r.SEMESTER} · {r.ACADEMIC_YEAR}
                      </td>
                      <td className="px-4 py-2.5 font-arabic text-base text-slate-950">{r.ACTIVITY}</td>
                      <td className="px-4 py-2.5 font-arabic text-base text-slate-950">{r.PREDICATE}</td>
                      <td className="px-4 py-2.5 font-arabic text-base text-slate-900">{r.DESCRIPTION}</td>
                      {canEdit && (
                        <td className="px-4 py-2.5 text-center">
                          <div className="inline-flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingExtra({ ...r })}
                              className="rounded-md border border-slate-300 p-1.5 text-slate-800 hover:bg-slate-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteId(r.EX_ID)}
                              className="rounded-md border border-red-200 p-1.5 text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-sm font-medium text-slate-800">
                      Belum ada data ekstrakurikuler pada tahun ini.
                    </td>
                  </tr>
                )
              ) : filteredNoteRows.length ? (
                filteredNoteRows.map((r, i) => (
                  <tr key={r.NOTE_ID} className="hover:bg-amber-50/45">
                    <td className="px-4 py-2.5 font-mono-tabular font-semibold text-slate-800">{i + 1}</td>
                    <td className="px-4 py-2.5 font-semibold font-arabic text-base text-slate-950">
                      {studentMap.get(r.STUDENT_ID) || r.STUDENT_ID}
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono-tabular text-xs font-medium text-slate-900">
                      {r.SEMESTER} · {r.ACADEMIC_YEAR}
                    </td>
                    <td className="px-4 py-2.5 font-arabic text-base text-right text-slate-950">
                      {r.SYAKHSIYAH_SULUK || r.ATTITUDE || '-'}
                    </td>
                    <td className="px-4 py-2.5 font-arabic text-base text-right text-slate-950">
                      {r.SYAKHSIYAH_NADHAFAH || '-'}
                    </td>
                    <td className="px-4 py-2.5 font-arabic text-base text-right text-slate-950">
                      {r.SYAKHSIYAH_MUWAZHABAH || '-'}
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono-tabular font-semibold text-slate-900">{r.SICK || 0}</td>
                    <td className="px-4 py-2.5 text-center font-mono-tabular font-semibold text-slate-900">{r.PERMISSION || 0}</td>
                    <td className="px-4 py-2.5 text-center font-mono-tabular font-semibold text-slate-900">{r.ABSENT || 0}</td>
                    <td className="px-4 py-2.5 font-arabic text-base text-slate-950">{r.NOTE || '-'}</td>
                    {canEdit && (
                      <td className="px-4 py-2.5 text-center">
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingNote({ ...r })}
                            className="rounded-md border border-slate-300 p-1.5 text-slate-800 hover:bg-slate-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteId(r.NOTE_ID)}
                            className="rounded-md border border-red-200 p-1.5 text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-sm font-medium text-slate-800">
                    Belum ada catatan guru.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(editingExtra || editingNote) && (
        <Modal
          title={
            mode === 'extracurricular'
              ? editingExtra?.EX_ID
                ? 'Edit Ekstrakurikuler'
                : 'Tambah Ekstrakurikuler'
              : editingNote?.NOTE_ID
                ? 'Edit Catatan Guru'
                : 'Tambah Catatan Guru'
          }
          onClose={() => {
            setEditingExtra(null);
            setEditingNote(null);
          }}
          footer={
            <>
              <button
                type="button"
                onClick={() => {
                  setEditingExtra(null);
                  setEditingNote(null);
                }}
                className="rounded-lg border border-[#d9ceb5] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-amber-50/60"
              >
                Batal
              </button>
              <button
                type="submit"
                form="linkedForm"
                disabled={busy}
                className="rounded-lg bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white ring-1 ring-[#d4af37]/35 hover:bg-[#043b2c]"
              >
                {busy ? 'Menyimpan...' : 'Simpan'}
              </button>
            </>
          }
        >
          <form id="linkedForm" onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Murid *</label>
              <select
                required
                className={`${INPUT_CLASS} font-arabic`}
                value={(mode === 'extracurricular' ? editingExtra?.STUDENT_ID : editingNote?.STUDENT_ID) || ''}
                onChange={(e) => {
                  if (mode === 'extracurricular' && editingExtra)
                    setEditingExtra({ ...editingExtra, STUDENT_ID: e.target.value });
                  if (mode === 'notes' && editingNote)
                    setEditingNote({ ...editingNote, STUDENT_ID: e.target.value });
                }}
              >
                <option value="">Pilih Murid</option>
                {students.map((s) => (
                  <option key={s.STUDENT_ID} value={s.STUDENT_ID}>
                    {s.NAME} ({s.NIS})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Semester</label>
              <select
                className={INPUT_CLASS}
                value={(mode === 'extracurricular' ? editingExtra?.SEMESTER : editingNote?.SEMESTER) || '1'}
                onChange={(e) => {
                  if (mode === 'extracurricular' && editingExtra)
                    setEditingExtra({ ...editingExtra, SEMESTER: e.target.value });
                  if (mode === 'notes' && editingNote)
                    setEditingNote({ ...editingNote, SEMESTER: e.target.value });
                }}
              >
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tahun Pelajaran
              </label>
              <input
                className={`${INPUT_CLASS} font-mono-tabular`}
                value={
                  (mode === 'extracurricular'
                    ? editingExtra?.ACADEMIC_YEAR
                    : editingNote?.ACADEMIC_YEAR) || settings.ACADEMIC_YEAR
                }
                onChange={(e) => {
                  if (mode === 'extracurricular' && editingExtra)
                    setEditingExtra({ ...editingExtra, ACADEMIC_YEAR: e.target.value });
                  if (mode === 'notes' && editingNote)
                    setEditingNote({ ...editingNote, ACADEMIC_YEAR: e.target.value });
                }}
              />
            </div>

            {mode === 'extracurricular' && editingExtra ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kegiatan (Arab) *
                  </label>
                  <input
                    required
                    dir="rtl"
                    placeholder="Contoh: الكشافة"
                    className={`${INPUT_CLASS} text-base font-arabic`}
                    value={editingExtra.ACTIVITY || ''}
                    onChange={(e) => setEditingExtra({ ...editingExtra, ACTIVITY: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Predikat (Arab)
                  </label>
                  <input
                    dir="rtl"
                    list="extra-presets"
                    placeholder={defaultExtraPred}
                    className={`${INPUT_CLASS} text-base font-arabic`}
                    value={editingExtra.PREDICATE || ''}
                    onChange={(e) => setEditingExtra({ ...editingExtra, PREDICATE: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Deskripsi (Arab)
                  </label>
                  <textarea
                    rows={2}
                    dir="rtl"
                    placeholder="Contoh: نشيط ومتميز في الأنشطة"
                    className={`${INPUT_CLASS} text-base font-arabic`}
                    value={editingExtra.DESCRIPTION || ''}
                    onChange={(e) =>
                      setEditingExtra({ ...editingExtra, DESCRIPTION: e.target.value })
                    }
                  />
                </div>
              </>
            ) : editingNote ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:col-span-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      السلوك (Perilaku)
                    </label>
                    <input
                      dir="rtl"
                      list="syakhsiyah-modal-presets"
                      placeholder={defaultSyakhsiyahPred}
                      className={`${INPUT_CLASS} text-base font-arabic`}
                      value={editingNote.SYAKHSIYAH_SULUK ?? editingNote.ATTITUDE ?? ''}
                      onChange={(e) =>
                        setEditingNote({
                          ...editingNote,
                          SYAKHSIYAH_SULUK: e.target.value,
                          ATTITUDE: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      النظافة (Kebersihan)
                    </label>
                    <input
                      dir="rtl"
                      list="syakhsiyah-modal-presets"
                      placeholder={defaultSyakhsiyahPred}
                      className={`${INPUT_CLASS} text-base font-arabic`}
                      value={editingNote.SYAKHSIYAH_NADHAFAH || ''}
                      onChange={(e) =>
                        setEditingNote({ ...editingNote, SYAKHSIYAH_NADHAFAH: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      المواظبة (Kedisiplinan)
                    </label>
                    <input
                      dir="rtl"
                      list="syakhsiyah-modal-presets"
                      placeholder={defaultSyakhsiyahPred}
                      className={`${INPUT_CLASS} text-base font-arabic`}
                      value={editingNote.SYAKHSIYAH_MUWAZHABAH || ''}
                      onChange={(e) =>
                        setEditingNote({ ...editingNote, SYAKHSIYAH_MUWAZHABAH: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Sakit (hari)
                    </label>
                    <input
                      type="number"
                      min={0}
                      className={`${INPUT_CLASS} font-mono-tabular`}
                      value={editingNote.SICK ?? 0}
                      onChange={(e) => setEditingNote({ ...editingNote, SICK: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Izin (hari)
                    </label>
                    <input
                      type="number"
                      min={0}
                      className={`${INPUT_CLASS} font-mono-tabular`}
                      value={editingNote.PERMISSION ?? 0}
                      onChange={(e) =>
                        setEditingNote({ ...editingNote, PERMISSION: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tanpa Keterangan
                    </label>
                    <input
                      type="number"
                      min={0}
                      className={`${INPUT_CLASS} font-mono-tabular`}
                      value={editingNote.ABSENT ?? 0}
                      onChange={(e) => setEditingNote({ ...editingNote, ABSENT: e.target.value })}
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catatan Wali Kelas (Arab)
                  </label>
                  <textarea
                    rows={3}
                    dir="rtl"
                    placeholder="Contoh: حافظ على تفوقك واجتهادك"
                    className={`${INPUT_CLASS} text-base font-arabic`}
                    value={editingNote.NOTE || ''}
                    onChange={(e) => setEditingNote({ ...editingNote, NOTE: e.target.value })}
                  />
                </div>
              </>
            ) : null}
          </form>
        </Modal>
      )}

      {deleteId && (
        <ConfirmDialog
          title="Hapus Data"
          message="Apakah Anda yakin ingin menghapus entri ini?"
          confirmLabel="Hapus"
          busy={busy}
          onCancel={() => setDeleteId(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
