import {
  cloneVault
} from "@/frontend/lib/helpers";
import {
  arrayValue as arrayValueLocal,
  isPlainRecord as isPlainRecordLocal,
  stringValue
} from "@/frontend/lib/typeGuards";
import { createAiDraftArchives } from "./aiDraftArchives";
import { createAiDraftData } from "./aiDraftData";
import { createAiDraftFees } from "./aiDraftFees";
import { createAiDraftLessons } from "./aiDraftLessons";
import { createAiDraftLifecycle } from "./aiDraftLifecycle";
import type { ApplyAiScheduleDraftOptions, ApplyAiScheduleDraftResult } from "./aiDraftTypes";
export type { AiCourseLessonSyncScope, ApplyAiScheduleDraftOptions, ApplyAiScheduleDraftResult } from "./aiDraftTypes";
export function applyAiScheduleDraftToVault(options: ApplyAiScheduleDraftOptions): ApplyAiScheduleDraftResult {
  const { vault, session } = options;

  if (!vault || !session?.draft) {
    return { ok: false, message: "没有可执行的 AI 建议。请先生成建议。" };
  }
  const parsedDraft = session.draft.draft;
  if (!isPlainRecordLocal(parsedDraft)) {
    return { ok: false, message: "AI 建议不是标准结构，无法确认写入。" };
  }
  const actions = arrayValueLocal(parsedDraft.actions).filter(isPlainRecordLocal);
  if (actions.length === 0) {
    return { ok: false, message: "AI 建议里没有可执行动作。请先补充信息后重新生成。" };
  }

  const nextVault = cloneVault(vault);
  const messages: string[] = [];
  const blockers: string[] = [];

  const context = { ...options, nextVault, messages, blockers };
  const {
    campusByName,
    studentByName,
    courseByIdOrName,
    courseMatchesData,
    ensureStudent,
    studentIdsFromAiData,
    normalizeAiDate,
    normalizeAiTime,
    falseyAiValue,
    dateListFromAi
  } = createAiDraftData(context);
  const { enforceAiFeeModeMatchesCourseType, needsClassFeeConfirmation } = createAiDraftFees(context);
  const { createCourseTypeFromAi, ensureCourse, updateCourseFromAi, updateStudentFromAi, addStudentsToCourse } = createAiDraftArchives(context, { courseMatchesData, campusByName, studentIdsFromAiData, enforceAiFeeModeMatchesCourseType, needsClassFeeConfirmation, courseByIdOrName, studentByName });
  const { deleteOrPauseCourseFromAi, migrateCourseFromAi, deleteLessonFromAi } = createAiDraftLifecycle(context, { courseByIdOrName, ensureCourse, studentIdsFromAiData, dateListFromAi });
  const { addStudentsToLessons, createScheduledLessonsFromAi, createLessonsForCourse, applyScheduleSyncFromAi } = createAiDraftLessons(context, { normalizeAiTime, courseByIdOrName, ensureCourse, normalizeAiDate, campusByName, dateListFromAi, falseyAiValue });

  actions.forEach((action) => {
    const type = stringValue(action.type ?? action.action);
    const data = isPlainRecordLocal(action.data) ? action.data : action;
    if (type === "create_student") {
      ensureStudent(data);
      return;
    }
    if (type === "update_student" || type === "modify_student" || type === "rename_student") {
      updateStudentFromAi(data);
      return;
    }
    if (type === "create_course_type" || type === "create_custom_course_type") {
      createCourseTypeFromAi(data);
      return;
    }
    if (type === "create_course") {
      ensureCourse(data);
      return;
    }
    if (type === "update_course" || type === "modify_course") {
      updateCourseFromAi(data);
      return;
    }
    if (type === "delete_course" || type === "pause_course") {
      deleteOrPauseCourseFromAi(type === "pause_course" ? { ...data, mode: "pause" } : data);
      return;
    }
    if (type === "migrate_course" || type === "move_course_lessons") {
      migrateCourseFromAi(data);
      return;
    }
    if (type === "delete_lesson" || type === "remove_lesson" || type === "cancel_lesson") {
      deleteLessonFromAi(data);
      return;
    }
    if (type === "schedule_lessons") {
      const lessonItems = arrayValueLocal(data.lessons).filter(isPlainRecordLocal);
      if (lessonItems.length > 0) {
        const course = courseByIdOrName(data.courseId ?? data.courseGroupId ?? data.courseName ?? data.name) ?? null;
        createScheduledLessonsFromAi(lessonItems, data, course);
        return;
      }
      const course = ensureCourse(data);
      if (course) createLessonsForCourse(course, data);
      return;
    }
    if (type === "sync_lessons") {
      if (applyScheduleSyncFromAi(data)) return;
      const lessonIds = Array.from(new Set([
        ...arrayValueLocal(data.lessonIds).map(stringValue),
        stringValue(data.lessonId)
      ].filter(Boolean)));
      const studentIds = studentIdsFromAiData(data);
      addStudentsToLessons(lessonIds, studentIds);
      const affectedCourseIds = Array.from(new Set(
        nextVault.lessons.filter((lesson) => lessonIds.includes(lesson.id)).map((lesson) => lesson.courseGroupId)
      ));
      affectedCourseIds.forEach((courseId) => {
        const course = nextVault.courseGroups.find((item) => item.id === courseId);
        if (course) addStudentsToCourse(course, studentIds);
      });
    }
  });

  if (blockers.length > 0) {
    return { ok: false, message: blockers.join("；") };
  }

  if (messages.length === 0) {
    return { ok: false, message: "AI 建议没有被识别为可写入内容，请补充信息后重新生成。" };
  }

  return { ok: true, message: `AI 建议已写入：${messages.join("；")}`, vault: nextVault };
}

