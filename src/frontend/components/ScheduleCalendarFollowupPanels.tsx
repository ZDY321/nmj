import { Clock, CornerUpLeft, MessageSquare, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { AttendanceStatus, Lesson, TeacherVault } from "@/shared/types";
import {
  attendanceLabels,
  attendedStudentNamesForLesson,
  campusName,
  courseTypeLabel,
  findStudent,
  formatPrivateMoney,
  lessonDisplayName,
  lessonDisplaySubject,
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
  dayNote: string;
  makeupEntries: CalendarMakeupEntry[];
  makeupMarkerForLesson: (lesson: Lesson) => string | null;
  makeupOriginalDateFilter: string;
  onCompleteScheduledMakeups?: (lessons: Lesson[]) => void;
  onDeleteLesson: (lesson: Lesson) => void;
  onMakeupOriginalDateFilterChange: (value: string) => void;
  onMarkOriginalStudentsMadeUp?: (lesson: Lesson, studentIds: string[]) => void;
  onUpdateOriginalAttendance?: (lesson: Lesson, studentId: string, status: AttendanceStatus) => void;
  onUpdateOriginalMakeupExempt?: (lesson: Lesson, studentId: string, makeupExempt: boolean) => void;
  onOpenLesson: (lesson: Lesson) => void;
  optionalDateWithWeekday: (date: string | null | undefined) => string;
  pendingCount: number;
  cancelledCount: number;
  scheduledMakeupEntries: ScheduledMakeupEntry[];
  showDailyDetails?: boolean;
  selectedCalendarDate: string;
  selectedCalendarLessons: Lesson[];
  totalAmount: number;
  vault: TeacherVault;
};

export function ScheduleCalendarFollowupPanels({
  amountsVisible,
  completedCount,
  dateWithWeekday,
  dayNote,
  makeupEntries,
  makeupMarkerForLesson,
  makeupOriginalDateFilter,
  onCompleteScheduledMakeups,
  onDeleteLesson,
  onMakeupOriginalDateFilterChange,
  onMarkOriginalStudentsMadeUp,
  onOpenLesson,
  onUpdateOriginalAttendance,
  onUpdateOriginalMakeupExempt,
  optionalDateWithWeekday,
  pendingCount,
  cancelledCount,
  scheduledMakeupEntries,
  showDailyDetails = true,
  selectedCalendarDate,
  selectedCalendarLessons,
  totalAmount,
  vault
}: ScheduleCalendarFollowupPanelsProps) {
  const incompleteScheduledMakeupLessons = scheduledMakeupEntries
    .map((entry) => entry.lesson)
    .filter((lesson) => lesson.status !== "completed" && lesson.status !== "makeup_completed");

  return (
    <div className={showDailyDetails ? "grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr] xl:items-start" : "grid grid-cols-1 gap-6"}>
      {showDailyDetails && (
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
          {dayNote && (
            <details className="rounded-[12px] border border-[#bfdbfe] bg-[#eaf2ff] px-3 py-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-extrabold text-[#1557c2] [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <MessageSquare size={14} /> 当日备注
                </span>
                <span className="text-[11px] font-bold text-[#64748b]">展开查看</span>
              </summary>
              <div className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#1e3a8a]">{dayNote}</div>
            </details>
          )}
          <div className="space-y-2">
            {selectedCalendarLessons.map((lesson) => {
              const makeupMarker = makeupMarkerForLesson(lesson);
              return (
                <div key={lesson.id} className={`rounded-[12px] border p-3 ${lessonStatusSurfaceClass(lesson.status)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={() => onOpenLesson(lesson)} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-extrabold text-[#061226]">{lessonDisplayName(vault, lesson)}</span>
                        <Badge variant="secondary" className="text-[10px]">{lessonDisplaySubject(vault, lesson)}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{courseTypeLabel(vault, lesson.type)}</Badge>
                        <Badge variant="sky" className="text-[10px]">{lessonStudentDisplay(vault, lesson)}</Badge>
                        <Badge variant={lessonStatusVariant(lesson.status)} className="text-[10px]">{lessonStatusLabels[lesson.status]}</Badge>
                        {makeupMarker && <Badge variant="yellow" className="text-[10px]">{makeupMarker}</Badge>}
                      </div>
                      <div className="mt-1 text-xs font-semibold text-[#64748b]">
                        {lessonTimeRangeLabel(lesson)} · {campusName(vault, lesson.campusId)} · {lessonDisplaySubject(vault, lesson)} · {lessonStudentDisplay(vault, lesson)}
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
      )}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
            <RotateCcw size={14} /> 补课跟进
          </div>
          <CardTitle>需要补课的学生</CardTitle>
          <CardDescription>{showDailyDetails ? "按原课日期筛选待补课记录，点击课程到课程记录里安排补课。" : "可直接调整待补学生状态、标记本次不补，或批量完成已安排补课。"}</CardDescription>
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
            <div
              key={lesson.id}
              className="w-full rounded-[14px] border border-[#facc15] bg-[#fefce8] p-3 text-left transition-all hover:border-[#eab308] hover:bg-[#fef3c7]"
            >
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-extrabold text-[#061226]">{lessonDisplayName(vault, lesson)}</div>
                    <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
                      {lessonDisplaySubject(vault, lesson)} · 原课：{dateWithWeekday(lesson.date)} · {lessonTimeRangeLabel(lesson)} · {campusName(vault, lesson.campusId)}
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
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {onMarkOriginalStudentsMadeUp && entries.length > 1 && (
                      <Button type="button" size="sm" variant="outline" className="border-[#fde68a] bg-white text-[#854d0e]" onClick={() => onMarkOriginalStudentsMadeUp(lesson, entries.map((entry) => entry.studentId))}>
                        批量已补课
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="outline" className="bg-white" onClick={() => onOpenLesson(lesson)}>
                      查看详情
                    </Button>
                  </div>
                </div>
                {(!wholeLesson || !showDailyDetails || onUpdateOriginalAttendance || onMarkOriginalStudentsMadeUp || onUpdateOriginalMakeupExempt) && (
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
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            {onUpdateOriginalAttendance && (
                              <Select value={entry.status} onChange={(event) => onUpdateOriginalAttendance(lesson, entry.studentId, event.target.value as AttendanceStatus)} className="h-9 max-w-[136px] bg-white">
                                <option value="leave_requested">请假</option>
                                <option value="absent">缺席</option>
                                <option value="makeup_pending">待补课</option>
                                <option value="makeup_completed">已补课</option>
                                <option value="attended">到课</option>
                              </Select>
                            )}
                            {onMarkOriginalStudentsMadeUp && (
                              <Button type="button" size="sm" variant="outline" className="border-[#bbf7d0] bg-white text-[#15803d]" onClick={() => onMarkOriginalStudentsMadeUp(lesson, [entry.studentId])}>
                                已补课
                              </Button>
                            )}
                            {onUpdateOriginalMakeupExempt && (
                              <Button type="button" size="sm" variant="outline" className="border-[#fde68a] bg-white text-[#854d0e]" onClick={() => onUpdateOriginalMakeupExempt(lesson, entry.studentId, true)}>
                                本次不补
                              </Button>
                            )}
                            {!onUpdateOriginalAttendance && !onMarkOriginalStudentsMadeUp && !onUpdateOriginalMakeupExempt && (
                              <Badge variant="amber" className="w-fit shrink-0">待安排</Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {makeupEntries.length === 0 && (
            <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-5 text-center text-sm font-semibold text-[#64748b]">
              {makeupOriginalDateFilter ? "这个原课日期暂无待补课学生" : "暂无待补课学生"}
            </div>
          )}
          {scheduledMakeupEntries.length > 0 && (
            <div className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-extrabold text-[#061226]">已安排补课</div>
                <div className="flex flex-wrap items-center gap-2">
                  {onCompleteScheduledMakeups && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-[#bbf7d0] bg-white text-[#15803d]"
                      disabled={incompleteScheduledMakeupLessons.length === 0}
                      onClick={() => onCompleteScheduledMakeups(incompleteScheduledMakeupLessons)}
                    >
                      批量标记已补课
                    </Button>
                  )}
                  <Badge variant="secondary" className="px-2 py-0.5 text-[10px]">{scheduledMakeupEntries.length} 节</Badge>
                </div>
              </div>
              <div className="space-y-2">
                {scheduledMakeupEntries.map(({ lesson, original }) => (
                  <div key={lesson.id} className="rounded-[12px] border border-[#93c5fd] bg-white px-3 py-2">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-extrabold text-[#061226]">
                          {lessonDisplayName(vault, lesson)} · {attendedStudentNamesForLesson(vault, lesson) || studentNames(vault, lesson.expectedStudentIds)}
                        </div>
                        <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
                          {lessonDisplaySubject(vault, lesson)} · 原课：{optionalDateWithWeekday(original?.date ?? lesson.makeupOriginalDate)} · 补课：{optionalDateWithWeekday(lesson.makeupScheduledDate ?? lesson.date)} · {lessonTimeRangeLabel(lesson)}
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
                      {onCompleteScheduledMakeups && lesson.status !== "completed" && lesson.status !== "makeup_completed" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-[#bbf7d0] bg-white text-[#15803d]"
                          onClick={() => onCompleteScheduledMakeups([lesson])}
                        >
                          标记已补课
                        </Button>
                      )}
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
