import { buildFeeSnapshot, getCourse, todayIso } from "@/frontend/lib/calculations";
import { makeId } from "@/frontend/lib/crypto";
import { lessonStudentIds, makeupNeededStudentIds } from "@/frontend/lib/helpers";
import { attendanceStatusForLessonStatus } from "@/frontend/lib/scheduleViewHelpers";
import { stringValue } from "@/frontend/lib/typeGuards";
import type {
  AttendanceStatus,
  CourseGroup,
  DeletedLessonSource,
  FeeRule,
  Lesson,
  TeacherVault
} from "@/shared/types";

export type CourseLessonSyncScope = "future_scheduled" | "all_unfinished" | "all" | "none";

export function recalculateLessonFeeSnapshot(vault: TeacherVault, lesson: Lesson): Lesson {
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
    feeSnapshot: {
      ...buildFeeSnapshot(vault, course, normalizedLesson)
    }
  };
}

export function cloneFeeRule(rule: FeeRule): FeeRule {
  return structuredClone(rule);
}

export function moveLessonsToTrash(vault: TeacherVault, lessons: Lesson[], source: DeletedLessonSource, reason?: string) {
  if (lessons.length === 0) return;
  const lessonIds = new Set(lessons.map((lesson) => lesson.id));
  const trashedLessonIds = new Set((vault.deletedLessons ?? []).map((item) => item.lesson.id));
  const deletedAt = new Date().toISOString();
  const deletedItems = lessons
    .filter((lesson) => !trashedLessonIds.has(lesson.id))
    .map((lesson) => ({
      id: makeId("deleted_lesson"),
      lesson,
      deletedAt,
      source,
      reason
    }));
  vault.deletedLessons = [...(vault.deletedLessons ?? []), ...deletedItems];
  vault.lessons = vault.lessons.filter((lesson) => !lessonIds.has(lesson.id));
}

export function courseUpdateAffectsLessonDefaults(previousCourse: CourseGroup, nextCourse: CourseGroup): boolean {
  return (
    previousCourse.type !== nextCourse.type ||
    previousCourse.defaultCampusId !== nextCourse.defaultCampusId ||
    JSON.stringify(previousCourse.studentIds) !== JSON.stringify(nextCourse.studentIds) ||
    JSON.stringify(previousCourse.feeRule) !== JSON.stringify(nextCourse.feeRule)
  );
}

export function normalizeCourseLessonSyncScope(value: unknown): CourseLessonSyncScope {
  const normalized = stringValue(value).toLowerCase();
  if (!normalized || normalized === "default" || normalized === "future" || normalized === "future_scheduled" || normalized === "未来" || normalized === "未来待上课") {
    return "future_scheduled";
  }
  if (normalized === "none" || normalized === "false" || normalized === "不更新" || normalized === "不同步") return "none";
  if (normalized === "all" || normalized === "全部" || normalized === "所有课节") return "all";
  if (normalized === "unfinished" || normalized === "all_unfinished" || normalized === "未完成" || normalized === "未完成课节") return "all_unfinished";
  return "future_scheduled";
}

export function syncLessonsWithCourseDefaults(vault: TeacherVault, course: CourseGroup, scope: CourseLessonSyncScope): number {
  let changedCount = 0;
  vault.lessons = vault.lessons.map((lesson) => {
    if (lesson.courseGroupId !== course.id || !shouldSyncLessonWithCourseDefaults(lesson, scope)) return lesson;
    changedCount += 1;
    return recalculateLessonFeeSnapshot(vault, {
      ...lesson,
      type: course.type,
      campusId: course.defaultCampusId,
      expectedStudentIds: [...course.studentIds],
      attendance: lessonAttendanceFromCourse(vault, lesson, course),
      trialStudentCount: course.type === "class" ? lesson.trialStudentCount ?? 0 : 0,
      trialFee: course.type === "class" ? lesson.trialFee ?? 0 : 0
    });
  });
  return changedCount;
}

export function materializeStudentTrialStatusOnLessons(vault: TeacherVault, studentId: string, currentTrial: boolean) {
  vault.lessons = vault.lessons.map((lesson) => {
    let changed = false;
    const attendance = lesson.attendance.map((entry) => {
      if (entry.studentId !== studentId || entry.trial !== undefined) return entry;
      changed = true;
      return { ...entry, trial: currentTrial };
    });
    return changed ? { ...lesson, attendance } : lesson;
  });
}

export function syncFutureLessonsWithStudentTrialStatus(vault: TeacherVault, studentId: string, nextTrial: boolean): number {
  let changedCount = 0;
  vault.lessons = vault.lessons.map((lesson) => {
    if (!shouldSyncFutureLessonWithStudentTrialStatus(lesson)) return lesson;
    let changed = false;
    const attendance = lesson.attendance.map((entry) => {
      if (entry.studentId !== studentId || entry.trial === nextTrial) return entry;
      changed = true;
      return { ...entry, trial: nextTrial };
    });
    if (!changed) return lesson;
    changedCount += 1;
    return recalculateLessonFeeSnapshot(vault, { ...lesson, attendance });
  });
  return changedCount;
}

export function cleanupResolvedMakeupLessons(vault: TeacherVault, updatedOriginal: Lesson) {
  if (updatedOriginal.linkedOriginalLessonId) return;
  const previousOriginal = vault.lessons.find((lesson) => lesson.id === updatedOriginal.id);
  if (!previousOriginal) return;

  const previousNeededStudentIds = new Set(makeupNeededStudentIds(previousOriginal));
  if (previousNeededStudentIds.size === 0) return;
  const nextNeededStudentIds = new Set(makeupNeededStudentIds(updatedOriginal));
  const resolvedStudentIds = Array.from(previousNeededStudentIds).filter((studentId) => !nextNeededStudentIds.has(studentId));
  if (resolvedStudentIds.length === 0) return;
  const resolvedStudentSet = new Set(resolvedStudentIds);
  if (updatedOriginal.status === "makeup_pending" && nextNeededStudentIds.size === 0) {
    updatedOriginal.status = lessonStatusAfterResolvedMakeup(updatedOriginal);
  }

  vault.lessons = vault.lessons.flatMap((lesson) => {
    if (lesson.linkedOriginalLessonId !== updatedOriginal.id || lesson.status === "cancelled") {
      return [lesson];
    }

    const makeupStudentIds = lessonStudentIds(lesson);
    const keptStudentIds = makeupStudentIds.filter((studentId) => !resolvedStudentSet.has(studentId));
    if (keptStudentIds.length === makeupStudentIds.length) {
      return [lesson];
    }
    if (keptStudentIds.length === 0) {
      return [];
    }

    return [recalculateLessonFeeSnapshot(vault, {
      ...lesson,
      expectedStudentIds: lesson.expectedStudentIds.filter((studentId) => keptStudentIds.includes(studentId)),
      attendance: lesson.attendance.filter((entry) => keptStudentIds.includes(entry.studentId)),
      makeupStudentId: keptStudentIds.length === 1 ? keptStudentIds[0] : undefined,
      note: removeResolvedMakeupNames(lesson.note, vault, resolvedStudentIds)
    })];
  });
}

export function syncOriginalLessonFromMakeupCompletion(vault: TeacherVault, updatedMakeupLesson: Lesson): Lesson {
  const originalId = updatedMakeupLesson.linkedOriginalLessonId;
  if (!originalId) return updatedMakeupLesson;
  const isCompletedMakeupStatus = updatedMakeupLesson.status === "completed" || updatedMakeupLesson.status === "makeup_completed";
  if (!isCompletedMakeupStatus) return updatedMakeupLesson;
  const original = vault.lessons.find((lesson) => lesson.id === originalId);
  if (!original) return updatedMakeupLesson;

  const completedStudentIds = new Set(lessonStudentIds(updatedMakeupLesson));
  if (completedStudentIds.size === 0) return updatedMakeupLesson;
  const nextOriginal: Lesson = {
    ...original,
    attendance: original.attendance.map((entry) =>
      completedStudentIds.has(entry.studentId)
        ? { ...entry, status: "makeup_completed" as AttendanceStatus, note: entry.note || `${updatedMakeupLesson.date} 已补课完成` }
        : entry
    )
  };
  const remainingMakeupStudentIds = new Set(makeupNeededStudentIds(nextOriginal));
  if ((nextOriginal.status === "makeup_pending" || original.status === "makeup_pending") && remainingMakeupStudentIds.size === 0) {
    nextOriginal.status = lessonStatusAfterResolvedMakeup(nextOriginal);
  }

  const normalizedMakeupLesson = updatedMakeupLesson.status === "completed"
    ? {
        ...updatedMakeupLesson,
        status: "makeup_completed" as const,
        attendance: updatedMakeupLesson.attendance.map((entry) => (
          entry.status === "attended" ? { ...entry, status: "makeup_completed" as AttendanceStatus } : entry
        ))
      }
    : updatedMakeupLesson;

  const recalculatedOriginal = recalculateLessonFeeSnapshot(vault, nextOriginal);
  const recalculatedMakeup = recalculateLessonFeeSnapshot(vault, normalizedMakeupLesson);
  vault.lessons = vault.lessons.map((lesson) => {
    if (lesson.id === original.id) return recalculatedOriginal;
    if (lesson.id === updatedMakeupLesson.id) return recalculatedMakeup;
    return lesson;
  });
  return recalculatedMakeup;
}

function shouldSyncLessonWithCourseDefaults(lesson: Lesson, scope: CourseLessonSyncScope): boolean {
  if (scope === "none") return false;
  if (scope === "all") return true;
  if (lesson.linkedOriginalLessonId) return false;
  if (lesson.status !== "scheduled" && lesson.status !== "draft") return false;
  if (scope === "all_unfinished") return true;
  return lesson.date >= todayIso();
}

function lessonAttendanceFromCourse(vault: TeacherVault, lesson: Lesson, course: CourseGroup): Lesson["attendance"] {
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

function shouldSyncFutureLessonWithStudentTrialStatus(lesson: Lesson): boolean {
  if (lesson.date < todayIso()) return false;
  return lesson.status !== "completed" && lesson.status !== "cancelled" && lesson.status !== "makeup_completed";
}

function lessonStatusAfterResolvedMakeup(lesson: Lesson): Lesson["status"] {
  if (lesson.attendance.length > 0 && lesson.attendance.every((entry) => entry.status === "cancelled")) {
    return "cancelled";
  }
  if (lesson.attendance.length > 0 && lesson.attendance.every((entry) => entry.status === "makeup_completed")) {
    return "makeup_completed";
  }
  return "completed";
}

function removeResolvedMakeupNames(note: string | undefined, vault: TeacherVault, studentIds: string[]): string | undefined {
  if (!note) return note;
  return studentIds.reduce((current, studentId) => {
    const studentName = vault.students.find((student) => student.id === studentId)?.name;
    return studentName ? current.replaceAll(studentName, "").replace(/、{2,}/g, "、").replace(/^、|、(?= 补 )/g, "").trim() : current;
  }, note);
}
