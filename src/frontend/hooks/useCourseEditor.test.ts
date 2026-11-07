// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseGroup, TeacherVault } from "@/shared/types";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { useCourseEditor } from "./useCourseEditor";

let container: HTMLDivElement;
let root: Root;
let vault: TeacherVault;
let editor: ReturnType<typeof useCourseEditor>;
const onUpdateCourse = vi.fn();
const onOpen = vi.fn();
const onFinish = vi.fn();
function Harness() {
  editor = useCourseEditor({ vault, onUpdateCourse, onOpen, onFinish });
  return null;
}
function course(patch: Partial<CourseGroup> = {}): CourseGroup {
  return { id: "course", name: "原课程", type: "small_class", subject: "数学", studentIds: ["a"], defaultCampusId: "original", feeRule: { mode: "salary_grade", salaryGradeSource: "specific", salaryGradeId: "custom_salary_test" }, status: "active", ...patch };
}
function changeFilters() {
  editor.setCourseStudentSearch("甲");
  editor.setCourseStudentScope("selected");
  editor.setCourseStudentGradeFilter("初三");
  editor.setCourseStudentCampusFilter("east");
}
function expectResetFilters() {
  expect([editor.courseStudentSearch, editor.courseStudentScope, editor.courseStudentGradeFilter, editor.courseStudentCampusFilter]).toEqual(["", "all", "all", "all"]);
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  vault = createEmptyVault();
  vault.students = [
    { id: "a", name: "甲", grade: "初三", status: "active", defaultCampusId: "east" },
    { id: "b", name: "乙", grade: "初三", status: "active", defaultCampusId: "west" },
    { id: "c", name: "丙", grade: "高一", status: "active" },
    { id: "paused", name: "归档", grade: "初三", status: "paused" },
    { id: "transition", name: "过渡", grade: "初三", status: "transition" }
  ];
  vault.preferences!.courseTypeFeeRules = { trial: { mode: "fixed", fixedFee: 60 } };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(createElement(StrictMode, null, createElement(Harness))));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("course editor workflow", () => {
  it("cancels an isolated draft without persisting or mutating the original", () => {
    const original = course();
    const before = structuredClone(original);
    act(() => editor.openCourseEditor(original));
    expect(onOpen).toHaveBeenCalledOnce();
    act(() => { editor.updateEditingCourse({ name: "草稿名称" }); editor.updateEditingCourseFee({ hourlyRate: 23 }); changeFilters(); });
    act(() => editor.cancelCourseDraft());
    expect(editor.editingCourse).toBeNull();
    expectResetFilters();
    expect(onUpdateCourse).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledExactlyOnceWith(original.id);
    expect(original).toEqual(before);
  });

  it("refuses blank names, then trims and normalizes a saved course", () => {
    const original = course({ studentIds: ["a", "c", "paused", "b"] });
    act(() => editor.openCourseEditor(original));
    act(() => { editor.updateEditingCourse({ name: "  ", subject: "  " }); changeFilters(); });
    act(() => editor.saveCourseDraft());
    expect(onUpdateCourse).not.toHaveBeenCalled();
    expect(editor.editingCourse).not.toBeNull();
    act(() => editor.updateEditingCourse({ name: "  修改课程  " }));
    act(() => editor.saveCourseDraft());
    expect(onUpdateCourse).toHaveBeenCalledExactlyOnceWith({ ...original, name: "修改课程", subject: "未设置", studentIds: ["a", "paused", "b"], defaultCampusId: "east" });
    expect(editor.editingCourse).toBeNull();
    expectResetFilters();
    expect(onFinish).toHaveBeenCalledExactlyOnceWith(original.id);
    expect(original.studentIds).toEqual(["a", "c", "paused", "b"]);
  });

  it("distinguishes switching editors from canceling and resets filters on the next open", () => {
    act(() => editor.openCourseEditor(course()));
    act(changeFilters);
    act(() => editor.dismissCourseEditor());
    expect(editor.editingCourse).toBeNull();
    expect(editor.courseStudentSearch).toBe("甲");
    expect(onFinish).not.toHaveBeenCalled();
    act(() => editor.openCourseEditor(course({ id: "next" })));
    expectResetFilters();
    expect(editor.editingCourse?.id).toBe("next");
  });

  it("keeps old paused/missing selections removable but accepts only active same-grade additions", () => {
    act(() => editor.openCourseEditor(course({ studentIds: ["a", "paused", "missing"] })));
    for (const id of ["transition", "c", "unknown"]) act(() => editor.toggleCourseStudent(id));
    expect(editor.editingCourse?.studentIds).toEqual(["a", "paused", "missing"]);
    for (const id of ["paused", "missing"]) act(() => editor.toggleCourseStudent(id));
    for (const id of ["paused", "missing"]) act(() => editor.toggleCourseStudent(id));
    expect(editor.editingCourse?.studentIds).toEqual(["a"]);
    act(() => editor.toggleCourseStudent("b"));
    expect(editor.editingCourse).toMatchObject({ studentIds: ["a", "b"], defaultCampusId: "west" });
    act(() => editor.toggleCourseStudent("b"));
    expect(editor.editingCourse?.defaultCampusId).toBe("west");
  });

  it("normalizes rosters on a type change and retains specific salary rules until switching to trial", () => {
    const original = course({ studentIds: ["a", "c", "b"] });
    act(() => editor.openCourseEditor(original));
    act(() => editor.changeEditingCourseType("one_on_two"));
    expect(editor.editingCourse).toMatchObject({ type: "one_on_two", studentIds: ["a", "b"], defaultCampusId: "east", feeRule: original.feeRule });
    act(() => editor.toggleCourseStudent("a"));
    act(() => editor.toggleCourseStudent("a"));
    act(() => editor.changeEditingCourseType("one_on_one"));
    expect(editor.editingCourse?.studentIds).toEqual(["b"]);
    act(() => editor.toggleCourseStudent("a"));
    expect(editor.editingCourse?.studentIds).toEqual(["b"]);
    act(() => editor.changeEditingCourseType("trial"));
    expect(editor.editingCourse?.feeRule).toEqual({ mode: "fixed", fixedFee: 60 });
  });

  it("rebuilds course-specific rates and normalizes the roster when changing the tier threshold", () => {
    const original = course({ type: "custom_group", studentIds: ["a", "c", "b"], feeRule: { mode: "class_headcount", makeupFeeMode: "custom", classFeeTiers: [{ id: "tier", minStudents: 1, baseFee: 90, perStudentFee: 10 }] } });
    act(() => editor.openCourseEditor(original));
    act(() => editor.updateClassFeeTier("tier", { minStudents: 2, baseFee: 120 }));
    expect(editor.editingCourse?.studentIds).toEqual(["a", "b"]);
    expect(editor.editingCourse?.feeRule).toMatchObject({ baseFee: 120, makeupFeeMode: "custom", stageRates: { junior_3: { oneOnOneFee: 0, classBaseFee: 120, headcountIncrementFee: 10 } } });
    expect(original.studentIds).toEqual(["a", "c", "b"]);
    expect(original.feeRule.classFeeTiers?.[0].baseFee).toBe(90);
  });

  it("uses the current vault and leaves the draft available if persistence throws", () => {
    act(() => editor.openCourseEditor(course()));
    vault = { ...vault, students: vault.students.map(student => student.id === "b" ? { ...student, status: "paused" as const } : student) };
    act(() => root.render(createElement(StrictMode, null, createElement(Harness))));
    act(() => editor.toggleCourseStudent("b"));
    expect(editor.editingCourse?.studentIds).toEqual(["a"]);
    onUpdateCourse.mockImplementationOnce(() => { throw new Error("save failed"); });
    expect(() => act(() => editor.saveCourseDraft())).toThrow("save failed");
    expect(editor.editingCourse).not.toBeNull();
    expect(onFinish).not.toHaveBeenCalled();
  });
});
