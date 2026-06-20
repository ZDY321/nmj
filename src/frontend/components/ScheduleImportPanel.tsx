import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { ScheduleImportCalendarPanel } from "@/frontend/components/ScheduleImportCalendarPanel";
import { ScheduleImportHeaderPanel } from "@/frontend/components/ScheduleImportHeaderPanel";
import { ScheduleImportReconciliationRow } from "@/frontend/components/ScheduleImportReconciliationRow";
import { ScheduleImportSavedReviewRows } from "@/frontend/components/ScheduleImportSavedReviewRows";
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
import { todayIso } from "@/frontend/lib/calculations";
import {
  calendarDates,
  orderedWeekdayLabels,
  sortCampusesForProfile,
  sortCoursesByName,
  weekStartsOn
} from "@/frontend/lib/helpers";
import {
  buildImportPreview,
  downloadMergedScheduleWorkbook,
  importMappingKey,
  parseScheduleWorkbookFiles,
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
  formatSavedReviewAmount,
  formatSavedReviewNumber,
  isReviewedResolution,
  linkedSystemLessonIdsFromRows,
  linkedSystemLessonIdsFromResolutions,
  linkedSystemLessonSourcesFromRows,
  matchesImportRowFilters,
  readSavedMapping,
  readSavedWorkspace,
  resolutionKey,
  resolutionMarksRowResolved,
  resolutionStatusLabel,
  savedReviewEffectiveCounts,
  savedReviewTitle,
  statusPillClass,
  summarizeFiles,
  writeSavedMapping,
  writeSavedWorkspace,
  type StatusFilter
} from "@/frontend/lib/scheduleImportReview";

export function ScheduleImportPanel({
  vault,
  amountsVisible = false,
  onOpenLesson,
  onSuggestSchedule,
  onSaveScheduleImport,
  storageScope
}: {
  vault: TeacherVault;
  amountsVisible?: boolean;
  onOpenLesson?: (lesson: Lesson) => void;
  onSuggestSchedule?: (request: { date: string; startTime: string; endTime: string; courseGroupId?: string }) => void;
  onSaveScheduleImport?: (state: ScheduleImportVaultState) => void;
  storageScope?: string;
}) {
  const savedWorkspace = useMemo(() => readSavedWorkspace(storageScope), [storageScope]);
  const cloudMapping = vault.scheduleImport?.mappings ?? {};
  const cloudResolutions = vault.scheduleImport?.resolutions ?? {};
  const savedMapping = useMemo(() => ({ ...readSavedMapping(storageScope), ...cloudMapping, ...savedWorkspace.mapping }), [cloudMapping, savedWorkspace.mapping, storageScope]);
  const savedResolutions = useMemo(() => ({ ...cloudResolutions, ...savedWorkspace.resolutions }), [cloudResolutions, savedWorkspace.resolutions]);
  const [rawLessons, setRawLessons] = useState<ImportedScheduleLesson[]>(savedWorkspace.rawLessons);
  const [mapping, setMapping] = useState<ScheduleImportMapping>(savedMapping);
  const [resolutions, setResolutions] = useState<ScheduleImportResolutionMap>(savedResolutions);
  const [fileCampusOverrides, setFileCampusOverrides] = useState<ScheduleImportMapping>(savedWorkspace.fileCampusOverrides);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(savedWorkspace.selectedMonth || todayIso().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(savedWorkspace.selectedDate || todayIso());
  const [campusFilter, setCampusFilter] = useState(savedWorkspace.campusFilter || "all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(savedWorkspace.statusFilter);
  const [search, setSearch] = useState(savedWorkspace.search);
  const [selectedReviewId, setSelectedReviewId] = useState(vault.scheduleImport?.reviews[0]?.id ?? "");
  const [savedReviewsExpanded, setSavedReviewsExpanded] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  const campusOptions = useMemo(
    () => sortCampusesForProfile(vault.campuses, vault.profile.homeCampusId),
    [vault.campuses, vault.profile.homeCampusId]
  );
  const courseOptions = useMemo(
    () => sortCoursesByName(vault.courseGroups).filter((course) => course.status === "active"),
    [vault.courseGroups]
  );
  const importedRows = useMemo(
    () => buildImportPreview(vault, rawLessons, mapping, fileCampusOverrides),
    [fileCampusOverrides, mapping, rawLessons, vault]
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
    const linkedSourceCount = row.systemLessonId
      ? linkedSystemLessonSources.filter((source) => source.lessonId === row.systemLessonId).length
      : 0;

    if (invalidSplitMergeRowKeys.has(rowKey)) return "拆分合并标记已失效";
    if (row.systemLessonId && staleLinkedSystemLessonIds.has(row.systemLessonId) && !isCurrentlyLinked && !isDirectMatched) return "拆分合并标记已失效";
    if (resolution?.linkedSystemLessonIds?.length && row.systemLessonId && isDirectMatched) return "合并需复核";
    if (resolution?.status === "split_merge_ok" && resolution.linkedSystemLessonIds?.length) return `合并到 ${resolution.linkedSystemLessonIds.length} 节云端课`;
    if (row.status === "import_missing" && isCurrentlyLinked && linkedSourceCount > 0) return `由 ${linkedSourceCount} 条教务课合并`;
    return undefined;
  };
  const effectiveRows = useMemo(
    () => rows.map((row) => applyResolutionToRow(row, resolutions[resolutionKey(row)], linkedSystemLessonIds)),
    [linkedSystemLessonIds, resolutions, rows]
  );
  const splitMergeExcludedLessonIds = useMemo(
    () => splitMergePayrollExcludedLessonIds(rows, resolutions),
    [resolutions, rows]
  );
  const summary = useMemo(() => summarizeImportPreview(effectiveRows), [effectiveRows]);
  const resolvedAsMatchedCount = useMemo(
    () => rows.filter((row) => row.status !== "matched" && resolutionMarksRowResolved(resolutions[resolutionKey(row)]?.status)).length,
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
  const needsAttention = summary.attendanceMismatch + summary.timeMismatch + summary.courseMismatch + summary.systemMissing + summary.importMissing + summary.needsMapping;
  const reviewedCount = rows.filter((row) => isReviewedResolution(resolutions[resolutionKey(row)])).length;
  const savedReviews = vault.scheduleImport?.reviews ?? [];
  const selectedReview = savedReviews.find((review) => review.id === selectedReviewId) ?? savedReviews[0];
  const savedReviewLiveCounts = useMemo(
    () => new Map(savedReviews.map((review) => [review.id, liveSavedReviewEffectiveCounts(vault, review)])),
    [savedReviews, vault]
  );
  const selectedReviewCounts = selectedReview ? savedReviewLiveCounts.get(selectedReview.id) ?? savedReviewEffectiveCounts(selectedReview) : undefined;
  const reviewNeedsAttentionForDisplay = (review: ScheduleImportReviewRecord): number =>
    needsAttentionFromSavedReviewCounts(savedReviewLiveCounts.get(review.id) ?? savedReviewEffectiveCounts(review));

  useEffect(() => {
    setMapping((current) => {
      const merged = { ...cloudMapping };
      for (const key in current) {
        merged[key] = current[key];
      }
      return merged;
    });
    setResolutions((current) => ({ ...cloudResolutions, ...current }));
  }, [vault.scheduleImport?.updatedAt]);

  useEffect(() => {
    if (!selectedReviewId && savedReviews[0]) {
      setSelectedReviewId(savedReviews[0].id);
    }
  }, [savedReviews, selectedReviewId]);

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
  }, [campusFilter, fileCampusOverrides, mapping, rawLessons, resolutions, search, selectedDate, selectedMonth, statusFilter, storageScope]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setLoading(true);
    setMessage("正在解析教务 Excel...");
    try {
      const parsed = await parseScheduleWorkbookFiles(files);
      const parsedFileNames = new Set(parsed.map((lesson) => lesson.fileName));
      const nextRawLessons = [
        ...rawLessons.filter((lesson) => !parsedFileNames.has(lesson.fileName)),
        ...parsed
      ].sort((a, b) => `${a.date} ${a.startTime} ${a.campusName}`.localeCompare(`${b.date} ${b.startTime} ${b.campusName}`));
      const nextOverrides = buildDefaultCampusOverrides(vault, nextRawLessons, fileCampusOverrides);
      setRawLessons(nextRawLessons);
      setFileCampusOverrides(nextOverrides);
      if (parsed[0]?.date) {
        setSelectedMonth(parsed[0].date.slice(0, 7));
        setSelectedDate(parsed[0].date);
      }
      setMessage(parsed.length > 0 ? `已加入 ${parsedFileNames.size} 个文件、${parsed.length} 节教务 Excel 课节；当前共 ${nextRawLessons.length} 节。` : "没有从文件中解析到课节，请确认是否为校宝导出的 .xls/.xlsx。");
    } catch (error) {
      setRawLessons([]);
      setMessage(error instanceof Error ? error.message : "课表解析失败。");
    } finally {
      setLoading(false);
    }
  }

  function updateCourseMapping(row: ImportPreviewLesson, courseId: string) {
    const key = importMappingKey(row);
    const nextMapping = { ...mapping };
    if (courseId) {
      nextMapping[key] = courseId;
    } else {
      delete nextMapping[key];
    }
    setMapping(nextMapping);
    const savedMappingOk = writeSavedMapping(storageScope, nextMapping);
    writeSavedWorkspace(storageScope, {
      rawLessons,
      mapping: nextMapping,
      resolutions,
      fileCampusOverrides,
      selectedMonth,
      selectedDate,
      campusFilter,
      statusFilter,
      search,
      savedAt: new Date().toISOString()
    });
    if (onSaveScheduleImport) {
      onSaveScheduleImport(buildScheduleImportStateWithoutReview(vault, nextMapping, resolutions, splitMergeExcludedLessonIds));
      setMessage(courseId ? "课程映射已自动保存到云端加密档案，下次导入会直接复用。" : "课程映射已清除并同步到云端加密档案。");
    } else if (savedMappingOk) {
      setMessage(courseId ? "课程映射已自动保存到本机浏览器。" : "课程映射已清除。");
    }
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
    setFileCampusOverrides((current) => ({ ...current, [fileName]: campusId }));
  }

  function updateResolution(row: ImportPreviewLesson, patch: Partial<Pick<ScheduleImportResolution, "status" | "note" | "linkedSystemLessonIds">>) {
    const key = resolutionKey(row);
    const nextResolutions = buildUpdatedResolutions(resolutions, key, patch);
    const nextSplitMergeExcludedLessonIds = splitMergePayrollExcludedLessonIds(rows, nextResolutions);
    setResolutions(nextResolutions);
    if (patch.status) {
      onSaveScheduleImport?.(buildScheduleImportStateWithoutReview(vault, mapping, nextResolutions, nextSplitMergeExcludedLessonIds));
      const label = resolutionStatusLabel(patch.status);
      setMessage(
        resolutionMarksRowResolved(patch.status)
          ? `已标为「${label}」，这条差异已计入已对应，顶部统计和状态筛选已更新。`
          : `已标为「${label}」，这条差异仍保留在待核对统计中。`
      );
    }
  }

  function saveMapping() {
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
    const nextScheduleImport = buildNextScheduleImportState(vault, {
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
    setSelectedReviewId(nextScheduleImport.reviews[0]?.id ?? "");
    setMessage(
      savedMappingOk && savedWorkspaceOk && onSaveScheduleImport
        ? "课程映射和本次对账结果已保存到云端加密档案，换浏览器登录后也会复用。"
        : savedMappingOk && savedWorkspaceOk
          ? "课程映射和当前对账现场已保存到本机浏览器。"
        : "保存失败：浏览器本地存储空间可能不足，请减少导入文件后再试。"
    );
  }

  function deleteSavedReview(reviewId: string) {
    const previous = vault.scheduleImport;
    if (!previous) return;
    const nextReviews = previous.reviews.filter((review) => review.id !== reviewId);
    onSaveScheduleImport?.({
      mappings: { ...(previous.mappings ?? {}) },
      resolutions: { ...(previous.resolutions ?? {}) },
      reviews: nextReviews,
      splitMergeExcludedLessonIds: previous.splitMergeExcludedLessonIds ?? [],
      updatedAt: new Date().toISOString()
    });
    setSelectedReviewId((current) => current === reviewId ? nextReviews[0]?.id ?? "" : current);
    setMessage("已删除这条保存的对账结果，课程映射和差异标注仍保留。");
  }

  function loadSavedReviewIntoWorkspace(review: ScheduleImportReviewRecord) {
    const nextRawLessons = rawLessonsFromSavedReview(review);
    if (nextRawLessons.length === 0) {
      setMessage("这条保存的对账没有可恢复的教务 Excel 课节，无法导入到核对列表。");
      return;
    }
    const nextMapping = { ...(review.mapping ?? {}) };
    const nextResolutions = review.resolutions && Object.keys(review.resolutions).length > 0
      ? { ...review.resolutions }
      : resolutionsFromSavedReviewRows(review.rows);
    const nextFileCampusOverrides = { ...(review.fileCampusOverrides ?? {}) };
    const nextSelectedMonth = review.month || nextRawLessons[0]?.date.slice(0, 7) || todayIso().slice(0, 7);
    const nextSelectedDate = review.selectedDate || nextRawLessons[0]?.date || `${nextSelectedMonth}-01`;

    setRawLessons(nextRawLessons);
    setMapping(nextMapping);
    setResolutions(nextResolutions);
    setFileCampusOverrides(nextFileCampusOverrides);
    setSelectedMonth(nextSelectedMonth);
    setSelectedDate(nextSelectedDate);
    setCampusFilter("all");
    setStatusFilter("all");
    setSearch("");
    setSelectedReviewId(review.id);
    setSavedReviewsExpanded(false);

    writeSavedMapping(storageScope, nextMapping);
    writeSavedWorkspace(storageScope, {
      rawLessons: nextRawLessons,
      mapping: nextMapping,
      resolutions: nextResolutions,
      fileCampusOverrides: nextFileCampusOverrides,
      selectedMonth: nextSelectedMonth,
      selectedDate: nextSelectedDate,
      campusFilter: "all",
      statusFilter: "all",
      search: "",
      savedAt: new Date().toISOString()
    });
    setMessage(`已将「${savedReviewTitle(review)}」导入到下方核对列表，可以继续修改课程映射和处理标注。`);
  }

  function clearImport() {
    setRawLessons([]);
    setFileCampusOverrides({});
    setMessage("");
    setSearch("");
    setStatusFilter("all");
    setCampusFilter("all");
  }

  function downloadMergedSchedule() {
    if (rawLessons.length === 0) return;
    try {
      const summary = downloadMergedScheduleWorkbook(applyCampusOverridesToLessons(vault, rawLessons, fileCampusOverrides));
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
          needsAttention={needsAttention}
          resolvedAsMatchedCount={resolvedAsMatchedCount}
          reviewedCount={reviewedCount}
          fileSummaries={fileSummaries}
          monthCount={monthOptions.length}
          campusOptions={campusOptions}
          fileCampusOverrides={fileCampusOverrides}
          message={message}
          onFilesSelected={(files) => void handleFiles(files)}
          onSave={saveMapping}
          onExport={downloadMergedSchedule}
          onClear={clearImport}
          onFileCampusChange={updateFileCampus}
        />

        <ScheduleImportSavedReviewsPanel
          vault={vault}
          amountsVisible={amountsVisible}
          reviews={savedReviews}
          selectedReview={selectedReview}
          expanded={savedReviewsExpanded}
          selectedReviewMatchedCount={selectedReviewCounts?.matched}
          reviewTitle={savedReviewTitle}
          reviewNeedsAttention={reviewNeedsAttentionForDisplay}
          formatReviewNumber={formatSavedReviewNumber}
          formatReviewAmount={formatSavedReviewAmount}
          onToggleExpanded={() => setSavedReviewsExpanded((current) => !current)}
          onSelectReview={(reviewId) => {
            setSelectedReviewId(reviewId);
            setSavedReviewsExpanded(true);
          }}
          onLoadReview={(review) => {
            confirm({
              title: "导入保存对账到核对列表？",
              description: "会用这条保存对账恢复下方可编辑核对列表、课程映射和处理标注；当前下方导入现场会被替换，但已保存对账记录不会删除。当前现场还需要保留时，请选择“保存后导入”。",
              confirmLabel: "直接导入",
              secondaryLabel: "保存后导入",
              cancelLabel: "取消",
              onSecondary: () => {
                if (rows.length > 0) saveMapping();
                loadSavedReviewIntoWorkspace(review);
              },
              onConfirm: () => loadSavedReviewIntoWorkspace(review)
            });
          }}
          onDeleteReview={(review) => {
            confirm({
              title: "删除保存的对账结果？",
              description: "删除后只移除这一次保存的对账快照；课程映射和差异标注会继续保留。",
              confirmLabel: "删除",
              cancelLabel: "取消",
              tone: "danger",
              onConfirm: () => deleteSavedReview(review.id)
            });
          }}
          renderRows={(review, currentVault) => (
            <ScheduleImportSavedReviewRows
              review={review}
              vault={currentVault}
            />
          )}
        />

        <ScheduleImportStatusControls
          summary={summary}
          resolvedAsMatchedCount={resolvedAsMatchedCount}
          resolutionCounts={resolutionCounts}
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
              courses={courseOptions}
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
              onMap={(courseId) => updateCourseMapping(row, courseId)}
              onResolutionChange={(patch) => updateResolution(row, patch)}
              onOpenLesson={onOpenLesson}
              onSuggestSchedule={onSuggestSchedule}
            />
          )}
        />
      </CardContent>
      {dialog}
    </Card>
  );
}

function splitMergePayrollExcludedLessonIds(rows: ImportPreviewLesson[], resolutions: ScheduleImportResolutionMap): string[] {
  const lessonIds = new Set<string>();
  rows.forEach((row) => {
    const resolution = resolutions[resolutionKey(row)];
    if (resolution?.status !== "split_merge_ok" || !row.systemLessonId) return;
    const mergeTargetLessonIds = (resolution.linkedSystemLessonIds ?? []).filter((lessonId) => lessonId && lessonId !== row.systemLessonId);
    if (mergeTargetLessonIds.length > 0) lessonIds.add(row.systemLessonId);
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
  const summary = summarizeImportPreview(effectiveRows);
  return {
    matched: summary.matched,
    attendanceMismatch: summary.attendanceMismatch,
    timeMismatch: summary.timeMismatch,
    courseMismatch: summary.courseMismatch,
    systemMissing: summary.systemMissing,
    importMissing: summary.importMissing,
    needsMapping: summary.needsMapping
  };
}

function needsAttentionFromSavedReviewCounts(counts: ReturnType<typeof savedReviewEffectiveCounts>): number {
  return counts.attendanceMismatch + counts.timeMismatch + counts.courseMismatch + counts.systemMissing + counts.importMissing + counts.needsMapping;
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
