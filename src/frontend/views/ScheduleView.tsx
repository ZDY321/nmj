import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  BookText,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  GraduationCap,
  Link2,
  NotebookPen,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import type { AttendanceStatus, CourseType, Lesson, ScheduleRule, TeacherVault, TimePreset, WeekStart, Weekday } from "@/shared/types";
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
  lessonStatusSurfaceClass,
  lessonStatusVariant,
  monthShift,
  orderedWeekdayLabels,
  orderedWeekdays,
  shortWeekdayLabels,
  sortLessons,
  studentNames,
  weekStartsOn,
  weekdayLabels
} from "@/frontend/lib/helpers";

type LessonScope = "month" | "week";
type CourseTypeFilter = "all" | CourseType;

export function ScheduleView({
  vault,
  onAddLesson,
  onUpdateLesson,
  onDeleteLesson,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
  onAddCustomTimePreset,
  onDeleteCustomTimePreset,
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
  onAddCustomTimePreset: (preset: TimePreset) => void;
  onDeleteCustomTimePreset: (presetId: string) => void;
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
  const firstCourseId = vault.courseGroups[0]?.id ?? "";
  const [singleCourseGroupId, setSingleCourseGroupId] = useState(firstCourseId);
  const [singleDate, setSingleDate] = useState(todayIso());
  const [singleStartTime, setSingleStartTime] = useState("19:00");
  const [singleEndTime, setSingleEndTime] = useState("21:00");
  const [ruleCourseGroupId, setRuleCourseGroupId] = useState(firstCourseId);
  const [weekday, setWeekday] = useState<Weekday>(3);
  const [selectedWeekdays, setSelectedWeekdays] = useState<Weekday[]>([3]);
  const [ruleStartTime, setRuleStartTime] = useState("19:00");
  const [ruleEndTime, setRuleEndTime] = useState("21:00");
  const [rangeStart, setRangeStart] = useState(todayIso());
  const [rangeEnd, setRangeEnd] = useState(monthShift(todayIso().slice(0, 7), 1) + "-01");
  const [calendarCourseGroupId, setCalendarCourseGroupId] = useState(firstCourseId);
  const [calendarStartTime, setCalendarStartTime] = useState("19:00");
  const [calendarEndTime, setCalendarEndTime] = useState("21:00");
  const [calendarMonth, setCalendarMonth] = useState(todayIso().slice(0, 7));
  const [calendarMode, setCalendarMode] = useState<"schedule" | "view">("view");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(todayIso());
  const [editingRule, setEditingRule] = useState<ScheduleRule | null>(null);
  const [selectedId, setSelectedId] = useState(vault.lessons[0]?.id ?? "");
  const [campusFilter, setCampusFilter] = useState("all");
  const [studentFilter, setStudentFilter] = useState("");
  const [courseTypeFilter, setCourseTypeFilter] = useState<CourseTypeFilter>("all");
  const [lessonScope, setLessonScope] = useState<LessonScope>("month");
  const [lessonMonth, setLessonMonth] = useState(todayIso().slice(0, 7));
  const [lessonWeek, setLessonWeek] = useState(isoWeekValue(todayIso()));
  const [showOnlyMakeup, setShowOnlyMakeup] = useState(false);
  const [customPresetLabel, setCustomPresetLabel] = useState("");
  const [customPresetStart, setCustomPresetStart] = useState("08:00");
  const [customPresetEnd, setCustomPresetEnd] = useState("10:00");
  const [temporaryStudentId, setTemporaryStudentId] = useState("");
  const [makeupDate, setMakeupDate] = useState(todayIso());
  const { confirm, dialog } = useConfirmDialog();

  const weekStartPreference = weekStartsOn(vault);
  const visibleWeekdays = orderedWeekdays(weekStartPreference);
  const visibleWeekdayLabels = orderedWeekdayLabels(weekStartPreference, shortWeekdayLabels);
  const customTimePresets = vault.preferences?.customTimePresets ?? [];
  const selectedCalendarLessons = vault.lessons.filter((lesson) => lesson.date === selectedCalendarDate).sort(sortLessons);
  const normalizedStudentFilter = studentFilter.trim().toLowerCase();
  const scopeDates = lessonScope === "week" ? datesForIsoWeekValue(lessonWeek) : [];
  const lessons = vault.lessons
    .filter((lesson) => {
      const course = getCourse(vault, lesson.courseGroupId);
      const campusId = lesson.campusId ?? course?.defaultCampusId;
      const matchesScope = lessonScope === "month" ? lesson.date.startsWith(lessonMonth) : scopeDates.includes(lesson.date);
      const matchesCampus = campusFilter === "all" || campusId === campusFilter;
      const matchesType = courseTypeFilter === "all" || lesson.type === courseTypeFilter;
      const matchesStudent =
        !normalizedStudentFilter ||
        lesson.expectedStudentIds.some((studentId) =>
          (findStudent(vault, studentId)?.name ?? "").toLowerCase().includes(normalizedStudentFilter)
        );
      const matchesMakeup = !showOnlyMakeup || lesson.status === "makeup_pending" || Boolean(lesson.linkedOriginalLessonId);
      return matchesScope && matchesCampus && matchesType && matchesStudent && matchesMakeup;
    })
    .sort(sortLessons)
    .reverse();
  const selected = vault.lessons.find((lesson) => lesson.id === selectedId) ?? lessons[0];
  const selectedCourse = selected ? getCourse(vault, selected.courseGroupId) : undefined;
  const selectedOriginalLesson = selected?.linkedOriginalLessonId
    ? vault.lessons.find((lesson) => lesson.id === selected.linkedOriginalLessonId)
    : undefined;
  const makeupEntries = vault.lessons
    .filter((lesson) => lesson.status === "makeup_pending")
    .flatMap((lesson) =>
      lesson.attendance
        .filter((entry) => entry.status === "leave_requested" || entry.status === "absent" || entry.status === "makeup_pending")
        .map((entry) => ({ lesson, entry }))
    )
    .sort((a, b) => sortLessons(a.lesson, b.lesson));
  const dateShortcuts = [
    { label: "今天", value: offsetDate(0) },
    { label: "昨天", value: offsetDate(-1) },
    { label: "前天", value: offsetDate(-2) }
  ];

  function submitRule(event: FormEvent) {
    event.preventDefault();
    const course = getCourse(vault, ruleCourseGroupId);
    if (!course) return;
    onAddRule({
      id: makeId("rule"),
      courseGroupId: ruleCourseGroupId,
      weekday,
      startTime: ruleStartTime,
      endTime: ruleEndTime,
      campusId: course.defaultCampusId,
      effectiveFrom: todayIso(),
      enabled: true
    });
  }

  function addSingleLesson(status: "scheduled" | "completed") {
    const course = getCourse(vault, singleCourseGroupId);
    if (!course) return;
    onAddLesson(
      createLessonFromCourse(vault, course, {
        date: singleDate,
        startTime: singleStartTime,
        endTime: singleEndTime,
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

  function addCustomPreset() {
    const label = customPresetLabel.trim() || `${customPresetStart}-${customPresetEnd}`;
    if (!customPresetStart || !customPresetEnd) return;
    onAddCustomTimePreset({
      id: makeId("time"),
      label: label.slice(0, 12),
      startTime: customPresetStart,
      endTime: customPresetEnd
    });
    setCustomPresetLabel("");
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
    if (recalculated.attendance.some((entry) => entry.status === "leave_requested" || entry.status === "absent" || entry.status === "makeup_pending")) {
      recalculated.status = "makeup_pending";
    }
    onUpdateLesson(recalculated);
  }

  function updateAttendanceNote(studentId: string, note: string) {
    if (!selected) return;
    onUpdateLesson({
      ...selected,
      attendance: selected.attendance.map((entry) =>
        entry.studentId === studentId ? { ...entry, note } : entry
      )
    });
  }

  function addTemporaryStudent() {
    if (!selected || !temporaryStudentId || selected.expectedStudentIds.includes(temporaryStudentId)) return;
    const next: Lesson = {
      ...selected,
      expectedStudentIds: [...selected.expectedStudentIds, temporaryStudentId],
      attendance: [...selected.attendance, { studentId: temporaryStudentId, status: "attended", temporary: true, note: "临时添加" }]
    };
    onUpdateLesson(recalculateLessonFee(next));
    setTemporaryStudentId("");
  }

  function removeTemporaryStudent(studentId: string) {
    if (!selected) return;
    const next: Lesson = {
      ...selected,
      expectedStudentIds: selected.expectedStudentIds.filter((id) => id !== studentId),
      attendance: selected.attendance.filter((entry) => entry.studentId !== studentId)
    };
    onUpdateLesson(recalculateLessonFee(next));
  }

  function createMakeupLesson(original: Lesson, studentId: string) {
    const course = getCourse(vault, original.courseGroupId);
    if (!course) return;
    const makeup = createLessonFromCourse(vault, course, {
      date: makeupDate,
      startTime: original.startTime,
      endTime: original.endTime,
      campusId: original.campusId ?? course.defaultCampusId,
      status: "scheduled"
    });
    const nextMakeup = recalculateLessonFee({
      ...makeup,
      expectedStudentIds: [studentId],
      attendance: [{ studentId, status: "attended" }],
      linkedOriginalLessonId: original.id,
      makeupStudentId: studentId,
      makeupOriginalDate: original.date,
      makeupScheduledDate: makeupDate,
      note: `${studentNames(vault, [studentId])} 补 ${original.date} 的课程`
    });
    onAddLesson(nextMakeup);
    onUpdateLesson({
      ...original,
      attendance: original.attendance.map((entry) =>
        entry.studentId === studentId ? { ...entry, status: "makeup_pending", note: entry.note || `已安排 ${makeupDate} 补课` } : entry
      )
    });
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
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
              <Plus size={14} /> 单次排课 / 补录
            </div>
            <CardTitle>添加课程时间</CardTitle>
            <CardDescription>单次排课与右侧固定规则互不联动，可分别选择课程和时间。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">课程</label>
                <Select value={singleCourseGroupId} onChange={(event) => setSingleCourseGroupId(event.target.value)}>
                  {vault.courseGroups.map((course) => (
                    <option key={course.id} value={course.id}>{course.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">日期</label>
                <Input type="date" value={singleDate} onChange={(event) => setSingleDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">开始时间</label>
                <Input type="time" value={singleStartTime} onChange={(event) => setSingleStartTime(event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">结束时间</label>
                <Input type="time" value={singleEndTime} onChange={(event) => setSingleEndTime(event.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-2">
                <div className="text-sm font-medium">快捷日期</div>
                <div className="grid grid-cols-3 gap-2">
                  {dateShortcuts.map((item) => (
                    <Button
                      key={item.label}
                      type="button"
                      size="sm"
                      variant={singleDate === item.value ? "default" : "outline"}
                      onClick={() => setSingleDate(item.value)}
                      className="h-10"
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">已保存时段</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {customTimePresets.map((preset) => {
                    const active = singleStartTime === preset.startTime && singleEndTime === preset.endTime;
                    return (
                      <Button
                        key={preset.id}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        onClick={() => {
                          setSingleStartTime(preset.startTime);
                          setSingleEndTime(preset.endTime);
                        }}
                        className="h-10"
                      >
                        {preset.label}
                      </Button>
                    );
                  })}
                  {customTimePresets.length === 0 && (
                    <div className="col-span-full rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] px-3 py-2 text-center text-xs font-semibold text-[#64748b]">
                      暂无自定义时段
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
              <div className="mb-3 text-sm font-medium">自定义常用时段</div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,140px)_minmax(0,140px)_minmax(122px,auto)]">
                <Input value={customPresetLabel} onChange={(event) => setCustomPresetLabel(event.target.value)} placeholder="时段名称" />
                <Input type="time" value={customPresetStart} onChange={(event) => setCustomPresetStart(event.target.value)} />
                <Input type="time" value={customPresetEnd} onChange={(event) => setCustomPresetEnd(event.target.value)} />
                <Button type="button" variant="outline" onClick={addCustomPreset} className="w-full">
                  <Plus size={15} /> 保存时段
                </Button>
              </div>
              {customTimePresets.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {customTimePresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        confirm({
                          title: `删除常用时段「${preset.label}」？`,
                          description: `${preset.startTime}-${preset.endTime}`,
                          confirmLabel: "删除",
                          tone: "danger",
                          onConfirm: () => onDeleteCustomTimePreset(preset.id)
                        })
                      }
                      className="rounded-full border border-[#dbe4ef] bg-white px-3 py-1.5 text-xs font-bold text-[#25324a] transition-colors hover:border-[#fecaca] hover:bg-[#fff1f2] hover:text-[#b91c1c]"
                      title="点击删除自定义时段"
                    >
                      {preset.label} {preset.startTime}-{preset.endTime} ×
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button type="button" onClick={() => addSingleLesson("scheduled")} disabled={!singleCourseGroupId}>
                <CalendarCheck size={16} /> 添加待上课
              </Button>
              <Button type="button" variant="outline" onClick={() => addSingleLesson("completed")} disabled={!singleCourseGroupId}>
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
                <CardDescription>固定规则使用独立课程和时间，不会改动单次排课表单。</CardDescription>
              </div>
              <Button type="submit" size="sm" disabled={!ruleCourseGroupId}>
                <Plus size={15} /> 添加规则
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">课程</label>
                  <Select value={ruleCourseGroupId} onChange={(event) => setRuleCourseGroupId(event.target.value)}>
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
                  <Input type="time" value={ruleStartTime} onChange={(event) => setRuleStartTime(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">结束</label>
                  <Input type="time" value={ruleEndTime} onChange={(event) => setRuleEndTime(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">范围开始</label>
                  <Input type="date" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">范围结束</label>
                  <Input type="date" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} />
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
                disabled={!ruleCourseGroupId || selectedWeekdays.length === 0}
                onClick={() => onGenerateDrafts(rangeStart, rangeEnd, selectedWeekdays, ruleCourseGroupId, ruleStartTime, ruleEndTime)}
              >
                <CalendarCheck size={16} /> 按日期范围生成待上课
              </Button>
            </CardContent>
          </form>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
        <Card className="h-fit overflow-hidden">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
                <CalendarDays size={14} /> 日历排课 / 查看
              </div>
              <CardTitle>日历排课</CardTitle>
              <CardDescription>{calendarMode === "schedule" ? "排课模式下，点击日期会添加待上课。" : "查看模式下，点击日期只切换右侧明细。"}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <div className="grid grid-cols-2 rounded-[12px] border border-[#dbe4ef] bg-white p-1">
                <button
                  type="button"
                  onClick={() => setCalendarMode("schedule")}
                  className={`rounded-[9px] px-3 py-2 text-xs font-bold ${calendarMode === "schedule" ? "orange-gradient text-white" : "text-[#25324a]"}`}
                >
                  排课
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarMode("view")}
                  className={`rounded-[9px] px-3 py-2 text-xs font-bold ${calendarMode === "view" ? "bg-[#1557c2] text-white" : "text-[#25324a]"}`}
                >
                  查看
                </button>
              </div>
              <Select value={String(weekStartPreference)} onChange={(event) => onWeekStartChange(Number(event.target.value) as WeekStart)} className="h-10 w-[132px]">
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
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3 md:grid-cols-3">
              <Select value={calendarCourseGroupId} onChange={(event) => setCalendarCourseGroupId(event.target.value)}>
                {vault.courseGroups.map((course) => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </Select>
              <Input type="time" value={calendarStartTime} onChange={(event) => setCalendarStartTime(event.target.value)} />
              <Input type="time" value={calendarEndTime} onChange={(event) => setCalendarEndTime(event.target.value)} />
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {visibleWeekdayLabels.map((day) => (
                <div key={day} className="py-2 text-center text-xs font-bold text-(--color-muted-foreground)">{day}</div>
              ))}
              {calendarDates(calendarMonth, weekStartPreference).map((calendarDate) => {
                const dayLessons = vault.lessons.filter((lesson) => lesson.date === calendarDate);
                const isCurrentMonth = calendarDate.startsWith(calendarMonth);
                const hasCancelled = dayLessons.some((lesson) => lesson.status === "cancelled");
                const hasCompleted = dayLessons.some((lesson) => lesson.status === "completed" || lesson.status === "makeup_completed");
                const hasPending = dayLessons.some((lesson) => lesson.status === "scheduled" || lesson.status === "makeup_pending");
                return (
                  <motion.button
                    key={calendarDate}
                    whileHover={{ scale: 1.04, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setSelectedCalendarDate(calendarDate);
                      if (calendarMode === "schedule") {
                        onAddScheduledLesson(calendarDate, calendarCourseGroupId, calendarStartTime, calendarEndTime);
                      }
                    }}
                    disabled={calendarMode === "schedule" && !calendarCourseGroupId}
                    className={`relative flex min-h-[86px] flex-col items-start rounded-[14px] border p-2 text-left transition-all sm:min-h-[96px] sm:p-2.5 ${
                      selectedCalendarDate === calendarDate
                        ? "border-[#ff8617] bg-[#fff7ed] shadow-[0_10px_24px_rgba(255,134,23,0.12)]"
                        : isCurrentMonth
                          ? hasCancelled
                            ? "border-[#fecaca] bg-[#fff1f2] hover:border-[#fca5a5]"
                            : "border-[#dbe4ef] bg-white hover:border-[#ff8617] hover:shadow-[0_10px_24px_rgba(15,35,66,0.08)]"
                          : "border-transparent bg-white opacity-40"
                    }`}
                  >
                    <span className={`text-sm font-bold ${isCurrentMonth ? "text-(--color-foreground)" : ""}`}>{Number(calendarDate.slice(8))}</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {dayLessons.length > 0 && <Badge variant="secondary" className="text-[10px]">{dayLessons.length} 节</Badge>}
                      {hasCompleted && <Badge variant="sage" className="text-[10px] px-1.5 py-0">完成</Badge>}
                      {hasPending && <Badge variant="amber" className="text-[10px] px-1.5 py-0">待</Badge>}
                      {hasCancelled && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">取消</Badge>}
                    </div>
                    {dayLessons.slice(0, 2).map((lesson) => (
                      <span key={lesson.id} className="mt-1 w-full truncate text-[10px] font-semibold text-[#64748b]">
                        {lesson.startTime} {courseName(vault, lesson.courseGroupId)}
                      </span>
                    ))}
                  </motion.button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                <Clock size={14} /> 每日课程详情
              </div>
              <CardTitle>{selectedCalendarDate} 课程</CardTitle>
              <CardDescription>状态与课时记录同步，可从这里选择或删除课程。</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {selectedCalendarLessons.map((lesson) => (
                <div key={lesson.id} className={`rounded-[12px] border p-3 ${lessonStatusSurfaceClass(lesson.status)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={() => setSelectedId(lesson.id)} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-extrabold text-[#061226]">{courseName(vault, lesson.courseGroupId)}</span>
                        <Badge variant={lessonStatusVariant(lesson.status)} className="text-[10px]">{lessonStatusLabels[lesson.status]}</Badge>
                      </div>
                      <div className="mt-1 text-xs font-semibold text-[#64748b]">
                        {lesson.startTime}-{lesson.endTime} · {campusName(vault, lesson.campusId)}
                      </div>
                    </button>
                    <Button type="button" size="sm" variant="destructive" onClick={() => askDeleteLesson(lesson)}>
                      <Trash2 size={14} /> 删除
                    </Button>
                  </div>
                  {lesson.note && (
                    <div className="mt-2 rounded-[10px] bg-white/72 px-3 py-2 text-xs font-semibold text-[#7f1d1d]">{lesson.note}</div>
                  )}
                </div>
              ))}
              {selectedCalendarLessons.length === 0 && (
                <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-5 text-center text-sm font-semibold text-[#64748b]">
                  这一天没有课程
                </div>
              )}
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
            <CardContent className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {vault.scheduleRules.map((rule) => {
                const isEditing = editingRule?.id === rule.id;
                return (
                  <motion.div key={rule.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4 transition-all hover:shadow-[0_10px_24px_rgba(15,35,66,0.08)]">
                    {isEditing && editingRule ? (
                      <div className="space-y-3">
                        <Select
                          value={editingRule.courseGroupId}
                          onChange={(event) => {
                            const course = getCourse(vault, event.target.value);
                            setEditingRule({ ...editingRule, courseGroupId: event.target.value, campusId: course?.defaultCampusId });
                          }}
                        >
                          {vault.courseGroups.map((course) => (
                            <option key={course.id} value={course.id}>{course.name}</option>
                          ))}
                        </Select>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <Select value={editingRule.weekday} onChange={(event) => setEditingRule({ ...editingRule, weekday: Number(event.target.value) as Weekday })}>
                            {visibleWeekdays.map((day) => (
                              <option key={day} value={day}>{weekdayLabels[day]}</option>
                            ))}
                          </Select>
                          <Select value={editingRule.campusId ?? ""} onChange={(event) => setEditingRule({ ...editingRule, campusId: event.target.value || undefined })}>
                            <option value="">课程默认校区</option>
                            {vault.campuses.map((campus) => (
                              <option key={campus.id} value={campus.id}>{campus.name}</option>
                            ))}
                          </Select>
                          <Input type="time" value={editingRule.startTime} onChange={(event) => setEditingRule({ ...editingRule, startTime: event.target.value })} />
                          <Input type="time" value={editingRule.endTime} onChange={(event) => setEditingRule({ ...editingRule, endTime: event.target.value })} />
                          <Input type="date" value={editingRule.effectiveFrom} onChange={(event) => setEditingRule({ ...editingRule, effectiveFrom: event.target.value })} />
                          <Input type="date" value={editingRule.effectiveTo ?? ""} onChange={(event) => setEditingRule({ ...editingRule, effectiveTo: event.target.value || undefined })} />
                        </div>
                        <Select value={editingRule.enabled ? "enabled" : "disabled"} onChange={(event) => setEditingRule({ ...editingRule, enabled: event.target.value === "enabled" })}>
                          <option value="enabled">启用</option>
                          <option value="disabled">停用</option>
                        </Select>
                        <div className="grid grid-cols-2 gap-2">
                          <Button type="button" size="sm" onClick={saveRuleDraft}><Save size={14} /> 保存</Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => setEditingRule(null)}><X size={14} /> 取消</Button>
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
                          <Button type="button" size="sm" variant="outline" onClick={() => setEditingRule(rule)}><Pencil size={14} /> 编辑</Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                              confirm({
                                title: `删除排课规则「${courseName(vault, rule.courseGroupId)}」？`,
                                description: "删除规则不会删除已经生成的课时记录。",
                                confirmLabel: "删除",
                                tone: "danger",
                                onConfirm: () => onDeleteRule(rule.id)
                              })
                            }
                          >
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
      </div>

      {makeupEntries.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
              <RotateCcw size={14} /> 补课跟进
            </div>
            <CardTitle>需要补课的学生</CardTitle>
            <CardDescription>从缺课记录直接生成新的补课课时，会保留原课程日期和新安排日期。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr]">
              <div className="space-y-2">
                <label className="text-sm font-medium">新补课日期</label>
                <Input type="date" value={makeupDate} onChange={(event) => setMakeupDate(event.target.value)} />
              </div>
              <div className="rounded-[14px] border border-[#fed7aa] bg-[#fff7ed] p-3 text-sm font-semibold leading-6 text-[#9a3412]">
                生成后会在课时列表里出现一条关联原课的待上课记录，月底核对时能看到原日期与补课日期。
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {makeupEntries.map(({ lesson, entry }) => (
                <div key={`${lesson.id}-${entry.studentId}`} className="rounded-[14px] border border-[#fed7aa] bg-[#fff7ed] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold text-[#061226]">{findStudent(vault, entry.studentId)?.name ?? "未知学生"}</div>
                      <div className="mt-1 text-xs font-semibold text-[#64748b]">
                        原课：{lesson.date} · {lesson.startTime}-{lesson.endTime} · {courseName(vault, lesson.courseGroupId)}
                      </div>
                      {entry.note && <div className="mt-2 text-xs font-semibold text-[#9a3412]">备注：{entry.note}</div>}
                    </div>
                    <Button type="button" size="sm" onClick={() => createMakeupLesson(lesson, entry.studentId)}>
                      <Plus size={14} /> 安排补课
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
              <Clock size={14} /> 课程记录
            </div>
            <CardTitle>课时列表</CardTitle>
            <CardDescription>默认只看所选月份或周，不再把所有课时一次性铺开。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pb-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">查看范围</label>
                <Select value={lessonScope} onChange={(event) => setLessonScope(event.target.value as LessonScope)}>
                  <option value="month">按月查看</option>
                  <option value="week">按周查看</option>
                </Select>
              </div>
              {lessonScope === "month" ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">月份</label>
                  <Input type="month" value={lessonMonth} onChange={(event) => setLessonMonth(event.target.value)} />
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">周</label>
                  <Input type="week" value={lessonWeek} onChange={(event) => setLessonWeek(event.target.value)} />
                </div>
              )}
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
                <label className="text-sm font-medium">班型筛选</label>
                <Select value={courseTypeFilter} onChange={(event) => setCourseTypeFilter(event.target.value as CourseTypeFilter)}>
                  <option value="all">全部班型</option>
                  <option value="one_on_one">一对一</option>
                  <option value="class">班课</option>
                  <option value="trial">试听</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
              <label className="relative block">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                <Input className="pl-9" value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)} placeholder="输入学生名筛选" />
              </label>
              <Button type="button" variant={showOnlyMakeup ? "default" : "outline"} onClick={() => setShowOnlyMakeup((value) => !value)}>
                <RotateCcw size={15} /> 只看补课
              </Button>
            </div>

            <div className="max-h-[620px] space-y-1 overflow-y-auto pr-2">
              {lessons.map((lesson, index) => (
                <motion.button
                  key={lesson.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02 }}
                  whileHover={{ scale: 1.01, x: 2 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setSelectedId(lesson.id)}
                  className={`flex w-full items-center justify-between rounded-[14px] border p-3 text-left transition-all duration-200 ${
                    selected?.id === lesson.id
                      ? "border-[#ff8617]/45 bg-[#fff7ed] shadow-[0_10px_24px_rgba(255,134,23,0.12)]"
                      : lessonStatusSurfaceClass(lesson.status)
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white">
                      <GraduationCap size={14} className="text-(--color-muted-foreground)" />
                    </div>
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium">{courseName(vault, lesson.courseGroupId)}</span>
                      <span className="text-xs text-(--color-muted-foreground)">
                        {lesson.date} · {lesson.startTime}-{lesson.endTime} · {campusName(vault, lesson.campusId)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden text-sm font-semibold sm:inline">{formatMoney(lesson.feeSnapshot.amount)}</span>
                    <Badge variant={lessonStatusVariant(lesson.status)} className="text-[10px]">
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
                <Button variant="destructive" size="sm" onClick={() => askDeleteLesson(selected)}>
                  <Trash2 size={15} /> 删除
                </Button>
              </CardHeader>
              <CardContent className="space-y-5">
                {selectedOriginalLesson && (
                  <div className="rounded-[14px] border border-[#fed7aa] bg-[#fff7ed] p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#9a3412]">
                      <Link2 size={16} /> 补课来源
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-sm font-semibold text-[#7c2d12] sm:grid-cols-2">
                      <div>原课日期：{selectedOriginalLesson.date}</div>
                      <div>补课日期：{selected.date}</div>
                      <div>学生：{selected.makeupStudentId ? studentNames(vault, [selected.makeupStudentId]) : studentNames(vault, selected.expectedStudentIds)}</div>
                      <div>原课程：{courseName(vault, selectedOriginalLesson.courseGroupId)}</div>
                    </div>
                  </div>
                )}

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
                    <Input type="date" value={selected.date} onChange={(event) => updateSelected({ date: event.target.value, makeupScheduledDate: selected.linkedOriginalLessonId ? event.target.value : selected.makeupScheduledDate })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">开始</label>
                      <Input type="time" value={selected.startTime} onChange={(event) => updateSelected({ startTime: event.target.value }, true)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">结束</label>
                      <Input type="time" value={selected.endTime} onChange={(event) => updateSelected({ endTime: event.target.value }, true)} />
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
                        onChange={(event) => updateSelected({ feeSnapshot: { ...selected.feeSnapshot, amount: Number(event.target.value) } })}
                        className="pl-10"
                      />
                    </div>
                  </div>
                </div>

                {selected.status === "cancelled" && (
                  <div className="rounded-[14px] border border-[#fecaca] bg-[#fff1f2] p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#7f1d1d]">
                      <AlertTriangle size={16} /> 取消备注
                    </div>
                    <Textarea
                      value={selected.note ?? ""}
                      onChange={(event) => updateSelected({ note: event.target.value })}
                      placeholder="填写取消原因，例如学生请假、校区停课、老师调课..."
                      className="min-h-[76px] bg-white"
                    />
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
                    <UserCheck size={14} /> 到课情况
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                    <Select value={temporaryStudentId} onChange={(event) => setTemporaryStudentId(event.target.value)}>
                      <option value="">选择临时试听 / 临时加入学生</option>
                      {vault.students
                        .filter((student) => !selected.expectedStudentIds.includes(student.id))
                        .map((student) => (
                          <option key={student.id} value={student.id}>{student.name}</option>
                        ))}
                    </Select>
                    <Button type="button" variant="outline" onClick={addTemporaryStudent} disabled={!temporaryStudentId}>
                      <UserPlus size={15} /> 添加临时学生
                    </Button>
                  </div>
                  {selected.attendance.map((entry) => {
                    const isTemporary = entry.temporary || !selectedCourse?.studentIds.includes(entry.studentId);
                    return (
                      <motion.div key={entry.studentId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`rounded-[14px] border p-3 ${isTemporary ? "border-[#c7d2fe] bg-[#eef0ff]" : "border-[#dbe4ef] bg-[#f8fbff]"}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fff1e2]">
                              <span className="text-xs font-bold text-[#ff8617]">{(findStudent(vault, entry.studentId)?.name ?? "未知").slice(0, 1)}</span>
                            </div>
                            <span className="truncate text-sm font-medium">{findStudent(vault, entry.studentId)?.name ?? "未知学生"}</span>
                            {isTemporary && <Badge variant="plum" className="shrink-0">临时试听</Badge>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Select value={entry.status} onChange={(event) => updateAttendance(entry.studentId, event.target.value as AttendanceStatus)} className="h-9 max-w-[136px]">
                              {Object.entries(attendanceLabels).map(([key, value]) => (
                                <option key={key} value={key}>{value}</option>
                              ))}
                            </Select>
                            {isTemporary && (
                              <Button type="button" size="sm" variant="destructive" onClick={() => removeTemporaryStudent(entry.studentId)}>
                                <Trash2 size={13} />
                              </Button>
                            )}
                          </div>
                        </div>
                        {(entry.status === "leave_requested" || entry.status === "absent" || entry.status === "makeup_pending" || entry.note) && (
                          <Input
                            className="mt-3 bg-white"
                            value={entry.note ?? ""}
                            onChange={(event) => updateAttendanceNote(entry.studentId, event.target.value)}
                            placeholder="补课/请假备注，例如原课请假原因、已约补课时间"
                          />
                        )}
                      </motion.div>
                    );
                  })}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                    <BookOpen size={14} /> 本次课内容
                  </div>
                  <Textarea value={selected.content.taught} onChange={(event) => updateContent("taught", event.target.value)} placeholder="记录本次教学内容..." />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
                    <NotebookPen size={14} /> 课后作业
                  </div>
                  <Textarea value={selected.content.homework} onChange={(event) => updateContent("homework", event.target.value)} placeholder="布置课后作业..." />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                    <BookText size={14} /> 下次课提醒
                  </div>
                  <Textarea value={selected.content.nextLessonReminder} onChange={(event) => updateContent("nextLessonReminder", event.target.value)} placeholder="下次课需要检查或准备的内容..." />
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

function isoWeekValue(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00`);
  const day = date.getDay() || 7;
  const thursday = new Date(date);
  thursday.setDate(date.getDate() + 4 - day);
  const year = thursday.getFullYear();
  const firstThursday = new Date(`${year}-01-04T00:00:00`);
  const firstDay = firstThursday.getDay() || 7;
  firstThursday.setDate(firstThursday.getDate() + 4 - firstDay);
  const week = Math.floor((thursday.getTime() - firstThursday.getTime()) / 604_800_000) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function datesForIsoWeekValue(value: string): string[] {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) return [];
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(`${year}-01-04T00:00:00`);
  const jan4Day = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - jan4Day + 1 + (week - 1) * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return formatDateIso(date);
  });
}
