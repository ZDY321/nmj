import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { BookOpen, BookText, CheckCircle2, ChevronDown, Clock, GraduationCap, MapPin, NotebookPen, Plus, Trash2, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import type { AttendanceStatus, Lesson, TeacherVault } from "@/shared/types";
import { calculateFee, getCourse, presentCount, todayIso } from "@/frontend/lib/calculations";
import {
  attendanceLabels,
  courseName,
  createLessonFromCourse,
  findStudent,
  formatMoney,
  lessonStatusLabels,
  sortLessons
} from "@/frontend/lib/helpers";

function LessonForm({
  vault,
  onAddLesson
}: {
  vault: TeacherVault;
  onAddLesson: (lesson: Lesson) => void;
}) {
  const [date, setDate] = useState(todayIso());
  const [courseGroupId, setCourseGroupId] = useState(vault.courseGroups[0]?.id ?? "");
  const [startTime, setStartTime] = useState("19:00");
  const [endTime, setEndTime] = useState("21:00");

  function submit(event: FormEvent) {
    event.preventDefault();
    const course = getCourse(vault, courseGroupId);
    if (!course) return;
    onAddLesson(
      createLessonFromCourse(vault, course, {
        date,
        startTime,
        endTime,
        campusId: course.defaultCampusId,
        status: "completed"
      })
    );
  }

  return (
    <Card className="overflow-hidden">
      <form onSubmit={submit}>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#ff8617] text-xs font-bold uppercase tracking-widest mb-1">
              <Plus size={14} /> 补录 / 新增课程
            </div>
            <CardTitle>添加课时</CardTitle>
            <CardDescription>可以补录几天前上的课，确认后会计入工资</CardDescription>
          </div>
          <Button type="submit" size="sm" className="mt-1">
            <Plus size={15} /> 添加
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">日期</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">课程</label>
            <Select
              value={courseGroupId}
              onChange={(e) => setCourseGroupId(e.target.value)}
            >
              {vault.courseGroups.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">开始时间</label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">结束时间</label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </CardContent>
      </form>
    </Card>
  );
}

export function LessonsView({
  vault,
  onAddLesson,
  onUpdateLesson,
  onDeleteLesson
}: {
  vault: TeacherVault;
  onAddLesson: (lesson: Lesson) => void;
  onUpdateLesson: (lesson: Lesson) => void;
  onDeleteLesson: (lessonId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(vault.lessons[0]?.id ?? "");
  const lessons = [...vault.lessons].sort(sortLessons).reverse();
  const selected = vault.lessons.find((l) => l.id === selectedId) ?? lessons[0];

  function updateSelected(patch: Partial<Lesson>) {
    if (!selected) return;
    onUpdateLesson({ ...selected, ...patch });
  }

  function updateContent(field: keyof Lesson["content"], value: string) {
    if (!selected) return;
    onUpdateLesson({ ...selected, content: { ...selected.content, [field]: value } });
  }

  function updateAttendance(studentId: string, status: AttendanceStatus) {
    if (!selected) return;
    const course = getCourse(vault, selected.courseGroupId);
    const nextLesson: Lesson = {
      ...selected,
      attendance: selected.attendance.map((entry) =>
        entry.studentId === studentId ? { ...entry, status } : entry
      )
    };
    if (course) {
      nextLesson.feeSnapshot = {
        ...nextLesson.feeSnapshot,
        presentStudentCount: presentCount(nextLesson),
        amount: calculateFee(course.feeRule, nextLesson)
      };
      if (nextLesson.attendance.some((e) => e.status === "leave_requested" || e.status === "absent")) {
        nextLesson.status = "makeup_pending";
      }
    }
    onUpdateLesson(nextLesson);
  }

  return (
    <div className="space-y-6">
      <LessonForm vault={vault} onAddLesson={onAddLesson} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center gap-2 text-[#1557c2] text-xs font-bold uppercase tracking-widest mb-1">
              <Clock size={14} /> 课程记录
            </div>
            <CardTitle>课时列表</CardTitle>
            <CardDescription>课程、到课、金额和状态都会影响工资统计</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[600px] overflow-y-auto pr-2">
            <div className="space-y-1">
              {lessons.map((lesson, index) => (
                <motion.button
                  key={lesson.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02 }}
                  whileHover={{ scale: 1.01, x: 2 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setSelectedId(lesson.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-[14px] text-left transition-all duration-200 ${
                    selected?.id === lesson.id
                      ? "bg-[#fff7ed] border border-[#ff8617]/35 shadow-[0_10px_24px_rgba(255,134,23,0.12)]"
                      : "hover:bg-[#f8fbff] border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-[10px] bg-white flex items-center justify-center shrink-0">
                      <GraduationCap size={14} className="text-(--color-muted-foreground)" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-medium block truncate">{courseName(vault, lesson.courseGroupId)}</span>
                      <span className="text-xs text-(--color-muted-foreground)">{lesson.date} · {lesson.startTime}-{lesson.endTime}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-sm">{formatMoney(lesson.feeSnapshot.amount)}</span>
                    <Badge variant={lesson.status === "completed" ? "sage" : lesson.status === "cancelled" ? "destructive" : "default"} className="text-[10px]">
                      {lessonStatusLabels[lesson.status]}
                    </Badge>
                  </div>
                </motion.button>
              ))}
              {lessons.length === 0 && (
                <p className="text-sm text-(--color-muted-foreground) text-center py-8">还没有课程记录</p>
              )}
            </div>
          </CardContent>
        </Card>

        {selected && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
            <Card className="overflow-hidden">
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle>课程详情</CardTitle>
                  <CardDescription>{selected.date} · {selected.startTime}-{selected.endTime}</CardDescription>
                </div>
                <Button variant="destructive" size="sm" onClick={() => onDeleteLesson(selected.id)}>
                  <Trash2 size={15} /> 删除
                </Button>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">状态</label>
                    <Select
                      value={selected.status}
                      onChange={(e) => updateSelected({ status: e.target.value as Lesson["status"] })}
                    >
                      {Object.entries(lessonStatusLabels).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">金额</label>
                    <Input
                      type="number"
                      value={selected.feeSnapshot.amount}
                      onChange={(e) =>
                        updateSelected({
                          feeSnapshot: { ...selected.feeSnapshot, amount: Number(e.target.value) }
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[#ff8617] text-xs font-bold uppercase tracking-widest">
                    <UserCheck size={14} /> 到课情况
                  </div>
                  {selected.attendance.map((entry) => (
                    <motion.div
                      key={entry.studentId}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-between p-3 rounded-[14px] bg-[#f8fbff] border border-[#dbe4ef]"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#fff1e2] flex items-center justify-center">
                          <span className="text-xs font-bold text-[#ff8617]">{(findStudent(vault, entry.studentId)?.name ?? "未知").slice(0, 1)}</span>
                        </div>
                        <span className="text-sm font-medium">{findStudent(vault, entry.studentId)?.name ?? "未知学生"}</span>
                      </div>
                      <Select
                        value={entry.status}
                        onChange={(e) => updateAttendance(entry.studentId, e.target.value as AttendanceStatus)}
                        className="h-9"
                      >
                        {Object.entries(attendanceLabels).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </Select>
                    </motion.div>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[#1557c2] text-xs font-bold uppercase tracking-widest">
                    <BookOpen size={14} /> 本次课内容
                  </div>
                  <Textarea
                    value={selected.content.taught}
                    onChange={(e) => updateContent("taught", e.target.value)}
                    placeholder="记录本次教学内容..."
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[#ff8617] text-xs font-bold uppercase tracking-widest">
                    <NotebookPen size={14} /> 课后作业
                  </div>
                  <Textarea
                    value={selected.content.homework}
                    onChange={(e) => updateContent("homework", e.target.value)}
                    placeholder="布置课后作业..."
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[#1557c2] text-xs font-bold uppercase tracking-widest">
                    <BookText size={14} /> 下次课提醒
                  </div>
                  <Textarea
                    value={selected.content.nextLessonReminder}
                    onChange={(e) => updateContent("nextLessonReminder", e.target.value)}
                    placeholder="下次课需要检查或准备的内容..."
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
