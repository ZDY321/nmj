import { beforeEach, expect, it } from "vitest";
import type { TeacherVault } from "@/shared/types";
import { createEmptyVault } from "./sampleData";
import { createLessonFromCourse } from "./helpers";
import { applyAiScheduleDraftToVault } from "./aiScheduleDraftApply";
import { courseUpdateAffectsLessonDefaults, materializeStudentTrialStatusOnLessons, moveLessonsToTrash, normalizeCourseLessonSyncScope, recalculateLessonFeeSnapshot, syncFutureLessonsWithStudentTrialStatus, syncLessonsWithCourseDefaults } from "./vaultMutations";
let vault: TeacherVault;
function apply(actions: unknown[]) {
  let id = 0;
  return applyAiScheduleDraftToVault({ vault, session: { providerId: "test", taskType: "auto", instruction: "", followupAnswer: "", message: "", draft: { providerId: "test", model: "test", createdAt: "", text: "", draft: { actions } } }, makeId: prefix => prefix + ++id, recalculateLessonFeeSnapshot, moveLessonsToTrash, courseUpdateAffectsLessonDefaults, normalizeCourseLessonSyncScope, syncLessonsWithCourseDefaults, materializeStudentTrialStatusOnLessons, syncFutureLessonsWithStudentTrialStatus });
}
beforeEach(() => {
  vault = createEmptyVault(); vault.students = [{ id: "old", name: "已有学生", status: "active" }];
  vault.courseGroups = [{ id: "course", name: "原课程", subject: "语文", type: "one_on_one", status: "active", studentIds: ["old"], feeRule: { mode: "fixed", fixedFee: 120 } }];
  vault.lessons = [createLessonFromCourse(vault, vault.courseGroups[0], { date: "2026-11-06", startTime: "10:00", endTime: "12:00", status: "completed" })];
});
it("applies dependent student, course and schedule actions to one clone in order", () => {
  const before = structuredClone(vault);
  const result = apply([{ type: "create_student", data: { name: "新学生" } }, { type: "create_course", data: { name: "新课程", type: "one_on_one", students: ["新学生"], subject: "数学" } }, { type: "schedule_lessons", data: { courseName: "新课程", dates: ["2026-11-09"], startTime: "14:00", endTime: "16:00" } }]);
  expect(result.ok).toBe(true); if (!result.ok) return;
  const student = result.vault.students.find(student => student.name === "新学生")!; const course = result.vault.courseGroups.find(course => course.name === "新课程")!;
  expect(course.studentIds).toEqual([student.id]); expect(result.vault.lessons.at(-1)).toMatchObject({ date: "2026-11-09", courseGroupId: course.id, expectedStudentIds: [student.id], status: "scheduled" }); expect(result.vault.lessons[0]).toEqual(before.lessons[0]); expect(vault).toEqual(before);
});
it("returns no changed vault when a later action blocks after earlier changes", () => {
  const before = structuredClone(vault);
  const result = apply([{ type: "create_student", data: { name: "应回滚" } }, { type: "schedule_lessons", data: { courseId: "course", lessons: [{ date: "bad-date", startTime: "10:00", endTime: "12:00" }] } }]);
  expect(result.ok).toBe(false); expect(result).not.toHaveProperty("vault"); expect(vault).toEqual(before);
});
it("preserves history when pausing a referenced course and moves explicit lesson deletion to trash", () => {
  const before = structuredClone(vault); const result = apply([{ type: "pause_course", data: { courseId: "course" } }, { type: "delete_lesson", data: { lessonId: vault.lessons[0].id, includeCompleted: true } }]);
  expect(result.ok).toBe(true); if (!result.ok) return;
  expect(result.vault.courseGroups[0].status).toBe("paused"); expect(result.vault.lessons).toEqual([]); expect(result.vault.deletedLessons![0]).toMatchObject({ lesson: before.lessons[0], source: "ai" }); expect(vault).toEqual(before);
});
it("keeps valid scheduling entries and reports duplicate or conflicting entries", () => {
  const result = apply([{ type: "schedule_lessons", data: { courseId: "course", lessons: [{ date: "2026-11-06", startTime: "10:00", endTime: "12:00" }, { date: "2026-11-09", startTime: "14:00", endTime: "16:00" }] } }]);
  expect(result.ok).toBe(true); if (!result.ok) return; expect(result.vault.lessons).toHaveLength(2); expect(result.message).toContain("已存在");
});
