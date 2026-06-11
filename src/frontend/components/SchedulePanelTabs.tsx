import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import type { SchedulePanel } from "@/frontend/lib/scheduleViewTypes";
import type { UserRole } from "@/shared/types";

type SchedulePanelTabsProps = {
  activePanel: SchedulePanel;
  deletedLessonCount: number;
  onChange: (panel: SchedulePanel) => void;
  role: UserRole;
  aiSchedulingEnabled?: boolean;
};

export function SchedulePanelTabs({ activePanel, deletedLessonCount, onChange, role, aiSchedulingEnabled }: SchedulePanelTabsProps) {
  const allItems: Array<{ key: SchedulePanel; label: string }> = [
    { key: "ai", label: "AI 排课助手" },
    { key: "schedule", label: "排课" },
    { key: "calendar", label: "日历查看" },
    { key: "records", label: "课程记录" },
    { key: "studentStats", label: "学生课次统计" },
    { key: "trash", label: `回收站${deletedLessonCount > 0 ? ` ${deletedLessonCount}` : ""}` }
  ];

  const items = allItems.filter(item => item.key !== "ai" || role === "admin" || aiSchedulingEnabled);

  return (
    <div className="overflow-x-auto rounded-[16px] border border-[#dbe4ef] bg-white">
      <div className="flex w-full min-w-max items-center gap-1 p-1 md:min-w-0">
        {items.map((item, index) => (
          <Fragment key={item.key}>
            <button
              type="button"
              onClick={() => onChange(item.key)}
              className={`min-w-[112px] flex-1 rounded-[12px] px-3 py-2 text-sm font-extrabold transition-colors ${
                activePanel === item.key ? "bg-[#1557c2] text-white" : "text-[#25324a] hover:bg-[#f8fbff]"
              }`}
            >
              {item.label}
            </button>
            {index < items.length - 1 && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f8fbff] text-[#94a3b8] ring-1 ring-[#e8eef6]">
                <ChevronRight size={14} />
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
