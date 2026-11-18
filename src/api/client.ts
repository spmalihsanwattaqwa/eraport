import type {
  AcademicYearRecord,
  AppSettings,
  AppStateResponse,
  AttendanceSyakhsiyahGridRow,
  BootstrapResponse,
  DashboardData,
  PromotionPreviewResponse,
  RecapResponse,
  ReportPreviewData,
  ReportStudentRow,
  SafeUser,
  ScoreGridRow,
  StudentTranscriptResponse,
  TahfidzGridRow,
  UserRecord,
} from '../types/erapor.ts';

function getToken(): string {
  return sessionStorage.getItem('erapor_token') || '';
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface WebhookSyncStatus {
  autoSync: boolean;
  webhookUrl: string;
  sheetName: string;
  sheetUrl: string;
  lastSync: string;
  lastError: string;
  syncing: boolean;
}

export const api = {
  getAppState: () => request<AppStateResponse>('/api/app-state'),
  setupERapor: (payload: Record<string, unknown>) =>
    request<{
      success: boolean;
      message: string;
      initialAccounts: { role: string; username: string; password: string }[];
    }>('/api/setup', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  login: (username: string, password: string) =>
    request<{ token: string; user: SafeUser; settings: AppSettings }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>('/api/logout', { method: 'POST' }),
  getBootstrap: () => request<BootstrapResponse>('/api/bootstrap'),
  getDashboard: (academicYear?: string, semester?: string) => {
    const params = new URLSearchParams();
    if (academicYear) params.set('academicYear', academicYear);
    if (semester) params.set('semester', semester);
    const q = params.toString();
    return request<DashboardData>(`/api/dashboard${q ? `?${q}` : ''}`);
  },

  listRecords: <T,>(entity: string) => request<T[]>(`/api/records/${entity}`),
  saveRecord: <T,>(entity: string, record: Record<string, unknown>) =>
    request<T>(`/api/records/${entity}`, {
      method: 'POST',
      body: JSON.stringify(record),
    }),
  deleteRecord: (entity: string, id: string) =>
    request<{ ok: boolean }>(`/api/records/${entity}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  importStudents: (rows: Record<string, unknown>[], academicYear?: string) =>
    request<{ count: number }>('/api/students/import', {
      method: 'POST',
      body: JSON.stringify({ rows, academicYear }),
    }),
  lookupNikWilayah: (nik: string) =>
    request<{
      province: string;
      regency: string;
      district: string;
      villages: string[];
      defaultVillage: string;
    }>(`/api/wilayah/nik/${encodeURIComponent(nik)}`),

  getScoreGrid: (classId: string, subjectId: string, semester: string, academicYear: string) =>
    request<ScoreGridRow[]>(
      `/api/scores/grid?classId=${encodeURIComponent(classId)}&subjectId=${encodeURIComponent(subjectId)}&semester=${encodeURIComponent(semester)}&academicYear=${encodeURIComponent(academicYear)}`
    ),
  saveScores: (payload: {
    subjectId: string;
    semester: string;
    academicYear: string;
    rows: { studentId: string; scoreId: string; pts: unknown; pas: unknown }[];
  }) =>
    request<{ saved: number }>('/api/scores/save', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getAttendanceSyakhsiyahGrid: (classId: string, semester: string, academicYear: string) =>
    request<AttendanceSyakhsiyahGridRow[]>(
      `/api/attendance-syakhsiyah/grid?classId=${encodeURIComponent(classId)}&semester=${encodeURIComponent(semester)}&academicYear=${encodeURIComponent(academicYear)}`
    ),
  saveAttendanceSyakhsiyah: (payload: {
    semester: string;
    academicYear: string;
    rows: {
      studentId: string;
      noteId: string;
      sick: unknown;
      permission: unknown;
      absent: unknown;
      suluk: string;
      nadhafah: string;
      muwazhabah: string;
      note: string;
    }[];
  }) =>
    request<{ saved: number }>('/api/attendance-syakhsiyah/save', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getTahfidzGrid: (classId: string, semester: string, academicYear: string) =>
    request<TahfidzGridRow[]>(
      `/api/tahfidz/grid?classId=${encodeURIComponent(classId)}&semester=${encodeURIComponent(semester)}&academicYear=${encodeURIComponent(academicYear)}`
    ),
  saveTahfidz: (payload: {
    semester: string;
    academicYear: string;
    rows: {
      studentId: string;
      noteId: string;
      tahfidzType: string;
      tahfidzScore: unknown;
    }[];
  }) =>
    request<{ saved: number }>('/api/tahfidz/save', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getRecap: (classId: string, semester: string, academicYear: string) =>
    request<RecapResponse>(
      `/api/recap?classId=${encodeURIComponent(classId)}&semester=${encodeURIComponent(semester)}&academicYear=${encodeURIComponent(academicYear)}`
    ),

  getStudentTranscript: (studentId: string) =>
    request<StudentTranscriptResponse>(`/api/recap/transcript/${encodeURIComponent(studentId)}`),

  getReportStudents: (classId: string, semester: string, academicYear: string) =>
    request<ReportStudentRow[]>(
      `/api/reports/students?classId=${encodeURIComponent(classId)}&semester=${encodeURIComponent(semester)}&academicYear=${encodeURIComponent(academicYear)}`
    ),
  getReportPreview: (studentId: string, semester: string, academicYear: string) =>
    request<ReportPreviewData>(
      `/api/reports/preview/${encodeURIComponent(studentId)}?semester=${encodeURIComponent(semester)}&academicYear=${encodeURIComponent(academicYear)}`
    ),
  generateReports: (studentIds: string[], semester: string, academicYear: string) =>
    request<{ count: number }>('/api/reports/generate', {
      method: 'POST',
      body: JSON.stringify({ studentIds, semester, academicYear }),
    }),
  resetReports: (studentIds: string[], semester: string, academicYear: string) =>
    request<{ removed: number }>('/api/reports/reset', {
      method: 'POST',
      body: JSON.stringify({ studentIds, semester, academicYear }),
    }),

  getSettings: () => request<AppSettings>('/api/settings'),
  saveSettings: (values: Record<string, string>) =>
    request<AppSettings>('/api/settings', {
      method: 'POST',
      body: JSON.stringify(values),
    }),

  getSyncStatus: () => request<WebhookSyncStatus>('/api/sync/status'),
  testWebhookSync: (webhookUrl: string, syncKey = '') =>
    request<{
      ok: boolean;
      sheetName: string;
      sheetUrl: string;
      sheetCount: number;
      settings: AppSettings;
    }>('/api/sync/test', {
      method: 'POST',
      body: JSON.stringify({ webhookUrl, syncKey }),
    }),
  pushWebhookSync: () =>
    request<{
      ok: boolean;
      sheetName: string;
      sheetUrl: string;
      syncedSheets: number;
      totalRows: number;
      lastSync: string;
    }>('/api/sync/push', {
      method: 'POST',
    }),
  pullWebhookSync: () =>
    request<{
      ok: boolean;
      sheetName: string;
      sheetUrl: string;
      lastSync: string;
    }>('/api/sync/pull', {
      method: 'POST',
    }),

  listUsers: () => request<UserRecord[]>('/api/users'),
  saveUser: (record: Record<string, unknown>) =>
    request<UserRecord>('/api/users', {
      method: 'POST',
      body: JSON.stringify(record),
    }),
  deleteUser: (id: string) =>
    request<{ ok: boolean }>(`/api/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  listAcademicYears: () => request<AcademicYearRecord[]>('/api/academic-years'),
  saveAcademicYear: (payload: {
    yearId?: string;
    yearName: string;
    activeSemester?: string;
    setActive?: boolean;
    cloneFromYear?: string;
    notes?: string;
  }) =>
    request<{ year: AcademicYearRecord; clonedClasses: number }>('/api/academic-years', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  activateAcademicYear: (yearId: string, semester?: string) =>
    request<{ year: AcademicYearRecord; settings: AppSettings }>(
      `/api/academic-years/${encodeURIComponent(yearId)}/activate`,
      {
        method: 'POST',
        body: JSON.stringify({ semester }),
      }
    ),
  deleteAcademicYear: (yearId: string) =>
    request<{ ok: boolean }>(`/api/academic-years/${encodeURIComponent(yearId)}`, {
      method: 'DELETE',
    }),
  cloneClasses: (sourceYear: string, targetYear: string) =>
    request<{ cloned: number; skipped: number }>('/api/classes/clone', {
      method: 'POST',
      body: JSON.stringify({ sourceYear, targetYear }),
    }),
  getPromotionPreview: (sourceYear: string, sourceClassId: string, targetYear: string) =>
    request<PromotionPreviewResponse>(
      `/api/promotions/preview?sourceYear=${encodeURIComponent(sourceYear)}&sourceClassId=${encodeURIComponent(sourceClassId)}&targetYear=${encodeURIComponent(targetYear)}`
    ),
  executePromotions: (payload: {
    sourceYear: string;
    sourceClassId: string;
    targetYear: string;
    items: {
      studentId: string;
      action: 'NAIK' | 'TINGGAL' | 'LULUS' | 'PINDAH' | 'SKIP';
      targetClassId?: string;
    }[];
  }) =>
    request<{
      processed: number;
      promoted: number;
      retained: number;
      graduated: number;
      moved: number;
    }>('/api/promotions/execute', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  exportDatabase: () => request<Record<string, Record<string, unknown>[]>>('/api/database/export'),
  importDatabase: (sheets: Record<string, Record<string, unknown>[]>) =>
    request<{ ok: boolean }>('/api/database/import', {
      method: 'POST',
      body: JSON.stringify(sheets),
    }),
};
