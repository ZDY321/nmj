import { Fragment, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatAppDateLabel } from "@/frontend/lib/calculations";
import { calendarDates, monthShift, orderedWeekdayLabels, shortWeekdayLabels } from "@/frontend/lib/helpers";
import {
  formatTodoDueDate,
  summarizeTodoDates,
  todoCalendarDateRange,
  type TodoCalendarScope,
  type TodoCalendarSelection
} from "@/frontend/lib/todos";
import type { TodoItem, WeekStart } from "@/shared/types";

const dayTones = {
  empty: "border-transparent bg-white text-[#64748b] hover:bg-[#f1f5f9]",
  open: "border-[#fed7aa] bg-[#fff7ed] text-[#9a3412] hover:bg-[#ffedd5]",
  partial: "border-[#bfdbfe] bg-[#eff6ff] text-[#1557c2] hover:bg-[#dbeafe]",
  done: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d] hover:bg-[#dcfce7]"
};

const scopeOptions: { value: TodoCalendarScope; label: string }[] = [
  { value: "week", label: "未来 7 天" },
  { value: "month", label: "整月" },
  { value: "all", label: "全部未来" }
];

export function TodoCalendar({
  today,
  weekStart,
  todos,
  visibleTodos,
  selection,
  onSelectionChange,
  searching,
  renderTodo
}: {
  today: string;
  weekStart: WeekStart;
  todos: TodoItem[];
  visibleTodos: TodoItem[];
  selection: TodoCalendarSelection;
  onSelectionChange: (selection: TodoCalendarSelection) => void;
  searching: boolean;
  renderTodo: (todo: TodoItem, index: number) => ReactNode;
}) {
  const dateSummaries = summarizeTodoDates(todos);
  const dateRange = todoCalendarDateRange(today, selection);
  const monthDates = calendarDates(selection.month, weekStart);
  const visibleDates = monthDates[35].startsWith(selection.month) ? monthDates : monthDates.slice(0, 35);
  const openCount = visibleTodos.filter((todo) => todo.status === "open").length;
  const doneCount = visibleTodos.length - openCount;
  const monthLabel = `${selection.month.slice(0, 4)} 年 ${Number(selection.month.slice(5))} 月`;
  const title = selection.date
    ? formatTodoDueDate(selection.date)
    : selection.scope === "month" ? monthLabel : selection.scope === "all" ? "全部未来" : "未来 7 天";

  function changeScope(scope: TodoCalendarScope) {
    onSelectionChange({ month: scope === "month" ? selection.month : today.slice(0, 7), date: null, scope });
  }

  function changeMonth(offset: number) {
    onSelectionChange({ month: monthShift(selection.month, offset), date: null, scope: "month" });
  }

  function selectDate(date: string) {
    if (selection.date === date) {
      changeScope(selection.scope);
    } else {
      onSelectionChange({ ...selection, month: date.slice(0, 7), date });
    }
  }

  return (
    <div className="grid min-w-0 gap-5 @min-[680px]:grid-cols-[300px_minmax(0,1fr)]">
      <div className="w-full max-w-[320px] self-start rounded-[14px] border border-[#dbe4ef] bg-white p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant="ghost" className="h-8 w-7 px-0" aria-label="上个月" onClick={() => changeMonth(-1)}>
              <ChevronLeft size={16} />
            </Button>
            <span className="text-sm font-extrabold text-[#061226]" aria-live="polite">{monthLabel}</span>
            <Button type="button" size="sm" variant="ghost" className="h-8 w-7 px-0" aria-label="下个月" onClick={() => changeMonth(1)}>
              <ChevronRight size={16} />
            </Button>
          </div>
          <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={() => changeScope("week")} aria-label="回到今天及未来 7 天">
            今天
          </Button>
        </div>
        <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold text-[#94a3b8]">
          {orderedWeekdayLabels(weekStart, shortWeekdayLabels).map((label) => <span key={label} className="py-1">{label}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1" role="group" aria-label={`${monthLabel}待办日历`}>
          {visibleDates.map((date) => {
            const summary = dateSummaries.get(date);
            const total = summary ? summary.open + summary.done : 0;
            const state = !summary ? "empty" : summary.open === 0 ? "done" : summary.done > 0 ? "partial" : "open";
            const isSelected = selection.date === date;
            const isToday = date === today;
            const label = `${formatTodoDueDate(date)}${isToday ? "，今天" : ""}，${summary ? `${summary.open} 条未完成，${summary.done} 条已完成` : "暂无事项"}`;
            return (
              <button
                key={date}
                type="button"
                onClick={() => selectDate(date)}
                aria-label={label}
                title={label}
                aria-pressed={isSelected}
                aria-current={isToday ? "date" : undefined}
                className={`flex h-11 min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[9px] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1557c2] focus-visible:ring-offset-1 ${dayTones[state]} ${
                  isSelected ? "ring-2 ring-[#1557c2] ring-offset-1" : ""
                } ${date.startsWith(selection.month) ? "" : "opacity-45"}`}
              >
                <span className={`flex h-5 min-w-5 items-center justify-center rounded-full text-xs font-extrabold ${isToday ? "bg-[#1557c2] text-white" : ""}`}>
                  {Number(date.slice(8))}
                </span>
                <span className="h-3 text-[9px] font-semibold leading-3" aria-hidden="true">{total ? `${total > 99 ? "99+" : total} 项` : ""}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-[#64748b]">
          {[
            { label: "未完成", color: "bg-[#fb923c]" },
            { label: "部分完成", color: "bg-[#60a5fa]" },
            { label: "全部完成", color: "bg-[#4ade80]" }
          ].map((item) => (
            <span key={item.label} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${item.color}`} />{item.label}</span>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-5 text-[#64748b]">点击日期查看事项，再次点击取消选中。</p>
      </div>

      <div className="@container min-w-0 space-y-3" role="region" aria-label="日历待办事项">
        <div className="flex flex-wrap gap-1 rounded-[12px] bg-[#f1f5f9] p-1" role="group" aria-label="待办时间范围">
          {scopeOptions.map((option) => {
            const active = !selection.date && selection.scope === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => changeScope(option.value)}
                className={`min-h-8 cursor-pointer rounded-[9px] px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1557c2] ${active ? "bg-white text-[#1557c2] shadow-sm" : "text-[#64748b] hover:bg-white/70"}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#e8eef6] pb-3">
          <div aria-live="polite" aria-atomic="true">
            <div className="flex items-center gap-2 text-sm font-extrabold text-[#061226]"><CalendarDays size={16} className="shrink-0 text-[#1557c2]" />{title}</div>
            <div className="mt-1 text-xs leading-5 text-[#64748b]">
              {selection.date ? "当天的待办与完成情况" : `${dateRange.start}${dateRange.end ? ` 至 ${dateRange.end}` : " 起"}${selection.scope === "week" ? " · 含今天" : ""}`}
              {searching ? " · 已按搜索条件筛选" : ""}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={openCount ? "amber" : "secondary"}>{openCount} 条未完成</Badge>
            {doneCount > 0 && <Badge variant="sage">{doneCount} 条已完成</Badge>}
          </div>
        </div>
        <div className="max-h-[520px] space-y-3 overflow-y-auto overscroll-contain p-0.5">
          {visibleTodos.map((todo, index) => (
            <Fragment key={todo.id}>
              {!selection.date && todo.dueDate !== visibleTodos[index - 1]?.dueDate && (
                <div className="flex items-center gap-2 pt-1 text-xs font-bold text-[#64748b]">
                  {formatAppDateLabel(todo.dueDate!, { month: "long", day: "numeric", weekday: "long" })}
                  {todo.dueDate === today && <span className="text-[#1557c2]">今天</span>}
                </div>
              )}
              {renderTodo(todo, index)}
            </Fragment>
          ))}
          {visibleTodos.length === 0 && (
            <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] px-4 py-8 text-center">
              <CalendarDays size={24} className="mx-auto mb-3 text-[#94a3b8]" />
              <p className="text-sm font-semibold text-[#64748b]">{searching ? "这个时间范围内没有匹配的事项" : selection.date ? "当天没有待办事项" : "这个时间范围内暂无待办"}</p>
              {!selection.date && selection.scope === "week" && (
                <Button type="button" size="sm" variant="link" className="mt-2" onClick={() => changeScope("all")}>查看全部未来事项</Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
