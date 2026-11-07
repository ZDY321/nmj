import type { CourseGroup, Student, TeacherVault } from "@/shared/types";
import { campusName, courseTypeLabel } from "@/frontend/lib/helpers";

export function studentCourseSearchText(vault: TeacherVault, student: Student, studentCourses: CourseGroup[]): string {
  return [
    student.name,
    student.grade ?? "",
    student.school ?? "",
    student.note ?? "",
    campusName(vault, student.defaultCampusId),
    studentStatusSearchText(student.status),
    student.temporaryTrial ? "试听 临时试听" : "",
    ...studentCourses.flatMap((course) => [
      course.name,
      course.subject,
      courseTypeLabel(vault, course.type),
      campusName(vault, course.defaultCampusId)
    ])
  ].join(" ").toLowerCase();
}

function studentStatusSearchText(status: Student["status"]): string {
  if (status === "paused") return "已归档 归档 暂停";
  if (status === "transition") return "过渡期 升学 中考 待定 缓冲";
  return "在读 正常";
}

export function matchesKeywordSearch(searchable: string, normalizedQuery: string): boolean {
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  return terms.length === 0 || terms.every((term) => searchable.includes(term));
}
