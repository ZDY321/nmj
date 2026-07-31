import { courseHasActiveStudent } from "@/frontend/lib/helpers";
import type { CourseGroup, Student, TeacherVault } from "@/shared/types";

export type ProgressStudentStatusScope = "active" | "archived" | "all";

export function progressCourseMatchesStudentStatusScope(
  vault: TeacherVault,
  course: CourseGroup,
  relatedStudents: Student[],
  scope: ProgressStudentStatusScope
): boolean {
  if (scope === "all") return true;
  if (scope === "archived") return relatedStudents.some((student) => student.status === "paused");
  return courseHasActiveStudent(vault, course);
}
