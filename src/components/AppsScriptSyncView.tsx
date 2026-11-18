import React, { useEffect, useState } from 'react';
import {
  Check,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileSpreadsheet,
  Link2,
  RefreshCw,
  Unlink,
  Upload,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api, type WebhookSyncStatus } from '../api/client.ts';
import { FIXED_CODE_GS } from '../apps-script/fixedCodeGs.ts';
import { FIXED_INDEX_HTML } from '../apps-script/fixedIndexHtml.ts';
import { SYNC_WEBHOOK_GS } from '../apps-script/syncWebhookGs.ts';
import type { AppSettings, SafeUser } from '../types/erapor.ts';
import { parseCleanSheetRows, readCleanExcelWorkbook } from '../utils/excelReader.ts';
import { ConfirmDialog } from './Modal.tsx';

interface AppsScriptSyncViewProps {
  user: SafeUser;
  settings?: AppSettings | null;
  onRefresh: () => Promise<void>;
  onUpdateSettings?: (s: AppSettings) => void | Promise<void>;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
  embedded?: boolean;
}

type PendingAction =
  | { kind: 'push_sheet'; title: string }
  | { kind: 'pull_sheet'; title: string }
  | { kind: 'unlink_sheet'; title: string }
  | null;

const FIXES_SUMMARY = [
  {
    title: 'Sinkronisasi Otomatis Gratis Tanpa Billing',
    detail:
      'Menghubungkan aplikasi web ini langsung ke Google Spreadsheet Anda melalui URL Web App Google Apps Script (SyncWebhook.gs) — 100% gratis tanpa Google Cloud Billing atau login OAuth.',
  },
  {
    title: 'Auto-Sync Otomatis dari Server Aplikasi',
    detail:
      'Saat Auto-Sync aktif, setiap perubahan siswa, kelas, nilai, absensi, dan rapor yang disimpan oleh Admin, Wali Kelas, maupun Guru langsung dikirim otomatis ke 13 tab Google Sheets.',
  },
  {
    title: 'Fix Kritis toArabicDigits_() & numberToArabicWords_()',
    detail:
      'Tahun Pelajaran, Kelas, NIS/NISN, Tanggal Rapor, dan Total Nilai > 100 terkonversi sempurna di Google Docs/Sheets tanpa menghapus digit maupun teks Arab.',
  },
  {
    title: "Multi-Jenjang WUSTHA / ULYA / 'ALY & Workbook 13-Sheet",
    detail:
      "Mendukung multi-jenjang WUSTHA, ULYA, dan 'ALY, bobot PTS/PAS fleksibel, kategori nilai Syakhsiyah & Ekstrakurikuler, serta ekspor-impor workbook Excel.",
  },
];

export function AppsScriptSyncView({
  user,
  settings,
  onRefresh,
  onUpdateSettings,
  onToast,
  embedded = false,
}: AppsScriptSyncViewProps) {
  const isAdmin = user.role === 'ADMIN';
  const [activeTab, setActiveTab] = useState<'webhook' | 'code' | 'html'>('webhook');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState<WebhookSyncStatus | null>(null);
  const [localSettings, setLocalSettings] = useState<AppSettings | null>(settings || null);
  const [webhookInput, setWebhookInput] = useState<string>(
    settings?.APPS_SCRIPT_WEBHOOK_URL || ''
  );
  const [syncKeyInput, setSyncKeyInput] = useState<string>(
    settings?.APPS_SCRIPT_SYNC_KEY || ''
  );
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const loadSyncStatus = async () => {
    try {
      const st = await api.getSyncStatus();
      setSyncStatus(st);
      if (st.webhookUrl && !webhookInput) {
        setWebhookInput(st.webhookUrl);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadSyncStatus();
  }, []);

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
      if (settings.APPS_SCRIPT_WEBHOOK_URL !== undefined) {
        setWebhookInput(settings.APPS_SCRIPT_WEBHOOK_URL);
      }
      if (settings.APPS_SCRIPT_SYNC_KEY !== undefined) {
        setSyncKeyInput(settings.APPS_SCRIPT_SYNC_KEY);
      }
    } else {
      api
        .getSettings()
        .then((s) => {
          setLocalSettings(s);
          if (s.APPS_SCRIPT_WEBHOOK_URL) setWebhookInput(s.APPS_SCRIPT_WEBHOOK_URL);
          if (s.APPS_SCRIPT_SYNC_KEY) setSyncKeyInput(s.APPS_SCRIPT_SYNC_KEY);
        })
        .catch(() => undefined);
    }
  }, [settings]);

  const activeSettings = localSettings || settings || null;
  const linkedWebhookUrl =
    syncStatus?.webhookUrl || activeSettings?.APPS_SCRIPT_WEBHOOK_URL || '';
  const linkedSheetName =
    syncStatus?.sheetName || activeSettings?.GOOGLE_SHEET_NAME || 'Google Spreadsheet';
  const linkedSheetUrl = syncStatus?.sheetUrl || activeSettings?.GOOGLE_SHEET_URL || '';
  const autoSyncEnabled =
    syncStatus?.autoSync ?? activeSettings?.GOOGLE_AUTO_SYNC === 'YA';
  const lastSyncTime = syncStatus?.lastSync || activeSettings?.GOOGLE_LAST_SYNC || '';
  const lastSyncError = syncStatus?.lastError || activeSettings?.GOOGLE_LAST_SYNC_ERROR || '';

  const currentSource =
    activeTab === 'webhook'
      ? SYNC_WEBHOOK_GS
      : activeTab === 'code'
      ? FIXED_CODE_GS
      : FIXED_INDEX_HTML;
  const currentFilename =
    activeTab === 'webhook'
      ? 'SyncWebhook.gs'
      : activeTab === 'code'
      ? 'Code.gs'
      : 'Index.html';

  const handleTestAndSaveWebhook = async () => {
    if (!webhookInput.trim()) {
      onToast('Tempel URL Web App Google Apps Script terlebih dahulu.', 'err');
      return;
    }
    setBusy(true);
    try {
      const res = await api.testWebhookSync(webhookInput.trim(), syncKeyInput.trim());
      setLocalSettings(res.settings);
      await loadSyncStatus();
      if (onUpdateSettings) {
        await onUpdateSettings(res.settings);
      } else {
        await onRefresh();
      }
      onToast(`Berhasil terhubung ke Google Spreadsheet "${res.sheetName}".`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menghubungkan ke Apps Script.', 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleAutoSync = async () => {
    if (!isAdmin) return;
    if (!linkedWebhookUrl) {
      onToast('Hubungkan URL Web App Apps Script terlebih dahulu.', 'err');
      return;
    }
    const nextEnabled = !autoSyncEnabled;
    setBusy(true);
    try {
      const updated = await api.saveSettings({
        GOOGLE_AUTO_SYNC: nextEnabled ? 'YA' : 'TIDAK',
      });
      setLocalSettings(updated);
      if (nextEnabled) {
        const pushRes = await api.pushWebhookSync();
        onToast(
          `Auto-Sync aktif! ${pushRes.syncedSheets} sheet (${pushRes.totalRows} baris) tersinkron ke "${pushRes.sheetName}".`
        );
      } else {
        onToast('Sinkronisasi otomatis ke Google Sheets dimatikan.');
      }
      await loadSyncStatus();
      if (onUpdateSettings) {
        await onUpdateSettings(updated);
      } else {
        await onRefresh();
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal mengubah status Auto-Sync.', 'err');
    } finally {
      setBusy(false);
    }
  };

  const executePendingAction = async () => {
    if (!pendingAction) return;
    const action = pendingAction;
    setBusy(true);
    try {
      if (action.kind === 'unlink_sheet') {
        const updated = await api.saveSettings({
          APPS_SCRIPT_WEBHOOK_URL: '',
          APPS_SCRIPT_SYNC_KEY: '',
          GOOGLE_SHEET_NAME: '',
          GOOGLE_SHEET_URL: '',
          GOOGLE_AUTO_SYNC: 'TIDAK',
          GOOGLE_LAST_SYNC: '',
          GOOGLE_LAST_SYNC_ERROR: '',
        });
        setWebhookInput('');
        setSyncKeyInput('');
        setLocalSettings(updated);
        await loadSyncStatus();
        if (onUpdateSettings) {
          await onUpdateSettings(updated);
        } else {
          await onRefresh();
        }
        setPendingAction(null);
        onToast('Tautan Google Spreadsheet telah dilepas.');
      } else if (action.kind === 'push_sheet') {
        const pushRes = await api.pushWebhookSync();
        await loadSyncStatus();
        await onRefresh();
        setPendingAction(null);
        onToast(
          `Berhasil menyinkronkan ${pushRes.syncedSheets} sheet (${pushRes.totalRows} baris) ke "${pushRes.sheetName}".`
        );
      } else if (action.kind === 'pull_sheet') {
        const pullRes = await api.pullWebhookSync();
        await loadSyncStatus();
        await onRefresh();
        setPendingAction(null);
        onToast(`Database aplikasi berhasil diperbarui dari "${pullRes.sheetName}".`);
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Operasi sinkronisasi gagal.', 'err');
    } finally {
      setBusy(false);
    }
  };

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
      onToast('Workbook database siap diunggah ke Google Drive / Google Sheets.');
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
      const wb = readCleanExcelWorkbook(buf);
      const payload: Record<string, Record<string, unknown>[]> = {};
      wb.SheetNames.forEach((name) => {
        payload[name] = parseCleanSheetRows(wb.Sheets[name]);
      });
      await api.importDatabase(payload);
      await onRefresh();
      onToast('Database berhasil disinkronkan dari file Workbook dengan format dan font standar aplikasi.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal impor workbook', 'err');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const confirmDialogConfig = (() => {
    if (!pendingAction) return null;
    switch (pendingAction.kind) {
      case 'push_sheet':
        return {
          title: 'Sinkronkan ke Google Sheets Sekarang',
          message: `Kirim dan perbarui seluruh 13 sheet pada Google Spreadsheet "${pendingAction.title}" dengan data terbaru dari aplikasi ini?`,
          confirmLabel: 'Ya, Sinkronkan Sekarang',
          variant: 'primary' as const,
        };
      case 'pull_sheet':
        return {
          title: 'Tarik Data dari Google Sheets',
          message: `Impor dan timpa database aplikasi menggunakan data dari Google Spreadsheet "${pendingAction.title}"?`,
          confirmLabel: 'Ya, Impor ke Aplikasi',
          variant: 'danger' as const,
        };
      case 'unlink_sheet':
        return {
          title: 'Lepas Tautan Google Spreadsheet',
          message: `Lepas URL Web App Google Spreadsheet "${pendingAction.title}" dari aplikasi? File Google Sheets Anda tidak terhapus.`,
          confirmLabel: 'Lepas Tautan',
          variant: 'danger' as const,
        };
    }
  })();

  return (
    <div className="space-y-6">
      {/* Zero-Billing Webhook Google Sheets Sync Panel */}
      <div className="rounded-xl border border-[#d4af37]/45 bg-[#fdfaf3]/95 p-5 sm:p-6 shadow-[0_6px_22px_rgba(6,78,59,0.08)] space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-[#e6dcc6] pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-900">
              <Cloud className="h-4 w-4 text-[#b48a18]" />
              Sinkronisasi Gratis ke Google Sheets (Tanpa Billing)
            </div>
            <h3 className="text-lg font-bold tracking-tight text-[#042f24]">
              Hubungkan Web App Ini ke Google Spreadsheet Anda
            </h3>
            <p className="text-xs text-slate-800 max-w-3xl">
              Cukup tempelkan skrip <b>SyncWebhook.gs</b> ke dalam menu <b>Ekstensi → Apps Script</b>{' '}
              di Google Spreadsheet Anda lalu Deploy sebagai Web App (<i>Gratis selamanya tanpa
              Google Cloud Billing</i>).
            </p>
          </div>
          {linkedWebhookUrl ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-950 self-start lg:self-auto">
              <Check className="h-3.5 w-3.5" />
              Terhubung ke Sheets
            </span>
          ) : (
            <span className="inline-flex items-center rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-950 self-start lg:self-auto">
              Belum Terhubung
            </span>
          )}
        </div>

        {/* 4-Step Mini Guide */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          <div className="rounded-lg border border-[#e6dcc6] bg-white p-3">
            <div className="font-bold text-[#042f24]">1. Buka Google Sheets</div>
            <p className="mt-1 text-slate-700 leading-relaxed">
              Buat atau buka Google Spreadsheet di <b>sheets.google.com</b>, lalu klik menu{' '}
              <b>Ekstensi → Apps Script</b>.
            </p>
          </div>
          <div className="rounded-lg border border-[#e6dcc6] bg-white p-3">
            <div className="font-bold text-[#042f24]">2. Tempel SyncWebhook.gs</div>
            <p className="mt-1 text-slate-700 leading-relaxed">
              Salin kode dari tab <b>SyncWebhook.gs</b> di bawah, tempelkan ke editor Apps Script,
              lalu tekan <b>Ctrl + S</b>.
            </p>
          </div>
          <div className="rounded-lg border border-[#e6dcc6] bg-white p-3">
            <div className="font-bold text-[#042f24]">3. Deploy Web App (Gratis)</div>
            <p className="mt-1 text-slate-700 leading-relaxed">
              Klik <b>Deploy → New deployment → Web app</b>. Pilih <i>Execute as: Me</i> dan{' '}
              <i>Who has access: Anyone</i>.
            </p>
          </div>
          <div className="rounded-lg border border-[#e6dcc6] bg-white p-3">
            <div className="font-bold text-[#042f24]">4. Tempel URL Web App</div>
            <p className="mt-1 text-slate-700 leading-relaxed">
              Salin URL berakhiran <code>/exec</code> lalu tempel di bawah dan aktifkan{' '}
              <b>Auto-Sync</b>.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-7 space-y-3">
            <div className="rounded-lg border border-[#e6dcc6] bg-white p-4 space-y-3">
              {linkedWebhookUrl && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold text-sm text-[#042f24]">{linkedSheetName}</div>
                    {linkedSheetUrl && (
                      <a
                        href={linkedSheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-800/30 bg-white px-2.5 py-1 text-xs font-bold text-emerald-950 hover:bg-emerald-100"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Buka Google Sheets
                      </a>
                    )}
                  </div>
                  {lastSyncTime && (
                    <div className="text-[11px] text-slate-800">
                      Sinkronisasi terakhir:{' '}
                      <span className="font-mono-tabular font-bold text-[#042f24]">
                        {lastSyncTime}
                      </span>
                    </div>
                  )}
                  {lastSyncError && (
                    <div className="rounded border border-red-300 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-900">
                      Error sync terakhir: {lastSyncError}
                    </div>
                  )}
                </div>
              )}

              {isAdmin ? (
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      URL Web App Google Apps Script
                    </label>
                    <input
                      type="url"
                      value={webhookInput}
                      onChange={(e) => setWebhookInput(e.target.value)}
                      placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                      className="w-full rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-xs font-mono-tabular text-slate-950 focus:border-emerald-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Kode Keamanan / SYNC_KEY (Opsional — kosongkan jika tidak dipakai)
                    </label>
                    <input
                      type="text"
                      value={syncKeyInput}
                      onChange={(e) => setSyncKeyInput(e.target.value)}
                      placeholder="Kosongkan jika SYNC_KEY di skrip juga kosong"
                      className="w-full rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-xs text-slate-950 focus:border-emerald-700 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy || !webhookInput.trim()}
                      onClick={handleTestAndSaveWebhook}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#064e3b] px-4 py-2 text-xs font-bold text-white ring-1 ring-[#d4af37]/35 hover:bg-[#043b2c] disabled:opacity-50"
                    >
                      <Link2 className="h-3.5 w-3.5 text-amber-300" />
                      {busy ? 'Menghubungkan...' : 'Hubungkan & Tes Koneksi'}
                    </button>
                    {linkedWebhookUrl && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setPendingAction({
                            kind: 'unlink_sheet',
                            title: linkedSheetName,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Unlink className="h-3.5 w-3.5" />
                        Lepas Tautan
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-700">
                  Pengaturan tautan URL Google Sheets hanya dapat diubah oleh Admin.
                </p>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 space-y-3">
            <div className="rounded-lg border border-[#e6dcc6] bg-white p-4 space-y-3.5">
              <div className="text-xs font-bold uppercase tracking-wide text-[#042f24]">
                Kontrol Sinkronisasi
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-[#e6dcc6] bg-[#fdfaf3] px-3.5 py-2.5">
                <div>
                  <div className="text-xs font-bold text-[#042f24]">
                    Sinkronisasi Otomatis (Auto-Sync)
                  </div>
                  <div className="text-[11px] text-slate-700">
                    Setiap data disimpan di web, otomatis terkirim ke Google Sheets.
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy || !isAdmin || !linkedWebhookUrl}
                  onClick={handleToggleAutoSync}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 whitespace-nowrap ${
                    autoSyncEnabled
                      ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                      : 'border border-[#d9ceb5] bg-white text-slate-800 hover:bg-amber-50'
                  }`}
                >
                  {autoSyncEnabled ? 'Aktif' : 'Nonaktif'}
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={busy || !linkedWebhookUrl}
                  onClick={() =>
                    setPendingAction({
                      kind: 'push_sheet',
                      title: linkedSheetName,
                    })
                  }
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#064e3b] px-4 py-2.5 text-xs font-bold text-white ring-1 ring-[#d4af37]/35 hover:bg-[#043b2c] disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-amber-300 ${busy ? 'animate-spin' : ''}`} />
                  Sinkronkan ke Google Sheets Sekarang
                </button>

                {isAdmin && (
                  <button
                    type="button"
                    disabled={busy || !linkedWebhookUrl}
                    onClick={() =>
                      setPendingAction({
                        kind: 'pull_sheet',
                        title: linkedSheetName,
                      })
                    }
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#d9ceb5] bg-white px-4 py-2 text-xs font-bold text-slate-800 hover:bg-amber-50/70 disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5 text-[#064e3b]" />
                    Tarik Data dari Google Sheets ke Aplikasi
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Workbook Export/Import & Apps Script Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-5 shadow-[0_6px_20px_rgba(6,78,59,0.06)]">
        <div>
          {embedded ? (
            <h3 className="text-base font-bold tracking-tight text-[#042f24]">
              Cadangan Workbook Excel &amp; Kode Apps Script
            </h3>
          ) : (
            <h2 className="text-2xl font-bold tracking-tight text-[#042f24]">
              Kode Apps Script &amp; Sinkronisasi Google Sheets
            </h2>
          )}
          <p className={`mt-1 ${embedded ? 'text-xs' : 'text-sm'} text-slate-800`}>
            Salin kode <b>SyncWebhook.gs</b> (untuk sinkronisasi dari web ini), atau gunakan{' '}
            <b>Code.gs &amp; Index.html</b> untuk aplikasi mandiri Google Apps Script, serta
            ekspor-impor workbook Excel.
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
          {isAdmin && (
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
            <p className="mt-1.5 text-xs leading-relaxed text-slate-800">{item.detail}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 shadow-[0_6px_22px_rgba(6,78,59,0.06)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#e6dcc6] bg-[#f7f1e3]/75 px-4 py-3">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[#d9ceb5] bg-white p-1 w-fit">
            <button
              type="button"
              onClick={() => setActiveTab('webhook')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'webhook'
                  ? 'bg-gradient-to-r from-[#d4af37] to-[#eab308] text-[#042f24] font-bold shadow-xs'
                  : 'text-slate-600 hover:text-[#042f24]'
              }`}
            >
              <FileCode2 className="h-3.5 w-3.5" />
              SyncWebhook.gs (Sinkronisasi Web → Sheets)
            </button>
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
              Code.gs (Apps Script Mandiri)
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
              Index.html (Apps Script Mandiri)
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

      {confirmDialogConfig && (
        <ConfirmDialog
          title={confirmDialogConfig.title}
          message={confirmDialogConfig.message}
          confirmLabel={confirmDialogConfig.confirmLabel}
          variant={confirmDialogConfig.variant}
          busy={busy}
          onCancel={() => !busy && setPendingAction(null)}
          onConfirm={executePendingAction}
        />
      )}
    </div>
  );
}
