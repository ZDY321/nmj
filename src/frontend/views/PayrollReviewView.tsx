import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Banknote, BookOpen, CalendarDays, FileCheck2, MapPin, SlidersHorizontal, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ScheduleImportPanel } from "@/frontend/components/ScheduleImportPanel";
import type { CourseType, Lesson, TeacherVault } from "@/shared/types";
import { completedAmount, estimatedMonthlyIncome, lessonBillableHours, obligationSummary, salaryBreakdown, todayIso } from "@/frontend/lib/calculations";
import {
  campusName,
  compareByName,
  courseName,
  courseSubject,
  courseTypeLabel,
  courseTypeOptionsForVault,
  formatPrivateMoney,
  lessonStatusLabels,
  lessonStatusSurfaceClass,
  lessonStatusVariant,
  sortLessons,
  sortCampusesForProfile,
  sortCoursesByName,
  studentNames
} from "@/frontend/lib/helpers";

type TypeFilter = "all" | CourseType;
type LessonStatusFilter = "all" | Lesson["status"];
type PayrollPanel = "review" | "reconcile";
type OverviewCampusKey = "oneOnOne" | "classLessons" | "fullTime" | "makeup";
type CampusAmountDetail = {
  key: string;
  campus: string;
  amount: number;
  count: number;
};

export function PayrollReviewView({
  vault,
  amountsVisible,
  panelFocus,
  storageScope,
  onOpenLessonInCalendar
}: {
  vault: TeacherVault;
  amountsVisible: boolean;
  panelFocus?: { panel: PayrollPanel; nonce: number } | null;
  storageScope?: string;
  onOpenLessonInCalendar?: (lesson: Lesson) => void;
}) {
  const campusOptions = useMemo(
    () => sortCampusesForProfile(vault.campuses, vault.profile.homeCampusId),
    [vault.campuses, vault.profile.homeCampusId]
  );
  const courseOptions = useMemo(() => sortCoursesByName(vault.courseGroups), [vault.courseGroups]);
  const [selectedMonth, setSelectedMonth] = useState(todayIso().slice(0, 7));
  const [campusFilter, setCampusFilter] = useState(campusOptions[0]?.id ?? "all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<LessonStatusFilter>("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [detailStartDateFilter, setDetailStartDateFilter] = useState("");
  const [detailEndDateFilter, setDetailEndDateFilter] = useState("");
  const [detailCourseFilter, setDetailCourseFilter] = useState("all");
  const [detailStudentFilter, setDetailStudentFilter] = useState("");
  const [detailStatusFilter, setDetailStatusFilter] = useState<LessonStatusFilter>("all");
  const [payrollPanel, setPayrollPanel] = useState<PayrollPanel>(() => panelFocus?.panel ?? "review");
  const gradeOptions = Array.from(new Set(vault.students.map((student) => student.grade).filter(Boolean) as string[])).sort(compareByName);
  const effectiveObligationCampusId = vault.profile.obligationCampusId ?? vault.profile.homeCampusId;

  useEffect(() => {
    if (panelFocus?.panel) {
      setPayrollPanel(panelFocus.panel);
    }
  }, [panelFocus?.nonce]);

  const monthLessons = vault.lessons.filter((lesson) => lesson.date.startsWith(selectedMonth));
  function lessonCampusId(lesson: Lesson): string | undefined {
    return lesson.campusId ?? vault.courseGroups.find((course) => course.id === lesson.courseGroupId)?.defaultCampusId;
  }

  function matchesGradeFilter(lesson: Lesson): boolean {
    return (
      gradeFilter === "all" ||
      lesson.expectedStudentIds.some((studentId) => vault.students.find((student) => student.id === studentId)?.grade === gradeFilter)
    );
  }

  function matchesReviewFilters(lesson: Lesson, includeCampus: boolean): boolean {
    const matchesCampus = !includeCampus || campusFilter === "all" || lessonCampusId(lesson) === campusFilter;
    const matchesType = typeFilter === "all" || lesson.type === typeFilter;
    const matchesStatus = statusFilter === "all" || lesson.status === statusFilter;
    return matchesCampus && matchesType && matchesStatus && matchesGradeFilter(lesson);
  }

  const filteredLessons = monthLessons
    .filter((lesson) => matchesReviewFilters(lesson, true))
    .sort(sortLessons);
  const detailLessons = filteredLessons
    .filter((lesson) => {
      const matchesDate =
        (!detailStartDateFilter || lesson.date >= detailStartDateFilter) &&
        (!detailEndDateFilter || lesson.date <= detailEndDateFilter);
      const matchesCourse = detailCourseFilter === "all" || lesson.courseGroupId === detailCourseFilter;
      const matchesStudent =
        !detailStudentFilter.trim() ||
        studentNames(vault, lesson.expectedStudentIds).toLowerCase().includes(detailStudentFilter.trim().toLowerCase());
      const matchesStatus = detailStatusFilter === "all" || lesson.status === detailStatusFilter;
      return matchesDate && matchesCourse && matchesStudent && matchesStatus;
    })
    .sort(sortLessons);

  const breakdown = salaryBreakdown(vault, selectedMonth);
  const estimatedIncome = estimatedMonthlyIncome(vault, selectedMonth);
  const currentCampusObligation = campusFilter === "all" ? obligationSummary(vault, selectedMonth) : obligationSummary(vault, selectedMonth, campusFilter);
  const campusLessonFee = filteredLessons.reduce((sum, lesson) => sum + completedAmount(lesson), 0);
  const campusHours = filteredLessons.reduce((sum, lesson) => {
    if (lesson.status !== "completed" && lesson.status !== "makeup_completed") return sum;
    return sum + lessonBillableHours(lesson);
  }, 0);
  const campusDeduction = campusFilter === "all" || campusFilter === effectiveObligationCampusId ? currentCampusObligation.amount : 0;
  const campusNet = campusLessonFee - campusDeduction;

  const lessonCampusAmounts = useMemo<Record<OverviewCampusKey, CampusAmountDetail[]>>(() => {
    const buckets: Record<OverviewCampusKey, Record<string, CampusAmountDetail>> = {
      oneOnOne: {},
      classLessons: {},
      fullTime: {},
      makeup: {}
    };

    function addDetail(bucket: OverviewCampusKey, campusId: string | undefined, amount: number) {
      const key = campusId || "__unset";
      buckets[bucket][key] ??= {
        key,
        campus: campusName(vault, campusId),
        amount: 0,
        count: 0
      };
      buckets[bucket][key].amount += amount;
      buckets[bucket][key].count += 1;
    }

    monthLessons.forEach((lesson) => {
      if (lesson.status !== "completed" && lesson.status !== "makeup_completed") return;
      const course = vault.courseGroups.find((item) => item.id === lesson.courseGroupId);
      const campusId = lesson.campusId ?? course?.defaultCampusId;
      const amount = completedAmount(lesson);
      if (lesson.status === "makeup_completed") {
        addDetail("makeup", campusId, amount);
      } else if (lesson.type === "class") {
        addDetail("classLessons", campusId, amount);
      } else if (lesson.type === "full_time") {
        addDetail("fullTime", campusId, amount);
      } else {
        addDetail("oneOnOne", campusId, amount);
      }
    });

    return {
      oneOnOne: Object.values(buckets.oneOnOne).sort((a, b) => b.amount - a.amount),
      classLessons: Object.values(buckets.classLessons).sort((a, b) => b.amount - a.amount),
      fullTime: Object.values(buckets.fullTime).sort((a, b) => b.amount - a.amount),
      makeup: Object.values(buckets.makeup).sort((a, b) => b.amount - a.amount)
    };
  }, [monthLessons, vault]);

  const campusSummaries = useMemo(() => {
    const campusSummaryBaseLessons = monthLessons.filter((lesson) => matchesReviewFilters(lesson, false));
    return campusOptions.map((campus) => {
      const lessons = campusSummaryBaseLessons.filter((lesson) => lessonCampusId(lesson) === campus.id);
      const amount = lessons.reduce((sum, lesson) => sum + completedAmount(lesson), 0);
      const hours = lessons.reduce((sum, lesson) => {
        if (lesson.status !== "completed" && lesson.status !== "makeup_completed") return sum;
        return sum + lessonBillableHours(lesson);
      }, 0);
      const obligation = campus.id === effectiveObligationCampusId ? obligationSummary(vault, selectedMonth, campus.id).amount : 0;
      return {
        campus,
        lessons,
        amount,
        hours,
        obligation,
        net: amount - obligation
      };
    });
  }, [campusOptions, effectiveObligationCampusId, monthLessons, selectedMonth, vault, typeFilter, statusFilter, gradeFilter]);

  const typeCounts = filteredLessons.reduce<Record<string, number>>(
    (summary, lesson) => {
      summary[lesson.type] = (summary[lesson.type] ?? 0) + 1;
      return summary;
    },
    {}
  );
  const typeCountCards = courseTypeOptionsForVault(vault).map((type) => ({
    ...type,
    count: typeCounts[type.value] ?? 0
  }));

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-[16px] border border-[#dbe4ef] bg-white">
        <div className="flex w-full min-w-max items-center gap-1 p-1 md:min-w-0">
          {[
            { key: "review" as PayrollPanel, label: "工资核对" },
            { key: "reconcile" as PayrollPanel, label: "教务课表对账" }
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setPayrollPanel(item.key)}
              className={`min-w-[140px] flex-1 rounded-[12px] px-4 py-2 text-sm font-extrabold transition-colors ${
                payrollPanel === item.key ? "bg-[#1557c2] text-white" : "text-[#25324a] hover:bg-[#f8fbff]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {payrollPanel === "reconcile" ? (
        <ScheduleImportPanel vault={vault} storageScope={storageScope} onOpenLesson={onOpenLessonInCalendar} />
      ) : (
      <>
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
              <FileCheck2 size={14} /> 月底工资核对
            </div>
            <CardTitle>按校区核对课程、义务课时和本月收入</CardTitle>
            <CardDescription className="mt-2">
              先选月份和校区，再核对每节课的状态、班型、学生和扣费后小计。
            </CardDescription>
          </div>
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:w-auto lg:min-w-[860px] xl:grid-cols-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">月份</label>
              <Input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">校区</label>
              <Select value={campusFilter} onChange={(event) => setCampusFilter(event.target.value)}>
                <option value="all">全部校区</option>
                {campusOptions.map((campus) => (
                  <option key={campus.id} value={campus.id}>{campus.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">课程类型</label>
              <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}>
                <option value="all">全部类型</option>
                {courseTypeOptionsForVault(vault).map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">状态</label>
              <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as LessonStatusFilter)}>
                <option value="all">全部状态</option>
                {Object.entries(lessonStatusLabels).map(([status, label]) => (
                  <option key={status} value={status}>{label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">年级</label>
              <Select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}>
                <option value="all">全部年级</option>
                {gradeOptions.map((grade) => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "筛选课次", value: `${filteredLessons.length} 节`, hint: `已完成 ${campusHours.toFixed(1)} 小时`, icon: CalendarDays },
          { label: "课时费小计", value: formatPrivateMoney(campusLessonFee, amountsVisible), hint: "仅统计已完成/补课完成", icon: Banknote },
          {
            label: "义务课时扣费",
            value: `-${formatPrivateMoney(campusDeduction, amountsVisible)}`,
            hint: currentCampusObligation.mode === "manual"
              ? "手动填写扣除"
              : `缺口 ${currentCampusObligation.missingHours.toFixed(1)} / ${currentCampusObligation.requiredHours || 0} 小时`,
            icon: SlidersHorizontal,
            danger: true
          },
          { label: "本月预估收入", value: formatPrivateMoney(estimatedIncome, amountsVisible), hint: "含待上课课节预估", icon: BookOpen },
          { label: "当前校区扣后", value: formatPrivateMoney(campusNet, amountsVisible), hint: campusFilter === "all" ? "全部校区扣后课时费" : campusName(vault, campusFilter), icon: FileCheck2 }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="overflow-hidden">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#eaf2ff] text-[#1557c2]">
                  <Icon size={21} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#64748b]">{item.label}</div>
                  <div className={`mt-1 text-2xl font-extrabold ${"danger" in item && item.danger ? "text-[#b91c1c]" : "text-[#061226]"}`}>{item.value}</div>
                  <div className="mt-1 text-[11px] font-bold leading-4 text-[#94a3b8]">{item.hint}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

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
                onClick={() => setCampusFilter(item.campus.id)}
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
                { label: "一对一", value: breakdown.oneOnOne, details: lessonCampusAmounts.oneOnOne },
                { label: "班课", value: breakdown.classLessons, details: lessonCampusAmounts.classLessons },
                { label: "全日制", value: breakdown.fullTime, details: lessonCampusAmounts.fullTime },
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

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
            <Users size={14} /> 课程明细
          </div>
          <CardTitle>校区课程明细</CardTitle>
          <CardDescription>这里展示课程记录与课时费明细，可在当前月份、校区、类型、状态和年级基础上继续筛选。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">开始日期</label>
              <Input type="date" value={detailStartDateFilter} onChange={(event) => setDetailStartDateFilter(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">结束日期</label>
              <Input type="date" value={detailEndDateFilter} onChange={(event) => setDetailEndDateFilter(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">具体课程</label>
              <Select value={detailCourseFilter} onChange={(event) => setDetailCourseFilter(event.target.value)}>
                <option value="all">全部课程</option>
                {courseOptions.map((course) => (
                  <option key={course.id} value={course.id}>{course.name} · {course.subject}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">学生筛选</label>
              <Input value={detailStudentFilter} onChange={(event) => setDetailStudentFilter(event.target.value)} placeholder="输入学生名" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">状态筛选</label>
              <Select value={detailStatusFilter} onChange={(event) => setDetailStatusFilter(event.target.value as LessonStatusFilter)}>
                <option value="all">全部状态</option>
                {Object.entries(lessonStatusLabels).map(([status, label]) => (
                  <option key={status} value={status}>{label}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-[14px] border border-[#e8eef6] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-extrabold text-[#061226]">当前明细结果</div>
              <div className="mt-1 text-xs font-semibold text-[#64748b]">
                明细筛选 {detailLessons.length} 条；上方工资核对筛选共 {filteredLessons.length} 条。
              </div>
            </div>
            <Badge variant="secondary" className="w-fit">{detailLessons.length} 条记录</Badge>
          </div>
          {detailLessons.map((lesson, index) => (
            <motion.button
              key={lesson.id}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.02 }}
              onClick={() => onOpenLessonInCalendar?.(lesson)}
              className={`w-full rounded-[14px] border p-4 text-left transition-all hover:border-[#ff8617] hover:shadow-[0_10px_24px_rgba(15,35,66,0.08)] ${
                lesson.attendance.some((entry) => entry.status === "leave_requested" || entry.status === "absent" || entry.status === "makeup_pending")
                  ? "border-[#fed7aa] bg-[#fff7ed]"
                  : lessonStatusSurfaceClass(lesson.status)
              }`}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-base text-[#061226]">{courseName(vault, lesson.courseGroupId)}</strong>
                    <Badge variant="secondary">{courseSubject(vault, lesson.courseGroupId)}</Badge>
                    <Badge variant={lessonStatusVariant(lesson.status)}>{lessonStatusLabels[lesson.status]}</Badge>
                    <Badge variant="secondary">{courseTypeLabel(vault, lesson.type)}</Badge>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[#475569]">
                    {lesson.date} · {lesson.startTime}-{lesson.endTime} · {campusName(vault, lessonCampusId(lesson))}
                  </div>
                  <div className="mt-1 text-sm text-[#64748b]">{studentNames(vault, lesson.expectedStudentIds) || "未设置学生"}</div>
                  {lesson.attendance.some((entry) => entry.status === "leave_requested" || entry.status === "absent" || entry.status === "makeup_pending") && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {lesson.attendance
                        .filter((entry) => entry.status === "leave_requested" || entry.status === "absent" || entry.status === "makeup_pending")
                        .map((entry) => (
                          <Badge key={entry.studentId} variant="amber">
                            {studentNames(vault, [entry.studentId])} · 请假/待补
                          </Badge>
                        ))}
                    </div>
                  )}
                  {lesson.note && (
                    <div className="mt-2 rounded-[10px] bg-white/72 px-3 py-2 text-sm font-semibold text-[#7f1d1d]">
                      备注：{lesson.note}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs font-bold text-[#64748b]">确认金额</div>
                  <div className="mt-1 text-lg font-extrabold text-[#061226]">{formatPrivateMoney(completedAmount(lesson), amountsVisible)}</div>
                </div>
              </div>
            </motion.button>
          ))}
          {detailLessons.length === 0 && (
            <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
              当前筛选下没有课时记录
            </div>
          )}
        </CardContent>
      </Card>

      </>
      )}
    </div>
  );
}
