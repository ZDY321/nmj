import { useEffect, useState } from "react";
import type { CourseGroup, Lesson, TeacherVault, Weekday } from "@/shared/types";
import type { BatchRepeatMode, BatchTimeGroup, WeeklySchedulePatternSlot } from "@/frontend/components/SchedulePlanningPanel";
import type { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { getCourse, todayIso } from "@/frontend/lib/calculations";
import { makeId } from "@/frontend/lib/crypto";
import { addDays, courseHasActiveStudent, courseName, createLessonFromCourse, monthShift, weekdayLabels, weekdayOfDateIso } from "@/frontend/lib/helpers";
import { datesBetweenLocal, filterScheduleCourseOptions, isOrderedDateRange, isOrderedTimeRange } from "@/frontend/lib/scheduleViewHelpers";
import { buildBatchLessonPreview, buildBatchSchedulePreview, endDateForRepeatWeeks, type BatchLessonGenerationResult, type BatchLessonTime, type BatchScheduleConflict } from "@/frontend/lib/scheduleBatch";
import { dateWithWeekday, parseOptionalBillingHours, updateTimeWithTwoHourEnd } from "@/frontend/lib/scheduleDraftValues";

type WeeklyPatternCreatableItem = BatchLessonTime & {
  slot: WeeklySchedulePatternSlot;
  course: CourseGroup;
};

type WeeklyPatternPreview = {
  candidateCount: number;
  conflictCount: number;
  existingCount: number;
  duplicateCount: number;
  conflicts: BatchScheduleConflict[];
  invalidSlotCount: number;
  creatableItems: WeeklyPatternCreatableItem[];
};

type BatchPerDayPreview = {
  totalCount: number;
  conflictCount: number;
  existingCount: number;
  duplicateCount: number;
  existingConflictCount: number;
  internalConflictCount: number;
  conflicts: BatchScheduleConflict[];
  unassignedWeekdays: Weekday[];
  groupCounts: Array<{ groupId: string; count: number; conflictCount: number; existingCount: number; duplicateCount: number }>;
  creatableItems: Array<BatchLessonTime & { group: BatchTimeGroup }>;
};

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

interface ScheduleBatchPlanningOptions {
  vault: TeacherVault;
  courseSelectionOptions: CourseGroup[];
  confirm: ReturnType<typeof useConfirmDialog>["confirm"];
  onAddLessons: (lessons: Lesson[], options?: { replaceLessonIds?: string[] }) => void;
  onGenerateDrafts: (startDate: string, endDate: string, weekdays: Weekday[], courseGroupId: string, startTime: string, endTime: string, manualBillingHours?: number) => BatchLessonGenerationResult;
  showScheduleError: (message: string) => void;
  showScheduleNotice: (message: string) => void;
  validateTimeRange: (start: string, end: string) => boolean;
  validateDateRange: (start: string, end: string) => boolean;
  suggestedBillingHoursForDraft: (courseId: string, start: string, end: string) => number;
}

export function useScheduleBatchPlanning({ vault, courseSelectionOptions, confirm, onAddLessons, onGenerateDrafts, showScheduleError, showScheduleNotice, validateTimeRange, validateDateRange, suggestedBillingHoursForDraft }: ScheduleBatchPlanningOptions) {
  const firstCourseId = courseSelectionOptions[0]?.id ?? "";
  const courseSelectionOptionIds = courseSelectionOptions.map(course => course.id).join("|");
  const [ruleCourseGroupId, setRuleCourseGroupId] = useState(firstCourseId);
  const [ruleCourseSearch, setRuleCourseSearch] = useState("");
  const [selectedWeekdays, setSelectedWeekdays] = useState<Weekday[]>([]);
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

  const selectedWeekdayKey = selectedWeekdays.join("|");
  const batchTargetCount = Math.max(Math.floor(Number(batchLessonTargetCount)), 0);
  const batchRepeatWeekCount = Math.max(Math.floor(Number(batchRepeatWeeks)), 0);
  const isBatchRepeatWeeksValid = batchRepeatMode !== "weeks" || batchRepeatWeekCount > 0;
  const batchEffectiveRangeEnd = batchRepeatMode === "weeks" ? endDateForRepeatWeeks(rangeStart, batchRepeatWeekCount) : rangeEnd;
  const isBatchDateRangeValid = isBatchRepeatWeeksValid && isOrderedDateRange(rangeStart, batchEffectiveRangeEnd);
  const batchPreview = buildBatchLessonPreview(vault.lessons, {
    startDate: rangeStart,
    endDate: isBatchDateRangeValid ? batchEffectiveRangeEnd : "",
    weekdays: selectedWeekdays,
    courseGroupId: ruleCourseGroupId,
    startTime: ruleStartTime,
    endTime: ruleEndTime
  });
  const batchConflictCount = batchPreview.conflicts.length;
  const weeklyPatternPreview = buildWeeklyPatternPreview();
  const weeklyPatternCandidateCount = weeklyPatternPreview.candidateCount;
  const weeklyPatternConflictCount = weeklyPatternPreview.conflictCount;
  const weeklyPatternCreatableCount = weeklyPatternPreview.creatableItems.length;
  const weeklyPatternInvalidSlotCount = weeklyPatternPreview.invalidSlotCount;
  const batchPerDayPreview = buildBatchPerDayPreview();
  const isBatchTimeValid = isOrderedTimeRange(ruleStartTime, ruleEndTime);
  const ruleSuggestedBillingHours = suggestedBillingHoursForDraft(ruleCourseGroupId, ruleStartTime, ruleEndTime);
  const ruleCourseOptions = filterScheduleCourseOptions(vault, courseSelectionOptions, ruleCourseSearch, ruleCourseGroupId);

  useEffect(() => {
    setRuleCourseGroupId(current => courseSelectionOptions.some(course => course.id === current) ? current : firstCourseId);
  }, [courseSelectionOptionIds]);

  useEffect(() => {
    if (batchRepeatMode !== "end_date" || !batchTargetCount || selectedWeekdays.length === 0) return;
    const nextEndDate = endDateForLessonCount(rangeStart, selectedWeekdays, batchTargetCount);
    if (nextEndDate && nextEndDate !== rangeEnd) {
      setRangeEnd(nextEndDate);
    }
  }, [batchRepeatMode, batchTargetCount, rangeStart, selectedWeekdayKey]);

  function updateRuleStartTime(startTime: string) {
    updateTimeWithTwoHourEnd(startTime, setRuleStartTime, setRuleEndTime);
  }

  function updateRangeEndManually(date: string) {
    setBatchLessonTargetCount("");
    setRangeEnd(date);
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

  function setBatchPerDayModeWithSync(value: boolean) {
    if (value && !batchPerDayMode) {
      // Turning ON: seed first group from current single-time values
      setBatchTimeGroups([
        {
          id: makeId("btg"),
          startTime: ruleStartTime,
          endTime: ruleEndTime,
          billingHours: ruleBillingHours,
          weekdays: [...selectedWeekdays]
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
        weekdays: Array.from(new Set(selectedWeekdays)).sort((a, b) => a - b)
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

  function buildWeeklyPatternPreview(): WeeklyPatternPreview {
    const preview: WeeklyPatternPreview = {
      candidateCount: 0,
      conflictCount: 0,
      existingCount: 0,
      duplicateCount: 0,
      conflicts: [],
      invalidSlotCount: 0,
      creatableItems: []
    };
    if (!isBatchDateRangeValid) return preview;

    const rangeDates = datesBetweenLocal(rangeStart, batchEffectiveRangeEnd);
    const candidates: WeeklyPatternCreatableItem[] = [];

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
        candidates.push({
          slot,
          course,
          courseGroupId: course.id,
          date,
          startTime: slot.startTime,
          endTime: slot.endTime
        });
      }
    }

    const batch = buildBatchSchedulePreview(vault.lessons, candidates);
    preview.candidateCount = batch.candidateCount;
    preview.conflictCount = batch.conflicts.length;
    preview.existingCount = batch.existingItems.length;
    preview.duplicateCount = batch.duplicateItems.length;
    preview.conflicts = batch.conflicts;
    preview.creatableItems = batch.creatableItems;
    return preview;
  }

  function buildBatchPerDayPreview(): BatchPerDayPreview {
    const preview: BatchPerDayPreview = {
      totalCount: 0,
      conflictCount: 0,
      existingCount: 0,
      duplicateCount: 0,
      existingConflictCount: 0,
      internalConflictCount: 0,
      conflicts: [],
      unassignedWeekdays: [],
      groupCounts: [],
      creatableItems: []
    };
    if (!batchPerDayMode || !isBatchDateRangeValid || batchTimeGroups.length === 0) return preview;

    const rangeDates = datesBetweenLocal(rangeStart, batchEffectiveRangeEnd);
    const candidates: Array<BatchLessonTime & { group: BatchTimeGroup }> = [];

    // Find weekdays selected globally but not assigned to any group
    const assignedWeekdays = new Set(batchTimeGroups.flatMap((g) => g.weekdays));
    preview.unassignedWeekdays = selectedWeekdays.filter((d) => !assignedWeekdays.has(d));

    for (const group of batchTimeGroups) {
      if (group.weekdays.length === 0 || !isOrderedTimeRange(group.startTime, group.endTime)) continue;

      const groupDates = rangeDates.filter((date) => group.weekdays.includes(weekdayOfDateIso(date)));
      for (const date of groupDates) {
        candidates.push({ group, date, courseGroupId: ruleCourseGroupId, startTime: group.startTime, endTime: group.endTime });
      }
    }

    const batch = buildBatchSchedulePreview(vault.lessons, candidates);
    preview.totalCount = batch.candidateCount;
    preview.conflictCount = batch.conflicts.length;
    preview.existingCount = batch.existingItems.length;
    preview.duplicateCount = batch.duplicateItems.length;
    preview.existingConflictCount = batch.conflicts.filter((conflict) => conflict.source === "existing").length;
    preview.internalConflictCount = batch.conflicts.filter((conflict) => conflict.source === "batch").length;
    preview.conflicts = batch.conflicts;
    preview.creatableItems = batch.creatableItems;
    preview.groupCounts = batchTimeGroups.map((group) => ({
      groupId: group.id,
      count: candidates.filter((item) => item.group.id === group.id).length,
      conflictCount: batch.conflicts.filter((conflict) => conflict.candidate.group.id === group.id).length,
      existingCount: batch.existingItems.filter((item) => item.group.id === group.id).length,
      duplicateCount: batch.duplicateItems.filter((item) => item.group.id === group.id).length
    }));
    return preview;
  }

  function batchConflictDetails(conflicts: BatchScheduleConflict[]): string[] {
    return conflicts.map(({ candidate, conflictingLesson, source }) =>
      `${dateWithWeekday(candidate.date)} ${candidate.startTime}-${candidate.endTime} 与${source === "batch" ? "本次排课中的" : "已有的"}「${courseName(vault, conflictingLesson.courseGroupId)} ${conflictingLesson.startTime}-${conflictingLesson.endTime}」重叠`
    );
  }

  function describeBatchSkippedItems(existingCount: number, duplicateCount: number, conflictCount: number): string {
    const parts: string[] = [];
    if (existingCount > 0) parts.push(`${existingCount} 节已排课`);
    if (duplicateCount > 0) parts.push(`${duplicateCount} 节批次内重复课节已合并`);
    if (conflictCount > 0) parts.push(`${conflictCount} 节因时间冲突已跳过`);
    return parts.join("，");
  }

  function describeBatchPerDayConflicts(preview: BatchPerDayPreview): string {
    const parts: string[] = [];
    if (preview.existingConflictCount > 0) parts.push(`${preview.existingConflictCount} 节与日历已有课程重叠`);
    if (preview.internalConflictCount > 0) parts.push(`${preview.internalConflictCount} 节是本次时间组之间重叠`);
    return parts.join("，");
  }

  function generateBatchLessons() {
    if (!isBatchRepeatWeeksValid) {
      showScheduleError("重复周数至少为 1。");
      return;
    }
    if (!validateDateRange(rangeStart, batchEffectiveRangeEnd) || !validateTimeRange(ruleStartTime, ruleEndTime)) {
      return;
    }
    if (batchPreview.candidateCount === 0) {
      showScheduleError("当前日期范围和星期没有匹配课节。");
      return;
    }
    const manualBillingHours = parseOptionalBillingHours(ruleBillingHours);
    const result = onGenerateDrafts(rangeStart, batchEffectiveRangeEnd, selectedWeekdays, ruleCourseGroupId, ruleStartTime, ruleEndTime, manualBillingHours);
    const skippedDescription = describeBatchSkippedItems(result.existingCount, 0, result.conflictCount);
    showScheduleNotice(
      result.createdCount > 0
        ? `已生成 ${result.createdCount} 节待上课${skippedDescription ? `，${skippedDescription}` : ""}。`
        : `没有新增课节，${skippedDescription || "当前条件没有可生成课节"}。`
    );
  }

  function hasBatchConflicts(): boolean {
    if (!isBatchDateRangeValid || !isBatchTimeValid) return false;
    return batchConflictCount > 0;
  }

  function generateBatchPerDayLessons() {
    if (!isBatchRepeatWeeksValid) {
      showScheduleError("重复周数至少为 1。");
      return;
    }
    if (!validateDateRange(rangeStart, batchEffectiveRangeEnd)) return;
    if (batchTimeGroups.length === 0) {
      showScheduleError("请添加至少一个时间分组。");
      return;
    }
    const invalidGroup = batchTimeGroups.find((g) => g.weekdays.length === 0 || !isOrderedTimeRange(g.startTime, g.endTime));
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
      const showMessage = preview.conflictCount > 0 ? showScheduleError : showScheduleNotice;
      showMessage(`没有新增课节，${describeBatchSkippedItems(preview.existingCount, preview.duplicateCount, preview.conflictCount)}。`);
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
    const skippedDescription = describeBatchSkippedItems(preview.existingCount, preview.duplicateCount, preview.conflictCount);
    showScheduleNotice(
      `已按分时生成 ${lessonsToAdd.length} 节待上课${skippedDescription ? `，${skippedDescription}` : ""}。`
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
      const showMessage = preview.conflictCount > 0 ? showScheduleError : showScheduleNotice;
      showMessage(`没有新增课节，${describeBatchSkippedItems(preview.existingCount, preview.duplicateCount, preview.conflictCount)}。`);
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
    const skippedDescription = describeBatchSkippedItems(preview.existingCount, preview.duplicateCount, preview.conflictCount);
    showScheduleNotice(
      `已按周循环模板生成 ${lessonsToAdd.length} 节待上课${skippedDescription ? `，${skippedDescription}` : ""}。`
    );
  }

  function hasWeeklyPatternConflicts(): boolean {
    if (!isBatchDateRangeValid || weeklyPatternSlots.length === 0) return false;
    return weeklyPatternConflictCount > 0;
  }

  return {
    batchCandidateCount: batchPreview.candidateCount,
    batchConflictCount,
    batchConflictDetails: batchConflictDetails(batchPerDayMode ? batchPerDayPreview.conflicts : batchPreview.conflicts),
    batchExistingCount: batchPreview.existingItems.length,
    batchEffectiveRangeEnd,
    batchLessonTargetCount,
    batchPerDayConflictCount: batchPerDayPreview.conflictCount,
    batchPerDayExistingCount: batchPerDayPreview.existingCount,
    batchPerDayDuplicateCount: batchPerDayPreview.duplicateCount,
    batchPerDayGroupCounts: batchPerDayPreview.groupCounts,
    batchPerDayMode,
    batchPerDayTotalCount: batchPerDayPreview.totalCount,
    batchPerDayUnassignedWeekdays: batchPerDayPreview.unassignedWeekdays,
    batchRepeatMode,
    batchRepeatWeeks,
    batchTimeGroups,
    isBatchDateRangeValid,
    isBatchRepeatWeeksValid,
    isBatchTimeValid,
    ruleBillingHours,
    ruleSuggestedBillingHours,
    onAddBatchTimeGroup: addBatchTimeGroup,
    onAddWeeklyPatternSlot: addWeeklyPatternSlot,
    onApplyWeeklyPatternSlot: applyWeeklyPatternSlot,
    onBatchGenerate: () => {
      if (!isBatchRepeatWeeksValid) {
        showScheduleError("重复周数至少为 1。");
        return;
      }
      if (!validateDateRange(rangeStart, batchEffectiveRangeEnd)) return;
      if (batchPerDayMode) {
        const conflictDescription = describeBatchPerDayConflicts(batchPerDayPreview);
        const conflictText = batchPerDayPreview.conflictCount > 0
          ? `系统会跳过 ${batchPerDayPreview.conflictCount} 节时间段${conflictDescription ? `（${conflictDescription}）` : ""}，只生成没有冲突的课程。`
          : `系统将按当前 ${batchTimeGroups.length} 个时间组生成 ${batchPerDayPreview.creatableItems.length} 节待上课课节，已排课和批次内重复的课节会自动跳过。`;
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
      if (!validateTimeRange(ruleStartTime, ruleEndTime)) {
        return;
      }
      if (hasBatchConflicts()) {
        confirm({
          title: "批量排课中存在时间冲突",
          description: `系统会跳过 ${batchConflictCount} 节时间冲突，生成 ${batchPreview.creatableItems.length} 节待上课。${batchPreview.existingItems.length > 0 ? `另有 ${batchPreview.existingItems.length} 节已排课，会自动跳过。` : ""}${batchConflictDetails(batchPreview.conflicts).slice(0, 3).join("；")}。`,
          confirmLabel: "跳过冲突并生成",
          onConfirm: generateBatchLessons
        });
        return;
      }
      generateBatchLessons();
    },
    onDeleteBatchTimeGroup: deleteBatchTimeGroup,
    onDeleteWeeklyPatternSlot: deleteWeeklyPatternSlot,
    onGenerateWeeklyPattern: () => {
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
    },
    onSetBatchPerDayMode: setBatchPerDayModeWithSync,
    onToggleBatchTimeGroupWeekday: toggleBatchTimeGroupWeekday,
    onToggleWeekday: toggleWeekday,
    onUpdateBatchTimeGroup: updateBatchTimeGroup,
    rangeEnd,
    rangeStart,
    ruleCourseGroupId,
    ruleCourseOptions,
    ruleCourseSearch,
    ruleEndTime,
    ruleStartTime,
    selectedWeekdays,
    setBatchLessonTargetCount,
    setBatchRepeatMode,
    setBatchRepeatWeeks,
    setRangeEnd: updateRangeEndManually,
    setRangeStart,
    setRuleBillingHours,
    setRuleCourseGroupId,
    setRuleCourseSearch,
    setRuleEndTime,
    setRuleStartTime: updateRuleStartTime,
    weeklyPatternCandidateCount,
    weeklyPatternConflictCount,
    weeklyPatternConflictDetails: batchConflictDetails(weeklyPatternPreview.conflicts),
    weeklyPatternExistingCount: weeklyPatternPreview.existingCount,
    weeklyPatternDuplicateCount: weeklyPatternPreview.duplicateCount,
    weeklyPatternCourseOptions: vault.courseGroups,
    weeklyPatternCreatableCount,
    weeklyPatternInvalidSlotCount,
    weeklyPatternSlots
  };
}
