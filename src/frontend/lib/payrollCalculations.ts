import type {
  AttendanceStatus,
  SalaryAdjustment,
  SalaryBreakdown,
  TeacherVault
} from "../../shared/types";
import { isClassBillingCourseType, isSubstituteClassLesson } from "./billingPrimitives";
import { dateRangeLessons, isWholeMonthInDateRange, monthOf, monthsInDateRange } from "./dateCalculations";
import { courseUsesClassBilling } from "./feeRules";
import { obligationSummary, obligationSummaryForDateRange } from "./obligationCalculations";
import { completedAmount, isPayrollExcludedSplitMergeLesson, payrollCompletedLessonCount, payrollExcludedSplitMergeLessonIds } from "./payrollLessons";
import { getCourse } from "./vaultLookups";

export function salaryBreakdown(vault: TeacherVault, month: string): SalaryBreakdown {
  const monthLessons = vault.lessons.filter((lesson) => monthOf(lesson.date) === month);
  const monthAdjustments = vault.salaryAdjustments.filter((item) => item.month === month);
  const splitMergeExcludedLessonIds = payrollExcludedSplitMergeLessonIds(vault, month);

  const lessonTotals = monthLessons.reduce(
    (totals, lesson) => {
      if (isPayrollExcludedSplitMergeLesson(lesson, splitMergeExcludedLessonIds)) return totals;
      const amount = completedAmount(lesson);
      const course = getCourse(vault, lesson.courseGroupId);
      if (isSubstituteClassLesson(lesson)) {
        totals.substituteClass += amount;
      } else if (lesson.status === "makeup_completed") {
        totals.makeup += amount;
      } else if (course ? courseUsesClassBilling(course, vault) : isClassBillingCourseType(lesson.type)) {
        totals.classLessons += amount;
      } else {
        totals.oneOnOne += amount;
      }
      return totals;
    },
    { oneOnOne: 0, classLessons: 0, makeup: 0, substituteClass: 0 }
  );

  const adjustments = monthAdjustments.reduce((sum, item) => sum + item.amount, 0);
  const obligationDeduction = obligationSummary(vault, month).amount;

  return {
    baseSalary: vault.profile.baseSalary,
    oneOnOne: lessonTotals.oneOnOne,
    classLessons: lessonTotals.classLessons,
    makeup: lessonTotals.makeup,
    substituteClass: lessonTotals.substituteClass,
    adjustments,
    obligationDeduction,
    total:
      vault.profile.baseSalary +
      lessonTotals.oneOnOne +
      lessonTotals.classLessons +
      lessonTotals.makeup +
      lessonTotals.substituteClass +
      adjustments -
      obligationDeduction
  };
}

export function estimatedMonthlyIncome(vault: TeacherVault, month: string): number {
  const monthLessons = vault.lessons.filter((lesson) => monthOf(lesson.date) === month);
  const splitMergeExcludedLessonIds = payrollExcludedSplitMergeLessonIds(vault, month);
  const completedIncome = monthLessons.reduce((sum, lesson) => isPayrollExcludedSplitMergeLesson(lesson, splitMergeExcludedLessonIds) ? sum : sum + completedAmount(lesson), 0);
  const pendingIncome = monthLessons.reduce((sum, lesson) => {
    if (isPayrollExcludedSplitMergeLesson(lesson, splitMergeExcludedLessonIds)) return sum;
    if (lesson.status !== "scheduled" && lesson.status !== "makeup_pending") return sum;
    return sum + lesson.feeSnapshot.amount;
  }, 0);
  const adjustments = vault.salaryAdjustments
    .filter((item) => item.month === month)
    .reduce((sum, item) => sum + item.amount, 0);
  const obligationDeduction = obligationSummary(vault, month).amount;
  return completedIncome + pendingIncome + vault.profile.baseSalary + adjustments - obligationDeduction;
}

export function salaryBreakdownForDateRange(vault: TeacherVault, startDate: string, endDate: string, primaryMonth: string): SalaryBreakdown {
  const months = monthsInDateRange(startDate, endDate);
  const selectedLessons = dateRangeLessons(vault, startDate, endDate);
  const splitMergeExcludedLessonIds = payrollExcludedSplitMergeLessonIds(vault);
  const lessonTotals = selectedLessons.reduce(
    (totals, lesson) => {
      if (isPayrollExcludedSplitMergeLesson(lesson, splitMergeExcludedLessonIds)) return totals;
      const amount = completedAmount(lesson);
      const course = getCourse(vault, lesson.courseGroupId);
      if (isSubstituteClassLesson(lesson)) {
        totals.substituteClass += amount;
      } else if (lesson.status === "makeup_completed") {
        totals.makeup += amount;
      } else if (course ? courseUsesClassBilling(course, vault) : isClassBillingCourseType(lesson.type)) {
        totals.classLessons += amount;
      } else {
        totals.oneOnOne += amount;
      }
      return totals;
    },
    { oneOnOne: 0, classLessons: 0, makeup: 0, substituteClass: 0 }
  );
  const wholeMonths = months.filter((month) => isWholeMonthInDateRange(month, startDate, endDate));
  const baseSalary = months.length > 0 ? vault.profile.baseSalary : 0;
  const adjustments = vault.salaryAdjustments
    .filter((item) => wholeMonths.includes(item.month))
    .reduce((sum, item) => sum + item.amount, 0);
  const obligationDeduction = months.length > 0 ? obligationSummaryForDateRange(vault, primaryMonth).amount : 0;

  return {
    baseSalary,
    ...lessonTotals,
    adjustments,
    obligationDeduction,
    total: baseSalary + lessonTotals.oneOnOne + lessonTotals.classLessons + lessonTotals.makeup + lessonTotals.substituteClass + adjustments - obligationDeduction
  };
}

export function estimatedIncomeForDateRange(vault: TeacherVault, startDate: string, endDate: string, primaryMonth: string): number {
  const selectedLessons = dateRangeLessons(vault, startDate, endDate);
  const splitMergeExcludedLessonIds = payrollExcludedSplitMergeLessonIds(vault);
  const lessonIncome = selectedLessons.reduce((sum, lesson) => {
    if (isPayrollExcludedSplitMergeLesson(lesson, splitMergeExcludedLessonIds)) return sum;
    if (lesson.status === "scheduled" || lesson.status === "makeup_pending") return sum + lesson.feeSnapshot.amount;
    return sum + completedAmount(lesson);
  }, 0);
  const breakdown = salaryBreakdownForDateRange(vault, startDate, endDate, primaryMonth);
  return lessonIncome + breakdown.baseSalary + breakdown.adjustments - breakdown.obligationDeduction;
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
    return {
      month,
      total: salaryBreakdown(vault, month).total,
      count: payrollCompletedLessonCount(vault, month)
    };
  });
}

export function adjustmentTotal(adjustments: SalaryAdjustment[]): number {
  return adjustments.reduce((sum, item) => sum + item.amount, 0);
}
