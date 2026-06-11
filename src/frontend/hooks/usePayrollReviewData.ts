import { useMemo } from "react";
import type { CourseType, Lesson, TeacherVault } from "@/shared/types";
import { completedAmount, estimatedMonthlyIncome, isPayrollExcludedSplitMergeLesson, lessonBillableHours, obligationSummary, payrollExcludedSplitMergeLessonIds, salaryBreakdown } from "@/frontend/lib/calculations";
import {
  campusName,
  compareByName,
  courseTypeOptionsForVault,
  sortLessons,
  sortCampusesForProfile,
  sortCoursesByName,
  studentNames
} from "@/frontend/lib/helpers";

export type PayrollCourseTypeFilter = "all" | CourseType;
export type PayrollLessonStatusFilter = "all" | Lesson["status"];
type OverviewCampusKey = "oneOnOne" | "classLessons" | "fullTime" | "makeup";

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

  function lessonCampusId(lesson: Lesson): string | undefined {
    return lesson.campusId ?? vault.courseGroups.find((course) => course.id === lesson.courseGroupId)?.defaultCampusId;
  }

  function matchesGradeFilter(lesson: Lesson): boolean {
    return (
      gradeFilter === "all" ||
      lesson.expectedStudentIds.some((studentId) => vault.students.find((student) => student.id === studentId)?.grade === gradeFilter)
    );
  }

  function matchesReviewFilters(lesson: Lesson, includeCampus: boolean): boolean {
    const matchesCampus = !includeCampus || campusFilter === "all" || lessonCampusId(lesson) === campusFilter;
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
  const filteredLessons = useMemo(
    () => monthLessons
      .filter((lesson) => !isPayrollExcludedSplitMergeLesson(lesson, splitMergeExcludedLessonIds))
      .filter((lesson) => matchesReviewFilters(lesson, true))
      .sort(sortLessons),
    [campusFilter, gradeFilter, monthLessons, splitMergeExcludedLessonIds, statusFilter, typeFilter, vault]
  );
  const detailLessons = useMemo(
    () => filteredLessons
      .filter((lesson) => {
        const matchesDate =
          (!detailStartDateFilter || lesson.date >= detailStartDateFilter) &&
          (!detailEndDateFilter || lesson.date <= detailEndDateFilter);
        const matchesCourse = detailCourseFilter === "all" || lesson.courseGroupId === detailCourseFilter;
        const matchesStudent =
          !detailStudentFilter.trim() ||
          studentNames(vault, lesson.expectedStudentIds).toLowerCase().includes(detailStudentFilter.trim().toLowerCase());
        const matchesStatus = detailStatusFilter === "all" || lesson.status === detailStatusFilter;
        return matchesDate && matchesCourse && matchesStudent && matchesStatus;
      })
      .sort(sortLessons),
    [detailCourseFilter, detailEndDateFilter, detailStartDateFilter, detailStatusFilter, detailStudentFilter, filteredLessons, vault]
  );

  const breakdown = useMemo(() => salaryBreakdown(vault, selectedMonth), [selectedMonth, vault]);
  const lessonFeeTotal = breakdown.oneOnOne + breakdown.classLessons + breakdown.fullTime + breakdown.makeup;
  const estimatedIncome = useMemo(() => estimatedMonthlyIncome(vault, selectedMonth), [selectedMonth, vault]);
  const currentCampusObligation = useMemo(
    () => campusFilter === "all" ? obligationSummary(vault, selectedMonth) : obligationSummary(vault, selectedMonth, campusFilter),
    [campusFilter, selectedMonth, vault]
  );
  const campusLessonFee = useMemo(
    () => filteredLessons.reduce((sum, lesson) => sum + completedAmount(lesson), 0),
    [filteredLessons]
  );
  const campusHours = useMemo(
    () => filteredLessons.reduce((sum, lesson) => {
      if (lesson.status !== "completed" && lesson.status !== "makeup_completed") return sum;
      return sum + lessonBillableHours(lesson);
    }, 0),
    [filteredLessons]
  );
  const obligationDeductionApplies = campusFilter === "all" || campusFilter === effectiveObligationCampusId;
  const campusDeduction = obligationDeductionApplies ? currentCampusObligation.amount : 0;
  const campusNet = campusLessonFee - campusDeduction;

  const lessonCampusAmounts = useMemo<Record<OverviewCampusKey, PayrollCampusAmountDetail[]>>(() => {
    const buckets: Record<OverviewCampusKey, Record<string, PayrollCampusAmountDetail>> = {
      oneOnOne: {},
      classLessons: {},
      fullTime: {},
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
      const course = vault.courseGroups.find((item) => item.id === lesson.courseGroupId);
      const campusId = lesson.campusId ?? course?.defaultCampusId;
      const amount = completedAmount(lesson);
      if (lesson.status === "makeup_completed") {
        addDetail("makeup", campusId, amount);
      } else if (lesson.type === "class") {
        addDetail("classLessons", campusId, amount);
      } else if (lesson.type === "full_time") {
        addDetail("fullTime", campusId, amount);
      } else {
        addDetail("oneOnOne", campusId, amount);
      }
    });

    return {
      oneOnOne: Object.values(buckets.oneOnOne).sort((a, b) => b.amount - a.amount),
      classLessons: Object.values(buckets.classLessons).sort((a, b) => b.amount - a.amount),
      fullTime: Object.values(buckets.fullTime).sort((a, b) => b.amount - a.amount),
      makeup: Object.values(buckets.makeup).sort((a, b) => b.amount - a.amount)
    };
  }, [monthLessons, splitMergeExcludedLessonIds, vault]);

  const campusSummaries = useMemo(() => {
    const campusSummaryBaseLessons = monthLessons
      .filter((lesson) => !isPayrollExcludedSplitMergeLesson(lesson, splitMergeExcludedLessonIds))
      .filter((lesson) => matchesReviewFilters(lesson, false));
    return campusOptions.map((campus) => {
      const lessons = campusSummaryBaseLessons.filter((lesson) => lessonCampusId(lesson) === campus.id);
      const amount = lessons.reduce((sum, lesson) => sum + completedAmount(lesson), 0);
      const hours = lessons.reduce((sum, lesson) => {
        if (lesson.status !== "completed" && lesson.status !== "makeup_completed") return sum;
        return sum + lessonBillableHours(lesson);
      }, 0);
      const obligation = campus.id === effectiveObligationCampusId ? obligationSummary(vault, selectedMonth, campus.id).amount : 0;
      return {
        campus,
        lessons,
        amount,
        hours,
        obligation,
        net: amount - obligation
      };
    });
  }, [campusOptions, effectiveObligationCampusId, gradeFilter, monthLessons, selectedMonth, splitMergeExcludedLessonIds, statusFilter, typeFilter, vault]);

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
