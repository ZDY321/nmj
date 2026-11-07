import { Input } from "@/components/ui/input";
import { SensitiveAmountField } from "@/frontend/components/SensitiveAmountField";
import { normalizedClassFeeTiers } from "@/frontend/lib/calculations";
import type { ClassFeeTier, FeeRule } from "@/shared/types";

const fields = [
  { key: "minStudents", label: "最少人数", sensitive: false },
  { key: "baseFee", label: "基础费用", sensitive: true },
  { key: "perStudentFee", label: "每增加一人", sensitive: true }
] as const;

type ClassFeeTierFieldsProps = {
  feeRule: FeeRule;
  amountsVisible: boolean;
  onChange: (tierId: string, patch: Partial<ClassFeeTier>) => void;
  rowClassName: string;
  inputClassName: string;
};

export function ClassFeeTierFields({ feeRule, amountsVisible, onChange, rowClassName, inputClassName }: ClassFeeTierFieldsProps) {
  return normalizedClassFeeTiers(feeRule).slice(0, 1).map((tier) => (
    <div key={tier.id} className={rowClassName}>
      {fields.map(({ key, label, sensitive }) => {
        const input = (
          <Input
            type="number"
            min={0}
            value={key === "perStudentFee" ? tier.perStudentFee ?? 0 : tier[key]}
            onChange={(event) => onChange(tier.id, { [key]: Math.max(Number(event.target.value), 0) })}
            className={inputClassName}
          />
        );
        return (
          <div key={key} className="space-y-1">
            <label className="text-[11px] font-bold text-[#64748b]">{label}</label>
            {sensitive ? <SensitiveAmountField visible={amountsVisible} className="h-9">{input}</SensitiveAmountField> : input}
          </div>
        );
      })}
    </div>
  ));
}
