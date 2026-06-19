import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ScheduleImportIssueList } from "@/frontend/components/ScheduleImportIssueList";
import { ScheduleImportLinkedLessonsPanel } from "@/frontend/components/ScheduleImportLinkedLessonsPanel";
import { ScheduleImportRowDetails } from "@/frontend/components/ScheduleImportRowDetails";
import type { CourseGroup, Lesson, ScheduleImportResolution, ScheduleImportResolutionStatus, TeacherVault } from "@/shared/types";
import { courseName as localCourseName, lessonStatusLabels, lessonTimeRangeLabel } from "@/frontend/lib/helpers";
import type { ImportPreviewLesson } from "@/frontend/lib/scheduleImport";
import {
  effectiveRowStatus,
  isReviewedResolution,
  lessonCampusId,
  linkedLessonsForResolution,
  quickResolutionActionsForRow,
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
  courses,
  resolution,
  linkedSystemLessonIds,
  linkedBySources,
  staleLinkedByPreviousResolution,
  invalidLinkedSystemLessonIds,
  onMap,
  onResolutionChange,
  onOpenLesson,
  onSuggestSchedule
}: {
  row: ImportPreviewLesson;
  vault: TeacherVault;
  courses: CourseGroup[];
  resolution?: ScheduleImportResolution;
  linkedSystemLessonIds: Set<string>;
  linkedBySources: LinkedSystemLessonSource[];
  staleLinkedByPreviousResolution: boolean;
  invalidLinkedSystemLessonIds: string[];
  onMap: (courseId: string) => void;
  onResolutionChange: (patch: Partial<Pick<ScheduleImportResolution, "status" | "note" | "linkedSystemLessonIds">>) => void;
  onOpenLesson?: (lesson: Lesson) => void;
  onSuggestSchedule?: (request: { date: string; startTime: string; endTime: string; courseGroupId?: string }) => void;
}) {
  const systemLesson = row.systemLessonId ? vault.lessons.find((lesson) => lesson.id === row.systemLessonId) : undefined;
  const importTimeLabel = lessonTimeRangeLabel(row);
  const systemTimeLabel = systemLesson ? lessonTimeRangeLabel(systemLesson) : "";
  const resolutionStatus = resolution?.status ?? "unreviewed";
  const reviewed = isReviewedResolution(resolution);
  const displayStatus = effectiveRowStatus(row, resolution, linkedSystemLessonIds);
  const isMatched = displayStatus === "matched";
  const canCollapseDetails = isMatched || reviewed;
  const resolvedAsMatched = isMatched && row.status !== "matched";
  const resolvedByLinkedImport = row.status === "import_missing" && Boolean(row.systemLessonId && linkedSystemLessonIds.has(row.systemLessonId));
  const [detailsExpanded, setDetailsExpanded] = useState(() => !canCollapseDetails);
  const quickResolutionActions = quickResolutionActionsForRow(row);
  const splitMergeCandidates = useMemo(() => splitMergeCandidateLessons(vault, row), [row, vault]);
  const linkedLessons = useMemo(
    () => linkedLessonsForResolution(vault, resolution),
    [resolution, vault]
  );
  const linkedSummary = summarizeLinkedLessons(linkedLessons, row);
  const resolutionNote = resolution?.note ?? "";
  const resolutionNotePreview = resolutionNote.trim();
  const hasCurrentDirectMatch = Boolean(row.systemLessonId && (row.status === "matched" || row.status === "attendance_mismatch"));
  const isCurrentlyLinkedBySources = Boolean(row.systemLessonId && linkedSystemLessonIds.has(row.systemLessonId));
  const splitMergeNeedsReview = Boolean(resolution?.linkedSystemLessonIds?.length && hasCurrentDirectMatch);
  const hasInvalidLinkedLessons = invalidLinkedSystemLessonIds.length > 0;
  const hasSplitMergeLinkProblem = (hasInvalidLinkedLessons || staleLinkedByPreviousResolution) && !hasCurrentDirectMatch && !isCurrentlyLinkedBySources;
  const canLinkSplitMerge =
    row.status === "time_mismatch" ||
    row.status === "system_missing" ||
    row.status === "course_mismatch" ||
    row.status === "import_missing";
  const suggestScheduleCourseId = row.matchedCourseId ?? row.mappedCourseId;
  const canSuggestSchedule = Boolean(onSuggestSchedule) && row.status !== "import_missing" && !systemLesson;
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
            <Badge variant="secondary">{row.date}</Badge>
            <Badge variant="secondary">教务 {importTimeLabel}</Badge>
            {systemLesson && (
              <Badge variant={systemTimeLabel === importTimeLabel ? "secondary" : "sky"}>
                云端 {systemTimeLabel}
              </Badge>
            )}
            {systemLesson?.status === "cancelled" && <Badge variant="destructive">{lessonStatusLabels[systemLesson.status]}</Badge>}
            {reviewed && <Badge variant="sky">{resolutionStatusLabel(resolutionStatus)}</Badge>}
            {resolvedByLinkedImport && <Badge variant="plum">由 {linkedBySources.length} 条教务课合并成此云端课</Badge>}
            {resolvedAsMatched && !resolvedByLinkedImport && <Badge variant="sage">已计入已对应</Badge>}
            {resolution?.linkedSystemLessonIds?.length && !resolvedByLinkedImport ? <Badge variant="plum">→ 合并到 {resolution.linkedSystemLessonIds.length} 节云端课</Badge> : null}
            {splitMergeNeedsReview && <Badge variant="amber">拆分合并需复核</Badge>}
            {hasSplitMergeLinkProblem && <Badge variant="amber">拆分合并标记已失效</Badge>}
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
              </div>
              {linkedBySources.length > 0 && (
                <div className="mt-2 rounded-[10px] border border-[#c7d2fe] bg-[#eef0ff] px-2.5 py-1.5 text-xs font-semibold leading-5 text-[#5161d6]">
                  由 {linkedBySources.map((source) => `${source.date} ${lessonTimeRangeLabel(source)}`).join("、")} 教务课合并成此云端课
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
                已关联 {linkedLessons.map(l => `${l.date} ${lessonTimeRangeLabel(l)} ${localCourseName(vault, l.courseGroupId)}`).join("、")}
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
            courses={courses}
            systemLesson={systemLesson}
            linkedLessons={linkedLessons}
            onMap={onMap}
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
                    <span className="font-extrabold text-[#061226]">{source.date} {lessonTimeRangeLabel(source)}</span>
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
                  title={suggestScheduleCourseId ? "按这条教务课的日期和时间去排课" : "请先把这条教务课映射到课程档案，再建议排课"}
                >
                  建议排课
                </Button>
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
