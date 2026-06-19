import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Lesson, ScheduleImportResolution, ScheduleImportResolutionStatus, TeacherVault } from "@/shared/types";
import { campusName, courseName as localCourseName, courseSubject, courseTypeLabel, lessonStatusLabels, lessonTimeRangeLabel, studentNames } from "@/frontend/lib/helpers";

type SplitMergeCandidate = Lesson & { score: number; scoreLabel: string };

export function ScheduleImportLinkedLessonsPanel({
  vault,
  resolution,
  resolutionStatus,
  linkedLessonCount,
  importHours,
  systemHours,
  candidates,
  onChange,
  lessonCampusId
}: {
  vault: TeacherVault;
  resolution?: ScheduleImportResolution;
  resolutionStatus: ScheduleImportResolutionStatus;
  linkedLessonCount: number;
  importHours: number;
  systemHours: number;
  candidates: SplitMergeCandidate[];
  onChange: (patch: Partial<Pick<ScheduleImportResolution, "status" | "note" | "linkedSystemLessonIds">>) => void;
  lessonCampusId: (vault: TeacherVault, lesson: Lesson) => string | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const selectedLinkCount = resolution?.linkedSystemLessonIds?.length ?? 0;
  const linkedSummaryLabel = `已关联 ${linkedLessonCount} 节 · 云端 ${systemHours.toFixed(1)}h / 教务 ${importHours.toFixed(1)}h`;

  return (
    <div className="rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
      <div className="space-y-2">
        <div className="min-w-0">
          <div className="text-xs font-extrabold text-[#061226]">关联云端课节</div>
          <div className="mt-1 text-[11px] font-semibold leading-5 text-[#64748b]">
            用于处理教务一节课对应云端多节课、跨日期记录或拆分合并记录。选中后会保存对应课节 ID，并计入“拆分合并正常”。
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {selectedLinkCount > 0 && (
            <Badge variant="plum" className="max-w-full text-[10px]" title={linkedSummaryLabel}>
              <span className="block min-w-0 truncate">{linkedSummaryLabel}</span>
            </Badge>
          )}
          <div className="flex flex-wrap gap-2">
            {selectedLinkCount > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-fit shrink-0 px-2 text-xs"
                onClick={() => onChange({
                  linkedSystemLessonIds: [],
                  ...(resolutionStatus === "split_merge_ok" ? { status: "unreviewed", note: "" } : {})
                })}
              >
                清除关联
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" className="h-8 w-fit shrink-0 px-2 text-xs" onClick={() => setExpanded((current) => !current)}>
              <ChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
              {expanded ? "收起" : "展开"}
            </Button>
          </div>
        </div>
      </div>
      {expanded && <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1">
        {candidates.map((candidate) => {
          const checked = Boolean(resolution?.linkedSystemLessonIds?.includes(candidate.id));
          return (
            <label
              key={candidate.id}
              className={`flex cursor-pointer items-start gap-2 rounded-[10px] border px-3 py-2 transition-colors ${
                checked ? "border-[#5161d6] bg-[#eef0ff]" : "border-[#e8eef6] bg-white hover:bg-[#f8fbff]"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => {
                  const existingLessonIds = new Set(vault.lessons.map((lesson) => lesson.id));
                  const current = new Set((resolution?.linkedSystemLessonIds ?? []).filter((lessonId) => existingLessonIds.has(lessonId)));
                  if (event.target.checked) {
                    current.add(candidate.id);
                  } else {
                    current.delete(candidate.id);
                  }
                  const nextIds = Array.from(current);
                  const nextStatus = nextIds.length > 0 ? "split_merge_ok" : resolutionStatus === "split_merge_ok" ? "unreviewed" : resolutionStatus;
                  onChange({
                    status: nextStatus,
                    linkedSystemLessonIds: nextIds,
                    note: nextIds.length > 0
                      ? "已关联云端拆分/合并课节，人工确认按同一课程课时处理。"
                      : nextStatus === "unreviewed" ? "" : resolution?.note
                  });
                }}
                className="mt-1 h-4 w-4 accent-[#5161d6]"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-extrabold text-[#061226]">
                    {candidate.date} {lessonTimeRangeLabel(candidate)}
                  </span>
                  <Badge variant={candidate.score >= 4 ? "sage" : candidate.score >= 2 ? "yellow" : "secondary"} className="text-[10px]">
                    {candidate.scoreLabel}
                  </Badge>
                  {candidate.status === "cancelled" && (
                    <Badge variant="destructive" className="text-[10px]">
                      {lessonStatusLabels[candidate.status]}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 text-[11px] font-semibold leading-5 text-[#64748b]">
                  {localCourseName(vault, candidate.courseGroupId)} · {courseSubject(vault, candidate.courseGroupId)} · {courseTypeLabel(vault, candidate.type)} · {campusName(vault, lessonCampusId(vault, candidate))}
                </div>
                <div className="mt-0.5 text-[11px] font-semibold leading-5 text-[#94a3b8]">
                  {studentNames(vault, candidate.expectedStudentIds) || "未设置学生"}
                </div>
              </div>
            </label>
          );
        })}
        {candidates.length === 0 && (
          <div className="rounded-[10px] border border-dashed border-[#cbd6e3] bg-white p-4 text-center text-xs font-semibold text-[#64748b]">
            暂无可关联的云端课节
          </div>
        )}
      </div>}
    </div>
  );
}
