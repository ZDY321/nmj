import type { ScheduleImportSavedRow } from "@/shared/types";

type ReviewKeyRow = Pick<ScheduleImportSavedRow, "id" | "systemLessonId" | "fileName" | "date" | "startTime" | "endTime" | "matchedCourseId" | "title">;

// Persisted resolution maps depend on this exact field order and delimiter.
export function resolutionKey(row: ReviewKeyRow): string {
  return [
    row.systemLessonId || row.id,
    row.fileName,
    row.date,
    row.startTime,
    row.endTime,
    row.matchedCourseId ?? "",
    row.title
  ].join("|");
}
