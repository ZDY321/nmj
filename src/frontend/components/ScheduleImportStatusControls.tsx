import { CheckCircle2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Campus, ScheduleImportResolutionStatus } from "@/shared/types";
import type { ImportMatchStatus, ScheduleImportSummary } from "@/frontend/lib/scheduleImport";
import {
  importMatchStatusFilterOptions,
  resolutionStatusFilterOptions,
  statusFilterOptions,
  type StatusFilter
} from "@/frontend/lib/scheduleImportReviewStatus";

export type ScheduleImportStatusFilter = StatusFilter;

export function ScheduleImportStatusControls({
  summary,
  resolvedAsMatchedCount,
  resolutionCounts,
  rawImportedLessonCount,
  rawImportedLessonHours,
  importedLessonCount,
  importedLessonHours,
  excludedImportedLessonCount,
  excludedImportedLessonHours,
  cancelledImportedLessonCount,
  cancelledImportedLessonHours,
  absentImportedLessonCount,
  absentImportedLessonHours,
  systemLessonCount,
  systemLessonHours,
  systemCompletedLessonCount,
  systemCompletedLessonHours,
  needsAttention,
  needsAttentionHours,
  selectedMonth,
  campusFilter,
  statusFilter,
  search,
  campusOptions,
  onStatusToggle,
  onMonthChange,
  onCampusChange,
  onStatusChange,
  onSearchChange
}: {
  summary: ScheduleImportSummary;
  resolvedAsMatchedCount: number;
  resolutionCounts: Record<ScheduleImportResolutionStatus, number>;
  rawImportedLessonCount: number;
  rawImportedLessonHours: number;
  importedLessonCount: number;
  importedLessonHours: number;
  excludedImportedLessonCount: number;
  excludedImportedLessonHours: number;
  cancelledImportedLessonCount: number;
  cancelledImportedLessonHours: number;
  absentImportedLessonCount: number;
  absentImportedLessonHours: number;
  systemLessonCount: number;
  systemLessonHours: number;
  systemCompletedLessonCount: number;
  systemCompletedLessonHours: number;
  needsAttention: number;
  needsAttentionHours: number;
  selectedMonth: string;
  campusFilter: string;
  statusFilter: ScheduleImportStatusFilter;
  search: string;
  campusOptions: Campus[];
  onStatusToggle: (status: Exclude<ScheduleImportStatusFilter, "all">) => void;
  onMonthChange: (month: string) => void;
  onCampusChange: (campusId: string) => void;
  onStatusChange: (status: ScheduleImportStatusFilter) => void;
  onSearchChange: (search: string) => void;
}) {
  const statusCards = importMatchStatusFilterOptions.map((option) => ({
    ...option,
    value: summaryValueForStatus(summary, option.status),
    hint: option.status === "matched" && resolvedAsMatchedCount > 0 ? `含人工确认 ${resolvedAsMatchedCount}` : ""
  }));

  const resolutionCards = resolutionStatusFilterOptions.map((option) => ({
    ...option,
    value: resolutionCounts[option.resolutionStatus]
  }));
  const matchedStatusCard = statusCards.find((item) => item.status === "matched");
  const attentionStatusCards = statusCards.filter((item) => item.status !== "matched");
  const errorResolutionCards = resolutionCards.filter((item) => item.resolutionStatus === "excel_error" || item.resolutionStatus === "cloud_error" || item.resolutionStatus === "missing_lesson_fee");
  const normalResolutionCards = resolutionCards.filter((item) => item.resolutionStatus !== "excel_error" && item.resolutionStatus !== "cloud_error" && item.resolutionStatus !== "missing_lesson_fee");
  const resolvedStatusCards = matchedStatusCard ? [matchedStatusCard, ...normalResolutionCards] : normalResolutionCards;
  const actionableStatusCards = [...attentionStatusCards, ...errorResolutionCards].filter((item) => item.value > 0 || statusFilter === item.status);
  const visibleResolvedStatusCards = resolvedStatusCards.filter((item) => item.value > 0 || statusFilter === item.status || item.status === "matched");
  const systemUnfinishedCount = Math.max(0, systemLessonCount - systemCompletedLessonCount);
  const systemUnfinishedHours = Math.max(0, systemLessonHours - systemCompletedLessonHours);

  return (
    <>
      <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.15fr)_minmax(190px,0.55fr)]">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-[10px] border border-[#bfdbfe] bg-[#eff6ff] px-2.5 py-2">
            <span className="mr-1 text-[11px] font-extrabold text-[#1557c2]">教务统计</span>
            <Badge variant="sky" className="text-[10px]">教务原始导入 {rawImportedLessonCount} 节 / {rawImportedLessonHours.toFixed(1)}h</Badge>
            <Badge variant="sky" className="text-[10px]">① 教务有效统计(已排除不计后) {importedLessonCount} 节 / {importedLessonHours.toFixed(1)}h --&gt;</Badge>
            {excludedImportedLessonCount > 0 && <button type="button" title="筛选未到日期" onClick={() => onStatusToggle("resolution:not_due")} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93c5fd] ${statusFilter === "resolution:not_due" ? "border-[#1557c2] bg-[#1557c2] text-white ring-2 ring-[#bfdbfe] shadow-md" : "border-[#60a5fa] bg-white text-[#1557c2]"}`}>{statusFilter === "resolution:not_due" && <CheckCircle2 size={12} className="shrink-0" />}<span>教务未到日期不计 {excludedImportedLessonCount} 节 / {excludedImportedLessonHours.toFixed(1)}h</span></button>}
            {cancelledImportedLessonCount > 0 && <Badge variant="sky" className="text-[10px]">教务取消/未开课不计 {cancelledImportedLessonCount} 节 / {cancelledImportedLessonHours.toFixed(1)}h</Badge>}
            {absentImportedLessonCount > 0 && <Badge variant="sky" className="text-[10px]">教务缺勤未到不计 {absentImportedLessonCount} 节 / {absentImportedLessonHours.toFixed(1)}h</Badge>}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-[10px] border border-[#bbf7d0] bg-[#f0fdf4] px-2.5 py-2">
            <span className="mr-1 text-[11px] font-extrabold text-[#15803d]">云端统计</span>
            <Badge variant="sage" className="text-[10px]">云端排课总课时(含未完成，未抵扣前) {systemLessonCount} 节 / {systemLessonHours.toFixed(1)}h</Badge>
            <Badge variant="sage" className="text-[10px]">② 云端已完成课时(已完成，未抵扣前) {systemCompletedLessonCount} 节 / {systemCompletedLessonHours.toFixed(1)}h --&gt;</Badge>
            {systemUnfinishedCount > 0 && <button type="button" title="筛选云端未完成课程" onClick={() => onStatusToggle("system_unfinished")} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#86efac] ${statusFilter === "system_unfinished" ? "border-[#15803d] bg-[#15803d] text-white ring-2 ring-[#bbf7d0] shadow-md" : "border-[#4ade80] bg-white text-[#15803d]"}`}>{statusFilter === "system_unfinished" && <CheckCircle2 size={12} className="shrink-0" />}<span>云端未完成 {systemUnfinishedCount} 节 / {systemUnfinishedHours.toFixed(1)}h</span></button>}
          </div>
          <button
            type="button"
            title="筛选待核对记录"
            aria-pressed={statusFilter === "needs_attention"}
            onClick={() => onStatusToggle("needs_attention")}
            className={`flex min-w-0 items-center gap-1.5 rounded-[10px] border px-2.5 py-2 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fbbf24] ${
              statusFilter === "needs_attention" ? "border-[#b45309] bg-white ring-2 ring-[#fde68a]" : "border-[#fde68a] bg-[#fffbeb]"
            }`}
          >
            <span className="text-[11px] font-extrabold text-[#b45309]">=&gt; ③ 待核对差异</span>
            <Badge variant="amber" className="text-[10px]">{needsAttention} 节 / {needsAttentionHours.toFixed(1)}h</Badge>
          </button>
        </div>
      </div>

      {actionableStatusCards.length > 0 && (
        <div className="overflow-x-auto rounded-[14px] border border-[#dbe4ef] bg-white p-2">
          <div className="flex min-w-max gap-1.5">
            {actionableStatusCards.map((item) => (
              <button
                key={item.status}
                type="button"
                aria-pressed={statusFilter === item.status}
                onClick={() => onStatusToggle(item.status)}
                className={`flex h-9 min-w-[104px] items-center justify-between gap-1.5 rounded-[8px] border px-2 text-left transition-all hover:border-[#93c5fd] hover:bg-[#f8fbff] ${
                  statusFilter === item.status ? "border-[#1557c2] bg-[#eaf2ff] ring-2 ring-[#bfdbfe]" : "border-[#e8eef6] bg-white"
                }`}
              >
                <Badge variant={item.variant} className="min-w-0 max-w-[78px] truncate text-[10px]">{item.label}</Badge>
                <span className="shrink-0 text-sm font-extrabold leading-5 text-[#061226]">{item.value}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-[14px] border border-[#bbf7d0] bg-[#f0fdf4] p-2">
        <div className="flex min-w-max gap-2">
          {visibleResolvedStatusCards.map((item) => (
            <button
              key={item.status}
              type="button"
              aria-pressed={statusFilter === item.status}
              onClick={() => onStatusToggle(item.status)}
              className={`min-h-[48px] min-w-[118px] rounded-[10px] border px-2.5 py-1.5 text-left transition-all hover:-translate-y-0.5 hover:border-[#86efac] hover:bg-white hover:shadow-[0_10px_22px_rgba(21,128,61,0.08)] ${
                statusFilter === item.status ? "border-[#15803d] bg-white ring-2 ring-[#bbf7d0]" : "border-[#d9f99d] bg-white/85"
              }`}
            >
              <Badge variant={item.variant} className="max-w-full truncate text-[10px]">{item.label}</Badge>
              <div className="mt-1 text-base font-extrabold leading-5 text-[#061226]">{item.value}</div>
              {"hint" in item && item.hint && <div className="mt-0.5 truncate text-[10px] font-bold text-[#64748b]">{item.hint}</div>}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3 md:grid-cols-2 xl:grid-cols-[160px_220px_220px_minmax(0,1fr)]">
        <Input type="month" value={selectedMonth} onChange={(event) => onMonthChange(event.target.value)} />
        <Select value={campusFilter} onChange={(event) => onCampusChange(event.target.value)}>
          <option value="all">全部校区</option>
          {campusOptions.map((campus) => (
            <option key={campus.id} value={campus.id}>{campus.name}</option>
          ))}
        </Select>
        <Select value={statusFilter} onChange={(event) => onStatusChange(event.target.value as ScheduleImportStatusFilter)}>
          {statusFilterOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
          <Input className="pl-9" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="搜索课程、学生、教室或差异" />
        </label>
      </div>
    </>
  );
}

function summaryValueForStatus(summary: ScheduleImportSummary, status: ImportMatchStatus): number {
  const values: Record<ImportMatchStatus, number> = {
    matched: summary.matched,
    attendance_mismatch: summary.attendanceMismatch,
    time_mismatch: summary.timeMismatch,
    course_mismatch: summary.courseMismatch,
    system_missing: summary.systemMissing,
    import_missing: summary.importMissing,
    needs_mapping: summary.needsMapping
  };
  return values[status];
}
