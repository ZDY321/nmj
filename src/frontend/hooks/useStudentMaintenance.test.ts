// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseGroup, Lesson, Student, TeacherVault } from "@/shared/types";
import type { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { useStudentMaintenance } from "./useStudentMaintenance";
import { useCourseEditor } from "./useCourseEditor";

let container: HTMLDivElement;
let root: Root;
let vault: TeacherVault;
let visibleStudents: Student[];
let configuredGradeOptions: string[];
let maintenance: ReturnType<typeof useStudentMaintenance>;
const confirm = vi.fn<ReturnType<typeof useConfirmDialog>["confirm"]>();
const onUpdateStudent = vi.fn<(student: Student) => void>();
const onUpdateStudents = vi.fn<(students: Student[]) => void>();
const onDeleteStudents = vi.fn<(ids: string[]) => void>();
const removeCourseDraftStudents = vi.fn<(ids: Iterable<string>) => void>();
const onOpenEditor = vi.fn();
const onHighlightStudent = vi.fn();
const onGradeMessage = vi.fn();
function options() {
  return { vault, visibleStudents, configuredGradeOptions, confirm, onUpdateStudent, onUpdateStudents, onDeleteStudents, removeCourseDraftStudents, onOpenEditor, onHighlightStudent, onGradeMessage };
}
function Harness() {
  maintenance = useStudentMaintenance(options());
  return null;
}
function render() {
  act(() => root.render(createElement(StrictMode, null, createElement(Harness))));
}
function student(id: string, patch: Partial<Student> = {}): Student {
  return { id, name: id, grade: "初一", status: "active", defaultCampusId: "east", ...patch };
}
function lesson(patch: Partial<Lesson>): Lesson {
  return { id: "lesson", date: "2026-11-07", startTime: "10:00", endTime: "12:00", courseGroupId: "course", type: "small_class", status: "completed", expectedStudentIds: [], attendance: [], feeSnapshot: { amount: 120, hours: 2 }, content: { taught: "", homework: "", nextLessonReminder: "" }, ...patch };
}
function select(...ids: string[]) {
  act(() => ids.forEach(id => maintenance.archiveProps.onToggleStudentSelection(id)));
}
function confirmLast() {
  act(() => confirm.mock.lastCall![0].onConfirm());
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  vault = createEmptyVault();
  vault.students = [student("a"), student("b", { grade: "初二" }), student("c", { grade: "初三", status: "paused" }), student("d", { grade: undefined, status: "paused" })];
  visibleStudents = vault.students;
  configuredGradeOptions = ["初一", "初二", "初三"];
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

describe("student editing", () => {
  it("cancels a separate draft without mutating the original, and distinguishes dismiss from cancel", () => {
    const original = vault.students[0];
    const before = structuredClone(original);
    act(() => maintenance.archiveProps.onOpenStudentEditor(original));
    expect(onOpenEditor).toHaveBeenCalledOnce();
    act(() => maintenance.editorProps.setEditingStudent(current => current && { ...current, name: "修改草稿", note: "临时" }));
    act(() => maintenance.editorProps.onCancel());
    expect(maintenance.editorProps.editingStudent).toBeNull();
    expect(original).toEqual(before);
    expect(onUpdateStudent).not.toHaveBeenCalled();
    expect(onHighlightStudent).toHaveBeenCalledExactlyOnceWith("a");
    act(() => maintenance.archiveProps.onOpenStudentEditor(original));
    act(() => maintenance.dismissStudentEditor());
    expect(maintenance.editorProps.editingStudent).toBeNull();
    expect(onHighlightStudent).toHaveBeenCalledOnce();
  });

  it("rejects empty names and trims only the fields the previous editor normalized", () => {
    act(() => maintenance.archiveProps.onOpenStudentEditor(vault.students[0]));
    act(() => maintenance.editorProps.setEditingStudent(current => current && { ...current, name: "  ", grade: "__custom__", school: " 学校 ", note: " 备注 " }));
    act(() => maintenance.editorProps.onSave());
    expect(onUpdateStudent).not.toHaveBeenCalled();
    expect(maintenance.editorProps.editingStudent).not.toBeNull();
    act(() => maintenance.editorProps.setEditingStudent(current => current && { ...current, name: "  学生甲  " }));
    act(() => maintenance.editorProps.onSave());
    expect(onUpdateStudent).toHaveBeenCalledExactlyOnceWith({ ...vault.students[0], name: "学生甲", grade: undefined, school: " 学校 ", note: " 备注 " });
    expect(maintenance.editorProps.editingStudent).toBeNull();
    expect(onHighlightStudent).toHaveBeenCalledExactlyOnceWith("a");
    expect(removeCourseDraftStudents).not.toHaveBeenCalled();
  });

  it.each(["active", "transition", "paused"] as const)("preserves course-draft removal policy when saving status %s", status => {
    act(() => maintenance.archiveProps.onOpenStudentEditor(student("a", { status })));
    act(() => maintenance.editorProps.onSave());
    expect(onUpdateStudent.mock.calls[0][0].status).toBe(status);
    if (status === "paused") {
      expect(removeCourseDraftStudents).toHaveBeenCalledExactlyOnceWith(["a"]);
      expect(removeCourseDraftStudents.mock.invocationCallOrder[0]).toBeLessThan(onUpdateStudent.mock.invocationCallOrder[0]);
    } else expect(removeCourseDraftStudents).not.toHaveBeenCalled();
  });

  it("keeps legacy grades in the draft while displaying only configured choices", () => {
    act(() => maintenance.archiveProps.onOpenStudentEditor(student("a", { grade: "旧年级" })));
    expect(maintenance.editorProps.gradeSelectValue("旧年级")).toBe("");
    expect(maintenance.editorProps.gradeSelectValue(undefined)).toBe("");
    expect(maintenance.editorProps.gradeSelectValue("初二")).toBe("初二");
    act(() => maintenance.editorProps.onSave());
    expect(onUpdateStudent.mock.calls[0][0].grade).toBe("旧年级");
  });

  it("retains the draft and does not highlight a successful save if persistence throws", () => {
    act(() => maintenance.archiveProps.onOpenStudentEditor(vault.students[0]));
    onUpdateStudent.mockImplementationOnce(() => { throw new Error("save failed"); });
    expect(() => act(() => maintenance.editorProps.onSave())).toThrow("save failed");
    expect(maintenance.editorProps.editingStudent).toEqual(vault.students[0]);
    expect(onHighlightStudent).not.toHaveBeenCalled();
  });

  it("keeps student and course editors mutually exclusive without treating a switch as cancel", () => {
    let courseEditor: ReturnType<typeof useCourseEditor>;
    function Editors() {
      courseEditor = useCourseEditor({ vault, onUpdateCourse: vi.fn(), onOpen: () => maintenance.dismissStudentEditor(), onFinish: vi.fn() });
      maintenance = useStudentMaintenance({ ...options(), onOpenEditor: () => courseEditor.dismissCourseEditor() });
      return null;
    }
    const course: CourseGroup = { id: "course", name: "课程", type: "one_on_one", subject: "数学", studentIds: ["a"], status: "active", feeRule: { mode: "fixed", fixedFee: 100 } };
    act(() => root.render(createElement(StrictMode, null, createElement(Editors))));
    act(() => courseEditor.openCourseEditor(course));
    act(() => courseEditor.setCourseStudentSearch("保留课程筛选"));
    act(() => maintenance.archiveProps.onOpenStudentEditor(vault.students[0]));
    expect(courseEditor!.editingCourse).toBeNull();
    expect(courseEditor!.courseStudentSearch).toBe("保留课程筛选");
    expect(maintenance.editorProps.editingStudent?.id).toBe("a");
    act(() => courseEditor.openCourseEditor(course));
    expect(maintenance.editorProps.editingStudent).toBeNull();
    expect(courseEditor!.editingCourse?.id).toBe("course");
    expect(onHighlightStudent).not.toHaveBeenCalled();
    expect(onUpdateStudent).not.toHaveBeenCalled();
  });
});

describe("student status and selection", () => {
  it("archives only after confirmation and keeps callback ordering", () => {
    const original = vault.students[0];
    const before = structuredClone(original);
    act(() => maintenance.archiveProps.onRequestArchiveStudent(original));
    expect(confirm.mock.calls[0][0]).toMatchObject({ title: "归档学生「a」？", confirmLabel: "归档", tone: "danger" });
    expect(onUpdateStudent).not.toHaveBeenCalled();
    expect(removeCourseDraftStudents).not.toHaveBeenCalled();
    confirmLast();
    expect(removeCourseDraftStudents).toHaveBeenCalledExactlyOnceWith(["a"]);
    expect(onUpdateStudent).toHaveBeenCalledExactlyOnceWith({ ...original, status: "paused" });
    expect(onHighlightStudent).toHaveBeenCalledExactlyOnceWith("a");
    expect(removeCourseDraftStudents.mock.invocationCallOrder[0]).toBeLessThan(onUpdateStudent.mock.invocationCallOrder[0]);
    expect(onUpdateStudent.mock.invocationCallOrder[0]).toBeLessThan(onHighlightStudent.mock.invocationCallOrder[0]);
    expect(original).toEqual(before);
  });

  it("skips unchanged row status, removes nonactive selections and restores without removal", () => {
    act(() => maintenance.archiveProps.onUpdateStudentStatus(vault.students[0], "active"));
    expect(onUpdateStudent).not.toHaveBeenCalled();
    act(() => maintenance.archiveProps.onUpdateStudentStatus(vault.students[0], "transition"));
    expect(removeCourseDraftStudents).toHaveBeenCalledExactlyOnceWith(["a"]);
    act(() => maintenance.archiveProps.onRestoreStudent(vault.students[2]));
    expect(onUpdateStudent.mock.lastCall?.[0]).toEqual({ ...vault.students[2], status: "active" });
    expect(removeCourseDraftStudents).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("selects or deselects only visible rows while retaining hidden selections", () => {
    select("a");
    visibleStudents = [vault.students[1], vault.students[2]];
    render();
    act(() => maintenance.archiveProps.onToggleVisibleStudentSelection(true));
    act(() => maintenance.archiveProps.onToggleVisibleStudentSelection(true));
    expect(maintenance.archiveProps.selectedStudentIds).toEqual(["a", "b", "c"]);
    act(() => maintenance.archiveProps.onToggleVisibleStudentSelection(false));
    expect(maintenance.archiveProps.selectedStudentIds).toEqual(["a"]);
    select("a");
    expect(maintenance.archiveProps.selectedStudentIds).toEqual([]);
  });

  it("changes only selected visible students, retaining selections that are hidden", () => {
    select("a", "b");
    visibleStudents = [vault.students[1], vault.students[2]];
    render();
    act(() => maintenance.archiveProps.onUpdateSelectedStudentsStatus("transition"));
    expect(onUpdateStudents).toHaveBeenCalledExactlyOnceWith([{ ...vault.students[1], status: "transition" }]);
    expect(Array.from(removeCourseDraftStudents.mock.calls[0][0])).toEqual(["b"]);
    expect(maintenance.archiveProps.selectedStudentIds).toEqual(["a"]);
    expect(confirm).not.toHaveBeenCalled();
    expect(onHighlightStudent).not.toHaveBeenCalled();
  });

  it("keeps a pending batch confirmation's selection and clears only affected IDs", () => {
    select("a", "b");
    visibleStudents = [vault.students[1]];
    render();
    act(() => maintenance.archiveProps.onUpdateSelectedStudentsStatus("paused"));
    expect(onUpdateStudents).not.toHaveBeenCalled();
    expect(maintenance.archiveProps.selectedStudentIds).toEqual(["a", "b"]);
    visibleStudents = [vault.students[0], vault.students[2]];
    render();
    select("c");
    confirmLast();
    expect(onUpdateStudents).toHaveBeenCalledExactlyOnceWith([{ ...vault.students[1], status: "paused" }]);
    expect(maintenance.archiveProps.selectedStudentIds).toEqual(["a", "c"]);
  });

  it("does not remove draft students on batch activation or clear selection when update fails", () => {
    select("c");
    onUpdateStudents.mockImplementationOnce(() => { throw new Error("update failed"); });
    expect(() => act(() => maintenance.archiveProps.onUpdateSelectedStudentsStatus("active"))).toThrow("update failed");
    expect(maintenance.archiveProps.selectedStudentIds).toEqual(["c"]);
    expect(removeCourseDraftStudents).not.toHaveBeenCalled();
    act(() => maintenance.archiveProps.onUpdateSelectedStudentsStatus("active"));
    expect(maintenance.archiveProps.selectedStudentIds).toEqual([]);
  });

  it("uses configured grade order and keeps terminal, unknown and hidden students selected", () => {
    configuredGradeOptions = ["初二", "初一", "初三"];
    visibleStudents = [vault.students[0], vault.students[2], vault.students[3]];
    render();
    select("a", "b", "c", "d");
    act(() => maintenance.archiveProps.onUpgradeSelectedStudents());
    expect(onUpdateStudents).toHaveBeenCalledExactlyOnceWith([{ ...vault.students[0], grade: "初三" }]);
    expect(maintenance.archiveProps.selectedStudentIds).toEqual(["b", "c", "d"]);
    expect(onGradeMessage).not.toHaveBeenCalled();
    act(() => maintenance.archiveProps.onUpgradeSelectedStudents());
    expect(onGradeMessage).toHaveBeenCalledExactlyOnceWith("选中的学生没有可提升的已配置年级，或已经是最后一个年级。");
    expect(onUpdateStudents).toHaveBeenCalledOnce();
  });

  it("does nothing when the selected students are outside the current filter", () => {
    select("a");
    visibleStudents = [];
    render();
    act(() => {
      maintenance.archiveProps.onUpdateSelectedStudentsStatus("paused");
      maintenance.archiveProps.onUpgradeSelectedStudents();
      maintenance.archiveProps.onDeleteSelectedArchivedStudents();
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(onUpdateStudents).not.toHaveBeenCalled();
    expect(onGradeMessage).not.toHaveBeenCalled();
    expect(onDeleteStudents).not.toHaveBeenCalled();
    expect(maintenance.archiveProps.selectedStudentIds).toEqual(["a"]);
  });
});

const referenceCases: Array<[string, (vault: TeacherVault) => void]> = [
  ["course roster", vault => { vault.courseGroups = [{ id: "course", name: "课程", type: "small_class", subject: "数学", studentIds: ["c"], feeRule: { mode: "fixed", fixedFee: 120 }, status: "paused" }]; }],
  ["expected attendance", vault => { vault.lessons = [lesson({ expectedStudentIds: ["c"] })]; }],
  ["actual attendance", vault => { vault.lessons = [lesson({ attendance: [{ studentId: "c", status: "absent" }] })]; }],
  ["makeup student", vault => { vault.lessons = [lesson({ makeupStudentId: "c" })]; }],
  ["progress record", vault => { vault.studentProgressRecords = [{ id: "progress", studentId: "c", courseGroupId: "course", lessonId: "lesson", date: "2026-11-07", progressText: "", homeworkText: "", nextPlan: "", progressStatus: "on_track", homeworkStatus: "unassigned", updatedAt: "2026-11-07T00:00:00.000Z" }]; }],
  ["checklist completion", vault => { vault.progressChecklistCompletions = [{ id: "completion", studentId: "c", courseGroupId: "course", templateId: "template", itemId: "item", completedDate: "2026-11-07", updatedAt: "2026-11-07T00:00:00.000Z" }]; }],
  ["grade record", vault => { vault.gradeRecords = [{ id: "grade", studentId: "c", subject: "数学", examName: "测验", date: "2026-11-07", score: 90 }]; }]
];

describe("archived student deletion protection", () => {
  it.each(referenceCases)("preserves a student referenced by %s and deletes only unused archived rows", (_label, addReference) => {
    addReference(vault);
    render();
    const before = structuredClone(vault);
    select("a", "c", "d");
    expect(maintenance.archiveProps.studentInUse("c")).toBe(true);
    expect(maintenance.archiveProps.studentInUse("d")).toBe(false);
    act(() => maintenance.archiveProps.onDeleteSelectedArchivedStudents());
    expect(confirm.mock.calls[0][0]).toMatchObject({ title: "删除选中的 1 个归档学生？", confirmLabel: "删除" });
    expect(confirm.mock.calls[0][0].description).toContain("另有 1 个学生已有历史记录");
    expect(onDeleteStudents).not.toHaveBeenCalled();
    confirmLast();
    expect(onDeleteStudents).toHaveBeenCalledExactlyOnceWith(["d"]);
    expect(maintenance.archiveProps.selectedStudentIds).toEqual(["a", "c"]);
    expect(vault).toEqual(before);
  });

  it("handles absent optional record collections and preserves hidden archived selections", () => {
    vault.studentProgressRecords = undefined;
    vault.progressChecklistCompletions = undefined;
    vault.gradeRecords = undefined;
    visibleStudents = [vault.students[2]];
    render();
    select("c", "d");
    act(() => maintenance.archiveProps.onDeleteSelectedArchivedStudents());
    expect(confirm.mock.calls[0][0].description).toBe("会永久删除这些没有历史引用的归档学生档案。");
    onDeleteStudents.mockImplementationOnce(() => { throw new Error("delete failed"); });
    expect(confirmLast).toThrow("delete failed");
    expect(maintenance.archiveProps.selectedStudentIds).toEqual(["c", "d"]);
    confirmLast();
    expect(onDeleteStudents.mock.lastCall?.[0]).toEqual(["c"]);
    expect(maintenance.archiveProps.selectedStudentIds).toEqual(["d"]);
  });

  it("does not open deletion confirmation when every selected archived student is referenced", () => {
    referenceCases[0][1](vault);
    render();
    select("a", "c");
    act(() => maintenance.archiveProps.onDeleteSelectedArchivedStudents());
    expect(confirm).not.toHaveBeenCalled();
    expect(onDeleteStudents).not.toHaveBeenCalled();
  });
});
