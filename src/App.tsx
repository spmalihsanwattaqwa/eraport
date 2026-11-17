import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  BarChart3,
  BookOpen,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  School,
  Settings,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { api } from './api/client.ts';
import { AcademicYearPromotionView } from './components/AcademicYearPromotionView.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { LoginView } from './components/LoginView.tsx';
import { ClassesView, ExtraAndNotesView, SubjectsView } from './components/MasterViews.tsx';
import { RecapView } from './components/RecapView.tsx';
import { ReportsView } from './components/ReportsView.tsx';
import { ScoresView } from './components/ScoresView.tsx';
import { SettingsView, type SettingsTabId, UsersView } from './components/SettingsAndUsersViews.tsx';
import { SetupView } from './components/SetupView.tsx';
import { StudentsView } from './components/StudentsView.tsx';
import type {
  AcademicYearRecord,
  AppSettings,
  AppStateResponse,
  ClassRecord,
  SafeUser,
  StudentEnrollmentRecord,
  StudentRecord,
  SubjectRecord,
} from './types/erapor.ts';

interface ToastItem {
  id: number;
  message: string;
  type: 'ok' | 'err';
}

type NavId =
  | 'dashboard'
  | 'students'
  | 'classes'
  | 'subjects'
  | 'promotions'
  | 'scores'
  | 'extracurricular'
  | 'notes'
  | 'report1'
  | 'report2'
  | 'recap'
  | 'settings'
  | 'users';

type NavGroup = 'Utama' | 'Penilaian & Rapor' | 'Sistem';

const NAV_ITEMS: {
  id: NavId;
  label: string;
  group: NavGroup;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'Utama', icon: LayoutDashboard },
  { id: 'students', label: 'Data Siswa', group: 'Utama', icon: GraduationCap },
  { id: 'classes', label: 'Data Kelas', group: 'Utama', icon: School },
  { id: 'subjects', label: 'Mata Pelajaran', group: 'Utama', icon: BookOpen },
  { id: 'promotions', label: 'Tahun Ajaran & Kenaikan', group: 'Utama', icon: TrendingUp },
  { id: 'scores', label: 'Penilaian', group: 'Penilaian & Rapor', icon: BarChart3 },
  { id: 'extracurricular', label: 'Ekstrakurikuler', group: 'Penilaian & Rapor', icon: Award },
  { id: 'notes', label: 'Catatan Guru', group: 'Penilaian & Rapor', icon: NotebookPen },
  { id: 'report1', label: 'Rapor Semester 1', group: 'Penilaian & Rapor', icon: FileText },
  { id: 'report2', label: 'Rapor Semester 2', group: 'Penilaian & Rapor', icon: FileText },
  { id: 'recap', label: 'Rekapitulasi', group: 'Penilaian & Rapor', icon: FileSpreadsheet },
  { id: 'settings', label: 'Pengaturan', group: 'Sistem', icon: Settings },
  { id: 'users', label: 'Pengguna', group: 'Sistem', icon: Users },
];

const NAV_GROUPS: NavGroup[] = ['Utama', 'Penilaian & Rapor', 'Sistem'];

const BG_IMAGE_PATH = '/assets/aistudio/Latar_Masjid_Islami_Bernuansa_Emas_dan_Hijau_4cad5e0e.png';

export default function App() {
  const [appState, setAppState] = useState<AppStateResponse | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [user, setUser] = useState<SafeUser | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [academicYears, setAcademicYears] = useState<AcademicYearRecord[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollmentRecord[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [page, setPage] = useState<NavId>('dashboard');
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('school');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('erapor_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('erapor_sidebar_collapsed', next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const toast = useCallback((message: string, type: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const refreshBootstrap = useCallback(async () => {
    const boot = await api.getBootstrap();
    setUser(boot.user);
    setSettings(boot.settings);
    setAcademicYears(boot.academicYears || []);
    setClasses(boot.classes);
    setSubjects(boot.subjects);
    setStudents(boot.students);
    setEnrollments(boot.enrollments || []);
    setSelectedYear((prev) => {
      if (prev && (boot.academicYears || []).some((y) => y.YEAR_NAME === prev)) {
        return prev;
      }
      return boot.settings.ACADEMIC_YEAR || boot.academicYears?.[0]?.YEAR_NAME || '';
    });
  }, []);

  const initialize = useCallback(async () => {
    try {
      const st = await api.getAppState();
      setAppState(st);
      if (!st.setupRequired && sessionStorage.getItem('erapor_token')) {
        try {
          await refreshBootstrap();
        } catch {
          sessionStorage.removeItem('erapor_token');
        }
      }
    } catch (err) {
      setFatalError(err instanceof Error ? err.message : 'Gagal memuat aplikasi.');
    }
  }, [refreshBootstrap]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const allowedNav = useMemo(() => {
    if (!user) return [];
    return NAV_ITEMS.filter((item) => {
      if ((item.id === 'users' || item.id === 'settings') && user.role !== 'ADMIN') return false;
      if (item.id === 'promotions' && !['ADMIN', 'WALI_KELAS'].includes(user.role)) return false;
      if ((item.id === 'report1' || item.id === 'report2') && user.role === 'GURU') return false;
      return true;
    });
  }, [user]);

  const canEdit = useCallback(
    (entity: string) => {
      if (!user) return false;
      if (user.role === 'ADMIN') return true;
      if (
        user.role === 'WALI_KELAS' &&
        ['students', 'scores', 'extracurricular', 'notes'].includes(entity)
      )
        return true;
      if (user.role === 'GURU' && entity === 'scores') return true;
      return false;
    },
    [user]
  );

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    sessionStorage.removeItem('erapor_token');
    setUser(null);
    setSelectedYear('');
    setPage('dashboard');
  };

  if (fatalError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {fatalError}
        </div>
      </div>
    );
  }

  if (!appState) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-sm font-medium text-slate-800 bg-[#f6f2e8]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-200 border-t-emerald-800" />
        <div>Memuat eRapor v2...</div>
      </div>
    );
  }

  return (
    <>
      {appState.setupRequired ? (
        <SetupView
          warning={appState.warning}
          onComplete={() => initialize()}
          onToast={toast}
        />
      ) : !user || !settings ? (
        <LoginView
          appState={appState}
          onSuccess={async (_token, loggedUser, loggedSettings) => {
            setUser(loggedUser);
            setSettings(loggedSettings);
            await refreshBootstrap();
          }}
          onToast={toast}
        />
      ) : (
        <div
          className={`relative min-h-screen flex print:block print:bg-white ${
            page === 'dashboard' ? '' : 'bg-[#f6f2e8]'
          }`}
        >
          {/* Full-viewport uploaded mosque background exclusively on Dashboard */}
          {page === 'dashboard' && (
            <div aria-hidden="true" className="no-print fixed inset-0 z-0 pointer-events-none">
              <img
                src={BG_IMAGE_PATH}
                alt=""
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-br from-[#fdfaf2]/55 via-[#f9f4e6]/45 to-[#eef6f2]/50" />
            </div>
          )}

          {/* Mobile sidebar backdrop */}
          {mobileMenuOpen && (
            <div
              className="no-print fixed inset-0 z-30 bg-[#04241b]/55 backdrop-blur-[2px] lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
          )}

          {/* Emerald Sidebar with Gold Accents & Gold Active Item */}
          <aside
            className={`no-print fixed inset-y-0 left-0 z-40 w-64 ${
              sidebarCollapsed ? 'lg:w-20' : 'lg:w-64'
            } bg-gradient-to-b from-[#064e3b] via-[#064534] to-[#042f24] text-emerald-50 flex flex-col border-r border-[#d4af37]/40 shadow-[4px_0_24px_rgba(4,47,36,0.18)] transition-all duration-200 lg:translate-x-0 ${
              mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <div
              className={`flex h-16 items-center border-b border-[#d4af37]/25 ${
                sidebarCollapsed ? 'lg:justify-center lg:px-2 px-5 justify-between' : 'justify-between px-5'
              }`}
            >
              <div
                className={`flex items-center gap-2.5 font-bold text-white whitespace-nowrap min-w-0 ${
                  sidebarCollapsed ? 'lg:hidden' : ''
                }`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#042f24]/90 ring-1 ring-[#d4af37]/60 text-[#f3d16c]">
                  <School className="h-4 w-4" />
                </div>
                <div className="min-w-0 leading-tight">
                  <div className="text-sm font-bold tracking-tight text-white truncate">
                    eRapor v2
                  </div>
                  <div className="text-[11px] font-medium text-[#f3d16c]/90 truncate">
                    Jenjang {settings.SCHOOL_LEVEL || 'WUSTHA'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleSidebarCollapsed}
                title={sidebarCollapsed ? 'Perluas Sidebar' : 'Minimize Sidebar'}
                aria-label={sidebarCollapsed ? 'Perluas Sidebar' : 'Minimize Sidebar'}
                className="hidden lg:inline-flex items-center justify-center rounded-lg border border-[#d4af37]/30 bg-[#042f24]/60 p-1.5 text-[#f3d16c] hover:bg-emerald-800/80 transition-colors"
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md p-1 text-emerald-200 hover:text-white lg:hidden"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
              {NAV_GROUPS.map((groupName) => {
                const items = allowedNav.filter((item) => item.group === groupName);
                if (!items.length) return null;
                return (
                  <div key={groupName} className="space-y-1">
                    <div
                      className={`px-3 pb-1 text-[11px] font-semibold text-[#f3d16c]/75 ${
                        sidebarCollapsed ? 'lg:hidden' : ''
                      }`}
                    >
                      {groupName}
                    </div>
                    {sidebarCollapsed && (
                      <div className="hidden lg:block mx-2 my-1 border-t border-[#d4af37]/20" />
                    )}
                    {items.map((item) => {
                      const Icon = item.icon;
                      const active = page === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          title={item.label}
                          onClick={() => {
                            if (item.id === 'settings') {
                              setSettingsTab(user.role === 'ADMIN' ? 'school' : 'drive');
                            }
                            setPage(item.id);
                            setMobileMenuOpen(false);
                          }}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition-all duration-150 whitespace-nowrap ${
                            sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''
                          } ${
                            active
                              ? 'bg-gradient-to-r from-[#d4af37] to-[#eab308] text-[#042f24] font-bold shadow-[0_2px_10px_rgba(212,175,55,0.32)] ring-1 ring-amber-200/70'
                              : 'font-medium text-emerald-50/90 hover:bg-emerald-800/55 hover:text-[#f3d16c]'
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 shrink-0 ${
                              active ? 'text-[#042f24]' : 'text-[#e8c660]/85'
                            }`}
                          />
                          <span className={`truncate ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </nav>

            <div className="border-t border-[#d4af37]/25 p-3">
              <button
                type="button"
                title="Keluar"
                onClick={handleLogout}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-emerald-100/90 transition-colors hover:bg-emerald-800/60 hover:text-[#f3d16c] whitespace-nowrap ${
                  sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''
                }`}
              >
                <LogOut className="h-4 w-4 shrink-0 text-[#e8c660]/85" />
                <span className={sidebarCollapsed ? 'lg:hidden' : ''}>Keluar</span>
              </button>
            </div>
          </aside>

          {/* Main Area */}
          <div
            className={`relative z-10 flex-1 print:pl-0 ${
              sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
            } flex flex-col min-w-0 transition-all duration-200`}
          >
            <header
              className={`no-print sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-[#d4af37]/30 px-4 sm:px-6 ${
                page === 'dashboard' ? 'bg-[#fdfaf2]/82 backdrop-blur-md' : 'bg-[#fdfaf3]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="rounded-lg border border-emerald-800/20 bg-white/80 p-2 text-emerald-900 hover:bg-white lg:hidden"
                  aria-label="Menu"
                >
                  <Menu className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={toggleSidebarCollapsed}
                  title={sidebarCollapsed ? 'Perluas Sidebar' : 'Minimize Sidebar'}
                  className="hidden lg:inline-flex rounded-lg border border-[#d9ceb5] bg-white/85 p-2 text-[#064e3b] hover:bg-amber-50/70 transition-colors"
                  aria-label={sidebarCollapsed ? 'Perluas Sidebar' : 'Minimize Sidebar'}
                >
                  {sidebarCollapsed ? (
                    <PanelLeftOpen className="h-4 w-4" />
                  ) : (
                    <PanelLeftClose className="h-4 w-4" />
                  )}
                </button>
                <div className="min-w-0">
                  <h1 className="text-base font-bold tracking-tight text-[#053225] truncate">
                    {NAV_ITEMS.find((n) => n.id === page)?.label || 'Dashboard'}
                  </h1>
                  <div className="hidden sm:flex items-center gap-2 text-xs text-slate-800">
                    <span className="font-arabic font-bold text-emerald-950 truncate max-w-[260px]">
                      {settings.SCHOOL_NAME}
                    </span>
                    <span className="text-amber-700">·</span>
                    <span className="font-mono-tabular font-semibold whitespace-nowrap text-slate-900">
                      TA {settings.ACADEMIC_YEAR} · Sem {settings.ACTIVE_SEMESTER}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {academicYears.length > 0 && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-[#d9ceb5] bg-white/95 px-2.5 py-1">
                    <span className="hidden sm:inline text-[11px] font-semibold text-slate-800">
                      Tahun:
                    </span>
                    <select
                      value={selectedYear || settings.ACADEMIC_YEAR}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      aria-label="Pilih Tahun Ajaran Kerja"
                      className="bg-transparent text-xs font-mono-tabular font-bold text-[#042f24] focus:outline-none cursor-pointer"
                    >
                      {academicYears.map((y) => (
                        <option key={y.YEAR_ID} value={y.YEAR_NAME}>
                          {y.YEAR_NAME}{' '}
                          {y.IS_ACTIVE === 'YA' || y.YEAR_NAME === settings.ACADEMIC_YEAR
                            ? '(Aktif)'
                            : '(Arsip)'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="hidden sm:block text-right">
                  <div className="text-xs font-bold text-[#053225]">{user.name}</div>
                  <div className="text-[11px] font-semibold text-emerald-950">{user.role}</div>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#064e3b] text-xs font-bold text-[#f3d16c] ring-1 ring-[#d4af37]/60 shadow-xs">
                  {(user.name || 'U').slice(0, 1).toUpperCase()}
                </div>
              </div>
            </header>

            <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto print:p-0 print:max-w-none">
              {page === 'dashboard' && (
                <DashboardView
                  user={user}
                  settings={settings}
                  selectedYear={selectedYear || settings.ACADEMIC_YEAR}
                  onNavigate={(p) => {
                    if (p === 'apps-script') {
                      setSettingsTab('drive');
                      setPage('settings');
                    } else {
                      setPage(p as NavId);
                    }
                  }}
                  onToast={toast}
                />
              )}
              {page === 'students' && (
                <StudentsView
                  students={students}
                  classes={classes}
                  enrollments={enrollments}
                  academicYears={academicYears}
                  selectedYear={selectedYear || settings.ACADEMIC_YEAR}
                  settings={settings}
                  canEdit={canEdit('students')}
                  onRefresh={refreshBootstrap}
                  onToast={toast}
                />
              )}
              {page === 'classes' && (
                <ClassesView
                  classes={classes}
                  academicYears={academicYears}
                  selectedYear={selectedYear || settings.ACADEMIC_YEAR}
                  settings={settings}
                  canEdit={canEdit('classes')}
                  onRefresh={refreshBootstrap}
                  onToast={toast}
                />
              )}
              {page === 'subjects' && (
                <SubjectsView
                  settings={settings}
                  canEdit={canEdit('subjects')}
                  onRefresh={refreshBootstrap}
                  onToast={toast}
                />
              )}
              {page === 'promotions' && ['ADMIN', 'WALI_KELAS'].includes(user.role) && (
                <AcademicYearPromotionView
                  user={user}
                  settings={settings}
                  academicYears={academicYears}
                  classes={classes}
                  selectedYear={selectedYear || settings.ACADEMIC_YEAR}
                  onSelectYear={setSelectedYear}
                  onRefresh={refreshBootstrap}
                  onToast={toast}
                />
              )}
              {page === 'scores' && (
                <ScoresView
                  classes={classes}
                  subjects={subjects}
                  academicYears={academicYears}
                  selectedYear={selectedYear || settings.ACADEMIC_YEAR}
                  settings={settings}
                  canEdit={canEdit('scores')}
                  onToast={toast}
                />
              )}
              {page === 'extracurricular' && (
                <ExtraAndNotesView
                  mode="extracurricular"
                  students={students}
                  academicYears={academicYears}
                  selectedYear={selectedYear || settings.ACADEMIC_YEAR}
                  settings={settings}
                  canEdit={canEdit('extracurricular')}
                  onToast={toast}
                />
              )}
              {page === 'notes' && (
                <ExtraAndNotesView
                  mode="notes"
                  students={students}
                  academicYears={academicYears}
                  selectedYear={selectedYear || settings.ACADEMIC_YEAR}
                  settings={settings}
                  canEdit={canEdit('notes')}
                  onToast={toast}
                />
              )}
              {page === 'report1' && (
                <ReportsView
                  semester={1}
                  classes={classes}
                  academicYears={academicYears}
                  selectedYear={selectedYear || settings.ACADEMIC_YEAR}
                  settings={settings}
                  onToast={toast}
                />
              )}
              {page === 'report2' && (
                <ReportsView
                  semester={2}
                  classes={classes}
                  academicYears={academicYears}
                  selectedYear={selectedYear || settings.ACADEMIC_YEAR}
                  settings={settings}
                  onToast={toast}
                />
              )}
              {page === 'recap' && (
                <RecapView
                  classes={classes}
                  students={students}
                  academicYears={academicYears}
                  selectedYear={selectedYear || settings.ACADEMIC_YEAR}
                  settings={settings}
                  onToast={toast}
                />
              )}
              {page === 'settings' && (
                <SettingsView
                  user={user}
                  activeTab={settingsTab}
                  onTabChange={setSettingsTab}
                  onRefresh={refreshBootstrap}
                  onUpdateSettings={async (updated) => {
                    setSettings(updated);
                    if (updated.ACADEMIC_YEAR) {
                      setSelectedYear(updated.ACADEMIC_YEAR);
                    }
                    await refreshBootstrap();
                  }}
                  onToast={toast}
                />
              )}
              {page === 'users' && user.role === 'ADMIN' && (
                <UsersView settings={settings} onToast={toast} />
              )}
            </main>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      <div className="no-print fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg border ${
              t.type === 'err'
                ? 'bg-red-700 border-red-500'
                : 'bg-[#064e3b] border-[#d4af37]/50'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}
