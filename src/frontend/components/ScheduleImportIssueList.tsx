import { Badge } from "@/components/ui/badge";
import { parseTimeComparisonIssue } from "@/frontend/lib/scheduleImportReview";

export function ScheduleImportIssueList({ issues, compact = false }: { issues: string[]; compact?: boolean }) {
  return (
    <div className={compact ? "mt-1 space-y-1.5" : "space-y-2"}>
      {issues.map((issue) => {
        const timeComparison = parseTimeComparisonIssue(issue);
        if (timeComparison) {
          return (
            <div key={issue} className={`rounded-[10px] border border-[#fed7aa] bg-[#fff7ed] ${compact ? "p-2" : "p-3"}`}>
              <div className="text-[11px] font-extrabold text-[#9a3412]">{timeComparison.label}</div>
              <div className={`mt-2 grid grid-cols-1 gap-2 ${compact ? "" : "md:grid-cols-2"}`}>
                <div className="rounded-[9px] border border-[#e8eef6] bg-white px-2.5 py-2">
                  <div className="text-[10px] font-extrabold text-[#1557c2]">教务 Excel</div>
                  <div className="mt-1 text-xs font-extrabold text-[#061226]">{timeComparison.importTime}</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-[#64748b]">{timeComparison.importDate}</div>
                </div>
                <div className="rounded-[9px] border border-[#e8eef6] bg-white px-2.5 py-2">
                  <div className="text-[10px] font-extrabold text-[#1557c2]">云端课表</div>
                  <div className="mt-1 text-xs font-extrabold text-[#061226]">{timeComparison.systemTime}</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-[#64748b]">
                    {timeComparison.systemDate}{timeComparison.systemTitle ? ` · ${timeComparison.systemTitle}` : ""}
                  </div>
                </div>
              </div>
            </div>
          );
        }
        return (
          <Badge key={issue} variant="amber" className="mr-1 mt-1 align-top text-[10px]">
            {issue}
          </Badge>
        );
      })}
    </div>
  );
}
