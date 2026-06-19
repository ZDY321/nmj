import { Clock, CornerUpLeft, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Lesson, TeacherVault } from "@/shared/types";
import {
  attendanceLabels,
  attendedStudentNamesForLesson,
  campusName,
  courseName,
  courseSubject,
  courseTypeLabel,
  findStudent,
  formatPrivateMoney,
  lessonStatusLabels,
  lessonStatusSurfaceClass,
  lessonStatusVariant,
  lessonStudentDisplay,
  lessonTimeRangeLabel,
  studentNames
} from "@/frontend/lib/helpers";

type CalendarMakeupEntry = {
  lesson: Lesson;
  entries: Lesson["attendance"];
  studentIds: string[];
  scheduledCount: number;
  wholeLesson: boolean;
};

type ScheduledMakeupEntry = {
  lesson: Lesson;
  original?: Lesson;
};

type ScheduleCalendarFollowupPanelsProps = {
  amountsVisible: boolean;
  completedCount: number;
  dateWithWeekday: (date: string) => string;
  makeupEntries: CalendarMakeupEntry[];
  makeupMarkerForLesson: (lesson: Lesson) => string | null;
  makeupOriginalDateFilter: string;
  onDeleteLesson: (lesson: Lesson) => void;
  onMakeupOriginalDateFilterChange: (value: string) => void;
  onOpenLesson: (lesson: Lesson) => void;
  optionalDateWithWeekday: (date: string | null | undefined) => string;
  pendingCount: number;
  cancelledCount: number;
  scheduledMakeupEntries: ScheduledMakeupEntry[];
  selectedCalendarDate: string;
  selectedCalendarLessons: Lesson[];
  totalAmount: number;
  vault: TeacherVault;
};

export function ScheduleCalendarFollowupPanels({
  amountsVisible,
  completedCount,
  dateWithWeekday,
  makeupEntries,
  makeupMarkerForLesson,
  makeupOriginalDateFilter,
  onDeleteLesson,
  onMakeupOriginalDateFilterChange,
  onOpenLesson,
  optionalDateWithWeekday,
  pendingCount,
  cancelledCount,
  scheduledMakeupEntries,
  selectedCalendarDate,
  selectedCalendarLessons,
  totalAmount,
  vault
}: ScheduleCalendarFollowupPanelsProps) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr] xl:items-start">
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
            <Clock size={14} /> 每日课程详情
          </div>
          <CardTitle>{dateWithWeekday(selectedCalendarDate)} 课程</CardTitle>
          <CardDescription>状态与课时记录同步，点击课程可跳转到课程记录详情。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "当天课次", value: `${selectedCalendarLessons.length} 节` },
              { label: "待上/待补", value: `${pendingCount} 节` },
              { label: "已完成", value: `${completedCount} 节` },
              { label: "当天金额", value: formatPrivateMoney(totalAmount, amountsVisible) },
              { label: "已取消", value: `${cancelledCount} 节` }
            ].map((item) => (
              <div key={item.label} className="rounded-[10px] border border-[#e8eef6] bg-[#f8fbff] px-3 py-2">
                <div className="text-[11px] font-semibold text-[#64748b]">{item.label}</div>
                <div className="mt-0.5 break-words text-sm font-extrabold text-[#061226]">{item.value}</div>
              </div>
            ))}
          </div>
          <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
            {selectedCalendarLessons.map((lesson) => {
              const makeupMarker = makeupMarkerForLesson(lesson);
              return (
                <div key={lesson.id} className={`rounded-[12px] border p-3 ${lessonStatusSurfaceClass(lesson.status)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={() => onOpenLesson(lesson)} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-extrabold text-[#061226]">{courseName(vault, lesson.courseGroupId)}</span>
                        <Badge variant="secondary" className="text-[10px]">{courseSubject(vault, lesson.courseGroupId)}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{courseTypeLabel(vault, lesson.type)}</Badge>
                        <Badge variant="sky" className="text-[10px]">{lessonStudentDisplay(vault, lesson)}</Badge>
                        <Badge variant={lessonStatusVariant(lesson.status)} className="text-[10px]">{lessonStatusLabels[lesson.status]}</Badge>
                        {makeupMarker && <Badge variant="yellow" className="text-[10px]">{makeupMarker}</Badge>}
                      </div>
                      <div className="mt-1 text-xs font-semibold text-[#64748b]">
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
                </div>
              );
            })}
            {selectedCalendarLessons.length === 0 && (
              <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-5 text-center text-sm font-semibold text-[#64748b]">
                这一天没有课程
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
            <RotateCcw size={14} /> 补课跟进
          </div>
          <CardTitle>需要补课的学生</CardTitle>
          <CardDescription>按原课日期筛选待补课记录，点击课程到课程记录里安排补课。</CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <label className="text-sm font-medium">原课日期</label>
              <Input type="date" value={makeupOriginalDateFilter} onChange={(event) => onMakeupOriginalDateFilterChange(event.target.value)} />
            </div>
            <Button type="button" variant="outline" className="self-end" onClick={() => onMakeupOriginalDateFilterChange("")} disabled={!makeupOriginalDateFilter}>
              全部
            </Button>
          </div>
          {makeupEntries.map(({ lesson, entries, scheduledCount, wholeLesson }) => (
            <button
              key={lesson.id}
              type="button"
              onClick={() => onOpenLesson(lesson)}
              className="w-full rounded-[14px] border border-[#facc15] bg-[#fefce8] p-3 text-left transition-all hover:border-[#eab308] hover:bg-[#fef3c7]"
            >
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-extrabold text-[#061226]">{courseName(vault, lesson.courseGroupId)}</div>
                    <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
                      {courseSubject(vault, lesson.courseGroupId)} · 原课：{dateWithWeekday(lesson.date)} · {lessonTimeRangeLabel(lesson)} · {campusName(vault, lesson.campusId)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="amber" className="px-2 py-0.5 text-[10px]">
                        {wholeLesson ? "整节待补" : `${entries.length} 人待补`}
                      </Badge>
                      {scheduledCount > 0 && (
                        <Badge variant="secondary" className="px-2 py-0.5 text-[10px]">
                          已安排 {scheduledCount} 人
                        </Badge>
                      )}
                      <Badge variant={lessonStatusVariant(lesson.status)} className="px-2 py-0.5 text-[10px]">
                        {lessonStatusLabels[lesson.status]}
                      </Badge>
                    </div>
                  </div>
                  <Badge variant="secondary" className="w-fit shrink-0">查看详情</Badge>
                </div>
                {!wholeLesson && (
                  <div className="space-y-2">
                    {entries.map((entry) => {
                      const studentName = findStudent(vault, entry.studentId)?.name ?? "未知学生";
                      return (
                        <div
                          key={`${lesson.id}-${entry.studentId}`}
                          className="flex flex-col gap-2 rounded-[12px] border border-[#fde68a] bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-[#061226]">
                              {studentName} · {attendanceLabels[entry.status]}
                            </div>
                            {entry.note && <div className="mt-1 text-xs font-semibold text-[#9a3412]">备注：{entry.note}</div>}
                          </div>
                          <Badge variant="amber" className="w-fit shrink-0">待安排</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </button>
          ))}
          {makeupEntries.length === 0 && (
            <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-5 text-center text-sm font-semibold text-[#64748b]">
              {makeupOriginalDateFilter ? "这个原课日期暂无待补课学生" : "暂无待补课学生"}
            </div>
          )}
          {scheduledMakeupEntries.length > 0 && (
            <div className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-extrabold text-[#061226]">已安排补课</div>
                <Badge variant="secondary" className="px-2 py-0.5 text-[10px]">{scheduledMakeupEntries.length} 节</Badge>
              </div>
              <div className="space-y-2">
                {scheduledMakeupEntries.map(({ lesson, original }) => (
                  <div key={lesson.id} className="rounded-[12px] border border-[#93c5fd] bg-white px-3 py-2">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-extrabold text-[#061226]">
                          {courseName(vault, lesson.courseGroupId)} · {attendedStudentNamesForLesson(vault, lesson) || studentNames(vault, lesson.expectedStudentIds)}
                        </div>
                        <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
                          {courseSubject(vault, lesson.courseGroupId)} · 原课：{optionalDateWithWeekday(original?.date ?? lesson.makeupOriginalDate)} · 补课：{optionalDateWithWeekday(lesson.makeupScheduledDate ?? lesson.date)} · {lessonTimeRangeLabel(lesson)}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant={lessonStatusVariant(lesson.status)} className="px-2 py-0.5 text-[10px]">
                            {lessonStatusLabels[lesson.status]}
                          </Badge>
                          <Badge variant="secondary" className="px-2 py-0.5 text-[10px]">
                            {campusName(vault, lesson.campusId)}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenLesson(lesson)}
                      >
                        查看补课详情
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenLesson(original ?? lesson)}
                        title="返回原课程详情对应的补课跟进"
                      >
                        <CornerUpLeft size={14} /> 返回原课跟进
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
