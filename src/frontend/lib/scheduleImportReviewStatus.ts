import type { ScheduleImportResolution, ScheduleImportResolutionStatus } from "@/shared/types";
import type { ImportMatchStatus } from "@/frontend/lib/scheduleImport";

export type ResolutionFilter = `resolution:${ScheduleImportResolutionStatus}`;
export type StatusFilter = "all" | ImportMatchStatus | ResolutionFilter;
export type ScheduleImportBadgeVariant = "sage" | "amber" | "secondary" | "destructive" | "sky" | "yellow" | "plum";

export const statusFilters: StatusFilter[] = [
  "all",
  "matched",
  "attendance_mismatch",
  "time_mismatch",
  "course_mismatch",
  "system_missing",
  "import_missing",
  "needs_mapping",
  "resolution:accepted",
  "resolution:time_variance_ok",
  "resolution:split_merge_ok",
  "resolution:excel_error",
  "resolution:fixed",
  "resolution:cloud_error"
];

export const resolutionStatuses: ScheduleImportResolutionStatus[] = ["unreviewed", "excel_error", "cloud_error", "fixed", "accepted", "time_variance_ok", "split_merge_ok"];

export function resolutionMarksRowResolved(status?: ScheduleImportResolutionStatus): boolean {
  return status === "accepted" || status === "fixed" || status === "excel_error" || status === "time_variance_ok" || status === "split_merge_ok";
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
    excel_error: "教务表错误",
    cloud_error: "云端需修正",
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
