import { CalendarCheck, CalendarDays, CheckCircle2, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
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

export type WeeklySchedulePatternSlot = {
  id: string;
  courseGroupId: string;
  weekdays: Weekday[];
  startTime: string;
  endTime: string;
  billingHours: string;
};

export type BatchTimeGroup = {
  id: string;
  startTime: string;
  endTime: string;
  billingHours: string;
  weekdays: Weekday[];
};

export type BatchRepeatMode = "end_date" | "weeks";

type SchedulePlanningPanelProps = {
  batchCandidateCount: number;
  batchConflictCount: number;
  batchEffectiveRangeEnd: string;
  batchLessonTargetCount: string;
  batchPerDayConflictCount: number;
  batchPerDayGroupCounts: Array<{ groupId: string; count: number; conflictCount: number }>;
  batchPerDayMode: boolean;
  batchPerDayTotalCount: number;
  batchPerDayUnassignedWeekdays: Weekday[];
  batchRepeatMode: BatchRepeatMode;
  batchRepeatWeeks: string;
  batchTimeGroups: BatchTimeGroup[];
  customPresetEnd: string;
  customPresetStart: string;
  customTimePresets: TimePreset[];
  dateShortcuts: DateShortcut[];
  isBatchDateRangeValid: boolean;
  isBatchRepeatWeeksValid: boolean;
  isBatchTimeValid: boolean;
  isCustomPresetTimeValid: boolean;
  isSingleTimeValid: boolean;
  onAddBatchTimeGroup: () => void;
  onAddCustomPreset: () => void;
  onAddSingleLesson: (status: "scheduled" | "completed") => void;
  onAddWeeklyPatternSlot: () => void;
  onApplyWeeklyPatternSlot: (slot: WeeklySchedulePatternSlot) => void;
  onBatchGenerate: () => void;
  onDeleteBatchTimeGroup: (id: string) => void;
  onDeleteCustomPreset: (preset: TimePreset) => void;
  onDeleteWeeklyPatternSlot: (slotId: string) => void;
  onGenerateWeeklyPattern: () => void;
  onGoToCalendarScheduling: () => void;
  onSetBatchPerDayMode: (value: boolean) => void;
  onToggleBatchTimeGroupWeekday: (groupId: string, day: Weekday) => void;
  onToggleWeekday: (day: Weekday) => void;
  onUpdateBatchTimeGroup: (id: string, updates: Partial<Omit<BatchTimeGroup, "id">>) => void;
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
  setBatchRepeatMode: (value: BatchRepeatMode) => void;
  setBatchRepeatWeeks: (value: string) => void;
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
  weeklyPatternCandidateCount: number;
  weeklyPatternConflictCount: number;
  weeklyPatternCourseOptions: CourseGroup[];
  weeklyPatternCreatableCount: number;
  weeklyPatternInvalidSlotCount: number;
  weeklyPatternSlots: WeeklySchedulePatternSlot[];
};

export function SchedulePlanningPanel({
  batchCandidateCount,
  batchConflictCount,
  batchEffectiveRangeEnd,
  batchLessonTargetCount,
  batchPerDayConflictCount,
  batchPerDayGroupCounts,
  batchPerDayMode,
  batchPerDayTotalCount,
  batchPerDayUnassignedWeekdays,
  batchRepeatMode,
  batchRepeatWeeks,
  batchTimeGroups,
  customPresetEnd,
  customPresetStart,
  customTimePresets,
  dateShortcuts,
  isBatchDateRangeValid,
  isBatchRepeatWeeksValid,
  isBatchTimeValid,
  isCustomPresetTimeValid,
  isSingleTimeValid,
  onAddBatchTimeGroup,
  onAddCustomPreset,
  onAddSingleLesson,
  onAddWeeklyPatternSlot,
  onApplyWeeklyPatternSlot,
  onBatchGenerate,
  onDeleteBatchTimeGroup,
  onDeleteCustomPreset,
  onDeleteWeeklyPatternSlot,
  onGenerateWeeklyPattern,
  onGoToCalendarScheduling,
  onSetBatchPerDayMode,
  onToggleBatchTimeGroupWeekday,
  onToggleWeekday,
  onUpdateBatchTimeGroup,
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
  setBatchRepeatMode,
  setBatchRepeatWeeks,
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
  visibleWeekdays,
  weeklyPatternCandidateCount,
  weeklyPatternConflictCount,
  weeklyPatternCourseOptions,
  weeklyPatternCreatableCount,
  weeklyPatternInvalidSlotCount,
  weeklyPatternSlots
}: SchedulePlanningPanelProps) {
  const weeklyPatternCourseById = new Map(weeklyPatternCourseOptions.map((course) => [course.id, course]));
  const currentRuleCanJoinWeeklyPattern = Boolean(ruleCourseGroupId && selectedWeekdays.length > 0 && isBatchTimeValid);

  function weeklyPatternSlotWeekdayLabel(slot: WeeklySchedulePatternSlot): string {
    const labels = visibleWeekdays.filter((day) => slot.weekdays.includes(day)).map((day) => weekdayLabels[day]);
    return labels.length > 0 ? labels.join("、") : "未选星期";
  }

  function weeklyPatternSlotBillingLabel(slot: WeeklySchedulePatternSlot): string {
    const trimmed = slot.billingHours.trim();
    if (!trimmed) return "计费自动";
    const hours = Number(trimmed);
    return Number.isFinite(hours) ? `计费 ${Math.max(hours, 0)} 小时` : "计费自动";
  }

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
          <CardTitle>批量生成课时</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2 text-xs font-semibold text-[#64748b]">
            批量排课可按结束日期生成，也可按重复周数向后循环生成；只会生成范围内匹配星期的日期。
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
            {batchPerDayMode ? (
              <div className="space-y-3">
                {batchTimeGroups.map((group, groupIndex) => {
                  const groupCount = batchPerDayGroupCounts.find((g) => g.groupId === group.id);
                  const groupWeekdayLabels = selectedWeekdays.filter((d) => group.weekdays.includes(d)).map((d) => weekdayLabels[d]);
                  return (
                    <div key={group.id} className="rounded-[12px] border border-[#dbe4ef] bg-white p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#64748b]">时间组 {groupIndex + 1}</span>
                        {batchTimeGroups.length > 1 && (
                          <button type="button" onClick={() => onDeleteBatchTimeGroup(group.id)} className="ml-auto text-[#94a3b8] hover:text-[#b91c1c]">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[#64748b]">开始</label>
                          <TimeTextInput value={group.startTime} onValueChange={(v) => onUpdateBatchTimeGroup(group.id, { startTime: v })} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[#64748b]">结束</label>
                          <TimeTextInput value={group.endTime} onValueChange={(v) => onUpdateBatchTimeGroup(group.id, { endTime: v })} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[#64748b]">计费课时</label>
                          <Input
                            type="number"
                            min={0}
                            step={0.5}
                            value={group.billingHours}
                            onChange={(event) => onUpdateBatchTimeGroup(group.id, { billingHours: event.target.value })}
                            placeholder={ruleSuggestedBillingHours ? `自动 ${ruleSuggestedBillingHours.toFixed(1)}` : "自动"}
                          />
                        </div>
                        <div className="flex items-end">
                          {groupCount && (
                            <span className="text-xs font-semibold text-[#64748b]">
                              {groupCount.count} 节{groupCount.conflictCount > 0 ? `（${groupCount.conflictCount} 冲突）` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {selectedWeekdays.map((day) => (
                          <button
                            key={day}
                            type="button"
                            onClick={() => onToggleBatchTimeGroupWeekday(group.id, day)}
                            className={`rounded-md px-2 py-0.5 text-xs font-bold transition-colors ${group.weekdays.includes(day) ? "bg-[#1557c2] text-white" : "bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]"}`}
                          >
                            {weekdayLabels[day]}
                          </button>
                        ))}
                      </div>
                      {groupWeekdayLabels.length > 0 && (
                        <div className="text-xs text-[#64748b]">已选: {groupWeekdayLabels.join("、")}</div>
                      )}
                    </div>
                  );
                })}
                <Button type="button" variant="outline" size="sm" onClick={onAddBatchTimeGroup} className="w-full border-dashed">
                  <Plus size={14} /> 添加时间组
                </Button>
                {batchPerDayUnassignedWeekdays.length > 0 && (
                  <div className="rounded-[8px] border border-[#fca5a5] bg-[#fff1f2] px-3 py-2 text-xs font-bold text-[#b91c1c]">
                    以下星期未分配到任何时间组: {batchPerDayUnassignedWeekdays.map((d) => weekdayLabels[d]).join("、")}
                  </div>
                )}
              </div>
            ) : (
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
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">生成方式</label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={batchRepeatMode === "end_date" ? "default" : "outline"}
                  onClick={() => setBatchRepeatMode("end_date")}
                  className={batchRepeatMode === "end_date" ? "orange-gradient shadow-[0_10px_20px_rgba(255,134,23,0.18)]" : ""}
                >
                  按结束日期
                </Button>
                <Button
                  type="button"
                  variant={batchRepeatMode === "weeks" ? "default" : "outline"}
                  onClick={() => setBatchRepeatMode("weeks")}
                  className={batchRepeatMode === "weeks" ? "orange-gradient shadow-[0_10px_20px_rgba(255,134,23,0.18)]" : ""}
                >
                  按周重复
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">日期开始</label>
                <Input
                  type="date"
                  value={rangeStart}
                  max={batchRepeatMode === "end_date" ? rangeEnd : undefined}
                  onChange={(event) => setRangeStart(event.target.value)}
                  className={!isBatchDateRangeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined}
                />
              </div>
              {batchRepeatMode === "end_date" ? (
                <>
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
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">重复周数</label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={batchRepeatWeeks}
                      onChange={(event) => setBatchRepeatWeeks(event.target.value)}
                      placeholder="例如 8"
                      className={!isBatchRepeatWeeksValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined}
                    />
                    {!isBatchRepeatWeeksValid ? (
                      <div className="text-xs font-bold text-[#b91c1c]">重复周数至少为 1。</div>
                    ) : (
                      <div className="text-xs font-semibold text-[#64748b]">从开始日期起向后 {batchRepeatWeeks || 0} 周。</div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">实际结束日期</label>
                    <div className="flex h-10 items-center rounded-md border border-[#dbe4ef] bg-white px-3 text-sm font-bold text-[#25324a]">
                      {batchEffectiveRangeEnd || "未计算"}
                    </div>
                    <div className="text-xs font-semibold text-[#64748b]">按选择的星期和时间自动向后重复生成。</div>
                  </div>
                </>
              )}
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

          {selectedWeekdays.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium">按日分时</label>
              <button
                type="button"
                role="switch"
                aria-checked={batchPerDayMode}
                onClick={() => onSetBatchPerDayMode(!batchPerDayMode)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${batchPerDayMode ? "bg-[#1557c2]" : "bg-[#cbd6e3]"}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${batchPerDayMode ? "translate-x-5" : "translate-x-0"}`} />
              </button>
              <span className="text-xs font-semibold text-[#64748b]">不同星期使用不同上课时间</span>
            </div>
          )}

          <div className="rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2 text-sm font-extrabold text-[#25324a]">
            {batchPerDayMode
              ? `分时共 ${batchPerDayTotalCount} 节${batchPerDayConflictCount > 0 ? `，其中 ${batchPerDayConflictCount} 节会因时间冲突跳过` : ""}。`
              : `当前条件共 ${batchCandidateCount} 节${batchConflictCount > 0 ? `，其中 ${batchConflictCount} 节会因时间冲突跳过` : ""}。`}
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={batchPerDayMode ? !ruleCourseGroupId || batchTimeGroups.length === 0 : !ruleCourseGroupId || selectedWeekdays.length === 0}
            onClick={onBatchGenerate}
          >
            <CalendarCheck size={16} /> {batchPerDayMode ? "按日分时生成待上课" : batchRepeatMode === "weeks" ? "按周重复生成待上课" : "按日期范围生成待上课"}
          </Button>

          <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium">周循环模板</div>
                <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
                  把上方课程、星期和时间加入模板后，可一次生成多组每周重复课节。
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onAddWeeklyPatternSlot}
                disabled={!currentRuleCanJoinWeeklyPattern}
                className="shrink-0 border-[#bfdbfe] bg-white text-[#1557c2] hover:bg-[#eaf2ff] hover:text-[#0f3f8f]"
              >
                <Plus size={14} /> 加入模板
              </Button>
            </div>

            <div className="mt-3 space-y-2">
              {weeklyPatternSlots.map((slot) => {
                const course = weeklyPatternCourseById.get(slot.courseGroupId);
                return (
                  <div key={slot.id} className="rounded-[12px] border border-[#dbe4ef] bg-white p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-extrabold text-[#061226]">
                          {course ? `${course.name} · ${course.subject}` : "课程档案已不存在"}
                        </div>
                        <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
                          {weeklyPatternSlotWeekdayLabel(slot)} · {slot.startTime}-{slot.endTime} · {weeklyPatternSlotBillingLabel(slot)}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onApplyWeeklyPatternSlot(slot)}
                          title="套用到上方表单"
                          className="h-8 px-2"
                        >
                          <RotateCcw size={14} /> 套用
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onDeleteWeeklyPatternSlot(slot.id)}
                          title="删除模板时段"
                          aria-label="删除模板时段"
                          className="h-8 px-2 text-[#b91c1c] hover:border-[#fecaca] hover:bg-[#fff1f2] hover:text-[#991b1b]"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {weeklyPatternSlots.length === 0 && (
                <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-white px-3 py-4 text-center text-xs font-semibold text-[#64748b]">
                  暂无周循环模板
                </div>
              )}
            </div>

            {weeklyPatternSlots.length > 0 && (
              <div className="mt-3 rounded-[12px] border border-[#dbe4ef] bg-white px-3 py-2 text-sm font-extrabold text-[#25324a]">
                模板范围内共 {weeklyPatternCandidateCount} 节，可生成 {weeklyPatternCreatableCount} 节
                {weeklyPatternConflictCount > 0 ? `，${weeklyPatternConflictCount} 节冲突会跳过` : ""}
                {weeklyPatternInvalidSlotCount > 0 ? `，${weeklyPatternInvalidSlotCount} 条模板需调整` : ""}。
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full"
              disabled={weeklyPatternSlots.length === 0}
              onClick={onGenerateWeeklyPattern}
            >
              <CalendarCheck size={16} /> 按周循环模板生成待上课
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
