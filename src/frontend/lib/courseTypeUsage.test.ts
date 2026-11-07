import { describe, expect, it } from "vitest";
import type { CourseGroup, CourseType, Lesson } from "@/shared/types";
import { countFutureSyncableLessons, courseTypeUsageCounts } from "./courseTypeUsage";

const today = "2026-11-07";
function course(id: string, type: CourseType): CourseGroup {
  return { id, name: id, type, subject: "数学", studentIds: [], status: "active", feeRule: { mode: "fixed", fixedFee: 100 } };
}
function lesson(id: string, patch: Partial<Lesson> = {}): Lesson {
  return { id, courseGroupId: "linked", type: "small_class", date: today, startTime: "10:00", endTime: "12:00", status: "scheduled", expectedStudentIds: [], attendance: [], feeSnapshot: { amount: 123, hours: 2 }, content: { taught: "", homework: "", nextLessonReminder: "" }, ...patch };
}

describe("course type usage", () => {
  it("counts the union of course links and snapshots once and keeps legacy and future scopes separate", () => {
    const vault = { courseGroups: [course("linked", "small_class"), course("other", "one_on_one")], lessons: [
      lesson("both"), lesson("mismatched", { type: "one_on_one", status: "draft" }),
      lesson("orphan", { courseGroupId: "missing" }), lesson("legacy", { courseGroupId: "other" }),
      lesson("completed", { status: "completed" }), lesson("past", { date: "2026-11-06" }),
      lesson("makeup", { linkedOriginalLessonId: "original" }), lesson("unrelated", { type: "one_on_one", courseGroupId: "other" })
    ] };
    const before = structuredClone(vault);
    expect(courseTypeUsageCounts(vault, "small_class", today)).toEqual({ courseCount: 1, lessonCount: 7, legacyLessonCount: 2, futureLessonCount: 2 });
    expect(countFutureSyncableLessons(vault, new Set(["linked"]), today)).toBe(2);
    expect(vault).toEqual(before);
  });

  it("matches the old filters across statuses, date boundaries, makeup links and snapshot mismatches", () => {
    const lessons: Lesson[] = [];
    for (const status of ["draft", "scheduled", "completed", "cancelled", "makeup_pending", "makeup_completed"] as const) {
      for (const date of ["2026-11-06", today, "2026-11-08"]) {
        for (const linkedOriginalLessonId of [undefined, "", "original"]) {
          for (const courseGroupId of ["linked", "other", "missing"]) {
            for (const type of ["small_class", "one_on_one"] as const) {
              lessons.push(lesson(String(lessons.length), { status, date, linkedOriginalLessonId, courseGroupId, type }));
            }
          }
        }
      }
    }
    const vault = { courseGroups: [course("linked", "small_class"), course("other", "one_on_one")], lessons };
    for (const type of ["small_class", "one_on_one", "custom_unused"] as const) {
      const ids = new Set(vault.courseGroups.filter(course => course.type === type).map(course => course.id));
      const future = lessons.filter(lesson => ids.has(lesson.courseGroupId) && !lesson.linkedOriginalLessonId && (lesson.status === "scheduled" || lesson.status === "draft") && lesson.date >= today).length;
      expect(courseTypeUsageCounts(vault, type, today)).toEqual({ courseCount: ids.size, lessonCount: lessons.filter(lesson => lesson.type === type || ids.has(lesson.courseGroupId)).length, legacyLessonCount: lessons.filter(lesson => lesson.type === type && !ids.has(lesson.courseGroupId)).length, futureLessonCount: future });
      expect(countFutureSyncableLessons(vault, ids, today)).toBe(future);
    }
  });

  it("retains set semantics for duplicate course ids and counts orphan snapshots without a course", () => {
    const vault = { courseGroups: [course("linked", "small_class"), course("linked", "small_class"), course("linked", "one_on_one")], lessons: [lesson("linked"), lesson("orphan", { courseGroupId: "missing", type: "custom_old" })] };
    expect(courseTypeUsageCounts(vault, "small_class", today).courseCount).toBe(1);
    expect(courseTypeUsageCounts(vault, "custom_old", today)).toEqual({ courseCount: 0, lessonCount: 1, legacyLessonCount: 1, futureLessonCount: 0 });
    expect(countFutureSyncableLessons(vault, new Set(), today)).toBe(0);
  });

  it("returns empty counts without courses or lessons", () => {
    expect(courseTypeUsageCounts({ courseGroups: [], lessons: [] }, "small_class", today)).toEqual({ courseCount: 0, lessonCount: 0, legacyLessonCount: 0, futureLessonCount: 0 });
  });
});
