import type {
  AttendanceStatus,
  Campus,
  ClassFeeTier,
  CourseGroup,
  CourseType,
  FeeRule,
  FeeSnapshot,
  LegacySalaryGradeId,
  Lesson,
  SalaryAdjustment,
  SalaryBreakdown,
  SalaryGradeId,
  SalaryGradeLevel,
  SalaryGradeRuleConfig,
  SalaryGradeStage,
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

function isPresentAttendanceEntry(lesson: Lesson, entry: Lesson["attendance"][number]): boolean {
  return entry.status === "attended" || (Boolean(lesson.linkedOriginalLessonId) && entry.status === "makeup_completed");
}

export function presentCount(lesson: Lesson): number {
  return lesson.attendance.filter((entry) => isPresentAttendanceEntry(lesson, entry) && !entry.trial).length;
}

export function namedTrialStudentCount(lesson: Lesson): number {
  return lesson.attendance.filter((entry) => isPresentAttendanceEntry(lesson, entry) && entry.trial).length;
}

export const salaryGradeStageLabels: Record<SalaryGradeStage, string> = {
  primary: "小学",
  junior_1_2: "初一初二",
  junior_3: "初三",
  senior_1: "高一",
  senior_2: "高二",
  senior_3: "高三"
};

export const salaryGradeLevelLabels: Record<SalaryGradeLevel, string> = {
  beginner: "初级",
  intermediate: "中级",
  advanced_1: "高级1",
  advanced_2: "高级2",
  reserve: "储备"
};

export type SalaryGradeRule = {
  id: SalaryGradeId;
  label: string;
  stage?: SalaryGradeStage;
  level?: SalaryGradeLevel;
  legacy?: boolean;
  custom?: boolean;
  baseSalary: number;
  guaranteedLessonCount: 5;
  lessonHours: 2;
  oneOnOneFee: number;
  classBaseFee: number;
  headcountIncrementFee: number;
};

function legacySalaryGradeId(stage: SalaryGradeStage, level: SalaryGradeLevel): LegacySalaryGradeId {
  return `${stage}:${level}`;
}

function salaryGradeRule(
  level: SalaryGradeLevel,
  baseSalary: number,
  oneOnOneFee: number,
  classBaseFee: number,
  headcountIncrementFee: number
): SalaryGradeRule {
  return {
    id: level,
    label: salaryGradeLevelLabels[level],
    level,
    baseSalary,
    guaranteedLessonCount: 5,
    lessonHours: 2,
    oneOnOneFee,
    classBaseFee,
    headcountIncrementFee
  };
}

function legacySalaryGradeRule(
  stage: SalaryGradeStage,
  level: SalaryGradeLevel,
  baseSalary: number,
  oneOnOneFee: number,
  classBaseFee: number,
  headcountIncrementFee: number
): SalaryGradeRule {
  return {
    id: legacySalaryGradeId(stage, level),
    label: `${salaryGradeStageLabels[stage]} · ${salaryGradeLevelLabels[level]}`,
    stage,
    level,
    legacy: true,
    baseSalary,
    guaranteedLessonCount: 5,
    lessonHours: 2,
    oneOnOneFee,
    classBaseFee,
    headcountIncrementFee
  };
}

export const defaultSalaryGradeRules: SalaryGradeRule[] = [
  salaryGradeRule("beginner", 2800, 75, 60, 10),
  salaryGradeRule("intermediate", 3000, 80, 65, 12),
  salaryGradeRule("advanced_1", 3200, 85, 70, 15),
  salaryGradeRule("advanced_2", 3300, 90, 75, 18),
  salaryGradeRule("reserve", 3500, 95, 80, 20)
];

export const salaryGradeRules: SalaryGradeRule[] = [
  ...defaultSalaryGradeRules
];

export const legacySalaryGradeRules: SalaryGradeRule[] = [
  legacySalaryGradeRule("primary", "beginner", 2800, 55, 40, 10),
  legacySalaryGradeRule("primary", "intermediate", 3000, 65, 50, 10),
  legacySalaryGradeRule("primary", "advanced_1", 3200, 70, 55, 10),
  legacySalaryGradeRule("primary", "advanced_2", 3300, 73, 58, 10),
  legacySalaryGradeRule("primary", "reserve", 3500, 75, 60, 10),
  legacySalaryGradeRule("junior_1_2", "beginner", 2800, 65, 50, 10),
  legacySalaryGradeRule("junior_1_2", "intermediate", 3000, 70, 55, 12),
  legacySalaryGradeRule("junior_1_2", "advanced_1", 3200, 75, 60, 15),
  legacySalaryGradeRule("junior_1_2", "advanced_2", 3300, 80, 65, 18),
  legacySalaryGradeRule("junior_1_2", "reserve", 3500, 85, 70, 20),
  legacySalaryGradeRule("junior_3", "beginner", 2800, 75, 60, 10),
  legacySalaryGradeRule("junior_3", "intermediate", 3000, 80, 65, 12),
  legacySalaryGradeRule("junior_3", "advanced_1", 3200, 85, 70, 15),
  legacySalaryGradeRule("junior_3", "advanced_2", 3300, 90, 75, 18),
  legacySalaryGradeRule("junior_3", "reserve", 3500, 95, 80, 20),
  legacySalaryGradeRule("senior_1", "intermediate", 3000, 100, 100, 25),
  legacySalaryGradeRule("senior_1", "advanced_1", 3200, 105, 105, 30),
  legacySalaryGradeRule("senior_1", "advanced_2", 3300, 105, 105, 30),
  legacySalaryGradeRule("senior_1", "reserve", 3500, 110, 110, 35),
  legacySalaryGradeRule("senior_2", "intermediate", 3000, 110, 110, 25),
  legacySalaryGradeRule("senior_2", "advanced_1", 3200, 115, 115, 30),
  legacySalaryGradeRule("senior_2", "advanced_2", 3300, 115, 115, 30),
  legacySalaryGradeRule("senior_2", "reserve", 3500, 120, 120, 35),
  legacySalaryGradeRule("senior_3", "intermediate", 3000, 120, 120, 25),
  legacySalaryGradeRule("senior_3", "advanced_1", 3200, 125, 125, 30),
  legacySalaryGradeRule("senior_3", "advanced_2", 3300, 125, 125, 30),
  legacySalaryGradeRule("senior_3", "reserve", 3500, 130, 130, 35)
];

function salaryGradeRuleFromConfig(config: SalaryGradeRuleConfig, fallback?: SalaryGradeRule): SalaryGradeRule {
  return {
    id: config.id,
    label: (config.label ?? "").trim() || fallback?.label || String(config.id),
    level: fallback?.level,
    custom: !defaultSalaryGradeRules.some((rule) => rule.id === config.id),
    baseSalary: Math.max(config.baseSalary, 0),
    guaranteedLessonCount: 5,
    lessonHours: 2,
    oneOnOneFee: Math.max(config.oneOnOneFee, 0),
    classBaseFee: Math.max(config.classBaseFee, 0),
    headcountIncrementFee: Math.max(config.headcountIncrementFee, 0)
  };
}

export function salaryGradeRulesForVault(vault?: TeacherVault): SalaryGradeRule[] {
  const overrides = vault?.profile.salaryGradeRules ?? [];
  const overrideMap = new Map(overrides.map((rule) => [rule.id, rule]));
  const visibleRules = defaultSalaryGradeRules.map((rule) => {
    const override = overrideMap.get(rule.id);
    return override ? salaryGradeRuleFromConfig(override, rule) : rule;
  });
  const customRules = overrides
    .filter((rule) => !defaultSalaryGradeRules.some((defaultRule) => defaultRule.id === rule.id))
    .map((rule) => salaryGradeRuleFromConfig(rule))
    .sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN") || a.id.localeCompare(b.id));
  return [...visibleRules, ...customRules];
}

export function salaryGradeLabel(ruleOrId: SalaryGradeRule | SalaryGradeId, vault?: TeacherVault): string {
  const rule = typeof ruleOrId === "string" ? salaryGradeRuleById(ruleOrId, vault) : ruleOrId;
  if (!rule) return "未设置课时费等级";
  return rule.label;
}

export function salaryGradeRuleById(id?: SalaryGradeId, vault?: TeacherVault): SalaryGradeRule | undefined {
  if (!id) return undefined;
  return (
    salaryGradeRulesForVault(vault).find((rule) => rule.id === id) ??
    legacySalaryGradeRules.find((rule) => rule.id === id)
  );
}

export function defaultSalaryGradeRule(vault?: TeacherVault): SalaryGradeRule {
  return salaryGradeRulesForVault(vault)[0] ?? defaultSalaryGradeRules[0];
}

export function resolveSalaryGradeRule(vault: TeacherVault, rule?: FeeRule): SalaryGradeRule | undefined {
  if (rule?.mode !== "salary_grade") return undefined;
  const id = rule.salaryGradeSource === "specific" ? rule.salaryGradeId : vault.profile.defaultSalaryGradeId;
  return salaryGradeRuleById(id, vault) ?? salaryGradeRuleById(rule.salaryGradeId, vault) ?? salaryGradeRuleById(vault.profile.defaultSalaryGradeId, vault);
}

export function salaryGradeAmountForCount(rule: SalaryGradeRule, courseType: CourseType, presentStudentCount: number): number {
  const count = nonNegativeInteger(presentStudentCount);
  if (courseType === "class") {
    return rule.classBaseFee + Math.max(count - 5, 0) * rule.headcountIncrementFee;
  }
  return rule.oneOnOneFee + Math.max(count - 1, 0) * rule.headcountIncrementFee;
}

export const lessonFeeUnitHours = 2;

export function lessonDurationMultiplier(lesson: Pick<Lesson, "startTime" | "endTime" | "type">, rule?: FeeRule): number {
  return billableHoursForLesson(lesson, rule) / lessonFeeUnitHours;
}

export function proratedLessonUnitAmount(unitAmount: number, lesson: Pick<Lesson, "startTime" | "endTime" | "type">, rule?: FeeRule): number {
  return nonNegativeNumber(unitAmount) * lessonDurationMultiplier(lesson, rule);
}

function nonNegativeNumber(value: number | undefined, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(value ?? fallback, 0) : fallback;
}

function nonNegativeInteger(value: number | undefined, fallback = 0): number {
  return Math.floor(nonNegativeNumber(value, fallback));
}

function hasCustomTemporaryFee(entry: Lesson["attendance"][number]): boolean {
  return entry.temporaryFee !== undefined && Number.isFinite(entry.temporaryFee);
}

function temporaryFeeOverrideDelta(rule: FeeRule, lesson: Lesson): number {
  const presentStudentCount = presentCount(lesson);
  const multiplier = lessonDurationMultiplier(lesson, rule);
  return lesson.attendance.reduce((sum, entry) => {
    if (!entry.temporary || entry.trial || !hasCustomTemporaryFee(entry)) return sum;
    const customFee = nonNegativeNumber(entry.temporaryFee);
    if (!isPresentAttendanceEntry(lesson, entry)) {
      return sum + customFee;
    }
    const countWithoutEntry = Math.max(presentStudentCount - 1, 0);
    const defaultIncrement = (
      calculateClassHeadcountFee(rule, presentStudentCount) -
      calculateClassHeadcountFee(rule, countWithoutEntry)
    ) * multiplier;
    return sum + customFee - defaultIncrement;
  }, 0);
}

function salaryGradeTemporaryFeeOverrideDelta(rule: SalaryGradeRule, lesson: Lesson): number {
  const presentStudentCount = presentCount(lesson);
  const multiplier = lessonDurationMultiplier(lesson);
  return lesson.attendance.reduce((sum, entry) => {
    if (!entry.temporary || entry.trial || !hasCustomTemporaryFee(entry)) return sum;
    const customFee = nonNegativeNumber(entry.temporaryFee);
    if (!isPresentAttendanceEntry(lesson, entry)) {
      return sum + customFee;
    }
    const countWithoutEntry = Math.max(presentStudentCount - 1, 0);
    const defaultIncrement =
      (
        salaryGradeAmountForCount(rule, lesson.type, presentStudentCount) -
        salaryGradeAmountForCount(rule, lesson.type, countWithoutEntry)
      ) * multiplier;
    return sum + customFee - defaultIncrement;
  }, 0);
}

export function temporaryFeeTotal(lesson: Lesson, rule?: FeeRule, vault?: TeacherVault): number {
  if (rule?.mode === "class_headcount") {
    return temporaryFeeOverrideDelta(rule, lesson);
  }
  if (rule?.mode === "salary_grade" && vault) {
    const gradeRule = resolveSalaryGradeRule(vault, rule);
    if (gradeRule) return salaryGradeTemporaryFeeOverrideDelta(gradeRule, lesson);
  }
  return lesson.attendance.reduce((sum, entry) => sum + nonNegativeNumber(entry.temporaryFee), 0);
}

export function trialFeeTotal(lesson: Lesson): number {
  return nonNegativeNumber(lesson.trialFee);
}

export function extraFeeTotal(lesson: Lesson, rule?: FeeRule, vault?: TeacherVault): number {
  return temporaryFeeTotal(lesson, rule, vault) + trialFeeTotal(lesson);
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
  const tier = classFeeTierForCount(rule, count) ?? normalizedClassFeeTiers(rule)[0];
  if (tier) {
    const includedStudents = nonNegativeInteger(tier.minStudents);
    const extraStudents = Math.max(count - includedStudents, 0);
    return nonNegativeNumber(tier.baseFee) + extraStudents * nonNegativeNumber(tier.perStudentFee);
  }
  return nonNegativeNumber(rule.baseFee) + count * nonNegativeNumber(rule.perPresentStudentFee);
}

export function calculateFee(rule: FeeRule, lesson: Lesson): number {
  return calculateFeeWithVault(undefined, rule, lesson);
}

export function calculateFeeWithVault(vault: TeacherVault | undefined, rule: FeeRule, lesson: Lesson): number {
  if (isOriginalFullyMadeUp(lesson) || isLessonFullyMissedAndMakeupExempt(lesson)) {
    return 0;
  }
  const extraFee = extraFeeTotal(lesson, rule, vault);
  if (lesson.type === "trial") {
    return Math.round(fixedFeeForRule(rule) + extraFee);
  }
  if (rule.mode === "hourly") {
    return Math.round((rule.hourlyRate ?? 0) * billableHoursForLesson(lesson, rule) + extraFee);
  }

  if (rule.mode === "fixed") {
    return Math.round(fixedFeeForRule(rule) + extraFee);
  }

  if (rule.mode === "salary_grade") {
    const gradeRule = vault ? resolveSalaryGradeRule(vault, rule) : salaryGradeRuleById(rule.salaryGradeId);
    if (!gradeRule) return Math.round(extraFee);
    const unitAmount = salaryGradeAmountForCount(gradeRule, lesson.type, presentCount(lesson));
    return Math.round(proratedLessonUnitAmount(unitAmount, lesson, rule) + extraFee);
  }

  return Math.round(proratedLessonUnitAmount(calculateClassHeadcountFee(rule, presentCount(lesson)), lesson, rule) + extraFee);
}

export function defaultFeeRuleForCourseType(type: CourseType): FeeRule {
  if (type === "trial") {
    return { mode: "fixed", fixedFee: 0 };
  }
  if (type !== "full_time") {
    const baseFee = 0;
    const perPresentStudentFee = 0;
    const minStudents = type === "class" ? 5 : 1;
    return {
      mode: "class_headcount",
      baseFee,
      perPresentStudentFee,
      classFeeTiers: [{ id: "tier_1_plus", minStudents, baseFee, perStudentFee: perPresentStudentFee }],
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

export function buildFeeSnapshot(vault: TeacherVault, course: CourseGroup, lesson: Lesson): FeeSnapshot {
  const presentStudentCount = presentCount(lesson);
  const trialStudentCount = namedTrialStudentCount(lesson) + (lesson.trialStudentCount ?? 0);
  const hours = billableHoursForLesson(lesson, course.feeRule);
  const durationMultiplier = hours / lessonFeeUnitHours;
  const common = {
    presentStudentCount,
    trialStudentCount,
    trialFee: lesson.trialFee ?? 0,
    hours,
    manualAdjustment: extraFeeTotal(lesson, course.feeRule, vault)
  };

  if (course.feeRule.mode === "salary_grade") {
    const gradeRule = resolveSalaryGradeRule(vault, course.feeRule);
    const unitAmount = gradeRule ? salaryGradeAmountForCount(gradeRule, course.type, presentStudentCount) : undefined;
    return {
      ...lesson.feeSnapshot,
      ...common,
      baseFee: gradeRule ? (course.type === "class" ? gradeRule.classBaseFee : gradeRule.oneOnOneFee) : undefined,
      oneOnOneFee: gradeRule?.oneOnOneFee,
      perPresentStudentFee: gradeRule?.headcountIncrementFee,
      salaryGradeId: gradeRule?.id,
      salaryGradeLabel: gradeRule ? salaryGradeLabel(gradeRule) : undefined,
      headcountBaseStudentCount: course.type === "class" ? 5 : 1,
      headcountIncrementFee: gradeRule?.headcountIncrementFee,
      lessonUnitHours: lessonFeeUnitHours,
      durationMultiplier,
      unitAmount,
      amount: calculateFeeWithVault(vault, course.feeRule, lesson)
    };
  }

  const classFeeTier = course.feeRule.mode === "class_headcount"
    ? classFeeTierForCount(course.feeRule, presentStudentCount)
    : undefined;
  const unitAmount = course.feeRule.mode === "class_headcount"
    ? calculateClassHeadcountFee(course.feeRule, presentStudentCount)
    : undefined;
  return {
    ...lesson.feeSnapshot,
    ...common,
    baseFee: classFeeTier?.baseFee ?? course.feeRule.baseFee,
    hourlyRate: course.feeRule.hourlyRate,
    fixedFee: course.feeRule.fixedFee,
    perPresentStudentFee: classFeeTier?.perStudentFee ?? course.feeRule.perPresentStudentFee,
    classFeeTierId: classFeeTier?.id,
    lessonUnitHours: course.feeRule.mode === "class_headcount" ? lessonFeeUnitHours : undefined,
    durationMultiplier: course.feeRule.mode === "class_headcount" ? durationMultiplier : undefined,
    unitAmount,
    amount: calculateFeeWithVault(vault, course.feeRule, lesson)
  };
}

export function completedAmount(lesson: Lesson): number {
  if (lesson.status !== "completed" && lesson.status !== "makeup_completed") {
    return 0;
  }
  if (isOriginalFullyMadeUp(lesson) || isLessonFullyMissedAndMakeupExempt(lesson)) {
    return 0;
  }
  return lesson.feeSnapshot.amount;
}

function completedHours(lesson: Lesson): number {
  if (lesson.status !== "completed" && lesson.status !== "makeup_completed") {
    return 0;
  }
  if (isOriginalFullyMadeUp(lesson) || isLessonFullyMissedAndMakeupExempt(lesson)) {
    return 0;
  }
  return lessonBillableHours(lesson);
}

function isLessonFullyMissedAndMakeupExempt(lesson: Lesson): boolean {
  if (lesson.linkedOriginalLessonId || lesson.attendance.length === 0) return false;
  const billableEntries = lesson.attendance.filter((entry) => !entry.trial);
  if (billableEntries.length === 0) return false;
  return billableEntries.every((entry) => isMakeupExemptMissedEntry(entry));
}

function isMakeupExemptMissedEntry(entry: Lesson["attendance"][number]): boolean {
  return Boolean(entry.makeupExempt) && (entry.status === "leave_requested" || entry.status === "absent" || entry.status === "makeup_pending");
}

function isOriginalFullyMadeUp(lesson: Lesson): boolean {
  return (
    !lesson.linkedOriginalLessonId &&
    lesson.status === "makeup_completed" &&
    lesson.attendance.length > 0 &&
    lesson.attendance.every((entry) => entry.status === "makeup_completed")
  );
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

export function estimatedMonthlyIncome(vault: TeacherVault, month: string): number {
  const monthLessons = vault.lessons.filter((lesson) => monthOf(lesson.date) === month);
  const completedIncome = monthLessons.reduce((sum, lesson) => sum + completedAmount(lesson), 0);
  const pendingIncome = monthLessons.reduce((sum, lesson) => {
    if (lesson.status !== "scheduled" && lesson.status !== "makeup_pending") return sum;
    return sum + lesson.feeSnapshot.amount;
  }, 0);
  const adjustments = vault.salaryAdjustments
    .filter((item) => item.month === month)
    .reduce((sum, item) => sum + item.amount, 0);
  const obligationDeduction = obligationSummary(vault, month).amount;
  return completedIncome + pendingIncome + vault.profile.baseSalary + adjustments - obligationDeduction;
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
