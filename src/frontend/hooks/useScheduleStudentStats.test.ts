// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Lesson, TeacherVault } from "@/shared/types";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { useScheduleStudentStats } from "./useScheduleStudentStats";

let container: HTMLDivElement;
let root: Root;
let vault: TeacherVault;
let stats: ReturnType<typeof useScheduleStudentStats>;
function Harness() { stats = useScheduleStudentStats(vault); return null; }
function render() { act(() => root.render(createElement(StrictMode, null, createElement(Harness)))); }
function lesson(id: string, patch: Partial<Lesson> = {}): Lesson {
  return { id, courseGroupId: "course", date: "2026-11-06", startTime: "10:00", endTime: "12:00", type: "small_class", status: "completed", expectedStudentIds: ["a", "b"], attendance: [{ studentId: "a", status: "attended" }, { studentId: "b", status: "attended" }], feeSnapshot: { amount: 100, hours: 2 }, content: { taught: "", homework: "", nextLessonReminder: "" }, ...patch };
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-07T12:00:00"));
  vault = createEmptyVault();
  vault.students = [{ id: "a", name: "Alice", status: "paused" }, { id: "b", name: "Bob", status: "transition" }];
  vault.courseGroups = [{ id: "course", name: "历史课程", subject: "数学", type: "small_class", status: "paused", studentIds: ["a", "b"], defaultCampusId: "east", feeRule: { mode: "fixed", fixedFee: 500 } }, { id: "outside", name: "范围外课程", subject: "语文", type: "small_class", status: "active", studentIds: ["a"], feeRule: { mode: "fixed", fixedFee: 500 } }];
  vault.lessons = [lesson("done"), lesson("scheduled", { status: "scheduled", feeSnapshot: { amount: 200, hours: 2 } }), lesson("cancelled", { status: "cancelled", feeSnapshot: { amount: 30, hours: 2 } }), lesson("external", { courseGroupId: "external", lessonSource: "substitute_class", substituteClass: { presentStudentCount: 3, subject: "英语", studentNamesText: "外部学生" }, expectedStudentIds: [], attendance: [], feeSnapshot: { amount: 90, hours: 2 } }), lesson("outside", { courseGroupId: "outside", date: "2026-10-01" })];
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); render();
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("counts historical students, external students and fee snapshots in the initial month scope", () => {
  const before = structuredClone(vault);
  expect(stats.values).toMatchObject({ dateStart: "2026-11-01", dateEnd: "2026-11-07", courseFilter: "all" });
  expect(stats.lessonCount).toBe(4);
  expect(stats.studentLessonCount).toBe(9);
  expect(stats.involvedStudentCount).toBe(5);
  expect(stats.scheduledFeeTotal).toBe(420);
  expect(stats.completedFeeTotal).toBe(190);
  expect(stats.statusCounts).toMatchObject({ completed: 2, scheduled: 1, cancelled: 1 });
  expect(stats.courseGroupOptions.map(course => course.id)).toEqual(["course"]);
  expect(vault).toEqual(before);
});
it("combines student, type, subject, campus, status and time filters", () => {
  act(() => { stats.setNameFilter("  ALICE  "); stats.setCourseTypeFilter("small_class"); stats.setSubjectFilter("数学"); stats.setCampusFilter("east"); stats.setStatusFilter("completed"); stats.setStartTime("10:00"); stats.setEndTime("12:00"); });
  expect(stats.lessonCount).toBe(1);
  expect(stats.studentLessonCount).toBe(1);
  expect(stats.involvedStudentCount).toBe(1);
  expect(stats.scheduledFeeTotal).toBe(100);
  act(() => stats.setStartTime("13:00"));
  expect(stats.lessonCount).toBe(0);
});
it("resets a course that leaves the date scope without clearing other filters or group expansion", () => {
  act(() => { stats.setCourseFilter("course"); stats.setNameFilter("Alice"); stats.onToggleGroup("lesson-done"); });
  act(() => { stats.setDateStart("2026-10-01"); stats.setDateEnd("2026-10-31"); });
  expect(stats.values.courseFilter).toBe("all");
  expect(stats.values.nameFilter).toBe("Alice");
  expect(stats.expandedGroupIds).toEqual(["lesson-done"]);
  expect(stats.courseGroupOptions.map(course => course.id)).toEqual(["outside"]);
  expect(stats.lessonCount).toBe(1);
});
it("refreshes counts after vault updates and preserves filters and selected groups", () => {
  act(() => { stats.setStatusFilter("completed"); stats.onToggleGroup("lesson-done"); });
  vault = { ...vault, lessons: [...vault.lessons, lesson("new", { feeSnapshot: { amount: 75, hours: 2 } })] };
  render();
  expect(stats.completedFeeTotal).toBe(265);
  expect(stats.lessonCount).toBe(3);
  expect(stats.values.statusFilter).toBe("completed");
  expect(stats.expandedGroupIds).toEqual(["lesson-done"]);
  act(() => stats.onToggleGroup("lesson-done"));
  expect(stats.expandedGroupIds).toEqual([]);
});
