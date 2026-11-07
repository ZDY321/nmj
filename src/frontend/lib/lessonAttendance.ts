import type { AttendanceStatus, Lesson, TeacherVault } from "@/shared/types";

export function attendanceStatusForLessonStatus(status: Lesson["status"]): AttendanceStatus {
  if (status === "cancelled") return "cancelled";
  if (status === "makeup_pending") return "makeup_pending";
  if (status === "makeup_completed") return "makeup_completed";
  return "attended";
}

// The caller chooses the roster: historical refresh uses all course IDs,
// while future synchronization uses only active students. Preserve its order and duplicates.
export function attendanceForStudentIds(
  vault: Pick<TeacherVault, "students">,
  lesson: Pick<Lesson, "attendance" | "status">,
  studentIds: readonly string[]
): Lesson["attendance"] {
  const existingByStudent = new Map(lesson.attendance.map((entry) => [entry.studentId, entry]));
  const fallbackStatus = attendanceStatusForLessonStatus(lesson.status);
  return studentIds.map((studentId) => {
    const existing = existingByStudent.get(studentId);
    const trial = existing?.trial ?? Boolean(vault.students.find((student) => student.id === studentId)?.temporaryTrial);
    return existing ? { ...existing, trial } : { studentId, status: fallbackStatus, trial };
  });
}
