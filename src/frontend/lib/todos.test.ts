import { describe, expect, it } from "vitest";
import type { TodoItem } from "@/shared/types";
import { groupOpenTodos } from "@/frontend/lib/todos";

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
});
