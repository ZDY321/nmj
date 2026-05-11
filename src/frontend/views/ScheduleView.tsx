import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  BookText,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  GraduationCap,
  NotebookPen,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserCheck,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AttendanceStatus, Lesson, ScheduleRule, TeacherVault, WeekStart, Weekday } from "@/shared/types";
import { calculateFee, getCourse, hoursBetween, presentCount, todayIso } from "@/frontend/lib/calculations";
import { makeId } from "@/frontend/lib/crypto";
import {
  attendanceLabels,
  calendarDates,
  campusName,
  courseName,
  createLessonFromCourse,
  findStudent,
  formatDateIso,
  formatMoney,
  lessonStatusLabels,
  monthShift,
  orderedWeekdayLabels,
  orderedWeekdays,
  shortWeekdayLabels,
  sortLessons,
  weekStartsOn,
  weekdayLabels
} from "@/frontend/lib/helpers";

const timePresets = [
  { label: "上午", startTime: "09:00", endTime: "11:00" },
  { label: "下午", startTime: "16:00", endTime: "18:00" },
  { label: "晚上", startTime: "19:00", endTime: "21:00" }
];

export function ScheduleView({
  vault,
  onAddLesson,
  onUpdateLesson,
  onDeleteLesson,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
  onGenerateDrafts,
  onAddScheduledLesson,
  onWeekStartChange
}: {
  vault: TeacherVault;
  onAddLesson: (lesson: Lesson) => void;
  onUpdateLesson: (lesson: Lesson) => void;
  onDeleteLesson: (lessonId: string) => void;
  onAddRule: (rule: ScheduleRule) => void;
  onUpdateRule: (rule: ScheduleRule) => void;
  onDeleteRule: (ruleId: string) => void;
  onGenerateDrafts: (
    startDate: string,
    endDate: string,
    weekdays: Weekday[],
    courseGroupId: string,
    startTime: string,
    endTime: string
  ) => void;
  onAddScheduledLesson: (date: string, courseGroupId: string, startTime: string, endTime: string) => void;
  onWeekStartChange: (weekStart: WeekStart) => void;
}) {
  const [courseGroupId, setCourseGroupId] = useState(vault.courseGroups[0]?.id ?? "");
  const [weekday, setWeekday] = useState<Weekday>(3);
  const [selectedWeekdays, setSelectedWeekdays] = useState<Weekday[]>([3]);
  const [date, setDate] = useState(todayIso());
  const [startTime, setStartTime] = useState("19:00");
  const [endTime, setEndTime] = useState("21:00");
  const [rangeStart, setRangeStart] = useState(todayIso());
  const [rangeEnd, setRangeEnd] = useState(monthShift(todayIso().slice(0, 7), 1) + "-01");
  const [calendarMonth, setCalendarMonth] = useState(todayIso().slice(0, 7));
  const [editingRule, setEditingRule] = useState<ScheduleRule | null>(null);
  const [selectedId, setSelectedId] = useState(vault.lessons[0]?.id ?? "");
  const [campusFilter, setCampusFilter] = useState("all");
  const [studentFilter, setStudentFilter] = useState("");
  const [courseTypeFilter, setCourseTypeFilter] = useState<"all" | "one_on_one" | "class">("all");
  const weekStartPreference = weekStartsOn(vault);
  const visibleWeekdays = orderedWeekdays(weekStartPreference);
  const visibleWeekdayLabels = orderedWeekdayLabels(weekStartPreference, shortWeekdayLabels);
  const dateShortcuts = [
    { label: "今天", value: offsetDate(0) },
    { label: "昨天", value: offsetDate(-1) },
    { label: "前天", value: offsetDate(-2) }
  ];
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
  const selected = lessons.find((lesson) => lesson.id === selectedId) ?? lessons[0];

  function submitRule(event: FormEvent) {
    event.preventDefault();
    const course = getCourse(vault, courseGroupId);
    if (!course) return;
    onAddRule({
      id: makeId("rule"),
      courseGroupId,
      weekday,
      startTime,
      endTime,
      campusId: course.defaultCampusId,
      effectiveFrom: todayIso(),
      enabled: true
    });
  }

  function addSingleLesson(status: "scheduled" | "completed") {
    const course = getCourse(vault, courseGroupId);
    if (!course) return;
    onAddLesson(
      createLessonFromCourse(vault, course, {
        date,
        startTime,
        endTime,
        campusId: course.defaultCampusId,
        status
      })
    );
  }

  function toggleWeekday(day: Weekday) {
    setSelectedWeekdays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort()
    );
  }

  function saveRuleDraft() {
    if (!editingRule) return;
    onUpdateRule({
      ...editingRule,
      effectiveTo: editingRule.effectiveTo || undefined
    });
    setEditingRule(null);
  }

  function recalculateLessonFee(lesson: Lesson): Lesson {
    const course = getCourse(vault, lesson.courseGroupId);
    if (!course) return lesson;
    return {
      ...lesson,
      type: course.type,
      feeSnapshot: {
        ...lesson.feeSnapshot,
        baseFee: course.feeRule.baseFee,
        hourlyRate: course.feeRule.hourlyRate,
        fixedFee: course.feeRule.fixedFee,
        perPresentStudentFee: course.feeRule.perPresentStudentFee,
        presentStudentCount: presentCount(lesson),
        hours: hoursBetween(lesson.startTime, lesson.endTime),
        amount: calculateFee(course.feeRule, lesson)
      }
    };
  }

  function updateSelected(patch: Partial<Lesson>, shouldRecalculate = false) {
    if (!selected) return;
    const next = { ...selected, ...patch };
    onUpdateLesson(shouldRecalculate ? recalculateLessonFee(next) : next);
  }

  function updateSelectedCourse(courseId: string) {
    if (!selected) return;
    const course = getCourse(vault, courseId);
    if (!course) return;
    const next: Lesson = {
      ...selected,
      courseGroupId: course.id,
      campusId: course.defaultCampusId,
      type: course.type,
      expectedStudentIds: [...course.studentIds],
      attendance: course.studentIds.map((studentId) => ({ studentId, status: "attended" })),
      feeSnapshot: { ...selected.feeSnapshot, amount: 0 }
    };
    onUpdateLesson(recalculateLessonFee(next));
  }

  function updateContent(field: keyof Lesson["content"], value: string) {
    if (!selected) return;
    onUpdateLesson({ ...selected, content: { ...selected.content, [field]: value } });
  }

  function updateAttendance(studentId: string, status: AttendanceStatus) {
    if (!selected) return;
    const nextLesson: Lesson = {
      ...selected,
      attendance: selected.attendance.map((entry) =>
        entry.studentId === studentId ? { ...entry, status } : entry
      )
    };
    const recalculated = recalculateLessonFee(nextLesson);
    if (recalculated.attendance.some((entry) => entry.status === "leave_requested" || entry.status === "absent")) {
      recalculated.status = "makeup_pending";
    }
    onUpdateLesson(recalculated);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
              <Plus size={14} /> 单次排课 / 补录
            </div>
            <CardTitle>添加课程时间</CardTitle>
            <CardDescription>待上课用于排课，补录已完成会直接计入工资。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">课程</label>
                <Select value={courseGroupId} onChange={(event) => setCourseGroupId(event.target.value)}>
                  {vault.courseGroups.map((course) => (
                    <option key={course.id} value={course.id}>{course.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">日期</label>
                <Input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="date-time-input h-11 text-base md:max-w-[220px]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">开始时间</label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="date-time-input h-11 text-base md:max-w-[180px]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">结束时间</label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  className="date-time-input h-11 text-base md:max-w-[180px]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm font-medium">快捷日期</div>
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
                <div className="text-sm font-medium">常用时段</div>
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
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button type="button" onClick={() => addSingleLesson("scheduled")} disabled={!courseGroupId}>
                <CalendarCheck size={16} /> 添加待上课
              </Button>
              <Button type="button" variant="outline" onClick={() => addSingleLesson("completed")} disabled={!courseGroupId}>
                <CheckCircle2 size={16} /> 补录已完成
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <form onSubmit={submitRule}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                  <CalendarCheck size={14} /> 固定排课
                </div>
                <CardTitle>排课规则</CardTitle>
                <CardDescription>设置重复规则后，可按日期范围批量生成待上课。</CardDescription>
              </div>
              <Button type="submit" size="sm" disabled={!courseGroupId}>
                <Plus size={15} /> 添加规则
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">课程</label>
                  <Select value={courseGroupId} onChange={(event) => setCourseGroupId(event.target.value)}>
                    {vault.courseGroups.map((course) => (
                      <option key={course.id} value={course.id}>{course.name}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">每周星期</label>
                  <Select value={weekday} onChange={(event) => setWeekday(Number(event.target.value) as Weekday)}>
                    {visibleWeekdays.map((day) => (
                      <option key={day} value={day}>{weekdayLabels[day]}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">开始</label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    className="date-time-input h-11 text-base md:max-w-[180px]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">结束</label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    className="date-time-input h-11 text-base md:max-w-[180px]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">范围开始</label>
                  <Input
                    type="date"
                    value={rangeStart}
                    onChange={(event) => setRangeStart(event.target.value)}
                    className="date-time-input h-11 text-base md:max-w-[220px]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">范围结束</label>
                  <Input
                    type="date"
                    value={rangeEnd}
                    onChange={(event) => setRangeEnd(event.target.value)}
                    className="date-time-input h-11 text-base md:max-w-[220px]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">批量生成星期</p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {visibleWeekdays.map((day) => (
                    <Button
                      key={day}
                      type="button"
                      variant={selectedWeekdays.includes(day) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleWeekday(day)}
                      className={selectedWeekdays.includes(day) ? "orange-gradient shadow-[0_10px_20px_rgba(255,134,23,0.18)]" : ""}
                    >
                      {weekdayLabels[day]}
                    </Button>
                  ))}
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={!courseGroupId || selectedWeekdays.length === 0}
                onClick={() => onGenerateDrafts(rangeStart, rangeEnd, selectedWeekdays, courseGroupId, startTime, endTime)}
              >
                <CalendarCheck size={16} /> 按日期范围生成待上课
              </Button>
            </CardContent>
          </form>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
                <CalendarDays size={14} /> 点击日历排课
              </div>
              <CardTitle>日历排课</CardTitle>
              <CardDescription>选好课程和时间后，点击日期即可添加待上课。</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Select
                value={String(weekStartPreference)}
                onChange={(event) => onWeekStartChange(Number(event.target.value) as WeekStart)}
                className="h-10 w-[132px]"
                aria-label="选择一周开始日期"
              >
                <option value="0">周日开始</option>
                <option value="1">周一开始</option>
              </Select>
              <Button variant="ghost" size="icon" onClick={() => setCalendarMonth((month) => monthShift(month, -1))}>
                <ChevronLeft size={18} />
              </Button>
              <span className="w-[80px] text-center font-bold">{calendarMonth}</span>
              <Button variant="ghost" size="icon" onClick={() => setCalendarMonth((month) => monthShift(month, 1))}>
                <ChevronRight size={18} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {visibleWeekdayLabels.map((day) => (
                <div key={day} className="py-2 text-center text-xs font-bold text-(--color-muted-foreground)">{day}</div>
              ))}
              {calendarDates(calendarMonth, weekStartPreference).map((calendarDate) => {
                const dayLessons = vault.lessons.filter((lesson) => lesson.date === calendarDate);
                const isCurrentMonth = calendarDate.startsWith(calendarMonth);
                return (
                  <motion.button
                    key={calendarDate}
                    whileHover={{ scale: 1.04, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onAddScheduledLesson(calendarDate, courseGroupId, startTime, endTime)}
                    disabled={!courseGroupId}
                    className={`relative flex min-h-[78px] flex-col items-start rounded-[14px] border p-2 text-left transition-all sm:min-h-[90px] sm:p-2.5 ${
                      isCurrentMonth
                        ? "border-[#dbe4ef] bg-white hover:border-[#ff8617] hover:shadow-[0_10px_24px_rgba(15,35,66,0.08)]"
                        : "border-transparent bg-white opacity-40"
                    }`}
                  >
                    <span className={`text-sm font-bold ${isCurrentMonth ? "text-(--color-foreground)" : ""}`}>
                      {Number(calendarDate.slice(8))}
                    </span>
                    {dayLessons.length > 0 ? (
                      <Badge variant="secondary" className="mt-1 text-[10px]">{dayLessons.length} 节</Badge>
                    ) : (
                      <span className="mt-1 text-[10px] text-(--color-muted-foreground)">点击排课</span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
              <Clock size={14} /> 已设置规则
            </div>
            <CardTitle>排课规则列表</CardTitle>
            <CardDescription>每条规则都可编辑时间、课程、校区和启用状态。</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {vault.scheduleRules.map((rule) => {
              const isEditing = editingRule?.id === rule.id;
              return (
                <motion.div
                  key={rule.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4 transition-all hover:shadow-[0_10px_24px_rgba(15,35,66,0.08)]"
                >
                  {isEditing && editingRule ? (
                    <div className="space-y-3">
                      <Select
                        value={editingRule.courseGroupId}
                        onChange={(event) => {
                          const course = getCourse(vault, event.target.value);
                          setEditingRule({
                            ...editingRule,
                            courseGroupId: event.target.value,
                            campusId: course?.defaultCampusId
                          });
                        }}
                      >
                        {vault.courseGroups.map((course) => (
                          <option key={course.id} value={course.id}>{course.name}</option>
                        ))}
                      </Select>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Select
                          value={editingRule.weekday}
                          onChange={(event) => setEditingRule({ ...editingRule, weekday: Number(event.target.value) as Weekday })}
                        >
                          {visibleWeekdays.map((day) => (
                            <option key={day} value={day}>{weekdayLabels[day]}</option>
                          ))}
                        </Select>
                        <Select
                          value={editingRule.campusId ?? ""}
                          onChange={(event) => setEditingRule({ ...editingRule, campusId: event.target.value || undefined })}
                        >
                          <option value="">课程默认校区</option>
                          {vault.campuses.map((campus) => (
                            <option key={campus.id} value={campus.id}>{campus.name}</option>
                          ))}
                        </Select>
                        <Input
                          type="time"
                          value={editingRule.startTime}
                          onChange={(event) => setEditingRule({ ...editingRule, startTime: event.target.value })}
                          className="date-time-input h-11 text-base"
                        />
                        <Input
                          type="time"
                          value={editingRule.endTime}
                          onChange={(event) => setEditingRule({ ...editingRule, endTime: event.target.value })}
                          className="date-time-input h-11 text-base"
                        />
                        <Input
                          type="date"
                          value={editingRule.effectiveFrom}
                          onChange={(event) => setEditingRule({ ...editingRule, effectiveFrom: event.target.value })}
                          className="date-time-input h-11 text-base"
                        />
                        <Input
                          type="date"
                          value={editingRule.effectiveTo ?? ""}
                          onChange={(event) => setEditingRule({ ...editingRule, effectiveTo: event.target.value || undefined })}
                          className="date-time-input h-11 text-base"
                        />
                      </div>
                      <Select
                        value={editingRule.enabled ? "enabled" : "disabled"}
                        onChange={(event) => setEditingRule({ ...editingRule, enabled: event.target.value === "enabled" })}
                      >
                        <option value="enabled">启用</option>
                        <option value="disabled">停用</option>
                      </Select>
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" size="sm" onClick={saveRuleDraft}>
                          <Save size={14} /> 保存
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditingRule(null)}>
                          <X size={14} /> 取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#fff1e2]">
                            <Clock size={16} className="text-[#ff8617]" />
                          </div>
                          <div className="min-w-0">
                            <strong className="block truncate text-sm font-semibold">{courseName(vault, rule.courseGroupId)}</strong>
                            <p className="text-xs text-(--color-muted-foreground)">
                              {weekdayLabels[rule.weekday]} {rule.startTime}-{rule.endTime} · {campusName(vault, rule.campusId)}
                            </p>
                          </div>
                        </div>
                        <Badge variant={rule.enabled ? "sage" : "secondary"}>{rule.enabled ? "启用" : "停用"}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditingRule(rule)}>
                          <Pencil size={14} /> 编辑
                        </Button>
                        <Button type="button" size="sm" variant="destructive" onClick={() => onDeleteRule(rule.id)}>
                          <Trash2 size={14} /> 删除
                        </Button>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
            {vault.scheduleRules.length === 0 && (
              <p className="py-8 text-center text-sm text-(--color-muted-foreground)">还没有排课规则</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
              <Clock size={14} /> 课程记录
            </div>
            <CardTitle>课时列表</CardTitle>
            <CardDescription>选择一条记录后，可在右侧编辑详情。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">校区筛选</label>
                <Select value={campusFilter} onChange={(event) => setCampusFilter(event.target.value)}>
                  <option value="all">全部校区</option>
                  {vault.campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>{campus.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">学生名筛选</label>
                <Input value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)} placeholder="输入学生名" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">班型筛选</label>
                <Select
                  value={courseTypeFilter}
                  onChange={(event) => setCourseTypeFilter(event.target.value as "all" | "one_on_one" | "class")}
                >
                  <option value="all">全部班型</option>
                  <option value="one_on_one">一对一</option>
                  <option value="class">班课</option>
                </Select>
              </div>
            </div>

            <div className="max-h-[560px] space-y-1 overflow-y-auto pr-2">
              {lessons.map((lesson, index) => (
                <motion.button
                  key={lesson.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02 }}
                  whileHover={{ scale: 1.01, x: 2 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setSelectedId(lesson.id)}
                  className={`flex w-full items-center justify-between rounded-[14px] p-3 text-left transition-all duration-200 ${
                    selected?.id === lesson.id
                      ? "border border-[#ff8617]/35 bg-[#fff7ed] shadow-[0_10px_24px_rgba(255,134,23,0.12)]"
                      : "border border-transparent hover:bg-[#f8fbff]"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white">
                      <GraduationCap size={14} className="text-(--color-muted-foreground)" />
                    </div>
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium">{courseName(vault, lesson.courseGroupId)}</span>
                      <span className="text-xs text-(--color-muted-foreground)">{lesson.date} · {lesson.startTime}-{lesson.endTime}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold">{formatMoney(lesson.feeSnapshot.amount)}</span>
                    <Badge variant={lesson.status === "completed" ? "sage" : lesson.status === "cancelled" ? "destructive" : "default"} className="text-[10px]">
                      {lessonStatusLabels[lesson.status]}
                    </Badge>
                  </div>
                </motion.button>
              ))}
              {lessons.length === 0 && (
                <p className="py-8 text-center text-sm text-(--color-muted-foreground)">没有符合筛选条件的课程记录</p>
              )}
            </div>
          </CardContent>
        </Card>

        {selected && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
            <Card className="overflow-hidden">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>课程详情</CardTitle>
                  <CardDescription>{selected.date} · {selected.startTime}-{selected.endTime}</CardDescription>
                </div>
                <Button variant="destructive" size="sm" onClick={() => onDeleteLesson(selected.id)}>
                  <Trash2 size={15} /> 删除
                </Button>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">课程</label>
                    <Select value={selected.courseGroupId} onChange={(event) => updateSelectedCourse(event.target.value)}>
                      {vault.courseGroups.map((course) => (
                        <option key={course.id} value={course.id}>{course.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">校区</label>
                    <Select value={selected.campusId ?? ""} onChange={(event) => updateSelected({ campusId: event.target.value || undefined })}>
                      <option value="">课程默认校区</option>
                      {vault.campuses.map((campus) => (
                        <option key={campus.id} value={campus.id}>{campus.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">日期</label>
                    <Input
                      type="date"
                      value={selected.date}
                      onChange={(event) => updateSelected({ date: event.target.value })}
                      className="date-time-input h-11 text-base"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">开始</label>
                      <Input
                        type="time"
                        value={selected.startTime}
                        onChange={(event) => updateSelected({ startTime: event.target.value }, true)}
                        className="date-time-input h-11 text-base"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">结束</label>
                      <Input
                        type="time"
                        value={selected.endTime}
                        onChange={(event) => updateSelected({ endTime: event.target.value }, true)}
                        className="date-time-input h-11 text-base"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">状态</label>
                    <Select value={selected.status} onChange={(event) => updateSelected({ status: event.target.value as Lesson["status"] })}>
                      {Object.entries(lessonStatusLabels).map(([key, value]) => (
                        <option key={key} value={key}>{value}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">金额</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-extrabold text-[#64748b]">¥</span>
                      <Input
                        type="number"
                        value={selected.feeSnapshot.amount}
                        onChange={(event) =>
                          updateSelected({
                            feeSnapshot: { ...selected.feeSnapshot, amount: Number(event.target.value) }
                          })
                        }
                        className="pl-10"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
                    <UserCheck size={14} /> 到课情况
                  </div>
                  {selected.attendance.map((entry) => (
                    <motion.div
                      key={entry.studentId}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-between rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fff1e2]">
                          <span className="text-xs font-bold text-[#ff8617]">{(findStudent(vault, entry.studentId)?.name ?? "未知").slice(0, 1)}</span>
                        </div>
                        <span className="truncate text-sm font-medium">{findStudent(vault, entry.studentId)?.name ?? "未知学生"}</span>
                      </div>
                      <Select value={entry.status} onChange={(event) => updateAttendance(entry.studentId, event.target.value as AttendanceStatus)} className="h-9 max-w-[128px]">
                        {Object.entries(attendanceLabels).map(([key, value]) => (
                          <option key={key} value={key}>{value}</option>
                        ))}
                      </Select>
                    </motion.div>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                    <BookOpen size={14} /> 本次课内容
                  </div>
                  <Textarea
                    value={selected.content.taught}
                    onChange={(event) => updateContent("taught", event.target.value)}
                    placeholder="记录本次教学内容..."
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
                    <NotebookPen size={14} /> 课后作业
                  </div>
                  <Textarea
                    value={selected.content.homework}
                    onChange={(event) => updateContent("homework", event.target.value)}
                    placeholder="布置课后作业..."
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                    <BookText size={14} /> 下次课提醒
                  </div>
                  <Textarea
                    value={selected.content.nextLessonReminder}
                    onChange={(event) => updateContent("nextLessonReminder", event.target.value)}
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

function offsetDate(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return formatDateIso(date);
}
