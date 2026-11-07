import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { buildSubstituteClassFeeSnapshot, todayIso } from "@/frontend/lib/calculations";
import {
  courseName,
  createSubstituteClassLesson
} from "@/frontend/lib/helpers";
import { dateWithWeekday, parseOptionalBillingHours } from "@/frontend/lib/scheduleDraftValues";
import {
  isOrderedTimeRange
} from "@/frontend/lib/scheduleViewHelpers";
import type { Lesson, SalaryGradeStage, TeacherVault, WeekStart } from "@/shared/types";
import { SUBSTITUTE_CLASS_COURSE_GROUP_ID } from "@/shared/types";
import { useEffect, useState } from "react";

interface ScheduleSubstituteOptions {
  vault: TeacherVault;
  selectedCalendarDate: string;
  weekStartPreference: WeekStart;
  confirm: ReturnType<typeof useConfirmDialog>["confirm"];
  validateTimeRange: (start: string, end: string, message?: string) => boolean;
  findTimeConflict: (date: string, start: string, end: string) => Lesson | undefined;
  onAddLesson: (lesson: Lesson) => void;
  setSelectedId: (id: string) => void;
  setSelectedCalendarDate: (date: string) => void;
  setCalendarMonth: (month: string) => void;
  setLessonDay: (date: string) => void;
  setScheduleError: (message: string) => void;
  showScheduleError: (message: string) => void;
  showScheduleNotice: (message: string) => void;
}

export function useScheduleSubstitute({ vault, selectedCalendarDate, weekStartPreference, confirm, validateTimeRange, findTimeConflict, onAddLesson, setSelectedId, setSelectedCalendarDate, setCalendarMonth, setLessonDay, setScheduleError, showScheduleError, showScheduleNotice }: ScheduleSubstituteOptions) {
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

  useEffect(() => {
    setSubstituteDate(selectedCalendarDate);
  }, [selectedCalendarDate, weekStartPreference]);

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
    type: "small_class",
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

  return {
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
  };
}
