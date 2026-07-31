import { useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  CalendarDays,
  Clock3,
  FileText,
  MapPin,
  NotebookPen,
  MessageSquare,
  Users,
  XCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Lesson, MemoItem, TeacherVault, TodoItem } from "@/shared/types";
import { MemoView } from "@/frontend/views/MemoView";
import { TodoView } from "@/frontend/views/TodoView";
import { formatAppDateLabel, getCourse, todayIso } from "@/frontend/lib/calculations";
import { groupOpenTodos } from "@/frontend/lib/todos";
import {
  attendanceLabels,
  attendedStudentNamesForLesson,
  campusName,
  compareByName,
  courseName,
  findStudent,
  formatPrivateMoney,
  isToday,
  lessonAttendanceNotes,
  lessonStatusLabels,
  lessonStatusSurfaceClass,
  lessonStatusVariant,
  lessonTimeRangeLabel,
  previousLesson,
  sortCampusesForProfile,
  sortLessons,
  studentNames
} from "@/frontend/lib/helpers";

type TodaySubPage = "lessons" | "todos" | "memos";

export function TodayView({
  vault,
  selectedDate,
  amountsVisible,
  onUpdateLesson,
  onAddTodo,
  onUpdateTodo,
  onDeleteTodo,
  onMergeTodosToMemo,
  onSaveMemo,
  onDeleteMemo,
  onOpenLessonInRecords,
  onOpenLessonFeedback
}: {
  vault: TeacherVault;
  selectedDate: string;
  amountsVisible: boolean;
  onUpdateLesson: (lesson: Lesson) => void;
  onAddTodo: (todo: TodoItem) => void;
  onUpdateTodo: (todo: TodoItem) => void;
  onDeleteTodo: (todoId: string) => void;
  onMergeTodosToMemo: (todoIds: string[], memo: MemoItem) => void;
  onSaveMemo: (memo: MemoItem) => void;
  onDeleteMemo: (memoId: string) => void;
  onOpenLessonInRecords?: (lesson: Lesson) => void;
  onOpenLessonFeedback?: (lesson: Lesson) => void;
}) {
  const [subPage, setSubPage] = useState<TodaySubPage>("lessons");
  const campusOptions = sortCampusesForProfile(vault.campuses, vault.profile.homeCampusId);
  const selectedDateLessons = vault.lessons.filter((lesson) => lesson.date === selectedDate).sort(sortLessons);
  const waitingLessons = selectedDateLessons.filter((lesson) => lesson.status === "scheduled" || lesson.status === "draft");
  const cancelledLessons = selectedDateLessons.filter((lesson) => lesson.status === "cancelled");
  const campusCounts = campusOptions
    .map((campus, index) => ({
      campus,
      count: selectedDateLessons.filter((lesson) => lesson.campusId === campus.id).length,
      tone: campusColorClass(index)
    }))
    .filter((item) => item.count > 0);
  const today = todayIso();
  const todoGroups = groupOpenTodos(vault.todoItems ?? [], today);
  const openTodos = [...todoGroups.overdue, ...todoGroups.upcoming, ...todoGroups.undated];
  const openTodoCount = openTodos.length;
  const dueSelectedDateTodoCount = openTodos.filter((todo) => todo.dueDate === selectedDate).length;
  const previewLimit = 5;
  const reservedUpcomingCount = Math.min(3, todoGroups.upcoming.length);
  const overduePreview = todoGroups.overdue.slice(0, previewLimit - reservedUpcomingCount);
  const upcomingPreview = todoGroups.upcoming.slice(0, previewLimit - overduePreview.length);
  const hiddenDatedTodoCount = todoGroups.overdue.length + todoGroups.upcoming.length - overduePreview.length - upcomingPreview.length;
  const memoCount = vault.memoItems?.length ?? 0;
  const selectedDateLabel = formatAppDateLabel(selectedDate, {
    month: "long",
    day: "numeric",
    weekday: "long"
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[ 
          { label: isToday(selectedDate) ? "今日课程" : "选中日期课程", value: `${selectedDateLessons.length} 节`, icon: CalendarDays },
          { label: "待上课", value: `${waitingLessons.length} 节`, icon: Clock3 },
          { label: "待办事项", value: `${openTodoCount} 条`, icon: NotebookPen },
          { label: "备忘录", value: `${memoCount} 条`, icon: FileText },
          { label: "已取消", value: `${cancelledLessons.length} 条`, icon: XCircle }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="overflow-hidden">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#fff1e2] text-[#ff8617]">
                  <Icon size={22} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#64748b]">{item.label}</div>
                  <div className="mt-1 text-2xl font-extrabold text-[#061226]">{item.value}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-2">
        {[
          { key: "lessons" as TodaySubPage, label: "课程提醒", count: selectedDateLessons.length },
          { key: "todos" as TodaySubPage, label: "待办事项", count: openTodoCount },
          { key: "memos" as TodaySubPage, label: "备忘录", count: memoCount }
        ].map((item) => {
          const active = subPage === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setSubPage(item.key)}
              className={`flex min-h-10 items-center gap-2 rounded-[10px] px-4 text-sm font-extrabold transition-colors ${
                active
                  ? "bg-white text-[#1557c2] shadow-[0_8px_20px_rgba(15,35,66,0.08)] ring-1 ring-[#bfdbfe]"
                  : "text-[#64748b] hover:bg-white/70 hover:text-[#061226]"
              }`}
            >
              {item.label}
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${active ? "bg-[#eaf2ff] text-[#1557c2]" : "bg-white text-[#64748b]"}`}>
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {subPage === "todos" ? (
        <TodoView
          vault={vault}
          selectedDate={selectedDate}
          onAddTodo={onAddTodo}
          onUpdateTodo={onUpdateTodo}
          onDeleteTodo={onDeleteTodo}
          onMergeTodosToMemo={onMergeTodosToMemo}
        />
      ) : subPage === "memos" ? (
        <MemoView
          vault={vault}
          onSaveMemo={onSaveMemo}
          onDeleteMemo={onDeleteMemo}
        />
      ) : (
        <>
      <Card className="overflow-hidden">
        <CardContent className="p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-extrabold text-[#061226]">各校区课程数量</div>
              <div className="mt-1 text-sm font-semibold text-[#64748b]">
                {selectedDateLabel} 的校区分布，便于提前确认通勤和教室。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {campusCounts.length > 0 ? campusCounts.map((item) => (
                <span key={item.campus.id} className={`rounded-full px-3 py-1 text-xs font-extrabold ${item.tone}`}>
                  {item.campus.name} · {item.count} 节
                </span>
              )) : (
                <Badge variant="secondary" className="px-3 py-1">暂无校区课程</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
                <NotebookPen size={14} /> 待办事项
              </div>
              <CardTitle className="text-xl">待跟进事项</CardTitle>
              <CardDescription className="mt-2">
                {dueSelectedDateTodoCount > 0
                  ? `${selectedDateLabel} 有 ${dueSelectedDateTodoCount} 条待办到期。`
                  : `${selectedDateLabel} 没有到期待办。`}
                下方最多预览 5 条已逾期或未来事项。
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={openTodoCount ? "amber" : "secondary"} className="w-fit">
                {openTodoCount ? `${openTodoCount} 条待办` : "已清空"}
              </Badge>
              <Button type="button" size="sm" variant="outline" onClick={() => setSubPage("todos")} className="border-[#dbe4ef]">
                <NotebookPen size={14} /> 查看待办事项
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-5 pb-5 pt-0">
          {overduePreview.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-extrabold text-[#b91c1c]">
                <span>已逾期 · 最早日期优先</span>
                <span>{todoGroups.overdue.length} 条</span>
              </div>
              {overduePreview.map((todo) => (
                <label key={todo.id} className="flex cursor-pointer items-start gap-3 rounded-[12px] border border-[#fecaca] bg-[#fff1f2] px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => onUpdateTodo({ ...todo, status: "done" })}
                    className="mt-1 h-4 w-4 accent-[#ff8617]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold text-[#061226]">{todo.title}</span>
                    <span className="mt-0.5 block text-xs font-semibold text-[#b91c1c]">截止：{todo.dueDate}</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {upcomingPreview.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-extrabold text-[#1557c2]">
                <span>今天及未来 · 最近日期优先</span>
                <span>{todoGroups.upcoming.length} 条</span>
              </div>
              {upcomingPreview.map((todo) => (
                <label key={todo.id} className="flex cursor-pointer items-start gap-3 rounded-[12px] border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => onUpdateTodo({ ...todo, status: "done" })}
                    className="mt-1 h-4 w-4 accent-[#ff8617]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold text-[#061226]">{todo.title}</span>
                    <span className="mt-0.5 block text-xs font-semibold text-[#1557c2]">
                      {todo.dueDate === today ? "今天截止" : `截止：${todo.dueDate}`}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {overduePreview.length === 0 && upcomingPreview.length === 0 && (
            <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-5 text-center text-sm font-semibold text-[#64748b]">
              暂无已设置截止日期的未完成待办。
            </div>
          )}

          {(hiddenDatedTodoCount > 0 || todoGroups.undated.length > 0) && (
            <div className="text-xs font-semibold text-[#64748b]">
              {hiddenDatedTodoCount > 0 ? `另有 ${hiddenDatedTodoCount} 条日期待办未展开。` : ""}
              {todoGroups.undated.length > 0 ? ` 还有 ${todoGroups.undated.length} 条未设置日期的待办。` : ""}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-[#e8eef6] pb-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-[#ff8617]">
                <BookOpen size={14} /> 今日提醒
              </div>
              <CardTitle className="text-xl">
                {isToday(selectedDate) ? "今天应该上的课程" : "选中日期课程"}
              </CardTitle>
              <CardDescription className="mt-2">
                {selectedDateLabel}，按上课时间排列，并显示上节课留下的内容和作业。
              </CardDescription>
            </div>
            <Badge variant={selectedDateLessons.length ? "sky" : "secondary"} className="w-fit">
              {selectedDateLessons.length ? `${selectedDateLessons.length} 节` : "无课程"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-4 sm:p-6">
          {selectedDateLessons.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
              {isToday(selectedDate) ? "今天没有已生成的课程。" : "这一天没有已生成的课程。"}
            </div>
          ) : (
            selectedDateLessons.map((lesson, index) => {
              const previous = previousLesson(vault, lesson);
              const previousHomeworkText = previous?.content.homework.trim() || "";
              const campusTone = campusColorClass(campusOptions.findIndex((campus) => campus.id === lesson.campusId));
              const course = getCourse(vault, lesson.courseGroupId);
              const attendanceNotes = lessonAttendanceNotes(vault, lesson);
              return (
                <motion.article
                  key={lesson.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className={`rounded-[16px] border p-4 shadow-[0_10px_26px_rgba(15,35,66,0.06)] sm:p-5 ${lessonStatusSurfaceClass(lesson.status)}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-extrabold text-[#061226]">
                        {courseName(vault, lesson.courseGroupId)}
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-[#64748b]">
                        <span className="flex items-center gap-1 rounded-full bg-[#f3f7fb] px-2.5 py-1">
                          <Clock3 size={13} /> {lessonTimeRangeLabel(lesson)}
                        </span>
                        <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 ${campusTone}`}>
                          <MapPin size={13} /> {campusName(vault, lesson.campusId)}
                        </span>
                        <span className="flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-[#dbe4ef]">
                          <BookOpen size={13} /> {course?.subject || "未设置科目"}
                        </span>
                        <span className="flex items-center gap-1 rounded-full bg-[#f3f7fb] px-2.5 py-1">
                          <Users size={13} /> {attendedStudentNamesForLesson(vault, lesson) || "暂无实到学生"}
                        </span>
                      </div>
                    </div>
                    <Badge variant={lessonStatusVariant(lesson.status)} className="w-fit">
                      {lessonStatusLabels[lesson.status]}
                    </Badge>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                    <div className="rounded-[14px] border border-[#e8eef6] bg-[#f8fbff] p-4">
                      <div className="mb-2 text-sm font-extrabold text-[#25324a]">学生情况</div>
                      <div className="flex flex-wrap gap-2">
                        {lesson.attendance.length > 0 ? [...lesson.attendance]
                          .sort((a, b) => {
                            const aName = findStudent(vault, a.studentId)?.name ?? "未知学生";
                            const bName = findStudent(vault, b.studentId)?.name ?? "未知学生";
                            return compareByName(aName, bName) || a.studentId.localeCompare(b.studentId);
                          })
                          .map((entry) => (
                          <span
                            key={entry.studentId}
                            className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
                              entry.status === "makeup_pending"
                                ? "bg-[#fef9c3] text-[#854d0e] ring-[#facc15]"
                                : "bg-white text-[#475569] ring-[#dbe4ef]"
                            }`}
                          >
                            {findStudent(vault, entry.studentId)?.name ?? "未知学生"} · {attendanceLabels[entry.status]}
                          </span>
                        )) : [...lesson.expectedStudentIds]
                          .map((studentId) => ({ studentId, name: findStudent(vault, studentId)?.name ?? "未知学生" }))
                          .sort((a, b) => compareByName(a.name, b.name) || a.studentId.localeCompare(b.studentId))
                          .map(({ studentId, name }) => (
                          <span key={studentId} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#475569] ring-1 ring-[#dbe4ef]">
                            {name}
                          </span>
                        ))}
                      </div>
                      {attendanceNotes.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {attendanceNotes.map((item) => (
                            <div key={item.studentId} className="rounded-[10px] bg-white/72 px-3 py-2 text-xs font-semibold leading-5 text-[#9a3412]">
                              {item.studentName}：{item.note}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="rounded-[14px] border border-[#e8eef6] bg-[#f8fbff] p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#25324a]">
                        <BookOpen size={16} className="text-[#1557c2]" />
                        上节课内容
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-[#475569]">
                        {previous?.content.taught.trim() || "上一节课没有记录内容。"}
                      </p>
                    </div>
                    <div className="rounded-[14px] border border-[#e8eef6] bg-[#f8fbff] p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#25324a]">
                        <NotebookPen size={16} className="text-[#ff8617]" />
                        上节课作业
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-[#475569]">
                        {previousHomeworkText || "上一节课没有记录作业。"}
                      </p>
                    </div>
                  </div>

                  {lesson.status === "cancelled" && (
                    <div className="mt-4 rounded-[14px] border border-[#fecaca] bg-[#fff1f2] p-3">
                      <label className="text-sm font-extrabold text-[#7f1d1d]">取消备注</label>
                      <Input
                        value={lesson.note ?? ""}
                        onChange={(event) => onUpdateLesson({ ...lesson, note: event.target.value })}
                        placeholder="填写取消原因，例如学生请假 / 校区临时停课"
                        className="mt-2 bg-white"
                      />
                    </div>
                  )}

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-bold text-[#061226]">
                      本节预计金额：{formatPrivateMoney(lesson.feeSnapshot.amount, amountsVisible)}
                    </div>
                    <div className="flex flex-wrap gap-2 sm:shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenLessonFeedback?.(lesson)}
                        className="border-[#fdba74] bg-[#fff7ed] text-[#9a3412] hover:border-[#fb923c] hover:bg-[#ffedd5]"
                      >
                        <MessageSquare size={15} /> 课后反馈
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenLessonInRecords?.(lesson)}
                        className="border-[#93c5fd] bg-[#eff6ff] text-[#1557c2] hover:border-[#60a5fa] hover:bg-[#dbeafe] hover:text-[#0f4aa0]"
                      >
                        <CalendarDays size={15} /> 查看详情
                      </Button>
                    </div>
                  </div>
                </motion.article>
              );
            })
          )}
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}

function campusColorClass(index: number): string {
  const tones = [
    "bg-[#eaf2ff] text-[#1557c2] ring-1 ring-[#bfdbfe]",
    "bg-[#fff3e4] text-[#c2410c] ring-1 ring-[#fed7aa]",
    "bg-[#e8f8ef] text-[#15803d] ring-1 ring-[#bbf7d0]",
    "bg-[#eef0ff] text-[#5161d6] ring-1 ring-[#c7d2fe]",
    "bg-[#fef2f2] text-[#dc2626] ring-1 ring-[#fecaca]"
  ];
  return tones[Math.max(index, 0) % tones.length];
}
