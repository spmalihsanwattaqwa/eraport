import React from 'react';
import { Printer, User } from 'lucide-react';
import type { AppSettings, StudentRecord } from '../types/erapor.ts';
import { isFemaleGender } from '../utils/arabic.ts';
import {
  composeStudentAddress,
  computeMasaBelajar,
  formatIndonesianDate,
} from '../utils/studentUtils.ts';
import { Modal } from './Modal.tsx';

interface StudentBiodataSheetProps {
  student: StudentRecord;
  className?: string;
  settings?: AppSettings;
}

export function StudentBiodataSheet({
  student,
}: StudentBiodataSheetProps) {
  const fullAddress = composeStudentAddress(student) || '-';
  const masaBelajar =
    computeMasaBelajar(student.KEDATANGAN, student.STATUS, student.STATUS_DATE, student.MASA_BELAJAR) ||
    '-';
  const isFemale = isFemaleGender(student.GENDER);
  const genderLabel =
    isFemale ? 'Perempuan' : student.GENDER === 'L' ? 'Laki-laki' : student.GENDER || '-';
  const birthPlaceDate = [
    student.BIRTH_PLACE || '',
    student.BIRTH_DATE ? formatIndonesianDate(student.BIRTH_DATE) : '',
  ]
    .filter(Boolean)
    .join(', ');

  const waliName = student.WALI_NAME || student.PARENT_NAME || '-';
  const waliRelation = student.WALI_RELATION || '-';
  const waliAddress = student.WALI_ADDRESS || '-';

  const rowClass = 'border-b border-slate-300';
  const labelClass = 'py-1.5 pr-2 text-black font-medium w-[195px] align-top';
  const sepClass = 'py-1.5 px-1.5 text-black w-3 align-top';
  const valClass = 'py-1.5 text-black font-medium align-top';

  return (
    <div className="print-only-sheet mx-auto w-full max-w-[794px] bg-white p-7 text-black border border-slate-300 text-[12px] leading-relaxed">
      {/* Judul + Pas Foto */}
      <div className="flex items-start justify-between gap-5 border-b-2 border-black pb-4 mb-4">
        <div className="flex-1 pt-2">
          <div className="text-lg font-bold tracking-wide text-black uppercase">
            Biodata Peserta Didik
          </div>
          <div className="font-arabic text-base font-bold text-black mt-0.5">
            {isFemale ? 'بيانات الطالبة الشخصية' : 'بيانات الطالب الشخصية'}
          </div>
        </div>

        {/* Bingkai Pas Foto 3x4 */}
        <div className="w-[104px] h-[138px] shrink-0 overflow-hidden rounded border border-black bg-white flex flex-col items-center justify-center">
          {student.PHOTO ? (
            <img
              src={student.PHOTO}
              alt={`Foto ${student.NAME}`}
              className="h-full w-full object-cover object-top"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-black px-2 text-center">
              <User className="h-8 w-8 mb-1 opacity-70" />
              <span className="text-[10px] font-medium">Pas Foto 3×4</span>
            </div>
          )}
        </div>
      </div>

      {/* Bagian A: Identitas Siswa */}
      <div className="mb-4">
        <div className="bg-slate-100 border-l-4 border-black px-2.5 py-1 text-xs font-bold text-black uppercase tracking-wide mb-1.5">
          A. Identitas Peserta Didik
        </div>
        <table className="w-full border-collapse">
          <tbody>
            <tr className={rowClass}>
              <td className={labelClass}>1. Nama Lengkap</td>
              <td className={sepClass}>:</td>
              <td className={`${valClass} font-arabic text-sm font-bold`}>{student.NAME || '-'}</td>
            </tr>
            <tr className={rowClass}>
              <td className={labelClass}>2. NIS / NISN</td>
              <td className={sepClass}>:</td>
              <td className={`${valClass} font-mono-tabular`}>
                {student.NIS || '-'} / {student.NISN || '-'}
              </td>
            </tr>
            <tr className={rowClass}>
              <td className={labelClass}>3. NIK</td>
              <td className={sepClass}>:</td>
              <td className={`${valClass} font-mono-tabular`}>{student.NIK || '-'}</td>
            </tr>
            <tr className={rowClass}>
              <td className={labelClass}>4. Nomor Kartu Keluarga</td>
              <td className={sepClass}>:</td>
              <td className={`${valClass} font-mono-tabular`}>{student.KK_NUMBER || '-'}</td>
            </tr>
            <tr className={rowClass}>
              <td className={labelClass}>5. Tempat, Tanggal Lahir</td>
              <td className={sepClass}>:</td>
              <td className={valClass}>{birthPlaceDate || '-'}</td>
            </tr>
            <tr className={rowClass}>
              <td className={labelClass}>6. Jenis Kelamin</td>
              <td className={sepClass}>:</td>
              <td className={valClass}>{genderLabel}</td>
            </tr>
            <tr className={rowClass}>
              <td className={labelClass}>7. Agama</td>
              <td className={sepClass}>:</td>
              <td className={valClass}>{student.RELIGION || 'Islam'}</td>
            </tr>
            <tr className={rowClass}>
              <td className={labelClass}>8. Nomor Telepon / HP</td>
              <td className={sepClass}>:</td>
              <td className={`${valClass} font-mono-tabular`}>{student.PHONE || '-'}</td>
            </tr>
            <tr className={rowClass}>
              <td className={labelClass}>9. Tanggal Kedatangan</td>
              <td className={sepClass}>:</td>
              <td className={valClass}>
                {student.KEDATANGAN ? formatIndonesianDate(student.KEDATANGAN) : '-'}
              </td>
            </tr>
            <tr className={rowClass}>
              <td className={labelClass}>10. Masa Belajar</td>
              <td className={sepClass}>:</td>
              <td className={valClass}>{masaBelajar}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Bagian B: Alamat Domisili */}
      <div className="mb-4">
        <div className="bg-slate-100 border-l-4 border-black px-2.5 py-1 text-xs font-bold text-black uppercase tracking-wide mb-1.5">
          B. Alamat Domisili Peserta Didik
        </div>
        <table className="w-full border-collapse">
          <tbody>
            <tr className={rowClass}>
              <td className={labelClass}>1. Alamat Lengkap</td>
              <td className={sepClass}>:</td>
              <td className={valClass}>{fullAddress}</td>
            </tr>
            <tr className={rowClass}>
              <td className={labelClass}>2. RT / RW</td>
              <td className={sepClass}>:</td>
              <td className={`${valClass} font-mono-tabular`}>{student.RT_RW || '-'}</td>
            </tr>
            <tr className={rowClass}>
              <td className={labelClass}>3. Desa / Kelurahan</td>
              <td className={sepClass}>:</td>
              <td className={valClass}>{student.VILLAGE || '-'}</td>
            </tr>
            <tr className={rowClass}>
              <td className={labelClass}>4. Kecamatan</td>
              <td className={sepClass}>:</td>
              <td className={valClass}>{student.DISTRICT || '-'}</td>
            </tr>
            <tr className={rowClass}>
              <td className={labelClass}>5. Kabupaten / Kota</td>
              <td className={sepClass}>:</td>
              <td className={valClass}>{student.REGENCY || '-'}</td>
            </tr>
            <tr className={rowClass}>
              <td className={labelClass}>6. Provinsi</td>
              <td className={sepClass}>:</td>
              <td className={valClass}>{student.PROVINCE || '-'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Bagian C: Identitas Orang Tua & Wali */}
      <div className="mb-6">
        <div className="bg-slate-100 border-l-4 border-black px-2.5 py-1 text-xs font-bold text-black uppercase tracking-wide mb-1.5">
          C. Identitas Orang Tua &amp; Wali
        </div>
        <table className="w-full border-collapse">
          <tbody>
            <tr className={rowClass}>
              <td className={labelClass}>1. Nama Ayah</td>
              <td className={sepClass}>:</td>
              <td className={`${valClass} font-arabic text-sm`}>{student.FATHER_NAME || '-'}</td>
            </tr>
            <tr className={rowClass}>
              <td className={labelClass}>2. Nama Ibu</td>
              <td className={sepClass}>:</td>
              <td className={`${valClass} font-arabic text-sm`}>{student.MOTHER_NAME || '-'}</td>
            </tr>
            <tr className={rowClass}>
              <td className={labelClass}>3. Nama Wali</td>
              <td className={sepClass}>:</td>
              <td className={`${valClass} font-arabic text-sm`}>{waliName}</td>
            </tr>
            <tr className={rowClass}>
              <td className={labelClass}>4. Hubungan Keluarga</td>
              <td className={sepClass}>:</td>
              <td className={valClass}>{waliRelation}</td>
            </tr>
            <tr className={rowClass}>
              <td className={labelClass}>5. Alamat Wali</td>
              <td className={sepClass}>:</td>
              <td className={valClass}>{waliAddress}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface StudentBiodataModalProps {
  student: StudentRecord;
  className: string;
  settings: AppSettings;
  onClose: () => void;
}

export function StudentBiodataModal({
  student,
  className,
  settings,
  onClose,
}: StudentBiodataModalProps) {
  return (
    <Modal
      title={`PDF Biodata Siswa — ${student.NAME}`}
      onClose={onClose}
      maxWidthClass="max-w-4xl"
      footer={
        <div className="flex w-full flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="text-xs text-slate-500">
            Pilih <span className="font-semibold text-slate-700">&ldquo;Save as PDF&rdquo;</span> pada
            dialog cetak untuk mengunduh file PDF (A4).
          </span>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#d9ceb5] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-amber-50/60"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white ring-1 ring-[#d4af37]/35 hover:bg-[#043b2c]"
            >
              <Printer className="h-4 w-4 text-[#f3d16c]" />
              Cetak / Simpan PDF (A4)
            </button>
          </div>
        </div>
      }
    >
      <StudentBiodataSheet student={student} className={className} settings={settings} />
    </Modal>
  );
}
