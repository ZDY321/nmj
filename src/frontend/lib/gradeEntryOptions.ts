import { compareByName, sortStudentsByName } from "@/frontend/lib/helpers";
import type { Student, TeacherVault } from "@/shared/types";

export function gradeEntryStudentOptions(vault: TeacherVault): Student[] {
  return sortStudentsByName(vault.students.filter((student) => student.status === "active"));
}

export function gradeEntrySubjectOptions(vault: TeacherVault, studentId: string): string[] {
  const student = vault.students.find((item) => item.id === studentId);
  if (!student || student.status !== "active") return [];

  return Array.from(new Set(
    vault.courseGroups
      .filter((course) => course.status === "active" && course.studentIds.includes(studentId))
      .map((course) => course.subject.trim())
      .filter(Boolean)
  )).sort(compareByName);
}
