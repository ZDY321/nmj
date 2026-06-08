import type { CourseType, Lesson, ScheduleImportSavedRow, ScheduleImportResolution, TeacherVault } from "@/shared/types";
import {
  courseName as localCourseName,
  courseTypeLabel,
  studentNames
} from "@/frontend/lib/helpers";
import type { ImportPreviewLesson } from "@/frontend/lib/scheduleImport";

export function splitMergeCandidateLessons(vault: TeacherVault, row: ImportPreviewLesson): Array<Lesson & { score: number; scoreLabel: string }> {
  const month = row.date.slice(0, 7);
  const rowCourseId = row.matchedCourseId ?? row.mappedCourseId;
  const rowCampusId = row.campusId;
  const rowStudentNames = normalizeText(row.studentNameHint ?? "");
  const rowSubject = normalizeText(row.subjectHint);
  return vault.lessons
    .filter((lesson) => lesson.status !== "cancelled")
    .filter((lesson) => lesson.date.slice(0, 7) === month)
    .map((lesson) => {
      const course = vault.courseGroups.find((item) => item.id === lesson.courseGroupId);
      const courseStudentNames = normalizeText(studentNames(vault, lesson.expectedStudentIds));
      const sameCourse = Boolean(rowCourseId && lesson.courseGroupId === rowCourseId);
      const sameCampus = Boolean(rowCampusId && lessonCampusId(vault, lesson) === rowCampusId);
      const sameSubject = Boolean(rowSubject && course && normalizeText(course.subject) === rowSubject);
      const studentMatches = Boolean(rowStudentNames && courseStudentNames && (courseStudentNames.includes(rowStudentNames) || rowStudentNames.includes(courseStudentNames)));
      const dayDistance = Math.abs(daysBetween(row.date, lesson.date));
      const score = (sameCourse ? 5 : 0) + (sameCampus ? 2 : 0) + (sameSubject ? 2 : 0) + (studentMatches ? 2 : 0) + Math.max(0, 3 - Math.min(dayDistance, 3));
      const scoreLabel = sameCourse
        ? "同课程"
        : sameSubject && sameCampus
          ? "同科目校区"
        : sameSubject
          ? "同科目"
        : "候选";
      return { ...lesson, score, scoreLabel };
    })
    .filter((lesson) => lesson.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      Math.abs(daysBetween(row.date, a.date)) - Math.abs(daysBetween(row.date, b.date)) ||
      `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)
    )
    .slice(0, 24);
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

export function summarizeLinkedLessons(linkedLessons: Lesson[], row: ImportPreviewLesson): { importHours: number; systemHours: number } {
  return {
    importHours: importedRowDurationHours(row),
    systemHours: linkedLessons.reduce((sum, lesson) => sum + lessonDurationHours(lesson), 0)
  };
}

function importedRowDurationHours(row: Pick<ImportPreviewLesson, "startTime" | "endTime">): number {
  return Math.max(0, timeToMinutes(row.endTime) - timeToMinutes(row.startTime)) / 60;
}

export function lessonDurationHours(lesson: Pick<Lesson, "startTime" | "endTime">): number {
  return Math.max(0, timeToMinutes(lesson.endTime) - timeToMinutes(lesson.startTime)) / 60;
}

function timeToMinutes(value: string): number {
  const [hour = 0, minute = 0] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function daysBetween(a: string, b: string): number {
  const first = new Date(`${a}T00:00:00`).getTime();
  const second = new Date(`${b}T00:00:00`).getTime();
  if (Number.isNaN(first) || Number.isNaN(second)) return 999;
  return Math.round((first - second) / 86400000);
}

export function lessonCampusId(vault: TeacherVault, lesson: Lesson): string | undefined {
  return lesson.campusId ?? vault.courseGroups.find((course) => course.id === lesson.courseGroupId)?.defaultCampusId;
}

export function courseTypeLabelSafe(vault: TeacherVault, type: CourseType | "unknown"): string {
  return type === "unknown" ? "未知班型" : courseTypeLabel(vault, type);
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
