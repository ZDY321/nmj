import type { TodoItem } from "@/shared/types";
import { formatAppDateLabel } from "@/frontend/lib/calculations";
import { addDays, monthShift } from "@/frontend/lib/helpers";

export type TodoCalendarScope = "week" | "month" | "all";

export type TodoCalendarSelection = {
  month: string;
  date: string | null;
  scope: TodoCalendarScope;
};

export type TodoDateRange = { start: string; end?: string };

export function formatTodoDueDate(date: string): string {
  return `${date} · ${formatAppDateLabel(date, { weekday: "long" })}`;
}

export function todoCalendarDateRange(today: string, selection: TodoCalendarSelection): TodoDateRange {
  if (selection.date) return { start: selection.date, end: selection.date };
  if (selection.scope === "month") {
    return { start: `${selection.month}-01`, end: addDays(`${monthShift(selection.month, 1)}-01`, -1) };
  }
  return { start: today, end: selection.scope === "week" ? addDays(today, 6) : undefined };
}

export function todosInDateRange(todos: TodoItem[], range: TodoDateRange): TodoItem[] {
  return todos
    .filter((todo) => todo.status !== "archived" && todo.dueDate && todo.dueDate >= range.start && (!range.end || todo.dueDate <= range.end))
    .sort((a, b) =>
      a.dueDate!.localeCompare(b.dueDate!) ||
      Number(a.status === "done") - Number(b.status === "done") ||
      a.createdAt.localeCompare(b.createdAt)
    );
}

export function summarizeTodoDates(todos: TodoItem[]): Map<string, { open: number; done: number }> {
  const dates = new Map<string, { open: number; done: number }>();
  for (const todo of todos) {
    if (!todo.dueDate || todo.status === "archived") continue;
    const summary = dates.get(todo.dueDate) ?? { open: 0, done: 0 };
    summary[todo.status] += 1;
    dates.set(todo.dueDate, summary);
  }
  return dates;
}

export type OpenTodoGroups = {
  overdue: TodoItem[];
  upcoming: TodoItem[];
  undated: TodoItem[];
};

export function groupOpenTodos(todos: TodoItem[], today: string): OpenTodoGroups {
  const openTodos = todos.filter((todo) => todo.status === "open");

  return {
    overdue: openTodos
      .filter((todo) => Boolean(todo.dueDate) && todo.dueDate! < today)
      .sort(compareDatedTodos),
    upcoming: openTodos
      .filter((todo) => Boolean(todo.dueDate) && todo.dueDate! >= today)
      .sort(compareDatedTodos),
    undated: openTodos
      .filter((todo) => !todo.dueDate)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  };
}

export function sortCompletedTodos(todos: TodoItem[]): TodoItem[] {
  return todos
    .filter((todo) => todo.status === "done")
    .sort((a, b) => {
      const dateOrder = (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99");
      return dateOrder || a.createdAt.localeCompare(b.createdAt);
    });
}

export function sortArchivedTodos(todos: TodoItem[]): TodoItem[] {
  return todos
    .filter((todo) => todo.status === "archived")
    .sort((a, b) => (b.archivedAt ?? b.createdAt).localeCompare(a.archivedAt ?? a.createdAt));
}

function compareDatedTodos(a: TodoItem, b: TodoItem): number {
  return a.dueDate!.localeCompare(b.dueDate!) || a.createdAt.localeCompare(b.createdAt);
}
