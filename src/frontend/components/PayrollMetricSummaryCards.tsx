import { Card, CardContent } from "@/components/ui/card";

export type PayrollMetricSummaryCard = {
  label: string;
  value: string;
  hint: string;
  danger?: boolean;
};

export function PayrollMetricSummaryCards({ cards }: { cards: PayrollMetricSummaryCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {cards.map((item) => (
        <Card key={item.label} className="overflow-hidden">
          <CardContent className="flex min-h-[116px] flex-col p-4">
            <div
              className="whitespace-nowrap text-[11px] font-bold leading-5 tracking-[-0.01em] text-[#64748b]"
              title={item.label}
            >
              {item.label}
            </div>
            <div className={`mt-1 break-words text-2xl font-extrabold leading-tight ${item.danger ? "text-[#b91c1c]" : "text-[#061226]"}`}>
              {item.value}
            </div>
            <div className="mt-auto pt-2 text-[11px] font-semibold leading-4 text-[#94a3b8]">{item.hint}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
