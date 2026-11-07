// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseGroup, Lesson, Student, TeacherVault } from "@/shared/types";
import type { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { sortCoursesByName } from "@/frontend/lib/helpers";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { buildStudentCourseIndex } from "@/frontend/lib/studentCourseIndex";
import { useCourseArchive } from "./useCourseArchive";

let container: HTMLDivElement;
let root: Root;
let vault: TeacherVault;
let archive: ReturnType<typeof useCourseArchive>;
const confirm = vi.fn<ReturnType<typeof useConfirmDialog>["confirm"]>();
const onUpdateCourses = vi.fn<(courses: CourseGroup[]) => void>();
const onSyncCoursesToLessons = vi.fn<(ids: string[]) => void>();
function Harness() {
  archive = useCourseArchive({ vault, courseGroupOptions: sortCoursesByName(vault.courseGroups), studentCourseIndex: buildStudentCourseIndex(vault), confirm, onUpdateCourses, onSyncCoursesToLessons });
  return null;
}
function render() { act(() => root.render(createElement(StrictMode, null, createElement(Harness)))); }
function ids() { return archive.visibleCourses.map(course => course.id); }
function select(...courseIds: string[]) { act(() => courseIds.forEach(id => archive.onToggleCourseSelection(id))); }
function confirmLast() { act(() => confirm.mock.lastCall![0].onConfirm()); }
function student(id: string, name: string, patch: Partial<Student> = {}): Student {
  return { id, name, grade: "初一", status: "active", defaultCampusId: "east", ...patch };
}
function course(id: string, name: string, studentIds: string[], patch: Partial<CourseGroup> = {}): CourseGroup {
  return { id, name, studentIds, type: "small_class", subject: "数学", defaultCampusId: "east", status: "active", feeRule: { mode: "fixed", fixedFee: 100 }, ...patch };
}
function lesson(id: string, courseGroupId: string, patch: Partial<Lesson> = {}): Lesson {
  return { id, courseGroupId, type: "small_class", date: "2026-11-07", startTime: "10:00", endTime: "12:00", status: "scheduled", expectedStudentIds: ["a"], attendance: [], feeSnapshot: { amount: 80, hours: 2 }, content: { taught: "历史内容", homework: "", nextLessonReminder: "" }, ...patch };
}
function syncFixture() {
  vault = { ...vault, courseGroups: [course("first", "First", ["a"]), course("second", "Second", ["b"])], lessons: [
    lesson("today", "first"), lesson("draft", "first", { date: "2026-11-08", status: "draft" }),
    lesson("past", "first", { date: "2026-11-06" }), lesson("done", "first", { status: "completed" }),
    lesson("linked", "first", { linkedOriginalLessonId: "past" }), lesson("cancelled", "first", { status: "cancelled" }),
    lesson("other", "second"), lesson("orphan", "missing")
  ] };
  render();
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-07T12:00:00"));
  vault = createEmptyVault();
  vault.campuses = [{ id: "east", name: "东校区" }, { id: "west", name: "西校区" }];
  vault.preferences!.courseTypeLabels = { small_class: "集体课" };
  vault.students = [student("a", "Alice", { school: "East School", note: "复习重点" }), student("b", "Bob", { grade: "初二", defaultCampusId: "west" }), student("u", "Una", { grade: undefined }), student("t", "Transition", { status: "transition", grade: "初三" }), student("p", "Paused", { status: "paused", grade: "初三" }), student("d", "First duplicate", { status: "paused", grade: "初三" }), student("d", "Later duplicate", { grade: "高一" })];
  vault.courseGroups = [course("z-same", "Alpha", ["a"]), course("a-same", "Alpha", ["a", "b"], { subject: "语文" }), course("beta", "Beta", ["b"], { type: "one_on_one", subject: "英语", defaultCampusId: "west", note: "课程备注" }), course("ended", "Ended", ["a"], { status: "paused" }), course("empty", "Empty", []), course("mixed", "Mixed", ["a", "missing"]), course("unset", "No grade", ["u"], { defaultCampusId: undefined }), course("orphan", "Orphan", ["missing"]), course("paused-student", "Paused student", ["p"]), course("transition", "Transition", ["t"]), course("duplicate", "Duplicate", ["d"])];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  render();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("course archive filtering", () => {
  it("defaults to effectively active courses and keeps name/id ordering even when subjects differ", () => {
    const before = structuredClone(vault);
    expect(ids()).toEqual(["a-same", "z-same", "beta", "mixed", "unset"]);
    expect(archive.activeCourses).toBe(5);
    expect(archive).toMatchObject({ courseSearch: "", courseStatusFilter: "active", courseTypeFilter: "all", courseGradeFilter: "all", courseSubjectFilter: "all", courseCampusFilter: "all", courseArchiveMessage: "", selectedCourseIds: [] });
    expect(vault).toEqual(before);
  });

  it("treats empty, missing, transition-only and archived-only rosters as effectively paused", () => {
    act(() => archive.setCourseStatusFilter("paused"));
    expect(ids()).toEqual(["duplicate", "empty", "ended", "orphan", "paused-student", "transition"]);
    act(() => archive.setCourseStatusFilter("all"));
    expect(ids()).toHaveLength(11);
    expect(archive.activeCourses).toBe(5);
  });

  it("combines type, grade, subject and campus, including grades of other course members", () => {
    act(() => { archive.setCourseTypeFilter("small_class"); archive.setCourseGradeFilter("初二"); archive.setCourseSubjectFilter("语文"); archive.setCourseCampusFilter("east"); });
    expect(ids()).toEqual(["a-same"]);
    act(() => archive.setCourseCampusFilter("west"));
    expect(ids()).toEqual([]);
    act(() => { archive.setCourseCampusFilter("all"); archive.setCourseSubjectFilter("all"); archive.setCourseTypeFilter("one_on_one"); });
    expect(ids()).toEqual(["beta"]);
  });

  it("derives grade options from all course members using the first student with a duplicate id", () => {
    expect(archive.gradeFilterOptions).toEqual(["初二", "初三", "初一"]);
    expect(archive.gradeFilterOptions).not.toContain("高一");
    expect(archive.hasUnsetGradeFilterOption).toBe(true);
    expect(archive.courseHasActiveStudent(vault.courseGroups.find(course => course.id === "duplicate")!)).toBe(false);
  });

  it("preserves the difference between missing references in grade choices and the unset filter", () => {
    vault = { ...vault, courseGroups: [course("mixed", "Mixed", ["a", "missing"])] };
    render();
    expect(archive.hasUnsetGradeFilterOption).toBe(true);
    act(() => archive.setCourseGradeFilter("__unset"));
    expect(ids()).toEqual([]);
    vault = { ...vault, courseGroups: [course("empty", "Empty", []), course("orphan", "Orphan", ["missing"]), course("unset", "Unset", ["u"])] };
    render();
    act(() => archive.setCourseStatusFilter("all"));
    expect(ids()).toEqual(["empty", "orphan", "unset"]);
  });

  it.each([
    ["  aLiCe   初一  ", ["a-same", "z-same", "mixed"]],
    ["英语 西校区", ["beta"]],
    ["课程 备注", ["beta"]],
    ["east SCHOOL 复习", ["a-same", "z-same", "mixed"]],
    ["未知学生", ["mixed"]],
    ["未设置校区", ["unset"]],
    ["Alice、Bob", ["a-same"]],
    ["集体课 数学", ["z-same", "mixed", "unset"]],
    ["  \t ", ["a-same", "z-same", "beta", "mixed", "unset"]]
  ])("searches all original fields and requires every keyword for %j", (query, expected) => {
    act(() => archive.setCourseSearch(query as string));
    expect(ids()).toEqual(expected);
  });

  it("keeps filters and hidden selections when options or unrelated archive fields change", () => {
    select("a-same", "beta");
    act(() => { archive.setCourseTypeFilter("one_on_one"); archive.setCourseCampusFilter("west"); archive.setCourseSubjectFilter("英语"); archive.setCourseGradeFilter("初二"); archive.setCourseSearch("Bob"); });
    vault = { ...vault, courseGroups: vault.courseGroups.filter(course => course.id !== "beta"), profile: { ...vault.profile, note: "新备注" } };
    render();
    expect(ids()).toEqual([]);
    expect(archive).toMatchObject({ courseTypeFilter: "one_on_one", courseCampusFilter: "west", courseSubjectFilter: "英语", courseGradeFilter: "初二", courseSearch: "Bob", selectedCourseIds: ["a-same", "beta"] });
  });

  it("refreshes effective activity and grade choices when student data changes", () => {
    vault = { ...vault, students: vault.students.map(student => student.id === "a" ? { ...student, status: "paused", grade: "高二" } : student) };
    render();
    expect(ids()).toEqual(["a-same", "beta", "unset"]);
    expect(archive.activeCourses).toBe(3);
    expect(archive.gradeFilterOptions).toContain("高二");
  });
});

describe("course selection and batch status", () => {
  it("selects each visible id once and retains hidden choices when deselecting the visible scope", () => {
    select("ended");
    act(() => archive.setCourseSearch("Alpha"));
    act(() => archive.onToggleVisibleCourseSelection(true));
    act(() => archive.onToggleVisibleCourseSelection(true));
    expect(archive.selectedCourseIds).toEqual(["ended", "a-same", "z-same"]);
    act(() => archive.setCourseSubjectFilter("语文"));
    act(() => archive.onToggleVisibleCourseSelection(false));
    expect(archive.selectedCourseIds).toEqual(["ended", "z-same"]);
    select("z-same");
    expect(archive.selectedCourseIds).toEqual(["ended"]);
  });

  it("does nothing when no selected courses are visible", () => {
    select("ended");
    act(() => { archive.onUpdateSelectedCoursesStatus("paused"); archive.onUpdateSelectedCoursesStatus("active"); });
    expect(confirm).not.toHaveBeenCalled();
    expect(onUpdateCourses).not.toHaveBeenCalled();
    expect(archive.selectedCourseIds).toEqual(["ended"]);
  });

  it("requires confirmation to end visible selections and preserves hidden selections and snapshots", () => {
    select("a-same", "beta", "ended");
    act(() => archive.setCourseSearch("Alpha"));
    const before = structuredClone(vault);
    act(() => archive.onUpdateSelectedCoursesStatus("paused"));
    expect(confirm.mock.lastCall![0]).toMatchObject({ title: "将选中的 1 个课程设为结课？", confirmLabel: "结课", tone: "danger" });
    expect(onUpdateCourses).not.toHaveBeenCalled();
    expect(archive.selectedCourseIds).toEqual(["a-same", "beta", "ended"]);
    confirmLast();
    expect(onUpdateCourses).toHaveBeenCalledExactlyOnceWith([{ ...vault.courseGroups.find(course => course.id === "a-same")!, status: "paused" }]);
    expect(archive.selectedCourseIds).toEqual(["beta", "ended"]);
    expect(archive.courseArchiveMessage).toBe("结课完成：已处理 1 个课程档案。");
    expect(vault).toEqual(before);
  });

  it("enables visible selections immediately without confirming or changing the roster", () => {
    act(() => archive.setCourseStatusFilter("paused"));
    select("ended", "empty", "beta");
    act(() => archive.onUpdateSelectedCoursesStatus("active"));
    expect(confirm).not.toHaveBeenCalled();
    expect(onUpdateCourses).toHaveBeenCalledExactlyOnceWith(["empty", "ended"].map(id => ({ ...vault.courseGroups.find(course => course.id === id)!, status: "active" })));
    expect(archive.selectedCourseIds).toEqual(["beta"]);
    expect(archive.courseArchiveMessage).toBe("启用完成：已处理 2 个课程档案。");
  });

  it("uses the confirmed courses captured when the dialog opened, retaining later selections", () => {
    select("a-same");
    act(() => archive.onUpdateSelectedCoursesStatus("paused"));
    const original = vault.courseGroups.find(course => course.id === "a-same")!;
    select("beta");
    act(() => archive.setCourseSearch("Beta"));
    vault = { ...vault, courseGroups: vault.courseGroups.map(course => course.id === "a-same" ? { ...course, name: "后来改名" } : course) };
    render();
    confirmLast();
    expect(onUpdateCourses).toHaveBeenCalledExactlyOnceWith([{ ...original, status: "paused" }]);
    expect(archive.selectedCourseIds).toEqual(["beta"]);
  });

  it.each(["active", "paused"] as const)("keeps selection and message if the %s update callback throws", status => {
    select("a-same");
    onUpdateCourses.mockImplementation(() => { throw new Error("save failed"); });
    if (status === "paused") {
      act(() => archive.onUpdateSelectedCoursesStatus(status));
      expect(() => confirmLast()).toThrow("save failed");
    } else expect(() => act(() => archive.onUpdateSelectedCoursesStatus(status))).toThrow("save failed");
    expect(archive.selectedCourseIds).toEqual(["a-same"]);
    expect(archive.courseArchiveMessage).toBe("");
  });
});

describe("course sync and usage", () => {
  it("explains empty filters and no eligible future lessons without opening confirmation", () => {
    act(() => archive.setCourseSearch("不存在"));
    act(() => archive.onRequestSyncVisibleCourses());
    expect(archive.courseArchiveMessage).toBe("当前筛选下没有课程档案，不需要同步。");
    act(() => archive.setCourseSearch("Beta"));
    vault = { ...vault, lessons: [lesson("past", "beta", { date: "2026-11-06" })] };
    render();
    act(() => archive.onRequestSyncVisibleCourses());
    expect(archive.courseArchiveMessage).toBe("当前筛选下 1 个课程档案没有未来待上课课节，不需要同步。");
    expect(confirm).not.toHaveBeenCalled();
    expect(onSyncCoursesToLessons).not.toHaveBeenCalled();
  });

  it("syncs all visible courses, independent of selection, with the original future-only count", () => {
    syncFixture();
    select("first");
    const before = structuredClone(vault);
    act(() => archive.onRequestSyncVisibleCourses());
    expect(confirm.mock.lastCall![0]).toMatchObject({ title: "同步当前筛选课程？", confirmLabel: "同步刷新" });
    expect(confirm.mock.lastCall![0].description).toContain("2 个课程档案，刷新 3 节未来待上课课节");
    expect(onSyncCoursesToLessons).not.toHaveBeenCalled();
    confirmLast();
    expect(onSyncCoursesToLessons).toHaveBeenCalledExactlyOnceWith(["first", "second"]);
    expect(archive.courseArchiveMessage).toBe("同步完成：已刷新 2 个课程档案下的 3 节未来待上课课节。");
    expect(archive.selectedCourseIds).toEqual(["first"]);
    expect(vault).toEqual(before);
  });

  it("keeps the scope and displayed count from the sync confirmation when filters change", () => {
    syncFixture();
    act(() => archive.onRequestSyncVisibleCourses());
    act(() => archive.setCourseSearch("First"));
    vault = { ...vault, lessons: [] };
    render();
    confirmLast();
    expect(onSyncCoursesToLessons).toHaveBeenCalledExactlyOnceWith(["first", "second"]);
    expect(archive.courseArchiveMessage).toContain("2 个课程档案下的 3 节");
  });

  it("leaves the previous message intact when confirmed sync throws", () => {
    syncFixture();
    act(() => archive.setCourseSearch("不存在"));
    act(() => archive.onRequestSyncVisibleCourses());
    const message = archive.courseArchiveMessage;
    act(() => archive.setCourseSearch(""));
    act(() => archive.onRequestSyncVisibleCourses());
    onSyncCoursesToLessons.mockImplementation(() => { throw new Error("sync failed"); });
    expect(() => confirmLast()).toThrow("sync failed");
    expect(archive.courseArchiveMessage).toBe(message);
  });

  it("protects courses referenced by any current lesson, but keeps the original recycle-bin boundary", () => {
    vault = { ...vault, lessons: [lesson("cancelled", "beta", { status: "cancelled" }), lesson("historic", "ended", { status: "completed", date: "2020-01-01" })], deletedLessons: [{ id: "deleted", lesson: lesson("recycled", "empty"), deletedAt: "2026-11-07T00:00:00Z", source: "manual" }] };
    render();
    expect(archive.courseInUse("beta")).toBe(true);
    expect(archive.courseInUse("ended")).toBe(true);
    expect(archive.courseInUse("empty")).toBe(false);
    vault = { ...vault, lessons: [lesson("new-reference", "empty")] };
    render();
    expect(archive.courseInUse("beta")).toBe(false);
    expect(archive.courseInUse("empty")).toBe(true);
  });
});
