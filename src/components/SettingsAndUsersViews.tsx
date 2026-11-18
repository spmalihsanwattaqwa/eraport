import React, { useEffect, useState } from 'react';
import { BarChart3, Cloud, Pencil, Plus, RotateCcw, Save, School, Trash2, Upload } from 'lucide-react';
import { api } from '../api/client.ts';
import {
  SCHOOL_LEVELS,
  type AppSettings,
  type GradeCategory,
  type PredicateCategory,
  type SafeUser,
  type SchoolLevel,
  type UserRecord,
} from '../types/erapor.ts';
import {
  DEFAULT_EXTRA_CATEGORIES,
  DEFAULT_SYAKHSIYAH_CATEGORIES,
  parsePredicateCategories,
} from '../utils/arabic.ts';
import { compressSignatureToDataUrl, formatDateDDMMYYYY } from '../utils/studentUtils.ts';
import { AppsScriptSyncView } from './AppsScriptSyncView.tsx';
import { DateInputDDMMYYYY } from './DateInputDDMMYYYY.tsx';
import { ConfirmDialog, Modal } from './Modal.tsx';

const DEFAULT_GRADE_CATEGORIES: GradeCategory[] = [
  { name: 'ممتاز', min: 90, max: 100 },
  { name: 'جيد جدا', min: 80, max: 89.99 },
  { name: 'جيد', min: 70, max: 79.99 },
  { name: 'مقبول', min: 60, max: 69.99 },
  { name: 'راسب', min: 0, max: 59.99 },
];

const INPUT_CLASS =
  'w-full rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-sm text-slate-950 transition-colors focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none';

export type SettingsTabId = 'school' | 'grades' | 'drive';

/* ===================== SETTINGS VIEW ===================== */
export function SettingsView({
  user,
  activeTab: controlledTab,
  onTabChange,
  onRefresh,
  onUpdateSettings,
  onToast,
}: {
  user: SafeUser;
  activeTab?: SettingsTabId;
  onTabChange?: (tab: SettingsTabId) => void;
  onRefresh: () => Promise<void>;
  onUpdateSettings: (s: AppSettings) => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}) {
  const isAdmin = user.role === 'ADMIN';
  const [internalTab, setInternalTab] = useState<SettingsTabId>(isAdmin ? 'school' : 'drive');
  const currentTab: SettingsTabId = !isAdmin ? 'drive' : controlledTab || internalTab;

  const selectTab = (tab: SettingsTabId) => {
    if (!isAdmin && tab !== 'drive') return;
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  const [form, setForm] = useState<AppSettings | null>(null);
  const [categories, setCategories] = useState<GradeCategory[]>([]);
  const [syakhsiyahCats, setSyakhsiyahCats] = useState<PredicateCategory[]>([]);
  const [extraCats, setExtraCats] = useState<PredicateCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [sigBusy, setSigBusy] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .getSettings()
      .then((s) => {
        setForm({
          ...s,
          SCHOOL_LEVEL: s.SCHOOL_LEVEL || 'WUSTHA',
          REPORT_DATE: formatDateDDMMYYYY(s.REPORT_DATE) || s.REPORT_DATE || '',
          PTS_WEIGHT:
            s.PTS_WEIGHT !== undefined && String(s.PTS_WEIGHT).trim() !== '' ? s.PTS_WEIGHT : '30',
          PAS_WEIGHT:
            s.PAS_WEIGHT !== undefined && String(s.PAS_WEIGHT).trim() !== '' ? s.PAS_WEIGHT : '70',
          RANK_BASIS: String(s.RANK_BASIS || '').toUpperCase() === 'AVERAGE' ? 'AVERAGE' : 'TOTAL',
        });
        try {
          const parsed = JSON.parse(s.GRADE_CATEGORIES || '[]');
          setCategories(parsed.length ? parsed : DEFAULT_GRADE_CATEGORIES);
        } catch {
          setCategories(DEFAULT_GRADE_CATEGORIES);
        }
        setSyakhsiyahCats(
          parsePredicateCategories(s.SYAKHSIYAH_CATEGORIES, DEFAULT_SYAKHSIYAH_CATEGORIES)
        );
        setExtraCats(parsePredicateCategories(s.EXTRA_CATEGORIES, DEFAULT_EXTRA_CATEGORIES));
      })
      .catch((err) => onToast(err instanceof Error ? err.message : 'Gagal memuat pengaturan', 'err'));
  }, [isAdmin, onToast]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const ptsStr = String(form.PTS_WEIGHT ?? '').trim();
    const pasStr = String(form.PAS_WEIGHT ?? '').trim();
    const ptsNum = Number(ptsStr.replace(',', '.'));
    const pasNum = Number(pasStr.replace(',', '.'));
    if (
      ptsStr === '' ||
      pasStr === '' ||
      !Number.isFinite(ptsNum) ||
      !Number.isFinite(pasNum) ||
      ptsNum < 0 ||
      ptsNum > 100 ||
      pasNum < 0 ||
      pasNum > 100 ||
      Math.round((ptsNum + pasNum) * 100) !== 10000
    ) {
      onToast(
        'Prosentase nilai PTS dan PAS masing-masing harus 0–100% dengan total tepat 100%.',
        'err'
      );
      return;
    }

    const cleanedSyakhsiyah = syakhsiyahCats
      .map((c) => ({ name: c.name.trim(), label: (c.label || '').trim() }))
      .filter((c) => c.name);
    const cleanedExtra = extraCats
      .map((c) => ({ name: c.name.trim(), label: (c.label || '').trim() }))
      .filter((c) => c.name);

    setBusy(true);
    try {
      const payload = {
        ...form,
        PTS_WEIGHT: String(Math.round(ptsNum * 100) / 100),
        PAS_WEIGHT: String(Math.round(pasNum * 100) / 100),
        RANK_BASIS: String(form.RANK_BASIS || '').toUpperCase() === 'AVERAGE' ? 'AVERAGE' : 'TOTAL',
        GRADE_CATEGORIES: JSON.stringify(categories.filter((c) => c.name.trim())),
        SYAKHSIYAH_CATEGORIES: JSON.stringify(
          cleanedSyakhsiyah.length ? cleanedSyakhsiyah : DEFAULT_SYAKHSIYAH_CATEGORIES
        ),
        EXTRA_CATEGORIES: JSON.stringify(
          cleanedExtra.length ? cleanedExtra : DEFAULT_EXTRA_CATEGORIES
        ),
      };
      const updated = await api.saveSettings(payload);
      setForm({
        ...updated,
        REPORT_DATE: formatDateDDMMYYYY(updated.REPORT_DATE) || updated.REPORT_DATE || '',
        RANK_BASIS: String(updated.RANK_BASIS || '').toUpperCase() === 'AVERAGE' ? 'AVERAGE' : 'TOTAL',
      });
      setSyakhsiyahCats(
        parsePredicateCategories(updated.SYAKHSIYAH_CATEGORIES, DEFAULT_SYAKHSIYAH_CATEGORIES)
      );
      setExtraCats(parsePredicateCategories(updated.EXTRA_CATEGORIES, DEFAULT_EXTRA_CATEGORIES));
      onUpdateSettings(updated);
      onToast('Pengaturan sekolah & kategori nilai berhasil disimpan.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan', 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleWeightChange = (field: 'PTS_WEIGHT' | 'PAS_WEIGHT', raw: string) => {
    if (!form) return;
    if (raw.trim() === '') {
      setForm({ ...form, [field]: '' });
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setForm({ ...form, [field]: raw });
      return;
    }
    const clamped = Math.max(0, Math.min(100, Math.round(parsed * 100) / 100));
    const other = Math.round((100 - clamped) * 100) / 100;
    if (field === 'PTS_WEIGHT') {
      setForm({ ...form, PTS_WEIGHT: String(clamped), PAS_WEIGHT: String(other) });
    } else {
      setForm({ ...form, PAS_WEIGHT: String(clamped), PTS_WEIGHT: String(other) });
    }
  };

  const handleSheikhSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSigBusy(true);
    try {
      const dataUrl = await compressSignatureToDataUrl(file);
      setForm((prev) => (prev ? { ...prev, SHEIKH_SIGNATURE: dataUrl } : prev));
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal memproses tanda tangan.', 'err');
    } finally {
      setSigBusy(false);
    }
  };

  if (currentTab !== 'drive' && !form) {
    return <div className="py-16 text-center text-sm font-medium text-slate-800">Memuat pengaturan...</div>;
  }

  const currentLevel = form?.SCHOOL_LEVEL || 'WUSTHA';
  const hasLegacyLevel = !SCHOOL_LEVELS.includes(currentLevel as SchoolLevel);

  const tabMeta: Record<SettingsTabId, { title: string; subtitle: string }> = {
    school: {
      title: 'Pengaturan Sekolah',
      subtitle:
        'Identitas lembaga, jenjang pendidikan, pimpinan, tahun pelajaran, serta tanggal rapor.',
    },
    grades: {
      title: 'Pengaturan Nilai',
      subtitle:
        'Pengaturan prosentase nilai PTS & PAS serta kategori nilai akademik, syakhsiyah, dan ekstrakurikuler.',
    },
    drive: {
      title: 'Google Drive & Script',
      subtitle:
        'Ekspor-impor workbook 11-sheet dan kode Apps Script (Code.gs & Index.html) untuk Google Sheets/Drive.',
    },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-5 shadow-[0_6px_20px_rgba(6,78,59,0.06)]">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#042f24]">
            {tabMeta[currentTab].title}
          </h2>
          <p className="mt-1 text-sm text-slate-800">{tabMeta[currentTab].subtitle}</p>
        </div>

        <div className="inline-flex flex-wrap rounded-lg border border-[#e2d6bc] bg-[#f5efe0] p-1 gap-1 self-start lg:self-auto">
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => selectTab('school')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  currentTab === 'school'
                    ? 'bg-gradient-to-r from-[#d4af37] to-[#eab308] text-[#042f24] font-bold shadow-xs'
                    : 'text-slate-800 hover:text-[#042f24]'
                }`}
              >
                <School className="h-3.5 w-3.5" />
                Pengaturan Sekolah
              </button>
              <button
                type="button"
                onClick={() => selectTab('grades')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  currentTab === 'grades'
                    ? 'bg-gradient-to-r from-[#d4af37] to-[#eab308] text-[#042f24] font-bold shadow-xs'
                    : 'text-slate-800 hover:text-[#042f24]'
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Pengaturan Nilai
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => selectTab('drive')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              currentTab === 'drive'
                ? 'bg-gradient-to-r from-[#d4af37] to-[#eab308] text-[#042f24] font-bold shadow-xs'
                : 'text-slate-800 hover:text-[#042f24]'
            }`}
          >
            <Cloud className="h-3.5 w-3.5" />
            Google Drive &amp; Script
          </button>
        </div>
      </div>

      {currentTab === 'drive' ? (
        <AppsScriptSyncView
          embedded
          user={user}
          onRefresh={onRefresh}
          onToast={onToast}
        />
      ) : form ? (
        <form
          onSubmit={handleSave}
          className="rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-6 sm:p-8 shadow-[0_6px_22px_rgba(6,78,59,0.06)] space-y-8"
        >
          {/* Tab 1: Pengaturan Sekolah */}
          {currentTab === 'school' && (
            <section className="space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#042f24]">Identitas Pondok &amp; Pimpinan</h3>
            <p className="text-xs text-slate-800">
              Informasi ini tampil pada kop surat dan kolom tanda tangan di setiap rapor A4.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nama Sekolah (Arab untuk Kop Rapor)
              </label>
              <input
                className={`${INPUT_CLASS} text-base font-arabic`}
                value={form.SCHOOL_NAME || ''}
                onChange={(e) => setForm({ ...form, SCHOOL_NAME: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Jenjang</label>
              <select
                className={INPUT_CLASS}
                value={currentLevel}
                onChange={(e) => setForm({ ...form, SCHOOL_LEVEL: e.target.value })}
              >
                {SCHOOL_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
                {hasLegacyLevel && <option value={currentLevel}>{currentLevel}</option>}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">NPSN</label>
              <input
                className={`${INPUT_CLASS} font-mono-tabular`}
                value={form.NPSN || ''}
                onChange={(e) => setForm({ ...form, NPSN: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Alamat</label>
              <textarea
                rows={2}
                className={INPUT_CLASS}
                value={form.SCHOOL_ADDRESS || ''}
                onChange={(e) => setForm({ ...form, SCHOOL_ADDRESS: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-900 mb-1.5">
                Nama Pengasuh Pondok / شيخ المعهد (Ditampilkan di Rapor)
              </label>
              <input
                dir="rtl"
                placeholder="Contoh: كياهي الحاج ..."
                className={`${INPUT_CLASS} text-base font-arabic`}
                value={form.SHEIKH_NAME || ''}
                onChange={(e) => setForm({ ...form, SHEIKH_NAME: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-900 mb-1.5">
                Tanda Tangan Pengasuh Pondok (Ditampilkan di Rapor)
              </label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-[#d9ceb5] bg-white/80 p-3.5">
                <div className="h-20 w-52 shrink-0 rounded-lg border border-dashed border-[#c9bba0] bg-white flex items-center justify-center p-2 overflow-hidden">
                  {form.SHEIKH_SIGNATURE ? (
                    <img
                      src={form.SHEIKH_SIGNATURE}
                      alt="Tanda tangan pengasuh pondok"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs font-medium text-slate-600">
                      Belum ada tanda tangan
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#064e3b] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#043b2c]">
                      <Upload className="h-3.5 w-3.5 text-[#f3d16c]" />
                      {sigBusy
                        ? 'Memproses...'
                        : form.SHEIKH_SIGNATURE
                          ? 'Ganti Tanda Tangan'
                          : 'Upload Tanda Tangan'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={sigBusy}
                        onChange={handleSheikhSignatureUpload}
                        className="sr-only"
                      />
                    </label>
                    {form.SHEIKH_SIGNATURE && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, SHEIKH_SIGNATURE: '' })}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Hapus
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-800">
                    Unggah scan/gambar tanda tangan Pengasuh Pondok (format PNG transparan atau
                    JPG/WEBP). Jangan lupa klik Simpan Pengaturan Sekolah.
                  </p>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Kepala Sekolah / Mudir (Arab)
              </label>
              <input
                className={`${INPUT_CLASS} text-base font-arabic`}
                value={form.PRINCIPAL_NAME || ''}
                onChange={(e) => setForm({ ...form, PRINCIPAL_NAME: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                NIP Kepala Sekolah
              </label>
              <input
                className={`${INPUT_CLASS} font-mono-tabular`}
                value={form.PRINCIPAL_NIP || ''}
                onChange={(e) => setForm({ ...form, PRINCIPAL_NIP: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tahun Pelajaran
              </label>
              <input
                className={`${INPUT_CLASS} font-mono-tabular`}
                value={form.ACADEMIC_YEAR || ''}
                onChange={(e) => setForm({ ...form, ACADEMIC_YEAR: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Semester Aktif
              </label>
              <select
                className={INPUT_CLASS}
                value={form.ACTIVE_SEMESTER || '1'}
                onChange={(e) => setForm({ ...form, ACTIVE_SEMESTER: e.target.value })}
              >
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Kota / Kabupaten (Arab)
              </label>
              <input
                className={`${INPUT_CLASS} text-base font-arabic`}
                value={form.CITY || ''}
                onChange={(e) => setForm({ ...form, CITY: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-900 mb-1.5">
                Tanggal Rapor (dd/mm/yyyy)
              </label>
              <DateInputDDMMYYYY
                outputFormat="dmy"
                className={INPUT_CLASS}
                value={form.REPORT_DATE || ''}
                onChange={(val) => setForm({ ...form, REPORT_DATE: val })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                ID File Logo Google Drive (opsional, untuk ekspor Apps Script)
              </label>
              <input
                className={`${INPUT_CLASS} font-mono-tabular`}
                value={form.LOGO_FILE_ID || ''}
                onChange={(e) => setForm({ ...form, LOGO_FILE_ID: e.target.value })}
              />
            </div>
          </div>
        </section>
          )}

          {/* Tab 2: Pengaturan Nilai */}
          {currentTab === 'grades' && (
            <>
              {/* Section 2: Bobot Nilai PTS & PAS */}
              <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#042f24]">
                Pengaturan Prosentase Nilai PTS &amp; PAS
              </h3>
              <p className="text-xs text-slate-800">
                Default <span className="font-mono-tabular font-semibold">30% : 70%</span> (total
                harus 100%). Jika nilai PTS kosong, nilai PAS otomatis dihitung{' '}
                <span className="font-semibold text-slate-950">100%</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setForm({ ...form, PTS_WEIGHT: '30', PAS_WEIGHT: '70' })}
              className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-lg border border-[#d9ceb5] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-amber-50/60 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Default (30:70)
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Prosentase Nilai PTS (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                required
                value={form.PTS_WEIGHT ?? '30'}
                onChange={(e) => handleWeightChange('PTS_WEIGHT', e.target.value)}
                className={`${INPUT_CLASS} font-mono-tabular font-semibold`}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-900 mb-1.5">
                Prosentase Nilai PAS (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                required
                value={form.PAS_WEIGHT ?? '70'}
                onChange={(e) => handleWeightChange('PAS_WEIGHT', e.target.value)}
                className={`${INPUT_CLASS} font-mono-tabular font-semibold`}
              />
            </div>
          </div>
        </section>

        {/* Section 2B: Cara Pembuatan Ranking Kelas */}
        <section className="border-t border-[#e6dcc6] pt-7 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#042f24]">Cara Pembuatan Ranking Kelas</h3>
            <p className="text-xs text-slate-800">
              Pilih dasar perhitungan peringkat siswa di menu Rekapitulasi Nilai dan Rapor.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${
                (form.RANK_BASIS || 'TOTAL') === 'AVERAGE'
                  ? 'border-emerald-700 bg-emerald-50/70 ring-2 ring-emerald-700/15'
                  : 'border-[#d9ceb5] bg-white hover:bg-amber-50/40'
              }`}
            >
              <input
                type="radio"
                name="rankBasis"
                value="AVERAGE"
                checked={(form.RANK_BASIS || 'TOTAL') === 'AVERAGE'}
                onChange={() => setForm({ ...form, RANK_BASIS: 'AVERAGE' })}
                className="mt-1 h-4 w-4 accent-[#064e3b]"
              />
              <div>
                <div className="text-sm font-bold text-slate-950">
                  Berdasarkan Rata-rata Nilai
                </div>
                <div className="mt-0.5 text-xs text-slate-800">
                  Peringkat kelas diurutkan dari nilai rata-rata mata pelajaran tertinggi ke terendah.
                </div>
              </div>
            </label>

            <label
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${
                (form.RANK_BASIS || 'TOTAL') !== 'AVERAGE'
                  ? 'border-emerald-700 bg-emerald-50/70 ring-2 ring-emerald-700/15'
                  : 'border-[#d9ceb5] bg-white hover:bg-amber-50/40'
              }`}
            >
              <input
                type="radio"
                name="rankBasis"
                value="TOTAL"
                checked={(form.RANK_BASIS || 'TOTAL') !== 'AVERAGE'}
                onChange={() => setForm({ ...form, RANK_BASIS: 'TOTAL' })}
                className="mt-1 h-4 w-4 accent-[#064e3b]"
              />
              <div>
                <div className="text-sm font-bold text-slate-950">
                  Berdasarkan Total Nilai
                </div>
                <div className="mt-0.5 text-xs text-slate-800">
                  Peringkat kelas diurutkan dari jumlah total nilai seluruh mata pelajaran tertinggi ke terendah.
                </div>
              </div>
            </label>
          </div>
        </section>

        {/* Section 3: Kategori Nilai Akademik */}
        <section className="border-t border-[#e6dcc6] pt-7 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#042f24]">
                Kategori Nilai Akademik (Bahasa Arab)
              </h3>
              <p className="text-xs text-slate-800">
                Tentukan rentang batas bawah dan atas. Pada Semester 2, kategori{' '}
                <span className="font-arabic font-bold text-slate-950">راسب</span> otomatis
                menghasilkan keterangan Tidak Naik Kelas.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCategories([...categories, { name: '', min: 0, max: 100 }])}
              className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-lg border border-[#d9ceb5] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-amber-50/60 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah Kategori
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[#e6dcc6] bg-white/80">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#064e3b] text-xs font-semibold text-amber-50 border-b border-[#d4af37]/40">
                <tr>
                  <th className="px-4 py-2.5">Nama Kategori (Contoh: ممتاز)</th>
                  <th className="px-4 py-2.5 text-center w-36">Batas Bawah</th>
                  <th className="px-4 py-2.5 text-center w-36">Batas Atas</th>
                  <th className="px-4 py-2.5 text-center w-20">Hapus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee5d3]">
                {categories.map((c, idx) => (
                  <tr key={idx} className="hover:bg-amber-50/45">
                    <td className="px-3 py-2">
                      <input
                        required
                        dir="rtl"
                        value={c.name}
                        onChange={(e) => {
                          const next = [...categories];
                          next[idx] = { ...c, name: e.target.value };
                          setCategories(next);
                        }}
                        className="w-full rounded-md border border-slate-300/90 px-3 py-1.5 text-base font-arabic focus:border-emerald-700 focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number"
                        step={0.01}
                        required
                        value={c.min}
                        onChange={(e) => {
                          const next = [...categories];
                          next[idx] = { ...c, min: Number(e.target.value) };
                          setCategories(next);
                        }}
                        className="w-24 rounded-md border border-slate-300/90 px-2 py-1.5 text-center text-sm font-mono-tabular focus:border-emerald-700 focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number"
                        step={0.01}
                        required
                        value={c.max}
                        onChange={(e) => {
                          const next = [...categories];
                          next[idx] = { ...c, max: Number(e.target.value) };
                          setCategories(next);
                        }}
                        className="w-24 rounded-md border border-slate-300/90 px-2 py-1.5 text-center text-sm font-mono-tabular focus:border-emerald-700 focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => setCategories(categories.filter((_, i) => i !== idx))}
                        className="rounded-md border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 4 & 5: Kategori Nilai Syakhsiyah & Ekstrakurikuler */}
        <section className="border-t border-[#e6dcc6] pt-7 grid grid-cols-1 lg:grid-cols-2 gap-7">
          {/* Kategori Nilai Syakhsiyah */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#042f24]">Kategori Nilai Syakhsiyah</h3>
                <p className="text-xs text-slate-800">
                  Preset predikat untuk السلوك، النظافة، المواظبة di menu Penilaian &amp; Catatan Guru.
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setSyakhsiyahCats(DEFAULT_SYAKHSIYAH_CATEGORIES.map((x) => ({ ...x })))
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-[#d9ceb5] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-amber-50/60 whitespace-nowrap"
                >
                  <RotateCcw className="h-3 w-3" />
                  Default
                </button>
                <button
                  type="button"
                  onClick={() => setSyakhsiyahCats([...syakhsiyahCats, { name: '', label: '' }])}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#d9ceb5] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-amber-50/60 whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tambah
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[#e6dcc6] bg-white/80">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#064e3b] text-xs font-semibold text-amber-50 border-b border-[#d4af37]/40">
                  <tr>
                    <th className="px-3 py-2.5">Predikat Arab</th>
                    <th className="px-3 py-2.5">Keterangan</th>
                    <th className="px-3 py-2.5 text-center w-14">Hapus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eee5d3]">
                  {syakhsiyahCats.map((c, idx) => (
                    <tr key={idx} className="hover:bg-amber-50/45">
                      <td className="px-2.5 py-2">
                        <input
                          required
                          dir="rtl"
                          placeholder="ممتاز"
                          value={c.name}
                          onChange={(e) => {
                            const next = [...syakhsiyahCats];
                            next[idx] = { ...c, name: e.target.value };
                            setSyakhsiyahCats(next);
                          }}
                          className="w-full rounded-md border border-slate-300/90 px-2.5 py-1.5 text-base font-arabic focus:border-emerald-700 focus:outline-none"
                        />
                      </td>
                      <td className="px-2.5 py-2">
                        <input
                          placeholder="Sangat Baik"
                          value={c.label || ''}
                          onChange={(e) => {
                            const next = [...syakhsiyahCats];
                            next[idx] = { ...c, label: e.target.value };
                            setSyakhsiyahCats(next);
                          }}
                          className="w-full rounded-md border border-slate-300/90 px-2.5 py-1.5 text-xs text-slate-700 focus:border-emerald-700 focus:outline-none"
                        />
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setSyakhsiyahCats(syakhsiyahCats.filter((_, i) => i !== idx))
                          }
                          className="rounded-md border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Kategori Nilai Ekstrakurikuler */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#042f24]">
                  Kategori Nilai Ekstrakurikuler
                </h3>
                <p className="text-xs text-slate-800">
                  Preset predikat untuk penilaian kegiatan ekstrakurikuler (الأنشطة الإضافية).
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setExtraCats(DEFAULT_EXTRA_CATEGORIES.map((x) => ({ ...x })))}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#d9ceb5] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-amber-50/60 whitespace-nowrap"
                >
                  <RotateCcw className="h-3 w-3" />
                  Default
                </button>
                <button
                  type="button"
                  onClick={() => setExtraCats([...extraCats, { name: '', label: '' }])}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#d9ceb5] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-amber-50/60 whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tambah
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[#e6dcc6] bg-white/80">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#064e3b] text-xs font-semibold text-amber-50 border-b border-[#d4af37]/40">
                  <tr>
                    <th className="px-3 py-2.5">Predikat Arab</th>
                    <th className="px-3 py-2.5">Keterangan</th>
                    <th className="px-3 py-2.5 text-center w-14">Hapus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eee5d3]">
                  {extraCats.map((c, idx) => (
                    <tr key={idx} className="hover:bg-amber-50/45">
                      <td className="px-2.5 py-2">
                        <input
                          required
                          dir="rtl"
                          placeholder="ممتاز"
                          value={c.name}
                          onChange={(e) => {
                            const next = [...extraCats];
                            next[idx] = { ...c, name: e.target.value };
                            setExtraCats(next);
                          }}
                          className="w-full rounded-md border border-[#d9ceb5] px-2.5 py-1.5 text-base font-arabic focus:border-emerald-700 focus:outline-none"
                        />
                      </td>
                      <td className="px-2.5 py-2">
                        <input
                          placeholder="Sangat Baik"
                          value={c.label || ''}
                          onChange={(e) => {
                            const next = [...extraCats];
                            next[idx] = { ...c, label: e.target.value };
                            setExtraCats(next);
                          }}
                          className="w-full rounded-md border border-[#d9ceb5] px-2.5 py-1.5 text-xs text-slate-700 focus:border-emerald-700 focus:outline-none"
                        />
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => setExtraCats(extraCats.filter((_, i) => i !== idx))}
                          className="rounded-md border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
            </>
          )}

          <div className="border-t border-[#e6dcc6] pt-5 flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#c89b2b] to-[#dfb547] px-5 py-2.5 text-sm font-bold text-[#042f24] shadow-xs transition-all hover:brightness-95 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Save className="h-4 w-4" />
              {busy
                ? 'Menyimpan...'
                : currentTab === 'grades'
                  ? 'Simpan Pengaturan Nilai'
                  : 'Simpan Pengaturan Sekolah'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/* ===================== USERS VIEW ===================== */
export function UsersView({
  settings,
  onToast,
}: {
  settings: AppSettings;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<UserRecord> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await api.listUsers());
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal memuat pengguna', 'err');
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
    setBusy(true);
    try {
      await api.saveUser(editing);
      onToast('Pengguna tersimpan.');
      setEditing(null);
      await load();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menyimpan pengguna', 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.deleteUser(deleteTarget.USER_ID);
      onToast('Pengguna dihapus.');
      setDeleteTarget(null);
      await load();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menghapus pengguna', 'err');
    } finally {
      setBusy(false);
    }
  };

  const defaultLevel = SCHOOL_LEVELS.includes(settings.SCHOOL_LEVEL as SchoolLevel)
    ? settings.SCHOOL_LEVEL
    : 'WUSTHA';

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-5 shadow-[0_6px_20px_rgba(6,78,59,0.06)]">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#042f24]">
            Pengguna &amp; Hak Akses
          </h2>
          <p className="mt-1 text-sm text-slate-800">
            Kelola akun Admin, Wali Kelas, Guru Mata Pelajaran, dan Kepala Sekolah.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            setEditing({
              ROLE: 'GURU',
              SCHOOL_LEVEL: defaultLevel,
              ACTIVE: 'YA',
            })
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#064e3b] px-3.5 py-2 text-xs font-semibold text-white ring-1 ring-[#d4af37]/35 shadow-xs hover:bg-[#043b2c] whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          Tambah Pengguna
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 shadow-[0_6px_22px_rgba(6,78,59,0.06)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#064e3b] text-xs font-semibold text-amber-50 border-b border-[#d4af37]/40">
              <tr>
                <th className="px-4 py-3 w-12">No.</th>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center w-28">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee5d3]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm font-medium text-slate-800">
                    Memuat pengguna...
                  </td>
                </tr>
              ) : (
                users.map((u, i) => (
                  <tr key={u.USER_ID} className="hover:bg-amber-50/45">
                    <td className="px-4 py-2.5 font-mono-tabular font-semibold text-slate-800">{i + 1}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-950">{u.NAME}</td>
                    <td className="px-4 py-2.5 font-mono-tabular font-medium text-slate-900">{u.USERNAME}</td>
                    <td className="px-4 py-2.5 text-slate-800">{u.EMAIL || '-'}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-slate-950">{u.ROLE}</td>
                    <td className="px-4 py-2.5 text-xs font-bold">
                      <span className={u.ACTIVE === 'YA' ? 'text-emerald-900' : 'text-red-700'}>
                        {u.ACTIVE}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="inline-flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditing({ ...u, PASSWORD: '' })}
                          className="rounded-md border border-slate-300 p-1.5 text-slate-800 hover:bg-slate-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(u)}
                          className="rounded-md border border-red-200 p-1.5 text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal
          title={editing.USER_ID ? 'Edit Pengguna' : 'Tambah Pengguna'}
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
                form="userForm"
                disabled={busy}
                className="rounded-lg bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white ring-1 ring-[#d4af37]/35 hover:bg-[#043b2c]"
              >
                {busy ? 'Menyimpan...' : 'Simpan'}
              </button>
            </>
          }
        >
          <form id="userForm" onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama *</label>
              <input
                required
                className={INPUT_CLASS}
                value={editing.NAME || ''}
                onChange={(e) => setEditing({ ...editing, NAME: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Username *</label>
              <input
                required
                className={`${INPUT_CLASS} font-mono-tabular`}
                value={editing.USERNAME || ''}
                onChange={(e) => setEditing({ ...editing, USERNAME: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                className={INPUT_CLASS}
                value={editing.EMAIL || ''}
                onChange={(e) => setEditing({ ...editing, EMAIL: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password {editing.USER_ID ? '(kosongkan jika tidak diubah)' : '*'}
              </label>
              <input
                type="password"
                minLength={6}
                required={!editing.USER_ID}
                className={INPUT_CLASS}
                value={editing.PASSWORD || ''}
                onChange={(e) => setEditing({ ...editing, PASSWORD: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
              <select
                className={INPUT_CLASS}
                value={editing.ROLE || 'GURU'}
                onChange={(e) =>
                  setEditing({ ...editing, ROLE: e.target.value as UserRecord['ROLE'] })
                }
              >
                <option value="ADMIN">ADMIN</option>
                <option value="WALI_KELAS">WALI_KELAS</option>
                <option value="GURU">GURU</option>
                <option value="KEPALA_SEKOLAH">KEPALA_SEKOLAH</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Jenjang</label>
              <select
                className={INPUT_CLASS}
                value={editing.SCHOOL_LEVEL || defaultLevel}
                onChange={(e) => setEditing({ ...editing, SCHOOL_LEVEL: e.target.value })}
              >
                {SCHOOL_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
                {editing.SCHOOL_LEVEL &&
                  !SCHOOL_LEVELS.includes(editing.SCHOOL_LEVEL as SchoolLevel) && (
                    <option value={editing.SCHOOL_LEVEL}>{editing.SCHOOL_LEVEL}</option>
                  )}
              </select>
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
          title="Hapus Pengguna"
          message={`Yakin ingin menghapus akun "${deleteTarget.USERNAME}"?`}
          confirmLabel="Hapus Akun"
          busy={busy}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
