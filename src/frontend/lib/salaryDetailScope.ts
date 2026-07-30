import type { CourseGroup, Lesson } from "@/shared/types";

type SalaryDetailLesson = Pick<Lesson, "courseGroupId" | "date">;

export function filterSalaryDetailLessonsByDateScope<T extends SalaryDetailLesson>(
  lessons: T[],
  selectedMonth: string,
  startDate: string,
  endDate: string
): T[] {
  if (startDate && endDate && startDate > endDate) return [];
  const hasExplicitDateRange = Boolean(startDate || endDate);
  return lessons.filter((lesson) => {
    if (!hasExplicitDateRange) return lesson.date.startsWith(selectedMonth);
    return (!startDate || lesson.date >= startDate) && (!endDate || lesson.date <= endDate);
  });
}

export function filterCoursesWithScopedLessons<T extends Pick<CourseGroup, "id">>(courses: T[], lessons: SalaryDetailLesson[]): T[] {
  const courseIds = new Set(lessons.map((lesson) => lesson.courseGroupId));
  return courses.filter((course) => courseIds.has(course.id));
}
