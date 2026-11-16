export type SchoolLevel = 'WUSTHA' | 'ULYA' | "'ALY";
export const SCHOOL_LEVELS: SchoolLevel[] = ['WUSTHA', 'ULYA', "'ALY"];
export type UserRole = 'ADMIN' | 'WALI_KELAS' | 'GURU' | 'KEPALA_SEKOLAH';

export interface GradeCategory {
  name: string;
  min: number;
  max: number;
}

export interface PredicateCategory {
  name: string;
  label?: string;
}

export interface AppSettings {
  APP_NAME: string;
  APP_VERSION: string;
  SCHOOL_NAME: string;
  SCHOOL_LEVEL: SchoolLevel | string;
  NPSN: string;
  SCHOOL_ADDRESS: string;
  SHEIKH_NAME: string;
  PRINCIPAL_NAME: string;
  PRINCIPAL_NIP: string;
  ACADEMIC_YEAR: string;
  ACTIVE_SEMESTER: string;
  CITY: string;
  REPORT_DATE: string;
  LOGO_FILE_ID: string;
  GRADE_CATEGORIES: string;
  SYAKHSIYAH_CATEGORIES?: string;
  EXTRA_CATEGORIES?: string;
  PTS_WEIGHT?: string;
  PAS_WEIGHT?: string;
  [key: string]: string | undefined;
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  username: string;
  role: UserRole;
  schoolLevel: string;
}

export interface UserRecord {
  USER_ID: string;
  NAME: string;
  EMAIL: string;
  USERNAME: string;
  PASSWORD_HASH?: string;
  SALT?: string;
  PASSWORD?: string;
  ROLE: UserRole;
  SCHOOL_LEVEL: string;
  ACTIVE: string;
  UPDATED_AT: string;
}

export interface AcademicYearRecord {
  YEAR_ID: string;
  YEAR_NAME: string;
  ACTIVE_SEMESTER: string;
  IS_ACTIVE: string;
  NOTES?: string;
  UPDATED_AT: string;
  classCount?: number;
  studentCount?: number;
}

export type PromotionDecision = 'BELUM' | 'NAIK' | 'TINGGAL' | 'LULUS' | 'PINDAH';

export interface StudentEnrollmentRecord {
  ENROLLMENT_ID: string;
  STUDENT_ID: string;
  CLASS_ID: string;
  ACADEMIC_YEAR: string;
  STATUS: string;
  PROMOTION_RESULT?: PromotionDecision | string;
  NEXT_CLASS_ID?: string;
  NEXT_ACADEMIC_YEAR?: string;
  UPDATED_AT: string;
}

export interface ClassRecord {
  CLASS_ID: string;
  LEVEL: string;
  GRADE: string;
  CLASS_NAME: string;
  HOMEROOM_TEACHER: string;
  ACADEMIC_YEAR: string;
  ACTIVE: string;
  UPDATED_AT: string;
}

export interface StudentRecord {
  STUDENT_ID: string;
  NIS: string;
  NISN: string;
  NIK?: string;
  KK_NUMBER?: string;
  NAME: string;
  FATHER_NAME: string;
  MOTHER_NAME?: string;
  GENDER: string;
  BIRTH_PLACE: string;
  BIRTH_DATE: string;
  RELIGION: string;
  CLASS_ID: string;
  ADDRESS: string;
  RT_RW?: string;
  VILLAGE?: string;
  DISTRICT?: string;
  REGENCY?: string;
  PROVINCE?: string;
  KEDATANGAN?: string;
  MASA_BELAJAR?: string;
  PARENT_NAME: string;
  WALI_MODE?: 'AYAH' | 'IBU' | 'ORANG_TUA' | 'MANUAL' | '';
  WALI_NAME?: string;
  WALI_RELATION?: string;
  WALI_ADDRESS?: string;
  PHOTO?: string;
  PHONE: string;
  STATUS: string;
  STATUS_DATE?: string;
  UPDATED_AT: string;
}

export interface SubjectRecord {
  SUBJECT_ID: string;
  LEVEL: string;
  CODE: string;
  SUBJECT_NAME: string;
  SUBJECT_NAME_ARAB: string;
  GROUP_NAME: string;
  DISPLAY_ORDER: number | string;
  ACTIVE: string;
  UPDATED_AT: string;
}

export interface ScoreRecord {
  SCORE_ID: string;
  STUDENT_ID: string;
  SUBJECT_ID: string;
  SEMESTER: string;
  ACADEMIC_YEAR: string;
  PTS: number | string;
  PAS: number | string;
  FINAL_SCORE: number | string;
  FINAL_SCORE_ARAB: string;
  UPDATED_AT: string;
}

export interface RecapRecord {
  RECAP_ID: string;
  STUDENT_ID: string;
  STUDENT_NAME: string;
  CLASS_ID: string;
  SEMESTER: string;
  ACADEMIC_YEAR: string;
  TOTAL_SCORE: number | string;
  TOTAL_SCORE_ARAB: string;
  AVERAGE_SCORE: number | string;
  AVERAGE_SCORE_ARAB: string;
  RANK: number | string;
  CATEGORY: string;
  PROMOTION_STATUS?: string;
  UPDATED_AT: string;
}

export interface ExtraRecord {
  EX_ID: string;
  STUDENT_ID: string;
  SEMESTER: string;
  ACADEMIC_YEAR: string;
  ACTIVITY: string;
  PREDICATE: string;
  DESCRIPTION: string;
  UPDATED_AT: string;
}

export interface TeacherNoteRecord {
  NOTE_ID: string;
  STUDENT_ID: string;
  SEMESTER: string;
  ACADEMIC_YEAR: string;
  ATTITUDE: string;
  SYAKHSIYAH_SULUK?: string;
  SYAKHSIYAH_NADHAFAH?: string;
  SYAKHSIYAH_MUWAZHABAH?: string;
  SICK: number | string;
  PERMISSION: number | string;
  ABSENT: number | string;
  NOTE: string;
  TAHFIDZ_TYPE?: string;
  TAHFIDZ_SCORE?: number | string;
  UPDATED_AT: string;
}

export interface ReportFileRecord {
  REPORT_ID: string;
  STUDENT_ID: string;
  SEMESTER: string;
  ACADEMIC_YEAR: string;
  DOC_ID: string;
  DOC_URL: string;
  PDF_ID: string;
  PDF_URL: string;
  STATUS: string;
  GENERATED_AT: string;
}

export interface AuditLogRecord {
  LOG_ID: string;
  USER_ID: string;
  ACTION: string;
  ENTITY: string;
  RECORD_ID: string;
  DETAIL: string;
  CREATED_AT: string;
}

export interface ScoreGridRow {
  no: number;
  studentId: string;
  nis: string;
  nisn: string;
  name: string;
  scoreId: string;
  pts: number | '';
  pas: number | '';
  finalScore: number | '';
  finalScoreArab: string;
}

export interface AttendanceSyakhsiyahGridRow {
  no: number;
  studentId: string;
  nis: string;
  nisn: string;
  name: string;
  noteId: string;
  sick: number | '';
  permission: number | '';
  absent: number | '';
  suluk: string;
  nadhafah: string;
  muwazhabah: string;
  note: string;
}

export interface TahfidzGridRow {
  no: number;
  studentId: string;
  nis: string;
  nisn: string;
  name: string;
  noteId: string;
  tahfidzType: string;
  tahfidzScore: number | '';
  tahfidzScoreArab: string;
}

export interface RecapResponse {
  subjects: { id: string; name: string; nameArab: string; code: string }[];
  rows: {
    no: number;
    studentId: string;
    classId: string;
    name: string;
    nis: string;
    tahfidzType?: string;
    tahfidzScore?: number | '';
    values: Record<string, number | ''>;
    total: number | '';
    totalArab: string;
    average: number | '';
    averageArab: string;
    category: string;
    rank: number | '-';
    promotionStatus?: string;
    promotionStatusArab?: string;
  }[];
}

export interface TranscriptTermInfo {
  key: string;
  academicYear: string;
  semester: string;
  label: string;
  className: string;
  total: number | '';
  totalArab: string;
  average: number | '';
  averageArab: string;
  rank: number | '-';
  category: string;
  promotionStatus: string;
  promotionStatusArab: string;
  tahfidz?: {
    type: string;
    score: number | '';
    kitabah: string;
  };
  attendance: {
    sick: number;
    permission: number;
    absent: number;
    suluk: string;
    nadhafah: string;
    muwazhabah: string;
  };
}

export interface StudentTranscriptResponse {
  student: StudentRecord;
  className: string;
  terms: TranscriptTermInfo[];
  subjects: {
    id: string;
    code: string;
    name: string;
    nameArab: string;
    scoresByTerm: Record<string, number | ''>;
    average: number | '';
  }[];
  overall: {
    termCount: number;
    subjectCount: number;
    cumulativeAverage: number | '';
    cumulativeAverageArab: string;
    cumulativeCategory: string;
  };
}

export interface ReportStudentRow {
  no: number;
  studentId: string;
  name: string;
  fatherName: string;
  nis: string;
  nisn: string;
  classId: string;
  className: string;
  scoreCount: number;
  docUrl: string;
  pdfUrl: string;
  status: string;
  generatedAt: string;
}

export interface ReportPreviewData {
  settings: Partial<AppSettings>;
  student: StudentRecord;
  clazz: Partial<ClassRecord>;
  semester: string;
  academicYear: string;
  subjects: {
    no: string;
    name: string;
    score: string;
    terbilang: string;
  }[];
  summary: {
    total: string;
    totalArab: string;
    average: string;
    averageArab: string;
    rank: string;
    category: string;
  };
  promotion?: {
    status: string;
    arabic: string;
    isRetained: boolean;
  } | null;
  tahfidz?: {
    type: string;
    score: string;
    terbilang: string;
  };
  extras: ExtraRecord[];
  note: Partial<TeacherNoteRecord>;
}

export interface PromotionCandidateRow {
  no: number;
  studentId: string;
  nis: string;
  nisn: string;
  name: string;
  currentStatus: string;
  sem2Average: number | '';
  sem2Category: string;
  sem2Rank: number | '-';
  ruleDecision: 'NAIK' | 'TINGGAL' | 'BELUM';
  ruleLabel: string;
  existingDecision: string;
  existingNextClassId: string;
  recommendedAction: 'NAIK' | 'TINGGAL' | 'LULUS' | 'PINDAH';
  recommendedTargetClassId: string;
}

export interface PromotionPreviewResponse {
  sourceYear: string;
  targetYear: string;
  sourceClass: ClassRecord | null;
  targetClasses: ClassRecord[];
  rows: PromotionCandidateRow[];
}

export interface DashboardData {
  academicYear: string;
  semester: string;
  studentCount: number;
  classCount: number;
  subjectCount: number;
  scoreCompletion: number;
  reportCompletion: number;
  recent: (ReportFileRecord & { STUDENT_NAME: string })[];
}

export interface AppStateResponse {
  setupRequired: boolean;
  appName: string;
  version: string;
  schoolName?: string;
  schoolLevel?: string;
  warning?: string;
}

export interface BootstrapResponse {
  user: SafeUser;
  settings: AppSettings;
  academicYears: AcademicYearRecord[];
  classes: ClassRecord[];
  subjects: SubjectRecord[];
  students: StudentRecord[];
  enrollments: StudentEnrollmentRecord[];
}
