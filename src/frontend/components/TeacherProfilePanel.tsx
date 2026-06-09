import type { ReactNode } from "react";
import { Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SensitiveAmountField } from "@/frontend/components/SensitiveAmountField";
import type { Campus, SalaryGradeId, TeacherProfile, TeacherVault } from "@/shared/types";
import type { ObligationSummary, SalaryGradeRule } from "@/frontend/lib/calculations";
import { formatPrivateMoney } from "@/frontend/lib/helpers";

type TeacherProfilePanelProps = {
  amountsVisible: boolean;
  campusOptions: Campus[];
  isManualObligationMode: boolean;
  obligation: ObligationSummary;
  obligationMode: TeacherProfile["obligationDeductionMode"];
  onUpdateDefaultSalaryGrade: (salaryGradeId: string) => void;
  onUpdateHomeCampus: (campusId: string) => void;
  onUpdateObligationCampus: (campusId: string) => void;
  onUpdateProfile: (patch: Partial<TeacherProfile>) => void;
  renderSalaryGradeOptions: (currentId?: SalaryGradeId) => ReactNode;
  selectedProfileSalaryGrade: SalaryGradeRule | undefined;
  vault: TeacherVault;
};

export function TeacherProfilePanel({
  amountsVisible,
  campusOptions,
  isManualObligationMode,
  obligation,
  obligationMode,
  onUpdateDefaultSalaryGrade,
  onUpdateHomeCampus,
  onUpdateObligationCampus,
  onUpdateProfile,
  renderSalaryGradeOptions,
  selectedProfileSalaryGrade,
  vault
}: TeacherProfilePanelProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
          <Settings size={14} /> 个人与义务课时设置
        </div>
        <CardTitle>老师个人信息</CardTitle>
        <CardDescription>义务课时自动从本校区非试听课里按单节总课时费从低到高抵扣，本校区不足时再合并其他校区课次继续抵扣。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">显示姓名</label>
            <Input value={vault.profile.displayName} onChange={(event) => onUpdateProfile({ displayName: event.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">所在校区</label>
            <Select value={vault.profile.homeCampusId ?? ""} onChange={(event) => onUpdateHomeCampus(event.target.value)}>
              <option value="">未设置</option>
              {campusOptions.map((campus) => (
                <option key={campus.id} value={campus.id}>{campus.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">义务课时本校区</label>
            <Select value={vault.profile.obligationCampusId ?? ""} onChange={(event) => onUpdateObligationCampus(event.target.value)}>
              <option value="">跟随所在校区</option>
              {campusOptions.map((campus) => (
                <option key={campus.id} value={campus.id}>{campus.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">扣义务课时方式</label>
            <Select
              value={obligationMode}
              onChange={(event) => onUpdateProfile({ obligationDeductionMode: event.target.value as TeacherProfile["obligationDeductionMode"] })}
            >
              <option value="auto_gap">按单节总课时费从低到高自动抵扣，不足按小时补扣</option>
              <option value="manual">手动填写扣除金额</option>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">每月义务小时</label>
            <Input
              type="number"
              min={0}
              value={vault.profile.monthlyObligationHours ?? 0}
              onChange={(event) => onUpdateProfile({ monthlyObligationHours: Math.max(Number(event.target.value), 0) })}
              disabled={isManualObligationMode}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">每小时补扣费用</label>
            <SensitiveAmountField visible={amountsVisible}>
              <Input
                type="number"
                min={0}
                value={vault.profile.obligationHourlyDeduction ?? 0}
                onChange={(event) => onUpdateProfile({ obligationHourlyDeduction: Math.max(Number(event.target.value), 0) })}
                disabled={isManualObligationMode}
              />
            </SensitiveAmountField>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">手动扣除金额</label>
            <SensitiveAmountField visible={amountsVisible}>
              <Input
                type="number"
                min={0}
                value={vault.profile.manualObligationDeduction ?? 0}
                onChange={(event) => onUpdateProfile({ manualObligationDeduction: Math.max(Number(event.target.value), 0) })}
                disabled={!isManualObligationMode}
              />
            </SensitiveAmountField>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">默认课时费等级</label>
            <Select value={vault.profile.defaultSalaryGradeId ?? ""} onChange={(event) => onUpdateDefaultSalaryGrade(event.target.value)}>
              <option value="">未设置</option>
              {renderSalaryGradeOptions(vault.profile.defaultSalaryGradeId)}
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">基本工资</label>
            <SensitiveAmountField visible={amountsVisible}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-extrabold text-[#64748b]">¥</span>
                <Input
                  type="number"
                  min={0}
                  value={vault.profile.baseSalary}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    onUpdateProfile({ baseSalary: Number.isFinite(value) ? Math.max(value, 0) : 0 });
                  }}
                  className="pl-10"
                />
              </div>
            </SensitiveAmountField>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">课时费规则</label>
            <div className="rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2 text-xs font-bold leading-5 text-[#475569]">
              {selectedProfileSalaryGrade
                ? `保底 5 节/月，每节 2 小时；一对一 ${formatPrivateMoney(selectedProfileSalaryGrade.oneOnOneFee, amountsVisible)}；班课底费 ${formatPrivateMoney(selectedProfileSalaryGrade.classBaseFee, amountsVisible)}；人头加价 ${formatPrivateMoney(selectedProfileSalaryGrade.headcountIncrementFee, amountsVisible)}。`
                : "未设置默认课时费等级，新课程不会自动套用等级课时费。"}
            </div>
          </div>
          <div className="space-y-2 lg:col-span-3">
            <label className="text-sm font-medium">个人备注</label>
            <Textarea
              value={vault.profile.note ?? ""}
              onChange={(event) => onUpdateProfile({ note: event.target.value })}
              placeholder="例如：主要负责中心校区，高中数学方向"
              className="min-h-[76px]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-[16px] border border-[#fecaca] bg-[#fff1f2] p-3 md:grid-cols-4">
          {[
            { label: "义务目标", value: `${obligation.requiredHours.toFixed(1)} 小时` },
            { label: "本月应扣", value: `${obligation.deductedHours.toFixed(1)} 小时` },
            { label: "补扣小时", value: `${obligation.fallbackHours.toFixed(1)} 小时` },
            { label: "本月扣费", value: formatPrivateMoney(obligation.amount, amountsVisible) }
          ].map((item) => (
            <div key={item.label} className="rounded-[12px] border border-[#fecaca] bg-[#fee2e2] p-3">
              <div className="text-xs font-bold text-[#991b1b]">{item.label}</div>
              <div className="mt-1 text-lg font-extrabold text-[#7f1d1d]">{item.value}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
