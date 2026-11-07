import { describe, expect, it } from "vitest";
import { attendanceForStudentIds } from "./lessonAttendance";
import { activeStudentIdsForCourse } from "./helpers";
import { createEmptyVault } from "./sampleData";
import type { CourseGroup, Lesson } from "@/shared/types";

describe("attendance roster reconstruction", () => {
  it.each([
    ["draft", "attended"], ["scheduled", "attended"], ["completed", "attended"],
    ["cancelled", "cancelled"], ["makeup_pending", "makeup_pending"], ["makeup_completed", "makeup_completed"]
  ] as const)("keeps the default attendance status for %s", (status, expected) => {
    expect(attendanceForStudentIds({ students: [] }, { status, attendance: [] }, ["missing"])).toEqual([
      { studentId: "missing", status: expected, trial: false }
    ]);
  });

  it("retains the last existing entry and its overrides without mutating attendance", () => {
    const vault = createEmptyVault("tester");
    vault.students = [
      { id: "a", name: "甲", status: "active", temporaryTrial: true },
      { id: "b", name: "乙", status: "paused", temporaryTrial: true }
    ];
    const lesson: Pick<Lesson, "status" | "attendance"> = {
      status: "completed", attendance: [
        { studentId: "a", status: "attended", note: "旧备注" },
        { studentId: "a", status: "absent", note: "保留备注", trial: false, temporary: true, makeupExempt: true, temporaryFee: 75 },
        { studentId: "extra", status: "attended" }
      ]
    };
    const before = structuredClone(lesson);
    const next = attendanceForStudentIds(vault, lesson, ["b", "a", "a", "missing"]);
    expect(next).toEqual([
      { studentId: "b", status: "attended", trial: true },
      lesson.attendance[1], lesson.attendance[1],
      { studentId: "missing", status: "attended", trial: false }
    ]);
    expect(next[1]).not.toBe(lesson.attendance[1]);
    expect(lesson).toEqual(before);
  });

  it("keeps historical rosters distinct from the active roster used for future sync", () => {
    const vault = createEmptyVault("tester");
    vault.students = [
      { id: "active", name: "在读", status: "active" },
      { id: "paused", name: "归档", status: "paused" },
      { id: "transition", name: "过渡", status: "transition" }
    ];
    const course: CourseGroup = { id: "c", name: "班", subject: "数学", type: "small_class", status: "active", feeRule: { mode: "fixed", fixedFee: 100 }, studentIds: ["active", "paused", "transition", "missing"] };
    const lesson: Pick<Lesson, "status" | "attendance"> = { status: "scheduled", attendance: [] };
    expect(attendanceForStudentIds(vault, lesson, course.studentIds).map(entry => entry.studentId)).toEqual(course.studentIds);
    expect(attendanceForStudentIds(vault, lesson, activeStudentIdsForCourse(vault, course)).map(entry => entry.studentId)).toEqual(["active"]);
  });
});
