import { useEffect, useMemo, useState } from "react";
import type { Lesson, LessonStatus, TeacherVault } from "@/shared/types";
import { isSubstituteClassLesson, substituteClassPresentCount, todayIso } from "@/frontend/lib/calculations";
import { sortCoursesByName } from "@/frontend/lib/helpers";
import { buildStudentStatsGroupedLessonRows, buildStudentStatsRows, filterStudentStatsLessons, filteredStudentIdsForStats, isCompletedLessonStatus } from "@/frontend/lib/scheduleViewHelpers";
import { filterCoursesWithScopedLessons } from "@/frontend/lib/salaryDetailScope";
import type { CourseTypeFilter, StudentStatsMakeupFilter } from "@/frontend/lib/scheduleViewTypes";

export function useScheduleStudentStats(vault: TeacherVault) {
  const [studentStatsNameFilter, setStudentStatsNameFilter] = useState("");
  const [studentStatsCourseFilter, setStudentStatsCourseFilter] = useState("all");
  const [studentStatsCourseTypeFilter, setStudentStatsCourseTypeFilter] = useState<CourseTypeFilter>("all");
  const [studentStatsSubjectFilter, setStudentStatsSubjectFilter] = useState("all");
  const [studentStatsCampusFilter, setStudentStatsCampusFilter] = useState("all");
  const [studentStatsStatusFilter, setStudentStatsStatusFilter] = useState<"all" | Lesson["status"]>("all");
  const [studentStatsMakeupFilter, setStudentStatsMakeupFilter] = useState<StudentStatsMakeupFilter>("all");
  const [studentStatsDateStart, setStudentStatsDateStart] = useState(todayIso().slice(0, 7) + "-01");
  const [studentStatsDateEnd, setStudentStatsDateEnd] = useState(todayIso());
  const [studentStatsStartTime, setStudentStatsStartTime] = useState("");
  const [studentStatsEndTime, setStudentStatsEndTime] = useState("");
  const [expandedStudentStatsGroupIds, setExpandedStudentStatsGroupIds] = useState<string[]>([]);
  const studentStatsDateScopeLessons = useMemo(() => filterStudentStatsLessons(vault, {
    campusFilter: "all",
    courseFilter: "all",
    courseTypeFilter: "all",
    dateEnd: studentStatsDateEnd,
    dateStart: studentStatsDateStart,
    endTime: "",
    normalizedNameFilter: "",
    startTime: "",
    statusFilter: "all",
    subjectFilter: "all",
    makeupFilter: "all"
  }), [studentStatsDateEnd, studentStatsDateStart, vault]);
  const studentStatsCourseOptions = useMemo(
    () => sortCoursesByName(filterCoursesWithScopedLessons(vault.courseGroups, studentStatsDateScopeLessons)),
    [studentStatsDateScopeLessons, vault.courseGroups]
  );
  const studentStatsCourseOptionIds = studentStatsCourseOptions.map((course) => course.id).join("|");

  useEffect(() => {
    setStudentStatsCourseFilter((current) =>
      current === "all" || studentStatsCourseOptions.some((course) => course.id === current) ? current : "all"
    );
  }, [studentStatsCourseOptionIds]);

  const normalizedStudentStatsNameFilter = studentStatsNameFilter.trim().toLowerCase();
  const studentStatsLessons = filterStudentStatsLessons(vault, {
    campusFilter: studentStatsCampusFilter,
    courseFilter: studentStatsCourseFilter,
    courseTypeFilter: studentStatsCourseTypeFilter,
    dateEnd: studentStatsDateEnd,
    dateStart: studentStatsDateStart,
    endTime: studentStatsEndTime,
    normalizedNameFilter: normalizedStudentStatsNameFilter,
    startTime: studentStatsStartTime,
    statusFilter: studentStatsStatusFilter,
    subjectFilter: studentStatsSubjectFilter,
    makeupFilter: studentStatsMakeupFilter
  });
  const studentStatsRows = buildStudentStatsRows(vault, studentStatsLessons, normalizedStudentStatsNameFilter);
  const studentStatsGroupedLessonRows = buildStudentStatsGroupedLessonRows(vault, studentStatsLessons, normalizedStudentStatsNameFilter);
  const studentStatsExternalStudentCount = studentStatsLessons.reduce(
    (sum, lesson) => sum + (isSubstituteClassLesson(lesson) ? substituteClassPresentCount(lesson) : 0),
    0
  );
  const studentStatsStudentLessonCount = studentStatsLessons.reduce(
    (sum, lesson) => sum + (isSubstituteClassLesson(lesson) ? substituteClassPresentCount(lesson) : filteredStudentIdsForStats(vault, lesson, normalizedStudentStatsNameFilter).length),
    0
  );
  const studentStatsInvolvedStudentCount = studentStatsRows.length + studentStatsExternalStudentCount;
  const studentStatsStatusCounts = studentStatsLessons.reduce<Record<LessonStatus, number>>((counts, lesson) => {
    counts[lesson.status] += 1;
    return counts;
  }, {
    draft: 0,
    scheduled: 0,
    completed: 0,
    cancelled: 0,
    makeup_pending: 0,
    makeup_completed: 0
  });
  const studentStatsTotalFee = studentStatsLessons.reduce((sum, lesson) => sum + lesson.feeSnapshot.amount, 0);
  const studentStatsCompletedFeeTotal = studentStatsLessons.reduce(
    (sum, lesson) => sum + (isCompletedLessonStatus(lesson.status) ? lesson.feeSnapshot.amount : 0),
    0
  );

  function toggleExpandedStudentStatsGroup(groupId: string) {
    setExpandedStudentStatsGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
    );
  }

  return {
    courseGroupOptions: studentStatsCourseOptions,
    expandedGroupIds: expandedStudentStatsGroupIds,
    groupedLessonRows: studentStatsGroupedLessonRows,
    involvedStudentCount: studentStatsInvolvedStudentCount,
    lessonCount: studentStatsLessons.length,
    onToggleGroup: toggleExpandedStudentStatsGroup,
    setCampusFilter: setStudentStatsCampusFilter,
    setCourseFilter: setStudentStatsCourseFilter,
    setCourseTypeFilter: setStudentStatsCourseTypeFilter,
    setDateEnd: setStudentStatsDateEnd,
    setDateStart: setStudentStatsDateStart,
    setEndTime: setStudentStatsEndTime,
    setNameFilter: setStudentStatsNameFilter,
    setStartTime: setStudentStatsStartTime,
    setStatusFilter: setStudentStatsStatusFilter,
    setSubjectFilter: setStudentStatsSubjectFilter,
    setMakeupFilter: setStudentStatsMakeupFilter,
    studentLessonCount: studentStatsStudentLessonCount,
    statusCounts: studentStatsStatusCounts,
    completedFeeTotal: studentStatsCompletedFeeTotal,
    scheduledFeeTotal: studentStatsTotalFee,
    values: {
      campusFilter: studentStatsCampusFilter,
      courseFilter: studentStatsCourseFilter,
      courseTypeFilter: studentStatsCourseTypeFilter,
      dateEnd: studentStatsDateEnd,
      dateStart: studentStatsDateStart,
      endTime: studentStatsEndTime,
      nameFilter: studentStatsNameFilter,
      startTime: studentStatsStartTime,
      statusFilter: studentStatsStatusFilter,
      subjectFilter: studentStatsSubjectFilter,
      makeupFilter: studentStatsMakeupFilter
    }
  };
}
