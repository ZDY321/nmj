import type { ClassFeeTier, CourseType, FeeRule, SalaryGradeStage, SalaryGradeStageRateConfig, Student, TeacherVault } from "@/shared/types";
import { backupFeeRuleForCourseType, defaultSalaryGradeRule, feeRuleForCourseType, normalizedClassFeeTiers, salaryGradeStageOrder } from "@/frontend/lib/calculations";
import { courseRequiresSameGradeStudents, studentLimitForCourseType } from "@/frontend/lib/helpers";

export function firstCourseStudentCampus(vault: TeacherVault, studentIds: string[]): string | undefined {
  return studentIds
    .map((studentId) => vault.students.find((student) => student.id === studentId)?.defaultCampusId)
    .find(Boolean);
}

export function firstCourseStudentGrade(vault: TeacherVault, studentIds: string[]): string | undefined {
  if (studentIds.length === 0) return undefined;
  return vault.students.find((student) => student.id === studentIds[0])?.grade ?? "";
}

export function normalizeCourseStudentIds(vault: TeacherVault, type: CourseType, studentIds: string[], feeRule?: FeeRule): string[] {
  let nextStudentIds = studentIds;
  if (courseRequiresSameGradeStudents(vault, type, feeRule)) {
    const selectedGrade = firstCourseStudentGrade(vault, nextStudentIds);
    if (selectedGrade !== undefined) {
      nextStudentIds = nextStudentIds.filter((studentId) => (vault.students.find((student) => student.id === studentId)?.grade ?? "") === selectedGrade);
    }
  }
  const limit = studentLimitForCourseType(type);
  return limit ? nextStudentIds.slice(0, limit) : nextStudentIds;
}

export function canAddStudentToCourse(vault: TeacherVault, type: CourseType, feeRule: FeeRule | undefined, selectedStudentIds: string[], student: Student): boolean {
  const selectedGrade = courseRequiresSameGradeStudents(vault, type, feeRule) ? firstCourseStudentGrade(vault, selectedStudentIds) : undefined;
  if (selectedGrade !== undefined && (student.grade ?? "") !== selectedGrade) return false;
  const limit = studentLimitForCourseType(type);
  return !limit || selectedStudentIds.length < limit;
}

export function stageRatesFromTierForCourseType(tier: ClassFeeTier): Record<SalaryGradeStage, SalaryGradeStageRateConfig> {
  const usesClassBase = tier.minStudents > 1;
  const rate = {
    oneOnOneFee: usesClassBase ? 0 : Math.max(tier.baseFee, 0),
    classBaseFee: usesClassBase ? Math.max(tier.baseFee, 0) : 0,
    headcountIncrementFee: Math.max(tier.perStudentFee ?? 0, 0)
  };
  return salaryGradeStageOrder.reduce(
    (rates, stage) => {
      rates[stage] = rate;
      return rates;
    },
    {} as Record<SalaryGradeStage, SalaryGradeStageRateConfig>
  );
}

export function normalizeCourseFeeRuleForType(type: CourseType, feeRule: FeeRule): FeeRule {
  if (type === "trial") return backupFeeRuleForCourseType(type, feeRule);
  if (feeRule.mode === "salary_grade") {
    return {
      mode: "salary_grade",
      salaryGradeSource: feeRule.salaryGradeSource ?? "teacher_default",
      salaryGradeId: feeRule.salaryGradeId
    };
  }
  return backupFeeRuleForCourseType(type, feeRule);
}

export function supportsSalaryGradeFee(type: CourseType): boolean {
  return type !== "trial";
}

export function courseTypeDefaultFeeRule(vault: TeacherVault, type: CourseType): FeeRule {
  if (supportsSalaryGradeFee(type)) {
    return {
      mode: "salary_grade",
      salaryGradeSource: "teacher_default",
      salaryGradeId: vault.profile.defaultSalaryGradeId ?? defaultSalaryGradeRule(vault).id
    };
  }
  return backupFeeRuleForCourseType(type, feeRuleForCourseType(vault, type));
}

export function withTrialFixedFee(rule: FeeRule, fixedFee: number): FeeRule {
  return {
    ...rule,
    mode: "fixed",
    fixedFee,
    hourlyRate: undefined,
    baseFee: undefined,
    perPresentStudentFee: undefined,
    classFeeTiers: undefined
  };
}

// Per-course editing rebuilds all stage rates from the chosen tier. Course-type
// defaults deliberately preserve their existing stage rates in StudentsView.
export function withCourseClassFeeTiers(rule: FeeRule, nextTiers: ClassFeeTier[]): FeeRule {
  const sortedTiers = [...nextTiers].sort((a, b) => a.minStudents - b.minStudents);
  const firstTier = sortedTiers[0];
  return {
    ...rule,
    mode: "class_headcount",
    baseFee: firstTier?.baseFee ?? rule.baseFee,
    perPresentStudentFee: firstTier?.perStudentFee ?? rule.perPresentStudentFee,
    classFeeTiers: sortedTiers,
    stageRates: firstTier ? stageRatesFromTierForCourseType(firstTier) : rule.stageRates
  };
}

export function patchedCourseClassFeeTiers(rule: FeeRule, tierId: string, patch: Partial<ClassFeeTier>): ClassFeeTier[] {
  const tiers = normalizedClassFeeTiers(rule);
  const tier = tiers.find((item) => item.id === tierId) ?? tiers[0];
  return [{ ...tier, ...patch, maxStudents: undefined }];
}
