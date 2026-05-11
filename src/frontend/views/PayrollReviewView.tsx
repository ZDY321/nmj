import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Banknote, BookOpen, CalendarDays, FileCheck2, MapPin, SlidersHorizontal, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { CourseType, TeacherVault } from "@/shared/types";
import { completedAmount, hoursBetween, obligationSummary, salaryBreakdown, todayIso } from "@/frontend/lib/calculations";
import {
  campusName,
  courseName,
  courseTypeLabels,
  formatMoney,
  lessonStatusLabels,
  lessonStatusSurfaceClass,
  lessonStatusVariant,
  sortLessons,
  studentNames
} from "@/frontend/lib/helpers";

type TypeFilter = "all" | CourseType;
type OverviewCampusKey = "oneOnOne" | "classLessons" | "makeup";
type CampusAmountDetail = {
  key: string;
  campus: string;
  amount: number;
  count: number;
};

export function PayrollReviewView({ vault }: { vault: TeacherVault }) {
  const [selectedMonth, setSelectedMonth] = useState(todayIso().slice(0, 7));
  const [campusFilter, setCampusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const gradeOptions = Array.from(new Set(vault.students.map((student) => student.grade).filter(Boolean) as string[]));

  const monthLessons = vault.lessons.filter((lesson) => lesson.date.startsWith(selectedMonth));
  const filteredLessons = monthLessons
    .filter((lesson) => {
      const campusId = lesson.campusId ?? vault.courseGroups.find((course) => course.id === lesson.courseGroupId)?.defaultCampusId;
      const matchesCampus = campusFilter === "all" || campusId === campusFilter;
      const matchesType = typeFilter === "all" || lesson.type === typeFilter;
      const matchesGrade =
        gradeFilter === "all" ||
        lesson.expectedStudentIds.some((studentId) => vault.students.find((student) => student.id === studentId)?.grade === gradeFilter);
      return matchesCampus && matchesType && matchesGrade;
    })
    .sort(sortLessons);

  const breakdown = salaryBreakdown(vault, selectedMonth);
  const currentCampusObligation = campusFilter === "all" ? obligationSummary(vault, selectedMonth) : obligationSummary(vault, selectedMonth, campusFilter);
  const campusLessonFee = filteredLessons.reduce((sum, lesson) => sum + completedAmount(lesson), 0);
  const campusHours = filteredLessons.reduce((sum, lesson) => {
    if (lesson.status !== "completed" && lesson.status !== "makeup_completed") return sum;
    return sum + (lesson.feeSnapshot.hours ?? hoursBetween(lesson.startTime, lesson.endTime));
  }, 0);
  const campusDeduction = campusFilter === "all" || campusFilter === vault.profile.obligationCampusId ? currentCampusObligation.amount : 0;
  const campusNet = campusLessonFee - campusDeduction;

  const lessonCampusAmounts = useMemo<Record<OverviewCampusKey, CampusAmountDetail[]>>(() => {
    const buckets: Record<OverviewCampusKey, Record<string, CampusAmountDetail>> = {
      oneOnOne: {},
      classLessons: {},
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
      } else {
        addDetail("oneOnOne", campusId, amount);
      }
    });

    return {
      oneOnOne: Object.values(buckets.oneOnOne).sort((a, b) => b.amount - a.amount),
      classLessons: Object.values(buckets.classLessons).sort((a, b) => b.amount - a.amount),
      makeup: Object.values(buckets.makeup).sort((a, b) => b.amount - a.amount)
    };
  }, [monthLessons, vault]);

  const campusSummaries = useMemo(() => {
    return vault.campuses.map((campus) => {
      const lessons = monthLessons.filter((lesson) => (lesson.campusId ?? vault.courseGroups.find((course) => course.id === lesson.courseGroupId)?.defaultCampusId) === campus.id);
      const amount = lessons.reduce((sum, lesson) => sum + completedAmount(lesson), 0);
      const hours = lessons.reduce((sum, lesson) => {
        if (lesson.status !== "completed" && lesson.status !== "makeup_completed") return sum;
        return sum + (lesson.feeSnapshot.hours ?? hoursBetween(lesson.startTime, lesson.endTime));
      }, 0);
      const obligation = campus.id === vault.profile.obligationCampusId ? obligationSummary(vault, selectedMonth, campus.id).amount : 0;
      return {
        campus,
        lessons,
        amount,
        hours,
        obligation,
        net: amount - obligation
      };
    });
  }, [monthLessons, selectedMonth, vault]);

  const typeCounts = filteredLessons.reduce<Record<CourseType, number>>(
    (summary, lesson) => {
      summary[lesson.type] += 1;
      return summary;
    },
    { one_on_one: 0, class: 0, trial: 0 }
  );

  return (
    <div className="space-y-6">
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
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:w-auto lg:min-w-[720px] xl:grid-cols-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">月份</label>
              <Input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">校区</label>
              <Select value={campusFilter} onChange={(event) => setCampusFilter(event.target.value)}>
                <option value="all">全部校区</option>
                {vault.campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>{campus.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">课程类型</label>
              <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}>
                <option value="all">全部类型</option>
                <option value="one_on_one">一对一</option>
                <option value="class">班课</option>
                <option value="trial">试听</option>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "筛选课次", value: `${filteredLessons.length} 节`, hint: `有效课时：仅已完成/补课完成，${campusHours.toFixed(1)} 小时`, icon: CalendarDays },
          { label: "课时费小计", value: formatMoney(campusLessonFee), hint: "仅统计已完成/补课完成", icon: Banknote },
          {
            label: "义务课时扣费",
            value: `-${formatMoney(campusDeduction)}`,
            hint: currentCampusObligation.mode === "manual"
              ? "义务课时扣费：手动填写扣除金额"
              : `义务课时扣费：缺口 ${currentCampusObligation.missingHours.toFixed(1)} / ${currentCampusObligation.requiredHours || 0} 小时`,
            icon: SlidersHorizontal,
            danger: true
          },
          { label: "当前校区扣后", value: formatMoney(campusNet), hint: campusFilter === "all" ? "全部校区扣后课时费" : campusName(vault, campusFilter), icon: FileCheck2 }
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
                  <div className="mt-1 truncate text-xs font-bold text-[#94a3b8]">{item.hint}</div>
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
            <CardDescription>义务课时按缺口扣费；选择了对应班级时，只核算该班级的完成小时。</CardDescription>
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
                        <span className="rounded-full bg-[#fee2e2] px-2.5 py-1 text-[#b91c1c]">义务扣 {formatMoney(item.obligation)}</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-bold text-[#64748b]">扣后小计</div>
                    <div className="mt-1 text-lg font-extrabold text-[#061226]">{formatMoney(item.net)}</div>
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
            <CardDescription>按基础工资、课时费、补贴扣款和义务课时扣费合并。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "基础工资", value: breakdown.baseSalary },
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
                          {formatMoney(item.value)}
                        </div>
                      </div>
                      {details.length > 0 && (
                        <Badge variant="secondary" className="shrink-0">
                          {details.length} 校区
                        </Badge>
                      )}
                    </div>
                    {details.length > 0 && (
                      <div className="mt-3 grid max-h-[86px] grid-cols-1 gap-1 overflow-y-auto pr-1">
                        {details.map((detail) => (
                          <div
                            key={detail.key}
                            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[9px] border border-[#e8eef6] bg-white px-2.5 py-1.5"
                            title={`${detail.campus} · ${detail.count} 节 · ${formatMoney(detail.amount)}`}
                          >
                            <span className="truncate text-[11px] font-bold text-[#64748b]">{detail.campus}</span>
                            <span className="text-[11px] font-extrabold text-[#061226]">{formatMoney(detail.amount)}</span>
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
              <div className="mt-2 text-3xl font-extrabold text-[#061226]">{formatMoney(breakdown.total)}</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(typeCounts).map(([type, count]) => (
                <div key={type} className="rounded-[12px] border border-[#dbe4ef] bg-white p-3 text-center">
                  <div className="text-xs font-semibold text-[#64748b]">{courseTypeLabels[type as CourseType]}</div>
                  <div className="mt-1 text-xl font-extrabold text-[#061226]">{count}</div>
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
          <CardDescription>取消课程会以红色底色标出，避免月底漏看。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredLessons.map((lesson, index) => (
            <motion.div
              key={lesson.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.02 }}
              className={`rounded-[14px] border p-4 ${
                lesson.attendance.some((entry) => entry.status === "leave_requested" || entry.status === "absent" || entry.status === "makeup_pending")
                  ? "border-[#fed7aa] bg-[#fff7ed]"
                  : lessonStatusSurfaceClass(lesson.status)
              }`}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-base text-[#061226]">{courseName(vault, lesson.courseGroupId)}</strong>
                    <Badge variant={lessonStatusVariant(lesson.status)}>{lessonStatusLabels[lesson.status]}</Badge>
                    <Badge variant="secondary">{courseTypeLabels[lesson.type]}</Badge>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[#475569]">
                    {lesson.date} · {lesson.startTime}-{lesson.endTime} · {campusName(vault, lesson.campusId)}
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
                  <div className="mt-1 text-lg font-extrabold text-[#061226]">{formatMoney(completedAmount(lesson))}</div>
                </div>
              </div>
            </motion.div>
          ))}
          {filteredLessons.length === 0 && (
            <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
              当前筛选下没有课时记录
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
