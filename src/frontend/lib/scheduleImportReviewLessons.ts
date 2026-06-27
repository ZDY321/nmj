import type { CourseType, Lesson, ScheduleImportSavedRow, ScheduleImportResolution, ScheduleImportResolutionMap, TeacherVault } from "@/shared/types";
import {
  courseName as localCourseName,
  courseTypeLabel,
  lessonCampusId,
  studentNames
} from "@/frontend/lib/helpers";
import { billableHoursForCourseLesson, lessonBillableHoursForVault } from "@/frontend/lib/calculations";
import type { ImportPreviewLesson } from "@/frontend/lib/scheduleImport";
import { resolutionKey } from "@/frontend/lib/scheduleImportReviewMatching";
import { resolutionExcludesImportStats, resolutionUsesSystemHoursForImportStats } from "@/frontend/lib/scheduleImportReviewStatus";
import { durationHours, timeToMinutes } from "@/frontend/lib/time";

export function splitMergeCandidateLessons(vault: TeacherVault, row: ImportPreviewLesson): Array<Lesson & { score: number; scoreLabel: string }> {
  const month = row.date.slice(0, 7);
  const rowCourseId = row.matchedCourseId ?? row.mappedCourseId;
  const rowCampusId = row.campusId;
  const rowStudentNames = normalizeText(row.studentNameHint ?? "");
  const rowSubject = normalizeText(row.subjectHint);
  const rowTitle = normalizeText(row.title);
  return vault.lessons
    .filter((lesson) => lesson.date.slice(0, 7) === month)
    .map((lesson) => {
      const course = vault.courseGroups.find((item) => item.id === lesson.courseGroupId);
      const courseName = normalizeText(course?.name ?? "");
      const courseStudentNames = normalizeText(studentNames(vault, lesson.expectedStudentIds));
      const sameSystemLesson = Boolean(row.systemLessonId && lesson.id === row.systemLessonId);
      const sameCourse = Boolean(rowCourseId && lesson.courseGroupId === rowCourseId);
      const sameCourseName = Boolean(rowTitle && courseName && (rowTitle.includes(courseName) || courseName.includes(rowTitle)));
      const sameType = row.courseTypeHint !== "unknown" && lesson.type === row.courseTypeHint;
      const sameCampus = Boolean(rowCampusId && lessonCampusId(vault, lesson) === rowCampusId);
      const sameSubject = Boolean(rowSubject && course && normalizeText(course.subject) === rowSubject);
      const studentMatches = Boolean(rowStudentNames && courseStudentNames && (courseStudentNames.includes(rowStudentNames) || rowStudentNames.includes(courseStudentNames)));
      const sameStudentAndSubject = studentMatches && sameSubject;
      const dayDistance = Math.abs(daysBetween(row.date, lesson.date));
      const timeGap = timeGapMinutes(row, lesson);
      const timeScore = timeGap === 0 ? 4 : timeGap <= 15 ? 3 : timeGap <= 30 ? 2 : timeGap <= 60 ? 1 : 0;
      const dateScore = dayDistance === 0 ? 3 : dayDistance <= 1 ? 2 : dayDistance <= 3 ? 1 : 0;
      const score =
        (sameSystemLesson ? 10 : 0) +
        (sameCourse ? 5 : 0) +
        (sameCourseName ? 4 : 0) +
        (sameType ? 2 : 0) +
        (sameCampus ? 2 : 0) +
        (sameSubject ? 2 : 0) +
        (studentMatches ? 2 : 0) +
        timeScore +
        dateScore;
      const scoreLabel = candidateScoreLabel({
        sameSystemLesson,
        sameCourse,
        sameCourseName,
        sameType,
        sameCampus,
        sameSubject,
        timeGap
      });
      return { ...lesson, score, scoreLabel, sameStudentAndSubject };
    })
    .filter((lesson) => lesson.score > 0)
    .sort((a, b) =>
      Number(b.sameStudentAndSubject) - Number(a.sameStudentAndSubject) ||
      `${a.date} ${a.startTime} ${a.endTime}`.localeCompare(`${b.date} ${b.startTime} ${b.endTime}`) ||
      b.score - a.score ||
      a.id.localeCompare(b.id)
    )
    .slice(0, 24);
}

function candidateScoreLabel({
  sameSystemLesson,
  sameCourse,
  sameCourseName,
  sameType,
  sameCampus,
  sameSubject,
  timeGap
}: {
  sameSystemLesson: boolean;
  sameCourse: boolean;
  sameCourseName: boolean;
  sameType: boolean;
  sameCampus: boolean;
  sameSubject: boolean;
  timeGap: number;
}): string {
  if (sameSystemLesson) return "本条云端";
  const labels: string[] = [];
  if (sameCourse) labels.push("同课程");
  else if (sameCourseName) labels.push("同名");
  if (sameType) labels.push("同班型");
  if (timeGap === 0) labels.push("时间重叠");
  else if (timeGap <= 30) labels.push("时间近似");
  if (labels.length === 0 && sameSubject && sameCampus) labels.push("同科目校区");
  if (labels.length === 0 && sameSubject) labels.push("同科目");
  return labels.slice(0, 3).join(" · ") || "候选";
}

export function linkedLessonsForResolution(vault: TeacherVault, resolution?: ScheduleImportResolution): Lesson[] {
  const ids = resolution?.linkedSystemLessonIds ?? [];
  return ids
    .map((id) => vault.lessons.find((lesson) => lesson.id === id))
    .filter((lesson): lesson is Lesson => Boolean(lesson));
}

export function linkedLessonsForSavedRow(vault: TeacherVault, row: ScheduleImportSavedRow): Lesson[] {
  return (row.linkedSystemLessonIds ?? [])
    .map((id) => vault.lessons.find((lesson) => lesson.id === id))
    .filter((lesson): lesson is Lesson => Boolean(lesson));
}

export function savedRowSystemLesson(vault: TeacherVault, row: Pick<ScheduleImportSavedRow, "systemLessonId">): Lesson | undefined {
  return row.systemLessonId ? vault.lessons.find((lesson) => lesson.id === row.systemLessonId) : undefined;
}

export function savedRowSystemLessonLabel(vault: TeacherVault, row: Pick<ScheduleImportSavedRow, "systemLessonId" | "systemLessonLabel">): string {
  const lesson = savedRowSystemLesson(vault, row);
  if (lesson) {
    return `${lesson.date} ${lesson.startTime}-${lesson.endTime} ${localCourseName(vault, lesson.courseGroupId)}`;
  }
  return row.systemLessonLabel ?? "";
}

export function savedRowSystemAttendance(
  vault: TeacherVault,
  row: Pick<ScheduleImportSavedRow, "systemLessonId" | "systemLessonStatus" | "systemLessonNote" | "systemPresentCount" | "systemExpectedCount" | "systemPresentStudentNames" | "systemExpectedStudentNames">
): {
  status: Lesson["status"] | undefined;
  note: string | undefined;
  presentCount: number | undefined;
  expectedCount: number | undefined;
  presentStudentNames: string;
  expectedStudentNames: string;
} {
  const lesson = savedRowSystemLesson(vault, row);
  if (!lesson) {
    return {
      status: row.systemLessonStatus,
      note: row.systemLessonNote,
      presentCount: row.systemPresentCount,
      expectedCount: row.systemExpectedCount,
      presentStudentNames: row.systemPresentStudentNames ?? "",
      expectedStudentNames: row.systemExpectedStudentNames ?? ""
    };
  }
  const presentStudentIds = lesson.status === "cancelled"
    ? []
    : lesson.attendance.length > 0
    ? lesson.attendance
      .filter((entry) => entry.status === "attended" || (Boolean(lesson.linkedOriginalLessonId) && entry.status === "makeup_completed"))
      .map((entry) => entry.studentId)
    : lesson.expectedStudentIds;
  const uniquePresentStudentIds = Array.from(new Set(presentStudentIds));
  const uniqueExpectedStudentIds = Array.from(new Set(lesson.expectedStudentIds));
  return {
    status: lesson.status,
    note: lesson.note,
    presentCount: uniquePresentStudentIds.length,
    expectedCount: lesson.status === "cancelled" ? 0 : uniqueExpectedStudentIds.length,
    presentStudentNames: studentNames(vault, uniquePresentStudentIds),
    expectedStudentNames: studentNames(vault, uniqueExpectedStudentIds)
  };
}

export function summarizeLinkedLessons(vault: TeacherVault, linkedLessons: Lesson[], row: ImportPreviewLesson): { importHours: number; systemHours: number } {
  return {
    importHours: importPreviewLessonBillableHours(vault, row),
    systemHours: linkedLessons.reduce((sum, lesson) => sum + lessonBillableHoursForVault(vault, lesson), 0)
  };
}

export type ScheduleImportImportedLessonStats = {
  rawCount: number;
  count: number;
  hours: number;
  excludedCount: number;
  cancelledExcludedCount: number;
  absentExcludedCount: number;
};

export function summarizeScheduleImportImportedLessons(
  vault: TeacherVault,
  rows: ImportPreviewLesson[],
  resolutions: ScheduleImportResolutionMap
): ScheduleImportImportedLessonStats {
  const splitMergeLessonIds = new Set<string>();
  let count = 0;
  let hours = 0;
  let excludedCount = 0;
  let cancelledExcludedCount = 0;
  let absentExcludedCount = 0;

  rows.forEach((row) => {
    const resolution = resolutions[resolutionKey(row)];
    if (resolutionExcludesImportStats(resolution?.status)) {
      excludedCount += 1;
      return;
    }
    const forceIncludeByResolution = resolutionUsesSystemHoursForImportStats(resolution?.status);
    if (!forceIncludeByResolution && importPreviewLessonExcludedAsCancelled(row)) {
      cancelledExcludedCount += 1;
      return;
    }
    if (!forceIncludeByResolution && importPreviewLessonExcludedAsAbsent(row)) {
      absentExcludedCount += 1;
      return;
    }

    if (resolution?.status === "split_merge_ok") {
      const linkedLessonIds = validLinkedLessonIds(vault, resolution);
      if (linkedLessonIds.length > 0) {
        linkedLessonIds.forEach((lessonId) => splitMergeLessonIds.add(lessonId));
        return;
      }
    }

    count += 1;
    hours += importPreviewLessonStatsHours(vault, row, resolution);
  });

  const splitMergeLessons = Array.from(splitMergeLessonIds)
    .map((lessonId) => vault.lessons.find((lesson) => lesson.id === lessonId))
    .filter((lesson): lesson is Lesson => Boolean(lesson));

  return {
    rawCount: rows.length,
    count: count + splitMergeLessons.length,
    hours: hours + splitMergeLessons.reduce((sum, lesson) => sum + lessonBillableHoursForVault(vault, lesson), 0),
    excludedCount,
    cancelledExcludedCount,
    absentExcludedCount
  };
}

export function importPreviewLessonBillableHours(vault: TeacherVault, row: Pick<ImportPreviewLesson, "startTime" | "endTime" | "matchedCourseId" | "mappedCourseId">): number {
  const courseId = row.matchedCourseId ?? row.mappedCourseId;
  const course = courseId ? vault.courseGroups.find((item) => item.id === courseId) : undefined;
  if (course) return billableHoursForCourseLesson(course, row, vault);
  return durationHours(row.startTime, row.endTime);
}

function importPreviewLessonStatsHours(vault: TeacherVault, row: ImportPreviewLesson, resolution?: ScheduleImportResolution): number {
  if ((row.status === "matched" || resolutionUsesSystemHoursForImportStats(resolution?.status)) && row.systemLessonId) {
    const systemLesson = vault.lessons.find((lesson) => lesson.id === row.systemLessonId);
    if (systemLesson) return lessonBillableHoursForVault(vault, systemLesson);
  }
  return importPreviewLessonBillableHours(vault, row);
}

function validLinkedLessonIds(vault: TeacherVault, resolution: ScheduleImportResolution): string[] {
  const existingLessonIds = new Set(vault.lessons.map((lesson) => lesson.id));
  return Array.from(new Set((resolution.linkedSystemLessonIds ?? []).filter((lessonId) => existingLessonIds.has(lessonId))));
}

function importPreviewLessonExcludedAsCancelled(row: Pick<ImportPreviewLesson, "presentCount" | "warnings" | "note" | "rawText">): boolean {
  if (row.presentCount !== 0) return false;
  if (row.warnings.includes("未开课/取消")) return true;
  return /取消|停课|请假|未上|不上课|未开课|课消|无学生/.test(`${row.note ?? ""} ${row.rawText ?? ""}`);
}

function importPreviewLessonExcludedAsAbsent(row: Pick<ImportPreviewLesson, "presentCount" | "expectedCount" | "warnings" | "note" | "rawText">): boolean {
  if (row.presentCount !== 0 || (row.expectedCount ?? 0) <= 0) return false;
  if (row.warnings.includes("缺勤未到")) return true;
  if (row.warnings.includes("未开课/取消")) return false;
  if (/取消|停课|请假|未上|不上课|未开课|课消|无学生/.test(`${row.note ?? ""} ${row.rawText ?? ""}`)) return false;
  return true;
}

export function lessonDurationHours(lesson: Pick<Lesson, "startTime" | "endTime">): number {
  return durationHours(lesson.startTime, lesson.endTime);
}

function timeGapMinutes(row: Pick<ImportPreviewLesson, "startTime" | "endTime">, lesson: Pick<Lesson, "startTime" | "endTime">): number {
  const rowStart = timeToMinutes(row.startTime);
  const rowEnd = timeToMinutes(row.endTime);
  const lessonStart = timeToMinutes(lesson.startTime);
  const lessonEnd = timeToMinutes(lesson.endTime);
  if (rowStart <= lessonEnd && lessonStart <= rowEnd) return 0;
  return Math.min(Math.abs(rowStart - lessonEnd), Math.abs(lessonStart - rowEnd));
}

function daysBetween(a: string, b: string): number {
  const first = new Date(`${a}T00:00:00`).getTime();
  const second = new Date(`${b}T00:00:00`).getTime();
  if (Number.isNaN(first) || Number.isNaN(second)) return 999;
  return Math.round((first - second) / 86400000);
}

export function courseTypeLabelSafe(vault: TeacherVault, type: CourseType | "unknown"): string {
  return type === "unknown" ? "未知班型" : courseTypeLabel(vault, type);
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
