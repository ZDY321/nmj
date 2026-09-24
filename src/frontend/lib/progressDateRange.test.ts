import { describe, expect, it } from "vitest";
import { defaultProgressDateRange } from "@/frontend/lib/progressDateRange";

describe("progress date range", () => {
  it("defaults to the latest 30 calendar days including today", () => {
    expect(defaultProgressDateRange("2026-09-24")).toEqual({
      start: "2026-08-26",
      end: "2026-09-24"
    });
  });
});
