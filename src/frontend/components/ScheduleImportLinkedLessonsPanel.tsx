import { Badge } from "@/components/ui/badge";
import type { Lesson, ScheduleImportResolution, ScheduleImportResolutionStatus, TeacherVault } from "@/shared/types";
import { campusName, courseName as localCourseName, courseSubject, courseTypeLabel, studentNames } from "@/frontend/lib/helpers";

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
  lessonCampusId,
  lessonDurationHours
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
  lessonDurationHours: (lesson: Pick<Lesson, "startTime" | "endTime">) => number;
}) {
  return (
    <div className="rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-extrabold text-[#061226]">关联云端课节</div>
          <div className="mt-1 text-[11px] font-semibold leading-5 text-[#64748b]">
            用于处理教务一节课对应云端多节课、跨日期记录或拆分合并记录。选中后会保存对应课节 ID，并计入“拆分合并正常”。
          </div>
        </div>
        {linkedLessonCount > 0 && (
          <Badge variant="plum" className="w-fit text-[10px]">
            已关联 {linkedLessonCount} 节 · 云端 {systemHours.toFixed(1)}h / 教务 {importHours.toFixed(1)}h
          </Badge>
        )}
      </div>
      <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1">
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
                  const current = new Set(resolution?.linkedSystemLessonIds ?? []);
                  if (event.target.checked) {
                    current.add(candidate.id);
                  } else {
                    current.delete(candidate.id);
                  }
                  const nextIds = Array.from(current);
                  onChange({
                    status: nextIds.length > 0 ? "split_merge_ok" : resolutionStatus,
                    linkedSystemLessonIds: nextIds,
                    note: nextIds.length > 0
                      ? "已关联云端拆分/合并课节，人工确认按同一课程课时处理。"
                      : resolution?.note
                  });
                }}
                className="mt-1 h-4 w-4 accent-[#5161d6]"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-extrabold text-[#061226]">
                    {candidate.date} {candidate.startTime}-{candidate.endTime}
                  </span>
                  <Badge variant={candidate.score >= 4 ? "sage" : candidate.score >= 2 ? "yellow" : "secondary"} className="text-[10px]">
                    {candidate.scoreLabel}
                  </Badge>
                </div>
                <div className="mt-1 text-[11px] font-semibold leading-5 text-[#64748b]">
                  {localCourseName(vault, candidate.courseGroupId)} · {courseSubject(vault, candidate.courseGroupId)} · {courseTypeLabel(vault, candidate.type)} · {campusName(vault, lessonCampusId(vault, candidate))}
                </div>
                <div className="mt-0.5 text-[11px] font-semibold leading-5 text-[#94a3b8]">
                  {studentNames(vault, candidate.expectedStudentIds) || "未设置学生"} · {lessonDurationHours(candidate).toFixed(1)} 小时
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
      </div>
    </div>
  );
}
