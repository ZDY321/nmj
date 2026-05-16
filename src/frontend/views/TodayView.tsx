import { useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  BookText,
  CalendarDays,
  Clock3,
  MapPin,
  NotebookPen,
  Pencil,
  Plus,
  Save,
  Trash2,
  Users,
  X,
  XCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import type { Lesson, TeacherVault, TodoItem } from "@/shared/types";
import { makeId } from "@/frontend/lib/crypto";
import { formatAppDateLabel, getCourse } from "@/frontend/lib/calculations";
import {
  attendanceLabels,
  campusName,
  compareByName,
  courseName,
  findStudent,
  formatPrivateMoney,
  isToday,
  lessonStatusLabels,
  lessonStatusSurfaceClass,
  lessonStatusVariant,
  previousLesson,
  sortCampusesForProfile,
  sortLessons,
  studentNames
} from "@/frontend/lib/helpers";

export function TodayView({
  vault,
  selectedDate,
  amountsVisible,
  onUpdateLesson,
  onAddTodo,
  onUpdateTodo,
  onDeleteTodo,
  onOpenLessonInRecords
}: {
  vault: TeacherVault;
  selectedDate: string;
  amountsVisible: boolean;
  onUpdateLesson: (lesson: Lesson) => void;
  onAddTodo: (todo: TodoItem) => void;
  onUpdateTodo: (todo: TodoItem) => void;
  onDeleteTodo: (todoId: string) => void;
  onOpenLessonInRecords?: (lesson: Lesson) => void;
}) {
  const [todoTitle, setTodoTitle] = useState("");
  const [todoDueDate, setTodoDueDate] = useState(selectedDate);
  const [editingTodoId, setEditingTodoId] = useState("");
  const [editingTodoTitle, setEditingTodoTitle] = useState("");
  const [editingTodoDueDate, setEditingTodoDueDate] = useState("");
  const { confirm, dialog } = useConfirmDialog();
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
  const todos = [...(vault.todoItems ?? [])].sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    return `${a.dueDate ?? "9999-99-99"} ${a.createdAt}`.localeCompare(`${b.dueDate ?? "9999-99-99"} ${b.createdAt}`);
  });
  const openTodoCount = todos.filter((todo) => todo.status === "open").length;
  const selectedDateLabel = formatAppDateLabel(selectedDate, {
    month: "long",
    day: "numeric",
    weekday: "long"
  });

  function addTodo() {
    const title = todoTitle.trim();
    if (!title) return;
    onAddTodo({
      id: makeId("todo"),
      title,
      dueDate: todoDueDate || undefined,
      status: "open",
      priority: "normal",
      createdAt: new Date().toISOString()
    });
    setTodoTitle("");
  }

  function startEditTodo(todo: TodoItem) {
    setEditingTodoId(todo.id);
    setEditingTodoTitle(todo.title);
    setEditingTodoDueDate(todo.dueDate ?? "");
  }

  function cancelEditTodo() {
    setEditingTodoId("");
    setEditingTodoTitle("");
    setEditingTodoDueDate("");
  }

  function saveTodo(todo: TodoItem) {
    const title = editingTodoTitle.trim();
    if (!title) return;
    onUpdateTodo({
      ...todo,
      title,
      dueDate: editingTodoDueDate || undefined
    });
    cancelEditTodo();
  }

  function askDeleteTodo(todo: TodoItem) {
    confirm({
      title: `删除待办「${todo.title}」？`,
      description: todo.dueDate ? `截止日期：${todo.dueDate}` : "删除后这条待办不会再显示。",
      confirmLabel: "删除",
      tone: "danger",
      onConfirm: () => onDeleteTodo(todo.id)
    });
  }

  return (
    <div className="space-y-6">
      {dialog}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[ 
          { label: isToday(selectedDate) ? "今日课程" : "选中日期课程", value: `${selectedDateLessons.length} 节`, icon: CalendarDays },
          { label: "待上课", value: `${waitingLessons.length} 节`, icon: Clock3 },
          { label: "待办事项", value: `${openTodoCount} 条`, icon: NotebookPen },
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
        <CardHeader className="border-b border-[#e8eef6] pb-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
                <NotebookPen size={14} /> 待办事项
              </div>
              <CardTitle className="text-xl">今天要跟进的事</CardTitle>
            </div>
            <Badge variant={openTodoCount ? "amber" : "secondary"} className="w-fit">
              {openTodoCount ? `${openTodoCount} 条待办` : "已清空"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_auto]">
            <Input value={todoTitle} onChange={(event) => setTodoTitle(event.target.value)} placeholder="例如：联系家长确认补课时间" />
            <Input type="date" value={todoDueDate} onChange={(event) => setTodoDueDate(event.target.value)} />
            <Button type="button" onClick={addTodo}>
              <Plus size={15} /> 添加待办
            </Button>
          </div>
          <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
            {todos.map((todo) => {
              const isEditingTodo = editingTodoId === todo.id;
              return (
                <div
                  key={todo.id}
                  className={`flex flex-col gap-3 rounded-[14px] border p-3 sm:flex-row sm:items-center sm:justify-between ${
                    todo.status === "done" ? "border-[#dbe4ef] bg-[#f8fbff] opacity-70" : "border-[#fed7aa] bg-[#fff7ed]"
                  }`}
                >
                  {isEditingTodo ? (
                    <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_180px]">
                      <Input
                        value={editingTodoTitle}
                        onChange={(event) => setEditingTodoTitle(event.target.value)}
                        placeholder="待办内容"
                        className="bg-white"
                      />
                      <Input
                        type="date"
                        value={editingTodoDueDate}
                        onChange={(event) => setEditingTodoDueDate(event.target.value)}
                        className="bg-white"
                      />
                    </div>
                  ) : (
                    <label className="flex min-w-0 flex-1 items-start gap-3">
                      <input
                        type="checkbox"
                        checked={todo.status === "done"}
                        onChange={(event) => onUpdateTodo({ ...todo, status: event.target.checked ? "done" : "open" })}
                        className="mt-1 h-4 w-4 accent-[#ff8617]"
                      />
                      <span className="min-w-0">
                        <span className={`block text-sm font-extrabold ${todo.status === "done" ? "text-[#64748b] line-through" : "text-[#061226]"}`}>
                          {todo.title}
                        </span>
                        <span className="mt-1 block text-xs font-semibold text-[#64748b]">
                          {todo.dueDate ? `截止：${todo.dueDate}` : "未设置截止日期"}
                        </span>
                      </span>
                    </label>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                    {isEditingTodo ? (
                      <>
                        <Button type="button" size="sm" onClick={() => saveTodo(todo)} disabled={!editingTodoTitle.trim()}>
                          <Save size={14} /> 保存
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={cancelEditTodo}>
                          <X size={14} /> 取消
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button type="button" size="sm" variant="outline" onClick={() => startEditTodo(todo)}>
                          <Pencil size={14} /> 编辑
                        </Button>
                        <Button type="button" size="sm" variant="destructive" onClick={() => askDeleteTodo(todo)}>
                          <Trash2 size={14} /> 删除
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {todos.length === 0 && (
              <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-6 text-center text-sm font-semibold text-[#64748b]">
                暂无待办事项
              </div>
            )}
          </div>
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
                {selectedDateLabel}，按上课时间排列，并显示上节课留下的内容、作业和下次课提醒。
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
              const previousReminderText = previous?.content.nextLessonReminder.trim() || "";
              const campusTone = campusColorClass(campusOptions.findIndex((campus) => campus.id === lesson.campusId));
              const course = getCourse(vault, lesson.courseGroupId);
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
                          <Clock3 size={13} /> {lesson.startTime}-{lesson.endTime}
                        </span>
                        <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 ${campusTone}`}>
                          <MapPin size={13} /> {campusName(vault, lesson.campusId)}
                        </span>
                        <span className="flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-[#dbe4ef]">
                          <BookOpen size={13} /> {course?.subject || "未设置科目"}
                        </span>
                        <span className="flex items-center gap-1 rounded-full bg-[#f3f7fb] px-2.5 py-1">
                          <Users size={13} /> {studentNames(vault, lesson.expectedStudentIds) || "未设置学生"}
                        </span>
                      </div>
                    </div>
                    <Badge variant={lessonStatusVariant(lesson.status)} className="w-fit">
                      {lessonStatusLabels[lesson.status]}
                    </Badge>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
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
                    <div className="rounded-[14px] border border-[#e8eef6] bg-[#f8fbff] p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#25324a]">
                        <BookText size={16} className="text-[#1557c2]" />
                        上节课下次课提醒
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-[#475569]">
                        {previousReminderText || "上一节课没有记录下次课提醒。"}
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
                    <div className="flex sm:shrink-0">
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
