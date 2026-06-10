export type UserRole = "teacher" | "admin";

export type FeedbackStatus = "unread" | "read" | "in_progress" | "completed";

export type AiProviderKind =
  | "openai"
  | "openai_response"
  | "anthropic"
  | "newapi"
  | "openai_compatible"
  | "deepseek"
  | "gemini";

export type AiProviderConfig = {
  id: string;
  name: string;
  provider: AiProviderKind;
  baseUrl: string;
  model: string;
  enabled: boolean;
  isDefault: boolean;
  dailyLimit: number;
  maxOutputTokens: number;
  temperature: number;
  maskedApiKey: string;
  createdAt: string;
  updatedAt: string;
  lastTestedAt: string | null;
  lastError: string | null;
  lastLatencyMs?: number | null;
  usedToday?: number;
  remainingToday?: number;
};

export type AiProviderUsage = {
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
};

export type AiProviderInput = {
  name: string;
  provider: AiProviderKind;
  baseUrl: string;
  model: string;
  apiKey?: string;
  enabled: boolean;
  isDefault: boolean;
  dailyLimit: number;
  maxOutputTokens: number;
  temperature: number;
};

export type AiScheduleTaskType = "auto" | "data_query" | "student_course" | "schedule_lessons" | "sync_lessons" | "progress_checklist";

export type AiScheduleDraftRequest = {
  providerId: string;
  taskType: AiScheduleTaskType;
  instruction: string;
  context: unknown;
};

export type AiScheduleDraftResponse = {
  providerId: string;
  model: string;
  createdAt: string;
  text: string;
  draft: unknown;
  providerUsage?: AiProviderUsage;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

export type AiScheduleSession = {
  providerId: string;
  taskType: AiScheduleTaskType;
  instruction: string;
  followupAnswer: string;
  draft: AiScheduleDraftResponse | null;
  message: string;
};

export type UserStatus =
  | "active"
  | "disabled"
  | "delete_requested"
  | "delete_scheduled"
  | "deleted";

export type BuiltInCourseType = "one_on_one" | "one_on_two" | "class" | "trial" | "full_time";

export type CustomCourseType = `custom_${string}`;

export type CourseType = BuiltInCourseType | CustomCourseType;

export type LessonStatus =
  | "draft"
  | "scheduled"
  | "completed"
  | "cancelled"
  | "makeup_pending"
  | "makeup_completed";

export type AttendanceStatus =
  | "attended"
  | "leave_requested"
  | "absent"
  | "cancelled"
  | "makeup_pending"
  | "makeup_completed";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type WeekStart = 0 | 1;

export type SalaryGradeStage =
  | "primary"
  | "junior_1_2"
  | "junior_3"
  | "senior_1"
  | "senior_2"
  | "senior_3";

export type SalaryGradeLevel =
  | "beginner"
  | "intermediate"
  | "advanced_1"
  | "advanced_2"
  | "reserve";

export type LegacySalaryGradeId = `${SalaryGradeStage}:${SalaryGradeLevel}`;

export type CustomSalaryGradeId = `custom_salary_${string}`;

export type SalaryGradeId = SalaryGradeLevel | LegacySalaryGradeId | CustomSalaryGradeId;

export type SalaryGradeRuleConfig = {
  id: SalaryGradeId;
  label: string;
  baseSalary: number;
  guaranteedLessonCount?: number;
  lessonHours?: number;
  oneOnOneFee: number;
  classBaseFee: number;
  headcountIncrementFee: number;
  stageRates?: Partial<Record<SalaryGradeStage, SalaryGradeStageRateConfig>>;
};

export type SalaryGradeStageRateConfig = {
  oneOnOneFee: number;
  classBaseFee: number;
  headcountIncrementFee: number;
};

export type ClassFeeTier = {
  id: string;
  minStudents: number;
  maxStudents?: number;
  baseFee: number;
  perStudentFee?: number;
};

export type Notice = {
  enabled: boolean;
  title: string;
  content: string;
  updatedAt: string;
};

export type NoticeRecord = Notice & {
  id: string;
  createdAt: string;
};

export type Campus = {
  id: string;
  name: string;
  address?: string;
  note?: string;
};

export type Student = {
  id: string;
  name: string;
  grade?: string;
  school?: string;
  temporaryTrial?: boolean;
  defaultCampusId?: string;
  note?: string;
  status: "active" | "paused";
};

export type FeeRule = {
  mode: "hourly" | "fixed" | "class_headcount" | "salary_grade";
  hourlyRate?: number;
  fixedFee?: number;
  baseFee?: number;
  perPresentStudentFee?: number;
  classFeeTiers?: ClassFeeTier[];
  stageRates?: Partial<Record<SalaryGradeStage, SalaryGradeStageRateConfig>>;
  salaryGradeSource?: "teacher_default" | "specific";
  salaryGradeId?: SalaryGradeId;
  makeupFeeMode?: "sameAsOriginal" | "perStudentFee" | "custom";
};

export type CourseGroup = {
  id: string;
  name: string;
  type: CourseType;
  subject: string;
  defaultCampusId?: string;
  studentIds: string[];
  feeRule: FeeRule;
  note?: string;
  status: "active" | "paused";
};

export type StudentCourseTransition = {
  studentId: string;
  targetCourseId?: string;
  newCourse?: CourseGroup;
  subject?: string;
  endExisting: boolean;
};

export type ScheduleRule = {
  id: string;
  courseGroupId: string;
  weekday: Weekday;
  startTime: string;
  endTime: string;
  campusId?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  note?: string;
  enabled: boolean;
};

export type AttendanceEntry = {
  studentId: string;
  status: AttendanceStatus;
  note?: string;
  makeupExempt?: boolean;
  temporary?: boolean;
  trial?: boolean;
  temporaryFee?: number;
};

export type FeeSnapshot = {
  baseFee?: number;
  hourlyRate?: number;
  fixedFee?: number;
  oneOnOneFee?: number;
  perPresentStudentFee?: number;
  classFeeTierId?: string;
  salaryGradeId?: SalaryGradeId;
  salaryGradeLabel?: string;
  salaryGradeStage?: SalaryGradeStage;
  salaryGradeStageLabel?: string;
  headcountBaseStudentCount?: number;
  headcountIncrementFee?: number;
  lessonUnitHours?: number;
  durationMultiplier?: number;
  unitAmount?: number;
  presentStudentCount?: number;
  trialStudentCount?: number;
  trialFee?: number;
  hours?: number;
  manualAdjustment?: number;
  amount: number;
};

export type LessonContent = {
  taught: string;
  performance?: string;
  homework: string;
  nextLessonReminder: string;
  internalNote?: string;
  checklistTemplateId?: string;
  taughtChecklistItemIds?: string[];
  homeworkChecklistItemIds?: string[];
};

export type Lesson = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  courseGroupId: string;
  campusId?: string;
  type: CourseType;
  status: LessonStatus;
  expectedStudentIds: string[];
  attendance: AttendanceEntry[];
  trialStudentCount?: number;
  trialFee?: number;
  feeSnapshot: FeeSnapshot;
  linkedOriginalLessonId?: string | null;
  makeupStudentId?: string;
  makeupOriginalDate?: string;
  makeupScheduledDate?: string;
  syncSourceLessonId?: string;
  syncSourceDate?: string;
  syncTargetStartDate?: string;
  content: LessonContent;
  note?: string;
  sourceScheduleRuleId?: string;
};

export type DeletedLessonSource = "manual" | "ai" | "sync_overwrite";

export type DeletedLesson = {
  id: string;
  lesson: Lesson;
  deletedAt: string;
  deletedBy?: string;
  source: DeletedLessonSource;
  reason?: string;
};

export type SalaryAdjustment = {
  id: string;
  month: string;
  title: string;
  amount: number;
  note?: string;
};

export type TeacherProfile = {
  displayName: string;
  baseSalary: number;
  currency: "CNY";
  defaultSalaryGradeId?: SalaryGradeId;
  salaryGradeRules?: SalaryGradeRuleConfig[];
  phone?: string;
  email?: string;
  homeCampusId?: string;
  obligationCampusId?: string;
  obligationCourseGroupId?: string;
  obligationCourseOrder?: string[];
  obligationDeductionMode?: "auto_gap" | "manual";
  monthlyObligationHours?: number;
  obligationHourlyDeduction?: number;
  manualObligationDeduction?: number;
  note?: string;
};

export type TodoItem = {
  id: string;
  title: string;
  dueDate?: string;
  status: "open" | "done";
  priority?: "normal" | "high";
  note?: string;
  createdAt: string;
};

export type StudentProgressStatus = "on_track" | "review_needed" | "behind" | "ahead";

export type StudentHomeworkStatus = "unassigned" | "assigned" | "checked" | "partial" | "missing";

export type StudentProgressRecord = {
  id: string;
  studentId: string;
  courseGroupId: string;
  lessonId: string;
  date: string;
  progressText: string;
  homeworkText: string;
  nextPlan: string;
  progressStatus: StudentProgressStatus;
  homeworkStatus: StudentHomeworkStatus;
  note?: string;
  updatedAt: string;
};

export type ProgressChecklistTemplateItem = {
  id: string;
  chapter?: string;
  title: string;
  note?: string;
  order: number;
};

export type ProgressChecklistTemplate = {
  id: string;
  name: string;
  subject?: string;
  note?: string;
  items: ProgressChecklistTemplateItem[];
  createdAt: string;
  updatedAt: string;
};

export type ProgressChecklistCompletion = {
  id: string;
  templateId: string;
  itemId: string;
  studentId: string;
  courseGroupId: string;
  completedDate: string;
  lessonId?: string;
  progressRecordId?: string;
  note?: string;
  updatedAt: string;
};

export type GradeRecord = {
  id: string;
  studentId: string;
  subject: string;
  examName: string;
  date: string;
  score: number;
  fullScore?: number;
  rank?: string;
  note?: string;
};

export type TimePreset = {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
};

export type CustomCourseTypeOption = {
  id: CustomCourseType;
  label: string;
};

export type ScheduleImportMatchStatus =
  | "matched"
  | "attendance_mismatch"
  | "time_mismatch"
  | "course_mismatch"
  | "system_missing"
  | "import_missing"
  | "needs_mapping";

export type ScheduleImportMapping = Record<string, string>;

export type ScheduleImportResolutionStatus =
  | "unreviewed"
  | "excel_error"
  | "cloud_error"
  | "fixed"
  | "accepted"
  | "time_variance_ok"
  | "split_merge_ok";

export type ScheduleImportResolution = {
  status: ScheduleImportResolutionStatus;
  note?: string;
  linkedSystemLessonIds?: string[];
  updatedAt: string;
};

export type ScheduleImportResolutionMap = Record<string, ScheduleImportResolution>;

export type ScheduleImportSavedSummary = {
  total: number;
  matched: number;
  attendanceMismatch: number;
  timeMismatch: number;
  courseMismatch: number;
  systemMissing: number;
  importMissing: number;
  needsMapping: number;
  systemLessonCount?: number;
  systemCompletedLessonCount?: number;
  systemCompletedAmount?: number;
};

export type ScheduleImportSavedRow = {
  id: string;
  fileName: string;
  campusName: string;
  campusId?: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  subjectHint: string;
  courseTypeHint: CourseType | "unknown";
  studentNameHint?: string;
  teacher?: string;
  assistant?: string;
  room?: string;
  presentCount?: number;
  expectedCount?: number;
  note?: string;
  rawText?: string;
  warnings: string[];
  matchedCourseId?: string;
  mappedCourseId?: string;
  status: ScheduleImportMatchStatus;
  systemLessonId?: string;
  systemLessonLabel?: string;
  systemLessonStatus?: LessonStatus;
  systemLessonNote?: string;
  systemPresentCount?: number;
  systemExpectedCount?: number;
  systemPresentStudentNames?: string;
  systemExpectedStudentNames?: string;
  issues: string[];
  resolutionStatus?: ScheduleImportResolutionStatus;
  resolutionNote?: string;
  linkedSystemLessonIds?: string[];
  resolutionUpdatedAt?: string;
};

export type ScheduleImportReviewRecord = {
  id: string;
  savedAt: string;
  month: string;
  selectedDate: string;
  rawLessonCount: number;
  fileNames: string[];
  mapping: ScheduleImportMapping;
  fileCampusOverrides: ScheduleImportMapping;
  resolutions?: ScheduleImportResolutionMap;
  summary: ScheduleImportSavedSummary;
  rows: ScheduleImportSavedRow[];
};

export type ScheduleImportVaultState = {
  mappings: ScheduleImportMapping;
  resolutions?: ScheduleImportResolutionMap;
  reviews: ScheduleImportReviewRecord[];
  updatedAt: string;
};

export type AppPreferences = {
  weekStartsOn: WeekStart;
  customTimePresets?: TimePreset[];
  subjects?: string[];
  customCourseTypes?: CustomCourseTypeOption[];
  courseTypeLabels?: Partial<Record<CourseType, string>>;
  disabledCourseTypes?: CourseType[];
  courseTypeFeeRules?: Partial<Record<CourseType, FeeRule>>;
};

export type TeacherVault = {
  version: 1;
  profile: TeacherProfile;
  preferences?: AppPreferences;
  campuses: Campus[];
  students: Student[];
  courseGroups: CourseGroup[];
  scheduleRules: ScheduleRule[];
  lessons: Lesson[];
  deletedLessons?: DeletedLesson[];
  salaryAdjustments: SalaryAdjustment[];
  todoItems?: TodoItem[];
  studentProgressRecords?: StudentProgressRecord[];
  progressChecklistTemplates?: ProgressChecklistTemplate[];
  progressChecklistCompletions?: ProgressChecklistCompletion[];
  gradeRecords?: GradeRecord[];
  scheduleImport?: ScheduleImportVaultState;
  notice: Notice;
};

export type SessionUser = {
  id: string;
  username: string;
  role: UserRole;
  displayName: string;
  status: UserStatus;
  deletion: UserDeletionState | null;
};

export type UserDeletionState = {
  requestedAt: string;
  requestedBy: string | null;
  noticeCount: number;
  secondConfirmedAt: string | null;
  scheduledAt: string;
  cancelledAt: string | null;
  reason: string | null;
};

export type CloudSession = {
  token: string;
  user: SessionUser;
};

export type AdminUser = {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  deletion: UserDeletionState | null;
};

export type AdminSummary = {
  users: {
    total: number;
    active: number;
    pendingDeletion: number;
    disabled: number;
  };
  encryptedDocuments: number;
  registrationEnabled: boolean;
};

export type UserFeedback = {
  id: string;
  userId: string | null;
  username: string;
  title: string;
  content: string;
  status: FeedbackStatus;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  handledAt: string | null;
  handledBy: string | null;
};

export type EncryptedBox = {
  version: 1;
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
  updatedAt: string;
};

export type SalaryBreakdown = {
  baseSalary: number;
  oneOnOne: number;
  classLessons: number;
  fullTime: number;
  makeup: number;
  adjustments: number;
  obligationDeduction: number;
  total: number;
};
