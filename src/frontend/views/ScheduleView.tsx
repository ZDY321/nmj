import { useEffect, useState } from "react";
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
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserCheck,
  UserPlus
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import type { AttendanceStatus, CourseType, Lesson, TeacherVault, TimePreset, WeekStart, Weekday } from "@/shared/types";
import { calculateFee, classFeeTierForCount, extraFeeTotal, getCourse, hoursBetween, presentCount, todayIso } from "@/frontend/lib/calculations";
import { makeId } from "@/frontend/lib/crypto";
import {
  attendanceLabels,
  addDays,
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
  weekdayOfDateIso,
  weekdayLabels
} from "@/frontend/lib/helpers";

type LessonScope = "month" | "day" | "range" | "week";
type CourseTypeFilter = "all" | CourseType;
type SchedulePanel = "schedule" | "calendar" | "records" | "studentStats";
type CalendarFocus = { date: string; lessonId?: string; nonce: number } | null;

export function ScheduleView({
  vault,
  onAddLesson,
  onUpdateLesson,
  onDeleteLesson,
  onAddCustomTimePreset,
  onDeleteCustomTimePreset,
  onGenerateDrafts,
  onAddScheduledLesson,
  onWeekStartChange,
  calendarFocus
}: {
  vault: TeacherVault;
  onAddLesson: (lesson: Lesson) => void;
  onUpdateLesson: (lesson: Lesson) => void;
  onDeleteLesson: (lessonId: string) => void;
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
  calendarFocus?: CalendarFocus;
}) {
  const courseSelectionOptions = vault.courseGroups.filter((course) => course.status === "active");
  const courseSelectionOptionIds = courseSelectionOptions.map((course) => course.id).join("|");
  const firstCourseId = courseSelectionOptions[0]?.id ?? "";
  const [singleCourseGroupId, setSingleCourseGroupId] = useState(firstCourseId);
  const [singleDate, setSingleDate] = useState(todayIso());
  const [singleStartTime, setSingleStartTime] = useState("19:00");
  const [singleEndTime, setSingleEndTime] = useState("21:00");
  const [ruleCourseGroupId, setRuleCourseGroupId] = useState(firstCourseId);
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
  const [selectedId, setSelectedId] = useState(vault.lessons[0]?.id ?? "");
  const [campusFilter, setCampusFilter] = useState("all");
  const [studentFilter, setStudentFilter] = useState("");
  const [courseTypeFilter, setCourseTypeFilter] = useState<CourseTypeFilter>("all");
  const [studentStatsNameFilter, setStudentStatsNameFilter] = useState("");
  const [studentStatsCourseFilter, setStudentStatsCourseFilter] = useState("all");
  const [studentStatsSubjectFilter, setStudentStatsSubjectFilter] = useState("all");
  const [studentStatsCampusFilter, setStudentStatsCampusFilter] = useState("all");
  const [studentStatsStatusFilter, setStudentStatsStatusFilter] = useState<"all" | Lesson["status"]>("all");
  const [studentStatsDateStart, setStudentStatsDateStart] = useState(todayIso().slice(0, 7) + "-01");
  const [studentStatsDateEnd, setStudentStatsDateEnd] = useState(todayIso());
  const [studentStatsStartTime, setStudentStatsStartTime] = useState("");
  const [studentStatsEndTime, setStudentStatsEndTime] = useState("");
  const [lessonScope, setLessonScope] = useState<LessonScope>("month");
  const [lessonMonth, setLessonMonth] = useState(todayIso().slice(0, 7));
  const [lessonDay, setLessonDay] = useState(todayIso());
  const [lessonRangeStart, setLessonRangeStart] = useState(todayIso());
  const [lessonRangeEnd, setLessonRangeEnd] = useState(todayIso());
  const [lessonWeek, setLessonWeek] = useState(isoWeekValue(todayIso()));
  const [syncRecordsWithCalendarDate, setSyncRecordsWithCalendarDate] = useState(true);
  const [showOnlyMakeup, setShowOnlyMakeup] = useState(false);
  const [schedulePanel, setSchedulePanel] = useState<SchedulePanel>("schedule");
  const [customPresetStart, setCustomPresetStart] = useState("08:00");
  const [customPresetEnd, setCustomPresetEnd] = useState("10:00");
  const [temporaryStudentId, setTemporaryStudentId] = useState("");
  const [temporaryStudentSearch, setTemporaryStudentSearch] = useState("");
  const [attendanceStudentFilter, setAttendanceStudentFilter] = useState("");
  const [makeupOriginalDateFilter, setMakeupOriginalDateFilter] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const { confirm, dialog } = useConfirmDialog();

  useEffect(() => {
    const fallbackCourseId = courseSelectionOptions[0]?.id ?? "";
    const hasCourse = (courseId: string) => courseSelectionOptions.some((course) => course.id === courseId);
    setSingleCourseGroupId((current) => (hasCourse(current) ? current : fallbackCourseId));
    setRuleCourseGroupId((current) => (hasCourse(current) ? current : fallbackCourseId));
    setCalendarCourseGroupId((current) => (hasCourse(current) ? current : fallbackCourseId));
  }, [courseSelectionOptionIds]);

  useEffect(() => {
    if (!calendarFocus?.date) return;
    setSchedulePanel("calendar");
    setCalendarMode("view");
    setSelectedCalendarDate(calendarFocus.date);
    setCalendarMonth(calendarFocus.date.slice(0, 7));
    setLessonDay(calendarFocus.date);
    setLessonMonth(calendarFocus.date.slice(0, 7));
    setSyncRecordsWithCalendarDate(true);
    if (calendarFocus.lessonId) {
      setSelectedId(calendarFocus.lessonId);
    }
  }, [calendarFocus?.nonce]);

  const weekStartPreference = weekStartsOn(vault);
  const visibleWeekdays = orderedWeekdays(weekStartPreference);
  const visibleWeekdayLabels = orderedWeekdayLabels(weekStartPreference, shortWeekdayLabels);
  const customTimePresets = vault.preferences?.customTimePresets ?? [];
  const selectedCalendarLessons = vault.lessons.filter((lesson) => lesson.date === selectedCalendarDate).sort(sortLessons);
  const selectedCalendarCompletedCount = selectedCalendarLessons.filter((lesson) => isCompletedLessonStatus(lesson.status)).length;
  const selectedCalendarPendingCount = selectedCalendarLessons.filter((lesson) => isPendingLessonStatus(lesson.status)).length;
  const selectedCalendarCancelledCount = selectedCalendarLessons.filter((lesson) => lesson.status === "cancelled").length;
  const selectedCalendarAmount = selectedCalendarLessons.reduce((sum, lesson) => sum + lesson.feeSnapshot.amount, 0);
  const normalizedStudentFilter = studentFilter.trim().toLowerCase();
  const normalizedStudentStatsNameFilter = studentStatsNameFilter.trim().toLowerCase();
  const studentStatsSubjects = Array.from(new Set(vault.courseGroups.map((course) => course.subject).filter(Boolean))).sort();
  const effectiveLessonScope = syncRecordsWithCalendarDate ? "day" : lessonScope;
  const effectiveLessonDay = syncRecordsWithCalendarDate ? selectedCalendarDate : lessonDay;
  const scopeDates = effectiveLessonScope === "week" ? datesForIsoWeekValue(lessonWeek) : [];
  const lessons = vault.lessons
    .filter((lesson) => {
      const course = getCourse(vault, lesson.courseGroupId);
      const campusId = lesson.campusId ?? course?.defaultCampusId;
      const matchesScope =
        effectiveLessonScope === "month"
          ? lesson.date.startsWith(lessonMonth)
          : effectiveLessonScope === "day"
            ? lesson.date === effectiveLessonDay
            : effectiveLessonScope === "range"
              ? isOrderedDateRange(lessonRangeStart, lessonRangeEnd) && lesson.date >= lessonRangeStart && lesson.date <= lessonRangeEnd
              : scopeDates.includes(lesson.date);
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
  const studentStatsLessons = vault.lessons
    .filter((lesson) => {
      const course = getCourse(vault, lesson.courseGroupId);
      const campusId = lesson.campusId ?? course?.defaultCampusId;
      const studentIds = lessonStudentIds(lesson);
      const matchesStudent =
        !normalizedStudentStatsNameFilter ||
        studentIds.some((studentId) =>
          (findStudent(vault, studentId)?.name ?? "").toLowerCase().includes(normalizedStudentStatsNameFilter)
        );
      const matchesCourse = studentStatsCourseFilter === "all" || lesson.courseGroupId === studentStatsCourseFilter;
      const matchesSubject = studentStatsSubjectFilter === "all" || course?.subject === studentStatsSubjectFilter;
      const matchesCampus = studentStatsCampusFilter === "all" || campusId === studentStatsCampusFilter;
      const matchesStatus = studentStatsStatusFilter === "all" || lesson.status === studentStatsStatusFilter;
      const matchesDate =
        (!studentStatsDateStart || lesson.date >= studentStatsDateStart) &&
        (!studentStatsDateEnd || lesson.date <= studentStatsDateEnd) &&
        (!studentStatsDateStart || !studentStatsDateEnd || studentStatsDateStart <= studentStatsDateEnd);
      const matchesTime =
        (!studentStatsStartTime || timeToMinutes(lesson.startTime) >= timeToMinutes(studentStatsStartTime)) &&
        (!studentStatsEndTime || timeToMinutes(lesson.endTime) <= timeToMinutes(studentStatsEndTime)) &&
        (!studentStatsStartTime || !studentStatsEndTime || timeToMinutes(studentStatsStartTime) <= timeToMinutes(studentStatsEndTime));
      return matchesStudent && matchesCourse && matchesSubject && matchesCampus && matchesStatus && matchesDate && matchesTime;
    })
    .sort(sortLessons);
  const studentStatsRows = buildStudentStatsRows(vault, studentStatsLessons, normalizedStudentStatsNameFilter);
  const studentStatsTotalHours = studentStatsLessons.reduce((sum, lesson) => sum + (lesson.feeSnapshot.hours ?? hoursBetween(lesson.startTime, lesson.endTime)), 0);
  const studentStatsCompletedCount = studentStatsLessons.filter((lesson) => isCompletedLessonStatus(lesson.status)).length;
  const selected = vault.lessons.find((lesson) => lesson.id === selectedId) ?? lessons[0];
  const selectedCourse = selected ? getCourse(vault, selected.courseGroupId) : undefined;
  const selectedOriginalLesson = selected?.linkedOriginalLessonId
    ? vault.lessons.find((lesson) => lesson.id === selected.linkedOriginalLessonId)
    : undefined;
  const normalizedTemporaryStudentSearch = temporaryStudentSearch.trim().toLowerCase();
  const normalizedAttendanceStudentFilter = attendanceStudentFilter.trim().toLowerCase();
  const temporaryStudentOptions = selected
    ? vault.students.filter((student) => {
        const isAvailable = !selected.expectedStudentIds.includes(student.id);
        const searchable = [
          student.name,
          student.grade ?? "",
          student.school ?? "",
          student.note ?? "",
          student.temporaryTrial ? "试听 临时试听" : ""
        ].join(" ").toLowerCase();
        return isAvailable && (!normalizedTemporaryStudentSearch || searchable.includes(normalizedTemporaryStudentSearch));
      })
    : [];
  const selectedTemporaryStudent = temporaryStudentId
    ? vault.students.find((student) => student.id === temporaryStudentId)
    : undefined;
  const displayedTemporaryStudentOptions =
    selectedTemporaryStudent && !temporaryStudentOptions.some((student) => student.id === selectedTemporaryStudent.id)
      ? [selectedTemporaryStudent, ...temporaryStudentOptions]
      : temporaryStudentOptions;
  const selectedAttendanceEntries = selected
    ? selected.attendance.filter((entry) => {
        const student = findStudent(vault, entry.studentId);
        const searchable = [
          student?.name ?? "",
          student?.grade ?? "",
          student?.school ?? "",
          student?.note ?? "",
          attendanceLabels[entry.status],
          entry.temporary ? "临时加入" : ""
        ].join(" ").toLowerCase();
        return !normalizedAttendanceStudentFilter || searchable.includes(normalizedAttendanceStudentFilter);
      })
    : [];
  const allMakeupEntries = vault.lessons
    .filter((lesson) => lesson.status === "makeup_pending")
    .flatMap((lesson) =>
      lesson.attendance
        .filter((entry) => entry.status === "leave_requested" || entry.status === "absent" || entry.status === "makeup_pending")
        .map((entry) => ({ lesson, entry }))
    )
    .sort((a, b) => sortLessons(a.lesson, b.lesson));
  const makeupEntries = allMakeupEntries.filter(({ lesson }) => !makeupOriginalDateFilter || lesson.date === makeupOriginalDateFilter);
  const dateShortcuts = [
    { label: "今天", value: offsetDate(0) },
    { label: "昨天", value: offsetDate(-1) },
    { label: "前天", value: offsetDate(-2) }
  ];
  const isSingleTimeValid = isOrderedTimeRange(singleStartTime, singleEndTime);
  const isCustomPresetTimeValid = isOrderedTimeRange(customPresetStart, customPresetEnd);
  const isBatchTimeValid = isOrderedTimeRange(ruleStartTime, ruleEndTime);
  const isBatchDateRangeValid = isOrderedDateRange(rangeStart, rangeEnd);
  const isCalendarTimeValid = isOrderedTimeRange(calendarStartTime, calendarEndTime);

  function addSingleLesson(status: "scheduled" | "completed") {
    addLessonFromCourse(singleCourseGroupId, singleDate, singleStartTime, singleEndTime, status);
  }

  function goToCalendarSchedulingFromSingle() {
    setCalendarCourseGroupId(singleCourseGroupId);
    setCalendarStartTime(singleStartTime);
    setCalendarEndTime(singleEndTime);
    setSelectedCalendarDate(singleDate);
    setCalendarMonth(singleDate.slice(0, 7));
    setCalendarMode("schedule");
    setSchedulePanel("calendar");
  }

  function addLessonFromCourse(
    courseGroupId: string,
    lessonDate: string,
    lessonStartTime: string,
    lessonEndTime: string,
    status: "scheduled" | "completed",
    force = false
  ) {
    if (!validateTimeRange(lessonStartTime, lessonEndTime)) return;
    const course = getCourse(vault, courseGroupId);
    if (!course) return;
    if (course.status !== "active") {
      showScheduleError("这个课程已暂停，请先在档案信息中启用或选择当前课程。");
      return;
    }
    setScheduleError("");
    const conflict = findTimeConflict(lessonDate, lessonStartTime, lessonEndTime);
    if (conflict && !force) {
      confirm({
        title: "这个时间段已有课程",
        description: `${lessonDate} ${lessonStartTime}-${lessonEndTime} 与「${courseName(vault, conflict.courseGroupId)} ${conflict.startTime}-${conflict.endTime}」冲突。请确认是否仍要添加。`,
        confirmLabel: "仍然添加",
        tone: "danger",
        onConfirm: () => addLessonFromCourse(courseGroupId, lessonDate, lessonStartTime, lessonEndTime, status, true)
      });
      return;
    }
    onAddLesson(
      createLessonFromCourse(vault, course, {
        date: lessonDate,
        startTime: lessonStartTime,
        endTime: lessonEndTime,
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
    if (!customPresetStart || !customPresetEnd) return;
    if (!validateTimeRange(customPresetStart, customPresetEnd, "自定义时段的结束时间必须晚于开始时间。")) return;
    const label = `${customPresetStart}-${customPresetEnd}`;
    setScheduleError("");
    onAddCustomTimePreset({
      id: makeId("time"),
      label,
      startTime: customPresetStart,
      endTime: customPresetEnd
    });
  }

  function recalculateLessonFee(lesson: Lesson): Lesson {
    const course = getCourse(vault, lesson.courseGroupId);
    if (!course) return lesson;
    const presentStudentCount = presentCount(lesson);
    const classFeeTier = course.feeRule.mode === "class_headcount"
      ? classFeeTierForCount(course.feeRule, presentStudentCount)
      : undefined;
    return {
      ...lesson,
      type: course.type,
      feeSnapshot: {
        ...lesson.feeSnapshot,
        baseFee: classFeeTier?.baseFee ?? course.feeRule.baseFee,
        hourlyRate: course.feeRule.hourlyRate,
        fixedFee: course.feeRule.fixedFee,
        perPresentStudentFee: classFeeTier?.perStudentFee ?? course.feeRule.perPresentStudentFee,
        classFeeTierId: classFeeTier?.id,
        presentStudentCount,
        trialStudentCount: lesson.trialStudentCount ?? 0,
        trialFee: lesson.trialFee ?? 0,
        hours: hoursBetween(lesson.startTime, lesson.endTime),
        manualAdjustment: extraFeeTotal(lesson),
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
      trialStudentCount: course.type === "class" ? selected.trialStudentCount ?? 0 : 0,
      trialFee: course.type === "class" ? selected.trialFee ?? 0 : 0,
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
        entry.studentId === studentId ? { ...entry, status, note: status === "attended" ? undefined : entry.note } : entry
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

  function updateTemporaryFee(studentId: string, value: number) {
    if (!selected) return;
    const nextLesson: Lesson = {
      ...selected,
      attendance: selected.attendance.map((entry) =>
        entry.studentId === studentId ? { ...entry, temporaryFee: Number.isFinite(value) ? value : 0 } : entry
      )
    };
    onUpdateLesson(recalculateLessonFee(nextLesson));
  }

  function updateTrialStats(patch: Pick<Partial<Lesson>, "trialStudentCount" | "trialFee">) {
    if (!selected) return;
    onUpdateLesson(recalculateLessonFee({ ...selected, ...patch }));
  }

  function addTemporaryStudent() {
    if (!selected || !temporaryStudentId || selected.expectedStudentIds.includes(temporaryStudentId)) return;
    const next: Lesson = {
      ...selected,
      expectedStudentIds: [...selected.expectedStudentIds, temporaryStudentId],
      attendance: [...selected.attendance, { studentId: temporaryStudentId, status: "attended", temporary: true, temporaryFee: 0, note: "临时添加" }]
    };
    onUpdateLesson(recalculateLessonFee(next));
    setTemporaryStudentId("");
    setTemporaryStudentSearch("");
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

  function askRemoveTemporaryStudent(studentId: string) {
    const student = findStudent(vault, studentId);
    confirm({
      title: `移除临时学生「${student?.name ?? "未知学生"}」？`,
      description: "移除后这名学生的到课状态和临时费用会从本节课删除。",
      confirmLabel: "移除",
      tone: "danger",
      onConfirm: () => removeTemporaryStudent(studentId)
    });
  }

  function createMakeupLesson(original: Lesson, studentId: string) {
    const course = getCourse(vault, original.courseGroupId);
    if (!course) return;
    const scheduledDate = selectedCalendarDate;
    const makeup = createLessonFromCourse(vault, course, {
      date: scheduledDate,
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
      makeupScheduledDate: scheduledDate,
      note: `${studentNames(vault, [studentId])} 补 ${original.date} 的课程`
    });
    onAddLesson(nextMakeup);
    onUpdateLesson({
      ...original,
      attendance: original.attendance.map((entry) =>
        entry.studentId === studentId ? { ...entry, status: "makeup_pending", note: entry.note || `已安排 ${scheduledDate} 补课` } : entry
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

  function findTimeConflict(lessonDate: string, lessonStartTime: string, lessonEndTime: string): Lesson | undefined {
    return vault.lessons.find(
      (lesson) =>
        lesson.date === lessonDate &&
        lesson.status !== "cancelled" &&
        timesOverlap(lesson.startTime, lesson.endTime, lessonStartTime, lessonEndTime)
    );
  }

  function hasBatchConflicts(): boolean {
    if (!isBatchDateRangeValid || !isBatchTimeValid) return false;
    const dates = datesBetweenLocal(rangeStart, rangeEnd).filter((item) =>
      selectedWeekdays.includes(weekdayOfDateIso(item))
    );
    return dates.some((item) => findTimeConflict(item, ruleStartTime, ruleEndTime));
  }

  function showScheduleError(message: string) {
    setScheduleError(message);
    window.setTimeout(() => {
      setScheduleError((current) => (current === message ? "" : current));
    }, 3200);
  }

  function validateTimeRange(startTime: string, endTime: string, message = "结束时间必须晚于开始时间。"): boolean {
    if (isOrderedTimeRange(startTime, endTime)) return true;
    showScheduleError(message);
    return false;
  }

  function validateDateRange(startDate: string, endDate: string): boolean {
    if (isOrderedDateRange(startDate, endDate)) return true;
    showScheduleError("范围结束日期不能早于范围开始日期。");
    return false;
  }

  return (
    <div className="space-y-6">
      {dialog}
      <div className="grid grid-cols-2 gap-2 rounded-[16px] border border-[#dbe4ef] bg-white p-1 sm:grid-cols-4">
        {[
          { key: "schedule" as SchedulePanel, label: "排课" },
          { key: "calendar" as SchedulePanel, label: "日历查看" },
          { key: "records" as SchedulePanel, label: "课程记录" },
          { key: "studentStats" as SchedulePanel, label: "学生课次" }
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setSchedulePanel(item.key)}
            className={`rounded-[12px] px-3 py-2 text-sm font-extrabold transition-colors ${
              schedulePanel === item.key ? "bg-[#1557c2] text-white" : "text-[#25324a] hover:bg-[#f8fbff]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {scheduleError && (
        <div className="rounded-[12px] border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm font-extrabold text-[#b91c1c]">
          {scheduleError}
        </div>
      )}

      {schedulePanel === "schedule" && (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
              <Plus size={14} /> 单次排课 / 补录
            </div>
            <CardTitle>添加课程时间</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">课程</label>
                <Select value={singleCourseGroupId} onChange={(event) => setSingleCourseGroupId(event.target.value)}>
                  {courseSelectionOptions.map((course) => (
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
                <Input type="time" value={singleStartTime} max={singleEndTime} onChange={(event) => setSingleStartTime(event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">结束时间</label>
                <Input type="time" value={singleEndTime} min={singleStartTime} onChange={(event) => setSingleEndTime(event.target.value)} className={!isSingleTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
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
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,140px)_minmax(0,140px)_minmax(122px,auto)]">
                <Input type="time" value={customPresetStart} max={customPresetEnd} onChange={(event) => setCustomPresetStart(event.target.value)} />
                <Input type="time" value={customPresetEnd} min={customPresetStart} onChange={(event) => setCustomPresetEnd(event.target.value)} className={!isCustomPresetTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                <Button type="button" variant="outline" onClick={addCustomPreset} className="w-full" disabled={!isCustomPresetTimeValid}>
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
                      {preset.label === `${preset.startTime}-${preset.endTime}` ? preset.label : `${preset.label} ${preset.startTime}-${preset.endTime}`} ×
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] p-3 text-xs font-semibold text-[#64748b] sm:grid-cols-[1fr_auto] sm:items-center">
              <span>也可以切换到日历查看，直接点击日期完成排课。</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={goToCalendarSchedulingFromSingle}
                disabled={!singleCourseGroupId || !isSingleTimeValid}
                className="border-[#bfdbfe] bg-[#eaf2ff] text-[#1557c2] hover:bg-[#dbeafe] hover:text-[#0f3f8f]"
              >
                <CalendarDays size={14} /> 前往日历排课
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button type="button" onClick={() => addSingleLesson("scheduled")} disabled={!singleCourseGroupId || !isSingleTimeValid}>
                <CalendarCheck size={16} /> 添加待上课
              </Button>
              <Button type="button" variant="outline" onClick={() => addSingleLesson("completed")} disabled={!singleCourseGroupId || !isSingleTimeValid}>
                <CheckCircle2 size={16} /> 补录已完成
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
            <CardHeader>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                <CalendarCheck size={14} /> 批量排课
              </div>
              <CardTitle>按日期范围生成课时</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2 text-xs font-semibold text-[#64748b]">
                需要逐日选择时，可以切换到日历查看后点击日期排课。
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">课程</label>
                  <Select value={ruleCourseGroupId} onChange={(event) => setRuleCourseGroupId(event.target.value)}>
                    {courseSelectionOptions.map((course) => (
                      <option key={course.id} value={course.id}>{course.name}</option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">开始</label>
                    <Input type="time" value={ruleStartTime} max={ruleEndTime} onChange={(event) => setRuleStartTime(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">结束</label>
                    <Input type="time" value={ruleEndTime} min={ruleStartTime} onChange={(event) => setRuleEndTime(event.target.value)} className={!isBatchTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">日期开始</label>
                    <Input type="date" value={rangeStart} max={rangeEnd} onChange={(event) => setRangeStart(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">日期结束</label>
                    <Input type="date" value={rangeEnd} min={rangeStart} onChange={(event) => setRangeEnd(event.target.value)} className={!isBatchDateRangeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                  </div>
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
                disabled={!ruleCourseGroupId || selectedWeekdays.length === 0 || !isBatchTimeValid || !isBatchDateRangeValid}
                onClick={() => {
                  if (!validateDateRange(rangeStart, rangeEnd) || !validateTimeRange(ruleStartTime, ruleEndTime)) {
                    return;
                  }
                  if (hasBatchConflicts()) {
                    confirm({
                      title: "批量排课中存在时间冲突",
                      description: "系统会跳过已经有课的时间段，只生成没有冲突的课程。",
                      confirmLabel: "跳过冲突并生成",
                      onConfirm: () => onGenerateDrafts(rangeStart, rangeEnd, selectedWeekdays, ruleCourseGroupId, ruleStartTime, ruleEndTime)
                    });
                    return;
                  }
                  onGenerateDrafts(rangeStart, rangeEnd, selectedWeekdays, ruleCourseGroupId, ruleStartTime, ruleEndTime);
                }}
              >
                <CalendarCheck size={16} /> 按日期范围生成待上课
              </Button>
            </CardContent>
        </Card>
      </div>
      )}

      {schedulePanel === "calendar" && (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.45fr_0.75fr] xl:items-stretch">
        <Card className="h-full overflow-hidden">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
                <CalendarDays size={14} /> 日历排课 / 查看
              </div>
              <CardTitle>日历排课</CardTitle>
              <CardDescription>{calendarMode === "schedule" ? "排课模式下，点击日期会添加待上课；课程和时间是新课预设，不作为筛选条件。" : "查看模式：点击日期切换右侧明细。"}</CardDescription>
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
            {calendarMode === "schedule" ? (
              <div className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">排课课程</label>
                    <Select value={calendarCourseGroupId} onChange={(event) => setCalendarCourseGroupId(event.target.value)}>
                      {courseSelectionOptions.map((course) => (
                        <option key={course.id} value={course.id}>{course.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">开始时间</label>
                    <Input type="time" value={calendarStartTime} max={calendarEndTime} onChange={(event) => setCalendarStartTime(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">结束时间</label>
                    <Input type="time" value={calendarEndTime} min={calendarStartTime} onChange={(event) => setCalendarEndTime(event.target.value)} className={!isCalendarTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                  </div>
                </div>
                <div className="rounded-[12px] border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-xs font-bold leading-5 text-[#9a3412]">
                  说明：这里的排课课程、开始时间和结束时间只用于点击日期时生成新课，不会筛选日历或右侧每日课程详情。
                </div>
              </div>
            ) : (
              <div className="space-y-1 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] px-4 py-3 text-sm font-semibold leading-6 text-[#64748b]">
                <div>查看模式只按日期切换右侧“每日课程详情”，不会用课程和时间做筛选。</div>
                <div>需要新增课时请切到“排课”模式；需要筛选记录请切到“课时记录”。</div>
              </div>
            )}
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {visibleWeekdayLabels.map((day) => (
                <div key={day} className="py-2 text-center text-xs font-bold text-(--color-muted-foreground)">{day}</div>
              ))}
              {calendarDates(calendarMonth, weekStartPreference).map((calendarDate) => {
                const dayLessons = vault.lessons.filter((lesson) => lesson.date === calendarDate);
                const amount = dayLessons.reduce((sum, lesson) => sum + lesson.feeSnapshot.amount, 0);
                const isCurrentMonth = calendarDate.startsWith(calendarMonth);
                const hasCancelled = dayLessons.some((lesson) => lesson.status === "cancelled");
                const hasCompleted = dayLessons.some((lesson) => lesson.status === "completed" || lesson.status === "makeup_completed");
                const hasPending = dayLessons.some((lesson) => lesson.status === "scheduled" || lesson.status === "makeup_pending");
                const isAllCompleted = dayLessons.length > 0 && dayLessons.every((lesson) => lesson.status === "completed" || lesson.status === "makeup_completed");
                return (
                  <motion.button
                    key={calendarDate}
                    whileHover={{ scale: 1.04, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setSelectedCalendarDate(calendarDate);
                      if (calendarMode === "schedule") {
                        addLessonFromCourse(calendarCourseGroupId, calendarDate, calendarStartTime, calendarEndTime, "scheduled");
                      }
                    }}
                    disabled={calendarMode === "schedule" && !calendarCourseGroupId}
                    className={`relative flex min-h-[66px] flex-col items-start rounded-[12px] border p-1.5 text-left transition-all duration-200 sm:min-h-[100px] sm:rounded-[14px] sm:p-2.5 ${
                      selectedCalendarDate === calendarDate
                        ? isAllCompleted
                          ? "border-[#86efac] bg-[#f0fdf4] shadow-[0_10px_24px_rgba(22,163,74,0.12)]"
                          : "border-[#ff8617] bg-[#fff7ed] shadow-[0_10px_24px_rgba(255,134,23,0.14)]"
                        : isCurrentMonth
                          ? hasCancelled
                            ? "border-[#fecaca] bg-[#fff1f2] hover:shadow-[0_10px_24px_rgba(127,29,29,0.08)]"
                            : isAllCompleted
                              ? "border-[#bbf7d0] bg-[#f0fdf4] hover:border-[#86efac] hover:shadow-[0_10px_24px_rgba(22,163,74,0.1)]"
                              : "border-[#dbe4ef] bg-white hover:shadow-[0_10px_24px_rgba(15,35,66,0.08)]"
                          : "border-transparent bg-white opacity-40"
                    }`}
                  >
                    <span className={`text-sm font-bold ${selectedCalendarDate === calendarDate ? (isAllCompleted ? "text-[#15803d]" : "text-[#ff8617]") : "text-[#061226]"}`}>
                      {Number(calendarDate.slice(8))}
                    </span>
                    <div className="mt-2 flex gap-1 sm:hidden">
                      {hasCompleted && <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />}
                      {hasCancelled && <span className="h-1.5 w-1.5 rounded-full bg-[#dc2626]" />}
                      {hasPending && <span className="h-1.5 w-1.5 rounded-full bg-[#ff8617]" />}
                    </div>
                    <div className="mt-1.5 hidden flex-wrap gap-1 sm:flex">
                      {hasCompleted && <Badge variant="sage" className="text-[10px] px-1.5 py-0">完成</Badge>}
                      {hasCancelled && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">取消</Badge>}
                      {hasPending && <Badge variant="amber" className="text-[10px] px-1.5 py-0">待确认</Badge>}
                      {amount > 0 && <Badge variant="default" className="px-1.5 py-0 text-[10px]">{formatMoney(amount)}</Badge>}
                    </div>
                    {dayLessons.slice(0, 2).map((lesson) => (
                      <span key={lesson.id} className="mt-0.5 hidden w-full truncate text-[10px] text-(--color-muted-foreground) sm:block">
                        {lesson.startTime} {courseName(vault, lesson.courseGroupId)}
                      </span>
                    ))}
                    {dayLessons.length > 2 && (
                      <span className="hidden text-[10px] text-(--color-muted-foreground) sm:block">+{dayLessons.length - 2} 节</span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex h-full min-h-0 flex-col gap-6">
          <Card className="overflow-hidden">
            <CardHeader>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                <Clock size={14} /> 每日课程详情
              </div>
              <CardTitle>{selectedCalendarDate} 课程</CardTitle>
              <CardDescription>状态与课时记录同步，可从这里选择或删除课程。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "当天课次", value: `${selectedCalendarLessons.length} 节` },
                  { label: "待上/待补", value: `${selectedCalendarPendingCount} 节` },
                  { label: "已完成", value: `${selectedCalendarCompletedCount} 节` },
                  { label: "当天金额", value: formatMoney(selectedCalendarAmount) },
                  { label: "已取消", value: `${selectedCalendarCancelledCount} 节` }
                ].map((item) => (
                  <div key={item.label} className="rounded-[10px] border border-[#e8eef6] bg-[#f8fbff] px-3 py-2">
                    <div className="text-[11px] font-semibold text-[#64748b]">{item.label}</div>
                    <div className="mt-0.5 break-words text-sm font-extrabold text-[#061226]">{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
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
              </div>
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <CardHeader>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
                <RotateCcw size={14} /> 补课跟进
              </div>
              <CardTitle>需要补课的学生</CardTitle>
              <CardDescription>按原课日期筛选缺课记录，补课会排到当前日历选中的日期。</CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <label className="text-sm font-medium">原课日期</label>
                  <Input type="date" value={makeupOriginalDateFilter} onChange={(event) => setMakeupOriginalDateFilter(event.target.value)} />
                </div>
                <Button type="button" variant="outline" className="self-end" onClick={() => setMakeupOriginalDateFilter("")} disabled={!makeupOriginalDateFilter}>
                  全部
                </Button>
              </div>
              <div className="rounded-[10px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2 text-xs font-bold text-[#25324a]">
                补课安排日期：{selectedCalendarDate}
              </div>
              {makeupEntries.map(({ lesson, entry }) => (
                <div key={`${lesson.id}-${entry.studentId}`} className="rounded-[14px] border border-[#fed7aa] bg-[#fff7ed] p-3">
                  <div className="flex flex-col gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold text-[#061226]">{findStudent(vault, entry.studentId)?.name ?? "未知学生"}</div>
                      <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
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
              {makeupEntries.length === 0 && (
                <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-5 text-center text-sm font-semibold text-[#64748b]">
                  {makeupOriginalDateFilter ? "这个原课日期暂无待补课学生" : "暂无待补课学生"}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      )}

      {schedulePanel === "studentStats" && (
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                <UserCheck size={14} /> 学生课次统计
              </div>
              <CardTitle>按学生查看课程数量</CardTitle>
              <CardDescription>学生、课程、科目、校区、日期、时间和状态会同时生效，筛选结果为合并条件后的交集。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="relative block">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                  <Input
                    className="pl-9"
                    value={studentStatsNameFilter}
                    onChange={(event) => setStudentStatsNameFilter(event.target.value)}
                    placeholder="筛选学生姓名"
                  />
                </label>
                <Select value={studentStatsCourseFilter} onChange={(event) => setStudentStatsCourseFilter(event.target.value)}>
                  <option value="all">全部课程</option>
                  {vault.courseGroups.map((course) => (
                    <option key={course.id} value={course.id}>{course.name}</option>
                  ))}
                </Select>
                <Select value={studentStatsSubjectFilter} onChange={(event) => setStudentStatsSubjectFilter(event.target.value)}>
                  <option value="all">全部科目</option>
                  {studentStatsSubjects.map((subject) => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </Select>
                <Select value={studentStatsCampusFilter} onChange={(event) => setStudentStatsCampusFilter(event.target.value)}>
                  <option value="all">全部校区</option>
                  {vault.campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>{campus.name}</option>
                  ))}
                </Select>
                <div className="space-y-2">
                  <label className="text-sm font-medium">开始日期</label>
                  <Input
                    type="date"
                    value={studentStatsDateStart}
                    onChange={(event) => setStudentStatsDateStart(event.target.value)}
                    className={!isStudentStatsDateRangeValid(studentStatsDateStart, studentStatsDateEnd) ? "border-[#fca5a5] bg-[#fff1f2]" : undefined}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">结束日期</label>
                  <Input
                    type="date"
                    value={studentStatsDateEnd}
                    min={studentStatsDateStart}
                    onChange={(event) => setStudentStatsDateEnd(event.target.value)}
                    className={!isStudentStatsDateRangeValid(studentStatsDateStart, studentStatsDateEnd) ? "border-[#fca5a5] bg-[#fff1f2]" : undefined}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">开始时间</label>
                  <Input
                    type="time"
                    value={studentStatsStartTime}
                    max={studentStatsEndTime || undefined}
                    onChange={(event) => setStudentStatsStartTime(event.target.value)}
                    className={!isStudentStatsTimeRangeValid(studentStatsStartTime, studentStatsEndTime) ? "border-[#fca5a5] bg-[#fff1f2]" : undefined}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">结束时间</label>
                  <Input
                    type="time"
                    value={studentStatsEndTime}
                    min={studentStatsStartTime || undefined}
                    onChange={(event) => setStudentStatsEndTime(event.target.value)}
                    className={!isStudentStatsTimeRangeValid(studentStatsStartTime, studentStatsEndTime) ? "border-[#fca5a5] bg-[#fff1f2]" : undefined}
                  />
                </div>
                <div className="space-y-2 md:col-span-2 xl:col-span-1">
                  <label className="text-sm font-medium">上课状态</label>
                  <Select value={studentStatsStatusFilter} onChange={(event) => setStudentStatsStatusFilter(event.target.value as "all" | Lesson["status"])}>
                    <option value="all">全部状态</option>
                    {Object.entries(lessonStatusLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: "筛选后课次", value: `${studentStatsLessons.length} 节` },
                  { label: "涉及学生", value: `${studentStatsRows.length} 人` },
                  { label: "已完成", value: `${studentStatsCompletedCount} 节` },
                  { label: "课时合计", value: `${studentStatsTotalHours.toFixed(1)} 小时` }
                ].map((item) => (
                  <div key={item.label} className="rounded-[12px] border border-[#e8eef6] bg-[#f8fbff] p-3">
                    <div className="text-xs font-semibold text-[#64748b]">{item.label}</div>
                    <div className="mt-1 break-words text-base font-extrabold text-[#061226]">{item.value}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>学生课程数量</CardTitle>
                <CardDescription className="mt-1">同一节班课会分别计入每个关联学生的课次数。</CardDescription>
              </div>
              <Badge variant="secondary" className="w-fit">{studentStatsRows.length} 人</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {studentStatsRows.map((row, index) => (
                <motion.div
                  key={row.studentId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eaf2ff] text-sm font-extrabold text-[#1557c2]">
                          {row.studentName.slice(0, 1)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-base font-extrabold text-[#061226]">{row.studentName}</div>
                          <div className="mt-1 text-xs font-semibold text-[#64748b]">
                            {row.courseNames.length > 0 ? row.courseNames.join("、") : "未关联课程名"}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:min-w-[520px]">
                      {[
                        { label: "总课次", value: `${row.total} 节` },
                        { label: "已完成", value: `${row.completed} 节` },
                        { label: "待上/待补", value: `${row.pending} 节` },
                        { label: "已取消", value: `${row.cancelled} 节` },
                        { label: "课时", value: `${row.hours.toFixed(1)} 小时` }
                      ].map((item) => (
                        <div key={item.label} className="rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2">
                          <div className="text-[11px] font-semibold text-[#64748b]">{item.label}</div>
                          <div className="mt-1 text-sm font-extrabold text-[#061226]">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
              {studentStatsRows.length === 0 && (
                <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
                  没有符合当前筛选条件的学生课次
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {schedulePanel === "records" && (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
        <Card className="h-fit overflow-hidden">
          <CardHeader>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
              <Clock size={14} /> 课程记录
            </div>
            <CardTitle>课时列表</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pb-4">
            <label className="flex items-center gap-3 rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2 text-sm font-bold text-[#25324a]">
              <input
                type="checkbox"
                checked={syncRecordsWithCalendarDate}
                onChange={(event) => setSyncRecordsWithCalendarDate(event.target.checked)}
                className="h-4 w-4 accent-[#ff8617]"
              />
              同步日历查看日期（{selectedCalendarDate}）
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">查看范围</label>
                <Select value={syncRecordsWithCalendarDate ? "day" : lessonScope} onChange={(event) => setLessonScope(event.target.value as LessonScope)} disabled={syncRecordsWithCalendarDate}>
                  <option value="month">按月查看</option>
                  <option value="day">按日查看</option>
                  <option value="range">按日期范围</option>
                  <option value="week">按周查看</option>
                </Select>
              </div>
              {effectiveLessonScope === "month" ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">月份</label>
                  <Input type="month" value={lessonMonth} onChange={(event) => setLessonMonth(event.target.value)} className="min-w-0 text-sm" />
                </div>
              ) : effectiveLessonScope === "day" ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">日期</label>
                  <Input
                    type="date"
                    value={effectiveLessonDay}
                    onChange={(event) => setLessonDay(event.target.value)}
                    disabled={syncRecordsWithCalendarDate}
                    className="min-w-0 text-sm"
                  />
                </div>
              ) : effectiveLessonScope === "range" ? (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">开始日期</label>
                    <Input type="date" value={lessonRangeStart} onChange={(event) => setLessonRangeStart(event.target.value)} className="min-w-0 text-sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">结束日期</label>
                    <Input type="date" value={lessonRangeEnd} min={lessonRangeStart} onChange={(event) => setLessonRangeEnd(event.target.value)} className={!isOrderedDateRange(lessonRangeStart, lessonRangeEnd) ? "min-w-0 border-[#fca5a5] bg-[#fff1f2] text-sm" : "min-w-0 text-sm"} />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">周</label>
                  <Input type="week" value={lessonWeek} onChange={(event) => setLessonWeek(event.target.value)} className="min-w-0 text-sm" />
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
                  <option value="full_time">全日制</option>
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
                      ? "border-[#93c5fd] bg-[#eaf2ff] shadow-[0_10px_24px_rgba(21,87,194,0.12)]"
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
              <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-[#e8eef6] bg-white">
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
                      <Input
                        type="time"
                        value={selected.startTime}
                        max={selected.endTime}
                        onChange={(event) => {
                          const nextStart = event.target.value;
                          if (!validateTimeRange(nextStart, selected.endTime)) return;
                          updateSelected({ startTime: nextStart }, true);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">结束</label>
                      <Input
                        type="time"
                        value={selected.endTime}
                        min={selected.startTime}
                        onChange={(event) => {
                          const nextEnd = event.target.value;
                          if (!validateTimeRange(selected.startTime, nextEnd)) return;
                          updateSelected({ endTime: nextEnd }, true);
                        }}
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
                  {selected.type === "class" && (
                    <div className="rounded-[14px] border border-[#c7d2fe] bg-[#eef0ff] p-3">
                      <div className="mb-3 text-sm font-extrabold text-[#25324a]">班课试听统计</div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-[#64748b]">试听人数</label>
                          <Input
                            type="number"
                            min={0}
                            value={selected.trialStudentCount ?? 0}
                            onChange={(event) => updateTrialStats({ trialStudentCount: Math.max(Number(event.target.value), 0) })}
                            className="bg-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-[#64748b]">试听费用</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-extrabold text-[#64748b]">¥</span>
                            <Input
                              type="number"
                              min={0}
                              value={selected.trialFee ?? 0}
                              onChange={(event) => updateTrialStats({ trialFee: Math.max(Number(event.target.value), 0) })}
                              className="bg-white pl-10"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <label className="relative block">
                      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                      <Input
                        className="h-10 pl-9"
                        value={temporaryStudentSearch}
                        onChange={(event) => setTemporaryStudentSearch(event.target.value)}
                        placeholder="搜索临时加入学生"
                      />
                    </label>
                    <Select value={temporaryStudentId} onChange={(event) => setTemporaryStudentId(event.target.value)}>
                      <option value="">选择临时加入学生</option>
                      {displayedTemporaryStudentOptions.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.name}{student.grade ? ` · ${student.grade}` : ""}{student.temporaryTrial ? "（试听档案）" : ""}
                        </option>
                      ))}
                    </Select>
                    <Button type="button" variant="outline" onClick={addTemporaryStudent} disabled={!temporaryStudentId || selected.expectedStudentIds.includes(temporaryStudentId)}>
                      <UserPlus size={15} /> 添加临时学生
                    </Button>
                  </div>
                  <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm font-extrabold text-[#061226]">关联学生</div>
                      <Badge variant="secondary">{selectedAttendanceEntries.length} / {selected.attendance.length} 人</Badge>
                    </div>
                    <label className="relative mt-3 block">
                      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                      <Input
                        className="h-10 bg-white pl-9"
                        value={attendanceStudentFilter}
                        onChange={(event) => setAttendanceStudentFilter(event.target.value)}
                        placeholder="搜索姓名、年级、学校或到课状态"
                      />
                    </label>
                    <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                      {selectedAttendanceEntries.map((entry) => {
                        const student = findStudent(vault, entry.studentId);
                        const isTemporary = entry.temporary || student?.temporaryTrial || !selectedCourse?.studentIds.includes(entry.studentId);
                        return (
                          <motion.div
                            key={entry.studentId}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className={`rounded-[14px] border p-3 ${attendanceSurfaceClass(entry.status, isTemporary)}`}
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex min-w-0 items-center gap-2">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fff1e2]">
                                  <span className="text-xs font-bold text-[#ff8617]">{(student?.name ?? "未知").slice(0, 1)}</span>
                                </div>
                                <span className="truncate text-sm font-medium">{student?.name ?? "未知学生"}</span>
                                {isTemporary && <Badge variant="plum" className="shrink-0">临时加入</Badge>}
                              </div>
                              <div className="flex items-center gap-2">
                                <Select value={entry.status} onChange={(event) => updateAttendance(entry.studentId, event.target.value as AttendanceStatus)} className="h-9 max-w-[136px]">
                                  {Object.entries(attendanceLabels).map(([key, value]) => (
                                    <option key={key} value={key}>{value}</option>
                                  ))}
                                </Select>
                                {isTemporary && (
                                  <Button type="button" size="sm" variant="destructive" onClick={() => askRemoveTemporaryStudent(entry.studentId)}>
                                    <Trash2 size={13} />
                                  </Button>
                                )}
                              </div>
                            </div>
                            {isTemporary && (
                              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_160px]">
                                <div className="rounded-[10px] bg-white/70 px-3 py-2 text-xs font-semibold text-[#5161d6]">
                                  临时加入费用会在正常排课费用基础上额外相加。
                                </div>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-extrabold text-[#64748b]">¥</span>
                                  <Input
                                    type="number"
                                    value={entry.temporaryFee ?? 0}
                                    onChange={(event) => updateTemporaryFee(entry.studentId, Number(event.target.value))}
                                    className="bg-white pl-10"
                                    placeholder="临时费用"
                                  />
                                </div>
                              </div>
                            )}
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
                      {selectedAttendanceEntries.length === 0 && (
                        <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-white p-5 text-center text-sm font-semibold text-[#64748b]">
                          没有符合条件的关联学生
                        </div>
                      )}
                    </div>
                  </div>
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
      )}
    </div>
  );
}

function offsetDate(offset: number): string {
  return addDays(todayIso(), offset);
}

function isoWeekValue(dateIso: string): string {
  const date = parseDateOnlyUtc(dateIso);
  const day = date.getUTCDay() || 7;
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - day);
  const year = thursday.getUTCFullYear();
  const firstThursday = parseDateOnlyUtc(`${year}-01-04`);
  const firstDay = firstThursday.getUTCDay() || 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 4 - firstDay);
  const week = Math.floor((thursday.getTime() - firstThursday.getTime()) / 604_800_000) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function datesForIsoWeekValue(value: string): string[] {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) return [];
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = parseDateOnlyUtc(`${year}-01-04`);
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    return formatDateIso(date);
  });
}

function datesBetweenLocal(startDate: string, endDate: string): string[] {
  const start = parseDateOnlyUtc(startDate);
  const end = parseDateOnlyUtc(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(formatDateIso(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function parseDateOnlyUtc(dateIso: string): Date {
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}

function isOrderedTimeRange(startTime: string, endTime: string): boolean {
  if (!startTime || !endTime) return false;
  return timeToMinutes(startTime) < timeToMinutes(endTime);
}

function isOrderedDateRange(startDate: string, endDate: string): boolean {
  return Boolean(startDate && endDate && startDate <= endDate);
}

function isCompletedLessonStatus(status: string): boolean {
  return status === "completed" || status === "makeup_completed";
}

function isPendingLessonStatus(status: string): boolean {
  return status === "draft" || status === "scheduled" || status === "makeup_pending";
}

function isStudentStatsDateRangeValid(startDate: string, endDate: string): boolean {
  return !startDate || !endDate || startDate <= endDate;
}

function isStudentStatsTimeRangeValid(startTime: string, endTime: string): boolean {
  return !startTime || !endTime || timeToMinutes(startTime) <= timeToMinutes(endTime);
}

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function lessonStudentIds(lesson: Lesson): string[] {
  return Array.from(new Set([
    ...lesson.expectedStudentIds,
    ...lesson.attendance.map((entry) => entry.studentId)
  ]));
}

function buildStudentStatsRows(vault: TeacherVault, lessons: Lesson[], normalizedNameFilter: string) {
  const rows = new Map<string, {
    studentId: string;
    studentName: string;
    total: number;
    completed: number;
    pending: number;
    cancelled: number;
    hours: number;
    courseNames: string[];
  }>();

  lessons.forEach((lesson) => {
    const hours = lesson.feeSnapshot.hours ?? hoursBetween(lesson.startTime, lesson.endTime);
    lessonStudentIds(lesson).forEach((studentId) => {
      const student = findStudent(vault, studentId);
      const studentName = student?.name ?? "未知学生";
      if (normalizedNameFilter && !studentName.toLowerCase().includes(normalizedNameFilter)) return;
      const current = rows.get(studentId) ?? {
        studentId,
        studentName,
        total: 0,
        completed: 0,
        pending: 0,
        cancelled: 0,
        hours: 0,
        courseNames: []
      };

      current.total += 1;
      current.hours += hours;
      if (isCompletedLessonStatus(lesson.status)) {
        current.completed += 1;
      } else if (isPendingLessonStatus(lesson.status)) {
        current.pending += 1;
      } else if (lesson.status === "cancelled") {
        current.cancelled += 1;
      }

      const name = courseName(vault, lesson.courseGroupId);
      if (!current.courseNames.includes(name)) {
        current.courseNames.push(name);
      }
      rows.set(studentId, current);
    });
  });

  return [...rows.values()].sort((a, b) => b.total - a.total || a.studentName.localeCompare(b.studentName, "zh-Hans-CN"));
}

function attendanceSurfaceClass(status: AttendanceStatus, isTemporary: boolean): string {
  if (status === "leave_requested" || status === "makeup_pending") {
    return "border-[#fed7aa] bg-[#fff7ed]";
  }
  if (status === "absent" || status === "cancelled") {
    return "border-[#fecaca] bg-[#fff1f2]";
  }
  if (isTemporary) {
    return "border-[#c7d2fe] bg-[#eef0ff]";
  }
  return "border-[#dbe4ef] bg-[#f8fbff]";
}
