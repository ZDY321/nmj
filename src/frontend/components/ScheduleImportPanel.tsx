import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { ScheduleImportCalendarPanel } from "@/frontend/components/ScheduleImportCalendarPanel";
import { ScheduleImportHeaderPanel } from "@/frontend/components/ScheduleImportHeaderPanel";
import { ScheduleImportReconciliationRow } from "@/frontend/components/ScheduleImportReconciliationRow";
import { ScheduleImportSavedReviewsPanel } from "@/frontend/components/ScheduleImportSavedReviewsPanel";
import { ScheduleImportStatusControls } from "@/frontend/components/ScheduleImportStatusControls";
import type {
  Lesson,
  ScheduleImportResolution,
  ScheduleImportResolutionMap,
  ScheduleImportReviewRecord,
  ScheduleImportSavedRow,
  ScheduleImportVaultState,
  TeacherVault
} from "@/shared/types";
import { lessonBillableHoursForVault, payrollExcludedSplitMergeLessonIds, todayIso } from "@/frontend/lib/calculations";
import {
  calendarDates,
  orderedWeekdayLabels,
  sortCampusesForProfile,
  weekStartsOn
} from "@/frontend/lib/helpers";
import {
  buildImportPreview,
  downloadMergedScheduleWorkbook,
  mergeScheduleImportMappings,
  parseScheduleWorkbookFiles,
  scheduleImportMappingsForCourseIds,
  summarizeImportPreview,
  type ImportedScheduleLesson,
  type ImportPreviewLesson,
  type ScheduleImportMapping
} from "@/frontend/lib/scheduleImport";
import {
  applyCampusOverridesToLessons,
  applyResolutionToRow,
  buildDefaultCampusOverrides,
  buildLocalOnlyRows,
  buildNextScheduleImportState,
  buildScheduleImportStateWithoutReview,
  buildUpdatedResolutions,
  countResolutionsForRows,
  effectiveRowStatus,
  importPreviewLessonBillableHours,
  isReviewedResolution,
  latestScheduleImportReviewsByMonth,
  linkedSystemLessonIdsFromRows,
  linkedSystemLessonIdsFromResolutions,
  linkedSystemLessonSourcesFromRows,
  matchesImportRowFilters,
  mergeSavedReviewResolutions,
  openedScheduleImportReviewForMonths,
  readSavedMapping,
  readSavedWorkspace,
  resolutionExcludesImportStats,
  resolutionKey,
  resolutionMarksRowResolved,
  resolutionNeedsAttention,
  resolutionStatusLabel,
  savedReviewEffectiveCounts,
  savedScheduleImportReviewOverflowCount,
  savedScheduleImportReviewLimit,
  savedReviewTitle,
  resolutionsWithoutMonths,
  statusPillClass,
  splitMergePayrollExcludedLessonIds,
  summarizeFiles,
  summarizeScheduleImportImportedLessons,
  summarizeScheduleImportSystemLessons,
  writeSavedMapping,
  writeSavedWorkspace,
  type StatusFilter
} from "@/frontend/lib/scheduleImportReview";
import type { ScheduleImportSaveOptions } from "@/frontend/lib/scheduleImportArchive";

type ScheduleImportWorkspaceSnapshot = {
  rawLessons: ImportedScheduleLesson[];
  resolutions: ScheduleImportResolutionMap;
  fileCampusOverrides: ScheduleImportMapping;
  selectedMonth: string;
  selectedDate: string;
  campusFilter: string;
  statusFilter: StatusFilter;
  search: string;
};

export function ScheduleImportPanel({
  vault,
  onOpenLesson,
  onSuggestSchedule,
  onSaveScheduleImport,
  onOpenGuide,
  scheduleImportState,
  storageScope
}: {
  vault: TeacherVault;
  onOpenLesson?: (lesson: Lesson) => void;
  onSuggestSchedule?: (request: { date: string; startTime: string; endTime: string; courseGroupId?: string }) => void;
  onSaveScheduleImport?: (state: ScheduleImportVaultState, options?: ScheduleImportSaveOptions) => void;
  onOpenGuide?: () => void;
  scheduleImportState?: ScheduleImportVaultState | null;
  storageScope?: string;
}) {
  const savedWorkspace = useMemo(() => readSavedWorkspace(storageScope), [storageScope]);
  const persistedScheduleImport = scheduleImportState ?? vault.scheduleImport;
  const scheduleImportVault = useMemo<TeacherVault>(
    () => ({ ...vault, scheduleImport: persistedScheduleImport ?? undefined }),
    [persistedScheduleImport, vault]
  );
  const cloudMapping = useMemo(
    () => mergeScheduleImportMappings(vault, vault.scheduleImport?.mappings, persistedScheduleImport?.mappings),
    [persistedScheduleImport?.mappings, vault.campuses, vault.scheduleImport?.mappings]
  );
  const cloudResolutions = { ...(persistedScheduleImport?.resolutions ?? {}), ...(vault.scheduleImport?.resolutions ?? {}) };
  const savedMapping = useMemo(
    () => mergeScheduleImportMappings(vault, savedWorkspace.mapping, readSavedMapping(storageScope), cloudMapping),
    [cloudMapping, savedWorkspace.mapping, storageScope, vault.campuses]
  );
  const savedResolutions = useMemo(() => ({ ...cloudResolutions, ...savedWorkspace.resolutions }), [cloudResolutions, savedWorkspace.resolutions]);
  const [rawLessons, setRawLessons] = useState<ImportedScheduleLesson[]>(savedWorkspace.rawLessons);
  const [mapping, setMapping] = useState<ScheduleImportMapping>(savedMapping);
  const [historicalMapping, setHistoricalMapping] = useState<ScheduleImportMapping | null>(null);
  const [resolutions, setResolutions] = useState<ScheduleImportResolutionMap>(savedResolutions);
  const [fileCampusOverrides, setFileCampusOverrides] = useState<ScheduleImportMapping>(savedWorkspace.fileCampusOverrides);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(savedWorkspace.selectedMonth || todayIso().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(savedWorkspace.selectedDate || todayIso());
  const [campusFilter, setCampusFilter] = useState(savedWorkspace.campusFilter || "all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(savedWorkspace.statusFilter);
  const [search, setSearch] = useState(savedWorkspace.search);
  const [openedReviewId, setOpenedReviewId] = useState("");
  const calendarPanelRef = useRef<HTMLDivElement>(null);
  const workspaceBeforeHistoryRef = useRef<ScheduleImportWorkspaceSnapshot | null>(null);
  const { confirm, dialog } = useConfirmDialog();

  const campusOptions = useMemo(
    () => sortCampusesForProfile(vault.campuses, vault.profile.homeCampusId),
    [vault.campuses, vault.profile.homeCampusId]
  );
  const rawLessonMonths = useMemo(
    () => new Set(rawLessons.map((lesson) => lesson.date.slice(0, 7)).filter(Boolean)),
    [rawLessons]
  );
  const currentMonthCourseIds = useMemo(
    () => new Set(vault.lessons
      .filter((lesson) => rawLessonMonths.has(lesson.date.slice(0, 7)))
      .map((lesson) => lesson.courseGroupId)),
    [rawLessonMonths, vault.lessons]
  );
  const currentMapping = useMemo(
    () => rawLessonMonths.size > 0 ? scheduleImportMappingsForCourseIds(mapping, currentMonthCourseIds) : mapping,
    [currentMonthCourseIds, mapping, rawLessonMonths.size]
  );
  const previewMapping = historicalMapping ?? currentMapping;
  const importedRows = useMemo(
    () => buildImportPreview(vault, rawLessons, previewMapping, fileCampusOverrides),
    [fileCampusOverrides, previewMapping, rawLessons, vault]
  );
  const rows = useMemo(
    () => [...importedRows, ...buildLocalOnlyRows(vault, importedRows, rawLessons)],
    [importedRows, rawLessons, vault]
  );
  const linkedSystemLessonSources = useMemo(() => linkedSystemLessonSourcesFromRows(rows, resolutions), [resolutions, rows]);
  const linkedSystemLessonIds = useMemo(() => linkedSystemLessonIdsFromRows(rows, resolutions), [resolutions, rows]);
  const historicalLinkedSystemLessonIds = useMemo(() => linkedSystemLessonIdsFromResolutions(resolutions), [resolutions]);
  const staleLinkedSystemLessonIds = useMemo(
    () => new Set(Array.from(historicalLinkedSystemLessonIds).filter((lessonId) => !linkedSystemLessonIds.has(lessonId))),
    [historicalLinkedSystemLessonIds, linkedSystemLessonIds]
  );
  const existingSystemLessonIds = useMemo(() => new Set(vault.lessons.map((lesson) => lesson.id)), [vault.lessons]);
  const invalidSplitMergeRowKeys = useMemo(
    () => new Set(rows
      .filter((row) => {
        const linkedIds = resolutions[resolutionKey(row)]?.linkedSystemLessonIds ?? [];
        const hasCurrentDirectMatch = Boolean(row.systemLessonId && (row.status === "matched" || row.status === "attendance_mismatch"));
        if (hasCurrentDirectMatch) return false;
        const hasValidLinkedLesson = linkedIds.some((lessonId) => existingSystemLessonIds.has(lessonId));
        return !hasValidLinkedLesson && linkedIds.some((lessonId) => !existingSystemLessonIds.has(lessonId));
      })
      .map((row) => resolutionKey(row))
    ),
    [existingSystemLessonIds, resolutions, rows]
  );
  const splitMergeReviewLabel = (row: ImportPreviewLesson): string | undefined => {
    const rowKey = resolutionKey(row);
    const resolution = resolutions[rowKey];
    const isCurrentlyLinked = row.systemLessonId && linkedSystemLessonIds.has(row.systemLessonId);
    const isDirectMatched = row.status === "matched" || row.status === "attendance_mismatch";
    const hasValidCurrentLinkedLesson = Boolean(resolution?.linkedSystemLessonIds?.some((lessonId) => existingSystemLessonIds.has(lessonId)));
    const linkedSourceCount = row.systemLessonId
      ? linkedSystemLessonSources.filter((source) => source.lessonId === row.systemLessonId).length
      : 0;

    if (invalidSplitMergeRowKeys.has(rowKey)) return "拆分合并标记已失效";
    if (row.systemLessonId && staleLinkedSystemLessonIds.has(row.systemLessonId) && !isCurrentlyLinked && !isDirectMatched && !hasValidCurrentLinkedLesson) return "拆分合并标记已失效";
    if (resolution?.linkedSystemLessonIds?.length && row.systemLessonId && isDirectMatched) return "合并需复核";
    if (splitMergeLinkedLessonWarnings(vault, row, resolution).length > 0) return "关联需复核";
    if (resolution?.status === "split_merge_ok" && resolution.linkedSystemLessonIds?.length) return `合并到 ${resolution.linkedSystemLessonIds.length} 节云端课`;
    if (row.status === "import_missing" && isCurrentlyLinked && linkedSourceCount > 0) return `由 ${linkedSourceCount} 条教务课合并`;
    return undefined;
  };
  const effectiveRows = useMemo(
    () => rows.map((row) => applyResolutionToRow(row, resolutions[resolutionKey(row)], linkedSystemLessonIds)),
    [linkedSystemLessonIds, resolutions, rows]
  );
  const statisticRows = useMemo(
    () => effectiveRows.filter((row) => !resolutionExcludesImportStats(resolutions[resolutionKey(row)]?.status)),
    [effectiveRows, resolutions]
  );
  const splitMergeExcludedLessonIds = useMemo(() => {
    return combinedSplitMergeExcludedLessonIds(vault, scheduleImportVault, rows, resolutions);
  }, [resolutions, rows, scheduleImportVault, vault]);
  const summary = useMemo(() => summarizeImportPreview(statisticRows), [statisticRows]);
  const attentionRows = useMemo(
    () => rows.filter((row) =>
      effectiveRowStatus(row, resolutions[resolutionKey(row)], linkedSystemLessonIds) !== "matched" ||
      resolutionNeedsAttention(resolutions[resolutionKey(row)]?.status)
    ),
    [linkedSystemLessonIds, resolutions, rows]
  );
  const importedLessonStats = useMemo(
    () => summarizeScheduleImportImportedLessons(vault, importedRows, resolutions),
    [importedRows, resolutions, vault]
  );
  const systemLessonStats = useMemo(() => {
    return summarizeScheduleImportSystemLessons(vault, rows, resolutions, splitMergeExcludedLessonIds);
  }, [resolutions, rows, splitMergeExcludedLessonIds, vault]);
  const needsAttentionHours = useMemo(
    () => attentionRows.reduce((sum, row) => sum + scheduleImportRowHours(vault, row), 0),
    [attentionRows, vault]
  );
  const resolvedAsMatchedCount = useMemo(
    () => rows.filter((row) => {
      const status = resolutions[resolutionKey(row)]?.status;
      return row.status !== "matched" && !resolutionExcludesImportStats(status) && resolutionMarksRowResolved(status);
    }).length,
    [resolutions, rows]
  );
  const resolutionCounts = useMemo(() => countResolutionsForRows(rows, resolutions), [resolutions, rows]);
  const fileSummaries = useMemo(() => summarizeFiles(rawLessons), [rawLessons]);
  const monthOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.date.slice(0, 7)))).sort(),
    [rows]
  );
  const displayMonth = selectedMonth || monthOptions[0] || todayIso().slice(0, 7);
  const filteredRows = useMemo(() => rows.filter((row) => matchesImportRowFilters(row, {
    campusFilter,
    linkedSystemLessonIds,
    month: displayMonth,
    resolutions,
    search,
    statusFilter,
    vault
  })), [campusFilter, displayMonth, linkedSystemLessonIds, resolutions, rows, search, statusFilter, vault]);
  const selectedDateRows = filteredRows.filter((row) => row.date === selectedDate);
  const weekStartPreference = weekStartsOn(vault);
  const days = calendarDates(displayMonth, weekStartPreference);
  const weekdayLabels = orderedWeekdayLabels(weekStartPreference);
  const needsAttention = attentionRows.length;
  const savedReviews = useMemo(
    () => latestScheduleImportReviewsByMonth(persistedScheduleImport?.reviews ?? []),
    [persistedScheduleImport?.reviews]
  );
  const savedReviewLiveCounts = useMemo(
    () => new Map(savedReviews.map((review) => [review.id, liveSavedReviewEffectiveCounts(vault, review)])),
    [savedReviews, vault]
  );
  const reviewNeedsAttentionForDisplay = (review: ScheduleImportReviewRecord): number =>
    needsAttentionFromSavedReviewCounts(savedReviewLiveCounts.get(review.id) ?? savedReviewEffectiveCounts(review));

  useEffect(() => {
    setMapping((current) => mergeScheduleImportMappings(vault, current, cloudMapping));
    setResolutions((current) => ({ ...cloudResolutions, ...current }));
  }, [cloudMapping, vault.campuses]);

  useEffect(() => {
    if (monthOptions.length === 0) return;
    if (!monthOptions.includes(selectedMonth)) {
      setSelectedMonth(monthOptions[0]);
    }
  }, [monthOptions, selectedMonth]);

  useEffect(() => {
    if (!selectedDate.startsWith(displayMonth)) {
      setSelectedDate(`${displayMonth}-01`);
    }
  }, [displayMonth, selectedDate]);

  useEffect(() => {
    if (openedReviewId) return;
    writeSavedMapping(storageScope, mapping);
    writeSavedWorkspace(storageScope, {
      rawLessons,
      mapping,
      resolutions,
      fileCampusOverrides,
      selectedMonth,
      selectedDate,
      campusFilter,
      statusFilter,
      search,
      savedAt: new Date().toISOString()
    });
  }, [campusFilter, fileCampusOverrides, mapping, openedReviewId, rawLessons, resolutions, search, selectedDate, selectedMonth, statusFilter, storageScope]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setLoading(true);
    setMessage("正在解析教务 Excel...");
    try {
      const parsed = await parseScheduleWorkbookFiles(files);
      const parsedMonths = new Set(parsed.map((lesson) => lesson.date.slice(0, 7)));
      const openedMatchingReview = rawLessons.length > 0
        ? openedScheduleImportReviewForMonths(savedReviews, openedReviewId, parsedMonths)
        : undefined;
      if (parsed.length > 0 && openedMatchingReview) {
        const matchingReviews = [openedMatchingReview];
        const monthLabel = openedMatchingReview.month;
        setMessage(`检测到当前正在查看 ${monthLabel} 的已保存对账，请选择导入方式。`);
        confirm({
          title: "更新正在查看的已保存对账？",
          description: `当前正在查看「${savedReviewTitle(openedMatchingReview)}」。新 Excel 会替换下方 ${monthLabel} 的当前对账数据；继承导入会保留相同课节的原处理结果，并将发生变化的课节标为待复核。作为全新对账则不会继承逐课处理结果。`,
          confirmLabel: "继承并导入",
          secondaryLabel: "作为全新对账",
          cancelLabel: "取消",
          onConfirm: () => applyParsedFiles(parsed, matchingReviews, "inherit"),
          onSecondary: () => applyParsedFiles(parsed, matchingReviews, "fresh")
        });
        return;
      }
      applyParsedFiles(parsed, [], "append");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "课表解析失败。");
    } finally {
      setLoading(false);
    }
  }

  function applyParsedFiles(
    parsed: ImportedScheduleLesson[],
    matchingReviews: ScheduleImportReviewRecord[],
    mode: "append" | "inherit" | "fresh"
  ) {
      const leavingHistoricalReview = Boolean(openedReviewId);
      const sourceRawLessons = leavingHistoricalReview ? [] : rawLessons;
      const sourceResolutions = leavingHistoricalReview ? {} : resolutions;
      const sourceFileCampusOverrides = leavingHistoricalReview ? {} : fileCampusOverrides;
      const parsedFileNames = new Set(parsed.map((lesson) => lesson.fileName));
      const parsedMonths = new Set(parsed.map((lesson) => lesson.date.slice(0, 7)));
      const retainedRawLessons = mode === "append"
        ? sourceRawLessons.filter((lesson) => !parsedFileNames.has(lesson.fileName))
        : sourceRawLessons.filter((lesson) => !parsedMonths.has(lesson.date.slice(0, 7)));
      const nextRawLessons = [...retainedRawLessons, ...parsed]
        .sort((a, b) => `${a.date} ${a.startTime} ${a.campusName}`.localeCompare(`${b.date} ${b.startTime} ${b.campusName}`));
      const inheritedMapping = mode === "inherit"
        ? matchingReviews.reduce<ScheduleImportMapping>((result, review) => ({ ...result, ...review.mapping }), {})
        : {};
      const nextMapping = { ...inheritedMapping, ...mapping };
      const inferredOverrides = mode === "inherit"
        ? inheritSavedReviewCampusOverrides(parsed, matchingReviews, sourceFileCampusOverrides)
        : sourceFileCampusOverrides;
      const builtOverrides = buildDefaultCampusOverrides(vault, nextRawLessons, inferredOverrides);
      const activeFileNames = new Set(nextRawLessons.map((lesson) => lesson.fileName));
      const nextOverrides = Object.fromEntries(Object.entries(builtOverrides).filter(([fileName]) => activeFileNames.has(fileName)));

      let nextResolutions = mode === "append"
        ? { ...sourceResolutions }
        : resolutionsWithoutMonths(sourceResolutions, parsedMonths);
      let unchangedCount = 0;
      let inheritedCount = 0;
      let changedCount = 0;
      let newCount = 0;
      let removedCount = 0;
      if (mode === "inherit") {
        const nextImportedRows = buildImportPreview(vault, nextRawLessons, nextMapping, nextOverrides);
        const nextRows = [...nextImportedRows, ...buildLocalOnlyRows(vault, nextImportedRows, nextRawLessons)];
        matchingReviews.forEach((review) => {
          const merge = mergeSavedReviewResolutions(
            review,
            nextRows.filter((row) => row.date.startsWith(review.month)),
            nextResolutions
          );
          nextResolutions = merge.resolutions;
          unchangedCount += merge.unchangedCount;
          inheritedCount += merge.inheritedCount;
          changedCount += merge.changedCount;
          newCount += merge.newCount;
          removedCount += merge.removedCount;
        });
      }

      setRawLessons(nextRawLessons);
      setMapping(nextMapping);
      setHistoricalMapping(null);
      setResolutions(nextResolutions);
      setFileCampusOverrides(nextOverrides);
      setOpenedReviewId("");
      workspaceBeforeHistoryRef.current = null;
      setCampusFilter("all");
      setStatusFilter("all");
      setSearch("");
      if (parsed[0]?.date) {
        setSelectedMonth(parsed[0].date.slice(0, 7));
        setSelectedDate(parsed[0].date);
      }
      if (parsed.length === 0) {
        setMessage("没有从文件中解析到课节，请确认是否为校宝导出的 .xls/.xlsx。");
      } else if (mode === "inherit") {
        setMessage(`已继续本月对账：识别相同 ${unchangedCount} 节，继承处理 ${inheritedCount} 节；数据有变化 ${changedCount} 节待复核，新增 ${newCount} 节，上次有 ${removedCount} 节本次未出现。`);
      } else if (mode === "fresh") {
        setMessage(`已将 ${Array.from(parsedMonths).join("、")} 的 ${parsed.length} 节课作为全新对账导入，原逐课处理结果未继承；保存后会更新该月记录。`);
      } else {
        setMessage(`已加入 ${parsedFileNames.size} 个文件、${parsed.length} 节教务 Excel 课节；当前共 ${nextRawLessons.length} 节。`);
      }
      focusCalendarPanel();
    }

  function applyStatusFilter(nextStatus: Exclude<StatusFilter, "all">) {
    const effectiveStatus: StatusFilter = statusFilter === nextStatus ? "all" : nextStatus;
    setStatusFilter(effectiveStatus);
    const currentDateStillHasRows = rows.some((row) =>
      row.date === selectedDate &&
      matchesImportRowFilters(row, { campusFilter, linkedSystemLessonIds, month: displayMonth, resolutions, search, statusFilter: effectiveStatus, vault })
    );
    if (currentDateStillHasRows) return;
    const firstRow = rows.find((row) =>
      matchesImportRowFilters(row, { campusFilter, linkedSystemLessonIds, month: displayMonth, resolutions, search, statusFilter: effectiveStatus, vault })
    );
    if (firstRow) {
      setSelectedDate(firstRow.date);
    }
  }

  function updateFileCampus(fileName: string, campusId: string) {
    if (openedReviewId) {
      setMessage("历史对账正在以只读快照查看；退出历史查看后再修改校区。");
      return;
    }
    setFileCampusOverrides((current) => ({ ...current, [fileName]: campusId }));
  }

  function removeImportedFile(fileName: string) {
    if (openedReviewId) {
      setMessage("历史对账正在以只读快照查看；退出历史查看后再移除文件。");
      return;
    }
    const removedResolutionKeys = new Set(rows.filter((row) => row.fileName === fileName).map((row) => resolutionKey(row)));
    setRawLessons((current) => current.filter((lesson) => lesson.fileName !== fileName));
    setFileCampusOverrides((current) => {
      const next = { ...current };
      delete next[fileName];
      return next;
    });
    setResolutions((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !removedResolutionKeys.has(key))));
    setMessage(`已移除「${fileName}」。`);
  }

  function updateResolution(row: ImportPreviewLesson, patch: Partial<Pick<ScheduleImportResolution, "status" | "note" | "linkedSystemLessonIds">>) {
    if (openedReviewId) {
      setMessage("历史对账正在以只读快照查看，不会修改当前映射或处理标记。请先退出历史查看，或重新导入 Excel 继续对账。");
      return;
    }
    const key = resolutionKey(row);
    const nextResolutions = buildUpdatedResolutions(resolutions, key, patch);
    const nextSplitMergeExcludedLessonIds = combinedSplitMergeExcludedLessonIds(vault, scheduleImportVault, rows, nextResolutions);
    setResolutions(nextResolutions);
    if (patch.status) {
      onSaveScheduleImport?.(
        buildScheduleImportStateWithoutReview(scheduleImportVault, mapping, nextResolutions, nextSplitMergeExcludedLessonIds),
        { syncReviewArchive: false }
      );
      const label = resolutionStatusLabel(patch.status);
      setMessage(
        resolutionExcludesImportStats(patch.status)
          ? `已标为「${label}」，这条教务课不会计入顶部教务导入节数和小时。`
          : resolutionMarksRowResolved(patch.status)
          ? `已标为「${label}」，这条差异已计入已对应，顶部统计和状态筛选已更新。`
          : `已标为「${label}」，这条差异仍保留在待核对统计中。`
      );
    }
  }

  function performSaveMapping(afterSave?: () => void) {
    const savedMappingOk = writeSavedMapping(storageScope, mapping);
    const savedWorkspaceOk = writeSavedWorkspace(storageScope, {
      rawLessons,
      mapping,
      resolutions,
      fileCampusOverrides,
      selectedMonth,
      selectedDate,
      campusFilter,
      statusFilter,
      search,
      savedAt: new Date().toISOString()
    });
    const nextScheduleImport = buildNextScheduleImportState(scheduleImportVault, {
      rawLessons,
      mapping,
      resolutions,
      fileCampusOverrides,
      selectedMonth: displayMonth,
      selectedDate,
      rows,
      summary,
      splitMergeExcludedLessonIds
    });
    onSaveScheduleImport?.(nextScheduleImport);
    setOpenedReviewId(nextScheduleImport.reviews[0]?.id ?? "");
    setMessage(
      savedMappingOk && savedWorkspaceOk && onSaveScheduleImport
        ? `${displayMonth} 对账结果已更新；课程映射和逐课处理已保存到云端加密档案。`
        : savedMappingOk && savedWorkspaceOk
          ? "课程映射和当前对账现场已保存到本机浏览器。"
          : "保存失败：浏览器本地存储空间可能不足，请减少导入文件后再试。"
    );
    afterSave?.();
  }

  function requestSaveMapping(afterSave?: () => void) {
    if (openedReviewId) {
      setMessage("历史对账是只读快照，不能直接覆盖当前对账。请重新导入 Excel 继续本月对账后再保存。");
      return;
    }
    const overflowCount = savedScheduleImportReviewOverflowCount(savedReviews, displayMonth);
    if (overflowCount > 0) {
      const deletedReviews = savedReviews
        .filter((review) => review.month !== displayMonth)
        .slice(savedScheduleImportReviewLimit - 1);
      const oldestReview = deletedReviews[deletedReviews.length - 1] ?? savedReviews[savedReviews.length - 1];
      const deleteCountText = overflowCount === 1 ? "最早的一条保存记录" : `最早的 ${overflowCount} 条保存记录`;
      const oldestReviewText = oldestReview
        ? overflowCount === 1
          ? `：「${savedReviewTitle(oldestReview)}」`
          : `，其中最早一条是「${savedReviewTitle(oldestReview)}」`
        : "";
      confirm({
        title: "保存新的对账记录？",
        description: `每月只保留一份对账结果，当前最多保留最近 ${savedScheduleImportReviewLimit} 个月。继续保存会删除${deleteCountText}${oldestReviewText}。`,
        confirmLabel: "继续保存",
        cancelLabel: "取消",
        onConfirm: () => performSaveMapping(afterSave)
      });
      return;
    }
    performSaveMapping(afterSave);
  }

  function saveMapping() {
    requestSaveMapping();
  }

  function deleteSavedReview(review: ScheduleImportReviewRecord) {
    const previous = persistedScheduleImport;
    if (!previous) return;
    const nextReviews = previous.reviews.filter((item) => item.month !== review.month);
    onSaveScheduleImport?.({
      mappings: { ...(previous.mappings ?? {}) },
      resolutions: { ...(previous.resolutions ?? {}) },
      reviews: nextReviews,
      splitMergeExcludedLessonIds: previous.splitMergeExcludedLessonIds ?? [],
      updatedAt: new Date().toISOString()
    });
    if (openedReviewId === review.id) {
      restoreWorkspaceAfterHistory("已删除这个月保存的对账结果，并返回之前的对账现场；当前课程映射没有改变。");
      return;
    }
    setMessage("已删除这个月保存的对账结果，当前课程映射和差异标注仍保留。");
  }

  function focusCalendarPanel() {
    window.requestAnimationFrame(() => {
      calendarPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function loadSavedReviewIntoWorkspace(review: ScheduleImportReviewRecord) {
    const nextRawLessons = rawLessonsFromSavedReview(review);
    if (nextRawLessons.length === 0) {
      setMessage("这条保存的对账没有可恢复的教务 Excel 课节，无法导入到核对列表。");
      return;
    }
    if (!workspaceBeforeHistoryRef.current) {
      workspaceBeforeHistoryRef.current = {
        rawLessons: [...rawLessons],
        resolutions: { ...resolutions },
        fileCampusOverrides: { ...fileCampusOverrides },
        selectedMonth,
        selectedDate,
        campusFilter,
        statusFilter,
        search
      };
    }
    const nextHistoricalMapping = { ...(review.mapping ?? {}) };
    const reviewResolutions = review.resolutions && Object.keys(review.resolutions).length > 0
      ? { ...review.resolutions }
      : resolutionsFromSavedReviewRows(review.rows);
    const nextFileCampusOverrides = { ...(review.fileCampusOverrides ?? {}) };
    const nextSelectedMonth = review.month || nextRawLessons[0]?.date.slice(0, 7) || todayIso().slice(0, 7);
    const nextSelectedDate = review.selectedDate || nextRawLessons[0]?.date || `${nextSelectedMonth}-01`;

    setRawLessons(nextRawLessons);
    setHistoricalMapping(nextHistoricalMapping);
    setResolutions(reviewResolutions);
    setFileCampusOverrides(nextFileCampusOverrides);
    setSelectedMonth(nextSelectedMonth);
    setSelectedDate(nextSelectedDate);
    setCampusFilter("all");
    setStatusFilter("all");
    setSearch("");
    setOpenedReviewId(review.id);

    setMessage(`正在只读查看「${savedReviewTitle(review)}」的历史快照，已切换到 ${nextSelectedMonth}；当时的映射不会恢复到当前规则。`);
    focusCalendarPanel();
  }

  function restoreWorkspaceAfterHistory(nextMessage = "已退出历史查看，并返回之前的对账现场；当前课程映射没有改变。") {
    const previous = workspaceBeforeHistoryRef.current ?? readSavedWorkspace(storageScope);
    setRawLessons([...previous.rawLessons]);
    setResolutions({ ...previous.resolutions });
    setFileCampusOverrides({ ...previous.fileCampusOverrides });
    setSelectedMonth(previous.selectedMonth || todayIso().slice(0, 7));
    setSelectedDate(previous.selectedDate || todayIso());
    setCampusFilter(previous.campusFilter || "all");
    setStatusFilter(previous.statusFilter || "all");
    setSearch(previous.search || "");
    setHistoricalMapping(null);
    setOpenedReviewId("");
    workspaceBeforeHistoryRef.current = null;
    setMessage(nextMessage);
  }

  function openSavedReviewInCalendar(review: ScheduleImportReviewRecord) {
    if (openedReviewId === review.id) {
      const nextMonth = review.month || todayIso().slice(0, 7);
      setSelectedMonth(nextMonth);
      setSelectedDate(review.selectedDate || `${nextMonth}-01`);
      setCampusFilter("all");
      setStatusFilter("all");
      setSearch("");
      setMessage(`正在下方日历中查看「${savedReviewTitle(review)}」。`);
      focusCalendarPanel();
      return;
    }

    if (openedReviewId) {
      loadSavedReviewIntoWorkspace(review);
      return;
    }

    if (rawLessons.length === 0) {
      loadSavedReviewIntoWorkspace(review);
      return;
    }

    confirm({
      title: "临时查看保存的对账？",
      description: `下方日历当前有 ${rawLessons.length} 节教务对账数据。打开「${savedReviewTitle(review)}」后会临时切换到 ${review.month} 的只读快照；退出历史查看时会恢复当前现场，历史映射不会写回当前规则。`,
      confirmLabel: "打开历史快照",
      secondaryLabel: "保存当前后打开",
      cancelLabel: "取消",
      onSecondary: () => requestSaveMapping(() => loadSavedReviewIntoWorkspace(review)),
      onConfirm: () => loadSavedReviewIntoWorkspace(review)
    });
  }

  function clearImport() {
    if (openedReviewId) {
      restoreWorkspaceAfterHistory();
      return;
    }
    setOpenedReviewId("");
    setHistoricalMapping(null);
    setRawLessons([]);
    setFileCampusOverrides({});
    setResolutions({});
    setMessage("");
    setSearch("");
    setStatusFilter("all");
    setCampusFilter("all");
  }

  async function downloadMergedSchedule() {
    if (rawLessons.length === 0) return;
    try {
      const summary = await downloadMergedScheduleWorkbook(applyCampusOverridesToLessons(vault, rawLessons, fileCampusOverrides));
      setMessage(`已合并导出 ${summary.fileCount} 个文件、${summary.dayCount} 天、${summary.lessonCount} 节；实际开课 ${summary.actualLessonCount} 节，有学生未到 ${summary.absentLessonCount} 节。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "合并导出失败，请重新选择教务 Excel 后再试。");
    }
  }

  return (
    <Card className="overflow-hidden border-2 border-[#bfdbfe]">
      <CardContent className="space-y-4">
        <ScheduleImportHeaderPanel
          rawLessonCount={rawLessons.length}
          rowCount={rows.length}
          loading={loading}
          summary={summary}
          fileSummaries={fileSummaries}
          monthCount={monthOptions.length}
          campusOptions={campusOptions}
          fileCampusOverrides={fileCampusOverrides}
          message={message}
          onFilesSelected={(files) => void handleFiles(files)}
          onSave={saveMapping}
          onExport={downloadMergedSchedule}
          onClear={clearImport}
          onRemoveFile={removeImportedFile}
          onFileCampusChange={updateFileCampus}
          onOpenGuide={onOpenGuide}
        />

        <ScheduleImportSavedReviewsPanel
          reviews={savedReviews}
          openedReviewId={openedReviewId}
          reviewTitle={savedReviewTitle}
          reviewNeedsAttention={reviewNeedsAttentionForDisplay}
          onOpenReview={openSavedReviewInCalendar}
          onCloseReview={() => restoreWorkspaceAfterHistory()}
          onDeleteReview={(review) => {
            confirm({
              title: "删除保存的对账结果？",
              description: "删除后会移除这个月保存的对账结果；课程映射和差异标注会继续保留。",
              confirmLabel: "删除",
              cancelLabel: "取消",
              tone: "danger",
              onConfirm: () => deleteSavedReview(review)
            });
          }}
        />

        <ScheduleImportStatusControls
          summary={summary}
          resolvedAsMatchedCount={resolvedAsMatchedCount}
          resolutionCounts={resolutionCounts}
          rawImportedLessonCount={importedLessonStats.rawCount}
          rawImportedLessonHours={importedLessonStats.rawHours}
          importedLessonCount={importedLessonStats.count}
          importedLessonHours={importedLessonStats.hours}
          excludedImportedLessonCount={importedLessonStats.excludedCount}
          excludedImportedLessonHours={importedLessonStats.excludedHours}
          cancelledImportedLessonCount={importedLessonStats.cancelledExcludedCount}
          cancelledImportedLessonHours={importedLessonStats.cancelledExcludedHours}
          absentImportedLessonCount={importedLessonStats.absentExcludedCount}
          absentImportedLessonHours={importedLessonStats.absentExcludedHours}
          systemLessonCount={systemLessonStats.count}
          systemLessonHours={systemLessonStats.hours}
          systemCompletedLessonCount={systemLessonStats.completedCount}
          systemCompletedLessonHours={systemLessonStats.completedHours}
          needsAttention={needsAttention}
          needsAttentionHours={needsAttentionHours}
          selectedMonth={displayMonth}
          campusFilter={campusFilter}
          statusFilter={statusFilter}
          search={search}
          campusOptions={campusOptions}
          onStatusToggle={applyStatusFilter}
          onMonthChange={setSelectedMonth}
          onCampusChange={setCampusFilter}
          onStatusChange={setStatusFilter}
          onSearchChange={setSearch}
        />

        <div ref={calendarPanelRef} className="scroll-mt-4">
          <ScheduleImportCalendarPanel
            vault={vault}
            days={days}
            weekdayLabels={weekdayLabels}
            displayMonth={displayMonth}
            selectedDate={selectedDate}
            filteredRows={filteredRows}
            selectedDateRows={selectedDateRows}
            resolutions={resolutions}
            linkedSystemLessonIds={linkedSystemLessonIds}
            onDateSelect={setSelectedDate}
            effectiveRowStatus={effectiveRowStatus}
            resolutionKey={resolutionKey}
            isReviewedResolution={isReviewedResolution}
            statusPillClass={statusPillClass}
            rowAttentionLabel={splitMergeReviewLabel}
            renderRow={(row) => (
              <ScheduleImportReconciliationRow
                key={row.id}
                row={row}
                vault={vault}
                resolution={resolutions[resolutionKey(row)]}
                linkedSystemLessonIds={linkedSystemLessonIds}
                linkedBySources={row.systemLessonId ? linkedSystemLessonSources.filter((source) => source.lessonId === row.systemLessonId) : []}
                staleLinkedByPreviousResolution={Boolean(row.systemLessonId && staleLinkedSystemLessonIds.has(row.systemLessonId))}
                invalidLinkedSystemLessonIds={(() => {
                  const linkedIds = resolutions[resolutionKey(row)]?.linkedSystemLessonIds ?? [];
                  const hasCurrentDirectMatch = Boolean(row.systemLessonId && (row.status === "matched" || row.status === "attendance_mismatch"));
                  if (hasCurrentDirectMatch) return [];
                  return linkedIds.some((lessonId) => existingSystemLessonIds.has(lessonId)) ? [] : linkedIds.filter((lessonId) => !existingSystemLessonIds.has(lessonId));
                })()}
                onResolutionChange={(patch) => updateResolution(row, patch)}
                onOpenLesson={onOpenLesson}
                onSuggestSchedule={onSuggestSchedule}
              />
            )}
          />
        </div>
      </CardContent>
      {dialog}
    </Card>
  );
}

function scheduleImportRowHours(vault: TeacherVault, row: ImportPreviewLesson): number {
  if (row.status === "import_missing" && row.systemLessonId) {
    const lesson = vault.lessons.find((item) => item.id === row.systemLessonId);
    if (lesson) return lessonBillableHoursForVault(vault, lesson);
  }
  return importPreviewLessonBillableHours(vault, row);
}

function splitMergeLinkedLessonWarnings(vault: TeacherVault, row: ImportPreviewLesson, resolution?: ScheduleImportResolution): string[] {
  const linkedLessons = (resolution?.linkedSystemLessonIds ?? [])
    .map((lessonId) => vault.lessons.find((lesson) => lesson.id === lessonId))
    .filter((lesson): lesson is Lesson => Boolean(lesson));
  return linkedLessons.flatMap((lesson) => splitMergeLinkedLessonWarningsForLesson(vault, row, lesson));
}

function splitMergeLinkedLessonWarningsForLesson(vault: TeacherVault, row: ImportPreviewLesson, lesson: Lesson): string[] {
  const warnings: string[] = [];
  const rowCourseId = row.matchedCourseId ?? row.mappedCourseId;
  const linkedCourse = vault.courseGroups.find((course) => course.id === lesson.courseGroupId);
  const linkedCampusId = lesson.campusId ?? linkedCourse?.defaultCampusId;
  if (row.campusId && linkedCampusId && row.campusId !== linkedCampusId) warnings.push("校区不同");
  if (rowCourseId && lesson.courseGroupId !== rowCourseId) {
    const linkedCourseName = normalizeReviewText(linkedCourse?.name ?? "");
    const rowTitle = normalizeReviewText(row.title);
    const subjectMatches = Boolean(row.subjectHint && linkedCourse?.subject && normalizeReviewText(row.subjectHint) === normalizeReviewText(linkedCourse.subject));
    const titleMatches = Boolean(linkedCourseName && rowTitle && (rowTitle.includes(linkedCourseName) || linkedCourseName.includes(rowTitle)));
    if (!subjectMatches && !titleMatches) warnings.push("课程/科目不同");
  }
  const dateDistance = Math.abs(daysBetween(row.date, lesson.date));
  if (dateDistance > 3) warnings.push(`日期相差 ${dateDistance} 天`);
  const gap = timeGapMinutes(row, lesson);
  if (gap > 60) warnings.push(`时间相差 ${Math.round(gap)} 分钟`);
  return warnings;
}

function normalizeReviewText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function daysBetween(a: string, b: string): number {
  const first = new Date(`${a}T00:00:00`).getTime();
  const second = new Date(`${b}T00:00:00`).getTime();
  if (Number.isNaN(first) || Number.isNaN(second)) return 999;
  return Math.round((first - second) / 86400000);
}

function minutesForTime(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
}

function timeGapMinutes(row: Pick<ImportPreviewLesson, "startTime" | "endTime">, lesson: Pick<Lesson, "startTime" | "endTime">): number {
  const rowStart = minutesForTime(row.startTime);
  const rowEnd = minutesForTime(row.endTime);
  const lessonStart = minutesForTime(lesson.startTime);
  const lessonEnd = minutesForTime(lesson.endTime);
  if (rowStart <= lessonEnd && lessonStart <= rowEnd) return 0;
  return Math.min(Math.abs(rowStart - lessonEnd), Math.abs(lessonStart - rowEnd));
}

function combinedSplitMergeExcludedLessonIds(
  vault: TeacherVault,
  scheduleImportVault: TeacherVault,
  rows: ImportPreviewLesson[],
  resolutions: ScheduleImportResolutionMap
): string[] {
  const lessonIds = new Set(splitMergePayrollExcludedLessonIds(vault, rows, resolutions));
  const months = Array.from(new Set(rows.map((row) => row.date.slice(0, 7))));
  months.forEach((month) => {
    payrollExcludedSplitMergeLessonIds(scheduleImportVault, month).forEach((lessonId) => lessonIds.add(lessonId));
  });
  return Array.from(lessonIds);
}

function rawLessonsFromSavedReview(review: ScheduleImportReviewRecord): ImportedScheduleLesson[] {
  const seen = new Set<string>();
  return review.rows
    .filter((row) => row.fileName !== "云端课表" && !row.id.startsWith("local-only-"))
    .flatMap((row) => {
      const key = [row.id, row.fileName, row.date, row.startTime, row.endTime, row.title].join("|");
      if (seen.has(key)) return [];
      seen.add(key);
      return [{
        id: row.id,
        fileName: row.fileName,
        campusName: row.campusName,
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
        rawText: row.rawText ?? "",
        warnings: row.warnings ?? []
      }];
    });
}

function inheritSavedReviewCampusOverrides(
  parsed: ImportedScheduleLesson[],
  reviews: ScheduleImportReviewRecord[],
  currentOverrides: ScheduleImportMapping
): ScheduleImportMapping {
  const next = { ...currentOverrides };
  const lessonsByFile = new Map<string, ImportedScheduleLesson[]>();
  parsed.forEach((lesson) => {
    const lessons = lessonsByFile.get(lesson.fileName) ?? [];
    lessons.push(lesson);
    lessonsByFile.set(lesson.fileName, lessons);
  });
  lessonsByFile.forEach((lessons, fileName) => {
    if (next[fileName]) return;
    const months = new Set(lessons.map((lesson) => lesson.date.slice(0, 7)));
    const campusIds = new Set(reviews
      .filter((review) => months.has(review.month))
      .flatMap((review) => review.rows)
      .filter((row) => row.fileName !== "云端课表" && Boolean(row.campusId))
      .map((row) => row.campusId as string));
    if (campusIds.size === 1) next[fileName] = Array.from(campusIds)[0];
  });
  return next;
}

function liveSavedReviewEffectiveCounts(vault: TeacherVault, review: ScheduleImportReviewRecord): ReturnType<typeof savedReviewEffectiveCounts> {
  const rawLessons = rawLessonsFromSavedReview(review);
  if (rawLessons.length === 0) return savedReviewEffectiveCounts(review);
  const previewRows = buildImportPreview(vault, rawLessons, review.mapping ?? {}, review.fileCampusOverrides ?? {});
  const rows = [...previewRows, ...buildLocalOnlyRows(vault, previewRows, rawLessons)];
  const resolutions = review.resolutions && Object.keys(review.resolutions).length > 0
    ? review.resolutions
    : resolutionsFromSavedReviewRows(review.rows);
  const linkedSystemLessonIds = linkedSystemLessonIdsFromRows(rows, resolutions);
  const effectiveRows = rows.map((row) => applyResolutionToRow(row, resolutions[resolutionKey(row)], linkedSystemLessonIds));
  const statisticRows = effectiveRows.filter((row) => {
    const resolutionStatus = resolutions[resolutionKey(row)]?.status;
    return !resolutionExcludesImportStats(resolutionStatus) && resolutionStatus !== "recheck_required";
  });
  const summary = summarizeImportPreview(statisticRows);
  return {
    matched: summary.matched,
    attendanceMismatch: summary.attendanceMismatch,
    timeMismatch: summary.timeMismatch,
    courseMismatch: summary.courseMismatch,
    systemMissing: summary.systemMissing,
    importMissing: summary.importMissing,
    needsMapping: summary.needsMapping,
    recheckRequired: rows.filter((row) => resolutions[resolutionKey(row)]?.status === "recheck_required").length
  };
}

function needsAttentionFromSavedReviewCounts(counts: ReturnType<typeof savedReviewEffectiveCounts>): number {
  return counts.attendanceMismatch + counts.timeMismatch + counts.courseMismatch + counts.systemMissing + counts.importMissing + counts.needsMapping + counts.recheckRequired;
}

function resolutionsFromSavedReviewRows(rows: ScheduleImportSavedRow[]): ScheduleImportResolutionMap {
  return Object.fromEntries(rows.flatMap((row) => {
    if (!row.resolutionStatus || row.resolutionStatus === "unreviewed") return [];
    return [[resolutionKeyForSavedRow(row), {
      status: row.resolutionStatus,
      note: row.resolutionNote,
      linkedSystemLessonIds: row.linkedSystemLessonIds,
      updatedAt: row.resolutionUpdatedAt ?? new Date().toISOString()
    } satisfies ScheduleImportResolution]];
  }));
}

function resolutionKeyForSavedRow(row: ScheduleImportSavedRow): string {
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
