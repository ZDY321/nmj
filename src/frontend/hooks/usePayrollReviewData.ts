import { useMemo } from "react";
import type { CourseType, Lesson, TeacherVault } from "@/shared/types";
import { completedAmount, courseUsesClassBilling, estimatedMonthlyIncome, isPayrollExcludedSplitMergeLesson, lessonBillableHoursForVault, obligationSummary, payrollExcludedSplitMergeLessonIds, salaryBreakdown } from "@/frontend/lib/calculations";
import {
  campusName,
  compareByName,
  courseTypeOptionsForVault,
  lessonAttendanceNoteText,
  lessonCampusId,
  lessonStudentIds,
  sortLessons,
  sortCampusesForProfile,
  sortCoursesByName,
  studentNames
} from "@/frontend/lib/helpers";

export type PayrollCourseTypeFilter = "all" | CourseType;
export type PayrollLessonStatusFilter = "all" | Lesson["status"];
type OverviewCampusKey = "oneOnOne" | "classLessons" | "makeup";

type PayrollCampusAmountDetail = {
  key: string;
  campus: string;
  amount: number;
  count: number;
};

export function usePayrollReviewData({
  vault,
  selectedMonth,
  campusFilter,
  typeFilter,
  statusFilter,
  gradeFilter,
  detailStartDateFilter,
  detailEndDateFilter,
  detailCourseFilter,
  detailStudentFilter,
  detailStatusFilter
}: {
  vault: TeacherVault;
  selectedMonth: string;
  campusFilter: string;
  typeFilter: PayrollCourseTypeFilter;
  statusFilter: PayrollLessonStatusFilter;
  gradeFilter: string;
  detailStartDateFilter: string;
  detailEndDateFilter: string;
  detailCourseFilter: string;
  detailStudentFilter: string;
  detailStatusFilter: PayrollLessonStatusFilter;
}) {
  const campusOptions = useMemo(
    () => sortCampusesForProfile(vault.campuses, vault.profile.homeCampusId),
    [vault.campuses, vault.profile.homeCampusId]
  );
  const courseOptions = useMemo(() => sortCoursesByName(vault.courseGroups), [vault.courseGroups]);
  const courseTypeOptions = useMemo(() => courseTypeOptionsForVault(vault), [vault]);
  const gradeOptions = useMemo(
    () => Array.from(new Set(vault.students.map((student) => student.grade).filter(Boolean) as string[])).sort(compareByName),
    [vault.students]
  );
  const effectiveObligationCampusId = vault.profile.obligationCampusId ?? vault.profile.homeCampusId;

  function matchesGradeFilter(lesson: Lesson): boolean {
    return (
      gradeFilter === "all" ||
      lesson.expectedStudentIds.some((studentId) => vault.students.find((student) => student.id === studentId)?.grade === gradeFilter)
    );
  }

  function matchesReviewFilters(lesson: Lesson, includeCampus: boolean): boolean {
    const matchesCampus = !includeCampus || campusFilter === "all" || lessonCampusId(vault, lesson) === campusFilter;
    const matchesType = typeFilter === "all" || lesson.type === typeFilter;
    const matchesStatus = statusFilter === "all" || lesson.status === statusFilter;
    return matchesCampus && matchesType && matchesStatus && matchesGradeFilter(lesson);
  }

  const monthLessons = useMemo(
    () => vault.lessons.filter((lesson) => lesson.date.startsWith(selectedMonth)),
    [selectedMonth, vault.lessons]
  );
  const splitMergeExcludedLessonIds = useMemo(
    () => payrollExcludedSplitMergeLessonIds(vault, selectedMonth),
    [selectedMonth, vault]
  );
  const monthPayrollLessons = useMemo(
    () => monthLessons.filter((lesson) => !isPayrollExcludedSplitMergeLesson(lesson, splitMergeExcludedLessonIds)),
    [monthLessons, splitMergeExcludedLessonIds]
  );
  const filteredLessons = useMemo(
    () => monthPayrollLessons
      .filter((lesson) => matchesReviewFilters(lesson, true))
      .sort(sortLessons),
    [campusFilter, gradeFilter, monthPayrollLessons, statusFilter, typeFilter, vault]
  );
  const detailLessons = useMemo(
    () => filteredLessons
      .filter((lesson) => {
        const matchesDate =
          (!detailStartDateFilter || lesson.date >= detailStartDateFilter) &&
          (!detailEndDateFilter || lesson.date <= detailEndDateFilter);
        const matchesCourse = detailCourseFilter === "all" || lesson.courseGroupId === detailCourseFilter;
        const studentSearchTerms = detailStudentFilter.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const studentSearchText = [
          studentNames(vault, lessonStudentIds(lesson)),
          lessonAttendanceNoteText(vault, lesson)
        ].join(" ").toLowerCase();
        const matchesStudent =
          studentSearchTerms.length === 0 ||
          studentSearchTerms.every((term) => studentSearchText.includes(term));
        const matchesStatus = detailStatusFilter === "all" || lesson.status === detailStatusFilter;
        return matchesDate && matchesCourse && matchesStudent && matchesStatus;
      })
      .sort(sortLessons),
    [detailCourseFilter, detailEndDateFilter, detailStartDateFilter, detailStatusFilter, detailStudentFilter, filteredLessons, vault]
  );

  const breakdown = useMemo(() => salaryBreakdown(vault, selectedMonth), [selectedMonth, vault]);
  const lessonFeeTotal = breakdown.oneOnOne + breakdown.classLessons + breakdown.makeup;
  const estimatedIncome = useMemo(() => estimatedMonthlyIncome(vault, selectedMonth), [selectedMonth, vault]);
  const monthObligation = useMemo(
    () => obligationSummary(vault, selectedMonth),
    [selectedMonth, vault]
  );
  const currentCampusObligation = useMemo(
    () => campusFilter === "all" ? monthObligation : obligationSummary(vault, selectedMonth, campusFilter),
    [campusFilter, monthObligation, selectedMonth, vault]
  );
  const campusLessonFee = useMemo(
    () => filteredLessons.reduce((sum, lesson) => sum + completedAmount(lesson), 0),
    [filteredLessons]
  );
  const campusHours = useMemo(
    () => filteredLessons.reduce((sum, lesson) => {
      if (lesson.status !== "completed" && lesson.status !== "makeup_completed") return sum;
      return sum + lessonBillableHoursForVault(vault, lesson);
    }, 0),
    [filteredLessons, vault]
  );
  const obligationDeductionApplies = campusFilter === "all" || campusFilter === effectiveObligationCampusId;
  const campusDeduction = obligationDeductionApplies ? currentCampusObligation.amount : 0;
  const campusNet = campusLessonFee - campusDeduction;

  const lessonCampusAmounts = useMemo<Record<OverviewCampusKey, PayrollCampusAmountDetail[]>>(() => {
    const buckets: Record<OverviewCampusKey, Record<string, PayrollCampusAmountDetail>> = {
      oneOnOne: {},
      classLessons: {},
      makeup: {}
    };

    function addDetail(bucket: OverviewCampusKey, campusId: string | undefined, amount: number) {
      const key = campusId || "__unset";
      buckets[bucket][key] ??= {
        key,
        campus: campusName(vault, campusId),
        amount: 0,
        count: 0
      };
      buckets[bucket][key].amount += amount;
      buckets[bucket][key].count += 1;
    }

    monthLessons.forEach((lesson) => {
      if (isPayrollExcludedSplitMergeLesson(lesson, splitMergeExcludedLessonIds)) return;
      if (lesson.status !== "completed" && lesson.status !== "makeup_completed") return;
      const campusId = lessonCampusId(vault, lesson);
      const amount = completedAmount(lesson);
      const course = vault.courseGroups.find((item) => item.id === lesson.courseGroupId);
      if (lesson.status === "makeup_completed") {
        addDetail("makeup", campusId, amount);
      } else if (course ? courseUsesClassBilling(course, vault) : lesson.type === "class") {
        addDetail("classLessons", campusId, amount);
      } else {
        addDetail("oneOnOne", campusId, amount);
      }
    });

    return {
      oneOnOne: Object.values(buckets.oneOnOne).sort((a, b) => b.amount - a.amount),
      classLessons: Object.values(buckets.classLessons).sort((a, b) => b.amount - a.amount),
      makeup: Object.values(buckets.makeup).sort((a, b) => b.amount - a.amount)
    };
  }, [monthLessons, splitMergeExcludedLessonIds, vault]);

  const campusSummaries = useMemo(() => {
    const campusSummaryBaseLessons = monthLessons
      .filter((lesson) => !isPayrollExcludedSplitMergeLesson(lesson, splitMergeExcludedLessonIds))
      .filter((lesson) => matchesReviewFilters(lesson, false));
    const campusSummaryBaseLessonIds = new Set(campusSummaryBaseLessons.map((lesson) => lesson.id));
    const obligationHoursByCampus = new Map<string, number>();
    monthObligation.lessonDeductions.forEach((deduction) => {
      if (!campusSummaryBaseLessonIds.has(deduction.lessonId)) return;
      const lesson = vault.lessons.find((item) => item.id === deduction.lessonId);
      const campusId = lesson ? lessonCampusId(vault, lesson) : undefined;
      if (!campusId) return;
      obligationHoursByCampus.set(campusId, (obligationHoursByCampus.get(campusId) ?? 0) + deduction.deductedHours);
    });
    return campusOptions.map((campus) => {
      const lessons = campusSummaryBaseLessons.filter((lesson) => lessonCampusId(vault, lesson) === campus.id);
      const amount = lessons.reduce((sum, lesson) => sum + completedAmount(lesson), 0);
      const hours = lessons.reduce((sum, lesson) => {
        if (lesson.status !== "completed" && lesson.status !== "makeup_completed") return sum;
        return sum + lessonBillableHoursForVault(vault, lesson);
      }, 0);
      const obligation = campus.id === effectiveObligationCampusId ? obligationSummary(vault, selectedMonth, campus.id).amount : 0;
      const obligationHours = obligationHoursByCampus.get(campus.id) ?? 0;
      return {
        campus,
        lessons,
        amount,
        hours,
        obligationHours,
        remainingHours: Math.max(hours - obligationHours, 0),
        obligation,
        net: amount - obligation
      };
    });
  }, [campusOptions, effectiveObligationCampusId, gradeFilter, monthLessons, monthObligation, selectedMonth, splitMergeExcludedLessonIds, statusFilter, typeFilter, vault]);

  const monthSummaryLessonCount = useMemo(
    () => campusSummaries.reduce((sum, item) => sum + item.lessons.length, 0),
    [campusSummaries]
  );
  const monthSummaryHours = useMemo(
    () => campusSummaries.reduce((sum, item) => sum + item.hours, 0),
    [campusSummaries]
  );
  const monthRemainingPayrollHours = useMemo(
    () => campusSummaries.reduce((sum, item) => sum + item.remainingHours, 0),
    [campusSummaries]
  );

  const typeCountCards = useMemo(() => {
    const typeCounts = filteredLessons.reduce<Record<string, number>>(
      (summary, lesson) => {
        summary[lesson.type] = (summary[lesson.type] ?? 0) + 1;
        return summary;
      },
      {}
    );
    return courseTypeOptions.map((type) => ({
      ...type,
      count: typeCounts[type.value] ?? 0
    }));
  }, [courseTypeOptions, filteredLessons]);

  return {
    campusOptions,
    courseOptions,
    courseTypeOptions,
    gradeOptions,
    effectiveObligationCampusId,
    filteredLessons,
    detailLessons,
    monthLessonCount: monthSummaryLessonCount,
    monthPayrollHours: monthSummaryHours,
    monthRemainingPayrollHours,
    breakdown,
    lessonFeeTotal,
    estimatedIncome,
    currentCampusObligation,
    campusLessonFee,
    campusHours,
    obligationDeductionApplies,
    campusDeduction,
    campusNet,
    lessonCampusAmounts,
    campusSummaries,
    typeCountCards
  };
}
