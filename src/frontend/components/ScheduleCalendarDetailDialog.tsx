import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Lesson, TeacherVault } from "@/shared/types";
import { formatPrivateMoney } from "@/frontend/lib/helpers";
import {
  campusName,
  courseName,
  courseSubject,
  courseTypeLabel,
  lessonAttendanceNoteText,
  lessonStatusLabels,
  lessonStatusSurfaceClass,
  lessonStatusVariant,
  lessonTimeRangeLabel,
  lessonStudentDisplay
} from "@/frontend/lib/helpers";

type ScheduleCalendarDetailDialogProps = {
  amountsVisible: boolean;
  completedCount: number;
  date: string | null;
  dateWithWeekday: (date: string) => string;
  lessons: Lesson[];
  makeupMarkerForLesson: (lesson: Lesson) => string | null;
  onClose: () => void;
  onDeleteLesson: (lesson: Lesson) => void;
  onOpenLesson: (lesson: Lesson) => void;
  pendingCount: number;
  cancelledCount: number;
  totalAmount: number;
  vault: TeacherVault;
};

export function ScheduleCalendarDetailDialog({
  amountsVisible,
  completedCount,
  date,
  dateWithWeekday,
  lessons,
  makeupMarkerForLesson,
  onClose,
  onDeleteLesson,
  onOpenLesson,
  pendingCount,
  cancelledCount,
  totalAmount,
  vault
}: ScheduleCalendarDetailDialogProps) {
  return (
    <AnimatePresence>
      {date && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#061226]/45 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            className="flex max-h-[86vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[18px] border border-[#dbe4ef] bg-white shadow-[0_30px_80px_rgba(6,18,38,0.24)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#e8eef6] p-5">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                  <CalendarDays size={14} /> 当日课程
                </div>
                <h2 className="text-2xl font-extrabold leading-tight text-[#061226]">{dateWithWeekday(date)}</h2>
                <p className="mt-1 text-sm font-semibold text-[#64748b]">点击课程可跳转到课程记录详情。</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={onClose} className="shrink-0 rounded-full">
                <X size={18} />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  { label: "当天课次", value: `${lessons.length} 节` },
                  { label: "待上/待补", value: `${pendingCount} 节` },
                  { label: "已完成", value: `${completedCount} 节` },
                  { label: "已取消", value: `${cancelledCount} 节` },
                  { label: "当天金额", value: formatPrivateMoney(totalAmount, amountsVisible) }
                ].map((item) => (
                  <div key={item.label} className="rounded-[10px] border border-[#e8eef6] bg-[#f8fbff] px-3 py-2">
                    <div className="text-[11px] font-semibold text-[#64748b]">{item.label}</div>
                    <div className="mt-0.5 break-words text-sm font-extrabold text-[#061226]">{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {lessons.map((lesson) => {
                  const makeupMarker = makeupMarkerForLesson(lesson);
                  const attendanceNoteText = lessonAttendanceNoteText(vault, lesson);
                  return (
                    <div key={lesson.id} className={`rounded-[12px] border p-3 ${lessonStatusSurfaceClass(lesson.status)}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <button
                          type="button"
                          onClick={() => onOpenLesson(lesson)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-extrabold text-[#061226]">{courseName(vault, lesson.courseGroupId)}</span>
                            <Badge variant="secondary" className="text-[10px]">{courseSubject(vault, lesson.courseGroupId)}</Badge>
                            <Badge variant="secondary" className="text-[10px]">{courseTypeLabel(vault, lesson.type)}</Badge>
                            <Badge variant={lessonStatusVariant(lesson.status)} className="text-[10px]">{lessonStatusLabels[lesson.status]}</Badge>
                            {makeupMarker && <Badge variant="yellow" className="text-[10px]">{makeupMarker}</Badge>}
                          </div>
                          <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
                            {lessonTimeRangeLabel(lesson)} · {campusName(vault, lesson.campusId)} · {courseSubject(vault, lesson.courseGroupId)} · {lessonStudentDisplay(vault, lesson)}
                          </div>
                        </button>
                        <Button type="button" size="sm" variant="destructive" onClick={() => onDeleteLesson(lesson)}>
                          <Trash2 size={14} /> 删除
                        </Button>
                      </div>
                      {lesson.note && (
                        <div className="mt-2 rounded-[10px] bg-white/72 px-3 py-2 text-xs font-semibold text-[#7f1d1d]">{lesson.note}</div>
                      )}
                      {attendanceNoteText && (
                        <div className="mt-2 rounded-[10px] bg-white/72 px-3 py-2 text-xs font-semibold text-[#9a3412]">学生备注：{attendanceNoteText}</div>
                      )}
                    </div>
                  );
                })}
                {lessons.length === 0 && (
                  <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
                    这一天没有课程
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
