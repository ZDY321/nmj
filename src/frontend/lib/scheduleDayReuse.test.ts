import { describe, expect, it } from "vitest";
import { createLessonFromCourse } from "@/frontend/lib/helpers";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { buildScheduleDayReusePreview, buildScheduleRangeReusePreview } from "@/frontend/lib/scheduleDayReuse";
import type { CourseGroup } from "@/shared/types";

function makeCourse(id: string, studentId: string): CourseGroup {
  return {
    id,
    name: id,
    type: "one_on_one",
    subject: id,
    studentIds: [studentId],
    feeRule: { mode: "fixed", fixedFee: 100 },
    status: "active"
  };
}

describe("schedule day reuse preview", () => {
  it("shows the final target-day schedule with creates, replacements, keeps, and skipped conflicts", () => {
    const vault = createEmptyVault("tester");
    const studentId = "student_1";
    vault.students = [{ id: studentId, name: "Student", status: "active" }];
    const math = makeCourse("math", studentId);
    const english = makeCourse("english", studentId);
    const physics = makeCourse("physics", studentId);
    const chemistry = makeCourse("chemistry", studentId);
    const history = makeCourse("history", studentId);
    vault.courseGroups = [math, english, physics, chemistry, history];

    const sourceLessons = [
      createLessonFromCourse(vault, math, { date: "2026-09-20", startTime: "09:00", endTime: "10:00" }),
      createLessonFromCourse(vault, english, { date: "2026-09-20", startTime: "11:00", endTime: "12:00" }),
      createLessonFromCourse(vault, physics, { date: "2026-09-20", startTime: "13:00", endTime: "14:00" })
    ];
    vault.lessons = [
      ...sourceLessons,
      createLessonFromCourse(vault, math, { date: "2026-09-24", startTime: "09:00", endTime: "10:00" }),
      createLessonFromCourse(vault, chemistry, { date: "2026-09-24", startTime: "13:30", endTime: "14:30" }),
      createLessonFromCourse(vault, history, { date: "2026-09-24", startTime: "15:00", endTime: "16:00" })
    ];

    const preview = buildScheduleDayReusePreview(vault, sourceLessons, "2026-09-24");

    expect(preview.createCount).toBe(1);
    expect(preview.replaceCount).toBe(1);
    expect(preview.keepCount).toBe(2);
    expect(preview.skippedEntries).toHaveLength(1);
    expect(preview.skippedEntries[0].reason).toBe("time_conflict");
    expect(preview.finalEntries.map((entry) => [entry.lesson.courseGroupId, entry.outcome])).toEqual([
      ["math", "replace"],
      ["english", "create"],
      ["chemistry", "keep"],
      ["history", "keep"]
    ]);
  });

  it("aggregates mapped source and target dates for a range preview", () => {
    const vault = createEmptyVault("tester");
    const studentId = "student_1";
    vault.students = [{ id: studentId, name: "Student", status: "active" }];
    const math = makeCourse("math", studentId);
    const english = makeCourse("english", studentId);
    const history = makeCourse("history", studentId);
    vault.courseGroups = [math, english, history];
    vault.lessons = [
      createLessonFromCourse(vault, math, { date: "2026-09-14", startTime: "09:00", endTime: "10:00" }),
      createLessonFromCourse(vault, english, { date: "2026-09-15", startTime: "11:00", endTime: "12:00" }),
      createLessonFromCourse(vault, math, { date: "2026-09-21", startTime: "09:00", endTime: "10:00" }),
      createLessonFromCourse(vault, history, { date: "2026-09-22", startTime: "11:30", endTime: "12:30" })
    ];

    const preview = buildScheduleRangeReusePreview(
      vault,
      ["2026-09-14", "2026-09-15"],
      ["2026-09-21", "2026-09-22"]
    );

    expect(preview.days).toHaveLength(2);
    expect(preview.sourceLessonCount).toBe(2);
    expect(preview.createCount).toBe(0);
    expect(preview.replaceCount).toBe(1);
    expect(preview.keepCount).toBe(1);
    expect(preview.skippedCount).toBe(1);
    expect(preview.conflictSkippedCount).toBe(1);
    expect(preview.days.map((day) => [day.sourceDate, day.targetDate])).toEqual([
      ["2026-09-14", "2026-09-21"],
      ["2026-09-15", "2026-09-22"]
    ]);
  });
});
