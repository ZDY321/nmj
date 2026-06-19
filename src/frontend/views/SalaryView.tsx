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
import type { Lesson, SalaryAdjustment, TeacherVault } from "@/shared/types";
import { makeId } from "@/frontend/lib/crypto";
import {
  attendanceSummary,
  estimatedMonthlyIncome,
  isPayrollExcludedSplitMergeLesson,
  lessonBillableHours,
  obligationSummary,
  payrollCompletedLessonCount,
  payrollExcludedSplitMergeLessonIds,
  salaryBreakdown,
  todayIso,
  yearlyTrend
} from "@/frontend/lib/calculations";
import {
  attendanceLabels,
  campusName,
  courseName,
  courseSubject,
  courseTypeLabel,
  formatPrivateMoney,
  lessonAttendanceNoteText,
  lessonCampusId,
  lessonStudentIds,
  lessonStatusLabels,
  lessonStatusVariant,
  lessonTimeRangeLabel,
  sortLessons,
  sortCampusesForProfile,
  sortCoursesByName,
  studentNames
} from "@/frontend/lib/helpers";
import { MetricCard } from "@/frontend/components/MetricCard";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";

const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
type YearTrendItem = ReturnType<typeof yearlyTrend>[number];

export function SalaryView({
  vault,
  amountsVisible,
  onAddAdjustment,
  onDeleteAdjustment,
  onOpenLessonInCalendar
}: {
  vault: TeacherVault;
  amountsVisible: boolean;
  onAddAdjustment: (adjustment: SalaryAdjustment) => void;
  onDeleteAdjustment: (adjustmentId: string) => void;
  onOpenLessonInCalendar?: (lesson: Lesson) => void;
}) {
  const [selectedMonth, setSelectedMonth] = useState(todayIso().slice(0, 7));
  const [adjustmentTitle, setAdjustmentTitle] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [detailStartDateFilter, setDetailStartDateFilter] = useState("");
  const [detailEndDateFilter, setDetailEndDateFilter] = useState("");
  const [detailCourseFilter, setDetailCourseFilter] = useState("all");
  const [detailStudentFilter, setDetailStudentFilter] = useState("");
  const [detailCampusFilter, setDetailCampusFilter] = useState("all");
  const [detailStatusFilter, setDetailStatusFilter] = useState<"all" | Lesson["status"]>("all");
  const { confirm, dialog } = useConfirmDialog();
  const campusOptions = sortCampusesForProfile(vault.campuses, vault.profile.homeCampusId);
  const courseOptions = sortCoursesByName(vault.courseGroups);
  const year = selectedMonth.slice(0, 4);
  const breakdown = salaryBreakdown(vault, selectedMonth);
  const estimatedIncome = estimatedMonthlyIncome(vault, selectedMonth);
  const summary = attendanceSummary(vault, selectedMonth);
  const currentMonth = todayIso().slice(0, 7);
  const currentYear = currentMonth.slice(0, 4);
  const trend = yearlyTrend(vault, year).filter((item) => year < currentYear || item.month <= currentMonth);
  const yearOptions = Array.from(new Set([
    currentYear,
    ...vault.lessons.map((lesson) => lesson.date.slice(0, 4)),
    ...vault.salaryAdjustments.map((adjustment) => adjustment.month.slice(0, 4))
  ])).sort((a, b) => b.localeCompare(a));
  const monthLessons = vault.lessons.filter((lesson) => lesson.date.startsWith(selectedMonth));
  const payrollLessonCount = payrollCompletedLessonCount(vault, selectedMonth);
  const splitMergeExcludedLessonIds = payrollExcludedSplitMergeLessonIds(vault, selectedMonth);
  const splitMergeExcludedCount = monthLessons.filter((lesson) => isPayrollExcludedSplitMergeLesson(lesson, splitMergeExcludedLessonIds)).length;
  const completedThisMonth = monthLessons.filter((lesson) => lesson.status === "completed" || lesson.status === "makeup_completed");
  const totalHours = monthLessons.reduce((sum, lesson) => sum + lessonBillableHours(lesson), 0);
  const recentLessons = [...monthLessons]
    .filter((lesson) => {
      const matchesDate =
        (!detailStartDateFilter || lesson.date >= detailStartDateFilter) &&
        (!detailEndDateFilter || lesson.date <= detailEndDateFilter);
      const matchesCourse = detailCourseFilter === "all" || lesson.courseGroupId === detailCourseFilter;
      const studentSearchTerms = detailStudentFilter.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const studentSearchText = [
        studentNames(vault, lessonStudentIds(lesson)),
        lessonAttendanceNoteText(vault, lesson)
      ].join(" ").toLowerCase();
      const matchesStudent =
        studentSearchTerms.length === 0 ||
        studentSearchTerms.every((term) => studentSearchText.includes(term));
      const matchesCampus = detailCampusFilter === "all" || lessonCampusId(vault, lesson) === detailCampusFilter;
      const matchesStatus = detailStatusFilter === "all" || lesson.status === detailStatusFilter;
      return matchesDate && matchesCourse && matchesStudent && matchesCampus && matchesStatus;
    })
    .sort(sortLessons)
    .reverse();
  const filteredCompletedLessons = recentLessons.filter((lesson) => isCompletedLessonStatus(lesson.status));
  const filteredPendingLessons = recentLessons.filter((lesson) => isPendingLessonStatus(lesson.status));
  const filteredCancelledLessons = recentLessons.filter((lesson) => lesson.status === "cancelled");
  const filteredTotalAmount = recentLessons.reduce((sum, lesson) => sum + lesson.feeSnapshot.amount, 0);
  const filteredTotalHours = recentLessons.reduce((sum, lesson) => sum + lessonBillableHours(lesson), 0);
  const filteredMissedAttendanceCount = recentLessons.reduce(
    (sum, lesson) => sum + lesson.attendance.filter((entry) => isMissedAttendanceStatus(entry.status)).length,
    0
  );
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

  function changeYear(nextYear: string) {
    const monthPart = selectedMonth.slice(5);
    const nextMonth = `${nextYear}-${monthPart}`;
    setSelectedMonth(nextYear === currentYear && nextMonth > currentMonth ? currentMonth : nextMonth);
  }

  return (
    <div className="space-y-6">
      {dialog}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="基本工资" value={formatPrivateMoney(breakdown.baseSalary, amountsVisible)} hint="月固定项" variant={1} index={0} showSparkline={false} />
        <MetricCard label="一对一" value={formatPrivateMoney(breakdown.oneOnOne, amountsVisible)} hint="已完成课程" variant={2} index={1} showSparkline={false} />
        <MetricCard label="班课" value={formatPrivateMoney(breakdown.classLessons, amountsVisible)} hint="按到课人数" variant={3} index={2} showSparkline={false} />
        <MetricCard label="全日制" value={formatPrivateMoney(breakdown.fullTime, amountsVisible)} hint="已完成课程" variant={4} index={3} showSparkline={false} />
        <MetricCard label="合计" value={formatPrivateMoney(breakdown.total, amountsVisible)} hint="含补贴/扣款" variant={1} index={4} showSparkline={false} />
        <MetricCard label="预估本月收入" value={formatPrivateMoney(estimatedIncome, amountsVisible)} hint="含本月待上课课节预估" variant={2} index={5} showSparkline={false} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
              <Banknote size={14} /> 工资设置
            </div>
            <CardTitle>工资配置</CardTitle>
            <CardDescription>基本工资、课时费、补贴扣款和义务课时扣费会共同进入月工资合计。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <p className="text-sm font-medium">收入明细</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  { label: "基本工资", value: breakdown.baseSalary, icon: Banknote, color: "text-[#061226] bg-[#eef0ff]" },
                  { label: "一对一", value: breakdown.oneOnOne, icon: Users, color: "text-[#1557c2] bg-[#eaf2ff]" },
                  { label: "班课", value: breakdown.classLessons, icon: BookOpen, color: "text-[#ff8617] bg-[#fff1e2]" },
                  { label: "全日制", value: breakdown.fullTime, icon: CalendarDays, color: "text-[#5161d6] bg-[#eef0ff]" },
                  { label: "补课", value: breakdown.makeup, icon: Clock, color: "text-[#1557c2] bg-[#eaf2ff]" },
                  { label: "其他加减项", value: breakdown.adjustments, icon: TrendingUp, color: "text-[#16a34a] bg-[#e8f8ef]" },
                  { label: "义务课时扣费", value: -breakdown.obligationDeduction, icon: FileCheck2, color: "text-[#b91c1c] bg-[#fff1f2]", danger: true },
                  { label: "本月工资合计", value: breakdown.total, icon: Banknote, color: "text-[#061226] bg-[#eef0ff]", total: true }
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
                      <span className={`text-sm font-bold ${"danger" in item && item.danger ? "text-[#b91c1c]" : "text-[#061226]"}`}>
                        {formatPrivateMoney(item.value, amountsVisible)}
                      </span>
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
                      {obligation.mode === "manual"
                        ? ` · 手动扣 ${formatPrivateMoney(obligation.manualAmount, amountsVisible)}`
                        : `${obligation.course ? ` · ${obligation.course.name}` : ""} · 课程扣 ${formatPrivateMoney(obligation.courseDeductionAmount, amountsVisible)}，补扣 ${obligation.fallbackHours.toFixed(1)} / ${obligation.requiredHours || 0} 小时`}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-extrabold text-[#b91c1c]">
                    -{formatPrivateMoney(obligation.amount, amountsVisible)}
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
                        {item.amount >= 0 ? "+" : ""}{formatPrivateMoney(item.amount, amountsVisible)}
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
              <CardDescription className="mt-2">
                包含基本工资、已完成课时费、补贴扣款和义务课时扣费；下方课节数为对账后的计薪口径，不等同于排课日历总节数。
              </CardDescription>
            </div>
            <Select value={year} onChange={(event) => changeYear(event.target.value)} className="h-10 w-[112px]" aria-label="选择统计年份">
              {yearOptions.map((optionYear) => (
                <option key={optionYear} value={optionYear}>{optionYear}年</option>
              ))}
            </Select>
          </CardHeader>
          <CardContent className="space-y-5">
            <AnnualIncomeLineChart trend={trend} selectedMonth={selectedMonth} amountsVisible={amountsVisible} onSelectMonth={setSelectedMonth} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-4">
              {trend.map((item) => (
                <button
                  key={item.month}
                  type="button"
                  onClick={() => setSelectedMonth(item.month)}
                  className={`rounded-[12px] border bg-white p-3 text-left transition-colors ${
                    selectedMonth === item.month
                      ? "border-[#1557c2] ring-1 ring-[#1557c2]"
                      : "border-[#dbe4ef] hover:border-[#1557c2]"
                  }`}
                >
                  <div className="text-xs font-bold text-[#64748b]">{monthNames[Number(item.month.slice(5)) - 1]}</div>
                  <div className="mt-2 break-words text-lg font-extrabold leading-tight text-[#061226]">{formatPrivateMoney(item.total, amountsVisible)}</div>
                  <div className="mt-2 text-[11px] font-semibold text-[#64748b]">{item.count} 节计薪课</div>
                </button>
              ))}
            </div>
            <div className="mt-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-extrabold text-[#061226]">本年每月计薪课次</div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
                    仅统计已完成/补课完成且进入工资统计的课节；教务 Excel 对账中拆分合并后不单独计费的云端课节会排除。
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                {trend.map((item) => (
                  <button
                    key={item.month}
                    type="button"
                    onClick={() => setSelectedMonth(item.month)}
                    className={`rounded-[12px] border bg-white px-3 py-2 text-center transition-colors ${
                      selectedMonth === item.month ? "border-[#1557c2] ring-1 ring-[#1557c2]" : "border-[#dbe4ef] hover:border-[#1557c2]"
                    }`}
                  >
                    <span className="block text-[11px] font-bold text-[#64748b]">{Number(item.month.slice(5))}月</span>
                    <span className="mt-1 block text-xl font-extrabold text-[#061226]">{item.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
            <FileCheck2 size={14} /> 数据核对
          </div>
          <CardTitle>{selectedMonth} 教学数据与到课核对</CardTitle>
          <CardDescription>
            点击上方年度趋势中的月份，可切换这里的核对月份；排课总节数来自日历课表，计薪课节来自工资统计和教务 Excel 对账后的结果。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-11">
            {[
              { label: "总收入", value: formatPrivateMoney(breakdown.total, amountsVisible) },
              { label: "预估本月收入", value: formatPrivateMoney(estimatedIncome, amountsVisible) },
              { label: "课时", value: `${(totalHours || completedThisMonth.length * 2).toFixed(1)} 小时` },
              { label: "排课总节数", value: `${monthLessons.length} 节` },
              { label: "计薪课节", value: `${payrollLessonCount} 节` },
              ...Object.entries(summary).map(([key, value]) => ({
                label: attendanceLabels[key as keyof typeof attendanceLabels],
                value: `${value}`
              }))
            ].map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.025 }}
                className="rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] p-3"
              >
                <div className="text-xs font-semibold text-[#64748b]">{item.label}</div>
                <div className="mt-1 break-words text-base font-extrabold text-[#061226]">{item.value}</div>
              </motion.div>
            ))}
          </div>
          <div className="rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] px-4 py-3 text-xs font-semibold leading-5 text-[#64748b]">
            口径说明：排课日历统计所有本月课节；本页收入趋势里的课节数按计薪口径统计，只包含已完成/补课完成且未被对账拆分合并排除的课节。
            {splitMergeExcludedCount > 0 ? ` 当前月份有 ${splitMergeExcludedCount} 节课因拆分合并对账标记为不单独计费。` : ""}
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">开始日期</label>
              <Input type="date" value={detailStartDateFilter} onChange={(event) => setDetailStartDateFilter(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">结束日期</label>
              <Input type="date" value={detailEndDateFilter} onChange={(event) => setDetailEndDateFilter(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">课程筛选</label>
              <Select value={detailCourseFilter} onChange={(event) => setDetailCourseFilter(event.target.value)}>
                <option value="all">全部课程</option>
                {courseOptions.map((course) => (
                  <option key={course.id} value={course.id}>{course.name} · {course.subject}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">学生筛选</label>
              <Input value={detailStudentFilter} onChange={(event) => setDetailStudentFilter(event.target.value)} placeholder="输入学生名或备注" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">校区筛选</label>
              <Select value={detailCampusFilter} onChange={(event) => setDetailCampusFilter(event.target.value)}>
                <option value="all">全部校区</option>
                {campusOptions.map((campus) => (
                  <option key={campus.id} value={campus.id}>{campus.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">状态筛选</label>
              <Select value={detailStatusFilter} onChange={(event) => setDetailStatusFilter(event.target.value as "all" | Lesson["status"])}>
                <option value="all">全部状态</option>
                {Object.entries(lessonStatusLabels).map(([status, label]) => (
                  <option key={status} value={status}>{label}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="rounded-[14px] border border-[#dbe4ef] bg-white p-4 shadow-[0_10px_24px_rgba(15,35,66,0.04)]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-extrabold text-[#061226]">当前筛选结果</div>
                <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
                  按上方日期、课程、学生、校区和状态筛选后的课时汇总。
                </div>
              </div>
              <Badge variant="secondary" className="w-fit">
                {recentLessons.length} 条记录
              </Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
              {[
                { label: "总课次", value: `${recentLessons.length} 节` },
                { label: "课时金额", value: formatPrivateMoney(filteredTotalAmount, amountsVisible) },
                { label: "课时合计", value: `${filteredTotalHours.toFixed(1)} 小时` },
                { label: "已完成", value: `${filteredCompletedLessons.length} 节` },
                { label: "未上/待补", value: `${filteredPendingLessons.length} 节` },
                { label: "缺勤请假", value: `${filteredMissedAttendanceCount} 人次` },
                { label: "已取消", value: `${filteredCancelledLessons.length} 节` }
              ].map((item) => (
                <div key={item.label} className="rounded-[12px] border border-[#e8eef6] bg-[#f8fbff] p-3">
                  <div className="text-xs font-semibold text-[#64748b]">{item.label}</div>
                  <div className="mt-1 break-words text-base font-extrabold text-[#061226]">{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {recentLessons.length > 0 && (
            <div className="space-y-3 md:hidden">
              {recentLessons.map((lesson) => (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => onOpenLessonInCalendar?.(lesson)}
                  className={`w-full rounded-[14px] border p-4 text-left transition-all hover:border-[#ff8617] hover:shadow-[0_10px_24px_rgba(15,35,66,0.08)] ${
                    lesson.status === "cancelled" ? "border-[#fecaca] bg-[#fff1f2]" : "border-[#dbe4ef] bg-[#f8fbff]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#64748b]">
                        <CalendarDays size={14} className="shrink-0 text-[#94a3b8]" />
                        {lesson.date} · {lessonTimeRangeLabel(lesson)}
                      </div>
                      <div className="mt-1 break-words text-base font-extrabold text-[#061226]">
                        {courseName(vault, lesson.courseGroupId)}
                      </div>
                      <div className="mt-1 text-xs font-semibold text-[#64748b]">{courseSubject(vault, lesson.courseGroupId)}</div>
                      <div className="mt-1 text-xs font-semibold text-[#64748b]">
                        {studentNames(vault, lesson.expectedStudentIds) || "未设置学生"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-extrabold text-[#061226]">{formatPrivateMoney(lesson.feeSnapshot.amount, amountsVisible)}</div>
                      <Badge variant={lessonStatusVariant(lesson.status)} className="mt-2">
                        {lessonStatusLabels[lesson.status]}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-[#64748b]">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 ring-1 ring-[#dbe4ef]">
                      <MapPin size={12} /> {campusName(vault, lessonCampusId(vault, lesson))}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-[#dbe4ef]">
                      {courseTypeLabel(vault, lesson.type)}
                    </span>
                  </div>
                  {lesson.note && (
                    <div className="mt-3 rounded-[12px] border border-[#fecaca] bg-white px-3 py-2 text-xs font-semibold leading-5 text-[#b91c1c]">
                      {lesson.note}
                    </div>
                  )}
                  {lessonAttendanceNoteText(vault, lesson) && (
                    <div className="mt-3 rounded-[12px] border border-[#fed7aa] bg-white px-3 py-2 text-xs font-semibold leading-5 text-[#9a3412]">
                      学生备注：{lessonAttendanceNoteText(vault, lesson)}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="hidden overflow-x-auto md:block">
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
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenLessonInCalendar?.(lesson)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpenLessonInCalendar?.(lesson);
                      }
                    }}
                    className={`cursor-pointer border-t text-sm text-[#25324a] transition-colors hover:bg-[#fff7ed] ${
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
                      <div className="mt-1 text-xs text-[#64748b]">{courseSubject(vault, lesson.courseGroupId)}</div>
                      <div className="mt-1 text-xs text-[#64748b]">
                        {lessonTimeRangeLabel(lesson)} · {courseTypeLabel(vault, lesson.type)}
                      </div>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3">{studentNames(vault, lesson.expectedStudentIds)}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        <MapPin size={13} className="text-[#94a3b8]" />
                        {campusName(vault, lessonCampusId(vault, lesson))}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={lessonStatusVariant(lesson.status)}>
                        {lessonStatusLabels[lesson.status]}
                      </Badge>
                      {lesson.note && (
                        <div className="mt-1 max-w-[180px] truncate text-xs font-semibold text-[#b91c1c]">{lesson.note}</div>
                      )}
                      {lessonAttendanceNoteText(vault, lesson) && (
                        <div className="mt-1 max-w-[180px] truncate text-xs font-semibold text-[#9a3412]">
                          学生备注：{lessonAttendanceNoteText(vault, lesson)}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-[#061226]">
                      {formatPrivateMoney(lesson.feeSnapshot.amount, amountsVisible)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {recentLessons.length === 0 && (
            <div className="border-t border-[#e8eef6] p-8 text-center text-sm font-semibold text-[#64748b]">
              这个月没有课时记录
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AnnualIncomeLineChart({
  trend,
  selectedMonth,
  amountsVisible,
  onSelectMonth
}: {
  trend: YearTrendItem[];
  selectedMonth: string;
  amountsVisible: boolean;
  onSelectMonth: (month: string) => void;
}) {
  if (trend.length === 0) {
    return (
      <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-white px-4 py-8 text-center text-sm font-semibold text-[#64748b]">
        当前年份暂无收入数据
      </div>
    );
  }

  const totals = trend.map((item) => item.total);
  const maxTotal = niceChartMax(Math.max(0, ...totals));
  const minTotal = Math.min(0, ...totals);
  const range = Math.max(maxTotal - minTotal, 1);
  const plotLeft = 76;
  const plotRight = 744;
  const plotTop = 24;
  const plotBottom = 190;
  const gridValues = Array.from({ length: 5 }, (_, index) => maxTotal - (range / 4) * index);
  const points = trend.map((item, index) => {
    const x = trend.length === 1 ? (plotLeft + plotRight) / 2 : plotLeft + (index / (trend.length - 1)) * (plotRight - plotLeft);
    const y = plotTop + ((maxTotal - item.total) / range) * (plotBottom - plotTop);
    return { ...item, x, y };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="rounded-[12px] border border-[#dbe4ef] bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-extrabold text-[#061226]">月收入折线</div>
        <div className="text-xs font-bold text-[#64748b]">点击节点切换月份</div>
      </div>
      <svg viewBox="0 0 760 230" className="h-[240px] w-full overflow-visible" role="img" aria-label="月收入折线图">
        {gridValues.map((value) => {
          const y = plotTop + ((maxTotal - value) / range) * (plotBottom - plotTop);
          return (
            <g key={value}>
              <line x1={plotLeft} x2={plotRight} y1={y} y2={y} stroke="#e8eef6" strokeDasharray="4 6" />
              <text x="4" y={y + 4} className="fill-[#64748b] text-[12px] font-semibold">
                {formatPrivateMoney(value, amountsVisible)}
              </text>
            </g>
          );
        })}
        {line && <polyline points={line} fill="none" stroke="#1557c2" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
        {points.map((point) => {
          const selected = point.month === selectedMonth;
          return (
            <g key={point.month} className="cursor-pointer" onClick={() => onSelectMonth(point.month)}>
              <circle cx={point.x} cy={point.y} r="15" fill="transparent" />
              <circle cx={point.x} cy={point.y} r={selected ? "7" : "5"} fill={selected ? "#1557c2" : "#fff"} stroke="#1557c2" strokeWidth="3">
                <title>{`${point.month}：${formatPrivateMoney(point.total, amountsVisible)}，${point.count} 节`}</title>
              </circle>
              <text x={point.x} y="222" textAnchor="middle" className="fill-[#64748b] text-[11px] font-semibold">
                {Number(point.month.slice(5))}月
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function niceChartMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find((candidate) => normalized <= candidate) ?? 10;
  return step * magnitude;
}

function isCompletedLessonStatus(status: string): boolean {
  return status === "completed" || status === "makeup_completed";
}

function isPendingLessonStatus(status: string): boolean {
  return status === "draft" || status === "scheduled" || status === "makeup_pending";
}

function isMissedAttendanceStatus(status: string): boolean {
  return status === "leave_requested" || status === "absent" || status === "cancelled" || status === "makeup_pending";
}
