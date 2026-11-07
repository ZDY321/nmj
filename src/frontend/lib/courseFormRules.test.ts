import { describe, expect, it } from "vitest";
import type { FeeRule, Student } from "@/shared/types";
import { createEmptyVault } from "./sampleData";
import { backupFeeRuleForCourseType, salaryGradeStageOrder } from "./calculations";
import { canAddStudentToCourse, courseTypeDefaultFeeRule, firstCourseStudentCampus, firstCourseStudentGrade, normalizeCourseFeeRuleForType, normalizeCourseStudentIds, patchedCourseClassFeeTiers, withCourseClassFeeTiers, withTrialFixedFee } from "./courseFormRules";

function rosterVault() {
  const vault = createEmptyVault();
  vault.students = [
    { id: "a", name: "甲", grade: "初三", status: "active", defaultCampusId: "east" },
    { id: "b", name: "乙", grade: "初三", status: "paused", defaultCampusId: "west" },
    { id: "c", name: "丙", grade: "高一", status: "active" },
    { id: "unset", name: "未分年级", status: "active" },
    { id: "a", name: "重复编号", grade: "高一", status: "active", defaultCampusId: "other" }
  ];
  return vault;
}

describe("course form roster rules", () => {
  it("preserves first-match lookup, missing-first grade and first available campus behavior", () => {
    const vault = rosterVault();
    expect(firstCourseStudentGrade(vault, [])).toBeUndefined();
    expect(firstCourseStudentGrade(vault, ["missing", "a"])).toBe("");
    expect(firstCourseStudentGrade(vault, ["a", "c"])).toBe("初三");
    expect(firstCourseStudentCampus(vault, ["missing", "c", "a", "b"])).toBe("east");
    expect(firstCourseStudentCampus(vault, ["missing", "c"])).toBeUndefined();
  });

  it("keeps legacy selected students and duplicates while filtering by the first student's grade", () => {
    const vault = rosterVault();
    const selected = ["a", "c", "b", "a", "missing"];
    expect(normalizeCourseStudentIds(vault, "small_class", selected)).toEqual(["a", "b", "a"]);
    expect(normalizeCourseStudentIds(vault, "small_class", ["missing", "unset", "a"])).toEqual(["missing", "unset"]);
    expect(normalizeCourseStudentIds(vault, "trial", selected)).toEqual(selected);
    expect(selected).toEqual(["a", "c", "b", "a", "missing"]);
  });

  it("applies same-grade filtering before course-size limits", () => {
    const vault = rosterVault();
    expect(normalizeCourseStudentIds(vault, "one_on_one", ["c", "a", "b"])).toEqual(["c"]);
    expect(normalizeCourseStudentIds(vault, "one_on_two", ["a", "c", "b", "a"])).toEqual(["a", "b"]);
    expect(canAddStudentToCourse(vault, "one_on_two", undefined, ["a"], vault.students[2])).toBe(false);
    expect(canAddStudentToCourse(vault, "one_on_two", undefined, ["a", "b"], vault.students[0])).toBe(false);
    // Status eligibility belongs to the caller; existing and transition rosters have different policies.
    expect(canAddStudentToCourse(vault, "one_on_two", undefined, ["a"], vault.students[1])).toBe(true);
  });

  it("uses a custom course's headcount threshold to decide whether grades must match", () => {
    const vault = rosterVault();
    const candidate: Student = vault.students[2];
    const rule: FeeRule = { mode: "class_headcount", classFeeTiers: [{ id: "tier", minStudents: 2, baseFee: 100 }] };
    expect(canAddStudentToCourse(vault, "custom_mixed", rule, ["a"], candidate)).toBe(false);
    rule.classFeeTiers![0].minStudents = 1;
    expect(canAddStudentToCourse(vault, "custom_mixed", rule, ["a"], candidate)).toBe(true);
  });
});

describe("course form fee edits", () => {
  it("keeps unrelated options while clearing obsolete fields for a trial fixed fee", () => {
    const rule: FeeRule = { mode: "hourly", hourlyRate: 80, baseFee: 100, perPresentStudentFee: 20, classFeeTiers: [], makeupFeeMode: "custom", billableStudentCap: 8 };
    const before = structuredClone(rule);
    expect(withTrialFixedFee(rule, 135)).toEqual({ ...rule, mode: "fixed", fixedFee: 135, hourlyRate: undefined, baseFee: undefined, perPresentStudentFee: undefined, classFeeTiers: undefined });
    expect(rule).toEqual(before);
  });

  it("rebuilds per-course stage rates from the lowest tier without mutating the source", () => {
    const rule: FeeRule = { mode: "class_headcount", makeupFeeMode: "sameAsOriginal", billableStudentCap: 12, stageRates: { senior_3: { oneOnOneFee: 999, classBaseFee: 999, headcountIncrementFee: 99 } } };
    const tiers = [{ id: "later", minStudents: 5, baseFee: 300, perStudentFee: 30 }, { id: "first", minStudents: 2, baseFee: 120, perStudentFee: 15 }];
    const before = structuredClone({ rule, tiers });
    const updated = withCourseClassFeeTiers(rule, tiers);
    expect(updated.classFeeTiers?.map(tier => tier.id)).toEqual(["first", "later"]);
    expect(updated).toMatchObject({ mode: "class_headcount", baseFee: 120, perPresentStudentFee: 15, makeupFeeMode: "sameAsOriginal", billableStudentCap: 12 });
    for (const stage of salaryGradeStageOrder) expect(updated.stageRates?.[stage]).toEqual({ oneOnOneFee: 0, classBaseFee: 120, headcountIncrementFee: 15 });
    expect({ rule, tiers }).toEqual(before);
    // Course-type defaults retain their grade-specific rates instead of using the editing policy.
    expect(backupFeeRuleForCourseType("small_class", rule).stageRates?.senior_3?.classBaseFee).toBe(999);
  });

  it("preserves empty-tier fallbacks and clips generated rates without rewriting the entered tier", () => {
    const rule: FeeRule = { mode: "class_headcount", baseFee: 80, perPresentStudentFee: 10, stageRates: { junior_3: { oneOnOneFee: 80, classBaseFee: 100, headcountIncrementFee: 10 } } };
    const empty = withCourseClassFeeTiers(rule, []);
    expect(empty).toEqual({ ...rule, classFeeTiers: [] });
    const updated = withCourseClassFeeTiers(rule, [{ id: "single", minStudents: 1, baseFee: -1, perStudentFee: -2 }]);
    expect(updated.baseFee).toBe(-1);
    expect(updated.stageRates?.junior_3).toEqual({ oneOnOneFee: 0, classBaseFee: 0, headcountIncrementFee: 0 });
  });

  it("uses the normalized first tier for missing IDs and removes legacy maximums", () => {
    const rule: FeeRule = { mode: "class_headcount", classFeeTiers: [{ id: "late", minStudents: 6, baseFee: 200 }, { id: "early", minStudents: 2, maxStudents: 5, baseFee: 100, perStudentFee: 10 }] };
    const before = structuredClone(rule);
    expect(patchedCourseClassFeeTiers(rule, "missing", { perStudentFee: 25, maxStudents: 8 })).toEqual([{ id: "early", minStudents: 2, maxStudents: undefined, baseFee: 100, perStudentFee: 25 }]);
    expect(rule).toEqual(before);
    expect(patchedCourseClassFeeTiers({ mode: "class_headcount", baseFee: 75 }, "missing", { minStudents: 3 })[0]).toMatchObject({ minStudents: 3, baseFee: 75 });
  });

  it("preserves specific salary grades and drops fields that do not belong to that mode", () => {
    expect(normalizeCourseFeeRuleForType("small_class", { mode: "salary_grade", salaryGradeSource: "specific", salaryGradeId: "custom_salary_test", hourlyRate: 50, makeupFeeMode: "custom" })).toEqual({ mode: "salary_grade", salaryGradeSource: "specific", salaryGradeId: "custom_salary_test" });
    expect(normalizeCourseFeeRuleForType("one_on_one", { mode: "salary_grade" })).toEqual({ mode: "salary_grade", salaryGradeSource: "teacher_default", salaryGradeId: undefined });
    expect(normalizeCourseFeeRuleForType("trial", { mode: "hourly", hourlyRate: 55 })).toEqual({ mode: "fixed", fixedFee: 55 });
  });

  it("chooses teacher-default salary rules for regular courses and the trial's fixed fallback", () => {
    const vault = createEmptyVault();
    vault.profile.defaultSalaryGradeId = "custom_salary_test";
    vault.preferences!.courseTypeFeeRules = { trial: { mode: "fixed", fixedFee: 65 } };
    expect(courseTypeDefaultFeeRule(vault, "small_class")).toEqual({ mode: "salary_grade", salaryGradeSource: "teacher_default", salaryGradeId: "custom_salary_test" });
    expect(courseTypeDefaultFeeRule(vault, "trial")).toEqual({ mode: "fixed", fixedFee: 65 });
  });
});
