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
import { courseName as localCourseName, lessonStatusLabels } from "@/frontend/lib/helpers";
import type { ImportPreviewLesson } from "@/frontend/lib/scheduleImport";
import {
  effectiveRowStatus,
  isReviewedResolution,
  lessonCampusId,
  lessonDurationHours,
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
  onMap: (courseId: string) => void;
  onResolutionChange: (patch: Partial<Pick<ScheduleImportResolution, "status" | "note" | "linkedSystemLessonIds">>) => void;
  onOpenLesson?: (lesson: Lesson) => void;
  onSuggestSchedule?: (request: { date: string; startTime: string; endTime: string; courseGroupId?: string }) => void;
}) {
  const systemLesson = row.systemLessonId ? vault.lessons.find((lesson) => lesson.id === row.systemLessonId) : undefined;
  const importTimeLabel = `${row.startTime}-${row.endTime}`;
  const systemTimeLabel = systemLesson ? `${systemLesson.startTime}-${systemLesson.endTime}` : "";
  const resolutionStatus = resolution?.status ?? "unreviewed";
  const reviewed = isReviewedResolution(resolution);
  const displayStatus = effectiveRowStatus(row, resolution, linkedSystemLessonIds);
  const isMatched = displayStatus === "matched";
  const resolvedAsMatched = isMatched && row.status !== "matched";
  const resolvedByLinkedImport = row.status === "import_missing" && Boolean(row.systemLessonId && linkedSystemLessonIds.has(row.systemLessonId));
  const [detailsExpanded, setDetailsExpanded] = useState(() => displayStatus !== "matched");
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
  const splitMergeNeedsReview = Boolean(resolution?.linkedSystemLessonIds?.length && hasCurrentDirectMatch);
  const canLinkSplitMerge =
    row.status === "time_mismatch" ||
    row.status === "system_missing" ||
    row.status === "course_mismatch" ||
    row.status === "import_missing";

  useEffect(() => {
    if (displayStatus !== "matched") {
      setDetailsExpanded(true);
    } else if (row.status !== "matched") {
      setDetailsExpanded(false);
    }
  }, [displayStatus, row.status]);

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
            {resolvedAsMatched && <Badge variant="sage">已计入已对应</Badge>}
            {resolvedByLinkedImport && <Badge variant="plum">被 {linkedBySources.length || 1} 条拆分合并关联</Badge>}
            {splitMergeNeedsReview && <Badge variant="amber">拆分合并需复核</Badge>}
            {staleLinkedByPreviousResolution && <Badge variant="amber">旧拆分合并标记已失效</Badge>}
          </div>
          {isMatched && !detailsExpanded && (
            <>
              <div className="truncate text-sm font-extrabold leading-5 text-[#061226]">
                {systemLesson && systemTimeLabel !== importTimeLabel ? `教务 ${importTimeLabel} · 云端 ${systemTimeLabel}` : importTimeLabel} · {row.matchedCourseId ? localCourseName(vault, row.matchedCourseId) : row.title}
              </div>
              <div className="mt-1 truncate text-xs font-semibold leading-5 text-[#64748b]">
                教务：{row.title} · 云端：{systemLesson ? localCourseName(vault, systemLesson.courseGroupId) : "未找到课节"}
                {row.presentCount !== undefined && row.expectedCount !== undefined ? ` · 教务实到/应到 ${row.presentCount}/${row.expectedCount}` : ""}
                {row.note ? ` · 教务备注：${row.note}` : ""}
                {systemLesson?.note ? ` · 云端备注：${systemLesson.note}` : ""}
              </div>
            </>
          )}
        </div>
        {isMatched && (
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

      {(!isMatched || detailsExpanded) && (
        <>
          <ScheduleImportRowDetails
            row={row}
            vault={vault}
            courses={courses}
            systemLesson={systemLesson}
            onMap={onMap}
            onOpenLesson={onOpenLesson}
          />

          {row.issues.length > 0 && (
            <div className="mt-3 rounded-[12px] border border-[#fed7aa] bg-white/70 p-3">
              <div className="mb-2 text-xs font-extrabold text-[#9a3412]">对账差异</div>
              <ScheduleImportIssueList issues={row.issues} />
            </div>
          )}

          {linkedLessons.length > 0 && (
            <div className="mt-3 rounded-[12px] border border-[#c7d2fe] bg-[#eef0ff] p-3">
              <div className="text-xs font-extrabold text-[#5161d6]">本条拆分合并关联的云端课节</div>
              <div className="mt-2 space-y-1.5">
                {linkedLessons.map((lesson) => (
                  <button
                    key={lesson.id}
                    type="button"
                    onClick={() => onOpenLesson?.(lesson)}
                    className="block w-full rounded-[9px] border border-[#dbe4ef] bg-white px-2.5 py-2 text-left text-xs font-semibold text-[#64748b] transition-colors hover:border-[#93c5fd] hover:bg-[#f8fbff]"
                  >
                    <span className="font-extrabold text-[#061226]">{lesson.date} {lesson.startTime}-{lesson.endTime}</span>
                    {" · "}{localCourseName(vault, lesson.courseGroupId)}
                    {" · "}{lessonDurationHours(lesson).toFixed(1)} 小时
                  </button>
                ))}
              </div>
            </div>
          )}

          {linkedBySources.length > 0 && (
            <div className="mt-3 rounded-[12px] border border-[#c7d2fe] bg-[#eef0ff] p-3">
              <div className="text-xs font-extrabold text-[#5161d6]">这节云端课被以下教务课节拆分/合并关联</div>
              <div className="mt-2 space-y-1.5">
                {linkedBySources.map((source) => (
                  <div key={`${source.rowKey}-${source.lessonId}`} className="rounded-[9px] border border-[#dbe4ef] bg-white px-2.5 py-2 text-xs font-semibold leading-5 text-[#64748b]">
                    <span className="font-extrabold text-[#061226]">{source.date} {source.startTime}-{source.endTime}</span>
                    {" · "}{source.matchedCourseId ? localCourseName(vault, source.matchedCourseId) : source.title}
                    {source.resolutionNote ? <span className="block text-[#5161d6]">标注：{source.resolutionNote}</span> : null}
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

          {staleLinkedByPreviousResolution && (
            <div className="mt-3 rounded-[12px] border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-xs font-semibold leading-5 text-[#9a3412]">
              这节云端课曾被历史拆分合并标记引用，但当前导入行已经不再命中那条标记，系统已把它重新暴露为待核对项。请确认这节云端课是否仍应保留。
            </div>
          )}
        </>
      )}

      {row.status !== "matched" && (
        <div className="mt-3 grid grid-cols-1 gap-2 rounded-[12px] border border-[#e8eef6] bg-white/80 p-3">
          {resolvedAsMatched && (
            <div className="rounded-[10px] border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-xs font-bold text-[#15803d]">
              已按人工确认结果计入“已对应”；如需重新处理，可把状态改回“未处理”或“云端需修正”。
            </div>
          )}
          {quickResolutionActions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {row.status === "system_missing" && onSuggestSchedule && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() =>
                    onSuggestSchedule({
                      date: row.date,
                      startTime: row.startTime,
                      endTime: row.endTime,
                      courseGroupId: row.matchedCourseId ?? row.mappedCourseId
                    })
                  }
                  disabled={!row.matchedCourseId && !row.mappedCourseId}
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
              lessonDurationHours={lessonDurationHours}
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
