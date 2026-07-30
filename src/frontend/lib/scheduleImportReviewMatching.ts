import type {
  ScheduleImportSavedRow,
  ScheduleImportResolution,
  ScheduleImportResolutionMap,
  ScheduleImportResolutionStatus,
  ScheduleImportReviewRecord
} from "@/shared/types";
import type { ImportMatchStatus, ImportPreviewLesson } from "@/frontend/lib/scheduleImport";
import { resolutionMarksRowResolved, resolutionStatusLabel, resolutionStatuses, statusLabel } from "@/frontend/lib/scheduleImportReviewStatus";

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

export function normalizeLinkedSystemLessonIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = Array.from(new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))));
  return ids.length > 0 ? ids : undefined;
}

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
    Object.fromEntries(resolutionStatuses.map((status) => [status, 0])) as Record<ScheduleImportResolutionStatus, number>
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
  if (importRowLooksNoShow(row)) {
    actions.push({
      status: "missing_lesson_fee",
      label: "缺课时费",
      note: "教务实到为 0，疑似学生未到或课时费不足，按缺课时费处理。"
    });
  }
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

function importRowLooksNoShow(row: Pick<ImportPreviewLesson, "presentCount" | "expectedCount" | "warnings" | "note" | "rawText">): boolean {
  if (row.presentCount !== 0 || (row.expectedCount ?? 0) <= 0) return false;
  if (row.warnings.includes("缺勤未到")) return true;
  if (row.warnings.includes("未开课/取消")) return false;
  if (/取消|停课|请假|未上|不上课|未开课|课消|无学生/.test(`${row.note ?? ""} ${row.rawText ?? ""}`)) return false;
  return true;
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

export type ScheduleImportIncrementalMerge = {
  resolutions: ScheduleImportResolutionMap;
  unchangedCount: number;
  inheritedCount: number;
  changedCount: number;
  newCount: number;
  removedCount: number;
};

export function resolutionsWithoutMonths(
  resolutions: ScheduleImportResolutionMap,
  months: Iterable<string>
): ScheduleImportResolutionMap {
  const monthSet = new Set(months);
  if (monthSet.size === 0) return { ...resolutions };
  return Object.fromEntries(Object.entries(resolutions).filter(([key]) => {
    const keyDate = key.split("|").find((part) => /^\d{4}-\d{2}-\d{2}$/.test(part));
    return !keyDate || !monthSet.has(keyDate.slice(0, 7));
  }));
}

export function mergeSavedReviewResolutions(
  review: ScheduleImportReviewRecord,
  currentRows: ImportPreviewLesson[],
  baseResolutions: ScheduleImportResolutionMap
): ScheduleImportIncrementalMerge {
  const savedRows = review.rows.filter((row) => row.date.startsWith(review.month));
  const usedSavedRows = new Set<number>();
  const resolutions = { ...baseResolutions };
  let unchangedCount = 0;
  let inheritedCount = 0;
  let changedCount = 0;
  let newCount = 0;

  currentRows.forEach((row) => {
    const savedIndex = findSavedRowIndex(row, savedRows, usedSavedRows);
    if (savedIndex < 0) {
      newCount += 1;
      return;
    }
    usedSavedRows.add(savedIndex);
    const savedRow = savedRows[savedIndex];
    const previousResolution = savedResolutionForRow(review, savedRow);
    if (rowComparisonFingerprint(row) === rowComparisonFingerprint(savedRow)) {
      unchangedCount += 1;
      if (previousResolution) {
        resolutions[resolutionKey(row)] = { ...previousResolution };
        inheritedCount += 1;
      }
      return;
    }

    changedCount += 1;
    const previousLabel = previousResolution
      ? resolutionStatusLabel(previousResolution.status)
      : statusLabel(savedRow.status as ImportMatchStatus);
    const noteParts = [
      "新导入的数据与上次保存结果不同，请重新核对。",
      `上次处理：${previousLabel}。`,
      previousResolution?.note?.trim() ? `上次备注：${previousResolution.note.trim()}` : "",
      previousResolution?.linkedSystemLessonIds?.length ? `上次关联 ${previousResolution.linkedSystemLessonIds.length} 节云端课。` : ""
    ].filter(Boolean);
    resolutions[resolutionKey(row)] = {
      status: "recheck_required",
      note: noteParts.join(" "),
      updatedAt: new Date().toISOString()
    };
  });

  return {
    resolutions,
    unchangedCount,
    inheritedCount,
    changedCount,
    newCount,
    removedCount: Math.max(savedRows.length - usedSavedRows.size, 0)
  };
}

function findSavedRowIndex(
  row: ImportPreviewLesson,
  savedRows: ScheduleImportSavedRow[],
  usedSavedRows: ReadonlySet<number>
): number {
  const availableIndexes = savedRows
    .map((_, index) => index)
    .filter((index) => !usedSavedRows.has(index));
  if (row.systemLessonId) {
    const sameSystemLesson = availableIndexes.filter((index) => savedRows[index].systemLessonId === row.systemLessonId);
    const exactSystemMatch = sameSystemLesson.find((index) => rowComparisonFingerprint(savedRows[index]) === rowComparisonFingerprint(row));
    if (exactSystemMatch !== undefined) return exactSystemMatch;
    if (sameSystemLesson.length === 1) return sameSystemLesson[0];
    const sameIdentity = sameSystemLesson.find((index) => rowIdentityKey(savedRows[index]) === rowIdentityKey(row));
    if (sameIdentity !== undefined) return sameIdentity;
  }
  return availableIndexes.find((index) => rowIdentityKey(savedRows[index]) === rowIdentityKey(row)) ?? -1;
}

function rowIdentityKey(row: ImportPreviewLesson | ScheduleImportSavedRow): string {
  const campus = row.campusId ? `id:${row.campusId}` : `name:${normalizeComparisonText(row.campusName)}`;
  const course = row.matchedCourseId || row.mappedCourseId
    ? `id:${row.matchedCourseId ?? row.mappedCourseId}`
    : `name:${normalizeComparisonText(row.title)}`;
  return [campus, row.date, row.startTime, row.endTime, course].join("|");
}

function rowComparisonFingerprint(row: ImportPreviewLesson | ScheduleImportSavedRow): string {
  return JSON.stringify([
    row.campusId ?? normalizeComparisonText(row.campusName),
    row.date,
    row.startTime,
    row.endTime,
    normalizeComparisonText(row.title),
    normalizeComparisonText(row.subjectHint),
    row.courseTypeHint,
    normalizeComparisonText(row.studentNameHint ?? ""),
    normalizeComparisonText(row.teacher ?? ""),
    normalizeComparisonText(row.assistant ?? ""),
    normalizeComparisonText(row.room ?? ""),
    row.presentCount ?? null,
    row.expectedCount ?? null,
    normalizeComparisonText(row.note ?? ""),
    row.matchedCourseId ?? row.mappedCourseId ?? "",
    row.systemLessonId ?? "",
    row.systemLessonStatus ?? "",
    normalizeComparisonText(row.systemLessonNote ?? ""),
    row.systemActualPresentCount ?? null,
    row.systemPresentCount ?? null,
    row.systemExpectedCount ?? null,
    normalizeComparisonText(row.systemPresentStudentNames ?? ""),
    normalizeComparisonText(row.systemExpectedStudentNames ?? ""),
    row.systemMakeupCompletedCount ?? null,
    normalizeComparisonText(row.systemMakeupCompletedStudentNames ?? "")
  ]);
}

function normalizeComparisonText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function savedResolutionForRow(
  review: ScheduleImportReviewRecord,
  row: ScheduleImportSavedRow
): ScheduleImportResolution | undefined {
  const key = [
    row.systemLessonId || row.id,
    row.fileName,
    row.date,
    row.startTime,
    row.endTime,
    row.matchedCourseId ?? "",
    row.title
  ].join("|");
  const saved = review.resolutions?.[key];
  if (saved) return saved;
  if (!row.resolutionStatus && !row.resolutionNote?.trim() && !row.linkedSystemLessonIds?.length) return undefined;
  return {
    status: row.resolutionStatus ?? "unreviewed",
    note: row.resolutionNote,
    linkedSystemLessonIds: row.linkedSystemLessonIds,
    updatedAt: row.resolutionUpdatedAt ?? review.savedAt
  };
}
