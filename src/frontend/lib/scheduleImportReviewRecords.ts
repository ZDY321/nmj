import type {
  Lesson,
  ScheduleImportResolutionMap,
  ScheduleImportReviewRecord,
  ScheduleImportVaultState,
  TeacherVault
} from "@/shared/types";
import { completedAmount } from "@/frontend/lib/calculations";
import { formatPrivateMoney } from "@/frontend/lib/helpers";
import {
  type ImportedScheduleLesson,
  type ImportPreviewLesson,
  type ScheduleImportMapping,
  summarizeImportPreview
} from "@/frontend/lib/scheduleImport";
import {
  effectiveSavedRowStatus,
  linkedSystemLessonIdsFromSavedRows,
  resolutionKey
} from "@/frontend/lib/scheduleImportReviewMatching";

export function buildNextScheduleImportState(
  vault: TeacherVault,
  context: {
    rawLessons: ImportedScheduleLesson[];
    mapping: ScheduleImportMapping;
    resolutions: ScheduleImportResolutionMap;
    fileCampusOverrides: ScheduleImportMapping;
    selectedMonth: string;
    selectedDate: string;
    rows: ImportPreviewLesson[];
    summary: ReturnType<typeof summarizeImportPreview>;
  }
): ScheduleImportVaultState {
  const now = new Date().toISOString();
  const review = buildReviewRecord(vault, context, now);
  const previous = vault.scheduleImport;
  return {
    mappings: { ...context.mapping },
    resolutions: { ...context.resolutions },
    reviews: [
      review,
      ...(previous?.reviews ?? []).filter((item) => item.id !== review.id)
    ].slice(0, 20),
    updatedAt: now
  };
}

function buildReviewRecord(
  vault: TeacherVault,
  context: {
    rawLessons: ImportedScheduleLesson[];
    mapping: ScheduleImportMapping;
    resolutions: ScheduleImportResolutionMap;
    fileCampusOverrides: ScheduleImportMapping;
    selectedMonth: string;
    selectedDate: string;
    rows: ImportPreviewLesson[];
    summary: ReturnType<typeof summarizeImportPreview>;
  },
  savedAt: string
): ScheduleImportReviewRecord {
  const fileNames = Array.from(new Set(context.rawLessons.map((lesson) => lesson.fileName))).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  const systemLessonSummary = summarizeSystemLessonsForReview(vault, context.rows);
  return {
    id: `schedule-import-${savedAt}`,
    savedAt,
    month: context.selectedMonth,
    selectedDate: context.selectedDate,
    rawLessonCount: context.rawLessons.length,
    fileNames,
    mapping: context.mapping,
    fileCampusOverrides: context.fileCampusOverrides,
    resolutions: context.resolutions,
    summary: {
      total: context.summary.total,
      matched: context.summary.matched,
      attendanceMismatch: context.summary.attendanceMismatch,
      timeMismatch: context.summary.timeMismatch,
      courseMismatch: context.summary.courseMismatch,
      systemMissing: context.summary.systemMissing,
      importMissing: context.summary.importMissing,
      needsMapping: context.summary.needsMapping,
      systemLessonCount: systemLessonSummary.lessonCount,
      systemCompletedLessonCount: systemLessonSummary.completedLessonCount,
      systemCompletedAmount: systemLessonSummary.completedAmount
    },
    rows: context.rows.map((row) => {
      const resolution = context.resolutions[resolutionKey(row)];
      return {
        id: row.id,
        fileName: row.fileName,
        campusName: row.campusName,
        campusId: row.campusId,
        date: row.date,
        startTime: row.startTime,
        endTime: row.endTime,
        title: row.title,
        subjectHint: row.subjectHint,
        courseTypeHint: row.courseTypeHint,
        studentNameHint: row.studentNameHint,
        teacher: row.teacher,
        assistant: row.assistant,
        room: row.room,
        presentCount: row.presentCount,
        expectedCount: row.expectedCount,
        rawText: row.rawText ? row.rawText.slice(0, 600) : "",
        warnings: row.warnings,
        matchedCourseId: row.matchedCourseId,
        mappedCourseId: row.mappedCourseId,
        status: row.status,
        systemLessonId: row.systemLessonId,
        systemLessonLabel: row.systemLessonLabel,
        systemPresentCount: row.systemPresentCount,
        systemExpectedCount: row.systemExpectedCount,
        systemPresentStudentNames: row.systemPresentStudentNames,
        systemExpectedStudentNames: row.systemExpectedStudentNames,
        issues: row.issues,
        resolutionStatus: resolution?.status,
        resolutionNote: resolution?.note,
        linkedSystemLessonIds: resolution?.linkedSystemLessonIds,
        resolutionUpdatedAt: resolution?.updatedAt
      };
    })
  };
}

export function buildScheduleImportStateWithoutReview(
  vault: TeacherVault,
  mapping: ScheduleImportMapping,
  resolutions: ScheduleImportResolutionMap
): ScheduleImportVaultState {
  return {
    mappings: { ...mapping },
    resolutions: { ...resolutions },
    reviews: vault.scheduleImport?.reviews ?? [],
    updatedAt: new Date().toISOString()
  };
}

function summarizeSystemLessonsForReview(vault: TeacherVault, rows: ImportPreviewLesson[]): { lessonCount: number; completedLessonCount: number; completedAmount: number } {
  const lessonIds = Array.from(new Set(rows.map((row) => row.systemLessonId).filter((lessonId): lessonId is string => Boolean(lessonId))));
  const lessons = lessonIds
    .map((lessonId) => vault.lessons.find((lesson) => lesson.id === lessonId))
    .filter((lesson): lesson is Lesson => Boolean(lesson));
  const completedLessons = lessons.filter((lesson) => lesson.status === "completed" || lesson.status === "makeup_completed");
  return {
    lessonCount: lessons.length,
    completedLessonCount: completedLessons.length,
    completedAmount: completedLessons.reduce((sum, lesson) => sum + completedAmount(lesson), 0)
  };
}

export function savedReviewNeedsAttention(review: ScheduleImportReviewRecord): number {
  const counts = savedReviewEffectiveCounts(review);
  return counts.attendanceMismatch + counts.timeMismatch + counts.courseMismatch + counts.systemMissing + counts.importMissing + counts.needsMapping;
}

export function savedReviewEffectiveCounts(review: ScheduleImportReviewRecord): Pick<ScheduleImportReviewRecord["summary"], "matched" | "attendanceMismatch" | "timeMismatch" | "courseMismatch" | "systemMissing" | "importMissing" | "needsMapping"> {
  if (review.rows.length === 0) {
    return {
      matched: review.summary.matched,
      attendanceMismatch: review.summary.attendanceMismatch,
      timeMismatch: review.summary.timeMismatch,
      courseMismatch: review.summary.courseMismatch,
      systemMissing: review.summary.systemMissing,
      importMissing: review.summary.importMissing,
      needsMapping: review.summary.needsMapping
    };
  }
  const linkedSystemLessonIds = linkedSystemLessonIdsFromSavedRows(review.rows);
  return review.rows.reduce(
    (counts, row) => {
      const status = effectiveSavedRowStatus(row, linkedSystemLessonIds);
      if (status === "matched") counts.matched += 1;
      if (status === "attendance_mismatch") counts.attendanceMismatch += 1;
      if (status === "time_mismatch") counts.timeMismatch += 1;
      if (status === "course_mismatch") counts.courseMismatch += 1;
      if (status === "system_missing") counts.systemMissing += 1;
      if (status === "import_missing") counts.importMissing += 1;
      if (status === "needs_mapping") counts.needsMapping += 1;
      return counts;
    },
    {
      matched: 0,
      attendanceMismatch: 0,
      timeMismatch: 0,
      courseMismatch: 0,
      systemMissing: 0,
      importMissing: 0,
      needsMapping: 0
    }
  );
}

export function savedReviewTitle(review: ScheduleImportReviewRecord): string {
  return `${review.month} 对账 · ${formatSavedAt(review.savedAt)}`;
}

export function formatSavedReviewNumber(value: number | undefined): string {
  return value === undefined ? "-" : String(value);
}

export function formatSavedReviewAmount(value: number | undefined, visible: boolean): string {
  return value === undefined ? "-" : formatPrivateMoney(value, visible);
}

export function formatSavedReviewCount(value: number | undefined): string {
  return value === undefined ? "-" : String(value);
}

function formatSavedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
