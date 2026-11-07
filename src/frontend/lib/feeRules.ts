import type {
  ClassFeeTier,
  CourseGroup,
  CourseType,
  FeeRule,
  FeeSnapshot,
  Lesson,
  SalaryGradeStage,
  SalaryGradeStageRateConfig,
  TeacherVault
} from "../../shared/types";
import { billableStudentCapForCourseType, classHeadcountBaseStudentCountForCourseType, isClassBillingCourseType, nonNegativeInteger, nonNegativeNumber } from "./billingPrimitives";
import { defaultSalaryGradeRule, headcountAmount, HeadcountAmountBreakdown, headcountAmountBreakdown, headcountInputForRate, normalizeStageRate, normalizeStageRates, resolveSalaryGradeRule, salaryGradeAmountForCount, salaryGradeLabel, salaryGradeRateForStage, SalaryGradeRule, salaryGradeRuleById, salaryGradeStageForLesson, salaryGradeStageLabels } from "./salaryGradeCalculations";
import { getCourse } from "./vaultLookups";

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

export function usesClassBillingHours(type: CourseType, rule?: FeeRule): boolean {
  return isClassBillingCourseType(type) || classHeadcountBaseStudentCountForRule(type, rule) > 1;
}

export function usesStandardBillingHours(type: CourseType): boolean {
  return type !== "trial";
}

export function courseTypeUsesClassBilling(vault: TeacherVault | undefined, type: CourseType, rule?: FeeRule): boolean {
  if (usesClassBillingHours(type, rule)) return true;
  return vault ? classHeadcountBaseStudentCountForRule(type, feeRuleForCourseType(vault, type)) > 1 : false;
}

export function courseUsesClassBilling(course: Pick<CourseGroup, "type" | "feeRule">, vault?: TeacherVault): boolean {
  return courseTypeUsesClassBilling(vault, course.type, course.feeRule);
}

export function billableHoursForLesson(lesson: Pick<Lesson, "startTime" | "endTime" | "type">): number {
  if (usesStandardBillingHours(lesson.type)) {
    return normalizedClassHoursBetween(lesson.startTime, lesson.endTime);
  }
  return hoursBetween(lesson.startTime, lesson.endTime);
}

export function courseUsesStandardBillingHours(course: Pick<CourseGroup, "type">): boolean {
  return usesStandardBillingHours(course.type);
}

export function billableHoursForCourseLesson(course: Pick<CourseGroup, "type" | "feeRule">, lesson: Pick<Lesson, "startTime" | "endTime">): number {
  if (courseUsesStandardBillingHours(course)) {
    return normalizedClassHoursBetween(lesson.startTime, lesson.endTime);
  }
  return hoursBetween(lesson.startTime, lesson.endTime);
}

export function lessonBillableHours(lesson: Lesson): number {
  return Number.isFinite(lesson.feeSnapshot.hours) ? Math.max(lesson.feeSnapshot.hours ?? 0, 0) : billableHoursForLesson(lesson);
}

export function lessonBillableHoursForVault(vault: TeacherVault, lesson: Lesson): number {
  const course = getCourse(vault, lesson.courseGroupId);
  const snapshotHours = lesson.feeSnapshot.hours;
  if (Number.isFinite(snapshotHours)) return Math.max(snapshotHours ?? 0, 0);
  return course ? billableHoursForCourseLesson(course, lesson) : billableHoursForLesson(lesson);
}

export function suggestedLessonBillableHoursForVault(vault: TeacherVault, lesson: Lesson): number {
  const course = getCourse(vault, lesson.courseGroupId);
  return course ? billableHoursForCourseLesson(course, lesson) : billableHoursForLesson(lesson);
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

export const lessonFeeUnitHours = 2;

export function lessonDurationMultiplier(lesson: Pick<Lesson, "startTime" | "endTime" | "type"> & Partial<Pick<Lesson, "feeSnapshot">>): number {
  return (lesson.feeSnapshot && Number.isFinite(lesson.feeSnapshot.hours)
    ? Math.max(lesson.feeSnapshot.hours ?? 0, 0)
    : billableHoursForLesson(lesson)) / lessonFeeUnitHours;
}

export function lessonDurationMultiplierForCourse(course: Pick<CourseGroup, "type" | "feeRule">, lesson: Pick<Lesson, "startTime" | "endTime"> & Partial<Pick<Lesson, "feeSnapshot">>): number {
  return (lesson.feeSnapshot && Number.isFinite(lesson.feeSnapshot.hours)
    ? Math.max(lesson.feeSnapshot.hours ?? 0, 0)
    : billableHoursForCourseLesson(course, lesson)) / lessonFeeUnitHours;
}

export function substituteClassPresentCount(lesson: Pick<Lesson, "substituteClass">): number {
  return nonNegativeInteger(lesson.substituteClass?.presentStudentCount);
}

export function substituteClassPerStudentFee(vault: TeacherVault, lesson: Pick<Lesson, "substituteClass">): number {
  const gradeRule = salaryGradeRuleById(vault.profile.defaultSalaryGradeId, vault) ?? defaultSalaryGradeRule(vault);
  return salaryGradeRateForStage(gradeRule, lesson.substituteClass?.salaryGradeStage).headcountIncrementFee;
}

export function buildSubstituteClassFeeSnapshot(vault: TeacherVault, lesson: Lesson): FeeSnapshot {
  const gradeRule = salaryGradeRuleById(vault.profile.defaultSalaryGradeId, vault) ?? defaultSalaryGradeRule(vault);
  const stage = lesson.substituteClass?.salaryGradeStage;
  const rate = salaryGradeRateForStage(gradeRule, stage);
  const presentStudentCount = substituteClassPresentCount(lesson);
  const suggestedHours = billableHoursForLesson({ ...lesson, type: "class" });
  const existingHours = lesson.feeSnapshot.hours;
  const manualHours = lesson.feeSnapshot.manualHours === true && Number.isFinite(existingHours);
  const hours = manualHours ? Math.max(existingHours ?? 0, 0) : suggestedHours;
  const durationMultiplier = hours / lessonFeeUnitHours;
  const unitAmount = presentStudentCount * rate.headcountIncrementFee;

  return {
    ...lesson.feeSnapshot,
    baseFee: 0,
    perPresentStudentFee: rate.headcountIncrementFee,
    salaryGradeId: gradeRule.id,
    salaryGradeLabel: salaryGradeLabel(gradeRule),
    salaryGradeStage: stage,
    salaryGradeStageLabel: stage ? salaryGradeStageLabels[stage] : undefined,
    headcountBaseStudentCount: 0,
    headcountIncrementFee: rate.headcountIncrementFee,
    lessonUnitHours: lessonFeeUnitHours,
    durationMultiplier,
    unitAmount,
    presentStudentCount,
    hours,
    manualHours: manualHours ? true : undefined,
    amount: Math.round(unitAmount * durationMultiplier)
  };
}

export function proratedLessonUnitAmount(unitAmount: number, lesson: Pick<Lesson, "startTime" | "endTime" | "type">): number {
  return nonNegativeNumber(unitAmount) * lessonDurationMultiplier(lesson);
}

export function billableStudentCapForRule(type: CourseType, rule?: FeeRule): number | undefined {
  return Number.isFinite(rule?.billableStudentCap)
    ? nonNegativeInteger(rule?.billableStudentCap)
    : billableStudentCapForCourseType(type);
}

export function classHeadcountBaseStudentCountForRule(type: CourseType, rule?: FeeRule): number {
  const minStudents = rule?.mode === "class_headcount" ? normalizedClassFeeTiers(rule)[0]?.minStudents : undefined;
  return nonNegativeInteger(minStudents, classHeadcountBaseStudentCountForCourseType(type));
}

export function classHeadcountRuleUsesClassBase(type: CourseType, rule?: FeeRule): boolean {
  return classHeadcountBaseStudentCountForRule(type, rule) > 1;
}

export function classHeadcountStageRateForRule(rule: FeeRule, type: CourseType, stage?: SalaryGradeStage): SalaryGradeStageRateConfig {
  const fallbackTier = normalizedClassFeeTiers(rule)[0];
  const usesClassBase = classHeadcountRuleUsesClassBase(type, rule);
  const baseRate = {
    oneOnOneFee: usesClassBase ? 0 : nonNegativeNumber(fallbackTier?.baseFee ?? rule.baseFee),
    classBaseFee: usesClassBase ? nonNegativeNumber(fallbackTier?.baseFee ?? rule.baseFee) : 0,
    headcountIncrementFee: nonNegativeNumber(fallbackTier?.perStudentFee ?? rule.perPresentStudentFee)
  };
  const fallbackRates = rule.stageRates ? normalizeStageRates(baseRate, rule.stageRates) : undefined;
  return normalizeStageRate(rule.stageRates?.[stage ?? "junior_3"], fallbackRates?.[stage ?? "junior_3"] ?? fallbackRates?.junior_3 ?? baseRate);
}

export function classHeadcountAmountForRate(
  rate: SalaryGradeStageRateConfig,
  type: CourseType,
  presentStudentCount: number,
  baseStudentCount = classHeadcountBaseStudentCountForCourseType(type),
  billableStudentCap = billableStudentCapForCourseType(type)
): number {
  return headcountAmount(headcountInputForRate(rate, baseStudentCount, presentStudentCount, billableStudentCap));
}

export function classHeadcountAmountBreakdownForRate(
  rate: SalaryGradeStageRateConfig,
  type: CourseType,
  presentStudentCount: number,
  baseStudentCount = classHeadcountBaseStudentCountForCourseType(type),
  billableStudentCap = billableStudentCapForCourseType(type)
): HeadcountAmountBreakdown {
  return headcountAmountBreakdown(headcountInputForRate(rate, baseStudentCount, presentStudentCount, billableStudentCap));
}

export function classHeadcountFeeRuleForCourseType(
  type: CourseType,
  baseFee = 0,
  perStudentFee = 0,
  minStudents = classHeadcountBaseStudentCountForCourseType(type),
  makeupFeeMode: FeeRule["makeupFeeMode"] = "perStudentFee",
  stageRates?: Partial<Record<SalaryGradeStage, SalaryGradeStageRateConfig>>,
  billableStudentCap = billableStudentCapForCourseType(type)
): FeeRule {
  const tier = {
    id: "tier_1_plus",
    minStudents: nonNegativeInteger(minStudents),
    baseFee: nonNegativeNumber(baseFee),
    perStudentFee: nonNegativeNumber(perStudentFee)
  };
  const usesClassBase = tier.minStudents > 1;
  const fallbackRate = {
    oneOnOneFee: usesClassBase ? 0 : tier.baseFee,
    classBaseFee: usesClassBase ? tier.baseFee : 0,
    headcountIncrementFee: tier.perStudentFee
  };
  return {
    mode: "class_headcount",
    baseFee: tier.baseFee,
    perPresentStudentFee: tier.perStudentFee,
    classFeeTiers: [tier],
    billableStudentCap: Number.isFinite(billableStudentCap) ? nonNegativeInteger(billableStudentCap) : undefined,
    stageRates: normalizeStageRates(fallbackRate, stageRates),
    makeupFeeMode
  };
}

export function lessonWithCourseType(lesson: Lesson, course?: Pick<CourseGroup, "type">): Lesson {
  return course && lesson.type !== course.type ? { ...lesson, type: course.type } : lesson;
}

function hasCustomTemporaryFee(entry: Lesson["attendance"][number]): boolean {
  return entry.temporaryFee !== undefined && Number.isFinite(entry.temporaryFee);
}

function temporaryFeeOverrideDelta(rule: FeeRule, lesson: Lesson, stage?: SalaryGradeStage, durationMultiplier = lessonDurationMultiplier(lesson)): number {
  const presentStudentCount = presentCount(lesson);
  return lesson.attendance.reduce((sum, entry) => {
    if (!entry.temporary || entry.trial || !hasCustomTemporaryFee(entry)) return sum;
    const customFee = nonNegativeNumber(entry.temporaryFee);
    if (!isPresentAttendanceEntry(lesson, entry)) {
      return sum + customFee;
    }
    const countWithoutEntry = Math.max(presentStudentCount - 1, 0);
    const defaultIncrement = (
      calculateClassHeadcountFee(rule, presentStudentCount, lesson.type, stage) -
      calculateClassHeadcountFee(rule, countWithoutEntry, lesson.type, stage)
    ) * durationMultiplier;
    return sum + customFee - defaultIncrement;
  }, 0);
}

function salaryGradeTemporaryFeeOverrideDelta(
  rule: SalaryGradeRule,
  lesson: Lesson,
  stage?: SalaryGradeStage,
  baseStudentCount = classHeadcountBaseStudentCountForCourseType(lesson.type),
  durationMultiplier = lessonDurationMultiplier(lesson),
  billableStudentCap = billableStudentCapForCourseType(lesson.type)
): number {
  const presentStudentCount = presentCount(lesson);
  return lesson.attendance.reduce((sum, entry) => {
    if (!entry.temporary || entry.trial || !hasCustomTemporaryFee(entry)) return sum;
    const customFee = nonNegativeNumber(entry.temporaryFee);
    if (!isPresentAttendanceEntry(lesson, entry)) {
      return sum + customFee;
    }
    const countWithoutEntry = Math.max(presentStudentCount - 1, 0);
    const defaultIncrement =
      (
        salaryGradeAmountForCount(rule, lesson.type, presentStudentCount, stage, baseStudentCount, billableStudentCap) -
        salaryGradeAmountForCount(rule, lesson.type, countWithoutEntry, stage, baseStudentCount, billableStudentCap)
      ) * durationMultiplier;
    return sum + customFee - defaultIncrement;
  }, 0);
}

export function temporaryFeeTotal(lesson: Lesson, rule?: FeeRule, vault?: TeacherVault): number {
  const course = vault ? getCourse(vault, lesson.courseGroupId) : undefined;
  const billingLesson = lessonWithCourseType(lesson, course);
  const durationMultiplier = course ? lessonDurationMultiplierForCourse(course, lesson) : lessonDurationMultiplier(billingLesson);
  if (rule?.mode === "class_headcount") {
    return temporaryFeeOverrideDelta(rule, billingLesson, vault ? salaryGradeStageForLesson(vault, course, lesson) : undefined, durationMultiplier);
  }
  if (rule?.mode === "salary_grade" && vault) {
    const gradeRule = resolveSalaryGradeRule(vault, rule);
    if (gradeRule) {
      const courseTypeRule = feeRuleForCourseType(vault, billingLesson.type);
      return salaryGradeTemporaryFeeOverrideDelta(
        gradeRule,
        billingLesson,
        salaryGradeStageForLesson(vault, course, lesson),
        classHeadcountBaseStudentCountForRule(billingLesson.type, courseTypeRule),
        durationMultiplier,
        billableStudentCapForRule(billingLesson.type, courseTypeRule)
      );
    }
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

export function calculateClassHeadcountFee(rule: FeeRule, studentCount: number, type?: CourseType, stage?: SalaryGradeStage): number {
  return calculateClassHeadcountBreakdown(rule, studentCount, type, stage).amount;
}

export function calculateClassHeadcountBreakdown(
  rule: FeeRule,
  studentCount: number,
  type?: CourseType,
  stage?: SalaryGradeStage
): HeadcountAmountBreakdown {
  if (type && rule.stageRates) {
    return classHeadcountAmountBreakdownForRate(
      classHeadcountStageRateForRule(rule, type, stage),
      type,
      studentCount,
      classHeadcountBaseStudentCountForRule(type, rule),
      billableStudentCapForRule(type, rule)
    );
  }
  const tier = classFeeTierForCount(rule, nonNegativeInteger(studentCount)) ?? normalizedClassFeeTiers(rule)[0];
  return headcountAmountBreakdown({
    baseFee: nonNegativeNumber(tier ? tier.baseFee : rule.baseFee),
    incrementFee: nonNegativeNumber(tier ? tier.perStudentFee : rule.perPresentStudentFee),
    baseStudentCount: tier ? nonNegativeInteger(tier.minStudents) : 0,
    presentStudentCount: studentCount,
    billableStudentCap: type ? billableStudentCapForRule(type, rule) : rule.billableStudentCap
  });
}

export function defaultFeeRuleForCourseType(type: CourseType): FeeRule {
  if (type === "trial") {
    return { mode: "fixed", fixedFee: 0 };
  }
  return classHeadcountFeeRuleForCourseType(type);
}

export function fixedFeeForRule(rule: FeeRule): number {
  return Math.max(rule.fixedFee ?? rule.hourlyRate ?? 0, 0);
}

export function backupFeeRuleForCourseType(type: CourseType, feeRule?: FeeRule): FeeRule {
  const sourceRule = feeRule ?? defaultFeeRuleForCourseType(type);
  if (type === "trial") {
    return { mode: "fixed", fixedFee: fixedFeeForRule(sourceRule) };
  }
  if (sourceRule.mode === "class_headcount") {
    const explicitTiers = (sourceRule.classFeeTiers ?? []).filter((tier) => Number.isFinite(tier.minStudents));
    const tier = explicitTiers.length > 0
      ? [...explicitTiers].sort((a, b) => a.minStudents - b.minStudents)[0]
      : undefined;
    const minStudents = nonNegativeInteger(tier?.minStudents, classHeadcountBaseStudentCountForCourseType(type));
    return classHeadcountFeeRuleForCourseType(
      type,
      tier ? tier.baseFee : sourceRule.baseFee,
      tier ? tier.perStudentFee : sourceRule.perPresentStudentFee,
      minStudents,
      sourceRule.makeupFeeMode ?? "perStudentFee",
      sourceRule.stageRates,
      billableStudentCapForRule(type, sourceRule)
    );
  }
  const baseFee = sourceRule.mode === "hourly"
    ? nonNegativeNumber(sourceRule.hourlyRate) * lessonFeeUnitHours
    : sourceRule.mode === "fixed"
      ? fixedFeeForRule(sourceRule)
      : 0;
  return classHeadcountFeeRuleForCourseType(
    type,
    baseFee,
    0,
    classHeadcountBaseStudentCountForCourseType(type),
    "perStudentFee",
    sourceRule.stageRates,
    billableStudentCapForRule(type, sourceRule)
  );
}

export function feeRuleForCourseType(vault: TeacherVault, type: CourseType): FeeRule {
  return vault.preferences?.courseTypeFeeRules?.[type] ?? defaultFeeRuleForCourseType(type);
}
