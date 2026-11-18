import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  FileText,
  GraduationCap,
  MapPin,
  Plus,
  School,
} from 'lucide-react';
import { api } from '../api/client.ts';
import type {
  AppSettings,
  DashboardData,
  ProvinceGenderStat,
  SafeUser,
} from '../types/erapor.ts';
import { formatDateTimeDDMMYYYY } from '../utils/studentUtils.ts';

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
  const [selectedProvinceName, setSelectedProvinceName] = useState<string | null>(null);
  const displayYear = selectedYear || settings.ACADEMIC_YEAR;
  const isArchive = displayYear !== settings.ACADEMIC_YEAR;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setSelectedProvinceName(null);
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

  const provinceStats: ProvinceGenderStat[] = data?.provinceStats || [];
  const activeProvince: ProvinceGenderStat | null = selectedProvinceName
    ? provinceStats.find((p) => p.province === selectedProvinceName) || null
    : null;
  const totalMale = provinceStats.reduce((sum, p) => sum + p.male, 0);
  const totalFemale = provinceStats.reduce((sum, p) => sum + p.female, 0);

  const canGenerateReport = user.role !== 'GURU';

  return (
    <div className="space-y-6">
      {/* Header & Primary Action Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 rounded-xl border border-white/65 bg-white/60 backdrop-blur-md p-5 shadow-[0_8px_28px_rgba(6,78,59,0.08)]">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#042f24]">Dashboard Akademik</h2>
          <p className="mt-1 text-sm text-slate-900">
            <span className="font-arabic font-bold text-emerald-950">{settings.SCHOOL_NAME}</span>
            <span className="mx-2 text-amber-700">·</span>
            <span className="font-semibold text-slate-900">
              Jenjang {settings.SCHOOL_LEVEL || 'WUSTHA'}
            </span>
            <span className="mx-2 text-amber-700">·</span>
            <span className="font-mono-tabular font-semibold text-slate-900">
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
            <div className="rounded-xl border border-white/65 bg-white/70 backdrop-blur-md p-5 shadow-[0_8px_24px_rgba(6,78,59,0.08)] transition-colors hover:bg-white/80">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-950">
                <span>Peserta Didik Aktif</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-900/10 text-emerald-950">
                  <GraduationCap className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2.5 text-3xl font-bold font-mono-tabular text-[#042f24]">
                {data.studentCount}
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-800">Terdaftar aktif</div>
            </div>

            <div className="rounded-xl border border-white/65 bg-white/70 backdrop-blur-md p-5 shadow-[0_8px_24px_rgba(6,78,59,0.08)] transition-colors hover:bg-white/80">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-950">
                <span>Rombongan Belajar</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-900/10 text-emerald-950">
                  <School className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2.5 text-3xl font-bold font-mono-tabular text-[#042f24]">
                {data.classCount}
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-800">Kelas aktif</div>
            </div>

            <div className="rounded-xl border border-white/65 bg-white/70 backdrop-blur-md p-5 shadow-[0_8px_24px_rgba(6,78,59,0.08)] transition-colors hover:bg-white/80">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-950">
                <span>Mata Pelajaran</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-900/10 text-emerald-950">
                  <BookOpen className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2.5 text-3xl font-bold font-mono-tabular text-[#042f24]">
                {data.subjectCount}
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-800">Mapel aktif</div>
            </div>

            <div className="rounded-xl border border-[#d4af37]/45 bg-white/72 backdrop-blur-md p-5 shadow-[0_8px_24px_rgba(6,78,59,0.08)] transition-colors hover:bg-white/82">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-950">
                <span>Kesiapan Rapor</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-900">
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
                <p className="mt-3 text-xs leading-relaxed text-slate-800">
                  Dihitung secara presisi dari jumlah pasangan siswa dan mata pelajaran aktif yang
                  telah memiliki Nilai Akhir di semester berjalan.
                </p>
              </div>
            </div>

            {/* Rapor Terbaru Cream-White Card */}
            <div className="rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 backdrop-blur-md shadow-[0_8px_24px_rgba(6,78,59,0.07)]">
              <div className="flex items-center justify-between border-b border-[#e6dcc6] px-5 py-4">
                <h3 className="text-sm font-bold text-[#042f24]">Rapor Terbaru</h3>
                {canGenerateReport && (
                  <button
                    type="button"
                    onClick={() => onNavigate(`report${settings.ACTIVE_SEMESTER || '1'}`)}
                    className="text-xs font-bold text-emerald-900 hover:text-amber-800 hover:underline whitespace-nowrap"
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
                        <div className="text-sm font-semibold text-slate-950 font-arabic">
                          {r.STUDENT_NAME}
                        </div>
                        <div className="text-xs font-mono-tabular font-medium text-slate-800">
                          {formatDateTimeDDMMYYYY(r.GENERATED_AT)}
                        </div>
                      </div>
                      <span className="text-xs font-bold text-emerald-900">Siap Cetak</span>
                    </div>
                  ))
                ) : (
                  <div className="py-10 text-center text-sm font-medium text-slate-800">
                    Belum ada rapor yang disiapkan pada semester ini.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sebaran Siswa per Provinsi & Kabupaten (Laki-laki & Perempuan) */}
          <div className="rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 backdrop-blur-md shadow-[0_8px_24px_rgba(6,78,59,0.07)] overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#e6dcc6] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-900/10 text-emerald-950">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#042f24]">
                    {activeProvince
                      ? `Sebaran Siswa — Provinsi ${activeProvince.province} (per Kabupaten/Kota)`
                      : 'Sebaran Siswa Berdasarkan Provinsi (Laki-laki & Perempuan)'}
                  </h3>
                  <p className="text-xs text-slate-800">
                    {activeProvince
                      ? 'Menampilkan rincian jumlah siswa laki-laki dan perempuan per kabupaten/kota di provinsi terpilih.'
                      : 'Klik nama provinsi untuk menampilkan rincian data berdasarkan kabupaten/kota.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-950 font-mono-tabular">
                  Laki-laki: {activeProvince ? activeProvince.male : totalMale}
                </span>
                <span className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-950 font-mono-tabular">
                  Perempuan: {activeProvince ? activeProvince.female : totalFemale}
                </span>
                <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-950 font-mono-tabular">
                  Total: {activeProvince ? activeProvince.total : data.studentCount}
                </span>
                {activeProvince && (
                  <button
                    type="button"
                    onClick={() => setSelectedProvinceName(null)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#d9ceb5] bg-white px-2.5 py-1 text-xs font-bold text-slate-900 hover:bg-amber-50/70"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Semua Provinsi
                  </button>
                )}
              </div>
            </div>

            {!provinceStats.length ? (
              <div className="py-10 text-center text-sm font-medium text-slate-800">
                Belum ada data siswa aktif untuk ditampilkan.
              </div>
            ) : (
              <div
                className={
                  activeProvince
                    ? 'grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e6dcc6]'
                    : ''
                }
              >
                {/* Tabel Provinsi */}
                <div className="overflow-x-auto max-h-[360px]">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-[#064e3b] text-xs font-semibold text-amber-50 border-b border-[#d4af37]/40">
                      <tr>
                        <th className="px-4 py-2.5 w-12">No.</th>
                        <th className="px-4 py-2.5">Provinsi</th>
                        <th className="px-4 py-2.5 text-center w-24">Laki-laki</th>
                        <th className="px-4 py-2.5 text-center w-24">Perempuan</th>
                        <th className="px-4 py-2.5 text-center w-20">Total</th>
                        <th className="px-3 py-2.5 w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eee5d3]">
                      {provinceStats.map((prov, idx) => {
                        const isSelected = activeProvince?.province === prov.province;
                        return (
                          <tr
                            key={prov.province}
                            onClick={() =>
                              setSelectedProvinceName((prev) =>
                                prev === prov.province ? null : prov.province
                              )
                            }
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-emerald-50 font-semibold'
                                : 'hover:bg-amber-50/60'
                            }`}
                          >
                            <td className="px-4 py-2.5 font-mono-tabular font-semibold text-slate-800">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`font-semibold ${
                                  isSelected ? 'text-emerald-950' : 'text-slate-950'
                                }`}
                              >
                                {prov.province}
                              </span>
                              <span className="ml-2 text-[11px] font-medium text-slate-700">
                                ({prov.regencies.length} kab/kota)
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-center font-mono-tabular font-bold text-slate-950">
                              {prov.male}
                            </td>
                            <td className="px-4 py-2.5 text-center font-mono-tabular font-bold text-slate-950">
                              {prov.female}
                            </td>
                            <td className="px-4 py-2.5 text-center font-mono-tabular font-bold text-emerald-950">
                              {prov.total}
                            </td>
                            <td className="px-3 py-2.5 text-right text-slate-700">
                              <ChevronRight
                                className={`h-4 w-4 inline transition-transform ${
                                  isSelected ? 'text-emerald-900 translate-x-0.5' : ''
                                }`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Tabel Kabupaten/Kota dari Provinsi yang diklik */}
                {activeProvince && (
                  <div className="overflow-x-auto max-h-[360px] bg-white/75">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 z-10 bg-[#053f30] text-xs font-semibold text-amber-50 border-b border-[#d4af37]/40">
                        <tr>
                          <th className="px-4 py-2.5 w-12">No.</th>
                          <th className="px-4 py-2.5">
                            Kabupaten / Kota ({activeProvince.province})
                          </th>
                          <th className="px-4 py-2.5 text-center w-24">Laki-laki</th>
                          <th className="px-4 py-2.5 text-center w-24">Perempuan</th>
                          <th className="px-4 py-2.5 text-center w-20">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#eee5d3]">
                        {activeProvince.regencies.map((reg, rIdx) => (
                          <tr key={reg.regency} className="hover:bg-amber-50/45">
                            <td className="px-4 py-2.5 font-mono-tabular font-semibold text-slate-800">
                              {rIdx + 1}
                            </td>
                            <td className="px-4 py-2.5 font-semibold text-slate-950">
                              {reg.regency}
                            </td>
                            <td className="px-4 py-2.5 text-center font-mono-tabular font-bold text-slate-950">
                              {reg.male}
                            </td>
                            <td className="px-4 py-2.5 text-center font-mono-tabular font-bold text-slate-950">
                              {reg.female}
                            </td>
                            <td className="px-4 py-2.5 text-center font-mono-tabular font-bold text-emerald-950">
                              {reg.total}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
