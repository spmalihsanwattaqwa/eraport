import React, { useState } from 'react';
import { Rocket, School } from 'lucide-react';
import { api } from '../api/client.ts';
import { SCHOOL_LEVELS } from '../types/erapor.ts';
import { Modal } from './Modal.tsx';

interface SetupViewProps {
  warning?: string;
  onComplete: () => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

const INPUT_CLASS =
  'w-full rounded-lg border border-[#d9ceb5] bg-white px-3 py-2 text-sm text-slate-950 transition-colors focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none';

export function SetupView({ warning, onComplete, onToast }: SetupViewProps) {
  const [schoolName, setSchoolName] = useState('');
  const [schoolLevel, setSchoolLevel] = useState<string>('WUSTHA');
  const [academicYear, setAcademicYear] = useState('2026/2027');
  const [npsn, setNpsn] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [sheikhName, setSheikhName] = useState('');
  const [principal, setPrincipal] = useState('');
  const [principalNip, setPrincipalNip] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [sampleData, setSampleData] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accountsModal, setAccountsModal] = useState<
    { role: string; username: string; password: string }[] | null
  >(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.setupERapor({
        schoolName,
        schoolLevel,
        academicYear,
        npsn,
        city,
        address,
        sheikhName,
        principal,
        principalNip,
        adminName,
        adminEmail,
        username,
        password,
        sampleData,
      });
      setAccountsModal(res.initialAccounts);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Setup gagal.', 'err');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-[#f6f2e8]">
      <section className="hidden lg:flex lg:col-span-5 flex-col justify-between bg-gradient-to-b from-[#064e3b] via-[#064534] to-[#042f24] border-r border-[#d4af37]/35 px-12 py-14 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#042f24] ring-1 ring-[#d4af37]/60 text-[#f3d16c]">
            <School className="h-5 w-5" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-[#f3d16c]">
            Inisialisasi Lembaga Baru
          </span>
        </div>

        <div className="my-auto py-12">
          <div className="mb-4 h-0.5 w-14 bg-[#d4af37]" />
          <h1 className="text-4xl font-extrabold tracking-tight leading-tight text-balance">
            eRapor Sekolah v2
          </h1>
          <p className="mt-4 text-base leading-relaxed text-emerald-50/90">
            Sistem pengolahan nilai PTS/PAS, penilaian Syakhsiyah, konversi terbilang bahasa Arab
            otomatis, rekapitulasi peringkat kelas, dan pencetakan rapor A4 1 lembar lengkap.
          </p>
        </div>

        <div className="space-y-2 text-sm text-[#f3d16c]/90 border-t border-[#d4af37]/25 pt-6">
          <div>Multi-Role Hak Akses · Admin, Wali Kelas, Guru, Kepala Sekolah</div>
          <div>Jenjang Pendidikan · WUSTHA, ULYA, &apos;ALY</div>
          <div>Formula Fleksibel · Bobot PTS &amp; PAS + Paste Excel</div>
        </div>
      </section>

      <section className="lg:col-span-7 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-xl rounded-xl border border-[#e6dcc6] bg-[#fdfaf3] p-6 sm:p-8 shadow-[0_10px_28px_rgba(4,47,36,0.08)]">
          <h2 className="text-2xl font-bold tracking-tight text-[#042f24]">Setup Awal Sekolah</h2>
          <p className="mt-1 text-sm text-slate-800">
            Lengkapi identitas sekolah dan akun administrator untuk memulai database eRapor.
          </p>

          {warning && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {warning}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nama Sekolah (Bahasa Arab / Latin) *
              </label>
              <input
                className={`${INPUT_CLASS} font-arabic text-base`}
                required
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="Contoh: معهد التربية الإسلامية"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Jenjang *</label>
              <select
                className={INPUT_CLASS}
                value={schoolLevel}
                onChange={(e) => setSchoolLevel(e.target.value)}
              >
                {SCHOOL_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tahun Pelajaran *
              </label>
              <input
                className={`${INPUT_CLASS} font-mono-tabular`}
                required
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">NPSN</label>
              <input
                className={`${INPUT_CLASS} font-mono-tabular`}
                value={npsn}
                onChange={(e) => setNpsn(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Kota / Kabupaten
              </label>
              <input
                className={INPUT_CLASS}
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Alamat Sekolah
              </label>
              <textarea
                rows={2}
                className={INPUT_CLASS}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nama Pengasuh Pondok (شيخ المعهد)
              </label>
              <input
                className={`${INPUT_CLASS} font-arabic text-base`}
                value={sheikhName}
                onChange={(e) => setSheikhName(e.target.value)}
                placeholder="Ditampilkan pada tanda tangan rapor"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nama Kepala Sekolah
              </label>
              <input
                className={INPUT_CLASS}
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                NIP Kepala Sekolah
              </label>
              <input
                className={`${INPUT_CLASS} font-mono-tabular`}
                value={principalNip}
                onChange={(e) => setPrincipalNip(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nama Admin *
              </label>
              <input
                className={INPUT_CLASS}
                required
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="Nama lengkap admin"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Email Admin
              </label>
              <input
                type="email"
                className={INPUT_CLASS}
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Username Admin *
              </label>
              <input
                className={`${INPUT_CLASS} font-mono-tabular`}
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password Admin (Min. 6) *
              </label>
              <input
                type="text"
                minLength={6}
                className={`${INPUT_CLASS} font-mono-tabular`}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="sm:col-span-2 border-t border-[#e6dcc6] pt-3 text-xs text-slate-800">
              <div className="font-semibold text-slate-950 mb-0.5">Akun multi-role otomatis:</div>
              <div className="font-mono-tabular font-medium text-slate-800">
                Wali Kelas: walikelas / wali123 · Guru: guru / guru123 · Kepala Sekolah: kepsek /
                kepsek123
              </div>
            </div>

            <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={sampleData}
                onChange={(e) => setSampleData(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-700"
              />
              Buat kelas, mata pelajaran Arab, dan siswa contoh agar langsung siap uji coba
            </label>

            <div className="sm:col-span-2 pt-2">
              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#c89b2b] to-[#dfb547] px-4 py-2.5 text-sm font-bold text-[#042f24] shadow-xs transition-all hover:brightness-95 disabled:opacity-50"
              >
                <Rocket className="h-4 w-4" />
                {busy ? 'Menyiapkan Database...' : 'Buat Aplikasi Sekarang'}
              </button>
            </div>
          </form>
        </div>
      </section>

      {accountsModal && (
        <Modal
          title="Setup Berhasil"
          onClose={onComplete}
          hideCloseButton
          footer={
            <button
              type="button"
              onClick={onComplete}
              className="rounded-lg bg-[#064e3b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#043b2c]"
            >
              Lanjut ke Login
            </button>
          }
        >
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Database dan akun multi-role berhasil dibuat. Simpan daftar akun berikut:
          </div>
          <div className="overflow-x-auto rounded-lg border border-[#e6dcc6]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#064e3b] text-xs font-semibold text-amber-50">
                <tr>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Username</th>
                  <th className="px-4 py-2.5">Password</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee5d3] font-mono-tabular">
                {accountsModal.map((a) => (
                  <tr key={a.username}>
                    <td className="px-4 py-2.5 font-sans font-medium text-slate-900">{a.role}</td>
                    <td className="px-4 py-2.5 text-slate-700">{a.username}</td>
                    <td className="px-4 py-2.5 text-slate-700">{a.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-amber-800">
            Untuk keamanan, ubah password awal melalui menu Pengguna setelah login sebagai Admin.
          </p>
        </Modal>
      )}
    </div>
  );
}
