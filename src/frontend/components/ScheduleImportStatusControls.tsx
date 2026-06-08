import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Campus, ScheduleImportResolutionStatus } from "@/shared/types";
import type { ImportMatchStatus, ScheduleImportSummary } from "@/frontend/lib/scheduleImport";

type ResolutionFilter = `resolution:${ScheduleImportResolutionStatus}`;
export type ScheduleImportStatusFilter = "all" | ImportMatchStatus | ResolutionFilter;
type BadgeVariant = "sage" | "amber" | "secondary" | "destructive" | "sky" | "yellow" | "plum";

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
  const statusCards: Array<{ label: string; value: number; variant: BadgeVariant; status: Exclude<ScheduleImportStatusFilter, "all">; hint?: string }> = [
    { label: "已对应", value: summary.matched, variant: "sage", status: "matched", hint: resolvedAsMatchedCount > 0 ? `含人工确认 ${resolvedAsMatchedCount}` : "" },
    { label: "到课异常", value: summary.attendanceMismatch, variant: "amber", status: "attendance_mismatch" },
    { label: "时间不一致", value: summary.timeMismatch, variant: "yellow", status: "time_mismatch" },
    { label: "课程不一致", value: summary.courseMismatch, variant: "destructive", status: "course_mismatch" },
    { label: "云端缺少", value: summary.systemMissing, variant: "amber", status: "system_missing" },
    { label: "教务缺少", value: summary.importMissing, variant: "plum", status: "import_missing" },
    { label: "待映射", value: summary.needsMapping, variant: "secondary", status: "needs_mapping" }
  ];

  const resolutionCards: Array<{ label: string; value: number; variant: BadgeVariant; status: Exclude<ScheduleImportStatusFilter, "all"> }> = [
    { label: "确认无误", value: resolutionCounts.accepted, variant: "sky", status: "resolution:accepted" },
    { label: "已修正", value: resolutionCounts.fixed, variant: "sage", status: "resolution:fixed" },
    { label: "时间偏差正常", value: resolutionCounts.time_variance_ok, variant: "yellow", status: "resolution:time_variance_ok" },
    { label: "拆分合并正常", value: resolutionCounts.split_merge_ok, variant: "plum", status: "resolution:split_merge_ok" },
    { label: "教务表错误", value: resolutionCounts.excel_error, variant: "amber", status: "resolution:excel_error" },
    { label: "云端需修正", value: resolutionCounts.cloud_error, variant: "destructive", status: "resolution:cloud_error" }
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        {statusCards.map((item) => (
          <button
            key={item.label}
            type="button"
            aria-pressed={statusFilter === item.status}
            onClick={() => onStatusToggle(item.status)}
            className={`rounded-[12px] border px-3 py-2 text-left transition-all hover:-translate-y-0.5 hover:border-[#93c5fd] hover:bg-[#f8fbff] hover:shadow-[0_10px_22px_rgba(15,35,66,0.08)] ${
              statusFilter === item.status ? "border-[#1557c2] bg-[#eaf2ff] ring-2 ring-[#bfdbfe]" : "border-[#e8eef6] bg-white"
            }`}
          >
            <Badge variant={item.variant} className="text-[10px]">{item.label}</Badge>
            <div className="mt-2 text-xl font-extrabold text-[#061226]">{item.value}</div>
            {item.hint && <div className="mt-1 text-[10px] font-bold text-[#64748b]">{item.hint}</div>}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {resolutionCards.map((item) => (
          <button
            key={item.status}
            type="button"
            aria-pressed={statusFilter === item.status}
            onClick={() => onStatusToggle(item.status)}
            className={`rounded-[12px] border px-3 py-2 text-left transition-all hover:-translate-y-0.5 hover:border-[#93c5fd] hover:bg-[#f8fbff] hover:shadow-[0_10px_22px_rgba(15,35,66,0.08)] ${
              statusFilter === item.status ? "border-[#1557c2] bg-[#eaf2ff] ring-2 ring-[#bfdbfe]" : "border-[#e8eef6] bg-white"
            }`}
          >
            <Badge variant={item.variant} className="text-[10px]">{item.label}</Badge>
            <div className="mt-2 text-xl font-extrabold text-[#061226]">{item.value}</div>
          </button>
        ))}
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
          <option value="all">全部状态</option>
          <option value="matched">已对应</option>
          <option value="attendance_mismatch">到课异常</option>
          <option value="time_mismatch">时间不一致</option>
          <option value="course_mismatch">课程不一致</option>
          <option value="system_missing">云端缺少</option>
          <option value="import_missing">教务缺少</option>
          <option value="needs_mapping">待映射</option>
          <option value="resolution:accepted">确认无误</option>
          <option value="resolution:time_variance_ok">时间偏差正常</option>
          <option value="resolution:split_merge_ok">拆分合并正常</option>
          <option value="resolution:excel_error">教务表错误</option>
          <option value="resolution:fixed">已修正</option>
          <option value="resolution:cloud_error">云端需修正</option>
        </Select>
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
          <Input className="pl-9" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="搜索课程、学生、教室或差异" />
        </label>
      </div>
    </>
  );
}
