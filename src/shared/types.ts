export type UserRole = "teacher" | "admin";

export type CourseType = "one_on_one" | "class";

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

export type Notice = {
  enabled: boolean;
  title: string;
  content: string;
  updatedAt: string;
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
  defaultCampusId?: string;
  note?: string;
  status: "active" | "paused";
};

export type FeeRule = {
  mode: "hourly" | "fixed" | "class_headcount";
  hourlyRate?: number;
  fixedFee?: number;
  baseFee?: number;
  perPresentStudentFee?: number;
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
};

export type FeeSnapshot = {
  baseFee?: number;
  hourlyRate?: number;
  fixedFee?: number;
  perPresentStudentFee?: number;
  presentStudentCount?: number;
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
  feeSnapshot: FeeSnapshot;
  linkedOriginalLessonId?: string | null;
  content: LessonContent;
  note?: string;
  sourceScheduleRuleId?: string;
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
};

export type TeacherVault = {
  version: 1;
  profile: TeacherProfile;
  campuses: Campus[];
  students: Student[];
  courseGroups: CourseGroup[];
  scheduleRules: ScheduleRule[];
  lessons: Lesson[];
  salaryAdjustments: SalaryAdjustment[];
  notice: Notice;
};

export type SessionUser = {
  username: string;
  role: UserRole;
  displayName: string;
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
  makeup: number;
  adjustments: number;
  total: number;
};
