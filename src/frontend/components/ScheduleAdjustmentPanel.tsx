import { useMemo, useState } from "react";
import { ArrowRight, CalendarRange, CheckSquare, Clock3, MoveRight, Search, Shuffle, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TimeTextInput } from "@/components/ui/time-text-input";
import type { Campus, CourseType, Lesson, TeacherVault, Weekday } from "@/shared/types";
import {
  addDays,
  campusName,
  courseName,
  courseSubject,
  courseTypeLabel,
  courseTypeOptionsForVault,
  lessonStatusLabels,
  lessonStatusVariant,
  lessonTimeRangeLabel,
  sortCoursesByName,
  sortLessons,
  subjectOptionsForVault,
  weekdayLabels,
  weekdayOfDateIso
} from "@/frontend/lib/helpers";
import {
  datesBetweenLocal,
  filterStudentStatsLessons,
  isOrderedDateRange,
  isOrderedTimeRange,
  timesOverlap
} from "@/frontend/lib/scheduleViewHelpers";
import type { CourseTypeFilter } from "@/frontend/lib/scheduleViewTypes";

type AdjustmentOperation = "shift" | "set_date" | "redistribute";
type AdjustmentTimeMode = "keep" | "set";
export type ScheduleAdjustmentConflictPolicy = "skip" | "allow";

export type ScheduleAdjustmentPreviewItem = {
  lesson: Lesson;
  nextLesson: Lesson;
  conflictLesson?: Lesson;
  movingConflictLesson?: Lesson;
  invalidReason?: string;
  changed: boolean;
  willApply: boolean;
};

type ScheduleAdjustmentPanelProps = {
  campusOptions: Campus[];
  onApplyPreview: (items: ScheduleAdjustmentPreviewItem[], conflictPolicy: ScheduleAdjustmentConflictPolicy) => void;
  vault: TeacherVault;
};

const KEEP_CAMPUS = "__keep";
const COURSE_DEFAULT_CAMPUS = "__course_default";
const orderedWeekdays: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

function dateWithWeekday(date: string): string {
  return date ? `${date} · ${weekdayLabels[weekdayOfDateIso(date)]}` : "未设置";
}

function numericOffset(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function changedLesson(previous: Lesson, next: Lesson): boolean {
  return previous.date !== next.date ||
    previous.startTime !== next.startTime ||
    previous.endTime !== next.endTime ||
    (previous.campusId ?? "") !== (next.campusId ?? "");
}

function previewStatusText(item: ScheduleAdjustmentPreviewItem): string {
  if (item.invalidReason) return item.invalidReason;
  if (item.conflictLesson || item.movingConflictLesson) return item.willApply ? "有冲突，仍写入" : "时间冲突，跳过";
  if (!item.changed) return "没有变化";
  return "可写入";
}

export function ScheduleAdjustmentPanel({ campusOptions, onApplyPreview, vault }: ScheduleAdjustmentPanelProps) {
  const courseOptions = useMemo(() => sortCoursesByName(vault.courseGroups), [vault.courseGroups]);
  const subjectOptions = useMemo(() => subjectOptionsForVault(vault), [vault]);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [courseTypeFilter, setCourseTypeFilter] = useState<CourseTypeFilter>("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [campusFilter, setCampusFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | Lesson["status"]>("scheduled");
  const [search, setSearch] = useState("");
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>([]);
  const [operation, setOperation] = useState<AdjustmentOperation>("shift");
  const [dayOffset, setDayOffset] = useState("7");
  const [targetDate, setTargetDate] = useState("");
  const [targetRangeStart, setTargetRangeStart] = useState("");
  const [targetRangeEnd, setTargetRangeEnd] = useState("");
  const [targetWeekdays, setTargetWeekdays] = useState<Weekday[]>([1, 2, 3, 4, 5]);
  const [timeMode, setTimeMode] = useState<AdjustmentTimeMode>("keep");
  const [targetStartTime, setTargetStartTime] = useState("19:00");
  const [targetEndTime, setTargetEndTime] = useState("21:00");
  const [targetCampusId, setTargetCampusId] = useState(KEEP_CAMPUS);
  const [conflictPolicy, setConflictPolicy] = useState<ScheduleAdjustmentConflictPolicy>("skip");

  const normalizedSearch = search.trim().toLowerCase();
  const filteredLessons = useMemo(() => filterStudentStatsLessons(vault, {
    campusFilter,
    courseFilter,
    courseTypeFilter,
    dateEnd,
    dateStart,
    endTime: "",
    normalizedNameFilter: normalizedSearch,
    startTime: "",
    statusFilter,
    subjectFilter
  }), [campusFilter, courseFilter, courseTypeFilter, dateEnd, dateStart, normalizedSearch, statusFilter, subjectFilter, vault]);

  const visibleLessonIds = filteredLessons.map((lesson) => lesson.id);
  const selectedIdSet = new Set(selectedLessonIds);
  const selectedLessons = filteredLessons.filter((lesson) => selectedIdSet.has(lesson.id)).sort(sortLessons);
  const allVisibleSelected = filteredLessons.length > 0 && filteredLessons.every((lesson) => selectedIdSet.has(lesson.id));
  const isSourceDateRangeValid = !dateStart || !dateEnd || isOrderedDateRange(dateStart, dateEnd);
  const isTargetDateRangeValid = operation !== "redistribute" || isOrderedDateRange(targetRangeStart, targetRangeEnd);
  const isTargetTimeValid = timeMode === "keep" || isOrderedTimeRange(targetStartTime, targetEndTime);
  const targetCandidateDates = operation === "redistribute" && isOrderedDateRange(targetRangeStart, targetRangeEnd)
    ? datesBetweenLocal(targetRangeStart, targetRangeEnd).filter((date) => targetWeekdays.includes(weekdayOfDateIso(date)))
    : [];

  const previewItems = useMemo<ScheduleAdjustmentPreviewItem[]>(() => {
    const baseItems = selectedLessons.map((lesson, index) => {
      let nextDate = lesson.date;
      let invalidReason = "";
      if (operation === "shift") {
        nextDate = addDays(lesson.date, numericOffset(dayOffset));
      } else if (operation === "set_date") {
        if (!targetDate) invalidReason = "缺少目标日期";
        nextDate = targetDate || lesson.date;
      } else {
        const date = targetCandidateDates[index];
        if (!targetRangeStart || !targetRangeEnd) invalidReason = "缺少目标日期段";
        else if (targetWeekdays.length === 0) invalidReason = "未选择可排星期";
        else if (!date) invalidReason = "目标日期不足";
        nextDate = date || lesson.date;
      }

      const nextStartTime = timeMode === "set" ? targetStartTime : lesson.startTime;
      const nextEndTime = timeMode === "set" ? targetEndTime : lesson.endTime;
      if (timeMode === "set" && !isOrderedTimeRange(targetStartTime, targetEndTime)) {
        invalidReason = "目标时间无效";
      }

      const nextCampusId = targetCampusId === KEEP_CAMPUS
        ? lesson.campusId
        : targetCampusId === COURSE_DEFAULT_CAMPUS
          ? undefined
          : targetCampusId;
      const nextLesson: Lesson = {
        ...lesson,
        date: nextDate,
        startTime: nextStartTime,
        endTime: nextEndTime,
        campusId: nextCampusId
      };
      return {
        lesson,
        nextLesson,
        invalidReason: invalidReason || undefined,
        changed: changedLesson(lesson, nextLesson),
        willApply: false
      } satisfies ScheduleAdjustmentPreviewItem;
    });

    return baseItems.map((item) => {
      const conflictLesson = !item.invalidReason
        ? vault.lessons.find((lesson) =>
            lesson.id !== item.lesson.id &&
            !selectedIdSet.has(lesson.id) &&
            lesson.date === item.nextLesson.date &&
            lesson.status !== "cancelled" &&
            timesOverlap(lesson.startTime, lesson.endTime, item.nextLesson.startTime, item.nextLesson.endTime)
          )
        : undefined;
      const movingConflictLesson = !item.invalidReason
        ? baseItems.find((other) =>
            other.lesson.id !== item.lesson.id &&
            !other.invalidReason &&
            other.nextLesson.date === item.nextLesson.date &&
            other.nextLesson.status !== "cancelled" &&
            timesOverlap(other.nextLesson.startTime, other.nextLesson.endTime, item.nextLesson.startTime, item.nextLesson.endTime)
          )?.lesson
        : undefined;
      const hasConflict = Boolean(conflictLesson || movingConflictLesson);
      const willApply = !item.invalidReason && item.changed && (!hasConflict || conflictPolicy === "allow");
      return { ...item, conflictLesson, movingConflictLesson, willApply };
    });
  }, [conflictPolicy, dayOffset, operation, selectedIdSet, selectedLessons, targetCandidateDates, targetCampusId, targetDate, targetEndTime, targetRangeEnd, targetRangeStart, targetStartTime, targetWeekdays.length, timeMode, vault.lessons]);

  const applyCount = previewItems.filter((item) => item.willApply).length;
  const skippedCount = previewItems.length - applyCount;
  const conflictCount = previewItems.filter((item) => item.conflictLesson || item.movingConflictLesson).length;

  function toggleLesson(id: string) {
    setSelectedLessonIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAllVisible(checked: boolean) {
    setSelectedLessonIds((current) => {
      const currentSet = new Set(current);
      if (checked) {
        visibleLessonIds.forEach((id) => currentSet.add(id));
      } else {
        visibleLessonIds.forEach((id) => currentSet.delete(id));
      }
      return Array.from(currentSet);
    });
  }

  function toggleWeekday(day: Weekday) {
    setTargetWeekdays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((a, b) => orderedWeekdays.indexOf(a) - orderedWeekdays.indexOf(b)));
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
      <Card className="h-fit overflow-hidden">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
            <SlidersHorizontal size={14} /> 课表调整
          </div>
          <CardTitle>筛选并选择课节</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">开始日期</label>
              <Input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} className={!isSourceDateRangeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">结束日期</label>
              <Input type="date" value={dateEnd} min={dateStart} onChange={(event) => setDateEnd(event.target.value)} className={!isSourceDateRangeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">课程</label>
              <Select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
                <option value="all">全部课程</option>
                {courseOptions.map((course) => <option key={course.id} value={course.id}>{course.name} · {course.subject}</option>)}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">状态</label>
              <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | Lesson["status"])}>
                <option value="all">全部状态</option>
                <option value="draft">草稿</option>
                <option value="scheduled">待上课</option>
                <option value="completed">已完成</option>
                <option value="cancelled">已取消</option>
                <option value="makeup_pending">待补课</option>
                <option value="makeup_completed">已补课</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">班型</label>
              <Select value={courseTypeFilter} onChange={(event) => setCourseTypeFilter(event.target.value as CourseTypeFilter)}>
                <option value="all">全部班型</option>
                {courseTypeOptionsForVault(vault).map((type: { value: CourseType; label: string }) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">科目</label>
              <Select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
                <option value="all">全部科目</option>
                {subjectOptions.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium">校区</label>
              <Select value={campusFilter} onChange={(event) => setCampusFilter(event.target.value)}>
                <option value="all">全部校区</option>
                {campusOptions.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
              </Select>
            </div>
          </div>

          <label className="relative block">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索姓名、课程、年级、校区或备注" />
          </label>

          <div className="flex flex-col gap-2 rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] p-3 text-sm font-bold text-[#25324a] sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={allVisibleSelected} onChange={(event) => toggleAllVisible(event.target.checked)} className="h-4 w-4 accent-[#1557c2]" />
              选择当前筛选结果
            </label>
            <div className="text-xs text-[#64748b]">已选 {selectedLessons.length} / 当前 {filteredLessons.length}</div>
          </div>

          <div className="max-h-[520px] space-y-2 overflow-y-auto pr-2">
            {filteredLessons.map((lesson) => {
              const selected = selectedIdSet.has(lesson.id);
              return (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => toggleLesson(lesson.id)}
                  className={`w-full rounded-[12px] border p-3 text-left transition-colors ${selected ? "border-[#93c5fd] bg-[#eaf2ff]" : "border-[#e8eef6] bg-white hover:bg-[#f8fbff]"}`}
                >
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selected} onChange={() => toggleLesson(lesson.id)} onClick={(event) => event.stopPropagation()} className="mt-1 h-4 w-4 accent-[#1557c2]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-extrabold text-[#061226]">{courseName(vault, lesson.courseGroupId)}</span>
                        <Badge variant={lessonStatusVariant(lesson.status)} className="text-[10px]">{lessonStatusLabels[lesson.status]}</Badge>
                      </div>
                      <div className="mt-1 text-xs font-semibold text-[#64748b]">
                        {courseSubject(vault, lesson.courseGroupId)} · {courseTypeLabel(vault, lesson.type)} · {dateWithWeekday(lesson.date)} · {lessonTimeRangeLabel(lesson)} · {campusName(vault, lesson.campusId)}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {filteredLessons.length === 0 && (
              <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
                当前筛选下没有课节
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
              <MoveRight size={14} /> 调整规则
            </div>
            <CardTitle>生成调整预览</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <button type="button" onClick={() => setOperation("shift")} className={`rounded-[12px] border px-3 py-3 text-left text-sm font-bold transition-colors ${operation === "shift" ? "border-[#93c5fd] bg-[#eaf2ff] text-[#1557c2]" : "border-[#dbe4ef] bg-white text-[#25324a] hover:bg-[#f8fbff]"}`}>
                <Clock3 size={16} className="mb-2" /> 整体平移
              </button>
              <button type="button" onClick={() => setOperation("set_date")} className={`rounded-[12px] border px-3 py-3 text-left text-sm font-bold transition-colors ${operation === "set_date" ? "border-[#93c5fd] bg-[#eaf2ff] text-[#1557c2]" : "border-[#dbe4ef] bg-white text-[#25324a] hover:bg-[#f8fbff]"}`}>
                <CalendarRange size={16} className="mb-2" /> 移到同一天
              </button>
              <button type="button" onClick={() => setOperation("redistribute")} className={`rounded-[12px] border px-3 py-3 text-left text-sm font-bold transition-colors ${operation === "redistribute" ? "border-[#93c5fd] bg-[#eaf2ff] text-[#1557c2]" : "border-[#dbe4ef] bg-white text-[#25324a] hover:bg-[#f8fbff]"}`}>
                <Shuffle size={16} className="mb-2" /> 日期段重排
              </button>
            </div>

            {operation === "shift" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">平移天数</label>
                <Input type="number" step={1} value={dayOffset} onChange={(event) => setDayOffset(event.target.value)} placeholder="例如 7；前移填写 -7" />
              </div>
            ) : operation === "set_date" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">目标日期</label>
                <Input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">目标开始日期</label>
                    <Input type="date" value={targetRangeStart} onChange={(event) => setTargetRangeStart(event.target.value)} className={!isTargetDateRangeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">目标结束日期</label>
                    <Input type="date" value={targetRangeEnd} min={targetRangeStart} onChange={(event) => setTargetRangeEnd(event.target.value)} className={!isTargetDateRangeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">可排星期</div>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {orderedWeekdays.map((day) => (
                      <Button key={day} type="button" size="sm" variant={targetWeekdays.includes(day) ? "default" : "outline"} onClick={() => toggleWeekday(day)}>
                        {weekdayLabels[day]}
                      </Button>
                    ))}
                  </div>
                  <div className="text-xs font-semibold text-[#64748b]">目标日期位共 {targetCandidateDates.length} 个，按所选课节原时间顺序依次分配。</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">时间处理</label>
                <Select value={timeMode} onChange={(event) => setTimeMode(event.target.value as AdjustmentTimeMode)}>
                  <option value="keep">保留原时间</option>
                  <option value="set">统一改时间</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">开始时间</label>
                <TimeTextInput value={targetStartTime} onValueChange={setTargetStartTime} disabled={timeMode === "keep"} className={!isTargetTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">结束时间</label>
                <TimeTextInput value={targetEndTime} onValueChange={setTargetEndTime} disabled={timeMode === "keep"} className={!isTargetTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">校区处理</label>
                <Select value={targetCampusId} onChange={(event) => setTargetCampusId(event.target.value)}>
                  <option value={KEEP_CAMPUS}>保留原校区</option>
                  <option value={COURSE_DEFAULT_CAMPUS}>改为课程默认校区</option>
                  {campusOptions.map((campus) => <option key={campus.id} value={campus.id}>改为 {campus.name}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">冲突处理</label>
                <Select value={conflictPolicy} onChange={(event) => setConflictPolicy(event.target.value as ScheduleAdjustmentConflictPolicy)}>
                  <option value="skip">跳过冲突课节</option>
                  <option value="allow">允许同时间多课</option>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                  <CheckSquare size={14} /> 写入预览
                </div>
                <CardTitle>确认后批量更新</CardTitle>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">可写入 {applyCount}</Badge>
                <Badge variant={conflictCount > 0 ? "destructive" : "secondary"}>冲突 {conflictCount}</Badge>
                <Badge variant="secondary">跳过 {skippedCount}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-2">
              {previewItems.map((item) => {
                const statusTone = item.willApply ? "border-[#bbf7d0] bg-[#f0fdf4]" : item.invalidReason || item.conflictLesson || item.movingConflictLesson ? "border-[#fed7aa] bg-[#fff7ed]" : "border-[#e8eef6] bg-[#f8fbff]";
                const conflict = item.conflictLesson ?? item.movingConflictLesson;
                return (
                  <div key={item.lesson.id} className={`rounded-[12px] border p-3 ${statusTone}`}>
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-extrabold text-[#061226]">{courseName(vault, item.lesson.courseGroupId)}</span>
                          <Badge variant={item.willApply ? "default" : "secondary"} className="text-[10px]">{previewStatusText(item)}</Badge>
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-2 text-xs font-semibold text-[#25324a] xl:grid-cols-[1fr_auto_1fr] xl:items-center">
                          <div>{dateWithWeekday(item.lesson.date)} · {lessonTimeRangeLabel(item.lesson)} · {campusName(vault, item.lesson.campusId)}</div>
                          <ArrowRight size={15} className="hidden text-[#94a3b8] xl:block" />
                          <div>{dateWithWeekday(item.nextLesson.date)} · {lessonTimeRangeLabel(item.nextLesson)} · {campusName(vault, item.nextLesson.campusId)}</div>
                        </div>
                        {conflict && (
                          <div className="mt-2 text-xs font-bold text-[#9a3412]">
                            冲突：{courseName(vault, conflict.courseGroupId)} · {dateWithWeekday(conflict.date)} · {lessonTimeRangeLabel(conflict)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {previewItems.length === 0 && (
                <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
                  先在左侧选择需要调整的课节
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs font-semibold leading-5 text-[#64748b]">
                确认写入只会修改日期、时间和校区；学生、出勤、课程内容、作业、备注和状态会保留。
              </div>
              <Button type="button" onClick={() => onApplyPreview(previewItems, conflictPolicy)} disabled={applyCount === 0}>
                <CheckSquare size={16} /> 确认写入 {applyCount} 节
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}