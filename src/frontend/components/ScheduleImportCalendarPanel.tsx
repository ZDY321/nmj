import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ScheduleImportResolution, ScheduleImportResolutionMap, TeacherVault } from "@/shared/types";
import type { ImportMatchStatus, ImportPreviewLesson } from "@/frontend/lib/scheduleImport";
import { courseName as localCourseName } from "@/frontend/lib/helpers";

export function ScheduleImportCalendarPanel({
  vault,
  days,
  weekdayLabels,
  displayMonth,
  selectedDate,
  filteredRows,
  selectedDateRows,
  resolutions,
  linkedSystemLessonIds,
  onDateSelect,
  effectiveRowStatus,
  resolutionKey,
  isReviewedResolution,
  statusPillClass,
  rowAttentionLabel,
  renderRow
}: {
  vault: TeacherVault;
  days: string[];
  weekdayLabels: string[];
  displayMonth: string;
  selectedDate: string;
  filteredRows: ImportPreviewLesson[];
  selectedDateRows: ImportPreviewLesson[];
  resolutions: ScheduleImportResolutionMap;
  linkedSystemLessonIds: Set<string>;
  onDateSelect: (date: string) => void;
  effectiveRowStatus: (row: ImportPreviewLesson, resolution?: ScheduleImportResolution, linkedSystemLessonIds?: Set<string>) => ImportMatchStatus;
  resolutionKey: (row: ImportPreviewLesson) => string;
  isReviewedResolution: (resolution: ScheduleImportResolution | undefined) => boolean;
  statusPillClass: (status: ImportMatchStatus, reviewed?: boolean) => string;
  rowAttentionLabel?: (row: ImportPreviewLesson) => string | undefined;
  renderRow: (row: ImportPreviewLesson) => ReactNode;
}) {
  const rowHasMissingLessonFee = (row: ImportPreviewLesson): boolean =>
    resolutions[resolutionKey(row)]?.status === "missing_lesson_fee";
  const rowHasProblem = (row: ImportPreviewLesson): boolean =>
    effectiveRowStatus(row, resolutions[resolutionKey(row)], linkedSystemLessonIds) !== "matched" ||
    rowHasMissingLessonFee(row) ||
    attentionLabelMarksProblem(rowAttentionLabel?.(row));
  const selectedDateProblemCount = selectedDateRows.filter(rowHasProblem).length;
  const selectedDateMissingFeeCount = selectedDateRows.filter(rowHasMissingLessonFee).length;
  const selectedDateHasProblems = selectedDateProblemCount > 0;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="rounded-[16px] border border-[#dbe4ef] bg-white p-3">
        <div className="mb-2 grid grid-cols-7 gap-2">
          {weekdayLabels.map((label) => (
            <div key={label} className="rounded-[10px] bg-[#f8fbff] px-2 py-2 text-center text-xs font-extrabold text-[#64748b]">{label}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {days.map((date) => {
            const dayRows = filteredRows.filter((row) => row.date === date);
            const isSelected = selectedDate === date;
            const isCurrentMonth = date.startsWith(displayMonth);
            const hasProblems = dayRows.some(rowHasProblem);
            const missingFeeDayCount = dayRows.filter(rowHasMissingLessonFee).length;
            const reviewedDayCount = dayRows.filter((row) => isReviewedResolution(resolutions[resolutionKey(row)])).length;
            return (
              <button
                key={date}
                type="button"
                onClick={() => onDateSelect(date)}
                className={`min-h-[126px] rounded-[14px] border p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(15,35,66,0.08)] ${
                  isSelected
                    ? "border-[#1557c2] bg-[#eaf2ff] shadow-[0_10px_24px_rgba(21,87,194,0.12)] ring-2 ring-[#bfdbfe]"
                    : !isCurrentMonth
                      ? "border-transparent bg-[#f8fbff] opacity-45"
                      : hasProblems
                        ? "border-[#fed7aa] bg-[#fff7ed]"
                        : dayRows.length > 0
                          ? reviewedDayCount > 0
                            ? "border-[#86efac] bg-[#f0fdf4] ring-1 ring-[#bbf7d0]"
                            : "border-[#bbf7d0] bg-[#f0fdf4]"
                          : "border-[#e8eef6] bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <span className="shrink-0 text-sm font-extrabold text-[#061226]">{Number(date.slice(8))}</span>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1">
                    {reviewedDayCount > 0 && <Badge variant="sky" className="px-1.5 text-[10px] leading-4">已标 {reviewedDayCount}</Badge>}
                    {missingFeeDayCount > 0 && <Badge variant="destructive" className="px-1.5 text-[10px] leading-4">欠费 {missingFeeDayCount}</Badge>}
                    {dayRows.length > 0 && <Badge variant={hasProblems ? "amber" : "sage"} className="px-1.5 text-[10px] leading-4">{dayRows.length}</Badge>}
                  </div>
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  {dayRows.slice(0, 3).map((row) => {
                    const rowReviewed = isReviewedResolution(resolutions[resolutionKey(row)]);
                    const rowStatus = effectiveRowStatus(row, resolutions[resolutionKey(row)], linkedSystemLessonIds);
                    const attentionLabel = rowAttentionLabel?.(row);
                    const attentionIsProblem = attentionLabelMarksProblem(attentionLabel);
                    const rowPrefix = rowReviewed ? rowStatus === "matched" ? "已确认 · " : "已标 · " : "";
                    return (
                      <span key={row.id} className={`block truncate rounded-[8px] px-2 py-1 text-[10px] font-bold ${attentionLabel ? attentionLabelClass(attentionIsProblem) : statusPillClass(rowStatus, rowReviewed && rowStatus !== "matched")}`}>
                        {attentionLabel ? `${attentionLabel} · ` : rowPrefix}{row.startTime} {row.status === "import_missing" ? "云端" : "教务"} · {row.matchedCourseId ? localCourseName(vault, row.matchedCourseId) : row.title}
                      </span>
                    );
                  })}
                  {dayRows.length > 3 && (
                    <span className="text-[10px] font-bold text-[#64748b]">+{dayRows.length - 3} 条</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-[14px] border border-[#dbe4ef] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-extrabold text-[#061226]">
                <CalendarDays size={16} className="text-[#1557c2]" /> {selectedDate}
              </div>
              <div className="mt-1 text-xs font-semibold text-[#64748b]">当前筛选 {selectedDateRows.length} 条</div>
            </div>
            <Badge variant={selectedDateHasProblems ? "amber" : "sage"}>
              {selectedDateHasProblems ? `有差异 ${selectedDateProblemCount} 节` : "已对应"}
            </Badge>
            {selectedDateMissingFeeCount > 0 && <Badge variant="destructive">欠费 {selectedDateMissingFeeCount} 节</Badge>}
          </div>
        </div>

        <div className="max-h-[720px] space-y-3 overflow-y-auto pr-1">
          {selectedDateRows.map((row) => renderRow(row))}
          {selectedDateRows.length === 0 && (
            <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
              这一天没有符合筛选的对账项
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function attentionLabelMarksProblem(label: string | undefined): boolean {
  return label === "拆分合并标记已失效" || label === "合并需复核" || label === "关联需复核";
}

function attentionLabelClass(problem: boolean): string {
  return problem
    ? "bg-[#fff3e4] text-[#9a3412] ring-1 ring-[#fdba74]"
    : "bg-[#eef0ff] text-[#5161d6] ring-1 ring-[#c7d2fe]";
}
