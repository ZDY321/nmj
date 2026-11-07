import { describe, expect, it } from "vitest";
import type { CourseGroup, FeeRule } from "@/shared/types";
import { createEmptyVault } from "./sampleData";
import { formatMoney } from "./helpers";
import { classHeadcountFeeDescription, courseBillingHint, courseFeeSummary, salaryGradeFeeDescription } from "./courseFeePresentation";

function vaultWithSalary() {
  const vault = createEmptyVault();
  vault.profile.defaultSalaryGradeId = "custom_salary_default";
  vault.profile.salaryGradeRules = [
    { id: "custom_salary_default", label: "默认等级", baseSalary: 3000, oneOnOneFee: 80, classBaseFee: 100, headcountIncrementFee: 10, stageRates: { senior_3: { oneOnOneFee: 120, classBaseFee: 160, headcountIncrementFee: 20 } } },
    { id: "custom_salary_specific", label: "指定等级A", baseSalary: 3500, oneOnOneFee: 90, classBaseFee: 110, headcountIncrementFee: 15 }
  ];
  vault.students = [{ id: "junior", name: "初中生", grade: "初三", status: "active" }, { id: "senior", name: "高中生", grade: "高三", status: "active" }];
  return vault;
}
function course(feeRule: FeeRule, patch: Partial<CourseGroup> = {}): CourseGroup {
  return { id: "course", name: "测试", type: "small_class", subject: "数学", studentIds: ["junior"], status: "active", feeRule, ...patch };
}

describe("course fee presentation", () => {
  it("keeps the missing-grade fallback and selects the highest recognized student stage", () => {
    const vault = vaultWithSalary();
    const fee: FeeRule = { mode: "salary_grade", salaryGradeSource: "teacher_default" };
    const highest = salaryGradeFeeDescription(vault, fee, ["missing", "junior", "senior"], true);
    expect(highest).toContain("默认等级 · 高三");
    expect(highest).toContain("一对一 " + formatMoney(120));
    expect(highest).toContain("班课底费 " + formatMoney(160));
    const fallback = salaryGradeFeeDescription(vault, fee, ["missing"], true);
    expect(fallback).toContain("未识别年级，按初三");
    expect(fallback).toContain("一对一 " + formatMoney(80));
  });

  it("resolves specific salary rules while keeping each existing source label", () => {
    const vault = vaultWithSalary();
    const fee: FeeRule = { mode: "salary_grade", salaryGradeSource: "specific", salaryGradeId: "custom_salary_specific" };
    expect(salaryGradeFeeDescription(vault, fee, ["junior"], true)).toContain("跟随默认等级：指定等级A");
    expect(courseFeeSummary(vault, course(fee), true)).toContain("指定等级：指定等级A");
    expect(courseFeeSummary(vault, course({ mode: "salary_grade" }), true)).toContain("跟随默认等级：默认等级");
  });

  it("preserves missing-rule text and masks every amount in hidden previews", () => {
    const empty = createEmptyVault();
    const fee: FeeRule = { mode: "salary_grade" };
    expect(salaryGradeFeeDescription(empty, fee, [], true)).toBeUndefined();
    expect(courseFeeSummary(empty, course(fee), true)).toBe("课时费等级：未设置默认等级");
    const vault = vaultWithSalary();
    const detail = salaryGradeFeeDescription(vault, fee, ["junior"], false)!;
    expect(detail.split("***")).toHaveLength(5);
    expect(detail).not.toContain(formatMoney(3000));
    expect(courseFeeSummary(vault, course(fee), false)).toContain("预估 ***");
    expect(classHeadcountFeeDescription(vault, "small_class", { mode: "class_headcount", baseFee: 150 }, [], false)).toContain("预计 ***");
  });

  it("uses the configured billing cap in salary previews without truncating the roster", () => {
    const vault = vaultWithSalary();
    vault.preferences!.courseTypeFeeRules = { small_class: { mode: "class_headcount", billableStudentCap: 3, classFeeTiers: [{ id: "tier", minStudents: 2, baseFee: 100, perStudentFee: 10 }] } };
    const item = course({ mode: "salary_grade" }, { studentIds: ["junior", "junior", "junior", "junior"] });
    const summary = courseFeeSummary(vault, item, true);
    expect(summary).toContain("当前 4 人 2小时标准课预估 " + formatMoney(110));
    expect(summary).toContain("超出计费人数上限 3 人，其中 1 人不计课时费");
    expect(summary).toContain("\n班课例：实际 110 分钟");
    expect(item.studentIds).toHaveLength(4);
  });

  it("preserves class headcount, fixed, trial fallback and hourly summary precedence", () => {
    const vault = vaultWithSalary();
    const headcount: FeeRule = { mode: "class_headcount", classFeeTiers: [{ id: "tier", minStudents: 2, baseFee: 100, perStudentFee: 15 }] };
    expect(classHeadcountFeeDescription(vault, "small_class", headcount, ["junior", "junior", "junior"], true)).toContain("预计 " + formatMoney(115));
    expect(courseFeeSummary(vault, course({ mode: "fixed", fixedFee: 60 }, { type: "trial" }), true)).toBe("单节固定费用：" + formatMoney(60));
    expect(courseFeeSummary(vault, course({ mode: "hourly", hourlyRate: 65 }, { type: "trial" }), true)).toBe("试听单次费用：" + formatMoney(65));
    expect(courseFeeSummary(vault, course({ mode: "hourly", hourlyRate: -10 }, { type: "one_on_one" }), true)).toBe("每小时：" + formatMoney(-10) + "；2小时预估：" + formatMoney(-20));
    expect(courseBillingHint("trial")).toBe("试听按单次固定金额计费。");
    expect(courseBillingHint("custom_class")).toContain("实际 110 分钟，默认计费 2 小时");
  });
});
