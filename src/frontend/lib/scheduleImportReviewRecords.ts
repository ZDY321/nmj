import type {
  Lesson,
  ScheduleImportResolutionMap,
  ScheduleImportReviewRecord,
  ScheduleImportVaultState,
  TeacherVault
} from "@/shared/types";
import { completedAmount, lessonBillableHoursForVault } from "@/frontend/lib/calculations";
import { compareByName, formatPrivateMoney } from "@/frontend/lib/helpers";
import {
  type ImportedScheduleLesson,
  type ImportPreviewLesson,
  type ScheduleImportMapping,
  summarizeImportPreview
} from "@/frontend/lib/scheduleImport";
import {
  effectiveSavedRowStatus,
  linkedSystemLessonIdsFromRows,
  linkedSystemLessonIdsFromSavedRows,
  resolutionKey
} from "@/frontend/lib/scheduleImportReviewMatching";
import { resolutionExcludesImportStats } from "@/frontend/lib/scheduleImportReviewStatus";

export const savedScheduleImportReviewLimit = 6;
const savedScheduleImportRawTextLimit = 240;

export function savedScheduleImportReviewOverflowCount(currentReviews: ScheduleImportReviewRecord[], nextMonth: string): number {
  const retainedMonthCount = latestScheduleImportReviewsByMonth(currentReviews)
    .filter((review) => review.month !== nextMonth)
    .length;
  return Math.max(retainedMonthCount + 1 - savedScheduleImportReviewLimit, 0);
}

export function latestScheduleImportReviewsByMonth(reviews: ScheduleImportReviewRecord[]): ScheduleImportReviewRecord[] {
  const latestByMonth = new Map<string, ScheduleImportReviewRecord>();
  [...reviews]
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .forEach((review) => {
      if (!latestByMonth.has(review.month)) latestByMonth.set(review.month, review);
    });
  return Array.from(latestByMonth.values()).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

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
    splitMergeExcludedLessonIds?: string[];
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
      ...latestScheduleImportReviewsByMonth(previous?.reviews ?? []).filter((item) => item.month !== review.month)
    ].slice(0, savedScheduleImportReviewLimit),
    splitMergeExcludedLessonIds: context.splitMergeExcludedLessonIds ?? previous?.splitMergeExcludedLessonIds ?? [],
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
    splitMergeExcludedLessonIds?: string[];
  },
  savedAt: string
): ScheduleImportReviewRecord {
  const monthRawLessons = context.rawLessons.filter((lesson) => lesson.date.startsWith(context.selectedMonth));
  const monthRows = context.rows.filter((row) => row.date.startsWith(context.selectedMonth));
  const fileNames = Array.from(new Set(monthRawLessons.map((lesson) => lesson.fileName))).sort(compareByName);
  const monthStatisticRows = monthRows
    .filter((row) => !resolutionExcludesImportStats(context.resolutions[resolutionKey(row)]?.status));
  const monthSummary = summarizeImportPreview(monthStatisticRows);
  const monthResolutions = Object.fromEntries(monthRows.flatMap((row) => {
    const key = resolutionKey(row);
    const resolution = context.resolutions[key];
    return resolution ? [[key, resolution]] : [];
  }));
  const systemLessonSummary = summarizeScheduleImportSystemLessons(vault, monthRows, context.resolutions, context.splitMergeExcludedLessonIds);
  return {
    id: `schedule-import-${savedAt}`,
    savedAt,
    month: context.selectedMonth,
    selectedDate: context.selectedDate.startsWith(context.selectedMonth)
      ? context.selectedDate
      : monthRawLessons[0]?.date ?? `${context.selectedMonth}-01`,
    rawLessonCount: monthRawLessons.length,
    fileNames,
    mapping: context.mapping,
    fileCampusOverrides: Object.fromEntries(fileNames.flatMap((fileName) => {
      const campusId = context.fileCampusOverrides[fileName];
      return campusId ? [[fileName, campusId]] : [];
    })),
    resolutions: monthResolutions,
    summary: {
      total: monthSummary.total,
      matched: monthSummary.matched,
      attendanceMismatch: monthSummary.attendanceMismatch,
      timeMismatch: monthSummary.timeMismatch,
      courseMismatch: monthSummary.courseMismatch,
      systemMissing: monthSummary.systemMissing,
      importMissing: monthSummary.importMissing,
      needsMapping: monthSummary.needsMapping,
      recheckRequired: monthRows.filter((row) => context.resolutions[resolutionKey(row)]?.status === "recheck_required").length,
      systemLessonCount: systemLessonSummary.count,
      systemCompletedLessonCount: systemLessonSummary.completedCount,
      systemCompletedAmount: systemLessonSummary.completedAmount
    },
    rows: monthRows.map((row) => {
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
        note: row.note,
        rawText: row.rawText ? row.rawText.slice(0, savedScheduleImportRawTextLimit) : "",
        warnings: row.warnings,
        matchedCourseId: row.matchedCourseId,
        mappedCourseId: row.mappedCourseId,
        status: row.status,
        systemLessonId: row.systemLessonId,
        systemLessonLabel: row.systemLessonLabel,
        systemLessonStatus: row.systemLessonStatus,
        systemLessonNote: row.systemLessonNote,
        systemActualPresentCount: row.systemActualPresentCount,
        systemPresentCount: row.systemPresentCount,
        systemExpectedCount: row.systemExpectedCount,
        systemPresentStudentNames: row.systemPresentStudentNames,
        systemExpectedStudentNames: row.systemExpectedStudentNames,
        systemMakeupCompletedCount: row.systemMakeupCompletedCount,
        systemMakeupCompletedStudentNames: row.systemMakeupCompletedStudentNames,
        issues: row.issues,
        resolutionStatus: resolution?.status,
        resolutionNote: resolution?.note,
        linkedSystemLessonIds: resolution?.linkedSystemLessonIds,
        resolutionUpdatedAt: resolution?.updatedAt
      };
    })
  };
}

export type ScheduleImportSystemLessonStats = {
  count: number;
  hours: number;
  completedCount: number;
  completedHours: number;
  completedAmount: number;
};

export function summarizeScheduleImportSystemLessons(
  vault: TeacherVault,
  rows: ImportPreviewLesson[],
  resolutions: ScheduleImportResolutionMap,
  splitMergeExcludedLessonIds?: Iterable<string>
): ScheduleImportSystemLessonStats {
  const lessonIds = scheduleImportSystemLessonIds(vault, rows, resolutions, splitMergeExcludedLessonIds);
  const lessons = lessonIds
    .map((lessonId) => vault.lessons.find((lesson) => lesson.id === lessonId))
    .filter((lesson): lesson is Lesson => Boolean(lesson));
  const completedLessons = lessons.filter((lesson) => lesson.status === "completed" || lesson.status === "makeup_completed");
  return {
    count: lessons.length,
    hours: lessons.reduce((sum, lesson) => sum + lessonBillableHoursForVault(vault, lesson), 0),
    completedCount: completedLessons.length,
    completedHours: completedLessons.reduce((sum, lesson) => sum + lessonBillableHoursForVault(vault, lesson), 0),
    completedAmount: completedLessons.reduce((sum, lesson) => sum + completedAmount(lesson), 0)
  };
}

export function splitMergePayrollExcludedLessonIds(
  vault: TeacherVault,
  rows: ImportPreviewLesson[],
  resolutions: ScheduleImportResolutionMap
): string[] {
  const existingSystemLessonIds = new Set(vault.lessons.map((lesson) => lesson.id));
  const lessonIds = new Set<string>();
  rows.forEach((row) => {
    const resolution = resolutions[resolutionKey(row)];
    if (resolution?.status !== "split_merge_ok" || !row.systemLessonId) return;
    const mergeTargetLessonIds = (resolution.linkedSystemLessonIds ?? []).filter((lessonId) =>
      lessonId &&
      lessonId !== row.systemLessonId &&
      existingSystemLessonIds.has(lessonId)
    );
    if (mergeTargetLessonIds.length > 0) lessonIds.add(row.systemLessonId);
  });
  return Array.from(lessonIds);
}

function scheduleImportSystemLessonIds(
  vault: TeacherVault,
  rows: ImportPreviewLesson[],
  resolutions: ScheduleImportResolutionMap,
  splitMergeExcludedLessonIds?: Iterable<string>
): string[] {
  const ids = new Set(rows.map((row) => row.systemLessonId).filter((lessonId): lessonId is string => Boolean(lessonId)));
  const excludedLessonIds = new Set(splitMergeExcludedLessonIds ?? splitMergePayrollExcludedLessonIds(vault, rows, resolutions));
  linkedSystemLessonIdsFromRows(rows, resolutions).forEach((lessonId) => ids.add(lessonId));
  excludedLessonIds.forEach((lessonId) => ids.delete(lessonId));
  return Array.from(ids);
}

export function buildScheduleImportStateWithoutReview(
  vault: TeacherVault,
  mapping: ScheduleImportMapping,
  resolutions: ScheduleImportResolutionMap,
  splitMergeExcludedLessonIds?: string[]
): ScheduleImportVaultState {
  return {
    mappings: { ...mapping },
    resolutions: { ...resolutions },
    reviews: (vault.scheduleImport?.reviews ?? []).slice(0, savedScheduleImportReviewLimit),
    splitMergeExcludedLessonIds: splitMergeExcludedLessonIds ?? vault.scheduleImport?.splitMergeExcludedLessonIds ?? [],
    updatedAt: new Date().toISOString()
  };
}

export function savedReviewNeedsAttention(review: ScheduleImportReviewRecord): number {
  const counts = savedReviewEffectiveCounts(review);
  return counts.attendanceMismatch + counts.timeMismatch + counts.courseMismatch + counts.systemMissing + counts.importMissing + counts.needsMapping + counts.recheckRequired;
}

export function savedReviewEffectiveCounts(review: ScheduleImportReviewRecord): Pick<ScheduleImportReviewRecord["summary"], "matched" | "attendanceMismatch" | "timeMismatch" | "courseMismatch" | "systemMissing" | "importMissing" | "needsMapping"> & { recheckRequired: number } {
  if (review.rows.length === 0) {
    return {
      matched: review.summary.matched,
      attendanceMismatch: review.summary.attendanceMismatch,
      timeMismatch: review.summary.timeMismatch,
      courseMismatch: review.summary.courseMismatch,
      systemMissing: review.summary.systemMissing,
      importMissing: review.summary.importMissing,
      needsMapping: review.summary.needsMapping,
      recheckRequired: review.summary.recheckRequired ?? 0
    };
  }
  const linkedSystemLessonIds = linkedSystemLessonIdsFromSavedRows(review.rows);
  return review.rows.reduce(
    (counts, row) => {
      if (resolutionExcludesImportStats(row.resolutionStatus)) return counts;
      if (row.resolutionStatus === "recheck_required") {
        counts.recheckRequired += 1;
        return counts;
      }
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
      needsMapping: 0,
      recheckRequired: 0
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
