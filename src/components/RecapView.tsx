import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, Printer, Search, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../api/client.ts';
import type {
  AcademicYearRecord,
  AppSettings,
  ClassRecord,
  RecapResponse,
  StudentRecord,
  StudentTranscriptResponse,
} from '../types/erapor.ts';

interface RecapViewProps {
  classes: ClassRecord[];
  students: StudentRecord[];
  academicYears: AcademicYearRecord[];
  selectedYear: string;
  settings: AppSettings;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

export function RecapView({
  classes,
  students,
  academicYears,
  selectedYear,
  settings,
  onToast,
}: RecapViewProps) {
  const [activeTab, setActiveTab] = useState<'class' | 'transcript'>('class');

  // Tab 1: Class & Semester Recap
  const [academicYear, setAcademicYear] = useState(
    selectedYear || settings.ACADEMIC_YEAR || '2026/2027'
  );
  const yearClasses = useMemo(
    () => classes.filter((c) => !academicYear || String(c.ACADEMIC_YEAR).trim() === academicYear),
    [classes, academicYear]
  );
  const [classId, setClassId] = useState(yearClasses[0]?.CLASS_ID || '');
  const [semester, setSemester] = useState(settings.ACTIVE_SEMESTER || '1');
  const [recap, setRecap] = useState<RecapResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedYear) setAcademicYear(selectedYear);
  }, [selectedYear]);

  useEffect(() => {
    if (classId && !yearClasses.some((c) => c.CLASS_ID === classId)) {
      setClassId(yearClasses[0]?.CLASS_ID || '');
    }
  }, [yearClasses, classId]);

  // Tab 2: Student Multi-Semester / Multi-Year Transcript
  const [transcriptClassFilter, setTranscriptClassFilter] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.STUDENT_ID || '');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [studentDropdownOpen, setStudentDropdownOpen] = useState(false);
  const studentDropdownRef = useRef<HTMLDivElement | null>(null);
  const [transcript, setTranscript] = useState<StudentTranscriptResponse | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);

  const classMap = useMemo(() => new Map(classes.map((c) => [c.CLASS_ID, c.CLASS_NAME])), [classes]);

  const filteredStudents = useMemo(() => {
    const q = studentSearchQuery.trim().toLowerCase();
    return students.filter((s) => {
      if (transcriptClassFilter && s.CLASS_ID !== transcriptClassFilter) return false;
      if (!q) return true;
      const clsName = (classMap.get(s.CLASS_ID) || '').toLowerCase();
      return (
        String(s.NAME || '').toLowerCase().includes(q) ||
        String(s.NIS || '').toLowerCase().includes(q) ||
        String(s.NISN || '').toLowerCase().includes(q) ||
        clsName.includes(q)
      );
    });
  }, [students, transcriptClassFilter, studentSearchQuery, classMap]);

  const selectedStudentObj = useMemo(
    () => students.find((s) => s.STUDENT_ID === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        studentDropdownRef.current &&
        !studentDropdownRef.current.contains(e.target as Node)
      ) {
        setStudentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadRecap = async () => {
    setLoading(true);
    try {
      const data = await api.getRecap(classId, semester, academicYear);
      setRecap(data);
      onToast('Data rekapitulasi berhasil dihitung dan disimpan.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal memuat rekapitulasi', 'err');
    } finally {
      setLoading(false);
    }
  };

  const loadTranscript = async (targetStudentId?: string) => {
    const id = targetStudentId || selectedStudentId;
    if (!id) {
      onToast('Pilih siswa terlebih dahulu.', 'err');
      return;
    }
    setTranscriptLoading(true);
    try {
      const data = await api.getStudentTranscript(id);
      setTranscript(data);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal memuat transkrip nilai', 'err');
    } finally {
      setTranscriptLoading(false);
    }
  };

  const exportExcel = () => {
    if (!recap || !recap.rows.length) {
      onToast('Tampilkan rekapitulasi terlebih dahulu.', 'err');
      return;
    }
    const includePromo = String(semester) === '2';
    const header = [
      'No',
      'NIS',
      'Nama Murid',
      'Program Tahfidz',
      'Nilai Tahfidz',
      ...recap.subjects.map((s) => s.code || s.name),
      'Total',
      'Total (Terbilang Arab)',
      'Rata-rata',
      'Rata-rata (Terbilang Arab)',
      'Ranking',
      'Kategori',
      ...(includePromo ? ['Keterangan Naik Kelas', 'Keputusan (Arab)'] : []),
    ];
    const aoa = [
      header,
      ...recap.rows.map((r) => [
        r.no,
        r.nis,
        r.name,
        r.tahfidzType || '-',
        r.tahfidzScore !== undefined && r.tahfidzScore !== '' ? r.tahfidzScore : '',
        ...recap.subjects.map((s) => r.values[s.id] ?? ''),
        r.total,
        r.totalArab,
        r.average,
        r.averageArab,
        r.rank,
        r.category,
        ...(includePromo ? [r.promotionStatus || '-', r.promotionStatusArab || '-'] : []),
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekapitulasi');
    XLSX.writeFile(wb, `Rekapitulasi_Sem${semester}_${academicYear.replace('/', '-')}.xlsx`);
  };

  const exportTranscriptExcel = () => {
    if (!transcript) {
      onToast('Tampilkan transkrip siswa terlebih dahulu.', 'err');
      return;
    }
    const header = [
      'No',
      'Mata Pelajaran',
      'Nama Arab',
      ...transcript.terms.map((t) => `${t.academicYear} Sem ${t.semester}`),
      'Rata-rata Mapel',
    ];
    const aoa: (string | number)[][] = [
      [`TRANSKRIP NILAI SISWA - ${settings.SCHOOL_NAME || 'eRapor v2'}`],
      [
        'Nama Siswa',
        transcript.student.NAME,
        'NIS / NISN',
        `${transcript.student.NIS || '-'} / ${transcript.student.NISN || '-'}`,
      ],
      [
        'Kelas Saat Ini',
        transcript.className,
        'Rata-rata Kumulatif',
        transcript.overall.cumulativeAverage === '' ? '-' : transcript.overall.cumulativeAverage,
      ],
      [],
      header,
      [
        '-',
        'Tahfidz',
        'تحفيظ القرآن',
        ...transcript.terms.map((t) => {
          const score = t.tahfidz?.score;
          const type = t.tahfidz?.type;
          if (score !== undefined && score !== '') {
            return type ? `${type} (${score})` : score;
          }
          return type || '-';
        }),
        '-',
      ],
      ...transcript.subjects.map((sub, i) => [
        i + 1,
        sub.name,
        sub.nameArab,
        ...transcript.terms.map((t) => sub.scoresByTerm[t.key] ?? ''),
        sub.average === '' ? '' : sub.average,
      ]),
      [
        '',
        'TOTAL NILAI',
        '',
        ...transcript.terms.map((t) => (t.total === '' ? '' : t.total)),
        '',
      ],
      [
        '',
        'RATA-RATA SEMESTER',
        '',
        ...transcript.terms.map((t) => (t.average === '' ? '' : t.average)),
        transcript.overall.cumulativeAverage === '' ? '' : transcript.overall.cumulativeAverage,
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transkrip');
    XLSX.writeFile(wb, `Transkrip_${transcript.student.NAME.replace(/\s+/g, '_')}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-5 shadow-[0_6px_20px_rgba(6,78,59,0.06)]">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#042f24]">
            {activeTab === 'class' ? 'Rekapitulasi Nilai' : 'Transkrip Nilai Siswa'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {activeTab === 'class'
              ? 'Perhitungan otomatis Total, Rata-rata, Ranking, Kategori Arab, dan Keterangan Naik/Tidak Naik (Semester 2).'
              : 'Rekam jejak nilai seluruh mata pelajaran di semua semester dan semua tahun ajaran yang diikuti siswa.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[#e2d6bc] bg-[#f5efe0] p-1">
            <button
              type="button"
              onClick={() => setActiveTab('class')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'class'
                  ? 'bg-[#064e3b] text-[#f3d16c] shadow-xs'
                  : 'text-slate-700 hover:text-emerald-950'
              }`}
            >
              Rekap Kelas &amp; Semester
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('transcript')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'transcript'
                  ? 'bg-[#064e3b] text-[#f3d16c] shadow-xs'
                  : 'text-slate-700 hover:text-emerald-950'
              }`}
            >
              Transkrip Nilai
            </button>
          </div>

          {activeTab === 'class' ? (
            <button
              type="button"
              onClick={exportExcel}
              disabled={!recap?.rows.length}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9ceb5] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-amber-50/50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Export Excel
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportTranscriptExcel}
                disabled={!transcript}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9ceb5] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-amber-50/50 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                Export Excel
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                disabled={!transcript}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#064e3b] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#043b2c] disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Printer className="h-3.5 w-3.5 text-[#f3d16c]" />
                Cetak / PDF
              </button>
            </div>
          )}
        </div>
      </div>

      {/* TAB 1: CLASS RECAP */}
      {activeTab === 'class' && (
        <>
          <div className="no-print rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-4 shadow-[0_4px_16px_rgba(6,78,59,0.05)]">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Semester</label>
                <select
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  className="w-full rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-sm focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none"
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tahun Pelajaran
                </label>
                <select
                  value={academicYear}
                  onChange={(e) => {
                    setAcademicYear(e.target.value);
                    setRecap(null);
                  }}
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
              <button
                type="button"
                onClick={loadRecap}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#c89b2b] to-[#dfb547] px-4 py-2 text-sm font-bold text-[#042f24] shadow-xs hover:brightness-95 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Search className="h-4 w-4" />
                {loading ? 'Menghitung...' : 'Tampilkan & Simpan'}
              </button>
            </div>
          </div>

          {recap && (
            <div className="overflow-hidden rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 shadow-[0_6px_22px_rgba(6,78,59,0.06)]">
              {!recap.subjects.length || !recap.rows.length ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  Belum ada mata pelajaran aktif atau data siswa untuk filter ini.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[68vh]">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 z-20 bg-[#064e3b] text-xs font-semibold text-amber-50 border-b border-[#d4af37]/40">
                      <tr>
                        <th className="sticky left-0 z-30 bg-[#064e3b] px-3 py-3 w-12">No.</th>
                        <th className="sticky left-12 z-30 bg-[#064e3b] px-4 py-3 min-w-[180px] border-r border-white/15">
                          Nama Murid
                        </th>
                        <th className="px-3 py-3 text-center min-w-[115px] bg-[#053f30] border-l border-white/10">
                          Tahfidz
                        </th>
                        {recap.subjects.map((s) => (
                          <th
                            key={s.id}
                            title={s.name}
                            className="px-3 py-3 text-center min-w-[76px] border-l border-white/10"
                          >
                            {s.code || s.name}
                          </th>
                        ))}
                        <th className="px-3 py-3 text-center bg-[#043427]">Total</th>
                        <th className="px-3 py-3 text-center bg-[#043427]">Rata-rata</th>
                        <th className="px-3 py-3 text-center bg-[#043427]">Ranking</th>
                        <th className="px-3 py-3 text-center bg-[#043427]">Kategori</th>
                        {String(semester) === '2' && (
                          <th className="px-3 py-3 text-center bg-[#043427] border-l border-white/15 min-w-[160px]">
                            Keterangan Naik Kelas
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eee5d3]">
                      {recap.rows.map((r) => {
                        const isRetained = r.category?.trim() === 'راسب';
                        return (
                          <tr key={r.studentId} className="hover:bg-amber-50/45">
                            <td className="sticky left-0 z-10 bg-[#fdfaf3] px-3 py-2.5 font-mono-tabular text-slate-500">
                              {r.no}
                            </td>
                            <td className="sticky left-12 z-10 bg-[#fdfaf3] px-4 py-2.5 border-r border-[#e6dcc6]">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedStudentId(r.studentId);
                                  setActiveTab('transcript');
                                  loadTranscript(r.studentId);
                                }}
                                title="Lihat Transkrip Nilai Siswa"
                                className="text-left font-semibold text-slate-900 hover:text-emerald-800 font-arabic text-base"
                              >
                                {r.name}
                              </button>
                              <div className="text-[11px] font-mono-tabular text-slate-500">
                                {r.nis || '-'}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center bg-emerald-50/35 border-r border-[#e6dcc6]">
                              <div className="font-mono-tabular font-semibold text-emerald-900">
                                {r.tahfidzScore !== undefined && r.tahfidzScore !== ''
                                  ? r.tahfidzScore
                                  : '-'}
                              </div>
                              {r.tahfidzType && (
                                <div className="text-[10px] font-medium text-slate-600">
                                  {r.tahfidzType}
                                </div>
                              )}
                            </td>
                            {recap.subjects.map((s) => {
                              const v = r.values[s.id];
                              return (
                                <td
                                  key={s.id}
                                  className="px-3 py-2.5 text-center font-mono-tabular text-slate-700"
                                >
                                  {v !== '' && v !== undefined ? v : '-'}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2.5 text-center font-mono-tabular font-bold text-slate-900">
                              {r.total !== '' ? r.total : '-'}
                            </td>
                            <td className="px-3 py-2.5 text-center font-mono-tabular font-bold text-slate-900">
                              {r.average !== '' ? r.average : '-'}
                            </td>
                            <td className="px-3 py-2.5 text-center font-mono-tabular font-bold text-slate-900">
                              #{r.rank}
                            </td>
                            <td
                              className={`px-3 py-2.5 text-center font-arabic text-base font-bold ${
                                isRetained ? 'text-red-700' : 'text-emerald-800'
                              }`}
                            >
                              {r.category}
                            </td>
                            {String(semester) === '2' && (
                              <td className="px-3 py-2.5 text-center">
                                {r.promotionStatus && r.promotionStatus !== '-' ? (
                                  <div
                                    className={`text-xs font-bold ${
                                      isRetained ? 'text-red-700' : 'text-emerald-800'
                                    }`}
                                  >
                                    <div>{r.promotionStatus}</div>
                                    <div className="font-arabic text-sm font-normal">
                                      {r.promotionStatusArab}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* TAB 2: STUDENT MULTI-YEAR / MULTI-SEMESTER TRANSCRIPT */}
      {activeTab === 'transcript' && (
        <>
          <div className="no-print rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-4 shadow-[0_4px_16px_rgba(6,78,59,0.05)]">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Filter Kelas
                </label>
                <select
                  value={transcriptClassFilter}
                  onChange={(e) => {
                    const nextCls = e.target.value;
                    setTranscriptClassFilter(nextCls);
                    setStudentSearchQuery('');
                    const first = students.find((s) => !nextCls || s.CLASS_ID === nextCls);
                    if (first) setSelectedStudentId(first.STUDENT_ID);
                  }}
                  className="w-full rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-sm focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none"
                >
                  <option value="">Semua Kelas</option>
                  {classes.map((c) => (
                    <option key={c.CLASS_ID} value={c.CLASS_ID}>
                      {c.CLASS_NAME} ({c.ACADEMIC_YEAR})
                    </option>
                  ))}
                </select>
              </div>
              <div ref={studentDropdownRef} className="relative">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pilih Siswa (Cari Nama / NIS)
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={
                      studentDropdownOpen
                        ? studentSearchQuery
                        : selectedStudentObj
                          ? `${selectedStudentObj.NAME} (${selectedStudentObj.NIS || '-'})`
                          : studentSearchQuery
                    }
                    onFocus={() => {
                      setStudentSearchQuery('');
                      setStudentDropdownOpen(true);
                    }}
                    onChange={(e) => {
                      setStudentSearchQuery(e.target.value);
                      setStudentDropdownOpen(true);
                    }}
                    placeholder="Ketik nama atau NIS siswa..."
                    className="w-full rounded-lg border border-[#d9ceb5] bg-white pl-9 pr-14 py-2 text-sm focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {(studentSearchQuery || selectedStudentId) && (
                      <button
                        type="button"
                        onClick={() => {
                          setStudentSearchQuery('');
                          setSelectedStudentId('');
                          setStudentDropdownOpen(true);
                        }}
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        title="Bersihkan pilihan"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setStudentDropdownOpen((prev) => !prev)}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      aria-label="Toggle daftar siswa"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {studentDropdownOpen && (
                  <div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-[#d9ceb5] bg-[#fdfaf3] py-1 shadow-lg">
                    {filteredStudents.length ? (
                      filteredStudents.map((s) => {
                        const isSelected = s.STUDENT_ID === selectedStudentId;
                        const clsName = classMap.get(s.CLASS_ID) || '-';
                        return (
                          <button
                            key={s.STUDENT_ID}
                            type="button"
                            onClick={() => {
                              setSelectedStudentId(s.STUDENT_ID);
                              setStudentSearchQuery('');
                              setStudentDropdownOpen(false);
                              loadTranscript(s.STUDENT_ID);
                            }}
                            className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-amber-50 ${
                              isSelected
                                ? 'bg-emerald-50 font-semibold text-emerald-900'
                                : 'text-slate-800'
                            }`}
                          >
                            <span className="font-arabic text-base truncate">{s.NAME}</span>
                            <span className="ml-2 shrink-0 font-mono-tabular text-xs text-slate-500">
                              {s.NIS || '-'} · {clsName}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-3 py-4 text-center text-xs text-slate-500">
                        Siswa tidak ditemukan.
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => loadTranscript()}
                disabled={transcriptLoading}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#c89b2b] to-[#dfb547] px-4 py-2 text-sm font-bold text-[#042f24] shadow-xs hover:brightness-95 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Search className="h-4 w-4" />
                {transcriptLoading ? 'Memuat Transkrip...' : 'Tampilkan Transkrip'}
              </button>
            </div>
          </div>

          {transcript && (
            <div className="print-only-sheet space-y-5 rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-6 shadow-[0_6px_22px_rgba(6,78,59,0.06)] print:text-black">
              {/* Transcript Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#e6dcc6] pb-4 print:border-black">
                <div>
                  <div className="text-xs font-semibold text-emerald-800 print:text-black">
                    Transkrip Nilai Lintas Semester &amp; Tahun Ajaran
                  </div>
                  <h3 className="mt-1 text-2xl font-bold text-slate-900 font-arabic print:text-black">
                    {transcript.student.NAME}
                  </h3>
                  <div className="mt-1 text-xs text-slate-600 font-mono-tabular print:text-black">
                    NIS / NISN: {transcript.student.NIS || '-'} / {transcript.student.NISN || '-'} ·
                    Kelas Saat Ini: <span className="font-semibold">{transcript.className}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg border border-[#e2d6bc] bg-white px-3 py-2 print:border-black">
                    <div className="text-[11px] font-medium text-slate-500 print:text-black">
                      Semester Diikuti
                    </div>
                    <div className="text-lg font-bold font-mono-tabular text-slate-900 print:text-black">
                      {transcript.overall.termCount}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#e2d6bc] bg-white px-3 py-2 print:border-black">
                    <div className="text-[11px] font-medium text-slate-500 print:text-black">
                      Rata-rata Kumulatif
                    </div>
                    <div className="text-lg font-bold font-mono-tabular text-emerald-800 print:text-black">
                      {transcript.overall.cumulativeAverage !== ''
                        ? transcript.overall.cumulativeAverage
                        : '-'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#e2d6bc] bg-white px-3 py-2 print:border-black">
                    <div className="text-[11px] font-medium text-slate-500 print:text-black">
                      Predikat Kumulatif
                    </div>
                    <div className="text-lg font-bold font-arabic text-slate-900 print:text-black">
                      {transcript.overall.cumulativeCategory}
                    </div>
                  </div>
                </div>
              </div>

              {!transcript.terms.length ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  Siswa ini belum memiliki riwayat nilai di semester atau tahun ajaran mana pun.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse print:text-black">
                    <thead className="bg-[#064e3b] text-xs font-semibold text-amber-50 print:bg-slate-200 print:text-black">
                      <tr>
                        <th className="px-3 py-3 w-12 border border-white/15 print:border-slate-500">
                          No.
                        </th>
                        <th className="px-3 py-3 min-w-[200px] border border-white/15 print:border-slate-500">
                          Mata Pelajaran
                        </th>
                        {transcript.terms.map((t) => (
                          <th
                            key={t.key}
                            className="px-3 py-2.5 text-center min-w-[115px] border border-white/15 print:border-slate-500"
                          >
                            <div className="font-mono-tabular">{t.academicYear}</div>
                            <div className="text-[11px] font-normal text-[#f3d16c] print:text-black">
                              Semester {t.semester} ({t.className})
                            </div>
                          </th>
                        ))}
                        <th className="px-3 py-3 text-center bg-[#043427] border border-white/15 min-w-[100px] print:bg-slate-200 print:border-slate-500">
                          Rata-rata Mapel
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eee5d3]">
                      <tr className="bg-emerald-50/55 print:bg-white">
                        <td className="px-3 py-2 font-mono-tabular text-slate-500 border border-[#e6dcc6] print:border-slate-500 print:text-black">
                          -
                        </td>
                        <td className="px-3 py-2 border border-[#e6dcc6] print:border-slate-500">
                          <div className="font-semibold text-emerald-950 print:text-black">Tahfidz</div>
                          <div className="text-xs font-arabic text-slate-600 print:text-black">
                            تحفيظ القرآن
                          </div>
                        </td>
                        {transcript.terms.map((t) => {
                          const score = t.tahfidz?.score;
                          const type = t.tahfidz?.type;
                          return (
                            <td
                              key={t.key}
                              className="px-3 py-2 text-center border border-[#e6dcc6] print:border-slate-500"
                            >
                              <div className="font-mono-tabular font-bold text-emerald-900 print:text-black">
                                {score !== '' && score !== undefined ? score : '-'}
                              </div>
                              {type && (
                                <div className="text-[11px] font-medium text-slate-600 print:text-black">
                                  {type}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-center font-mono-tabular text-slate-500 bg-emerald-50/60 border border-[#e6dcc6] print:bg-white print:border-slate-500 print:text-black">
                          -
                        </td>
                      </tr>
                      {transcript.subjects.map((sub, idx) => (
                        <tr key={sub.id} className="hover:bg-amber-50/45">
                          <td className="px-3 py-2 font-mono-tabular text-slate-500 border border-[#e6dcc6] print:border-slate-500 print:text-black">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2 border border-[#e6dcc6] print:border-slate-500">
                            <div className="font-medium text-slate-900 print:text-black">{sub.name}</div>
                            <div className="text-xs font-arabic text-slate-500 print:text-black">
                              {sub.nameArab}
                            </div>
                          </td>
                          {transcript.terms.map((t) => {
                            const val = sub.scoresByTerm[t.key];
                            return (
                              <td
                                key={t.key}
                                className="px-3 py-2 text-center font-mono-tabular font-medium text-slate-800 border border-[#e6dcc6] print:border-slate-500 print:text-black"
                              >
                                {val !== '' && val !== undefined ? val : '-'}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-center font-mono-tabular font-bold text-emerald-900 bg-emerald-50/60 border border-[#e6dcc6] print:bg-white print:border-slate-500 print:text-black">
                            {sub.average !== '' ? sub.average : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-[#f5efe0] text-xs font-semibold print:bg-slate-100 print:text-black">
                      <tr>
                        <td
                          colSpan={2}
                          className="px-3 py-2.5 text-slate-800 border border-[#e6dcc6] print:border-slate-500 print:text-black"
                        >
                          Total Nilai Semester
                        </td>
                        {transcript.terms.map((t) => (
                          <td
                            key={t.key}
                            className="px-3 py-2.5 text-center font-mono-tabular font-bold text-slate-900 border border-[#e6dcc6] print:border-slate-500 print:text-black"
                          >
                            {t.total !== '' ? t.total : '-'}
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-center border border-[#e6dcc6] print:border-slate-500">
                          -
                        </td>
                      </tr>
                      <tr>
                        <td
                          colSpan={2}
                          className="px-3 py-2.5 text-slate-800 border border-[#e6dcc6] print:border-slate-500 print:text-black"
                        >
                          Rata-rata Semester
                        </td>
                        {transcript.terms.map((t) => (
                          <td
                            key={t.key}
                            className="px-3 py-2.5 text-center font-mono-tabular font-bold text-emerald-800 border border-[#e6dcc6] print:border-slate-500 print:text-black"
                          >
                            {t.average !== '' ? t.average : '-'}
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-center font-mono-tabular font-bold text-emerald-900 bg-emerald-100/60 border border-[#e6dcc6] print:bg-white print:border-slate-500 print:text-black">
                          {transcript.overall.cumulativeAverage !== ''
                            ? transcript.overall.cumulativeAverage
                            : '-'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
