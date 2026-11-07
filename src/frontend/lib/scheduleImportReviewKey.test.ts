import { describe, expect, it } from "vitest";
import { resolutionKey } from "./scheduleImportReviewKey";
import { resolutionKey as previewResolutionKey } from "./scheduleImportReviewMatching";

const row: Parameters<typeof resolutionKey>[0] = {
  id: "row-1", systemLessonId: "lesson-1", fileName: "课表.xlsx", date: "2026-11-06",
  startTime: "09:00", endTime: "11:00", matchedCourseId: "course-1", title: "数学"
};

describe("persisted schedule review keys", () => {
  it("preserves the existing persisted key format and preview export", () => {
    expect(resolutionKey(row)).toBe("lesson-1|课表.xlsx|2026-11-06|09:00|11:00|course-1|数学");
    expect(previewResolutionKey).toBe(resolutionKey);
  });
  it.each([undefined, ""])("falls back to row ID for a missing or empty system ID (%s)", systemLessonId => {
    expect(resolutionKey({ ...row, systemLessonId, matchedCourseId: undefined })).toBe("row-1|课表.xlsx|2026-11-06|09:00|11:00||数学");
  });
  it("does not normalize historical whitespace or delimiter characters", () => {
    expect(resolutionKey({ ...row, title: " 数学|复习 " })).toBe("lesson-1|课表.xlsx|2026-11-06|09:00|11:00|course-1| 数学|复习 ");
  });
});
