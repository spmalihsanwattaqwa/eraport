import React, { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, FileText, GraduationCap, Plus, School } from 'lucide-react';
import { api } from '../api/client.ts';
import type { AppSettings, DashboardData, SafeUser } from '../types/erapor.ts';

interface DashboardViewProps {
  user: SafeUser;
  settings: AppSettings;
  selectedYear: string;
  onNavigate: (page: string) => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

export function DashboardView({
  user,
  settings,
  selectedYear,
  onNavigate,
  onToast,
}: DashboardViewProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const displayYear = selectedYear || settings.ACADEMIC_YEAR;
  const isArchive = displayYear !== settings.ACADEMIC_YEAR;

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getDashboard(displayYear, settings.ACTIVE_SEMESTER)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) onToast(err instanceof Error ? err.message : 'Gagal memuat dashboard', 'err');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [displayYear, settings.ACTIVE_SEMESTER, onToast]);

  const canGenerateReport = user.role !== 'GURU';

  return (
    <div className="space-y-6">
      {/* Header & Primary Action Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 rounded-xl border border-white/65 bg-white/60 backdrop-blur-md p-5 shadow-[0_8px_28px_rgba(6,78,59,0.08)]">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#042f24]">Dashboard Akademik</h2>
          <p className="mt-1 text-sm text-slate-700">
            <span className="font-arabic font-bold text-emerald-950">{settings.SCHOOL_NAME}</span>
            <span className="mx-2 text-amber-600/70">·</span>
            <span className="font-medium text-slate-800">
              Jenjang {settings.SCHOOL_LEVEL || 'WUSTHA'}
            </span>
            <span className="mx-2 text-amber-600/70">·</span>
            <span className="font-mono-tabular text-slate-800">
              Tahun Pelajaran {displayYear}
              {isArchive ? ' (Arsip)' : ''}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('scores')}
            className="inline-flex items-center gap-2 rounded-lg bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white shadow-xs ring-1 ring-[#d4af37]/35 transition-colors hover:bg-[#043b2c] whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4 text-[#f3d16c]" />
            Input Nilai
          </button>
          {canGenerateReport && (
            <button
              type="button"
              onClick={() => onNavigate(`report${settings.ACTIVE_SEMESTER || '1'}`)}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#c89b2b] to-[#dfb547] px-4 py-2 text-sm font-bold text-[#042f24] shadow-xs ring-1 ring-amber-200/70 transition-all hover:brightness-95 whitespace-nowrap shrink-0"
            >
              <FileText className="h-4 w-4" />
              Generate Rapor
            </button>
          )}
        </div>
      </div>

      {/* Modern Translucent Stat Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl border border-white/60 bg-white/50 backdrop-blur-md p-5"
            />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-white/65 bg-white/58 backdrop-blur-md p-5 shadow-[0_8px_24px_rgba(6,78,59,0.08)] transition-colors hover:bg-white/70">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-950/80">
                <span>Peserta Didik Aktif</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-900/10 text-emerald-900">
                  <GraduationCap className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2.5 text-3xl font-bold font-mono-tabular text-[#042f24]">
                {data.studentCount}
              </div>
              <div className="mt-1 text-xs font-medium text-slate-700">Terdaftar aktif</div>
            </div>

            <div className="rounded-xl border border-white/65 bg-white/58 backdrop-blur-md p-5 shadow-[0_8px_24px_rgba(6,78,59,0.08)] transition-colors hover:bg-white/70">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-950/80">
                <span>Rombongan Belajar</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-900/10 text-emerald-900">
                  <School className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2.5 text-3xl font-bold font-mono-tabular text-[#042f24]">
                {data.classCount}
              </div>
              <div className="mt-1 text-xs font-medium text-slate-700">Kelas aktif</div>
            </div>

            <div className="rounded-xl border border-white/65 bg-white/58 backdrop-blur-md p-5 shadow-[0_8px_24px_rgba(6,78,59,0.08)] transition-colors hover:bg-white/70">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-950/80">
                <span>Mata Pelajaran</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-900/10 text-emerald-900">
                  <BookOpen className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2.5 text-3xl font-bold font-mono-tabular text-[#042f24]">
                {data.subjectCount}
              </div>
              <div className="mt-1 text-xs font-medium text-slate-700">Mapel aktif</div>
            </div>

            <div className="rounded-xl border border-[#d4af37]/45 bg-white/62 backdrop-blur-md p-5 shadow-[0_8px_24px_rgba(6,78,59,0.08)] transition-colors hover:bg-white/75">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-950/80">
                <span>Kesiapan Rapor</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-800">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2.5 text-3xl font-bold font-mono-tabular text-[#042f24]">
                {data.reportCompletion}%
              </div>
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-emerald-950/10">
                <div
                  className="h-full bg-gradient-to-r from-[#064e3b] to-[#d4af37] transition-all"
                  style={{ width: `${data.reportCompletion}%` }}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Kelengkapan Nilai Translucent Card */}
            <div className="rounded-xl border border-white/65 bg-white/62 backdrop-blur-md shadow-[0_8px_24px_rgba(6,78,59,0.08)]">
              <div className="flex items-center justify-between border-b border-emerald-950/10 px-5 py-4">
                <h3 className="text-sm font-bold text-[#042f24]">
                  Kelengkapan Nilai Semester {settings.ACTIVE_SEMESTER}
                </h3>
                <span className="font-mono-tabular text-sm font-bold text-emerald-900">
                  {data.scoreCompletion}%
                </span>
              </div>
              <div className="p-5">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-emerald-950/10">
                  <div
                    className="h-full bg-gradient-to-r from-[#064e3b] to-[#d4af37] transition-all"
                    style={{ width: `${data.scoreCompletion}%` }}
                  />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-700">
                  Dihitung secara presisi dari jumlah pasangan siswa dan mata pelajaran aktif yang
                  telah memiliki Nilai Akhir di semester berjalan.
                </p>
              </div>
            </div>

            {/* Rapor Terbaru Cream-White Card */}
            <div className="rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/92 backdrop-blur-md shadow-[0_8px_24px_rgba(6,78,59,0.07)]">
              <div className="flex items-center justify-between border-b border-[#e6dcc6] px-5 py-4">
                <h3 className="text-sm font-bold text-[#042f24]">Rapor Terbaru</h3>
                {canGenerateReport && (
                  <button
                    type="button"
                    onClick={() => onNavigate(`report${settings.ACTIVE_SEMESTER || '1'}`)}
                    className="text-xs font-semibold text-emerald-800 hover:text-amber-700 hover:underline whitespace-nowrap"
                  >
                    Buka Halaman Rapor
                  </button>
                )}
              </div>
              <div className="divide-y divide-[#eee5d3] px-5">
                {data.recent.length ? (
                  data.recent.map((r) => (
                    <div key={r.REPORT_ID} className="flex items-center justify-between py-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 font-arabic">
                          {r.STUDENT_NAME}
                        </div>
                        <div className="text-xs font-mono-tabular text-slate-500">
                          {r.GENERATED_AT}
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-emerald-800">Siap Cetak</span>
                    </div>
                  ))
                ) : (
                  <div className="py-10 text-center text-sm text-slate-500">
                    Belum ada rapor yang disiapkan pada semester ini.
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
