import type {
  AttendanceStatus,
  Campus,
  ClassFeeTier,
  CourseGroup,
  FeeRule,
  Lesson,
  SalaryAdjustment,
  SalaryBreakdown,
  TeacherVault
} from "../../shared/types";

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export const appTimeZone = "Asia/Shanghai";

function timeZonePartMap(date: Date, options: Intl.DateTimeFormatOptions): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: appTimeZone,
      ...options
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
}

export function todayIso(date = new Date()): string {
  const parts = timeZonePartMap(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function currentAppHour(date = new Date()): number {
  const parts = timeZonePartMap(date, {
    hour: "2-digit",
    hourCycle: "h23"
  });
  return Number(parts.hour);
}

export function appDateFromIso(dateIso: string): Date {
  return new Date(`${dateIso}T00:00:00+08:00`);
}

export function formatAppDateLabel(dateIso: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: appTimeZone,
    ...options
  }).format(appDateFromIso(dateIso));
}

export function formatAppDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: appTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).format(date);
}

export function hoursBetween(startTime: string, endTime: string): number {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return Math.max((end - start) / 60, 0);
}

export function presentCount(lesson: Lesson): number {
  return lesson.attendance.filter((entry) => entry.status === "attended").length;
}

function nonNegativeNumber(value: number | undefined, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(value ?? fallback, 0) : fallback;
}

function nonNegativeInteger(value: number | undefined, fallback = 0): number {
  return Math.floor(nonNegativeNumber(value, fallback));
}

export function temporaryFeeTotal(lesson: Lesson): number {
  return lesson.attendance.reduce((sum, entry) => sum + nonNegativeNumber(entry.temporaryFee), 0);
}

export function trialFeeTotal(lesson: Lesson): number {
  return nonNegativeNumber(lesson.trialFee);
}

export function extraFeeTotal(lesson: Lesson): number {
  return temporaryFeeTotal(lesson) + trialFeeTotal(lesson);
}

export function defaultClassFeeTiers(rule?: FeeRule): ClassFeeTier[] {
  const baseFee = nonNegativeNumber(rule?.baseFee, 80);
  const perStudentFee = nonNegativeNumber(rule?.perPresentStudentFee, 10);
  return [
    {
      id: "tier_1_plus",
      minStudents: 1,
      baseFee,
      perStudentFee
    }
  ];
}

export function normalizedClassFeeTiers(rule: FeeRule): ClassFeeTier[] {
  const explicitTiers = (rule.classFeeTiers ?? []).filter((tier) => Number.isFinite(tier.minStudents));
  const tier = explicitTiers.length > 0
    ? [...explicitTiers].sort((a, b) => a.minStudents - b.minStudents)[0]
    : defaultClassFeeTiers(rule)[0];
  return [{ ...tier, maxStudents: undefined }];
}

export function classFeeTierForCount(rule: FeeRule, studentCount: number): ClassFeeTier | undefined {
  const count = nonNegativeInteger(studentCount);
  const tiers = normalizedClassFeeTiers(rule);
  return tiers.find((tier) => {
    const min = nonNegativeInteger(tier.minStudents);
    const max = tier.maxStudents === undefined ? undefined : Math.max(nonNegativeInteger(tier.maxStudents), min);
    return count >= min && (max === undefined || count <= max);
  });
}

export function calculateClassHeadcountFee(rule: FeeRule, studentCount: number): number {
  const count = nonNegativeInteger(studentCount);
  const tier = classFeeTierForCount(rule, count);
  if (tier) {
    const includedStudents = nonNegativeInteger(tier.minStudents);
    const extraStudents = Math.max(count - includedStudents, 0);
    return nonNegativeNumber(tier.baseFee) + extraStudents * nonNegativeNumber(tier.perStudentFee);
  }
  return nonNegativeNumber(rule.baseFee) + count * nonNegativeNumber(rule.perPresentStudentFee);
}

export function calculateFee(rule: FeeRule, lesson: Lesson): number {
  const extraFee = extraFeeTotal(lesson);
  if (rule.mode === "hourly") {
    return Math.round((rule.hourlyRate ?? 0) * hoursBetween(lesson.startTime, lesson.endTime) + extraFee);
  }

  if (rule.mode === "fixed") {
    return Math.round((rule.fixedFee ?? 0) + extraFee);
  }

  return Math.round(calculateClassHeadcountFee(rule, presentCount(lesson)) + extraFee);
}

export function getCourse(vault: TeacherVault, courseId: string): CourseGroup | undefined {
  return vault.courseGroups.find((course) => course.id === courseId);
}

export function completedAmount(lesson: Lesson): number {
  if (lesson.status !== "completed" && lesson.status !== "makeup_completed") {
    return 0;
  }
  return lesson.feeSnapshot.amount;
}

function completedHours(lesson: Lesson): number {
  if (lesson.status !== "completed" && lesson.status !== "makeup_completed") {
    return 0;
  }
  return lesson.feeSnapshot.hours ?? hoursBetween(lesson.startTime, lesson.endTime);
}

export type ObligationSummary = {
  campus?: Campus;
  course?: CourseGroup;
  mode: "auto_gap" | "manual";
  requiredHours: number;
  completedHours: number;
  deductedHours: number;
  missingHours: number;
  hourlyDeduction: number;
  manualAmount: number;
  amount: number;
};

export function obligationSummary(vault: TeacherVault, month: string, campusId = vault.profile.obligationCampusId): ObligationSummary {
  const courseId = vault.profile.obligationCourseGroupId;
  const mode = vault.profile.obligationDeductionMode ?? "auto_gap";
  const requiredHours = Math.max(vault.profile.monthlyObligationHours ?? 0, 0);
  const hourlyDeduction = Math.max(vault.profile.obligationHourlyDeduction ?? 0, 0);
  const manualAmount = Math.max(vault.profile.manualObligationDeduction ?? 0, 0);
  const campus = vault.campuses.find((item) => item.id === campusId);
  const course = vault.courseGroups.find((item) => item.id === courseId);
  const completedAtCampus = vault.lessons
    .filter((lesson) => {
      const lessonCampusId = lesson.campusId ?? getCourse(vault, lesson.courseGroupId)?.defaultCampusId;
      const matchesCampus = !campusId || lessonCampusId === campusId;
      const matchesCourse = !courseId || lesson.courseGroupId === courseId;
      return monthOf(lesson.date) === month && matchesCampus && matchesCourse;
    })
    .reduce((sum, lesson) => sum + completedHours(lesson), 0);
  const missingHours = Math.max(requiredHours - completedAtCampus, 0);
  const autoAmount = Math.round(missingHours * hourlyDeduction);

  return {
    campus,
    course,
    mode,
    requiredHours,
    completedHours: completedAtCampus,
    deductedHours: mode === "manual" ? 0 : missingHours,
    missingHours,
    hourlyDeduction,
    manualAmount,
    amount: mode === "manual" ? manualAmount : autoAmount
  };
}

export function salaryBreakdown(vault: TeacherVault, month: string): SalaryBreakdown {
  const monthLessons = vault.lessons.filter((lesson) => monthOf(lesson.date) === month);
  const monthAdjustments = vault.salaryAdjustments.filter((item) => item.month === month);

  const lessonTotals = monthLessons.reduce(
    (totals, lesson) => {
      const amount = completedAmount(lesson);
      if (lesson.status === "makeup_completed") {
        totals.makeup += amount;
      } else if (lesson.type === "class") {
        totals.classLessons += amount;
      } else {
        totals.oneOnOne += amount;
      }
      return totals;
    },
    { oneOnOne: 0, classLessons: 0, makeup: 0 }
  );

  const adjustments = monthAdjustments.reduce((sum, item) => sum + item.amount, 0);
  const obligationDeduction = obligationSummary(vault, month).amount;

  return {
    baseSalary: vault.profile.baseSalary,
    oneOnOne: lessonTotals.oneOnOne,
    classLessons: lessonTotals.classLessons,
    makeup: lessonTotals.makeup,
    adjustments,
    obligationDeduction,
    total:
      vault.profile.baseSalary +
      lessonTotals.oneOnOne +
      lessonTotals.classLessons +
      lessonTotals.makeup +
      adjustments -
      obligationDeduction
  };
}

export function attendanceSummary(vault: TeacherVault, month: string): Record<AttendanceStatus, number> {
  const initial: Record<AttendanceStatus, number> = {
    attended: 0,
    leave_requested: 0,
    absent: 0,
    cancelled: 0,
    makeup_pending: 0,
    makeup_completed: 0
  };

  return vault.lessons
    .filter((lesson) => monthOf(lesson.date) === month)
    .flatMap((lesson) => lesson.attendance)
    .reduce((summary, entry) => {
      summary[entry.status] += 1;
      return summary;
    }, initial);
}

export function yearlyTrend(vault: TeacherVault, year: string): Array<{ month: string; total: number; count: number }> {
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    const lessons = vault.lessons.filter((lesson) => monthOf(lesson.date) === month);
    return {
      month,
      total: salaryBreakdown(vault, month).total,
      count: lessons.filter((lesson) => lesson.status === "completed" || lesson.status === "makeup_completed").length
    };
  });
}

export function adjustmentTotal(adjustments: SalaryAdjustment[]): number {
  return adjustments.reduce((sum, item) => sum + item.amount, 0);
}
