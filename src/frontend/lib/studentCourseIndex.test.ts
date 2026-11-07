import { describe, expect, it } from "vitest";
import { buildStudentCourseIndex } from "./studentCourseIndex";
import { courseHasActiveStudent } from "./helpers";
import { createEmptyVault } from "./sampleData";
import type { CourseGroup, Student } from "@/shared/types";

function course(id: string, studentIds: string[]): CourseGroup {
  return { id, name: id, studentIds, status: "active", type: "small_class", subject: "数学", feeRule: { mode: "fixed", fixedFee: 100 } };
}

describe("student/course lookup index", () => {
  it("matches the original scans for missing, duplicate, paused and transition students", () => {
    const vault = createEmptyVault("tester");
    vault.students = [
      { id: "a", name: "小甲", status: "paused" },
      { id: "b", name: "小乙", status: "active", temporaryTrial: true },
      { id: "a", name: "重复甲", status: "active" },
      { id: "c", name: "小丙", status: "transition" }
    ];
    vault.courseGroups = [course("one", ["a", "b", "b", "missing"]), course("two", ["a", "c"]), course("empty", [])];
    const index = buildStudentCourseIndex(vault);
    for (const id of ["a", "b", "c", "missing"]) {
      expect(index.studentById.get(id)).toBe(vault.students.find(student => student.id === id));
      expect(index.coursesByStudentId.get(id) ?? []).toEqual(vault.courseGroups.filter(item => item.studentIds.includes(id)));
    }
    for (const item of vault.courseGroups) {
      expect(index.studentsByCourse.get(item)).toEqual(item.studentIds.map(id => vault.students.find(student => student.id === id)).filter(Boolean));
      expect(index.coursesWithActiveStudents.has(item)).toBe(courseHasActiveStudent(vault, item));
    }
  });

  it("keeps separate courses with duplicate IDs and reflects a new archive revision", () => {
    const vault = createEmptyVault("tester");
    const student: Student = { id: "a", name: "甲", status: "active" };
    vault.students = [student];
    vault.courseGroups = [course("duplicate", ["a"]), course("duplicate", ["missing"])];
    const before = structuredClone(vault);
    const index = buildStudentCourseIndex(vault);
    expect(index.studentsByCourse.get(vault.courseGroups[0])).toEqual([student]);
    expect(index.studentsByCourse.get(vault.courseGroups[1])).toEqual([]);
    expect(vault).toEqual(before);
    const changed = { ...vault, students: [{ ...student, status: "paused" as const }] };
    const next = buildStudentCourseIndex(changed);
    expect(next.coursesWithActiveStudents.size).toBe(0);
    expect(index.coursesWithActiveStudents.size).toBe(1);
  });
});
