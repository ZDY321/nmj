import { useState } from "react";
import { motion } from "framer-motion";
import {
  Banknote,
  BarChart3,
  BookOpen,
  CalendarDays,
  Clock,
  FileCheck2,
  MapPin,
  Plus,
  Trash2,
  TrendingUp,
  Users
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { SalaryAdjustment, TeacherVault } from "@/shared/types";
import { makeId } from "@/frontend/lib/crypto";
import { attendanceSummary, obligationSummary, salaryBreakdown, todayIso, yearlyTrend } from "@/frontend/lib/calculations";
import {
  attendanceLabels,
  campusName,
  courseName,
  courseTypeLabels,
  formatMoney,
  lessonStatusLabels,
  lessonStatusVariant,
  sortLessons,
  studentNames
} from "@/frontend/lib/helpers";
import { MetricCard } from "@/frontend/components/MetricCard";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";

const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

export function SalaryView({
  vault,
  onBaseSalaryChange,
  onAddAdjustment,
  onDeleteAdjustment
}: {
  vault: TeacherVault;
  onBaseSalaryChange: (value: number) => void;
  onAddAdjustment: (adjustment: SalaryAdjustment) => void;
  onDeleteAdjustment: (adjustmentId: string) => void;
}) {
  const [selectedMonth, setSelectedMonth] = useState(todayIso().slice(0, 7));
  const [adjustmentTitle, setAdjustmentTitle] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [detailDateFilter, setDetailDateFilter] = useState("");
  const [detailCourseFilter, setDetailCourseFilter] = useState("all");
  const [detailStudentFilter, setDetailStudentFilter] = useState("");
  const [detailCampusFilter, setDetailCampusFilter] = useState("all");
  const { confirm, dialog } = useConfirmDialog();
  const year = selectedMonth.slice(0, 4);
  const breakdown = salaryBreakdown(vault, selectedMonth);
  const summary = attendanceSummary(vault, selectedMonth);
  const trend = yearlyTrend(vault, year);
  const maxTotal = Math.max(...trend.map((item) => item.total), 1);
  const maxCount = Math.max(...trend.map((item) => item.count), 1);
  const monthLessons = vault.lessons.filter((lesson) => lesson.date.startsWith(selectedMonth));
  const completedThisMonth = monthLessons.filter((lesson) => lesson.status === "completed" || lesson.status === "makeup_completed");
  const pendingMakeups = monthLessons.filter((lesson) => lesson.status === "makeup_pending");
  const totalHours = monthLessons.reduce((sum, lesson) => sum + (lesson.feeSnapshot.hours ?? 0), 0);
  const recentLessons = [...monthLessons]
    .filter((lesson) => {
      const matchesDate = !detailDateFilter || lesson.date === detailDateFilter;
      const matchesCourse = detailCourseFilter === "all" || lesson.courseGroupId === detailCourseFilter;
      const matchesStudent =
        !detailStudentFilter.trim() ||
        studentNames(vault, lesson.expectedStudentIds).toLowerCase().includes(detailStudentFilter.trim().toLowerCase());
      const matchesCampus = detailCampusFilter === "all" || lesson.campusId === detailCampusFilter;
      return matchesDate && matchesCourse && matchesStudent && matchesCampus;
    })
    .sort(sortLessons)
    .reverse();
  const selectedMonthAdjustments = vault.salaryAdjustments.filter((item) => item.month === selectedMonth);
  const obligation = obligationSummary(vault, selectedMonth);

  function addAdjustment() {
    const title = adjustmentTitle.trim();
    const amount = Number(adjustmentAmount);
    if (!title || !Number.isFinite(amount)) return;
    onAddAdjustment({
      id: makeId("adjust"),
      month: selectedMonth,
      title,
      amount,
      note: adjustmentNote.trim() || undefined
    });
    setAdjustmentTitle("");
    setAdjustmentAmount("");
    setAdjustmentNote("");
  }

  return (
    <div className="space-y-6">
      {dialog}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="基础工资" value={formatMoney(breakdown.baseSalary)} hint="月固定项" variant={1} index={0} showSparkline={false} />
        <MetricCard label="一对一" value={formatMoney(breakdown.oneOnOne)} hint="已完成课程" variant={2} index={1} showSparkline={false} />
        <MetricCard label="班课" value={formatMoney(breakdown.classLessons)} hint="按到课人数" variant={3} index={2} showSparkline={false} />
        <MetricCard label="合计" value={formatMoney(breakdown.total)} hint="含补贴/扣款" variant={4} index={3} showSparkline={false} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
              <Banknote size={14} /> 工资设置
            </div>
            <CardTitle>工资配置</CardTitle>
            <CardDescription>基础工资会参与月工资合计</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">基础工资</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-extrabold text-[#64748b]">¥</span>
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  { label: "一对一", value: breakdown.oneOnOne, icon: Users, color: "text-[#1557c2] bg-[#eaf2ff]" },
                  { label: "班课", value: breakdown.classLessons, icon: BookOpen, color: "text-[#ff8617] bg-[#fff1e2]" },
                  { label: "补课", value: breakdown.makeup, icon: Clock, color: "text-[#1557c2] bg-[#eaf2ff]" },
                  { label: "其他加减项", value: breakdown.adjustments, icon: TrendingUp, color: "text-[#16a34a] bg-[#e8f8ef]" },
                  { label: "义务课时扣费", value: -breakdown.obligationDeduction, icon: FileCheck2, color: "text-[#b91c1c] bg-[#fff1f2]" }
                ].map((item) => (
                  <motion.div
                    key={item.label}
                    whileHover={{ scale: 1.02 }}
                    className="flex items-center gap-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3"
                  >
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${item.color}`}>
                      <item.icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block text-xs text-[#64748b]">{item.label}</span>
                      <span className="text-sm font-bold">{formatMoney(item.value)}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">其他加减项（补贴 / 扣款）</p>
              <div className="rounded-[14px] border border-[#fecaca] bg-[#fff1f2] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-extrabold text-[#7f1d1d]">义务课时扣费</div>
                    <div className="mt-1 text-xs font-semibold leading-5 text-[#9f1239]">
                      {obligation.campus?.name ?? "未设置义务校区"}
                      {obligation.course ? ` · ${obligation.course.name}` : ""} · 已计 {obligation.completedHours.toFixed(1)} 小时，
                      {obligation.mode === "manual"
                        ? `手动扣 ${formatMoney(obligation.manualAmount)}`
                        : `缺口 ${obligation.missingHours.toFixed(1)} / ${obligation.requiredHours || 0} 小时`}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-extrabold text-[#b91c1c]">
                    -{formatMoney(obligation.amount)}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {selectedMonthAdjustments.map((item) => (
                  <div key={item.id} className="rounded-[14px] border border-[#dbe4ef] bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-[#061226]">{item.title}</div>
                        <div className="mt-1 text-xs text-[#64748b]">{item.note || "无备注"}</div>
                      </div>
                      <div className={`shrink-0 text-sm font-extrabold ${item.amount >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
                        {item.amount >= 0 ? "+" : ""}{formatMoney(item.amount)}
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          confirm({
                            title: `删除「${item.title}」？`,
                            description: "删除后该补贴或扣款不会再进入本月工资统计。",
                            confirmLabel: "删除",
                            tone: "danger",
                            onConfirm: () => {
                              onDeleteAdjustment(item.id);
                            }
                          })
                        }
                      >
                        <Trash2 size={14} /> 删除
                      </Button>
                    </div>
                  </div>
                ))}
                {selectedMonthAdjustments.length === 0 && (
                  <div className="rounded-[14px] border border-dashed border-[#cbd6e3] p-4 text-center text-sm font-semibold text-[#64748b]">
                    这个月没有补贴或扣款
                  </div>
                )}
              </div>
              <div className="rounded-[14px] border border-[#dbe4ef] bg-white p-3">
                <div className="mb-3 text-sm font-bold text-[#061226]">添加到 {selectedMonth}</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input value={adjustmentTitle} onChange={(event) => setAdjustmentTitle(event.target.value)} placeholder="例如：交通补贴 / 扣款" />
                  <Input type="number" value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} placeholder="金额，扣款填负数" />
                </div>
                <Input className="mt-2" value={adjustmentNote} onChange={(event) => setAdjustmentNote(event.target.value)} placeholder="备注，可选" />
                <Button type="button" className="mt-3 w-full" onClick={addAdjustment}>
                  <Plus size={15} /> 添加补贴 / 扣款
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-[#1557c2]">
                <BarChart3 size={14} /> 年度变化
              </div>
              <CardTitle className="text-xl">按月收入趋势</CardTitle>
              <CardDescription className="mt-2">包含基础工资、已完成课时费、补贴扣款和义务课时扣费</CardDescription>
            </div>
            <div className="rounded-[10px] border border-[#dbe4ef] px-4 py-2 text-sm font-bold text-[#25324a]">
              {year}
            </div>
          </CardHeader>
          <CardContent>
            <div className="soft-grid relative h-[280px] rounded-[12px] px-4 pb-9 pt-4">
              <div className="absolute left-4 top-3 flex h-[212px] flex-col justify-between text-xs font-medium text-[#64748b]">
                <span>{formatMoney(maxTotal)}</span>
                <span>{formatMoney(maxTotal * 0.75)}</span>
                <span>{formatMoney(maxTotal * 0.5)}</span>
                <span>{formatMoney(maxTotal * 0.25)}</span>
                <span>¥0</span>
              </div>
              <svg viewBox="0 0 720 210" className="absolute left-16 right-5 top-8 h-[210px] w-[calc(100%-5.25rem)] overflow-visible">
                <defs>
                  <linearGradient id="salaryFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#1557c2" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#1557c2" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {(() => {
                  const points = trend.map((item, index) => {
                    const x = (index / 11) * 700 + 10;
                    const y = 198 - (item.total / maxTotal) * 172;
                    return { x, y, month: item.month };
                  });
                  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
                  const area = `10,202 ${line} 710,202`;
                  return (
                    <>
                      <polygon points={area} fill="url(#salaryFill)" />
                      <polyline points={line} fill="none" stroke="#1557c2" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                      {points.map((point, index) => (
                        <circle
                          key={index}
                          cx={point.x}
                          cy={point.y}
                          r="7"
                          fill={selectedMonth === point.month ? "#ff8617" : "#fff"}
                          stroke={selectedMonth === point.month ? "#ff8617" : "#1557c2"}
                          strokeWidth="5"
                          className="cursor-pointer"
                          onClick={() => setSelectedMonth(point.month)}
                        />
                      ))}
                    </>
                  );
                })()}
              </svg>
              <div className="absolute bottom-1 left-16 right-5 grid grid-cols-12 gap-1 text-center text-xs font-medium text-[#64748b]">
                {monthNames.map((item, index) => {
                  const value = `${year}-${String(index + 1).padStart(2, "0")}`;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setSelectedMonth(value)}
                      className={`rounded-[6px] py-0.5 ${selectedMonth === value ? "bg-[#ff8617] text-white" : ""}`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
              <Clock size={14} /> 授课频率
            </div>
            <CardTitle>本年每月课次</CardTitle>
            <CardDescription>用于核对课程数量是否漏录</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="soft-grid flex h-[260px] items-end gap-2 rounded-[12px] px-3 pb-8 pt-6 sm:gap-3 sm:px-4">
              {trend.map((item, index) => (
                <button
                  key={item.month}
                  type="button"
                  onClick={() => setSelectedMonth(item.month)}
                  className={`flex h-full flex-1 flex-col justify-end gap-2 rounded-[8px] ${selectedMonth === item.month ? "bg-[#fff7ed]" : ""}`}
                >
                  <span className="text-center text-xs font-extrabold text-[#25324a]">
                    {item.count}
                  </span>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max((item.count / maxCount) * 180, item.count ? 24 : 8)}px` }}
                    transition={{ delay: index * 0.035, type: "spring", stiffness: 110, damping: 18 }}
                    className="blue-gradient mx-auto w-full max-w-[28px] rounded-t-[5px] shadow-[0_10px_18px_rgba(21,87,194,0.18)]"
                    title={`${item.month}: ${item.count} 节`}
                  />
                  <span className="text-center text-[11px] font-medium text-[#64748b]">{Number(item.month.slice(5))}月</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
              <Users size={14} /> 到课情况
            </div>
            <CardTitle>{selectedMonth} 出勤统计</CardTitle>
            <CardDescription>和授课频率放在一起，方便先核对课次和到课。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Object.entries(summary).map(([key, value], index) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ y: -2 }}
                  className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4 text-center"
                >
                  <span className="mb-2 block text-xs text-[#64748b]">{attendanceLabels[key as keyof typeof attendanceLabels]}</span>
                  <strong className="text-2xl font-extrabold">{value}</strong>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
            <FileCheck2 size={14} /> 数据核对
          </div>
          <CardTitle>{selectedMonth} 教学数据核对</CardTitle>
          <CardDescription>点击上方年度趋势中的月份，可切换这里的核对月份。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "总收入", value: formatMoney(breakdown.total) },
              { label: "课时", value: `${totalHours || completedThisMonth.length * 2}` },
              { label: "课程", value: `${monthLessons.length} 节` },
              { label: "待补课", value: `${pendingMakeups.length} 个` }
            ].map((item) => (
              <div key={item.label} className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
                <div className="text-xs font-semibold text-[#64748b]">{item.label}</div>
                <div className="mt-2 break-words text-xl font-extrabold text-[#061226]">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3 md:grid-cols-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">日期筛选</label>
              <Input type="date" value={detailDateFilter} onChange={(event) => setDetailDateFilter(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">课程筛选</label>
              <Select value={detailCourseFilter} onChange={(event) => setDetailCourseFilter(event.target.value)}>
                <option value="all">全部课程</option>
                {vault.courseGroups.map((course) => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">学生筛选</label>
              <Input value={detailStudentFilter} onChange={(event) => setDetailStudentFilter(event.target.value)} placeholder="输入学生名" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">校区筛选</label>
              <Select value={detailCampusFilter} onChange={(event) => setDetailCampusFilter(event.target.value)}>
                <option value="all">全部校区</option>
                {vault.campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>{campus.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="bg-[#f8fbff] text-sm font-bold text-[#25324a]">
                  <th className="px-4 py-3">日期</th>
                  <th className="px-4 py-3">课程</th>
                  <th className="px-4 py-3">学生</th>
                  <th className="px-4 py-3">校区</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3 text-right">金额</th>
                </tr>
              </thead>
              <tbody>
                {recentLessons.map((lesson) => (
                  <tr
                    key={lesson.id}
                    className={`border-t text-sm text-[#25324a] ${
                      lesson.status === "cancelled" ? "border-[#fecaca] bg-[#fff1f2]" : "border-[#e8eef6]"
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="flex items-center gap-2">
                        <CalendarDays size={16} className="text-[#94a3b8]" />
                        {lesson.date}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[220px] truncate font-semibold text-[#061226]">
                        {courseName(vault, lesson.courseGroupId)}
                      </div>
                      <div className="mt-1 text-xs text-[#64748b]">
                        {lesson.startTime}-{lesson.endTime} · {courseTypeLabels[lesson.type]}
                      </div>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3">{studentNames(vault, lesson.expectedStudentIds)}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        <MapPin size={13} className="text-[#94a3b8]" />
                        {campusName(vault, lesson.campusId)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={lessonStatusVariant(lesson.status)}>
                        {lessonStatusLabels[lesson.status]}
                      </Badge>
                      {lesson.note && (
                        <div className="mt-1 max-w-[180px] truncate text-xs font-semibold text-[#b91c1c]">{lesson.note}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-[#061226]">
                      {formatMoney(lesson.feeSnapshot.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recentLessons.length === 0 && (
              <div className="border-t border-[#e8eef6] p-8 text-center text-sm font-semibold text-[#64748b]">
                这个月没有课时记录
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
