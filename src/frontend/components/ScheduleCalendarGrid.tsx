import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import type { Lesson, TeacherVault, WeekStart } from "@/shared/types";
import {
  calendarDates,
  courseName,
  courseSubject,
  formatPrivateMoney,
} from "@/frontend/lib/helpers";

export type ScheduleCalendarGridProps = {
  amountsVisible: boolean;
  calendarCourseGroupId: string;
  calendarLessonsForDate: (date: string) => Lesson[];
  calendarMode: "schedule" | "view";
  calendarMonth: string;
  makeupMarkerForLesson: (lesson: Lesson) => string | null;
  onDateClick: (date: string) => void;
  selectedCalendarDate: string;
  vault: TeacherVault;
  visibleWeekdayLabels: string[];
  weekStartPreference: WeekStart;
};

export function ScheduleCalendarGrid({
  amountsVisible,
  calendarCourseGroupId,
  calendarLessonsForDate,
  calendarMode,
  calendarMonth,
  makeupMarkerForLesson,
  onDateClick,
  selectedCalendarDate,
  vault,
  visibleWeekdayLabels,
  weekStartPreference
}: ScheduleCalendarGridProps) {
  return (
    <div className="grid grid-cols-7 gap-1 sm:gap-2">
      {visibleWeekdayLabels.map((day) => (
        <div key={day} className="py-2 text-center text-xs font-bold text-(--color-muted-foreground)">{day}</div>
      ))}
      {calendarDates(calendarMonth, weekStartPreference).map((calendarDate) => {
        const dayLessons = calendarLessonsForDate(calendarDate);
        const amount = dayLessons.reduce((sum, lesson) => sum + lesson.feeSnapshot.amount, 0);
        const isCurrentMonth = calendarDate.startsWith(calendarMonth);
        const hasCancelled = dayLessons.some((lesson) => lesson.status === "cancelled");
        const hasCompleted = dayLessons.some((lesson) => lesson.status === "completed" || lesson.status === "makeup_completed");
        const hasPending = dayLessons.some((lesson) => lesson.status === "scheduled");
        const isAllCompleted = dayLessons.length > 0 && dayLessons.every((lesson) => lesson.status === "completed" || lesson.status === "makeup_completed");
        const hasMakeup = dayLessons.some((lesson) => makeupMarkerForLesson(lesson));
        return (
          <motion.button
            key={calendarDate}
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onDateClick(calendarDate)}
            disabled={calendarMode === "schedule" && !calendarCourseGroupId}
            className={`relative flex min-h-[74px] flex-col items-start rounded-[12px] border p-1.5 text-left transition-all duration-200 sm:min-h-[132px] sm:rounded-[14px] sm:p-2.5 xl:min-h-[150px] ${
              selectedCalendarDate === calendarDate
                ? hasMakeup
                  ? "border-2 border-[#facc15] bg-[#fef9c3] shadow-[0_0_0_3px_rgba(250,204,21,0.2),0_14px_28px_rgba(202,138,4,0.14)]"
                  : isAllCompleted
                    ? "border-2 border-[#22c55e] bg-[#f0fdf4] shadow-[0_0_0_3px_rgba(34,197,94,0.16),0_14px_28px_rgba(22,163,74,0.14)]"
                    : "border-2 border-[#ff8617] bg-[#fff7ed] shadow-[0_0_0_3px_rgba(255,134,23,0.18),0_14px_30px_rgba(255,134,23,0.18)]"
                : isCurrentMonth
                  ? hasMakeup
                    ? "border-[#facc15] bg-[#fefce8] hover:shadow-[0_10px_24px_rgba(202,138,4,0.1)]"
                    : hasCancelled
                      ? "border-[#fecaca] bg-[#fff1f2] hover:shadow-[0_10px_24px_rgba(127,29,29,0.08)]"
                      : isAllCompleted
                        ? "border-[#bbf7d0] bg-[#f0fdf4] hover:border-[#86efac] hover:shadow-[0_10px_24px_rgba(22,163,74,0.1)]"
                        : "border-[#dbe4ef] bg-white hover:shadow-[0_10px_24px_rgba(15,35,66,0.08)]"
                  : "border-transparent bg-white opacity-40"
            }`}
          >
            <span className={`text-sm font-bold ${selectedCalendarDate === calendarDate ? (hasMakeup ? "text-[#854d0e]" : isAllCompleted ? "text-[#15803d]" : "text-[#ff8617]") : "text-[#061226]"}`}>
              {Number(calendarDate.slice(8))}
            </span>
            <div className="mt-2 flex gap-1 sm:hidden">
              {hasCompleted && <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />}
              {hasCancelled && <span className="h-1.5 w-1.5 rounded-full bg-[#dc2626]" />}
              {hasPending && <span className="h-1.5 w-1.5 rounded-full bg-[#ff8617]" />}
              {hasMakeup && <span className="h-1.5 w-1.5 rounded-full bg-[#eab308]" />}
            </div>
            <div className="mt-1.5 hidden flex-wrap gap-1 sm:flex">
              {hasCompleted && <Badge variant="sage" className="text-[10px] px-1.5 py-0">完成</Badge>}
              {hasCancelled && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">取消</Badge>}
              {hasPending && <Badge variant="amber" className="text-[10px] px-1.5 py-0">待确认</Badge>}
              {hasMakeup && <Badge variant="yellow" className="text-[10px] px-1.5 py-0">补课</Badge>}
              {amount > 0 && <Badge variant="default" className="px-1.5 py-0 text-[10px]">{formatPrivateMoney(amount, amountsVisible)}</Badge>}
            </div>
            {dayLessons.slice(0, 4).map((lesson) => {
              const makeupMarker = makeupMarkerForLesson(lesson);
              return (
                <span key={lesson.id} className="mt-0.5 hidden w-full truncate text-[11px] font-semibold text-(--color-muted-foreground) sm:block">
                  {lesson.startTime}-{lesson.endTime} · {courseSubject(vault, lesson.courseGroupId)} · {courseName(vault, lesson.courseGroupId)}
                  {makeupMarker ? ` · ${makeupMarker}` : ""}
                </span>
              );
            })}
            {dayLessons.length > 4 && (
              <span className="hidden text-[10px] font-bold text-[#1557c2] sm:block">+{dayLessons.length - 4} 节</span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
