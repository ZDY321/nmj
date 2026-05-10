import { motion } from "framer-motion";
import { BarChart3, BookOpen, Clock, DollarSign, TrendingUp, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TeacherVault } from "@/shared/types";
import { salaryBreakdown, attendanceSummary, yearlyTrend, todayIso } from "@/frontend/lib/calculations";
import { attendanceLabels, formatMoney } from "@/frontend/lib/helpers";
import { MetricCard } from "@/frontend/components/MetricCard";

export function SalaryView({
  vault,
  onBaseSalaryChange
}: {
  vault: TeacherVault;
  onBaseSalaryChange: (value: number) => void;
}) {
  const month = todayIso().slice(0, 7);
  const breakdown = salaryBreakdown(vault, month);
  const summary = attendanceSummary(vault, month);
  const trend = yearlyTrend(vault, month.slice(0, 4));
  const maxTotal = Math.max(...trend.map((item) => item.total), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="基础工资" value={formatMoney(breakdown.baseSalary)} hint="月固定项" variant={1} index={0} />
        <MetricCard label="一对一" value={formatMoney(breakdown.oneOnOne)} hint="已完成课程" variant={2} index={1} />
        <MetricCard label="班课" value={formatMoney(breakdown.classLessons)} hint="按到课人数" variant={3} index={2} />
        <MetricCard label="合计" value={formatMoney(breakdown.total)} hint="含调整项" variant={4} index={3} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center gap-2 text-[#ff8617] text-xs font-bold uppercase tracking-widest mb-1">
              <DollarSign size={14} /> 工资设置
            </div>
            <CardTitle>工资配置</CardTitle>
            <CardDescription>基础工资会参与月工资合计</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">基础工资</label>
              <div className="relative">
                <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted-foreground)" />
                <Input
                  type="number"
                  value={vault.profile.baseSalary}
                  onChange={(e) => onBaseSalaryChange(Number(e.target.value))}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">收入明细</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "一对一", value: breakdown.oneOnOne, icon: Users, color: "text-[#1557c2] bg-[#eaf2ff]" },
                  { label: "班课", value: breakdown.classLessons, icon: BookOpen, color: "text-[#ff8617] bg-[#fff1e2]" },
                  { label: "补课", value: breakdown.makeup, icon: Clock, color: "text-[#1557c2] bg-[#eaf2ff]" },
                  { label: "调整项", value: breakdown.adjustments, icon: TrendingUp, color: "text-[#16a34a] bg-[#e8f8ef]" }
                ].map((item) => (
                  <motion.div
                    key={item.label}
                    whileHover={{ scale: 1.02 }}
                    className="flex items-center gap-3 p-3 rounded-[14px] bg-[#f8fbff] border border-[#dbe4ef]"
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${item.color}`}>
                      <item.icon size={16} />
                    </div>
                    <div className="flex-1">
                      <span className="text-xs text-(--color-muted-foreground) block">{item.label}</span>
                      <span className="text-sm font-bold">{formatMoney(item.value)}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center gap-2 text-[#1557c2] text-xs font-bold uppercase tracking-widest mb-1">
              <BarChart3 size={14} /> 年度变化
            </div>
            <CardTitle>按月收入趋势</CardTitle>
            <CardDescription>按月确认收入统计</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3 h-[220px] pb-8 px-2">
              {trend.map((item, i) => (
                <motion.div
                  key={item.month}
                  className="flex-1 flex flex-col items-center gap-2 group"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <div className="opacity-0 group-hover:opacity-100 text-[10px] font-bold text-(--color-foreground) transition-opacity -mb-1">
                    {formatMoney(item.total)}
                  </div>
                  <motion.div
                    className="w-full rounded-t-[6px] blue-gradient relative overflow-hidden"
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max((item.total / maxTotal) * 180, 8)}px` }}
                    transition={{ delay: i * 0.05 + 0.2, type: "spring", stiffness: 120 }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent" />
                  </motion.div>
                  <span className="text-[11px] font-bold text-(--color-muted-foreground)">{Number(item.month.slice(5))}月</span>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex items-center gap-2 text-[#ff8617] text-xs font-bold uppercase tracking-widest mb-1">
            <Users size={14} /> 到课情况
          </div>
          <CardTitle>本月出勤统计</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(summary).map(([key, value], i) => (
              <motion.div
                key={key}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -2 }}
                className="p-4 rounded-[14px] bg-[#f8fbff] border border-[#dbe4ef] text-center"
              >
                <span className="text-xs text-(--color-muted-foreground) block mb-2">{attendanceLabels[key as keyof typeof attendanceLabels]}</span>
                <strong className="text-2xl font-extrabold">{value}</strong>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
