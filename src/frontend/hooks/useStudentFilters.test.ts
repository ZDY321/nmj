// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseGroup, Student, TeacherVault } from "@/shared/types";
import { buildStudentCourseIndex } from "@/frontend/lib/studentCourseIndex";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { useStudentFilters } from "./useStudentFilters";

let container: HTMLDivElement;
let root: Root;
let vault: TeacherVault;
let filters: ReturnType<typeof useStudentFilters>;
function Harness() {
  filters = useStudentFilters({ vault, coursesByStudentId: buildStudentCourseIndex(vault).coursesByStudentId });
  return null;
}
function render() {
  act(() => root.render(createElement(StrictMode, null, createElement(Harness))));
}
function visibleIds() { return filters.visibleStudents.map(student => student.id); }
function student(id: string, name: string, patch: Partial<Student> = {}): Student {
  return { id, name, grade: "初一", defaultCampusId: "east", status: "active", ...patch };
}
function course(id: string, studentIds: string[], patch: Partial<CourseGroup> = {}): CourseGroup {
  return { id, name: "课程专属关键词", studentIds, subject: "数学", type: "small_class", status: "active", feeRule: { mode: "fixed", fixedFee: 100 }, ...patch };
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vault = createEmptyVault();
  vault.students = [
    student("z", "Alice Zhang", { school: "East School", note: "复习重点" }),
    student("bob", "Bob", { grade: "初二", defaultCampusId: "west", temporaryTrial: true }),
    student("chris", "Chris", { grade: undefined, status: "transition" }),
    student("dora", "Dora", { grade: "", defaultCampusId: "west", status: "paused" }),
    student("a", "Alice Zhang", { grade: undefined })
  ];
  vault.courseGroups = [
    course("paused", ["z", "z"], { type: "one_on_one", status: "paused" }),
    course("english", ["z"], { type: "trial", subject: "英语" }),
    course("chinese", ["bob"], { subject: "语文" }),
    course("transition", ["chris"], { subject: "英语" })
  ];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  render();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("student list filters", () => {
  it("defaults to active students, sorts tied names by id and leaves source order unchanged", () => {
    const before = structuredClone(vault);
    expect(visibleIds()).toEqual(["a", "z", "bob"]);
    expect(filters).toMatchObject({ studentStatusFilter: "active", gradeFilter: "all", studentCampusFilter: "all", studentTrialFilter: "all", studentCourseTypeFilter: "all", studentSubjectFilter: "all", archiveSearch: "" });
    expect(vault).toEqual(before);
  });

  it.each([["transition", ["chris"]], ["archived", ["dora"]], ["all", ["a", "z", "bob", "chris", "dora"]]] as const)("maps %s to the original status scope", (status, expected) => {
    act(() => filters.setStudentStatusFilter(status));
    expect(visibleIds()).toEqual(expected);
  });

  it("combines trial, campus and grade filters, including missing grades", () => {
    act(() => {
      filters.setStudentTrialFilter("trial");
      filters.setStudentCampusFilter("west");
      filters.setGradeFilter("初二");
    });
    expect(visibleIds()).toEqual(["bob"]);
    act(() => filters.setStudentTrialFilter("regular"));
    expect(visibleIds()).toEqual([]);
    act(() => {
      filters.setStudentStatusFilter("all");
      filters.setStudentCampusFilter("all");
      filters.setGradeFilter("__unset");
    });
    expect(visibleIds()).toEqual(["a", "chris", "dora"]);
  });

  it("matches type and subject independently across courses, including archived course memberships", () => {
    act(() => {
      filters.setStudentCourseTypeFilter("one_on_one");
      filters.setStudentSubjectFilter("英语");
    });
    expect(visibleIds()).toEqual(["z"]);
    act(() => filters.setStudentSubjectFilter("语文"));
    expect(visibleIds()).toEqual([]);
    act(() => {
      filters.setStudentCourseTypeFilter("small_class");
      filters.setStudentStatusFilter("all");
      filters.setStudentSubjectFilter("英语");
    });
    expect(visibleIds()).toEqual(["chris"]);
  });

  it.each([["  aLiCe zHaNg  ", ["a", "z"]], ["EAST SCHOOL", ["z"]], ["复习重点", ["z"]], ["课程专属关键词", []], ["初一", []], ["Alice  Zhang", []], [" \t ", ["a", "z", "bob"]]] as const)("preserves literal name/school/note search semantics for %j", (query, expected) => {
    act(() => filters.setArchiveSearch(query));
    expect(visibleIds()).toEqual(expected);
  });

  it("derives grade choices from all students and retains the empty-course unset-grade option", () => {
    vault = { ...vault, students: [student("a", "A", { grade: "初一" }), student("b", "B", { grade: "初三", status: "paused" }), student("c", "C", { grade: "初一" })], courseGroups: [course("empty", [])] };
    render();
    expect(filters.gradeFilterOptions).toHaveLength(2);
    expect(new Set(filters.gradeFilterOptions)).toEqual(new Set(["初一", "初三"]));
    expect(filters.hasUnsetGradeFilterOption).toBe(true);
    vault = { ...vault, courseGroups: [] };
    render();
    expect(filters.hasUnsetGradeFilterOption).toBe(false);
    act(() => filters.setStudentStatusFilter("archived"));
    expect(new Set(filters.gradeFilterOptions)).toEqual(new Set(["初一", "初三"]));
  });

  it("recomputes after archive changes while keeping filter inputs, including unavailable options", () => {
    act(() => {
      filters.setStudentCourseTypeFilter("trial");
      filters.setStudentSubjectFilter("英语");
      filters.setArchiveSearch("Alice");
    });
    expect(visibleIds()).toEqual(["z"]);
    vault = { ...vault, courseGroups: vault.courseGroups.filter(course => course.type !== "trial") };
    render();
    expect(visibleIds()).toEqual([]);
    expect(filters).toMatchObject({ studentCourseTypeFilter: "trial", studentSubjectFilter: "英语", archiveSearch: "Alice" });
    act(() => filters.setStudentCourseTypeFilter("all"));
    vault = { ...vault, courseGroups: [...vault.courseGroups, course("replacement", ["a"], { subject: "英语" })] };
    render();
    expect(visibleIds()).toEqual(["a"]);
    vault = { ...vault, students: vault.students.map(student => student.id === "a" ? { ...student, status: "paused" } : student) };
    render();
    expect(visibleIds()).toEqual([]);
    act(() => filters.setStudentStatusFilter("archived"));
    expect(visibleIds()).toEqual(["a"]);
  });
});
