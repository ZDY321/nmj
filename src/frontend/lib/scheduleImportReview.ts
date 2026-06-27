export {
  isReviewedResolution,
  isResolutionFilter,
  resolutionMarksRowResolved,
  resolutionStatusFromFilter,
  resolutionStatusLabel,
  resolutionStatuses,
  importMatchStatusFilterOptions,
  resolutionStatusFilterOptions,
  statusFilters,
  statusFilterOptions,
  statusLabel,
  statusPillClass,
  statusSurfaceClass,
  statusVariant,
  type ResolutionFilter,
  type ScheduleImportBadgeVariant,
  type StatusFilter
} from "@/frontend/lib/scheduleImportReviewStatus";
export {
  readSavedMapping,
  readSavedWorkspace,
  writeSavedMapping,
  writeSavedWorkspace,
  type SavedScheduleImportWorkspace,
  type ScheduleImportFileSummary
} from "@/frontend/lib/scheduleImportReviewStorage";
export {
  applyResolutionToRow,
  buildUpdatedResolutions,
  countResolutionsForRows,
  effectiveRowStatus,
  effectiveSavedRowStatus,
  linkedSystemLessonIdsFromRows,
  linkedSystemLessonIdsFromResolutions,
  linkedSystemLessonIdsFromSavedRows,
  linkedSystemLessonSourcesFromRows,
  quickResolutionActionsForRow,
  resolutionKey,
  type LinkedSystemLessonSource
} from "@/frontend/lib/scheduleImportReviewMatching";
export {
  buildNextScheduleImportState,
  buildScheduleImportStateWithoutReview,
  formatSavedReviewAmount,
  formatSavedReviewCount,
  formatSavedReviewNumber,
  savedReviewEffectiveCounts,
  savedReviewNeedsAttention,
  savedReviewTitle,
  savedScheduleImportReviewOverflowCount,
  savedScheduleImportReviewLimit
} from "@/frontend/lib/scheduleImportReviewRecords";
export {
  courseTypeLabelSafe,
  importPreviewLessonBillableHours,
  lessonDurationHours,
  linkedLessonsForResolution,
  linkedLessonsForSavedRow,
  savedRowSystemAttendance,
  savedRowSystemLesson,
  savedRowSystemLessonLabel,
  splitMergeCandidateLessons,
  summarizeLinkedLessons
} from "@/frontend/lib/scheduleImportReviewLessons";
export {
  matchesImportRowFilters,
  matchesSavedReviewRowFilters
} from "@/frontend/lib/scheduleImportReviewFilters";
export {
  applyCampusOverridesToLessons,
  buildDefaultCampusOverrides,
  buildLocalOnlyRows,
  summarizeFiles
} from "@/frontend/lib/scheduleImportReviewRows";


export function parseTimeComparisonIssue(issue: string): { label: string; importDate: string; importTime: string; systemDate: string; systemTime: string; systemTitle?: string } | null {
  const match = issue.match(/^(.*时间不一致)：教务\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})[,，]\s*云端\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})(?:\s+(.+))?$/);
  if (!match) return null;
  return {
    label: match[1],
    importDate: match[2],
    importTime: normalizeDisplayTimeRange(match[3]),
    systemDate: match[4],
    systemTime: normalizeDisplayTimeRange(match[5]),
    systemTitle: match[6]?.trim()
  };
}

function normalizeDisplayTimeRange(value: string): string {
  return value.replace(/\s*-\s*/g, "-");
}


