import { SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ObligationSummary } from "@/frontend/lib/calculations";
import { campusName, courseTypeLabel, formatPrivateMoney } from "@/frontend/lib/helpers";
import type { TeacherVault } from "@/shared/types";

export function PayrollObligationDeductionCard({
  vault,
  amountsVisible,
  selectedMonth,
  effectiveObligationCampusId,
  obligation,
  deductionApplies
}: {
  vault: TeacherVault;
  amountsVisible: boolean;
  selectedMonth: string;
  effectiveObligationCampusId?: string;
  obligation: ObligationSummary;
  deductionApplies: boolean;
}) {
  const deductedCourses = obligation.courseBreakdown.filter((item) => item.deductedHours > 0 || item.amount > 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#b91c1c]">
            <SlidersHorizontal size={14} /> 义务课时扣费
          </div>
          <CardTitle>义务课时扣费明细</CardTitle>
          <CardDescription className="mt-2">
            {deductionApplies
              ? `${selectedMonth} · ${campusName(vault, effectiveObligationCampusId)}，先扣本校区单节总课时费较低的课次；本校区不够时，再把其他校区课次合并后从低到高继续抵扣，试听不参与。`
              : `当前筛选校区不单独扣义务课时；扣费归入 ${campusName(vault, effectiveObligationCampusId)}，可切换到全部校区或义务本校区查看明细。`}
          </CardDescription>
        </div>
        {deductionApplies && (
          <Badge variant={obligation.mode === "manual" ? "amber" : "secondary"} className="w-fit">
            {obligation.mode === "manual" ? "手动扣费" : `${deductedCourses.length} 个已扣课程`}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!deductionApplies ? (
          <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-5 text-sm font-semibold text-[#64748b]">
            当前校区课时费正常统计，但义务课时扣费不会从这个校区小计里扣除。
          </div>
        ) : obligation.mode === "manual" ? (
          <div className="rounded-[14px] border border-[#fed7aa] bg-[#fff7ed] p-4">
            <div className="text-sm font-extrabold text-[#9a3412]">当前为手动填写义务课时扣费</div>
            <div className="mt-2 text-2xl font-extrabold text-[#7f1d1d]">
              -{formatPrivateMoney(obligation.amount, amountsVisible)}
            </div>
            <div className="mt-1 text-xs font-semibold text-[#9a3412]">
              本月扣费按老师档案里的手动扣除金额计算，不展示自动抵扣课程明细。
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {[
                { label: "义务目标", value: `${obligation.requiredHours.toFixed(1)} 小时` },
                { label: "课程抵扣", value: formatPrivateMoney(obligation.courseDeductionAmount, amountsVisible) },
                { label: "补扣缺口", value: `${obligation.fallbackHours.toFixed(1)} 小时` },
                { label: "扣费合计", value: `-${formatPrivateMoney(obligation.amount, amountsVisible)}` }
              ].map((item) => (
                <div key={item.label} className="rounded-[12px] border border-[#fecaca] bg-[#fff1f2] p-3">
                  <div className="text-xs font-bold text-[#991b1b]">{item.label}</div>
                  <div className="mt-1 text-base font-extrabold text-[#7f1d1d]">{item.value}</div>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {deductedCourses.map((item, index) => {
                const course = vault.courseGroups.find((candidate) => candidate.id === item.courseId);
                return (
                  <div key={item.courseId} className="rounded-[14px] border border-[#e8eef6] bg-[#f8fbff] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={index === 0 ? "amber" : "secondary"}>{index + 1}</Badge>
                      <span className="min-w-0 truncate text-sm font-extrabold text-[#061226]">{item.courseName}</span>
                      {course && (
                        <span className="text-xs font-semibold text-[#64748b]">
                          {courseTypeLabel(vault, course.type)} · {course.subject} · {campusName(vault, course.defaultCampusId)}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-[#64748b]">
                      <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-[#dbe4ef]">本月 {item.lessonCount} 节</span>
                      <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-[#dbe4ef]">可扣 {item.availableHours.toFixed(1)} 小时</span>
                      <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-[#dbe4ef]">已扣 {item.deductedHours.toFixed(1)} 小时</span>
                      <span className="rounded-full bg-[#fee2e2] px-2.5 py-1 text-[#b91c1c]">扣 {formatPrivateMoney(item.amount, amountsVisible)}</span>
                    </div>
                  </div>
                );
              })}
              {obligation.fallbackHours > 0 && (
                <div className="rounded-[14px] border border-[#fecaca] bg-[#fff1f2] p-3">
                  <div className="text-sm font-extrabold text-[#7f1d1d]">未抵完义务小时补扣</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-[#991b1b]">
                    <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-[#fecaca]">缺口 {obligation.fallbackHours.toFixed(1)} 小时</span>
                    <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-[#fecaca]">每小时 {formatPrivateMoney(obligation.hourlyDeduction, amountsVisible)}</span>
                    <span className="rounded-full bg-[#fee2e2] px-2.5 py-1">扣 {formatPrivateMoney(obligation.fallbackAmount, amountsVisible)}</span>
                  </div>
                </div>
              )}
              {deductedCourses.length === 0 && obligation.fallbackHours <= 0 && (
                <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-5 text-center text-sm font-semibold text-[#64748b]">
                  本月没有产生义务课时扣费。
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
