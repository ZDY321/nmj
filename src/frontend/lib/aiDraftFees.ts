import {
  billableStudentCapForCourseType,
  defaultSalaryGradeRule,
  feeRuleForCourseType,
  salaryGradeRateForStage,
  salaryGradeRuleById
} from "@/frontend/lib/calculations";
import {
  courseTypeLabel
} from "@/frontend/lib/helpers";
import {
  isPlainRecord as isPlainRecordLocal,
  numberValue,
  stringValue
} from "@/frontend/lib/typeGuards";
import type {
  ClassFeeTier,
  CourseType,
  FeeRule,
  SalaryGradeId,
  TeacherVault
} from "@/shared/types";

import type { AiDraftContext } from "./aiDraftTypes";

export function feeModeLabel(mode: FeeRule["mode"]): string {
  if (mode === "salary_grade") return "课时费等级计费";
  if (mode === "class_headcount") return "按人数班课计费";
  if (mode === "fixed") return "按单节固定计费";
  return "按小时计费";
}

export function defaultFeeRuleForVaultCourseType(vault: TeacherVault, type: CourseType): FeeRule {
  if (type !== "trial") {
    return {
      mode: "salary_grade",
      salaryGradeSource: "teacher_default",
      salaryGradeId: vault.profile.defaultSalaryGradeId ?? defaultSalaryGradeRule(vault).id
    };
  }
  return feeRuleForCourseType(vault, type);
}

export function defaultFeeRuleForCustomTemplate(
  vault: TeacherVault,
  template: "class" | "non_class" | "hourly"
): FeeRule {
  if (template === "hourly") {
    return { mode: "hourly", hourlyRate: 0 };
  }
  const defaultGradeRule = salaryGradeRuleById(vault.profile.defaultSalaryGradeId, vault) ?? defaultSalaryGradeRule(vault);
  const juniorRate = salaryGradeRateForStage(defaultGradeRule, "junior_3");
  const minStudents = template === "class" ? 5 : 1;
  const baseFee = template === "class" ? juniorRate.classBaseFee : juniorRate.oneOnOneFee;
  const tier = {
    id: "tier_1_plus",
    minStudents: Math.max(Math.round(minStudents), 0),
    baseFee: Math.max(baseFee, 0),
    perStudentFee: Math.max(juniorRate.headcountIncrementFee, 0)
  };
  return {
    mode: "class_headcount",
    baseFee: tier.baseFee,
    perPresentStudentFee: tier.perStudentFee,
    classFeeTiers: [tier],
    billableStudentCap: template === "class" ? billableStudentCapForCourseType("small_class") : undefined,
    stageRates: defaultGradeRule.stageRates,
    makeupFeeMode: "perStudentFee"
  };
}

export function feeRuleFromAiData(data: Record<string, unknown>, vault: TeacherVault, type: CourseType, fallback?: FeeRule): FeeRule {
  const source = isPlainRecordLocal(data.feeRule) ? data.feeRule : data;
  const courseTypeRule = defaultFeeRuleForVaultCourseType(vault, type);
  const templateRule = fallback?.mode === courseTypeRule.mode ? fallback : courseTypeRule;
  const mode = stringValue(source.mode ?? source.feeMode).toLowerCase();
  const salaryGradeId = stringValue(source.salaryGradeId ?? source.gradeId ?? source.positionGradeId);
  if (mode === "salary_grade" || mode === "salary" || mode === "岗位薪资" || mode === "岗位薪资等级" || mode === "课时费等级") {
    return {
      mode: "salary_grade",
      salaryGradeSource: salaryGradeId ? "specific" : "teacher_default",
      salaryGradeId: (salaryGradeId || vault.profile.defaultSalaryGradeId) as SalaryGradeId | undefined
    };
  }
  const baseFee = numberValue(source.baseFee ?? source.classBaseFee ?? source.minimumFee);
  const perStudentFee = numberValue(source.perPresentStudentFee ?? source.perStudentFee ?? source.extraStudentFee ?? source.headcountFee);
  const minStudents = numberValue(source.minStudents ?? source.minimumStudents ?? source.includedStudents);
  const hourlyRate = numberValue(source.hourlyRate ?? source.rate);
  const fixedFee = numberValue(source.fixedFee);

  if (templateRule.mode === "class_headcount") {
    const tier = normalizedSingleClassFeeTier(templateRule);
    const nextTier = {
      id: tier.id,
      minStudents: Math.max(Math.round(minStudents ?? tier.minStudents ?? 1), 0),
      baseFee: Math.max(baseFee ?? tier.baseFee ?? 0, 0),
      perStudentFee: Math.max(perStudentFee ?? tier.perStudentFee ?? 0, 0)
    };
    return {
      ...templateRule,
      mode: "class_headcount",
      baseFee: nextTier.baseFee,
      perPresentStudentFee: nextTier.perStudentFee,
      classFeeTiers: [nextTier],
      makeupFeeMode: templateRule.makeupFeeMode ?? "perStudentFee"
    };
  }

  if (templateRule.mode === "fixed") {
    return {
      mode: "fixed",
      fixedFee: Math.max(fixedFee ?? templateRule.fixedFee ?? 0, 0)
    };
  }

  return {
    mode: "hourly",
    hourlyRate: Math.max(hourlyRate ?? templateRule.hourlyRate ?? 0, 0)
  };
}

export function normalizedSingleClassFeeTier(rule: FeeRule): ClassFeeTier {
  const explicit = (rule.classFeeTiers ?? []).filter((tier) => Number.isFinite(tier.minStudents));
  const tier = explicit.length > 0
    ? [...explicit].sort((a, b) => a.minStudents - b.minStudents)[0]
    : {
        id: "tier_1_plus",
        minStudents: 1,
        baseFee: rule.baseFee ?? 0,
        perStudentFee: rule.perPresentStudentFee ?? 0
      };
  return {
    id: tier.id || "tier_1_plus",
    minStudents: tier.minStudents,
    baseFee: tier.baseFee,
    perStudentFee: tier.perStudentFee
  };
}

export function createAiDraftFees({ nextVault, blockers }: AiDraftContext) {
  const aiDataFeeMode = (data: Record<string, unknown>): FeeRule["mode"] | null => {
    const source = isPlainRecordLocal(data.feeRule) ? data.feeRule : data;
    const mode = stringValue(source.mode ?? source.feeMode).toLowerCase();
    if (mode === "salary_grade" || mode === "salary" || mode === "岗位薪资" || mode === "岗位薪资等级" || mode === "课时费等级") return "salary_grade";
    if (mode === "class_headcount" || mode === "class") return "class_headcount";
    if (mode === "fixed") return "fixed";
    if (mode === "hourly") return "hourly";
    if (
      source.baseFee !== undefined ||
      source.classBaseFee !== undefined ||
      source.minimumFee !== undefined ||
      source.perPresentStudentFee !== undefined ||
      source.perStudentFee !== undefined ||
      source.extraStudentFee !== undefined ||
      source.headcountFee !== undefined ||
      source.minStudents !== undefined ||
      source.minimumStudents !== undefined ||
      source.includedStudents !== undefined
    ) {
      return "class_headcount";
    }
    if (source.fixedFee !== undefined) return "fixed";
    if (source.hourlyRate !== undefined || source.rate !== undefined) return "hourly";
    return null;
  };

  const enforceAiFeeModeMatchesCourseType = (
    data: Record<string, unknown>,
    type: CourseType,
    courseLabel: string
  ): boolean => {
    const requestedMode = aiDataFeeMode(data);
    if (!requestedMode) return true;
    const templateMode = defaultFeeRuleForVaultCourseType(nextVault, type).mode;
    if (requestedMode === templateMode) return true;
    blockers.push(
      `未写入课程「${courseLabel}」：AI 试图把班型「${courseTypeLabel(nextVault, type)}」从「${feeModeLabel(templateMode)}」改成「${feeModeLabel(requestedMode)}」。课程档案需沿用后台班型计费模式；请先在后台修改班型计费，或改选按人数计费的班型。`
    );
    return false;
  };

  const needsClassFeeConfirmation = (
    data: Record<string, unknown>,
    type: CourseType,
    studentCount: number,
    fallback?: FeeRule,
    forceCheck = false
  ): string | null => {
    const source = isPlainRecordLocal(data.feeRule) ? data.feeRule : data;
    const templateRule = fallback ?? defaultFeeRuleForVaultCourseType(nextVault, type);
    const mode = stringValue(source.mode ?? source.feeMode).toLowerCase();
    const hasExplicitClassFeeSignal =
      mode === "class_headcount" ||
      mode === "class" ||
      source.baseFee !== undefined ||
      source.classBaseFee !== undefined ||
      source.minimumFee !== undefined ||
      source.perPresentStudentFee !== undefined ||
      source.perStudentFee !== undefined ||
      source.extraStudentFee !== undefined ||
      source.headcountFee !== undefined ||
      source.minStudents !== undefined ||
      source.minimumStudents !== undefined ||
      source.includedStudents !== undefined;
    const hasClassFeeSignal =
      forceCheck ||
      templateRule.mode === "class_headcount" ||
      hasExplicitClassFeeSignal;
    if (!hasClassFeeSignal) return null;

    const explicitDefault = Boolean(
      source.useDefaultFeeRule ??
      source.useDefaultClassFee ??
      source.useTemplateFeeRule ??
      source.useExistingFeeRule ??
      source.keepFeeRule
    );
    if (explicitDefault) return null;

    const hasMinStudents = source.minStudents !== undefined || source.minimumStudents !== undefined || source.includedStudents !== undefined;
    const hasBaseFee = source.baseFee !== undefined || source.classBaseFee !== undefined || source.minimumFee !== undefined;
    const hasPerStudentFee =
      source.perPresentStudentFee !== undefined ||
      source.perStudentFee !== undefined ||
      source.extraStudentFee !== undefined ||
      source.headcountFee !== undefined;
    if (!hasMinStudents || !hasBaseFee || !hasPerStudentFee) {
      return "班课/多人课需要先确认计费规则：最少人数、基础费用、每增加1人费用。最少人数不是当前关联学生人数，通常从 1 人起。";
    }

    const minStudents = numberValue(source.minStudents ?? source.minimumStudents ?? source.includedStudents);
    if (studentCount > 1 && minStudents === studentCount) {
      return `当前关联 ${studentCount} 人，但最少人数通常不是关联人数。请确认最少人数是否为 ${studentCount}，还是 1，并同时确认基础费用和每增加1人费用。`;
    }
    return null;
  };

  return { aiDataFeeMode, enforceAiFeeModeMatchesCourseType, needsClassFeeConfirmation };
}
