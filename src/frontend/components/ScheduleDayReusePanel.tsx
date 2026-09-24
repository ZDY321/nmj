import { ArrowRight, Check, Copy, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ScheduleDayReusePreview, ScheduleDayReusePreviewEntry } from "@/frontend/lib/scheduleDayReuse";
import {
  campusName,
  courseName,
  courseSubject,
  lessonStatusLabels,
  lessonTimeRangeLabel
} from "@/frontend/lib/helpers";
import type { Lesson, TeacherVault } from "@/shared/types";

type ScheduleDayReusePanelProps = {
  onApply: () => void;
  onClearLessons: () => void;
  onSelectAllLessons: () => void;
  onToggleLesson: (lessonId: string) => void;
  onUsePreviousWeek: () => void;
  preview: ScheduleDayReusePreview;
  selectableLessons: Lesson[];
  selectedLessonIds: string[];
  selectedLessons: Lesson[];
  setSourceDate: (value: string) => void;
  setTargetDate: (value: string) => void;
  sourceDate: string;
  sourceLessons: Lesson[];
  targetDate: string;
  vault: TeacherVault;
};

const outcomeLabels = {
  create: "将新增",
  replace: "将覆盖",
  keep: "原有保留"
} as const;

const outcomeVariants = {
  create: "sage",
  replace: "amber",
  keep: "secondary"
} as const;

export function ScheduleDayReusePanel({
  onApply,
  onClearLessons,
  onSelectAllLessons,
  onToggleLesson,
  onUsePreviousWeek,
  preview,
  selectableLessons,
  selectedLessonIds,
  selectedLessons,
  setSourceDate,
  setTargetDate,
  sourceDate,
  sourceLessons,
  targetDate,
  vault
}: ScheduleDayReusePanelProps) {
  const selectableIds = new Set(selectableLessons.map((lesson) => lesson.id));
  const datesAreValid = Boolean(sourceDate && targetDate && sourceDate !== targetDate);
  const canApply = datesAreValid && selectedLessons.length > 0 && (preview.createCount > 0 || preview.replaceCount > 0);

  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader className="border-b border-[#e8eef6]">
        <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
          <Copy size={14} /> 快速复用
        </div>
        <CardTitle>复用某天排课</CardTitle>
        <CardDescription>选择要排课的目标日期，再选择一个已有排课日期作为来源；应用前可核对目标日的最终课表。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium">1. 要排课的日期</label>
            <Input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">2. 复用哪一天的排课</label>
            <Input type="date" value={sourceDate} onChange={(event) => setSourceDate(event.target.value)} />
          </div>
          <Button type="button" variant="outline" onClick={onUsePreviousWeek} disabled={!targetDate} className="h-10">
            <RotateCcw size={15} /> 复用上周同日
          </Button>
        </div>

        {!datesAreValid && sourceDate && targetDate && (
          <div className="rounded-[8px] border border-[#fca5a5] bg-[#fff1f2] px-3 py-2 text-sm font-bold text-[#b91c1c]">
            来源日期和目标日期不能相同。
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.9fr)_auto_minmax(0,1.1fr)]">
          <section className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-extrabold text-[#061226]">来源课节</div>
                <div className="mt-1 text-xs font-semibold text-[#64748b]">{sourceDate || "未选择日期"}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">已选 {selectedLessons.length}/{selectableLessons.length}</Badge>
                <Button type="button" size="sm" variant="outline" onClick={onSelectAllLessons} disabled={selectableLessons.length === 0}>全选</Button>
                <Button type="button" size="sm" variant="outline" onClick={onClearLessons} disabled={selectedLessons.length === 0}>清空</Button>
              </div>
            </div>
            <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {sourceLessons.map((lesson) => {
                const selectable = selectableIds.has(lesson.id);
                return (
                  <label
                    key={lesson.id}
                    className={`flex items-start gap-3 rounded-[8px] border px-3 py-3 text-sm ${
                      selectable ? "border-[#dbe4ef] bg-white text-[#25324a]" : "border-[#e2e8f0] bg-[#f8fafc] text-[#94a3b8]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedLessonIds.includes(lesson.id)}
                      onChange={() => onToggleLesson(lesson.id)}
                      disabled={!selectable}
                      className="mt-1 h-4 w-4 accent-[#1557c2]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-extrabold">{lessonTimeRangeLabel(lesson)} · {courseName(vault, lesson.courseGroupId)}</span>
                      <span className="mt-1 block text-xs font-semibold">
                        {courseSubject(vault, lesson.courseGroupId)} · {campusName(vault, lesson.campusId)} · {lessonStatusLabels[lesson.status]}
                        {!selectable ? " · 当前课程不可排" : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
              {sourceLessons.length === 0 && (
                <div className="rounded-[8px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-6 text-center text-sm font-semibold text-[#64748b]">
                  该日期没有可复用的排课
                </div>
              )}
            </div>
          </section>

          <div className="hidden items-center justify-center text-[#94a3b8] xl:flex">
            <ArrowRight size={24} />
          </div>

          <section className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-extrabold text-[#061226]">应用后目标日预览</div>
                <div className="mt-1 text-xs font-semibold text-[#64748b]">{targetDate || "未选择日期"}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="sage">新增 {preview.createCount}</Badge>
                <Badge variant="amber">覆盖 {preview.replaceCount}</Badge>
                <Badge variant="secondary">保留 {preview.keepCount}</Badge>
                {preview.skippedEntries.length > 0 && <Badge variant="destructive">跳过 {preview.skippedEntries.length}</Badge>}
              </div>
            </div>
            <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {preview.finalEntries.map((entry) => (
                <PreviewRow key={`${entry.outcome}-${entry.lesson.id}`} entry={entry} vault={vault} />
              ))}
              {preview.skippedEntries.map((entry) => (
                <div key={`skip-${entry.sourceLesson.id}`} className="rounded-[8px] border border-[#fecaca] bg-[#fff1f2] px-3 py-3 text-sm text-[#991b1b]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-extrabold">{lessonTimeRangeLabel(entry.sourceLesson)} · {courseName(vault, entry.sourceLesson.courseGroupId)}</span>
                    <Badge variant="destructive">不会加入</Badge>
                  </div>
                  <div className="mt-1 text-xs font-semibold leading-5">
                    {entry.reason === "course_unavailable"
                      ? "课程已结课或没有在读学生"
                      : `与目标日其他课程冲突：${entry.conflictingLessons.map((lesson) => `${lessonTimeRangeLabel(lesson)} ${courseName(vault, lesson.courseGroupId)}`).join("、")}`}
                  </div>
                </div>
              ))}
              {preview.finalEntries.length === 0 && preview.skippedEntries.length === 0 && (
                <div className="rounded-[8px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-6 text-center text-sm font-semibold text-[#64748b]">
                  勾选来源课节后，这里会显示最终课表
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-3 border-t border-[#e8eef6] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-[#64748b]">
            最终共 {preview.finalEntries.length} 节课；不同课程发生时间冲突时会保留原课并跳过复用课节。
          </div>
          <Button type="button" onClick={onApply} disabled={!canApply} className="sm:min-w-[180px]">
            <Check size={16} /> 确认应用到目标日
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewRow({ entry, vault }: { entry: ScheduleDayReusePreviewEntry; vault: TeacherVault }) {
  return (
    <div className="rounded-[8px] border border-[#dbe4ef] bg-white px-3 py-3 text-sm text-[#25324a]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-extrabold">{lessonTimeRangeLabel(entry.lesson)} · {courseName(vault, entry.lesson.courseGroupId)}</span>
        <Badge variant={outcomeVariants[entry.outcome]}>{outcomeLabels[entry.outcome]}</Badge>
      </div>
      <div className="mt-1 text-xs font-semibold text-[#64748b]">
        {courseSubject(vault, entry.lesson.courseGroupId)} · {campusName(vault, entry.lesson.campusId)}
        {entry.outcome === "replace" ? ` · 替换 ${entry.replacedLessons.length} 节同课程安排` : ""}
      </div>
    </div>
  );
}
