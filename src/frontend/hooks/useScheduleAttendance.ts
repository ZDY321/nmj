import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { billableStudentCapForRule, buildFeeSnapshot, buildSubstituteClassFeeSnapshot, calculateClassHeadcountFee, classHeadcountBaseStudentCountForRule, feeRuleForCourseType, getCourse, hoursBetween, isClassBillingCourseType, isSubstituteClassLesson, lessonDurationMultiplierForCourse, presentCount, resolveSalaryGradeRule, salaryGradeAmountForCount, salaryGradeStageForLesson, suggestedLessonBillableHoursForVault, todayIso } from "@/frontend/lib/calculations";
import {
  attendanceLabels,
  attendedStudentIdsForLesson,
  campusName,
  compareByName,
  courseName,
  createLessonFromCourse,
  findStudent,
  isMakeupAttendanceStatus,
  isMakeupNeededAttendanceEntry,
  lessonStudentIds,
  makeupNeededStudentIds,
  sortLessons
} from "@/frontend/lib/helpers";
import { updateLessonContentField } from "@/frontend/lib/lessonContent";
import { dateWithWeekday } from "@/frontend/lib/scheduleDraftValues";
import {
  attendanceStatusForLessonStatus,
  isCompletedLessonStatus,
  isOrderedTimeRange,
  lessonStatusForAttendanceStatus
} from "@/frontend/lib/scheduleViewHelpers";
import type { AttendanceStatus, Lesson, TeacherVault, WeekStart } from "@/shared/types";
import { useEffect, useState } from "react";

interface ScheduleAttendanceOptions {
  vault: TeacherVault;
  selected: Lesson | undefined;
  selectedId: string;
  studentOptions: import("@/shared/types").Student[];
  selectedCalendarDate: string;
  weekStartPreference: WeekStart;
  confirm: ReturnType<typeof useConfirmDialog>["confirm"];
  onUpdateLesson: (lesson: Lesson) => void;
  onUpdateLessons: (lessons: Lesson[]) => void;
  onAddLessonAndUpdateLesson: (lessonToAdd: Lesson, lessonToUpdate: Lesson) => void;
  openLessonInRecords: (lesson: Lesson) => void;
  setSelectedCalendarDate: (date: string) => void;
  setCalendarMonth: (month: string) => void;
  findTimeConflict: (date: string, start: string, end: string, ignoredLessonId?: string) => Lesson | undefined;
  validateTimeRange: (start: string, end: string, message?: string) => boolean;
  showScheduleError: (message: string) => void;
  showScheduleNotice: (message: string) => void;
}

export function useScheduleAttendance({ vault, selected, selectedId, studentOptions, selectedCalendarDate, weekStartPreference, confirm, onUpdateLesson, onUpdateLessons, onAddLessonAndUpdateLesson, openLessonInRecords, setSelectedCalendarDate, setCalendarMonth, findTimeConflict, validateTimeRange, showScheduleError, showScheduleNotice }: ScheduleAttendanceOptions) {
  useEffect(() => { setMakeupDate(selectedCalendarDate); }, [selectedCalendarDate, weekStartPreference]);

  const [temporaryStudentId, setTemporaryStudentId] = useState("");
  const [temporaryStudentSearch, setTemporaryStudentSearch] = useState("");
  const [attendanceStudentFilter, setAttendanceStudentFilter] = useState("");
  const [attendancePanelOpen, setAttendancePanelOpen] = useState(false);
  const [makeupOriginalDateFilter, setMakeupOriginalDateFilter] = useState("");
  const [makeupDate, setMakeupDate] = useState(todayIso());
  const [makeupStartTime, setMakeupStartTime] = useState("19:00");
  const [makeupEndTime, setMakeupEndTime] = useState("21:00");
  const [detailMakeupStudentIds, setDetailMakeupStudentIds] = useState<string[]>([]);
  const [makeupArrangementOpen, setMakeupArrangementOpen] = useState(false);

  useEffect(() => {
    setMakeupArrangementOpen(false);
    setDetailMakeupStudentIds([]);
  }, [selectedId]);

  useEffect(() => {
    setDetailMakeupStudentIds([]);
    setAttendancePanelOpen(false);
  }, [selectedId]);

  const activeMakeupLessons = vault.lessons
    .filter((lesson) => (Boolean(lesson.linkedOriginalLessonId) || Boolean(lesson.makeupOriginalDate)) && lesson.status !== "cancelled")
    .sort(sortLessons);

  const activeMakeupLessonsByOriginal = activeMakeupLessons.reduce<Record<string, Lesson[]>>((groups, lesson) => {
    const originalId = lesson.linkedOriginalLessonId ?? findOriginalLessonForMakeupLesson(lesson)?.id;
    if (!originalId) return groups;
    groups[originalId] = [...(groups[originalId] ?? []), lesson];
    return groups;
  }, {});

  const selectedLessonStudentCount = selected ? lessonStudentIds(selected).length : 0;

  const selectedExpectedStudentCount = selected ? new Set(selected.expectedStudentIds).size : 0;

  const selectedAttendedStudentCount = selected ? attendedStudentIdsForLesson(selected).length : 0;

  const selectedRecalculatedLesson = selected ? recalculateLessonFee(selected) : undefined;

  const selectedCalculatedAmount = selectedRecalculatedLesson?.feeSnapshot.amount ?? selected?.feeSnapshot.amount ?? 0;

  const selectedCalculatedPresentCount = selectedRecalculatedLesson?.feeSnapshot.presentStudentCount ?? (selected ? presentCount(selected) : 0);

  const selectedCalculatedBillableCount = selectedRecalculatedLesson?.feeSnapshot.billableStudentCount;

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

  const isMakeupTimeValid = isOrderedTimeRange(makeupStartTime, makeupEndTime);

  function recalculateLessonFee(lesson: Lesson): Lesson {
    if (isSubstituteClassLesson(lesson)) {
      return {
        ...lesson,
        type: "small_class",
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
      trialStudentCount: isClassBillingCourseType(course.type) ? selected.trialStudentCount ?? 0 : 0,
      trialFee: isClassBillingCourseType(course.type) ? selected.trialFee ?? 0 : 0,
      feeSnapshot: { ...selected.feeSnapshot, amount: 0 }
    };
    onUpdateLesson(recalculateLessonFee(next));
  }

  function updateContent(field: keyof Lesson["content"], value: string) {
    if (!selected) return;
    const content = field === "taught" || field === "homework"
      ? updateLessonContentField(selected.content, vault.progressChecklistTemplates ?? [], field, value)
      : { ...selected.content, [field]: value };
    onUpdateLesson({ ...selected, content });
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
    const multiplier = lessonDurationMultiplierForCourse(course, lesson);
    const stage = salaryGradeStageForLesson(vault, course, lesson);
    if (course.feeRule.mode === "salary_grade") {
      const gradeRule = resolveSalaryGradeRule(vault, course.feeRule);
      if (!gradeRule) return undefined;
      const courseTypeRule = feeRuleForCourseType(vault, course.type);
      const baseStudentCount = classHeadcountBaseStudentCountForRule(course.type, courseTypeRule);
      const billableStudentCap = billableStudentCapForRule(course.type, courseTypeRule);
      return Math.round((salaryGradeAmountForCount(gradeRule, course.type, presentStudentCount, stage, baseStudentCount, billableStudentCap) - salaryGradeAmountForCount(gradeRule, course.type, countWithoutEntry, stage, baseStudentCount, billableStudentCap)) * multiplier);
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

  return {
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
  };
}
