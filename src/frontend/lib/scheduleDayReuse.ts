import { getCourse } from "@/frontend/lib/calculations";
import {
  buildScheduleSyncLessonsForDate,
  courseHasActiveStudent,
  sortLessons
} from "@/frontend/lib/helpers";
import { timesOverlap } from "@/frontend/lib/time";
import type { Lesson, TeacherVault } from "@/shared/types";

export type ScheduleDayReuseOutcome = "create" | "replace" | "keep";

export type ScheduleDayReusePreviewEntry = {
  lesson: Lesson;
  outcome: ScheduleDayReuseOutcome;
  replacedLessons: Lesson[];
};

export type ScheduleDayReuseSkippedEntry = {
  sourceLesson: Lesson;
  reason: "course_unavailable" | "time_conflict";
  conflictingLessons: Lesson[];
};

export type ScheduleDayReusePreview = {
  finalEntries: ScheduleDayReusePreviewEntry[];
  skippedEntries: ScheduleDayReuseSkippedEntry[];
  targetLessons: Lesson[];
  createCount: number;
  replaceCount: number;
  keepCount: number;
};

export type ScheduleRangeReusePreviewDay = {
  sourceDate: string;
  targetDate: string;
  sourceLessonCount: number;
  preview: ScheduleDayReusePreview;
};

export type ScheduleRangeReusePreview = {
  days: ScheduleRangeReusePreviewDay[];
  sourceLessonCount: number;
  createCount: number;
  replaceCount: number;
  keepCount: number;
  skippedCount: number;
  unavailableCount: number;
  conflictSkippedCount: number;
};

export function buildScheduleDayReusePreview(
  vault: TeacherVault,
  sourceLessons: Lesson[],
  targetDate: string
): ScheduleDayReusePreview {
  const targetLessons = vault.lessons.filter((lesson) => lesson.date === targetDate).sort(sortLessons);
  const syncBuild = buildScheduleSyncLessonsForDate(vault, sourceLessons, targetDate, targetDate);
  const builtLessons = [...syncBuild.lessons];
  const replaceLessonIds = new Set(syncBuild.replaceLessonIds);
  const addedEntries: ScheduleDayReusePreviewEntry[] = [];
  const skippedEntries: ScheduleDayReuseSkippedEntry[] = [];
  let builtLessonIndex = 0;

  sourceLessons.forEach((sourceLesson) => {
    const course = getCourse(vault, sourceLesson.courseGroupId);
    if (!course || course.status !== "active" || !courseHasActiveStudent(vault, course)) {
      skippedEntries.push({
        sourceLesson,
        reason: "course_unavailable",
        conflictingLessons: []
      });
      return;
    }

    const conflictingLessons = targetLessons.filter(
      (lesson) =>
        lesson.status !== "cancelled" &&
        timesOverlap(lesson.startTime, lesson.endTime, sourceLesson.startTime, sourceLesson.endTime)
    );
    if (conflictingLessons.some((lesson) => lesson.courseGroupId !== sourceLesson.courseGroupId)) {
      skippedEntries.push({
        sourceLesson,
        reason: "time_conflict",
        conflictingLessons
      });
      return;
    }

    const lesson = builtLessons[builtLessonIndex];
    builtLessonIndex += 1;
    if (!lesson) return;
    addedEntries.push({
      lesson,
      outcome: conflictingLessons.length > 0 ? "replace" : "create",
      replacedLessons: conflictingLessons
    });
  });

  const keptEntries: ScheduleDayReusePreviewEntry[] = targetLessons
    .filter((lesson) => !replaceLessonIds.has(lesson.id))
    .map((lesson) => ({ lesson, outcome: "keep", replacedLessons: [] }));
  const finalEntries = [...keptEntries, ...addedEntries].sort((a, b) => sortLessons(a.lesson, b.lesson));

  return {
    finalEntries,
    skippedEntries,
    targetLessons,
    createCount: addedEntries.filter((entry) => entry.outcome === "create").length,
    replaceCount: addedEntries.filter((entry) => entry.outcome === "replace").length,
    keepCount: keptEntries.length
  };
}

export function buildScheduleRangeReusePreview(
  vault: TeacherVault,
  sourceDates: string[],
  targetDates: string[]
): ScheduleRangeReusePreview {
  const days = sourceDates.length > 0 && sourceDates.length === targetDates.length
    ? sourceDates.map((sourceDate, index) => {
        const sourceLessons = vault.lessons.filter((lesson) => lesson.date === sourceDate).sort(sortLessons);
        return {
          sourceDate,
          targetDate: targetDates[index],
          sourceLessonCount: sourceLessons.length,
          preview: buildScheduleDayReusePreview(vault, sourceLessons, targetDates[index])
        };
      })
    : [];
  const skippedEntries = days.flatMap((day) => day.preview.skippedEntries);

  return {
    days,
    sourceLessonCount: days.reduce((sum, day) => sum + day.sourceLessonCount, 0),
    createCount: days.reduce((sum, day) => sum + day.preview.createCount, 0),
    replaceCount: days.reduce((sum, day) => sum + day.preview.replaceCount, 0),
    keepCount: days.reduce((sum, day) => sum + day.preview.keepCount, 0),
    skippedCount: skippedEntries.length,
    unavailableCount: skippedEntries.filter((entry) => entry.reason === "course_unavailable").length,
    conflictSkippedCount: skippedEntries.filter((entry) => entry.reason === "time_conflict").length
  };
}
