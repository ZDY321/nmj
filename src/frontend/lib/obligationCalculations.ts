import type {
  Campus,
  CourseGroup,
  TeacherVault
} from "../../shared/types";
import { isSubstituteClassLesson } from "./billingPrimitives";
import { monthOf } from "./dateCalculations";
import { completedAmount, completedHours, isPayrollExcludedSplitMergeLesson, payrollExcludedSplitMergeLessonIds } from "./payrollLessons";
import { getCourse } from "./vaultLookups";

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
  lessonDeductions: ObligationLessonDeduction[];
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

export type ObligationLessonDeduction = {
  lessonId: string;
  courseId: string;
  courseName: string;
  deductedHours: number;
  amount: number;
};

export type ObligationCampusDeduction = {
  campusId?: string;
  deductedHours: number;
  amount: number;
};

export function obligationCampusDeductions(
  vault: TeacherVault,
  obligation: ObligationSummary,
  includedLessonIds?: ReadonlySet<string>
): ObligationCampusDeduction[] {
  if (obligation.mode === "manual") {
    return obligation.amount > 0
      ? [{ campusId: obligation.campus?.id, deductedHours: 0, amount: obligation.amount }]
      : [];
  }

  const lessonsById = new Map(vault.lessons.map((lesson) => [lesson.id, lesson]));
  const deductionsByCampus = new Map<string, ObligationCampusDeduction>();
  obligation.lessonDeductions.forEach((deduction) => {
    if (includedLessonIds && !includedLessonIds.has(deduction.lessonId)) return;
    const lesson = lessonsById.get(deduction.lessonId);
    if (!lesson) return;
    const campusId = lesson.campusId ?? getCourse(vault, lesson.courseGroupId)?.defaultCampusId;
    const key = campusId ?? "__unset";
    const current = deductionsByCampus.get(key) ?? { campusId, deductedHours: 0, amount: 0 };
    current.deductedHours += deduction.deductedHours;
    current.amount += deduction.amount;
    deductionsByCampus.set(key, current);
  });
  return Array.from(deductionsByCampus.values());
}

export function obligationSummary(vault: TeacherVault, month: string, campusId = vault.profile.obligationCampusId ?? vault.profile.homeCampusId): ObligationSummary {
  const courseId = vault.profile.obligationCourseGroupId;
  const mode = vault.profile.obligationDeductionMode ?? "auto_gap";
  const configuredRequiredHours = Math.max(vault.profile.monthlyObligationHours ?? 0, 0);
  const requiredHours = Math.min(configuredRequiredHours, 10);
  const hourlyDeduction = Math.max(vault.profile.obligationHourlyDeduction ?? 0, 0);
  const manualAmount = Math.max(vault.profile.manualObligationDeduction ?? 0, 0);
  const targetAmount = Math.round(requiredHours * hourlyDeduction);
  const campus = vault.campuses.find((item) => item.id === campusId);
  const course = vault.courseGroups.find((item) => item.id === courseId);
  let remainingHours = requiredHours;
  let availableHours = 0;
  let courseDeductedHours = 0;
  let courseDeductionAmount = 0;
  const breakdown = new Map<string, ObligationCourseDeduction & { firstDeductOrder: number }>();
  const lessonDeductions: ObligationLessonDeduction[] = [];
  const splitMergeExcludedLessonIds = payrollExcludedSplitMergeLessonIds(vault, month);
  const eligibleLessons = vault.lessons
    .filter((lesson) => monthOf(lesson.date) === month && lesson.type !== "trial" && completedHours(lesson, vault) > 0)
    .filter((lesson) => !isSubstituteClassLesson(lesson))
    .filter((lesson) => !isPayrollExcludedSplitMergeLesson(lesson, splitMergeExcludedLessonIds))
    .map((lesson) => {
      const lessonCourse = getCourse(vault, lesson.courseGroupId);
      const lessonHours = completedHours(lesson, vault);
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
      amount: 0,
      firstDeductOrder: Number.POSITIVE_INFINITY
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

  sortedEligibleLessons.forEach((item, deductOrder) => {
    if (remainingHours <= 0.0001) return;
    const hoursToDeduct = Math.min(item.hours, remainingHours);
    const amountToDeduct = item.hourlyValue * hoursToDeduct;
    const current = breakdown.get(item.lesson.courseGroupId);
    if (current) {
      if (current.deductedHours === 0) {
        current.firstDeductOrder = deductOrder;
      }
      current.deductedHours += hoursToDeduct;
      current.amount += amountToDeduct;
    }
    lessonDeductions.push({
      lessonId: item.lesson.id,
      courseId: item.lesson.courseGroupId,
      courseName: item.course?.name ?? "未知课程",
      deductedHours: hoursToDeduct,
      amount: Math.round(amountToDeduct)
    });
    courseDeductedHours += hoursToDeduct;
    courseDeductionAmount += amountToDeduct;
    remainingHours -= hoursToDeduct;
  });

  const courseBreakdown = Array.from(breakdown.values())
    .map((item) => ({ ...item, amount: Math.round(item.amount) }))
    .filter((item) => item.deductedHours > 0)
    .sort((a, b) => a.firstDeductOrder - b.firstDeductOrder);
  const missingHours = mode === "manual" ? 0 : Math.max(remainingHours, 0);
  const fallbackHours = 0;
  const fallbackAmount = 0;
  const autoAmount = Math.round(courseDeductionAmount);

  return {
    campus,
    course,
    mode,
    requiredHours,
    completedHours: availableHours,
    deductedHours: mode === "manual" ? 0 : courseDeductedHours,
    missingHours,
    hourlyDeduction,
    manualAmount,
    targetAmount,
    courseDeductionAmount: Math.round(courseDeductionAmount),
    fallbackHours,
    fallbackAmount,
    courseBreakdown,
    lessonDeductions: mode === "manual" ? [] : lessonDeductions,
    amount: mode === "manual" ? manualAmount : autoAmount
  };
}

export function obligationSummaryForDateRange(vault: TeacherVault, primaryMonth: string): ObligationSummary {
  return obligationSummary(vault, primaryMonth);
}
