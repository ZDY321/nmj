import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Lesson, TeacherVault } from "@/shared/types";
import { getCourse } from "@/frontend/lib/calculations";
import {
  campusName,
  courseName,
  courseSubject,
  courseTypeLabel,
  lessonStatusLabels
} from "@/frontend/lib/helpers";
import { isOrderedDateRange, timesOverlap } from "@/frontend/lib/scheduleViewHelpers";

export type ScheduleCalendarSyncPanelProps = {
  isOpen: boolean;
  onToggleOpen: () => void;
  onCopyLessonRangeToDateRange: () => void;
  onCopySelectedLessonsToDate: () => void;
  onFillSyncRangeFromSelectedWeek: () => void;
  onSelectAllSyncLessons: () => void;
  onClearSyncLessons: () => void;
  onToggleSyncLesson: (lessonId: string) => void;
  onUsePreviousWeekSameDay: () => void;
  selectedSyncLessonIds: string[];
  selectedSyncLessons: Lesson[];
  selectableSyncLessons: Lesson[];
  setSyncRangeSourceEnd: (value: string) => void;
  setSyncRangeSourceStart: (value: string) => void;
  setSyncRangeTargetEnd: (value: string) => void;
  setSyncRangeTargetStart: (value: string) => void;
  setSyncSourceDate: (value: string) => void;
  setSyncTargetDate: (value: string) => void;
  syncRangeActiveLessons: Lesson[];
  syncRangeSourceDates: string[];
  syncRangeSourceEnd: string;
  syncRangeSourceLessons: Lesson[];
  syncRangeSourceStart: string;
  syncRangeTargetDates: string[];
  syncRangeTargetEnd: string;
  syncRangeTargetStart: string;
  syncSourceDate: string;
  syncSourceLessons: Lesson[];
  syncTargetDate: string;
  vault: TeacherVault;
};

export function ScheduleCalendarSyncPanel({
  isOpen,
  onToggleOpen,
  onCopyLessonRangeToDateRange,
  onCopySelectedLessonsToDate,
  onFillSyncRangeFromSelectedWeek,
  onSelectAllSyncLessons,
  onClearSyncLessons,
  onToggleSyncLesson,
  onUsePreviousWeekSameDay,
  selectedSyncLessonIds,
  selectedSyncLessons,
  selectableSyncLessons,
  setSyncRangeSourceEnd,
  setSyncRangeSourceStart,
  setSyncRangeTargetEnd,
  setSyncRangeTargetStart,
  setSyncSourceDate,
  setSyncTargetDate,
  syncRangeActiveLessons,
  syncRangeSourceDates,
  syncRangeSourceEnd,
  syncRangeSourceLessons,
  syncRangeSourceStart,
  syncRangeTargetDates,
  syncRangeTargetEnd,
  syncRangeTargetStart,
  syncSourceDate,
  syncSourceLessons,
  syncTargetDate,
  vault
}: ScheduleCalendarSyncPanelProps) {
  return (
    <div className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-extrabold text-[#061226]">同步课程</div>
          <div className="mt-1 text-xs font-semibold text-[#64748b]">支持单日勾选同步，也支持日期段一一对应同步；同步后按目标时间线自动衔接上一节内容和作业。</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="w-fit">{selectedSyncLessons.length} / {syncSourceLessons.length} 节</Badge>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onToggleOpen}
            className={`h-9 border px-3 font-extrabold shadow-sm ${
              isOpen
                ? "border-[#fb923c] bg-[#fff7ed] text-[#c2410c] hover:bg-[#ffedd5]"
                : "border-[#93c5fd] bg-[#eff6ff] text-[#1557c2] hover:bg-[#dbeafe]"
            }`}
          >
            {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {isOpen ? "折叠" : "展开"}
          </Button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="sync-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pt-1">
              <div className="rounded-[12px] border border-[#dbe4ef] bg-white p-3">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-extrabold text-[#061226]">同步某一天课程</div>
                    <div className="mt-1 text-xs font-semibold text-[#64748b]">从来源日期勾选课节，复制到目标日期。</div>
                  </div>
                  <Badge variant="secondary" className="w-fit">{selectedSyncLessons.length} / {syncSourceLessons.length} 节</Badge>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">来源日期</label>
                    <Input type="date" value={syncSourceDate} onChange={(event) => setSyncSourceDate(event.target.value)} className="h-10 bg-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">目标日期</label>
                    <Input type="date" value={syncTargetDate} onChange={(event) => setSyncTargetDate(event.target.value)} className="h-10 bg-white" />
                  </div>
                  <Button type="button" className="self-end" onClick={onCopySelectedLessonsToDate} disabled={selectedSyncLessons.length === 0 || syncSourceDate === syncTargetDate}>
                    <Copy size={15} /> 同步单日
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={onUsePreviousWeekSameDay}>
                    上周同日
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={onSelectAllSyncLessons} disabled={selectableSyncLessons.length === 0}>
                    全选
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={onClearSyncLessons} disabled={selectedSyncLessons.length === 0}>
                    清空
                  </Button>
                </div>
                <div className="mt-3 max-h-[190px] space-y-2 overflow-y-auto pr-1">
                  {syncSourceLessons.map((lesson) => {
                    const course = getCourse(vault, lesson.courseGroupId);
                    const disabled = course?.status !== "active";
                    const conflicted = Boolean(
                      syncTargetDate &&
                      vault.lessons.some(
                        (existingLesson) =>
                          existingLesson.date === syncTargetDate &&
                          existingLesson.courseGroupId === lesson.courseGroupId &&
                          existingLesson.status !== "cancelled" &&
                          timesOverlap(existingLesson.startTime, existingLesson.endTime, lesson.startTime, lesson.endTime)
                      )
                    );
                    return (
                      <label
                        key={lesson.id}
                        className={`flex items-start gap-3 rounded-[12px] border px-3 py-2 text-sm ${
                          disabled
                            ? "border-[#e2e8f0] bg-white text-[#94a3b8]"
                            : conflicted
                              ? "border-[#facc15] bg-[#fefce8] text-[#854d0e]"
                              : "border-[#dbe4ef] bg-white text-[#25324a]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSyncLessonIds.includes(lesson.id)}
                          onChange={() => onToggleSyncLesson(lesson.id)}
                          disabled={disabled}
                          className="mt-1 h-4 w-4 accent-[#ff8617]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-extrabold">{lesson.startTime}-{lesson.endTime} · {courseName(vault, lesson.courseGroupId)}</span>
                          <span className="mt-1 block text-xs font-semibold">
                            {courseSubject(vault, lesson.courseGroupId)} · {courseTypeLabel(vault, lesson.type)} · {campusName(vault, lesson.campusId)} · {lessonStatusLabels[lesson.status]}{disabled ? " · 课程已暂停" : conflicted ? " · 目标日期会覆盖" : ""}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                  {syncSourceLessons.length === 0 && (
                    <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-white p-5 text-center text-sm font-semibold text-[#64748b]">
                      来源日期没有可同步课节
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[12px] border border-[#cfe0f5] bg-[#f8fbff] p-3">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-extrabold text-[#061226]">同步日期段</div>
                    <div className="mt-1 text-xs font-semibold text-[#64748b]">来源日期段用于复制排课；同步后按目标课节时间线自动衔接上一节内容和作业。</div>
                  </div>
                  <Badge variant="sky" className="w-fit">{syncRangeActiveLessons.length} / {syncRangeSourceLessons.length} 节</Badge>
                </div>
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] xl:items-end">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">来源开始</label>
                      <Input type="date" value={syncRangeSourceStart} onChange={(event) => setSyncRangeSourceStart(event.target.value)} className={!isOrderedDateRange(syncRangeSourceStart, syncRangeSourceEnd) ? "h-10 border-[#fca5a5] bg-[#fff1f2]" : "h-10 bg-white"} />
                    </div>
                    <div className="pb-2 text-center text-lg font-extrabold text-[#1557c2]">~</div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">来源结束</label>
                      <Input type="date" value={syncRangeSourceEnd} min={syncRangeSourceStart} onChange={(event) => setSyncRangeSourceEnd(event.target.value)} className={!isOrderedDateRange(syncRangeSourceStart, syncRangeSourceEnd) ? "h-10 border-[#fca5a5] bg-[#fff1f2]" : "h-10 bg-white"} />
                    </div>
                  </div>
                  <div className="hidden pb-2 text-center text-xl font-extrabold text-[#ff8617] xl:block">-&gt;</div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">目标开始</label>
                      <Input type="date" value={syncRangeTargetStart} onChange={(event) => setSyncRangeTargetStart(event.target.value)} className={!isOrderedDateRange(syncRangeTargetStart, syncRangeTargetEnd) ? "h-10 border-[#fca5a5] bg-[#fff1f2]" : "h-10 bg-white"} />
                    </div>
                    <div className="pb-2 text-center text-lg font-extrabold text-[#1557c2]">~</div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">目标结束</label>
                      <Input type="date" value={syncRangeTargetEnd} min={syncRangeTargetStart} onChange={(event) => setSyncRangeTargetEnd(event.target.value)} className={!isOrderedDateRange(syncRangeTargetStart, syncRangeTargetEnd) ? "h-10 border-[#fca5a5] bg-[#fff1f2]" : "h-10 bg-white"} />
                    </div>
                  </div>
                  <Button
                    type="button"
                    className="self-end"
                    onClick={onCopyLessonRangeToDateRange}
                    disabled={
                      syncRangeSourceLessons.length === 0 ||
                      syncRangeSourceDates.length === 0 ||
                      syncRangeSourceDates.length !== syncRangeTargetDates.length
                    }
                  >
                    <Copy size={15} /> 同步日期段
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={onFillSyncRangeFromSelectedWeek}>
                    上周整周到本周
                  </Button>
                  <Badge variant={syncRangeSourceDates.length === syncRangeTargetDates.length ? "secondary" : "yellow"} className="w-fit">
                    {`${syncRangeSourceDates.length} 天 -> ${syncRangeTargetDates.length} 天`}
                  </Badge>
                  {syncRangeSourceLessons.length > syncRangeActiveLessons.length && (
                    <Badge variant="yellow" className="w-fit">{syncRangeSourceLessons.length - syncRangeActiveLessons.length} 节课程已暂停</Badge>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
