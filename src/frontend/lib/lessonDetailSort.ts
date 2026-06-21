import type { Lesson, TeacherVault } from "@/shared/types";
import { compareByName, courseName, sortLessons } from "@/frontend/lib/helpers";

export type LessonDetailSortField = "date" | "amount" | "course";
export type LessonDetailSortDirection = "asc" | "desc";

export const lessonDetailSortFieldOptions: Array<{ value: LessonDetailSortField; label: string }> = [
  { value: "date", label: "日期" },
  { value: "amount", label: "金额" },
  { value: "course", label: "课程档案名称" }
];

export const lessonDetailSortDirectionOptions: Array<{ value: LessonDetailSortDirection; label: string }> = [
  { value: "asc", label: "升序" },
  { value: "desc", label: "降序" }
];

export function sortLessonDetails(
  vault: TeacherVault,
  lessons: Lesson[],
  options: {
    field: LessonDetailSortField;
    direction: LessonDetailSortDirection;
    amountForLesson?: (lesson: Lesson) => number;
  }
): Lesson[] {
  const direction = options.direction === "asc" ? 1 : -1;
  const amountForLesson = options.amountForLesson ?? ((lesson: Lesson) => lesson.feeSnapshot.amount);
  return [...lessons].sort((a, b) => {
    const primary = compareLessonDetailPrimary(vault, a, b, options.field, amountForLesson);
    if (primary !== 0) return primary * direction;
    return sortLessons(a, b);
  });
}

function compareLessonDetailPrimary(
  vault: TeacherVault,
  a: Lesson,
  b: Lesson,
  field: LessonDetailSortField,
  amountForLesson: (lesson: Lesson) => number
): number {
  if (field === "amount") return amountForLesson(a) - amountForLesson(b);
  if (field === "course") return compareByName(courseName(vault, a.courseGroupId), courseName(vault, b.courseGroupId));
  return sortLessons(a, b);
}
