import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../api/client.ts';
import type {
  AcademicYearRecord,
  AppSettings,
  ClassRecord,
  StudentEnrollmentRecord,
  StudentRecord,
} from '../types/erapor.ts';
import { ConfirmDialog, Modal } from './Modal.tsx';
import { StudentBiodataModal, StudentBiodataSheet } from './StudentBiodataModal.tsx';
import {
  buildParentDirectory,
  composeStudentAddress,
  compressImageToDataUrl,
  computeMasaBelajar,
  findParentsByKk,
  normalizeDateInput,
  parseNikInfo,
  validateStudentIdentifiers,
  validateStudentStatusDate,
} from '../utils/studentUtils.ts';

interface StudentsViewProps {
  students: StudentRecord[];
  classes: ClassRecord[];
  enrollments: StudentEnrollmentRecord[];
  academicYears: AcademicYearRecord[];
  selectedYear: string;
  settings: AppSettings;
  canEdit: boolean;
  onRefresh: () => Promise<void>;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

const INPUT_CLASS =
  'w-full rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-sm text-slate-900 transition-colors focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none';

export function StudentsView({
  students,
  classes,
  enrollments,
  academicYears,
  selectedYear,
  settings,
  canEdit,
  onRefresh,
  onToast,
}: StudentsViewProps) {
  const [yearFilter, setYearFilter] = useState(selectedYear || '');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [editing, setEditing] = useState<Partial<StudentRecord> | null>(null);
  const [biodataTarget, setBiodataTarget] = useState<{
    student: StudentRecord;
    className: string;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StudentRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [parentSearchQuery, setParentSearchQuery] = useState('');
  const [parentDropdownOpen, setParentDropdownOpen] = useState(false);
  const parentDropdownRef = useRef<HTMLDivElement | null>(null);
  const [nikVillages, setNikVillages] = useState<string[]>([]);
  const [nikWilayahStatus, setNikWilayahStatus] = useState('');
  const lastFetchedPrefixRef = useRef('');
  const editingNikRef = useRef('');

  useEffect(() => {
    editingNikRef.current = String(editing?.NIK || '').replace(/\D/g, '');
  }, [editing?.NIK]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        parentDropdownRef.current &&
        !parentDropdownRef.current.contains(e.target as Node)
      ) {
        setParentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!editing) {
      setNikVillages([]);
      setNikWilayahStatus('');
      lastFetchedPrefixRef.current = '';
      return;
    }
    const prefix6 = String(editing.NIK || '').replace(/\D/g, '').slice(0, 6);
    if (prefix6.length === 6 && lastFetchedPrefixRef.current !== prefix6) {
      lastFetchedPrefixRef.current = prefix6;
      api
        .lookupNikWilayah(prefix6)
        .then((res) => {
          if (editingNikRef.current.slice(0, 6) !== prefix6) return;
          setNikVillages(res.villages || []);
          // On initial open (edit mode), only fill empty region fields without overwriting saved values
          if (res.province || res.regency || res.district) {
            setEditing((prev) =>
              prev
                ? {
                    ...prev,
                    PROVINCE: prev.PROVINCE || res.province || '',
                    REGENCY: prev.REGENCY || res.regency || '',
                    DISTRICT: prev.DISTRICT || res.district || '',
                    VILLAGE: prev.VILLAGE || res.defaultVillage || '',
                  }
                : prev
            );
          }
        })
        .catch(() => {
          // ignore silent lookup failure
        });
    }
  }, [Boolean(editing), editing?.STUDENT_ID]);

  useEffect(() => {
    if (selectedYear) {
      setYearFilter(selectedYear);
      setClassFilter('');
    }
  }, [selectedYear]);

  const idValidationError = useMemo(
    () => (editing ? validateStudentIdentifiers(editing, students) : null),
    [editing?.STUDENT_ID, editing?.NIS, editing?.NISN, editing?.NIK, students]
  );

  const statusDateValidationError = useMemo(
    () =>
      editing
        ? validateStudentStatusDate(editing.STATUS, editing.STATUS_DATE, editing.KEDATANGAN)
        : null,
    [editing?.STATUS, editing?.STATUS_DATE, editing?.KEDATANGAN]
  );

  const liveMasaBelajar = useMemo(
    () =>
      editing
        ? computeMasaBelajar(
            editing.KEDATANGAN,
            editing.STATUS,
            editing.STATUS_DATE,
            editing.MASA_BELAJAR
          )
        : '',
    [editing?.KEDATANGAN, editing?.STATUS, editing?.STATUS_DATE, editing?.MASA_BELAJAR]
  );

  const parsedNikInfo = useMemo(
    () => (editing ? parseNikInfo(editing.NIK) : null),
    [editing?.NIK]
  );

  const matchedKkParents = useMemo(
    () => (editing ? findParentsByKk(editing.KK_NUMBER, students, editing.STUDENT_ID) : null),
    [editing?.KK_NUMBER, editing?.STUDENT_ID, students]
  );

  const parentDirectory = useMemo(
    () => (editing ? buildParentDirectory(students, editing.STUDENT_ID) : []),
    [students, editing?.STUDENT_ID]
  );

  const filteredParents = useMemo(() => {
    const q = parentSearchQuery.trim().toLowerCase();
    if (!q) return parentDirectory;
    return parentDirectory.filter((p) =>
      [p.name, p.roleLabel, p.studentName, p.kkNumber, p.address].some((v) =>
        v.toLowerCase().includes(q)
      )
    );
  }, [parentDirectory, parentSearchQuery]);

  const classMap = useMemo(() => new Map(classes.map((c) => [c.CLASS_ID, c])), [classes]);

  const yearClasses = useMemo(() => {
    if (!yearFilter || yearFilter === 'ALL') return classes;
    return classes.filter((c) => String(c.ACADEMIC_YEAR).trim() === yearFilter);
  }, [classes, yearFilter]);

  const enrollmentByStudentForYear = useMemo(() => {
    const map = new Map<string, StudentEnrollmentRecord>();
    if (!yearFilter || yearFilter === 'ALL') return map;
    for (const e of enrollments) {
      if (String(e.ACADEMIC_YEAR).trim() === yearFilter) {
        map.set(e.STUDENT_ID, e);
      }
    }
    return map;
  }, [enrollments, yearFilter]);

  const displayStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students
      .map((s) => {
        const enr =
          yearFilter && yearFilter !== 'ALL' ? enrollmentByStudentForYear.get(s.STUDENT_ID) : undefined;
        const effectiveClassId = enr ? enr.CLASS_ID : s.CLASS_ID;
        const cls = classMap.get(effectiveClassId);
        return {
          student: s,
          enrollment: enr,
          effectiveClassId,
          className: cls?.CLASS_NAME || '-',
          promoResult: enr?.PROMOTION_RESULT || '',
        };
      })
      .filter(({ student: s, enrollment: enr, effectiveClassId }) => {
        if (yearFilter && yearFilter !== 'ALL' && !enr) {
          const cls = classMap.get(s.CLASS_ID);
          if (!cls || String(cls.ACADEMIC_YEAR).trim() !== yearFilter) return false;
        }
        if (classFilter && effectiveClassId !== classFilter) return false;
        if (!q) return true;
        return [
          s.NIS,
          s.NAME,
          s.BIRTH_PLACE,
          s.NISN,
          s.NIK,
          s.KK_NUMBER,
          s.FATHER_NAME,
          s.MOTHER_NAME,
          s.WALI_NAME,
          s.WALI_RELATION,
          s.WALI_ADDRESS,
          s.VILLAGE,
          s.DISTRICT,
          s.REGENCY,
          s.PROVINCE,
          s.KEDATANGAN,
          s.MASA_BELAJAR,
        ].some((field) => String(field || '').toLowerCase().includes(q));
      });
  }, [students, yearFilter, enrollmentByStudentForYear, classMap, classFilter, search]);

  const downloadTemplate = () => {
    const headers = [
      [
        'NIS',
        'NAMA LENGKAP',
        'NIK',
        'NOMOR KK',
        'TEMPAT LAHIR',
        'TANGGAL LAHIR',
        'JENIS KELAMIN',
        'NISN',
        'NAMA AYAH',
        'NAMA IBU',
        'NAMA WALI',
        'HUBUNGAN KELUARGA',
        'ALAMAT WALI',
        'RT/RW',
        'DESA/KEL',
        'KECAMATAN',
        'KABUPATEN/KOTA',
        'PROVINSI',
        'KEDATANGAN',
        'MASABELAJAR',
        'NAMA_KELAS',
      ],
    ];
    const example = [
      [
        '1001',
        'أحمد زكي',
        '3171012005120001',
        '3171010101100001',
        'Jakarta',
        '2012-05-20',
        'L',
        '0012345678',
        'عبد الله',
        'آمنة',
        'عبد الله',
        'Ayah Kandung',
        'RT/RW 002/005, Sukamaju, Cilandak, Jakarta Selatan, DKI Jakarta',
        '002/005',
        'Sukamaju',
        'Cilandak',
        'Jakarta Selatan',
        'DKI Jakarta',
        '2024-07-15',
        computeMasaBelajar('2024-07-15', 'AKTIF'),
        yearClasses[0]?.CLASS_NAME || classes[0]?.CLASS_NAME || '1A',
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(headers.concat(example));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Siswa');
    XLSX.writeFile(wb, 'Template_Import_Siswa.xlsx');
  };

  const exportExcel = () => {
    if (!displayStudents.length) {
      onToast('Tidak ada data siswa untuk diekspor.', 'err');
      return;
    }
    const header = [
      'NIS',
      'NAMA LENGKAP',
      'NIK',
      'NOMOR KK',
      'TEMPAT LAHIR',
      'TANGGAL LAHIR',
      'JENIS KELAMIN',
      'NISN',
      'NAMA AYAH',
      'NAMA IBU',
      'NAMA WALI',
      'HUBUNGAN KELUARGA',
      'ALAMAT WALI',
      'RT/RW',
      'DESA/KEL',
      'KECAMATAN',
      'KABUPATEN/KOTA',
      'PROVINSI',
      'KEDATANGAN',
      'MASABELAJAR',
      'KELAS',
      'STATUS',
      'TANGGAL NONAKTIF/LULUS',
    ];
    const rows = displayStudents.map(({ student: s, className }) => [
      s.NIS || '',
      s.NAME || '',
      s.NIK || '',
      s.KK_NUMBER || '',
      s.BIRTH_PLACE || '',
      s.BIRTH_DATE || '',
      s.GENDER || '',
      s.NISN || '',
      s.FATHER_NAME || '',
      s.MOTHER_NAME || '',
      s.WALI_NAME || s.PARENT_NAME || '',
      s.WALI_RELATION || '',
      s.WALI_ADDRESS || '',
      s.RT_RW || '',
      s.VILLAGE || '',
      s.DISTRICT || '',
      s.REGENCY || '',
      s.PROVINCE || '',
      s.KEDATANGAN || '',
      computeMasaBelajar(s.KEDATANGAN, s.STATUS, s.STATUS_DATE, s.MASA_BELAJAR) || '',
      className,
      s.STATUS || 'AKTIF',
      s.STATUS_DATE || '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data_Siswa');
    const yearSuffix = (yearFilter || selectedYear || 'Semua').replace('/', '-');
    XLSX.writeFile(wb, `Data_Siswa_${yearSuffix}.xlsx`);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
      if (!rows.length) throw new Error('File Excel kosong atau format kolom tidak sesuai.');
      const targetYear = yearFilter && yearFilter !== 'ALL' ? yearFilter : selectedYear;
      const res = await api.importStudents(rows, targetYear);
      onToast(`${res.count} data siswa berhasil diimpor ke tahun ${targetYear}.`);
      setImportOpen(false);
      await onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal impor Excel.', 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveStudent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    const dupErr = validateStudentIdentifiers(editing, students);
    if (dupErr) {
      onToast(dupErr, 'err');
      return;
    }
    const statusErr = validateStudentStatusDate(
      editing.STATUS,
      editing.STATUS_DATE,
      editing.KEDATANGAN
    );
    if (statusErr) {
      onToast(statusErr, 'err');
      return;
    }
    setBusy(true);
    try {
      const cls = editing.CLASS_ID ? classMap.get(editing.CLASS_ID) : undefined;
      const enrollmentYear =
        cls?.ACADEMIC_YEAR || (yearFilter && yearFilter !== 'ALL' ? yearFilter : selectedYear);
      const composedAddress =
        editing.ADDRESS?.trim() ||
        [
          editing.RT_RW ? `RT/RW ${editing.RT_RW}` : '',
          editing.VILLAGE || '',
          editing.DISTRICT || '',
          editing.REGENCY || '',
          editing.PROVINCE || '',
        ]
          .filter(Boolean)
          .join(', ');
      const normalizedStatus = String(editing.STATUS || 'AKTIF').trim().toUpperCase();
      const statusDate =
        normalizedStatus === 'AKTIF' ? '' : normalizeDateInput(editing.STATUS_DATE);
      const computedMasa = computeMasaBelajar(
        editing.KEDATANGAN,
        normalizedStatus,
        statusDate,
        editing.MASA_BELAJAR
      );
      const waliName =
        editing.WALI_MODE === 'AYAH'
          ? editing.WALI_NAME?.trim() || editing.FATHER_NAME?.trim() || ''
          : editing.WALI_MODE === 'IBU'
            ? editing.WALI_NAME?.trim() || editing.MOTHER_NAME?.trim() || ''
            : editing.WALI_NAME?.trim() || '';
      const waliRelation =
        editing.WALI_RELATION?.trim() ||
        (editing.WALI_MODE === 'AYAH'
          ? 'Ayah Kandung'
          : editing.WALI_MODE === 'IBU'
            ? 'Ibu Kandung'
            : '');
      const waliAddress = editing.WALI_ADDRESS?.trim() || '';

      await api.saveRecord('students', {
        ...editing,
        STATUS: normalizedStatus,
        STATUS_DATE: statusDate,
        MASA_BELAJAR: computedMasa,
        ADDRESS: composedAddress,
        WALI_NAME: waliName,
        WALI_RELATION: waliRelation,
        WALI_ADDRESS: waliAddress,
        PARENT_NAME: waliName || editing.PARENT_NAME || editing.FATHER_NAME || editing.MOTHER_NAME || '',
        ENROLLMENT_YEAR: enrollmentYear,
      });
      onToast('Data siswa berhasil disimpan.');
      setEditing(null);
      await onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menyimpan siswa.', 'err');
    } finally {
      setBusy(false);
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setEditing((prev) => (prev ? { ...prev, PHOTO: dataUrl } : prev));
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal memproses foto siswa.', 'err');
    } finally {
      setPhotoBusy(false);
    }
  };

  const applyWaliMode = (mode: 'AYAH' | 'IBU' | 'ORANG_TUA' | 'MANUAL') => {
    setEditing((prev) => {
      if (!prev) return prev;
      const defaultAddr = composeStudentAddress(prev);
      if (mode === 'AYAH') {
        return {
          ...prev,
          WALI_MODE: 'AYAH',
          WALI_NAME: prev.FATHER_NAME || '',
          WALI_RELATION: 'Ayah Kandung',
          WALI_ADDRESS: prev.WALI_ADDRESS?.trim() || defaultAddr,
        };
      }
      if (mode === 'IBU') {
        return {
          ...prev,
          WALI_MODE: 'IBU',
          WALI_NAME: prev.MOTHER_NAME || '',
          WALI_RELATION: 'Ibu Kandung',
          WALI_ADDRESS: prev.WALI_ADDRESS?.trim() || defaultAddr,
        };
      }
      if (mode === 'ORANG_TUA') {
        setParentDropdownOpen(true);
        return {
          ...prev,
          WALI_MODE: 'ORANG_TUA',
        };
      }
      return {
        ...prev,
        WALI_MODE: 'MANUAL',
      };
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.deleteRecord('students', deleteTarget.STUDENT_ID);
      onToast('Data siswa dihapus.');
      setDeleteTarget(null);
      await onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Gagal menghapus siswa.', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="no-print space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-5 shadow-[0_6px_20px_rgba(6,78,59,0.06)]">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#042f24]">Data Siswa</h2>
          <p className="mt-1 text-sm text-slate-600">
            Kelola identitas lengkap peserta didik, alamat domisili, kedatangan, masa belajar, dan penempatan rombel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/30 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export Excel
          </button>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={downloadTemplate}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9ceb5] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-amber-50/60 whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                Template Excel
              </button>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#d4af37]/60 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap shrink-0"
              >
                <Upload className="h-3.5 w-3.5" />
                Import Excel
              </button>
              <button
                type="button"
                onClick={() => {
                  setParentSearchQuery('');
                  setParentDropdownOpen(false);
                  setEditing({
                    GENDER: 'L',
                    CLASS_ID: yearClasses[0]?.CLASS_ID || classes[0]?.CLASS_ID || '',
                    STATUS: 'AKTIF',
                    RELIGION: 'Islam',
                    WALI_MODE: 'AYAH',
                    WALI_RELATION: 'Ayah Kandung',
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#064e3b] px-3.5 py-2 text-xs font-semibold text-white ring-1 ring-[#d4af37]/35 shadow-xs hover:bg-[#043b2c] whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah Siswa
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 p-4 shadow-[0_4px_16px_rgba(6,78,59,0.05)]">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari NIS, nama lengkap, NISN, NIK, nomor KK, ayah/ibu, desa, kecamatan..."
              className="w-full rounded-lg border border-[#d9ceb5] bg-white pl-9 pr-3 py-2 text-sm focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none"
            />
          </div>
          <select
            value={yearFilter}
            onChange={(e) => {
              setYearFilter(e.target.value);
              setClassFilter('');
            }}
            className="rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-sm font-mono-tabular focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none sm:w-48"
          >
            <option value="ALL">Semua Tahun / Alumni ({students.length})</option>
            {academicYears.map((y) => (
              <option key={y.YEAR_ID} value={y.YEAR_NAME}>
                TA {y.YEAR_NAME}
              </option>
            ))}
          </select>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-sm focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none sm:w-52"
          >
            <option value="">Semua Kelas ({displayStudents.length})</option>
            {yearClasses.map((c) => (
              <option key={c.CLASS_ID} value={c.CLASS_ID}>
                {c.CLASS_NAME}
                {yearFilter === 'ALL' ? ` (${c.ACADEMIC_YEAR})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e6dcc6] bg-[#fdfaf3]/95 shadow-[0_6px_22px_rgba(6,78,59,0.06)]">
        <div className="overflow-x-auto max-h-[68vh]">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#064e3b] text-[11px] font-semibold text-amber-50 border-b border-[#d4af37]/40 whitespace-nowrap">
              <tr>
                <th className="px-3 py-3 w-10">No.</th>
                <th className="px-3 py-3">NIS</th>
                <th className="px-3 py-3 min-w-[190px]">Nama Lengkap</th>
                <th className="px-3 py-3">NIK</th>
                <th className="px-3 py-3">Nomor KK</th>
                <th className="px-3 py-3">Tempat Lahir</th>
                <th className="px-3 py-3">Tanggal Lahir</th>
                <th className="px-3 py-3 text-center">Jenis Kelamin</th>
                <th className="px-3 py-3">NISN</th>
                <th className="px-3 py-3 min-w-[130px]">Nama Ayah</th>
                <th className="px-3 py-3 min-w-[130px]">Nama Ibu</th>
                <th className="px-3 py-3 min-w-[170px]">Wali</th>
                <th className="px-3 py-3 min-w-[180px]">Alamat Wali</th>
                <th className="px-3 py-3">RT/RW</th>
                <th className="px-3 py-3">Desa/Kel</th>
                <th className="px-3 py-3">Kecamatan</th>
                <th className="px-3 py-3">Kabupaten/Kota</th>
                <th className="px-3 py-3">Provinsi</th>
                <th className="px-3 py-3">Kedatangan</th>
                <th className="px-3 py-3">Masa Belajar</th>
                <th className="px-3 py-3">Kelas</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-center w-28">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee5d3]">
              {displayStudents.length ? (
                displayStudents.map(({ student: s, className, promoResult, effectiveClassId }, idx) => (
                  <tr key={s.STUDENT_ID} className="hover:bg-amber-50/45">
                    <td className="px-3 py-2.5 font-mono-tabular text-slate-500 whitespace-nowrap">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2.5 font-mono-tabular text-slate-700 whitespace-nowrap">
                      {s.NIS || '-'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        {s.PHOTO ? (
                          <img
                            src={s.PHOTO}
                            alt={s.NAME}
                            className="h-9 w-7 shrink-0 rounded object-cover object-top border border-[#d9ceb5]"
                          />
                        ) : (
                          <div className="flex h-9 w-7 shrink-0 items-center justify-center rounded border border-[#e6dcc6] bg-amber-50/60 text-slate-400">
                            <User className="h-3.5 w-3.5" />
                          </div>
                        )}
                        <span className="font-semibold text-slate-900 font-arabic text-sm">
                          {s.NAME}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono-tabular text-slate-700 whitespace-nowrap">
                      {s.NIK || '-'}
                    </td>
                    <td className="px-3 py-2.5 font-mono-tabular text-slate-700 whitespace-nowrap">
                      {s.KK_NUMBER || '-'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                      {s.BIRTH_PLACE || '-'}
                    </td>
                    <td className="px-3 py-2.5 font-mono-tabular text-slate-700 whitespace-nowrap">
                      {s.BIRTH_DATE || '-'}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono-tabular whitespace-nowrap">
                      {s.GENDER || '-'}
                    </td>
                    <td className="px-3 py-2.5 font-mono-tabular text-slate-700 whitespace-nowrap">
                      {s.NISN || '-'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-800 font-arabic text-sm whitespace-nowrap">
                      {s.FATHER_NAME || '-'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-800 font-arabic text-sm whitespace-nowrap">
                      {s.MOTHER_NAME || '-'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="font-semibold text-slate-800 font-arabic text-sm">
                        {s.WALI_NAME || s.PARENT_NAME || '-'}
                      </div>
                      {s.WALI_RELATION && (
                        <div className="text-[10px] font-medium text-emerald-800">
                          {s.WALI_RELATION}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 max-w-[220px] truncate" title={s.WALI_ADDRESS || ''}>
                      {s.WALI_ADDRESS || '-'}
                    </td>
                    <td className="px-3 py-2.5 font-mono-tabular text-slate-700 whitespace-nowrap">
                      {s.RT_RW || '-'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                      {s.VILLAGE || '-'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                      {s.DISTRICT || '-'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                      {s.REGENCY || '-'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                      {s.PROVINCE || '-'}
                    </td>
                    <td className="px-3 py-2.5 font-mono-tabular text-slate-700 whitespace-nowrap">
                      {s.KEDATANGAN || '-'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                      {computeMasaBelajar(s.KEDATANGAN, s.STATUS, s.STATUS_DATE, s.MASA_BELAJAR) ||
                        '-'}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                      <div>{className}</div>
                      {promoResult && promoResult !== 'BELUM' && (
                        <span
                          className={`inline-block mt-0.5 text-[10px] font-bold ${
                            promoResult === 'TINGGAL'
                              ? 'text-red-700'
                              : promoResult === 'LULUS'
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                          }`}
                        >
                          {promoResult}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-semibold whitespace-nowrap">
                      <span
                        className={
                          s.STATUS === 'AKTIF'
                            ? 'text-emerald-700'
                            : s.STATUS === 'LULUS'
                              ? 'text-amber-700'
                              : 'text-red-600'
                        }
                      >
                        {s.STATUS}
                      </span>
                      {s.STATUS !== 'AKTIF' && s.STATUS_DATE && (
                        <div className="text-[10px] font-mono-tabular font-normal text-slate-500 mt-0.5">
                          {s.STATUS_DATE}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setBiodataTarget({ student: s, className })}
                          className="rounded-md border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-800 hover:bg-emerald-100"
                          title="PDF Biodata Siswa"
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </button>
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setParentSearchQuery('');
                                setParentDropdownOpen(false);
                                setEditing({
                                  ...s,
                                  KEDATANGAN: normalizeDateInput(s.KEDATANGAN) || s.KEDATANGAN || '',
                                  STATUS_DATE: normalizeDateInput(s.STATUS_DATE) || s.STATUS_DATE || '',
                                  CLASS_ID: effectiveClassId || s.CLASS_ID,
                                });
                              }}
                              className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                              title="Edit Siswa"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(s)}
                              className="rounded-md border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50"
                              title="Hapus Siswa"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={23} className="py-12 text-center text-sm text-slate-400">
                    Tidak ada data siswa yang sesuai untuk tahun ajaran ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal
          title={editing.STUDENT_ID ? 'Edit Siswa' : 'Tambah Siswa'}
          onClose={() => setEditing(null)}
          maxWidthClass="max-w-3xl"
          footer={
            <div className="flex w-full items-center justify-between gap-2">
              <div>
                {editing.STUDENT_ID && (
                  <button
                    type="button"
                    onClick={() => {
                      const clsName = classMap.get(editing.CLASS_ID || '')?.CLASS_NAME || '-';
                      setBiodataTarget({
                        student: editing as StudentRecord,
                        className: clsName,
                      });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/30 bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
                  >
                    <FileText className="h-4 w-4" />
                    PDF Biodata
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-lg border border-[#d9ceb5] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-amber-50/60"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  form="studentForm"
                  disabled={busy || photoBusy}
                  className="rounded-lg bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white ring-1 ring-[#d4af37]/35 hover:bg-[#043b2c] disabled:opacity-50"
                >
                  {busy ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          }
        >
          <form id="studentForm" onSubmit={handleSaveStudent} className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {(idValidationError || statusDateValidationError) && (
              <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 space-y-0.5">
                {idValidationError && <div>{idValidationError}</div>}
                {statusDateValidationError && <div>{statusDateValidationError}</div>}
              </div>
            )}

            {/* Upload Foto Siswa */}
            <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-[#e6dcc6] bg-amber-50/35 p-3.5">
              <div className="h-28 w-21 shrink-0 overflow-hidden rounded-lg border border-[#d9ceb5] bg-white flex items-center justify-center shadow-xs">
                {editing.PHOTO ? (
                  <img
                    src={editing.PHOTO}
                    alt={editing.NAME || 'Foto Siswa'}
                    className="h-full w-full object-cover object-top"
                  />
                ) : (
                  <div className="flex flex-col items-center text-slate-400 px-1 text-center">
                    <User className="h-7 w-7 opacity-60" />
                    <span className="mt-1 text-[10px]">Foto 3×4</span>
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <div className="text-xs font-bold text-[#042f24]">Foto Peserta Didik (3×4)</div>
                  <p className="text-[11px] text-slate-600">
                    Unggah foto formal siswa (JPG/PNG/WEBP) untuk ditampilkan pada tabel &amp; PDF Biodata.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#064e3b]/30 bg-white px-3 py-1.5 text-xs font-semibold text-[#064e3b] hover:bg-emerald-50">
                    <Camera className="h-3.5 w-3.5" />
                    {photoBusy ? 'Memproses...' : editing.PHOTO ? 'Ganti Foto' : 'Upload Foto'}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={photoBusy}
                      onChange={handlePhotoSelect}
                      className="hidden"
                    />
                  </label>
                  {editing.PHOTO && (
                    <button
                      type="button"
                      onClick={() => setEditing((prev) => (prev ? { ...prev, PHOTO: '' } : prev))}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      Hapus Foto
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">1. NIS</label>
              <input
                className={`${INPUT_CLASS} font-mono-tabular`}
                value={editing.NIS || ''}
                onChange={(e) => setEditing({ ...editing, NIS: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                2. Nama Lengkap *
              </label>
              <input
                required
                className={`${INPUT_CLASS} font-arabic`}
                value={editing.NAME || ''}
                onChange={(e) => setEditing({ ...editing, NAME: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">3. NIK</label>
              <input
                maxLength={16}
                placeholder="16 digit NIK"
                className={`${INPUT_CLASS} font-mono-tabular`}
                value={editing.NIK || ''}
                onChange={(e) => {
                  const nextNik = e.target.value;
                  const digits = nextNik.replace(/\D/g, '');
                  const info = parseNikInfo(nextNik);
                  setEditing((prev) =>
                    prev
                      ? {
                          ...prev,
                          NIK: nextNik,
                          ...(info ? { BIRTH_DATE: info.birthDate, GENDER: info.gender } : {}),
                        }
                      : prev
                  );
                  const prefix6 = digits.slice(0, 6);
                  if (prefix6.length === 6) {
                    if (prefix6 !== lastFetchedPrefixRef.current) {
                      lastFetchedPrefixRef.current = prefix6;
                      api
                        .lookupNikWilayah(prefix6)
                        .then((res) => {
                          if (editingNikRef.current.slice(0, 6) !== prefix6) return;
                          setNikVillages(res.villages || []);
                          if (res.province || res.regency || res.district) {
                            setEditing((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    PROVINCE: res.province || prev.PROVINCE || '',
                                    REGENCY: res.regency || prev.REGENCY || '',
                                    DISTRICT: res.district || prev.DISTRICT || '',
                                    VILLAGE: res.defaultVillage || prev.VILLAGE || '',
                                  }
                                : prev
                            );
                            setNikWilayahStatus(
                              `Wilayah terisi otomatis (${res.district ? `${res.district}, ` : ''}${res.regency}) — dapat diedit.`
                            );
                          } else {
                            setNikWilayahStatus('');
                          }
                        })
                        .catch(() => {
                          setNikWilayahStatus('');
                        });
                    }
                  } else {
                    lastFetchedPrefixRef.current = '';
                    setNikVillages([]);
                    setNikWilayahStatus('');
                  }
                }}
              />
              {parsedNikInfo && (
                <p className="mt-1 text-[11px] font-medium text-emerald-700">
                  Tgl lahir ({parsedNikInfo.birthDate}) &amp; JK ({parsedNikInfo.gender}) terisi otomatis dari NIK.
                </p>
              )}
              {nikWilayahStatus && (
                <p className="mt-0.5 text-[11px] font-medium text-emerald-700">
                  {nikWilayahStatus}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">4. Nomor KK</label>
              <input
                maxLength={16}
                placeholder="16 digit No. KK"
                className={`${INPUT_CLASS} font-mono-tabular`}
                value={editing.KK_NUMBER || ''}
                onChange={(e) => {
                  const nextKk = e.target.value;
                  const parents = findParentsByKk(nextKk, students, editing.STUDENT_ID);
                  setEditing((prev) =>
                    prev
                      ? {
                          ...prev,
                          KK_NUMBER: nextKk,
                          ...(parents
                            ? {
                                FATHER_NAME: parents.fatherName || prev.FATHER_NAME || '',
                                MOTHER_NAME: parents.motherName || prev.MOTHER_NAME || '',
                              }
                            : {}),
                        }
                      : prev
                  );
                }}
              />
              {matchedKkParents && (
                <p className="mt-1 text-[11px] font-medium text-emerald-700">
                  No. KK cocok — Nama Ayah &amp; Ibu diisi otomatis.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                5. Tempat Lahir
              </label>
              <input
                className={INPUT_CLASS}
                value={editing.BIRTH_PLACE || ''}
                onChange={(e) => setEditing({ ...editing, BIRTH_PLACE: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                6. Tanggal Lahir
              </label>
              <input
                type="date"
                className={`${INPUT_CLASS} font-mono-tabular`}
                value={editing.BIRTH_DATE || ''}
                onChange={(e) => setEditing({ ...editing, BIRTH_DATE: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                7. Jenis Kelamin
              </label>
              <select
                className={INPUT_CLASS}
                value={editing.GENDER || 'L'}
                onChange={(e) => setEditing({ ...editing, GENDER: e.target.value })}
              >
                <option value="L">L (Laki-laki)</option>
                <option value="P">P (Perempuan)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">8. NISN</label>
              <input
                className={`${INPUT_CLASS} font-mono-tabular`}
                value={editing.NISN || ''}
                onChange={(e) => setEditing({ ...editing, NISN: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                9. Nama Ayah (اسم الأب)
              </label>
              <input
                className={`${INPUT_CLASS} font-arabic`}
                value={editing.FATHER_NAME || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setEditing((prev) =>
                    prev
                      ? {
                          ...prev,
                          FATHER_NAME: val,
                          ...(prev.WALI_MODE === 'AYAH' ? { WALI_NAME: val } : {}),
                        }
                      : prev
                  );
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                10. Nama Ibu
              </label>
              <input
                className={`${INPUT_CLASS} font-arabic`}
                value={editing.MOTHER_NAME || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setEditing((prev) =>
                    prev
                      ? {
                          ...prev,
                          MOTHER_NAME: val,
                          ...(prev.WALI_MODE === 'IBU' ? { WALI_NAME: val } : {}),
                        }
                      : prev
                  );
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">11. RT/RW</label>
              <input
                placeholder="001/002"
                className={`${INPUT_CLASS} font-mono-tabular`}
                value={editing.RT_RW || ''}
                onChange={(e) => setEditing({ ...editing, RT_RW: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                12. Desa/Kel
                {nikVillages.length > 0 && (
                  <span className="ml-1 font-normal text-emerald-700">
                    ({nikVillages.length} pilihan dari kecamatan)
                  </span>
                )}
              </label>
              <input
                list="nik-villages-list"
                className={INPUT_CLASS}
                value={editing.VILLAGE || ''}
                onChange={(e) => setEditing({ ...editing, VILLAGE: e.target.value })}
              />
              <datalist id="nik-villages-list">
                {nikVillages.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                13. Kecamatan
              </label>
              <input
                className={INPUT_CLASS}
                value={editing.DISTRICT || ''}
                onChange={(e) => setEditing({ ...editing, DISTRICT: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                14. Kabupaten/Kota
              </label>
              <input
                className={INPUT_CLASS}
                value={editing.REGENCY || ''}
                onChange={(e) => setEditing({ ...editing, REGENCY: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                15. Provinsi
              </label>
              <input
                className={INPUT_CLASS}
                value={editing.PROVINCE || ''}
                onChange={(e) => setEditing({ ...editing, PROVINCE: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                16. Tanggal Kedatangan
              </label>
              <input
                type="date"
                className={`${INPUT_CLASS} font-mono-tabular`}
                value={normalizeDateInput(editing.KEDATANGAN)}
                onChange={(e) => {
                  const nextKedatangan = e.target.value;
                  setEditing((prev) =>
                    prev
                      ? {
                          ...prev,
                          KEDATANGAN: nextKedatangan,
                          MASA_BELAJAR: computeMasaBelajar(
                            nextKedatangan,
                            prev.STATUS,
                            prev.STATUS_DATE,
                            ''
                          ),
                        }
                      : prev
                  );
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                17. Masa Belajar
              </label>
              <input
                readOnly={Boolean(normalizeDateInput(editing.KEDATANGAN))}
                placeholder="Otomatis dari tgl kedatangan"
                className={`${INPUT_CLASS} ${
                  normalizeDateInput(editing.KEDATANGAN) ? 'bg-amber-50/50 font-semibold text-emerald-900' : ''
                }`}
                value={liveMasaBelajar}
                onChange={(e) => setEditing({ ...editing, MASA_BELAJAR: e.target.value })}
              />
              {normalizeDateInput(editing.KEDATANGAN) && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {editing.STATUS === 'NONAKTIF' || editing.STATUS === 'LULUS'
                    ? `Dihitung dari Kedatangan s.d. Tanggal ${editing.STATUS === 'LULUS' ? 'Lulus' : 'Nonaktif'}.`
                    : 'Dihitung otomatis dari Kedatangan s.d. hari ini.'}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas *</label>
              <select
                required
                className={INPUT_CLASS}
                value={editing.CLASS_ID || ''}
                onChange={(e) => setEditing({ ...editing, CLASS_ID: e.target.value })}
              >
                <option value="">Pilih Kelas</option>
                {(yearClasses.length ? yearClasses : classes).map((c) => (
                  <option key={c.CLASS_ID} value={c.CLASS_ID}>
                    {c.CLASS_NAME} ({c.ACADEMIC_YEAR})
                  </option>
                ))}
                {editing.CLASS_ID &&
                  !(yearClasses.length ? yearClasses : classes).some(
                    (c) => c.CLASS_ID === editing.CLASS_ID
                  ) &&
                  classMap.has(editing.CLASS_ID) && (
                    <option value={editing.CLASS_ID}>
                      {classMap.get(editing.CLASS_ID)?.CLASS_NAME} (
                      {classMap.get(editing.CLASS_ID)?.ACADEMIC_YEAR})
                    </option>
                  )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                className={INPUT_CLASS}
                value={editing.STATUS || 'AKTIF'}
                onChange={(e) => {
                  const nextStatus = e.target.value;
                  setEditing((prev) =>
                    prev
                      ? {
                          ...prev,
                          STATUS: nextStatus,
                          STATUS_DATE: nextStatus === 'AKTIF' ? '' : prev.STATUS_DATE || '',
                          MASA_BELAJAR: computeMasaBelajar(
                            prev.KEDATANGAN,
                            nextStatus,
                            nextStatus === 'AKTIF' ? '' : prev.STATUS_DATE,
                            ''
                          ),
                        }
                      : prev
                  );
                }}
              >
                <option value="AKTIF">AKTIF</option>
                <option value="LULUS">LULUS</option>
                <option value="NONAKTIF">NONAKTIF</option>
              </select>
            </div>
            {(editing.STATUS === 'NONAKTIF' || editing.STATUS === 'LULUS') && (
              <div>
                <label className="block text-xs font-semibold text-red-700 mb-1">
                  Tanggal {editing.STATUS === 'LULUS' ? 'Lulus' : 'Nonaktif'} *
                </label>
                <input
                  type="date"
                  required
                  className={`${INPUT_CLASS} font-mono-tabular border-red-300 focus:border-red-600 focus:ring-red-600/15`}
                  value={normalizeDateInput(editing.STATUS_DATE)}
                  onChange={(e) => {
                    const nextDate = e.target.value;
                    setEditing((prev) =>
                      prev
                        ? {
                            ...prev,
                            STATUS_DATE: nextDate,
                            MASA_BELAJAR: computeMasaBelajar(
                              prev.KEDATANGAN,
                              prev.STATUS,
                              nextDate,
                              ''
                            ),
                          }
                        : prev
                    );
                  }}
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Telepon</label>
              <input
                className={`${INPUT_CLASS} font-mono-tabular`}
                value={editing.PHONE || ''}
                onChange={(e) => setEditing({ ...editing, PHONE: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alamat Lengkap (Opsional — otomatis terisi dari RT/RW s.d. Provinsi jika dikosongkan)
              </label>
              <textarea
                rows={2}
                className={INPUT_CLASS}
                value={editing.ADDRESS || ''}
                onChange={(e) => setEditing({ ...editing, ADDRESS: e.target.value })}
              />
            </div>

            {/* Data Wali Siswa */}
            <div className="sm:col-span-2 rounded-xl border border-[#d9ceb5] bg-amber-50/35 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-[#042f24]">Data Wali Peserta Didik</div>
                  <p className="text-[11px] text-slate-600">
                    Pilih dari Ayah/Ibu siswa ini, cari data orang tua yang sudah ada, atau isi manual.
                  </p>
                </div>
              </div>

              {/* Pilihan Mode Input Wali */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    editing.WALI_MODE === 'AYAH'
                      ? 'border-[#064e3b] bg-[#064e3b] text-white'
                      : 'border-[#d9ceb5] bg-white text-slate-700 hover:bg-amber-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={editing.WALI_MODE === 'AYAH'}
                    onChange={(e) => applyWaliMode(e.target.checked ? 'AYAH' : 'MANUAL')}
                    className="h-3.5 w-3.5 rounded accent-[#d4af37]"
                  />
                  <span>Ayah</span>
                </label>

                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    editing.WALI_MODE === 'IBU'
                      ? 'border-[#064e3b] bg-[#064e3b] text-white'
                      : 'border-[#d9ceb5] bg-white text-slate-700 hover:bg-amber-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={editing.WALI_MODE === 'IBU'}
                    onChange={(e) => applyWaliMode(e.target.checked ? 'IBU' : 'MANUAL')}
                    className="h-3.5 w-3.5 rounded accent-[#d4af37]"
                  />
                  <span>Ibu</span>
                </label>

                <button
                  type="button"
                  onClick={() => applyWaliMode('ORANG_TUA')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${
                    editing.WALI_MODE === 'ORANG_TUA'
                      ? 'border-[#064e3b] bg-[#064e3b] text-white'
                      : 'border-[#d9ceb5] bg-white text-slate-700 hover:bg-amber-50'
                  }`}
                >
                  <Search className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Cari Orang Tua</span>
                </button>

                <button
                  type="button"
                  onClick={() => applyWaliMode('MANUAL')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${
                    editing.WALI_MODE === 'MANUAL' || !editing.WALI_MODE
                      ? 'border-[#064e3b] bg-[#064e3b] text-white'
                      : 'border-[#d9ceb5] bg-white text-slate-700 hover:bg-amber-50'
                  }`}
                >
                  <Pencil className="h-3.5 w-3.5 shrink-0" />
                  <span>Tulis Manual</span>
                </button>
              </div>

              {/* Search Dropdown Data Orang Tua yang Ada */}
              {editing.WALI_MODE === 'ORANG_TUA' && (
                <div ref={parentDropdownRef} className="relative">
                  <label className="block text-[11px] font-semibold text-emerald-900 mb-1">
                    Cari Data Orang Tua / Wali yang Sudah Ada ({parentDirectory.length} tersedia)
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={parentSearchQuery}
                      onFocus={() => setParentDropdownOpen(true)}
                      onChange={(e) => {
                        setParentSearchQuery(e.target.value);
                        setParentDropdownOpen(true);
                      }}
                      placeholder="Ketik nama ayah/ibu/wali, nama siswa, No. KK, atau alamat..."
                      className={`${INPUT_CLASS} pl-8 pr-12`}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {parentSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setParentSearchQuery('')}
                          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setParentDropdownOpen((prev) => !prev)}
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {parentDropdownOpen && (
                    <div className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[#d9ceb5] bg-white py-1 shadow-lg">
                      {filteredParents.length ? (
                        filteredParents.map((entry) => (
                          <button
                            key={entry.key}
                            type="button"
                            onClick={() => {
                              setEditing((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      WALI_MODE: 'ORANG_TUA',
                                      WALI_NAME: entry.name,
                                      WALI_RELATION: entry.defaultRelation,
                                      WALI_ADDRESS: entry.address || prev.WALI_ADDRESS || '',
                                      PHONE: prev.PHONE || entry.phone || '',
                                    }
                                  : prev
                              );
                              setParentSearchQuery(entry.name);
                              setParentDropdownOpen(false);
                            }}
                            className="flex w-full flex-col gap-0.5 border-b border-slate-100 px-3 py-2 text-left text-xs hover:bg-amber-50 last:border-b-0"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-900 font-arabic text-sm">
                                {entry.name}
                              </span>
                              <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                                {entry.roleLabel} · {entry.studentName}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {entry.kkNumber ? `KK ${entry.kkNumber} · ` : ''}
                              {entry.address || 'Alamat belum diisi'}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-4 text-center text-xs text-slate-500">
                          Data orang tua tidak ditemukan.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Wali
                  </label>
                  <input
                    className={`${INPUT_CLASS} font-arabic`}
                    placeholder="Nama lengkap wali"
                    value={editing.WALI_NAME || ''}
                    onChange={(e) => {
                      const nextName = e.target.value;
                      setEditing((prev) =>
                        prev
                          ? {
                              ...prev,
                              WALI_NAME: nextName,
                              WALI_MODE:
                                prev.WALI_MODE === 'AYAH' || prev.WALI_MODE === 'IBU'
                                  ? 'MANUAL'
                                  : prev.WALI_MODE,
                            }
                          : prev
                      );
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Hubungan Keluarga
                  </label>
                  <input
                    list="wali-relation-options"
                    className={INPUT_CLASS}
                    placeholder="Contoh: Ayah Kandung, Paman, Kakek"
                    value={editing.WALI_RELATION || ''}
                    onChange={(e) =>
                      setEditing((prev) => (prev ? { ...prev, WALI_RELATION: e.target.value } : prev))
                    }
                  />
                  <datalist id="wali-relation-options">
                    <option value="Ayah Kandung" />
                    <option value="Ibu Kandung" />
                    <option value="Kakek" />
                    <option value="Nenek" />
                    <option value="Paman" />
                    <option value="Bibi" />
                    <option value="Kakak" />
                    <option value="Saudara" />
                    <option value="Wali Asuh" />
                    <option value="Lainnya" />
                  </datalist>
                </div>
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Alamat Wali
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setEditing((prev) =>
                          prev ? { ...prev, WALI_ADDRESS: composeStudentAddress(prev) } : prev
                        )
                      }
                      className="text-[11px] font-semibold text-emerald-800 hover:underline"
                    >
                      Samakan dengan Alamat Siswa
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    className={INPUT_CLASS}
                    placeholder="Alamat domisili wali"
                    value={editing.WALI_ADDRESS || ''}
                    onChange={(e) =>
                      setEditing((prev) => (prev ? { ...prev, WALI_ADDRESS: e.target.value } : prev))
                    }
                  />
                </div>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {importOpen && (
        <Modal
          title="Import Data Siswa dari Excel"
          onClose={() => setImportOpen(false)}
          maxWidthClass="max-w-lg"
        >
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-slate-600">
              Unggah file <code>.xlsx</code>, <code>.xls</code>, atau <code>.csv</code> sesuai urutan
              kolom template: <b>NIS</b>, <b>NAMA LENGKAP</b>, <b>NIK</b>, <b>NOMOR KK</b>,{' '}
              <b>TEMPAT LAHIR</b>, <b>TANGGAL LAHIR</b>, <b>JENIS KELAMIN</b>, <b>NISN</b>,{' '}
              <b>NAMA AYAH</b>, <b>NAMA IBU</b>, <b>NAMA WALI</b>, <b>HUBUNGAN KELUARGA</b>,{' '}
              <b>ALAMAT WALI</b>, <b>RT/RW</b>, <b>DESA/KEL</b>, <b>KECAMATAN</b>,{' '}
              <b>KABUPATEN/KOTA</b>, <b>PROVINSI</b>, <b>KEDATANGAN</b>, <b>MASABELAJAR</b>, dan{' '}
              <b>NAMA_KELAS</b>. (NIS, NISN, dan NIK tidak boleh sama; tanggal lahir otomatis diisi
              dari NIK dan nama ayah/ibu otomatis diisi dari No. KK jika kosong).
            </p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={busy}
              onChange={handleImportFile}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-emerald-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-emerald-800"
            />
            {busy && <div className="text-xs font-semibold text-emerald-700">Mengimpor data...</div>}
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Hapus Data Siswa"
          message={`Apakah Anda yakin ingin menghapus data siswa "${deleteTarget.NAME}"?`}
          confirmLabel="Hapus Siswa"
          busy={busy}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}

      {biodataTarget && (
        <StudentBiodataModal
          student={biodataTarget.student}
          className={biodataTarget.className}
          settings={settings}
          onClose={() => setBiodataTarget(null)}
        />
      )}
      </div>

      {biodataTarget && (
        <div className="hidden print:block">
          <StudentBiodataSheet
            student={biodataTarget.student}
            className={biodataTarget.className}
            settings={settings}
          />
        </div>
      )}
    </>
  );
}
