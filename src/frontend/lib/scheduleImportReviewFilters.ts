import type { ScheduleImportSavedRow, ScheduleImportResolutionMap, TeacherVault } from "@/shared/types";
import {
  type ImportPreviewLesson
} from "@/frontend/lib/scheduleImport";
import { courseName as localCourseName } from "@/frontend/lib/helpers";
import {
  isResolutionFilter,
  resolutionExcludesImportStats,
  resolutionStatusFromFilter,
  resolutionStatusLabel,
  type StatusFilter
} from "@/frontend/lib/scheduleImportReviewStatus";
import {
  effectiveRowStatus,
  effectiveSavedRowStatus,
  resolutionKey
} from "@/frontend/lib/scheduleImportReviewMatching";
import { savedRowSystemLessonLabel } from "@/frontend/lib/scheduleImportReviewLessons";

export function matchesImportRowFilters(
  row: ImportPreviewLesson,
  filters: { month: string; campusFilter: string; linkedSystemLessonIds: Set<string>; statusFilter: StatusFilter; search: string; vault: TeacherVault; resolutions: ScheduleImportResolutionMap }
): boolean {
  if (filters.month && !row.date.startsWith(filters.month)) return false;
  if (filters.campusFilter !== "all" && row.campusId !== filters.campusFilter) return false;
  const resolution = filters.resolutions[resolutionKey(row)];
  if (isResolutionFilter(filters.statusFilter)) {
    if (resolution?.status !== resolutionStatusFromFilter(filters.statusFilter)) return false;
  } else if (filters.statusFilter !== "all" && resolutionExcludesImportStats(resolution?.status)) {
    return false;
  } else if (filters.statusFilter !== "all" && effectiveRowStatus(row, resolution, filters.linkedSystemLessonIds) !== filters.statusFilter) {
    return false;
  }
  const terms = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [
    row.title,
    row.studentNameHint ?? "",
    row.campusName,
    row.subjectHint,
    row.teacher ?? "",
    row.room ?? "",
    row.note ?? "",
    row.rawText ?? "",
    savedRowSystemLessonLabel(filters.vault, row),
    row.systemLessonLabel ?? "",
    row.systemLessonStatus ?? "",
    row.systemLessonNote ?? "",
    row.matchedCourseId ? localCourseName(filters.vault, row.matchedCourseId) : "",
    row.systemPresentStudentNames ?? "",
    row.systemExpectedStudentNames ?? "",
    resolution?.status ? resolutionStatusLabel(resolution.status) : "",
    resolution?.note ?? "",
    ...row.issues
  ].join(" ").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function matchesSavedReviewRowFilters(
  row: ScheduleImportSavedRow,
  filters: { linkedSystemLessonIds: Set<string>; statusFilter: StatusFilter; search: string; vault: TeacherVault }
): boolean {
  if (isResolutionFilter(filters.statusFilter)) {
    if (row.resolutionStatus !== resolutionStatusFromFilter(filters.statusFilter)) return false;
  } else if (filters.statusFilter !== "all" && resolutionExcludesImportStats(row.resolutionStatus)) {
    return false;
  } else if (filters.statusFilter !== "all" && effectiveSavedRowStatus(row, filters.linkedSystemLessonIds) !== filters.statusFilter) {
    return false;
  }
  const terms = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [
    row.title,
    row.studentNameHint ?? "",
    row.campusName,
    row.subjectHint,
    row.teacher ?? "",
    row.room ?? "",
    row.note ?? "",
    row.rawText ?? "",
    savedRowSystemLessonLabel(filters.vault, row),
    row.systemLessonLabel ?? "",
    row.systemLessonStatus ?? "",
    row.systemLessonNote ?? "",
    row.matchedCourseId ? localCourseName(filters.vault, row.matchedCourseId) : "",
    row.systemPresentStudentNames ?? "",
    row.systemExpectedStudentNames ?? "",
    row.resolutionStatus ? resolutionStatusLabel(row.resolutionStatus) : "",
    row.resolutionNote ?? "",
    ...row.issues
  ].join(" ").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
