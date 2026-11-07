import type { CourseGroup, CourseType, FeeRule, TeacherVault } from "@/shared/types";
import { billableStudentCapForRule, calculateClassHeadcountFee, classHeadcountBaseStudentCountForRule, courseUsesClassBilling, feeRuleForCourseType, fixedFeeForRule, resolveSalaryGradeRule, salaryGradeAmountForCount, salaryGradeLabel, salaryGradeRateForStage, salaryGradeStageForCourse, salaryGradeStageForStudentIds, salaryGradeStageLabels, usesStandardBillingHours } from "@/frontend/lib/calculations";
import { formatPrivateMoney } from "@/frontend/lib/helpers";

export const missingSalaryGradeDescription = "还没有设置老师默认课时费等级，请先在老师个人信息里设置。";

export function courseBillingHint(type: CourseType): string {
  if (type === "trial") return "试听按单次固定金额计费。";
  return usesStandardBillingHours(type)
    ? "按标准课时统计；例：10:10-12:00 实际 110 分钟，默认计费 2 小时，可在课节详情手动改为 1 小时等拆课课时。"
    : "按实际上课时长折算。";
}

export function salaryGradeFeeDescription(vault: TeacherVault, feeRule: FeeRule, studentIds: string[], amountsVisible: boolean): string | undefined {
  const rule = resolveSalaryGradeRule(vault, feeRule);
  if (!rule) return undefined;
  const stage = salaryGradeStageForStudentIds(vault, studentIds);
  const rate = salaryGradeRateForStage(rule, stage);
  return `跟随默认等级：${salaryGradeLabel(rule)} · ${stage ? salaryGradeStageLabels[stage] : "未识别年级，按初三"}：底薪 ${formatPrivateMoney(rule.baseSalary, amountsVisible)}，一对一 ${formatPrivateMoney(rate.oneOnOneFee, amountsVisible)}，班课底费 ${formatPrivateMoney(rate.classBaseFee, amountsVisible)}，人头加价 ${formatPrivateMoney(rate.headcountIncrementFee, amountsVisible)}。`;
}

export function classHeadcountFeeDescription(vault: TeacherVault, type: CourseType, feeRule: FeeRule, studentIds: string[], amountsVisible: boolean): string {
  const stage = salaryGradeStageForStudentIds(vault, studentIds);
  const amount = calculateClassHeadcountFee(feeRule, studentIds.length, type, stage);
  return `当前关联 ${studentIds.length} 人，${stage ? salaryGradeStageLabels[stage] : "未识别年级，按初三"} 2小时标准课预计 ${formatPrivateMoney(amount, amountsVisible)}，${courseBillingHint(type)}`;
}

export function courseFeeSummary(vault: TeacherVault, course: CourseGroup, amountsVisible: boolean): string {
  const classBillingText = courseUsesClassBilling(course, vault) ? "\n班课例：实际 110 分钟，计费 2 小时，义务课时按计费时长扣减" : "";
  const cap = billableStudentCapForRule(course.type, feeRuleForCourseType(vault, course.type));
  const overflow = cap === undefined ? 0 : Math.max(course.studentIds.length - cap, 0);
  const capText = overflow > 0 ? `（超出计费人数上限 ${cap} 人，其中 ${overflow} 人不计课时费）` : "";
  if (course.feeRule.mode === "salary_grade") {
    const rule = resolveSalaryGradeRule(vault, course.feeRule);
    if (!rule) return "课时费等级：未设置默认等级";
    const stage = salaryGradeStageForCourse(vault, course);
    const amount = salaryGradeAmountForCount(rule, course.type, course.studentIds.length, stage, classHeadcountBaseStudentCountForRule(course.type, feeRuleForCourseType(vault, course.type)), cap);
    const source = course.feeRule.salaryGradeSource === "specific" ? "指定等级" : "跟随默认等级";
    return `${source}：${salaryGradeLabel(rule)} · ${stage ? salaryGradeStageLabels[stage] : "未识别年级，按初三"}，当前 ${course.studentIds.length} 人 2小时标准课预估 ${formatPrivateMoney(amount, amountsVisible)}${capText}${classBillingText}`;
  }
  if (course.feeRule.mode === "class_headcount") {
    const stage = salaryGradeStageForCourse(vault, course);
    const amount = calculateClassHeadcountFee(course.feeRule, course.studentIds.length, course.type, stage);
    return `自定义课时费：${stage ? salaryGradeStageLabels[stage] : "未识别年级，按初三"}，当前 ${course.studentIds.length} 人 2小时标准课预估 ${formatPrivateMoney(amount, amountsVisible)}${capText}${classBillingText}`;
  }
  if (course.feeRule.mode === "fixed") {
    return `单节固定费用：${formatPrivateMoney(course.feeRule.fixedFee ?? 0, amountsVisible)}`;
  }
  if (course.type === "trial") {
    return `试听单次费用：${formatPrivateMoney(fixedFeeForRule(course.feeRule), amountsVisible)}`;
  }
  const hourlyRate = course.feeRule.hourlyRate ?? 0;
  return `每小时：${formatPrivateMoney(hourlyRate, amountsVisible)}；2小时预估：${formatPrivateMoney(hourlyRate * 2, amountsVisible)}`;
}
