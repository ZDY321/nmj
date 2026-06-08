import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  Bot,
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
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  WandSparkles
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TimeTextInput } from "@/components/ui/time-text-input";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { LessonChecklistLinker } from "@/frontend/components/LessonChecklistLinker";
import { ScheduleCalendarDetailDialog } from "@/frontend/components/ScheduleCalendarDetailDialog";
import { SchedulePanelTabs } from "@/frontend/components/SchedulePanelTabs";
import { ScheduleRecordsListCard } from "@/frontend/components/ScheduleRecordsListCard";
import { ScheduleStudentStatsPanel } from "@/frontend/components/ScheduleStudentStatsPanel";
import { ScheduleTrashPanel } from "@/frontend/components/ScheduleTrashPanel";
import type { AiProviderConfig, AiScheduleDraftResponse, AiScheduleSession, AiScheduleTaskType, AttendanceStatus, CourseGroup, DeletedLesson, Lesson, TeacherVault, TimePreset, UserRole, WeekStart, Weekday } from "@/shared/types";
import { buildFeeSnapshot, calculateClassHeadcountFee, formatAppDateTime, getCourse, lessonBillableHours, lessonDurationMultiplier, presentCount, resolveSalaryGradeRule, salaryGradeAmountForCount, todayIso } from "@/frontend/lib/calculations";
import { generateAiScheduleDraft, getAiProviders, getUsableAiProviders } from "@/frontend/lib/cloud";
import { makeId } from "@/frontend/lib/crypto";
import {
  attendanceLabels,
  addDays,
  attendedStudentIdsForLesson,
  attendedStudentNamesForLesson,
  buildScheduleSyncLessonsForDate,
  calendarDates,
  campusName,
  compareByName,
  courseName,
  courseSubject,
  courseTypeLabel,
  createLessonFromCourse,
  findStudent,
  formatDateIso,
  formatPrivateMoney,
  isMakeupNeededAttendanceEntry,
  isMakeupAttendanceStatus,
  lessonStatusLabels,
  lessonStatusSurfaceClass,
  lessonStatusVariant,
  lessonStudentDisplay,
  lessonStudentIds,
  linkSyncedLessonsToPreviousLessons,
  makeupNeededStudentIds,
  monthShift,
  orderedWeekdayLabels,
  orderedWeekdays,
  previousLesson,
  shortWeekdayLabels,
  sortCampusesForProfile,
  sortCoursesByName,
  sortLessons,
  sortStudentsByName,
  studentNames,
  subjectOptionsForVault,
  weekDatesFor,
  weekStartsOn,
  weekdayOfDateIso,
  weekdayLabels
} from "@/frontend/lib/helpers";
import {
  aiActionLabel,
  aiChatEndpoint,
  aiFieldLabel,
  arrayValue,
  attendanceStatusForLessonStatus,
  attendanceSurfaceClass,
  buildStudentStatsGroupedLessonRows,
  buildStudentStatsRows,
  canRestoreDeletedLesson,
  datesBetweenLocal,
  datesForIsoWeekValue,
  deletedLessonSearchText,
  deletedLessonSourceLabel,
  deletedLessonSourceVariant,
  filterScheduleCourseOptions,
  filteredStudentIdsForStats,
  formatAiValue,
  isCompletedLessonStatus,
  isOrderedDateRange,
  isOrderedTimeRange,
  isPendingLessonStatus,
  isPlainRecord,
  isoWeekValue,
  lessonSearchText,
  lessonStatusForAttendanceStatus,
  offsetDate,
  textValue,
  timeToMinutes,
  timesOverlap
} from "@/frontend/lib/scheduleViewHelpers";
import type { CalendarFocus, CourseTypeFilter, ExternalLessonReturnTarget, InternalLessonReturnTarget, LessonReturnTarget, LessonScope, SchedulePanel } from "@/frontend/lib/scheduleViewTypes";

function dateWithWeekday(date: string): string {
  return `${date} · ${weekdayLabels[weekdayOfDateIso(date)]}`;
}

function optionalDateWithWeekday(date: string | null | undefined): string {
  return date ? dateWithWeekday(date) : "未知";
}

export function ScheduleView({
  vault,
  amountsVisible,
  onAddLesson,
  onAddLessons,
  onAddLessonAndUpdateLesson,
  onUpdateLesson,
  onDeleteLesson,
  onRestoreDeletedLessons,
  onPermanentlyDeleteDeletedLessons,
  onAddCustomTimePreset,
  onDeleteCustomTimePreset,
  onGenerateDrafts,
  onWeekStartChange,
  role,
  token,
  calendarFocus,
  aiSession,
  onAiSessionChange,
  onApplyAiDraft,
  onReturnToView
}: {
  vault: TeacherVault;
  amountsVisible: boolean;
  onAddLesson: (lesson: Lesson) => void;
  onAddLessons: (lessons: Lesson[], options?: { replaceLessonIds?: string[] }) => void;
  onAddLessonAndUpdateLesson: (lessonToAdd: Lesson, lessonToUpdate: Lesson) => void;
  onUpdateLesson: (lesson: Lesson) => void;
  onDeleteLesson: (lessonId: string) => void;
  onRestoreDeletedLessons: (deletedLessonIds: string[]) => void;
  onPermanentlyDeleteDeletedLessons: (deletedLessonIds: string[]) => void;
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
  role: UserRole;
  token: string;
  calendarFocus?: CalendarFocus;
  aiSession: AiScheduleSession | null;
  onAiSessionChange: (session: AiScheduleSession | null) => void;
  onApplyAiDraft: (session: AiScheduleSession | null) => { ok: boolean; message: string };
  onReturnToView: (target: ExternalLessonReturnTarget) => void;
}) {
  const initialFocusedDate = calendarFocus?.date ?? todayIso();
  const initialFocusedMonth = initialFocusedDate.slice(0, 7);
  const initialTargetPanel = calendarFocus?.targetPanel ?? "calendar";
  const initialSelectedLessonId = calendarFocus?.lessonId ?? vault.lessons[0]?.id ?? "";
  const weekStartPreference = weekStartsOn(vault);
  const initialWeekDates = weekDatesFor(initialFocusedDate, weekStartPreference);
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
  const [calendarStartTime, setCalendarStartTime] = useState("19:00");
  const [calendarEndTime, setCalendarEndTime] = useState("21:00");
  const [calendarMonth, setCalendarMonth] = useState(initialFocusedMonth);
  const [calendarMode, setCalendarMode] = useState<"schedule" | "view">("view");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(initialFocusedDate);
  const [calendarViewCampusFilter, setCalendarViewCampusFilter] = useState("all");
  const [calendarViewGradeFilter, setCalendarViewGradeFilter] = useState("all");
  const [calendarViewSubjectFilter, setCalendarViewSubjectFilter] = useState("all");
  const [calendarViewStudentFilter, setCalendarViewStudentFilter] = useState("");
  const [syncSourceDate, setSyncSourceDate] = useState(addDays(initialFocusedDate, -7));
  const [syncTargetDate, setSyncTargetDate] = useState(initialFocusedDate);
  const [syncRangeSourceStart, setSyncRangeSourceStart] = useState(addDays(initialWeekDates[0] ?? initialFocusedDate, -7));
  const [syncRangeSourceEnd, setSyncRangeSourceEnd] = useState(addDays(initialWeekDates[6] ?? initialFocusedDate, -7));
  const [syncRangeTargetStart, setSyncRangeTargetStart] = useState(initialWeekDates[0] ?? initialFocusedDate);
  const [syncRangeTargetEnd, setSyncRangeTargetEnd] = useState(initialWeekDates[6] ?? initialFocusedDate);
  const [selectedSyncLessonIds, setSelectedSyncLessonIds] = useState<string[]>([]);
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);
  const [calendarDetailDate, setCalendarDetailDate] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(initialSelectedLessonId);
  const [lessonHistory, setLessonHistory] = useState<string[]>([]);
  const [lessonReturnTarget, setLessonReturnTarget] = useState<LessonReturnTarget | null>(calendarFocus?.returnTarget ?? null);
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
  const [expandedStudentStatsGroupIds, setExpandedStudentStatsGroupIds] = useState<string[]>([]);
  const [lessonScope, setLessonScope] = useState<LessonScope>("month");
  const [lessonMonth, setLessonMonth] = useState(initialFocusedMonth);
  const [lessonDay, setLessonDay] = useState(initialFocusedDate);
  const [lessonRangeStart, setLessonRangeStart] = useState(todayIso());
  const [lessonRangeEnd, setLessonRangeEnd] = useState(todayIso());
  const [lessonWeek, setLessonWeek] = useState(isoWeekValue(todayIso()));
  const [syncRecordsWithCalendarDate, setSyncRecordsWithCalendarDate] = useState(true);
  const [showOnlyMakeup, setShowOnlyMakeup] = useState(false);
  const [schedulePanel, setSchedulePanel] = useState<SchedulePanel>(initialTargetPanel);
  const [customPresetStart, setCustomPresetStart] = useState("08:00");
  const [customPresetEnd, setCustomPresetEnd] = useState("10:00");
  const [temporaryStudentId, setTemporaryStudentId] = useState("");
  const [temporaryStudentSearch, setTemporaryStudentSearch] = useState("");
  const [attendanceStudentFilter, setAttendanceStudentFilter] = useState("");
  const [attendancePanelOpen, setAttendancePanelOpen] = useState(false);
  const [trashDateStart, setTrashDateStart] = useState("");
  const [trashDateEnd, setTrashDateEnd] = useState("");
  const [trashCampusFilter, setTrashCampusFilter] = useState("all");
  const [trashSourceFilter, setTrashSourceFilter] = useState<"all" | DeletedLesson["source"]>("all");
  const [trashSearch, setTrashSearch] = useState("");
  const [selectedTrashIds, setSelectedTrashIds] = useState<string[]>([]);
  const [makeupOriginalDateFilter, setMakeupOriginalDateFilter] = useState("");
  const [makeupDate, setMakeupDate] = useState(todayIso());
  const [makeupStartTime, setMakeupStartTime] = useState("19:00");
  const [makeupEndTime, setMakeupEndTime] = useState("21:00");
  const [detailMakeupStudentIds, setDetailMakeupStudentIds] = useState<string[]>([]);
  const [makeupArrangementOpen, setMakeupArrangementOpen] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [aiProviders, setAiProviders] = useState<AiProviderConfig[]>([]);
  const aiProviderId = aiSession?.providerId ?? "";
  const aiTaskType = aiSession?.taskType ?? "auto";
  const aiInstruction = aiSession?.instruction ?? "";
  const aiFollowupAnswer = aiSession?.followupAnswer ?? "";
  const aiDraft = aiSession?.draft ?? null;
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [aiApplyResult, setAiApplyResult] = useState<{ ok: boolean; message: string } | null>(null);
  const aiMessage = aiSession?.message ?? "";
  const { confirm, dialog } = useConfirmDialog();
  const isAdmin = role === "admin";
  const calendarViewCampusOptions = sortCampusesForProfile(vault.campuses, vault.profile.homeCampusId);
  const calendarViewGradeOptions = Array.from(
    new Set(vault.students.map((student) => student.grade?.trim()).filter((grade): grade is string => Boolean(grade)))
  ).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  const calendarViewSubjectOptions = subjectOptionsForVault(vault);
  const syncSourceLessons = vault.lessons
    .filter((lesson) => lesson.date === syncSourceDate)
    .sort(sortLessons);
  const syncSourceLessonIds = syncSourceLessons.map((lesson) => lesson.id).join("|");
  const selectableSyncLessons = syncSourceLessons.filter((lesson) => getCourse(vault, lesson.courseGroupId)?.status === "active");
  const selectableSyncLessonIds = selectableSyncLessons.map((lesson) => lesson.id).join("|");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const loadProviders = isAdmin ? getAiProviders : getUsableAiProviders;
    loadProviders(token)
      .then((providers) => {
        if (cancelled) return;
        setAiProviders(providers);
        const nextProviderId = aiProviderId && providers.some((provider) => provider.id === aiProviderId && provider.enabled)
          ? aiProviderId
          : providers.find((provider) => provider.enabled && provider.isDefault)?.id ?? providers.find((provider) => provider.enabled)?.id ?? "";
        if (nextProviderId !== aiProviderId) {
          patchAiSession({ providerId: nextProviderId });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setAiProviders([]);
        patchAiSession({ message: error instanceof Error ? error.message : "AI 配置加载失败。" });
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, token]);

  useEffect(() => {
    const fallbackCourseId = courseSelectionOptions[0]?.id ?? "";
    const hasCourse = (courseId: string) => courseSelectionOptions.some((course) => course.id === courseId);
    setSingleCourseGroupId((current) => (hasCourse(current) ? current : fallbackCourseId));
    setRuleCourseGroupId((current) => (hasCourse(current) ? current : fallbackCourseId));
    setCalendarCourseGroupId((current) => (hasCourse(current) ? current : fallbackCourseId));
  }, [courseSelectionOptionIds]);

  useEffect(() => {
    setCalendarViewCampusFilter((current) =>
      current === "all" || calendarViewCampusOptions.some((campus) => campus.id === current) ? current : "all"
    );
    setCalendarViewGradeFilter((current) =>
      current === "all" || calendarViewGradeOptions.some((grade) => grade === current) ? current : "all"
    );
    setCalendarViewSubjectFilter((current) =>
      current === "all" || calendarViewSubjectOptions.some((subject) => subject === current) ? current : "all"
    );
  }, [calendarViewCampusOptions, calendarViewGradeOptions, calendarViewSubjectOptions]);

  useEffect(() => {
    setSyncTargetDate(selectedCalendarDate);
    setSyncSourceDate(addDays(selectedCalendarDate, -7));
    const selectedWeekDates = weekDatesFor(selectedCalendarDate, weekStartPreference);
    setSyncRangeSourceStart(addDays(selectedWeekDates[0] ?? selectedCalendarDate, -7));
    setSyncRangeSourceEnd(addDays(selectedWeekDates[6] ?? selectedCalendarDate, -7));
    setSyncRangeTargetStart(selectedWeekDates[0] ?? selectedCalendarDate);
    setSyncRangeTargetEnd(selectedWeekDates[6] ?? selectedCalendarDate);
    setMakeupDate(selectedCalendarDate);
  }, [selectedCalendarDate, weekStartPreference]);

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
    setMakeupArrangementOpen(false);
    setDetailMakeupStudentIds([]);
  }, [selectedId]);

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
      const focusedLesson = vault.lessons.find((lesson) => lesson.id === calendarFocus.lessonId);
      if (focusedLesson) {
        setLessonHistory([]);
        openLessonInRecords(focusedLesson, { pushHistory: false, returnTarget: calendarFocus.returnTarget ?? null });
      } else {
        setLessonReturnTarget(calendarFocus.returnTarget ?? null);
        setSelectedId(calendarFocus.lessonId);
      }
    }
  }, [calendarFocus?.nonce]);

  useEffect(() => {
    setDetailMakeupStudentIds([]);
    setAttendancePanelOpen(false);
  }, [selectedId]);

  useEffect(() => {
    const availableTrashIds = new Set((vault.deletedLessons ?? []).map((item) => item.id));
    setSelectedTrashIds((current) => current.filter((id) => availableTrashIds.has(id)));
  }, [vault.deletedLessons]);

  const visibleWeekdays = orderedWeekdays(weekStartPreference);
  const visibleWeekdayLabels = orderedWeekdayLabels(weekStartPreference, shortWeekdayLabels);
  const customTimePresets = vault.preferences?.customTimePresets ?? [];
  const singleCourseOptions = filterScheduleCourseOptions(vault, courseSelectionOptions, singleCourseSearch, singleCourseGroupId);
  const ruleCourseOptions = filterScheduleCourseOptions(vault, courseSelectionOptions, ruleCourseSearch, ruleCourseGroupId);
  const calendarCourseOptions = filterScheduleCourseOptions(vault, courseSelectionOptions, calendarCourseSearch, calendarCourseGroupId);
  const activeMakeupLessons = vault.lessons
    .filter((lesson) => (Boolean(lesson.linkedOriginalLessonId) || Boolean(lesson.makeupOriginalDate)) && lesson.status !== "cancelled")
    .sort(sortLessons);
  const activeMakeupLessonsByOriginal = activeMakeupLessons.reduce<Record<string, Lesson[]>>((groups, lesson) => {
    const originalId = lesson.linkedOriginalLessonId ?? findOriginalLessonForMakeupLesson(lesson)?.id;
    if (!originalId) return groups;
    groups[originalId] = [...(groups[originalId] ?? []), lesson];
    return groups;
  }, {});
  const selectedSyncLessons = syncSourceLessons.filter((lesson) => selectedSyncLessonIds.includes(lesson.id));
  const syncRangeSourceDates = datesBetweenLocal(syncRangeSourceStart, syncRangeSourceEnd);
  const syncRangeTargetDates = datesBetweenLocal(syncRangeTargetStart, syncRangeTargetEnd);
  const syncRangeSourceLessons = vault.lessons.filter((lesson) => syncRangeSourceDates.includes(lesson.date));
  const syncRangeActiveLessons = syncRangeSourceLessons.filter((lesson) => getCourse(vault, lesson.courseGroupId)?.status === "active");
  const selectedCalendarLessons = calendarLessonsForDate(selectedCalendarDate);
  const selectedCalendarWeekLessons = vault.lessons.filter((lesson) => weekDatesFor(selectedCalendarDate, weekStartPreference).includes(lesson.date) && matchesCalendarLessonFilter(lesson));
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
        makeupNeededStudentIds(lesson).length > 0 ||
        (lesson.status === "makeup_pending" && lesson.attendance.length === 0) ||
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
  const studentStatsGroupedLessonRows = buildStudentStatsGroupedLessonRows(vault, studentStatsLessons, normalizedStudentStatsNameFilter);
  const studentStatsStudentLessonCount = studentStatsLessons.reduce((sum, lesson) => sum + filteredStudentIdsForStats(vault, lesson, normalizedStudentStatsNameFilter).length, 0);
  const studentStatsTotalFee = studentStatsLessons.reduce((sum, lesson) => sum + lesson.feeSnapshot.amount, 0);
  const studentStatsCompletedCount = studentStatsLessons.filter((lesson) => isCompletedLessonStatus(lesson.status)).length;
  const deletedLessons = [...(vault.deletedLessons ?? [])].sort((a, b) =>
    `${b.deletedAt} ${b.lesson.date} ${b.lesson.startTime}`.localeCompare(`${a.deletedAt} ${a.lesson.date} ${a.lesson.startTime}`)
  );
  const normalizedTrashSearch = trashSearch.trim().toLowerCase();
  const trashLessons = deletedLessons.filter((item) => {
    const lesson = item.lesson;
    const course = getCourse(vault, lesson.courseGroupId);
    const campusId = lesson.campusId ?? course?.defaultCampusId;
    const matchesDate =
      (!trashDateStart || lesson.date >= trashDateStart) &&
      (!trashDateEnd || lesson.date <= trashDateEnd) &&
      (!trashDateStart || !trashDateEnd || trashDateStart <= trashDateEnd);
    const matchesCampus = trashCampusFilter === "all" || campusId === trashCampusFilter;
    const matchesSource = trashSourceFilter === "all" || item.source === trashSourceFilter;
    const searchText = deletedLessonSearchText(vault, item);
    const matchesSearch =
      !normalizedTrashSearch ||
      normalizedTrashSearch.split(/\s+/).filter(Boolean).every((term) => searchText.includes(term));
    return matchesDate && matchesCampus && matchesSource && matchesSearch;
  });
  const selectedTrashIdSet = new Set(selectedTrashIds);
  const selectedVisibleTrashIds = trashLessons.filter((item) => selectedTrashIdSet.has(item.id)).map((item) => item.id);
  const allVisibleTrashSelected = trashLessons.length > 0 && trashLessons.every((item) => selectedTrashIdSet.has(item.id));
  const activeLessonIds = new Set(vault.lessons.map((lesson) => lesson.id));
  const selectedTrashRestoreCount = selectedVisibleTrashIds.filter((id) => {
    const item = trashLessons.find((deletedLesson) => deletedLesson.id === id);
    return item ? canRestoreDeletedLesson(vault, activeLessonIds, item) : false;
  }).length;
  const selected = vault.lessons.find((lesson) => lesson.id === selectedId) ?? lessons[0];
  const selectedCourse = selected ? getCourse(vault, selected.courseGroupId) : undefined;
  const selectedOriginalLesson = selected?.linkedOriginalLessonId
    ? vault.lessons.find((lesson) => lesson.id === selected.linkedOriginalLessonId)
    : undefined;
  const selectedPreviousLesson = selected ? previousLesson(vault, selected) : undefined;
  const selectedPreviousTaught = selectedPreviousLesson?.content.taught.trim() ?? "";
  const selectedPreviousHomework = selectedPreviousLesson?.content.homework.trim() ?? "";
  const selectedLessonStudentCount = selected ? lessonStudentIds(selected).length : 0;
  const selectedExpectedStudentCount = selected ? new Set(selected.expectedStudentIds).size : 0;
  const selectedAttendedStudentCount = selected ? attendedStudentIdsForLesson(selected).length : 0;
  const selectedScheduledMakeupStudentIds = selected ? activeMakeupStudentIdsForOriginal(selected.id) : new Set<string>();
  const selectedLinkedMakeupLessons = selected && !selected.linkedOriginalLessonId ? activeMakeupLessonsByOriginal[selected.id] ?? [] : [];
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
  const availableTrialStudentOptionCount = temporaryStudentOptions.filter((student) => student.temporaryTrial).length;
  const selectedNamedTrialStudentCount = selected
    ? selected.attendance.filter((entry) => {
        const student = findStudent(vault, entry.studentId);
        return Boolean(entry.trial ?? student?.temporaryTrial);
      }).length
    : 0;
  const selectedAttendanceEntries = selected
    ? selected.attendance.filter((entry) => {
        const student = findStudent(vault, entry.studentId);
        const searchable = [
          student?.name ?? "",
          student?.grade ?? "",
          campusName(vault, student?.defaultCampusId),
          student?.note ?? "",
          attendanceLabels[entry.status],
          entry.temporary ? "临时加入" : "",
          (entry.trial ?? student?.temporaryTrial) ? "试听 试听学生" : ""
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

  function findOriginalLessonForMakeupLesson(makeupLesson: Lesson): Lesson | undefined {
    if (makeupLesson.linkedOriginalLessonId) {
      return vault.lessons.find((lesson) => lesson.id === makeupLesson.linkedOriginalLessonId);
    }
    if (!makeupLesson.makeupOriginalDate) return undefined;
    const makeupStudentIds = new Set(lessonStudentIds(makeupLesson));
    const candidates = vault.lessons.filter(
      (lesson) =>
        lesson.id !== makeupLesson.id &&
        !lesson.linkedOriginalLessonId &&
        lesson.courseGroupId === makeupLesson.courseGroupId &&
        lesson.date === makeupLesson.makeupOriginalDate &&
        lesson.status !== "cancelled"
    );
    return candidates.find((lesson) => lessonStudentIds(lesson).some((studentId) => makeupStudentIds.has(studentId))) ?? candidates[0];
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
        .filter((entry) => isMakeupNeededAttendanceEntry(entry))
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
      original: findOriginalLessonForMakeupLesson(lesson)
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
  const aiActiveStudentCount = vault.students.filter((student) => student.status === "active").length;
  const aiActiveCourseCount = vault.courseGroups.filter((course) => course.status === "active").length;
  const aiPendingLessonCount = vault.lessons.filter((lesson) => lesson.status === "scheduled" || lesson.status === "makeup_pending").length;
  const aiTodayLessonCount = vault.lessons.filter((lesson) => lesson.date === todayIso()).length;
  const aiContextSummary = {
    activeStudents: aiActiveStudentCount,
    activeCourses: aiActiveCourseCount,
    pendingLessons: aiPendingLessonCount,
    todayLessons: aiTodayLessonCount,
    campuses: vault.campuses.length,
    subjects: subjectOptionsForVault(vault)
  };
  const enabledAiProviders = aiProviders.filter((provider) => provider.enabled);
  const selectedAiProvider = aiProviders.find((provider) => provider.id === aiProviderId);
  const canShowAiProviderEndpoint = isAdmin;
  const selectedAiEndpoint = selectedAiProvider ? aiChatEndpoint(selectedAiProvider.baseUrl, selectedAiProvider) : "";
  const aiDraftRecord = isPlainRecord(aiDraft?.draft) ? aiDraft.draft : null;
  const aiDraftActions = arrayValue(aiDraftRecord?.actions).filter(isPlainRecord);
  const aiDraftQuestions = arrayValue(aiDraftRecord?.questions);
  const aiDraftWarnings = arrayValue(aiDraftRecord?.warnings);
  const aiDraftSummary = textValue(aiDraftRecord?.summary, aiDraft ? "AI 已生成建议，请按下方内容核对。" : "");
  const aiDraftAnswer = textValue(aiDraftRecord?.answer ?? aiDraftRecord?.result ?? aiDraftRecord?.analysis, "");
  const aiRawResultText = aiDraft ? JSON.stringify(aiDraft.draft ?? aiDraft.text, null, 2) : "";
  const canClearAiWork = Boolean(aiInstruction || aiFollowupAnswer || aiDraft || aiMessage || aiApplyResult);
  const aiDraftCanApply = !aiLoading && !aiApplying && aiApplyResult?.ok !== true && aiDraftActions.length > 0 && aiDraftQuestions.length === 0;
  const selectedAiUsage = selectedAiProvider
    ? {
        dailyLimit: selectedAiProvider.dailyLimit,
        usedToday: selectedAiProvider.usedToday ?? 0,
        remainingToday: selectedAiProvider.remainingToday ?? Math.max(selectedAiProvider.dailyLimit - (selectedAiProvider.usedToday ?? 0), 0)
      }
    : null;
  const aiUsageText = selectedAiUsage
    ? `今日已用 ${selectedAiUsage.usedToday} 次 / 剩余 ${selectedAiUsage.remainingToday} 次 / 每人上限 ${selectedAiUsage.dailyLimit} 次`
    : "未选择接口，暂无法显示今日次数";

  function patchAiSession(patch: Partial<AiScheduleSession>) {
    if ("draft" in patch) {
      setAiApplyResult(null);
    }
    onAiSessionChange({
      providerId: aiProviderId,
      taskType: aiTaskType,
      instruction: aiInstruction,
      followupAnswer: aiFollowupAnswer,
      draft: aiDraft,
      message: aiMessage,
      ...patch
    });
  }

  function patchSelectedAiProviderUsage(result: AiScheduleDraftResponse) {
    if (!result.providerUsage) return;
    setAiProviders((current) =>
      current.map((provider) =>
        provider.id === result.providerId
          ? {
              ...provider,
              dailyLimit: result.providerUsage?.dailyLimit ?? provider.dailyLimit,
              usedToday: result.providerUsage?.usedToday,
              remainingToday: result.providerUsage?.remainingToday
            }
          : provider
      )
    );
  }

  async function copyAiRawResult() {
    if (!aiRawResultText) {
      patchAiSession({ message: "暂无可复制的原始返回内容。" });
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(aiRawResultText);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = aiRawResultText;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (!copied) throw new Error("copy failed");
      }
      patchAiSession({ message: "原始返回内容已复制。" });
    } catch {
      patchAiSession({ message: "复制失败，请手动选中原始内容复制。" });
    }
  }

  function clearAiWork() {
    setAiApplyResult(null);
    patchAiSession({ instruction: "", followupAnswer: "", draft: null, message: "" });
  }

  function addSingleLesson(status: "scheduled" | "completed") {
    addLessonFromCourse(singleCourseGroupId, singleDate, singleStartTime, singleEndTime, status);
  }

  function aiScheduleContext() {
    const today = todayIso();
    const currentMonth = today.slice(0, 7);
    const analyticsStart = addDays(today, -90);
    const analyticsEnd = addDays(today, 120);
    const activeStudents = vault.students
      .filter((student) => student.status === "active")
      .map((student) => ({
        id: student.id,
        name: student.name,
        grade: student.grade ?? "",
        school: student.school ?? "",
        campus: campusName(vault, student.defaultCampusId),
        note: student.note ?? "",
        status: student.status,
        temporaryTrial: student.temporaryTrial ?? false
      }));
    const activeCourses = vault.courseGroups
      .filter((course) => course.status === "active")
      .map((course) => ({
        id: course.id,
        name: course.name,
        subject: course.subject,
        type: courseTypeLabel(vault, course.type),
        campus: campusName(vault, course.defaultCampusId),
        students: studentNames(vault, course.studentIds)
      }));
    const nearbyLessons = vault.lessons
      .filter((lesson) => lesson.date >= addDays(todayIso(), -14) && lesson.date <= addDays(todayIso(), 45))
      .sort(sortLessons)
      .map((lesson) => ({
        id: lesson.id,
        date: lesson.date,
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        courseId: lesson.courseGroupId,
        courseName: courseName(vault, lesson.courseGroupId),
        subject: courseSubject(vault, lesson.courseGroupId),
        campus: campusName(vault, lesson.campusId),
        status: lessonStatusLabels[lesson.status],
        students: attendedStudentNamesForLesson(vault, lesson) || studentNames(vault, lessonStudentIds(lesson))
      }));
    const analyticsLessons = vault.lessons
      .filter((lesson) => lesson.date >= analyticsStart && lesson.date <= analyticsEnd)
      .sort(sortLessons)
      .map((lesson) => {
        const course = getCourse(vault, lesson.courseGroupId);
        const amount = lesson.feeSnapshot.amount;
        const hasKnownFee = Number.isFinite(amount);
        return {
          id: lesson.id,
          date: lesson.date,
          weekday: weekdayLabels[weekdayOfDateIso(lesson.date)],
          startTime: lesson.startTime,
          endTime: lesson.endTime,
          courseId: lesson.courseGroupId,
          courseName: courseName(vault, lesson.courseGroupId),
          subject: courseSubject(vault, lesson.courseGroupId),
          courseType: courseTypeLabel(vault, lesson.type),
          campus: campusName(vault, lesson.campusId ?? course?.defaultCampusId),
          status: lesson.status,
          statusLabel: lessonStatusLabels[lesson.status],
          students: studentNames(vault, lessonStudentIds(lesson)),
          hours: lessonBillableHours(lesson),
          feeAmount: hasKnownFee ? amount : null,
          feeKnown: hasKnownFee
        };
      });
    const summariseLessons = (lessons: typeof analyticsLessons) => ({
      count: lessons.length,
      totalHours: Number(lessons.reduce((sum, lesson) => sum + lesson.hours, 0).toFixed(2)),
      knownFeeCount: lessons.filter((lesson) => lesson.feeKnown).length,
      totalKnownFee: lessons.reduce((sum, lesson) => sum + (lesson.feeAmount ?? 0), 0),
      hasUnknownFee: lessons.some((lesson) => !lesson.feeKnown),
      byDate: Object.values(lessons.reduce<Record<string, { date: string; count: number; totalHours: number; totalKnownFee: number }>>((map, lesson) => {
        const item = map[lesson.date] ?? { date: lesson.date, count: 0, totalHours: 0, totalKnownFee: 0 };
        item.count += 1;
        item.totalHours = Number((item.totalHours + lesson.hours).toFixed(2));
        item.totalKnownFee += lesson.feeAmount ?? 0;
        map[lesson.date] = item;
        return map;
      }, {}))
    });
    const currentWeekStart = addDays(today, -((weekdayOfDateIso(today) - weekStartPreference + 7) % 7));
    const currentWeekEnd = addDays(currentWeekStart, 6);
    const currentWeekLessons = analyticsLessons.filter((lesson) => lesson.date >= currentWeekStart && lesson.date <= currentWeekEnd);
    const currentMonthLessons = analyticsLessons.filter((lesson) => lesson.date.startsWith(currentMonth));
    const morningEightToTenLessons = analyticsLessons.filter((lesson) => lesson.startTime < "10:00" && lesson.endTime > "08:00");

    return {
      today,
      selectedCalendarDate,
      selectedCalendarMonth: calendarMonth,
      campuses: vault.campuses.map((campus) => ({ id: campus.id, name: campus.name })),
      subjects: subjectOptionsForVault(vault),
      activeStudents,
      activeCourses,
      nearbyLessons,
      analyticsRange: { start: analyticsStart, end: analyticsEnd },
      analyticsLessons,
      lessonAnalytics: {
        currentWeek: { start: currentWeekStart, end: currentWeekEnd, ...summariseLessons(currentWeekLessons) },
        currentMonth: { month: currentMonth, ...summariseLessons(currentMonthLessons) }
      },
      timeWindowSummaries: {
        morningEightToTen: {
          startTime: "08:00",
          endTime: "10:00",
          ...summariseLessons(morningEightToTenLessons)
        }
      }
    };
  }

  async function refreshAiProviders() {
    if (!token) return;
    patchAiSession({ message: "" });
    try {
      const providers = await (isAdmin ? getAiProviders(token) : getUsableAiProviders(token));
      setAiProviders(providers);
      const nextProviderId = aiProviderId && providers.some((provider) => provider.id === aiProviderId && provider.enabled)
        ? aiProviderId
        : providers.find((provider) => provider.enabled && provider.isDefault)?.id ?? providers.find((provider) => provider.enabled)?.id ?? "";
      patchAiSession({ providerId: nextProviderId });
    } catch (error) {
      patchAiSession({ message: error instanceof Error ? error.message : "AI 配置加载失败。" });
    }
  }

  async function submitAiDraft() {
    if (!token || !aiProviderId || !aiInstruction.trim()) {
      patchAiSession({ message: !aiProviderId ? "请先选择可用的 AI 接口配置。" : "请先填写要让 AI 处理的内容。" });
      return;
    }
    setAiLoading(true);
    patchAiSession({ draft: null, followupAnswer: "", message: "正在生成新的 AI 建议..." });
    try {
      const result = await generateAiScheduleDraft(token, {
        providerId: aiProviderId,
        taskType: aiTaskType,
        instruction: aiInstruction.trim(),
        context: aiScheduleContext()
      });
      patchSelectedAiProviderUsage(result);
      patchAiSession({ draft: result, message: "AI 建议已生成，请先人工核对。" });
    } catch (error) {
      patchAiSession({ draft: null, message: error instanceof Error ? error.message : "AI 生成建议失败。" });
    } finally {
      setAiLoading(false);
    }
  }

  async function submitAiFollowup() {
    if (!aiFollowupAnswer.trim()) {
      patchAiSession({ message: "请先填写补充信息。" });
      return;
    }
    const questionsText = aiDraftQuestions.map((question, index) => `${index + 1}. ${formatAiValue(question)}`).join("\n");
    const nextInstruction = [
      aiInstruction.trim(),
      "",
      "以下是 AI 上一次提出的需要确认的问题：",
      questionsText || "无",
      "",
      "我补充确认的信息如下，请结合原始需求重新生成完整、可执行的结构化建议：",
      aiFollowupAnswer.trim()
    ].join("\n");
    setAiLoading(true);
    patchAiSession({ instruction: nextInstruction, followupAnswer: "", draft: null, message: "正在根据补充信息重新生成建议..." });
    try {
      const result = await generateAiScheduleDraft(token, {
        providerId: aiProviderId,
        taskType: aiTaskType,
        instruction: nextInstruction,
        context: aiScheduleContext()
      });
      patchSelectedAiProviderUsage(result);
      patchAiSession({ instruction: nextInstruction, followupAnswer: "", draft: result, message: "已带着补充信息重新生成建议，请继续核对。" });
    } catch (error) {
      patchAiSession({ instruction: nextInstruction, followupAnswer: "", draft: null, message: error instanceof Error ? error.message : "AI 生成建议失败。" });
    } finally {
      setAiLoading(false);
    }
  }

  function applyAiDraft() {
    if (aiApplying) return;
    setAiApplying(true);
    setAiApplyResult(null);
    patchAiSession({ message: "正在写入 AI 建议..." });
    const result = onApplyAiDraft({
      providerId: aiProviderId,
      taskType: aiTaskType,
      instruction: aiInstruction,
      followupAnswer: aiFollowupAnswer,
      draft: aiDraft,
      message: aiMessage
    });
    const displayResult = result.ok ? result : { ...result, message: `AI 建议写入失败：${result.message}` };
    setAiApplyResult(displayResult);
    patchAiSession({ message: displayResult.message });
    window.setTimeout(() => setAiApplying(false), 250);
  }

  function matchesCalendarLessonFilter(lesson: Lesson): boolean {
    const course = getCourse(vault, lesson.courseGroupId);
    const campusId = lesson.campusId ?? course?.defaultCampusId;
    const studentIds = lessonStudentIds(lesson);
    const searchable = [
      courseName(vault, lesson.courseGroupId),
      courseSubject(vault, lesson.courseGroupId),
      campusName(vault, campusId),
      studentNames(vault, studentIds),
      lesson.note ?? "",
      ...studentIds.map((studentId) => {
        const student = findStudent(vault, studentId);
        return [student?.name ?? "", student?.grade ?? "", student?.note ?? ""].join(" ");
      })
    ]
      .join(" ")
      .toLowerCase();
    const matchesCampus = calendarViewCampusFilter === "all" || campusId === calendarViewCampusFilter;
    const matchesGrade =
      calendarViewGradeFilter === "all" ||
      studentIds.some((studentId) => findStudent(vault, studentId)?.grade?.trim() === calendarViewGradeFilter);
    const matchesSubject = calendarViewSubjectFilter === "all" || course?.subject === calendarViewSubjectFilter;
    const searchTerms = calendarViewStudentFilter.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matchesStudent = searchTerms.length === 0 || searchTerms.every((term) => searchable.includes(term));
    return matchesCampus && matchesGrade && matchesSubject && matchesStudent;
  }

  function calendarLessonsForDate(date: string): Lesson[] {
    return vault.lessons
      .filter((lesson) => lesson.date === date && matchesCalendarLessonFilter(lesson))
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
    switchSchedulePanel("calendar");
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

  function toggleExpandedStudentStatsGroup(groupId: string) {
    setExpandedStudentStatsGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
    );
  }

  function copyLessonBatchesToDates(
    batches: Array<{ sourceLessons: Lesson[]; targetDate: string; targetStartDate: string }>,
    options: {
      force?: boolean;
      onConfirm: () => void;
      afterSync: () => void;
      conflictDescription: (replaceCount: number) => string;
      skippedMessage?: (syncedCount: number, skippedCount: number) => string;
    }
  ) {
    const syncBuilds = batches.map((batch) => ({
      ...buildScheduleSyncLessonsForDate(vault, batch.sourceLessons, batch.targetDate, batch.targetStartDate),
      targetDate: batch.targetDate
    }));
    const replaceLessonIds = Array.from(new Set(syncBuilds.flatMap((build) => build.replaceLessonIds)));
    const lessonsToAdd = linkSyncedLessonsToPreviousLessons(
      vault,
      syncBuilds.flatMap((build) => build.lessons),
      replaceLessonIds
    );
    const skippedCount = syncBuilds.reduce((sum, build) => sum + build.skippedCount, 0);
    const conflictSkippedCount = syncBuilds.reduce((sum, build) => sum + build.conflictSkippedCount, 0);

    if (replaceLessonIds.length > 0 && !options.force) {
      confirm({
        title: "目标日期已有同课程课节",
        description: options.conflictDescription(replaceLessonIds.length),
        confirmLabel: "覆盖并同步",
        onConfirm: options.onConfirm
      });
      return;
    }

    if (lessonsToAdd.length === 0) {
      showScheduleError(
        conflictSkippedCount > 0
          ? "目标时间已有其他课程，已跳过同步，未覆盖原有手动排课。"
          : skippedCount > 0
            ? "可同步课程已暂停，未同步。"
            : "没有可同步的来源课节。"
      );
      return;
    }

    onAddLessons(lessonsToAdd, { replaceLessonIds });
    options.afterSync();
    setScheduleError("");
    if (skippedCount > 0 || conflictSkippedCount > 0) {
      const messages = [
        skippedCount > 0 ? `${skippedCount} 节来源课程已暂停，未同步` : "",
        conflictSkippedCount > 0 ? `${conflictSkippedCount} 节目标时间已有其他课程，已跳过` : ""
      ].filter(Boolean);
      showScheduleError(
        skippedCount > 0 && conflictSkippedCount === 0 && options.skippedMessage
          ? options.skippedMessage(lessonsToAdd.length, skippedCount)
          : `已同步 ${lessonsToAdd.length} 节；${messages.join("；")}。`
      );
    }
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

    copyLessonBatchesToDates(
      [{ sourceLessons: selectedSyncLessons, targetDate: syncTargetDate, targetStartDate: syncTargetDate }],
      {
        force,
        onConfirm: () => copySelectedLessonsToDate(true),
        afterSync: () => {
          setSelectedCalendarDate(syncTargetDate);
          setCalendarMonth(syncTargetDate.slice(0, 7));
        },
        conflictDescription: (replaceCount) => `${syncTargetDate} 有 ${replaceCount} 节课会被覆盖。已取消的来源课节也会同步为待上课。`
      }
    );
  }

  function copyLessonRangeToDateRange(force = false) {
    if (!syncRangeSourceStart || !syncRangeSourceEnd || !syncRangeTargetStart || !syncRangeTargetEnd) {
      showScheduleError("请选择完整的来源日期段和目标日期段。");
      return;
    }
    if (!isOrderedDateRange(syncRangeSourceStart, syncRangeSourceEnd) || !isOrderedDateRange(syncRangeTargetStart, syncRangeTargetEnd)) {
      showScheduleError("日期段结束日期不能早于开始日期。");
      return;
    }
    if (syncRangeSourceDates.length !== syncRangeTargetDates.length) {
      showScheduleError(`来源日期段有 ${syncRangeSourceDates.length} 天，目标日期段有 ${syncRangeTargetDates.length} 天，请保持天数一致。`);
      return;
    }
    if (syncRangeSourceDates.some((date, index) => date === syncRangeTargetDates[index])) {
      showScheduleError("来源日期和对应目标日期不能相同。");
      return;
    }

    const sourceSnapshot = [...vault.lessons];
    const batches = syncRangeSourceDates.map((sourceDate, index) => ({
      sourceLessons: sourceSnapshot.filter((lesson) => lesson.date === sourceDate),
      targetDate: syncRangeTargetDates[index],
      targetStartDate: syncRangeTargetDates[0]
    }));
    if (!batches.some((batch) => batch.sourceLessons.length > 0)) {
      showScheduleError("来源日期段没有可同步课节。");
      return;
    }

    copyLessonBatchesToDates(batches, {
      force,
      onConfirm: () => copyLessonRangeToDateRange(true),
      afterSync: () => {
        setSelectedCalendarDate(syncRangeTargetStart);
        setCalendarMonth(syncRangeTargetStart.slice(0, 7));
      },
      conflictDescription: (replaceCount) => `${syncRangeTargetStart} 至 ${syncRangeTargetEnd} 有 ${replaceCount} 节同时间课节会被覆盖。已取消的来源课节也会同步为待上课。`,
      skippedMessage: (syncedCount, skippedCount) => `已同步 ${syncedCount} 节；${skippedCount} 节来源课程已暂停，未同步。`
    });
  }

  function fillSyncRangeFromSelectedWeek() {
    const selectedWeekDates = weekDatesFor(selectedCalendarDate, weekStartPreference);
    const targetStart = selectedWeekDates[0] ?? selectedCalendarDate;
    const targetEnd = selectedWeekDates[6] ?? selectedCalendarDate;
    setSyncRangeSourceStart(addDays(targetStart, -7));
    setSyncRangeSourceEnd(addDays(targetEnd, -7));
    setSyncRangeTargetStart(targetStart);
    setSyncRangeTargetEnd(targetEnd);
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
    const normalizedLesson: Lesson = {
      ...lesson,
      attendance: lesson.attendance.map((entry) => ({
        ...entry,
        trial: entry.trial ?? Boolean(vault.students.find((student) => student.id === entry.studentId)?.temporaryTrial)
      }))
    };
    return {
      ...normalizedLesson,
      type: course.type,
      feeSnapshot: buildFeeSnapshot(vault, course, normalizedLesson)
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
        status: attendanceStatus
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
      attendance: course.studentIds.map((studentId) => ({
        studentId,
        status: "attended",
        trial: Boolean(vault.students.find((student) => student.id === studentId)?.temporaryTrial)
      })),
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
        entry.studentId === studentId ? { ...entry, status, makeupExempt: isMakeupAttendanceStatus(status) ? entry.makeupExempt : undefined } : entry
      )
    };
    if (singleStudentLesson) {
      nextLesson.status = lessonStatusForAttendanceStatus(status);
    }
    onUpdateLesson(recalculateLessonFee(nextLesson));
  }

  function statusAfterNoMakeupNeeded(lesson: Lesson): Lesson["status"] {
    if (lesson.attendance.length > 0 && lesson.attendance.every((entry) => entry.status === "cancelled")) return "cancelled";
    if (lesson.attendance.length > 0 && lesson.attendance.every((entry) => entry.status === "makeup_completed")) return "makeup_completed";
    return "completed";
  }

  function updateAttendanceMakeupExempt(studentId: string, makeupExempt: boolean) {
    if (!selected) return;
    const nextLesson: Lesson = {
      ...selected,
      attendance: selected.attendance.map((entry) =>
        entry.studentId === studentId ? { ...entry, makeupExempt: makeupExempt ? true : undefined } : entry
      )
    };
    const neededStudentIds = makeupNeededStudentIds(nextLesson);
    if (makeupExempt && nextLesson.status === "makeup_pending" && neededStudentIds.length === 0) {
      nextLesson.status = statusAfterNoMakeupNeeded(nextLesson);
    }
    if (!makeupExempt && selectedLessonStudentCount <= 1 && neededStudentIds.includes(studentId)) {
      nextLesson.status = "makeup_pending";
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

  function switchSchedulePanel(nextPanel: SchedulePanel) {
    setSchedulePanel(nextPanel);
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
      case "studentStats":
        return { kind: "panel", panel, label: "返回学生课次统计" };
      default:
        return null;
    }
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

  function makeupMarkerForLesson(lesson: Lesson): string | null {
    if (lesson.linkedOriginalLessonId) return "补课";
    const linkedMakeupLessons = activeMakeupLessonsByOriginal[lesson.id] ?? [];
    const completedMakeupCount = linkedMakeupLessons.filter((item) => isCompletedLessonStatus(item.status)).length;
    if (completedMakeupCount > 0 && lesson.attendance.some((entry) => entry.status === "makeup_completed")) {
      return completedMakeupCount === linkedMakeupLessons.length ? "已补课" : "部分已补";
    }
    if (linkedMakeupLessons.length > 0) return "已安排补课";
    if (makeupNeededStudentIds(lesson).length > 0 || (lesson.status === "makeup_pending" && lesson.attendance.length === 0)) {
      return "待补课";
    }
    return null;
  }

  function createSelectedMakeupLesson(studentIds: string[]) {
    if (!selected || studentIds.length === 0) return;
    createMakeupLesson(selected, studentIds);
    setDetailMakeupStudentIds([]);
  }

  function updateTemporaryFee(studentId: string, value?: number) {
    if (!selected) return;
    const nextLesson: Lesson = {
      ...selected,
      attendance: selected.attendance.map((entry) =>
        entry.studentId === studentId ? { ...entry, temporaryFee: value !== undefined && Number.isFinite(value) ? value : undefined } : entry
      )
    };
    onUpdateLesson(recalculateLessonFee(nextLesson));
  }

  function defaultTemporaryFeeForEntry(lesson: Lesson, entry: Lesson["attendance"][number]): number | undefined {
    const course = getCourse(vault, lesson.courseGroupId);
    if (!course || entry.trial) return undefined;
    const presentStudentCount = presentCount(lesson);
    const entryIsPresent = entry.status === "attended" || (Boolean(lesson.linkedOriginalLessonId) && entry.status === "makeup_completed");
    if (!entryIsPresent) return 0;
    const countWithoutEntry = Math.max(presentStudentCount - 1, 0);
    const multiplier = lessonDurationMultiplier(lesson, course.feeRule);
    if (course.feeRule.mode === "salary_grade") {
      const gradeRule = resolveSalaryGradeRule(vault, course.feeRule);
      if (!gradeRule) return undefined;
      return Math.round((salaryGradeAmountForCount(gradeRule, lesson.type, presentStudentCount) - salaryGradeAmountForCount(gradeRule, lesson.type, countWithoutEntry)) * multiplier);
    }
    if (course.feeRule.mode !== "class_headcount") return undefined;
    return Math.round((calculateClassHeadcountFee(course.feeRule, presentStudentCount) - calculateClassHeadcountFee(course.feeRule, countWithoutEntry)) * multiplier);
  }

  function updateTrialStats(patch: Pick<Partial<Lesson>, "trialStudentCount" | "trialFee">) {
    if (!selected) return;
    onUpdateLesson(recalculateLessonFee({ ...selected, ...patch }));
  }

  function addTemporaryStudent() {
    if (!selected || !temporaryStudentId || selected.expectedStudentIds.includes(temporaryStudentId)) return;
    const student = findStudent(vault, temporaryStudentId);
    const isTrialStudent = Boolean(student?.temporaryTrial);
    const next: Lesson = {
      ...selected,
      expectedStudentIds: [...selected.expectedStudentIds, temporaryStudentId],
      attendance: [
        ...selected.attendance,
        {
          studentId: temporaryStudentId,
          status: "attended",
          temporary: true,
          trial: isTrialStudent,
          temporaryFee: undefined,
          note: isTrialStudent ? "试听加入" : "临时添加"
        }
      ]
    };
    onUpdateLesson(recalculateLessonFee(next));
    setTemporaryStudentId("");
    setTemporaryStudentSearch("");
  }

  function removeLessonStudent(studentId: string) {
    if (!selected) return;
    const next: Lesson = {
      ...selected,
      expectedStudentIds: selected.expectedStudentIds.filter((id) => id !== studentId),
      attendance: selected.attendance.filter((entry) => entry.studentId !== studentId)
    };
    onUpdateLesson(recalculateLessonFee(next));
  }

  function askRemoveLessonStudent(studentId: string) {
    const student = findStudent(vault, studentId);
    confirm({
      title: `从本节课移除「${student?.name ?? "未知学生"}」？`,
      description: "只会影响当前课节的学生名单、到课状态和费用快照，不会修改课程档案里的班级学生。",
      confirmLabel: "移除",
      tone: "danger",
      onConfirm: () => removeLessonStudent(studentId)
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
    openLessonInRecords(nextMakeup);
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
        description: `${dateWithWeekday(nextDate)} ${selected.startTime}-${selected.endTime} 与「${courseName(vault, conflict.courseGroupId)} ${conflict.startTime}-${conflict.endTime}」冲突。请确认是否仍要调整。`,
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
        description: `${dateWithWeekday(selected.date)} ${nextStart}-${selected.endTime} 与「${courseName(vault, conflict.courseGroupId)} ${conflict.startTime}-${conflict.endTime}」冲突。请确认是否仍要调整。`,
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
        description: `${dateWithWeekday(selected.date)} ${selected.startTime}-${nextEnd} 与「${courseName(vault, conflict.courseGroupId)} ${conflict.startTime}-${conflict.endTime}」冲突。请确认是否仍要调整。`,
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
      title: "移入回收站？",
      description: `${dateWithWeekday(lesson.date)} ${lesson.startTime}-${lesson.endTime} · ${courseName(vault, lesson.courseGroupId)}。移入后可在回收站恢复。`,
      confirmLabel: "移入回收站",
      tone: "danger",
      onConfirm: () => onDeleteLesson(lesson.id)
    });
  }

  function toggleTrashSelection(id: string) {
    setSelectedTrashIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function toggleAllVisibleTrashSelection() {
    setSelectedTrashIds((current) => {
      const visibleIds = trashLessons.map((item) => item.id);
      if (visibleIds.length === 0) return current;
      if (visibleIds.every((id) => current.includes(id))) {
        return current.filter((id) => !visibleIds.includes(id));
      }
      return Array.from(new Set([...current, ...visibleIds]));
    });
  }

  function restoreTrashItems(ids: string[]) {
    const restorables = ids.filter((id) => {
      const item = deletedLessons.find((deletedLesson) => deletedLesson.id === id);
      return item && canRestoreDeletedLesson(vault, activeLessonIds, item);
    });
    if (restorables.length === 0) {
      showScheduleError("选中的课节当前无法恢复，可能已有同 ID 课节或课程档案已不存在。");
      return;
    }
    onRestoreDeletedLessons(restorables);
    setSelectedTrashIds((current) => current.filter((id) => !restorables.includes(id)));
  }

  function askRestoreTrashItems(ids: string[]) {
    const count = ids.length;
    if (count === 0) return;
    confirm({
      title: count === 1 ? "恢复这节课？" : `恢复选中的 ${count} 节课？`,
      description: "恢复后课节会回到课程记录和日历中，原来的课程内容、作业、学生出勤和费用快照会一并恢复。",
      confirmLabel: "恢复",
      onConfirm: () => restoreTrashItems(ids)
    });
  }

  function askPermanentDeleteTrashItems(ids: string[]) {
    const count = ids.length;
    if (count === 0) return;
    confirm({
      title: count === 1 ? "彻底删除这条回收站记录？" : `彻底删除选中的 ${count} 条回收站记录？`,
      description: "彻底删除后将无法从系统内恢复，请确认这些课节不再需要找回。",
      confirmLabel: "彻底删除",
      tone: "danger",
      onConfirm: () => {
        onPermanentlyDeleteDeletedLessons(ids);
        setSelectedTrashIds((current) => current.filter((id) => !ids.includes(id)));
      }
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
      <ScheduleCalendarDetailDialog
        amountsVisible={amountsVisible}
        completedCount={calendarDetailCompletedCount}
        date={calendarDetailDate}
        dateWithWeekday={dateWithWeekday}
        lessons={calendarDetailLessons}
        makeupMarkerForLesson={makeupMarkerForLesson}
        onClose={() => setCalendarDetailDate(null)}
        onDeleteLesson={askDeleteLesson}
        onOpenLesson={(lesson) => {
          setCalendarDetailDate(null);
          openLessonInRecords(lesson);
        }}
        pendingCount={calendarDetailPendingCount}
        cancelledCount={calendarDetailCancelledCount}
        totalAmount={calendarDetailAmount}
        vault={vault}
      />
      <SchedulePanelTabs
        activePanel={schedulePanel}
        deletedLessonCount={deletedLessons.length}
        onChange={switchSchedulePanel}
      />
      {scheduleError && (
        <div className="rounded-[12px] border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm font-extrabold text-[#b91c1c]">
          {scheduleError}
        </div>
      )}

      {schedulePanel === "ai" && (
        <div className="space-y-6">
          <Card className="overflow-hidden border-2 border-[#bfdbfe]">
            <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                  <Sparkles size={14} /> AI 排课助手
                </div>
                <CardTitle>自然语言转排课操作</CardTitle>
                <CardDescription>AI 会返回结构化建议，确认写入前需要人工核对，原有手动排课功能不受影响。</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="sky">
                  <ShieldCheck size={12} /> {isAdmin ? "管理员" : "普通用户"}
                </Badge>
                <Badge variant={enabledAiProviders.length > 0 ? "sage" : "amber"}>
                  {enabledAiProviders.length > 0 ? `${enabledAiProviders.length} 个可用接口` : "未配置接口"}
                </Badge>
                <Badge variant={selectedAiUsage && selectedAiUsage.remainingToday > 0 ? "sage" : "amber"}>
                  {selectedAiUsage ? `剩余 ${selectedAiUsage.remainingToday} 次` : "次数待加载"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                {[
                  { label: "可用学生", value: `${aiActiveStudentCount} 人` },
                  { label: "可用课程", value: `${aiActiveCourseCount} 个` },
                  { label: "待处理课时", value: `${aiPendingLessonCount} 节` },
                  { label: "今日课程", value: `${aiTodayLessonCount} 节` },
                  { label: "AI 今日次数", value: selectedAiUsage ? `${selectedAiUsage.usedToday}/${selectedAiUsage.dailyLimit}` : "未选择" }
                ].map((item) => (
                  <div key={item.label} className="rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] px-4 py-3">
                    <div className="text-xs font-semibold text-[#64748b]">{item.label}</div>
                    <div className="mt-1 text-lg font-extrabold text-[#061226]">{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="space-y-4 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">AI 接口配置</label>
                      <Select value={aiProviderId} onChange={(event) => patchAiSession({ providerId: event.target.value, draft: null, message: "" })} disabled={aiLoading || enabledAiProviders.length === 0}>
                        <option value="">选择已保存配置</option>
                        {enabledAiProviders.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name} · {provider.model}{provider.isDefault ? " · 默认" : ""}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">操作类型</label>
                      <Select value={aiTaskType} onChange={(event) => patchAiSession({ taskType: event.target.value as AiScheduleTaskType, draft: null, message: "" })} disabled={aiLoading}>
                        <option value="auto">智能识别</option>
                        <option value="data_query">数据问答</option>
                        <option value="student_course">新增或修改学生和课程</option>
                        <option value="schedule_lessons">新增排课</option>
                        <option value="sync_lessons">同步排课</option>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">自然语言输入</label>
                    <Textarea
                      rows={8}
                      value={aiInstruction}
                      onChange={(event) => patchAiSession({ instruction: event.target.value, draft: null, followupAnswer: "", message: "" })}
                      placeholder="例如：本周一共有几节课？本月 08:00-10:00 有哪些课？或：新增学生张三，三年级，A校区，语文一对一。"
                      className="min-h-[180px] bg-white"
                      disabled={aiLoading}
                    />
                    <div className="grid grid-cols-1 gap-2 text-xs font-semibold leading-5 text-[#64748b] md:grid-cols-2">
                      {[
                        "描述尽量准确详细，写清学生姓名、校区、年级、科目、课程档案名称、日期和时间。",
                        "可以直接询问统计问题，例如本周/本月课节数量、某时间段哪几天有课、预计课时费。",
                        "涉及课时费时，AI 只能根据系统已有金额回答；缺少单价时会提示无法计算总额。",
                        "可以按日常说法输入，例如“本周日上午9点、下午2点”；如果跨周或容易混淆，再补充完整日期或24小时制时间。",
                        "创建班课或多人课时，请写清最少人数、基础费用、每增加1人费用；最少人数不是当前关联学生人数。",
                        "修改学生档案时，请写清原姓名或学生ID，以及新姓名、年级、校区、学校或备注。",
                        "涉及修改或删除时，请写清原课程日期、时间、科目和学生，避免 AI 匹配到相近课程。",
                        "同步排课时，请写清来源日期/日期段、目标日期/日期段、是否覆盖已有课节、是否包含已取消课节；系统只复制课程安排，新课节的上节课内容会按目标时间线指向前面最近一节同课程课。",
                        "AI 只生成建议，点击确认写入前请核对摘要、操作建议和风险提醒。"
                      ].map((text) => (
                        <div key={text} className="rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2">
                          {text}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs font-semibold leading-5 text-[#64748b]">
                      会发送当前可用学生、课程、校区、科目和近 14 天到未来 45 天课程，用于识别重复和时间关系。
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                      <Button type="button" variant="outline" disabled={aiLoading || !canClearAiWork} onClick={clearAiWork}>
                        <Trash2 size={15} /> 清空
                      </Button>
                      <Button type="button" variant="outline" disabled={aiLoading} onClick={() => void refreshAiProviders()}>
                        <RefreshCw size={15} /> 刷新配置
                      </Button>
                      <Button type="button" disabled={aiLoading || !aiProviderId || !aiInstruction.trim()} onClick={() => void submitAiDraft()}>
                        <WandSparkles size={15} /> {aiLoading ? "生成中" : "生成建议"}
                      </Button>
                    </div>
                  </div>
                  {selectedAiProvider && (
                    <div className="space-y-1 rounded-[12px] border border-[#bfdbfe] bg-[#eaf2ff] px-3 py-2 text-xs font-bold leading-5 text-[#1557c2]">
                      <div>
                        当前使用：{selectedAiProvider.name} · {selectedAiProvider.model}
                        {canShowAiProviderEndpoint && selectedAiProvider.maskedApiKey ? ` · ${selectedAiProvider.maskedApiKey}` : ""}
                      </div>
                      <div>{aiUsageText}</div>
                      {canShowAiProviderEndpoint && (
                        <>
                          <div className="break-all">接口地址：{selectedAiProvider.baseUrl}</div>
                          <div className="break-all">实际调用：{selectedAiEndpoint}</div>
                        </>
                      )}
                    </div>
                  )}
                  {aiMessage && (
                    <div className="rounded-[12px] border border-[#dbe4ef] bg-white px-3 py-2 text-sm font-bold text-[#25324a]">
                      {aiMessage}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="rounded-[14px] border border-[#dbe4ef] bg-white p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-[#061226]">
                      <Bot size={16} className="text-[#1557c2]" /> 当前能力范围
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-sm font-semibold text-[#25324a]">
                      {[
                        "回答本周、本月、某时间段课节数量和日期分布",
                        "按当前课节金额汇总已知课时费，缺少单价时明确提示无法计算",
                        "录入新学生和课程 / 班课信息",
                        "修改学生档案（姓名、年级、校区、学校、备注）",
                        "新增自定义班型并设置默认计费",
                        "修改课程班型、校区、关联学生，或迁移到新课程",
                        "按指定日期或星期批量新增排课",
                        "同步某一天或某几天的排课",
                        "生成结果必须预览并确认后写入"
                      ].map((text) => (
                        <div key={text} className="rounded-[10px] border border-[#e8eef6] bg-[#f8fbff] px-3 py-2">
                          {text}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[14px] border border-[#fed7aa] bg-[#fff7ed] p-4">
                    <div className="mb-2 text-sm font-extrabold text-[#9a3412]">不让 AI 直接处理的内容</div>
                    <div className="text-sm font-semibold leading-6 text-[#9a3412]">
                      今日提醒、补课状态、课程记录详情和冲突判断继续由系统代码处理；涉及写入的数据必须先生成建议并由人工确认。
                    </div>
                  </div>

                  <div className="rounded-[14px] border border-[#bbf7d0] bg-[#f0fdf4] p-4">
                    <div className="mb-2 text-sm font-extrabold text-[#15803d]">使用次数说明</div>
                    <div className="text-sm font-semibold leading-6 text-[#166534]">
                      每日上限按当前用户统计，每个人各自计算次数；只有成功生成建议才会计入次数，生成失败不会扣次数。
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[14px] border border-[#dbe4ef] bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-sm font-extrabold text-[#061226]">建议结果预览</div>
                    <div className="mt-1 text-xs font-semibold text-[#64748b]">
                      这里会把 AI 返回内容整理成可核对的摘要、操作建议和提醒。正式写入前仍需要系统校验和人工确认。
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant={aiDraftCanApply ? "default" : "outline"}
                    disabled={!aiDraftCanApply || aiLoading || aiApplying}
                    onClick={applyAiDraft}
                    className="shrink-0 disabled:border-[#e5e7eb] disabled:bg-[#f3f4f6] disabled:text-[#9ca3af] disabled:shadow-none"
                  >
                    {aiApplying ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    {aiApplying ? "写入中" : "确认写入"}
                  </Button>
                </div>
                {aiDraft ? (
                  <div className="mt-4 space-y-4">
                    {aiApplyResult && (
                      <div className={`rounded-[12px] border px-4 py-3 text-sm font-extrabold leading-6 ${
                        aiApplyResult.ok
                          ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]"
                          : "border-[#fecaca] bg-[#fff1f2] text-[#b91c1c]"
                      }`}>
                        {aiApplyResult.message}
                      </div>
                    )}
                    <div className="rounded-[12px] border border-[#bfdbfe] bg-[#eaf2ff] p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#1557c2]">
                        <Sparkles size={16} /> 摘要
                      </div>
                      <div className="whitespace-pre-wrap text-sm font-semibold leading-6 text-[#25324a]">
                        {aiDraftSummary || "AI 没有返回摘要，请查看下方操作建议或原始内容。"}
                      </div>
                    </div>

                    {aiDraftAnswer && (
                      <div className="rounded-[12px] border border-[#bbf7d0] bg-[#f0fdf4] p-4">
                        <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#15803d]">
                          <Bot size={16} /> AI 回答
                        </div>
                        <div className="whitespace-pre-wrap text-sm font-semibold leading-6 text-[#166534]">
                          {aiDraftAnswer}
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-extrabold text-[#061226]">操作建议</div>
                        <Badge variant={aiDraftActions.length > 0 ? "sky" : "secondary"}>{aiDraftActions.length} 项</Badge>
                      </div>
                      {aiDraftActions.map((action, index) => {
                        const actionType = textValue(action.type, "unknown");
                        const fields = Object.entries(action).filter(([key]) => key !== "type");
                        return (
                          <div key={`${actionType}-${index}`} className="rounded-[12px] border border-[#e8eef6] bg-[#f8fbff] p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="sky">{aiActionLabel(actionType)}</Badge>
                              <span className="text-sm font-extrabold text-[#061226]">建议 {index + 1}</span>
                            </div>
                            {fields.length > 0 ? (
                              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                                {fields.map(([key, value]) => (
                                  <div key={key} className="rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2">
                                    <div className="text-xs font-bold uppercase text-[#64748b]">{aiFieldLabel(key)}</div>
                                    <div className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-[#25324a]">
                                      {formatAiValue(value)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="mt-3 rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2 text-sm font-semibold text-[#64748b]">
                                这条建议没有附加字段。
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {aiDraftActions.length === 0 && (
                        <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-5 text-center text-sm font-semibold text-[#64748b]">
                          暂无可直接执行的操作建议，可能需要先补充信息。
                        </div>
                      )}
                    </div>

                    {(aiDraftQuestions.length > 0 || aiDraftWarnings.length > 0) && (
                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        {aiDraftQuestions.length > 0 && (
                          <div className="rounded-[12px] border border-[#fed7aa] bg-[#fff7ed] p-4">
                            <div className="mb-2 text-sm font-extrabold text-[#9a3412]">需要确认的问题</div>
                            <div className="space-y-2">
                              {aiDraftQuestions.map((question, index) => (
                                <div key={index} className="rounded-[10px] border border-[#fed7aa] bg-white/80 px-3 py-2 text-sm font-semibold leading-6 text-[#9a3412]">
                                  {formatAiValue(question)}
                                </div>
                              ))}
                            </div>
                            <div className="mt-4 space-y-2 rounded-[12px] border border-[#fed7aa] bg-white/80 p-3">
                              <label className="text-sm font-extrabold text-[#9a3412]">补充信息后继续生成</label>
                              <Textarea
                                rows={4}
                                value={aiFollowupAnswer}
                                onChange={(event) => patchAiSession({ followupAnswer: event.target.value })}
                                placeholder="例如：校区选延安；李雨泽初三、顾延泽初二；课程档案名称用“李雨泽、顾延泽化学”。"
                                className="bg-white"
                                disabled={aiLoading}
                              />
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-xs font-semibold leading-5 text-[#9a3412]">
                                  会把原始需求、上方问题和你的补充答案一起发给 AI，重新生成完整建议。
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={aiLoading || !aiFollowupAnswer.trim()}
                                  onClick={() => void submitAiFollowup()}
                                >
                                  <WandSparkles size={14} /> 继续生成
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                        {aiDraftWarnings.length > 0 && (
                          <div className="rounded-[12px] border border-[#fecaca] bg-[#fff1f2] p-4">
                            <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#b91c1c]">
                              <AlertTriangle size={15} /> 风险提醒
                            </div>
                            <div className="space-y-2">
                              {aiDraftWarnings.map((warning, index) => (
                                <div key={index} className="rounded-[10px] border border-[#fecaca] bg-white/80 px-3 py-2 text-sm font-semibold leading-6 text-[#b91c1c]">
                                  {formatAiValue(warning)}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {!aiDraftRecord && (
                      <div className="rounded-[12px] border border-[#fed7aa] bg-[#fff7ed] px-4 py-3 text-sm font-bold leading-6 text-[#9a3412]">
                        AI 没有返回标准结构，下面保留原始内容用于人工查看。
                      </div>
                    )}

                    <div className="relative rounded-[12px] border border-[#e8eef6] bg-white">
                      <details>
                        <summary className="cursor-pointer px-4 py-3 pr-32 text-sm font-extrabold text-[#25324a]">
                          查看原始返回内容
                        </summary>
                        <pre className="max-h-[260px] overflow-auto border-t border-[#e8eef6] bg-[#f8fbff] p-4 text-xs font-semibold leading-6 text-[#25324a]">
{aiRawResultText}
                        </pre>
                      </details>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="absolute right-3 top-2"
                        onClick={() => void copyAiRawResult()}
                      >
                        <Copy size={14} /> 复制结果
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-5">
                    <div className="text-sm font-extrabold text-[#061226]">
                      {aiLoading ? "正在生成新的建议..." : enabledAiProviders.length > 0 ? "等待生成建议" : "需要先配置 AI 接口"}
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 text-sm font-semibold text-[#64748b] sm:grid-cols-2">
                      <div className="rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2">
                        当前角色：{isAdmin ? "管理员" : "普通用户"}
                      </div>
                      <div className="rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2">
                        当前接口：{selectedAiProvider ? `${selectedAiProvider.name} / ${selectedAiProvider.model}` : "未选择"}
                      </div>
                      <div className="rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2">
                        可用学生：{aiContextSummary.activeStudents} 人
                      </div>
                      <div className="rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2">
                        可用课程：{aiContextSummary.activeCourses} 个
                      </div>
                    </div>
                  </div>
                )}
                {aiDraft && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="secondary">{aiDraft.model}</Badge>
                    {aiDraft.usage?.totalTokens !== undefined && (
                      <Badge variant="sky">tokens {aiDraft.usage.totalTokens}</Badge>
                    )}
                    <Badge variant="secondary">{aiDraft.createdAt}</Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
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
                <TimeTextInput value={singleStartTime} onValueChange={setSingleStartTime} className={!isSingleTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">结束时间</label>
                <TimeTextInput value={singleEndTime} onValueChange={setSingleEndTime} className={!isSingleTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
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
                <TimeTextInput value={customPresetStart} onValueChange={setCustomPresetStart} className={!isCustomPresetTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                <TimeTextInput value={customPresetEnd} onValueChange={setCustomPresetEnd} className={!isCustomPresetTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
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
                    <TimeTextInput value={ruleStartTime} onValueChange={setRuleStartTime} className={!isBatchTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">结束</label>
                    <TimeTextInput value={ruleEndTime} onValueChange={setRuleEndTime} className={!isBatchTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
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
                    <TimeTextInput value={calendarStartTime} onValueChange={setCalendarStartTime} className={!isCalendarTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">结束时间</label>
                    <TimeTextInput value={calendarEndTime} onValueChange={setCalendarEndTime} className={!isCalendarTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : undefined} />
                    {!isCalendarTimeValid && (
                      <div className="text-xs font-bold text-[#b91c1c]">日历排课的结束时间必须晚于开始时间。</div>
                    )}
                  </div>
                </div>
                <div className="rounded-[12px] border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-xs font-bold leading-5 text-[#9a3412]">
                  说明：这里的排课课程、开始时间和结束时间只用于点击日期时生成新课；“查看课程筛选”只影响已排课程展示。
                </div>
              </div>
            ) : (
              <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] px-4 py-3 text-sm font-semibold leading-6 text-[#64748b]">
                查看模式只按日期切换右侧“每日课程详情”；需要新增课时请切到“排课”模式。
              </div>
            )}
            <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[auto_minmax(130px,0.75fr)_minmax(130px,0.75fr)_minmax(130px,0.75fr)_minmax(220px,1.35fr)_auto_auto] xl:items-end">
                <div className="min-w-[116px]">
                  <div className="text-sm font-extrabold text-[#061226]">查看课程筛选</div>
                  <div className="mt-0.5 text-xs font-bold text-[#64748b]">
                    当日 {selectedCalendarLessons.length} 节 · 本周 {selectedCalendarWeekLessons.length} 节
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">校区</label>
                  <Select value={calendarViewCampusFilter} onChange={(event) => setCalendarViewCampusFilter(event.target.value)} className="h-10 bg-white">
                    <option value="all">全部校区</option>
                    {calendarViewCampusOptions.map((campus) => (
                      <option key={campus.id} value={campus.id}>{campus.name}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">年级</label>
                  <Select value={calendarViewGradeFilter} onChange={(event) => setCalendarViewGradeFilter(event.target.value)} className="h-10 bg-white">
                    <option value="all">全部年级</option>
                    {calendarViewGradeOptions.map((grade) => (
                      <option key={grade} value={grade}>{grade}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">科目</label>
                  <Select value={calendarViewSubjectFilter} onChange={(event) => setCalendarViewSubjectFilter(event.target.value)} className="h-10 bg-white">
                    <option value="all">全部科目</option>
                    {calendarViewSubjectOptions.map((subject) => (
                      <option key={subject} value={subject}>{subject}</option>
                    ))}
                  </Select>
                </div>
                <label className="relative block">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                  <Input
                    value={calendarViewStudentFilter}
                    onChange={(event) => setCalendarViewStudentFilter(event.target.value)}
                    placeholder="搜索学生、课程、校区或备注"
                    className="h-10 bg-white pl-9"
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCalendarViewCampusFilter("all");
                    setCalendarViewGradeFilter("all");
                    setCalendarViewSubjectFilter("all");
                    setCalendarViewStudentFilter("");
                  }}
                  disabled={calendarViewCampusFilter === "all" && calendarViewGradeFilter === "all" && calendarViewSubjectFilter === "all" && !calendarViewStudentFilter}
                  className="h-10"
                >
                  清除筛选
                </Button>
                <div className="grid grid-cols-2 rounded-[12px] border border-[#dbe4ef] bg-white p-1 lg:min-w-[136px]">
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
              </div>
            </div>
            <div className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-extrabold text-[#061226]">同步课程</div>
                  <div className="mt-1 text-xs font-semibold text-[#64748b]">支持单日勾选同步，也支持日期段一一对应同步；同步后按目标时间线自动衔接上一节内容和作业。</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="w-fit">{selectedSyncLessons.length} / {syncSourceLessons.length} 节</Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSyncPanelOpen((value) => !value)}
                    className={`h-9 border px-3 font-extrabold shadow-sm ${
                      syncPanelOpen
                        ? "border-[#fb923c] bg-[#fff7ed] text-[#c2410c] hover:bg-[#ffedd5]"
                        : "border-[#93c5fd] bg-[#eff6ff] text-[#1557c2] hover:bg-[#dbeafe]"
                    }`}
                  >
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
                      <div className="rounded-[12px] border border-[#dbe4ef] bg-white p-3">
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-sm font-extrabold text-[#061226]">同步某一天课程</div>
                            <div className="mt-1 text-xs font-semibold text-[#64748b]">从来源日期勾选课节，复制到目标日期。</div>
                          </div>
                          <Badge variant="secondary" className="w-fit">{selectedSyncLessons.length} / {syncSourceLessons.length} 节</Badge>
                        </div>
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
                            <Copy size={15} /> 同步单日
                          </Button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
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
                        <div className="mt-3 max-h-[190px] space-y-2 overflow-y-auto pr-1">
                          {syncSourceLessons.map((lesson) => {
                            const course = getCourse(vault, lesson.courseGroupId);
                            const disabled = course?.status !== "active";
                            const conflicted = Boolean(
                              syncTargetDate &&
                              vault.lessons.some(
                                (existingLesson) =>
                                  existingLesson.date === syncTargetDate &&
                                  existingLesson.courseGroupId === lesson.courseGroupId &&
                                  existingLesson.status !== "cancelled" &&
                                  timesOverlap(existingLesson.startTime, existingLesson.endTime, lesson.startTime, lesson.endTime)
                              )
                            );
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
                                    {courseSubject(vault, lesson.courseGroupId)} · {courseTypeLabel(vault, lesson.type)} · {campusName(vault, lesson.campusId)} · {lessonStatusLabels[lesson.status]}{disabled ? " · 课程已暂停" : conflicted ? " · 目标日期会覆盖" : ""}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                          {syncSourceLessons.length === 0 && (
                            <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-white p-5 text-center text-sm font-semibold text-[#64748b]">
                              来源日期没有可同步课节
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-[12px] border border-[#cfe0f5] bg-[#f8fbff] p-3">
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-sm font-extrabold text-[#061226]">同步日期段</div>
                            <div className="mt-1 text-xs font-semibold text-[#64748b]">来源日期段用于复制排课；同步后按目标课节时间线自动衔接上一节内容和作业。</div>
                          </div>
                          <Badge variant="sky" className="w-fit">{syncRangeActiveLessons.length} / {syncRangeSourceLessons.length} 节</Badge>
                        </div>
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] xl:items-end">
                          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">来源开始</label>
                              <Input type="date" value={syncRangeSourceStart} onChange={(event) => setSyncRangeSourceStart(event.target.value)} className={!isOrderedDateRange(syncRangeSourceStart, syncRangeSourceEnd) ? "h-10 border-[#fca5a5] bg-[#fff1f2]" : "h-10 bg-white"} />
                            </div>
                            <div className="pb-2 text-center text-lg font-extrabold text-[#1557c2]">~</div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">来源结束</label>
                              <Input type="date" value={syncRangeSourceEnd} min={syncRangeSourceStart} onChange={(event) => setSyncRangeSourceEnd(event.target.value)} className={!isOrderedDateRange(syncRangeSourceStart, syncRangeSourceEnd) ? "h-10 border-[#fca5a5] bg-[#fff1f2]" : "h-10 bg-white"} />
                            </div>
                          </div>
                          <div className="hidden pb-2 text-center text-xl font-extrabold text-[#ff8617] xl:block">-&gt;</div>
                          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">目标开始</label>
                              <Input type="date" value={syncRangeTargetStart} onChange={(event) => setSyncRangeTargetStart(event.target.value)} className={!isOrderedDateRange(syncRangeTargetStart, syncRangeTargetEnd) ? "h-10 border-[#fca5a5] bg-[#fff1f2]" : "h-10 bg-white"} />
                            </div>
                            <div className="pb-2 text-center text-lg font-extrabold text-[#1557c2]">~</div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">目标结束</label>
                              <Input type="date" value={syncRangeTargetEnd} min={syncRangeTargetStart} onChange={(event) => setSyncRangeTargetEnd(event.target.value)} className={!isOrderedDateRange(syncRangeTargetStart, syncRangeTargetEnd) ? "h-10 border-[#fca5a5] bg-[#fff1f2]" : "h-10 bg-white"} />
                            </div>
                          </div>
                          <Button
                            type="button"
                            className="self-end"
                            onClick={() => copyLessonRangeToDateRange()}
                            disabled={
                              syncRangeSourceLessons.length === 0 ||
                              syncRangeSourceDates.length === 0 ||
                              syncRangeSourceDates.length !== syncRangeTargetDates.length
                            }
                          >
                            <Copy size={15} /> 同步日期段
                          </Button>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={fillSyncRangeFromSelectedWeek}>
                            上周整周到本周
                          </Button>
                          <Badge variant={syncRangeSourceDates.length === syncRangeTargetDates.length ? "secondary" : "yellow"} className="w-fit">
                            {`${syncRangeSourceDates.length} 天 -> ${syncRangeTargetDates.length} 天`}
                          </Badge>
                          {syncRangeSourceLessons.length > syncRangeActiveLessons.length && (
                            <Badge variant="yellow" className="w-fit">{syncRangeSourceLessons.length - syncRangeActiveLessons.length} 节课程已暂停</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
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
                const hasMakeup = dayLessons.some((lesson) => makeupMarkerForLesson(lesson));
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
                      {hasMakeup && <Badge variant="yellow" className="text-[10px] px-1.5 py-0">补课</Badge>}
                      {amount > 0 && <Badge variant="default" className="px-1.5 py-0 text-[10px]">{formatPrivateMoney(amount, amountsVisible)}</Badge>}
                    </div>
                    {dayLessons.slice(0, 4).map((lesson) => (
                      <span key={lesson.id} className="mt-0.5 hidden w-full truncate text-[11px] font-semibold text-(--color-muted-foreground) sm:block">
                        {lesson.startTime} {courseTypeLabel(vault, lesson.type)} · {courseName(vault, lesson.courseGroupId)} · {lessonStudentDisplay(vault, lesson)}
                        {makeupMarkerForLesson(lesson) ? ` · ${makeupMarkerForLesson(lesson)}` : ""}
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
              <CardTitle>{dateWithWeekday(selectedCalendarDate)} 课程</CardTitle>
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
                          <Badge variant="sky" className="text-[10px]">{lessonStudentDisplay(vault, lesson)}</Badge>
                          <Badge variant={lessonStatusVariant(lesson.status)} className="text-[10px]">{lessonStatusLabels[lesson.status]}</Badge>
                          {makeupMarkerForLesson(lesson) && <Badge variant="yellow" className="text-[10px]">{makeupMarkerForLesson(lesson)}</Badge>}
                        </div>
                        <div className="mt-1 text-xs font-semibold text-[#64748b]">
                          {lesson.startTime}-{lesson.endTime} · {campusName(vault, lesson.campusId)} · {courseSubject(vault, lesson.courseGroupId)} · {lessonStudentDisplay(vault, lesson)}
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
                          {courseSubject(vault, lesson.courseGroupId)} · 原课：{dateWithWeekday(lesson.date)} · {lesson.startTime}-{lesson.endTime} · {campusName(vault, lesson.campusId)}
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
                              {courseName(vault, lesson.courseGroupId)} · {attendedStudentNamesForLesson(vault, lesson) || studentNames(vault, lesson.expectedStudentIds)}
                            </div>
                            <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
                              {courseSubject(vault, lesson.courseGroupId)} · 原课：{optionalDateWithWeekday(original?.date ?? lesson.makeupOriginalDate)} · 补课：{optionalDateWithWeekday(lesson.makeupScheduledDate ?? lesson.date)} · {lesson.startTime}-{lesson.endTime}
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
                            onClick={() => openLessonInRecords(lesson)}
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
        <ScheduleStudentStatsPanel
          amountsVisible={amountsVisible}
          campusOptions={campusOptions}
          completedCount={studentStatsCompletedCount}
          courseGroupOptions={courseGroupOptions}
          expandedGroupIds={expandedStudentStatsGroupIds}
          groupedLessonRows={studentStatsGroupedLessonRows}
          lessonCount={studentStatsLessons.length}
          onOpenLesson={openLessonInRecords}
          onToggleGroup={toggleExpandedStudentStatsGroup}
          rows={studentStatsRows}
          setCampusFilter={setStudentStatsCampusFilter}
          setCourseFilter={setStudentStatsCourseFilter}
          setCourseTypeFilter={setStudentStatsCourseTypeFilter}
          setDateEnd={setStudentStatsDateEnd}
          setDateStart={setStudentStatsDateStart}
          setEndTime={setStudentStatsEndTime}
          setNameFilter={setStudentStatsNameFilter}
          setStartTime={setStudentStatsStartTime}
          setStatusFilter={setStudentStatsStatusFilter}
          setSubjectFilter={setStudentStatsSubjectFilter}
          studentLessonCount={studentStatsStudentLessonCount}
          subjectOptions={studentStatsSubjects}
          totalFee={studentStatsTotalFee}
          values={{
            campusFilter: studentStatsCampusFilter,
            courseFilter: studentStatsCourseFilter,
            courseTypeFilter: studentStatsCourseTypeFilter,
            dateEnd: studentStatsDateEnd,
            dateStart: studentStatsDateStart,
            endTime: studentStatsEndTime,
            nameFilter: studentStatsNameFilter,
            startTime: studentStatsStartTime,
            statusFilter: studentStatsStatusFilter,
            subjectFilter: studentStatsSubjectFilter
          }}
          vault={vault}
        />
      )}

      {schedulePanel === "trash" && (
        <ScheduleTrashPanel
          activeLessonIds={activeLessonIds}
          allVisibleTrashSelected={allVisibleTrashSelected}
          campusOptions={campusOptions}
          dateWithWeekday={dateWithWeekday}
          deletedLessonCount={deletedLessons.length}
          onPermanentDelete={askPermanentDeleteTrashItems}
          onRestore={askRestoreTrashItems}
          onToggleAllVisible={toggleAllVisibleTrashSelection}
          onToggleSelection={toggleTrashSelection}
          selectedTrashIdSet={selectedTrashIdSet}
          selectedTrashRestoreCount={selectedTrashRestoreCount}
          selectedVisibleTrashIds={selectedVisibleTrashIds}
          setTrashCampusFilter={setTrashCampusFilter}
          setTrashDateEnd={setTrashDateEnd}
          setTrashDateStart={setTrashDateStart}
          setTrashSearch={setTrashSearch}
          setTrashSourceFilter={setTrashSourceFilter}
          trashCampusFilter={trashCampusFilter}
          trashDateEnd={trashDateEnd}
          trashDateStart={trashDateStart}
          trashLessons={trashLessons}
          trashSearch={trashSearch}
          trashSourceFilter={trashSourceFilter}
          vault={vault}
        />
      )}

      {schedulePanel === "records" && (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
        <ScheduleRecordsListCard
          amountsVisible={amountsVisible}
          campusFilter={campusFilter}
          campusOptions={campusOptions}
          courseTypeFilter={courseTypeFilter}
          dateWithWeekday={dateWithWeekday}
          effectiveLessonDay={effectiveLessonDay}
          effectiveLessonScope={effectiveLessonScope}
          lessonDay={lessonDay}
          lessonMonth={lessonMonth}
          lessonRangeEnd={lessonRangeEnd}
          lessonRangeStart={lessonRangeStart}
          lessonScope={lessonScope}
          lessonWeek={lessonWeek}
          lessons={lessons}
          onOpenLesson={openLessonInRecords}
          selectedLessonId={selected?.id}
          selectedCalendarDate={selectedCalendarDate}
          setCampusFilter={setCampusFilter}
          setCourseTypeFilter={setCourseTypeFilter}
          setLessonDay={setLessonDay}
          setLessonMonth={setLessonMonth}
          setLessonRangeEnd={setLessonRangeEnd}
          setLessonRangeStart={setLessonRangeStart}
          setLessonScope={setLessonScope}
          setLessonWeek={setLessonWeek}
          setShowOnlyMakeup={setShowOnlyMakeup}
          setStudentFilter={setStudentFilter}
          setSyncRecordsWithCalendarDate={setSyncRecordsWithCalendarDate}
          showOnlyMakeup={showOnlyMakeup}
          studentFilter={studentFilter}
          syncRecordsWithCalendarDate={syncRecordsWithCalendarDate}
          vault={vault}
        />

        {selected && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
            <Card className="overflow-hidden">
              <CardHeader className="flex flex-col gap-3 border-b border-[#e8eef6] bg-white sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>课程详情</CardTitle>
                  <CardDescription className="space-y-1 leading-5">
                    <span className="block">{courseSubject(vault, selected.courseGroupId)} · {courseTypeLabel(vault, selected.type)}</span>
                    <span className="block">{dateWithWeekday(selected.date)} · {selected.startTime}-{selected.endTime}</span>
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {lessonReturnTarget && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={goBackToLessonSource}
                      className="border-[#bfdbfe] bg-[#f8fbff] text-[#1557c2] hover:border-[#93c5fd] hover:bg-[#eff6ff] hover:text-[#0f4aa0]"
                    >
                      <CornerUpLeft size={15} /> {lessonReturnTarget.label}
                    </Button>
                  )}
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
                      <div>原课日期：{dateWithWeekday(selectedOriginalLesson.date)}</div>
                      <div>补课日期：{dateWithWeekday(selected.date)}</div>
                      <div>学生：{selected.makeupStudentId ? studentNames(vault, [selected.makeupStudentId]) : attendedStudentNamesForLesson(vault, selected) || studentNames(vault, selected.expectedStudentIds)}</div>
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
                      <TimeTextInput value={selected.startTime} onValueChange={updateSelectedStartTime} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">结束</label>
                      <TimeTextInput value={selected.endTime} onValueChange={updateSelectedEndTime} />
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

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => selectedPreviousLesson && openLessonInRecords(selectedPreviousLesson)}
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
                        来源：{dateWithWeekday(selectedPreviousLesson.date)} · {selectedPreviousLesson.startTime}-{selectedPreviousLesson.endTime} · 点击查看详情
                      </div>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => selectedPreviousLesson && openLessonInRecords(selectedPreviousLesson)}
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
                        来源：{dateWithWeekday(selectedPreviousLesson.date)} · {selectedPreviousLesson.startTime}-{selectedPreviousLesson.endTime} · 点击查看详情
                      </div>
                    )}
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
                    <UserCheck size={14} /> 到课情况
                  </div>
                  {selectedLinkedMakeupLessons.length > 0 && (
                    <div className="rounded-[14px] border border-[#bfdbfe] bg-[#eff6ff] p-3">
                      <div className="mb-2 text-sm font-extrabold text-[#1557c2]">已安排补课</div>
                      <div className="flex flex-wrap gap-2">
                        {selectedLinkedMakeupLessons.map((makeupLesson) => (
                          <Button
                            key={makeupLesson.id}
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-[#bfdbfe] bg-white text-[#1557c2]"
                            onClick={() => openLessonInRecords(makeupLesson)}
                          >
                            <Link2 size={13} />
                            {dateWithWeekday(makeupLesson.date)} {makeupLesson.startTime}-{makeupLesson.endTime} · {attendedStudentNamesForLesson(vault, makeupLesson) || studentNames(vault, makeupLesson.expectedStudentIds)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  {!selected.linkedOriginalLessonId && selectedMakeupAssignableStudentIds.length > 0 && (
                    <div className="space-y-3 rounded-[14px] border border-[#facc15] bg-[#fefce8] p-4">
                      <button
                        type="button"
                        onClick={() => setMakeupArrangementOpen((open) => !open)}
                        className="flex w-full flex-col gap-2 text-left sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div>
                          <div className="text-sm font-extrabold text-[#061226]">补课安排</div>
                          <div className="mt-1 text-xs font-semibold text-[#854d0e]">
                            {selectedWholeLessonPending ? "这节课整体待补课，直接安排补课即可。" : "勾选可一起补课的学生，分批安排不同时间。"}
                          </div>
                        </div>
                        <span className="flex items-center gap-2">
                          <Badge variant="amber" className="w-fit">
                            {selectedWholeLessonPending ? "整节待补" : `${selectedMakeupCandidateStudentIds.length} 人待补`}
                          </Badge>
                          {makeupArrangementOpen ? <ChevronUp size={16} className="text-[#854d0e]" /> : <ChevronDown size={16} className="text-[#854d0e]" />}
                        </span>
                      </button>
                      {makeupArrangementOpen && (
                        <>
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
                              <div
                                key={studentId}
                                className={`flex flex-col gap-2 rounded-[12px] border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between ${
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
                                <span className="flex shrink-0 items-center gap-2">
                                  <Badge variant={checked ? "default" : "secondary"} className="w-fit">
                                    {checked ? "已选" : "待补"}
                                  </Badge>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="shrink-0 border-[#fde68a] bg-white text-[#854d0e]"
                                    onClick={() => updateAttendanceMakeupExempt(studentId, true)}
                                  >
                                    本次不补
                                  </Button>
                                </span>
                              </div>
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
                            <TimeTextInput value={makeupStartTime} onValueChange={setMakeupStartTime} className={!isMakeupTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : "bg-white"} />
                            <TimeTextInput value={makeupEndTime} onValueChange={setMakeupEndTime} className={!isMakeupTimeValid ? "border-[#fca5a5] bg-[#fff1f2]" : "bg-white"} />
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
                        </>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <label className="relative block">
                      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                      <Input
                        className="h-10 pl-9"
                        value={temporaryStudentSearch}
                        onChange={(event) => setTemporaryStudentSearch(event.target.value)}
                        placeholder="搜索临时或试听学生"
                      />
                    </label>
                    <Select value={temporaryStudentId} onChange={(event) => setTemporaryStudentId(event.target.value)}>
                      <option value="">选择学生档案（含试听）</option>
                      {displayedTemporaryStudentOptions.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.name}{student.grade ? ` · ${student.grade}` : ""}{student.temporaryTrial ? "（试听档案）" : ""}
                        </option>
                      ))}
                    </Select>
                    <Button type="button" variant="outline" onClick={addTemporaryStudent} disabled={!temporaryStudentId || selected.expectedStudentIds.includes(temporaryStudentId)}>
                      <UserPlus size={15} /> {selectedTemporaryStudent?.temporaryTrial ? "添加试听学生" : "添加学生"}
                    </Button>
                  </div>
                  <div className="rounded-[12px] border border-dashed border-[#c7d2fe] bg-[#f8faff] px-3 py-2 text-xs font-semibold text-[#5161d6]">
                    已保存试听档案 {availableTrialStudentOptionCount} 人，可直接从上面选择后添加为试听学生。
                  </div>
                  <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
                    <button
                      type="button"
                      onClick={() => setAttendancePanelOpen((open) => !open)}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <div className="text-sm font-extrabold text-[#061226]">关联学生</div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">显示 {selectedAttendanceEntries.length} 人</Badge>
                        <Badge variant="sky">实到 {selectedAttendedStudentCount} / 应到 {selectedExpectedStudentCount} 人</Badge>
                        {attendancePanelOpen ? <ChevronUp size={16} className="text-[#64748b]" /> : <ChevronDown size={16} className="text-[#64748b]" />}
                      </div>
                    </button>
                    {attendancePanelOpen && (
                      <>
                        <label className="relative mt-3 block">
                          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                          <Input
                            className="h-10 bg-white pl-9"
                            value={attendanceStudentFilter}
                            onChange={(event) => setAttendanceStudentFilter(event.target.value)}
                            placeholder="搜索姓名、年级、校区、试听或到课状态"
                          />
                        </label>
                        {selected.type === "class" && (
                          <div className="mt-3 grid grid-cols-1 gap-2 rounded-[12px] border border-[#c7d2fe] bg-[#eef0ff] p-3 sm:grid-cols-[1fr_150px_180px] sm:items-end">
                            <div className="text-xs font-semibold leading-5 text-[#5161d6]">
                              <span className="font-extrabold text-[#25324a]">试听统计</span>
                              <br />
                              已关联试听学生档案 {selectedNamedTrialStudentCount} 人；未建档试听可补录人数，费用按本节总试听收入填写。
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-[#64748b]">补录试听人数</label>
                              <Input
                                type="number"
                                min={0}
                                value={selected.trialStudentCount ?? 0}
                                onChange={(event) => updateTrialStats({ trialStudentCount: Math.max(Number(event.target.value), 0) })}
                                className="bg-white"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-[#64748b]">试听费用</label>
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
                        )}
                        <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                      {selectedAttendanceEntries.map((entry) => {
                        const student = findStudent(vault, entry.studentId);
                        const isTrialStudent = Boolean(entry.trial ?? student?.temporaryTrial);
                        const isTemporary = Boolean(entry.temporary || !selectedCourse?.studentIds.includes(entry.studentId));
                        const canToggleMakeupNeed = isMakeupAttendanceStatus(entry.status);
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
                                {isTrialStudent && <Badge variant="plum" className="shrink-0">试听学生</Badge>}
                                {isTemporary && <Badge variant="secondary" className="shrink-0">临时加入</Badge>}
                                {entry.makeupExempt && <Badge variant="secondary" className="shrink-0">不需补课</Badge>}
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
                                {canToggleMakeupNeed && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className={entry.makeupExempt ? "border-[#facc15] bg-white text-[#854d0e]" : "border-[#bfdbfe] bg-white text-[#1557c2]"}
                                    onClick={() => updateAttendanceMakeupExempt(entry.studentId, !entry.makeupExempt)}
                                  >
                                    {entry.makeupExempt ? "恢复需补" : "不需补课"}
                                  </Button>
                                )}
                                <Button type="button" size="sm" variant="destructive" onClick={() => askRemoveLessonStudent(entry.studentId)} title="只从本节课移除">
                                  <Trash2 size={13} />
                                </Button>
                              </div>
                            </div>
                            {isTemporary && !isTrialStudent && (
                              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_160px]">
                                <div className="rounded-[10px] bg-white/70 px-3 py-2 text-xs font-semibold text-[#5161d6]">
                                  默认按人头增量 {formatPrivateMoney(defaultTemporaryFeeForEntry(selected, entry) ?? 0, amountsVisible)} 计入；填写金额后会替换这名临时学生的默认增量。
                                </div>
                                {amountsVisible ? (
                                  <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-extrabold text-[#64748b]">¥</span>
                                    <Input
                                      type="number"
                                      value={entry.temporaryFee ?? ""}
                                      onChange={(event) => {
                                        const value = event.target.value.trim();
                                        updateTemporaryFee(entry.studentId, value === "" ? undefined : Number(value));
                                      }}
                                      className="bg-white pl-10"
                                      placeholder="留空则按默认人头费"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex h-10 items-center rounded-[10px] border border-[#dbe4ef] bg-white px-3 text-sm font-extrabold text-[#64748b]">
                                    ***
                                  </div>
                                )}
                              </div>
                            )}
                            {isTrialStudent && (
                              <div className="mt-3 rounded-[10px] bg-white/70 px-3 py-2 text-xs font-semibold text-[#5161d6]">
                                试听学生不计入班课新增人头费；本节总试听费用 {formatPrivateMoney(selected.trialFee ?? 0, amountsVisible)}。
                              </div>
                            )}
                            {selected.type === "class" && (
                              <div className="mt-3">
                                <Input
                                  className="bg-white"
                                  value={entry.note ?? ""}
                                  onChange={(event) => updateAttendanceNote(entry.studentId, event.target.value)}
                                  placeholder="学生备注，例如排错移除原因、请假原因、已约补课时间"
                                />
                              </div>
                            )}
                            {selected.type !== "class" && (
                              <Input
                                className="mt-3 bg-white"
                                value={entry.note ?? ""}
                                onChange={(event) => updateAttendanceNote(entry.studentId, event.target.value)}
                                placeholder="学生备注，例如请假原因、已约补课时间"
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
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                    <BookOpen size={14} /> 本次课内容
                  </div>
                  <Textarea value={selected.content.taught} onChange={(event) => updateContent("taught", event.target.value)} placeholder="例如：本节讲了什么知识点、重点方法、课堂例题、常见错误和掌握情况。" />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
                    <NotebookPen size={14} /> 课后作业
                  </div>
                  <Textarea value={selected.content.homework} onChange={(event) => updateContent("homework", event.target.value)} placeholder="例如：第几页第几题、几道练习、下次前要完成什么、有没有分层要求或备注。" />
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
      )}
    </div>
  );
}
