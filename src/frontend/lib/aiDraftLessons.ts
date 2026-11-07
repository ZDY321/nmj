import {
  buildScheduleSyncLessonsForDate,
  createLessonFromCourse,
  linkSyncedLessonsToPreviousLessons
} from "@/frontend/lib/helpers";
import { timeToMinutes, timesOverlap } from "@/frontend/lib/time";
import {
  arrayValue as arrayValueLocal,
  isPlainRecord as isPlainRecordLocal,
  stringValue
} from "@/frontend/lib/typeGuards";
import type {
  CourseGroup,
  Lesson
} from "@/shared/types";

import type { createAiDraftArchives } from "./aiDraftArchives";
import type { createAiDraftData } from "./aiDraftData";
import type { AiDraftContext } from "./aiDraftTypes";

export function createAiDraftLessons({ nextVault, recalculateLessonFeeSnapshot, messages, blockers, moveLessonsToTrash }: AiDraftContext, { normalizeAiTime, courseByIdOrName, ensureCourse, normalizeAiDate, campusByName, dateListFromAi, falseyAiValue }: Pick<ReturnType<typeof createAiDraftData>, "normalizeAiTime" | "courseByIdOrName" | "normalizeAiDate" | "campusByName" | "dateListFromAi" | "falseyAiValue"> & Pick<ReturnType<typeof createAiDraftArchives>, "ensureCourse">) {
  const addStudentsToLessons = (lessonIds: string[], studentIds: string[]) => {
    if (lessonIds.length === 0 || studentIds.length === 0) return;
    let changedCount = 0;
    nextVault.lessons = nextVault.lessons.map((lesson) => {
      if (!lessonIds.includes(lesson.id)) return lesson;
      const expectedStudentIds = Array.from(new Set([...lesson.expectedStudentIds, ...studentIds]));
      const attendanceStudentIds = new Set(lesson.attendance.map((entry) => entry.studentId));
      const attendance = [
        ...lesson.attendance,
        ...studentIds
          .filter((studentId) => !attendanceStudentIds.has(studentId))
          .map((studentId) => ({ studentId, status: "attended" as const }))
      ];
      changedCount += 1;
      return recalculateLessonFeeSnapshot(nextVault, {
        ...lesson,
        expectedStudentIds,
        attendance
      });
    });
    if (changedCount > 0) {
      messages.push(`已更新 ${changedCount} 节课的关联学生`);
    }
  };

  const createScheduledLessonsFromAi = (
    lessonItems: Array<Record<string, unknown>>,
    defaults: Record<string, unknown>,
    defaultCourse: CourseGroup | null
  ) => {
    if (lessonItems.length === 0) return;
    let createdCount = 0;
    const skippedReasons: string[] = [];
    const createdByCourse = new Map<string, number>();
    const fallbackStartTime = normalizeAiTime(defaults.startTime) ?? "19:00";
    const fallbackEndTime = normalizeAiTime(defaults.endTime) ?? "21:00";

    lessonItems.forEach((item, index) => {
      const merged = { ...defaults, ...item };
      const course =
        courseByIdOrName(merged.courseId ?? merged.courseGroupId ?? merged.courseName ?? merged.name) ??
        defaultCourse ??
        ensureCourse({ ...merged, lessons: undefined });
      const requestedLabel = `第 ${index + 1} 节`;
      if (!course) {
        skippedReasons.push(`${requestedLabel}缺少可匹配课程`);
        return;
      }

      const date = normalizeAiDate(merged.date);
      if (!date) {
        skippedReasons.push(`${requestedLabel}（${course.name}）日期无效`);
        return;
      }
      const startTime = merged.startTime === undefined ? fallbackStartTime : normalizeAiTime(merged.startTime);
      const endTime = merged.endTime === undefined ? fallbackEndTime : normalizeAiTime(merged.endTime);
      if (!startTime || !endTime || timeToMinutes(startTime) >= timeToMinutes(endTime)) {
        skippedReasons.push(`${date} ${course.name} 时间无效`);
        return;
      }

      const duplicate = nextVault.lessons.some((lesson) =>
        lesson.status !== "cancelled" &&
        lesson.courseGroupId === course.id &&
        lesson.date === date &&
        lesson.startTime === startTime &&
        lesson.endTime === endTime
      );
      if (duplicate) {
        skippedReasons.push(`${date} ${startTime}-${endTime}「${course.name}」已存在`);
        return;
      }

      const conflict = nextVault.lessons.find((lesson) =>
        lesson.status !== "cancelled" &&
        lesson.date === date &&
        timesOverlap(lesson.startTime, lesson.endTime, startTime, endTime)
      );
      if (conflict) {
        const conflictCourse = nextVault.courseGroups.find((courseItem) => courseItem.id === conflict.courseGroupId);
        skippedReasons.push(`${date} ${startTime}-${endTime}「${course.name}」与「${conflictCourse?.name ?? "未知课程"} ${conflict.startTime}-${conflict.endTime}」冲突`);
        return;
      }

      const campus = campusByName(merged.campus ?? merged.campusName);
      nextVault.lessons.push(createLessonFromCourse(nextVault, course, {
        date,
        startTime,
        endTime,
        campusId: campus?.id ?? course.defaultCampusId,
        status: "scheduled"
      }));
      createdCount += 1;
      createdByCourse.set(course.name, (createdByCourse.get(course.name) ?? 0) + 1);
    });

    if (createdCount > 0) {
      const courseSummary = Array.from(createdByCourse.entries())
        .map(([name, count]) => `${name} ${count} 节`)
        .join("、");
      messages.push(`已新增 ${createdCount} 节排课${courseSummary ? `：${courseSummary}` : ""}`);
      if (skippedReasons.length > 0) {
        messages.push(`另有 ${skippedReasons.length} 节未新增：${skippedReasons.slice(0, 6).join("；")}${skippedReasons.length > 6 ? `；另 ${skippedReasons.length - 6} 节` : ""}`);
      }
      return;
    }

    if (skippedReasons.length > 0) {
      blockers.push(`AI 排课建议已识别，但没有新增课节：${skippedReasons.slice(0, 8).join("；")}${skippedReasons.length > 8 ? `；另 ${skippedReasons.length - 8} 节` : ""}`);
    }
  };

  const createLessonsForCourse = (course: CourseGroup, data: Record<string, unknown>) => {
    const dates = arrayValueLocal(data.dates).map(normalizeAiDate).filter((date): date is string => Boolean(date));
    const singleDate = normalizeAiDate(data.date);
    if (singleDate) dates.push(singleDate);
    const lessonItems = arrayValueLocal(data.lessons).filter(isPlainRecordLocal);
    const lessonRequests = lessonItems.length > 0
      ? lessonItems
      : Array.from(new Set(dates)).map((date) => ({ date }));
    createScheduledLessonsFromAi(lessonRequests, data, course);
  };

  const applyScheduleSyncFromAi = (data: Record<string, unknown>): boolean => {
    const sourceLessonIds = Array.from(new Set([
      ...arrayValueLocal(data.lessonIds ?? data.sourceLessonIds).map(stringValue),
      stringValue(data.lessonId ?? data.sourceLessonId)
    ].filter(Boolean)));
    const sourceLessonIdSet = new Set(sourceLessonIds);
    const sourceDates = dateListFromAi(
      data.sourceDates,
      data.sourceDate,
      data.sourceDateStart ?? data.sourceStartDate,
      data.sourceDateEnd ?? data.sourceEndDate
    );
    const targetDates = dateListFromAi(
      data.targetDates,
      data.targetDate,
      data.targetDateStart ?? data.targetStartDate,
      data.targetDateEnd ?? data.targetEndDate
    );
    const hasScheduleSyncShape =
      sourceDates.length > 0 ||
      targetDates.length > 0 ||
      stringValue(data.sourceDateStart ?? data.sourceStartDate ?? data.sourceDateEnd ?? data.sourceEndDate) ||
      stringValue(data.targetDateStart ?? data.targetStartDate ?? data.targetDateEnd ?? data.targetEndDate);
    if (!hasScheduleSyncShape) return false;

    if (targetDates.length === 0) {
      blockers.push("同步课节缺少目标日期。");
      return true;
    }

    const includeCancelled = !falseyAiValue(data.includeCancelled ?? data.copyCancelled ?? data.cancelledLessons);
    const sourceSnapshot = [...nextVault.lessons];
    const emptySourceDates: string[] = [];

    const buildSyncBatch = (sourceLessons: Lesson[], targetDate: string, targetStartDate: string) => {
      const filteredSourceLessons = sourceLessons.filter((lesson) => includeCancelled || lesson.status !== "cancelled");
      return filteredSourceLessons.length > 0
        ? buildScheduleSyncLessonsForDate(nextVault, filteredSourceLessons, targetDate, targetStartDate)
        : { lessons: [], replaceLessonIds: [], skippedCount: 0, conflictSkippedCount: 0 };
    };

    const syncBuilds: Array<ReturnType<typeof buildScheduleSyncLessonsForDate>> = [];

    if (sourceDates.length === 0 && sourceLessonIds.length > 0) {
      if (targetDates.length !== 1) {
        blockers.push("按课节同步时，请只提供一个目标日期。");
        return true;
      }
      const selectedSourceLessons = sourceSnapshot.filter((lesson) => sourceLessonIdSet.has(lesson.id));
      syncBuilds.push(buildSyncBatch(selectedSourceLessons, targetDates[0], targetDates[0]));
    } else {
      if (sourceDates.length === 0) {
        blockers.push("同步课节缺少来源日期。");
        return true;
      }
      if (sourceDates.length !== targetDates.length) {
        blockers.push("同步课节的来源日期和目标日期数量不一致，请重新生成建议。");
        return true;
      }
      const targetStartDate = targetDates[0];
      sourceDates.forEach((sourceDate, index) => {
        const sourceLessons = sourceSnapshot.filter((lesson) =>
          lesson.date === sourceDate &&
          (sourceLessonIdSet.size === 0 || sourceLessonIdSet.has(lesson.id))
        );
        if (sourceLessons.length === 0) {
          emptySourceDates.push(sourceDate);
          return;
        }
        syncBuilds.push(buildSyncBatch(sourceLessons, targetDates[index], targetStartDate));
      });
    }

    const replaceLessonIds = Array.from(new Set(syncBuilds.flatMap((build) => build.replaceLessonIds)));
    const lessonsToAdd = linkSyncedLessonsToPreviousLessons(
      nextVault,
      syncBuilds.flatMap((build) => build.lessons),
      replaceLessonIds
    );
    const skippedCount = syncBuilds.reduce((sum, build) => sum + build.skippedCount, 0);
    const conflictSkippedCount = syncBuilds.reduce((sum, build) => sum + build.conflictSkippedCount, 0);
    const syncedCount = lessonsToAdd.length;
    const replacedCount = replaceLessonIds.length;

    if (syncedCount === 0) {
      blockers.push(
        conflictSkippedCount > 0
          ? "目标时间已有其他课程，已跳过同步，未覆盖原有手动排课。"
          : skippedCount > 0
            ? "来源课程已暂停或缺失，未同步课节。"
            : "没有找到可同步的来源课节。"
      );
      return true;
    }

    if (replaceLessonIds.length > 0) {
      const replaceLessonIdSet = new Set(replaceLessonIds);
      moveLessonsToTrash(
        nextVault,
        nextVault.lessons.filter((lesson) => replaceLessonIdSet.has(lesson.id)),
        "sync_overwrite",
        "AI 同步排课覆盖旧课节"
      );
    }
    nextVault.lessons.push(...lessonsToAdd);

    const sourceLabel = sourceDates.length > 1
      ? `${sourceDates[0]} 至 ${sourceDates[sourceDates.length - 1]}`
      : sourceDates[0] ?? `${sourceLessonIds.length} 个来源课节`;
    const targetLabel = targetDates.length > 1
      ? `${targetDates[0]} 至 ${targetDates[targetDates.length - 1]}`
      : targetDates[0];
    messages.push(
      `已同步 ${syncedCount} 节课：${sourceLabel} 到 ${targetLabel}${replacedCount > 0 ? `，覆盖 ${replacedCount} 节已有课节` : ""}${skippedCount > 0 ? `，${skippedCount} 节来源课程已暂停未同步` : ""}${emptySourceDates.length > 0 ? `，${emptySourceDates.length} 个来源日期没有课节` : ""}`
      + `${conflictSkippedCount > 0 ? `，${conflictSkippedCount} 节目标时间已有其他课程已跳过` : ""}`
    );
    return true;
  };

  return { addStudentsToLessons, createScheduledLessonsFromAi, createLessonsForCourse, applyScheduleSyncFromAi };
}
