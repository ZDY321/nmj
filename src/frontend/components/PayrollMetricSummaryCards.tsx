import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export type PayrollMetricSummaryCard = {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  danger?: boolean;
};

export function PayrollMetricSummaryCards({ cards }: { cards: PayrollMetricSummaryCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
      {cards.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label} className="overflow-hidden">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#eaf2ff] text-[#1557c2]">
                <Icon size={21} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#64748b]">{item.label}</div>
                <div className={`mt-1 text-2xl font-extrabold ${item.danger ? "text-[#b91c1c]" : "text-[#061226]"}`}>
                  {item.value}
                </div>
                <div className="mt-1 text-[11px] font-bold leading-4 text-[#94a3b8]">{item.hint}</div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
