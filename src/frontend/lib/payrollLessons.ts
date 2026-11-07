import { resolutionKey } from "@/frontend/lib/scheduleImportReviewKey";
import type {
  Lesson,
  ScheduleImportResolution,
  ScheduleImportSavedRow,
  TeacherVault
} from "../../shared/types";
import { isLessonFullyMissedAndMakeupExempt, isOriginalFullyMadeUp } from "./billingPrimitives";
import { monthOf } from "./dateCalculations";
import { lessonBillableHours, lessonBillableHoursForVault } from "./feeRules";

export function completedAmount(lesson: Lesson): number {
  if (lesson.status !== "completed" && lesson.status !== "makeup_completed") {
    return 0;
  }
  if (isOriginalFullyMadeUp(lesson) || isLessonFullyMissedAndMakeupExempt(lesson)) {
    return 0;
  }
  return lesson.feeSnapshot.amount;
}

export function completedHours(lesson: Lesson, vault?: TeacherVault): number {
  if (lesson.status !== "completed" && lesson.status !== "makeup_completed") {
    return 0;
  }
  if (isOriginalFullyMadeUp(lesson) || isLessonFullyMissedAndMakeupExempt(lesson)) {
    return 0;
  }
  return vault ? lessonBillableHoursForVault(vault, lesson) : lessonBillableHours(lesson);
}

export function payrollExcludedSplitMergeLessonIds(vault: TeacherVault, month?: string): Set<string> {
  if (vault.scheduleImport?.splitMergeExcludedLessonIds) {
    const validatedLessonIds = validSplitMergeExcludedLessonIdsFromCurrentResolutions(vault, month);
    if (validatedLessonIds) {
      return new Set(vault.scheduleImport.splitMergeExcludedLessonIds.filter((lessonId) => validatedLessonIds.has(lessonId)));
    }
    return new Set(vault.scheduleImport.splitMergeExcludedLessonIds.filter((lessonId) => {
      if (!month) return true;
      return vault.lessons.find((lesson) => lesson.id === lessonId)?.date.startsWith(month);
    }));
  }
  const reviews = vault.scheduleImport?.reviews ?? [];
  const currentResolutions = vault.scheduleImport?.resolutions;
  const lessonIds = new Set<string>();
  reviews
    .filter((review) => !month || review.month === month)
    .forEach((review) => {
      review.rows.forEach((row) => {
        const resolution = currentResolutions
          ? currentResolutions[resolutionKey(row)]
          : savedRowResolution(row);
        if (resolution?.status !== "split_merge_ok" || !row.systemLessonId) return;
        const mergeTargetLessonIds = (resolution.linkedSystemLessonIds ?? []).filter((lessonId) => lessonId && lessonId !== row.systemLessonId);
        if (mergeTargetLessonIds.length > 0) lessonIds.add(row.systemLessonId);
      });
    });
  return lessonIds;
}

function validSplitMergeExcludedLessonIdsFromCurrentResolutions(vault: TeacherVault, month?: string): Set<string> | undefined {
  const resolutions = vault.scheduleImport?.resolutions;
  if (!resolutions || Object.keys(resolutions).length === 0) return undefined;
  const existingLessonIds = new Set(vault.lessons.map((lesson) => lesson.id));
  const validSourceLessonIds = new Set<string>();
  Object.entries(resolutions).forEach(([key, resolution]) => {
    if (resolution.status !== "split_merge_ok") return;
    const sourceLessonId = key.split("|", 1)[0];
    const sourceLesson = vault.lessons.find((lesson) => lesson.id === sourceLessonId);
    if (!sourceLesson || (month && !sourceLesson.date.startsWith(month))) return;
    const hasExistingMergeTarget = (resolution.linkedSystemLessonIds ?? []).some((lessonId) =>
      lessonId &&
      lessonId !== sourceLessonId &&
      existingLessonIds.has(lessonId)
    );
    if (hasExistingMergeTarget) validSourceLessonIds.add(sourceLessonId);
  });
  return validSourceLessonIds;
}

export function isPayrollExcludedSplitMergeLesson(lesson: Lesson, excludedLessonIds: Set<string>): boolean {
  return excludedLessonIds.has(lesson.id);
}

export function isPayrollCountedCompletedLesson(lesson: Lesson, excludedLessonIds: Set<string>): boolean {
  if (lesson.status !== "completed" && lesson.status !== "makeup_completed") return false;
  if (isPayrollExcludedSplitMergeLesson(lesson, excludedLessonIds)) return false;
  return !isOriginalFullyMadeUp(lesson) && !isLessonFullyMissedAndMakeupExempt(lesson);
}

export function payrollCompletedLessonCount(vault: TeacherVault, month: string): number {
  const excludedLessonIds = payrollExcludedSplitMergeLessonIds(vault, month);
  return vault.lessons.filter((lesson) => monthOf(lesson.date) === month && isPayrollCountedCompletedLesson(lesson, excludedLessonIds)).length;
}

function savedRowResolution(row: ScheduleImportSavedRow): ScheduleImportResolution | undefined {
  return row.resolutionStatus
    ? {
      status: row.resolutionStatus,
      note: row.resolutionNote,
      linkedSystemLessonIds: row.linkedSystemLessonIds,
      updatedAt: row.resolutionUpdatedAt ?? ""
    }
    : undefined;
}
