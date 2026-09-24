import { describe, expect, it } from "vitest";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { progressCourseMatchesStudentStatusScope } from "@/frontend/lib/progressStudentScope";
import type { CourseGroup } from "@/shared/types";

function makeCourse(status: CourseGroup["status"], studentIds: string[]): CourseGroup {
  return {
    id: "course_1",
    name: "Course",
    type: "one_on_one",
    subject: "Math",
    studentIds,
    feeRule: { mode: "fixed", fixedFee: 100 },
    status
  };
}

describe("progress student status scope", () => {
  it("hides an ended course from the active-student scope", () => {
    const vault = createEmptyVault("tester");
    const activeStudent = { id: "student_active", name: "Active", status: "active" as const };
    vault.students = [activeStudent];
    const endedCourse = makeCourse("paused", [activeStudent.id]);

    expect(progressCourseMatchesStudentStatusScope(vault, endedCourse, [activeStudent], "active")).toBe(false);
    expect(progressCourseMatchesStudentStatusScope(vault, endedCourse, [activeStudent], "archived")).toBe(false);
  });

  it("shows a current course linked to an active student", () => {
    const vault = createEmptyVault("tester");
    const activeStudent = { id: "student_active", name: "Active", status: "active" as const };
    vault.students = [activeStudent];
    const currentCourse = makeCourse("active", [activeStudent.id]);

    expect(progressCourseMatchesStudentStatusScope(vault, currentCourse, [activeStudent], "active")).toBe(true);
  });

  it("uses the student's archived status independently from the course status", () => {
    const vault = createEmptyVault("tester");
    const archivedStudent = { id: "student_archived", name: "Archived", status: "paused" as const };
    vault.students = [archivedStudent];
    const activeCourse = makeCourse("active", [archivedStudent.id]);

    expect(progressCourseMatchesStudentStatusScope(vault, activeCourse, [archivedStudent], "active")).toBe(false);
    expect(progressCourseMatchesStudentStatusScope(vault, activeCourse, [archivedStudent], "archived")).toBe(true);
  });
});
