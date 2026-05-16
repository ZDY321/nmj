import { Fragment, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  BookText,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  CornerUpLeft,
  GraduationCap,
  Link2,
  NotebookPen,
  Plus,
  RotateCcw,
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
import type { AttendanceStatus, CourseGroup, CourseType, Lesson, TeacherVault, TimePreset, WeekStart, Weekday } from "@/shared/types";
import { billableHoursForLesson, calculateFee, classFeeTierForCount, extraFeeTotal, getCourse, lessonBillableHours, presentCount, todayIso } from "@/frontend/lib/calculations";
import { makeId } from "@/frontend/lib/crypto";
import {
  attendanceLabels,
  addDays,
  calendarDates,
  campusName,
  compareByName,
  courseName,
  courseSubject,
  courseTypeLabel,
  courseTypeOptionsForVault,
  createLessonFromCourse,
  findStudent,
  formatDateIso,
  formatPrivateMoney,
  isMakeupAttendanceStatus,
  lessonStatusLabels,
  lessonStatusSurfaceClass,
  lessonStatusVariant,
  lessonStudentIds,
  makeupNeededStudentIds,
  monthShift,
  orderedWeekdayLabels,
  orderedWeekdays,
  shortWeekdayLabels,
  sortCampusesForProfile,
  sortCoursesByName,
  sortLessons,
  sortStudentsByName,
  studentNames,
  subjectOptionsForVault,
  weekStartsOn,
  weekdayOfDateIso,
  weekdayLabels
} from "@/frontend/lib/helpers";

type LessonScope = "month" | "day" | "range" | "week";
type CourseTypeFilter = "all" | CourseType;
type SchedulePanel = "schedule" | "calendar" | "records" | "studentStats";
type CalendarFocus = { date: string; lessonId?: string; targetPanel?: SchedulePanel; nonce: number } | null;

export function ScheduleView({
  vault,
  amountsVisible,
  onAddLesson,
  onAddLessons,
  onAddLessonAndUpdateLesson,
  onUpdateLesson,
  onDeleteLesson,
  onAddCustomTimePreset,
  onDeleteCustomTimePreset,
  onGenerateDrafts,
  onWeekStartChange,
  calendarFocus
}: {
  vault: TeacherVault;
  amountsVisible: boolean;
  onAddLesson: (lesson: Lesson) => void;
  onAddLessons: (lessons: Lesson[]) => void;
  onAddLessonAndUpdateLesson: (lessonToAdd: Lesson, lessonToUpdate: Lesson) => void;
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
  onWeekStartChange: (weekStart: WeekStart) => void;
  calendarFocus?: CalendarFocus;
}) {
  const campusOptions = sortCampusesForProfile(vault.campuses, vault.profile.homeCampusId);
  const courseGroupOptions = sortCoursesByName(vault.courseGroups);
  const studentOptions = sortStudentsByName(vault.students);
  const courseSelectionOptions = sortCoursesByName(vault.courseGroups.filter((course) => course.status === "active"));
  const courseSelectionOptionIds = courseSelectionOptions.map((course) => course.id).join("|");
  const courseGroupOptionIds = courseGroupOptions.map((course) => course.id).join("|");
  const firstCourseId = courseSelectionOptions[0]?.id ?? "";
  const [singleCourseGroupId, setSingleCourseGroupId] = useState(firstCourseId);
  const [singleCourseSearch, setSingleCourseSearch] = useState("");
  const [singleDate, setSingleDate] = useState(todayIso());
  const [singleStartTime, setSingleStartTime] = useState("19:00");
  const [singleEndTime, setSingleEndTime] = useState("21:00");
  const [ruleCourseGroupId, setRuleCourseGroupId] = useState(firstCourseId);
  const [ruleCourseSearch, setRuleCourseSearch] = useState("");
  const [selectedWeekdays, setSelectedWeekdays] = useState<Weekday[]>([3]);
  const [ruleStartTime, setRuleStartTime] = useState("19:00");
  const [ruleEndTime, setRuleEndTime] = useState("21:00");
  const [rangeStart, setRangeStart] = useState(todayIso());
  const [rangeEnd, setRangeEnd] = useState(monthShift(todayIso().slice(0, 7), 1) + "-01");
  const [calendarCourseGroupId, setCalendarCourseGroupId] = useState(firstCourseId);
  const [calendarCourseSearch, setCalendarCourseSearch] = useState("");
  const [calendarViewCourseFilter, setCalendarViewCourseFilter] = useState("all");
  const [calendarViewCourseSearch, setCalendarViewCourseSearch] = useState("");
  const [calendarStartTime, setCalendarStartTime] = useState("19:00");
  const [calendarEndTime, setCalendarEndTime] = useState("21:00");
  const [calendarMonth, setCalendarMonth] = useState(todayIso().slice(0, 7));
  const [calendarMode, setCalendarMode] = useState<"schedule" | "view">("view");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(todayIso());
  const [syncSourceDate, setSyncSourceDate] = useState(addDays(todayIso(), -7));
  const [syncTargetDate, setSyncTargetDate] = useState(todayIso());
  const [selectedSyncLessonIds, setSelectedSyncLessonIds] = useState<string[]>([]);
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);
  const [calendarDetailDate, setCalendarDetailDate] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(vault.lessons[0]?.id ?? "");
  const [campusFilter, setCampusFilter] = useState("all");
  const [studentFilter, setStudentFilter] = useState("");
  const [courseTypeFilter, setCourseTypeFilter] = useState<CourseTypeFilter>("all");
  const [studentStatsNameFilter, setStudentStatsNameFilter] = useState("");
  const [studentStatsCourseFilter, setStudentStatsCourseFilter] = useState("all");
  const [studentStatsCourseTypeFilter, setStudentStatsCourseTypeFilter] = useState<CourseTypeFilter>("all");
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
  const [makeupDate, setMakeupDate] = useState(todayIso());
  const [makeupStartTime, setMakeupStartTime] = useState("19:00");
  const [makeupEndTime, setMakeupEndTime] = useState("21:00");
  const [detailMakeupStudentIds, setDetailMakeupStudentIds] = useState<string[]>([]);
  const [scheduleError, setScheduleError] = useState("");
  const { confirm, dialog } = useConfirmDialog();
  const syncSourceLessons = vault.lessons
    .filter((lesson) => lesson.date === syncSourceDate && lesson.status !== "cancelled")
    .sort(sortLessons);
  const syncSourceLessonIds = syncSourceLessons.map((lesson) => lesson.id).join("|");
  const selectableSyncLessons = syncSourceLessons.filter((lesson) => getCourse(vault, lesson.courseGroupId)?.status === "active");
  const selectableSyncLessonIds = selectableSyncLessons.map((lesson) => lesson.id).join("|");

  useEffect(() => {
    const fallbackCourseId = courseSelectionOptions[0]?.id ?? "";
    const hasCourse = (courseId: string) => courseSelectionOptions.some((course) => course.id === courseId);
    setSingleCourseGroupId((current) => (hasCourse(current) ? current : fallbackCourseId));
    setRuleCourseGroupId((current) => (hasCourse(current) ? current : fallbackCourseId));
    setCalendarCourseGroupId((current) => (hasCourse(current) ? current : fallbackCourseId));
  }, [courseSelectionOptionIds]);

  useEffect(() => {
    setCalendarViewCourseFilter((current) =>
      current === "all" || courseGroupOptions.some((course) => course.id === current) ? current : "all"
    );
  }, [courseGroupOptionIds]);

  useEffect(() => {
    setSyncTargetDate(selectedCalendarDate);
    setSyncSourceDate(addDays(selectedCalendarDate, -7));
    setMakeupDate(selectedCalendarDate);
  }, [selectedCalendarDate]);

  useEffect(() => {
    if (syncRecordsWithCalendarDate) {
      setLessonDay(selectedCalendarDate);
    }
  }, [selectedCalendarDate, syncRecordsWithCalendarDate]);

  useEffect(() => {
    setSelectedSyncLessonIds((current) => {
      const availableIds = new Set(selectableSyncLessons.map((lesson) => lesson.id));
      const kept = current.filter((lessonId) => availableIds.has(lessonId));
      if (kept.length > 0 || selectableSyncLessons.length === 0) return kept;
      return selectableSyncLessons.map((lesson) => lesson.id);
    });
  }, [selectableSyncLessonIds]);

  useEffect(() => {
    if (!calendarFocus?.date) return;
    setSchedulePanel(calendarFocus.targetPanel ?? "calendar");
    setCalendarMode("view");
    setSelectedCalendarDate(calendarFocus.date);
    setCalendarMonth(calendarFocus.date.slice(0, 7));
    setLessonDay(calendarFocus.date);
    setLessonMonth(calendarFocus.date.slice(0, 7));
    setSyncRecordsWithCalendarDate(true);
    if (calendarFocus.targetPanel === "records") {
      setCampusFilter("all");
      setCourseTypeFilter("all");
      setStudentFilter("");
      setShowOnlyMakeup(false);
    }
    if (calendarFocus.lessonId) {
      setSelectedId(calendarFocus.lessonId);
    }
  }, [calendarFocus?.nonce]);

  useEffect(() => {
    setDetailMakeupStudentIds([]);
  }, [selectedId]);

  const weekStartPreference = weekStartsOn(vault);
  const visibleWeekdays = orderedWeekdays(weekStartPreference);
  const visibleWeekdayLabels = orderedWeekdayLabels(weekStartPreference, shortWeekdayLabels);
  const customTimePresets = vault.preferences?.customTimePresets ?? [];
  const singleCourseOptions = filterScheduleCourseOptions(vault, courseSelectionOptions, singleCourseSearch, singleCourseGroupId);
  const ruleCourseOptions = filterScheduleCourseOptions(vault, courseSelectionOptions, ruleCourseSearch, ruleCourseGroupId);
  const calendarCourseOptions = filterScheduleCourseOptions(vault, courseSelectionOptions, calendarCourseSearch, calendarCourseGroupId);
  const calendarViewCourseOptions = filterScheduleCourseOptions(
    vault,
    courseGroupOptions,
    calendarViewCourseSearch,
    calendarViewCourseFilter === "all" ? "" : calendarViewCourseFilter
  );
  const activeMakeupLessons = vault.lessons
    .filter((lesson) => Boolean(lesson.linkedOriginalLessonId) && lesson.status !== "cancelled")
    .sort(sortLessons);
  const activeMakeupLessonsByOriginal = activeMakeupLessons.reduce<Record<string, Lesson[]>>((groups, lesson) => {
    const originalId = lesson.linkedOriginalLessonId;
    if (!originalId) return groups;
    groups[originalId] = [...(groups[originalId] ?? []), lesson];
    return groups;
  }, {});
  const selectedSyncLessons = syncSourceLessons.filter((lesson) => selectedSyncLessonIds.includes(lesson.id));
  const selectedCalendarLessons = calendarLessonsForDate(selectedCalendarDate);
  const selectedCalendarCompletedCount = selectedCalendarLessons.filter((lesson) => isCompletedLessonStatus(lesson.status)).length;
  const selectedCalendarPendingCount = selectedCalendarLessons.filter((lesson) => isPendingLessonStatus(lesson.status)).length;
  const selectedCalendarCancelledCount = selectedCalendarLessons.filter((lesson) => lesson.status === "cancelled").length;
  const selectedCalendarAmount = selectedCalendarLessons.reduce((sum, lesson) => sum + lesson.feeSnapshot.amount, 0);
  const calendarDetailLessons = calendarDetailDate ? calendarLessonsForDate(calendarDetailDate) : [];
  const calendarDetailAmount = calendarDetailLessons.reduce((sum, lesson) => sum + lesson.feeSnapshot.amount, 0);
  const calendarDetailCompletedCount = calendarDetailLessons.filter((lesson) => isCompletedLessonStatus(lesson.status)).length;
  const calendarDetailPendingCount = calendarDetailLessons.filter((lesson) => isPendingLessonStatus(lesson.status)).length;
  const calendarDetailCancelledCount = calendarDetailLessons.filter((lesson) => lesson.status === "cancelled").length;
  const normalizedStudentFilter = studentFilter.trim().toLowerCase();
  const normalizedStudentStatsNameFilter = studentStatsNameFilter.trim().toLowerCase();
  const studentStatsSubjects = subjectOptionsForVault(vault);
  const effectiveLessonScope = syncRecordsWithCalendarDate ? "day" : lessonScope;
  const effectiveLessonDay = syncRecordsWithCalendarDate ? selectedCalendarDate : lessonDay;
  const scopeDates = effectiveLessonScope === "week" ? datesForIsoWeekValue(lessonWeek) : [];
  const lessons = vault.lessons
    .filter((lesson) => {
      const course = getCourse(vault, lesson.courseGroupId);
      const campusId = lesson.campusId ?? course?.defaultCampusId;
      const searchText = lessonSearchText(vault, lesson);
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
        normalizedStudentFilter.split(/\s+/).filter(Boolean).every((term) => searchText.includes(term));
      const matchesMakeup =
        !showOnlyMakeup ||
        lesson.status === "makeup_pending" ||
        lesson.attendance.some((entry) => isMakeupAttendanceStatus(entry.status)) ||
        Boolean(lesson.linkedOriginalLessonId);
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
      const matchesType = studentStatsCourseTypeFilter === "all" || lesson.type === studentStatsCourseTypeFilter;
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
      return matchesStudent && matchesCourse && matchesType && matchesSubject && matchesCampus && matchesStatus && matchesDate && matchesTime;
    })
    .sort(sortLessons);
  const studentStatsRows = buildStudentStatsRows(vault, studentStatsLessons, normalizedStudentStatsNameFilter);
  const studentStatsTotalHours = studentStatsLessons.reduce((sum, lesson) => sum + lessonBillableHours(lesson), 0);
  const studentStatsTotalFee = studentStatsLessons.reduce((sum, lesson) => sum + lesson.feeSnapshot.amount, 0);
  const studentStatsCompletedCount = studentStatsLessons.filter((lesson) => isCompletedLessonStatus(lesson.status)).length;
  const selected = vault.lessons.find((lesson) => lesson.id === selectedId) ?? lessons[0];
  const selectedCourse = selected ? getCourse(vault, selected.courseGroupId) : undefined;
  const selectedOriginalLesson = selected?.linkedOriginalLessonId
    ? vault.lessons.find((lesson) => lesson.id === selected.linkedOriginalLessonId)
    : undefined;
  const selectedLessonStudentCount = selected ? lessonStudentIds(selected).length : 0;
  const selectedScheduledMakeupStudentIds = selected ? activeMakeupStudentIdsForOriginal(selected.id) : new Set<string>();
  const selectedMakeupCandidateStudentIds = selected
    ? makeupNeededStudentIds(selected).filter((studentId) => !selectedScheduledMakeupStudentIds.has(studentId))
    : [];
  const selectedWholeLessonPending =
    selected?.status === "makeup_pending" &&
    !selected.linkedOriginalLessonId &&
    selectedLessonStudentCount > 0 &&
    selectedMakeupCandidateStudentIds.length === selectedLessonStudentCount;
  const selectedMakeupAssignableStudentIds = selectedWholeLessonPending
    ? lessonStudentIds(selected)
    : selectedMakeupCandidateStudentIds;
  const selectedMakeupAssignableSet = new Set(selectedMakeupAssignableStudentIds);
  const selectedDetailMakeupStudentIds = detailMakeupStudentIds.filter((studentId) => selectedMakeupAssignableSet.has(studentId));
  const normalizedTemporaryStudentSearch = temporaryStudentSearch.trim().toLowerCase();
  const normalizedAttendanceStudentFilter = attendanceStudentFilter.trim().toLowerCase();
  const temporaryStudentOptions = selected
    ? studentOptions.filter((student) => {
        const isAvailable = !selected.expectedStudentIds.includes(student.id);
        const searchable = [
          student.name,
          student.grade ?? "",
          campusName(vault, student.defaultCampusId),
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
          campusName(vault, student?.defaultCampusId),
          student?.note ?? "",
          attendanceLabels[entry.status],
          entry.temporary ? "临时加入" : ""
        ].join(" ").toLowerCase();
        return !normalizedAttendanceStudentFilter || searchable.includes(normalizedAttendanceStudentFilter);
      }).sort((a, b) => {
        const aName = findStudent(vault, a.studentId)?.name ?? "未知学生";
        const bName = findStudent(vault, b.studentId)?.name ?? "未知学生";
        return compareByName(aName, bName) || a.studentId.localeCompare(b.studentId);
      })
    : [];
  function activeMakeupStudentIdsForOriginal(originalLessonId: string): Set<string> {
    return new Set((activeMakeupLessonsByOriginal[originalLessonId] ?? []).flatMap((lesson) => lessonStudentIds(lesson)));
  }

  function scheduledMakeupLessonForStudent(originalLessonId: string, studentId: string): Lesson | undefined {
    return (activeMakeupLessonsByOriginal[originalLessonId] ?? []).find((lesson) => lessonStudentIds(lesson).includes(studentId));
  }

  function isFullyScheduledMakeupOriginal(lesson: Lesson): boolean {
    if (lesson.linkedOriginalLessonId || lesson.status !== "makeup_pending") return false;
    const neededStudentIds = lessonStudentIds(lesson);
    if (neededStudentIds.length === 0) return false;
    const scheduledStudentIds = activeMakeupStudentIdsForOriginal(lesson.id);
    return neededStudentIds.every((studentId) => scheduledStudentIds.has(studentId));
  }

  const makeupGroups = vault.lessons
    .filter((lesson) => lesson.status !== "cancelled" && !lesson.linkedOriginalLessonId)
    .map((lesson) => {
      const scheduledStudentIds = activeMakeupStudentIdsForOriginal(lesson.id);
      const rawEntries = lesson.attendance
        .filter((entry) => isMakeupAttendanceStatus(entry.status))
        .sort((a, b) => {
          const aName = findStudent(vault, a.studentId)?.name ?? "未知学生";
          const bName = findStudent(vault, b.studentId)?.name ?? "未知学生";
          return compareByName(aName, bName) || a.studentId.localeCompare(b.studentId);
        });
      const rawStudentIds = makeupNeededStudentIds(lesson);
      const studentIds = rawStudentIds.filter((studentId) => !scheduledStudentIds.has(studentId));
      const entriesByStudentId = new Map(rawEntries.map((entry) => [entry.studentId, entry]));
      const entries = studentIds
        .map((studentId) => entriesByStudentId.get(studentId) ?? { studentId, status: "makeup_pending" as AttendanceStatus, note: lesson.note })
        .sort((a, b) => {
          const aName = findStudent(vault, a.studentId)?.name ?? "未知学生";
          const bName = findStudent(vault, b.studentId)?.name ?? "未知学生";
          return compareByName(aName, bName) || a.studentId.localeCompare(b.studentId);
        });
      const totalStudentCount = lessonStudentIds(lesson).length;
      const scheduledCount = rawStudentIds.length - studentIds.length;
      return {
        lesson,
        entries,
        studentIds,
        scheduledCount,
        wholeLesson: lesson.status === "makeup_pending" && scheduledCount === 0 && studentIds.length > 0 && (totalStudentCount > 0 ? studentIds.length === totalStudentCount : true)
      };
    })
    .filter((group) => group.studentIds.length > 0)
    .sort((a, b) => sortLessons(a.lesson, b.lesson));
  const makeupEntries = makeupGroups.filter(({ lesson }) => {
    if (lesson.status === "makeup_pending" && isFullyScheduledMakeupOriginal(lesson)) return false;
    return !makeupOriginalDateFilter || lesson.date === makeupOriginalDateFilter;
  });
  const scheduledMakeupEntries = activeMakeupLessons
    .map((lesson) => ({
      lesson,
      original: vault.lessons.find((item) => item.id === lesson.linkedOriginalLessonId)
    }))
    .filter(({ lesson, original }) => {
      if (!makeupOriginalDateFilter) return true;
      return lesson.makeupOriginalDate === makeupOriginalDateFilter || original?.date === makeupOriginalDateFilter;
    });
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
  const isMakeupTimeValid = isOrderedTimeRange(makeupStartTime, makeupEndTime);

  function addSingleLesson(status: "scheduled" | "completed") {
    addLessonFromCourse(singleCourseGroupId, singleDate, singleStartTime, singleEndTime, status);
  }

  function matchesCalendarCourseFilter(lesson: Lesson): boolean {
    return calendarViewCourseFilter === "all" || lesson.courseGroupId === calendarViewCourseFilter;
  }

  function calendarLessonsForDate(date: string): Lesson[] {
    return vault.lessons
      .filter((lesson) => lesson.date === date && matchesCalendarCourseFilter(lesson) && !isFullyScheduledMakeupOriginal(lesson))
      .sort(sortLessons);
  }

  function goToCalendarSchedulingFromSingle() {
    if (!validateTimeRange(singleStartTime, singleEndTime)) return;
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

  function toggleSyncLesson(lessonId: string) {
    setSelectedSyncLessonIds((current) =>
      current.includes(lessonId) ? current.filter((id) => id !== lessonId) : [...current, lessonId]
    );
  }

  function setAllSyncLessons(selected: boolean) {
    setSelectedSyncLessonIds(selected ? selectableSyncLessons.map((lesson) => lesson.id) : []);
  }

  function copySelectedLessonsToDate(force = false) {
    if (!syncSourceDate || !syncTargetDate) {
      showScheduleError("请选择要同步的来源日期和目标日期。");
      return;
    }
    if (syncSourceDate === syncTargetDate) {
      showScheduleError("来源日期和目标日期不能相同。");
      return;
    }
    if (selectedSyncLessons.length === 0) {
      showScheduleError("请至少勾选一节要同步的课程。");
      return;
    }

    const activeLessons = selectedSyncLessons.filter((lesson) => getCourse(vault, lesson.courseGroupId)?.status === "active");
    const pausedCount = selectedSyncLessons.length - activeLessons.length;
    const conflictedLessons = activeLessons.filter((lesson) => findTimeConflict(syncTargetDate, lesson.startTime, lesson.endTime));
    if (conflictedLessons.length > 0 && !force) {
      confirm({
        title: "目标日期已有时间冲突",
        description: `${syncTargetDate} 有 ${conflictedLessons.length} 节课时间冲突。系统会跳过冲突课程，只同步没有冲突的课程。`,
        confirmLabel: "跳过冲突并同步",
        onConfirm: () => copySelectedLessonsToDate(true)
      });
      return;
    }

    const lessonsToCopy = activeLessons.filter((lesson) => !findTimeConflict(syncTargetDate, lesson.startTime, lesson.endTime));
    if (lessonsToCopy.length === 0) {
      showScheduleError(pausedCount > 0 ? "可同步课程已暂停或全部与目标日期冲突。" : "勾选课程都与目标日期已有课程冲突。");
      return;
    }

    const copiedLessons = lessonsToCopy.flatMap((lesson) => {
      const course = getCourse(vault, lesson.courseGroupId);
      if (!course) return [];
      return [
        createLessonFromCourse(vault, course, {
          date: syncTargetDate,
          startTime: lesson.startTime,
          endTime: lesson.endTime,
          campusId: lesson.campusId ?? course.defaultCampusId,
          status: "scheduled"
        })
      ];
    });
    onAddLessons(copiedLessons);
    setSelectedCalendarDate(syncTargetDate);
    setCalendarMonth(syncTargetDate.slice(0, 7));
    setScheduleError("");
    if (pausedCount > 0) {
      showScheduleError(`已同步 ${lessonsToCopy.length} 节；${pausedCount} 节来源课程已暂停，未同步。`);
    }
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
        hours: billableHoursForLesson(lesson, course.feeRule),
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

  function updateSelectedStatus(status: Lesson["status"]) {
    if (!selected) return;
    const attendanceStatus = attendanceStatusForLessonStatus(status);
    const next: Lesson = {
      ...selected,
      status,
      attendance: selected.attendance.map((entry) => ({
        ...entry,
        status: attendanceStatus,
        note: attendanceStatus === "attended" ? undefined : entry.note
      }))
    };
    onUpdateLesson(recalculateLessonFee(next));
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
    const singleStudentLesson = selectedLessonStudentCount <= 1;
    const nextLesson: Lesson = {
      ...selected,
      attendance: selected.attendance.map((entry) =>
        entry.studentId === studentId ? { ...entry, status, note: status === "attended" ? undefined : entry.note } : entry
      )
    };
    if (singleStudentLesson) {
      nextLesson.status = lessonStatusForAttendanceStatus(status);
    }
    onUpdateLesson(recalculateLessonFee(nextLesson));
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

  function toggleDetailMakeupStudent(studentId: string) {
    setDetailMakeupStudentIds((current) =>
      current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]
    );
  }

  function openLessonInRecords(lesson: Lesson) {
    setSelectedId(lesson.id);
    setSelectedCalendarDate(lesson.date);
    setCalendarMonth(lesson.date.slice(0, 7));
    setLessonDay(lesson.date);
    setLessonMonth(lesson.date.slice(0, 7));
    setSyncRecordsWithCalendarDate(true);
    setSchedulePanel("records");
  }

  function createSelectedMakeupLesson(studentIds: string[]) {
    if (!selected || studentIds.length === 0) return;
    createMakeupLesson(selected, studentIds);
    setDetailMakeupStudentIds([]);
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

  function createMakeupLesson(
    original: Lesson,
    studentIds: string[],
    options: { date?: string; startTime?: string; endTime?: string; force?: boolean } = {}
  ) {
    const course = getCourse(vault, original.courseGroupId);
    if (!course || studentIds.length === 0) return;
    const scheduledDate = options.date ?? makeupDate;
    const scheduledStartTime = options.startTime ?? makeupStartTime;
    const scheduledEndTime = options.endTime ?? makeupEndTime;
    if (!scheduledDate) {
      showScheduleError("请选择补课日期。");
      return;
    }
    if (!validateTimeRange(scheduledStartTime, scheduledEndTime, "补课结束时间必须晚于开始时间。")) return;
    const conflict = findTimeConflict(scheduledDate, scheduledStartTime, scheduledEndTime);
    if (conflict && !options.force) {
      confirm({
        title: "补课时间已有课程",
        description: `${scheduledDate} ${scheduledStartTime}-${scheduledEndTime} 与「${courseName(vault, conflict.courseGroupId)} ${conflict.startTime}-${conflict.endTime}」冲突。请确认是否仍要安排补课。`,
        confirmLabel: "仍然安排",
        tone: "danger",
        onConfirm: () => createMakeupLesson(original, studentIds, { date: scheduledDate, startTime: scheduledStartTime, endTime: scheduledEndTime, force: true })
      });
      return;
    }
    const makeup = createLessonFromCourse(vault, course, {
      date: scheduledDate,
      startTime: scheduledStartTime,
      endTime: scheduledEndTime,
      campusId: original.campusId ?? course.defaultCampusId,
      status: "scheduled"
    });
    const makeupStudents = studentIds
      .map((studentId) => findStudent(vault, studentId)?.name ?? "未知学生")
      .join("、");
    const nextMakeup = recalculateLessonFee({
      ...makeup,
      expectedStudentIds: [...studentIds],
      attendance: studentIds.map((studentId) => ({ studentId, status: "attended" as AttendanceStatus })),
      linkedOriginalLessonId: original.id,
      makeupStudentId: studentIds.length === 1 ? studentIds[0] : undefined,
      makeupOriginalDate: original.date,
      makeupScheduledDate: scheduledDate,
      note: `${makeupStudents} 补 ${original.date} 的课程`
    });
    const nextOriginal: Lesson = {
      ...original,
      attendance: original.attendance.map((entry) =>
        studentIds.includes(entry.studentId)
          ? { ...entry, status: "makeup_pending", note: entry.note || `已安排 ${scheduledDate} 补课` }
          : entry
      )
    };
    onAddLessonAndUpdateLesson(nextMakeup, nextOriginal);
    setSelectedId(nextMakeup.id);
    setSelectedCalendarDate(scheduledDate);
    setCalendarMonth(scheduledDate.slice(0, 7));
  }

  function updateSelectedDate(nextDate: string) {
    if (!selected) return;
    const nextLesson: Lesson = {
      ...selected,
      date: nextDate,
      makeupScheduledDate: selected.linkedOriginalLessonId ? nextDate : selected.makeupScheduledDate
    };
    const conflict = findTimeConflict(nextDate, selected.startTime, selected.endTime, selected.id);
    const applyChange = () => {
      onUpdateLesson(nextLesson);
      setSelectedCalendarDate(nextDate);
      setCalendarMonth(nextDate.slice(0, 7));
    };
    if (conflict) {
      confirm({
        title: "这个时间段已有课程",
        description: `${nextDate} ${selected.startTime}-${selected.endTime} 与「${courseName(vault, conflict.courseGroupId)} ${conflict.startTime}-${conflict.endTime}」冲突。请确认是否仍要调整。`,
        confirmLabel: "仍然调整",
        tone: "danger",
        onConfirm: applyChange
      });
      return;
    }
    applyChange();
  }

  function updateSelectedStartTime(nextStart: string) {
    if (!selected) return;
    if (!validateTimeRange(nextStart, selected.endTime)) return;
    const conflict = findTimeConflict(selected.date, nextStart, selected.endTime, selected.id);
    const applyChange = () => updateSelected({ startTime: nextStart }, true);
    if (conflict) {
      confirm({
        title: "这个时间段已有课程",
        description: `${selected.date} ${nextStart}-${selected.endTime} 与「${courseName(vault, conflict.courseGroupId)} ${conflict.startTime}-${conflict.endTime}」冲突。请确认是否仍要调整。`,
        confirmLabel: "仍然调整",
        tone: "danger",
        onConfirm: applyChange
      });
      return;
    }
    applyChange();
  }

  function updateSelectedEndTime(nextEnd: string) {
    if (!selected) return;
    if (!validateTimeRange(selected.startTime, nextEnd)) return;
    const conflict = findTimeConflict(selected.date, selected.startTime, nextEnd, selected.id);
    const applyChange = () => updateSelected({ endTime: nextEnd }, true);
    if (conflict) {
      confirm({
        title: "这个时间段已有课程",
        description: `${selected.date} ${selected.startTime}-${nextEnd} 与「${courseName(vault, conflict.courseGroupId)} ${conflict.startTime}-${conflict.endTime}」冲突。请确认是否仍要调整。`,
        confirmLabel: "仍然调整",
        tone: "danger",
        onConfirm: applyChange
      });
      return;
    }
    applyChange();
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

  function findTimeConflict(lessonDate: string, lessonStartTime: string, lessonEndTime: string, ignoredLessonId?: string): Lesson | undefined {
    return vault.lessons.find(
      (lesson) =>
        lesson.id !== ignoredLessonId &&
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
      <AnimatePresence>
        {calendarDetailDate && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#061226]/45 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              className="flex max-h-[86vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[18px] border border-[#dbe4ef] bg-white shadow-[0_30px_80px_rgba(6,18,38,0.24)]"
            >
              <div className="flex items-start justify-between gap-4 border-b border-[#e8eef6] p-5">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                    <CalendarDays size={14} /> 当日课程
                  </div>
                  <h2 className="text-2xl font-extrabold leading-tight text-[#061226]">{calendarDetailDate}</h2>
                  <p className="mt-1 text-sm font-semibold text-[#64748b]">点击课程可跳转到课程记录详情。</p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setCalendarDetailDate(null)} className="shrink-0 rounded-full">
                  <X size={18} />
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    { label: "当天课次", value: `${calendarDetailLessons.length} 节` },
                    { label: "待上/待补", value: `${calendarDetailPendingCount} 节` },
                    { label: "已完成", value: `${calendarDetailCompletedCount} 节` },
                    { label: "已取消", value: `${calendarDetailCancelledCount} 节` },
                    { label: "当天金额", value: formatPrivateMoney(calendarDetailAmount, amountsVisible) }
                  ].map((item) => (
                    <div key={item.label} className="rounded-[10px] border border-[#e8eef6] bg-[#f8fbff] px-3 py-2">
                      <div className="text-[11px] font-semibold text-[#64748b]">{item.label}</div>
                      <div className="mt-0.5 break-words text-sm font-extrabold text-[#061226]">{item.value}</div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  {calendarDetailLessons.map((lesson) => (
                    <div key={lesson.id} className={`rounded-[12px] border p-3 ${lessonStatusSurfaceClass(lesson.status)}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <button
                          type="button"
                          onClick={() => {
                            setCalendarDetailDate(null);
                            openLessonInRecords(lesson);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-extrabold text-[#061226]">{courseName(vault, lesson.courseGroupId)}</span>
                            <Badge variant="secondary" className="text-[10px]">{courseSubject(vault, lesson.courseGroupId)}</Badge>
                            <Badge variant="secondary" className="text-[10px]">{courseTypeLabel(vault, lesson.type)}</Badge>
                            <Badge variant={lessonStatusVariant(lesson.status)} className="text-[10px]">{lessonStatusLabels[lesson.status]}</Badge>
                          </div>
                          <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
                            {lesson.startTime}-{lesson.endTime} · {campusName(vault, lesson.campusId)} · {courseSubject(vault, lesson.courseGroupId)} · {studentNames(vault, lesson.expectedStudentIds)}
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
                  {calendarDetailLessons.length === 0 && (
                    <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
                      这一天没有课程
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="overflow-x-auto rounded-[16px] border border-[#dbe4ef] bg-white">
        <div className="flex w-full min-w-max items-center gap-1 p-1 md:min-w-0">
        {[
          { key: "schedule" as SchedulePanel, label: "排课" },
          { key: "calendar" as SchedulePanel, label: "日历查看" },
          { key: "records" as SchedulePanel, label: "课程记录" },
          { key: "studentStats" as SchedulePanel, label: "学生课次统计" }
        ].map((item, index, items) => (
          <Fragment key={item.key}>
          <button
            type="button"
            onClick={() => setSchedulePanel(item.key)}
            className={`min-w-[112px] flex-1 rounded-[12px] px-3 py-2 text-sm font-extrabold transition-colors ${
              schedulePanel === item.key ? "bg-[#1557c2] text-white" : "text-[#25324a] hover:bg-[#f8fbff]"
            }`}
          >
            {item.label}
          </button>
          {index < items.length - 1 && (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f8fbff] text-[#94a3b8] ring-1 ring-[#e8eef6]">
              <ChevronRight size={14} />
            </div>
          )}
          </Fragment>
        ))}
        </div>
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
                <label className="relative block">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                  <Input
                    value={singleCourseSearch}
                    onChange={(event) => setSingleCourseSearch(event.target.value)}
                    placeholder="搜索姓名、年级、校区或班型"
                    className="h-10 bg-white pl-9"
                  />
                </label>
                <Select value={singleCourseGroupId} onChange={(event) => setSingleCourseGroupId(event.target.value)}>
                  {singleCourseOptions.map((course) => (
                    <option key={course.id} value={course.id}>{course.name} · {course.subject}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">日期</label>
                <Input type="date" value={singleDate} onChange={(event) => setSingleDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">开始时间</label>
                <Input type="time" value={singleStartTime} max={singleEndTime} onChange={(event) => setSingleStartTime(event.target.value)} className={!isSingleTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">结束时间</label>
                <Input type="time" value={singleEndTime} min={singleStartTime} onChange={(event) => setSingleEndTime(event.target.value)} className={!isSingleTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                {!isSingleTimeValid && (
                  <div className="text-xs font-bold text-[#b91c1c]">结束时间必须晚于开始时间。</div>
                )}
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
                <Input type="time" value={customPresetStart} max={customPresetEnd} onChange={(event) => setCustomPresetStart(event.target.value)} className={!isCustomPresetTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                <Input type="time" value={customPresetEnd} min={customPresetStart} onChange={(event) => setCustomPresetEnd(event.target.value)} className={!isCustomPresetTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                <Button type="button" variant="outline" onClick={addCustomPreset} className="w-full" disabled={!isCustomPresetTimeValid}>
                  <Plus size={15} /> 保存时段
                </Button>
              </div>
              {!isCustomPresetTimeValid && (
                <div className="mt-2 text-xs font-bold text-[#b91c1c]">常用时段的结束时间必须晚于开始时间。</div>
              )}
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
                disabled={!singleCourseGroupId}
                className="border-[#bfdbfe] bg-[#eaf2ff] text-[#1557c2] hover:bg-[#dbeafe] hover:text-[#0f3f8f]"
              >
                <CalendarDays size={14} /> 前往日历排课
              </Button>
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
                  <label className="relative block">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                    <Input
                      value={ruleCourseSearch}
                      onChange={(event) => setRuleCourseSearch(event.target.value)}
                      placeholder="搜索姓名、年级、校区或班型"
                      className="h-10 bg-white pl-9"
                    />
                  </label>
                  <Select value={ruleCourseGroupId} onChange={(event) => setRuleCourseGroupId(event.target.value)}>
                    {ruleCourseOptions.map((course) => (
                      <option key={course.id} value={course.id}>{course.name} · {course.subject}</option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">开始</label>
                    <Input type="time" value={ruleStartTime} max={ruleEndTime} onChange={(event) => setRuleStartTime(event.target.value)} className={!isBatchTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">结束</label>
                    <Input type="time" value={ruleEndTime} min={ruleStartTime} onChange={(event) => setRuleEndTime(event.target.value)} className={!isBatchTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                    {!isBatchTimeValid && (
                      <div className="text-xs font-bold text-[#b91c1c]">结束时间必须晚于开始时间。</div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">日期开始</label>
                    <Input type="date" value={rangeStart} max={rangeEnd} onChange={(event) => setRangeStart(event.target.value)} className={!isBatchDateRangeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">日期结束</label>
                    <Input type="date" value={rangeEnd} min={rangeStart} onChange={(event) => setRangeEnd(event.target.value)} className={!isBatchDateRangeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                    {!isBatchDateRangeValid && (
                      <div className="text-xs font-bold text-[#b91c1c]">结束日期不能早于开始日期。</div>
                    )}
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
                disabled={!ruleCourseGroupId || selectedWeekdays.length === 0}
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
      <div className="space-y-6">
        <Card className={`overflow-hidden border-2 ${calendarMode === "schedule" ? "border-[#ffb15c]" : "border-[#93c5fd]"}`}>
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
                <CalendarDays size={14} /> 日历排课 / 查看
              </div>
              <CardTitle>{calendarMode === "schedule" ? "日历排课 · 排课模式" : "日历排课 · 查看模式"}</CardTitle>
              <CardDescription>{calendarMode === "schedule" ? "排课模式下，点击日期会添加待上课；下方可调整排课课程和时间。" : "查看模式：点击日期切换下方明细，可按课程筛选。"}</CardDescription>
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
          <CardContent className="flex flex-col gap-4">
            <div className={`rounded-[14px] border px-4 py-3 text-sm font-extrabold ${
              calendarMode === "schedule"
                ? "border-[#fed7aa] bg-[#fff7ed] text-[#9a3412]"
                : "border-[#bfdbfe] bg-[#eaf2ff] text-[#1557c2]"
            }`}>
              {calendarMode === "schedule" ? "当前是排课模式：点击日期会直接新增待上课。" : "当前是查看模式：点击日期只查看课程明细，不会新增排课。"}
            </div>
            {calendarMode === "schedule" ? (
              <div className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">排课课程</label>
                    <label className="relative block">
                      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                      <Input
                        value={calendarCourseSearch}
                        onChange={(event) => setCalendarCourseSearch(event.target.value)}
                        placeholder="搜索姓名、年级、校区或班型"
                        className="h-10 bg-white pl-9"
                      />
                    </label>
                    <Select value={calendarCourseGroupId} onChange={(event) => setCalendarCourseGroupId(event.target.value)}>
                      {calendarCourseOptions.map((course) => (
                        <option key={course.id} value={course.id}>{course.name} · {course.subject}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">开始时间</label>
                    <Input type="time" value={calendarStartTime} max={calendarEndTime} onChange={(event) => setCalendarStartTime(event.target.value)} className={!isCalendarTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">结束时间</label>
                    <Input type="time" value={calendarEndTime} min={calendarStartTime} onChange={(event) => setCalendarEndTime(event.target.value)} className={!isCalendarTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                    {!isCalendarTimeValid && (
                      <div className="text-xs font-bold text-[#b91c1c]">日历排课的结束时间必须晚于开始时间。</div>
                    )}
                  </div>
                </div>
                <div className="rounded-[12px] border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-xs font-bold leading-5 text-[#9a3412]">
                  说明：这里的排课课程、开始时间和结束时间只用于点击日期时生成新课；下方“查看课程筛选”只影响已排课程展示。
                </div>
              </div>
            ) : (
              <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] px-4 py-3 text-sm font-semibold leading-6 text-[#64748b]">
                查看模式只按日期切换右侧“每日课程详情”；需要新增课时请切到“排课”模式。
              </div>
            )}
            <div className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-extrabold text-[#061226]">查看课程筛选</div>
                <div className="text-xs font-bold text-[#64748b]">
                  当前每日明细 {selectedCalendarLessons.length} 节
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <label className="relative block">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                  <Input
                    value={calendarViewCourseSearch}
                    onChange={(event) => setCalendarViewCourseSearch(event.target.value)}
                    placeholder="搜索姓名、年级、校区或班型"
                    className="h-10 bg-white pl-9"
                  />
                </label>
                <Select value={calendarViewCourseFilter} onChange={(event) => setCalendarViewCourseFilter(event.target.value)} className="h-10">
                  <option value="all">全部课程</option>
                  {calendarViewCourseOptions.map((course) => (
                    <option key={course.id} value={course.id}>{course.name} · {course.subject}</option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCalendarViewCourseFilter("all");
                    setCalendarViewCourseSearch("");
                  }}
                  disabled={calendarViewCourseFilter === "all" && !calendarViewCourseSearch}
                  className="h-10"
                >
                  清除筛选
                </Button>
              </div>
            </div>
            <div className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-extrabold text-[#061226]">同步某一天课程</div>
                  <div className="mt-1 text-xs font-semibold text-[#64748b]">从来源日期勾选课程，复制到目标日期，生成待上课。</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="w-fit">{selectedSyncLessons.length} / {syncSourceLessons.length} 节</Badge>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSyncPanelOpen((value) => !value)} className="h-9 border border-[#facc15] bg-[#fefce8] px-3 font-extrabold text-[#854d0e] hover:bg-[#fef3c7]">
                    {syncPanelOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {syncPanelOpen ? "折叠" : "展开"}
                  </Button>
                </div>
              </div>
              <AnimatePresence initial={false}>
                {syncPanelOpen && (
                  <motion.div
                    key="sync-panel"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 pt-1">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">来源日期</label>
                          <Input type="date" value={syncSourceDate} onChange={(event) => setSyncSourceDate(event.target.value)} className="h-10 bg-white" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">目标日期</label>
                          <Input type="date" value={syncTargetDate} onChange={(event) => setSyncTargetDate(event.target.value)} className="h-10 bg-white" />
                        </div>
                        <Button type="button" className="self-end" onClick={() => copySelectedLessonsToDate()} disabled={selectedSyncLessons.length === 0 || syncSourceDate === syncTargetDate}>
                          <Copy size={15} /> 同步课程
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setSyncSourceDate(addDays(syncTargetDate || selectedCalendarDate, -7))}>
                          上周同日
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setAllSyncLessons(true)} disabled={selectableSyncLessons.length === 0}>
                          全选
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setAllSyncLessons(false)} disabled={selectedSyncLessons.length === 0}>
                          清空
                        </Button>
                      </div>
                      <div className="max-h-[190px] space-y-2 overflow-y-auto pr-1">
                        {syncSourceLessons.map((lesson) => {
                          const course = getCourse(vault, lesson.courseGroupId);
                          const disabled = course?.status !== "active";
                          const conflicted = Boolean(syncTargetDate && findTimeConflict(syncTargetDate, lesson.startTime, lesson.endTime));
                          return (
                            <label
                              key={lesson.id}
                              className={`flex items-start gap-3 rounded-[12px] border px-3 py-2 text-sm ${
                                disabled
                                  ? "border-[#e2e8f0] bg-white text-[#94a3b8]"
                                  : conflicted
                                    ? "border-[#facc15] bg-[#fefce8] text-[#854d0e]"
                                    : "border-[#dbe4ef] bg-white text-[#25324a]"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedSyncLessonIds.includes(lesson.id)}
                                onChange={() => toggleSyncLesson(lesson.id)}
                                disabled={disabled}
                                className="mt-1 h-4 w-4 accent-[#ff8617]"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-extrabold">{lesson.startTime}-{lesson.endTime} · {courseName(vault, lesson.courseGroupId)}</span>
                                <span className="mt-1 block text-xs font-semibold">
                                  {courseSubject(vault, lesson.courseGroupId)} · {courseTypeLabel(vault, lesson.type)} · {campusName(vault, lesson.campusId)}{disabled ? " · 课程已暂停" : conflicted ? " · 目标日期有冲突" : ""}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                        {syncSourceLessons.length === 0 && (
                          <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-white p-5 text-center text-sm font-semibold text-[#64748b]">
                            来源日期没有可同步课程
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="order-first grid grid-cols-7 gap-1 sm:gap-2">
              {visibleWeekdayLabels.map((day) => (
                <div key={day} className="py-2 text-center text-xs font-bold text-(--color-muted-foreground)">{day}</div>
              ))}
              {calendarDates(calendarMonth, weekStartPreference).map((calendarDate) => {
                const dayLessons = calendarLessonsForDate(calendarDate);
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
                        if (!validateTimeRange(calendarStartTime, calendarEndTime, "日历排课的结束时间必须晚于开始时间。")) return;
                        addLessonFromCourse(calendarCourseGroupId, calendarDate, calendarStartTime, calendarEndTime, "scheduled");
                        return;
                      }
                      setCalendarDetailDate(calendarDate);
                    }}
                    disabled={calendarMode === "schedule" && !calendarCourseGroupId}
                    className={`relative flex min-h-[74px] flex-col items-start rounded-[12px] border p-1.5 text-left transition-all duration-200 sm:min-h-[132px] sm:rounded-[14px] sm:p-2.5 xl:min-h-[150px] ${
                      selectedCalendarDate === calendarDate
                        ? isAllCompleted
                          ? "border-2 border-[#22c55e] bg-[#f0fdf4] shadow-[0_0_0_3px_rgba(34,197,94,0.16),0_14px_28px_rgba(22,163,74,0.14)]"
                          : "border-2 border-[#ff8617] bg-[#fff7ed] shadow-[0_0_0_3px_rgba(255,134,23,0.18),0_14px_30px_rgba(255,134,23,0.18)]"
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
                      {amount > 0 && <Badge variant="default" className="px-1.5 py-0 text-[10px]">{formatPrivateMoney(amount, amountsVisible)}</Badge>}
                    </div>
                    {dayLessons.slice(0, 4).map((lesson) => (
                      <span key={lesson.id} className="mt-0.5 hidden w-full truncate text-[11px] font-semibold text-(--color-muted-foreground) sm:block">
                        {lesson.startTime} {courseTypeLabel(vault, lesson.type)} · {courseName(vault, lesson.courseGroupId)} · {courseSubject(vault, lesson.courseGroupId)}
                      </span>
                    ))}
                    {dayLessons.length > 4 && (
                      <span className="hidden text-[10px] font-bold text-[#1557c2] sm:block">+{dayLessons.length - 4} 节</span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr] xl:items-start">
          <Card className="overflow-hidden">
            <CardHeader>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                <Clock size={14} /> 每日课程详情
              </div>
              <CardTitle>{selectedCalendarDate} 课程</CardTitle>
              <CardDescription>状态与课时记录同步，点击课程可跳转到课程记录详情。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "当天课次", value: `${selectedCalendarLessons.length} 节` },
                  { label: "待上/待补", value: `${selectedCalendarPendingCount} 节` },
                  { label: "已完成", value: `${selectedCalendarCompletedCount} 节` },
                  { label: "当天金额", value: formatPrivateMoney(selectedCalendarAmount, amountsVisible) },
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
                      <button type="button" onClick={() => openLessonInRecords(lesson)} className="min-w-0 flex-1 text-left">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-extrabold text-[#061226]">{courseName(vault, lesson.courseGroupId)}</span>
                          <Badge variant="secondary" className="text-[10px]">{courseSubject(vault, lesson.courseGroupId)}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{courseTypeLabel(vault, lesson.type)}</Badge>
                          <Badge variant={lessonStatusVariant(lesson.status)} className="text-[10px]">{lessonStatusLabels[lesson.status]}</Badge>
                        </div>
                        <div className="mt-1 text-xs font-semibold text-[#64748b]">
                          {lesson.startTime}-{lesson.endTime} · {campusName(vault, lesson.campusId)} · {courseSubject(vault, lesson.courseGroupId)}
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
              <CardDescription>按原课日期筛选待补课记录，点击课程到课程记录里安排补课。</CardDescription>
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
              {makeupEntries.map(({ lesson, entries, studentIds, scheduledCount, wholeLesson }) => (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => openLessonInRecords(lesson)}
                  className="w-full rounded-[14px] border border-[#facc15] bg-[#fefce8] p-3 text-left transition-all hover:border-[#eab308] hover:bg-[#fef3c7]"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-extrabold text-[#061226]">{courseName(vault, lesson.courseGroupId)}</div>
                        <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
                          {courseSubject(vault, lesson.courseGroupId)} · 原课：{lesson.date} · {lesson.startTime}-{lesson.endTime} · {campusName(vault, lesson.campusId)}
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
                              {courseName(vault, lesson.courseGroupId)} · {studentNames(vault, lesson.expectedStudentIds)}
                            </div>
                            <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
                              {courseSubject(vault, lesson.courseGroupId)} · 原课：{original?.date ?? lesson.makeupOriginalDate ?? "未知"} · 补课：{lesson.makeupScheduledDate ?? lesson.date} · {lesson.startTime}-{lesson.endTime}
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
                            onClick={() => {
                              setSelectedId(lesson.id);
                              setSelectedCalendarDate(lesson.date);
                              setCalendarMonth(lesson.date.slice(0, 7));
                            }}
                          >
                            查看补课详情
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openLessonInRecords(original ?? lesson)}
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
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
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
                  {courseGroupOptions.map((course) => (
                    <option key={course.id} value={course.id}>{course.name} · {course.subject} · {courseTypeLabel(vault, course.type)}</option>
                  ))}
                </Select>
                <Select value={studentStatsCourseTypeFilter} onChange={(event) => setStudentStatsCourseTypeFilter(event.target.value as CourseTypeFilter)}>
                  <option value="all">全部班型</option>
                  {courseTypeOptionsForVault(vault).map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
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
                  {campusOptions.map((campus) => (
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
                <div className="space-y-2">
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
                  { label: "课时费合计", value: formatPrivateMoney(studentStatsTotalFee, amountsVisible) }
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
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:min-w-[640px] xl:grid-cols-6">
                      {[
                        { label: "总课次", value: `${row.total} 节` },
                        { label: "已完成", value: `${row.completed} 节` },
                        { label: "待上/待补", value: `${row.pending} 节` },
                        { label: "已取消", value: `${row.cancelled} 节` },
                        { label: "课时", value: `${row.hours.toFixed(1)} 小时` },
                        { label: "课时费", value: formatPrivateMoney(row.amount, amountsVisible) }
                      ].map((item) => (
                        <div key={item.label} className="rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2">
                          <div className="text-[11px] font-semibold text-[#64748b]">{item.label}</div>
                          <div className="mt-1 text-sm font-extrabold text-[#061226]">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 rounded-[12px] border border-[#e8eef6] bg-white p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-xs font-bold text-[#64748b]">符合筛选的课程明细</div>
                      <Badge variant="secondary">{row.details.length} 节</Badge>
                    </div>
                    <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
                      {row.details.map((detail) => (
                        <div
                          key={`${row.studentId}-${detail.lessonId}`}
                          className="grid grid-cols-1 gap-2 rounded-[10px] border border-[#eef2f7] bg-[#f8fbff] px-3 py-2 text-xs font-semibold text-[#64748b] md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-extrabold text-[#061226]">{detail.courseName}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span>{detail.date} · {detail.startTime}-{detail.endTime} · {detail.campusName}</span>
                              <Badge variant="secondary" className="text-[10px]">
                                {detail.subject}
                              </Badge>
                              <Badge variant="secondary" className="text-[10px]">
                                {detail.courseTypeLabel}
                              </Badge>
                              <Badge variant={lessonStatusVariant(detail.status)} className="text-[10px]">
                                {lessonStatusLabels[detail.status]}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 md:justify-end">
                            <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-[#dbe4ef]">{detail.hours.toFixed(1)} 小时</span>
                            <span className="rounded-full bg-[#eaf2ff] px-2.5 py-1 font-extrabold text-[#1557c2]">{formatPrivateMoney(detail.amount, amountsVisible)}</span>
                          </div>
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
                  {campusOptions.map((campus) => (
                    <option key={campus.id} value={campus.id}>{campus.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">班型筛选</label>
                <Select value={courseTypeFilter} onChange={(event) => setCourseTypeFilter(event.target.value as CourseTypeFilter)}>
                  <option value="all">全部班型</option>
                  {courseTypeOptionsForVault(vault).map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
              <label className="relative block">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                <Input className="pl-9" value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)} placeholder="搜索姓名、年级、校区或班型" />
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
                        {courseSubject(vault, lesson.courseGroupId)} · {courseTypeLabel(vault, lesson.type)} · {lesson.date} · {lesson.startTime}-{lesson.endTime} · {campusName(vault, lesson.campusId)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden text-sm font-semibold sm:inline">{formatPrivateMoney(lesson.feeSnapshot.amount, amountsVisible)}</span>
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
                  <CardDescription>{courseSubject(vault, selected.courseGroupId)} · {courseTypeLabel(vault, selected.type)} · {selected.date} · {selected.startTime}-{selected.endTime}</CardDescription>
                </div>
                <Button variant="destructive" size="sm" onClick={() => askDeleteLesson(selected)}>
                  <Trash2 size={15} /> 删除
                </Button>
              </CardHeader>
              <CardContent className="space-y-5">
                {selectedOriginalLesson && (
                  <div className="rounded-[14px] border border-[#fed7aa] bg-[#fff7ed] p-4">
                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-sm font-extrabold text-[#9a3412]">
                        <Link2 size={16} /> 补课来源
                      </div>
                      <Button type="button" size="sm" variant="outline" className="w-fit border-[#fed7aa] bg-white text-[#9a3412]" onClick={() => openLessonInRecords(selectedOriginalLesson)}>
                        返回原课
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-sm font-semibold text-[#7c2d12] sm:grid-cols-2">
                      <div>原课日期：{selectedOriginalLesson.date}</div>
                      <div>补课日期：{selected.date}</div>
                      <div>学生：{selected.makeupStudentId ? studentNames(vault, [selected.makeupStudentId]) : studentNames(vault, selected.expectedStudentIds)}</div>
                      <div>原课程：{courseName(vault, selectedOriginalLesson.courseGroupId)}</div>
                      <div>原课科目：{courseSubject(vault, selectedOriginalLesson.courseGroupId)}</div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">课程</label>
                    <Select value={selected.courseGroupId} onChange={(event) => updateSelectedCourse(event.target.value)}>
                      {courseGroupOptions.map((course) => (
                        <option key={course.id} value={course.id}>{course.name} · {course.subject}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">校区</label>
                    <Select value={selected.campusId ?? ""} onChange={(event) => updateSelected({ campusId: event.target.value || undefined })}>
                      <option value="">课程默认校区</option>
                      {campusOptions.map((campus) => (
                        <option key={campus.id} value={campus.id}>{campus.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">日期</label>
                    <Input type="date" value={selected.date} onChange={(event) => updateSelectedDate(event.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">开始</label>
                      <Input
                        type="time"
                        value={selected.startTime}
                        max={selected.endTime}
                        onChange={(event) => updateSelectedStartTime(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">结束</label>
                      <Input
                        type="time"
                        value={selected.endTime}
                        min={selected.startTime}
                        onChange={(event) => updateSelectedEndTime(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">状态</label>
                    <Select value={selected.status} onChange={(event) => updateSelectedStatus(event.target.value as Lesson["status"])}>
                      {Object.entries(lessonStatusLabels).map(([key, value]) => (
                        <option key={key} value={key}>{value}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">金额</label>
                    {amountsVisible ? (
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-extrabold text-[#64748b]">¥</span>
                        <Input
                          type="number"
                          value={selected.feeSnapshot.amount}
                          onChange={(event) => updateSelected({ feeSnapshot: { ...selected.feeSnapshot, amount: Number(event.target.value) } })}
                          className="pl-10"
                        />
                      </div>
                    ) : (
                      <div className="flex h-10 items-center rounded-[10px] border border-[#dbe4ef] bg-[#f8fbff] px-3 text-sm font-extrabold text-[#64748b]">
                        ***
                      </div>
                    )}
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
                          {amountsVisible ? (
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
                          ) : (
                            <div className="flex h-10 items-center rounded-[10px] border border-[#dbe4ef] bg-white px-3 text-sm font-extrabold text-[#64748b]">
                              ***
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {!selected.linkedOriginalLessonId && selectedMakeupAssignableStudentIds.length > 0 && (
                    <div className="space-y-3 rounded-[14px] border border-[#facc15] bg-[#fefce8] p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-sm font-extrabold text-[#061226]">补课安排</div>
                          <div className="mt-1 text-xs font-semibold text-[#854d0e]">
                            {selectedWholeLessonPending ? "这节课整体待补课，直接安排补课即可。" : "勾选可一起补课的学生，分批安排不同时间。"}
                          </div>
                        </div>
                        <Badge variant="amber" className="w-fit">
                          {selectedWholeLessonPending ? "整节待补" : `${selectedMakeupCandidateStudentIds.length} 人待补`}
                        </Badge>
                      </div>
                      {!selectedWholeLessonPending && selectedMakeupCandidateStudentIds.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => setDetailMakeupStudentIds(selectedMakeupCandidateStudentIds)}>
                            全选待补学生
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => setDetailMakeupStudentIds([])} disabled={selectedDetailMakeupStudentIds.length === 0}>
                            清空
                          </Button>
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-2">
                        {selectedMakeupAssignableStudentIds.length > 0 ? (
                          selectedMakeupAssignableStudentIds.map((studentId) => {
                            const student = findStudent(vault, studentId);
                            const checked = selectedDetailMakeupStudentIds.includes(studentId);
                            return (
                              <label
                                key={studentId}
                                className={`flex items-center justify-between gap-3 rounded-[12px] border px-3 py-2 text-sm ${
                                  checked ? "border-[#f59e0b] bg-white text-[#7c2d12]" : "border-[#fde68a] bg-white text-[#061226]"
                                }`}
                              >
                                <span className="min-w-0 flex items-center gap-3">
                                  {!selectedWholeLessonPending && (
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleDetailMakeupStudent(studentId)}
                                      className="h-4 w-4 accent-[#ff8617]"
                                    />
                                  )}
                                  <span className="truncate font-semibold">{student?.name ?? "未知学生"}</span>
                                </span>
                                <Badge variant={checked ? "default" : "secondary"} className="w-fit">
                                  {checked ? "已选" : "待补"}
                                </Badge>
                              </label>
                            );
                          })
                        ) : (
                          <div className="rounded-[12px] border border-dashed border-[#fcd34d] bg-white p-4 text-center text-sm font-semibold text-[#854d0e]">
                            没有待安排补课的学生
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-[#854d0e]">补课日期</label>
                          <Input type="date" value={makeupDate} onChange={(event) => setMakeupDate(event.target.value)} className="bg-white" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-[#854d0e]">补课时间</label>
                          <div className="grid grid-cols-2 gap-2">
                            <Input type="time" value={makeupStartTime} max={makeupEndTime} onChange={(event) => setMakeupStartTime(event.target.value)} className={!isMakeupTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : "bg-white"} />
                            <Input type="time" value={makeupEndTime} min={makeupStartTime} onChange={(event) => setMakeupEndTime(event.target.value)} className={!isMakeupTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : "bg-white"} />
                          </div>
                        </div>
                      </div>
                      {!isMakeupTimeValid && <div className="text-xs font-bold text-[#b91c1c]">补课结束时间必须晚于开始时间。</div>}
                      <Button
                        type="button"
                        onClick={() => createSelectedMakeupLesson(selectedWholeLessonPending ? lessonStudentIds(selected) : selectedDetailMakeupStudentIds)}
                        disabled={!isMakeupTimeValid || !makeupDate || selectedMakeupAssignableStudentIds.length === 0 || (!selectedWholeLessonPending && selectedDetailMakeupStudentIds.length === 0)}
                        className="w-full sm:w-auto"
                      >
                        <Plus size={14} /> {selectedWholeLessonPending ? "安排补课" : "安排选中学生补课"}
                      </Button>
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
                        placeholder="搜索姓名、年级、校区或到课状态"
                      />
                    </label>
                    <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                      {selectedAttendanceEntries.map((entry) => {
                        const student = findStudent(vault, entry.studentId);
                        const isTemporary = entry.temporary || student?.temporaryTrial || !selectedCourse?.studentIds.includes(entry.studentId);
                        const scheduledMakeupLesson = selected && !selected.linkedOriginalLessonId
                          ? scheduledMakeupLessonForStudent(selected.id, entry.studentId)
                          : undefined;
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
                                {scheduledMakeupLesson && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="border-[#bfdbfe] bg-white text-[#1557c2]"
                                    onClick={() => openLessonInRecords(scheduledMakeupLesson)}
                                  >
                                    <Link2 size={13} /> 补课详情
                                  </Button>
                                )}
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
                                {amountsVisible ? (
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
                                ) : (
                                  <div className="flex h-10 items-center rounded-[10px] border border-[#dbe4ef] bg-white px-3 text-sm font-extrabold text-[#64748b]">
                                    ***
                                  </div>
                                )}
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

function attendanceStatusForLessonStatus(status: Lesson["status"]): AttendanceStatus {
  if (status === "cancelled") return "cancelled";
  if (status === "makeup_pending") return "makeup_pending";
  if (status === "makeup_completed") return "makeup_completed";
  return "attended";
}

function lessonStatusForAttendanceStatus(status: AttendanceStatus): Lesson["status"] {
  if (status === "cancelled") return "cancelled";
  if (status === "makeup_completed") return "makeup_completed";
  if (isMakeupAttendanceStatus(status)) return "makeup_pending";
  return "completed";
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

function lessonSearchText(vault: TeacherVault, lesson: Lesson): string {
  const course = getCourse(vault, lesson.courseGroupId);
  const studentFields = lessonStudentIds(lesson).flatMap((studentId) => {
    const student = findStudent(vault, studentId);
    return [
      student?.name ?? "",
      student?.grade ?? "",
      campusName(vault, student?.defaultCampusId),
      student?.note ?? ""
    ];
  });
  return [
    course?.name ?? "",
    course?.subject ?? "",
    courseTypeLabel(vault, lesson.type),
    campusName(vault, lesson.campusId ?? course?.defaultCampusId),
    lessonStatusLabels[lesson.status],
    studentNames(vault, lesson.expectedStudentIds),
    ...studentFields
  ].join(" ").toLowerCase();
}

function filterScheduleCourseOptions(vault: TeacherVault, courses: CourseGroup[], query: string, currentCourseId: string): CourseGroup[] {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? courses.filter((course) => {
        const courseStudents = course.studentIds
          .map((studentId) => findStudent(vault, studentId))
          .filter((student): student is NonNullable<typeof student> => Boolean(student));
        const searchable = [
          course.name,
          course.subject,
          courseTypeLabel(vault, course.type),
          campusName(vault, course.defaultCampusId),
          studentNames(vault, course.studentIds),
          ...courseStudents.flatMap((student) => [
            student?.name ?? "",
            student?.grade ?? "",
            campusName(vault, student?.defaultCampusId),
            student?.note ?? ""
          ])
        ].join(" ").toLowerCase();
        return normalizedQuery.split(/\s+/).filter(Boolean).every((term) => searchable.includes(term));
      })
    : courses;
  const currentCourse = courses.find((course) => course.id === currentCourseId);
  if (currentCourse && !filtered.some((course) => course.id === currentCourse.id)) {
    return [currentCourse, ...filtered];
  }
  return filtered;
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
    amount: number;
    courseNames: string[];
    details: Array<{
      lessonId: string;
      courseName: string;
      subject: string;
      courseTypeLabel: string;
      campusName: string;
      date: string;
      startTime: string;
      endTime: string;
      status: Lesson["status"];
      hours: number;
      amount: number;
    }>;
  }>();

  lessons.forEach((lesson) => {
    const hours = lessonBillableHours(lesson);
    const amount = lesson.feeSnapshot.amount;
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
        amount: 0,
        courseNames: [],
        details: []
      };

      current.total += 1;
      current.hours += hours;
      current.amount += amount;
      if (isCompletedLessonStatus(lesson.status)) {
        current.completed += 1;
      } else if (isPendingLessonStatus(lesson.status)) {
        current.pending += 1;
      } else if (lesson.status === "cancelled") {
        current.cancelled += 1;
      }

      const name = courseName(vault, lesson.courseGroupId);
      const typeLabel = courseTypeLabel(vault, lesson.type);
      const typedName = `${name}（${typeLabel}）`;
      if (!current.courseNames.includes(typedName)) {
        current.courseNames.push(typedName);
      }
      current.details.push({
        lessonId: lesson.id,
        courseName: name,
        subject: courseSubject(vault, lesson.courseGroupId),
        courseTypeLabel: typeLabel,
        campusName: campusName(vault, lesson.campusId),
        date: lesson.date,
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        status: lesson.status,
        hours,
        amount
      });
      rows.set(studentId, current);
    });
  });

  return [...rows.values()]
    .map((row) => ({ ...row, courseNames: [...row.courseNames].sort(compareByName) }))
    .sort((a, b) => compareByName(a.studentName, b.studentName) || a.studentId.localeCompare(b.studentId));
}

function attendanceSurfaceClass(status: AttendanceStatus, isTemporary: boolean): string {
  if (status === "leave_requested" || status === "makeup_pending") {
    return "border-[#facc15] bg-[#fef9c3]";
  }
  if (status === "absent" || status === "cancelled") {
    return "border-[#fecaca] bg-[#fff1f2]";
  }
  if (isTemporary) {
    return "border-[#c7d2fe] bg-[#eef0ff]";
  }
  return "border-[#dbe4ef] bg-[#f8fbff]";
}
