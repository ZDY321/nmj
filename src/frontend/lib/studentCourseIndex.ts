import type { CourseGroup, Student, TeacherVault } from "@/shared/types";

// Build once per students/courseGroups revision, never retain a mutable vault globally.
export function buildStudentCourseIndex(vault: Pick<TeacherVault, "students" | "courseGroups">) {
  const studentById = new Map<string, Student>();
  for (const student of vault.students) {
    // Match Array.find for legacy archives containing duplicate IDs.
    if (!studentById.has(student.id)) studentById.set(student.id, student);
  }
  const coursesByStudentId = new Map<string, CourseGroup[]>();
  const studentsByCourse = new Map<CourseGroup, Student[]>();
  const coursesWithActiveStudents = new Set<CourseGroup>();
  for (const course of vault.courseGroups) {
    const students = course.studentIds.map(id => studentById.get(id)).filter((student): student is Student => Boolean(student));
    studentsByCourse.set(course, students);
    if (students.some(student => student.status === "active")) coursesWithActiveStudents.add(course);
    // Array.filter + includes returns each course once, even with duplicate roster IDs.
    for (const studentId of new Set(course.studentIds)) {
      const courses = coursesByStudentId.get(studentId);
      if (courses) courses.push(course);
      else coursesByStudentId.set(studentId, [course]);
    }
  }
  return { studentById, coursesByStudentId, studentsByCourse, coursesWithActiveStudents };
}
