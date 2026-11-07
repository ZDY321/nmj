import { getCourse, todayIso } from "@/frontend/lib/calculations";
import {
  compareByName,
  courseTypeOptionsForVault,
  sortCampusesForProfile,
  sortLessons,
  subjectOptionsForVault,
  weekDatesFor
} from "@/frontend/lib/helpers";
import {
  calendarLessonsForDateWithFilters,
  filterScheduleRecordLessons,
  isCompletedLessonStatus,
  isPendingLessonStatus,
  isoWeekValue,
  matchesCalendarLessonFilters
} from "@/frontend/lib/scheduleViewHelpers";
import type { CalendarFocus, CourseTypeFilter, ExternalLessonReturnTarget, InternalLessonReturnTarget, LessonReturnTarget, LessonScope, MakeupLessonFilter, SchedulePanel } from "@/frontend/lib/scheduleViewTypes";
import type { Lesson, TeacherVault, WeekStart } from "@/shared/types";
import { useEffect, useState } from "react";

interface ScheduleNavigationOptions {
  vault: TeacherVault;
  calendarFocus?: CalendarFocus;
  weekStartPreference: WeekStart;
  onReturnToView: (target: ExternalLessonReturnTarget) => void;
  setCalendarCourseGroupId: (value: string) => void;
  setSingleCourseGroupId: (value: string) => void;
  setCalendarStartTime: (value: string) => void;
  setSingleStartTime: (value: string) => void;
  setCalendarEndTime: (value: string) => void;
  setSingleEndTime: (value: string) => void;
  setSingleDate: (value: string) => void;
}

export function useScheduleNavigation({ vault, calendarFocus, weekStartPreference, onReturnToView, setCalendarCourseGroupId, setSingleCourseGroupId, setCalendarStartTime, setSingleStartTime, setCalendarEndTime, setSingleEndTime, setSingleDate }: ScheduleNavigationOptions) {
  const initialFocusedDate = calendarFocus?.date ?? todayIso();

  const initialFocusedMonth = initialFocusedDate.slice(0, 7);

  const initialTargetPanel = calendarFocus?.targetPanel ?? "calendar";

  const initialSelectedLessonId = calendarFocus?.lessonId ?? (
    initialTargetPanel === "records"
      ? vault.lessons.filter((lesson) => lesson.date === initialFocusedDate).sort(sortLessons)[0]?.id
      : vault.lessons[0]?.id
  ) ?? "";

  const [calendarMonth, setCalendarMonth] = useState(initialFocusedMonth);
  const [calendarMode, setCalendarMode] = useState<"schedule" | "view">("view");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(initialFocusedDate);
  const [calendarViewCampusFilter, setCalendarViewCampusFilter] = useState("all");
  const [calendarViewCourseTypeFilter, setCalendarViewCourseTypeFilter] = useState<CourseTypeFilter>("all");
  const [calendarViewGradeFilter, setCalendarViewGradeFilter] = useState("all");
  const [calendarViewSubjectFilter, setCalendarViewSubjectFilter] = useState("all");
  const [calendarViewStudentFilter, setCalendarViewStudentFilter] = useState("");
  const [calendarViewMakeupFilter, setCalendarViewMakeupFilter] = useState<MakeupLessonFilter>("all");
  const [calendarDetailDate, setCalendarDetailDate] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(initialSelectedLessonId);
  const [lessonHistory, setLessonHistory] = useState<string[]>([]);
  const [lessonReturnTarget, setLessonReturnTarget] = useState<LessonReturnTarget | null>(calendarFocus?.returnTarget ?? null);
  const [campusFilter, setCampusFilter] = useState("all");
  const [studentFilter, setStudentFilter] = useState("");
  const [courseTypeFilter, setCourseTypeFilter] = useState<CourseTypeFilter>("all");
  const [lessonScope, setLessonScope] = useState<LessonScope>("month");
  const [lessonMonth, setLessonMonth] = useState(initialFocusedMonth);
  const [lessonDay, setLessonDay] = useState(initialFocusedDate);
  const [lessonRangeStart, setLessonRangeStart] = useState(todayIso());
  const [lessonRangeEnd, setLessonRangeEnd] = useState(todayIso());
  const [lessonWeek, setLessonWeek] = useState(isoWeekValue(todayIso()));
  const [syncRecordsWithCalendarDate, setSyncRecordsWithCalendarDate] = useState(true);
  const [showOnlyMakeup, setShowOnlyMakeup] = useState(false);
  const [makeupManagementTab, setMakeupManagementTab] = useState<"regular" | "substitute">("regular");
  const [schedulePanel, setSchedulePanel] = useState<SchedulePanel>(initialTargetPanel);

  const calendarViewCampusOptions = sortCampusesForProfile(vault.campuses, vault.profile.homeCampusId);

  const calendarViewCourseTypeOptions = courseTypeOptionsForVault(vault);

  const calendarViewGradeOptions = Array.from(
    new Set(vault.students.map((student) => student.grade?.trim()).filter((grade): grade is string => Boolean(grade)))
  ).sort(compareByName);

  const calendarViewSubjectOptions = subjectOptionsForVault(vault);

  useEffect(() => {
    setCalendarViewCampusFilter((current) =>
      current === "all" || calendarViewCampusOptions.some((campus) => campus.id === current) ? current : "all"
    );
    setCalendarViewCourseTypeFilter((current) =>
      current === "all" || calendarViewCourseTypeOptions.some((type) => type.value === current) ? current : "all"
    );
    setCalendarViewGradeFilter((current) =>
      current === "all" || calendarViewGradeOptions.some((grade) => grade === current) ? current : "all"
    );
    setCalendarViewSubjectFilter((current) =>
      current === "all" || calendarViewSubjectOptions.some((subject) => subject === current) ? current : "all"
    );
  }, [calendarViewCampusOptions, calendarViewCourseTypeOptions, calendarViewGradeOptions, calendarViewSubjectOptions]);

  useEffect(() => {
    if (syncRecordsWithCalendarDate) {
      setLessonDay(selectedCalendarDate);
    }
  }, [selectedCalendarDate, syncRecordsWithCalendarDate]);

  useEffect(() => {
    if (!calendarFocus?.date) return;
    setSchedulePanel(calendarFocus.targetPanel ?? "calendar");
    setCalendarMode(calendarFocus.calendarMode ?? "view");
    setSelectedCalendarDate(calendarFocus.date);
    setCalendarMonth(calendarFocus.date.slice(0, 7));
    setLessonDay(calendarFocus.date);
    setLessonMonth(calendarFocus.date.slice(0, 7));
    if (calendarFocus.scheduleDraft?.courseGroupId) {
      setCalendarCourseGroupId(calendarFocus.scheduleDraft.courseGroupId);
      setSingleCourseGroupId(calendarFocus.scheduleDraft.courseGroupId);
    }
    if (calendarFocus.scheduleDraft?.startTime) {
      setCalendarStartTime(calendarFocus.scheduleDraft.startTime);
      setSingleStartTime(calendarFocus.scheduleDraft.startTime);
    }
    if (calendarFocus.scheduleDraft?.endTime) {
      setCalendarEndTime(calendarFocus.scheduleDraft.endTime);
      setSingleEndTime(calendarFocus.scheduleDraft.endTime);
    }
    if (calendarFocus.scheduleDraft) {
      setSingleDate(calendarFocus.date);
      setLessonReturnTarget(calendarFocus.returnTarget ?? null);
    }
    setSyncRecordsWithCalendarDate(true);
    if (calendarFocus.targetPanel === "records") {
      setCampusFilter("all");
      setCourseTypeFilter("all");
      setStudentFilter("");
      setShowOnlyMakeup(false);
    }
    if (calendarFocus.lessonId) {
      const focusedLesson = vault.lessons.find((lesson) => lesson.id === calendarFocus.lessonId);
      if (focusedLesson) {
        setLessonHistory([]);
        openLessonInRecords(focusedLesson, { pushHistory: false, returnTarget: calendarFocus.returnTarget ?? null });
      } else {
        setLessonReturnTarget(calendarFocus.returnTarget ?? null);
        setSelectedId(calendarFocus.lessonId);
      }
    } else if (calendarFocus.targetPanel === "records") {
      openDateInRecords(calendarFocus.date, { returnTarget: calendarFocus.returnTarget ?? null });
    }
  }, [calendarFocus?.nonce]);

  function calendarDayNoteForDate(date: string): string {
    return vault.calendarDayNotes?.find((item) => item.date === date)?.note ?? "";
  }

  const calendarLessonFilters = {
    campusFilter: calendarViewCampusFilter,
    courseTypeFilter: calendarViewCourseTypeFilter,
    gradeFilter: calendarViewGradeFilter,
    subjectFilter: calendarViewSubjectFilter,
    studentFilter: calendarViewStudentFilter,
    makeupFilter: calendarViewMakeupFilter
  };

  const matchesCalendarLessonFilter = (lesson: Lesson) => matchesCalendarLessonFilters(vault, lesson, calendarLessonFilters);

  const calendarLessonsForDate = (date: string) => calendarLessonsForDateWithFilters(vault, date, calendarLessonFilters);

  const selectedCalendarLessons = calendarLessonsForDate(selectedCalendarDate);

  const selectedCalendarDateAllLessons = vault.lessons.filter((lesson) => lesson.date === selectedCalendarDate).sort(sortLessons);

  const selectedCalendarRefreshableLessons = selectedCalendarDateAllLessons.filter((lesson) => Boolean(getCourse(vault, lesson.courseGroupId)));

  const selectedCalendarWeekDates = new Set(weekDatesFor(selectedCalendarDate, weekStartPreference));

  const selectedCalendarWeekLessons = vault.lessons.filter((lesson) => selectedCalendarWeekDates.has(lesson.date) && matchesCalendarLessonFilter(lesson));

  const selectedCalendarCompletedCount = selectedCalendarLessons.filter((lesson) => isCompletedLessonStatus(lesson.status)).length;

  const selectedCalendarPendingCount = selectedCalendarLessons.filter((lesson) => isPendingLessonStatus(lesson.status)).length;

  const selectedCalendarCancelledCount = selectedCalendarLessons.filter((lesson) => lesson.status === "cancelled").length;

  const selectedCalendarAmount = selectedCalendarLessons.reduce((sum, lesson) => sum + lesson.feeSnapshot.amount, 0);

  const selectedCalendarDayNote = calendarDayNoteForDate(selectedCalendarDate);

  const calendarDetailLessons = calendarDetailDate ? calendarLessonsForDate(calendarDetailDate) : [];

  const calendarDetailDayNote = calendarDetailDate ? calendarDayNoteForDate(calendarDetailDate) : "";

  const calendarDetailAmount = calendarDetailLessons.reduce((sum, lesson) => sum + lesson.feeSnapshot.amount, 0);

  const calendarDetailCompletedCount = calendarDetailLessons.filter((lesson) => isCompletedLessonStatus(lesson.status)).length;

  const calendarDetailPendingCount = calendarDetailLessons.filter((lesson) => isPendingLessonStatus(lesson.status)).length;

  const calendarDetailCancelledCount = calendarDetailLessons.filter((lesson) => lesson.status === "cancelled").length;

  const normalizedStudentFilter = studentFilter.trim().toLowerCase();

  const effectiveLessonScope = syncRecordsWithCalendarDate ? "day" : lessonScope;

  const effectiveLessonDay = syncRecordsWithCalendarDate ? selectedCalendarDate : lessonDay;

  const lessons = filterScheduleRecordLessons(vault, {
    campusFilter,
    courseTypeFilter,
    effectiveDay: effectiveLessonDay,
    lessonMonth,
    lessonRangeEnd,
    lessonRangeStart,
    lessonWeek,
    normalizedStudentFilter,
    scope: effectiveLessonScope,
    showOnlyMakeup
  });

  const selected = vault.lessons.find((lesson) => lesson.id === selectedId) ?? lessons[0];

  function switchSchedulePanel(nextPanel: SchedulePanel, options: { calendarMode?: "schedule" | "view" } = {}) {
    if (nextPanel === "substitute") {
      setMakeupManagementTab("substitute");
      setSchedulePanel("makeup");
    } else {
      setSchedulePanel(nextPanel);
    }
    if (nextPanel === "calendar") {
      setCalendarMode(options.calendarMode ?? "view");
    }
    if (nextPanel !== "records") {
      setLessonReturnTarget(null);
    }
  }

  function buildPanelReturnTarget(panel: SchedulePanel): InternalLessonReturnTarget | null {
    switch (panel) {
      case "ai":
        return { kind: "panel", panel, label: "返回 AI 排课助手" };
      case "schedule":
        return { kind: "panel", panel, label: "返回排课" };
      case "calendar":
        return {
          kind: "panel",
          panel,
          label: "返回日历查看",
          calendarDate: selectedCalendarDate,
          calendarMonth: calendarMonth,
          calendarMode,
          calendarDetailDate
        };
      case "makeup":
        return { kind: "panel", panel, label: "返回补课管理" };
      case "studentStats":
        return { kind: "panel", panel, label: "返回学生课次统计" };
      default:
        return null;
    }
  }

  function openDateInRecords(date: string, options: { returnTarget?: LessonReturnTarget | null } = {}) {
    const firstLesson = vault.lessons.filter((lesson) => lesson.date === date).sort(sortLessons)[0];
    setLessonReturnTarget(Object.prototype.hasOwnProperty.call(options, "returnTarget")
      ? options.returnTarget ?? null
      : buildPanelReturnTarget(schedulePanel));
    setLessonHistory([]);
    setCampusFilter("all");
    setCourseTypeFilter("all");
    setStudentFilter("");
    setShowOnlyMakeup(false);
    setSelectedId(firstLesson?.id ?? "");
    setSelectedCalendarDate(date);
    setCalendarMonth(date.slice(0, 7));
    setLessonDay(date);
    setLessonMonth(date.slice(0, 7));
    setLessonScope("day");
    setSyncRecordsWithCalendarDate(true);
    setCalendarDetailDate(null);
    setSchedulePanel("records");
  }

  function openLessonInRecords(
    lesson: Lesson,
    options: { pushHistory?: boolean; preserveReturnTarget?: boolean; returnTarget?: LessonReturnTarget | null } = {}
  ) {
    const pushHistory = options.pushHistory ?? true;
    const preserveReturnTarget = options.preserveReturnTarget ?? schedulePanel === "records";
    if (pushHistory && lesson.id !== selectedId) {
      setLessonHistory((history) => [...history, selectedId].filter(Boolean).slice(-12));
    }
    if (Object.prototype.hasOwnProperty.call(options, "returnTarget")) {
      setLessonReturnTarget(options.returnTarget ?? null);
    } else if (!preserveReturnTarget) {
      setLessonReturnTarget(buildPanelReturnTarget(schedulePanel));
    }
    setSelectedId(lesson.id);
    setSelectedCalendarDate(lesson.date);
    setCalendarMonth(lesson.date.slice(0, 7));
    setLessonDay(lesson.date);
    setLessonMonth(lesson.date.slice(0, 7));
    setSyncRecordsWithCalendarDate(true);
    setCalendarDetailDate(null);
    setSchedulePanel("records");
  }

  function goBackToPreviousLesson() {
    const previousId = lessonHistory.at(-1);
    if (!previousId) return;
    setLessonHistory((history) => history.slice(0, -1));
    const previousLesson = vault.lessons.find((lesson) => lesson.id === previousId);
    if (previousLesson) {
      openLessonInRecords(previousLesson, { pushHistory: false });
      return;
    }
    setSelectedId(previousId);
  }

  function goBackToLessonSource() {
    if (!lessonReturnTarget) return;
    if (lessonReturnTarget.kind === "panel") {
      if (lessonReturnTarget.panel === "calendar") {
        if (lessonReturnTarget.calendarDate) {
          setSelectedCalendarDate(lessonReturnTarget.calendarDate);
        }
        if (lessonReturnTarget.calendarMonth) {
          setCalendarMonth(lessonReturnTarget.calendarMonth);
        }
        if (lessonReturnTarget.calendarMode) {
          setCalendarMode(lessonReturnTarget.calendarMode);
        }
        setCalendarDetailDate(lessonReturnTarget.calendarDetailDate ?? null);
      }
      setLessonReturnTarget(null);
      setSchedulePanel(lessonReturnTarget.panel);
      return;
    }
    setLessonReturnTarget(null);
    onReturnToView(lessonReturnTarget);
  }

  return {
    initialFocusedDate,
    calendarMonth,
    setCalendarMonth,
    calendarMode,
    setCalendarMode,
    selectedCalendarDate,
    setSelectedCalendarDate,
    calendarViewCampusFilter,
    setCalendarViewCampusFilter,
    calendarViewCourseTypeFilter,
    setCalendarViewCourseTypeFilter,
    calendarViewGradeFilter,
    setCalendarViewGradeFilter,
    calendarViewSubjectFilter,
    setCalendarViewSubjectFilter,
    calendarViewStudentFilter,
    setCalendarViewStudentFilter,
    calendarViewMakeupFilter,
    setCalendarViewMakeupFilter,
    calendarDetailDate,
    setCalendarDetailDate,
    selectedId,
    setSelectedId,
    lessonHistory,
    lessonReturnTarget,
    campusFilter,
    setCampusFilter,
    studentFilter,
    setStudentFilter,
    courseTypeFilter,
    setCourseTypeFilter,
    lessonScope,
    setLessonScope,
    lessonMonth,
    setLessonMonth,
    setLessonDay,
    lessonRangeStart,
    setLessonRangeStart,
    lessonRangeEnd,
    setLessonRangeEnd,
    lessonWeek,
    setLessonWeek,
    syncRecordsWithCalendarDate,
    setSyncRecordsWithCalendarDate,
    showOnlyMakeup,
    setShowOnlyMakeup,
    makeupManagementTab,
    setMakeupManagementTab,
    schedulePanel,
    setSchedulePanel,
    calendarViewCampusOptions,
    calendarViewCourseTypeOptions,
    calendarViewGradeOptions,
    calendarViewSubjectOptions,
    calendarDayNoteForDate,
    calendarLessonsForDate,
    selectedCalendarLessons,
    selectedCalendarDateAllLessons,
    selectedCalendarRefreshableLessons,
    selectedCalendarWeekLessons,
    selectedCalendarCompletedCount,
    selectedCalendarPendingCount,
    selectedCalendarCancelledCount,
    selectedCalendarAmount,
    selectedCalendarDayNote,
    calendarDetailLessons,
    calendarDetailDayNote,
    calendarDetailAmount,
    calendarDetailCompletedCount,
    calendarDetailPendingCount,
    calendarDetailCancelledCount,
    effectiveLessonScope,
    effectiveLessonDay,
    lessons,
    selected,
    switchSchedulePanel,
    openDateInRecords,
    openLessonInRecords,
    goBackToPreviousLesson,
    goBackToLessonSource
  };
}
