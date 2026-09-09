import { describe, expect, it } from "vitest";
import type { TodoItem } from "@/shared/types";
import { groupOpenTodos, sortArchivedTodos, summarizeTodoDates, todoCalendarDateRange, todosInDateRange } from "@/frontend/lib/todos";

function todo(id: string, dueDate?: string, createdAt = "2026-07-01T00:00:00.000Z"): TodoItem {
  return {
    id,
    title: id,
    dueDate,
    status: "open",
    createdAt
  };
}

describe("todo date grouping", () => {
  it("separates overdue, upcoming, and undated todos with the intended order", () => {
    const groups = groupOpenTodos([
      todo("later", "2026-08-01"),
      todo("oldest-overdue", "2026-06-01"),
      todo("tomorrow", "2026-07-17"),
      todo("recent-overdue", "2026-07-15"),
      todo("today", "2026-07-16"),
      todo("older-undated", undefined, "2026-07-01T00:00:00.000Z"),
      todo("newer-undated", undefined, "2026-07-10T00:00:00.000Z"),
      { ...todo("done", "2026-07-14"), status: "done" }
    ], "2026-07-16");

    expect(groups.overdue.map((item) => item.id)).toEqual(["oldest-overdue", "recent-overdue"]);
    expect(groups.upcoming.map((item) => item.id)).toEqual(["today", "tomorrow", "later"]);
    expect(groups.undated.map((item) => item.id)).toEqual(["newer-undated", "older-undated"]);
  });

  it("keeps archived todos out of open groups and sorts archived items by archived time", () => {
    const archivedOlder: TodoItem = {
      ...todo("archived-older", "2026-06-01"),
      status: "archived",
      archivedAt: "2026-07-10T00:00:00.000Z",
      archivedMemoId: "memo_older"
    };
    const archivedNewer: TodoItem = {
      ...todo("archived-newer", "2026-06-02"),
      status: "archived",
      archivedAt: "2026-07-12T00:00:00.000Z",
      archivedMemoId: "memo_newer"
    };

    const groups = groupOpenTodos([todo("open", "2026-07-15"), archivedOlder, archivedNewer], "2026-07-16");

    expect(groups.overdue.map((item) => item.id)).toEqual(["open"]);
    expect(sortArchivedTodos([archivedOlder, archivedNewer]).map((item) => item.id)).toEqual([
      "archived-newer",
      "archived-older"
    ]);
  });
});

describe("todo calendar", () => {
  it("defaults to seven calendar days including today, across month and year boundaries", () => {
    const range = todoCalendarDateRange("2026-12-29", { month: "2026-12", date: null, scope: "week" });
    expect(range).toEqual({ start: "2026-12-29", end: "2027-01-04" });
    expect(todosInDateRange([
      todo("yesterday", "2026-12-28"),
      todo("today", "2026-12-29"),
      todo("last-day", "2027-01-04"),
      todo("eighth-day", "2027-01-05")
    ], range).map((item) => item.id)).toEqual(["today", "last-day"]);
  });

  it.each([
    ["2024-02", "2024-02-29"],
    ["2025-02", "2025-02-28"],
    ["2026-12", "2026-12-31"]
  ])("uses the actual last day of the browsed month %s", (month, lastDay) => {
    expect(todoCalendarDateRange("2026-09-09", { month, date: null, scope: "month" }))
      .toEqual({ start: `${month}-01`, end: lastDay });
  });

  it("shows a selected day independently of the default range, including past dates", () => {
    const range = todoCalendarDateRange("2026-09-09", { month: "2026-08", date: "2026-08-15", scope: "week" });
    expect(range).toEqual({ start: "2026-08-15", end: "2026-08-15" });
    expect(todosInDateRange([
      todo("before", "2026-08-14"),
      todo("selected", "2026-08-15"),
      { ...todo("completed", "2026-08-15"), status: "done" },
      todo("after", "2026-08-16")
    ], range).map((item) => item.id)).toEqual(["selected", "completed"]);
  });

  it("keeps all future dates reachable and excludes archived and undated items", () => {
    const range = todoCalendarDateRange("2026-09-09", { month: "2026-09", date: null, scope: "all" });
    expect(todosInDateRange([
      todo("far-future", "2027-06-01"),
      { ...todo("done-today", "2026-09-09"), status: "done" },
      todo("open-today", "2026-09-09", "2026-08-01T00:00:00.000Z"),
      todo("overdue", "2026-09-08"),
      todo("undated"),
      { ...todo("archived", "2026-09-10"), status: "archived" }
    ], range).map((item) => item.id)).toEqual(["open-today", "done-today", "far-future"]);
  });

  it("counts both open and completed items per day and updates after completion or reopening", () => {
    const items: TodoItem[] = [
      todo("pending", "2026-09-12"),
      { ...todo("completed", "2026-09-12"), status: "done" },
      { ...todo("archived", "2026-09-12"), status: "archived" },
      { ...todo("only-archived", "2026-09-13"), status: "archived" },
      todo("undated")
    ];
    expect([...summarizeTodoDates(items)]).toEqual([["2026-09-12", { open: 1, done: 1 }]]);
    const completed = items.map((item) => item.id === "pending" ? { ...item, status: "done" as const } : item);
    expect(summarizeTodoDates(completed).get("2026-09-12")).toEqual({ open: 0, done: 2 });
    const reopened = completed.map((item) => item.status === "done" ? { ...item, status: "open" as const } : item);
    expect(summarizeTodoDates(reopened).get("2026-09-12")).toEqual({ open: 2, done: 0 });
  });
});
