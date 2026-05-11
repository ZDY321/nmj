import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Info,
  MapPin,
  MoreVertical,
  Search,
  Users,
  XCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Lesson, TeacherVault } from "@/shared/types";
import { salaryBreakdown, yearlyTrend } from "@/frontend/lib/calculations";
import {
  campusName,
  courseName,
  formatMoney,
  isToday,
  lessonStatusLabels,
  sortLessons,
  studentNames
} from "@/frontend/lib/helpers";
import { MetricCard } from "@/frontend/components/MetricCard";

const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

export function TodayView({
  vault,
  selectedDate,
  onUpdateLesson
}: {
  vault: TeacherVault;
  selectedDate: string;
  onUpdateLesson: (lesson: Lesson) => void;
}) {
  const selectedDateLessons = vault.lessons.filter((lesson) => lesson.date === selectedDate).sort(sortLessons);
  const pendingMakeups = vault.lessons.filter((lesson) => lesson.status === "makeup_pending");
  const currentMonth = selectedDate.slice(0, 7);
  const currentYear = currentMonth.slice(0, 4);
  const breakdown = salaryBreakdown(vault, currentMonth);
  const trend = yearlyTrend(vault, currentYear);
  const completedThisMonth = vault.lessons.filter((l) => l.date.startsWith(currentMonth) && l.status === "completed");
  const monthLessons = vault.lessons.filter((l) => l.date.startsWith(currentMonth));
  const totalHours = monthLessons.reduce((sum, lesson) => sum + (lesson.feeSnapshot.hours ?? 0), 0);
  const avgPrice = totalHours > 0 ? Math.round((breakdown.oneOnOne + breakdown.classLessons + breakdown.makeup) / totalHours) : 0;
  const maxTrend = Math.max(...trend.map((item) => item.total), 1);
  const maxCount = Math.max(...trend.map((item) => item.count), 1);
  const recentLessons = [...vault.lessons].sort(sortLessons).reverse().slice(0, 8);

  function quickStatus(lesson: Lesson, status: "completed" | "cancelled") {
    onUpdateLesson({ ...lesson, status });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <MetricCard
          label="本月预计工资"
          value={formatMoney(breakdown.total)}
          hint="较上月保持更新"
          variant={1}
          index={0}
        />
        <MetricCard
          label="本月课时"
          value={`${totalHours || completedThisMonth.length * 2}`}
          hint={`${completedThisMonth.length} 节已完成`}
          variant={2}
          index={1}
        />
        <MetricCard
          label="平均课时费"
          value={avgPrice ? formatMoney(avgPrice) : formatMoney(0)}
          hint={`${pendingMakeups.length} 个待处理`}
          variant={3}
          index={2}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.05fr]">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase text-[#64748b]">
                <span>Annual Salary Trend</span>
                <Info size={16} />
              </div>
              <CardTitle className="text-xl">年度收入趋势</CardTitle>
            </div>
            <button className="rounded-[10px] border border-[#dbe4ef] px-4 py-2 text-sm font-bold text-[#25324a]">
              {currentYear}
            </button>
          </CardHeader>
          <CardContent>
            <div className="soft-grid relative h-[300px] rounded-[12px] px-4 pb-9 pt-4">
              <div className="absolute left-4 top-3 flex h-[232px] flex-col justify-between text-xs font-medium text-[#64748b]">
                <span>{formatMoney(maxTrend)}</span>
                <span>{formatMoney(maxTrend * 0.75)}</span>
                <span>{formatMoney(maxTrend * 0.5)}</span>
                <span>{formatMoney(maxTrend * 0.25)}</span>
                <span>¥0</span>
              </div>
              <svg viewBox="0 0 720 230" className="absolute left-16 right-5 top-7 h-[230px] w-[calc(100%-5.25rem)] overflow-visible">
                <defs>
                  <linearGradient id="salaryFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#1557c2" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#1557c2" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {(() => {
                  const points = trend.map((item, index) => {
                    const x = (index / 11) * 700 + 10;
                    const y = 218 - (item.total / maxTrend) * 190;
                    return { x, y, total: item.total };
                  });
                  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
                  const area = `10,222 ${line} 710,222`;
                  return (
                    <>
                      <polygon points={area} fill="url(#salaryFill)" />
                      <polyline points={line} fill="none" stroke="#1557c2" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                      {points.map((point, index) => (
                        <circle key={index} cx={point.x} cy={point.y} r="6" fill="#fff" stroke="#1557c2" strokeWidth="5" />
                      ))}
                    </>
                  );
                })()}
              </svg>
              <div className="absolute bottom-1 left-16 right-5 grid grid-cols-12 gap-1 text-center text-xs font-medium text-[#64748b]">
                {monthNames.map((month) => (
                  <span key={month}>{month}</span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase text-[#64748b]">
                <span>Teaching Frequency</span>
                <Info size={16} />
              </div>
              <CardTitle className="text-xl">授课频率</CardTitle>
            </div>
            <button className="rounded-[10px] border border-[#dbe4ef] px-4 py-2 text-sm font-bold text-[#25324a]">
              {currentYear}
            </button>
          </CardHeader>
          <CardContent>
            <div className="soft-grid flex h-[300px] items-end gap-3 rounded-[12px] px-4 pb-9 pt-6">
              {trend.map((item, index) => (
                <div key={item.month} className="flex h-full flex-1 flex-col justify-end gap-2">
                  <span className="text-center text-xs font-extrabold text-[#25324a]">
                    {item.count}
                  </span>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max((item.count / maxCount) * 200, item.count ? 24 : 8)}px` }}
                    transition={{ delay: index * 0.035, type: "spring", stiffness: 110, damping: 18 }}
                    className="blue-gradient mx-auto w-full max-w-[28px] rounded-t-[5px] shadow-[0_10px_18px_rgba(21,87,194,0.18)]"
                    title={`${item.month}: ${item.count} 节`}
                  />
                  <span className="text-center text-xs font-medium text-[#64748b]">{Number(item.month.slice(5))}月</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.85fr]">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col gap-4 border-b border-[#e8eef6] pb-5 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-xl">课程列表</CardTitle>
            <div className="flex h-12 items-center gap-3 rounded-[12px] border border-[#dbe4ef] bg-white px-4 text-[#64748b] md:w-[320px]">
              <span className="truncate text-sm">搜索课程...</span>
              <Search size={18} className="ml-auto shrink-0" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="bg-[#f8fbff] text-sm font-bold text-[#25324a]">
                    <th className="px-6 py-4">日期</th>
                    <th className="px-6 py-4">课程</th>
                    <th className="px-6 py-4">课时</th>
                    <th className="px-6 py-4">学生</th>
                    <th className="px-6 py-4">金额</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {recentLessons.map((lesson) => (
                    <tr key={lesson.id} className="border-t border-[#e8eef6] text-sm text-[#25324a]">
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="flex items-center gap-2">
                          <CalendarDays size={16} className="text-[#94a3b8]" />
                          {lesson.date}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-[#061226]">{courseName(vault, lesson.courseGroupId)}</div>
                        <div className="mt-1 flex items-center gap-1 text-xs text-[#64748b]">
                          <MapPin size={12} />
                          {campusName(vault, lesson.campusId)}
                        </div>
                      </td>
                      <td className="px-6 py-4">{lesson.feeSnapshot.hours ?? "-"} h</td>
                      <td className="max-w-[180px] truncate px-6 py-4">{studentNames(vault, lesson.expectedStudentIds)}</td>
                      <td className="whitespace-nowrap px-6 py-4 font-bold text-[#061226]">{formatMoney(lesson.feeSnapshot.amount)}</td>
                      <td className="px-6 py-4 text-right">
                        <MoreVertical size={18} className="ml-auto text-[#64748b]" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-[#e8eef6] px-6 py-4 text-sm text-[#64748b]">
              <span>Showing 1 to {recentLessons.length} of {vault.lessons.length} entries</span>
              <div className="flex items-center gap-2">
                <button className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-[#1557c2] font-bold text-white">1</button>
                <button className="flex h-9 w-9 items-center justify-center rounded-[9px] font-bold text-[#25324a]">2</button>
                <button className="flex h-9 w-9 items-center justify-center rounded-[9px] font-bold text-[#25324a]">3</button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between border-b border-[#e8eef6] pb-5">
              <CardTitle className="text-xl">月度摘要</CardTitle>
              <button className="rounded-[10px] border border-[#dbe4ef] px-4 py-2 text-sm font-bold text-[#25324a]">
                {currentMonth}
              </button>
            </CardHeader>
            <CardContent className="p-0">
              {[
                { icon: "¥", label: "总收入", value: formatMoney(breakdown.total), delta: "+ 16.4%", color: "orange" },
                { icon: Clock3, label: "总课时", value: `${totalHours || completedThisMonth.length * 2}`, delta: "+ 8.7%", color: "blue" },
                { icon: BookOpen, label: "总课程", value: `${monthLessons.length}`, delta: "+ 5.3%", color: "blue" },
                { icon: Users, label: "学生数", value: `${vault.students.length}`, delta: "+ 20.0%", color: "blue" }
              ].map((item, index) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center gap-4 border-b border-[#e8eef6] px-6 py-5 last:border-b-0">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-full text-white ${item.color === "orange" ? "orange-gradient" : "bg-[#1557c2]"}`}>
                      {typeof Icon === "string" ? <span className="text-lg font-extrabold">{Icon}</span> : <Icon size={21} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-[#475569]">{item.label}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-extrabold text-[#061226]">{item.value}</div>
                      <div className="text-sm font-bold text-[#16a34a]">{item.delta}</div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-[#e8eef6] pb-5">
            <CardTitle className="text-xl">{isToday(selectedDate) ? "今日课程" : "选中日期课程"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              {selectedDateLessons.length === 0 ? (
                <div className="rounded-[14px] border border-dashed border-[#cbd6e3] p-8 text-center text-sm font-semibold text-[#64748b]">
                  {isToday(selectedDate) ? "今天没有已生成的课程" : "这一天没有已生成的课程"}
                </div>
              ) : (
                selectedDateLessons.map((lesson) => (
                  <article key={lesson.id} className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-extrabold text-[#061226]">{courseName(vault, lesson.courseGroupId)}</div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs font-semibold text-[#64748b]">
                          <span className="flex items-center gap-1"><Clock3 size={13} />{lesson.startTime}-{lesson.endTime}</span>
                          <span className="flex items-center gap-1"><MapPin size={13} />{campusName(vault, lesson.campusId)}</span>
                        </div>
                      </div>
                      <Badge variant={lesson.status === "completed" ? "sage" : lesson.status === "cancelled" ? "destructive" : "amber"}>
                        {lessonStatusLabels[lesson.status]}
                      </Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => quickStatus(lesson, "completed")} className="bg-[#16a34a] shadow-none hover:bg-[#15803d]">
                        <CheckCircle2 size={15} /> 完成
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => quickStatus(lesson, "cancelled")}>
                        <XCircle size={15} /> 取消
                      </Button>
                    </div>
                  </article>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="overflow-hidden bg-[#f8fbff]">
        <CardContent className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[16px] border border-[#bcd2ef] bg-white text-[#1557c2]">
              <BookOpen size={38} />
            </div>
            <div>
              <div className="text-xl font-extrabold text-[#061226]">导出教学数据</div>
              <p className="mt-2 max-w-[600px] text-sm leading-relaxed text-[#64748b]">
                将课时记录、收入统计和排课摘要整理为报表，用于月底核对。
              </p>
            </div>
          </div>
          <Button className="h-12 rounded-[14px] px-6">
            导出报表 <ArrowRight size={18} />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
