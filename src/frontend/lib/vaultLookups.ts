import type {
  CourseGroup,
  TeacherVault
} from "../../shared/types";


export function getCourse(vault: TeacherVault, courseId: string): CourseGroup | undefined {
  return vault.courseGroups.find((course) => course.id === courseId);
}
