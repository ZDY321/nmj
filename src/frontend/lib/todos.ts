import type { TodoItem } from "@/shared/types";

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
