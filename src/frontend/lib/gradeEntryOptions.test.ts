import { describe, expect, it } from "vitest";
import { gradeEntryStudentOptions, gradeEntrySubjectOptions } from "@/frontend/lib/gradeEntryOptions";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import type { CourseGroup, Student } from "@/shared/types";

function makeStudent(id: string, name: string, status: Student["status"]): Student {
  return { id, name, status };
}

function makeCourse(id: string, subject: string, studentIds: string[], status: CourseGroup["status"]): CourseGroup {
  return {
    id,
    name: id,
    type: "one_on_one",
    subject,
    studentIds,
    feeRule: { mode: "fixed", fixedFee: 100 },
    status
  };
}

describe("grade entry options", () => {
  it("only offers active students for new grade records", () => {
    const vault = createEmptyVault("tester");
    vault.students = [
      makeStudent("archived", "Archived", "paused"),
      makeStudent("active", "Active", "active"),
      makeStudent("transition", "Transition", "transition")
    ];

    expect(gradeEntryStudentOptions(vault).map((student) => student.id)).toEqual(["active"]);
  });

  it("offers subjects from the selected student's current courses", () => {
    const vault = createEmptyVault("tester");
    vault.students = [makeStudent("active", "Active", "active")];
    vault.courseGroups = [
      makeCourse("math_1", "数学", ["active"], "active"),
      makeCourse("math_2", "数学", ["active"], "active"),
      makeCourse("english", "英语", ["active"], "active"),
      makeCourse("ended", "物理", ["active"], "paused"),
      makeCourse("other", "化学", ["other_student"], "active")
    ];

    expect(gradeEntrySubjectOptions(vault, "active")).toEqual(["数学", "英语"]);
  });
});
