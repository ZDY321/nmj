import type { ScheduleImportResolution, ScheduleImportResolutionStatus } from "@/shared/types";
import type { ImportMatchStatus } from "@/frontend/lib/scheduleImport";

export type ResolutionFilter = `resolution:${ScheduleImportResolutionStatus}`;
export type SpecialStatusFilter = "needs_attention" | "system_unfinished";
export type StatusFilter = "all" | SpecialStatusFilter | ImportMatchStatus | ResolutionFilter;
export type ScheduleImportBadgeVariant = "sage" | "amber" | "secondary" | "destructive" | "sky" | "yellow" | "plum";
export type StatusFilterOption = { label: string; value: StatusFilter; variant?: ScheduleImportBadgeVariant };
export type SpecialStatusFilterOption = { label: string; value: SpecialStatusFilter; variant: ScheduleImportBadgeVariant };
export type MatchStatusFilterOption = { label: string; status: ImportMatchStatus; variant: ScheduleImportBadgeVariant };
export type ResolutionStatusFilterOption = { label: string; status: ResolutionFilter; resolutionStatus: ScheduleImportResolutionStatus; variant: ScheduleImportBadgeVariant };

export const resolutionStatuses: ScheduleImportResolutionStatus[] = ["unreviewed", "accepted", "not_due", "fixed", "time_variance_ok", "split_merge_ok", "excel_error", "missing_lesson_fee", "cloud_error"];

export const specialStatusFilterOptions: SpecialStatusFilterOption[] = [
  { label: "待核对", value: "needs_attention", variant: "amber" },
  { label: "云端未完成", value: "system_unfinished", variant: "secondary" }
];

export const importMatchStatusFilterOptions: MatchStatusFilterOption[] = [
  { label: "已对应", status: "matched", variant: "sage" },
  { label: "到课异常", status: "attendance_mismatch", variant: "amber" },
  { label: "时间不一致", status: "time_mismatch", variant: "yellow" },
  { label: "课程不一致", status: "course_mismatch", variant: "destructive" },
  { label: "云端缺少", status: "system_missing", variant: "amber" },
  { label: "教务缺少", status: "import_missing", variant: "plum" },
  { label: "待映射", status: "needs_mapping", variant: "secondary" }
];

export const resolutionStatusFilterOptions: ResolutionStatusFilterOption[] = [
  { label: "确认无误", status: "resolution:accepted", resolutionStatus: "accepted", variant: "sky" },
  { label: "未到日期", status: "resolution:not_due", resolutionStatus: "not_due", variant: "secondary" },
  { label: "已修正", status: "resolution:fixed", resolutionStatus: "fixed", variant: "sage" },
  { label: "时间偏差正常", status: "resolution:time_variance_ok", resolutionStatus: "time_variance_ok", variant: "yellow" },
  { label: "拆分合并正常", status: "resolution:split_merge_ok", resolutionStatus: "split_merge_ok", variant: "plum" },
  { label: "教务表错误", status: "resolution:excel_error", resolutionStatus: "excel_error", variant: "amber" },
  { label: "缺课时费", status: "resolution:missing_lesson_fee", resolutionStatus: "missing_lesson_fee", variant: "amber" },
  { label: "云端需修正", status: "resolution:cloud_error", resolutionStatus: "cloud_error", variant: "destructive" }
];

export const statusFilterOptions: StatusFilterOption[] = [
  { label: "全部状态", value: "all" },
  ...specialStatusFilterOptions,
  ...importMatchStatusFilterOptions.map((option) => ({ label: option.label, value: option.status, variant: option.variant })),
  ...resolutionStatusFilterOptions.map((option) => ({ label: option.label, value: option.status, variant: option.variant }))
];

export const statusFilters: StatusFilter[] = statusFilterOptions.map((option) => option.value);

export function resolutionMarksRowResolved(status?: ScheduleImportResolutionStatus): boolean {
  return status === "accepted" || status === "not_due" || status === "fixed" || status === "excel_error" || status === "time_variance_ok" || status === "split_merge_ok";
}

export function resolutionExcludesImportStats(status?: ScheduleImportResolutionStatus): boolean {
  return status === "not_due";
}

export function resolutionUsesSystemHoursForImportStats(status?: ScheduleImportResolutionStatus): boolean {
  return status === "accepted" || status === "fixed" || status === "time_variance_ok" || status === "split_merge_ok";
}

export function isResolutionFilter(statusFilter: StatusFilter): statusFilter is ResolutionFilter {
  return statusFilter.startsWith("resolution:");
}

export function resolutionStatusFromFilter(statusFilter: ResolutionFilter): ScheduleImportResolutionStatus {
  return statusFilter.slice("resolution:".length) as ScheduleImportResolutionStatus;
}

export function isReviewedResolution(resolution: ScheduleImportResolution | undefined): boolean {
  return Boolean(resolution && (resolution.status !== "unreviewed" || resolution.note?.trim()));
}

export function resolutionStatusLabel(status: ScheduleImportResolutionStatus): string {
  const labels: Record<ScheduleImportResolutionStatus, string> = {
    unreviewed: "未处理",
    not_due: "未到日期",
    excel_error: "教务表错误",
    cloud_error: "云端需修正",
    missing_lesson_fee: "缺课时费",
    fixed: "已修正",
    accepted: "确认无误",
    time_variance_ok: "时间偏差正常",
    split_merge_ok: "拆分合并正常"
  };
  return labels[status];
}

export function statusLabel(status: ImportMatchStatus): string {
  const labels: Record<ImportMatchStatus, string> = {
    matched: "已对应",
    attendance_mismatch: "到课异常",
    time_mismatch: "时间不一致",
    course_mismatch: "课程不一致",
    system_missing: "云端缺少",
    import_missing: "教务缺少",
    needs_mapping: "待映射"
  };
  return labels[status];
}

export function statusVariant(status: ImportMatchStatus): ScheduleImportBadgeVariant {
  if (status === "matched") return "sage";
  if (status === "time_mismatch") return "yellow";
  if (status === "course_mismatch" || status === "system_missing") return "destructive";
  if (status === "import_missing") return "plum";
  if (status === "needs_mapping") return "secondary";
  return "amber";
}

export function statusSurfaceClass(status: ImportMatchStatus, reviewed = false): string {
  if (reviewed) return "border-[#93c5fd] bg-[#eaf2ff] ring-1 ring-[#bfdbfe]";
  if (status === "matched") return "border-[#bbf7d0] bg-[#f0fdf4]";
  if (status === "time_mismatch" || status === "attendance_mismatch") return "border-[#fed7aa] bg-[#fff7ed]";
  if (status === "course_mismatch" || status === "system_missing") return "border-[#fecaca] bg-[#fff1f2]";
  if (status === "import_missing") return "border-[#c7d2fe] bg-[#eef0ff]";
  return "border-[#dbe4ef] bg-[#f8fbff]";
}

export function statusPillClass(status: ImportMatchStatus, reviewed = false): string {
  if (reviewed) return "bg-[#dbeafe] text-[#1557c2] ring-1 ring-[#93c5fd]";
  if (status === "matched") return "bg-[#e8f8ef] text-[#15803d]";
  if (status === "time_mismatch" || status === "attendance_mismatch") return "bg-[#fff3e4] text-[#9a3412]";
  if (status === "course_mismatch" || status === "system_missing") return "bg-[#fee2e2] text-[#b91c1c]";
  if (status === "import_missing") return "bg-[#eef0ff] text-[#5161d6]";
  return "bg-[#eef4fb] text-[#25324a]";
}
