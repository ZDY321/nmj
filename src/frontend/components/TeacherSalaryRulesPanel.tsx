import { useState } from "react";
import { BadgeDollarSign, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { CustomSalaryGradeId, SalaryGradeRuleConfig, SalaryGradeStage, SalaryGradeStageRateConfig, TeacherProfile, TeacherVault } from "@/shared/types";
import { makeId } from "@/frontend/lib/crypto";
import {
  defaultSalaryGradeRules,
  salaryGradeStageLabels,
  salaryGradeStageOrder,
  salaryGradeLabel,
  salaryGradeRuleById,
  salaryGradeRulesForVault,
  type SalaryGradeRule
} from "@/frontend/lib/calculations";
import { formatPrivateMoney } from "@/frontend/lib/helpers";

type TeacherSalaryRulesPanelProps = {
  amountsVisible: boolean;
  onUpdateProfile: (profile: TeacherProfile) => void;
  vault: TeacherVault;
};

export function TeacherSalaryRulesPanel({ amountsVisible, onUpdateProfile, vault }: TeacherSalaryRulesPanelProps) {
  const rules = salaryGradeRulesForVault(vault);
  const defaultRule = salaryGradeRuleById(vault.profile.defaultSalaryGradeId, vault);
  const legacyDefaultRule = defaultRule?.legacy ? defaultRule : undefined;
  const usedSalaryGradeIds = new Set([
    vault.profile.defaultSalaryGradeId,
    ...vault.courseGroups
      .filter((course) => course.feeRule.mode === "salary_grade" && course.feeRule.salaryGradeSource === "specific")
      .map((course) => course.feeRule.salaryGradeId)
  ].filter(Boolean));
  const [customLabel, setCustomLabel] = useState("");
  const [customBaseSalary, setCustomBaseSalary] = useState(0);
  const [customOneOnOneFee, setCustomOneOnOneFee] = useState(0);
  const [customClassBaseFee, setCustomClassBaseFee] = useState(0);
  const [customHeadcountIncrementFee, setCustomHeadcountIncrementFee] = useState(0);

  function updateProfile(patch: Partial<TeacherProfile>) {
    onUpdateProfile({ ...vault.profile, ...patch });
  }

  function upsertSalaryGradeRule(rule: SalaryGradeRule, patch: Partial<SalaryGradeRuleConfig>) {
    const stageRates = mergeSalaryGradeStageRates(rule, patch.stageRates);
    const displayRate = stageRates.junior_3;
    const nextRule: SalaryGradeRuleConfig = {
      id: rule.id,
      label: patch.label ?? rule.label,
      baseSalary: nonNegative(patch.baseSalary ?? rule.baseSalary),
      guaranteedLessonCount: 5,
      lessonHours: 2,
      oneOnOneFee: displayRate.oneOnOneFee,
      classBaseFee: displayRate.classBaseFee,
      headcountIncrementFee: displayRate.headcountIncrementFee,
      stageRates
    };
    const salaryGradeRules = [
      ...(vault.profile.salaryGradeRules ?? []).filter((item) => item.id !== rule.id),
      nextRule
    ];
    updateProfile({
      salaryGradeRules,
      baseSalary: vault.profile.defaultSalaryGradeId === rule.id ? nextRule.baseSalary : vault.profile.baseSalary
    });
  }

  function resetSalaryGradeRule(rule: SalaryGradeRule) {
    const salaryGradeRules = (vault.profile.salaryGradeRules ?? []).filter((item) => item.id !== rule.id);
    const defaultBuiltin = defaultSalaryGradeRules.find((item) => item.id === rule.id);
    updateProfile({
      salaryGradeRules,
      baseSalary: vault.profile.defaultSalaryGradeId === rule.id && defaultBuiltin ? defaultBuiltin.baseSalary : vault.profile.baseSalary
    });
  }

  function deleteCustomSalaryGradeRule(rule: SalaryGradeRule) {
    const salaryGradeRules = (vault.profile.salaryGradeRules ?? []).filter((item) => item.id !== rule.id);
    updateProfile({
      salaryGradeRules,
      defaultSalaryGradeId: vault.profile.defaultSalaryGradeId === rule.id ? undefined : vault.profile.defaultSalaryGradeId
    });
  }

  function addCustomSalaryGradeRule() {
    const label = customLabel.trim();
    if (!label) return;
    const id = makeId("custom_salary") as CustomSalaryGradeId;
    const nextRule: SalaryGradeRuleConfig = {
      id,
      label,
      baseSalary: nonNegative(customBaseSalary),
      guaranteedLessonCount: 5,
      lessonHours: 2,
      oneOnOneFee: nonNegative(customOneOnOneFee),
      classBaseFee: nonNegative(customClassBaseFee),
      headcountIncrementFee: nonNegative(customHeadcountIncrementFee),
      stageRates: stageRatesFromCustomInputs(customOneOnOneFee, customClassBaseFee, customHeadcountIncrementFee)
    };
    updateProfile({
      salaryGradeRules: [...(vault.profile.salaryGradeRules ?? []), nextRule]
    });
    setCustomLabel("");
    setCustomBaseSalary(0);
    setCustomOneOnOneFee(0);
    setCustomClassBaseFee(0);
    setCustomHeadcountIncrementFee(0);
  }

  function updateRuleStageRate(rule: SalaryGradeRule, stage: SalaryGradeStage, patch: Partial<SalaryGradeStageRateConfig>) {
    upsertSalaryGradeRule(rule, {
      stageRates: {
        ...rule.stageRates,
        [stage]: {
          ...rule.stageRates[stage],
          ...patch
        }
      }
    });
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
          <BadgeDollarSign size={14} /> 课时费计算
        </div>
        <CardTitle>教师课时费等级</CardTitle>
        <CardDescription className="space-y-1">
          <span className="block">课程里只选择老师等级；实际课时费会按课程学生年级阶段套用该等级下对应金额，底薪仍按老师等级统一设置。</span>
          <span className="block">班课的班型按「班课底费 + max(到课人数 - 5, 0) * 人头加价」计算；非班课的班型按「一对一基础费 + max(到课人数 - 1, 0) * 人头加价」计算。</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {[
            { label: "当前默认等级", value: defaultRule ? salaryGradeLabel(defaultRule) : "未设置" },
            { label: "保底节数", value: defaultRule ? `${defaultRule.guaranteedLessonCount} 节/月` : "未设置" },
            { label: "标准课时长", value: defaultRule ? `${defaultRule.lessonHours} 小时/节` : "未设置" },
            { label: "当前底薪", value: formatPrivateMoney(vault.profile.baseSalary, amountsVisible) }
          ].map((item) => (
            <div key={item.label} className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
              <div className="text-xs font-bold text-[#64748b]">{item.label}</div>
              <div className="mt-1 text-lg font-extrabold text-[#061226]">{item.value}</div>
            </div>
          ))}
        </div>

        {legacyDefaultRule && (
          <div className="rounded-[14px] border border-[#facc15] bg-[#fefce8] px-3 py-2 text-xs font-semibold leading-5 text-[#854d0e]">
            当前默认等级仍是旧规则「{salaryGradeLabel(legacyDefaultRule)}」。旧规则会继续被识别，建议在“老师个人信息”里切换为新的通用等级。
          </div>
        )}

        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-[14px] border border-[#dbe4ef] bg-white p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold text-[#061226]">{salaryGradeLabel(rule)}</span>
                    {vault.profile.defaultSalaryGradeId === rule.id && <Badge variant="sky">默认</Badge>}
                    {rule.custom && <Badge variant="plum">自定义</Badge>}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-[#94a3b8]">2 小时为 1 节，实际按「上课时长 / 2」折算；班课人头加价从第 6 人开始，非班课从第 2 人开始。</div>
                </div>
                <div className="grid grid-cols-[minmax(160px,220px)_auto] gap-2">
                  <div>
                    <div className="mb-1 text-[11px] font-bold text-[#64748b]">底薪</div>
                    <AmountInput
                      amountsVisible={amountsVisible}
                      value={rule.baseSalary}
                      onChange={(baseSalary) => upsertSalaryGradeRule(rule, { baseSalary })}
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    {rule.custom ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteCustomSalaryGradeRule(rule)}
                        disabled={usedSalaryGradeIds.has(rule.id)}
                        title={usedSalaryGradeIds.has(rule.id) ? "有默认等级或课程正在使用，先切换后再删除" : "删除自定义等级"}
                      >
                        <Trash2 size={14} />
                      </Button>
                    ) : (
                      <Button type="button" size="sm" variant="outline" onClick={() => resetSalaryGradeRule(rule)}>
                        <RotateCcw size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 overflow-x-auto rounded-[12px] border border-[#e8eef6]">
                <div className="grid min-w-[680px] grid-cols-[110px_repeat(3,minmax(130px,1fr))] gap-2 border-b border-[#eef3f8] bg-[#f8fbff] px-3 py-2 text-xs font-bold text-[#64748b]">
                  <div>年级阶段</div>
                  <div>一对一基础费</div>
                  <div>班课底费</div>
                  <div>人头加价</div>
                </div>
                <div className="divide-y divide-[#eef3f8]">
                  {salaryGradeStageOrder.map((stage) => (
                    <div key={stage} className="grid min-w-[680px] grid-cols-[110px_repeat(3,minmax(130px,1fr))] items-center gap-2 px-3 py-2">
                      <div className="text-sm font-extrabold text-[#061226]">{salaryGradeStageLabels[stage]}</div>
                      <AmountInput
                        amountsVisible={amountsVisible}
                        value={rule.stageRates[stage].oneOnOneFee}
                        onChange={(oneOnOneFee) => updateRuleStageRate(rule, stage, { oneOnOneFee })}
                      />
                      <AmountInput
                        amountsVisible={amountsVisible}
                        value={rule.stageRates[stage].classBaseFee}
                        onChange={(classBaseFee) => updateRuleStageRate(rule, stage, { classBaseFee })}
                      />
                      <AmountInput
                        amountsVisible={amountsVisible}
                        value={rule.stageRates[stage].headcountIncrementFee}
                        onChange={(headcountIncrementFee) => updateRuleStageRate(rule, stage, { headcountIncrementFee })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
          <div>
            <div className="text-sm font-extrabold text-[#061226]">自定义等级</div>
            <div className="mt-1 text-xs font-semibold text-[#64748b]">
              需要单独规则时可以新增，比如“高中高级”“合作老师”等；新增后会出现在默认等级和课程指定等级下拉框里。
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1.2fr_repeat(4,minmax(112px,1fr))_112px]">
            <Input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} placeholder="等级名称" className="bg-white" />
            <AmountInput amountsVisible={amountsVisible} value={customBaseSalary} onChange={setCustomBaseSalary} />
            <AmountInput amountsVisible={amountsVisible} value={customOneOnOneFee} onChange={setCustomOneOnOneFee} />
            <AmountInput amountsVisible={amountsVisible} value={customClassBaseFee} onChange={setCustomClassBaseFee} />
            <AmountInput amountsVisible={amountsVisible} value={customHeadcountIncrementFee} onChange={setCustomHeadcountIncrementFee} />
            <Button type="button" onClick={addCustomSalaryGradeRule} disabled={!customLabel.trim()}>
              <Plus size={14} /> 添加
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AmountInput({
  amountsVisible,
  onChange,
  value
}: {
  amountsVisible: boolean;
  onChange: (value: number) => void;
  value: number;
}) {
  if (!amountsVisible) {
    return (
      <div className="flex h-10 items-center rounded-[10px] border border-[#dbe4ef] bg-white px-3 text-sm font-extrabold text-[#64748b]">
        ***
      </div>
    );
  }
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-extrabold text-[#64748b]">¥</span>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(nonNegative(Number(event.target.value)))}
        className="bg-white pl-10"
      />
    </div>
  );
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

function mergeSalaryGradeStageRates(
  rule: SalaryGradeRule,
  patch?: Partial<Record<SalaryGradeStage, SalaryGradeStageRateConfig>>
): Record<SalaryGradeStage, SalaryGradeStageRateConfig> {
  return salaryGradeStageOrder.reduce(
    (rates, stage) => {
      const current = rule.stageRates[stage];
      const next = patch?.[stage];
      rates[stage] = {
        oneOnOneFee: nonNegative(next?.oneOnOneFee ?? current.oneOnOneFee),
        classBaseFee: nonNegative(next?.classBaseFee ?? current.classBaseFee),
        headcountIncrementFee: nonNegative(next?.headcountIncrementFee ?? current.headcountIncrementFee)
      };
      return rates;
    },
    {} as Record<SalaryGradeStage, SalaryGradeStageRateConfig>
  );
}

function stageRatesFromCustomInputs(
  oneOnOneFee: number,
  classBaseFee: number,
  headcountIncrementFee: number
): Record<SalaryGradeStage, SalaryGradeStageRateConfig> {
  return salaryGradeStageOrder.reduce(
    (rates, stage) => {
      rates[stage] = {
        oneOnOneFee: nonNegative(oneOnOneFee),
        classBaseFee: nonNegative(classBaseFee),
        headcountIncrementFee: nonNegative(headcountIncrementFee)
      };
      return rates;
    },
    {} as Record<SalaryGradeStage, SalaryGradeStageRateConfig>
  );
}
