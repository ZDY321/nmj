import type {
  AttendanceStatus,
  Campus,
  ClassFeeTier,
  CourseGroup,
  CourseType,
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

export function normalizedClassHoursBetween(startTime: string, endTime: string): number {
  const hours = hoursBetween(startTime, endTime);
  if (hours <= 0) return 0;
  return Math.max(Math.round(hours * 2) / 2, 0.5);
}

export function billableHoursForLesson(lesson: Pick<Lesson, "startTime" | "endTime" | "type">, rule?: FeeRule): number {
  if (lesson.type === "class" || rule?.mode === "class_headcount") {
    return normalizedClassHoursBetween(lesson.startTime, lesson.endTime);
  }
  return hoursBetween(lesson.startTime, lesson.endTime);
}

export function lessonBillableHours(lesson: Lesson): number {
  if (lesson.type === "class") {
    return billableHoursForLesson(lesson);
  }
  return Number.isFinite(lesson.feeSnapshot.hours) ? Math.max(lesson.feeSnapshot.hours ?? 0, 0) : billableHoursForLesson(lesson);
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
  if (lesson.type === "trial") {
    return Math.round(fixedFeeForRule(rule) + extraFee);
  }
  if (rule.mode === "hourly") {
    return Math.round((rule.hourlyRate ?? 0) * billableHoursForLesson(lesson, rule) + extraFee);
  }

  if (rule.mode === "fixed") {
    return Math.round(fixedFeeForRule(rule) + extraFee);
  }

  return Math.round(calculateClassHeadcountFee(rule, presentCount(lesson)) + extraFee);
}

export function defaultFeeRuleForCourseType(type: CourseType): FeeRule {
  if (type === "trial") {
    return { mode: "fixed", fixedFee: 0 };
  }
  if (type === "class" || type === "one_on_two" || type.startsWith("custom_")) {
    const baseFee = 0;
    const perPresentStudentFee = 0;
    return {
      mode: "class_headcount",
      baseFee,
      perPresentStudentFee,
      classFeeTiers: defaultClassFeeTiers({ mode: "class_headcount", baseFee, perPresentStudentFee }),
      makeupFeeMode: "perStudentFee"
    };
  }
  return { mode: "hourly", hourlyRate: 0 };
}

export function fixedFeeForRule(rule: FeeRule): number {
  return Math.max(rule.fixedFee ?? rule.hourlyRate ?? 0, 0);
}

export function feeRuleForCourseType(vault: TeacherVault, type: CourseType): FeeRule {
  return vault.preferences?.courseTypeFeeRules?.[type] ?? defaultFeeRuleForCourseType(type);
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
  return lessonBillableHours(lesson);
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
  targetAmount: number;
  courseDeductionAmount: number;
  fallbackHours: number;
  fallbackAmount: number;
  courseBreakdown: ObligationCourseDeduction[];
  amount: number;
};

export type ObligationCourseDeduction = {
  courseId: string;
  courseName: string;
  lessonCount: number;
  availableHours: number;
  deductedHours: number;
  amount: number;
};

export function obligationSummary(vault: TeacherVault, month: string, campusId = vault.profile.obligationCampusId ?? vault.profile.homeCampusId): ObligationSummary {
  const courseId = vault.profile.obligationCourseGroupId;
  const mode = vault.profile.obligationDeductionMode ?? "auto_gap";
  const requiredHours = Math.max(vault.profile.monthlyObligationHours ?? 0, 0);
  const hourlyDeduction = Math.max(vault.profile.obligationHourlyDeduction ?? 0, 0);
  const manualAmount = Math.max(vault.profile.manualObligationDeduction ?? 0, 0);
  const targetAmount = Math.round(requiredHours * hourlyDeduction);
  const campus = vault.campuses.find((item) => item.id === campusId);
  const course = vault.courseGroups.find((item) => item.id === courseId);
  let remainingHours = requiredHours;
  let availableHours = 0;
  let courseDeductedHours = 0;
  let courseDeductionAmount = 0;
  const breakdown = new Map<string, ObligationCourseDeduction>();
  const eligibleLessons = vault.lessons
    .filter((lesson) => monthOf(lesson.date) === month && lesson.type !== "trial" && completedHours(lesson) > 0)
    .map((lesson) => {
      const lessonCourse = getCourse(vault, lesson.courseGroupId);
      const lessonHours = completedHours(lesson);
      const lessonAmount = completedAmount(lesson);
      return {
        lesson,
        course: lessonCourse,
        campusId: lesson.campusId ?? lessonCourse?.defaultCampusId,
        hours: lessonHours,
        amount: lessonAmount,
        hourlyValue: lessonHours > 0 ? lessonAmount / lessonHours : Number.POSITIVE_INFINITY
      };
    });

  eligibleLessons.forEach((item) => {
    const current = breakdown.get(item.lesson.courseGroupId) ?? {
      courseId: item.lesson.courseGroupId,
      courseName: item.course?.name ?? "未知课程",
      lessonCount: 0,
      availableHours: 0,
      deductedHours: 0,
      amount: 0
    };
    current.lessonCount += 1;
    current.availableHours += item.hours;
    breakdown.set(item.lesson.courseGroupId, current);
    availableHours += item.hours;
  });

  const sortedEligibleLessons = [
    ...eligibleLessons.filter((item) => !campusId || item.campusId === campusId),
    ...eligibleLessons.filter((item) => campusId && item.campusId !== campusId)
  ].sort((a, b) => {
    const aPriority = !campusId || a.campusId === campusId ? 0 : 1;
    const bPriority = !campusId || b.campusId === campusId ? 0 : 1;
    return (
      aPriority - bPriority ||
      a.amount - b.amount ||
      `${a.lesson.date} ${a.lesson.startTime}`.localeCompare(`${b.lesson.date} ${b.lesson.startTime}`)
    );
  });

  sortedEligibleLessons.forEach((item) => {
    if (remainingHours <= 0.0001) return;
    const hoursToDeduct = Math.min(item.hours, remainingHours);
    const amountToDeduct = item.hourlyValue * hoursToDeduct;
    const current = breakdown.get(item.lesson.courseGroupId);
    if (current) {
      current.deductedHours += hoursToDeduct;
      current.amount += amountToDeduct;
    }
    courseDeductedHours += hoursToDeduct;
    courseDeductionAmount += amountToDeduct;
    remainingHours -= hoursToDeduct;
  });

  const courseBreakdown = Array.from(breakdown.values())
    .map((item) => ({ ...item, amount: Math.round(item.amount) }))
    .sort((a, b) => b.deductedHours - a.deductedHours || b.availableHours - a.availableHours || a.courseName.localeCompare(b.courseName));
  const fallbackHours = mode === "manual"
    ? 0
    : Math.max(remainingHours, 0);
  const fallbackAmount = Math.round(fallbackHours * hourlyDeduction);
  const autoAmount = Math.round(courseDeductionAmount) + fallbackAmount;

  return {
    campus,
    course,
    mode,
    requiredHours,
    completedHours: availableHours,
    deductedHours: mode === "manual" ? 0 : courseDeductedHours + fallbackHours,
    missingHours: fallbackHours,
    hourlyDeduction,
    manualAmount,
    targetAmount,
    courseDeductionAmount: Math.round(courseDeductionAmount),
    fallbackHours,
    fallbackAmount,
    courseBreakdown,
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
      } else if (lesson.type === "full_time") {
        totals.fullTime += amount;
      } else {
        totals.oneOnOne += amount;
      }
      return totals;
    },
    { oneOnOne: 0, classLessons: 0, fullTime: 0, makeup: 0 }
  );

  const adjustments = monthAdjustments.reduce((sum, item) => sum + item.amount, 0);
  const obligationDeduction = obligationSummary(vault, month).amount;

  return {
    baseSalary: vault.profile.baseSalary,
    oneOnOne: lessonTotals.oneOnOne,
    classLessons: lessonTotals.classLessons,
    fullTime: lessonTotals.fullTime,
    makeup: lessonTotals.makeup,
    adjustments,
    obligationDeduction,
    total:
      vault.profile.baseSalary +
      lessonTotals.oneOnOne +
      lessonTotals.classLessons +
      lessonTotals.fullTime +
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
