import type {
  CourseGroup,
  CourseType,
  FeeRule,
  LegacySalaryGradeId,
  Lesson,
  SalaryGradeId,
  SalaryGradeLevel,
  SalaryGradeRuleConfig,
  SalaryGradeStage,
  SalaryGradeStageRateConfig,
  TeacherVault
} from "../../shared/types";
import { billableStudentCapForCourseType, classHeadcountBaseStudentCountForCourseType, isSubstituteClassLesson, nonNegativeInteger, nonNegativeNumber } from "./billingPrimitives";

export const salaryGradeStageLabels: Record<SalaryGradeStage, string> = {
  primary: "小学",
  junior_1_2: "初一初二",
  junior_3: "初三",
  senior_1: "高一",
  senior_2: "高二",
  senior_3: "高三"
};

export const salaryGradeLevelLabels: Record<SalaryGradeLevel, string> = {
  beginner: "初级",
  intermediate: "中级",
  advanced_1: "高级1",
  advanced_2: "高级2",
  reserve: "储备"
};

export const salaryGradeStageOrder: SalaryGradeStage[] = [
  "primary",
  "junior_1_2",
  "junior_3",
  "senior_1",
  "senior_2",
  "senior_3"
];

const defaultSalaryGradeStageRates: Record<SalaryGradeLevel, Record<SalaryGradeStage, SalaryGradeStageRateConfig>> = {
  beginner: {
    primary: { oneOnOneFee: 55, classBaseFee: 40, headcountIncrementFee: 10 },
    junior_1_2: { oneOnOneFee: 65, classBaseFee: 50, headcountIncrementFee: 10 },
    junior_3: { oneOnOneFee: 75, classBaseFee: 60, headcountIncrementFee: 10 },
    senior_1: { oneOnOneFee: 95, classBaseFee: 95, headcountIncrementFee: 25 },
    senior_2: { oneOnOneFee: 105, classBaseFee: 105, headcountIncrementFee: 25 },
    senior_3: { oneOnOneFee: 115, classBaseFee: 115, headcountIncrementFee: 25 }
  },
  intermediate: {
    primary: { oneOnOneFee: 65, classBaseFee: 50, headcountIncrementFee: 10 },
    junior_1_2: { oneOnOneFee: 70, classBaseFee: 55, headcountIncrementFee: 12 },
    junior_3: { oneOnOneFee: 80, classBaseFee: 65, headcountIncrementFee: 12 },
    senior_1: { oneOnOneFee: 100, classBaseFee: 100, headcountIncrementFee: 25 },
    senior_2: { oneOnOneFee: 110, classBaseFee: 110, headcountIncrementFee: 25 },
    senior_3: { oneOnOneFee: 120, classBaseFee: 120, headcountIncrementFee: 25 }
  },
  advanced_1: {
    primary: { oneOnOneFee: 70, classBaseFee: 55, headcountIncrementFee: 10 },
    junior_1_2: { oneOnOneFee: 75, classBaseFee: 60, headcountIncrementFee: 15 },
    junior_3: { oneOnOneFee: 85, classBaseFee: 70, headcountIncrementFee: 15 },
    senior_1: { oneOnOneFee: 105, classBaseFee: 105, headcountIncrementFee: 30 },
    senior_2: { oneOnOneFee: 115, classBaseFee: 115, headcountIncrementFee: 30 },
    senior_3: { oneOnOneFee: 125, classBaseFee: 125, headcountIncrementFee: 30 }
  },
  advanced_2: {
    primary: { oneOnOneFee: 73, classBaseFee: 58, headcountIncrementFee: 10 },
    junior_1_2: { oneOnOneFee: 80, classBaseFee: 65, headcountIncrementFee: 18 },
    junior_3: { oneOnOneFee: 90, classBaseFee: 75, headcountIncrementFee: 18 },
    senior_1: { oneOnOneFee: 105, classBaseFee: 105, headcountIncrementFee: 30 },
    senior_2: { oneOnOneFee: 115, classBaseFee: 115, headcountIncrementFee: 30 },
    senior_3: { oneOnOneFee: 125, classBaseFee: 125, headcountIncrementFee: 30 }
  },
  reserve: {
    primary: { oneOnOneFee: 75, classBaseFee: 60, headcountIncrementFee: 10 },
    junior_1_2: { oneOnOneFee: 85, classBaseFee: 70, headcountIncrementFee: 20 },
    junior_3: { oneOnOneFee: 95, classBaseFee: 80, headcountIncrementFee: 20 },
    senior_1: { oneOnOneFee: 110, classBaseFee: 110, headcountIncrementFee: 35 },
    senior_2: { oneOnOneFee: 120, classBaseFee: 120, headcountIncrementFee: 35 },
    senior_3: { oneOnOneFee: 130, classBaseFee: 130, headcountIncrementFee: 35 }
  }
};

export type SalaryGradeRule = {
  id: SalaryGradeId;
  label: string;
  stage?: SalaryGradeStage;
  level?: SalaryGradeLevel;
  legacy?: boolean;
  custom?: boolean;
  baseSalary: number;
  guaranteedLessonCount: 5;
  lessonHours: 2;
  oneOnOneFee: number;
  classBaseFee: number;
  headcountIncrementFee: number;
  stageRates: Record<SalaryGradeStage, SalaryGradeStageRateConfig>;
};

function legacySalaryGradeId(stage: SalaryGradeStage, level: SalaryGradeLevel): LegacySalaryGradeId {
  return `${stage}:${level}`;
}

function salaryGradeRule(
  level: SalaryGradeLevel,
  baseSalary: number,
  oneOnOneFee: number,
  classBaseFee: number,
  headcountIncrementFee: number
): SalaryGradeRule {
  const stageRates = defaultSalaryGradeStageRates[level] ?? stageRatesFromSingleRate({ oneOnOneFee, classBaseFee, headcountIncrementFee });
  const defaultRate = stageRates.junior_3 ?? { oneOnOneFee, classBaseFee, headcountIncrementFee };
  return {
    id: level,
    label: salaryGradeLevelLabels[level],
    level,
    baseSalary,
    guaranteedLessonCount: 5,
    lessonHours: 2,
    oneOnOneFee: defaultRate.oneOnOneFee,
    classBaseFee: defaultRate.classBaseFee,
    headcountIncrementFee: defaultRate.headcountIncrementFee,
    stageRates
  };
}

function legacySalaryGradeRule(
  stage: SalaryGradeStage,
  level: SalaryGradeLevel,
  baseSalary: number,
  oneOnOneFee: number,
  classBaseFee: number,
  headcountIncrementFee: number
): SalaryGradeRule {
  return {
    id: legacySalaryGradeId(stage, level),
    label: `${salaryGradeStageLabels[stage]} · ${salaryGradeLevelLabels[level]}`,
    stage,
    level,
    legacy: true,
    baseSalary,
    guaranteedLessonCount: 5,
    lessonHours: 2,
    oneOnOneFee,
    classBaseFee,
    headcountIncrementFee,
    stageRates: stageRatesFromSingleRate({ oneOnOneFee, classBaseFee, headcountIncrementFee })
  };
}

function stageRatesFromSingleRate(rate: SalaryGradeStageRateConfig): Record<SalaryGradeStage, SalaryGradeStageRateConfig> {
  return salaryGradeStageOrder.reduce(
    (rates, stage) => {
      rates[stage] = normalizeStageRate(rate);
      return rates;
    },
    {} as Record<SalaryGradeStage, SalaryGradeStageRateConfig>
  );
}

export function normalizeStageRate(rate: Partial<SalaryGradeStageRateConfig> | undefined, fallback: SalaryGradeStageRateConfig = { oneOnOneFee: 0, classBaseFee: 0, headcountIncrementFee: 0 }): SalaryGradeStageRateConfig {
  return {
    oneOnOneFee: nonNegativeNumber(rate?.oneOnOneFee, fallback.oneOnOneFee),
    classBaseFee: nonNegativeNumber(rate?.classBaseFee, fallback.classBaseFee),
    headcountIncrementFee: nonNegativeNumber(rate?.headcountIncrementFee, fallback.headcountIncrementFee)
  };
}

export function normalizeStageRates(
  baseRate: SalaryGradeStageRateConfig,
  stageRates?: Partial<Record<SalaryGradeStage, SalaryGradeStageRateConfig>>,
  fallbackRates?: Record<SalaryGradeStage, SalaryGradeStageRateConfig>
): Record<SalaryGradeStage, SalaryGradeStageRateConfig> {
  return salaryGradeStageOrder.reduce(
    (rates, stage) => {
      rates[stage] = normalizeStageRate(stageRates?.[stage], fallbackRates?.[stage] ?? baseRate);
      return rates;
    },
    {} as Record<SalaryGradeStage, SalaryGradeStageRateConfig>
  );
}

export const defaultSalaryGradeRules: SalaryGradeRule[] = [
  salaryGradeRule("beginner", 2800, 75, 60, 10),
  salaryGradeRule("intermediate", 3000, 80, 65, 12),
  salaryGradeRule("advanced_1", 3200, 85, 70, 15),
  salaryGradeRule("advanced_2", 3300, 90, 75, 18),
  salaryGradeRule("reserve", 3500, 95, 80, 20)
];

export const salaryGradeRules: SalaryGradeRule[] = [
  ...defaultSalaryGradeRules
];

export const legacySalaryGradeRules: SalaryGradeRule[] = [
  legacySalaryGradeRule("primary", "beginner", 2800, 55, 40, 10),
  legacySalaryGradeRule("primary", "intermediate", 3000, 65, 50, 10),
  legacySalaryGradeRule("primary", "advanced_1", 3200, 70, 55, 10),
  legacySalaryGradeRule("primary", "advanced_2", 3300, 73, 58, 10),
  legacySalaryGradeRule("primary", "reserve", 3500, 75, 60, 10),
  legacySalaryGradeRule("junior_1_2", "beginner", 2800, 65, 50, 10),
  legacySalaryGradeRule("junior_1_2", "intermediate", 3000, 70, 55, 12),
  legacySalaryGradeRule("junior_1_2", "advanced_1", 3200, 75, 60, 15),
  legacySalaryGradeRule("junior_1_2", "advanced_2", 3300, 80, 65, 18),
  legacySalaryGradeRule("junior_1_2", "reserve", 3500, 85, 70, 20),
  legacySalaryGradeRule("junior_3", "beginner", 2800, 75, 60, 10),
  legacySalaryGradeRule("junior_3", "intermediate", 3000, 80, 65, 12),
  legacySalaryGradeRule("junior_3", "advanced_1", 3200, 85, 70, 15),
  legacySalaryGradeRule("junior_3", "advanced_2", 3300, 90, 75, 18),
  legacySalaryGradeRule("junior_3", "reserve", 3500, 95, 80, 20),
  legacySalaryGradeRule("senior_1", "intermediate", 3000, 100, 100, 25),
  legacySalaryGradeRule("senior_1", "advanced_1", 3200, 105, 105, 30),
  legacySalaryGradeRule("senior_1", "advanced_2", 3300, 105, 105, 30),
  legacySalaryGradeRule("senior_1", "reserve", 3500, 110, 110, 35),
  legacySalaryGradeRule("senior_2", "intermediate", 3000, 110, 110, 25),
  legacySalaryGradeRule("senior_2", "advanced_1", 3200, 115, 115, 30),
  legacySalaryGradeRule("senior_2", "advanced_2", 3300, 115, 115, 30),
  legacySalaryGradeRule("senior_2", "reserve", 3500, 120, 120, 35),
  legacySalaryGradeRule("senior_3", "intermediate", 3000, 120, 120, 25),
  legacySalaryGradeRule("senior_3", "advanced_1", 3200, 125, 125, 30),
  legacySalaryGradeRule("senior_3", "advanced_2", 3300, 125, 125, 30),
  legacySalaryGradeRule("senior_3", "reserve", 3500, 130, 130, 35)
];

function salaryGradeRuleFromConfig(config: SalaryGradeRuleConfig, fallback?: SalaryGradeRule): SalaryGradeRule {
  const baseRate = {
    oneOnOneFee: Math.max(config.oneOnOneFee, 0),
    classBaseFee: Math.max(config.classBaseFee, 0),
    headcountIncrementFee: Math.max(config.headcountIncrementFee, 0)
  };
  const stageRates = normalizeStageRates(baseRate, config.stageRates, fallback?.stageRates);
  const displayRate = stageRates.junior_3 ?? baseRate;
  return {
    id: config.id,
    label: (config.label ?? "").trim() || fallback?.label || String(config.id),
    level: fallback?.level,
    custom: !defaultSalaryGradeRules.some((rule) => rule.id === config.id),
    baseSalary: Math.max(config.baseSalary, 0),
    guaranteedLessonCount: 5,
    lessonHours: 2,
    oneOnOneFee: displayRate.oneOnOneFee,
    classBaseFee: displayRate.classBaseFee,
    headcountIncrementFee: displayRate.headcountIncrementFee,
    stageRates
  };
}

export function salaryGradeRulesForVault(vault?: TeacherVault): SalaryGradeRule[] {
  const overrides = vault?.profile.salaryGradeRules ?? [];
  const overrideMap = new Map(overrides.map((rule) => [rule.id, rule]));
  const visibleRules = defaultSalaryGradeRules.map((rule) => {
    const override = overrideMap.get(rule.id);
    return override ? salaryGradeRuleFromConfig(override, rule) : rule;
  });
  const customRules = overrides
    .filter((rule) => !defaultSalaryGradeRules.some((defaultRule) => defaultRule.id === rule.id))
    .map((rule) => salaryGradeRuleFromConfig(rule))
    .sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN") || a.id.localeCompare(b.id));
  return [...visibleRules, ...customRules];
}

export function salaryGradeLabel(ruleOrId: SalaryGradeRule | SalaryGradeId, vault?: TeacherVault): string {
  const rule = typeof ruleOrId === "string" ? salaryGradeRuleById(ruleOrId, vault) : ruleOrId;
  if (!rule) return "未设置课时费等级";
  return rule.label;
}

export function salaryGradeRuleById(id?: SalaryGradeId, vault?: TeacherVault): SalaryGradeRule | undefined {
  if (!id) return undefined;
  return (
    salaryGradeRulesForVault(vault).find((rule) => rule.id === id) ??
    legacySalaryGradeRules.find((rule) => rule.id === id)
  );
}

export function defaultSalaryGradeRule(vault?: TeacherVault): SalaryGradeRule {
  return salaryGradeRulesForVault(vault)[0] ?? defaultSalaryGradeRules[0];
}

export function resolveSalaryGradeRule(vault: TeacherVault, rule?: FeeRule): SalaryGradeRule | undefined {
  if (rule?.mode !== "salary_grade") return undefined;
  const id = rule.salaryGradeSource === "specific" ? rule.salaryGradeId : vault.profile.defaultSalaryGradeId;
  return salaryGradeRuleById(id, vault) ?? salaryGradeRuleById(rule.salaryGradeId, vault) ?? salaryGradeRuleById(vault.profile.defaultSalaryGradeId, vault);
}

export function salaryGradeStageForGrade(grade?: string): SalaryGradeStage | undefined {
  const value = (grade ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!value) return undefined;
  if (/高三|高中三|高3|12年级|十二年级|grade12|g12/.test(value)) return "senior_3";
  if (/高二|高中二|高2|11年级|十一年级|grade11|g11/.test(value)) return "senior_2";
  if (/高一|高中一|高1|10年级|十年级|grade10|g10/.test(value)) return "senior_1";
  if (/初三|初中三|初3|九年级|9年级|grade9|g9/.test(value)) return "junior_3";
  if (/初[一二12]|初中[一二12]|七年级|八年级|7年级|8年级|grade[78]|g[78]/.test(value)) return "junior_1_2";
  if (/小学|小[一二三四五六123456]|一年级|二年级|三年级|四年级|五年级|六年级|[1-6]年级|grade[1-6]|g[1-6]/.test(value)) return "primary";
  if (/高中|高/.test(value)) return "senior_1";
  if (/初中|初/.test(value)) return "junior_1_2";
  return undefined;
}

export function salaryGradeStageForStudentIds(vault: TeacherVault, studentIds: string[]): SalaryGradeStage | undefined {
  const stages = studentIds
    .map((studentId) => salaryGradeStageForGrade(vault.students.find((student) => student.id === studentId)?.grade))
    .filter((stage): stage is SalaryGradeStage => Boolean(stage));
  if (stages.length === 0) return undefined;
  return stages.sort((a, b) => salaryGradeStageOrder.indexOf(b) - salaryGradeStageOrder.indexOf(a))[0];
}

export function salaryGradeStageForCourse(vault: TeacherVault, course: CourseGroup): SalaryGradeStage | undefined {
  return salaryGradeStageForStudentIds(vault, course.studentIds);
}

export function salaryGradeStageForLesson(vault: TeacherVault, course: CourseGroup | undefined, lesson: Lesson): SalaryGradeStage | undefined {
  if (isSubstituteClassLesson(lesson)) return lesson.substituteClass?.salaryGradeStage;
  const lessonStage = salaryGradeStageForStudentIds(vault, lesson.expectedStudentIds);
  return lessonStage ?? (course ? salaryGradeStageForCourse(vault, course) : undefined);
}

export function salaryGradeRateForStage(rule: SalaryGradeRule, stage?: SalaryGradeStage): SalaryGradeStageRateConfig {
  return rule.stageRates[stage ?? "junior_3"] ?? rule.stageRates.junior_3 ?? {
    oneOnOneFee: rule.oneOnOneFee,
    classBaseFee: rule.classBaseFee,
    headcountIncrementFee: rule.headcountIncrementFee
  };
}

export const overflowHeadcountThreshold = 10;

export const overflowHeadcountFee = 10;

export type HeadcountAmountInput = {
  baseFee: number;
  incrementFee: number;
  baseStudentCount: number;
  presentStudentCount: number;
  billableStudentCap?: number;
};

export type HeadcountAmountBreakdown = {
  amount: number;
  billableStudentCount: number;
  gradedStudentCount: number;
  overflowStudentCount: number;
};

export function headcountAmountBreakdown(input: HeadcountAmountInput): HeadcountAmountBreakdown {
  const presentStudentCount = nonNegativeInteger(input.presentStudentCount);
  const cap = Number.isFinite(input.billableStudentCap) ? nonNegativeInteger(input.billableStudentCap) : undefined;
  const billableStudentCount = cap === undefined ? presentStudentCount : Math.min(presentStudentCount, cap);
  const baseStudentCount = nonNegativeInteger(input.baseStudentCount);
  const gradedStudentCount = Math.max(Math.min(billableStudentCount, overflowHeadcountThreshold) - baseStudentCount, 0);
  const overflowStudentCount = Math.max(billableStudentCount - Math.max(overflowHeadcountThreshold, baseStudentCount), 0);
  const amount =
    nonNegativeNumber(input.baseFee) +
    gradedStudentCount * nonNegativeNumber(input.incrementFee) +
    overflowStudentCount * overflowHeadcountFee;
  return { amount, billableStudentCount, gradedStudentCount, overflowStudentCount };
}

export function headcountAmount(input: HeadcountAmountInput): number {
  return headcountAmountBreakdown(input).amount;
}

export function headcountInputForRate(
  rate: SalaryGradeStageRateConfig,
  baseStudentCount: number,
  presentStudentCount: number,
  billableStudentCap?: number
): HeadcountAmountInput {
  return {
    baseFee: baseStudentCount > 1 ? rate.classBaseFee : rate.oneOnOneFee,
    incrementFee: rate.headcountIncrementFee,
    baseStudentCount: Math.max(baseStudentCount, 1),
    presentStudentCount,
    billableStudentCap
  };
}

export function salaryGradeAmountForCount(
  rule: SalaryGradeRule,
  courseType: CourseType,
  presentStudentCount: number,
  stage?: SalaryGradeStage,
  baseStudentCount = classHeadcountBaseStudentCountForCourseType(courseType),
  billableStudentCap = billableStudentCapForCourseType(courseType)
): number {
  return headcountAmount(
    headcountInputForRate(salaryGradeRateForStage(rule, stage), baseStudentCount, presentStudentCount, billableStudentCap)
  );
}

export function salaryGradeAmountBreakdownForCount(
  rule: SalaryGradeRule,
  courseType: CourseType,
  presentStudentCount: number,
  stage?: SalaryGradeStage,
  baseStudentCount = classHeadcountBaseStudentCountForCourseType(courseType),
  billableStudentCap = billableStudentCapForCourseType(courseType)
): HeadcountAmountBreakdown {
  return headcountAmountBreakdown(
    headcountInputForRate(salaryGradeRateForStage(rule, stage), baseStudentCount, presentStudentCount, billableStudentCap)
  );
}
