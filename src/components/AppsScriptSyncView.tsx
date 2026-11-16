import React, { useState } from 'react';
import { Check, Copy, Download, FileCode2, FileSpreadsheet, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../api/client.ts';
import { FIXED_CODE_GS } from '../apps-script/fixedCodeGs.ts';
import { FIXED_INDEX_HTML } from '../apps-script/fixedIndexHtml.ts';
import type { SafeUser } from '../types/erapor.ts';

interface AppsScriptSyncViewProps {
  user: SafeUser;
  onRefresh: () => Promise<void>;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
  embedded?: boolean;
}

const FIXES_SUMMARY = [
  {
    title: 'Fix Kritis toArabicDigits_() & numberToArabicWords_()',
    detail:
      'Kode sebelumnya memanggil cleanScoreValue_() yang menolak nilai > 100 dan string non-angka sehingga Tahun Pelajaran, Kelas, NIS/NISN, Tanggal Rapor, dan Total Nilai > 100 hilang menjadi string kosong di rapor Google Docs. Kini seluruh angka dan Terbilang > 100 terkonversi sempurna.',
  },
  {
    title: 'Optimasi Performa Google Sheets (10x-20x Lebih Cepat)',
    detail:
      'Menambahkan request-scoped Spreadsheet cache (_ssCache_), batchAppendObjects_(), batchUpsertObjects_(), serta O(1) Map lookup di getDashboard, getScoreGrid, computeClassRecapData_, dan getReportStudents sehingga tidak lagi membuka file Spreadsheet berulang-ulang di dalam loop.',
  },
  {
    title: 'Batch Report Generator & Dukungan Logo Drive',
    detail:
      'Menambahkan generateReportsBatch() yang menghitung rekapitulasi kelas hanya 1x untuk seluruh siswa terpilih, menyisipkan logo sekolah dari LOGO_FILE_ID, serta memperbaiki resetSelectedReports() di Index.html agar tabel otomatis refresh setelah reset.',
  },
  {
    title: "Multi-Jenjang WUSTHA / ULYA / 'ALY & Kategori Fleksibel",
    detail:
      "Mendukung jenjang pendidikan WUSTHA, ULYA, dan 'ALY, bobot PTS/PAS fleksibel, kategori nilai Syakhsiyah & Ekstrakurikuler, serta Copy-Paste multi-kolom langsung dari Excel di menu Penilaian.",
  },
];

export function AppsScriptSyncView({
  user,
  onRefresh,
  onToast,
  embedded = false,
}: AppsScriptSyncViewProps) {
  const [activeTab, setActiveTab] = useState<'code' | 'html'>('code');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const currentSource = activeTab === 'code' ? FIXED_CODE_GS : FIXED_INDEX_HTML;
  const currentFilename = activeTab === 'code' ? 'Code.gs' : 'Index.html';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(currentSource);
    setCopied(true);
    onToast(`${currentFilename} berhasil disalin ke clipboard.`);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportWorkbook = async () => {
    setBusy(true);
    try {
      const sheets = await api.exportDatabase();
      const wb = XLSX.utils.book_new();
      Object.entries(sheets).forEach(([sheetName, rows]) => {
        const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
        XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
      });
      XLSX.writeFile(wb, 'Database_eRapor_V2_GoogleSheets.xlsx');
      onToast('Workbook 11-sheet siap diunggah ke Google Drive / Google Sheets.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal ekspor database', 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleImportWorkbook = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
      const payload: Record<string, Record<string, unknown>[]> = {};
      wb.SheetNames.forEach((name) => {
        payload[name] = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name]);
      });
      await api.importDatabase(payload);
      await onRefresh();
      onToast('Database berhasil disinkronkan dari file Workbook.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal impor workbook', 'err');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-5 shadow-[0_6px_20px_rgba(6,78,59,0.06)]">
        <div>
          {embedded ? (
            <h3 className="text-base font-bold tracking-tight text-[#042f24]">
              Google Drive, Google Sheets &amp; Kode Apps Script
            </h3>
          ) : (
            <h2 className="text-2xl font-bold tracking-tight text-[#042f24]">
              Kode Apps Script Diperbaiki &amp; Sinkronisasi Google Sheets
            </h2>
          )}
          <p className={`mt-1 ${embedded ? 'text-xs' : 'text-sm'} text-slate-600`}>
            Salin atau unduh versi perbaikan <b>Code.gs</b> &amp; <b>Index.html</b> untuk 100%
            Google Drive / Sheets / Docs Apps Script, serta ekspor-impor workbook 11-sheet.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={handleExportWorkbook}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#064e3b] px-3.5 py-2 text-xs font-semibold text-white ring-1 ring-[#d4af37]/35 shadow-xs hover:bg-[#043b2c] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-amber-300" />
            Export Database (.xlsx)
          </button>
          {user.role === 'ADMIN' && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#d9ceb5] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-amber-50/60 whitespace-nowrap shrink-0">
              <Upload className="h-3.5 w-3.5" />
              Import Database (.xlsx)
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                disabled={busy}
                onChange={handleImportWorkbook}
              />
            </label>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FIXES_SUMMARY.map((item) => (
          <div
            key={item.title}
            className="rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-5 shadow-[0_4px_16px_rgba(6,78,59,0.05)]"
          >
            <h3 className="text-sm font-bold text-[#042f24]">{item.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{item.detail}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 shadow-[0_6px_22px_rgba(6,78,59,0.06)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#e6dcc6] bg-[#f7f1e3]/75 px-4 py-3">
          <div className="flex items-center gap-1 rounded-lg border border-[#d9ceb5] bg-white p-1 w-fit">
            <button
              type="button"
              onClick={() => setActiveTab('code')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'code'
                  ? 'bg-gradient-to-r from-[#d4af37] to-[#eab308] text-[#042f24] font-bold shadow-xs'
                  : 'text-slate-600 hover:text-[#042f24]'
              }`}
            >
              <FileCode2 className="h-3.5 w-3.5" />
              Code.gs (Backend Apps Script)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('html')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'html'
                  ? 'bg-gradient-to-r from-[#d4af37] to-[#eab308] text-[#042f24] font-bold shadow-xs'
                  : 'text-slate-600 hover:text-[#042f24]'
              }`}
            >
              <FileCode2 className="h-3.5 w-3.5" />
              Index.html (Frontend Apps Script)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9ceb5] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-amber-50/60 whitespace-nowrap"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Tersalin' : `Salin ${currentFilename}`}
            </button>
            <button
              type="button"
              onClick={() => handleDownloadFile(currentFilename, currentSource)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#064e3b] px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-[#d4af37]/35 hover:bg-[#043b2c] whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5 text-amber-300" />
              Unduh {currentFilename}
            </button>
          </div>
        </div>

        <pre className="max-h-[55vh] overflow-auto bg-[#04241b] p-4 text-xs leading-relaxed text-amber-50/90 font-mono-tabular">
          <code>{currentSource}</code>
        </pre>
      </div>
    </div>
  );
}
