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
  summarizeLinkedLessons
} from "@/frontend/lib/scheduleImportReview";

export function ScheduleImportReconciliationRow({
  row,
  vault,
  courses,
  resolution,
  linkedSystemLessonIds,
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
  onMap: (courseId: string) => void;
  onResolutionChange: (patch: Partial<Pick<ScheduleImportResolution, "status" | "note" | "linkedSystemLessonIds">>) => void;
  onOpenLesson?: (lesson: Lesson) => void;
  onSuggestSchedule?: (request: { date: string; startTime: string; endTime: string; courseGroupId?: string }) => void;
}) {
  const systemLesson = row.systemLessonId ? vault.lessons.find((lesson) => lesson.id === row.systemLessonId) : undefined;
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
            {systemLesson?.status === "cancelled" && <Badge variant="destructive">{lessonStatusLabels[systemLesson.status]}</Badge>}
            {reviewed && <Badge variant="sky">{resolutionStatusLabel(resolutionStatus)}</Badge>}
            {resolvedAsMatched && <Badge variant="sage">已计入已对应</Badge>}
            {resolvedByLinkedImport && <Badge variant="plum">已被拆分合并关联</Badge>}
          </div>
          {isMatched && !detailsExpanded && (
            <>
              <div className="truncate text-sm font-extrabold leading-5 text-[#061226]">
                {row.startTime}-{row.endTime} · {row.matchedCourseId ? localCourseName(vault, row.matchedCourseId) : row.title}
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
            <Input
              value={resolution?.note ?? ""}
              onChange={(event) => onResolutionChange({ note: event.target.value })}
              placeholder="记录最终判断，例如：教务表人数错、云端已改、确认无需处理"
            />
          </div>
        </div>
      )}
    </div>
  );
}
