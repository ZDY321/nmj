import { BookOpen, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrivateMoney } from "@/frontend/lib/helpers";
import type { Campus, Lesson, SalaryBreakdown } from "@/shared/types";

export type PayrollCampusAmountDetail = {
  key: string;
  campus: string;
  amount: number;
  count: number;
};

export type PayrollCampusSummary = {
  campus: Campus;
  lessons: Lesson[];
  amount: number;
  hours: number;
  obligation: number;
  net: number;
};

export type PayrollTypeCountCard = {
  value: string;
  label: string;
  count: number;
};

export type PayrollOverviewCampusAmounts = {
  oneOnOne: PayrollCampusAmountDetail[];
  classLessons: PayrollCampusAmountDetail[];
  makeup: PayrollCampusAmountDetail[];
};

export function PayrollOverviewGrid({
  selectedMonth,
  amountsVisible,
  campusFilter,
  campusSummaries,
  breakdown,
  lessonFeeTotal,
  lessonCampusAmounts,
  typeCountCards,
  onCampusSelect
}: {
  selectedMonth: string;
  amountsVisible: boolean;
  campusFilter: string;
  campusSummaries: PayrollCampusSummary[];
  breakdown: SalaryBreakdown;
  lessonFeeTotal: number;
  lessonCampusAmounts: PayrollOverviewCampusAmounts;
  typeCountCards: PayrollTypeCountCard[];
  onCampusSelect: (campusId: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
            <MapPin size={14} /> 校区合并统计
          </div>
          <CardTitle>{selectedMonth} 校区汇总</CardTitle>
          <CardDescription>义务课时先按老师本校区单节总课时费从低到高抵扣；本校区不足时，再把其他校区课次合并后从低到高抵扣，试听不参与。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {campusSummaries.map((item) => (
            <button
              key={item.campus.id}
              type="button"
              onClick={() => onCampusSelect(item.campus.id)}
              className={`w-full rounded-[14px] border p-4 text-left transition-all ${
                campusFilter === item.campus.id ? "border-[#ff8617] bg-[#fff7ed]" : "border-[#dbe4ef] bg-[#f8fbff] hover:bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-extrabold text-[#061226]">{item.campus.name}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-[#64748b]">
                    <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-[#dbe4ef]">{item.lessons.length} 节</span>
                    <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-[#dbe4ef]">{item.hours.toFixed(1)} 小时</span>
                    {item.obligation > 0 && (
                      <span className="rounded-full bg-[#fee2e2] px-2.5 py-1 text-[#b91c1c]">义务扣 {formatPrivateMoney(item.obligation, amountsVisible)}</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs font-bold text-[#64748b]">扣后小计</div>
                  <div className="mt-1 text-lg font-extrabold text-[#061226]">{formatPrivateMoney(item.net, amountsVisible)}</div>
                </div>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
            <BookOpen size={14} /> 本月总和
          </div>
          <CardTitle>工资总览</CardTitle>
          <CardDescription>按基本工资、课时费、补贴扣款和义务课时扣费合并，课程明细金额单独核对。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "基本工资", value: breakdown.baseSalary },
              { label: "课时费总计", value: lessonFeeTotal },
              { label: "一对一", value: breakdown.oneOnOne, details: lessonCampusAmounts.oneOnOne },
              { label: "班课", value: breakdown.classLessons, details: lessonCampusAmounts.classLessons },
              { label: "补课", value: breakdown.makeup, details: lessonCampusAmounts.makeup },
              { label: "其他加减项", value: breakdown.adjustments },
              { label: "义务课时扣费", value: -breakdown.obligationDeduction }
            ].map((item) => {
              const details = "details" in item ? item.details ?? [] : [];
              return (
                <div key={item.label} className="min-h-[112px] rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#64748b]">{item.label}</div>
                      <div className={`mt-2 text-xl font-extrabold ${item.value < 0 ? "text-[#b91c1c]" : "text-[#061226]"}`}>
                        {formatPrivateMoney(item.value, amountsVisible)}
                      </div>
                    </div>
                    {details.length > 0 && (
                      <Badge variant="secondary" className="shrink-0">
                        {details.length} 校区
                      </Badge>
                    )}
                  </div>
                  {details.length > 0 && (
                    <div className="mt-3 flex max-h-[92px] flex-wrap gap-1.5 overflow-y-auto pr-1">
                      {details.map((detail) => (
                        <div
                          key={detail.key}
                          className="inline-flex min-w-0 max-w-[150px] items-center gap-1.5 rounded-[9px] border border-[#e8eef6] bg-white px-2 py-1"
                          title={`${detail.campus} · ${detail.count} 节 · ${formatPrivateMoney(detail.amount, amountsVisible)}`}
                        >
                          <span className="max-w-[72px] truncate text-[11px] font-bold text-[#64748b]">{detail.campus}</span>
                          <span className="shrink-0 text-[11px] font-extrabold text-[#061226]">{formatPrivateMoney(detail.amount, amountsVisible)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="rounded-[16px] border border-[#bfdbfe] bg-[#eaf2ff] p-5">
            <div className="text-sm font-bold text-[#1557c2]">本月收入总和</div>
            <div className="mt-2 text-3xl font-extrabold text-[#061226]">{formatPrivateMoney(breakdown.total, amountsVisible)}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {typeCountCards.map((type) => (
              <div key={type.value} className="rounded-[12px] border border-[#dbe4ef] bg-white p-3 text-center">
                <div className="text-xs font-semibold text-[#64748b]">{type.label}</div>
                <div className="mt-1 text-xl font-extrabold text-[#061226]">{type.count}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
