import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight, Table2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import type { Lesson, TeacherVault, WeekStart } from "@/shared/types";
import {
  addDays,
  calendarDates,
  courseName,
  courseTypeLabel,
  campusName,
  formatPrivateMoney,
  lessonStatusLabels,
  lessonStatusSurfaceClass,
  lessonStatusVariant,
  lessonStudentIds,
  makeupNeededStudentIds,
  monthShift,
  orderedWeekdayLabels,
  shortWeekdayLabels,
  sortLessons,
  studentNames,
  weekDatesFor,
  weekStartsOn
} from "@/frontend/lib/helpers";
import { MetricCard } from "@/frontend/components/MetricCard";
import { todayIso } from "@/frontend/lib/calculations";

type CalendarOverviewPage = "month" | "week";

export function CalendarView({
  vault,
  amountsVisible,
  onWeekStartChange,
  onOpenLessonInRecords
}: {
  vault: TeacherVault;
  amountsVisible: boolean;
  onWeekStartChange: (weekStart: WeekStart) => void;
  onOpenLessonInRecords?: (lesson: Lesson) => void;
}) {
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(() => todayIso());
  const [overviewPage, setOverviewPage] = useState<CalendarOverviewPage>("month");
  const weekStartPreference = weekStartsOn(vault);
  const days = calendarDates(month, weekStartPreference);
  const visibleLessons = vault.lessons.filter((lesson) => !isFullyScheduledMakeupOriginal(vault, lesson));

  const selectedLessons = visibleLessons.filter((l) => l.date === selectedDate).sort(sortLessons);
  const weekDates = weekDatesFor(selectedDate, weekStartPreference);
  const weekLessons = visibleLessons.filter((l) => weekDates.includes(l.date)).sort(sortLessons);
  const monthLessons = visibleLessons.filter((l) => l.date.startsWith(month));
  const selectedTotal = selectedLessons.reduce((s, l) => s + l.feeSnapshot.amount, 0);
  const weekTotal = weekLessons.reduce((s, l) => s + l.feeSnapshot.amount, 0);
  const monthTotal = monthLessons.reduce((s, l) => s + l.feeSnapshot.amount, 0);

  const weekdayLabels = orderedWeekdayLabels(weekStartPreference, shortWeekdayLabels);
  const weekRangeLabel = `${weekDates[0].slice(5)} - ${weekDates[6].slice(5)}`;
  const weekTimeSlots = Array.from(new Set(weekLessons.map((lesson) => `${lesson.startTime}-${lesson.endTime}`))).sort();

  function selectCalendarDate(date: string) {
    setSelectedDate(date);
    setMonth(date.slice(0, 7));
  }

  function shiftSelectedWeek(days: number) {
    selectCalendarDate(addDays(selectedDate, days));
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="选中日期" value={`${selectedLessons.length} 节`} hint={formatPrivateMoney(selectedTotal, amountsVisible)} variant={1} index={0} showSparkline={false} />
        <MetricCard label="本周课程" value={`${weekLessons.length} 节`} hint={formatPrivateMoney(weekTotal, amountsVisible)} variant={2} index={1} showSparkline={false} />
        <MetricCard label="本月课程" value={`${monthLessons.length} 节`} hint={formatPrivateMoney(monthTotal, amountsVisible)} variant={3} index={2} showSparkline={false} />
        <MetricCard
          label="待处理"
          value={`${monthLessons.filter((l) => l.status === "makeup_pending" || l.status === "scheduled").length}`}
          hint="待上课 / 待补课"
          variant={4}
          index={3}
          showSparkline={false}
        />
      </div>

      <div className={overviewPage === "month" ? "grid grid-cols-1 gap-6 xl:grid-cols-[1.45fr_0.75fr]" : "grid grid-cols-1 gap-6"}>
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[#ff8617] text-xs font-bold uppercase tracking-widest mb-1">
                <CalendarDays size={14} /> 日历总览
              </div>
              <CardTitle>{overviewPage === "month" ? month : weekRangeLabel}</CardTitle>
              <CardDescription>
                {overviewPage === "month"
                  ? "当前月历保留为第一页，可按日期查看每日明细。"
                  : "周课表按日期和时间展开课程，方便一次看清这一周的上课情况。"}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <div className="grid grid-cols-2 rounded-[12px] border border-[#dbe4ef] bg-white p-1">
                <button
                  type="button"
                  onClick={() => setOverviewPage("month")}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-[9px] px-3 py-2 text-xs font-bold ${
                    overviewPage === "month" ? "orange-gradient text-white" : "text-[#25324a]"
                  }`}
                >
                  <CalendarDays size={14} /> 月历
                </button>
                <button
                  type="button"
                  onClick={() => setOverviewPage("week")}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-[9px] px-3 py-2 text-xs font-bold ${
                    overviewPage === "week" ? "bg-[#1557c2] text-white" : "text-[#25324a]"
                  }`}
                >
                  <Table2 size={14} /> 周课表
                </button>
              </div>
              <Select
                value={String(weekStartPreference)}
                onChange={(event) => onWeekStartChange(Number(event.target.value) as WeekStart)}
                className="h-10 w-[132px]"
                aria-label="选择一周开始日期"
              >
                <option value="0">周日开始</option>
                <option value="1">周一开始</option>
              </Select>
              <button
                type="button"
                onClick={() => {
                  if (overviewPage === "month") {
                    setMonth((m) => monthShift(m, -1));
                  } else {
                    shiftSelectedWeek(-7);
                  }
                }}
                className="p-2 rounded-[10px] hover:bg-[#f3f7fb] transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="font-bold min-w-[80px] text-center">{overviewPage === "month" ? month : weekRangeLabel}</span>
              <button
                type="button"
                onClick={() => {
                  if (overviewPage === "month") {
                    setMonth((m) => monthShift(m, 1));
                  } else {
                    shiftSelectedWeek(7);
                  }
                }}
                className="p-2 rounded-[10px] hover:bg-[#f3f7fb] transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6">
            {overviewPage === "month" ? (
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {weekdayLabels.map((d) => (
                  <div key={d} className="text-center text-xs font-bold text-(--color-muted-foreground) py-2">{d}</div>
                ))}
                {days.map((date) => {
                  const dayLessons = visibleLessons.filter((l) => l.date === date).sort(sortLessons);
                  const amount = dayLessons.reduce((s, l) => s + l.feeSnapshot.amount, 0);
                  const hasPending = dayLessons.some((l) => l.status === "scheduled" || l.status === "makeup_pending");
                  const hasDone = dayLessons.some((l) => l.status === "completed" || l.status === "makeup_completed");
                  const hasCancelled = dayLessons.some((l) => l.status === "cancelled");
                  const isAllCompleted = dayLessons.length > 0 && dayLessons.every((l) => l.status === "completed" || l.status === "makeup_completed");
                  const isCurrentMonth = date.startsWith(month);
                  const isSelected = date === selectedDate;

                  return (
                    <motion.button
                      key={date}
                      whileHover={{ scale: 1.03, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => selectCalendarDate(date)}
                      className={`relative flex min-h-[66px] flex-col items-start rounded-[12px] border p-1.5 text-left transition-all duration-200 sm:min-h-[100px] sm:rounded-[14px] sm:p-2.5 ${
                        isSelected
                          ? isAllCompleted
                            ? "border-[#86efac] bg-[#f0fdf4] shadow-[0_10px_24px_rgba(22,163,74,0.12)]"
                            : "border-[#ff8617] bg-[#fff7ed] shadow-[0_10px_24px_rgba(255,134,23,0.14)]"
                        : isCurrentMonth
                            ? hasCancelled
                              ? "border-[#fecaca] bg-[#fff1f2] hover:shadow-[0_10px_24px_rgba(127,29,29,0.08)]"
                              : isAllCompleted
                                ? "border-[#bbf7d0] bg-[#f0fdf4] hover:border-[#86efac] hover:shadow-[0_10px_24px_rgba(22,163,74,0.1)]"
                                : "border-[#dbe4ef] bg-white hover:shadow-[0_10px_24px_rgba(15,35,66,0.08)]"
                            : "border-transparent bg-white opacity-40"
                      }`}
                    >
                      <span className={`text-sm font-bold ${isSelected ? (isAllCompleted ? "text-[#15803d]" : "text-[#ff8617]") : "text-[#061226]"}`}>
                        {Number(date.slice(8))}
                      </span>
                      <div className="mt-2 flex gap-1 sm:hidden">
                        {hasDone && <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />}
                        {hasCancelled && <span className="h-1.5 w-1.5 rounded-full bg-[#dc2626]" />}
                        {hasPending && <span className="h-1.5 w-1.5 rounded-full bg-[#ff8617]" />}
                      </div>
                      <div className="mt-1.5 hidden flex-wrap gap-1 sm:flex">
                        {hasDone && <Badge variant="sage" className="text-[10px] px-1.5 py-0">完成</Badge>}
                        {hasCancelled && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">取消</Badge>}
                        {hasPending && <Badge variant="amber" className="text-[10px] px-1.5 py-0">待确认</Badge>}
                        {amount > 0 && <Badge variant="default" className="text-[10px] px-1.5 py-0">{formatPrivateMoney(amount, amountsVisible)}</Badge>}
                      </div>
                      {dayLessons.slice(0, 2).map((l) => (
                        <span key={l.id} className="mt-0.5 hidden w-full truncate text-[10px] text-(--color-muted-foreground) sm:block">
                          {l.startTime} {courseTypeLabel(vault, l.type)} · {courseName(vault, l.courseGroupId)}
                        </span>
                      ))}
                      {dayLessons.length > 2 && (
                        <span className="hidden text-[10px] text-(--color-muted-foreground) sm:block">+{dayLessons.length - 2} 节</span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-extrabold text-[#061226]">周课表</div>
                    <div className="text-xs font-semibold text-[#64748b]">点击某节课可跳转到「排课与课时-课程记录」页面</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#64748b]">
                    <Badge variant="sage" className="text-[10px]">完成</Badge>
                    <Badge variant="amber" className="text-[10px]">待上课</Badge>
                    <Badge variant="yellow" className="text-[10px]">待补课</Badge>
                    <Badge variant="destructive" className="text-[10px]">取消</Badge>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-[14px] border border-[#dbe4ef] bg-white">
                  <div className="min-w-[880px]">
                    <div className="grid grid-cols-[86px_repeat(7,minmax(110px,1fr))] border-b border-[#e8eef6] bg-[#f8fbff]">
                      <div className="sticky left-0 z-10 border-r border-[#e8eef6] bg-[#f8fbff] px-3 py-3 text-xs font-extrabold text-[#64748b]">
                        时间
                      </div>
                      {weekDates.map((date, index) => {
                        const dayLessons = weekLessons.filter((lesson) => lesson.date === date);
                        const dayTotal = dayLessons.reduce((sum, lesson) => sum + lesson.feeSnapshot.amount, 0);
                        const isSelected = date === selectedDate;
                        return (
                          <button
                            key={date}
                            type="button"
                            onClick={() => selectCalendarDate(date)}
                            className={`border-r border-[#e8eef6] px-3 py-2 text-left transition-colors last:border-r-0 ${
                              isSelected ? "bg-[#fff7ed]" : "hover:bg-[#f3f7fb]"
                            }`}
                          >
                            <span className="flex min-w-0 items-center justify-between gap-2">
                              <span className={`truncate text-sm font-extrabold ${isSelected ? "text-[#ff8617]" : "text-[#061226]"}`}>
                                {date.slice(5)}
                              </span>
                              <span className="shrink-0 text-[11px] font-extrabold text-[#1557c2]">
                                {formatPrivateMoney(dayTotal, amountsVisible)}
                              </span>
                            </span>
                            <span className="mt-0.5 block text-xs font-bold text-[#64748b]">
                              {weekdayLabels[index]} · {dayLessons.length} 节
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {weekTimeSlots.length === 0 ? (
                      <div className="p-8 text-center text-sm font-semibold text-[#64748b]">
                        这一周还没有课程
                      </div>
                    ) : (
                      weekTimeSlots.map((timeSlot) => (
                        <div key={timeSlot} className="grid grid-cols-[86px_repeat(7,minmax(110px,1fr))] border-b border-[#e8eef6] last:border-b-0">
                          <div className="sticky left-0 z-10 flex min-h-[88px] items-start border-r border-[#e8eef6] bg-[#f8fbff] px-3 py-3 text-left text-xs font-extrabold text-[#25324a]">
                            {timeSlot}
                          </div>
                          {weekDates.map((date) => {
                            const cellLessons = weekLessons.filter((lesson) => lesson.date === date && `${lesson.startTime}-${lesson.endTime}` === timeSlot);
                            const isSelected = date === selectedDate;
                            return (
                              <div
                                key={`${date}-${timeSlot}`}
                                onClick={() => selectCalendarDate(date)}
                                className={`min-h-[88px] border-r border-[#e8eef6] p-2 text-left transition-colors last:border-r-0 ${
                                  isSelected ? "bg-[#fffaf2]" : "hover:bg-[#f8fbff]"
                                }`}
                              >
                                {cellLessons.length === 0 ? (
                                  <span className="block h-full min-h-[62px] rounded-[10px] border border-dashed border-[#e2e8f0] bg-[#fbfdff]" />
                                ) : (
                                  <span className="flex flex-col gap-2">
                                    {cellLessons.map((lesson) => (
                                      <button
                                        key={lesson.id}
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          selectCalendarDate(date);
                                          onOpenLessonInRecords?.(lesson);
                                        }}
                                        className={`block w-full rounded-[10px] border p-2 text-left text-xs transition-all hover:border-[#1557c2] ${lessonStatusSurfaceClass(lesson.status)}`}
                                      >
                                        <span className="flex min-w-0 items-center justify-between gap-2">
                                          <strong className="truncate">{courseName(vault, lesson.courseGroupId)}</strong>
                                          <Badge variant={lessonStatusVariant(lesson.status)} className="shrink-0 text-[10px]">
                                            {lessonStatusLabels[lesson.status]}
                                          </Badge>
                                        </span>
                                        <span className="mt-1 block truncate font-semibold">
                                          {courseTypeLabel(vault, lesson.type)} · {campusName(vault, lesson.campusId)}
                                        </span>
                                        <span className="mt-0.5 block truncate text-[11px] font-semibold opacity-80">
                                          {studentNames(vault, lesson.expectedStudentIds)}
                                        </span>
                                      </button>
                                    ))}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))
                    )}
                    {weekLessons.length > 0 && weekTimeSlots.length === 0 && (
                      <div className="p-8 text-center text-sm font-semibold text-[#64748b]">
                        这一周的课程缺少开始或结束时间，无法生成时间表。
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {overviewPage === "month" && (
        <Card className="h-fit overflow-hidden">
          <CardHeader>
            <CardTitle>{selectedDate} 明细</CardTitle>
            <CardDescription>仅统计课程课时金额，不等同于工资总额。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="p-3 rounded-[12px] bg-[#f8fbff] border border-[#e8eef6]">
                <span className="text-xs text-(--color-muted-foreground)">当天课时费</span>
                <strong className="block text-xl font-extrabold mt-1">{formatPrivateMoney(selectedTotal, amountsVisible)}</strong>
              </div>
              <div className="p-3 rounded-[12px] bg-[#f8fbff] border border-[#e8eef6]">
                <span className="text-xs text-(--color-muted-foreground)">本周课时费</span>
                <strong className="block text-xl font-extrabold mt-1">{formatPrivateMoney(weekTotal, amountsVisible)}</strong>
              </div>
              <div className="p-3 rounded-[12px] bg-[#f8fbff] border border-[#e8eef6]">
                <span className="text-xs text-(--color-muted-foreground)">本月课时费</span>
                <strong className="block text-xl font-extrabold mt-1">{formatPrivateMoney(monthTotal, amountsVisible)}</strong>
              </div>
              <div className="p-3 rounded-[12px] bg-[#f8fbff] border border-[#e8eef6]">
                <span className="text-xs text-(--color-muted-foreground)">本月节数</span>
                <strong className="block text-xl font-extrabold mt-1">{monthLessons.length}</strong>
              </div>
            </div>

            <div className="space-y-2">
              {selectedLessons.length === 0 && (
                <p className="text-sm text-(--color-muted-foreground) text-center py-6">这一天还没有课程</p>
              )}
              {selectedLessons.map((lesson) => (
                <motion.button
                  key={lesson.id}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => onOpenLessonInRecords?.(lesson)}
                  className={`flex w-full flex-col gap-3 rounded-[12px] border p-3 text-left transition-all hover:border-[#1557c2] sm:flex-row sm:items-center sm:justify-between ${lessonStatusSurfaceClass(lesson.status)}`}
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <strong className="block truncate text-sm">
                      {lesson.startTime}-{lesson.endTime} · {courseName(vault, lesson.courseGroupId)}
                    </strong>
                      <Badge variant={lessonStatusVariant(lesson.status)} className="shrink-0 text-[10px]">
                        {lessonStatusLabels[lesson.status]}
                      </Badge>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {courseTypeLabel(vault, lesson.type)}
                      </Badge>
                    </div>
                    <span className="text-xs text-(--color-muted-foreground)">
                      {campusName(vault, lesson.campusId)} · {studentNames(vault, lesson.expectedStudentIds)}
                    </span>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-[#1557c2] sm:ml-3">{formatPrivateMoney(lesson.feeSnapshot.amount, amountsVisible)}</span>
                </motion.button>
              ))}
            </div>
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  );
}

function isFullyScheduledMakeupOriginal(vault: TeacherVault, lesson: Lesson): boolean {
  if (lesson.status !== "makeup_pending" || lesson.linkedOriginalLessonId) return false;
  const expectedStudentIds = makeupNeededStudentIds(lesson);
  if (expectedStudentIds.length === 0) return false;
  const scheduledStudentIds = new Set(
    vault.lessons
      .filter((item) => item.linkedOriginalLessonId === lesson.id && item.status !== "cancelled")
      .flatMap((item) => lessonStudentIds(item))
  );
  return expectedStudentIds.every((studentId) => scheduledStudentIds.has(studentId));
}
