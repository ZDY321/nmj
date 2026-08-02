import { describe, expect, it } from "vitest";
import {
  mergeScheduleImportArchive,
  scheduleImportMainState,
  scheduleImportReviewArchiveState
} from "@/frontend/lib/scheduleImportArchive";
import type { ScheduleImportReviewRecord, ScheduleImportVaultState } from "@/shared/types";

const review: ScheduleImportReviewRecord = {
  id: "review_july",
  savedAt: "2026-07-31T00:00:00.000Z",
  month: "2026-07",
  selectedDate: "2026-07-01",
  rawLessonCount: 0,
  fileNames: [],
  mapping: {},
  fileCampusOverrides: {},
  summary: {
    total: 0,
    matched: 0,
    attendanceMismatch: 0,
    timeMismatch: 0,
    courseMismatch: 0,
    systemMissing: 0,
    importMissing: 0,
    needsMapping: 0,
    systemLessonCount: 0,
    systemCompletedLessonCount: 0,
    systemCompletedAmount: 0
  },
  rows: []
};

function state(patch: Partial<ScheduleImportVaultState> = {}): ScheduleImportVaultState {
  return {
    mappings: {},
    resolutions: {},
    reviews: [],
    splitMergeExcludedLessonIds: [],
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...patch
  };
}

describe("schedule import archive separation", () => {
  it("keeps main mappings authoritative while restoring cloud review history", () => {
    const merged = mergeScheduleImportArchive(
      state({ mappings: {} }),
      state({ mappings: { deleted_rule: "old_course" }, reviews: [review] })
    );

    expect(merged?.mappings).toEqual({});
    expect(merged?.reviews).toEqual([review]);
  });

  it("can preserve a review change made while the cloud archive was loading", () => {
    const localReview = { ...review, id: "review_local" };
    const merged = mergeScheduleImportArchive(
      state({ reviews: [localReview] }),
      state({ reviews: [review] }),
      { preferMainReviews: true }
    );

    expect(merged?.reviews).toEqual([localReview]);
  });

  it("stores only review history in the independent archive", () => {
    const fullState = state({
      mappings: { rule: "course" },
      resolutions: { row: { status: "accepted", updatedAt: "2026-08-01T00:00:00.000Z" } },
      reviews: [review],
      splitMergeExcludedLessonIds: ["lesson_1"]
    });

    expect(scheduleImportMainState(fullState).reviews).toEqual([]);
    expect(scheduleImportReviewArchiveState(fullState)).toEqual({
      mappings: {},
      resolutions: {},
      reviews: [review],
      splitMergeExcludedLessonIds: [],
      updatedAt: fullState.updatedAt
    });
  });
});
