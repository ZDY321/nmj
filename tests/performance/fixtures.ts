import { createEmptyVault } from "../../src/frontend/lib/sampleData";
import type { CourseGroup, Lesson, TeacherVault } from "../../src/shared/types";

export const benchmarkDate = "2026-11-06";
export const benchmarkScales = [
  { name: "small", students: 40, courses: 12, lessons: 240 },
  { name: "medium", students: 240, courses: 80, lessons: 1800 },
  { name: "large", students: 800, courses: 240, lessons: 3600 }
] as const;

export function createBenchmarkVault(scale: { students: number; courses: number; lessons: number }): TeacherVault {
  const vault = createEmptyVault("性能测试教师");
  vault.notice = { ...vault.notice, enabled: false };
  vault.campuses = [{ id: "campus_a", name: "测试东校区" }, { id: "campus_b", name: "测试西校区" }];
  vault.students = Array.from({ length: scale.students }, (_, i) => ({
    id: `student_${i}`,
    name: `合成学生${String(i).padStart(4, "0")}`,
    grade: "初三",
    defaultCampusId: i % 2 ? "campus_b" : "campus_a",
    school: "性能测试学校",
    status: i % 11 === 10 ? "paused" : "active",
    temporaryTrial: i % 17 === 16
  }));
  vault.courseGroups = Array.from({ length: scale.courses }, (_, i): CourseGroup => ({
    id: `course_${i}`,
    name: `合成课程${String(i).padStart(4, "0")}`,
    type: "small_class",
    subject: i % 2 ? "数学" : "语文",
    defaultCampusId: i % 2 ? "campus_b" : "campus_a",
    studentIds: Array.from({ length: 5 }, (_, j) => vault.students[(i * 5 + j) % scale.students].id),
    status: "active",
    feeRule: { mode: "fixed", fixedFee: 100 }
  }));
  vault.lessons = Array.from({ length: scale.lessons }, (_, i): Lesson => {
    const course = vault.courseGroups[i % scale.courses];
    const date = new Date("2026-11-06T00:00:00.000Z");
    date.setUTCDate(date.getUTCDate() - Math.floor(i / 8));
    return {
      id: `lesson_${i}`,
      date: date.toISOString().slice(0, 10),
      startTime: "10:00", endTime: "12:00",
      courseGroupId: course.id, campusId: course.defaultCampusId, type: course.type,
      status: "completed",
      expectedStudentIds: [...course.studentIds],
      attendance: course.studentIds.map(studentId => ({ studentId, status: "attended" })),
      feeSnapshot: { amount: 100, hours: 2 },
      content: { taught: "合成教学内容", homework: "合成作业", nextLessonReminder: "" }
    };
  });
  return vault;
}
