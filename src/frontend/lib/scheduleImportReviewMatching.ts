import type {
  ScheduleImportSavedRow,
  ScheduleImportResolution,
  ScheduleImportResolutionMap,
  ScheduleImportResolutionStatus
} from "@/shared/types";
import type { ImportMatchStatus, ImportPreviewLesson } from "@/frontend/lib/scheduleImport";
import { resolutionMarksRowResolved } from "@/frontend/lib/scheduleImportReviewStatus";
import { normalizeLinkedSystemLessonIds } from "@/frontend/lib/scheduleImportReviewUtils";

export type LinkedSystemLessonSource = {
  lessonId: string;
  rowKey: string;
  rowId: string;
  fileName: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  matchedCourseId?: string;
  status: ImportMatchStatus;
  resolutionStatus: ScheduleImportResolutionStatus;
  resolutionNote?: string;
};

export function buildUpdatedResolutions(
  current: ScheduleImportResolutionMap,
  key: string,
  patch: Partial<Pick<ScheduleImportResolution, "status" | "note" | "linkedSystemLessonIds">>
): ScheduleImportResolutionMap {
  const previous = current[key] ?? { status: "unreviewed" as ScheduleImportResolutionStatus, updatedAt: new Date().toISOString() };
  const next: ScheduleImportResolution = {
    ...previous,
    ...patch,
    note: patch.note !== undefined ? patch.note : previous.note,
    linkedSystemLessonIds: patch.linkedSystemLessonIds !== undefined ? normalizeLinkedSystemLessonIds(patch.linkedSystemLessonIds) : previous.linkedSystemLessonIds,
    updatedAt: new Date().toISOString()
  };
  if (next.status === "unreviewed" && !next.note?.trim() && !next.linkedSystemLessonIds?.length) {
    const rest = { ...current };
    delete rest[key];
    return rest;
  }
  return { ...current, [key]: next };
}

export function effectiveRowStatus(row: ImportPreviewLesson, resolution?: ScheduleImportResolution, linkedSystemLessonIds: Set<string> = new Set()): ImportMatchStatus {
  if (row.status === "matched") return "matched";
  if (row.status === "import_missing" && row.systemLessonId && linkedSystemLessonIds.has(row.systemLessonId)) return "matched";
  if (resolutionMarksRowResolved(resolution?.status)) return "matched";
  return row.status;
}

export function applyResolutionToRow(row: ImportPreviewLesson, resolution?: ScheduleImportResolution, linkedSystemLessonIds: Set<string> = new Set()): ImportPreviewLesson {
  return { ...row, status: effectiveRowStatus(row, resolution, linkedSystemLessonIds) };
}

export function countResolutionsForRows(rows: ImportPreviewLesson[], resolutions: ScheduleImportResolutionMap): Record<ScheduleImportResolutionStatus, number> {
  return rows.reduce(
    (counts, row) => {
      const status = resolutions[resolutionKey(row)]?.status;
      if (status && status !== "unreviewed") counts[status] += 1;
      return counts;
    },
    {
      unreviewed: 0,
      excel_error: 0,
      cloud_error: 0,
      fixed: 0,
      accepted: 0,
      time_variance_ok: 0,
      split_merge_ok: 0
    }
  );
}

export function linkedSystemLessonIdsFromResolutions(resolutions: ScheduleImportResolutionMap): Set<string> {
  return new Set(Object.values(resolutions).flatMap((resolution) => resolution.linkedSystemLessonIds ?? []));
}

export function linkedSystemLessonSourcesFromRows(rows: ImportPreviewLesson[], resolutions: ScheduleImportResolutionMap): LinkedSystemLessonSource[] {
  return rows.flatMap((row) => {
    const rowKey = resolutionKey(row);
    const resolution = resolutions[rowKey];
    if (!resolution?.linkedSystemLessonIds?.length || !splitMergeLinkAppliesToRow(row)) return [];
    return resolution.linkedSystemLessonIds.map((lessonId) => ({
      lessonId,
      rowKey,
      rowId: row.id,
      fileName: row.fileName,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      title: row.title,
      matchedCourseId: row.matchedCourseId,
      status: row.status,
      resolutionStatus: resolution.status,
      resolutionNote: resolution.note
    }));
  });
}

function splitMergeLinkAppliesToRow(row: ImportPreviewLesson): boolean {
  return row.status === "time_mismatch" || row.status === "system_missing" || row.status === "course_mismatch" || row.status === "import_missing";
}

export function linkedSystemLessonIdsFromRows(rows: ImportPreviewLesson[], resolutions: ScheduleImportResolutionMap): Set<string> {
  return new Set(linkedSystemLessonSourcesFromRows(rows, resolutions).map((source) => source.lessonId));
}

export function linkedSystemLessonIdsFromSavedRows(rows: ScheduleImportSavedRow[]): Set<string> {
  return new Set(rows.flatMap((row) => row.linkedSystemLessonIds ?? []));
}

export function effectiveSavedRowStatus(row: ScheduleImportSavedRow, linkedSystemLessonIds: Set<string> = new Set()): ImportMatchStatus {
  if (row.status === "matched") return "matched";
  if (row.status === "import_missing" && row.systemLessonId && linkedSystemLessonIds.has(row.systemLessonId)) return "matched";
  if (resolutionMarksRowResolved(row.resolutionStatus)) return "matched";
  return row.status as ImportMatchStatus;
}

export function quickResolutionActionsForRow(row: ImportPreviewLesson): Array<{ status: ScheduleImportResolutionStatus; label: string; note: string }> {
  const actions: Array<{ status: ScheduleImportResolutionStatus; label: string; note: string }> = [
    {
      status: "accepted",
      label: "确认无误",
      note: "人工核对确认无误。"
    }
  ];
  if (row.status === "time_mismatch") {
    actions.push({
      status: "time_variance_ok",
      label: "时间偏差正常",
      note: "时间前后相差 10 分钟左右，按正常课节处理。"
    });
  }
  if (row.status === "time_mismatch" || row.status === "system_missing" || row.status === "import_missing") {
    actions.push({
      status: "split_merge_ok",
      label: "拆分合并正常",
      note: "教务与云端存在拆分、合并或跨日期记录差异，人工确认按同一课程课时处理。"
    });
  }
  return actions;
}

export function resolutionKey(row: ImportPreviewLesson): string {
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
