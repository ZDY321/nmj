import { useEffect, useMemo, useState } from "react";
import type { Lesson, TeacherVault, WeekStart } from "@/shared/types";
import type { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import type { SchedulePanel } from "@/frontend/lib/scheduleViewTypes";
import { getCourse } from "@/frontend/lib/calculations";
import { addDays, buildScheduleSyncLessonsForDate, courseHasActiveStudent, linkSyncedLessonsToPreviousLessons, sortLessons, weekDatesFor } from "@/frontend/lib/helpers";
import { datesBetweenLocal, isOrderedDateRange } from "@/frontend/lib/scheduleViewHelpers";
import { buildScheduleDayReusePreview, buildScheduleRangeReusePreview } from "@/frontend/lib/scheduleDayReuse";

interface ScheduleReuseOptions {
  vault: TeacherVault;
  initialFocusedDate: string;
  selectedCalendarDate: string;
  weekStartPreference: WeekStart;
  schedulePanel: SchedulePanel;
  confirm: ReturnType<typeof useConfirmDialog>["confirm"];
  onAddLessons: (lessons: Lesson[], options?: { replaceLessonIds?: string[] }) => void;
  setSelectedCalendarDate: (date: string) => void;
  setCalendarMonth: (month: string) => void;
  setScheduleError: (message: string) => void;
  showScheduleError: (message: string) => void;
  showScheduleNotice: (message: string) => void;
}

export function useScheduleReuse({ vault, initialFocusedDate, selectedCalendarDate, weekStartPreference, schedulePanel, confirm, onAddLessons, setSelectedCalendarDate, setCalendarMonth, setScheduleError, showScheduleError, showScheduleNotice }: ScheduleReuseOptions) {
  const initialWeekDates = weekDatesFor(initialFocusedDate, weekStartPreference);
  const [syncSourceDate, setSyncSourceDate] = useState(addDays(initialFocusedDate, -7));
  const [syncTargetDate, setSyncTargetDate] = useState(initialFocusedDate);
  const [syncRangeSourceStart, setSyncRangeSourceStart] = useState(addDays(initialWeekDates[0] ?? initialFocusedDate, -7));
  const [syncRangeSourceEnd, setSyncRangeSourceEnd] = useState(addDays(initialWeekDates[6] ?? initialFocusedDate, -7));
  const [syncRangeTargetStart, setSyncRangeTargetStart] = useState(initialWeekDates[0] ?? initialFocusedDate);
  const [syncRangeTargetEnd, setSyncRangeTargetEnd] = useState(initialWeekDates[6] ?? initialFocusedDate);
  const [selectedSyncLessonIds, setSelectedSyncLessonIds] = useState<string[]>([]);
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);

  const syncSourceLessons = vault.lessons
    .filter((lesson) => lesson.date === syncSourceDate)
    .sort(sortLessons);
  const selectableSyncLessons = syncSourceLessons.filter((lesson) => {
    const course = getCourse(vault, lesson.courseGroupId);
    return Boolean(course && course.status === "active" && courseHasActiveStudent(vault, course));
  });
  const selectableSyncLessonIds = selectableSyncLessons.map((lesson) => lesson.id).join("|");

  useEffect(() => {
    setSyncTargetDate(selectedCalendarDate);
    setSyncSourceDate(addDays(selectedCalendarDate, -7));
    const selectedWeekDates = weekDatesFor(selectedCalendarDate, weekStartPreference);
    setSyncRangeSourceStart(addDays(selectedWeekDates[0] ?? selectedCalendarDate, -7));
    setSyncRangeSourceEnd(addDays(selectedWeekDates[6] ?? selectedCalendarDate, -7));
    setSyncRangeTargetStart(selectedWeekDates[0] ?? selectedCalendarDate);
    setSyncRangeTargetEnd(selectedWeekDates[6] ?? selectedCalendarDate);
  }, [selectedCalendarDate, weekStartPreference]);

  useEffect(() => {
    setSelectedSyncLessonIds((current) => {
      const availableIds = new Set(selectableSyncLessons.map((lesson) => lesson.id));
      const kept = current.filter((lessonId) => availableIds.has(lessonId));
      if (kept.length > 0 || selectableSyncLessons.length === 0) return kept;
      return selectableSyncLessons.map((lesson) => lesson.id);
    });
  }, [selectableSyncLessonIds]);

  const selectedSyncLessons = useMemo(
    () => vault.lessons
      .filter((lesson) => lesson.date === syncSourceDate && selectedSyncLessonIds.includes(lesson.id))
      .sort(sortLessons),
    [vault.lessons, selectedSyncLessonIds, syncSourceDate]
  );
  const dayReusePreview = useMemo(
    () => buildScheduleDayReusePreview(vault, selectedSyncLessons, syncTargetDate),
    [vault, selectedSyncLessons, syncTargetDate]
  );
  const syncRangeSourceDates = datesBetweenLocal(syncRangeSourceStart, syncRangeSourceEnd);
  const syncRangeTargetDates = datesBetweenLocal(syncRangeTargetStart, syncRangeTargetEnd);
  const rangeReusePreview = useMemo(
    () => buildScheduleRangeReusePreview(vault, syncRangeSourceDates, syncRangeTargetDates),
    [vault, syncRangeSourceStart, syncRangeSourceEnd, syncRangeTargetStart, syncRangeTargetEnd]
  );
  const syncRangeSourceLessons = vault.lessons.filter((lesson) => syncRangeSourceDates.includes(lesson.date));
  const syncRangeActiveLessons = syncRangeSourceLessons.filter((lesson) => {
    const course = getCourse(vault, lesson.courseGroupId);
    return Boolean(course && course.status === "active" && courseHasActiveStudent(vault, course));
  });

  function toggleSyncLesson(lessonId: string) {
    setSelectedSyncLessonIds((current) =>
      current.includes(lessonId) ? current.filter((id) => id !== lessonId) : [...current, lessonId]
    );
  }

  function setAllSyncLessons(selected: boolean) {
    setSelectedSyncLessonIds(selected ? selectableSyncLessons.map((lesson) => lesson.id) : []);
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
        confirmLabel: "覆盖并复用",
        onConfirm: options.onConfirm
      });
      return;
    }

    if (lessonsToAdd.length === 0) {
      showScheduleError(
        conflictSkippedCount > 0
          ? "目标时间已有其他课程，已跳过复用，未覆盖原有手动排课。"
          : skippedCount > 0
            ? "可复用课程已暂停，未复用。"
            : "没有可复用的来源课节。"
      );
      return;
    }

    onAddLessons(lessonsToAdd, { replaceLessonIds });
    options.afterSync();
    setScheduleError("");
    showScheduleNotice(`已复用 ${lessonsToAdd.length} 节课程。`);
    if (skippedCount > 0 || conflictSkippedCount > 0) {
      const messages = [
        skippedCount > 0 ? `${skippedCount} 节来源课程已暂停，未复用` : "",
        conflictSkippedCount > 0 ? `${conflictSkippedCount} 节目标时间已有其他课程，已跳过` : ""
      ].filter(Boolean);
      showScheduleError(
        skippedCount > 0 && conflictSkippedCount === 0 && options.skippedMessage
          ? options.skippedMessage(lessonsToAdd.length, skippedCount)
          : `已复用 ${lessonsToAdd.length} 节；${messages.join("；")}。`
      );
    }
  }

  function copySelectedLessonsToDate(force = false) {
    if (!syncSourceDate || !syncTargetDate) {
      showScheduleError("请选择要复用的来源日期和目标日期。");
      return;
    }
    if (syncSourceDate === syncTargetDate) {
      showScheduleError("来源日期和目标日期不能相同。");
      return;
    }
    if (selectedSyncLessons.length === 0) {
      showScheduleError("请至少勾选一节要复用的课程。");
      return;
    }

    copyLessonBatchesToDates(
      [{ sourceLessons: selectedSyncLessons, targetDate: syncTargetDate, targetStartDate: syncTargetDate }],
      {
        force,
        onConfirm: () => copySelectedLessonsToDate(true),
        afterSync: () => {
          if (schedulePanel === "calendar") {
            setSelectedCalendarDate(syncTargetDate);
            setCalendarMonth(syncTargetDate.slice(0, 7));
          }
        },
        conflictDescription: (replaceCount) => `${syncTargetDate} 有 ${replaceCount} 节课会被覆盖。已取消的来源课节也会复用为待上课。`
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
      showScheduleError("来源日期范围没有可复用课节。");
      return;
    }

    copyLessonBatchesToDates(batches, {
      force,
      onConfirm: () => copyLessonRangeToDateRange(true),
      afterSync: () => {
        if (schedulePanel === "calendar") {
          setSelectedCalendarDate(syncRangeTargetStart);
          setCalendarMonth(syncRangeTargetStart.slice(0, 7));
        }
      },
      conflictDescription: (replaceCount) => `${syncRangeTargetStart} 至 ${syncRangeTargetEnd} 有 ${replaceCount} 节同时间课节会被覆盖。已取消的来源课节也会复用为待上课。`,
      skippedMessage: (reusedCount, skippedCount) => `已复用 ${reusedCount} 节；${skippedCount} 节来源课程已暂停，未复用。`
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

  return {
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
  };
}
