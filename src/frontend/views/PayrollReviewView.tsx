import { useEffect, useState } from "react";
import { Banknote, BookOpen, CalendarDays, FileCheck2, SlidersHorizontal } from "lucide-react";
import { PayrollLessonDetailsCard } from "@/frontend/components/PayrollLessonDetailsCard";
import { PayrollMetricSummaryCards } from "@/frontend/components/PayrollMetricSummaryCards";
import { PayrollObligationDeductionCard } from "@/frontend/components/PayrollObligationDeductionCard";
import { PayrollOverviewGrid } from "@/frontend/components/PayrollOverviewGrid";
import { PayrollReviewFiltersCard } from "@/frontend/components/PayrollReviewFiltersCard";
import { ScheduleImportPanel } from "@/frontend/components/ScheduleImportPanel";
import type { CourseType, Lesson, ScheduleImportVaultState, TeacherVault } from "@/shared/types";
import { todayIso } from "@/frontend/lib/calculations";
import { campusName, formatPrivateMoney } from "@/frontend/lib/helpers";
import { usePayrollReviewData } from "@/frontend/hooks/usePayrollReviewData";

type TypeFilter = "all" | CourseType;
type LessonStatusFilter = "all" | Lesson["status"];
type PayrollPanel = "review" | "reconcile";

export function PayrollReviewView({
  vault,
  amountsVisible,
  panelFocus,
  storageScope,
  onSaveScheduleImport,
  onOpenLessonInCalendar
}: {
  vault: TeacherVault;
  amountsVisible: boolean;
  panelFocus?: { panel: PayrollPanel; nonce: number } | null;
  storageScope?: string;
  onSaveScheduleImport?: (state: ScheduleImportVaultState) => void;
  onOpenLessonInCalendar?: (lesson: Lesson) => void;
}) {
  const [selectedMonth, setSelectedMonth] = useState(todayIso().slice(0, 7));
  const [campusFilter, setCampusFilter] = useState(vault.profile.homeCampusId ?? vault.campuses[0]?.id ?? "all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<LessonStatusFilter>("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [detailStartDateFilter, setDetailStartDateFilter] = useState("");
  const [detailEndDateFilter, setDetailEndDateFilter] = useState("");
  const [detailCourseFilter, setDetailCourseFilter] = useState("all");
  const [detailStudentFilter, setDetailStudentFilter] = useState("");
  const [detailStatusFilter, setDetailStatusFilter] = useState<LessonStatusFilter>("all");
  const [payrollPanel, setPayrollPanel] = useState<PayrollPanel>(() => panelFocus?.panel ?? "review");

  const {
    campusOptions,
    courseOptions,
    courseTypeOptions,
    gradeOptions,
    effectiveObligationCampusId,
    filteredLessons,
    detailLessons,
    breakdown,
    lessonFeeTotal,
    estimatedIncome,
    currentCampusObligation,
    campusLessonFee,
    campusHours,
    obligationDeductionApplies,
    campusDeduction,
    campusNet,
    lessonCampusAmounts,
    campusSummaries,
    typeCountCards
  } = usePayrollReviewData({
    vault,
    selectedMonth,
    campusFilter,
    typeFilter,
    statusFilter,
    gradeFilter,
    detailStartDateFilter,
    detailEndDateFilter,
    detailCourseFilter,
    detailStudentFilter,
    detailStatusFilter
  });

  useEffect(() => {
    if (panelFocus?.panel) {
      setPayrollPanel(panelFocus.panel);
    }
  }, [panelFocus?.nonce]);

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
        <ScheduleImportPanel
          vault={vault}
          amountsVisible={amountsVisible}
          storageScope={storageScope}
          onSaveScheduleImport={onSaveScheduleImport}
          onOpenLesson={onOpenLessonInCalendar}
        />
      ) : (
      <>
      <PayrollReviewFiltersCard
        selectedMonth={selectedMonth}
        campusFilter={campusFilter}
        typeFilter={typeFilter}
        statusFilter={statusFilter}
        gradeFilter={gradeFilter}
        campusOptions={campusOptions}
        courseTypeOptions={courseTypeOptions}
        gradeOptions={gradeOptions}
        onMonthChange={setSelectedMonth}
        onCampusChange={setCampusFilter}
        onTypeChange={setTypeFilter}
        onStatusChange={setStatusFilter}
        onGradeChange={setGradeFilter}
      />

      <PayrollMetricSummaryCards
        cards={[
          { label: "筛选课次", value: `${filteredLessons.length} 节`, hint: `已完成 ${campusHours.toFixed(1)} 小时`, icon: CalendarDays },
          { label: "课时费小计", value: formatPrivateMoney(campusLessonFee, amountsVisible), hint: "仅统计已完成/补课完成", icon: Banknote },
          { label: "课时费总计", value: formatPrivateMoney(lessonFeeTotal, amountsVisible), hint: "本月全部已完成课时费", icon: Banknote },
          {
            label: "义务课时扣费",
            value: `-${formatPrivateMoney(campusDeduction, amountsVisible)}`,
            hint: !obligationDeductionApplies
              ? `归入 ${campusName(vault, effectiveObligationCampusId)}`
              : currentCampusObligation.mode === "manual"
              ? "手动填写扣除"
              : `缺口 ${currentCampusObligation.missingHours.toFixed(1)} / ${currentCampusObligation.requiredHours || 0} 小时`,
            icon: SlidersHorizontal,
            danger: true
          },
          { label: "本月预估收入", value: formatPrivateMoney(estimatedIncome, amountsVisible), hint: "含待上课课节预估", icon: BookOpen },
          { label: "当前校区扣后", value: formatPrivateMoney(campusNet, amountsVisible), hint: campusFilter === "all" ? "全部校区扣后课时费" : campusName(vault, campusFilter), icon: FileCheck2 }
        ]}
      />

      <PayrollObligationDeductionCard
        vault={vault}
        amountsVisible={amountsVisible}
        selectedMonth={selectedMonth}
        effectiveObligationCampusId={effectiveObligationCampusId}
        obligation={currentCampusObligation}
        deductionApplies={obligationDeductionApplies}
      />

      <PayrollOverviewGrid
        selectedMonth={selectedMonth}
        amountsVisible={amountsVisible}
        campusFilter={campusFilter}
        campusSummaries={campusSummaries}
        breakdown={breakdown}
        lessonFeeTotal={lessonFeeTotal}
        lessonCampusAmounts={lessonCampusAmounts}
        typeCountCards={typeCountCards}
        onCampusSelect={setCampusFilter}
      />

      <PayrollLessonDetailsCard
        vault={vault}
        amountsVisible={amountsVisible}
        courseOptions={courseOptions}
        detailLessons={detailLessons}
        filteredLessonCount={filteredLessons.length}
        startDateFilter={detailStartDateFilter}
        endDateFilter={detailEndDateFilter}
        courseFilter={detailCourseFilter}
        studentFilter={detailStudentFilter}
        statusFilter={detailStatusFilter}
        onStartDateChange={setDetailStartDateFilter}
        onEndDateChange={setDetailEndDateFilter}
        onCourseFilterChange={setDetailCourseFilter}
        onStudentFilterChange={setDetailStudentFilter}
        onStatusFilterChange={setDetailStatusFilter}
        onOpenLesson={onOpenLessonInCalendar}
      />

      </>
      )}
    </div>
  );
}
