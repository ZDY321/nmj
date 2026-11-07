// @vitest-environment happy-dom
import { act, createElement, StrictMode, type FormEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Student, TeacherVault } from "@/shared/types";
import type { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { useStudentCreation } from "./useStudentCreation";

let container: HTMLDivElement;
let root: Root;
let vault: TeacherVault;
let preferredCampusId: string;
let form: ReturnType<typeof useStudentCreation>;
const confirm = vi.fn<ReturnType<typeof useConfirmDialog>["confirm"]>();
const onAddStudent = vi.fn<(student: Student) => void>();
const onAddStudents = vi.fn<(students: Student[]) => void>();
function Harness() {
  form = useStudentCreation({ vault, preferredCampusId, confirm, onAddStudent, onAddStudents });
  return null;
}
function render() {
  act(() => root.render(createElement(StrictMode, null, createElement(Harness))));
}
function fill(fields: { name?: string; grade?: string; school?: string; campus?: string; note?: string; trial?: boolean; batch?: string }) {
  act(() => {
    if (fields.name !== undefined) form.setStudentNameInput(fields.name);
    if (fields.grade !== undefined) form.setStudentGradeInput(fields.grade);
    if (fields.school !== undefined) form.setStudentSchoolInput(fields.school);
    if (fields.campus !== undefined) form.setStudentCampusInput(fields.campus);
    if (fields.note !== undefined) form.setStudentNoteInput(fields.note);
    if (fields.trial !== undefined) form.setStudentTemporaryTrialInput(fields.trial);
    if (fields.batch !== undefined) form.setBatchStudentText(fields.batch);
  });
}
function submit() {
  const preventDefault = vi.fn();
  act(() => form.onAddStudent({ preventDefault } as unknown as FormEvent));
  expect(preventDefault).toHaveBeenCalledOnce();
}
function submitBatch() {
  act(() => form.onBatchAddStudents());
}
function confirmLast() {
  act(() => confirm.mock.lastCall![0].onConfirm());
}
function existing(patch: Partial<Student> = {}): Student {
  return { id: "existing", name: "Alice", grade: "初一", defaultCampusId: "east", status: "active", ...patch };
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  vault = createEmptyVault();
  vault.campuses = [{ id: "east", name: "东校区" }, { id: "west", name: "西校区" }];
  vault.profile.homeCampusId = "east";
  preferredCampusId = "east";
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

describe("single student creation", () => {
  it("trims submitted text, creates an active trial student, and resets only the original fields", () => {
    fill({ name: "  Alice  ", grade: "初二", school: "  实验学校  ", campus: "west", note: "  备注  ", trial: true, batch: "批量草稿" });
    const before = structuredClone(vault);
    submit();
    expect(confirm).not.toHaveBeenCalled();
    expect(onAddStudent).toHaveBeenCalledExactlyOnceWith({ id: expect.stringMatching(/^student_/), name: "Alice", grade: "初二", school: "实验学校", defaultCampusId: "west", note: "备注", temporaryTrial: true, status: "active" });
    expect(form).toMatchObject({ studentNameInput: "", studentGradeInput: "", studentSchoolInput: "", studentNoteInput: "", studentTemporaryTrialInput: false, studentCampusInput: "west", batchStudentText: "批量草稿" });
    expect(vault).toEqual(before);
  });

  it("ignores a blank name without opening a confirmation or resetting the draft", () => {
    fill({ name: "  ", school: "保留学校" });
    submit();
    expect(confirm).not.toHaveBeenCalled();
    expect(onAddStudent).not.toHaveBeenCalled();
    expect(form.studentSchoolInput).toBe("保留学校");
  });

  it("requires missing-grade confirmation and preserves the draft when it is cancelled", () => {
    fill({ name: "Alice", school: "  ", note: "  ", campus: "" });
    submit();
    expect(confirm.mock.lastCall![0]).toMatchObject({ title: "未设置学生年级？", confirmLabel: "仍然添加", cancelLabel: "返回设置" });
    expect(onAddStudent).not.toHaveBeenCalled();
    expect(form.studentNameInput).toBe("Alice");
    submit();
    confirmLast();
    expect(onAddStudent).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: "Alice", grade: undefined, school: undefined, note: undefined, defaultCampusId: "east" }));
  });

  it.each(["active", "transition", "paused"] as const)("warns about normalized duplicates even when the existing student is %s", status => {
    vault.students = [existing({ name: " AL ice ", grade: "初 一", status })];
    render();
    fill({ name: "alice", grade: "初一" });
    submit();
    const request = confirm.mock.lastCall![0];
    expect(request.title).toBe("可能重复添加学生");
    if (status === "paused") expect(request.description).toContain("当前已归档");
    if (status === "transition") expect(request.description).toContain("当前为过渡期");
    expect(onAddStudent).not.toHaveBeenCalled();
    expect(form.studentNameInput).toBe("alice");
    confirmLast();
    expect(onAddStudent).toHaveBeenCalledOnce();
    expect(vault.students).toHaveLength(1);
  });

  it.each([{ grade: "初二", campus: "east" }, { grade: "初一", campus: "west" }])("allows the same name when grade or campus differs: %j", fields => {
    vault.students = [existing()];
    render();
    fill({ name: "Alice", ...fields });
    submit();
    expect(confirm).not.toHaveBeenCalled();
    expect(onAddStudent).toHaveBeenCalledOnce();
  });

  it("asks for missing grade before duplicate confirmation and keeps the original pending draft", () => {
    vault.students = [existing({ grade: undefined })];
    render();
    fill({ name: "Alice" });
    submit();
    const missingGrade = confirm.mock.lastCall![0];
    fill({ name: "后来输入", grade: "初二" });
    act(() => missingGrade.onConfirm());
    expect(confirm.mock.lastCall![0].title).toBe("可能重复添加学生");
    expect(onAddStudent).not.toHaveBeenCalled();
    confirmLast();
    expect(onAddStudent.mock.lastCall![0]).toMatchObject({ name: "Alice", grade: undefined });
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("keeps the draft when persistence throws", () => {
    fill({ name: "Alice", grade: "初二", school: "学校", trial: true });
    onAddStudent.mockImplementation(() => { throw new Error("save failed"); });
    expect(submit).toThrow("save failed");
    expect(form).toMatchObject({ studentNameInput: "Alice", studentGradeInput: "初二", studentSchoolInput: "学校", studentTemporaryTrialInput: true });
  });

  it("retains a valid chosen campus across home-campus changes and falls back only when unavailable", () => {
    fill({ campus: "west", name: "保留草稿" });
    vault = { ...vault, profile: { ...vault.profile, homeCampusId: "west" } };
    preferredCampusId = "west";
    render();
    expect(form.studentCampusInput).toBe("west");
    vault = { ...vault, campuses: [vault.campuses[0]], profile: { ...vault.profile, homeCampusId: "east" } };
    preferredCampusId = "east";
    render();
    expect(form.studentCampusInput).toBe("east");
    vault = { ...vault, campuses: [] };
    preferredCampusId = "";
    render();
    expect(form.studentCampusInput).toBe("");
    expect(form.studentNameInput).toBe("保留草稿");
  });

  it("preserves the single and batch empty-campus representations", () => {
    vault = { ...vault, campuses: [] };
    preferredCampusId = "";
    render();
    fill({ name: "单个", grade: "初一" });
    submit();
    expect(onAddStudent.mock.lastCall![0].defaultCampusId).toBe("");
    fill({ batch: "批量|初一" });
    submitBatch();
    expect(onAddStudents.mock.lastCall![0][0].defaultCampusId).toBeUndefined();
  });
});

describe("student batch import", () => {
  it("parses mixed delimiters, headers, empty columns and multi-part notes while inheriting defaults", () => {
    fill({ grade: "初二", school: " 默认学校 ", note: " 默认备注 ", campus: "west", trial: true,
      batch: " 姓名｜年级｜学校｜备注\r\n张三｜初一｜实验学校｜第一段｜第二段\n李四\t\t外国语学校\t\n王五,未设置年级,,显式备注,\n赵六 初三 新学校 备注1 备注2\n钱七，初一，七中，中文逗号\n｜初三｜忽略\n" });
    submitBatch();
    expect(confirm).not.toHaveBeenCalled();
    const created = onAddStudents.mock.lastCall![0];
    expect(created.map(({ id: _id, ...student }) => student)).toEqual([
      { name: "张三", grade: "初一", school: "实验学校", note: "第一段，第二段", defaultCampusId: "west", status: "active", temporaryTrial: true },
      { name: "李四", grade: "初二", school: "外国语学校", note: "默认备注", defaultCampusId: "west", status: "active", temporaryTrial: true },
      { name: "王五", grade: "初二", school: "默认学校", note: "显式备注", defaultCampusId: "west", status: "active", temporaryTrial: true },
      { name: "赵六", grade: "初三", school: "新学校", note: "备注1，备注2", defaultCampusId: "west", status: "active", temporaryTrial: true },
      { name: "钱七", grade: "初一", school: "七中", note: "中文逗号", defaultCampusId: "west", status: "active", temporaryTrial: true }
    ]);
    expect(new Set(created.map(student => student.id)).size).toBe(5);
    expect(form).toMatchObject({ batchStudentText: "", batchStudentMessage: "已批量添加 5 名学生。", studentGradeInput: "初二", studentSchoolInput: " 默认学校 ", studentNoteInput: " 默认备注 ", studentTemporaryTrialInput: true, studentCampusInput: "west" });
  });

  it("skips existing and within-batch normalized duplicates without conflating grades or campuses", () => {
    vault.students = [existing({ status: "paused" }), existing({ id: "other", name: "Bob", defaultCampusId: "west", status: "transition" })];
    render();
    fill({ grade: "初一", batch: "A L I C E|初 一\nBOB|初一\nb ob|初 一\nAlice|初二" });
    submitBatch();
    expect(confirm).not.toHaveBeenCalled();
    expect(onAddStudents.mock.lastCall![0].map(student => [student.name, student.grade])).toEqual([["BOB", "初一"], ["Alice", "初二"]]);
    expect(form.batchStudentMessage).toBe("已批量添加 2 名学生，跳过 2 条重复记录。");
  });

  it.each(["", " \n\t", "姓名｜年级｜学校\n学生姓名\n｜初一"]) ("rejects empty or header-only input: %j", batch => {
    fill({ batch });
    submitBatch();
    expect(onAddStudents).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(form.batchStudentText).toBe(batch);
    expect(form.batchStudentMessage).toBe("请先粘贴至少一行学生信息。");
  });

  it("does not treat a student named 姓名 with real grade and school as a header", () => {
    fill({ batch: "姓名|初一|实验中学" });
    submitBatch();
    expect(onAddStudents.mock.lastCall![0][0]).toMatchObject({ name: "姓名", grade: "初一", school: "实验中学" });
  });

  it("confirms missing grades once and submits the pending batch without borrowing later defaults", () => {
    fill({ batch: "无年级\n显式空|未设置年级\n有年级|初二", school: "原学校" });
    submitBatch();
    expect(confirm.mock.lastCall![0].title).toBe("批量添加包含未设置年级的学生？");
    expect(onAddStudents).not.toHaveBeenCalled();
    expect(form.batchStudentText).toContain("无年级");
    const pending = confirm.mock.lastCall![0];
    fill({ batch: "后来文本", grade: "初三", school: "后来学校" });
    act(() => pending.onConfirm());
    expect(onAddStudents.mock.lastCall![0].map(student => [student.name, student.grade, student.school])).toEqual([["无年级", undefined, "原学校"], ["显式空", undefined, "原学校"], ["有年级", "初二", "原学校"]]);
    expect(confirm).toHaveBeenCalledOnce();
    expect(form.studentGradeInput).toBe("初三");
  });

  it("keeps all-duplicate text and reports skipped records, including missing-campus duplicates", () => {
    vault = { ...vault, campuses: [], students: [existing({ grade: undefined, defaultCampusId: undefined })] };
    preferredCampusId = "";
    render();
    fill({ batch: "alice\nAL ICE|" });
    submitBatch();
    confirmLast();
    expect(onAddStudents).not.toHaveBeenCalled();
    expect(form).toMatchObject({ batchStudentText: "alice\nAL ICE|", batchStudentMessage: "没有新增学生，已跳过 2 条重复记录。" });
  });

  it("keeps batch text and the previous message when persistence fails", () => {
    submitBatch();
    fill({ batch: "张三|初一", school: "默认学校" });
    onAddStudents.mockImplementation(() => { throw new Error("batch save failed"); });
    expect(submitBatch).toThrow("batch save failed");
    expect(form).toMatchObject({ batchStudentText: "张三|初一", studentSchoolInput: "默认学校", batchStudentMessage: "请先粘贴至少一行学生信息。" });
  });
});
