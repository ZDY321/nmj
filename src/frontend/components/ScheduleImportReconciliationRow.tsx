import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ScheduleImportIssueList } from "@/frontend/components/ScheduleImportIssueList";
import { ScheduleImportLinkedLessonsPanel } from "@/frontend/components/ScheduleImportLinkedLessonsPanel";
import { ScheduleImportRowDetails } from "@/frontend/components/ScheduleImportRowDetails";
import type { Lesson, ScheduleImportResolution, ScheduleImportResolutionStatus, TeacherVault } from "@/shared/types";
import { courseName as localCourseName, courseTimeRangeBillingLabel, lessonAttendanceNoteText, lessonCampusId, lessonStatusLabels, lessonTimeRangeBillingLabel } from "@/frontend/lib/helpers";
import type { ImportPreviewLesson } from "@/frontend/lib/scheduleImport";
import {
  effectiveRowStatus,
  isReviewedResolution,
  linkedLessonsForResolution,
  quickResolutionActionsForRow,
  resolutionExcludesImportStats,
  resolutionStatusLabel,
  resolutionStatuses,
  splitMergeCandidateLessons,
  statusLabel,
  statusSurfaceClass,
  statusVariant,
  summarizeLinkedLessons,
  type LinkedSystemLessonSource
} from "@/frontend/lib/scheduleImportReview";

export function ScheduleImportReconciliationRow({
  row,
  vault,
  resolution,
  linkedSystemLessonIds,
  linkedBySources,
  staleLinkedByPreviousResolution,
  invalidLinkedSystemLessonIds,
  onResolutionChange,
  onOpenLesson,
  onSuggestSchedule
}: {
  row: ImportPreviewLesson;
  vault: TeacherVault;
  resolution?: ScheduleImportResolution;
  linkedSystemLessonIds: Set<string>;
  linkedBySources: LinkedSystemLessonSource[];
  staleLinkedByPreviousResolution: boolean;
  invalidLinkedSystemLessonIds: string[];
  onResolutionChange: (patch: Partial<Pick<ScheduleImportResolution, "status" | "note" | "linkedSystemLessonIds">>) => void;
  onOpenLesson?: (lesson: Lesson) => void;
  onSuggestSchedule?: (request: { date: string; startTime: string; endTime: string; courseGroupId?: string }) => void;
}) {
  const systemLesson = row.systemLessonId ? vault.lessons.find((lesson) => lesson.id === row.systemLessonId) : undefined;
  const importCourseId = row.matchedCourseId ?? row.mappedCourseId;
  const importTimeLabel = courseTimeRangeBillingLabel(vault, row, importCourseId);
  const systemTimeLabel = systemLesson ? lessonTimeRangeBillingLabel(vault, systemLesson) : "";
  const systemAttendanceNoteText = systemLesson ? lessonAttendanceNoteText(vault, systemLesson) : "";
  const resolutionStatus = resolution?.status ?? "unreviewed";
  const baseReviewed = isReviewedResolution(resolution);
  const excludedFromImportStats = resolutionExcludesImportStats(resolutionStatus);
  const baseDisplayStatus = effectiveRowStatus(row, resolution, linkedSystemLessonIds);
  const resolvedByLinkedImport = row.status === "import_missing" && Boolean(row.systemLessonId && linkedSystemLessonIds.has(row.systemLessonId));
  const quickResolutionActions = quickResolutionActionsForRow(row);
  const splitMergeCandidates = useMemo(() => splitMergeCandidateLessons(vault, row), [row, vault]);
  const linkedLessons = useMemo(
    () => linkedLessonsForResolution(vault, resolution),
    [resolution, vault]
  );
  const linkedSummary = summarizeLinkedLessons(vault, linkedLessons, row);
  const resolutionNote = resolution?.note ?? "";
  const resolutionNotePreview = resolutionNote.trim();
  const hasCurrentDirectMatch = Boolean(row.systemLessonId && (row.status === "matched" || row.status === "attendance_mismatch"));
  const isCurrentlyLinkedBySources = Boolean(row.systemLessonId && linkedSystemLessonIds.has(row.systemLessonId));
  const splitMergeNeedsReview = Boolean(resolution?.linkedSystemLessonIds?.length && hasCurrentDirectMatch);
  const hasInvalidLinkedLessons = invalidLinkedSystemLessonIds.length > 0;
  const hasValidCurrentLinkedLessons = linkedLessons.length > 0;
  const hasSplitMergeLinkProblem = (hasInvalidLinkedLessons || staleLinkedByPreviousResolution) && !hasCurrentDirectMatch && !isCurrentlyLinkedBySources && !hasValidCurrentLinkedLessons;
  const linkedLessonWarnings = linkedLessons.flatMap((lesson) => splitMergeLinkedLessonWarnings(vault, row, lesson));
  const hasLinkedLessonWarning = linkedLessonWarnings.length > 0;
  const hasArrears = scheduleImportRowHasArrears(row, resolution);
  const hasNoShow = scheduleImportRowIsNoShow(row);
  const displayStatus = hasSplitMergeLinkProblem ? row.status : baseDisplayStatus;
  const reviewed = baseReviewed && !hasSplitMergeLinkProblem;
  const isMatched = displayStatus === "matched";
  const canCollapseDetails = isMatched || reviewed;
  const resolvedAsMatched = isMatched && row.status !== "matched" && !excludedFromImportStats;
  const [detailsExpanded, setDetailsExpanded] = useState(() => !canCollapseDetails);
  const canLinkSplitMerge =
    row.status === "time_mismatch" ||
    row.status === "system_missing" ||
    row.status === "course_mismatch" ||
    row.status === "import_missing";
  const suggestScheduleCourseId = row.matchedCourseId ?? row.mappedCourseId;
  const canSuggestSchedule = Boolean(onSuggestSchedule) && row.status !== "import_missing" && !systemLesson;
  const suggestScheduleDisabledReason = canSuggestSchedule && !suggestScheduleCourseId
    ? "请先在课程名称映射页维护这条教务课程名的映射，再建议排课"
    : "";
  const showReviewControls = row.status !== "matched" || reviewed || Boolean(resolution?.linkedSystemLessonIds?.length);
  const showExpandedReviewControls = showReviewControls && (!canCollapseDetails || detailsExpanded);
  const clearLinkedLessonsPatch = (): Partial<Pick<ScheduleImportResolution, "status" | "note" | "linkedSystemLessonIds">> => ({
    linkedSystemLessonIds: [],
    ...(resolutionStatus === "split_merge_ok" ? { status: "unreviewed", note: "" } : {})
  });

  useEffect(() => {
    if (canCollapseDetails) {
      setDetailsExpanded(false);
    } else {
      setDetailsExpanded(true);
    }
  }, [canCollapseDetails]);

  return (
    <div className={`rounded-[14px] border p-3 ${statusSurfaceClass(displayStatus, reviewed && !resolvedAsMatched)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(displayStatus)}>{statusLabel(displayStatus)}</Badge>
            {hasArrears && <Badge variant="destructive">已欠费</Badge>}
            {hasNoShow && <Badge variant="amber">缺勤未到</Badge>}
            <Badge variant="secondary">{row.date}</Badge>
            <Badge variant="secondary">教务 {importTimeLabel}</Badge>
            {systemLesson && (
              <Badge variant={systemTimeLabel === importTimeLabel ? "secondary" : "sky"}>
                云端 {systemTimeLabel}
              </Badge>
            )}
            {systemLesson?.status === "cancelled" && <Badge variant="destructive">{lessonStatusLabels[systemLesson.status]}</Badge>}
            {reviewed && <Badge variant="sky">{resolutionStatusLabel(resolutionStatus)}</Badge>}
            {excludedFromImportStats && <Badge variant="secondary">不计入导入统计</Badge>}
            {resolvedByLinkedImport && <Badge variant="plum">由 {linkedBySources.length} 条教务课合并成此云端课</Badge>}
            {resolvedAsMatched && !resolvedByLinkedImport && <Badge variant="sage">已计入已对应</Badge>}
            {resolution?.linkedSystemLessonIds?.length && !resolvedByLinkedImport ? <Badge variant="plum">→ 合并到 {resolution.linkedSystemLessonIds.length} 节云端课</Badge> : null}
            {splitMergeNeedsReview && <Badge variant="amber">拆分合并需复核</Badge>}
            {hasSplitMergeLinkProblem && <Badge variant="amber">拆分合并标记已失效</Badge>}
            {hasLinkedLessonWarning && <Badge variant="amber">关联需复核</Badge>}
          </div>
          {canCollapseDetails && !detailsExpanded && (
            <>
              <div className="truncate text-sm font-extrabold leading-5 text-[#061226]">
                {systemLesson && systemTimeLabel !== importTimeLabel ? `教务 ${importTimeLabel} · 云端 ${systemTimeLabel}` : importTimeLabel} · {row.matchedCourseId ? localCourseName(vault, row.matchedCourseId) : row.title}
                {resolvedByLinkedImport && <span className="ml-2 text-[#5161d6]">由教务合并</span>}
              </div>
              <div className="mt-1 truncate text-xs font-semibold leading-5 text-[#64748b]">
                教务：{row.title} · 云端：{systemLesson ? localCourseName(vault, systemLesson.courseGroupId) : "未找到课节"}
                {row.presentCount !== undefined && row.expectedCount !== undefined ? ` · 教务实到/应到 ${row.presentCount}/${row.expectedCount}` : ""}
                {row.note ? ` · 教务备注：${row.note}` : ""}
                {systemLesson?.note ? ` · 云端备注：${systemLesson.note}` : ""}
                {systemAttendanceNoteText ? ` · ${systemAttendanceNoteText}` : ""}
              </div>
              {linkedBySources.length > 0 && (
                <div className="mt-2 rounded-[10px] border border-[#c7d2fe] bg-[#eef0ff] px-2.5 py-1.5 text-xs font-semibold leading-5 text-[#5161d6]">
                  由 {linkedBySources.map((source) => `${source.date} ${courseTimeRangeBillingLabel(vault, source, source.matchedCourseId)}`).join("、")} 教务课合并成此云端课
                </div>
              )}
            </>
          )}
        </div>
        {canCollapseDetails && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDetailsExpanded((current) => !current)}
            className="h-8 shrink-0 px-2 text-xs text-[#1557c2]"
          >
            <ChevronDown size={14} className={`transition-transform ${detailsExpanded ? "rotate-180" : ""}`} />
            {detailsExpanded ? "收起" : "展开"}
          </Button>
        )}
      </div>

      {canCollapseDetails && !detailsExpanded && linkedLessons.length > 0 && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            {linkedLessons.length > 0 && (
              <div className="flex-1 rounded-[10px] border border-[#c7d2fe] bg-[#eef0ff] px-2.5 py-1.5 font-semibold text-[#5161d6]">
                已关联 {linkedLessons.map(l => `${l.date} ${lessonTimeRangeBillingLabel(vault, l)} ${localCourseName(vault, l.courseGroupId)}`).join("、")}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (linkedLessons.length > 0 || resolution?.linkedSystemLessonIds?.length) {
                  onResolutionChange(clearLinkedLessonsPatch());
                }
              }}
              className="h-7 shrink-0 text-xs"
            >
              清除关联
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDetailsExpanded(true)}
              className="h-7 shrink-0 text-xs"
            >
              {canLinkSplitMerge ? "重新选择" : "展开详情"}
            </Button>
          </div>
        </div>
      )}

      {(!canCollapseDetails || detailsExpanded) && (
        <>
          <ScheduleImportRowDetails
            row={row}
            vault={vault}
            systemLesson={systemLesson}
            linkedLessons={linkedLessons}
            onOpenLesson={onOpenLesson}
          />

          {row.issues.length > 0 && (
            <div className="mt-3 rounded-[12px] border border-[#fed7aa] bg-white/70 p-3">
              <div className="mb-2 text-xs font-extrabold text-[#9a3412]">对账差异</div>
              <ScheduleImportIssueList issues={row.issues} />
            </div>
          )}

          {hasSplitMergeLinkProblem && (
            <div className="mt-3 rounded-[12px] border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-xs font-semibold leading-5 text-[#9a3412]">
              {hasInvalidLinkedLessons
                ? `这条拆分合并标记引用的云端课节已经不存在或已被删除：${invalidLinkedSystemLessonIds.join("、")}。请重新选择关联课节，旧失效关联会在重新选择后清除。`
                : "这节云端课曾被历史拆分合并标记引用，但当前导入行已经不再命中那条标记。请确认这节云端课是否仍应保留。"}
            </div>
          )}

          {linkedBySources.length > 0 && (
            <div className="mt-3 rounded-[12px] border border-[#86efac] bg-[#f0fdf4] p-3">
              <div className="text-xs font-extrabold text-[#15803d]">✓ 这节云端课已被以下 {linkedBySources.length} 条教务课节拆分/合并关联</div>
              <div className="mt-2 space-y-1.5">
                {linkedBySources.map((source) => (
                  <div key={`${source.rowKey}-${source.lessonId}`} className="rounded-[9px] border border-[#bbf7d0] bg-white px-2.5 py-2 text-xs font-semibold leading-5 text-[#64748b]">
                    <span className="font-extrabold text-[#061226]">{source.date} {courseTimeRangeBillingLabel(vault, source, source.matchedCourseId)}</span>
                    {" · "}{source.matchedCourseId ? localCourseName(vault, source.matchedCourseId) : source.title}
                    {source.resolutionNote ? <span className="block text-[#15803d]">标注：{source.resolutionNote}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {splitMergeNeedsReview && (
            <div className="mt-3 rounded-[12px] border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-xs font-semibold leading-5 text-[#9a3412]">
              当前教务课节已经能直接对应云端课节，但仍保留了拆分合并关联。请复核是否需要取消旧关联，避免同一课时重复被计入“拆分合并正常”。
            </div>
          )}

          {hasLinkedLessonWarning && (
            <div className="mt-3 rounded-[12px] border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-xs font-semibold leading-5 text-[#9a3412]">
              关联课节疑似不匹配：{Array.from(new Set(linkedLessonWarnings)).join("；")}。请确认是否选错云端课节。
            </div>
          )}

        </>
      )}

      {showExpandedReviewControls && (
        <div className="mt-3 grid grid-cols-1 gap-2 rounded-[12px] border border-[#e8eef6] bg-white/80 p-3">
          {resolvedAsMatched && (
            <div className="rounded-[10px] border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-xs font-bold text-[#15803d]">
              已按人工确认结果计入“已对应”；如需重新处理，可把状态改回“未处理”或“云端需修正”。
            </div>
          )}
          {quickResolutionActions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {canSuggestSchedule && (
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() =>
                      onSuggestSchedule?.({
                        date: row.date,
                        startTime: row.startTime,
                        endTime: row.endTime,
                        courseGroupId: suggestScheduleCourseId
                      })
                    }
                    disabled={!suggestScheduleCourseId}
                    title={suggestScheduleCourseId ? "按这条教务课的日期和时间去排课" : suggestScheduleDisabledReason}
                  >
                    建议排课
                  </Button>
                  {suggestScheduleDisabledReason && (
                    <span className="max-w-[220px] text-[11px] font-semibold leading-4 text-[#b45309]">
                      {suggestScheduleDisabledReason}
                    </span>
                  )}
                </div>
              )}
              {quickResolutionActions.map((action) => (
                <Button
                  key={action.status}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onResolutionChange({ status: action.status, note: action.note })}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
          {canLinkSplitMerge && (
            <ScheduleImportLinkedLessonsPanel
              vault={vault}
              resolution={resolution}
              resolutionStatus={resolutionStatus}
              linkedLessonCount={linkedLessons.length}
              importHours={linkedSummary.importHours}
              systemHours={linkedSummary.systemHours}
              candidates={splitMergeCandidates}
              onChange={onResolutionChange}
              lessonCampusId={lessonCampusId}
            />
          )}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[180px_minmax(0,1fr)]">
            <Select value={resolutionStatus} onChange={(event) => onResolutionChange({ status: event.target.value as ScheduleImportResolutionStatus })}>
              {resolutionStatuses.map((status) => (
                <option key={status} value={status}>{resolutionStatusLabel(status)}</option>
              ))}
            </Select>
            <div className="group relative min-w-0">
              <Input
                value={resolutionNote}
                onChange={(event) => onResolutionChange({ note: event.target.value })}
                placeholder="记录最终判断，例如：教务表人数错、云端已改、确认无需处理"
                title={resolutionNotePreview || undefined}
              />
              {resolutionNotePreview && (
                <div className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 hidden max-h-40 w-full min-w-[260px] overflow-y-auto whitespace-pre-wrap rounded-[12px] border border-[#c7d2fe] bg-white px-3 py-2 text-xs font-semibold leading-5 text-[#25324a] shadow-[0_14px_36px_rgba(15,35,66,0.16)] group-hover:block group-focus-within:block">
                  {resolutionNotePreview}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function splitMergeLinkedLessonWarnings(vault: TeacherVault, row: ImportPreviewLesson, lesson: Lesson): string[] {
  const warnings: string[] = [];
  const rowCourseId = row.matchedCourseId ?? row.mappedCourseId;
  const linkedCourse = vault.courseGroups.find((course) => course.id === lesson.courseGroupId);
  const rowCampusId = row.campusId;
  const linkedCampusId = lessonCampusId(vault, lesson);
  if (rowCampusId && linkedCampusId && rowCampusId !== linkedCampusId) {
    warnings.push("校区不同");
  }
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

function scheduleImportRowIsNoShow(row: Pick<ImportPreviewLesson, "presentCount" | "expectedCount" | "warnings" | "note" | "rawText">): boolean {
  if (row.presentCount !== 0 || (row.expectedCount ?? 0) <= 0) return false;
  if (row.warnings.includes("缺勤未到")) return true;
  if (row.warnings.includes("未开课/取消")) return false;
  if (/取消|停课|请假|未上|不上课|未开课|课消|无学生/.test(`${row.note ?? ""} ${row.rawText ?? ""}`)) return false;
  return true;
}

function scheduleImportRowHasArrears(row: ImportPreviewLesson, resolution?: ScheduleImportResolution): boolean {
  if (resolution?.status === "missing_lesson_fee") return true;
  const text = [
    row.note,
    row.rawText,
    ...row.warnings,
    ...row.issues
  ].join(" ");
  return /欠费|已欠|未缴|未交|未付|待缴|待交|费用不足|余额不足|课时不足/.test(text);
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
