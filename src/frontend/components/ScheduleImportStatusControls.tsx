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
  const errorResolutionCards = resolutionCards.filter((item) => item.resolutionStatus === "excel_error" || item.resolutionStatus === "cloud_error");
  const normalResolutionCards = resolutionCards.filter((item) => item.resolutionStatus !== "excel_error" && item.resolutionStatus !== "cloud_error");
  const resolvedStatusCards = matchedStatusCard ? [matchedStatusCard, ...normalResolutionCards] : normalResolutionCards;

  return (
    <>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[...attentionStatusCards, ...errorResolutionCards].map((item) => (
          <button
            key={item.status}
            type="button"
            aria-pressed={statusFilter === item.status}
            onClick={() => onStatusToggle(item.status)}
            className={`min-h-[58px] rounded-[10px] border px-2.5 py-2 text-left transition-all hover:-translate-y-0.5 hover:border-[#93c5fd] hover:bg-[#f8fbff] hover:shadow-[0_10px_22px_rgba(15,35,66,0.08)] ${
              statusFilter === item.status ? "border-[#1557c2] bg-[#eaf2ff] ring-2 ring-[#bfdbfe]" : "border-[#e8eef6] bg-white"
            }`}
          >
            <Badge variant={item.variant} className="text-[10px]">{item.label}</Badge>
            <div className="mt-1 text-lg font-extrabold leading-6 text-[#061226]">{item.value}</div>
            {"hint" in item && item.hint && <div className="mt-0.5 truncate text-[10px] font-bold text-[#64748b]">{item.hint}</div>}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-[14px] border border-[#bbf7d0] bg-[#f0fdf4] p-2">
        <div className="grid min-w-[680px] grid-cols-5 gap-2">
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
