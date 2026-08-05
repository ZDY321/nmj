import type {
  ScheduleImportSavedRow,
  ScheduleImportRecheckOrigin,
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
  patch: Partial<Pick<ScheduleImportResolution, "status" | "note" | "linkedSystemLessonIds" | "dataFingerprint">>
): ScheduleImportResolutionMap {
  const previous = current[key] ?? { status: "unreviewed" as ScheduleImportResolutionStatus, updatedAt: new Date().toISOString() };
  const next: ScheduleImportResolution = {
    ...previous,
    ...patch,
    note: patch.note !== undefined ? patch.note : previous.note,
    linkedSystemLessonIds: patch.linkedSystemLessonIds !== undefined ? normalizeLinkedSystemLessonIds(patch.linkedSystemLessonIds) : previous.linkedSystemLessonIds,
    // 一旦人工改成别的状态，复核来源就没有意义了，避免它一直挂在记录上。
    recheckOrigin: patch.status !== undefined && patch.status !== "recheck_required" ? undefined : previous.recheckOrigin,
    updatedAt: new Date().toISOString()
  };
  if (next.status === "unreviewed" && !next.note?.trim() && !next.linkedSystemLessonIds?.length) {
    const rest = { ...current };
    delete rest[key];
    return rest;
  }
  return { ...current, [key]: next };
}

const recheckNotePrefix = "当前数据与上次保存结果不同，请重新核对。";

// 待复核之前的处理结果。优先用结构化字段；历史上保存的坏数据没有这个字段，
// 就退回去解析备注文本里的「上次处理：X」，让存量记录也能一键恢复。
export function recheckOriginForRestore(
  resolution: ScheduleImportResolution | undefined
): ScheduleImportRecheckOrigin | undefined {
  if (!resolution || resolution.status !== "recheck_required") return undefined;
  if (resolution.recheckOrigin) return resolution.recheckOrigin;
  return parseRecheckOriginFromNote(resolution.note, resolution.linkedSystemLessonIds);
}

function parseRecheckOriginFromNote(
  note: string | undefined,
  linkedSystemLessonIds: string[] | undefined
): ScheduleImportRecheckOrigin | undefined {
  if (!note?.includes(recheckNotePrefix)) return undefined;
  // 反复复核过的备注会层层嵌套，最靠后的一段才是最原始的处理结果。
  const labels = Array.from(note.matchAll(/上次处理：(.+?)。/g)).map((match) => match[1].trim());
  const originalLabel = labels.reverse().find((label) => label !== resolutionStatusLabel("recheck_required"));
  if (!originalLabel) return undefined;
  const status = resolutionStatuses.find((candidate) => resolutionStatusLabel(candidate) === originalLabel);
  // 匹配不到说明上次根本没有人工处理过（备注里记的是对账状态），恢复成未处理即可。
  if (!status || status === "recheck_required") return { status: "unreviewed", linkedSystemLessonIds };
  const noteMatches = Array.from(note.matchAll(/上次备注：([\s\S]*?)(?=\s*上次关联 \d+ 节云端课。|\s*上次处理：|$)/g));
  const originalNote = noteMatches
    .map((match) => match[1].trim())
    .reverse()
    .find((value) => Boolean(value) && !value.includes(recheckNotePrefix));
  return { status, note: originalNote, linkedSystemLessonIds };
}

// 把一条被误标为「历史数据有更新」的记录恢复成复核前的处理结果。
export function restoreRecheckResolution(
  resolutions: ScheduleImportResolutionMap,
  key: string,
  row: ImportPreviewLesson
): { resolutions: ScheduleImportResolutionMap; restored: ScheduleImportRecheckOrigin } | undefined {
  const origin = recheckOriginForRestore(resolutions[key]);
  if (!origin) return undefined;
  const next = { ...resolutions };
  if (origin.status === "unreviewed" && !origin.note?.trim() && !origin.linkedSystemLessonIds?.length) {
    delete next[key];
    return { resolutions: next, restored: origin };
  }
  next[key] = {
    status: origin.status,
    note: origin.note,
    linkedSystemLessonIds: normalizeLinkedSystemLessonIds(origin.linkedSystemLessonIds),
    // 恢复即表示以当前数据为准，写入当前指纹，避免下次打开又被判为有变化。
    dataFingerprint: rowReviewFingerprint(row),
    updatedAt: new Date().toISOString()
  };
  return { resolutions: next, restored: origin };
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

// v2 只保留会影响对账结论的字段。教师/助教/教室、云端备注、以及各类学生姓名列表
// 都只用于展示，把它们算进指纹会让无关的云端改动频繁触发「历史数据有更新」。
// 版本号提升后，旧的 v1 指纹会被 validReviewFingerprint 判为无效，从而自动回退到
// 「按保存行重算」，不会因为换算法而把存量记录全部误标一次。
const reviewFingerprintPrefix = "review-v2:";
const reviewFingerprintPrefixPattern = /^review-v2:[0-9a-f]{16}$/;

export function rowReviewFingerprint(row: ImportPreviewLesson | ScheduleImportSavedRow): string {
  const payload = JSON.stringify([
    row.campusId ?? normalizeComparisonText(row.campusName),
    row.date,
    row.startTime,
    row.endTime,
    normalizeComparisonText(row.title),
    normalizeComparisonText(row.subjectHint),
    row.courseTypeHint,
    normalizeComparisonNameList(row.studentNameHint),
    row.presentCount ?? null,
    row.expectedCount ?? null,
    normalizeComparisonText(row.note ?? ""),
    row.matchedCourseId ?? row.mappedCourseId ?? "",
    row.systemLessonId ?? "",
    row.systemLessonStatus ?? "",
    row.systemActualPresentCount ?? null,
    row.systemPresentCount ?? null,
    row.systemExpectedCount ?? null,
    row.systemMakeupCompletedCount ?? null
  ]);
  return `${reviewFingerprintPrefix}${fnv1a64(payload)}`;
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
    const currentFingerprint = rowReviewFingerprint(row);
    const savedFingerprint = validReviewFingerprint(previousResolution?.dataFingerprint)
      ? previousResolution.dataFingerprint
      : rowReviewFingerprint(savedRow);
    if (currentFingerprint === savedFingerprint) {
      unchangedCount += 1;
      if (previousResolution) {
        resolutions[resolutionKey(row)] = {
          ...previousResolution,
          dataFingerprint: currentFingerprint
        };
        inheritedCount += 1;
      }
      return;
    }

    changedCount += 1;
    const origin = recheckOriginFor(previousResolution, savedRow);
    const previousLabel = origin
      ? resolutionStatusLabel(origin.status)
      : previousResolution
        ? resolutionStatusLabel(previousResolution.status)
        : statusLabel(savedRow.status as ImportMatchStatus);
    const noteParts = [
      "当前数据与上次保存结果不同，请重新核对。",
      `上次处理：${previousLabel}。`,
      origin?.note?.trim() ? `上次备注：${origin.note.trim()}` : "",
      origin?.linkedSystemLessonIds?.length ? `上次关联 ${origin.linkedSystemLessonIds.length} 节云端课。` : ""
    ].filter(Boolean);
    resolutions[resolutionKey(row)] = {
      status: "recheck_required",
      note: noteParts.join(" "),
      // 关联信息保留下来，否则拆分合并标记会连带影响工资统计口径。
      linkedSystemLessonIds: previousResolution?.linkedSystemLessonIds,
      // 记录当前数据的指纹，表示「已就这份数据提请复核」。存旧指纹会让下次比较
      // 必然再次判定为变化，从而永远退不出待复核状态。
      dataFingerprint: currentFingerprint,
      recheckOrigin: origin,
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

// 复核前的处理结果。已经处于待复核的行要沿用它自己的 recheckOrigin，
// 否则反复复核会把「上次处理：历史数据有更新」层层套进备注里。
function recheckOriginFor(
  previousResolution: ScheduleImportResolution | undefined,
  savedRow: ScheduleImportSavedRow
): ScheduleImportRecheckOrigin | undefined {
  if (previousResolution?.status === "recheck_required") return previousResolution.recheckOrigin;
  if (previousResolution) {
    return {
      status: previousResolution.status,
      note: previousResolution.note,
      linkedSystemLessonIds: previousResolution.linkedSystemLessonIds
    };
  }
  if (!savedRow.resolutionStatus || savedRow.resolutionStatus === "recheck_required") return undefined;
  return {
    status: savedRow.resolutionStatus,
    note: savedRow.resolutionNote,
    linkedSystemLessonIds: savedRow.linkedSystemLessonIds
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
    const exactSystemMatch = sameSystemLesson.find((index) => rowReviewFingerprint(savedRows[index]) === rowReviewFingerprint(row));
    if (exactSystemMatch !== undefined) return exactSystemMatch;
    if (sameSystemLesson.length === 1) return sameSystemLesson[0];
    const sameIdentity = sameSystemLesson.find((index) => rowIdentityKey(savedRows[index]) === rowIdentityKey(row));
    if (sameIdentity !== undefined) return sameIdentity;
  }
  const sameImportedLesson = availableIndexes.filter((index) => importedLessonIdentityKey(savedRows[index]) === importedLessonIdentityKey(row));
  if (sameImportedLesson.length === 1) return sameImportedLesson[0];
  return availableIndexes.find((index) => rowIdentityKey(savedRows[index]) === rowIdentityKey(row)) ?? -1;
}

function importedLessonIdentityKey(row: ImportPreviewLesson | ScheduleImportSavedRow): string {
  const campus = row.campusId ? `id:${row.campusId}` : `name:${normalizeComparisonText(row.campusName)}`;
  return [campus, row.date, row.startTime, row.endTime, normalizeComparisonText(row.title)].join("|");
}

function rowIdentityKey(row: ImportPreviewLesson | ScheduleImportSavedRow): string {
  const campus = row.campusId ? `id:${row.campusId}` : `name:${normalizeComparisonText(row.campusName)}`;
  const course = row.matchedCourseId || row.mappedCourseId
    ? `id:${row.matchedCourseId ?? row.mappedCourseId}`
    : `name:${normalizeComparisonText(row.title)}`;
  return [campus, row.date, row.startTime, row.endTime, course].join("|");
}

function validReviewFingerprint(value?: string): value is string {
  return Boolean(value && reviewFingerprintPrefixPattern.test(value));
}

function normalizeComparisonText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function normalizeComparisonNameList(value?: string): string {
  return (value ?? "")
    .split(/[、,，;；\n]+/)
    .map(normalizeComparisonText)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0");
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
