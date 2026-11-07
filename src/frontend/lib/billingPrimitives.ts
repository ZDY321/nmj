import type {
  CourseType,
  Lesson
} from "../../shared/types";
import { SUBSTITUTE_CLASS_COURSE_GROUP_ID } from "../../shared/types";


export function isSubstituteClassLesson(lesson: Pick<Lesson, "courseGroupId"> & Partial<Pick<Lesson, "lessonSource" | "substituteClass">>): boolean {
  return lesson.lessonSource === "substitute_class" || lesson.courseGroupId === SUBSTITUTE_CLASS_COURSE_GROUP_ID || Boolean(lesson.substituteClass);
}

export function isClassBillingCourseType(type: CourseType): boolean {
  return type === "small_class" || type === "big_class" || type === "class";
}

export function classHeadcountBaseStudentCountForCourseType(type: CourseType): number {
  return isClassBillingCourseType(type) ? 5 : 1;
}

export function billableStudentCapForCourseType(type: CourseType): number | undefined {
  if (type === "big_class") return 20;
  if (type === "small_class" || type === "class") return 10;
  return undefined;
}

export function nonNegativeNumber(value: number | undefined, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(value ?? fallback, 0) : fallback;
}

export function nonNegativeInteger(value: number | undefined, fallback = 0): number {
  return Math.floor(nonNegativeNumber(value, fallback));
}

export function isLessonFullyMissedAndMakeupExempt(lesson: Lesson): boolean {
  if (lesson.linkedOriginalLessonId || lesson.attendance.length === 0) return false;
  const billableEntries = lesson.attendance.filter((entry) => !entry.trial);
  if (billableEntries.length === 0) return false;
  return billableEntries.every((entry) => isMakeupExemptMissedEntry(entry));
}

function isMakeupExemptMissedEntry(entry: Lesson["attendance"][number]): boolean {
  return Boolean(entry.makeupExempt) && (entry.status === "leave_requested" || entry.status === "absent" || entry.status === "makeup_pending");
}

export function isOriginalFullyMadeUp(lesson: Lesson): boolean {
  return (
    !lesson.linkedOriginalLessonId &&
    lesson.status === "makeup_completed" &&
    lesson.attendance.length > 0 &&
    lesson.attendance.every((entry) => entry.status === "makeup_completed")
  );
}
