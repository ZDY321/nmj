// @vitest-environment happy-dom
import { act, createElement, StrictMode, type FormEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseGroup, CourseType, Student, StudentCourseTransition, TeacherVault } from "@/shared/types";
import { courseTypeOptionsForVault, sortCoursesByName } from "@/frontend/lib/helpers";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { useStudentCourseTransfer } from "./useStudentCourseTransfer";

let container: HTMLDivElement;
let root: Root;
let vault: TeacherVault;
let preferredCampusId: string;
let subjectOptions: string[];
let courseTypeOptions: Array<{ value: CourseType }>;
let form: ReturnType<typeof useStudentCourseTransfer>;
const onTransferStudentCourse = vi.fn<(transition: StudentCourseTransition) => void>();
function Harness() {
  form = useStudentCourseTransfer({ vault, preferredCampusId, subjectOptions, courseTypeOptions, courseGroupOptions: sortCoursesByName(vault.courseGroups), onTransferStudentCourse });
  return null;
}
function render() {
  act(() => root.render(createElement(StrictMode, null, createElement(Harness))));
}
function submit() {
  const preventDefault = vi.fn();
  act(() => form.onSubmit({ preventDefault } as unknown as FormEvent));
  expect(preventDefault).toHaveBeenCalledOnce();
}
function student(id: string, name: string, patch: Partial<Student> = {}): Student {
  return { id, name, grade: "初一", defaultCampusId: "east", status: "active", ...patch };
}
function course(id: string, studentIds: string[], patch: Partial<CourseGroup> = {}): CourseGroup {
  return { id, name: id, studentIds, type: "trial", subject: "数学", defaultCampusId: "east", feeRule: { mode: "fixed", fixedFee: 100 }, status: "active", ...patch };
}
function targets() { return form.transferTargetCourses.map(course => course.id); }

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  vault = createEmptyVault();
  vault.campuses = [{ id: "east", name: "东校区" }, { id: "west", name: "西校区" }];
  vault.profile.homeCampusId = "east";
  vault.profile.defaultSalaryGradeId = "custom_salary_teacher";
  vault.preferences!.courseTypeLabels = { trial: "体验课" };
  vault.preferences!.courseTypeFeeRules = { trial: { mode: "fixed", fixedFee: 60 } };
  vault.students = [student("b", "Bob"), student("c", "Chris", { grade: "初二" }), student("p", "Paused", { status: "paused" }), student("d", "Dora", { grade: undefined, status: "transition" }), student("a", "Alice", { defaultCampusId: "west" })];
  vault.courseGroups = [course("current-z", ["a", "b"], { type: "small_class", subject: "语文" }), course("current-a", ["a"], { type: "one_on_one" }), course("old", ["a"], { status: "paused" }), course("target-z", ["b"], { subject: "英语", defaultCampusId: "west" }), course("target-a", [])];
  preferredCampusId = "east";
  subjectOptions = ["语文", "数学", "英语"];
  courseTypeOptions = courseTypeOptionsForVault(vault);
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

describe("student transfer selections and draft", () => {
  it("includes transition students, excludes archived students and sorts without mutating the vault", () => {
    const before = structuredClone(vault);
    expect(form.activeStudentOptions.map(student => student.id)).toEqual(["a", "b", "c", "d"]);
    expect(form).toMatchObject({ transferPanelOpen: false, transferStudentId: "a", transferCourseType: "trial", transferTargetMode: "new", transferCampusInput: "west", transferSubjectInput: "语文", transferTargetCourseId: "target-a", transferEndExisting: false, transferMessage: "" });
    expect(form.transferCurrentCourses.map(course => course.id)).toEqual(["current-a", "current-z"]);
    expect(form.studentOptionLabel(vault.students.find(student => student.id === "d")!)).toBe("Dora · 未设置年级");
    expect(vault).toEqual(before);
  });

  it("keeps a valid selected student through reordering and falls back when archived or removed", () => {
    act(() => form.setTransferStudentId("d"));
    vault = { ...vault, students: vault.students.map(student => ({ ...student, name: student.id === "d" ? "Aaron" : student.name })) };
    render();
    expect(form.transferStudentId).toBe("d");
    vault = { ...vault, students: vault.students.map(student => student.id === "d" ? { ...student, status: "paused" } : student) };
    render();
    expect(form.transferStudentId).toBe("a");
    vault = { ...vault, students: vault.students.filter(student => student.id !== "a") };
    render();
    expect(form.transferStudentId).toBe("b");
    vault = { ...vault, students: vault.students.filter(student => student.status === "paused") };
    render();
    expect(form.transferStudentId).toBe("");
    expect(form.transferStudent).toBeUndefined();
    expect(form.transferCurrentCourses).toEqual([]);
    expect(targets()).toEqual([]);
    submit();
    expect(onTransferStudentCourse).not.toHaveBeenCalled();
  });

  it("preserves manually chosen campus through unrelated edits but follows student and campus identities", () => {
    act(() => form.setTransferCampusInput("east"));
    vault = { ...vault, students: vault.students.map(student => student.id === "a" ? { ...student, defaultCampusId: "east" } : student), campuses: vault.campuses.map(campus => ({ ...campus, name: campus.name + "新名" })) };
    render();
    act(() => form.setTransferCampusInput("west"));
    render();
    expect(form.transferCampusInput).toBe("west");
    vault = { ...vault, profile: { ...vault.profile, homeCampusId: "west" } };
    preferredCampusId = "west";
    render();
    expect(form.transferCampusInput).toBe("east");
    act(() => form.setTransferCampusInput("west"));
    vault = { ...vault, campuses: [...vault.campuses, { id: "north", name: "北校区" }] };
    render();
    expect(form.transferCampusInput).toBe("east");
    act(() => form.setTransferStudentId("d"));
    expect(form.transferCampusInput).toBe("east");
  });

  it("does not overwrite manual campus solely when the selected student's default campus changes", () => {
    act(() => form.setTransferCampusInput("east"));
    vault = { ...vault, students: vault.students.map(student => student.id === "a" ? { ...student, defaultCampusId: undefined } : student) };
    render();
    expect(form.transferCampusInput).toBe("east");
    act(() => form.setTransferCampusInput("west"));
    vault = { ...vault, students: vault.students.map(student => student.id === "a" ? { ...student, defaultCampusId: "east" } : student) };
    render();
    expect(form.transferCampusInput).toBe("west");
  });

  it("uses the preferred campus when switching to a student with no campus", () => {
    vault.students = vault.students.map(student => student.id === "d" ? { ...student, defaultCampusId: undefined } : student);
    render();
    act(() => form.setTransferStudentId("d"));
    expect(form.transferCampusInput).toBe("east");
  });

  it("retains valid subject and type choices and replaces choices only when options disappear", () => {
    act(() => { form.setTransferSubjectInput("英语"); form.setTransferCourseType("small_class"); });
    subjectOptions = ["数学", "英语"];
    courseTypeOptions = [...courseTypeOptions].reverse();
    render();
    expect(form.transferSubjectInput).toBe("英语");
    expect(form.transferCourseType).toBe("small_class");
    subjectOptions = ["数学"];
    courseTypeOptions = [{ value: "one_on_two" }, { value: "trial" }];
    render();
    expect(form.transferSubjectInput).toBe("数学");
    expect(form.transferCourseType).toBe("one_on_two");
    subjectOptions = [];
    courseTypeOptions = [];
    render();
    expect(form.transferSubjectInput).toBe("未设置");
    expect(form.transferCourseType).toBe("one_on_two");
  });

  it("retains all draft fields across collapse, mode changes and unrelated renders", () => {
    act(() => { form.setTransferPanelOpen(true); form.setTransferCourseNameInput("调班草稿"); form.setTransferSubjectInput("英语"); form.setTransferCampusInput("east"); form.setTransferTargetCourseId("target-z"); form.setTransferEndExisting(true); });
    act(() => { form.setTransferPanelOpen(false); form.setTransferTargetMode("existing"); });
    vault = { ...vault, profile: { ...vault.profile, note: "无关联修改" } };
    render();
    act(() => { form.setTransferPanelOpen(true); form.setTransferTargetMode("new"); });
    expect(form).toMatchObject({ transferCourseNameInput: "调班草稿", transferStudentId: "a", transferCourseType: "trial", transferSubjectInput: "英语", transferCampusInput: "east", transferTargetCourseId: "target-z", transferEndExisting: true });
  });
});

describe("eligible transfer targets", () => {
  it.each(["small_class", "one_on_two", "custom_class"] as const)("applies same-grade rules for %s while allowing an empty roster", type => {
    vault.preferences!.customCourseTypes = [{ id: "custom_class", label: "自定义班课" }];
    vault.preferences!.courseTypeFeeRules!.custom_class = { mode: "class_headcount", classFeeTiers: [{ id: "tier", minStudents: 2, baseFee: 100 }] };
    vault.courseGroups = [course("same", ["b"], { type }), course("other-grade", ["c"], { type }), course("empty", [], { type }), course("already-member", ["a"], { type }), course("paused", [], { type, status: "paused" }), course("other-type", [], { type: "trial" })];
    render();
    act(() => form.setTransferCourseType(type));
    expect(targets()).toEqual(["empty", "same"]);
    act(() => form.setTransferStudentId("d"));
    expect(targets()).toEqual(["empty"]);
  });

  it.each(["one_on_one", "one_on_two"] as const)("enforces %s capacity", type => {
    vault.courseGroups = [course("empty", [], { type }), course("one", ["b"], { type }), course("two", ["b", "c"], { type })];
    render();
    act(() => form.setTransferCourseType(type));
    expect(targets()).toEqual(type === "one_on_one" ? ["empty"] : ["empty", "one"]);
  });

  it("allows trial students of different grades and does not filter targets by selected subject or campus", () => {
    act(() => { form.setTransferStudentId("c"); form.setTransferSubjectInput("语文"); form.setTransferCampusInput("east"); });
    expect(targets()).toEqual(["target-a", "target-z"]);
    expect(form.transferTargetCourses.find(course => course.id === "target-z")).toMatchObject({ subject: "英语", defaultCampusId: "west" });
  });

  it("keeps valid targets after reordering, then falls back when membership or status changes", () => {
    act(() => form.setTransferTargetCourseId("target-z"));
    vault = { ...vault, courseGroups: vault.courseGroups.map(course => course.id === "target-z" ? { ...course, name: "A target" } : course) };
    render();
    expect(form.transferTargetCourseId).toBe("target-z");
    vault = { ...vault, courseGroups: vault.courseGroups.map(course => course.id === "target-z" ? { ...course, studentIds: ["a"] } : course) };
    render();
    expect(form.transferTargetCourseId).toBe("target-a");
    vault = { ...vault, courseGroups: vault.courseGroups.map(course => course.id === "target-a" ? { ...course, status: "paused" } : course) };
    render();
    expect(form.transferTargetCourseId).toBe("");
  });

  it("revalidates targets when roster capacity or the student's grade changes", () => {
    vault.courseGroups = [course("pair", ["b"], { type: "one_on_two" })];
    render();
    act(() => form.setTransferCourseType("one_on_two"));
    expect(form.transferTargetCourseId).toBe("pair");
    vault = { ...vault, courseGroups: [course("pair", ["b", "c"], { type: "one_on_two" })] };
    render();
    expect(form.transferTargetCourseId).toBe("");
    vault = { ...vault, courseGroups: [course("pair", ["b"], { type: "one_on_two" })] };
    render();
    expect(form.transferTargetCourseId).toBe("pair");
    vault = { ...vault, students: vault.students.map(student => student.id === "a" ? { ...student, grade: "初三" } : student) };
    render();
    expect(form.transferTargetCourseId).toBe("");
  });
});

describe("transfer submission", () => {
  it("submits the new course with configured trial fee, trims text and resets only its name", () => {
    act(() => { form.setTransferPanelOpen(true); form.setTransferCourseNameInput("  自定义调班课  "); form.setTransferSubjectInput(" 数学 "); form.setTransferCampusInput("east"); form.setTransferEndExisting(true); });
    const before = structuredClone(vault);
    submit();
    expect(onTransferStudentCourse).toHaveBeenCalledExactlyOnceWith({ studentId: "a", subject: "数学", endExisting: true, newCourse: { id: expect.stringMatching(/^course_/), name: "自定义调班课", subject: "数学", type: "trial", defaultCampusId: "east", studentIds: ["a"], feeRule: { mode: "fixed", fixedFee: 60 }, status: "active" } });
    expect(form).toMatchObject({ transferCourseNameInput: "", transferPanelOpen: true, transferStudentId: "a", transferCourseType: "trial", transferSubjectInput: " 数学 ", transferCampusInput: "east", transferTargetCourseId: "target-a", transferEndExisting: true, transferMessage: "已为「Alice」新建「自定义调班课」。已有课时不受影响。" });
    expect(vault).toEqual(before);
  });

  it("uses the current course-type label for a blank name", () => {
    vault = { ...vault, preferences: { ...vault.preferences!, courseTypeLabels: { trial: "新体验课" } } };
    render();
    act(() => form.setTransferCourseNameInput("  "));
    submit();
    expect(onTransferStudentCourse.mock.lastCall![0].newCourse?.name).toBe("Alice新体验课");
  });

  it.each(["one_on_one", "one_on_two", "small_class", "custom_class"] as const)("uses the current teacher salary default when creating %s", type => {
    vault = { ...vault, profile: { ...vault.profile, defaultSalaryGradeId: "custom_salary_latest" } };
    render();
    act(() => form.setTransferCourseType(type));
    submit();
    expect(onTransferStudentCourse.mock.lastCall![0].newCourse).toMatchObject({ type, studentIds: ["a"], feeRule: { mode: "salary_grade", salaryGradeSource: "teacher_default", salaryGradeId: "custom_salary_latest" } });
  });

  it.each([["west", "east", "west"], [undefined, "east", "east"], [undefined, "", ""]] as const)("resolves blank campus with student=%s preferred=%s", (studentCampus, preferred, expected) => {
    vault = { ...vault, students: vault.students.map(student => student.id === "a" ? { ...student, defaultCampusId: studentCampus } : student) };
    preferredCampusId = preferred;
    render();
    act(() => form.setTransferCampusInput(""));
    submit();
    expect(onTransferStudentCourse.mock.lastCall![0].newCourse?.defaultCampusId).toBe(expected);
  });

  it.each(["current", "option", "unset"] as const)("resolves blank subject from %s", source => {
    if (source !== "current") vault = { ...vault, courseGroups: [] };
    if (source === "unset") subjectOptions = [];
    render();
    act(() => form.setTransferSubjectInput("  "));
    submit();
    expect(onTransferStudentCourse.mock.lastCall![0].subject).toBe(source === "current" ? "数学" : source === "option" ? "语文" : "未设置");
  });

  it.each([false, true])("joins an existing course using its subject and preserves every draft field (endExisting=%s)", endExisting => {
    act(() => { form.setTransferTargetMode("existing"); form.setTransferTargetCourseId("target-z"); form.setTransferSubjectInput("语文"); form.setTransferCourseNameInput("保留新建名称"); form.setTransferCampusInput("east"); form.setTransferEndExisting(endExisting); });
    const before = structuredClone(vault);
    submit();
    expect(onTransferStudentCourse).toHaveBeenCalledExactlyOnceWith({ studentId: "a", targetCourseId: "target-z", subject: "英语", endExisting });
    expect(form).toMatchObject({ transferTargetMode: "existing", transferTargetCourseId: "target-z", transferSubjectInput: "语文", transferCourseNameInput: "保留新建名称", transferCampusInput: "east", transferEndExisting: endExisting, transferMessage: "已将「Alice」调整到「target-z」。已有课时不受影响。" });
    expect(vault).toEqual(before);
  });

  it("rejects an unavailable target without clearing the draft", () => {
    act(() => { form.setTransferTargetMode("existing"); form.setTransferTargetCourseId("old"); form.setTransferCourseNameInput("保留草稿"); });
    submit();
    expect(onTransferStudentCourse).not.toHaveBeenCalled();
    expect(form.transferMessage).toBe("请选择一个可加入的目标课程。");
    expect(form.transferCourseNameInput).toBe("保留草稿");
  });

  it.each(["new", "existing"] as const)("keeps the draft and message when the %s persistence callback throws", mode => {
    act(() => form.setTransferTargetMode(mode));
    submit();
    const message = form.transferMessage;
    act(() => form.setTransferCourseNameInput("失败后保留"));
    onTransferStudentCourse.mockClear();
    onTransferStudentCourse.mockImplementation(() => { throw new Error("save failed"); });
    expect(() => submit()).toThrow("save failed");
    expect(onTransferStudentCourse).toHaveBeenCalledOnce();
    expect(form.transferCourseNameInput).toBe("失败后保留");
    expect(form.transferMessage).toBe(message);
  });
});
