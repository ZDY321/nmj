import { useState } from "react";
import { ArrowRight, CalendarDays, CalendarRange, Check, Copy, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type {
  ScheduleDayReusePreview,
  ScheduleDayReusePreviewEntry,
  ScheduleDayReuseSkippedEntry,
  ScheduleRangeReusePreview
} from "@/frontend/lib/scheduleDayReuse";
import {
  campusName,
  courseName,
  courseSubject,
  lessonStatusLabels,
  lessonTimeRangeLabel
} from "@/frontend/lib/helpers";
import { isOrderedDateRange } from "@/frontend/lib/scheduleViewHelpers";
import type { Lesson, TeacherVault } from "@/shared/types";

type ScheduleDayReusePanelProps = {
  onApply: () => void;
  onApplyRange: () => void;
  onClearLessons: () => void;
  onSelectAllLessons: () => void;
  onToggleLesson: (lessonId: string) => void;
  onUsePreviousWeek: () => void;
  onUsePreviousWeekRange: () => void;
  preview: ScheduleDayReusePreview;
  rangePreview: ScheduleRangeReusePreview;
  rangeSourceDates: string[];
  rangeSourceEnd: string;
  rangeSourceStart: string;
  rangeTargetDates: string[];
  rangeTargetEnd: string;
  rangeTargetStart: string;
  selectableLessons: Lesson[];
  selectedLessonIds: string[];
  selectedLessons: Lesson[];
  setSourceDate: (value: string) => void;
  setTargetDate: (value: string) => void;
  setRangeSourceEnd: (value: string) => void;
  setRangeSourceStart: (value: string) => void;
  setRangeTargetEnd: (value: string) => void;
  setRangeTargetStart: (value: string) => void;
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
  onApplyRange,
  onClearLessons,
  onSelectAllLessons,
  onToggleLesson,
  onUsePreviousWeek,
  onUsePreviousWeekRange,
  preview,
  rangePreview,
  rangeSourceDates,
  rangeSourceEnd,
  rangeSourceStart,
  rangeTargetDates,
  rangeTargetEnd,
  rangeTargetStart,
  selectableLessons,
  selectedLessonIds,
  selectedLessons,
  setSourceDate,
  setTargetDate,
  setRangeSourceEnd,
  setRangeSourceStart,
  setRangeTargetEnd,
  setRangeTargetStart,
  sourceDate,
  sourceLessons,
  targetDate,
  vault
}: ScheduleDayReusePanelProps) {
  const [mode, setMode] = useState<"day" | "range">("day");
  const selectableIds = new Set(selectableLessons.map((lesson) => lesson.id));
  const datesAreValid = Boolean(sourceDate && targetDate && sourceDate !== targetDate);
  const canApply = datesAreValid && selectedLessons.length > 0 && (preview.createCount > 0 || preview.replaceCount > 0);

  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader className="border-b border-[#e8eef6]">
        <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
          <Copy size={14} /> 快速复用
        </div>
        <CardTitle>复用排课</CardTitle>
        <CardDescription>可以复用某一天或整段日期的课程；应用前先核对目标日期的最终课表。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <div className="grid grid-cols-2 gap-1 rounded-[8px] border border-[#dbe4ef] bg-[#f1f5f9] p-1" role="tablist" aria-label="复用排课方式">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "day"}
            onClick={() => setMode("day")}
            className={`flex h-10 items-center justify-center gap-2 rounded-[6px] px-3 text-sm font-extrabold transition-colors ${
              mode === "day" ? "bg-white text-[#1557c2] shadow-sm" : "text-[#64748b] hover:text-[#25324a]"
            }`}
          >
            <CalendarDays size={16} /> 单日复用
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "range"}
            onClick={() => setMode("range")}
            className={`flex h-10 items-center justify-center gap-2 rounded-[6px] px-3 text-sm font-extrabold transition-colors ${
              mode === "range" ? "bg-white text-[#1557c2] shadow-sm" : "text-[#64748b] hover:text-[#25324a]"
            }`}
          >
            <CalendarRange size={16} /> 日期范围复用
          </button>
        </div>

        {mode === "day" && (
          <>
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
                <SkippedPreviewRow key={`skip-${entry.sourceLesson.id}`} entry={entry} vault={vault} />
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
          </>
        )}

        {mode === "range" && (
          <RangeReuseContent
            onApply={onApplyRange}
            onUsePreviousWeek={onUsePreviousWeekRange}
            preview={rangePreview}
            setSourceEnd={setRangeSourceEnd}
            setSourceStart={setRangeSourceStart}
            setTargetEnd={setRangeTargetEnd}
            setTargetStart={setRangeTargetStart}
            sourceDates={rangeSourceDates}
            sourceEnd={rangeSourceEnd}
            sourceStart={rangeSourceStart}
            targetDates={rangeTargetDates}
            targetEnd={rangeTargetEnd}
            targetStart={rangeTargetStart}
            vault={vault}
          />
        )}
      </CardContent>
    </Card>
  );
}

function RangeReuseContent({
  onApply,
  onUsePreviousWeek,
  preview,
  setSourceEnd,
  setSourceStart,
  setTargetEnd,
  setTargetStart,
  sourceDates,
  sourceEnd,
  sourceStart,
  targetDates,
  targetEnd,
  targetStart,
  vault
}: {
  onApply: () => void;
  onUsePreviousWeek: () => void;
  preview: ScheduleRangeReusePreview;
  setSourceEnd: (value: string) => void;
  setSourceStart: (value: string) => void;
  setTargetEnd: (value: string) => void;
  setTargetStart: (value: string) => void;
  sourceDates: string[];
  sourceEnd: string;
  sourceStart: string;
  targetDates: string[];
  targetEnd: string;
  targetStart: string;
  vault: TeacherVault;
}) {
  const sourceIsOrdered = isOrderedDateRange(sourceStart, sourceEnd);
  const targetIsOrdered = isOrderedDateRange(targetStart, targetEnd);
  const dayCountsMatch = sourceDates.length > 0 && sourceDates.length === targetDates.length;
  const hasSameDateMapping = dayCountsMatch && sourceDates.some((date, index) => date === targetDates[index]);
  const datesAreValid = sourceIsOrdered && targetIsOrdered && dayCountsMatch && !hasSameDateMapping;
  const canApply = datesAreValid && preview.sourceLessonCount > 0 && preview.createCount + preview.replaceCount > 0;
  const visiblePreviewDays = preview.days.filter(
    (day) => day.sourceLessonCount > 0 || day.preview.targetLessons.length > 0
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-extrabold text-[#061226]">按日期顺序一一对应复用</div>
          <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">目标范围与来源范围需要天数一致，系统会逐天复用全部可用课程。</div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onUsePreviousWeek} disabled={!targetStart || !targetEnd}>
          <RotateCcw size={14} /> 来源设为目标前一周
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RangeDateFields
          accent="target"
          end={targetEnd}
          label="1. 要排课的目标范围"
          onEndChange={setTargetEnd}
          onStartChange={setTargetStart}
          start={targetStart}
          valid={targetIsOrdered}
        />
        <RangeDateFields
          accent="source"
          end={sourceEnd}
          label="2. 复用的来源范围"
          onEndChange={setSourceEnd}
          onStartChange={setSourceStart}
          start={sourceStart}
          valid={sourceIsOrdered}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={dayCountsMatch ? "secondary" : "yellow"}>{sourceDates.length} 天来源 → {targetDates.length} 天目标</Badge>
        <Badge variant="secondary">来源 {preview.sourceLessonCount} 节</Badge>
        {preview.unavailableCount > 0 && <Badge variant="yellow">课程不可用 {preview.unavailableCount} 节</Badge>}
        {hasSameDateMapping && <Badge variant="destructive">来源与目标包含相同日期</Badge>}
      </div>

      {!datesAreValid && (
        <div className="rounded-[8px] border border-[#fca5a5] bg-[#fff1f2] px-3 py-2 text-sm font-bold text-[#b91c1c]">
          {!sourceIsOrdered || !targetIsOrdered
            ? "日期范围的结束日期不能早于开始日期。"
            : hasSameDateMapping
              ? "来源日期和对应的目标日期不能相同。"
              : "来源范围和目标范围的天数需要保持一致。"}
        </div>
      )}

      <section className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-extrabold text-[#061226]">范围应用后预览</div>
            <div className="mt-1 text-xs font-semibold text-[#64748b]">按每个目标日期核对最终课表</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="sage">新增 {preview.createCount}</Badge>
            <Badge variant="amber">覆盖 {preview.replaceCount}</Badge>
            <Badge variant="secondary">保留 {preview.keepCount}</Badge>
            {preview.skippedCount > 0 && <Badge variant="destructive">跳过 {preview.skippedCount}</Badge>}
          </div>
        </div>
        <div className="max-h-[460px] space-y-3 overflow-y-auto pr-1">
          {datesAreValid && visiblePreviewDays.map((day) => (
            <div key={`${day.sourceDate}-${day.targetDate}`} className="rounded-[8px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-extrabold text-[#061226]">
                  来源 {day.sourceDate} <span className="px-1 text-[#94a3b8]">→</span> 目标 {day.targetDate}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="sage">新增 {day.preview.createCount}</Badge>
                  <Badge variant="amber">覆盖 {day.preview.replaceCount}</Badge>
                  <Badge variant="secondary">保留 {day.preview.keepCount}</Badge>
                  {day.preview.skippedEntries.length > 0 && <Badge variant="destructive">跳过 {day.preview.skippedEntries.length}</Badge>}
                </div>
              </div>
              <div className="space-y-2">
                {day.preview.finalEntries.map((entry) => (
                  <PreviewRow key={`${entry.outcome}-${entry.lesson.id}`} entry={entry} vault={vault} />
                ))}
                {day.preview.skippedEntries.map((entry) => (
                  <SkippedPreviewRow key={`skip-${entry.sourceLesson.id}`} entry={entry} vault={vault} />
                ))}
                {day.preview.finalEntries.length === 0 && day.preview.skippedEntries.length === 0 && (
                  <div className="rounded-[8px] border border-dashed border-[#cbd6e3] bg-white p-4 text-center text-xs font-semibold text-[#64748b]">
                    来源当天和目标当天都没有课程
                  </div>
                )}
              </div>
            </div>
          ))}
          {(!datesAreValid || visiblePreviewDays.length === 0) && (
            <div className="rounded-[8px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-6 text-center text-sm font-semibold text-[#64748b]">
              {datesAreValid ? "所选来源和目标范围内都没有课程" : "选择天数相同的来源和目标范围后，这里会按天显示最终课表"}
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-col gap-3 border-t border-[#e8eef6] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-semibold text-[#64748b]">
          可写入 {preview.createCount + preview.replaceCount} 节；不同课程时间冲突会跳过，原有课程会保留。
        </div>
        <Button type="button" onClick={onApply} disabled={!canApply} className="sm:min-w-[190px]">
          <Check size={16} /> 确认应用日期范围
        </Button>
      </div>
    </div>
  );
}

function RangeDateFields({
  accent,
  end,
  label,
  onEndChange,
  onStartChange,
  start,
  valid
}: {
  accent: "target" | "source";
  end: string;
  label: string;
  onEndChange: (value: string) => void;
  onStartChange: (value: string) => void;
  start: string;
  valid: boolean;
}) {
  return (
    <div className={`rounded-[8px] border p-3 ${accent === "target" ? "border-[#bfdbfe] bg-[#eff6ff]" : "border-[#fed7aa] bg-[#fff7ed]"}`}>
      <div className={`mb-3 text-sm font-extrabold ${accent === "target" ? "text-[#1557c2]" : "text-[#c2410c]"}`}>{label}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-bold text-[#475569]">开始日期</label>
          <Input type="date" value={start} onChange={(event) => onStartChange(event.target.value)} className={!valid ? "border-[#fca5a5] bg-white" : "bg-white"} />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-[#475569]">结束日期</label>
          <Input type="date" value={end} min={start} onChange={(event) => onEndChange(event.target.value)} className={!valid ? "border-[#fca5a5] bg-white" : "bg-white"} />
        </div>
      </div>
    </div>
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

function SkippedPreviewRow({ entry, vault }: { entry: ScheduleDayReuseSkippedEntry; vault: TeacherVault }) {
  return (
    <div className="rounded-[8px] border border-[#fecaca] bg-[#fff1f2] px-3 py-3 text-sm text-[#991b1b]">
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
  );
}
