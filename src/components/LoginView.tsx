import React, { useState } from 'react';
import { BookOpen, LogIn } from 'lucide-react';
import { api } from '../api/client.ts';
import type { AppSettings, AppStateResponse, SafeUser } from '../types/erapor.ts';

interface LoginViewProps {
  appState: AppStateResponse;
  onSuccess: (token: string, user: SafeUser, settings: AppSettings) => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

const DEMO_ACCOUNTS = [
  { label: 'Admin', username: 'admin', pass: 'admin123' },
  { label: 'Wali Kelas', username: 'walikelas', pass: 'wali123' },
  { label: 'Guru', username: 'guru', pass: 'guru123' },
  { label: 'Kepala Sekolah', username: 'kepsek', pass: 'kepsek123' },
];

export function LoginView({ appState, onSuccess, onToast }: LoginViewProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.login(username, password);
      sessionStorage.setItem('erapor_token', res.token);
      onSuccess(res.token, res.user, res.settings);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Login gagal.', 'err');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-[#f6f2e8]">
      <section className="hidden lg:flex lg:col-span-6 flex-col justify-between bg-gradient-to-b from-[#064e3b] via-[#064534] to-[#042f24] border-r border-[#d4af37]/35 px-14 py-14 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#042f24] ring-1 ring-[#d4af37]/60 text-[#f3d16c]">
            <BookOpen className="h-5 w-5" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-[#f3d16c]">
            Sistem Informasi Penilaian Pesantren
          </span>
        </div>

        <div className="my-auto py-12">
          <div className="mb-4 h-0.5 w-14 bg-[#d4af37]" />
          <h1 className="text-4xl font-extrabold tracking-tight leading-tight text-balance font-arabic text-white">
            {appState.schoolName || 'eRapor Sekolah v2'}
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-emerald-50/90">
            Kelola data peserta didik, nilai PTS/PAS, penilaian Syakhsiyah, rekapitulasi peringkat,
            transkrip lintas tahun ajaran, dan rapor A4 bahasa Arab secara terstruktur.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-[#f3d16c]/90 border-t border-[#d4af37]/25 pt-6">
          <span>Jenjang {appState.schoolLevel || 'WUSTHA'}</span>
          <span aria-hidden="true">·</span>
          <span>Rapor 1 Lembar A4</span>
          <span aria-hidden="true">·</span>
          <span>Terbilang Arab Otomatis</span>
        </div>
      </section>

      <section className="lg:col-span-6 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md rounded-xl border border-[#e6dcc6] bg-[#fdfaf3] p-7 sm:p-9 shadow-[0_10px_28px_rgba(4,47,36,0.08)]">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#064e3b] text-[#f3d16c] ring-1 ring-[#d4af37]/50">
              <BookOpen className="h-4 w-4" />
            </div>
            <span className="font-arabic text-base font-bold text-[#042f24]">
              {appState.schoolName || 'eRapor Sekolah v2'}
            </span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-[#042f24]">Masuk ke eRapor</h2>
          <p className="mt-1 text-sm text-slate-600">
            Masukkan username dan password sesuai hak akses Anda.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Username</label>
              <input
                className="w-full rounded-lg border border-[#d9ceb5] bg-white px-3.5 py-2.5 text-sm transition-colors focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
              <input
                type="password"
                className="w-full rounded-lg border border-[#d9ceb5] bg-white px-3.5 py-2.5 text-sm transition-colors focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#064e3b] to-[#053f30] px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-[#d4af37]/40 shadow-xs transition-all hover:brightness-110 disabled:opacity-50"
            >
              <LogIn className="h-4 w-4 text-[#f3d16c]" />
              {busy ? 'Memverifikasi...' : 'Masuk'}
            </button>
          </form>

          <div className="mt-6 border-t border-[#e6dcc6] pt-5">
            <p className="text-xs font-semibold text-slate-700 mb-2.5">
              Akun awal multi-role (klik untuk mengisi):
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.username}
                  type="button"
                  onClick={() => {
                    setUsername(acc.username);
                    setPassword(acc.pass);
                  }}
                  className="rounded-lg border border-[#e2d6bc] bg-white px-3 py-2 text-left transition-colors hover:border-[#d4af37] hover:bg-amber-50/60"
                >
                  <div className="text-xs font-semibold text-[#042f24]">{acc.label}</div>
                  <div className="text-[11px] font-mono-tabular text-slate-500">
                    {acc.username} / {acc.pass}
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-amber-800">
              Demi keamanan, Admin disarankan mengganti seluruh password awal di menu Pengguna.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
