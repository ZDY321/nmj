import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Search, Table2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { CourseGroup, Lesson, TeacherVault, WeekStart } from "@/shared/types";
import {
  addDays,
  calendarDates,
  compareByName,
  courseName,
  courseTypeLabel,
  campusName,
  formatPrivateMoney,
  courseSubject,
  findStudent,
  lessonAttendanceNoteText,
  lessonStatusLabels,
  lessonStatusSurfaceClass,
  lessonStatusVariant,
  lessonCampusId,
  lessonStudentDisplay,
  lessonStudentIds,
  lessonTimeRangeLabel,
  makeupNeededStudentIds,
  monthShift,
  orderedWeekdayLabels,
  shortWeekdayLabels,
  sortLessons,
  sortCampusesForProfile,
  studentNames,
  subjectOptionsForVault,
  weekDatesFor,
  weekStartsOn,
  weekdayLabels as fullWeekdayLabels,
  weekdayOfDateIso
} from "@/frontend/lib/helpers";
import { MetricCard } from "@/frontend/components/MetricCard";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { buildFeeSnapshot, getCourse, todayIso } from "@/frontend/lib/calculations";
import { attendanceStatusForLessonStatus } from "@/frontend/lib/scheduleViewHelpers";
import { timeToMinutes } from "@/frontend/lib/time";

type CalendarOverviewPage = "month" | "week";
type WeekTimeRow = {
  key: string;
  label: string;
  rangeLabel: string;
  sortMinute: number;
  lessons: Lesson[];
};
type CalendarOverviewFocusState = {
  selectedDate: string;
  month: string;
  overviewPage: CalendarOverviewPage;
  weekCampusFilter: string;
  weekGradeFilter: string;
  weekSubjectFilter: string;
  weekStudentFilter: string;
};
type CalendarOverviewFocusRequest = CalendarOverviewFocusState & { nonce: number };

function dateWithWeekday(date: string): string {
  return `${date} · ${fullWeekdayLabels[weekdayOfDateIso(date)]}`;
}

function formatTimeFromMinutes(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function buildCompactWeekTimeRows(lessons: Lesson[]): WeekTimeRow[] {
  const rows = new Map<string, WeekTimeRow & { minStart: number; maxEnd: number }>();

  lessons.forEach((lesson) => {
    const startMinute = timeToMinutes(lesson.startTime);
    const endMinute = timeToMinutes(lesson.endTime);
    const hasStart = Number.isFinite(startMinute);
    const bucketStart = hasStart ? Math.floor(startMinute / 60) * 60 : Number.POSITIVE_INFINITY;
    const key = hasStart ? String(bucketStart) : `unknown-${lesson.startTime || "empty"}`;
    const existing = rows.get(key);

    if (existing) {
      existing.lessons.push(lesson);
      if (hasStart) existing.minStart = Math.min(existing.minStart, startMinute);
      if (Number.isFinite(endMinute)) existing.maxEnd = Math.max(existing.maxEnd, endMinute);
      return;
    }

    rows.set(key, {
      key,
      label: hasStart ? `${formatTimeFromMinutes(bucketStart)} 时段` : "时间未设置",
      rangeLabel: "",
      sortMinute: bucketStart,
      minStart: hasStart ? startMinute : Number.POSITIVE_INFINITY,
      maxEnd: Number.isFinite(endMinute) ? endMinute : Number.NEGATIVE_INFINITY,
      lessons: [lesson]
    });
  });

  return Array.from(rows.values())
    .sort((a, b) => a.sortMinute - b.sortMinute || a.key.localeCompare(b.key))
    .map((row) => ({
      key: row.key,
      label: row.label,
      rangeLabel:
        Number.isFinite(row.minStart) && Number.isFinite(row.maxEnd)
          ? `${formatTimeFromMinutes(row.minStart)}-${formatTimeFromMinutes(row.maxEnd)}`
          : "查看课程卡片时间",
      sortMinute: row.sortMinute,
      lessons: row.lessons
    }));
}

export function CalendarView({
  vault,
  amountsVisible,
  onUpdateLessons,
  onWeekStartChange,
  onOpenLessonInRecords,
  focusRequest
}: {
  vault: TeacherVault;
  amountsVisible: boolean;
  onUpdateLessons: (lessons: Lesson[]) => void;
  onWeekStartChange: (weekStart: WeekStart) => void;
  onOpenLessonInRecords?: (lesson: Lesson, returnFocus: CalendarOverviewFocusState) => void;
  focusRequest?: CalendarOverviewFocusRequest | null;
}) {
  const [month, setMonth] = useState(() => focusRequest?.month ?? todayIso().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(() => focusRequest?.selectedDate ?? todayIso());
  const [overviewPage, setOverviewPage] = useState<CalendarOverviewPage>(() => focusRequest?.overviewPage ?? "month");
  const [weekCampusFilter, setWeekCampusFilter] = useState(() => focusRequest?.weekCampusFilter ?? "all");
  const [weekGradeFilter, setWeekGradeFilter] = useState(() => focusRequest?.weekGradeFilter ?? "all");
  const [weekSubjectFilter, setWeekSubjectFilter] = useState(() => focusRequest?.weekSubjectFilter ?? "all");
  const [weekStudentFilter, setWeekStudentFilter] = useState(() => focusRequest?.weekStudentFilter ?? "");
  const [refreshMessage, setRefreshMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const { confirm, dialog } = useConfirmDialog();
  const weekStartPreference = weekStartsOn(vault);
  const campusOptions = sortCampusesForProfile(vault.campuses, vault.profile.homeCampusId);
  const gradeOptions = Array.from(
    new Set(vault.students.map((student) => student.grade?.trim()).filter((grade): grade is string => Boolean(grade)))
  ).sort(compareByName);
  const subjectOptions = subjectOptionsForVault(vault);
  const days = calendarDates(month, weekStartPreference);
  const visibleLessons = vault.lessons;
  const normalizedWeekStudentFilter = weekStudentFilter.trim().toLowerCase();
  const filteredVisibleLessons = visibleLessons.filter((lesson) => matchesCalendarLessonFilter(lesson));

  const selectedLessons = filteredVisibleLessons.filter((l) => l.date === selectedDate).sort(sortLessons);
  const selectedDateAllLessons = visibleLessons.filter((l) => l.date === selectedDate).sort(sortLessons);
  const selectedDateRefreshableLessons = selectedDateAllLessons.filter((lesson) => Boolean(getCourse(vault, lesson.courseGroupId)));
  const weekDates = weekDatesFor(selectedDate, weekStartPreference);
  const weekLessons = filteredVisibleLessons.filter((l) => weekDates.includes(l.date)).sort(sortLessons);
  const monthLessons = filteredVisibleLessons.filter((l) => l.date.startsWith(month));
  const selectedTotal = selectedLessons.reduce((s, l) => s + l.feeSnapshot.amount, 0);
  const weekTotal = weekLessons.reduce((s, l) => s + l.feeSnapshot.amount, 0);
  const monthTotal = monthLessons.reduce((s, l) => s + l.feeSnapshot.amount, 0);

  const weekdayLabels = orderedWeekdayLabels(weekStartPreference, shortWeekdayLabels);
  const weekRangeLabel = `${weekDates[0].slice(5)} - ${weekDates[6].slice(5)}`;
  const weekTimeRows = buildCompactWeekTimeRows(weekLessons);
  const activeMakeupLessonsByOriginal = visibleLessons
    .filter((lesson) => Boolean(lesson.linkedOriginalLessonId) && lesson.status !== "cancelled")
    .reduce<Record<string, Lesson[]>>((groups, lesson) => {
      const originalId = lesson.linkedOriginalLessonId;
      if (!originalId) return groups;
      groups[originalId] = [...(groups[originalId] ?? []), lesson];
      return groups;
    }, {});

  useEffect(() => {
    if (!focusRequest) return;
    setSelectedDate(focusRequest.selectedDate);
    setMonth(focusRequest.month);
    setOverviewPage(focusRequest.overviewPage);
    setWeekCampusFilter(focusRequest.weekCampusFilter);
    setWeekGradeFilter(focusRequest.weekGradeFilter);
    setWeekSubjectFilter(focusRequest.weekSubjectFilter);
    setWeekStudentFilter(focusRequest.weekStudentFilter);
  }, [focusRequest?.nonce]);

  function selectCalendarDate(date: string) {
    setSelectedDate(date);
    setMonth(date.slice(0, 7));
  }

  function buildReturnFocus(overrides: Partial<CalendarOverviewFocusState> = {}): CalendarOverviewFocusState {
    return {
      selectedDate,
      month,
      overviewPage,
      weekCampusFilter,
      weekGradeFilter,
      weekSubjectFilter,
      weekStudentFilter,
      ...overrides
    };
  }

  function shiftSelectedWeek(days: number) {
    selectCalendarDate(addDays(selectedDate, days));
  }

  function attendanceFromCurrentCourse(lesson: Lesson, course: CourseGroup): Lesson["attendance"] {
    const existingByStudent = new Map(lesson.attendance.map((entry) => [entry.studentId, entry]));
    const fallbackStatus = attendanceStatusForLessonStatus(lesson.status);
    return course.studentIds.map((studentId) => {
      const existing = existingByStudent.get(studentId);
      if (existing) {
        return {
          ...existing,
          trial: existing.trial ?? Boolean(vault.students.find((student) => student.id === studentId)?.temporaryTrial)
        };
      }
      return {
        studentId,
        status: fallbackStatus,
        trial: Boolean(vault.students.find((student) => student.id === studentId)?.temporaryTrial)
      };
    });
  }

  function refreshLessonFromCurrentCourse(lesson: Lesson): Lesson | null {
    const course = getCourse(vault, lesson.courseGroupId);
    if (!course) return null;
    const refreshedLesson: Lesson = {
      ...lesson,
      campusId: course.defaultCampusId,
      type: course.type,
      expectedStudentIds: [...course.studentIds],
      attendance: attendanceFromCurrentCourse(lesson, course),
      trialStudentCount: course.type === "class" ? lesson.trialStudentCount ?? 0 : 0,
      trialFee: course.type === "class" ? lesson.trialFee ?? 0 : 0
    };
    return {
      ...refreshedLesson,
      feeSnapshot: buildFeeSnapshot(vault, course, refreshedLesson)
    };
  }

  function showRefreshMessage(text: string, tone: "success" | "error") {
    setRefreshMessage({ text, tone });
    window.setTimeout(() => {
      setRefreshMessage((current) => current?.text === text ? null : current);
    }, 3200);
  }

  function refreshSelectedDateLessons() {
    if (selectedDateAllLessons.length === 0) {
      showRefreshMessage("选中日期没有课节，不需要刷新。", "error");
      return;
    }
    if (selectedDateRefreshableLessons.length === 0) {
      showRefreshMessage("选中日期的课节都缺少课程档案，无法按课程档案刷新。", "error");
      return;
    }
    const missingCourseCount = selectedDateAllLessons.length - selectedDateRefreshableLessons.length;
    confirm({
      title: `刷新 ${dateWithWeekday(selectedDate)} 的课节？`,
      description: `会按当前课程档案刷新当天 ${selectedDateRefreshableLessons.length} 节课的班型、校区、学生名单和金额快照，包含已完成历史课节；课程内容、作业、备注会保留，同一学生原有出勤状态和备注会保留。${missingCourseCount > 0 ? `另有 ${missingCourseCount} 节课缺少课程档案，会自动跳过。` : ""}`,
      confirmLabel: "刷新当天课节",
      onConfirm: () => {
        const refreshedLessons = selectedDateRefreshableLessons
          .map((lesson) => refreshLessonFromCurrentCourse(lesson))
          .filter((lesson): lesson is Lesson => Boolean(lesson));
        onUpdateLessons(refreshedLessons);
        showRefreshMessage(`已刷新 ${dateWithWeekday(selectedDate)} 的 ${refreshedLessons.length} 节课。`, "success");
      }
    });
  }

  function matchesCalendarLessonFilter(lesson: Lesson): boolean {
    const course = vault.courseGroups.find((item) => item.id === lesson.courseGroupId);
    const campusId = lessonCampusId(vault, lesson);
    const studentIds = lessonStudentIds(lesson);
    const searchable = [
      courseName(vault, lesson.courseGroupId),
      courseSubject(vault, lesson.courseGroupId),
      campusName(vault, campusId),
      studentNames(vault, studentIds),
      lesson.note ?? "",
      lessonAttendanceNoteText(vault, lesson),
      ...studentIds.map((studentId) => {
        const student = findStudent(vault, studentId);
        return [student?.name ?? "", student?.grade ?? "", student?.note ?? ""].join(" ");
      })
    ]
      .join(" ")
      .toLowerCase();
    const matchesCampus = weekCampusFilter === "all" || campusId === weekCampusFilter;
    const matchesSubject = weekSubjectFilter === "all" || course?.subject === weekSubjectFilter;
    const matchesGrade =
      weekGradeFilter === "all" ||
      studentIds.some((studentId) => findStudent(vault, studentId)?.grade?.trim() === weekGradeFilter);
    const matchesStudent =
      !normalizedWeekStudentFilter || normalizedWeekStudentFilter.split(/\s+/).filter(Boolean).every((term) => searchable.includes(term));
    return matchesCampus && matchesSubject && matchesGrade && matchesStudent;
  }

  function makeupMarkerForLesson(lesson: Lesson): string | null {
    if (lesson.linkedOriginalLessonId) return "补课";
    const linkedMakeupLessons = activeMakeupLessonsByOriginal[lesson.id] ?? [];
    const completedMakeupCount = linkedMakeupLessons.filter((item) => item.status === "completed" || item.status === "makeup_completed").length;
    if (completedMakeupCount > 0 && lesson.attendance.some((entry) => entry.status === "makeup_completed")) {
      return completedMakeupCount === linkedMakeupLessons.length ? "已补课" : "部分已补";
    }
    if (linkedMakeupLessons.length > 0) return "已安排补课";
    if (lesson.status === "makeup_completed" || lesson.attendance.some((entry) => entry.status === "makeup_completed")) return "已补课";
    if (makeupNeededStudentIds(lesson).length > 0 || (lesson.status === "makeup_pending" && lesson.attendance.length === 0)) return "待补课";
    return null;
  }

  return (
    <div className="space-y-6">
      {dialog}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="选中日期" value={`${selectedLessons.length} 节`} hint={formatPrivateMoney(selectedTotal, amountsVisible)} variant={1} index={0} showSparkline={false} />
        <MetricCard label="本周课程" value={`${weekLessons.length} 节`} hint={formatPrivateMoney(weekTotal, amountsVisible)} variant={2} index={1} showSparkline={false} />
        <MetricCard label="本月课程" value={`${monthLessons.length} 节`} hint={formatPrivateMoney(monthTotal, amountsVisible)} variant={3} index={2} showSparkline={false} />
        <MetricCard
          label="待处理"
          value={`${monthLessons.filter((l) => l.status === "makeup_pending" || l.status === "scheduled").length}`}
          hint="待上课 / 待补课"
          variant={4}
          index={3}
          showSparkline={false}
        />
      </div>
      {refreshMessage && (
        <div className={`rounded-[12px] border px-4 py-3 text-sm font-extrabold ${
          refreshMessage.tone === "success"
            ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]"
            : "border-[#fecaca] bg-[#fff1f2] text-[#b91c1c]"
        }`}>
          {refreshMessage.text}
        </div>
      )}

      <div className={overviewPage === "month" ? "grid grid-cols-1 gap-6 xl:grid-cols-[1.45fr_0.75fr]" : "grid grid-cols-1 gap-6"}>
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[#ff8617] text-xs font-bold uppercase tracking-widest mb-1">
                <CalendarDays size={14} /> 日历总览
              </div>
              <CardTitle>{overviewPage === "month" ? month : weekRangeLabel}</CardTitle>
              <CardDescription>
                {overviewPage === "month"
                  ? "当前月历保留为第一页，可按日期查看每日明细。"
                  : "周课表按日期和时间展开课程，方便一次看清这一周的上课情况。"}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <div className="grid grid-cols-2 rounded-[12px] border border-[#dbe4ef] bg-white p-1">
                <button
                  type="button"
                  onClick={() => setOverviewPage("month")}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-[9px] px-3 py-2 text-xs font-bold ${
                    overviewPage === "month" ? "orange-gradient text-white" : "text-[#25324a]"
                  }`}
                >
                  <CalendarDays size={14} /> 月历
                </button>
                <button
                  type="button"
                  onClick={() => setOverviewPage("week")}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-[9px] px-3 py-2 text-xs font-bold ${
                    overviewPage === "week" ? "bg-[#1557c2] text-white" : "text-[#25324a]"
                  }`}
                >
                  <Table2 size={14} /> 周课表
                </button>
              </div>
              <Select
                value={String(weekStartPreference)}
                onChange={(event) => onWeekStartChange(Number(event.target.value) as WeekStart)}
                className="h-10 w-[132px]"
                aria-label="选择一周开始日期"
              >
                <option value="0">周日开始</option>
                <option value="1">周一开始</option>
              </Select>
              <Button
                type="button"
                variant="outline"
                className="h-10 bg-white"
                onClick={refreshSelectedDateLessons}
                disabled={selectedDateRefreshableLessons.length === 0}
                title="按当前课程档案刷新选中日期的全部课节，包含已完成历史课节"
              >
                <RefreshCw size={15} /> 刷新当天课节
              </Button>
              <button
                type="button"
                onClick={() => {
                  if (overviewPage === "month") {
                    setMonth((m) => monthShift(m, -1));
                  } else {
                    shiftSelectedWeek(-7);
                  }
                }}
                className="p-2 rounded-[10px] hover:bg-[#f3f7fb] transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="font-bold min-w-[80px] text-center">{overviewPage === "month" ? month : weekRangeLabel}</span>
              <button
                type="button"
                onClick={() => {
                  if (overviewPage === "month") {
                    setMonth((m) => monthShift(m, 1));
                  } else {
                    shiftSelectedWeek(7);
                  }
                }}
                className="p-2 rounded-[10px] hover:bg-[#f3f7fb] transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6">
            <div className="mb-4 grid grid-cols-1 gap-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3 md:grid-cols-2 xl:grid-cols-[minmax(130px,0.75fr)_minmax(130px,0.75fr)_minmax(130px,0.75fr)_minmax(220px,1.4fr)_auto] xl:items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium">校区</label>
                <Select value={weekCampusFilter} onChange={(event) => setWeekCampusFilter(event.target.value)} className="h-10 bg-white">
                  <option value="all">全部校区</option>
                  {campusOptions.map((campus) => (
                    <option key={campus.id} value={campus.id}>{campus.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">年级</label>
                <Select value={weekGradeFilter} onChange={(event) => setWeekGradeFilter(event.target.value)} className="h-10 bg-white">
                  <option value="all">全部年级</option>
                  {gradeOptions.map((grade) => (
                    <option key={grade} value={grade}>{grade}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">科目</label>
                <Select value={weekSubjectFilter} onChange={(event) => setWeekSubjectFilter(event.target.value)} className="h-10 bg-white">
                  <option value="all">全部科目</option>
                  {subjectOptions.map((subject) => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">搜索筛选</label>
                <label className="relative block">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                  <Input
                    value={weekStudentFilter}
                    onChange={(event) => setWeekStudentFilter(event.target.value)}
                    placeholder="搜索学生、课程、校区或备注"
                    className="h-10 bg-white pl-9"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => {
                  setWeekCampusFilter("all");
                  setWeekGradeFilter("all");
                  setWeekSubjectFilter("all");
                  setWeekStudentFilter("");
                }}
                disabled={weekCampusFilter === "all" && weekGradeFilter === "all" && weekSubjectFilter === "all" && !weekStudentFilter}
                className="h-10 rounded-[10px] border border-[#dbe4ef] bg-white px-3 text-sm font-bold text-[#25324a] transition-colors hover:bg-[#eef4fb] disabled:cursor-not-allowed disabled:opacity-50"
              >
                清除
              </button>
            </div>
            {overviewPage === "month" ? (
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {weekdayLabels.map((d) => (
                  <div key={d} className="text-center text-xs font-bold text-(--color-muted-foreground) py-2">{d}</div>
                ))}
                {days.map((date) => {
                  const dayLessons = filteredVisibleLessons.filter((l) => l.date === date).sort(sortLessons);
                  const amount = dayLessons.reduce((s, l) => s + l.feeSnapshot.amount, 0);
                  const hasPending = dayLessons.some((l) => l.status === "scheduled" || l.status === "makeup_pending");
                  const hasDone = dayLessons.some((l) => l.status === "completed" || l.status === "makeup_completed");
                  const hasCancelled = dayLessons.some((l) => l.status === "cancelled");
                  const hasMakeup = dayLessons.some((l) => makeupMarkerForLesson(l));
                  const isAllCompleted = dayLessons.length > 0 && dayLessons.every((l) => l.status === "completed" || l.status === "makeup_completed");
                  const isCurrentMonth = date.startsWith(month);
                  const isSelected = date === selectedDate;

                  return (
                    <motion.button
                      key={date}
                      whileHover={{ scale: 1.03, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => selectCalendarDate(date)}
                      className={`relative flex min-h-[66px] flex-col items-start rounded-[12px] border p-1.5 text-left transition-all duration-200 sm:min-h-[100px] sm:rounded-[14px] sm:p-2.5 ${
                        isSelected
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
                      <span className={`text-sm font-bold ${isSelected ? (isAllCompleted ? "text-[#15803d]" : "text-[#ff8617]") : "text-[#061226]"}`}>
                        {Number(date.slice(8))}
                      </span>
                      <div className="mt-2 flex gap-1 sm:hidden">
                        {hasDone && <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />}
                        {hasCancelled && <span className="h-1.5 w-1.5 rounded-full bg-[#dc2626]" />}
                        {hasPending && <span className="h-1.5 w-1.5 rounded-full bg-[#ff8617]" />}
                      </div>
                      <div className="mt-1.5 hidden flex-wrap gap-1 sm:flex">
                        {hasDone && <Badge variant="sage" className="text-[10px] px-1.5 py-0">完成</Badge>}
                        {hasCancelled && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">取消</Badge>}
                        {hasPending && <Badge variant="amber" className="text-[10px] px-1.5 py-0">待确认</Badge>}
                        {hasMakeup && <Badge variant="yellow" className="text-[10px] px-1.5 py-0">补课</Badge>}
                        {amount > 0 && <Badge variant="default" className="text-[10px] px-1.5 py-0">{formatPrivateMoney(amount, amountsVisible)}</Badge>}
                      </div>
                      {dayLessons.slice(0, 2).map((l) => (
                        <span key={l.id} className="mt-0.5 hidden w-full truncate text-[10px] text-(--color-muted-foreground) sm:block">
                          {l.startTime} {courseTypeLabel(vault, l.type)} · {courseName(vault, l.courseGroupId)} · {courseSubject(vault, l.courseGroupId)}
                          {makeupMarkerForLesson(l) ? ` · ${makeupMarkerForLesson(l)}` : ""}
                        </span>
                      ))}
                      {dayLessons.length > 2 && (
                        <span className="hidden text-[10px] text-(--color-muted-foreground) sm:block">+{dayLessons.length - 2} 节</span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-extrabold text-[#061226]">周课表</div>
                    <div className="text-xs font-semibold text-[#64748b]">点击某节课可跳转到「排课与课时-课程记录」页面</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#64748b]">
                    <Badge variant="sky" className="text-[10px]">筛选后本周 {weekLessons.length} 节</Badge>
                    <Badge variant="sage" className="text-[10px]">完成</Badge>
                    <Badge variant="amber" className="text-[10px]">待上课</Badge>
                    <Badge variant="yellow" className="text-[10px]">待补课</Badge>
                    <Badge variant="destructive" className="text-[10px]">取消</Badge>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-[14px] border border-[#dbe4ef] bg-white">
                  <div className="min-w-[880px]">
                    <div className="grid grid-cols-[86px_repeat(7,minmax(110px,1fr))] border-b border-[#e8eef6] bg-[#f8fbff]">
                      <div className="sticky left-0 z-10 border-r border-[#e8eef6] bg-[#f8fbff] px-3 py-3 text-xs font-extrabold text-[#64748b]">
                        时间
                      </div>
                      {weekDates.map((date, index) => {
                        const dayLessons = weekLessons.filter((lesson) => lesson.date === date);
                        const dayTotal = dayLessons.reduce((sum, lesson) => sum + lesson.feeSnapshot.amount, 0);
                        const isSelected = date === selectedDate;
                        return (
                          <button
                            key={date}
                            type="button"
                            onClick={() => selectCalendarDate(date)}
                            className={`border-r border-[#e8eef6] px-3 py-2 text-left transition-colors last:border-r-0 ${
                              isSelected ? "bg-[#fff7ed]" : "hover:bg-[#f3f7fb]"
                            }`}
                          >
                            <span className="flex min-w-0 items-center justify-between gap-2">
                              <span className={`truncate text-sm font-extrabold ${isSelected ? "text-[#ff8617]" : "text-[#061226]"}`}>
                                {date.slice(5)}
                              </span>
                              <span className="shrink-0 text-[11px] font-extrabold text-[#1557c2]">
                                {formatPrivateMoney(dayTotal, amountsVisible)}
                              </span>
                            </span>
                            <span className="mt-0.5 block text-xs font-bold text-[#64748b]">
                              {weekdayLabels[index]} · {dayLessons.length} 节
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {weekTimeRows.length === 0 ? (
                      <div className="p-8 text-center text-sm font-semibold text-[#64748b]">
                        这一周还没有课程
                      </div>
                    ) : (
                      weekTimeRows.map((timeRow) => (
                        <div key={timeRow.key} className="grid grid-cols-[86px_repeat(7,minmax(110px,1fr))] border-b border-[#e8eef6] last:border-b-0">
                          <div className="sticky left-0 z-10 flex min-h-[76px] flex-col items-start border-r border-[#e8eef6] bg-[#f8fbff] px-3 py-3 text-left">
                            <span className="text-xs font-extrabold text-[#25324a]">{timeRow.label}</span>
                            <span className="mt-1 text-[10px] font-bold leading-4 text-[#64748b]">{timeRow.rangeLabel}</span>
                          </div>
                          {weekDates.map((date) => {
                            const cellLessons = timeRow.lessons.filter((lesson) => lesson.date === date);
                            const isSelected = date === selectedDate;
                            return (
                              <div
                                key={`${date}-${timeRow.key}`}
                                onClick={() => selectCalendarDate(date)}
                                className={`min-h-[76px] border-r border-[#e8eef6] p-2 text-left transition-colors last:border-r-0 ${
                                  isSelected ? "bg-[#fffaf2]" : "hover:bg-[#f8fbff]"
                                }`}
                              >
                                {cellLessons.length === 0 ? (
                                  <span className="block min-h-[48px]" />
                                ) : (
                                  <span className="flex flex-col gap-2">
                                    {cellLessons.map((lesson) => {
                                      const attendanceNoteText = lessonAttendanceNoteText(vault, lesson);
                                      return (
                                        <button
                                          key={lesson.id}
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            selectCalendarDate(date);
                                            onOpenLessonInRecords?.(lesson, buildReturnFocus({ selectedDate: date, month: date.slice(0, 7) }));
                                          }}
                                          className={`block w-full rounded-[10px] border p-2 text-left text-xs transition-all hover:border-[#1557c2] ${lessonStatusSurfaceClass(lesson.status)}`}
                                        >
                                          <span className="mb-1 block text-[11px] font-extrabold text-[#1557c2]">
                                            {lessonTimeRangeLabel(lesson)}
                                          </span>
                                          <span className="flex min-w-0 items-center justify-between gap-2">
                                            <strong className="truncate">{courseName(vault, lesson.courseGroupId)}</strong>
                                            <span className="flex shrink-0 gap-1">
                                              {makeupMarkerForLesson(lesson) && (
                                                <Badge variant="yellow" className="text-[10px]">
                                                  {makeupMarkerForLesson(lesson)}
                                                </Badge>
                                              )}
                                              <Badge variant={lessonStatusVariant(lesson.status)} className="text-[10px]">
                                                {lessonStatusLabels[lesson.status]}
                                              </Badge>
                                            </span>
                                          </span>
                                          <span className="mt-1 block truncate font-semibold">
                                            {courseTypeLabel(vault, lesson.type)} · {campusName(vault, lesson.campusId)}
                                          </span>
                                          <span className="mt-0.5 block truncate text-[11px] font-semibold opacity-80">
                                            {courseSubject(vault, lesson.courseGroupId)} · {lessonStudentDisplay(vault, lesson)}
                                          </span>
                                          {lesson.note && (
                                            <span className="mt-1 block truncate text-[11px] font-semibold text-[#7f1d1d]">
                                              备注：{lesson.note}
                                            </span>
                                          )}
                                          {attendanceNoteText && (
                                            <span className="mt-1 block truncate text-[11px] font-semibold text-[#9a3412]">
                                              {attendanceNoteText}
                                            </span>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))
                    )}
                    {weekLessons.length > 0 && weekTimeRows.length === 0 && (
                      <div className="p-8 text-center text-sm font-semibold text-[#64748b]">
                        这一周的课程缺少开始或结束时间，无法生成时间表。
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {overviewPage === "month" && (
        <Card className="h-fit overflow-hidden">
          <CardHeader>
            <CardTitle>{dateWithWeekday(selectedDate)} 明细</CardTitle>
            <CardDescription>仅统计课程课时金额，不等同于工资总额。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="p-3 rounded-[12px] bg-[#f8fbff] border border-[#e8eef6]">
                <span className="text-xs text-(--color-muted-foreground)">当天课时费</span>
                <strong className="block text-xl font-extrabold mt-1">{formatPrivateMoney(selectedTotal, amountsVisible)}</strong>
              </div>
              <div className="p-3 rounded-[12px] bg-[#f8fbff] border border-[#e8eef6]">
                <span className="text-xs text-(--color-muted-foreground)">本周课时费</span>
                <strong className="block text-xl font-extrabold mt-1">{formatPrivateMoney(weekTotal, amountsVisible)}</strong>
              </div>
              <div className="p-3 rounded-[12px] bg-[#f8fbff] border border-[#e8eef6]">
                <span className="text-xs text-(--color-muted-foreground)">本月课时费</span>
                <strong className="block text-xl font-extrabold mt-1">{formatPrivateMoney(monthTotal, amountsVisible)}</strong>
              </div>
              <div className="p-3 rounded-[12px] bg-[#f8fbff] border border-[#e8eef6]">
                <span className="text-xs text-(--color-muted-foreground)">本月节数</span>
                <strong className="block text-xl font-extrabold mt-1">{monthLessons.length}</strong>
              </div>
            </div>

            <div className="space-y-2">
              {selectedLessons.length === 0 && (
                <p className="text-sm text-(--color-muted-foreground) text-center py-6">这一天还没有课程</p>
              )}
              {selectedLessons.map((lesson) => {
                const attendanceNoteText = lessonAttendanceNoteText(vault, lesson);
                return (
                  <motion.button
                    key={lesson.id}
                    type="button"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => onOpenLessonInRecords?.(lesson, buildReturnFocus())}
                    className={`flex w-full flex-col gap-3 rounded-[12px] border p-3 text-left transition-all hover:border-[#1557c2] sm:flex-row sm:items-center sm:justify-between ${lessonStatusSurfaceClass(lesson.status)}`}
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <strong className="block truncate text-sm">
                        {lessonTimeRangeLabel(lesson)} · {courseName(vault, lesson.courseGroupId)}
                      </strong>
                        <Badge variant={lessonStatusVariant(lesson.status)} className="shrink-0 text-[10px]">
                          {lessonStatusLabels[lesson.status]}
                        </Badge>
                        {makeupMarkerForLesson(lesson) && (
                          <Badge variant="yellow" className="shrink-0 text-[10px]">
                            {makeupMarkerForLesson(lesson)}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {courseSubject(vault, lesson.courseGroupId)}
                        </Badge>
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {courseTypeLabel(vault, lesson.type)}
                        </Badge>
                      </div>
                      <span className="text-xs text-(--color-muted-foreground)">
                        {campusName(vault, lesson.campusId)} · {courseSubject(vault, lesson.courseGroupId)} · {lessonStudentDisplay(vault, lesson)}
                      </span>
                      {lesson.note && (
                        <div className="mt-2 rounded-[10px] bg-white/72 px-3 py-2 text-xs font-semibold text-[#7f1d1d]">
                          {lesson.note}
                        </div>
                      )}
                      {attendanceNoteText && (
                        <div className="mt-2 rounded-[10px] bg-white/72 px-3 py-2 text-xs font-semibold text-[#9a3412]">
                          {attendanceNoteText}
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-bold text-[#1557c2] sm:ml-3">{formatPrivateMoney(lesson.feeSnapshot.amount, amountsVisible)}</span>
                  </motion.button>
                );
              })}
            </div>
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  );
}
