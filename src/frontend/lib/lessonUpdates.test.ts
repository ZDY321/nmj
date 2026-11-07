import { describe, expect, it } from "vitest";
import { applyLessonUpdates, cleanupResolvedMakeupLessons, recalculateLinkedMakeupLessonFeeSnapshots, syncOriginalLessonFromMakeupCompletion } from "./vaultMutations";
import { createEmptyVault } from "./sampleData";
import type { Lesson, TeacherVault } from "@/shared/types";

// Retain the old App algorithm as an equivalence oracle for order-sensitive makeup cases.
function previousApply(vault: TeacherVault, updates: Lesson[]) {
  const affected = new Set<string>();
  for (const lesson of updates) {
    const previous = vault.lessons.find(item => item.id === lesson.id);
    if (previous?.linkedOriginalLessonId) affected.add(previous.linkedOriginalLessonId);
    if (lesson.linkedOriginalLessonId) affected.add(lesson.linkedOriginalLessonId);
    if (!lesson.linkedOriginalLessonId) affected.add(lesson.id);
    cleanupResolvedMakeupLessons(vault, lesson);
    const next = syncOriginalLessonFromMakeupCompletion(vault, lesson);
    vault.lessons = vault.lessons.map(item => item.id === next.id ? next : item);
  }
  affected.forEach(id => recalculateLinkedMakeupLessonFeeSnapshots(vault, id));
}
function lesson(id: string, patch: Partial<Lesson> = {}): Lesson {
  return {
    id, courseGroupId: "course", date: "2026-11-06", startTime: "10:00", endTime: "12:00",
    type: "small_class", status: "completed", expectedStudentIds: ["a", "b"],
    attendance: [{ studentId: "a", status: "attended" }, { studentId: "b", status: "attended" }],
    feeSnapshot: { hours: 2, amount: 100 }, content: { taught: "", homework: "", nextLessonReminder: "" }, ...patch
  };
}
function fixture(lessons: Lesson[]) {
  const vault = createEmptyVault("tester");
  vault.students = [{ id: "a", name: "甲", status: "active" }, { id: "b", name: "乙", status: "active" }];
  vault.courseGroups = [{ id: "course", name: "测试班", type: "small_class", subject: "数学", status: "active", studentIds: ["a", "b"], feeRule: { mode: "fixed", fixedFee: 100 } }];
  vault.lessons = lessons;
  return vault;
}
function compare(vault: TeacherVault, updates: Lesson[]) {
  const expected = structuredClone(vault);
  const actual = structuredClone(vault);
  const expectedUpdates = structuredClone(updates);
  const actualUpdates = structuredClone(updates);
  previousApply(expected, expectedUpdates);
  applyLessonUpdates(actual, actualUpdates);
  expect(actual).toEqual(expected);
  expect(actualUpdates).toEqual(expectedUpdates);
  return actual;
}

describe("lesson update pipeline", () => {
  it("replaces ordinary batches once, preserving list order and last update for repeated IDs", () => {
    const vault = fixture([lesson("one"), lesson("two"), lesson("one"), lesson("three")]);
    const result = compare(vault, [lesson("two", { note: "first" }), lesson("missing"), lesson("two", { note: "last" })]);
    expect(result.lessons.map(item => item.id)).toEqual(["one", "two", "one", "three"]);
    expect(result.lessons[1].note).toBe("last");
  });
  it("keeps historical empty IDs and nullable links equivalent", () => {
    compare(fixture([lesson(""), lesson("linked", { linkedOriginalLessonId: "" }), lesson("nullable", { linkedOriginalLessonId: null })]), [lesson("", { note: "changed" }), lesson("nullable", { note: "changed" })]);
  });
  it("leaves empty batches untouched", () => {
    const vault = fixture([lesson("one")]);
    const original = vault.lessons;
    applyLessonUpdates(vault, []);
    expect(vault.lessons).toBe(original);
  });
  const original = lesson("original", { status: "makeup_pending", attendance: [{ studentId: "a", status: "absent" }, { studentId: "b", status: "makeup_pending" }] });
  const makeup = lesson("makeup", { status: "scheduled", linkedOriginalLessonId: "original", expectedStudentIds: ["a"], attendance: [{ studentId: "a", status: "attended" }] });
  const resolved = lesson("original", { status: "makeup_pending" });
  it.each([
    ["completion before original edit", [{ ...makeup, status: "completed" as const }, resolved]],
    ["original edit before completion", [resolved, { ...makeup, status: "completed" as const }]],
    ["repeated edits to one original", [resolved, original, resolved]],
    ["missing makeup still updates original", [{ ...makeup, id: "missing", status: "completed" as const }]],
    ["changing a makeup link", [{ ...makeup, linkedOriginalLessonId: "another", status: "completed" as const }]],
    ["removing a makeup link", [{ ...makeup, linkedOriginalLessonId: undefined }]]
  ])("matches sequential semantics for %s", (_name, updates) => {
    compare(fixture([structuredClone(original), structuredClone(makeup), lesson("another")]), updates);
  });
  it("preserves partial roster trimming, cancelled makeup and fee snapshots", () => {
    const vault = fixture([original, { ...makeup, expectedStudentIds: ["a", "b"], attendance: original.attendance }, { ...makeup, id: "cancelled", status: "cancelled" }]);
    const result = compare(vault, [{ ...original, attendance: [{ studentId: "a", status: "attended" }, { studentId: "b", status: "absent" }] }]);
    expect(result.lessons.find(item => item.id === "makeup")?.expectedStudentIds).toEqual(["b"]);
    expect(result.lessons.find(item => item.id === "cancelled")?.expectedStudentIds).toEqual(["a"]);
  });
  it("preserves resolved pending status even when there is no linked makeup", () => {
    const result = compare(fixture([original]), [structuredClone(resolved)]);
    expect(result.lessons[0].status).toBe("completed");
  });
});
