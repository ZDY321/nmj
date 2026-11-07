// @vitest-environment happy-dom
import { act, createElement, StrictMode, type FormEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseGroup, TeacherVault } from "@/shared/types";
import type { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { courseTypeOptionsForVault, sortCampusesForProfile, subjectOptionsForVault } from "@/frontend/lib/helpers";
import { useNewCourseForm } from "./useNewCourseForm";

let container: HTMLDivElement;
let root: Root;
let vault: TeacherVault;
let draft: ReturnType<typeof useNewCourseForm>;
const onAddCourse = vi.fn<(course: CourseGroup) => void>();
const confirm = vi.fn<ReturnType<typeof useConfirmDialog>["confirm"]>();
function Harness() {
  draft = useNewCourseForm({
    vault, onAddCourse, confirm,
    preferredCampusId: sortCampusesForProfile(vault.campuses, vault.profile.homeCampusId)[0]?.id ?? "",
    subjectOptions: subjectOptionsForVault(vault),
    courseTypeOptions: courseTypeOptionsForVault(vault)
  });
  return null;
}
function render() {
  act(() => root.render(createElement(StrictMode, null, createElement(Harness))));
}
function form() { return draft.formProps; }
function submit() {
  const preventDefault = vi.fn();
  act(() => form().onSubmit({ preventDefault } as unknown as FormEvent));
  expect(preventDefault).toHaveBeenCalledOnce();
}
function setName(name: string) {
  act(() => { form().setCourseNameInput(name); form().setCourseNameEdited(name !== form().suggestedCourseName); });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  vault = createEmptyVault();
  vault.campuses = [{ id: "east", name: "东校区" }, { id: "west", name: "西校区" }];
  vault.profile.homeCampusId = "east";
  vault.profile.defaultSalaryGradeId = "custom_salary_teacher";
  vault.students = [
    { id: "a", name: "甲", grade: "初三", status: "active", defaultCampusId: "west" },
    { id: "b", name: "乙", grade: "高一", status: "active", defaultCampusId: "east" },
    { id: "c", name: "丙", grade: "初三", status: "active", defaultCampusId: "east" },
    { id: "paused", name: "归档", grade: "初三", status: "paused" },
    { id: "transition", name: "过渡", grade: "初三", status: "transition" }
  ];
  vault.preferences!.subjects = ["数学", "语文"];
  vault.preferences!.customCourseTypes = [{ id: "custom_mixed", label: "混合班" }];
  vault.preferences!.courseTypeFeeRules = {
    one_on_one: { mode: "hourly", hourlyRate: 80 },
    trial: { mode: "fixed", fixedFee: 60 },
    custom_mixed: { mode: "class_headcount", classFeeTiers: [{ id: "mixed", minStudents: 1, baseFee: 100, perStudentFee: 10 }] }
  };
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

describe("new course form workflow", () => {
  it("starts with the configured backup fee and uses salary defaults only after an explicit type change", () => {
    expect(form()).toMatchObject({ courseType: "one_on_one", courseCampusInput: "east", courseCampusCustomized: false, courseStatusInput: "active", courseStudentIds: [], courseFeeRule: { mode: "class_headcount", baseFee: 160 } });
    expect(form().courseSubjectInput).toBe(subjectOptionsForVault(vault)[0]);
    act(() => form().onChangeCourseType("small_class"));
    expect(form().courseFeeRule).toEqual({ mode: "salary_grade", salaryGradeSource: "teacher_default", salaryGradeId: "custom_salary_teacher" });
    act(() => form().onChangeCourseType("trial"));
    expect(form().courseFeeRule).toEqual({ mode: "fixed", fixedFee: 60 });
  });

  it("follows the first student's name until a manual name is entered, and resumes when it matches the suggestion", () => {
    act(() => form().onToggleCourseStudent("a"));
    expect(form().courseNameInput).toBe("甲");
    setName("自定义课名");
    act(() => form().onToggleCourseStudent("a"));
    act(() => form().onToggleCourseStudent("c"));
    expect(form().suggestedCourseName).toBe("丙");
    expect(form().courseNameInput).toBe("自定义课名");
    setName("丙");
    act(() => form().onToggleCourseStudent("c"));
    expect(form().courseNameInput).toBe("");
    act(() => form().onToggleCourseStudent("a"));
    expect(form().courseNameInput).toBe("甲");
  });

  it("follows student campuses until the user manually chooses one, including an empty choice", () => {
    act(() => form().onToggleCourseStudent("a"));
    expect(form().courseCampusInput).toBe("west");
    act(() => form().onToggleCourseStudent("a"));
    expect(form().courseCampusInput).toBe("west");
    act(() => form().onChangeCourseCampus("east"));
    act(() => form().onToggleCourseStudent("a"));
    expect(form()).toMatchObject({ courseCampusInput: "east", courseCampusCustomized: true });
    act(() => form().onChangeCourseCampus(""));
    act(() => form().onToggleCourseStudent("a"));
    act(() => form().onToggleCourseStudent("c"));
    expect(form().courseCampusInput).toBe("");
    submit();
    expect(onAddCourse.mock.calls[0][0].defaultCampusId).toBe("east");
  });

  it("excludes inactive or missing additions and enforces grade and course-size limits", () => {
    act(() => form().onChangeCourseType("one_on_two"));
    act(() => form().onToggleCourseStudent("a"));
    for (const id of ["paused", "transition", "missing", "b"]) act(() => form().onToggleCourseStudent(id));
    expect(form().courseStudentIds).toEqual(["a"]);
    act(() => form().onToggleCourseStudent("c"));
    expect(form().courseStudentIds).toEqual(["a", "c"]);
    act(() => form().onChangeCourseType("one_on_one"));
    expect(form().courseStudentIds).toEqual(["a"]);
    act(() => form().onToggleCourseStudent("c"));
    expect(form().courseStudentIds).toEqual(["a"]);
  });

  it("removes archived students from the draft without changing its campus", () => {
    act(() => form().onChangeCourseType("small_class"));
    act(() => form().onToggleCourseStudent("a"));
    act(() => form().onToggleCourseStudent("c"));
    act(() => draft.removeStudents(new Set(["a", "missing"])));
    expect(form()).toMatchObject({ courseStudentIds: ["c"], courseCampusInput: "west", courseNameInput: "丙" });
    act(() => draft.removeStudents(["c"]));
    expect(form()).toMatchObject({ courseStudentIds: [], courseCampusInput: "west", courseNameInput: "" });
    expect(onAddCourse).not.toHaveBeenCalled();
  });

  it("rechecks active status at submit and keeps the name/campus chosen before the student changed", () => {
    act(() => form().onToggleCourseStudent("a"));
    vault = { ...vault, students: vault.students.map(student => student.id === "a" ? { ...student, status: "paused" as const } : student) };
    render();
    submit();
    expect(onAddCourse.mock.calls[0][0]).toMatchObject({ name: "甲", studentIds: [], defaultCampusId: "west" });
  });

  it("prompts for matching rosters regardless of order, course name or status and only saves after confirmation", () => {
    vault.courseGroups = [{ id: "existing", name: "旧课程", type: "small_class", subject: " MATH ", defaultCampusId: "west", studentIds: ["c", "a"], feeRule: { mode: "fixed", fixedFee: 100 }, status: "paused" }];
    render();
    act(() => form().onChangeCourseType("small_class"));
    act(() => form().onToggleCourseStudent("a"));
    act(() => form().onToggleCourseStudent("c"));
    act(() => form().setCourseSubjectInput("math"));
    setName("新名称");
    submit();
    expect(onAddCourse).not.toHaveBeenCalled();
    expect(form().courseStudentIds).toEqual(["a", "c"]);
    expect(confirm).toHaveBeenCalledOnce();
    const prompt = confirm.mock.calls[0][0];
    expect(prompt).toMatchObject({ title: "可能重复添加课程", confirmLabel: "仍然添加", tone: "danger" });
    expect(prompt.description).toContain("旧课程");
    act(() => prompt.onConfirm());
    expect(onAddCourse).toHaveBeenCalledOnce();
    expect(onAddCourse.mock.calls[0][0]).toMatchObject({ name: "新名称", studentIds: ["a", "c"], subject: "math" });
  });

  it("retains duplicate-count distinctions and does not silently deduplicate legacy rosters", () => {
    vault.courseGroups = [{ id: "legacy", name: "重复ID旧课程", type: "one_on_one", subject: subjectOptionsForVault(vault)[0], defaultCampusId: "west", studentIds: ["a", "a"], feeRule: { mode: "fixed", fixedFee: 100 }, status: "active" }];
    render();
    act(() => form().onToggleCourseStudent("a"));
    submit();
    expect(confirm).not.toHaveBeenCalled();
    expect(onAddCourse).toHaveBeenCalledOnce();
  });

  it("trims the submitted values and resets only the original subset of fields", () => {
    act(() => form().onChangeCourseType("trial"));
    act(() => form().onToggleCourseStudent("a"));
    setName("  试听新课  ");
    act(() => {
      form().setCourseSubjectInput("  数学  "); form().setCourseStatusInput("paused");
      form().setNewCourseStudentSearch("甲"); form().setNewCourseStudentGradeFilter("初三"); form().setNewCourseStudentCampusFilter("west");
      form().onChangeCourseCampus("west");
    });
    act(() => form().onUpdateTrialFixedFee(95));
    submit();
    expect(onAddCourse.mock.calls[0][0]).toMatchObject({ id: expect.stringMatching(/^course_/), name: "试听新课", subject: "数学", type: "trial", defaultCampusId: "west", studentIds: ["a"], status: "paused", feeRule: { mode: "fixed", fixedFee: 95 } });
    expect(form()).toMatchObject({ courseNameInput: "", courseSubjectInput: "", courseStudentIds: [], courseCampusInput: "east", courseCampusCustomized: false, courseStatusInput: "active", courseType: "trial", courseFeeRule: { mode: "fixed", fixedFee: 60 }, newCourseStudentSearch: "", newCourseStudentGradeFilter: "初三", newCourseStudentCampusFilter: "west" });
    render();
    expect(form().courseSubjectInput).toBe("");
  });

  it("preserves drafts across unrelated updates and repairs removed options using the original fallbacks", () => {
    act(() => form().onToggleCourseStudent("a"));
    setName("保留草稿");
    act(() => form().onChangeCourseCampus("west"));
    act(() => form().setCourseSubjectInput("数学"));
    const fee = form().courseFeeRule;
    vault = { ...vault, profile: { ...vault.profile, note: "unrelated" } };
    render();
    expect(form()).toMatchObject({ courseNameInput: "保留草稿", courseCampusInput: "west", courseSubjectInput: "数学", courseFeeRule: fee });
    vault = { ...vault, campuses: vault.campuses.filter(campus => campus.id !== "west"), preferences: { ...vault.preferences!, subjects: ["语文"], disabledCourseTypes: ["one_on_one"] } };
    render();
    expect(form()).toMatchObject({ courseNameInput: "保留草稿", courseCampusInput: "east", courseCampusCustomized: true, courseSubjectInput: "语文", courseType: courseTypeOptionsForVault(vault)[0].value });
  });

  it("keeps settings fee replacement separate from form edits that normalize student grades", () => {
    act(() => form().onChangeCourseType("custom_mixed"));
    act(() => form().onToggleCourseStudent("a"));
    act(() => form().onToggleCourseStudent("b"));
    const fee = { mode: "class_headcount" as const, makeupFeeMode: "custom" as const, classFeeTiers: [{ id: "new", minStudents: 2, baseFee: 120, perStudentFee: 15 }] };
    act(() => draft.syncCourseTypeFeeRule("small_class", fee));
    expect(form().courseFeeRule.mode).toBe("salary_grade");
    act(() => draft.syncCourseTypeFeeRule("custom_mixed", fee));
    expect(form().courseStudentIds).toEqual(["a", "b"]);
    act(() => form().onUpdateClassFeeTier("new", { baseFee: 180 }));
    expect(form().courseStudentIds).toEqual(["a"]);
    expect(form().courseFeeRule).toMatchObject({ baseFee: 180, makeupFeeMode: "custom", stageRates: { senior_3: { oneOnOneFee: 0, classBaseFee: 180, headcountIncrementFee: 15 } } });
    expect(fee.classFeeTiers[0].baseFee).toBe(120);
    act(() => draft.syncCourseTypeFeeRule("custom_mixed"));
    expect(form().courseFeeRule).toMatchObject({ mode: "salary_grade", salaryGradeSource: "teacher_default" });
  });

  it("does not save an unnamed empty form and retains the draft if persistence throws", () => {
    submit();
    expect(onAddCourse).not.toHaveBeenCalled();
    act(() => form().onToggleCourseStudent("a"));
    onAddCourse.mockImplementationOnce(() => { throw new Error("save failed"); });
    expect(submit).toThrow("save failed");
    expect(form()).toMatchObject({ courseNameInput: "甲", courseStudentIds: ["a"], courseCampusInput: "west" });
  });
});
