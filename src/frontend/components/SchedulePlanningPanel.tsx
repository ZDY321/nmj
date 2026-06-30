import { CalendarCheck, CalendarDays, CheckCircle2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TimeTextInput } from "@/components/ui/time-text-input";
import type { CourseGroup, TimePreset, Weekday } from "@/shared/types";
import { weekdayLabels } from "@/frontend/lib/helpers";

type DateShortcut = {
  label: string;
  value: string;
};

type SchedulePlanningPanelProps = {
  batchCandidateCount: number;
  batchConflictCount: number;
  batchLessonTargetCount: string;
  customPresetEnd: string;
  customPresetStart: string;
  customTimePresets: TimePreset[];
  dateShortcuts: DateShortcut[];
  isBatchDateRangeValid: boolean;
  isBatchTimeValid: boolean;
  isCustomPresetTimeValid: boolean;
  isSingleTimeValid: boolean;
  onAddCustomPreset: () => void;
  onAddSingleLesson: (status: "scheduled" | "completed") => void;
  onBatchGenerate: () => void;
  onDeleteCustomPreset: (preset: TimePreset) => void;
  onGoToCalendarScheduling: () => void;
  onToggleWeekday: (day: Weekday) => void;
  rangeEnd: string;
  rangeStart: string;
  ruleBillingHours: string;
  ruleCourseGroupId: string;
  ruleCourseOptions: CourseGroup[];
  ruleCourseSearch: string;
  ruleEndTime: string;
  ruleStartTime: string;
  ruleSuggestedBillingHours: number;
  selectedWeekdays: Weekday[];
  setBatchLessonTargetCount: (value: string) => void;
  setCustomPresetEnd: (value: string) => void;
  setCustomPresetStart: (value: string) => void;
  setRangeEnd: (value: string) => void;
  setRangeStart: (value: string) => void;
  setRuleCourseGroupId: (value: string) => void;
  setRuleBillingHours: (value: string) => void;
  setRuleCourseSearch: (value: string) => void;
  setRuleEndTime: (value: string) => void;
  setRuleStartTime: (value: string) => void;
  setSingleBillingHours: (value: string) => void;
  setSingleCourseGroupId: (value: string) => void;
  setSingleCourseSearch: (value: string) => void;
  setSingleDate: (value: string) => void;
  setSingleEndTime: (value: string) => void;
  setSingleStartTime: (value: string) => void;
  singleBillingHours: string;
  singleCourseGroupId: string;
  singleCourseOptions: CourseGroup[];
  singleCourseSearch: string;
  singleDate: string;
  singleEndTime: string;
  singleStartTime: string;
  singleSuggestedBillingHours: number;
  visibleWeekdays: Weekday[];
};

export function SchedulePlanningPanel({
  batchCandidateCount,
  batchConflictCount,
  batchLessonTargetCount,
  customPresetEnd,
  customPresetStart,
  customTimePresets,
  dateShortcuts,
  isBatchDateRangeValid,
  isBatchTimeValid,
  isCustomPresetTimeValid,
  isSingleTimeValid,
  onAddCustomPreset,
  onAddSingleLesson,
  onBatchGenerate,
  onDeleteCustomPreset,
  onGoToCalendarScheduling,
  onToggleWeekday,
  rangeEnd,
  rangeStart,
  ruleBillingHours,
  ruleCourseGroupId,
  ruleCourseOptions,
  ruleCourseSearch,
  ruleEndTime,
  ruleStartTime,
  ruleSuggestedBillingHours,
  selectedWeekdays,
  setBatchLessonTargetCount,
  setCustomPresetEnd,
  setCustomPresetStart,
  setRangeEnd,
  setRangeStart,
  setRuleBillingHours,
  setRuleCourseGroupId,
  setRuleCourseSearch,
  setRuleEndTime,
  setRuleStartTime,
  setSingleBillingHours,
  setSingleCourseGroupId,
  setSingleCourseSearch,
  setSingleDate,
  setSingleEndTime,
  setSingleStartTime,
  singleBillingHours,
  singleCourseGroupId,
  singleCourseOptions,
  singleCourseSearch,
  singleDate,
  singleEndTime,
  singleStartTime,
  singleSuggestedBillingHours,
  visibleWeekdays
}: SchedulePlanningPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
            <Plus size={14} /> 单次排课 / 补录
          </div>
          <CardTitle>添加课程时间</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">课程</label>
              <label className="relative block">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                <Input
                  value={singleCourseSearch}
                  onChange={(event) => setSingleCourseSearch(event.target.value)}
                  placeholder="搜索姓名、年级、校区或班型"
                  className="h-10 bg-white pl-9"
                />
              </label>
              <Select value={singleCourseGroupId} onChange={(event) => setSingleCourseGroupId(event.target.value)}>
                {singleCourseOptions.map((course) => (
                  <option key={course.id} value={course.id}>{course.name} · {course.subject}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">日期</label>
              <Input type="date" value={singleDate} onChange={(event) => setSingleDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">开始时间</label>
              <TimeTextInput value={singleStartTime} onValueChange={setSingleStartTime} className={!isSingleTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">结束时间</label>
              <TimeTextInput value={singleEndTime} onValueChange={setSingleEndTime} className={!isSingleTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
              {!isSingleTimeValid && (
                <div className="text-xs font-bold text-[#b91c1c]">结束时间必须晚于开始时间。</div>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">计费课时</label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={singleBillingHours}
                onChange={(event) => setSingleBillingHours(event.target.value)}
                placeholder={singleSuggestedBillingHours ? `自动 ${singleSuggestedBillingHours.toFixed(1)} 小时` : "自动按课程规则"}
              />
              <div className="rounded-[10px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2 text-xs font-semibold leading-5 text-[#64748b]">
                留空按课程规则自动建议；填写后本次课按手动计费课时保存。
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-2">
              <div className="text-sm font-medium">快捷日期</div>
              <div className="grid grid-cols-3 gap-2">
                {dateShortcuts.map((item) => (
                  <Button
                    key={item.label}
                    type="button"
                    size="sm"
                    variant={singleDate === item.value ? "default" : "outline"}
                    onClick={() => setSingleDate(item.value)}
                    className="h-10"
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">已保存时段</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {customTimePresets.map((preset) => {
                  const active = singleStartTime === preset.startTime && singleEndTime === preset.endTime;
                  return (
                    <Button
                      key={preset.id}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      onClick={() => {
                        setSingleStartTime(preset.startTime);
                        setSingleEndTime(preset.endTime);
                      }}
                      className="h-10"
                    >
                      {preset.label}
                    </Button>
                  );
                })}
                {customTimePresets.length === 0 && (
                  <div className="col-span-full rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] px-3 py-2 text-center text-xs font-semibold text-[#64748b]">
                    暂无自定义时段
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
            <div className="mb-3 text-sm font-medium">自定义常用时段</div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,140px)_minmax(0,140px)_minmax(122px,auto)]">
              <TimeTextInput value={customPresetStart} onValueChange={setCustomPresetStart} className={!isCustomPresetTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
              <TimeTextInput value={customPresetEnd} onValueChange={setCustomPresetEnd} className={!isCustomPresetTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
              <Button type="button" variant="outline" onClick={onAddCustomPreset} className="w-full" disabled={!isCustomPresetTimeValid}>
                <Plus size={15} /> 保存时段
              </Button>
            </div>
            {!isCustomPresetTimeValid && (
              <div className="mt-2 text-xs font-bold text-[#b91c1c]">常用时段的结束时间必须晚于开始时间。</div>
            )}
            {customTimePresets.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {customTimePresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onDeleteCustomPreset(preset)}
                    className="rounded-full border border-[#dbe4ef] bg-white px-3 py-1.5 text-xs font-bold text-[#25324a] transition-colors hover:border-[#fecaca] hover:bg-[#fff1f2] hover:text-[#b91c1c]"
                    title="点击删除自定义时段"
                  >
                    {preset.label === `${preset.startTime}-${preset.endTime}` ? preset.label : `${preset.label} ${preset.startTime}-${preset.endTime}`} ×
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] p-3 text-xs font-semibold text-[#64748b] sm:grid-cols-[1fr_auto] sm:items-center">
            <span>也可以切换到日历查看，直接点击日期完成排课。</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onGoToCalendarScheduling}
              disabled={!singleCourseGroupId}
              className="border-[#bfdbfe] bg-[#eaf2ff] text-[#1557c2] hover:bg-[#dbeafe] hover:text-[#0f3f8f]"
            >
              <CalendarDays size={14} /> 前往日历排课
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button type="button" onClick={() => onAddSingleLesson("scheduled")} disabled={!singleCourseGroupId}>
              <CalendarCheck size={16} /> 添加待上课
            </Button>
            <Button type="button" variant="outline" onClick={() => onAddSingleLesson("completed")} disabled={!singleCourseGroupId}>
              <CheckCircle2 size={16} /> 补录已完成
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
            <CalendarCheck size={14} /> 批量排课
          </div>
          <CardTitle>按日期范围生成课时</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2 text-xs font-semibold text-[#64748b]">
            批量排课按“日期开始到日期结束”与下方勾选星期叠加生成；只会生成范围内匹配星期的日期。需要逐日选择时，可以切换到日历查看后点击日期排课。
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">课程</label>
              <label className="relative block">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                <Input
                  value={ruleCourseSearch}
                  onChange={(event) => setRuleCourseSearch(event.target.value)}
                  placeholder="搜索姓名、年级、校区或班型"
                  className="h-10 bg-white pl-9"
                />
              </label>
              <Select value={ruleCourseGroupId} onChange={(event) => setRuleCourseGroupId(event.target.value)}>
                {ruleCourseOptions.map((course) => (
                  <option key={course.id} value={course.id}>{course.name} · {course.subject}</option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">开始</label>
                <TimeTextInput value={ruleStartTime} onValueChange={setRuleStartTime} className={!isBatchTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">结束</label>
                <TimeTextInput value={ruleEndTime} onValueChange={setRuleEndTime} className={!isBatchTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                {!isBatchTimeValid && (
                  <div className="text-xs font-bold text-[#b91c1c]">结束时间必须晚于开始时间。</div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">计费课时</label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={ruleBillingHours}
                  onChange={(event) => setRuleBillingHours(event.target.value)}
                  placeholder={ruleSuggestedBillingHours ? `自动 ${ruleSuggestedBillingHours.toFixed(1)} 小时` : "自动按课程规则"}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">日期开始</label>
                <Input type="date" value={rangeStart} max={rangeEnd} onChange={(event) => setRangeStart(event.target.value)} className={!isBatchDateRangeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">日期结束</label>
                <Input type="date" value={rangeEnd} min={rangeStart} onChange={(event) => setRangeEnd(event.target.value)} className={!isBatchDateRangeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                {!isBatchDateRangeValid && (
                  <div className="text-xs font-bold text-[#b91c1c]">结束日期不能早于开始日期。</div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">目标节数</label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={batchLessonTargetCount}
                  onChange={(event) => setBatchLessonTargetCount(event.target.value)}
                  placeholder="例如 20"
                />
                <div className="text-xs font-semibold text-[#64748b]">填写后按开始日期和星期自动计算结束日期。</div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">批量生成星期</p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {visibleWeekdays.map((day) => (
                <Button
                  key={day}
                  type="button"
                  variant={selectedWeekdays.includes(day) ? "default" : "outline"}
                  size="sm"
                  onClick={() => onToggleWeekday(day)}
                  className={selectedWeekdays.includes(day) ? "orange-gradient shadow-[0_10px_20px_rgba(255,134,23,0.18)]" : ""}
                >
                  {weekdayLabels[day]}
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2 text-sm font-extrabold text-[#25324a]">
            当前条件共 {batchCandidateCount} 节{batchConflictCount > 0 ? `，其中 ${batchConflictCount} 节会因时间冲突跳过` : ""}。
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!ruleCourseGroupId || selectedWeekdays.length === 0}
            onClick={onBatchGenerate}
          >
            <CalendarCheck size={16} /> 按日期范围生成待上课
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
