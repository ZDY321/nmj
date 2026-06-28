import { Search } from "lucide-react";
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
  importedLessonCount,
  importedLessonHours,
  excludedImportedLessonCount,
  cancelledImportedLessonCount,
  absentImportedLessonCount,
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
  importedLessonCount: number;
  importedLessonHours: number;
  excludedImportedLessonCount: number;
  cancelledImportedLessonCount: number;
  absentImportedLessonCount: number;
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

  return (
    <>
      <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.15fr)_minmax(180px,0.55fr)]">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-[10px] border border-[#dbeafe] bg-white px-2.5 py-2">
            <span className="mr-1 text-[11px] font-extrabold text-[#1557c2]">教务统计</span>
            <Badge variant="sky" className="text-[10px]">教务导入 {importedLessonCount} 节 / {importedLessonHours.toFixed(1)}h</Badge>
            {excludedImportedLessonCount > 0 && <Badge variant="secondary" className="text-[10px]">教务未到日期不计 {excludedImportedLessonCount} 节</Badge>}
            {cancelledImportedLessonCount > 0 && <Badge variant="secondary" className="text-[10px]">教务取消/未开课不计 {cancelledImportedLessonCount} 节</Badge>}
            {absentImportedLessonCount > 0 && <Badge variant="secondary" className="text-[10px]">教务缺勤未到不计 {absentImportedLessonCount} 节</Badge>}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-[10px] border border-[#dcfce7] bg-white px-2.5 py-2">
            <span className="mr-1 text-[11px] font-extrabold text-[#15803d]">云端统计</span>
            <Badge variant="secondary" className="text-[10px]">云端排课总课时(含未完成，未抵扣前) {systemLessonCount} 节 / {systemLessonHours.toFixed(1)}h</Badge>
            <Badge variant="sage" className="text-[10px]">云端已完成课时(已完成，未抵扣前) {systemCompletedLessonCount} 节 / {systemCompletedLessonHours.toFixed(1)}h</Badge>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 rounded-[10px] border border-[#fde68a] bg-white px-2.5 py-2">
            <span className="text-[11px] font-extrabold text-[#b45309]">待核对</span>
            <Badge variant={needsAttention > 0 ? "amber" : "sage"} className="text-[10px]">待核对 {needsAttention} 节 / {needsAttentionHours.toFixed(1)}h</Badge>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[14px] border border-[#dbe4ef] bg-white p-2">
        <div className="grid min-w-[900px] grid-cols-9 gap-1.5">
          {[...attentionStatusCards, ...errorResolutionCards].map((item) => (
            <button
              key={item.status}
              type="button"
              aria-pressed={statusFilter === item.status}
              onClick={() => onStatusToggle(item.status)}
              className={`flex h-10 min-w-0 items-center justify-between gap-1.5 rounded-[8px] border px-2 text-left transition-all hover:border-[#93c5fd] hover:bg-[#f8fbff] hover:shadow-[0_8px_16px_rgba(15,35,66,0.08)] ${
                statusFilter === item.status ? "border-[#1557c2] bg-[#eaf2ff] ring-2 ring-[#bfdbfe]" : "border-[#e8eef6] bg-white"
              }`}
            >
              <Badge variant={item.variant} className="min-w-0 max-w-[78px] truncate text-[10px]">{item.label}</Badge>
              <span className="shrink-0 text-sm font-extrabold leading-5 text-[#061226]">{item.value}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-[14px] border border-[#bbf7d0] bg-[#f0fdf4] p-2">
        <div className="grid min-w-[820px] grid-cols-6 gap-2">
          {resolvedStatusCards.map((item) => (
            <button
              key={item.status}
              type="button"
              aria-pressed={statusFilter === item.status}
              onClick={() => onStatusToggle(item.status)}
              className={`min-h-[52px] rounded-[10px] border px-2.5 py-1.5 text-left transition-all hover:-translate-y-0.5 hover:border-[#86efac] hover:bg-white hover:shadow-[0_10px_22px_rgba(21,128,61,0.08)] ${
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
