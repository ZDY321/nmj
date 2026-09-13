import { getCourse } from "@/frontend/lib/calculations";
import { addDays, courseHasActiveStudent, createLessonFromCourse, datesBetween, weekdayOfDateIso } from "@/frontend/lib/helpers";
import { isOrderedTimeRange } from "@/frontend/lib/scheduleViewHelpers";
import { timeToMinutes, timesOverlap } from "@/frontend/lib/time";
import type { Lesson, TeacherVault, Weekday } from "@/shared/types";

export type BatchLessonTime = Pick<Lesson, "date" | "startTime" | "endTime" | "courseGroupId">;

export type BatchScheduleConflict<T extends BatchLessonTime = BatchLessonTime> = {
  candidate: T;
  conflictingLesson: BatchLessonTime;
  source: "existing" | "batch";
};

export type BatchSchedulePreview<T extends BatchLessonTime> = {
  candidateCount: number;
  creatableItems: T[];
  existingItems: T[];
  duplicateItems: T[];
  conflicts: BatchScheduleConflict<T>[];
};

function sameCourseTime(first: BatchLessonTime, second: BatchLessonTime): boolean {
  return first.courseGroupId === second.courseGroupId &&
    first.date === second.date &&
    timeToMinutes(first.startTime) === timeToMinutes(second.startTime) &&
    timeToMinutes(first.endTime) === timeToMinutes(second.endTime);
}

export function buildBatchSchedulePreview<T extends BatchLessonTime>(lessons: readonly Lesson[], candidates: readonly T[]): BatchSchedulePreview<T> {
  const preview: BatchSchedulePreview<T> = {
    candidateCount: candidates.length,
    creatableItems: [],
    existingItems: [],
    duplicateItems: [],
    conflicts: []
  };
  const existingByDate = new Map<string, Lesson[]>();
  for (const lesson of lessons) {
    if (lesson.status === "cancelled") continue;
    const dayLessons = existingByDate.get(lesson.date) ?? [];
    dayLessons.push(lesson);
    existingByDate.set(lesson.date, dayLessons);
  }
  const plannedByDate = new Map<string, T[]>();

  for (const candidate of candidates) {
    const existing = existingByDate.get(candidate.date) ?? [];
    // An already scheduled occurrence needs no new lesson and is not a new conflict.
    if (existing.some((lesson) => sameCourseTime(lesson, candidate))) {
      preview.existingItems.push(candidate);
      continue;
    }
    const planned = plannedByDate.get(candidate.date) ?? [];
    if (planned.some((lesson) => sameCourseTime(lesson, candidate))) {
      preview.duplicateItems.push(candidate);
      continue;
    }

    const overlaps = (lesson: BatchLessonTime) => timesOverlap(lesson.startTime, lesson.endTime, candidate.startTime, candidate.endTime);
    const existingConflict = existing.find(overlaps);
    const plannedConflict = existingConflict ? undefined : planned.find(overlaps);
    const conflictingLesson = existingConflict ?? plannedConflict;
    if (conflictingLesson) {
      preview.conflicts.push({ candidate, conflictingLesson, source: existingConflict ? "existing" : "batch" });
      continue;
    }

    preview.creatableItems.push(candidate);
    planned.push(candidate);
    plannedByDate.set(candidate.date, planned);
  }
  return preview;
}

export function endDateForRepeatWeeks(startDate: string, weekCount: number): string {
  if (!startDate || !Number.isInteger(weekCount) || weekCount <= 0) return "";
  return addDays(startDate, weekCount * 7 - 1);
}

export type BatchLessonOptions = {
  startDate: string;
  endDate: string;
  weekdays: Weekday[];
  courseGroupId: string;
  startTime: string;
  endTime: string;
  manualBillingHours?: number;
};

export type BatchLessonGenerationResult = {
  candidateCount: number;
  createdCount: number;
  conflictCount: number;
  existingCount: number;
};

export function buildBatchLessonPreview(lessons: readonly Lesson[], options: BatchLessonOptions): BatchSchedulePreview<BatchLessonTime> {
  const candidates = isOrderedTimeRange(options.startTime, options.endTime)
    ? datesBetween(options.startDate, options.endDate)
      .filter((date) => options.weekdays.includes(weekdayOfDateIso(date)))
      .map((date) => ({ date, courseGroupId: options.courseGroupId, startTime: options.startTime, endTime: options.endTime }))
    : [];
  return buildBatchSchedulePreview(lessons, candidates);
}

export function generateBatchLessonsInVault(vault: TeacherVault, options: BatchLessonOptions): BatchLessonGenerationResult {
  const course = getCourse(vault, options.courseGroupId);
  if (!course || course.status !== "active" || !courseHasActiveStudent(vault, course)) {
    return { candidateCount: 0, createdCount: 0, conflictCount: 0, existingCount: 0 };
  }
  // Finish the preview before writing, so this batch cannot conflict with itself.
  const preview = buildBatchLessonPreview(vault.lessons, options);
  const lessons = preview.creatableItems.map((item) => createLessonFromCourse(vault, course, {
    ...item,
    campusId: course.defaultCampusId,
    manualBillingHours: options.manualBillingHours,
    status: "scheduled"
  }));
  vault.lessons.push(...lessons);
  return {
    candidateCount: preview.candidateCount,
    createdCount: lessons.length,
    conflictCount: preview.conflicts.length,
    existingCount: preview.existingItems.length
  };
}
