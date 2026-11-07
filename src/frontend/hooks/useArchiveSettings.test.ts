// @vitest-environment happy-dom
import { act, createElement, StrictMode, type FormEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Campus, CourseGroup, Lesson, Student, TeacherVault } from "@/shared/types";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { useArchiveSettings } from "./useArchiveSettings";

let container: HTMLDivElement;
let root: Root;
let vault: TeacherVault;
let settings: ReturnType<typeof useArchiveSettings>;
const onAddCampus = vi.fn<(campus: Campus) => void>();
const onAddSubject = vi.fn<(subject: string) => void>();
const onUpdateSubject = vi.fn<(previous: string, next: string) => void>();
const onAddGrade = vi.fn<(grade: string) => void>();
const onUpdateGrade = vi.fn<(previous: string, next: string) => void>();
function Harness() {
  settings = useArchiveSettings({ vault, onAddCampus, onAddSubject, onUpdateSubject, onAddGrade, onUpdateGrade });
  return null;
}
function render() { act(() => root.render(createElement(StrictMode, null, createElement(Harness)))); }
function student(id: string, patch: Partial<Student> = {}): Student {
  return { id, name: id, status: "active", ...patch };
}
function course(patch: Partial<CourseGroup> = {}): CourseGroup {
  return { id: "course", name: "课程", type: "small_class", subject: "数学", studentIds: [], status: "active", feeRule: { mode: "fixed", fixedFee: 100 }, ...patch };
}
function lesson(patch: Partial<Lesson> = {}): Lesson {
  return { id: "lesson", date: "2026-11-07", startTime: "10:00", endTime: "12:00", courseGroupId: "course", type: "small_class", status: "completed", expectedStudentIds: [], attendance: [], feeSnapshot: { amount: 100, hours: 2 }, content: { taught: "历史", homework: "", nextLessonReminder: "" }, ...patch };
}
function submitCampus() {
  const preventDefault = vi.fn();
  act(() => settings.panelProps.onAddCampus({ preventDefault } as unknown as FormEvent));
  expect(preventDefault).toHaveBeenCalledOnce();
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  vault = createEmptyVault();
  vault.preferences = { ...vault.preferences!, subjects: ["语文", "数学"], grades: ["初一", "初二"] };
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

describe("archive setting options and references", () => {
  it("keeps configured grade order, trims blanks and appends student grades across every status", () => {
    vault.preferences!.grades = [" 初二 ", "", "初一", "初二"];
    vault.students = [student("a", { grade: " 高一 ", status: "paused" }), student("b", { grade: "初一" }), student("c", { grade: "高二", status: "transition" }), student("d", { grade: " " })];
    const before = structuredClone(vault);
    render();
    expect(settings.configuredGradeOptions).toEqual(["初二", "初一", "高一", "高二"]);
    expect(settings.panelProps.gradeOptions).toEqual(settings.configuredGradeOptions);
    expect(vault).toEqual(before);
  });

  it("uses defaults for missing grade preferences but respects an explicitly empty list", () => {
    vault = { ...vault, preferences: undefined, students: [student("a", { grade: "高一" })] };
    render();
    expect(settings.configuredGradeOptions).toEqual(["初一", "初二", "初三", "高一"]);
    vault = { ...vault, preferences: { weekStartsOn: 0, grades: [] } };
    render();
    expect(settings.configuredGradeOptions).toEqual(["高一"]);
    vault = { ...vault, students: [] };
    render();
    expect(settings.configuredGradeOptions).toEqual([]);
  });

  it("combines subjects from preferences, paused courses and substitute lessons, with the original fallback", () => {
    vault = { ...vault, preferences: { weekStartsOn: 0, subjects: [" Z ", "", "A"] }, courseGroups: [course({ subject: " A ", status: "paused" })], lessons: [lesson({ substituteClass: { subject: " B ", presentStudentCount: 1 } })] };
    render();
    expect(settings.subjectOptions).toEqual(["A", "B", "Z"]);
    expect(settings.panelProps.subjectInUse("B")).toBe(false);
    vault = { ...vault, preferences: undefined, courseGroups: [], lessons: [] };
    render();
    expect(settings.subjectOptions).toEqual(["语文"]);
  });

  it("protects campuses referenced by any student, course or lesson regardless of status", () => {
    vault = { ...vault, students: [student("a", { defaultCampusId: "student", grade: "初一", status: "paused" }), student("b", { defaultCampusId: "transition", status: "transition" })], courseGroups: [course({ defaultCampusId: "course", status: "paused" })], lessons: [lesson({ campusId: "lesson", status: "cancelled" })] };
    render();
    for (const id of ["student", "transition", "course", "lesson"]) expect(settings.panelProps.campusInUse(id)).toBe(true);
    expect(settings.panelProps.campusInUse("unused")).toBe(false);
    expect(settings.panelProps.subjectInUse("数学")).toBe(true);
    expect(settings.panelProps.gradeInUse("初一")).toBe(true);
  });

  it("retains exact reference comparisons and does not add protection for profile, rules or deleted lessons", () => {
    vault = { ...vault, profile: { ...vault.profile, homeCampusId: "home", obligationCampusId: "obligation" }, students: [student("a", { grade: " 初一 " })], courseGroups: [course({ subject: " 数学 " })], scheduleRules: [{ id: "rule", courseGroupId: "course", weekday: 1, startTime: "10:00", endTime: "12:00", campusId: "rule", effectiveFrom: "2026-11-01", enabled: true }], deletedLessons: [{ id: "deleted", lesson: lesson({ campusId: "deleted" }), deletedAt: "2026-11-07", source: "manual" }] };
    render();
    for (const id of ["home", "obligation", "rule", "deleted"]) expect(settings.panelProps.campusInUse(id)).toBe(false);
    expect(settings.panelProps.gradeInUse(" 初一 ")).toBe(true);
    expect(settings.panelProps.gradeInUse("初一")).toBe(false);
    expect(settings.panelProps.subjectInUse(" 数学 ")).toBe(true);
    expect(settings.panelProps.subjectInUse("数学")).toBe(false);
  });

  it("refreshes options and protection after reference updates while retaining drafts and external grade feedback", () => {
    act(() => {
      settings.panelProps.setCampusNameInput("未提交校区");
      settings.panelProps.onStartEditGrade("初一");
      settings.panelProps.setEditingGradeInput("未提交年级");
      settings.setGradeMessage("升年级反馈");
    });
    vault = { ...vault, students: [student("a", { grade: "高三", defaultCampusId: "new" })], courseGroups: [course({ subject: "物理" })], lessons: [lesson({ campusId: "history" })] };
    render();
    expect(settings.panelProps.campusInUse("new")).toBe(true);
    expect(settings.panelProps.campusInUse("history")).toBe(true);
    expect(settings.panelProps.subjectInUse("物理")).toBe(true);
    expect(settings.panelProps.gradeInUse("高三")).toBe(true);
    expect(settings.configuredGradeOptions).toContain("高三");
    expect(settings.subjectOptions).toContain("物理");
    expect(settings.panelProps).toMatchObject({ campusNameInput: "未提交校区", editingGrade: "初一", editingGradeInput: "未提交年级", gradeMessage: "升年级反馈" });
    vault = { ...vault, students: [], courseGroups: [], lessons: [] };
    render();
    expect(settings.panelProps.campusInUse("new")).toBe(false);
    expect(settings.panelProps.campusInUse("history")).toBe(false);
    expect(settings.panelProps.subjectInUse("物理")).toBe(false);
    expect(settings.panelProps.gradeInUse("高三")).toBe(false);
    expect(settings.subjectOptions).not.toContain("物理");
    expect(settings.configuredGradeOptions).not.toContain("高三");
  });
});

describe("campus creation", () => {
  it("prevents form submission, ignores blank names and retains the other fields", () => {
    act(() => { settings.panelProps.setCampusNameInput("  "); settings.panelProps.setCampusAddressInput("地址"); });
    submitCampus();
    expect(onAddCampus).not.toHaveBeenCalled();
    expect(settings.panelProps.campusAddressInput).toBe("地址");
  });
  it("trims all creation fields, allows existing names and clears only after success", () => {
    vault.campuses = [{ id: "old", name: "东校区" }];
    render();
    act(() => { settings.panelProps.setCampusNameInput(" 东校区 "); settings.panelProps.setCampusAddressInput(" 地址 "); settings.panelProps.setCampusNoteInput(" 备注 "); });
    submitCampus();
    expect(onAddCampus).toHaveBeenCalledExactlyOnceWith({ id: expect.stringMatching(/^campus_/), name: "东校区", address: "地址", note: "备注" });
    expect(settings.panelProps).toMatchObject({ campusNameInput: "", campusAddressInput: "", campusNoteInput: "" });
    expect(vault.campuses).toEqual([{ id: "old", name: "东校区" }]);
  });
  it("omits empty optional fields", () => {
    act(() => { settings.panelProps.setCampusNameInput("校区"); settings.panelProps.setCampusAddressInput("  "); settings.panelProps.setCampusNoteInput(" 	 "); });
    submitCampus();
    expect(onAddCampus.mock.lastCall![0]).toMatchObject({ name: "校区", address: undefined, note: undefined });
  });
  it("preserves the full draft if the persistence callback throws", () => {
    onAddCampus.mockImplementation(() => { throw new Error("save failed"); });
    act(() => { settings.panelProps.setCampusNameInput(" 校区 "); settings.panelProps.setCampusAddressInput(" 地址 "); settings.panelProps.setCampusNoteInput(" 备注 "); });
    expect(submitCampus).toThrow("save failed");
    expect(settings.panelProps).toMatchObject({ campusNameInput: " 校区 ", campusAddressInput: " 地址 ", campusNoteInput: " 备注 " });
  });
});

for (const kind of ["subject", "grade"] as const) {
  describe(kind + " editing", () => {
    const isSubject = kind === "subject";
    const original = isSubject ? "语文" : "初一";
    const duplicate = isSubject ? "数学" : "初二";
    const next = isSubject ? "英语" : "高一";
    const duplicateMessage = "已存在" + (isSubject ? "科目" : "年级") + "「" + duplicate + "」。";
    const addCallback = isSubject ? onAddSubject : onAddGrade;
    const updateCallback = isSubject ? onUpdateSubject : onUpdateGrade;
    function fields() {
      const p = settings.panelProps;
      return isSubject
        ? { input: p.subjectInput, setInput: p.setSubjectInput, add: p.onAddSubject, editing: p.editingSubject, editInput: p.editingSubjectInput, setEditInput: p.setEditingSubjectInput, start: p.onStartEditSubject, cancel: p.onCancelEditSubject, save: p.onSaveSubject, message: p.subjectMessage }
        : { input: p.gradeInput, setInput: p.setGradeInput, add: p.onAddGrade, editing: p.editingGrade, editInput: p.editingGradeInput, setEditInput: p.setEditingGradeInput, start: p.onStartEditGrade, cancel: p.onCancelEditGrade, save: p.onSaveGrade, message: p.gradeMessage };
    }
    it("ignores blank creation and detects duplicates without clearing the draft", () => {
      act(() => fields().setInput("  "));
      act(() => fields().add());
      expect(addCallback).not.toHaveBeenCalled();
      act(() => fields().setInput(" " + duplicate + " "));
      act(() => fields().add());
      expect(addCallback).not.toHaveBeenCalled();
      expect(fields()).toMatchObject({ input: " " + duplicate + " ", message: duplicateMessage });
    });
    it("trims a successful addition and clears the draft and prior message", () => {
      act(() => fields().setInput(duplicate));
      act(() => fields().add());
      act(() => fields().setInput(" " + next + " "));
      act(() => fields().add());
      expect(addCallback).toHaveBeenCalledExactlyOnceWith(next);
      expect(fields()).toMatchObject({ input: "", message: "" });
    });
    it("retains both draft and message if addition fails", () => {
      act(() => fields().setInput(duplicate));
      act(() => fields().add());
      act(() => fields().setInput(next));
      addCallback.mockImplementation(() => { throw new Error("add failed"); });
      expect(() => act(() => fields().add())).toThrow("add failed");
      expect(fields()).toMatchObject({ input: next, message: duplicateMessage });
    });
    it("requires an editing key and nonblank name, and cancels duplicate edits without persistence", () => {
      act(() => fields().setEditInput(next));
      act(() => fields().save());
      expect(updateCallback).not.toHaveBeenCalled();
      act(() => fields().start(original));
      expect(fields()).toMatchObject({ editing: original, editInput: original, message: "" });
      act(() => fields().setEditInput("  "));
      act(() => fields().save());
      expect(updateCallback).not.toHaveBeenCalled();
      act(() => fields().setEditInput(" " + duplicate + " "));
      act(() => fields().save());
      expect(updateCallback).not.toHaveBeenCalled();
      expect(fields()).toMatchObject({ editing: original, editInput: " " + duplicate + " ", message: duplicateMessage });
      act(() => fields().cancel());
      expect(fields()).toMatchObject({ editing: "", editInput: "", message: "" });
    });
    it("sends a trimmed rename and closes the editor after success", () => {
      act(() => fields().start(original));
      act(() => fields().setEditInput(" " + next + " "));
      act(() => fields().save());
      expect(updateCallback).toHaveBeenCalledExactlyOnceWith(original, next);
      expect(fields()).toMatchObject({ editing: "", editInput: "", message: "" });
    });
    it("still invokes the callback when the trimmed name is unchanged", () => {
      act(() => fields().start(original));
      act(() => fields().setEditInput(" " + original + " "));
      act(() => fields().save());
      expect(updateCallback).toHaveBeenCalledExactlyOnceWith(original, original);
      expect(fields().editing).toBe("");
    });
    it("preserves the editor and message if rename fails, then clears the message on a new edit", () => {
      act(() => fields().start(original));
      act(() => fields().setEditInput(duplicate));
      act(() => fields().save());
      act(() => fields().setEditInput(next));
      updateCallback.mockImplementation(() => { throw new Error("rename failed"); });
      expect(() => act(() => fields().save())).toThrow("rename failed");
      expect(fields()).toMatchObject({ editing: original, editInput: next, message: duplicateMessage });
      act(() => fields().start(duplicate));
      expect(fields()).toMatchObject({ editing: duplicate, editInput: duplicate, message: "" });
    });
  });
}
