import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { BookOpen, ChevronLeft, Clock, GraduationCap, NotebookPen, Plus, Trash2, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { TimeTextInput } from "@/components/ui/time-text-input";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { LessonChecklistLinker } from "@/frontend/components/LessonChecklistLinker";
import type { AttendanceStatus, CourseType, Lesson, TeacherVault } from "@/shared/types";
import { buildFeeSnapshot, getCourse, todayIso } from "@/frontend/lib/calculations";
import {
  attendanceLabels,
  addDays,
  compareByName,
  courseHasActiveStudent,
  courseName,
  courseSubject,
  courseTypeOptionsForVault,
  createLessonFromCourse,
  findStudent,
  formatPrivateMoney,
  lessonStatusLabels,
  lessonTimeRangeLabel,
  previousLesson,
  sortCampusesForProfile,
  sortCoursesByName,
  sortLessons
} from "@/frontend/lib/helpers";

const timePresets = [
  { label: "上午", startTime: "09:00", endTime: "11:00" },
  { label: "下午", startTime: "16:00", endTime: "18:00" },
  { label: "晚上", startTime: "19:00", endTime: "21:00" }
];

function LessonForm({
  vault,
  onAddLesson
}: {
  vault: TeacherVault;
  onAddLesson: (lesson: Lesson) => void;
}) {
  const courseOptions = sortCoursesByName(vault.courseGroups.filter((course) => course.status === "active" && courseHasActiveStudent(vault, course)));
  const courseOptionIds = courseOptions.map((course) => course.id).join("|");
  const [date, setDate] = useState(todayIso());
  const [courseGroupId, setCourseGroupId] = useState(courseOptions[0]?.id ?? "");
  const [startTime, setStartTime] = useState("19:00");
  const [endTime, setEndTime] = useState("21:00");
  const dateShortcuts = [
    { label: "今天", value: offsetDate(0) },
    { label: "昨天", value: offsetDate(-1) },
    { label: "前天", value: offsetDate(-2) }
  ];

  useEffect(() => {
    setCourseGroupId((current) =>
      courseOptions.some((course) => course.id === current) ? current : courseOptions[0]?.id ?? ""
    );
  }, [courseOptionIds]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const course = getCourse(vault, courseGroupId);
    if (!course || course.status !== "active" || !courseHasActiveStudent(vault, course)) return;
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
          <Button type="submit" size="sm" className="mt-1" disabled={!courseGroupId}>
            <Plus size={15} /> 添加
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">日期</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 text-base" />
            <div className="grid grid-cols-3 gap-2">
              {dateShortcuts.map((item) => (
                <Button
                  key={item.label}
                  type="button"
                  size="sm"
                  variant={date === item.value ? "default" : "outline"}
                  onClick={() => setDate(item.value)}
                  className="h-10"
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">课程</label>
            <Select
              value={courseGroupId}
              onChange={(e) => setCourseGroupId(e.target.value)}
            >
              {courseOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {c.subject}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">开始时间</label>
            <TimeTextInput value={startTime} onValueChange={setStartTime} className="h-12 text-base" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">结束时间</label>
            <TimeTextInput value={endTime} onValueChange={setEndTime} className="h-12 text-base" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium">常用时段</label>
            <div className="grid grid-cols-3 gap-2">
              {timePresets.map((preset) => {
                const active = startTime === preset.startTime && endTime === preset.endTime;
                return (
                  <Button
                    key={preset.label}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={() => {
                      setStartTime(preset.startTime);
                      setEndTime(preset.endTime);
                    }}
                    className="h-10"
                  >
                    {preset.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}

function offsetDate(offset: number): string {
  return addDays(todayIso(), offset);
}

export function LessonsView({
  vault,
  amountsVisible = false,
  onAddLesson,
  onUpdateLesson,
  onDeleteLesson
}: {
  vault: TeacherVault;
  amountsVisible?: boolean;
  onAddLesson: (lesson: Lesson) => void;
  onUpdateLesson: (lesson: Lesson) => void;
  onDeleteLesson: (lessonId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(vault.lessons[0]?.id ?? "");
  const [lessonHistory, setLessonHistory] = useState<string[]>([]);
  const [campusFilter, setCampusFilter] = useState("all");
  const [studentFilter, setStudentFilter] = useState("");
  const [courseTypeFilter, setCourseTypeFilter] = useState<"all" | CourseType>("all");
  const { confirm, dialog } = useConfirmDialog();
  const campusOptions = sortCampusesForProfile(vault.campuses, vault.profile.homeCampusId);
  const normalizedStudentFilter = studentFilter.trim().toLowerCase();
  const lessons = vault.lessons
    .filter((lesson) => {
      const course = getCourse(vault, lesson.courseGroupId);
      const campusId = lesson.campusId ?? course?.defaultCampusId;
      const matchesCampus = campusFilter === "all" || campusId === campusFilter;
      const matchesType = courseTypeFilter === "all" || lesson.type === courseTypeFilter;
      const matchesStudent =
        !normalizedStudentFilter ||
        lesson.expectedStudentIds.some((studentId) =>
          (findStudent(vault, studentId)?.name ?? "").toLowerCase().includes(normalizedStudentFilter)
        );
      return matchesCampus && matchesType && matchesStudent;
    })
    .sort(sortLessons)
    .reverse();
  const selected = lessons.find((l) => l.id === selectedId) ?? vault.lessons.find((l) => l.id === selectedId) ?? lessons[0];
  const selectedPreviousLesson = selected ? previousLesson(vault, selected) : undefined;
  const selectedPreviousTaught = selectedPreviousLesson?.content.taught.trim() ?? "";
  const selectedPreviousHomework = selectedPreviousLesson?.content.homework.trim() ?? "";

  function openLesson(lesson: Lesson, pushHistory = true) {
    if (lesson.id === selectedId) return;
    if (pushHistory) {
      setLessonHistory((history) => [...history, selectedId].filter(Boolean).slice(-12));
    }
    setSelectedId(lesson.id);
  }

  function goBackToPreviousLesson() {
    const previousId = lessonHistory.at(-1);
    if (!previousId) return;
    setLessonHistory((history) => history.slice(0, -1));
    setSelectedId(previousId);
  }

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
      nextLesson.feeSnapshot = buildFeeSnapshot(vault, course, nextLesson);
      if (nextLesson.attendance.some((e) => e.status === "leave_requested" || e.status === "absent")) {
        nextLesson.status = "makeup_pending";
      }
    }
    onUpdateLesson(nextLesson);
  }

  function askDeleteLesson(lesson: Lesson) {
    confirm({
      title: "删除这条课时记录？",
      description: `${lesson.date} ${lesson.startTime}-${lesson.endTime} · ${courseName(vault, lesson.courseGroupId)}`,
      confirmLabel: "删除",
      tone: "danger",
      onConfirm: () => onDeleteLesson(lesson.id)
    });
  }

  return (
    <div className="space-y-6">
      {dialog}
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
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">校区筛选</label>
                <Select value={campusFilter} onChange={(event) => setCampusFilter(event.target.value)}>
                  <option value="all">全部校区</option>
                  {campusOptions.map((campus) => (
                    <option key={campus.id} value={campus.id}>{campus.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">学生名筛选</label>
                <Input
                  value={studentFilter}
                  onChange={(event) => setStudentFilter(event.target.value)}
                  placeholder="输入学生名"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">班型筛选</label>
                <Select
                  value={courseTypeFilter}
                  onChange={(event) => setCourseTypeFilter(event.target.value as "all" | CourseType)}
                >
                  <option value="all">全部班型</option>
                  {courseTypeOptionsForVault(vault).map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="max-h-[520px] space-y-1 overflow-y-auto pr-2">
              {lessons.map((lesson, index) => (
                <motion.button
                  key={lesson.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02 }}
                  whileHover={{ scale: 1.01, x: 2 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => openLesson(lesson)}
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
                      <span className="text-xs text-(--color-muted-foreground)">{courseSubject(vault, lesson.courseGroupId)} · {lesson.date} · {lessonTimeRangeLabel(lesson)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-sm">{formatPrivateMoney(lesson.feeSnapshot.amount, amountsVisible)}</span>
                    <Badge variant={lesson.status === "completed" ? "sage" : lesson.status === "cancelled" ? "destructive" : "default"} className="text-[10px]">
                      {lessonStatusLabels[lesson.status]}
                    </Badge>
                  </div>
                </motion.button>
              ))}
              {lessons.length === 0 && (
                <p className="text-sm text-(--color-muted-foreground) text-center py-8">没有符合筛选条件的课程记录</p>
              )}
            </div>
          </CardContent>
        </Card>

        {selected && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
            <Card className="overflow-hidden">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>课程详情</CardTitle>
                  <CardDescription>{courseSubject(vault, selected.courseGroupId)} · {selected.date} · {lessonTimeRangeLabel(selected)}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={goBackToPreviousLesson}
                    disabled={lessonHistory.length === 0}
                    className="border-[#bfdbfe] bg-white text-[#1557c2] hover:border-[#93c5fd] hover:bg-[#eff6ff] hover:text-[#0f4aa0]"
                  >
                    <ChevronLeft size={15} /> 返回上一条
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => askDeleteLesson(selected)}>
                    <Trash2 size={15} /> 删除
                  </Button>
                </div>
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
                    {amountsVisible ? (
                      <Input
                        type="number"
                        value={selected.feeSnapshot.amount}
                        onChange={(e) =>
                          updateSelected({
                            feeSnapshot: { ...selected.feeSnapshot, amount: Number(e.target.value) }
                          })
                        }
                      />
                    ) : (
                      <div className="flex h-10 items-center rounded-[10px] border border-[#dbe4ef] bg-[#f8fbff] px-3 text-sm font-extrabold text-[#64748b]">
                        ***
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => selectedPreviousLesson && openLesson(selectedPreviousLesson)}
                    disabled={!selectedPreviousLesson}
                    className="rounded-[14px] border border-[#dbeafe] bg-[#f8fbff] p-4 text-left transition-colors hover:border-[#1557c2] hover:bg-[#f1f7ff] disabled:cursor-default disabled:hover:border-[#dbeafe] disabled:hover:bg-[#f8fbff]"
                  >
                    <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#25324a]">
                      <BookOpen size={16} className="text-[#1557c2]" /> 上节课内容
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-[#475569]">
                      {selectedPreviousTaught || "上一节课没有记录内容。"}
                    </p>
                    {selectedPreviousLesson && (
                      <div className="mt-3 text-xs font-semibold text-[#64748b]">
                        来源：{selectedPreviousLesson.date} · {lessonTimeRangeLabel(selectedPreviousLesson)} · 点击查看详情
                      </div>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => selectedPreviousLesson && openLesson(selectedPreviousLesson)}
                    disabled={!selectedPreviousLesson}
                    className="rounded-[14px] border border-[#fed7aa] bg-[#fffaf5] p-4 text-left transition-colors hover:border-[#ff8617] hover:bg-[#fff8ef] disabled:cursor-default disabled:hover:border-[#fed7aa] disabled:hover:bg-[#fffaf5]"
                  >
                    <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#25324a]">
                      <NotebookPen size={16} className="text-[#ff8617]" /> 上节课作业
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-[#475569]">
                      {selectedPreviousHomework || "上一节课没有记录作业。"}
                    </p>
                    {selectedPreviousLesson && (
                      <div className="mt-3 text-xs font-semibold text-[#64748b]">
                        来源：{selectedPreviousLesson.date} · {lessonTimeRangeLabel(selectedPreviousLesson)} · 点击查看详情
                      </div>
                    )}
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[#ff8617] text-xs font-bold uppercase tracking-widest">
                    <UserCheck size={14} /> 到课情况
                  </div>
                  {[...selected.attendance].sort((a, b) => {
                    const aName = findStudent(vault, a.studentId)?.name ?? "未知学生";
                    const bName = findStudent(vault, b.studentId)?.name ?? "未知学生";
                    return compareByName(aName, bName) || a.studentId.localeCompare(b.studentId);
                  }).map((entry) => (
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
                    placeholder="例如：本节讲了什么知识点、重点方法、课堂例题、常见错误和掌握情况。"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[#ff8617] text-xs font-bold uppercase tracking-widest">
                    <NotebookPen size={14} /> 课后作业
                  </div>
                  <Textarea
                    value={selected.content.homework}
                    onChange={(e) => updateContent("homework", e.target.value)}
                    placeholder="例如：第几页第几题、几道练习、下次前要完成什么、有没有分层要求或备注。"
                  />
                </div>

                {selected && (
                  <LessonChecklistLinker
                    vault={vault}
                    content={selected.content}
                    subjectHint={courseSubject(vault, selected.courseGroupId)}
                    onChange={(content) => onUpdateLesson({ ...selected, content })}
                  />
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
