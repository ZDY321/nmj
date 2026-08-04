import type { ScheduleImportVaultState } from "@/shared/types";

export type ScheduleImportSaveOptions = {
  syncReviewArchive?: boolean;
  deferMainSave?: boolean;
};

export function scheduleImportMainState(state: ScheduleImportVaultState): ScheduleImportVaultState {
  return {
    ...state,
    reviews: []
  };
}

export function scheduleImportReviewArchiveState(state: ScheduleImportVaultState): ScheduleImportVaultState {
  return {
    mappings: {},
    resolutions: {},
    reviews: [...state.reviews],
    splitMergeExcludedLessonIds: [],
    updatedAt: state.updatedAt
  };
}

export function mergeScheduleImportArchive(
  mainState: ScheduleImportVaultState | null | undefined,
  reviewArchive: ScheduleImportVaultState | null | undefined,
  options: { preferMainReviews?: boolean } = {}
): ScheduleImportVaultState | null {
  if (!mainState && !reviewArchive) return null;

  const primaryState = mainState ?? reviewArchive!;
  const reviews = options.preferMainReviews && mainState
    ? mainState.reviews
    : reviewArchive
      ? reviewArchive.reviews
      : mainState?.reviews ?? [];
  const updatedAt = mainState?.updatedAt && reviewArchive?.updatedAt
    ? mainState.updatedAt.localeCompare(reviewArchive.updatedAt) >= 0 ? mainState.updatedAt : reviewArchive.updatedAt
    : mainState?.updatedAt ?? reviewArchive?.updatedAt ?? "";

  return {
    mappings: { ...(primaryState.mappings ?? {}) },
    resolutions: { ...(primaryState.resolutions ?? {}) },
    reviews: [...reviews],
    splitMergeExcludedLessonIds: [...(primaryState.splitMergeExcludedLessonIds ?? [])],
    updatedAt
  };
}
