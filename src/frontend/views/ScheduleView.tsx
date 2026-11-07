import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { ScheduleAdjustmentPanel, type ScheduleAdjustmentConflictPolicy, type ScheduleAdjustmentPreviewItem } from "@/frontend/components/ScheduleAdjustmentPanel";
import { ScheduleAiPanel } from "@/frontend/components/ScheduleAiPanel";
import { ScheduleCalendarDetailDialog } from "@/frontend/components/ScheduleCalendarDetailDialog";
import { ScheduleCalendarFollowupPanels } from "@/frontend/components/ScheduleCalendarFollowupPanels";
import { ScheduleCalendarPanel } from "@/frontend/components/ScheduleCalendarPanel";
import { ScheduleDayReusePanel } from "@/frontend/components/ScheduleDayReusePanel";
import { ScheduleLessonDetailPanel } from "@/frontend/components/ScheduleLessonDetailPanel";
import { SchedulePanelTabs } from "@/frontend/components/SchedulePanelTabs";
import { SchedulePlanningPanel } from "@/frontend/components/SchedulePlanningPanel";
import { ScheduleRecordsListCard } from "@/frontend/components/ScheduleRecordsListCard";
import { ScheduleStudentStatsPanel } from "@/frontend/components/ScheduleStudentStatsPanel";
import { ScheduleTrashPanel } from "@/frontend/components/ScheduleTrashPanel";
import { SubstituteClassLessonPanel } from "@/frontend/components/SubstituteClassLessonPanel";
import { useScheduleAi } from "@/frontend/hooks/useScheduleAi";
import { useScheduleAttendance } from "@/frontend/hooks/useScheduleAttendance";
import { useScheduleBatchPlanning } from "@/frontend/hooks/useScheduleBatchPlanning";
import { useScheduleChecklist } from "@/frontend/hooks/useScheduleChecklist";
import { useScheduleNavigation } from "@/frontend/hooks/useScheduleNavigation";
import { useScheduleReuse } from "@/frontend/hooks/useScheduleReuse";
import { useScheduleStudentStats } from "@/frontend/hooks/useScheduleStudentStats";
import { useScheduleSubstitute } from "@/frontend/hooks/useScheduleSubstitute";
import { useScheduleTrash } from "@/frontend/hooks/useScheduleTrash";
import { billableHoursForCourseLesson, getCourse, isClassBillingCourseType, todayIso } from "@/frontend/lib/calculations";
import { makeId } from "@/frontend/lib/crypto";
import {
  addDays,
  courseHasActiveStudent,
  courseName,
  createLessonFromCourse,
  monthShift,
  orderedWeekdayLabels,
  orderedWeekdays,
  previousLesson,
  shortWeekdayLabels,
  sortCampusesForProfile,
  sortCoursesByName,
  sortStudentsByName,
  subjectOptionsForVault,
  weekStartsOn
} from "@/frontend/lib/helpers";
import { attendanceForStudentIds } from "@/frontend/lib/lessonAttendance";
import type { BatchLessonGenerationResult } from "@/frontend/lib/scheduleBatch";
import { dateWithWeekday, parseOptionalBillingHours, updateTimeWithTwoHourEnd } from "@/frontend/lib/scheduleDraftValues";
import {
  filterScheduleCourseOptions,
  isOrderedDateRange,
  isOrderedTimeRange,
  offsetDate
} from "@/frontend/lib/scheduleViewHelpers";
import type { CalendarFocus, ExternalLessonReturnTarget } from "@/frontend/lib/scheduleViewTypes";
import { timesOverlap } from "@/frontend/lib/time";
import type { AiScheduleSession, Lesson, ProgressChecklistCompletion, TeacherVault, TimePreset, UserRole, WeekStart, Weekday } from "@/shared/types";
import { CornerUpLeft } from "lucide-react";
import { useEffect, useState } from "react";

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
  onUpdateLessons,
  onUpdateCalendarDayNote,
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
  onReturnToView,
  onSaveChecklistCompletions,
  onUpdateChecklistCompletions,
  onOpenProgressChecklist,
  onOpenLessonFeedback
}: {
  vault: TeacherVault;
  amountsVisible: boolean;
  onAddLesson: (lesson: Lesson) => void;
  onAddLessons: (lessons: Lesson[], options?: { replaceLessonIds?: string[] }) => void;
  onAddLessonAndUpdateLesson: (lessonToAdd: Lesson, lessonToUpdate: Lesson) => void;
  onUpdateLesson: (lesson: Lesson) => void;
  onUpdateLessons: (lessons: Lesson[]) => void;
  onUpdateCalendarDayNote: (date: string, note: string) => void;
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
    endTime: string,
    manualBillingHours?: number
  ) => BatchLessonGenerationResult;
  onWeekStartChange: (weekStart: WeekStart) => void;
  role: UserRole;
  token: string;
  calendarFocus?: CalendarFocus;
  aiSession: AiScheduleSession | null;
  onAiSessionChange: (session: AiScheduleSession | null) => void;
  onApplyAiDraft: (session: AiScheduleSession | null) => { ok: boolean; message: string };
  onReturnToView: (target: ExternalLessonReturnTarget) => void;
  onSaveChecklistCompletions: (completions: ProgressChecklistCompletion[]) => void;
  onUpdateChecklistCompletions: (completions: ProgressChecklistCompletion[], deleteIds: string[]) => void;
  onOpenProgressChecklist?: (lesson: Lesson) => void;
  onOpenLessonFeedback?: (lesson: Lesson) => void;
}) {
  const weekStartPreference = weekStartsOn(vault);
  const campusOptions = sortCampusesForProfile(vault.campuses, vault.profile.homeCampusId);
  const studentOptions = sortStudentsByName(vault.students);
  const courseSelectionOptions = sortCoursesByName(vault.courseGroups.filter((course) => course.status === "active" && courseHasActiveStudent(vault, course)));
  const courseSelectionOptionIds = courseSelectionOptions.map((course) => course.id).join("|");
  const firstCourseId = courseSelectionOptions[0]?.id ?? "";
  const [singleCourseGroupId, setSingleCourseGroupId] = useState(firstCourseId);
  const [singleCourseSearch, setSingleCourseSearch] = useState("");
  const [singleDate, setSingleDate] = useState(todayIso());
  const [singleStartTime, setSingleStartTime] = useState("19:00");
  const [singleEndTime, setSingleEndTime] = useState("21:00");
  const [singleBillingHours, setSingleBillingHours] = useState("");
  const [calendarCourseGroupId, setCalendarCourseGroupId] = useState(firstCourseId);
  const [calendarCourseSearch, setCalendarCourseSearch] = useState("");
  const [calendarStartTime, setCalendarStartTime] = useState("19:00");
  const [calendarEndTime, setCalendarEndTime] = useState("21:00");
  const [calendarBillingHours, setCalendarBillingHours] = useState("");
  const studentStats = useScheduleStudentStats(vault);
  const {
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
  } = useScheduleNavigation({ vault, calendarFocus, weekStartPreference, onReturnToView, setCalendarCourseGroupId, setSingleCourseGroupId, setCalendarStartTime, setSingleStartTime, setCalendarEndTime, setSingleEndTime, setSingleDate });

  const [customPresetStart, setCustomPresetStart] = useState("08:00");
  const [customPresetEnd, setCustomPresetEnd] = useState("10:00");
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleNotice, setScheduleNotice] = useState("");
  const { confirm, dialog } = useConfirmDialog();
  const {
    substituteDate,
    setSubstituteDate,
    substituteStartTime,
    setSubstituteStartTime,
    substituteEndTime,
    setSubstituteEndTime,
    substituteBillingHours,
    setSubstituteBillingHours,
    substituteCampusId,
    setSubstituteCampusId,
    substituteSubject,
    setSubstituteSubject,
    substituteTitle,
    setSubstituteTitle,
    substituteExternalClassName,
    setSubstituteExternalClassName,
    substituteOriginalTeacherName,
    setSubstituteOriginalTeacherName,
    substituteSalaryGradeStage,
    setSubstituteSalaryGradeStage,
    substitutePresentStudentCount,
    setSubstitutePresentStudentCount,
    substituteStudentNamesText,
    setSubstituteStudentNamesText,
    substituteNote,
    setSubstituteNote,
    substituteStatus,
    setSubstituteStatus,
    isSubstituteTimeValid,
    substitutePreviewSnapshot,
    addSubstituteClassRecord
  } = useScheduleSubstitute({ vault, selectedCalendarDate, weekStartPreference, confirm, validateTimeRange, findTimeConflict, onAddLesson, setSelectedId, setSelectedCalendarDate, setCalendarMonth, setLessonDay, setScheduleError, showScheduleError, showScheduleNotice });

  const batchPlanning = useScheduleBatchPlanning({ vault, courseSelectionOptions, confirm, onAddLessons, onGenerateDrafts, showScheduleError, showScheduleNotice, validateTimeRange, validateDateRange, suggestedBillingHoursForDraft });
  const {
    syncSourceDate,
    setSyncSourceDate,
    syncTargetDate,
    setSyncTargetDate,
    syncRangeSourceStart,
    setSyncRangeSourceStart,
    syncRangeSourceEnd,
    setSyncRangeSourceEnd,
    syncRangeTargetStart,
    setSyncRangeTargetStart,
    syncRangeTargetEnd,
    setSyncRangeTargetEnd,
    selectedSyncLessonIds,
    syncPanelOpen,
    setSyncPanelOpen,
    syncSourceLessons,
    selectableSyncLessons,
    selectedSyncLessons,
    dayReusePreview,
    rangeReusePreview,
    syncRangeSourceDates,
    syncRangeTargetDates,
    syncRangeSourceLessons,
    syncRangeActiveLessons,
    toggleSyncLesson,
    setAllSyncLessons,
    copySelectedLessonsToDate,
    copyLessonRangeToDateRange,
    fillSyncRangeFromSelectedWeek
  } = useScheduleReuse({ vault, initialFocusedDate, selectedCalendarDate, weekStartPreference, schedulePanel, confirm, onAddLessons, setSelectedCalendarDate, setCalendarMonth, setScheduleError, showScheduleError, showScheduleNotice });
  const trash = useScheduleTrash({ vault, confirm, showScheduleError, onRestoreDeletedLessons, onPermanentlyDeleteDeletedLessons });
  const isAdmin = role === "admin";
  const scheduleAi = useScheduleAi({ vault, token, isAdmin, aiSession, onAiSessionChange, onApplyAiDraft, calendarMonth, selectedCalendarDate, weekStartPreference });
  const aiScheduleEntryVisible = isAdmin
    ? Boolean(vault.profile.aiSchedulingAdminEnabled ?? vault.profile.aiSchedulingEnabled)
    : Boolean(vault.profile.aiSchedulingEnabled);
  const singleSuggestedBillingHours = suggestedBillingHoursForDraft(singleCourseGroupId, singleStartTime, singleEndTime);
  const calendarSuggestedBillingHours = suggestedBillingHoursForDraft(calendarCourseGroupId, calendarStartTime, calendarEndTime);

  useEffect(() => {
    if (schedulePanel === "ai" && !aiScheduleEntryVisible) {
      setSchedulePanel("schedule");
    }
  }, [aiScheduleEntryVisible, schedulePanel]);

  useEffect(() => {
    const fallbackCourseId = courseSelectionOptions[0]?.id ?? "";
    const hasCourse = (courseId: string) => courseSelectionOptions.some((course) => course.id === courseId);
    setSingleCourseGroupId((current) => (hasCourse(current) ? current : fallbackCourseId));
    setCalendarCourseGroupId((current) => (hasCourse(current) ? current : fallbackCourseId));
  }, [courseSelectionOptionIds]);

  const visibleWeekdays = orderedWeekdays(weekStartPreference);
  const visibleWeekdayLabels = orderedWeekdayLabels(weekStartPreference, shortWeekdayLabels);
  const customTimePresets = vault.preferences?.customTimePresets ?? [];
  const singleCourseOptions = filterScheduleCourseOptions(vault, courseSelectionOptions, singleCourseSearch, singleCourseGroupId);
  const calendarCourseOptions = filterScheduleCourseOptions(vault, courseSelectionOptions, calendarCourseSearch, calendarCourseGroupId);
  const studentStatsSubjects = subjectOptionsForVault(vault);
  const selectedCourse = selected ? getCourse(vault, selected.courseGroupId) : undefined;
  const detailCourseGroupOptions = selectedCourse && !courseSelectionOptions.some((course) => course.id === selectedCourse.id)
    ? [selectedCourse, ...courseSelectionOptions]
    : courseSelectionOptions;
  const selectedOriginalLesson = selected?.linkedOriginalLessonId
    ? vault.lessons.find((lesson) => lesson.id === selected.linkedOriginalLessonId)
    : undefined;
  const selectedPreviousLesson = selected ? previousLesson(vault, selected) : undefined;
  const selectedPreviousTaught = selectedPreviousLesson?.content.taught.trim() ?? "";
  const selectedPreviousHomework = selectedPreviousLesson?.content.homework.trim() ?? "";
  const {
    temporaryStudentId,
    setTemporaryStudentId,
    temporaryStudentSearch,
    setTemporaryStudentSearch,
    attendanceStudentFilter,
    setAttendanceStudentFilter,
    attendancePanelOpen,
    setAttendancePanelOpen,
    makeupOriginalDateFilter,
    setMakeupOriginalDateFilter,
    makeupDate,
    setMakeupDate,
    makeupStartTime,
    setMakeupStartTime,
    makeupEndTime,
    setMakeupEndTime,
    setDetailMakeupStudentIds,
    makeupArrangementOpen,
    setMakeupArrangementOpen,
    selectedExpectedStudentCount,
    selectedAttendedStudentCount,
    selectedCalculatedAmount,
    selectedCalculatedPresentCount,
    selectedCalculatedBillableCount,
    selectedActualHours,
    selectedSuggestedBillingHours,
    selectedBillingHours,
    selectedLinkedMakeupLessons,
    selectedMakeupCandidateStudentIds,
    selectedWholeLessonPending,
    selectedMakeupAssignableStudentIds,
    selectedDetailMakeupStudentIds,
    selectedTemporaryStudent,
    displayedTemporaryStudentOptions,
    availableTrialStudentOptionCount,
    selectedNamedTrialStudentCount,
    selectedAttendanceEntries,
    scheduledMakeupLessonForStudent,
    makeupEntries,
    scheduledMakeupEntries,
    isMakeupTimeValid,
    recalculateLessonFee,
    updateSelected,
    recalculateSelectedFee,
    updateSelectedBillingHours,
    resetSelectedBillingHoursToSuggested,
    updateSelectedStatus,
    updateSelectedCourse,
    updateContent,
    updateAttendance,
    updateAttendanceMakeupExempt,
    updateMakeupManagementAttendance,
    updateMakeupManagementExempt,
    markOriginalStudentsMadeUp,
    completeScheduledMakeupLessons,
    updateAttendanceNote,
    toggleDetailMakeupStudent,
    makeupMarkerForLesson,
    createSelectedMakeupLesson,
    updateTemporaryFee,
    defaultTemporaryFeeForEntry,
    updateTrialStats,
    addTemporaryStudent,
    askRemoveLessonStudent,
    updateSelectedDate,
    updateSelectedTime
  } = useScheduleAttendance({ vault, selected, selectedId, studentOptions, selectedCalendarDate, weekStartPreference, confirm, onUpdateLesson, onUpdateLessons, onAddLessonAndUpdateLesson, openLessonInRecords, setSelectedCalendarDate, setCalendarMonth, findTimeConflict, validateTimeRange, showScheduleError, showScheduleNotice });

  const {
    checklistSyncMessage,
    checklistSyncResult,
    checklistLastSyncSource,
    selectedChecklistSyncSummary,
    selectedChecklistPerStudentStatus,
    syncSelectedLessonChecklist,
    toggleSelectedLessonChecklistCompletion
  } = useScheduleChecklist({ vault, selected, selectedPreviousLesson, onSaveChecklistCompletions, onUpdateChecklistCompletions });
  const dateShortcuts = [
    { label: "今天", value: offsetDate(0) },
    { label: "昨天", value: offsetDate(-1) },
    { label: "前天", value: offsetDate(-2) }
  ];
  const isSingleTimeValid = isOrderedTimeRange(singleStartTime, singleEndTime);
  const isCustomPresetTimeValid = isOrderedTimeRange(customPresetStart, customPresetEnd);
  const isCalendarTimeValid = isOrderedTimeRange(calendarStartTime, calendarEndTime);
  function suggestedBillingHoursForDraft(courseGroupId: string, startTime: string, endTime: string): number {
    const course = getCourse(vault, courseGroupId);
    if (!course || !isOrderedTimeRange(startTime, endTime)) return 0;
    return billableHoursForCourseLesson(course, { startTime, endTime });
  }

  function updateSingleStartTime(startTime: string) {
    updateTimeWithTwoHourEnd(startTime, setSingleStartTime, setSingleEndTime);
  }

  function updateCalendarStartTime(startTime: string) {
    updateTimeWithTwoHourEnd(startTime, setCalendarStartTime, setCalendarEndTime);
  }

  function updateCustomPresetStartTime(startTime: string) {
    updateTimeWithTwoHourEnd(startTime, setCustomPresetStart, setCustomPresetEnd);
  }

  function addSingleLesson(status: "scheduled" | "completed") {
    addLessonFromCourse(singleCourseGroupId, singleDate, singleStartTime, singleEndTime, status, parseOptionalBillingHours(singleBillingHours));
  }

  function goToCalendarSchedulingFromSingle() {
    if (!validateTimeRange(singleStartTime, singleEndTime)) return;
    setCalendarCourseGroupId(singleCourseGroupId);
    setCalendarStartTime(singleStartTime);
    setCalendarEndTime(singleEndTime);
    setSelectedCalendarDate(singleDate);
    setCalendarMonth(singleDate.slice(0, 7));
    switchSchedulePanel("calendar", { calendarMode: "schedule" });
  }

  function addLessonFromCourse(
    courseGroupId: string,
    lessonDate: string,
    lessonStartTime: string,
    lessonEndTime: string,
    status: "scheduled" | "completed",
    manualBillingHours?: number,
    force = false
  ) {
    if (!validateTimeRange(lessonStartTime, lessonEndTime)) return;
    const course = getCourse(vault, courseGroupId);
    if (!course) return;
    if (course.status !== "active") {
      showScheduleError("这个课程已暂停，请先在档案信息中启用或选择当前课程。");
      return;
    }
    if (!courseHasActiveStudent(vault, course)) {
      showScheduleError("这个课程没有在读学生，请先在档案信息中关联在读学生。");
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
        onConfirm: () => addLessonFromCourse(courseGroupId, lessonDate, lessonStartTime, lessonEndTime, status, manualBillingHours, true)
      });
      return;
    }
    onAddLesson(
      createLessonFromCourse(vault, course, {
        date: lessonDate,
        startTime: lessonStartTime,
        endTime: lessonEndTime,
        campusId: course.defaultCampusId,
        manualBillingHours,
        status
      })
    );
    showScheduleNotice(`已添加 ${dateWithWeekday(lessonDate)} ${lessonStartTime}-${lessonEndTime} 的课节。`);
  }

  // --- Per-day time group handlers ---

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

  function refreshLessonFromCurrentCourse(lesson: Lesson): Lesson | null {
    const course = getCourse(vault, lesson.courseGroupId);
    if (!course) return null;
    return recalculateLessonFee({
      ...lesson,
      campusId: course.defaultCampusId,
      type: course.type,
      expectedStudentIds: [...course.studentIds],
      attendance: attendanceForStudentIds(vault, lesson, course.studentIds),
      trialStudentCount: isClassBillingCourseType(course.type) ? lesson.trialStudentCount ?? 0 : 0,
      trialFee: isClassBillingCourseType(course.type) ? lesson.trialFee ?? 0 : 0
    });
  }

  function refreshSelectedCalendarDateLessons() {
    if (selectedCalendarDateAllLessons.length === 0) {
      showScheduleError("选中日期没有课节，不需要刷新。");
      return;
    }
    if (selectedCalendarRefreshableLessons.length === 0) {
      showScheduleError("选中日期的课节都缺少课程档案，无法按课程档案刷新。");
      return;
    }
    const missingCourseCount = selectedCalendarDateAllLessons.length - selectedCalendarRefreshableLessons.length;
    confirm({
      title: `刷新 ${dateWithWeekday(selectedCalendarDate)} 的课节？`,
      description: `会按当前课程档案刷新当天 ${selectedCalendarRefreshableLessons.length} 节课的班型、校区、学生名单和金额快照，包含已完成历史课节；课程内容、作业、备注会保留，同一学生原有出勤状态和备注会保留。${missingCourseCount > 0 ? `另有 ${missingCourseCount} 节课缺少课程档案，会自动跳过。` : ""}`,
      confirmLabel: "刷新当天课节",
      onConfirm: () => {
        const refreshedLessons = selectedCalendarRefreshableLessons
          .map((lesson) => refreshLessonFromCurrentCourse(lesson))
          .filter((lesson): lesson is Lesson => Boolean(lesson));
        onUpdateLessons(refreshedLessons);
        showScheduleNotice(`已刷新 ${dateWithWeekday(selectedCalendarDate)} 的 ${refreshedLessons.length} 节课。`);
      }
    });
  }

  function askDeleteLesson(lesson: Lesson) {
    const linkedMakeupCount = vault.lessons.filter((item) => item.linkedOriginalLessonId === lesson.id).length;
    confirm({
      title: "移入回收站？",
      description: `${dateWithWeekday(lesson.date)} ${lesson.startTime}-${lesson.endTime} · ${courseName(vault, lesson.courseGroupId)}。${linkedMakeupCount > 0 ? `这节原课关联的 ${linkedMakeupCount} 节补课会一并移入回收站。` : ""}移入后可在回收站恢复。`,
      confirmLabel: "移入回收站",
      tone: "danger",
      onConfirm: () => onDeleteLesson(lesson.id)
    });
  }

  function applyScheduleAdjustmentPreview(items: ScheduleAdjustmentPreviewItem[], conflictPolicy: ScheduleAdjustmentConflictPolicy) {
    const writableItems = items.filter((item) => item.willApply);
    if (writableItems.length === 0) {
      showScheduleError("当前预览没有可写入的课节，请先选择课节并设置有效调整规则。");
      return;
    }
    const conflictCount = writableItems.filter((item) => item.conflictLesson || item.movingConflictLesson).length;
    const skippedCount = Math.max(items.length - writableItems.length, 0);
    confirm({
      title: `写入 ${writableItems.length} 节课表调整？`,
      description: `系统会批量修改这些课节的日期、时间和校区，并按当前课程规则重新计算金额快照；学生、出勤、课程内容、作业、备注和状态会保留。${skippedCount > 0 ? ` 另有 ${skippedCount} 节因冲突、无变化或信息不完整会跳过。` : ""}${conflictCount > 0 && conflictPolicy === "allow" ? ` 其中 ${conflictCount} 节存在时间冲突，但已选择允许同时间多课。` : ""}`,
      confirmLabel: "写入调整",
      onConfirm: () => {
        onUpdateLessons(writableItems.map((item) => recalculateLessonFee(item.nextLesson)));
        showScheduleNotice(`已写入 ${writableItems.length} 节课表调整${skippedCount > 0 ? `，跳过 ${skippedCount} 节` : ""}。`);
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

  function showScheduleError(message: string) {
    setScheduleNotice("");
    setScheduleError(message);
    window.setTimeout(() => {
      setScheduleError((current) => (current === message ? "" : current));
    }, 3200);
  }

  function showScheduleNotice(message: string) {
    setScheduleError("");
    setScheduleNotice(message);
    window.setTimeout(() => {
      setScheduleNotice((current) => (current === message ? "" : current));
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
        dayNote={calendarDetailDayNote}
        lessons={calendarDetailLessons}
        makeupMarkerForLesson={makeupMarkerForLesson}
        onClose={() => setCalendarDetailDate(null)}
        onDeleteLesson={askDeleteLesson}
        onOpenDate={openDateInRecords}
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
        deletedLessonCount={trash.deletedLessonCount}
        onChange={switchSchedulePanel}
        role={role}
        aiSchedulingEnabled={aiScheduleEntryVisible}
      />
      {lessonReturnTarget?.kind === "view" && schedulePanel !== "records" && (
        <div className="flex flex-col gap-2 rounded-[12px] border border-[#bfdbfe] bg-[#eaf2ff] px-4 py-3 text-sm font-semibold text-[#1557c2] sm:flex-row sm:items-center sm:justify-between">
          <span>当前从{lessonReturnTarget.label.replace(/^返回/, "")}跳转而来，可完成排课后返回继续核对。</span>
          <Button type="button" variant="outline" size="sm" className="border-[#bfdbfe] bg-white text-[#1557c2]" onClick={() => onReturnToView(lessonReturnTarget)}>
            <CornerUpLeft size={15} /> {lessonReturnTarget.label}
          </Button>
        </div>
      )}
      {scheduleError && (
        <div className="rounded-[12px] border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm font-extrabold text-[#b91c1c]">
          {scheduleError}
        </div>
      )}
      {scheduleNotice && (
        <div className="rounded-[12px] border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm font-extrabold text-[#15803d]">
          {scheduleNotice}
        </div>
      )}

      {schedulePanel === "ai" && aiScheduleEntryVisible && (
        <ScheduleAiPanel {...scheduleAi} />
      )}
      {schedulePanel === "schedule" && (
        <ScheduleDayReusePanel
          onApply={() => copySelectedLessonsToDate()}
          onApplyRange={() => copyLessonRangeToDateRange()}
          onClearLessons={() => setAllSyncLessons(false)}
          onSelectAllLessons={() => setAllSyncLessons(true)}
          onToggleLesson={toggleSyncLesson}
          onUsePreviousWeek={() => setSyncSourceDate(addDays(syncTargetDate, -7))}
          onUsePreviousWeekRange={() => {
            setSyncRangeSourceStart(addDays(syncRangeTargetStart, -7));
            setSyncRangeSourceEnd(addDays(syncRangeTargetEnd, -7));
          }}
          preview={dayReusePreview}
          rangePreview={rangeReusePreview}
          rangeSourceDates={syncRangeSourceDates}
          rangeSourceEnd={syncRangeSourceEnd}
          rangeSourceStart={syncRangeSourceStart}
          rangeTargetDates={syncRangeTargetDates}
          rangeTargetEnd={syncRangeTargetEnd}
          rangeTargetStart={syncRangeTargetStart}
          selectableLessons={selectableSyncLessons}
          selectedLessonIds={selectedSyncLessonIds}
          selectedLessons={selectedSyncLessons}
          setSourceDate={setSyncSourceDate}
          setTargetDate={setSyncTargetDate}
          setRangeSourceEnd={setSyncRangeSourceEnd}
          setRangeSourceStart={setSyncRangeSourceStart}
          setRangeTargetEnd={setSyncRangeTargetEnd}
          setRangeTargetStart={setSyncRangeTargetStart}
          sourceDate={syncSourceDate}
          sourceLessons={syncSourceLessons}
          targetDate={syncTargetDate}
          vault={vault}
        />
      )}
      {schedulePanel === "schedule" && (
        <SchedulePlanningPanel
          {...batchPlanning}
          customPresetEnd={customPresetEnd}
          customPresetStart={customPresetStart}
          customTimePresets={customTimePresets}
          dateShortcuts={dateShortcuts}
          isCustomPresetTimeValid={isCustomPresetTimeValid}
          isSingleTimeValid={isSingleTimeValid}
          onAddCustomPreset={addCustomPreset}
          onAddSingleLesson={addSingleLesson}
          onDeleteCustomPreset={(preset) =>
            confirm({
              title: `删除常用时段「${preset.label}」？`,
              description: `${preset.startTime}-${preset.endTime}`,
              confirmLabel: "删除",
              tone: "danger",
              onConfirm: () => onDeleteCustomTimePreset(preset.id)
            })
          }
          onGoToCalendarScheduling={goToCalendarSchedulingFromSingle}
          setCustomPresetEnd={setCustomPresetEnd}
          setCustomPresetStart={updateCustomPresetStartTime}
          setSingleBillingHours={setSingleBillingHours}
          setSingleCourseGroupId={setSingleCourseGroupId}
          setSingleCourseSearch={setSingleCourseSearch}
          setSingleDate={setSingleDate}
          setSingleEndTime={setSingleEndTime}
          setSingleStartTime={updateSingleStartTime}
          singleBillingHours={singleBillingHours}
          singleCourseGroupId={singleCourseGroupId}
          singleCourseOptions={singleCourseOptions}
          singleCourseSearch={singleCourseSearch}
          singleDate={singleDate}
          singleEndTime={singleEndTime}
          singleStartTime={singleStartTime}
          singleSuggestedBillingHours={singleSuggestedBillingHours}
          visibleWeekdays={visibleWeekdays}
        />
      )}

      {schedulePanel === "substitute" && (
        <SubstituteClassLessonPanel
          amountsVisible={amountsVisible}
          campusOptions={campusOptions}
          subjectOptions={studentStatsSubjects}
          date={substituteDate}
          startTime={substituteStartTime}
          endTime={substituteEndTime}
          billingHours={substituteBillingHours}
          campusId={substituteCampusId}
          subject={substituteSubject}
          title={substituteTitle}
          externalClassName={substituteExternalClassName}
          originalTeacherName={substituteOriginalTeacherName}
          salaryGradeStage={substituteSalaryGradeStage}
          presentStudentCount={substitutePresentStudentCount}
          studentNamesText={substituteStudentNamesText}
          note={substituteNote}
          status={substituteStatus}
          isTimeValid={isSubstituteTimeValid}
          estimatedAmount={substitutePreviewSnapshot.amount}
          estimatedHours={substitutePreviewSnapshot.hours ?? 0}
          estimatedPerStudentFee={substitutePreviewSnapshot.perPresentStudentFee ?? 0}
          salaryGradeLabel={substitutePreviewSnapshot.salaryGradeLabel ?? "未设置"}
          onAdd={addSubstituteClassRecord}
          setDate={setSubstituteDate}
          setStartTime={setSubstituteStartTime}
          setEndTime={setSubstituteEndTime}
          setBillingHours={setSubstituteBillingHours}
          setCampusId={setSubstituteCampusId}
          setSubject={setSubstituteSubject}
          setTitle={setSubstituteTitle}
          setExternalClassName={setSubstituteExternalClassName}
          setOriginalTeacherName={setSubstituteOriginalTeacherName}
          setSalaryGradeStage={setSubstituteSalaryGradeStage}
          setPresentStudentCount={setSubstitutePresentStudentCount}
          setStudentNamesText={setSubstituteStudentNamesText}
          setNote={setSubstituteNote}
          setStatus={setSubstituteStatus}
        />
      )}

      {schedulePanel === "adjust" && (
        <ScheduleAdjustmentPanel
          campusOptions={campusOptions}
          onApplyPreview={applyScheduleAdjustmentPreview}
          vault={vault}
        />
      )}

      {schedulePanel === "calendar" && (
      <div className="space-y-6">
        <ScheduleCalendarPanel
          calendarBillingHours={calendarBillingHours}
          calendarCourseGroupId={calendarCourseGroupId}
          calendarCourseOptions={calendarCourseOptions}
          calendarCourseSearch={calendarCourseSearch}
          calendarEndTime={calendarEndTime}
          calendarFiltersClearDisabled={calendarViewCampusFilter === "all" && calendarViewCourseTypeFilter === "all" && calendarViewGradeFilter === "all" && calendarViewSubjectFilter === "all" && calendarViewMakeupFilter === "all" && !calendarViewStudentFilter}
          calendarGridProps={{
            amountsVisible,
            calendarCourseGroupId,
            calendarLessonsForDate,
            calendarMode,
            dayNoteForDate: calendarDayNoteForDate,
            calendarMonth,
            makeupMarkerForLesson,
            onDateClick: (calendarDate) => {
              setSelectedCalendarDate(calendarDate);
              if (calendarMode === "schedule") {
                if (!validateTimeRange(calendarStartTime, calendarEndTime, "日历排课的结束时间必须晚于开始时间。")) return;
                addLessonFromCourse(calendarCourseGroupId, calendarDate, calendarStartTime, calendarEndTime, "scheduled", parseOptionalBillingHours(calendarBillingHours));
                return;
              }
              setCalendarDetailDate(calendarDate);
            },
            selectedCalendarDate,
            vault,
            visibleWeekdayLabels,
            weekStartPreference
          }}
          calendarMode={calendarMode}
          calendarMonth={calendarMonth}
          calendarStartTime={calendarStartTime}
          calendarSuggestedBillingHours={calendarSuggestedBillingHours}
          calendarViewCampusFilter={calendarViewCampusFilter}
          calendarViewCampusOptions={calendarViewCampusOptions}
          calendarViewCourseTypeFilter={calendarViewCourseTypeFilter}
          calendarViewCourseTypeOptions={calendarViewCourseTypeOptions}
          calendarViewGradeFilter={calendarViewGradeFilter}
          calendarViewGradeOptions={calendarViewGradeOptions}
          calendarViewStudentFilter={calendarViewStudentFilter}
          calendarViewSubjectFilter={calendarViewSubjectFilter}
          calendarViewMakeupFilter={calendarViewMakeupFilter}
          calendarViewSubjectOptions={calendarViewSubjectOptions}
          isCalendarTimeValid={isCalendarTimeValid}
          onCalendarModeChange={setCalendarMode}
          onClearCalendarFilters={() => {
            setCalendarViewCampusFilter("all");
            setCalendarViewCourseTypeFilter("all");
            setCalendarViewGradeFilter("all");
            setCalendarViewSubjectFilter("all");
            setCalendarViewMakeupFilter("all");
            setCalendarViewStudentFilter("");
          }}
          onNextMonth={() => setCalendarMonth((month) => monthShift(month, 1))}
          onPreviousMonth={() => setCalendarMonth((month) => monthShift(month, -1))}
          onRefreshSelectedDateLessons={refreshSelectedCalendarDateLessons}
          onWeekStartChange={onWeekStartChange}
          refreshSelectedDateLessonCount={selectedCalendarRefreshableLessons.length}
          selectedCalendarLessonCount={selectedCalendarLessons.length}
          selectedCalendarWeekLessonCount={selectedCalendarWeekLessons.length}
          setCalendarCourseGroupId={setCalendarCourseGroupId}
          setCalendarBillingHours={setCalendarBillingHours}
          setCalendarCourseSearch={setCalendarCourseSearch}
          setCalendarEndTime={setCalendarEndTime}
          setCalendarStartTime={updateCalendarStartTime}
          setCalendarViewCampusFilter={setCalendarViewCampusFilter}
          setCalendarViewCourseTypeFilter={setCalendarViewCourseTypeFilter}
          setCalendarViewGradeFilter={setCalendarViewGradeFilter}
          setCalendarViewStudentFilter={setCalendarViewStudentFilter}
          setCalendarViewSubjectFilter={setCalendarViewSubjectFilter}
          setCalendarViewMakeupFilter={setCalendarViewMakeupFilter}
          syncPanelProps={{
            isOpen: syncPanelOpen,
            onClearSyncLessons: () => setAllSyncLessons(false),
            onCopyLessonRangeToDateRange: () => copyLessonRangeToDateRange(),
            onCopySelectedLessonsToDate: () => copySelectedLessonsToDate(),
            onFillSyncRangeFromSelectedWeek: fillSyncRangeFromSelectedWeek,
            onSelectAllSyncLessons: () => setAllSyncLessons(true),
            onToggleOpen: () => setSyncPanelOpen((value) => !value),
            onToggleSyncLesson: toggleSyncLesson,
            onUsePreviousWeekSameDay: () => setSyncSourceDate(addDays(syncTargetDate || selectedCalendarDate, -7)),
            selectableSyncLessons,
            selectedSyncLessonIds,
            selectedSyncLessons,
            setSyncRangeSourceEnd,
            setSyncRangeSourceStart,
            setSyncRangeTargetEnd,
            setSyncRangeTargetStart,
            setSyncSourceDate,
            setSyncTargetDate,
            syncRangeActiveLessons,
            syncRangeSourceDates,
            syncRangeSourceEnd,
            syncRangeSourceLessons,
            syncRangeSourceStart,
            syncRangeTargetDates,
            syncRangeTargetEnd,
            syncRangeTargetStart,
            syncSourceDate,
            syncSourceLessons,
            syncTargetDate,
            vault
          }}
          weekStartPreference={weekStartPreference}
        />

        <ScheduleCalendarFollowupPanels
          amountsVisible={amountsVisible}
          completedCount={selectedCalendarCompletedCount}
          dateWithWeekday={dateWithWeekday}
          dayNote={selectedCalendarDayNote}
          makeupEntries={makeupEntries}
          makeupMarkerForLesson={makeupMarkerForLesson}
          makeupOriginalDateFilter={makeupOriginalDateFilter}
          onDeleteLesson={askDeleteLesson}
          onMakeupOriginalDateFilterChange={setMakeupOriginalDateFilter}
          onOpenDate={openDateInRecords}
          onOpenLesson={openLessonInRecords}
          optionalDateWithWeekday={optionalDateWithWeekday}
          pendingCount={selectedCalendarPendingCount}
          cancelledCount={selectedCalendarCancelledCount}
          scheduledMakeupEntries={scheduledMakeupEntries}
          selectedCalendarDate={selectedCalendarDate}
          selectedCalendarLessons={selectedCalendarLessons}
          totalAmount={selectedCalendarAmount}
          vault={vault}
        />
      </div>
      )}

      {schedulePanel === "makeup" && (
        <div className="space-y-4">
          <div className="inline-grid grid-cols-2 rounded-[14px] border border-[#dbe4ef] bg-white p-1 shadow-[0_8px_22px_rgba(15,35,66,0.06)]">
            <button
              type="button"
              onClick={() => setMakeupManagementTab("regular")}
              className={`rounded-[10px] px-4 py-2 text-sm font-extrabold transition-colors ${makeupManagementTab === "regular" ? "bg-[#1557c2] text-white" : "text-[#25324a] hover:bg-[#f8fbff]"}`}
            >
              正式补课
            </button>
            <button
              type="button"
              onClick={() => setMakeupManagementTab("substitute")}
              className={`rounded-[10px] px-4 py-2 text-sm font-extrabold transition-colors ${makeupManagementTab === "substitute" ? "bg-[#1557c2] text-white" : "text-[#25324a] hover:bg-[#f8fbff]"}`}
            >
              代班补课
            </button>
          </div>
          {makeupManagementTab === "regular" ? (
            <ScheduleCalendarFollowupPanels
              amountsVisible={amountsVisible}
              completedCount={selectedCalendarCompletedCount}
              dateWithWeekday={dateWithWeekday}
              dayNote={selectedCalendarDayNote}
              makeupEntries={makeupEntries}
              makeupMarkerForLesson={makeupMarkerForLesson}
              makeupOriginalDateFilter={makeupOriginalDateFilter}
              onCompleteScheduledMakeups={completeScheduledMakeupLessons}
              onDeleteLesson={askDeleteLesson}
              onMakeupOriginalDateFilterChange={setMakeupOriginalDateFilter}
              onMarkOriginalStudentsMadeUp={markOriginalStudentsMadeUp}
              onOpenDate={openDateInRecords}
              onOpenLesson={openLessonInRecords}
              onUpdateOriginalAttendance={updateMakeupManagementAttendance}
              onUpdateOriginalMakeupExempt={updateMakeupManagementExempt}
              optionalDateWithWeekday={optionalDateWithWeekday}
              pendingCount={selectedCalendarPendingCount}
              cancelledCount={selectedCalendarCancelledCount}
              scheduledMakeupEntries={scheduledMakeupEntries}
              selectedCalendarDate={selectedCalendarDate}
              selectedCalendarLessons={selectedCalendarLessons}
              showDailyDetails={false}
              totalAmount={selectedCalendarAmount}
              vault={vault}
            />
          ) : (
            <SubstituteClassLessonPanel
              amountsVisible={amountsVisible}
              campusOptions={campusOptions}
              subjectOptions={studentStatsSubjects}
              date={substituteDate}
              startTime={substituteStartTime}
              endTime={substituteEndTime}
              billingHours={substituteBillingHours}
              campusId={substituteCampusId}
              subject={substituteSubject}
              title={substituteTitle}
              externalClassName={substituteExternalClassName}
              originalTeacherName={substituteOriginalTeacherName}
              salaryGradeStage={substituteSalaryGradeStage}
              presentStudentCount={substitutePresentStudentCount}
              studentNamesText={substituteStudentNamesText}
              note={substituteNote}
              status={substituteStatus}
              isTimeValid={isSubstituteTimeValid}
              estimatedAmount={substitutePreviewSnapshot.amount}
              estimatedHours={substitutePreviewSnapshot.hours ?? 0}
              estimatedPerStudentFee={substitutePreviewSnapshot.perPresentStudentFee ?? 0}
              salaryGradeLabel={substitutePreviewSnapshot.salaryGradeLabel ?? "未设置"}
              onAdd={addSubstituteClassRecord}
              setDate={setSubstituteDate}
              setStartTime={setSubstituteStartTime}
              setEndTime={setSubstituteEndTime}
              setBillingHours={setSubstituteBillingHours}
              setCampusId={setSubstituteCampusId}
              setSubject={setSubstituteSubject}
              setTitle={setSubstituteTitle}
              setExternalClassName={setSubstituteExternalClassName}
              setOriginalTeacherName={setSubstituteOriginalTeacherName}
              setSalaryGradeStage={setSubstituteSalaryGradeStage}
              setPresentStudentCount={setSubstitutePresentStudentCount}
              setStudentNamesText={setSubstituteStudentNamesText}
              setNote={setSubstituteNote}
              setStatus={setSubstituteStatus}
            />
          )}
        </div>
      )}

      {schedulePanel === "studentStats" && (
        <ScheduleStudentStatsPanel
          {...studentStats}
          amountsVisible={amountsVisible}
          campusOptions={campusOptions}
          onOpenLesson={openLessonInRecords}
          subjectOptions={studentStatsSubjects}
          vault={vault}
        />
      )}

      {schedulePanel === "trash" && (
        <ScheduleTrashPanel
          {...trash}
          campusOptions={campusOptions}
          dateWithWeekday={dateWithWeekday}
          vault={vault}
        />
      )}

      {schedulePanel === "records" && (
      <div data-onboarding="lesson-records" className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
        {!selected && lessonReturnTarget && (
          <div className="xl:col-span-2">
            <Button type="button" variant="outline" size="sm" onClick={goBackToLessonSource}>
              <CornerUpLeft size={15} /> {lessonReturnTarget.label}
            </Button>
          </div>
        )}
        <ScheduleRecordsListCard
          amountsVisible={amountsVisible}
          campusFilter={campusFilter}
          campusOptions={campusOptions}
          courseTypeFilter={courseTypeFilter}
          dateWithWeekday={dateWithWeekday}
          dayNote={effectiveLessonScope === "day" ? calendarDayNoteForDate(effectiveLessonDay) : ""}
          effectiveLessonDay={effectiveLessonDay}
          effectiveLessonScope={effectiveLessonScope}
          lessonMonth={lessonMonth}
          lessonRangeEnd={lessonRangeEnd}
          lessonRangeStart={lessonRangeStart}
          lessonScope={lessonScope}
          lessonWeek={lessonWeek}
          lessons={lessons}
          onOpenLesson={openLessonInRecords}
          onRefreshSelectedDateLessons={refreshSelectedCalendarDateLessons}
          onDayNoteChange={onUpdateCalendarDayNote}
          refreshSelectedDateLessonCount={selectedCalendarRefreshableLessons.length}
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
          <ScheduleLessonDetailPanel
            amountsVisible={amountsVisible}
            attendancePanelOpen={attendancePanelOpen}
            attendanceStudentFilter={attendanceStudentFilter}
            availableTrialStudentOptionCount={availableTrialStudentOptionCount}
            campusOptions={campusOptions}
            courseGroupOptions={detailCourseGroupOptions}
            dateWithWeekday={dateWithWeekday}
            displayedTemporaryStudentOptions={displayedTemporaryStudentOptions}
            getDefaultTemporaryFeeForEntry={defaultTemporaryFeeForEntry}
            isMakeupTimeValid={isMakeupTimeValid}
            lessonHistoryLength={lessonHistory.length}
            lessonReturnTarget={lessonReturnTarget}
            makeupArrangementOpen={makeupArrangementOpen}
            makeupDate={makeupDate}
            makeupEndTime={makeupEndTime}
            makeupStartTime={makeupStartTime}
            onAddTemporaryStudent={addTemporaryStudent}
            onAskDeleteLesson={askDeleteLesson}
            onAskRemoveLessonStudent={askRemoveLessonStudent}
            onChecklistContentChange={(content) => onUpdateLesson({ ...selected, content })}
            onContentChange={updateContent}
            onCreateSelectedMakeupLesson={createSelectedMakeupLesson}
            onGoBackToLessonSource={goBackToLessonSource}
            onGoBackToPreviousLesson={goBackToPreviousLesson}
            onOpenLesson={openLessonInRecords}
            onOpenProgressChecklist={onOpenProgressChecklist}
            onOpenLessonFeedback={onOpenLessonFeedback}
            checklistSyncMessage={checklistSyncMessage}
            checklistSyncSummary={selectedChecklistSyncSummary}
            checklistPerStudentStatus={selectedChecklistPerStudentStatus}
            checklistSyncResult={checklistSyncResult}
            checklistLastSyncSource={checklistLastSyncSource}
            onSyncChecklistCompletions={syncSelectedLessonChecklist}
            onToggleChecklistCompletion={toggleSelectedLessonChecklistCompletion}
            onSelectDetailMakeupStudentIds={setDetailMakeupStudentIds}
            onSelectedCourseChange={updateSelectedCourse}
            onSelectedDateChange={updateSelectedDate}
            onSelectedTimeChange={updateSelectedTime}
            onSelectedStatusChange={updateSelectedStatus}
            onRecalculateSelectedFee={recalculateSelectedFee}
            onResetBillingHoursToSuggested={resetSelectedBillingHoursToSuggested}
            onToggleAttendancePanel={() => setAttendancePanelOpen((open) => !open)}
            onToggleDetailMakeupStudent={toggleDetailMakeupStudent}
            onToggleMakeupArrangement={() => setMakeupArrangementOpen((open) => !open)}
            onUpdateAttendance={updateAttendance}
            onUpdateAttendanceMakeupExempt={updateAttendanceMakeupExempt}
            onUpdateAttendanceNote={updateAttendanceNote}
            onUpdateBillingHours={updateSelectedBillingHours}
            onUpdateSelected={updateSelected}
            onUpdateTemporaryFee={updateTemporaryFee}
            onUpdateTrialStats={updateTrialStats}
            scheduledMakeupLessonForStudent={scheduledMakeupLessonForStudent}
            selected={selected}
            selectedAttendanceEntries={selectedAttendanceEntries}
            selectedActualHours={selectedActualHours}
            selectedAttendedStudentCount={selectedAttendedStudentCount}
            selectedBillingHours={selectedBillingHours}
            selectedCalculatedAmount={selectedCalculatedAmount}
            selectedCalculatedPresentCount={selectedCalculatedPresentCount}
            selectedCalculatedBillableCount={selectedCalculatedBillableCount}
            selectedCourse={selectedCourse}
            selectedDetailMakeupStudentIds={selectedDetailMakeupStudentIds}
            selectedExpectedStudentCount={selectedExpectedStudentCount}
            selectedLinkedMakeupLessons={selectedLinkedMakeupLessons}
            selectedMakeupAssignableStudentIds={selectedMakeupAssignableStudentIds}
            selectedMakeupCandidateStudentIds={selectedMakeupCandidateStudentIds}
            selectedOriginalLesson={selectedOriginalLesson}
            selectedPreviousHomework={selectedPreviousHomework}
            selectedPreviousLesson={selectedPreviousLesson}
            selectedPreviousTaught={selectedPreviousTaught}
            selectedSuggestedBillingHours={selectedSuggestedBillingHours}
            selectedTemporaryStudent={selectedTemporaryStudent}
            selectedWholeLessonPending={selectedWholeLessonPending}
            setAttendanceStudentFilter={setAttendanceStudentFilter}
            setMakeupDate={setMakeupDate}
            setMakeupEndTime={setMakeupEndTime}
            setMakeupStartTime={setMakeupStartTime}
            setTemporaryStudentId={setTemporaryStudentId}
            setTemporaryStudentSearch={setTemporaryStudentSearch}
            temporaryStudentId={temporaryStudentId}
            temporaryStudentSearch={temporaryStudentSearch}
            trialStudentCount={selectedNamedTrialStudentCount}
            vault={vault}
          />
        )}
      </div>
      )}
    </div>
  );
}
