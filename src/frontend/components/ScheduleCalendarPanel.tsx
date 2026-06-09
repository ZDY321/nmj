import { CalendarDays, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TimeTextInput } from "@/components/ui/time-text-input";
import type { Campus, CourseGroup, WeekStart } from "@/shared/types";
import { ScheduleCalendarGrid, type ScheduleCalendarGridProps } from "@/frontend/components/ScheduleCalendarGrid";
import { ScheduleCalendarSyncPanel, type ScheduleCalendarSyncPanelProps } from "@/frontend/components/ScheduleCalendarSyncPanel";

type CalendarMode = "schedule" | "view";

type ScheduleCalendarPanelProps = {
  calendarCourseGroupId: string;
  calendarCourseOptions: CourseGroup[];
  calendarCourseSearch: string;
  calendarEndTime: string;
  calendarFiltersClearDisabled: boolean;
  calendarGridProps: ScheduleCalendarGridProps;
  calendarMode: CalendarMode;
  calendarMonth: string;
  calendarStartTime: string;
  calendarViewCampusFilter: string;
  calendarViewCampusOptions: Campus[];
  calendarViewGradeFilter: string;
  calendarViewGradeOptions: string[];
  calendarViewStudentFilter: string;
  calendarViewSubjectFilter: string;
  calendarViewSubjectOptions: string[];
  isCalendarTimeValid: boolean;
  onCalendarModeChange: (mode: CalendarMode) => void;
  onClearCalendarFilters: () => void;
  onNextMonth: () => void;
  onPreviousMonth: () => void;
  onWeekStartChange: (weekStart: WeekStart) => void;
  selectedCalendarLessonCount: number;
  selectedCalendarWeekLessonCount: number;
  setCalendarCourseGroupId: (value: string) => void;
  setCalendarCourseSearch: (value: string) => void;
  setCalendarEndTime: (value: string) => void;
  setCalendarStartTime: (value: string) => void;
  setCalendarViewCampusFilter: (value: string) => void;
  setCalendarViewGradeFilter: (value: string) => void;
  setCalendarViewStudentFilter: (value: string) => void;
  setCalendarViewSubjectFilter: (value: string) => void;
  syncPanelProps: ScheduleCalendarSyncPanelProps;
  weekStartPreference: WeekStart;
};

export function ScheduleCalendarPanel({
  calendarCourseGroupId,
  calendarCourseOptions,
  calendarCourseSearch,
  calendarEndTime,
  calendarFiltersClearDisabled,
  calendarGridProps,
  calendarMode,
  calendarMonth,
  calendarStartTime,
  calendarViewCampusFilter,
  calendarViewCampusOptions,
  calendarViewGradeFilter,
  calendarViewGradeOptions,
  calendarViewStudentFilter,
  calendarViewSubjectFilter,
  calendarViewSubjectOptions,
  isCalendarTimeValid,
  onCalendarModeChange,
  onClearCalendarFilters,
  onNextMonth,
  onPreviousMonth,
  onWeekStartChange,
  selectedCalendarLessonCount,
  selectedCalendarWeekLessonCount,
  setCalendarCourseGroupId,
  setCalendarCourseSearch,
  setCalendarEndTime,
  setCalendarStartTime,
  setCalendarViewCampusFilter,
  setCalendarViewGradeFilter,
  setCalendarViewStudentFilter,
  setCalendarViewSubjectFilter,
  syncPanelProps,
  weekStartPreference
}: ScheduleCalendarPanelProps) {
  return (
    <Card className={`overflow-hidden border-2 ${calendarMode === "schedule" ? "border-[#ffb15c]" : "border-[#93c5fd]"}`}>
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
            <CalendarDays size={14} /> 日历排课 / 查看
          </div>
          <CardTitle>{calendarMode === "schedule" ? "日历排课 · 排课模式" : "日历排课 · 查看模式"}</CardTitle>
          <CardDescription>{calendarMode === "schedule" ? "排课模式下，点击日期会添加待上课；下方可调整排课课程和时间。" : "查看模式：点击日期切换下方明细，可按课程筛选。"}</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <div className="grid grid-cols-2 rounded-[12px] border border-[#dbe4ef] bg-white p-1">
            <button
              type="button"
              onClick={() => onCalendarModeChange("schedule")}
              className={`rounded-[9px] px-3 py-2 text-xs font-bold ${calendarMode === "schedule" ? "orange-gradient text-white" : "text-[#25324a]"}`}
            >
              排课
            </button>
            <button
              type="button"
              onClick={() => onCalendarModeChange("view")}
              className={`rounded-[9px] px-3 py-2 text-xs font-bold ${calendarMode === "view" ? "bg-[#1557c2] text-white" : "text-[#25324a]"}`}
            >
              查看
            </button>
          </div>
          <Select value={String(weekStartPreference)} onChange={(event) => onWeekStartChange(Number(event.target.value) as WeekStart)} className="h-10 w-[132px]">
            <option value="0">周日开始</option>
            <option value="1">周一开始</option>
          </Select>
          <Button variant="ghost" size="icon" onClick={onPreviousMonth}>
            <ChevronLeft size={18} />
          </Button>
          <span className="w-[80px] text-center font-bold">{calendarMonth}</span>
          <Button variant="ghost" size="icon" onClick={onNextMonth}>
            <ChevronRight size={18} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className={`rounded-[14px] border px-4 py-3 text-sm font-extrabold ${
          calendarMode === "schedule"
            ? "border-[#fed7aa] bg-[#fff7ed] text-[#9a3412]"
            : "border-[#bfdbfe] bg-[#eaf2ff] text-[#1557c2]"
        }`}>
          {calendarMode === "schedule" ? "当前是排课模式：点击日期会直接新增待上课。" : "当前是查看模式：点击日期只查看课程明细，不会新增排课。"}
        </div>
        {calendarMode === "schedule" ? (
          <div className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">排课课程</label>
                <label className="relative block">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                  <Input
                    value={calendarCourseSearch}
                    onChange={(event) => setCalendarCourseSearch(event.target.value)}
                    placeholder="搜索姓名、年级、校区或班型"
                    className="h-10 bg-white pl-9"
                  />
                </label>
                <Select value={calendarCourseGroupId} onChange={(event) => setCalendarCourseGroupId(event.target.value)}>
                  {calendarCourseOptions.map((course) => (
                    <option key={course.id} value={course.id}>{course.name} · {course.subject}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">开始时间</label>
                <TimeTextInput value={calendarStartTime} onValueChange={setCalendarStartTime} className={!isCalendarTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">结束时间</label>
                <TimeTextInput value={calendarEndTime} onValueChange={setCalendarEndTime} className={!isCalendarTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                {!isCalendarTimeValid && (
                  <div className="text-xs font-bold text-[#b91c1c]">日历排课的结束时间必须晚于开始时间。</div>
                )}
              </div>
            </div>
            <div className="rounded-[12px] border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-xs font-bold leading-5 text-[#9a3412]">
              说明：这里的排课课程、开始时间和结束时间只用于点击日期时生成新课；“查看课程筛选”只影响已排课程展示。
            </div>
          </div>
        ) : (
          <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] px-4 py-3 text-sm font-semibold leading-6 text-[#64748b]">
            查看模式只按日期切换右侧“每日课程详情”；需要新增课时请切到“排课”模式。
          </div>
        )}
        <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[auto_minmax(130px,0.75fr)_minmax(130px,0.75fr)_minmax(130px,0.75fr)_minmax(220px,1.35fr)_auto_auto] xl:items-end">
            <div className="min-w-[116px]">
              <div className="text-sm font-extrabold text-[#061226]">查看课程筛选</div>
              <div className="mt-0.5 text-xs font-bold text-[#64748b]">
                当日 {selectedCalendarLessonCount} 节 · 本周 {selectedCalendarWeekLessonCount} 节
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">校区</label>
              <Select value={calendarViewCampusFilter} onChange={(event) => setCalendarViewCampusFilter(event.target.value)} className="h-10 bg-white">
                <option value="all">全部校区</option>
                {calendarViewCampusOptions.map((campus) => (
                  <option key={campus.id} value={campus.id}>{campus.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">年级</label>
              <Select value={calendarViewGradeFilter} onChange={(event) => setCalendarViewGradeFilter(event.target.value)} className="h-10 bg-white">
                <option value="all">全部年级</option>
                {calendarViewGradeOptions.map((grade) => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">科目</label>
              <Select value={calendarViewSubjectFilter} onChange={(event) => setCalendarViewSubjectFilter(event.target.value)} className="h-10 bg-white">
                <option value="all">全部科目</option>
                {calendarViewSubjectOptions.map((subject) => (
                  <option key={subject} value={subject}>{subject}</option>
                ))}
              </Select>
            </div>
            <label className="relative block">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
              <Input
                value={calendarViewStudentFilter}
                onChange={(event) => setCalendarViewStudentFilter(event.target.value)}
                placeholder="搜索学生、课程、校区或备注"
                className="h-10 bg-white pl-9"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={onClearCalendarFilters}
              disabled={calendarFiltersClearDisabled}
              className="h-10"
            >
              清除筛选
            </Button>
            <div className="grid grid-cols-2 rounded-[12px] border border-[#dbe4ef] bg-white p-1 lg:min-w-[136px]">
              <button
                type="button"
                onClick={() => onCalendarModeChange("schedule")}
                className={`rounded-[9px] px-3 py-2 text-xs font-bold ${calendarMode === "schedule" ? "orange-gradient text-white" : "text-[#25324a]"}`}
              >
                排课
              </button>
              <button
                type="button"
                onClick={() => onCalendarModeChange("view")}
                className={`rounded-[9px] px-3 py-2 text-xs font-bold ${calendarMode === "view" ? "bg-[#1557c2] text-white" : "text-[#25324a]"}`}
              >
                查看
              </button>
            </div>
          </div>
        </div>
        <ScheduleCalendarSyncPanel {...syncPanelProps} />
        <ScheduleCalendarGrid {...calendarGridProps} />
      </CardContent>
    </Card>
  );
}
