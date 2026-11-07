import type {
  CourseGroup,
  FeeRule,
  FeeSnapshot,
  Lesson,
  TeacherVault
} from "../../shared/types";
import { classHeadcountBaseStudentCountForCourseType, isLessonFullyMissedAndMakeupExempt, isOriginalFullyMadeUp, isSubstituteClassLesson, nonNegativeNumber } from "./billingPrimitives";
import { billableHoursForCourseLesson, billableHoursForLesson, billableStudentCapForRule, buildSubstituteClassFeeSnapshot, calculateClassHeadcountBreakdown, calculateClassHeadcountFee, classFeeTierForCount, classHeadcountBaseStudentCountForRule, classHeadcountRuleUsesClassBase, classHeadcountStageRateForRule, extraFeeTotal, feeRuleForCourseType, fixedFeeForRule, lessonFeeUnitHours, lessonWithCourseType, namedTrialStudentCount, presentCount } from "./feeRules";
import { studentMakeupOriginalClassFeeAllocation } from "./makeupCalculations";
import { overflowHeadcountFee, resolveSalaryGradeRule, salaryGradeAmountBreakdownForCount, salaryGradeAmountForCount, salaryGradeLabel, salaryGradeRateForStage, salaryGradeRuleById, salaryGradeStageForLesson, salaryGradeStageLabels } from "./salaryGradeCalculations";
import { getCourse } from "./vaultLookups";

export function calculateFee(rule: FeeRule, lesson: Lesson): number {
  return calculateFeeWithVault(undefined, rule, lesson);
}

export function calculateFeeWithVault(vault: TeacherVault | undefined, rule: FeeRule, lesson: Lesson, course?: CourseGroup): number {
  if (vault && isSubstituteClassLesson(lesson)) {
    return buildSubstituteClassFeeSnapshot(vault, lesson).amount;
  }
  if (isOriginalFullyMadeUp(lesson) || isLessonFullyMissedAndMakeupExempt(lesson)) {
    return 0;
  }
  const billingCourse = course ?? (vault ? getCourse(vault, lesson.courseGroupId) : undefined);
  const billingLesson = lessonWithCourseType(lesson, billingCourse);
  const billableHours = Number.isFinite(lesson.feeSnapshot.hours)
    ? Math.max(lesson.feeSnapshot.hours ?? 0, 0)
    : billingCourse ? billableHoursForCourseLesson(billingCourse, lesson) : billableHoursForLesson(billingLesson);
  const durationMultiplier = billableHours / lessonFeeUnitHours;
  const studentMakeupAllocation = vault && billingCourse
    ? studentMakeupOriginalClassFeeAllocation(vault, billingCourse, lesson, billableHours)
    : undefined;
  if (studentMakeupAllocation) {
    return studentMakeupAllocation.amount;
  }
  const extraFee = extraFeeTotal(lesson, rule, vault);
  if (billingLesson.type === "trial") {
    return Math.round(fixedFeeForRule(rule) + extraFee);
  }
  if (rule.mode === "hourly") {
    return Math.round((rule.hourlyRate ?? 0) * billableHours + extraFee);
  }

  if (rule.mode === "fixed") {
    return Math.round(fixedFeeForRule(rule) + extraFee);
  }

  if (rule.mode === "salary_grade") {
    const gradeRule = vault ? resolveSalaryGradeRule(vault, rule) : salaryGradeRuleById(rule.salaryGradeId);
    if (!gradeRule) return Math.round(extraFee);
    const salaryStage = vault ? salaryGradeStageForLesson(vault, billingCourse, lesson) : undefined;
    const courseTypeRule = vault ? feeRuleForCourseType(vault, billingLesson.type) : undefined;
    const baseStudentCount = vault ? classHeadcountBaseStudentCountForRule(billingLesson.type, courseTypeRule) : classHeadcountBaseStudentCountForCourseType(billingLesson.type);
    const billableStudentCap = billableStudentCapForRule(billingLesson.type, courseTypeRule);
    const unitAmount = salaryGradeAmountForCount(gradeRule, billingLesson.type, presentCount(lesson), salaryStage, baseStudentCount, billableStudentCap);
    return Math.round(nonNegativeNumber(unitAmount) * durationMultiplier + extraFee);
  }

  const salaryStage = vault ? salaryGradeStageForLesson(vault, billingCourse, lesson) : undefined;
  return Math.round(nonNegativeNumber(calculateClassHeadcountFee(rule, presentCount(lesson), billingLesson.type, salaryStage)) * durationMultiplier + extraFee);
}

export function buildFeeSnapshot(vault: TeacherVault, course: CourseGroup, lesson: Lesson): FeeSnapshot {
  const presentStudentCount = presentCount(lesson);
  const trialStudentCount = namedTrialStudentCount(lesson) + (lesson.trialStudentCount ?? 0);
  const suggestedHours = billableHoursForCourseLesson(course, lesson);
  const existingHours = lesson.feeSnapshot.hours;
  const manualHours = lesson.feeSnapshot.manualHours === true && Number.isFinite(existingHours);
  const hours = manualHours ? Math.max(existingHours ?? 0, 0) : suggestedHours;
  const lessonForCalculation = { ...lesson, feeSnapshot: { ...lesson.feeSnapshot, hours } };
  const durationMultiplier = hours / lessonFeeUnitHours;
  const common = {
    presentStudentCount,
    trialStudentCount,
    trialFee: lesson.trialFee ?? 0,
    hours,
    manualHours: manualHours ? true : undefined,
    manualAdjustment: extraFeeTotal(lessonForCalculation, course.feeRule, vault)
  };
  const studentMakeupAllocation = studentMakeupOriginalClassFeeAllocation(vault, course, lessonForCalculation, hours);

  if (course.feeRule.mode === "salary_grade") {
    const gradeRule = resolveSalaryGradeRule(vault, course.feeRule);
    const salaryStage = salaryGradeStageForLesson(vault, course, lesson);
    const salaryStageRate = gradeRule ? salaryGradeRateForStage(gradeRule, salaryStage) : undefined;
    const courseTypeRule = feeRuleForCourseType(vault, course.type);
    const salaryHeadcountBaseStudentCount = classHeadcountBaseStudentCountForRule(course.type, courseTypeRule);
    const salaryBillableStudentCap = billableStudentCapForRule(course.type, courseTypeRule);
    const breakdown = gradeRule
      ? salaryGradeAmountBreakdownForCount(gradeRule, course.type, presentStudentCount, salaryStage, salaryHeadcountBaseStudentCount, salaryBillableStudentCap)
      : undefined;
    return {
      ...lesson.feeSnapshot,
      ...common,
      baseFee: salaryStageRate ? (salaryHeadcountBaseStudentCount > 1 ? salaryStageRate.classBaseFee : salaryStageRate.oneOnOneFee) : undefined,
      oneOnOneFee: salaryStageRate?.oneOnOneFee,
      perPresentStudentFee: salaryStageRate?.headcountIncrementFee,
      salaryGradeId: gradeRule?.id,
      salaryGradeLabel: gradeRule ? salaryGradeLabel(gradeRule) : undefined,
      salaryGradeStage: salaryStage,
      salaryGradeStageLabel: salaryStage ? salaryGradeStageLabels[salaryStage] : undefined,
      headcountBaseStudentCount: studentMakeupAllocation?.headcountBaseStudentCount ?? salaryHeadcountBaseStudentCount,
      headcountIncrementFee: salaryStageRate?.headcountIncrementFee,
      billableStudentCount: breakdown?.billableStudentCount,
      billableStudentCap: salaryBillableStudentCap,
      overflowStudentCount: breakdown?.overflowStudentCount,
      overflowHeadcountFee: breakdown && breakdown.overflowStudentCount > 0 ? overflowHeadcountFee : undefined,
      lessonUnitHours: lessonFeeUnitHours,
      durationMultiplier,
      unitAmount: studentMakeupAllocation?.unitAmount ?? breakdown?.amount,
      amount: studentMakeupAllocation?.amount ?? calculateFeeWithVault(vault, course.feeRule, lessonForCalculation, course)
    };
  }

  const classFeeTier = course.feeRule.mode === "class_headcount"
    ? classFeeTierForCount(course.feeRule, presentStudentCount)
    : undefined;
  const classHeadcountStage = course.feeRule.mode === "class_headcount"
    ? salaryGradeStageForLesson(vault, course, lesson)
    : undefined;
  const classHeadcountStageRate = course.feeRule.mode === "class_headcount" && course.feeRule.stageRates
    ? classHeadcountStageRateForRule(course.feeRule, course.type, classHeadcountStage)
    : undefined;
  const classHeadcountBaseStudentCount = course.feeRule.mode === "class_headcount"
    ? classHeadcountBaseStudentCountForRule(course.type, course.feeRule)
    : undefined;
  const classHeadcountBreakdown = course.feeRule.mode === "class_headcount"
    ? calculateClassHeadcountBreakdown(course.feeRule, presentStudentCount, course.type, classHeadcountStage)
    : undefined;
  return {
    ...lesson.feeSnapshot,
    ...common,
    baseFee: classHeadcountStageRate ? (classHeadcountRuleUsesClassBase(course.type, course.feeRule) ? classHeadcountStageRate.classBaseFee : classHeadcountStageRate.oneOnOneFee) : classFeeTier?.baseFee ?? course.feeRule.baseFee,
    hourlyRate: course.feeRule.hourlyRate,
    fixedFee: course.feeRule.fixedFee,
    perPresentStudentFee: classHeadcountStageRate?.headcountIncrementFee ?? classFeeTier?.perStudentFee ?? course.feeRule.perPresentStudentFee,
    classFeeTierId: classFeeTier?.id,
    salaryGradeStage: classHeadcountStage,
    salaryGradeStageLabel: classHeadcountStage ? salaryGradeStageLabels[classHeadcountStage] : undefined,
    headcountBaseStudentCount: classHeadcountBaseStudentCount,
    headcountIncrementFee: classHeadcountStageRate?.headcountIncrementFee,
    billableStudentCount: classHeadcountBreakdown?.billableStudentCount,
    billableStudentCap: course.feeRule.mode === "class_headcount" ? billableStudentCapForRule(course.type, course.feeRule) : undefined,
    overflowStudentCount: classHeadcountBreakdown?.overflowStudentCount,
    overflowHeadcountFee: classHeadcountBreakdown && classHeadcountBreakdown.overflowStudentCount > 0 ? overflowHeadcountFee : undefined,
    lessonUnitHours: course.feeRule.mode === "class_headcount" ? lessonFeeUnitHours : undefined,
    durationMultiplier: course.feeRule.mode === "class_headcount" ? durationMultiplier : undefined,
    unitAmount: studentMakeupAllocation?.unitAmount ?? classHeadcountBreakdown?.amount,
    amount: studentMakeupAllocation?.amount ?? calculateFeeWithVault(vault, course.feeRule, lessonForCalculation, course)
  };
}
