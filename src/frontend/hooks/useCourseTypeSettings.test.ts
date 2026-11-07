// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseGroup, CourseType, FeeRule, Lesson, TeacherVault } from "@/shared/types";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { useCourseTypeSettings } from "./useCourseTypeSettings";

type Options = Parameters<typeof useCourseTypeSettings>[0];
let container: HTMLDivElement;
let root: Root;
let vault: TeacherVault;
let courseTypeOptions: Options["courseTypeOptions"];
let settings: ReturnType<typeof useCourseTypeSettings>;
const confirm = vi.fn<Options["confirm"]>();
const onAddCustomCourseType = vi.fn<Options["onAddCustomCourseType"]>();
const onDeleteCustomCourseType = vi.fn<Options["onDeleteCustomCourseType"]>();
const onUpdateCourseTypeLabel = vi.fn<Options["onUpdateCourseTypeLabel"]>();
const onDeleteCourseType = vi.fn<Options["onDeleteCourseType"]>();
const onUpdateCourseTypeFeeRule = vi.fn<Options["onUpdateCourseTypeFeeRule"]>();
const onSyncCourseTypeFeeRuleToCourses = vi.fn<Options["onSyncCourseTypeFeeRuleToCourses"]>();
const onMigrateCourseTypeLessons = vi.fn<Options["onMigrateCourseTypeLessons"]>();
const syncNewCourseFeeRule = vi.fn<Options["syncNewCourseFeeRule"]>();
const onBeforeDeleteCourseType = vi.fn<Options["onBeforeDeleteCourseType"]>();
function Harness() {
  settings = useCourseTypeSettings({ vault, courseTypeOptions, confirm, onAddCustomCourseType, onDeleteCustomCourseType, onUpdateCourseTypeLabel, onDeleteCourseType, onUpdateCourseTypeFeeRule, onSyncCourseTypeFeeRuleToCourses, onMigrateCourseTypeLessons, syncNewCourseFeeRule, onBeforeDeleteCourseType });
  return null;
}
function render() { act(() => root.render(createElement(StrictMode, null, createElement(Harness)))); }
function course(id = "course", type: CourseType = "small_class"): CourseGroup {
  return { id, type, name: id, subject: "数学", studentIds: [], status: "active", feeRule: { mode: "fixed", fixedFee: 100 } };
}
function lesson(id: string, patch: Partial<Lesson> = {}): Lesson {
  return { id, courseGroupId: "course", type: "small_class", date: "2026-11-07", startTime: "10:00", endTime: "12:00", status: "scheduled", expectedStudentIds: [], attendance: [], feeSnapshot: { amount: 137, hours: 2 }, content: { taught: "", homework: "", nextLessonReminder: "" }, ...patch };
}
function setRule(type: CourseType, rule: FeeRule) {
  vault = { ...vault, preferences: { ...vault.preferences!, courseTypeFeeRules: { ...vault.preferences?.courseTypeFeeRules, [type]: rule } } };
  render();
}
function confirmLast(secondary = false) {
  act(() => { const request = confirm.mock.lastCall![0]; if (secondary) request.onSecondary!(); else request.onConfirm(); });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-07T12:00:00"));
  vault = createEmptyVault();
  vault.profile.defaultSalaryGradeId = "custom_salary_test";
  vault.profile.salaryGradeRules = [{ id: "custom_salary_test", label: "测试等级", baseSalary: 3000, oneOnOneFee: 80, classBaseFee: 100, headcountIncrementFee: 10, stageRates: { junior_3: { oneOnOneFee: 90, classBaseFee: 130, headcountIncrementFee: 9 }, senior_3: { oneOnOneFee: 150, classBaseFee: 200, headcountIncrementFee: 20 } } }];
  vault.preferences = { ...vault.preferences!, customCourseTypes: [{ id: "custom_old", label: "Old Class" }], disabledCourseTypes: ["trial"] };
  courseTypeOptions = [{ value: "small_class", label: "小班课" }, { value: "one_on_one", label: "一对一" }, { value: "custom_old", label: "Old Class" }];
  onMigrateCourseTypeLessons.mockReturnValue({ total: 3, byCourse: 1, substitute: 1, orphan: 1, refreshed: 0, skipped: 0 });
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

describe("course type naming", () => {
  it("keeps hidden types out of the managed list and rejects empty add/edit requests", () => {
    expect(settings.managedCourseTypes.some(type => type.value === "trial")).toBe(false);
    expect(settings.managedCourseTypes).toContainEqual({ value: "custom_old", label: "Old Class" });
    act(() => { settings.setCustomCourseTypeInput("  "); settings.onStartEditCustomCourseType({ id: "small_class", label: "  " }); });
    act(() => { settings.onAddCustomCourseType(); settings.onSaveCustomCourseType(); });
    expect(onAddCustomCourseType).not.toHaveBeenCalled();
    expect(onUpdateCourseTypeLabel).not.toHaveBeenCalled();
  });

  it.each([["class", 5, 130, 10], ["non_class", 1, 90, undefined]] as const)("creates the %s template from the selected teacher grade and resets the draft", (template, minStudents, baseFee, cap) => {
    const before = structuredClone(vault);
    act(() => { settings.setCustomCourseTypeInput("  新班型  "); settings.setCustomCourseTypeTemplate(template); settings.setCourseTypeMessage("旧提示"); });
    act(() => settings.onAddCustomCourseType());
    const [option, rule] = onAddCustomCourseType.mock.lastCall!;
    expect(option).toEqual({ id: expect.stringMatching(/^custom_ctype_/), label: "新班型" });
    expect(rule).toMatchObject({ mode: "class_headcount", baseFee, perPresentStudentFee: 9, billableStudentCap: cap, makeupFeeMode: "perStudentFee", classFeeTiers: [{ minStudents, baseFee, perStudentFee: 9 }], stageRates: { senior_3: { oneOnOneFee: 150, classBaseFee: 200, headcountIncrementFee: 20 } } });
    expect(settings).toMatchObject({ customCourseTypeInput: "", customCourseTypeTemplate: "class", courseTypeMessage: "" });
    expect(vault).toEqual(before);
  });

  it.each(["  t r i a l  ", " 试听 ", " oLD   cLass "])("rejects normalized labels and ids including hidden types: %j", label => {
    act(() => settings.setCustomCourseTypeInput(label));
    act(() => settings.onAddCustomCourseType());
    expect(onAddCustomCourseType).not.toHaveBeenCalled();
    expect(settings.courseTypeMessage).toContain("不能重复添加同名班型");
    expect(settings.customCourseTypeInput).toBe(label);
  });

  it("retains the new-type draft if saving fails", () => {
    act(() => { settings.setCustomCourseTypeInput("新班型"); settings.setCustomCourseTypeTemplate("non_class"); });
    onAddCustomCourseType.mockImplementation(() => { throw new Error("save failed"); });
    expect(() => act(() => settings.onAddCustomCourseType())).toThrow("save failed");
    expect(settings).toMatchObject({ customCourseTypeInput: "新班型", customCourseTypeTemplate: "non_class" });
  });

  it("rejects another type's label during rename, allows self, and preserves id-shaped labels", () => {
    act(() => settings.onStartEditCustomCourseType({ id: "custom_old", label: "试听" }));
    act(() => settings.onSaveCustomCourseType());
    expect(onUpdateCourseTypeLabel).not.toHaveBeenCalled();
    expect(settings.courseTypeMessage).toContain("不能改成同名班型");
    act(() => settings.setEditingCustomCourseTypeLabel("  Old Class  "));
    act(() => settings.onSaveCustomCourseType());
    expect(onUpdateCourseTypeLabel).toHaveBeenLastCalledWith("custom_old", "Old Class");
    expect(settings).toMatchObject({ editingCustomCourseTypeId: "", editingCustomCourseTypeLabel: "", courseTypeMessage: "" });
    act(() => settings.onStartEditCustomCourseType({ id: "custom_old", label: " one_on_one " }));
    act(() => settings.onSaveCustomCourseType());
    expect(onUpdateCourseTypeLabel).toHaveBeenLastCalledWith("custom_old", "one_on_one");
  });

  it("retains a failed rename and clears only edit fields and feedback on cancel", () => {
    act(() => { settings.setCustomCourseTypeInput("新增草稿"); settings.onStartEditCustomCourseType({ id: "custom_old", label: "重命名" }); settings.setCourseTypeMessage("提示"); });
    onUpdateCourseTypeLabel.mockImplementation(() => { throw new Error("rename failed"); });
    expect(() => act(() => settings.onSaveCustomCourseType())).toThrow("rename failed");
    expect(settings.editingCustomCourseTypeLabel).toBe("重命名");
    act(() => settings.onCancelCustomCourseTypeEdit());
    expect(settings).toMatchObject({ customCourseTypeInput: "新增草稿", editingCustomCourseTypeId: "", editingCustomCourseTypeLabel: "", courseTypeMessage: "" });
  });
});

describe("course type fee settings", () => {
  it("uses the original normalized first tier, clears its upper bound and preserves saved metadata", () => {
    setRule("custom_old", { mode: "class_headcount", billableStudentCap: 7, salaryGradeId: "custom_salary_test", makeupFeeMode: "sameAsOriginal", classFeeTiers: [{ id: "later", minStudents: 10, maxStudents: 20, baseFee: 200, perStudentFee: 20 }, { id: "first", minStudents: 3, maxStudents: 9, baseFee: 80, perStudentFee: 5 }] });
    const before = structuredClone(vault);
    act(() => settings.onUpdateCourseTypeClassFeeTier("custom_old", "missing", { minStudents: 1, baseFee: 66 }));
    const rule = onUpdateCourseTypeFeeRule.mock.lastCall![1];
    expect(rule).toMatchObject({ mode: "class_headcount", baseFee: 66, perPresentStudentFee: 5, billableStudentCap: 7, salaryGradeId: "custom_salary_test", makeupFeeMode: "sameAsOriginal", classFeeTiers: [{ minStudents: 1, baseFee: 66, perStudentFee: 5, maxStudents: undefined }] });
    expect(syncNewCourseFeeRule).toHaveBeenCalledExactlyOnceWith("custom_old");
    expect(onUpdateCourseTypeFeeRule.mock.invocationCallOrder[0]).toBeLessThan(syncNewCourseFeeRule.mock.invocationCallOrder[0]);
    expect(vault).toEqual(before);
  });

  it.each([[3.9, 3], [-2, 0], [0, 0], [undefined, undefined], [NaN, undefined], [Infinity, undefined]])("normalizes a billable cap of %s to %s", (cap, expected) => {
    act(() => settings.onUpdateCourseTypeBillableCap("small_class", cap));
    expect(onUpdateCourseTypeFeeRule.mock.lastCall![1].billableStudentCap).toBe(expected);
    expect(syncNewCourseFeeRule).toHaveBeenCalledExactlyOnceWith("small_class");
  });

  it.each(["fixed", "hourly"] as const)("preserves the %s update's field clearing and course-draft callback shape", mode => {
    setRule("custom_old", { mode: "class_headcount", fixedFee: 11, hourlyRate: 22, baseFee: 33, perPresentStudentFee: 44, classFeeTiers: [{ id: "tier", minStudents: 5, baseFee: 33, perStudentFee: 44 }], billableStudentCap: 8, makeupFeeMode: "sameAsOriginal" });
    act(() => { if (mode === "fixed") settings.onUpdateCourseTypeFixedRule("custom_old", 77); else settings.onUpdateCourseTypeHourlyRule("custom_old", 77); });
    const rule = onUpdateCourseTypeFeeRule.mock.lastCall![1];
    expect(rule).toMatchObject({ mode, fixedFee: mode === "fixed" ? 77 : undefined, hourlyRate: mode === "hourly" ? 77 : undefined, baseFee: undefined, perPresentStudentFee: undefined, classFeeTiers: undefined, billableStudentCap: 8, makeupFeeMode: "sameAsOriginal" });
    expect(syncNewCourseFeeRule.mock.lastCall).toEqual(mode === "fixed" ? ["custom_old", rule] : ["custom_old"]);
  });

  it("resets trial to zero and resets non-class types from the selected salary grade", () => {
    setRule("trial", { mode: "fixed", fixedFee: 90 });
    act(() => settings.onResetCourseTypeFeeRule("trial"));
    expect(onUpdateCourseTypeFeeRule).toHaveBeenLastCalledWith("trial", { mode: "fixed", fixedFee: 0 });
    expect(syncNewCourseFeeRule).toHaveBeenLastCalledWith("trial", { mode: "fixed", fixedFee: 0 });
    setRule("custom_old", { mode: "class_headcount", classFeeTiers: [{ id: "old", minStudents: 1, baseFee: 500, perStudentFee: 20 }] });
    act(() => settings.onResetCourseTypeFeeRule("custom_old"));
    expect(onUpdateCourseTypeFeeRule.mock.lastCall![1]).toMatchObject({ mode: "class_headcount", baseFee: 90, perPresentStudentFee: 9, billableStudentCap: undefined, classFeeTiers: [{ minStudents: 1, baseFee: 90 }] });
    expect(syncNewCourseFeeRule.mock.lastCall).toEqual(["custom_old", onUpdateCourseTypeFeeRule.mock.lastCall![1]]);
  });

  it("does not sync the new-course draft when a rule update fails", () => {
    onUpdateCourseTypeFeeRule.mockImplementation(() => { throw new Error("fee save failed"); });
    expect(() => act(() => settings.onUpdateCourseTypeFixedRule("trial", 77))).toThrow("fee save failed");
    expect(syncNewCourseFeeRule).not.toHaveBeenCalled();
  });
});

describe("course type sync and migration", () => {
  it("reports direct course or snapshot usage and skips sync when no courses exist", () => {
    vault.courseGroups = [course("course", "small_class")];
    vault.lessons = [lesson("legacy", { courseGroupId: "missing", type: "custom_old" })];
    render();
    expect(settings.courseTypeInUse("small_class")).toBe(true);
    expect(settings.courseTypeInUse("custom_old")).toBe(true);
    expect(settings.courseTypeInUse("trial")).toBe(false);
    act(() => settings.onRequestSyncCourseTypeFeeRuleToCourses("custom_old"));
    expect(settings.courseTypeMessage).toContain("还没有已添加课程");
    expect(confirm).not.toHaveBeenCalled();
    expect(onSyncCourseTypeFeeRuleToCourses).not.toHaveBeenCalled();
  });

  it("confirms the current future scope and only writes on confirmation", () => {
    vault.courseGroups = [course()];
    vault.lessons = [lesson("today"), lesson("future", { date: "2026-11-08", status: "draft", type: "one_on_one" }), lesson("past", { date: "2026-11-06" }), lesson("done", { status: "completed" }), lesson("makeup", { linkedOriginalLessonId: "original" })];
    render();
    act(() => settings.onRequestSyncCourseTypeFeeRuleToCourses("small_class"));
    expect(confirm.mock.lastCall![0].description).toContain("刷新 2 节未来待上课课节");
    expect(onSyncCourseTypeFeeRuleToCourses).not.toHaveBeenCalled();
    confirmLast();
    expect(onSyncCourseTypeFeeRuleToCourses).toHaveBeenCalledExactlyOnceWith("small_class");
    expect(settings.courseTypeMessage).toContain("刷新 2 节未来待上课课节");
  });

  it("allows syncing course defaults even with zero future lessons and retains feedback on failure", () => {
    vault.courseGroups = [course()];
    render();
    act(() => { settings.setCourseTypeMessage("原提示"); settings.onRequestSyncCourseTypeFeeRuleToCourses("small_class"); });
    expect(confirm.mock.lastCall![0].description).toContain("刷新 0 节");
    onSyncCourseTypeFeeRuleToCourses.mockImplementation(() => { throw new Error("sync failed"); });
    expect(() => confirmLast()).toThrow("sync failed");
    expect(settings.courseTypeMessage).toBe("原提示");
  });

  it("does not offer migration while all snapshots still match their course type", () => {
    vault.courseGroups = [course("old", "custom_old")];
    vault.lessons = [lesson("same", { courseGroupId: "old", type: "custom_old" })];
    render();
    act(() => settings.onRequestMigrateCourseTypeLessons("custom_old"));
    expect(confirm).not.toHaveBeenCalled();
    expect(onMigrateCourseTypeLessons).not.toHaveBeenCalled();
    expect(settings.courseTypeMessage).toContain("没有需要迁移的旧课节快照");
  });

  it.each([false, true])("retains the confirmed target and routes the secondary action separately: %s", secondary => {
    vault.lessons = [lesson("legacy", { courseGroupId: "missing", type: "custom_old" })];
    render();
    act(() => settings.setMigrationOrphanTargetType("big_class"));
    act(() => settings.onRequestMigrateCourseTypeLessons("custom_old"));
    expect(confirm.mock.lastCall![0]).toMatchObject({ title: "迁移「Old Class」的 1 节旧课节？", confirmLabel: "只改班型标记", secondaryLabel: "完整刷新（重算金额）" });
    expect(onMigrateCourseTypeLessons).not.toHaveBeenCalled();
    act(() => settings.setMigrationOrphanTargetType("one_on_one"));
    if (secondary) onMigrateCourseTypeLessons.mockReturnValue({ total: 3, byCourse: 1, substitute: 1, orphan: 1, refreshed: 1, skipped: 0 });
    confirmLast(secondary);
    expect(onMigrateCourseTypeLessons).toHaveBeenCalledExactlyOnceWith("custom_old", "big_class", secondary ? "full_refresh" : "type_only");
    expect(settings.courseTypeMessage).toContain(secondary ? "完整刷新并重算金额" : "学生名单、出勤和金额快照保持不变");
    expect(settings.courseTypeMessage).toContain("现在可以删除班型");
  });

  it.each([0, 2])("reports migration results with no changes and %s skipped lessons", skipped => {
    vault.lessons = [lesson("legacy", { courseGroupId: "missing", type: "custom_old" })];
    render();
    onMigrateCourseTypeLessons.mockReturnValue({ total: 0, byCourse: 0, substitute: 0, orphan: 0, refreshed: 0, skipped });
    act(() => settings.onRequestMigrateCourseTypeLessons("custom_old"));
    confirmLast();
    expect(settings.courseTypeMessage).toContain(skipped ? "2 节课节的课程档案本身仍是" : "没有需要迁移");
  });

  it("reports partial migration and does not claim success when the callback throws", () => {
    vault.lessons = [lesson("legacy", { courseGroupId: "missing", type: "custom_old" })];
    render();
    onMigrateCourseTypeLessons.mockReturnValue({ total: 1, byCourse: 1, substitute: 0, orphan: 0, refreshed: 0, skipped: 2 });
    act(() => settings.onRequestMigrateCourseTypeLessons("custom_old"));
    confirmLast();
    expect(settings.courseTypeMessage).toContain("另有 2 节课节");
    const previousMessage = settings.courseTypeMessage;
    onMigrateCourseTypeLessons.mockImplementation(() => { throw new Error("migration failed"); });
    act(() => settings.onRequestMigrateCourseTypeLessons("custom_old"));
    expect(() => confirmLast()).toThrow("migration failed");
    expect(settings.courseTypeMessage).toBe(previousMessage);
  });
});

describe("course type deletion coordination", () => {
  it.each(["custom_old", "small_class"] as const)("confirms before coordinating state reset and the %s delete callback", type => {
    act(() => settings.onStartEditCustomCourseType({ id: type, label: "待删草稿" }));
    act(() => settings.onRequestDeleteCourseType({ id: type, label: "目标班型" }));
    expect(onBeforeDeleteCourseType).not.toHaveBeenCalled();
    expect(onDeleteCustomCourseType).not.toHaveBeenCalled();
    expect(onDeleteCourseType).not.toHaveBeenCalled();
    confirmLast();
    expect(onBeforeDeleteCourseType).toHaveBeenCalledExactlyOnceWith(type, type === "small_class" ? "one_on_one" : "small_class");
    const deleted = type === "custom_old" ? onDeleteCustomCourseType : onDeleteCourseType;
    expect(deleted).toHaveBeenCalledExactlyOnceWith(type);
    expect(onBeforeDeleteCourseType.mock.invocationCallOrder[0]).toBeLessThan(deleted.mock.invocationCallOrder[0]);
    expect(settings.editingCustomCourseTypeId).toBe("");
  });

  it("uses the original one-on-one fallback and preserves unrelated editing state", () => {
    courseTypeOptions = [{ value: "custom_old", label: "Old Class" }];
    render();
    act(() => settings.onStartEditCustomCourseType({ id: "small_class", label: "其他编辑草稿" }));
    act(() => settings.onRequestDeleteCourseType({ id: "custom_old", label: "Old Class" }));
    confirmLast();
    expect(onBeforeDeleteCourseType).toHaveBeenCalledExactlyOnceWith("custom_old", "one_on_one");
    expect(settings.editingCustomCourseTypeLabel).toBe("其他编辑草稿");
  });
});
