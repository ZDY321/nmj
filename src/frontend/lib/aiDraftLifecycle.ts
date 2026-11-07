import {
  arrayValue as arrayValueLocal,
  stringValue
} from "@/frontend/lib/typeGuards";

import type { createAiDraftArchives } from "./aiDraftArchives";
import type { createAiDraftData } from "./aiDraftData";
import type { AiDraftContext } from "./aiDraftTypes";

export function createAiDraftLifecycle({ nextVault, messages, moveLessonsToTrash, recalculateLessonFeeSnapshot, blockers }: AiDraftContext, { courseByIdOrName, ensureCourse, studentIdsFromAiData, dateListFromAi }: Pick<ReturnType<typeof createAiDraftData>, "courseByIdOrName" | "studentIdsFromAiData" | "dateListFromAi"> & Pick<ReturnType<typeof createAiDraftArchives>, "ensureCourse">) {
  const deleteOrPauseCourseFromAi = (data: Record<string, unknown>) => {
    const course = courseByIdOrName(data.courseId ?? data.id ?? data.name ?? data.courseName);
    if (!course) return;
    const inUse = nextVault.lessons.some((lesson) => lesson.courseGroupId === course.id);
    const mode = stringValue(data.mode ?? data.deleteMode ?? data.action).toLowerCase();
    const force = Boolean(data.forceDelete ?? data.force);
    if (mode === "pause" || mode === "paused" || mode === "archive" || mode === "归档" || mode === "暂停") {
      nextVault.courseGroups = nextVault.courseGroups.map((item) =>
        item.id === course.id ? { ...item, status: "paused" } : item
      );
      messages.push(`已暂停课程「${course.name}」`);
      return;
    }
    if (inUse && mode !== "force_delete" && !force) {
      nextVault.courseGroups = nextVault.courseGroups.map((item) =>
        item.id === course.id ? { ...item, status: "paused" } : item
      );
      messages.push(`课程「${course.name}」已有课时引用，已改为暂停`);
      return;
    }
    nextVault.courseGroups = nextVault.courseGroups.filter((item) => item.id !== course.id);
    moveLessonsToTrash(
      nextVault,
      nextVault.lessons.filter((lesson) => lesson.courseGroupId === course.id),
      "ai",
      `AI 强制删除课程「${course.name}」连带课节`
    );
    messages.push(`已删除课程「${course.name}」${inUse ? "及其课时" : ""}`);
  };

  const migrateCourseFromAi = (data: Record<string, unknown>) => {
    const source = courseByIdOrName(data.sourceCourseId ?? data.fromCourseId ?? data.courseId ?? data.id ?? data.sourceCourseName ?? data.courseName);
    if (!source) return;
    const target = courseByIdOrName(data.targetCourseId ?? data.toCourseId ?? data.targetCourseName)
      ?? ensureCourse({
        ...data,
        courseId: undefined,
        id: undefined,
        name: data.targetCourseName ?? data.newCourseName ?? data.newName ?? data.name ?? source.name,
        courseName: data.targetCourseName ?? data.newCourseName ?? data.newName ?? data.name ?? source.name,
        type: data.targetType ?? data.type ?? source.type,
        subject: data.subject ?? source.subject,
        campus: data.campus,
        students: data.students ?? data.studentNames ?? source.studentIds.map((studentId) => nextVault.students.find((student) => student.id === studentId)?.name).filter(Boolean)
      });
    if (!target) return;
    const migrateLessons = data.migrateLessons !== false && data.moveLessons !== false;
    const effectiveFrom = stringValue(data.effectiveFrom ?? data.fromDate);
    const effectiveTo = stringValue(data.effectiveTo ?? data.toDate);
    const studentIds = studentIdsFromAiData(data);
    const nextTargetStudentIds = Array.from(new Set([...target.studentIds, ...(studentIds.length > 0 ? studentIds : source.studentIds)]));
    Object.assign(target, {
      status: "active",
      studentIds: nextTargetStudentIds
    });
    if (migrateLessons) {
      let migratedCount = 0;
      nextVault.lessons = nextVault.lessons.map((lesson) => {
        if (lesson.courseGroupId !== source.id) return lesson;
        if (effectiveFrom && lesson.date < effectiveFrom) return lesson;
        if (effectiveTo && lesson.date > effectiveTo) return lesson;
        migratedCount += 1;
        return recalculateLessonFeeSnapshot(nextVault, {
          ...lesson,
          courseGroupId: target.id,
          type: target.type,
          campusId: target.defaultCampusId ?? lesson.campusId,
          expectedStudentIds: lesson.expectedStudentIds.length > 0 ? lesson.expectedStudentIds : nextTargetStudentIds
        });
      });
      messages.push(`已迁移 ${migratedCount} 节课到课程「${target.name}」`);
    }
    if (data.pauseSource !== false) {
      nextVault.courseGroups = nextVault.courseGroups.map((course) =>
        course.id === source.id ? { ...course, status: "paused" } : course
      );
    }
  };

  const deleteLessonFromAi = (data: Record<string, unknown>) => {
    const lessonIds = Array.from(new Set([
      ...arrayValueLocal(data.lessonIds).map(stringValue),
      stringValue(data.lessonId ?? data.id)
    ].filter(Boolean)));
    const lessonIdSet = new Set(lessonIds);
    const lessonDates = dateListFromAi(data.dates, data.date, data.dateStart ?? data.startDate ?? data.fromDate, data.dateEnd ?? data.endDate ?? data.toDate);
    const lessonDateSet = new Set(lessonDates);
    const startTime = stringValue(data.startTime);
    const endTime = stringValue(data.endTime);
    const courseName = stringValue(data.courseName ?? data.name);
    const subject = stringValue(data.subject);
    const courseId = stringValue(data.courseId);
    const deleteScheduledOnly = data.scheduledOnly !== false && data.includeCompleted !== true && data.deleteCompleted !== true;
    const hasDateRange = lessonDates.length > 0;
    const hasSpecificTime = Boolean(startTime || endTime);
    const hasCourseFilter = Boolean(courseId || courseName || subject);
    const hasSpecificIds = lessonIds.length > 0;
    if (!hasSpecificIds && !hasDateRange) {
      blockers.push("删除课节缺少明确日期或课节ID，已拒绝执行，避免误删历史课程。");
      return;
    }
    const matchedLessons = nextVault.lessons.filter((lesson) => {
      if (hasSpecificIds && !lessonIdSet.has(lesson.id)) return false;
      if (hasDateRange && !lessonDateSet.has(lesson.date)) return false;
      if (deleteScheduledOnly && lesson.status !== "scheduled" && lesson.status !== "draft" && lesson.status !== "makeup_pending") return false;
      if (courseId && lesson.courseGroupId !== courseId) return false;
      if (startTime && lesson.startTime !== startTime) return false;
      if (endTime && lesson.endTime !== endTime) return false;
      if (!courseName && !subject) return true;
      const course = nextVault.courseGroups.find((item) => item.id === lesson.courseGroupId);
      if (!course) return false;
      if (courseName && course.name.trim().toLowerCase() !== courseName.toLowerCase()) return false;
      if (subject && course.subject.trim().toLowerCase() !== subject.toLowerCase()) return false;
      return true;
    });
    if (matchedLessons.length === 0) {
      blockers.push(`没有找到符合${hasDateRange ? ` ${lessonDates[0]}${lessonDates.length > 1 ? ` 至 ${lessonDates.at(-1)}` : ""}` : ""} 条件的待上课课节。`);
      return;
    }
    if (!hasDateRange && !hasSpecificIds && matchedLessons.length > 1) {
      blockers.push(`删除课节匹配到 ${matchedLessons.length} 节，但缺少明确日期或课节ID，已拒绝执行。`);
      return;
    }
    if (!hasSpecificIds && !hasSpecificTime && !hasCourseFilter && matchedLessons.length > 80) {
      blockers.push(`删除课节将影响 ${matchedLessons.length} 节，范围过大，已拒绝执行。请缩小日期范围或指定课程。`);
      return;
    }
    moveLessonsToTrash(nextVault, matchedLessons, "ai", "AI 删除课节");
    const preview = matchedLessons
      .slice(0, 12)
      .map((lesson) => `「${lesson.date} ${lesson.startTime}-${lesson.endTime} · ${nextVault.courseGroups.find((course) => course.id === lesson.courseGroupId)?.name ?? "未知课程"}」`);
    messages.push(`已将 ${matchedLessons.length} 节课移入回收站${hasDateRange ? `（${lessonDates[0]}${lessonDates.length > 1 ? ` 至 ${lessonDates.at(-1)}` : ""}）` : ""}${preview.length > 0 ? `：${preview.join("；")}${matchedLessons.length > preview.length ? `；另 ${matchedLessons.length - preview.length} 节` : ""}` : ""}`);
  };

  return { deleteOrPauseCourseFromAi, migrateCourseFromAi, deleteLessonFromAi };
}
