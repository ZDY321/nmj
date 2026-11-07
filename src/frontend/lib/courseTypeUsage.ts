import type { CourseType, Lesson, TeacherVault } from "@/shared/types";

type CourseUsageVault = Pick<TeacherVault, "courseGroups" | "lessons">;

function isFutureSyncableLesson(lesson: Lesson, courseIds: ReadonlySet<string>, today: string): boolean {
  return courseIds.has(lesson.courseGroupId) &&
    !lesson.linkedOriginalLessonId &&
    (lesson.status === "scheduled" || lesson.status === "draft") &&
    lesson.date >= today;
}

export function countFutureSyncableLessons(vault: Pick<TeacherVault, "lessons">, courseIds: ReadonlySet<string>, today: string): number {
  let count = 0;
  for (const lesson of vault.lessons) {
    if (isFutureSyncableLesson(lesson, courseIds, today)) count += 1;
  }
  return count;
}

export function courseTypeUsageCounts(vault: CourseUsageVault, type: CourseType, today: string) {
  const courseIds = new Set(vault.courseGroups.filter((course) => course.type === type).map((course) => course.id));
  let lessonCount = 0;
  let legacyLessonCount = 0;
  let futureLessonCount = 0;
  for (const lesson of vault.lessons) {
    const belongsToCourse = courseIds.has(lesson.courseGroupId);
    if (lesson.type === type || belongsToCourse) lessonCount += 1;
    if (lesson.type === type && !belongsToCourse) legacyLessonCount += 1;
    if (isFutureSyncableLesson(lesson, courseIds, today)) futureLessonCount += 1;
  }
  return { courseCount: courseIds.size, lessonCount, legacyLessonCount, futureLessonCount };
}
