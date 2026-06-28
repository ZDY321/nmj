import { useEffect, useState } from "react";
import { Banknote, BookOpen, CalendarDays, FileCheck2, SlidersHorizontal } from "lucide-react";
import { PayrollLessonDetailsCard } from "@/frontend/components/PayrollLessonDetailsCard";
import { PayrollMetricSummaryCards } from "@/frontend/components/PayrollMetricSummaryCards";
import { PayrollObligationDeductionCard } from "@/frontend/components/PayrollObligationDeductionCard";
import { PayrollOverviewGrid } from "@/frontend/components/PayrollOverviewGrid";
import { PayrollReviewFiltersCard } from "@/frontend/components/PayrollReviewFiltersCard";
import { PayrollScheduleExportGuide } from "@/frontend/components/PayrollScheduleExportGuide";
import { ScheduleImportPanel } from "@/frontend/components/ScheduleImportPanel";
import type { CourseType, Lesson, ScheduleImportVaultState, TeacherVault } from "@/shared/types";
import { todayIso } from "@/frontend/lib/calculations";
import { campusName, formatPrivateMoney } from "@/frontend/lib/helpers";
import { usePayrollReviewData } from "@/frontend/hooks/usePayrollReviewData";
import { loadEncryptedDocumentWithVersion, saveEncryptedDocument } from "@/frontend/lib/storage";

type TypeFilter = "all" | CourseType;
type LessonStatusFilter = "all" | Lesson["status"];
type PayrollPanel = "review" | "reconcile" | "guide";
const scheduleImportArchiveDocType = "schedule_import_reviews";
const scheduleImportArchiveDocKey = "primary";

export function PayrollReviewView({
  vault,
  amountsVisible,
  token,
  password,
  panelFocus,
  storageScope,
  onSaveScheduleImport,
  onOpenReviewLessonInCalendar,
  onOpenReconcileLessonInCalendar,
  onSuggestSchedule
}: {
  vault: TeacherVault;
  amountsVisible: boolean;
  token?: string;
  password?: string;
  panelFocus?: { panel: PayrollPanel; nonce: number } | null;
  storageScope?: string;
  onSaveScheduleImport?: (state: ScheduleImportVaultState) => void;
  onOpenReviewLessonInCalendar?: (lesson: Lesson) => void;
  onOpenReconcileLessonInCalendar?: (lesson: Lesson) => void;
  onSuggestSchedule?: (request: { date: string; startTime: string; endTime: string; courseGroupId?: string }) => void;
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
  const [scheduleImportArchive, setScheduleImportArchive] = useState<ScheduleImportVaultState | null>(vault.scheduleImport ?? null);
  const [scheduleImportArchiveLoading, setScheduleImportArchiveLoading] = useState(false);
  const [scheduleImportArchiveError, setScheduleImportArchiveError] = useState("");

  const {
    campusOptions,
    courseOptions,
    courseTypeOptions,
    gradeOptions,
    effectiveObligationCampusId,
    filteredLessons,
    detailLessons,
    monthLessonCount,
    monthPayrollHours,
    monthCompletedLessonCount,
    monthCompletedPayrollHours,
    monthRemainingPayrollHours,
    monthUnfinishedLessonCount,
    monthUnfinishedPayrollHours,
    breakdown,
    lessonFeeTotal,
    estimatedIncome,
    currentCampusObligation,
    campusLessonFee,
    campusHours,
    campusUnfinishedHours,
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

  useEffect(() => {
    if (!token || !password) {
      setScheduleImportArchive(vault.scheduleImport ?? null);
      setScheduleImportArchiveLoading(false);
      setScheduleImportArchiveError("");
      return;
    }
    let cancelled = false;
    setScheduleImportArchiveLoading(true);
    setScheduleImportArchiveError("");
    loadEncryptedDocumentWithVersion<ScheduleImportVaultState>(
      token,
      password,
      scheduleImportArchiveDocType,
      scheduleImportArchiveDocKey
    )
      .then(({ value }) => {
        if (cancelled) return;
        const fallback = vault.scheduleImport ?? null;
        const nextArchive = value ?? fallback;
        setScheduleImportArchive(nextArchive);
        setScheduleImportArchiveLoading(false);
        if (!value && fallback?.reviews.length) {
          void saveEncryptedDocument(
            token,
            password,
            scheduleImportArchiveDocType,
            scheduleImportArchiveDocKey,
            fallback
          )
            .then(() => setScheduleImportArchiveError(""))
            .catch(() => setScheduleImportArchiveError("旧核对历史迁移到独立云端文档失败；当前页面仍可查看，稍后再次进入会重试。"));
          onSaveScheduleImport?.(scheduleImportMainState(fallback));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setScheduleImportArchive(vault.scheduleImport ?? null);
          setScheduleImportArchiveLoading(false);
          setScheduleImportArchiveError("核对历史云端文档读取失败，当前显示主档案里的本地兼容数据。");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [password, token]);

  function saveScheduleImportState(state: ScheduleImportVaultState): void {
    setScheduleImportArchive(state);
    onSaveScheduleImport?.(scheduleImportMainState(state));
    if (token && password) {
      void saveEncryptedDocument(
        token,
        password,
        scheduleImportArchiveDocType,
        scheduleImportArchiveDocKey,
        state
      )
        .then(() => setScheduleImportArchiveError(""))
        .catch(() => setScheduleImportArchiveError("核对历史明细未能同步到独立云端文档；课程映射和拆分/合并标记已保存到主档案。"));
    }
  }

  const obligationCourseDeductedHours = currentCampusObligation.courseBreakdown.reduce((sum, item) => sum + item.deductedHours, 0);

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-[16px] border border-[#dbe4ef] bg-white">
        <div className="flex w-full min-w-max items-center gap-1 p-1 md:min-w-0">
          {[
            { key: "review" as PayrollPanel, label: "工资核对" },
            { key: "reconcile" as PayrollPanel, label: "教务课表对账" },
            { key: "guide" as PayrollPanel, label: "导出指引" }
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

      {payrollPanel === "guide" ? (
        <PayrollScheduleExportGuide />
      ) : payrollPanel === "reconcile" ? (
        <>
        {scheduleImportArchiveError && (
          <div className="rounded-[14px] border border-[#fed7aa] bg-[#fff7ed] px-4 py-3 text-sm font-bold text-[#9a3412]">
            {scheduleImportArchiveError}
          </div>
        )}
        {scheduleImportArchiveLoading ? (
          <div className="rounded-[14px] border border-[#dbe4ef] bg-white px-4 py-3 text-sm font-bold text-[#475569]">
            正在读取已保存的教务对账历史和拆分合并标记...
          </div>
        ) : (
          <ScheduleImportPanel
            vault={vault}
            amountsVisible={amountsVisible}
            storageScope={storageScope}
            scheduleImportState={scheduleImportArchive}
            onSaveScheduleImport={saveScheduleImportState}
            onOpenLesson={onOpenReconcileLessonInCalendar}
            onSuggestSchedule={onSuggestSchedule}
            onOpenGuide={() => setPayrollPanel("guide")}
          />
        )}
        </>
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
          { label: "当前筛选课节", value: `${filteredLessons.length} 节`, hint: `计薪完成 ${campusHours.toFixed(1)} 小时 · 未完成 ${campusUnfinishedHours.toFixed(1)} 小时`, icon: CalendarDays },
          { label: "课时费小计", value: formatPrivateMoney(campusLessonFee, amountsVisible), hint: "仅统计已完成/补课完成", icon: Banknote },
          { label: "课时费总计", value: formatPrivateMoney(lessonFeeTotal, amountsVisible), hint: "本月全部已完成课时费", icon: Banknote },
          {
            label: "义务课时扣费",
            value: `-${formatPrivateMoney(campusDeduction, amountsVisible)}`,
            hint: !obligationDeductionApplies
              ? `归入 ${campusName(vault, effectiveObligationCampusId)}`
              : currentCampusObligation.mode === "manual"
              ? "手动填写扣除"
              : `课程已抵 ${obligationCourseDeductedHours.toFixed(1)} 小时 · 补扣缺口 ${currentCampusObligation.fallbackHours.toFixed(1)} 小时`,
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
        monthLessonCount={monthLessonCount}
        monthPayrollHours={monthPayrollHours}
        monthCompletedLessonCount={monthCompletedLessonCount}
        monthCompletedPayrollHours={monthCompletedPayrollHours}
        monthRemainingPayrollHours={monthRemainingPayrollHours}
        monthUnfinishedLessonCount={monthUnfinishedLessonCount}
        monthUnfinishedPayrollHours={monthUnfinishedPayrollHours}
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
        obligationLessonDeductions={obligationDeductionApplies ? currentCampusObligation.lessonDeductions : []}
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
        onOpenLesson={onOpenReviewLessonInCalendar}
      />

      </>
      )}
    </div>
  );
}

function scheduleImportMainState(state: ScheduleImportVaultState): ScheduleImportVaultState {
  return {
    ...state,
    reviews: []
  };
}
