import { useEffect, useMemo, useState } from "react";
import { CornerUpLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { ScheduleAdjustmentPanel, type ScheduleAdjustmentConflictPolicy, type ScheduleAdjustmentPreviewItem } from "@/frontend/components/ScheduleAdjustmentPanel";
import { ScheduleAiPanel } from "@/frontend/components/ScheduleAiPanel";
import { ScheduleCalendarDetailDialog } from "@/frontend/components/ScheduleCalendarDetailDialog";
import { ScheduleCalendarFollowupPanels } from "@/frontend/components/ScheduleCalendarFollowupPanels";
import { ScheduleCalendarPanel } from "@/frontend/components/ScheduleCalendarPanel";
import { ScheduleLessonDetailPanel } from "@/frontend/components/ScheduleLessonDetailPanel";
import { SchedulePanelTabs } from "@/frontend/components/SchedulePanelTabs";
import { SchedulePlanningPanel, type BatchRepeatMode, type BatchTimeGroup, type WeeklySchedulePatternSlot } from "@/frontend/components/SchedulePlanningPanel";
import { ScheduleRecordsListCard } from "@/frontend/components/ScheduleRecordsListCard";
import { ScheduleStudentStatsPanel } from "@/frontend/components/ScheduleStudentStatsPanel";
import { ScheduleTrashPanel } from "@/frontend/components/ScheduleTrashPanel";
import { SubstituteClassLessonPanel } from "@/frontend/components/SubstituteClassLessonPanel";
import { SUBSTITUTE_CLASS_COURSE_GROUP_ID } from "@/shared/types";
import type { AiProviderConfig, AiScheduleDraftResponse, AiScheduleSession, AiScheduleTaskType, AttendanceStatus, CourseGroup, DeletedLesson, Lesson, LessonStatus, ProgressChecklistCompletion, ProgressChecklistTemplate, SalaryGradeStage, StudentProgressRecord, TeacherVault, TimePreset, UserRole, WeekStart, Weekday } from "@/shared/types";
import { billableHoursForCourseLesson, buildFeeSnapshot, buildSubstituteClassFeeSnapshot, calculateClassHeadcountFee, classHeadcountBaseStudentCountForRule, feeRuleForCourseType, getCourse, hoursBetween, isSubstituteClassLesson, lessonDurationMultiplierForCourse, presentCount, resolveSalaryGradeRule, salaryGradeAmountForCount, salaryGradeStageForLesson, substituteClassPresentCount, suggestedLessonBillableHoursForVault, todayIso } from "@/frontend/lib/calculations";
import { generateAiScheduleDraft, getAiProviders, getUsableAiProviders } from "@/frontend/lib/cloud";
import { makeId } from "@/frontend/lib/crypto";
import {
  attendanceLabels,
  addDays,
  attendedStudentIdsForLesson,
  buildScheduleSyncLessonsForDate,
  campusName,
  compareByName,
  courseHasActiveStudent,
  courseName,
  courseTypeOptionsForVault,
  createLessonFromCourse,
  createSubstituteClassLesson,
  findStudent,
  formatDateIso,
  isMakeupNeededAttendanceEntry,
  isMakeupAttendanceStatus,
  lessonStatusLabels,
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
  subjectOptionsForVault,
  weekDatesFor,
  weekStartsOn,
  weekdayOfDateIso,
  weekdayLabels
} from "@/frontend/lib/helpers";
import {
  aiChatEndpoint,
  arrayValue,
  attendanceStatusForLessonStatus,
  buildStudentStatsGroupedLessonRows,
  buildStudentStatsRows,
  buildScheduleAiContext,
  canRestoreDeletedLesson,
  calendarLessonsForDateWithFilters,
  datesBetweenLocal,
  deletedLessonSourceLabel,
  deletedLessonSourceVariant,
  filterScheduleRecordLessons,
  filterScheduleCourseOptions,
  filterStudentStatsLessons,
  filterTrashLessons,
  filteredStudentIdsForStats,
  formatAiValue,
  isCompletedLessonStatus,
  isOrderedDateRange,
  isOrderedTimeRange,
  isPendingLessonStatus,
  isPlainRecord,
  isoWeekValue,
  lessonStatusForAttendanceStatus,
  matchesCalendarLessonFilters,
  offsetDate,
  sortDeletedLessons,
  textValue,
  timesOverlap
} from "@/frontend/lib/scheduleViewHelpers";
import { checklistCompletionAppliesToSource } from "@/frontend/lib/progressChecklist";
import { filterCoursesWithScopedLessons } from "@/frontend/lib/salaryDetailScope";
import type { CalendarFocus, CourseTypeFilter, ExternalLessonReturnTarget, InternalLessonReturnTarget, LessonReturnTarget, LessonScope, MakeupLessonFilter, SchedulePanel, StudentStatsMakeupFilter } from "@/frontend/lib/scheduleViewTypes";

function dateWithWeekday(date: string): string {
  return `${date} · ${weekdayLabels[weekdayOfDateIso(date)]}`;
}

function optionalDateWithWeekday(date: string | null | undefined): string {
  return date ? dateWithWeekday(date) : "未知";
}

type WeeklyPatternCreatableItem = {
  slot: WeeklySchedulePatternSlot;
  date: string;
  course: CourseGroup;
};

type WeeklyPatternPreview = {
  candidateCount: number;
  conflictCount: number;
  invalidSlotCount: number;
  creatableItems: WeeklyPatternCreatableItem[];
};

type BatchPerDayPreview = {
  totalCount: number;
  conflictCount: number;
  existingConflictCount: number;
  internalConflictCount: number;
  unassignedWeekdays: Weekday[];
  groupCounts: Array<{ groupId: string; count: number; conflictCount: number; existingConflictCount: number; internalConflictCount: number }>;
  creatableItems: Array<{ group: BatchTimeGroup; date: string }>;
};

function timeTwoHoursLater(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  const totalMinutes = Math.min(hour * 60 + minute + 120, 23 * 60 + 59);
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function parseOptionalBillingHours(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const hours = Number(trimmed);
  return Number.isFinite(hours) ? Math.max(hours, 0) : undefined;
}

type LessonChecklistSyncSource = "taught" | "homework";

type LessonChecklistSyncCandidate = {
  studentId: string;
  itemId: string;
  progressRecordId?: string;
};

type LessonChecklistSyncSummary = {
  templateName: string;
  studentCount: number;
  taughtLinkedItemCount: number;
  homeworkLinkedItemCount: number;
  taughtPendingCount: number;
  homeworkPendingCount: number;
  taughtCompletedCount: number;
  homeworkCompletedCount: number;
};

type LessonChecklistPerStudentStatus = {
  studentId: string;
  studentName: string;
  taughtPendingCount: number;
  homeworkPendingCount: number;
};

type LessonChecklistSyncResult = {
  studentId: string;
  studentName: string;
  taughtSyncedCount: number;
  homeworkSyncedCount: number;
};

function checklistCellKey(studentId: string, itemId: string): string {
  return `${studentId}::${itemId}`;
}

function linkedChecklistItemIds(
  lesson: Lesson,
  template: ProgressChecklistTemplate,
  source: LessonChecklistSyncSource
): string[] {
  const validItemIds = new Set(template.items.map((item) => item.id));
  const rawItemIds = source === "taught" ? lesson.content.taughtChecklistItemIds ?? [] : lesson.content.homeworkChecklistItemIds ?? [];
  return Array.from(new Set(rawItemIds)).filter((itemId) => validItemIds.has(itemId));
}

function buildLessonChecklistSyncCandidates({
  lesson,
  template,
  studentIds,
  completions,
  progressRecords,
  source
}: {
  lesson: Lesson;
  template: ProgressChecklistTemplate;
  studentIds: string[];
  completions: ProgressChecklistCompletion[];
  progressRecords: StudentProgressRecord[];
  source: LessonChecklistSyncSource;
}): LessonChecklistSyncCandidate[] {
  const itemIds = linkedChecklistItemIds(lesson, template, source);
  if (itemIds.length === 0 || studentIds.length === 0) return [];

  const existingKeys = new Set(
    completions
      .filter((completion) =>
        completion.templateId === template.id &&
        completion.courseGroupId === lesson.courseGroupId &&
        checklistCompletionAppliesToSource(completion, source)
      )
      .map((completion) => checklistCellKey(completion.studentId, completion.itemId))
  );
  const progressRecordByStudentId = new Map<string, StudentProgressRecord>();
  progressRecords
    .filter((record) => record.courseGroupId === lesson.courseGroupId && record.lessonId === lesson.id)
    .sort((a, b) => `${a.date} ${a.updatedAt}`.localeCompare(`${b.date} ${b.updatedAt}`))
    .forEach((record) => progressRecordByStudentId.set(record.studentId, record));

  return studentIds.flatMap((studentId) =>
    itemIds
      .filter((itemId) => !existingKeys.has(checklistCellKey(studentId, itemId)))
      .map((itemId) => ({
        studentId,
        itemId,
        progressRecordId: progressRecordByStudentId.get(studentId)?.id
      }))
  );
}

function buildLessonChecklistSyncSummary({
  lesson,
  template,
  studentCount,
  taughtPendingCount,
  homeworkPendingCount
}: {
  lesson: Lesson;
  template: ProgressChecklistTemplate;
  studentCount: number;
  taughtPendingCount: number;
  homeworkPendingCount: number;
}): LessonChecklistSyncSummary {
  const taughtLinkedItemCount = linkedChecklistItemIds(lesson, template, "taught").length;
  const homeworkLinkedItemCount = linkedChecklistItemIds(lesson, template, "homework").length;
  const taughtTotal = taughtLinkedItemCount * studentCount;
  const homeworkTotal = homeworkLinkedItemCount * studentCount;
  return {
    templateName: template.name,
    studentCount,
    taughtLinkedItemCount,
    homeworkLinkedItemCount,
    taughtPendingCount,
    homeworkPendingCount,
    taughtCompletedCount: Math.max(taughtTotal - taughtPendingCount, 0),
    homeworkCompletedCount: Math.max(homeworkTotal - homeworkPendingCount, 0)
  };
}

function endDateForLessonCount(startDate: string, weekdays: Weekday[], lessonCount: number): string {
  if (!startDate || weekdays.length === 0 || lessonCount <= 0) return "";
  let matched = 0;
  let cursor = startDate;
  for (let index = 0; index < 3660; index += 1) {
    if (weekdays.includes(weekdayOfDateIso(cursor))) {
      matched += 1;
      if (matched >= lessonCount) return cursor;
    }
    cursor = addDays(cursor, 1);
  }
  return "";
}

function endDateForRepeatWeeks(startDate: string, weekCount: number): string {
  if (!startDate || weekCount <= 0) return "";
  return addDays(startDate, weekCount * 7 - 1);
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
  ) => { candidateCount: number; createdCount: number; conflictCount: number };
  onWeekStartChange: (weekStart: WeekStart) => void;
  role: UserRole;
  token: string;
  calendarFocus?: CalendarFocus;
  aiSession: AiScheduleSession | null;
  onAiSessionChange: (session: AiScheduleSession | null) => void;
  onApplyAiDraft: (session: AiScheduleSession | null) => { ok: boolean; message: string };
  onReturnToView: (target: ExternalLessonReturnTarget) => void;
  onSaveChecklistCompletions: (completions: ProgressChecklistCompletion[]) => void;
  onOpenProgressChecklist?: (lesson: Lesson) => void;
  onOpenLessonFeedback?: (lesson: Lesson) => void;
}) {
  const initialFocusedDate = calendarFocus?.date ?? todayIso();
  const initialFocusedMonth = initialFocusedDate.slice(0, 7);
  const initialTargetPanel = calendarFocus?.targetPanel ?? "calendar";
  const initialSelectedLessonId = calendarFocus?.lessonId ?? vault.lessons[0]?.id ?? "";
  const weekStartPreference = weekStartsOn(vault);
  const initialWeekDates = weekDatesFor(initialFocusedDate, weekStartPreference);
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
  const [ruleCourseGroupId, setRuleCourseGroupId] = useState(firstCourseId);
  const [ruleCourseSearch, setRuleCourseSearch] = useState("");
  const [selectedWeekdays, setSelectedWeekdays] = useState<Weekday[]>([3]);
  const [ruleStartTime, setRuleStartTime] = useState("19:00");
  const [ruleEndTime, setRuleEndTime] = useState("21:00");
  const [ruleBillingHours, setRuleBillingHours] = useState("");
  const [rangeStart, setRangeStart] = useState(todayIso());
  const [rangeEnd, setRangeEnd] = useState(monthShift(todayIso().slice(0, 7), 1) + "-01");
  const [batchLessonTargetCount, setBatchLessonTargetCount] = useState("");
  const [batchRepeatMode, setBatchRepeatMode] = useState<BatchRepeatMode>("end_date");
  const [batchRepeatWeeks, setBatchRepeatWeeks] = useState("4");
  const [weeklyPatternSlots, setWeeklyPatternSlots] = useState<WeeklySchedulePatternSlot[]>([]);
  const [batchPerDayMode, setBatchPerDayMode] = useState(false);
  const [batchTimeGroups, setBatchTimeGroups] = useState<BatchTimeGroup[]>([]);
  const [calendarCourseGroupId, setCalendarCourseGroupId] = useState(firstCourseId);
  const [calendarCourseSearch, setCalendarCourseSearch] = useState("");
  const [calendarStartTime, setCalendarStartTime] = useState("19:00");
  const [calendarEndTime, setCalendarEndTime] = useState("21:00");
  const [calendarBillingHours, setCalendarBillingHours] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(initialFocusedMonth);
  const [calendarMode, setCalendarMode] = useState<"schedule" | "view">("view");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(initialFocusedDate);
  const [calendarViewCampusFilter, setCalendarViewCampusFilter] = useState("all");
  const [calendarViewCourseTypeFilter, setCalendarViewCourseTypeFilter] = useState<CourseTypeFilter>("all");
  const [calendarViewGradeFilter, setCalendarViewGradeFilter] = useState("all");
  const [calendarViewSubjectFilter, setCalendarViewSubjectFilter] = useState("all");
  const [calendarViewStudentFilter, setCalendarViewStudentFilter] = useState("");
  const [calendarViewMakeupFilter, setCalendarViewMakeupFilter] = useState<MakeupLessonFilter>("all");
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
  const [checklistSyncMessage, setChecklistSyncMessage] = useState("");
  const [checklistSyncResult, setChecklistSyncResult] = useState<LessonChecklistSyncResult[]>([]);
  const [checklistLastSyncSource, setChecklistLastSyncSource] = useState<LessonChecklistSyncSource | null>(null);
  const [campusFilter, setCampusFilter] = useState("all");
  const [studentFilter, setStudentFilter] = useState("");
  const [courseTypeFilter, setCourseTypeFilter] = useState<CourseTypeFilter>("all");
  const [studentStatsNameFilter, setStudentStatsNameFilter] = useState("");
  const [studentStatsCourseFilter, setStudentStatsCourseFilter] = useState("all");
  const [studentStatsCourseTypeFilter, setStudentStatsCourseTypeFilter] = useState<CourseTypeFilter>("all");
  const [studentStatsSubjectFilter, setStudentStatsSubjectFilter] = useState("all");
  const [studentStatsCampusFilter, setStudentStatsCampusFilter] = useState("all");
  const [studentStatsStatusFilter, setStudentStatsStatusFilter] = useState<"all" | Lesson["status"]>("all");
  const [studentStatsMakeupFilter, setStudentStatsMakeupFilter] = useState<StudentStatsMakeupFilter>("all");
  const [studentStatsDateStart, setStudentStatsDateStart] = useState(todayIso().slice(0, 7) + "-01");
  const [studentStatsDateEnd, setStudentStatsDateEnd] = useState(todayIso());
  const [studentStatsStartTime, setStudentStatsStartTime] = useState("");
  const [studentStatsEndTime, setStudentStatsEndTime] = useState("");
  const [expandedStudentStatsGroupIds, setExpandedStudentStatsGroupIds] = useState<string[]>([]);
  const studentStatsDateScopeLessons = useMemo(() => filterStudentStatsLessons(vault, {
    campusFilter: "all",
    courseFilter: "all",
    courseTypeFilter: "all",
    dateEnd: studentStatsDateEnd,
    dateStart: studentStatsDateStart,
    endTime: "",
    normalizedNameFilter: "",
    startTime: "",
    statusFilter: "all",
    subjectFilter: "all",
    makeupFilter: "all"
  }), [studentStatsDateEnd, studentStatsDateStart, vault]);
  const studentStatsCourseOptions = useMemo(
    () => sortCoursesByName(filterCoursesWithScopedLessons(vault.courseGroups, studentStatsDateScopeLessons)),
    [studentStatsDateScopeLessons, vault.courseGroups]
  );
  const studentStatsCourseOptionIds = studentStatsCourseOptions.map((course) => course.id).join("|");
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
  const [substituteDate, setSubstituteDate] = useState(todayIso());
  const [substituteStartTime, setSubstituteStartTime] = useState("19:00");
  const [substituteEndTime, setSubstituteEndTime] = useState("21:00");
  const [substituteBillingHours, setSubstituteBillingHours] = useState("");
  const [substituteCampusId, setSubstituteCampusId] = useState(vault.profile.homeCampusId ?? vault.campuses[0]?.id ?? "");
  const [substituteSubject, setSubstituteSubject] = useState("");
  const [substituteTitle, setSubstituteTitle] = useState("");
  const [substituteExternalClassName, setSubstituteExternalClassName] = useState("");
  const [substituteOriginalTeacherName, setSubstituteOriginalTeacherName] = useState("");
  const [substituteSalaryGradeStage, setSubstituteSalaryGradeStage] = useState<SalaryGradeStage>("junior_3");
  const [substitutePresentStudentCount, setSubstitutePresentStudentCount] = useState("");
  const [substituteStudentNamesText, setSubstituteStudentNamesText] = useState("");
  const [substituteNote, setSubstituteNote] = useState("");
  const [substituteStatus, setSubstituteStatus] = useState<"scheduled" | "completed">("completed");
  const [detailMakeupStudentIds, setDetailMakeupStudentIds] = useState<string[]>([]);
  const [makeupArrangementOpen, setMakeupArrangementOpen] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleNotice, setScheduleNotice] = useState("");
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
  const aiScheduleEntryVisible = isAdmin
    ? Boolean(vault.profile.aiSchedulingAdminEnabled ?? vault.profile.aiSchedulingEnabled)
    : Boolean(vault.profile.aiSchedulingEnabled);
  const calendarViewCampusOptions = sortCampusesForProfile(vault.campuses, vault.profile.homeCampusId);
  const calendarViewCourseTypeOptions = courseTypeOptionsForVault(vault);
  const calendarViewGradeOptions = Array.from(
    new Set(vault.students.map((student) => student.grade?.trim()).filter((grade): grade is string => Boolean(grade)))
  ).sort(compareByName);
  const calendarViewSubjectOptions = subjectOptionsForVault(vault);
  const syncSourceLessons = vault.lessons
    .filter((lesson) => lesson.date === syncSourceDate)
    .sort(sortLessons);
  const syncSourceLessonIds = syncSourceLessons.map((lesson) => lesson.id).join("|");
  const selectableSyncLessons = syncSourceLessons.filter((lesson) => {
    const course = getCourse(vault, lesson.courseGroupId);
    return Boolean(course && course.status === "active" && courseHasActiveStudent(vault, course));
  });
  const selectableSyncLessonIds = selectableSyncLessons.map((lesson) => lesson.id).join("|");
  const selectedWeekdayKey = selectedWeekdays.join("|");
  const batchTargetCount = Math.max(Math.floor(Number(batchLessonTargetCount)), 0);
  const batchRepeatWeekCount = Math.max(Math.floor(Number(batchRepeatWeeks)), 0);
  const isBatchRepeatWeeksValid = batchRepeatMode !== "weeks" || batchRepeatWeekCount > 0;
  const batchEffectiveRangeEnd = batchRepeatMode === "weeks" ? endDateForRepeatWeeks(rangeStart, batchRepeatWeekCount) : rangeEnd;
  const isBatchDateRangeValid = isBatchRepeatWeeksValid && isOrderedDateRange(rangeStart, batchEffectiveRangeEnd);
  const batchCandidateDates = isBatchRepeatWeeksValid && isOrderedDateRange(rangeStart, batchEffectiveRangeEnd)
    ? datesBetweenLocal(rangeStart, batchEffectiveRangeEnd).filter((date) => selectedWeekdays.includes(weekdayOfDateIso(date)))
    : [];
  const batchConflictCount = isOrderedTimeRange(ruleStartTime, ruleEndTime)
    ? batchCandidateDates.filter((date) => findTimeConflict(date, ruleStartTime, ruleEndTime)).length
    : 0;
  const weeklyPatternPreview = buildWeeklyPatternPreview();
  const weeklyPatternCandidateCount = weeklyPatternPreview.candidateCount;
  const weeklyPatternConflictCount = weeklyPatternPreview.conflictCount;
  const weeklyPatternCreatableCount = weeklyPatternPreview.creatableItems.length;
  const weeklyPatternInvalidSlotCount = weeklyPatternPreview.invalidSlotCount;
  const batchPerDayPreview = buildBatchPerDayPreview();
  const singleSuggestedBillingHours = suggestedBillingHoursForDraft(singleCourseGroupId, singleStartTime, singleEndTime);
  const ruleSuggestedBillingHours = suggestedBillingHoursForDraft(ruleCourseGroupId, ruleStartTime, ruleEndTime);
  const calendarSuggestedBillingHours = suggestedBillingHoursForDraft(calendarCourseGroupId, calendarStartTime, calendarEndTime);

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
    if (schedulePanel === "ai" && !aiScheduleEntryVisible) {
      setSchedulePanel("schedule");
    }
  }, [aiScheduleEntryVisible, schedulePanel]);

  useEffect(() => {
    const fallbackCourseId = courseSelectionOptions[0]?.id ?? "";
    const hasCourse = (courseId: string) => courseSelectionOptions.some((course) => course.id === courseId);
    setSingleCourseGroupId((current) => (hasCourse(current) ? current : fallbackCourseId));
    setRuleCourseGroupId((current) => (hasCourse(current) ? current : fallbackCourseId));
    setCalendarCourseGroupId((current) => (hasCourse(current) ? current : fallbackCourseId));
  }, [courseSelectionOptionIds]);

  useEffect(() => {
    if (batchRepeatMode !== "end_date" || !batchTargetCount || selectedWeekdays.length === 0) return;
    const nextEndDate = endDateForLessonCount(rangeStart, selectedWeekdays, batchTargetCount);
    if (nextEndDate && nextEndDate !== rangeEnd) {
      setRangeEnd(nextEndDate);
    }
  }, [batchRepeatMode, batchTargetCount, rangeStart, selectedWeekdayKey]);

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
    setSyncTargetDate(selectedCalendarDate);
    setSyncSourceDate(addDays(selectedCalendarDate, -7));
    const selectedWeekDates = weekDatesFor(selectedCalendarDate, weekStartPreference);
    setSyncRangeSourceStart(addDays(selectedWeekDates[0] ?? selectedCalendarDate, -7));
    setSyncRangeSourceEnd(addDays(selectedWeekDates[6] ?? selectedCalendarDate, -7));
    setSyncRangeTargetStart(selectedWeekDates[0] ?? selectedCalendarDate);
    setSyncRangeTargetEnd(selectedWeekDates[6] ?? selectedCalendarDate);
    setMakeupDate(selectedCalendarDate);
    setSubstituteDate(selectedCalendarDate);
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
    setStudentStatsCourseFilter((current) =>
      current === "all" || studentStatsCourseOptions.some((course) => course.id === current) ? current : "all"
    );
  }, [studentStatsCourseOptionIds]);

  useEffect(() => {
    setMakeupArrangementOpen(false);
    setDetailMakeupStudentIds([]);
  }, [selectedId]);

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
  const syncRangeActiveLessons = syncRangeSourceLessons.filter((lesson) => {
    const course = getCourse(vault, lesson.courseGroupId);
    return Boolean(course && course.status === "active" && courseHasActiveStudent(vault, course));
  });
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
  const selectedCalendarWeekLessons = vault.lessons.filter((lesson) => weekDatesFor(selectedCalendarDate, weekStartPreference).includes(lesson.date) && matchesCalendarLessonFilter(lesson));
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
  const normalizedStudentStatsNameFilter = studentStatsNameFilter.trim().toLowerCase();
  const studentStatsSubjects = subjectOptionsForVault(vault);
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
  const studentStatsLessons = filterStudentStatsLessons(vault, {
    campusFilter: studentStatsCampusFilter,
    courseFilter: studentStatsCourseFilter,
    courseTypeFilter: studentStatsCourseTypeFilter,
    dateEnd: studentStatsDateEnd,
    dateStart: studentStatsDateStart,
    endTime: studentStatsEndTime,
    normalizedNameFilter: normalizedStudentStatsNameFilter,
    startTime: studentStatsStartTime,
    statusFilter: studentStatsStatusFilter,
    subjectFilter: studentStatsSubjectFilter,
    makeupFilter: studentStatsMakeupFilter
  });
  const studentStatsRows = buildStudentStatsRows(vault, studentStatsLessons, normalizedStudentStatsNameFilter);
  const studentStatsGroupedLessonRows = buildStudentStatsGroupedLessonRows(vault, studentStatsLessons, normalizedStudentStatsNameFilter);
  const studentStatsExternalStudentCount = studentStatsLessons.reduce(
    (sum, lesson) => sum + (isSubstituteClassLesson(lesson) ? substituteClassPresentCount(lesson) : 0),
    0
  );
  const studentStatsStudentLessonCount = studentStatsLessons.reduce(
    (sum, lesson) => sum + (isSubstituteClassLesson(lesson) ? substituteClassPresentCount(lesson) : filteredStudentIdsForStats(vault, lesson, normalizedStudentStatsNameFilter).length),
    0
  );
  const studentStatsInvolvedStudentCount = studentStatsRows.length + studentStatsExternalStudentCount;
  const studentStatsStatusCounts = studentStatsLessons.reduce<Record<LessonStatus, number>>((counts, lesson) => {
    counts[lesson.status] += 1;
    return counts;
  }, {
    draft: 0,
    scheduled: 0,
    completed: 0,
    cancelled: 0,
    makeup_pending: 0,
    makeup_completed: 0
  });
  const studentStatsTotalFee = studentStatsLessons.reduce((sum, lesson) => sum + lesson.feeSnapshot.amount, 0);
  const studentStatsCompletedFeeTotal = studentStatsLessons.reduce(
    (sum, lesson) => sum + (isCompletedLessonStatus(lesson.status) ? lesson.feeSnapshot.amount : 0),
    0
  );
  const deletedLessons = sortDeletedLessons(vault.deletedLessons ?? []);
  const normalizedTrashSearch = trashSearch.trim().toLowerCase();
  const trashLessons = filterTrashLessons(vault, deletedLessons, {
    campusFilter: trashCampusFilter,
    dateEnd: trashDateEnd,
    dateStart: trashDateStart,
    normalizedSearch: normalizedTrashSearch,
    sourceFilter: trashSourceFilter
  });
  const selectedTrashIdSet = new Set(selectedTrashIds);
  const selectedVisibleTrashIds = trashLessons.filter((item) => selectedTrashIdSet.has(item.id)).map((item) => item.id);
  const selectedVisibleTrashLessonIds = new Set(
    trashLessons.filter((item) => selectedTrashIdSet.has(item.id)).map((item) => item.lesson.id)
  );
  const allVisibleTrashSelected = trashLessons.length > 0 && trashLessons.every((item) => selectedTrashIdSet.has(item.id));
  const activeLessonIds = new Set(vault.lessons.map((lesson) => lesson.id));
  const selectedTrashRestoreCount = selectedVisibleTrashIds.filter((id) => {
    const item = trashLessons.find((deletedLesson) => deletedLesson.id === id);
    return item ? canRestoreDeletedLesson(vault, activeLessonIds, item, selectedVisibleTrashLessonIds) : false;
  }).length;
  const selected = vault.lessons.find((lesson) => lesson.id === selectedId) ?? lessons[0];
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
  const selectedLessonStudentCount = selected ? lessonStudentIds(selected).length : 0;
  const selectedExpectedStudentCount = selected ? new Set(selected.expectedStudentIds).size : 0;
  const selectedAttendedStudentCount = selected ? attendedStudentIdsForLesson(selected).length : 0;
  const selectedRecalculatedLesson = selected ? recalculateLessonFee(selected) : undefined;
  const selectedCalculatedAmount = selectedRecalculatedLesson?.feeSnapshot.amount ?? selected?.feeSnapshot.amount ?? 0;
  const selectedCalculatedPresentCount = selectedRecalculatedLesson?.feeSnapshot.presentStudentCount ?? (selected ? presentCount(selected) : 0);
  const selectedActualHours = selected ? hoursBetween(selected.startTime, selected.endTime) : 0;
  const selectedSuggestedBillingHours = selected ? suggestedLessonBillableHoursForVault(vault, selected) : 0;
  const selectedBillingHours = selected?.feeSnapshot.hours ?? selectedSuggestedBillingHours;
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
        const isAvailable = student.status === "active" && !selected.expectedStudentIds.includes(student.id);
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
    selectedTemporaryStudent && selectedTemporaryStudent.status === "active" && !temporaryStudentOptions.some((student) => student.id === selectedTemporaryStudent.id)
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
          entry.note ?? "",
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
  const selectedChecklistTemplate = selected?.content.checklistTemplateId
    ? (vault.progressChecklistTemplates ?? []).find((template) => template.id === selected.content.checklistTemplateId)
    : undefined;
  const selectedChecklistStudentIds = selected
    ? lessonStudentIds(selected).filter((studentId) => findStudent(vault, studentId)?.status === "active")
    : [];
  const selectedTaughtChecklistSyncCandidates = selected && selectedChecklistTemplate
    ? buildLessonChecklistSyncCandidates({
        lesson: selected,
        template: selectedChecklistTemplate,
        studentIds: selectedChecklistStudentIds,
        completions: vault.progressChecklistCompletions ?? [],
        progressRecords: vault.studentProgressRecords ?? [],
        source: "taught"
      })
    : [];
  const selectedHomeworkChecklistSyncCandidates = selected && selectedChecklistTemplate
    ? buildLessonChecklistSyncCandidates({
        lesson: selected,
        template: selectedChecklistTemplate,
        studentIds: selectedChecklistStudentIds,
        completions: vault.progressChecklistCompletions ?? [],
        progressRecords: vault.studentProgressRecords ?? [],
        source: "homework"
      })
    : [];
  const selectedChecklistSyncSummary = selected && selectedChecklistTemplate
    ? buildLessonChecklistSyncSummary({
        lesson: selected,
        template: selectedChecklistTemplate,
        studentCount: selectedChecklistStudentIds.length,
        taughtPendingCount: selectedTaughtChecklistSyncCandidates.length,
        homeworkPendingCount: selectedHomeworkChecklistSyncCandidates.length
      })
    : undefined;

  const selectedChecklistPerStudentStatus: LessonChecklistPerStudentStatus[] = (() => {
    if (!selected || !selectedChecklistTemplate) return [];
    const studentMap = new Map<string, { taught: number; homework: number }>();
    for (const candidate of selectedTaughtChecklistSyncCandidates) {
      const entry = studentMap.get(candidate.studentId) ?? { taught: 0, homework: 0 };
      entry.taught++;
      studentMap.set(candidate.studentId, entry);
    }
    for (const candidate of selectedHomeworkChecklistSyncCandidates) {
      const entry = studentMap.get(candidate.studentId) ?? { taught: 0, homework: 0 };
      entry.homework++;
      studentMap.set(candidate.studentId, entry);
    }
    for (const studentId of selectedChecklistStudentIds) {
      if (!studentMap.has(studentId)) {
        studentMap.set(studentId, { taught: 0, homework: 0 });
      }
    }
    return Array.from(studentMap.entries())
      .map(([studentId, counts]) => ({
        studentId,
        studentName: findStudent(vault, studentId)?.name ?? "未知学生",
        taughtPendingCount: counts.taught,
        homeworkPendingCount: counts.homework,
      }))
      .sort((a, b) => compareByName(a.studentName, b.studentName) || a.studentId.localeCompare(b.studentId));
  })();

  useEffect(() => {
    setChecklistSyncMessage("");
    setChecklistSyncResult([]);
    setChecklistLastSyncSource(null);
  }, [selected?.id]);

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
  const isCalendarTimeValid = isOrderedTimeRange(calendarStartTime, calendarEndTime);
  const isMakeupTimeValid = isOrderedTimeRange(makeupStartTime, makeupEndTime);
  const isSubstituteTimeValid = isOrderedTimeRange(substituteStartTime, substituteEndTime);
  const substitutePresentCountNumber = Math.max(Math.floor(Number(substitutePresentStudentCount)), 0);
  const substituteManualBillingHours = parseOptionalBillingHours(substituteBillingHours);
  const substitutePreviewLesson: Lesson = {
    id: "preview_substitute_lesson",
    date: substituteDate || todayIso(),
    startTime: substituteStartTime,
    endTime: substituteEndTime,
    courseGroupId: SUBSTITUTE_CLASS_COURSE_GROUP_ID,
    campusId: substituteCampusId || undefined,
    type: "class",
    status: substituteStatus,
    lessonSource: "substitute_class",
    substituteClass: {
      title: substituteTitle.trim() || undefined,
      externalClassName: substituteExternalClassName.trim() || undefined,
      originalTeacherName: substituteOriginalTeacherName.trim() || undefined,
      subject: substituteSubject.trim() || undefined,
      salaryGradeStage: substituteSalaryGradeStage,
      presentStudentCount: substitutePresentCountNumber,
      studentNamesText: substituteStudentNamesText.trim() || undefined,
      note: substituteNote.trim() || undefined
    },
    expectedStudentIds: [],
    attendance: [],
    feeSnapshot: substituteManualBillingHours !== undefined
      ? { amount: 0, hours: substituteManualBillingHours, manualHours: true }
      : { amount: 0 },
    linkedOriginalLessonId: null,
    content: {
      taught: "",
      performance: "",
      homework: "",
      nextLessonReminder: "",
      internalNote: ""
    },
    note: substituteNote.trim() || undefined
  };
  const substitutePreviewSnapshot = buildSubstituteClassFeeSnapshot(vault, substitutePreviewLesson);
  const aiActiveStudentCount = vault.students.filter((student) => student.status === "active").length;
  const aiActiveCourseCount = vault.courseGroups.filter((course) => course.status === "active" && courseHasActiveStudent(vault, course)).length;
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

  function suggestedBillingHoursForDraft(courseGroupId: string, startTime: string, endTime: string): number {
    const course = getCourse(vault, courseGroupId);
    if (!course || !isOrderedTimeRange(startTime, endTime)) return 0;
    return billableHoursForCourseLesson(course, { startTime, endTime }, vault);
  }

  function updateTimeWithTwoHourEnd(startTime: string, setStartTime: (value: string) => void, setEndTime: (value: string) => void) {
    setStartTime(startTime);
    const nextEndTime = timeTwoHoursLater(startTime);
    if (nextEndTime) setEndTime(nextEndTime);
  }

  function updateSingleStartTime(startTime: string) {
    updateTimeWithTwoHourEnd(startTime, setSingleStartTime, setSingleEndTime);
  }

  function updateRuleStartTime(startTime: string) {
    updateTimeWithTwoHourEnd(startTime, setRuleStartTime, setRuleEndTime);
  }

  function updateCalendarStartTime(startTime: string) {
    updateTimeWithTwoHourEnd(startTime, setCalendarStartTime, setCalendarEndTime);
  }

  function updateCustomPresetStartTime(startTime: string) {
    updateTimeWithTwoHourEnd(startTime, setCustomPresetStart, setCustomPresetEnd);
  }

  function updateRangeEndManually(date: string) {
    setBatchLessonTargetCount("");
    setRangeEnd(date);
  }

  function addSingleLesson(status: "scheduled" | "completed") {
    addLessonFromCourse(singleCourseGroupId, singleDate, singleStartTime, singleEndTime, status, parseOptionalBillingHours(singleBillingHours));
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
        context: buildScheduleAiContext(vault, { calendarMonth, selectedCalendarDate, weekStartPreference })
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
        context: buildScheduleAiContext(vault, { calendarMonth, selectedCalendarDate, weekStartPreference })
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

  function addSubstituteClassRecord(force = false) {
    if (!substituteDate) {
      showScheduleError("请选择代班补课日期。");
      return;
    }
    if (!validateTimeRange(substituteStartTime, substituteEndTime, "代班补课结束时间必须晚于开始时间。")) return;
    if (substitutePresentCountNumber <= 0) {
      showScheduleError("请填写代班补课到课人数。");
      return;
    }
    const conflict = findTimeConflict(substituteDate, substituteStartTime, substituteEndTime);
    if (conflict && !force) {
      confirm({
        title: "代班补课时间已有课程",
        description: `${substituteDate} ${substituteStartTime}-${substituteEndTime} 与「${courseName(vault, conflict.courseGroupId)} ${conflict.startTime}-${conflict.endTime}」冲突。请确认是否仍要添加。`,
        confirmLabel: "仍然添加",
        tone: "danger",
        onConfirm: () => addSubstituteClassRecord(true)
      });
      return;
    }
    const lesson = createSubstituteClassLesson(vault, {
      date: substituteDate,
      startTime: substituteStartTime,
      endTime: substituteEndTime,
      campusId: substituteCampusId || undefined,
      subject: substituteSubject,
      title: substituteTitle,
      externalClassName: substituteExternalClassName,
      originalTeacherName: substituteOriginalTeacherName,
      salaryGradeStage: substituteSalaryGradeStage,
      presentStudentCount: substitutePresentCountNumber,
      studentNamesText: substituteStudentNamesText,
      note: substituteNote,
      manualBillingHours: substituteManualBillingHours,
      status: substituteStatus
    });
    onAddLesson(lesson);
    setSelectedId(lesson.id);
    setSelectedCalendarDate(substituteDate);
    setCalendarMonth(substituteDate.slice(0, 7));
    setLessonDay(substituteDate);
    setScheduleError("");
    showScheduleNotice(`已添加 ${dateWithWeekday(substituteDate)} ${substituteStartTime}-${substituteEndTime} 的代班补课记录。`);
    setSubstituteTitle("");
    setSubstituteExternalClassName("");
    setSubstituteOriginalTeacherName("");
    setSubstitutePresentStudentCount("");
    setSubstituteStudentNamesText("");
    setSubstituteNote("");
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

  function addWeeklyPatternSlot() {
    if (!ruleCourseGroupId) {
      showScheduleError("请先选择要加入周循环模板的课程。");
      return;
    }
    if (selectedWeekdays.length === 0) {
      showScheduleError("请先选择要加入周循环模板的星期。");
      return;
    }
    if (!validateTimeRange(ruleStartTime, ruleEndTime)) return;
    const course = getCourse(vault, ruleCourseGroupId);
    if (!course || course.status !== "active") {
      showScheduleError("这个课程已暂停或不存在，请先选择当前课程。");
      return;
    }
    if (!courseHasActiveStudent(vault, course)) {
      showScheduleError("这个课程没有在读学生，请先在档案信息中关联在读学生。");
      return;
    }

    const weekdays = Array.from(new Set(selectedWeekdays)).sort((a, b) => a - b);
    const billingHours = ruleBillingHours.trim();
    setWeeklyPatternSlots((current) => {
      const matchedIndex = current.findIndex(
        (slot) =>
          slot.courseGroupId === ruleCourseGroupId &&
          slot.startTime === ruleStartTime &&
          slot.endTime === ruleEndTime &&
          slot.billingHours.trim() === billingHours
      );
      if (matchedIndex < 0) {
        return [
          ...current,
          {
            id: makeId("weekly_pattern"),
            courseGroupId: ruleCourseGroupId,
            weekdays,
            startTime: ruleStartTime,
            endTime: ruleEndTime,
            billingHours
          }
        ];
      }
      return current.map((slot, index) =>
        index === matchedIndex
          ? { ...slot, weekdays: Array.from(new Set([...slot.weekdays, ...weekdays])).sort((a, b) => a - b) }
          : slot
      );
    });
    showScheduleNotice(`已加入周循环模板：${course.name} ${weekdays.map((day) => weekdayLabels[day]).join("、")} ${ruleStartTime}-${ruleEndTime}。`);
  }

  function applyWeeklyPatternSlot(slot: WeeklySchedulePatternSlot) {
    setRuleCourseGroupId(slot.courseGroupId);
    setSelectedWeekdays([...slot.weekdays].sort((a, b) => a - b));
    setRuleStartTime(slot.startTime);
    setRuleEndTime(slot.endTime);
    setRuleBillingHours(slot.billingHours);
  }

  function deleteWeeklyPatternSlot(slotId: string) {
    setWeeklyPatternSlots((current) => current.filter((slot) => slot.id !== slotId));
  }

  // --- Per-day time group handlers ---

  function setBatchPerDayModeWithSync(value: boolean) {
    if (value && !batchPerDayMode) {
      // Turning ON: seed first group from current single-time values
      setBatchTimeGroups([
        {
          id: makeId("btg"),
          startTime: ruleStartTime,
          endTime: ruleEndTime,
          billingHours: ruleBillingHours,
          weekdays: [...selectedWeekdays],
          rangeStart,
          rangeEnd: batchEffectiveRangeEnd
        }
      ]);
    } else if (!value && batchPerDayMode) {
      // Turning OFF: apply first group's time back to single inputs
      const first = batchTimeGroups[0];
      if (first) {
        setRuleStartTime(first.startTime);
        setRuleEndTime(first.endTime);
        setRuleBillingHours(first.billingHours);
      }
    }
    setBatchPerDayMode(value);
  }

  function addBatchTimeGroup() {
    setBatchTimeGroups((current) => [
      ...current,
      {
        id: makeId("btg"),
        startTime: ruleStartTime,
        endTime: ruleEndTime,
        billingHours: ruleBillingHours,
        weekdays: Array.from(new Set(selectedWeekdays)).sort((a, b) => a - b),
        rangeStart,
        rangeEnd: batchEffectiveRangeEnd
      }
    ]);
  }

  function updateBatchTimeGroup(id: string, updates: Partial<Omit<BatchTimeGroup, "id">>) {
    setBatchTimeGroups((current) => current.map((group) => (group.id === id ? { ...group, ...updates } : group)));
  }

  function deleteBatchTimeGroup(id: string) {
    setBatchTimeGroups((current) => current.filter((group) => group.id !== id));
  }

  function toggleBatchTimeGroupWeekday(groupId: string, day: Weekday) {
    setBatchTimeGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        const has = group.weekdays.includes(day);
        return {
          ...group,
          weekdays: has ? group.weekdays.filter((d) => d !== day) : [...group.weekdays, day].sort((a, b) => a - b)
        };
      })
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
    if (isSubstituteClassLesson(lesson)) {
      return {
        ...lesson,
        type: "class",
        feeSnapshot: buildSubstituteClassFeeSnapshot(vault, lesson)
      };
    }
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
    return recalculateLessonFee({
      ...lesson,
      campusId: course.defaultCampusId,
      type: course.type,
      expectedStudentIds: [...course.studentIds],
      attendance: attendanceFromCurrentCourse(lesson, course),
      trialStudentCount: course.type === "class" ? lesson.trialStudentCount ?? 0 : 0,
      trialFee: course.type === "class" ? lesson.trialFee ?? 0 : 0
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

  function updateSelected(patch: Partial<Lesson>, shouldRecalculate = false) {
    if (!selected) return;
    const next = { ...selected, ...patch };
    onUpdateLesson(shouldRecalculate ? recalculateLessonFee(next) : next);
  }

  function recalculateSelectedFee() {
    if (!selected) return;
    onUpdateLesson(recalculateLessonFee(selected));
  }

  function updateSelectedBillingHours(hours: number) {
    if (!selected) return;
    const nextHours = Number.isFinite(hours) ? Math.max(hours, 0) : 0;
    onUpdateLesson(recalculateLessonFee({
      ...selected,
      feeSnapshot: {
        ...selected.feeSnapshot,
        hours: nextHours,
        manualHours: true
      }
    }));
  }

  function resetSelectedBillingHoursToSuggested() {
    if (!selected) return;
    const { manualHours: _manualHours, hours: _hours, ...restSnapshot } = selected.feeSnapshot;
    onUpdateLesson(recalculateLessonFee({
      ...selected,
      feeSnapshot: restSnapshot
    }));
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

  function syncSelectedLessonChecklist(source: LessonChecklistSyncSource) {
    if (!selected || !selectedChecklistTemplate) return;
    const candidates = source === "taught" ? selectedTaughtChecklistSyncCandidates : selectedHomeworkChecklistSyncCandidates;
    setChecklistLastSyncSource(source);
    if (candidates.length === 0) {
      setChecklistSyncResult([]);
      setChecklistSyncMessage(source === "taught" ? "本节课堂关联已全部完成。" : "本节作业关联已全部完成。");
      return;
    }

    const countsByStudent = new Map<string, number>();
    for (const candidate of candidates) {
      countsByStudent.set(candidate.studentId, (countsByStudent.get(candidate.studentId) ?? 0) + 1);
    }
    setChecklistSyncResult(
      Array.from(countsByStudent.entries())
        .map(([studentId, count]) => ({
          studentId,
          studentName: findStudent(vault, studentId)?.name ?? "未知学生",
          taughtSyncedCount: source === "taught" ? count : 0,
          homeworkSyncedCount: source === "homework" ? count : 0
        }))
        .sort((a, b) => compareByName(a.studentName, b.studentName) || a.studentId.localeCompare(b.studentId))
    );

    const now = new Date().toISOString();
    const sourceLabel = source === "taught" ? "课堂关联" : "作业关联";
    onSaveChecklistCompletions(candidates.map((candidate) => ({
      id: makeId("progress_completion"),
      templateId: selectedChecklistTemplate.id,
      itemId: candidate.itemId,
      studentId: candidate.studentId,
      courseGroupId: selected.courseGroupId,
      source,
      completedDate: selected.date || todayIso(),
      lessonId: selected.id,
      progressRecordId: candidate.progressRecordId,
      note: `${sourceLabel}完成：${selected.date} ${selected.startTime}-${selected.endTime}`,
      updatedAt: now
    })));
    setChecklistSyncMessage(`已完成 ${candidates.length} 个${sourceLabel}条目。`);
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

  function updateMakeupManagementAttendance(lesson: Lesson, studentId: string, status: AttendanceStatus) {
    const hasAttendanceEntry = lesson.attendance.some((entry) => entry.studentId === studentId);
    const nextLesson: Lesson = {
      ...lesson,
      attendance: [
        ...lesson.attendance.map((entry) =>
          entry.studentId === studentId ? { ...entry, status, makeupExempt: isMakeupAttendanceStatus(status) ? entry.makeupExempt : undefined } : entry
        ),
        ...(hasAttendanceEntry ? [] : [{ studentId, status }])
      ]
    };
    if (lessonStudentIds(lesson).length <= 1) {
      nextLesson.status = lessonStatusForAttendanceStatus(status);
    } else if (nextLesson.status === "makeup_pending" && makeupNeededStudentIds(nextLesson).length === 0) {
      nextLesson.status = statusAfterNoMakeupNeeded(nextLesson);
    }
    onUpdateLesson(recalculateLessonFee(nextLesson));
  }

  function updateMakeupManagementExempt(lesson: Lesson, studentId: string, makeupExempt: boolean) {
    const hasAttendanceEntry = lesson.attendance.some((entry) => entry.studentId === studentId);
    const nextLesson: Lesson = {
      ...lesson,
      attendance: [
        ...lesson.attendance.map((entry) =>
          entry.studentId === studentId ? { ...entry, makeupExempt: makeupExempt ? true : undefined } : entry
        ),
        ...(hasAttendanceEntry ? [] : [{ studentId, status: "makeup_pending" as AttendanceStatus, makeupExempt: makeupExempt ? true : undefined }])
      ]
    };
    const neededStudentIds = makeupNeededStudentIds(nextLesson);
    if (makeupExempt && nextLesson.status === "makeup_pending" && neededStudentIds.length === 0) {
      nextLesson.status = statusAfterNoMakeupNeeded(nextLesson);
    }
    if (!makeupExempt && lessonStudentIds(lesson).length <= 1 && neededStudentIds.includes(studentId)) {
      nextLesson.status = "makeup_pending";
    }
    onUpdateLesson(recalculateLessonFee(nextLesson));
  }

  function markOriginalStudentsMadeUp(lesson: Lesson, studentIds: string[]) {
    if (studentIds.length === 0) return;
    const studentIdSet = new Set(studentIds);
    const existingStudentIds = new Set(lesson.attendance.map((entry) => entry.studentId));
    const completedNote = `${todayIso()} 已补课完成`;
    const nextLesson: Lesson = {
      ...lesson,
      attendance: [
        ...lesson.attendance.map((entry) =>
          studentIdSet.has(entry.studentId)
            ? { ...entry, status: "makeup_completed" as AttendanceStatus, makeupExempt: undefined, note: entry.note || completedNote }
            : entry
        ),
        ...studentIds
          .filter((studentId) => !existingStudentIds.has(studentId))
          .map((studentId) => ({ studentId, status: "makeup_completed" as AttendanceStatus, note: completedNote }))
      ]
    };
    if ((nextLesson.status === "makeup_pending" || lesson.status === "makeup_pending") && makeupNeededStudentIds(nextLesson).length === 0) {
      nextLesson.status = statusAfterNoMakeupNeeded(nextLesson);
    }
    onUpdateLesson(recalculateLessonFee(nextLesson));
    showScheduleNotice(`已标记 ${studentIds.length} 名学生已补课。`);
  }

  function completeScheduledMakeupLessons(makeupLessons: Lesson[]) {
    const activeLessons = makeupLessons.filter((lesson) => lesson.status !== "completed" && lesson.status !== "makeup_completed");
    if (activeLessons.length === 0) return;
    onUpdateLessons(activeLessons.map((lesson) => recalculateLessonFee({
      ...lesson,
      status: "makeup_completed",
      attendance: lesson.attendance.map((entry) => ({ ...entry, status: "makeup_completed" as AttendanceStatus, makeupExempt: undefined }))
    })));
    showScheduleNotice(`已标记 ${activeLessons.length} 节补课完成。`);
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
    const lessonCompleted = isCompletedLessonStatus(lesson.status);
    const hasCompletedMakeupAttendance = lesson.attendance.some((entry) => entry.status === "makeup_completed");
    if (lesson.linkedOriginalLessonId) return lessonCompleted || hasCompletedMakeupAttendance ? "已补课" : "补课";
    const linkedMakeupLessons = activeMakeupLessonsByOriginal[lesson.id] ?? [];
    const completedMakeupCount = linkedMakeupLessons.filter((item) => isCompletedLessonStatus(item.status)).length;
    if (completedMakeupCount > 0 && (lesson.status === "makeup_completed" || hasCompletedMakeupAttendance)) {
      return completedMakeupCount === linkedMakeupLessons.length ? "已补课" : "部分已补";
    }
    if (linkedMakeupLessons.length > 0) {
      return completedMakeupCount === linkedMakeupLessons.length && completedMakeupCount > 0 ? "已补课" : "已安排补课";
    }
    if (lesson.status === "makeup_completed" || hasCompletedMakeupAttendance) return "已补课";
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
    const multiplier = lessonDurationMultiplierForCourse(course, lesson, vault);
    const stage = salaryGradeStageForLesson(vault, course, lesson);
    if (course.feeRule.mode === "salary_grade") {
      const gradeRule = resolveSalaryGradeRule(vault, course.feeRule);
      if (!gradeRule) return undefined;
      const baseStudentCount = classHeadcountBaseStudentCountForRule(course.type, feeRuleForCourseType(vault, course.type));
      return Math.round((salaryGradeAmountForCount(gradeRule, course.type, presentStudentCount, stage, baseStudentCount) - salaryGradeAmountForCount(gradeRule, course.type, countWithoutEntry, stage, baseStudentCount)) * multiplier);
    }
    if (course.feeRule.mode !== "class_headcount") return undefined;
    return Math.round((calculateClassHeadcountFee(course.feeRule, presentStudentCount, course.type, stage) - calculateClassHeadcountFee(course.feeRule, countWithoutEntry, course.type, stage)) * multiplier);
  }

  function updateTrialStats(patch: Pick<Partial<Lesson>, "trialStudentCount" | "trialFee">) {
    if (!selected) return;
    onUpdateLesson(recalculateLessonFee({ ...selected, ...patch }));
  }

  function addTemporaryStudent() {
    if (!selected || !temporaryStudentId || selected.expectedStudentIds.includes(temporaryStudentId)) return;
    const student = findStudent(vault, temporaryStudentId);
    if (student?.status !== "active") return;
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

  function updateSelectedTime(nextStart: string, nextEnd: string) {
    if (!selected) return;
    if (!validateTimeRange(nextStart, nextEnd)) return;
    const conflict = findTimeConflict(selected.date, nextStart, nextEnd, selected.id);
    const applyChange = () => updateSelected({ startTime: nextStart, endTime: nextEnd }, true);
    if (conflict) {
      confirm({
        title: "这个时间段已有课程",
        description: `${dateWithWeekday(selected.date)} ${nextStart}-${nextEnd} 与「${courseName(vault, conflict.courseGroupId)} ${conflict.startTime}-${conflict.endTime}」冲突。请确认是否仍要调整。`,
        confirmLabel: "仍然调整",
        tone: "danger",
        onConfirm: applyChange
      });
      return;
    }
    applyChange();
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
    const restoringLessonIds = new Set(
      deletedLessons.filter((item) => ids.includes(item.id)).map((item) => item.lesson.id)
    );
    const restorables = ids.filter((id) => {
      const item = deletedLessons.find((deletedLesson) => deletedLesson.id === id);
      return item && canRestoreDeletedLesson(vault, activeLessonIds, item, restoringLessonIds);
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

  function buildWeeklyPatternPreview(): WeeklyPatternPreview {
    const preview: WeeklyPatternPreview = {
      candidateCount: 0,
      conflictCount: 0,
      invalidSlotCount: 0,
      creatableItems: []
    };
    if (!isBatchDateRangeValid) return preview;

    const rangeDates = datesBetweenLocal(rangeStart, batchEffectiveRangeEnd);
    const plannedLessons: Array<Pick<Lesson, "date" | "startTime" | "endTime">> = [];

    for (const slot of weeklyPatternSlots) {
      const course = getCourse(vault, slot.courseGroupId);
      const slotValid =
        Boolean(course && course.status === "active" && courseHasActiveStudent(vault, course)) &&
        slot.weekdays.length > 0 &&
        isOrderedTimeRange(slot.startTime, slot.endTime);

      if (!slotValid || !course) {
        preview.invalidSlotCount += 1;
        continue;
      }

      const slotDates = rangeDates.filter((date) => slot.weekdays.includes(weekdayOfDateIso(date)));
      for (const date of slotDates) {
        preview.candidateCount += 1;
        const existingConflict = findTimeConflict(date, slot.startTime, slot.endTime);
        const plannedConflict = plannedLessons.some(
          (lesson) =>
            lesson.date === date &&
            timesOverlap(lesson.startTime, lesson.endTime, slot.startTime, slot.endTime)
        );

        if (existingConflict || plannedConflict) {
          preview.conflictCount += 1;
          continue;
        }

        preview.creatableItems.push({ slot, date, course });
        plannedLessons.push({
          date,
          startTime: slot.startTime,
          endTime: slot.endTime
        });
      }
    }

    return preview;
  }

  function buildBatchPerDayPreview(): BatchPerDayPreview {
    const preview: BatchPerDayPreview = {
      totalCount: 0,
      conflictCount: 0,
      existingConflictCount: 0,
      internalConflictCount: 0,
      unassignedWeekdays: [],
      groupCounts: [],
      creatableItems: []
    };
    if (!batchPerDayMode || batchTimeGroups.length === 0) return preview;

    const plannedLessons: Array<Pick<Lesson, "date" | "startTime" | "endTime">> = [];

    // Find weekdays selected globally but not assigned to any group
    const assignedWeekdays = new Set(batchTimeGroups.flatMap((g) => g.weekdays));
    preview.unassignedWeekdays = selectedWeekdays.filter((d) => !assignedWeekdays.has(d));

    for (const group of batchTimeGroups) {
      const groupCount = { groupId: group.id, count: 0, conflictCount: 0, existingConflictCount: 0, internalConflictCount: 0 };
      const groupRangeStart = group.rangeStart || rangeStart;
      const groupRangeEnd = group.rangeEnd || batchEffectiveRangeEnd;
      const groupValid = group.weekdays.length > 0 && isOrderedTimeRange(group.startTime, group.endTime) && isOrderedDateRange(groupRangeStart, groupRangeEnd);

      if (!groupValid) {
        preview.groupCounts.push(groupCount);
        continue;
      }

      const groupDates = datesBetweenLocal(groupRangeStart, groupRangeEnd).filter((d) => group.weekdays.includes(weekdayOfDateIso(d)));
      for (const date of groupDates) {
        preview.totalCount += 1;
        groupCount.count += 1;

        const existingConflict = findTimeConflict(date, group.startTime, group.endTime);
        const plannedConflict = plannedLessons.some(
          (lesson) =>
            lesson.date === date &&
            timesOverlap(lesson.startTime, lesson.endTime, group.startTime, group.endTime)
        );

        if (existingConflict || plannedConflict) {
          preview.conflictCount += 1;
          groupCount.conflictCount += 1;
          if (existingConflict) {
            preview.existingConflictCount += 1;
            groupCount.existingConflictCount += 1;
          } else {
            preview.internalConflictCount += 1;
            groupCount.internalConflictCount += 1;
          }
          continue;
        }

        preview.creatableItems.push({ group, date });
        plannedLessons.push({ date, startTime: group.startTime, endTime: group.endTime });
      }
      preview.groupCounts.push(groupCount);
    }

    return preview;
  }

  function describeBatchPerDayConflicts(preview: BatchPerDayPreview): string {
    const parts: string[] = [];
    if (preview.existingConflictCount > 0) parts.push(`${preview.existingConflictCount} 节与日历已有课程重叠`);
    if (preview.internalConflictCount > 0) parts.push(`${preview.internalConflictCount} 节是本次时间组之间重复或重叠`);
    return parts.join("，");
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

  function generateBatchLessons() {
    if (!isBatchRepeatWeeksValid) {
      showScheduleError("重复周数至少为 1。");
      return;
    }
    if (!validateDateRange(rangeStart, batchEffectiveRangeEnd) || !validateTimeRange(ruleStartTime, ruleEndTime)) {
      return;
    }
    if (batchCandidateDates.length === 0) {
      showScheduleError("当前日期范围和星期没有匹配课节。");
      return;
    }
    const manualBillingHours = parseOptionalBillingHours(ruleBillingHours);
    const result = onGenerateDrafts(rangeStart, batchEffectiveRangeEnd, selectedWeekdays, ruleCourseGroupId, ruleStartTime, ruleEndTime, manualBillingHours);
    showScheduleNotice(
      result.createdCount > 0
        ? `已生成 ${result.createdCount} 节待上课${result.conflictCount > 0 ? `，${result.conflictCount} 节因时间冲突已跳过` : ""}。`
        : `没有新增课节，${result.conflictCount > 0 ? `${result.conflictCount} 节均与已有课程冲突。` : "当前条件没有可生成课节。"}`
    );
  }

  function hasBatchConflicts(): boolean {
    if (!isBatchDateRangeValid || !isBatchTimeValid) return false;
    return batchConflictCount > 0;
  }

  function generateBatchPerDayLessons() {
    if (batchTimeGroups.length === 0) {
      showScheduleError("请添加至少一个时间分组。");
      return;
    }
    const invalidGroup = batchTimeGroups.find((g) => {
      const groupRangeStart = g.rangeStart || rangeStart;
      const groupRangeEnd = g.rangeEnd || batchEffectiveRangeEnd;
      return g.weekdays.length === 0 || !isOrderedTimeRange(g.startTime, g.endTime) || !isOrderedDateRange(groupRangeStart, groupRangeEnd);
    });
    if (invalidGroup) {
      showScheduleError("时间分组中有未选星期、日期范围或时间无效的条目，请调整后再生成。");
      return;
    }
    if (batchPerDayPreview.unassignedWeekdays.length > 0) {
      showScheduleError(
        `星期${batchPerDayPreview.unassignedWeekdays.map((d) => weekdayLabels[d]).join("、")}尚未分配到任何时间组，请分配或取消选择。`
      );
      return;
    }

    const preview = buildBatchPerDayPreview();
    if (preview.totalCount === 0) {
      showScheduleError("当前日期范围和分时条件没有匹配课节。");
      return;
    }
    if (preview.creatableItems.length === 0) {
      const conflictDescription = describeBatchPerDayConflicts(preview);
      showScheduleError(
        preview.conflictCount > 0
          ? `${preview.conflictCount} 节均存在时间冲突${conflictDescription ? `（${conflictDescription}）` : ""}，没有新增课节。`
          : "当前分时条件没有可生成课节。"
      );
      return;
    }

    const course = getCourse(vault, ruleCourseGroupId);
    if (!course || course.status !== "active" || !courseHasActiveStudent(vault, course)) {
      showScheduleError("所选课程不可用（已暂停、已删除或没有在读学生），请重新选择。");
      return;
    }

    const lessonsToAdd = preview.creatableItems.map(({ group, date }) =>
      createLessonFromCourse(vault, course, {
        date,
        startTime: group.startTime,
        endTime: group.endTime,
        campusId: course.defaultCampusId,
        manualBillingHours: parseOptionalBillingHours(group.billingHours),
        status: "scheduled"
      })
    );
    onAddLessons(lessonsToAdd);
    const conflictDescription = describeBatchPerDayConflicts(preview);
    showScheduleNotice(
      `已按分时生成 ${lessonsToAdd.length} 节待上课${preview.conflictCount > 0 ? `，跳过 ${preview.conflictCount} 节时间冲突${conflictDescription ? `（${conflictDescription}）` : ""}` : ""}。`
    );
  }

  function validateWeeklyPattern(): boolean {
    if (!isBatchRepeatWeeksValid) {
      showScheduleError("重复周数至少为 1。");
      return false;
    }
    if (!validateDateRange(rangeStart, batchEffectiveRangeEnd)) return false;
    if (weeklyPatternSlots.length === 0) {
      showScheduleError("请先加入至少一条周循环模板。");
      return false;
    }
    const invalidTimeSlot = weeklyPatternSlots.find((slot) => slot.weekdays.length === 0 || !isOrderedTimeRange(slot.startTime, slot.endTime));
    if (invalidTimeSlot) {
      showScheduleError("周循环模板中有未选星期或时间无效的条目，请删除或套用后调整。");
      return false;
    }
    const unavailableSlot = weeklyPatternSlots.find((slot) => {
      const course = getCourse(vault, slot.courseGroupId);
      return !course || course.status !== "active" || !courseHasActiveStudent(vault, course);
    });
    if (unavailableSlot) {
      showScheduleError("周循环模板中有已暂停、已删除或没有在读学生的课程，请删除或调整后再生成。");
      return false;
    }
    return true;
  }

  function generateWeeklyPatternLessons() {
    if (!validateWeeklyPattern()) return;
    const preview = buildWeeklyPatternPreview();
    if (preview.candidateCount === 0) {
      showScheduleError("当前日期范围和周循环模板没有匹配课节。");
      return;
    }
    if (preview.creatableItems.length === 0) {
      showScheduleError(
        preview.conflictCount > 0
          ? `${preview.conflictCount} 节均与已有课程或模板内时段冲突，没有新增课节。`
          : "当前周循环模板没有可生成课节。"
      );
      return;
    }

    const lessonsToAdd = preview.creatableItems.map(({ slot, date, course }) =>
      createLessonFromCourse(vault, course, {
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        campusId: course.defaultCampusId,
        manualBillingHours: parseOptionalBillingHours(slot.billingHours),
        status: "scheduled"
      })
    );
    onAddLessons(lessonsToAdd);
    showScheduleNotice(
      `已按周循环模板生成 ${lessonsToAdd.length} 节待上课${preview.conflictCount > 0 ? `，${preview.conflictCount} 节因时间冲突已跳过` : ""}。`
    );
  }

  function hasWeeklyPatternConflicts(): boolean {
    if (!isBatchDateRangeValid || weeklyPatternSlots.length === 0) return false;
    return weeklyPatternConflictCount > 0;
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
        <ScheduleAiPanel
          aiActiveCourseCount={aiActiveCourseCount}
          aiActiveStudentCount={aiActiveStudentCount}
          aiApplyResult={aiApplyResult}
          aiApplying={aiApplying}
          aiContextSummary={aiContextSummary}
          aiDraft={aiDraft}
          aiDraftActions={aiDraftActions}
          aiDraftAnswer={aiDraftAnswer}
          aiDraftCanApply={aiDraftCanApply}
          aiDraftQuestions={aiDraftQuestions}
          aiDraftRecord={aiDraftRecord}
          aiDraftSummary={aiDraftSummary}
          aiDraftWarnings={aiDraftWarnings}
          aiFollowupAnswer={aiFollowupAnswer}
          aiInstruction={aiInstruction}
          aiLoading={aiLoading}
          aiMessage={aiMessage}
          aiPendingLessonCount={aiPendingLessonCount}
          aiProviderId={aiProviderId}
          aiRawResultText={aiRawResultText}
          aiTaskType={aiTaskType}
          aiTodayLessonCount={aiTodayLessonCount}
          aiUsageText={aiUsageText}
          canClearAiWork={canClearAiWork}
          canShowAiProviderEndpoint={canShowAiProviderEndpoint}
          enabledAiProviders={enabledAiProviders}
          isAdmin={isAdmin}
          onApplyAiDraft={applyAiDraft}
          onClearAiWork={clearAiWork}
          onCopyAiRawResult={copyAiRawResult}
          onPatchSession={patchAiSession}
          onRefreshAiProviders={refreshAiProviders}
          onSubmitAiDraft={submitAiDraft}
          onSubmitAiFollowup={submitAiFollowup}
          selectedAiEndpoint={selectedAiEndpoint}
          selectedAiProvider={selectedAiProvider}
          selectedAiUsage={selectedAiUsage}
        />
      )}
      {schedulePanel === "schedule" && (
        <SchedulePlanningPanel
          batchCandidateCount={batchCandidateDates.length}
          batchConflictCount={batchConflictCount}
          batchEffectiveRangeEnd={batchEffectiveRangeEnd}
          batchLessonTargetCount={batchLessonTargetCount}
          batchPerDayConflictCount={batchPerDayPreview.conflictCount}
          batchPerDayGroupCounts={batchPerDayPreview.groupCounts}
          batchPerDayMode={batchPerDayMode}
          batchPerDayTotalCount={batchPerDayPreview.totalCount}
          batchPerDayUnassignedWeekdays={batchPerDayPreview.unassignedWeekdays}
          batchRepeatMode={batchRepeatMode}
          batchRepeatWeeks={batchRepeatWeeks}
          batchTimeGroups={batchTimeGroups}
          customPresetEnd={customPresetEnd}
          customPresetStart={customPresetStart}
          customTimePresets={customTimePresets}
          dateShortcuts={dateShortcuts}
          isBatchDateRangeValid={isBatchDateRangeValid}
          isBatchRepeatWeeksValid={isBatchRepeatWeeksValid}
          isBatchTimeValid={isBatchTimeValid}
          isCustomPresetTimeValid={isCustomPresetTimeValid}
          isSingleTimeValid={isSingleTimeValid}
          ruleBillingHours={ruleBillingHours}
          ruleSuggestedBillingHours={ruleSuggestedBillingHours}
          onAddBatchTimeGroup={addBatchTimeGroup}
          onAddCustomPreset={addCustomPreset}
          onAddSingleLesson={addSingleLesson}
          onAddWeeklyPatternSlot={addWeeklyPatternSlot}
          onApplyWeeklyPatternSlot={applyWeeklyPatternSlot}
          onBatchGenerate={() => {
            if (batchPerDayMode) {
              const conflictDescription = describeBatchPerDayConflicts(batchPerDayPreview);
              const conflictText = batchPerDayPreview.conflictCount > 0
                ? `系统会跳过 ${batchPerDayPreview.conflictCount} 节时间段${conflictDescription ? `（${conflictDescription}）` : ""}，只生成没有冲突的课程。`
                : `系统将按当前 ${batchTimeGroups.length} 个时间组生成 ${batchPerDayPreview.totalCount} 节待上课课节。`;
              confirm({
                title: batchPerDayPreview.conflictCount > 0
                  ? batchPerDayPreview.existingConflictCount > 0 ? "按日分时排课中存在时间冲突" : "按日分时时间组有重叠"
                  : "确认按日分时生成课时？",
                description: conflictText,
                confirmLabel: batchPerDayPreview.conflictCount > 0 ? "跳过冲突并生成" : "确认生成",
                onConfirm: generateBatchPerDayLessons
              });
              return;
            }
            if (!isBatchRepeatWeeksValid) {
              showScheduleError("重复周数至少为 1。");
              return;
            }
            if (!validateDateRange(rangeStart, batchEffectiveRangeEnd) || !validateTimeRange(ruleStartTime, ruleEndTime)) {
              return;
            }
            if (hasBatchConflicts()) {
              confirm({
                title: "批量排课中存在时间冲突",
                description: `系统会跳过 ${batchConflictCount} 节已经有课的时间段，只生成没有冲突的课程。`,
                confirmLabel: "跳过冲突并生成",
                onConfirm: generateBatchLessons
              });
              return;
            }
            generateBatchLessons();
          }}
          onDeleteBatchTimeGroup={deleteBatchTimeGroup}
          onDeleteCustomPreset={(preset) =>
            confirm({
              title: `删除常用时段「${preset.label}」？`,
              description: `${preset.startTime}-${preset.endTime}`,
              confirmLabel: "删除",
              tone: "danger",
              onConfirm: () => onDeleteCustomTimePreset(preset.id)
            })
          }
          onDeleteWeeklyPatternSlot={deleteWeeklyPatternSlot}
          onGenerateWeeklyPattern={() => {
            if (!validateWeeklyPattern()) return;
            if (hasWeeklyPatternConflicts()) {
              confirm({
                title: "周循环模板中存在时间冲突",
                description: `系统会跳过 ${weeklyPatternConflictCount} 节已经有课或模板内互相重叠的时间段，只生成没有冲突的课程。`,
                confirmLabel: "跳过冲突并生成",
                onConfirm: generateWeeklyPatternLessons
              });
              return;
            }
            generateWeeklyPatternLessons();
          }}
          onGoToCalendarScheduling={goToCalendarSchedulingFromSingle}
          onSetBatchPerDayMode={setBatchPerDayModeWithSync}
          onToggleBatchTimeGroupWeekday={toggleBatchTimeGroupWeekday}
          onToggleWeekday={toggleWeekday}
          onUpdateBatchTimeGroup={updateBatchTimeGroup}
          rangeEnd={rangeEnd}
          rangeStart={rangeStart}
          ruleCourseGroupId={ruleCourseGroupId}
          ruleCourseOptions={ruleCourseOptions}
          ruleCourseSearch={ruleCourseSearch}
          ruleEndTime={ruleEndTime}
          ruleStartTime={ruleStartTime}
          selectedWeekdays={selectedWeekdays}
          setBatchLessonTargetCount={setBatchLessonTargetCount}
          setBatchRepeatMode={setBatchRepeatMode}
          setBatchRepeatWeeks={setBatchRepeatWeeks}
          setCustomPresetEnd={setCustomPresetEnd}
          setCustomPresetStart={updateCustomPresetStartTime}
          setRangeEnd={updateRangeEndManually}
          setRangeStart={setRangeStart}
          setRuleBillingHours={setRuleBillingHours}
          setRuleCourseGroupId={setRuleCourseGroupId}
          setRuleCourseSearch={setRuleCourseSearch}
          setRuleEndTime={setRuleEndTime}
          setRuleStartTime={updateRuleStartTime}
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
          weeklyPatternCandidateCount={weeklyPatternCandidateCount}
          weeklyPatternConflictCount={weeklyPatternConflictCount}
          weeklyPatternCourseOptions={vault.courseGroups}
          weeklyPatternCreatableCount={weeklyPatternCreatableCount}
          weeklyPatternInvalidSlotCount={weeklyPatternInvalidSlotCount}
          weeklyPatternSlots={weeklyPatternSlots}
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
          amountsVisible={amountsVisible}
          campusOptions={campusOptions}
          courseGroupOptions={studentStatsCourseOptions}
          expandedGroupIds={expandedStudentStatsGroupIds}
          groupedLessonRows={studentStatsGroupedLessonRows}
          involvedStudentCount={studentStatsInvolvedStudentCount}
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
          setMakeupFilter={setStudentStatsMakeupFilter}
          studentLessonCount={studentStatsStudentLessonCount}
          statusCounts={studentStatsStatusCounts}
          subjectOptions={studentStatsSubjects}
          completedFeeTotal={studentStatsCompletedFeeTotal}
          scheduledFeeTotal={studentStatsTotalFee}
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
            subjectFilter: studentStatsSubjectFilter,
            makeupFilter: studentStatsMakeupFilter
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
          dayNote={effectiveLessonScope === "day" ? calendarDayNoteForDate(effectiveLessonDay) : ""}
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
