import { ArrowRight } from "lucide-react";

export function CalendarDateDetailsButton({ dateLabel, onClick }: {
  dateLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`查看 ${dateLabel} 的课时详情`}
      className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md text-left leading-snug text-[#1557c2] transition-colors hover:text-[#0d3f91] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1557c2] focus-visible:ring-offset-2"
    >
      <span className="underline decoration-[#1557c2]/30 underline-offset-4">{dateLabel}</span>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold">
        查看当天课时 <ArrowRight size={14} aria-hidden="true" />
      </span>
    </button>
  );
}
