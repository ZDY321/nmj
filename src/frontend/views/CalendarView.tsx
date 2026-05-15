import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import type { Lesson, TeacherVault, WeekStart } from "@/shared/types";
import {
  calendarDates,
  courseName,
  courseTypeLabel,
  campusName,
  formatPrivateMoney,
  lessonStatusLabels,
  lessonStatusSurfaceClass,
  lessonStatusVariant,
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

export function CalendarView({
  vault,
  amountsVisible,
  onWeekStartChange,
  onOpenLessonInCalendar
}: {
  vault: TeacherVault;
  amountsVisible: boolean;
  onWeekStartChange: (weekStart: WeekStart) => void;
  onOpenLessonInCalendar?: (lesson: Lesson) => void;
}) {
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(() => todayIso());
  const weekStartPreference = weekStartsOn(vault);
  const days = calendarDates(month, weekStartPreference);

  const selectedLessons = vault.lessons.filter((l) => l.date === selectedDate).sort(sortLessons);
  const weekDates = weekDatesFor(selectedDate, weekStartPreference);
  const weekLessons = vault.lessons.filter((l) => weekDates.includes(l.date));
  const monthLessons = vault.lessons.filter((l) => l.date.startsWith(month));
  const selectedTotal = selectedLessons.reduce((s, l) => s + l.feeSnapshot.amount, 0);
  const weekTotal = weekLessons.reduce((s, l) => s + l.feeSnapshot.amount, 0);
  const monthTotal = monthLessons.reduce((s, l) => s + l.feeSnapshot.amount, 0);

  const weekdayLabels = orderedWeekdayLabels(weekStartPreference, shortWeekdayLabels);

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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.45fr_0.75fr]">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <div className="flex items-center gap-2 text-[#ff8617] text-xs font-bold uppercase tracking-widest mb-1">
                <CalendarDays size={14} /> 日历总览
              </div>
              <CardTitle>{month}</CardTitle>
              <CardDescription>每天的课程、状态、校区和课时金额都排在日历上</CardDescription>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Select
                value={String(weekStartPreference)}
                onChange={(event) => onWeekStartChange(Number(event.target.value) as WeekStart)}
                className="h-10 w-[132px]"
                aria-label="选择一周开始日期"
              >
                <option value="0">周日开始</option>
                <option value="1">周一开始</option>
              </Select>
              <button onClick={() => setMonth((m) => monthShift(m, -1))} className="p-2 rounded-[10px] hover:bg-[#f3f7fb] transition-colors">
                <ChevronLeft size={18} />
              </button>
              <span className="font-bold min-w-[80px] text-center">{month}</span>
              <button onClick={() => setMonth((m) => monthShift(m, 1))} className="p-2 rounded-[10px] hover:bg-[#f3f7fb] transition-colors">
                <ChevronRight size={18} />
              </button>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6">
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {weekdayLabels.map((d) => (
                <div key={d} className="text-center text-xs font-bold text-(--color-muted-foreground) py-2">{d}</div>
              ))}
              {days.map((date) => {
                const dayLessons = vault.lessons.filter((l) => l.date === date).sort(sortLessons);
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
                    onClick={() => setSelectedDate(date)}
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
          </CardContent>
        </Card>

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
                  onClick={() => onOpenLessonInCalendar?.(lesson)}
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
      </div>
    </div>
  );
}
