import { motion } from "framer-motion";
import { Clock, GraduationCap, RotateCcw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Campus, CourseType, Lesson, TeacherVault } from "@/shared/types";
import {
  campusName,
  courseName,
  courseSubject,
  courseTypeLabel,
  courseTypeOptionsForVault,
  formatPrivateMoney,
  lessonStatusLabels,
  lessonStatusSurfaceClass,
  lessonStatusVariant
} from "@/frontend/lib/helpers";
import { isOrderedDateRange } from "@/frontend/lib/scheduleViewHelpers";
import type { CourseTypeFilter, LessonScope } from "@/frontend/lib/scheduleViewTypes";

type ScheduleRecordsListCardProps = {
  amountsVisible: boolean;
  campusFilter: string;
  campusOptions: Campus[];
  courseTypeFilter: CourseTypeFilter;
  dateWithWeekday: (date: string) => string;
  effectiveLessonDay: string;
  effectiveLessonScope: LessonScope;
  lessonDay: string;
  lessonMonth: string;
  lessonRangeEnd: string;
  lessonRangeStart: string;
  lessonScope: LessonScope;
  lessonWeek: string;
  lessons: Lesson[];
  onOpenLesson: (lesson: Lesson) => void;
  selectedLessonId?: string;
  selectedCalendarDate: string;
  setCampusFilter: (value: string) => void;
  setCourseTypeFilter: (value: CourseTypeFilter) => void;
  setLessonDay: (value: string) => void;
  setLessonMonth: (value: string) => void;
  setLessonRangeEnd: (value: string) => void;
  setLessonRangeStart: (value: string) => void;
  setLessonScope: (value: LessonScope) => void;
  setLessonWeek: (value: string) => void;
  setShowOnlyMakeup: (updater: (value: boolean) => boolean) => void;
  setStudentFilter: (value: string) => void;
  setSyncRecordsWithCalendarDate: (value: boolean) => void;
  showOnlyMakeup: boolean;
  studentFilter: string;
  syncRecordsWithCalendarDate: boolean;
  vault: TeacherVault;
};

export function ScheduleRecordsListCard({
  amountsVisible,
  campusFilter,
  campusOptions,
  courseTypeFilter,
  dateWithWeekday,
  effectiveLessonDay,
  effectiveLessonScope,
  lessonDay,
  lessonMonth,
  lessonRangeEnd,
  lessonRangeStart,
  lessonScope,
  lessonWeek,
  lessons,
  onOpenLesson,
  selectedLessonId,
  selectedCalendarDate,
  setCampusFilter,
  setCourseTypeFilter,
  setLessonDay,
  setLessonMonth,
  setLessonRangeEnd,
  setLessonRangeStart,
  setLessonScope,
  setLessonWeek,
  setShowOnlyMakeup,
  setStudentFilter,
  setSyncRecordsWithCalendarDate,
  showOnlyMakeup,
  studentFilter,
  syncRecordsWithCalendarDate,
  vault
}: ScheduleRecordsListCardProps) {
  return (
    <Card className="h-fit overflow-hidden">
      <CardHeader>
        <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
          <Clock size={14} /> 课程记录
        </div>
        <CardTitle>课时列表</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pb-4">
        <label className="flex items-center gap-3 rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2 text-sm font-bold text-[#25324a]">
          <input
            type="checkbox"
            checked={syncRecordsWithCalendarDate}
            onChange={(event) => {
              const checked = event.target.checked;
              setSyncRecordsWithCalendarDate(checked);
              if (!checked) {
                setLessonScope("day");
                setLessonDay(selectedCalendarDate);
              }
            }}
            className="h-4 w-4 accent-[#ff8617]"
          />
          同步日历查看日期（{dateWithWeekday(selectedCalendarDate)}）
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">查看范围</label>
            <Select value={syncRecordsWithCalendarDate ? "day" : lessonScope} onChange={(event) => setLessonScope(event.target.value as LessonScope)} disabled={syncRecordsWithCalendarDate}>
              <option value="month">按月查看</option>
              <option value="day">按日查看</option>
              <option value="range">按日期范围</option>
              <option value="week">按周查看</option>
            </Select>
          </div>
          {effectiveLessonScope === "month" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">月份</label>
              <Input type="month" value={lessonMonth} onChange={(event) => setLessonMonth(event.target.value)} className="min-w-0 text-sm" />
            </div>
          ) : effectiveLessonScope === "day" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">日期</label>
              <Input
                type="date"
                value={effectiveLessonDay}
                onChange={(event) => setLessonDay(event.target.value)}
                disabled={syncRecordsWithCalendarDate}
                className="min-w-0 text-sm"
              />
            </div>
          ) : effectiveLessonScope === "range" ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">开始日期</label>
                <Input type="date" value={lessonRangeStart} onChange={(event) => setLessonRangeStart(event.target.value)} className="min-w-0 text-sm" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">结束日期</label>
                <Input type="date" value={lessonRangeEnd} min={lessonRangeStart} onChange={(event) => setLessonRangeEnd(event.target.value)} className={!isOrderedDateRange(lessonRangeStart, lessonRangeEnd) ? "min-w-0 border-[#fca5a5] bg-[#fff1f2] text-sm" : "min-w-0 text-sm"} />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">周</label>
              <Input type="week" value={lessonWeek} onChange={(event) => setLessonWeek(event.target.value)} className="min-w-0 text-sm" />
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">校区筛选</label>
            <Select value={campusFilter} onChange={(event) => setCampusFilter(event.target.value)}>
              <option value="all">全部校区</option>
              {campusOptions.map((campus) => (
                <option key={campus.id} value={campus.id}>{campus.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">班型筛选</label>
            <Select value={courseTypeFilter} onChange={(event) => setCourseTypeFilter(event.target.value as CourseTypeFilter)}>
              <option value="all">全部班型</option>
              {courseTypeOptionsForVault(vault).map((type: { value: CourseType; label: string }) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
          <label className="relative block">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <Input className="pl-9" value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)} placeholder="搜索姓名、年级、校区或班型" />
          </label>
          <Button type="button" variant={showOnlyMakeup ? "default" : "outline"} onClick={() => setShowOnlyMakeup((value) => !value)}>
            <RotateCcw size={15} /> 只看补课
          </Button>
        </div>

        <div className="max-h-[620px] space-y-1 overflow-y-auto pr-2">
          {lessons.map((lesson, index) => (
            <motion.button
              key={lesson.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.02 }}
              whileHover={{ scale: 1.01, x: 2 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => onOpenLesson(lesson)}
              className={`flex w-full items-center justify-between rounded-[14px] border p-3 text-left transition-all duration-200 ${
                selectedLessonId === lesson.id
                  ? "border-[#93c5fd] bg-[#eaf2ff] shadow-[0_10px_24px_rgba(21,87,194,0.12)]"
                  : lessonStatusSurfaceClass(lesson.status)
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white">
                  <GraduationCap size={14} className="text-(--color-muted-foreground)" />
                </div>
                <div className="min-w-0">
                  <span className="block truncate text-sm font-medium">{courseName(vault, lesson.courseGroupId)}</span>
                  <span className="text-xs text-(--color-muted-foreground)">
                    {courseSubject(vault, lesson.courseGroupId)} · {courseTypeLabel(vault, lesson.type)} · {dateWithWeekday(lesson.date)} · {lesson.startTime}-{lesson.endTime} · {campusName(vault, lesson.campusId)}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden text-sm font-semibold sm:inline">{formatPrivateMoney(lesson.feeSnapshot.amount, amountsVisible)}</span>
                <Badge variant={lessonStatusVariant(lesson.status)} className="text-[10px]">
                  {lessonStatusLabels[lesson.status]}
                </Badge>
              </div>
            </motion.button>
          ))}
          {lessons.length === 0 && (
            <p className="py-8 text-center text-sm text-(--color-muted-foreground)">没有符合筛选条件的课程记录</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
