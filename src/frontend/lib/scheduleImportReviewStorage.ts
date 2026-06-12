import type { ScheduleImportResolution, ScheduleImportResolutionMap, ScheduleImportResolutionStatus } from "@/shared/types";
import { todayIso } from "@/frontend/lib/calculations";
import {
  type ImportedScheduleLesson,
  type ScheduleImportMapping
} from "@/frontend/lib/scheduleImport";
import {
  resolutionStatuses,
  statusFilters,
  type StatusFilter
} from "@/frontend/lib/scheduleImportReviewStatus";
import { normalizeLinkedSystemLessonIds } from "@/frontend/lib/scheduleImportReviewMatching";
import { isRecord } from "@/frontend/lib/typeGuards";

export type SavedScheduleImportWorkspace = {
  rawLessons: ImportedScheduleLesson[];
  mapping: ScheduleImportMapping;
  resolutions: ScheduleImportResolutionMap;
  fileCampusOverrides: ScheduleImportMapping;
  selectedMonth: string;
  selectedDate: string;
  campusFilter: string;
  statusFilter: StatusFilter;
  search: string;
  savedAt?: string;
};

export type ScheduleImportFileSummary = {
  fileName: string;
  sourceCampus: string;
  count: number;
  months: string[];
};

const legacyMappingStorageKey = "teacher-schedule-import-mapping-v1";
const workspaceStorageKey = "teacher-schedule-import-workspace-v1";

function emptySavedWorkspace(): SavedScheduleImportWorkspace {
  return {
    rawLessons: [],
    mapping: {},
    resolutions: {},
    fileCampusOverrides: {},
    selectedMonth: todayIso().slice(0, 7),
    selectedDate: todayIso(),
    campusFilter: "all",
    statusFilter: "all",
    search: ""
  };
}

function scopedStorageKey(baseKey: string, scope?: string): string {
  const normalizedScope = scope?.trim();
  return normalizedScope ? `${baseKey}:${encodeURIComponent(normalizedScope)}` : baseKey;
}

function normalizeMapping(value: unknown): ScheduleImportMapping {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function normalizeResolutions(value: unknown): ScheduleImportResolutionMap {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, rawResolution]) => {
      if (!isRecord(rawResolution)) return [];
      const status = rawResolution.status;
      if (typeof status !== "string" || !resolutionStatuses.includes(status as ScheduleImportResolutionStatus)) return [];
      return [[key, {
        status: status as ScheduleImportResolutionStatus,
        note: typeof rawResolution.note === "string" ? rawResolution.note : undefined,
        linkedSystemLessonIds: normalizeLinkedSystemLessonIds(rawResolution.linkedSystemLessonIds),
        updatedAt: typeof rawResolution.updatedAt === "string" ? rawResolution.updatedAt : new Date().toISOString()
      } satisfies ScheduleImportResolution]];
    })
  );
}

function normalizeRawLessons(value: unknown): ImportedScheduleLesson[] {
  if (!Array.isArray(value)) return [];
  return value.filter((lesson): lesson is ImportedScheduleLesson => isRecord(lesson) && typeof lesson.id === "string" && typeof lesson.fileName === "string" && typeof lesson.date === "string" && typeof lesson.startTime === "string" && typeof lesson.endTime === "string" && typeof lesson.title === "string" && typeof lesson.subjectHint === "string" && typeof lesson.courseTypeHint === "string" && typeof lesson.rawText === "string" && Array.isArray(lesson.warnings));
}

function normalizeStatusFilter(value: unknown): StatusFilter {
  return typeof value === "string" && statusFilters.includes(value as StatusFilter) ? value as StatusFilter : "all";
}

export function readSavedWorkspace(scope?: string): SavedScheduleImportWorkspace {
  try {
    const raw = localStorage.getItem(scopedStorageKey(workspaceStorageKey, scope));
    if (!raw) return emptySavedWorkspace();
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return emptySavedWorkspace();
    return {
      rawLessons: normalizeRawLessons(parsed.rawLessons),
      mapping: normalizeMapping(parsed.mapping),
      resolutions: normalizeResolutions(parsed.resolutions),
      fileCampusOverrides: normalizeMapping(parsed.fileCampusOverrides),
      selectedMonth: typeof parsed.selectedMonth === "string" ? parsed.selectedMonth : todayIso().slice(0, 7),
      selectedDate: typeof parsed.selectedDate === "string" ? parsed.selectedDate : todayIso(),
      campusFilter: typeof parsed.campusFilter === "string" ? parsed.campusFilter : "all",
      statusFilter: normalizeStatusFilter(parsed.statusFilter),
      search: typeof parsed.search === "string" ? parsed.search : "",
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : undefined
    };
  } catch {
    return emptySavedWorkspace();
  }
}

export function writeSavedWorkspace(scope: string | undefined, workspace: SavedScheduleImportWorkspace): boolean {
  try {
    localStorage.setItem(scopedStorageKey(workspaceStorageKey, scope), JSON.stringify(workspace));
    return true;
  } catch {
    return false;
  }
}

export function readSavedMapping(scope?: string): ScheduleImportMapping {
  try {
    const raw = localStorage.getItem(scopedStorageKey(legacyMappingStorageKey, scope)) ?? localStorage.getItem(legacyMappingStorageKey);
    return raw ? normalizeMapping(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function writeSavedMapping(scope: string | undefined, mapping: ScheduleImportMapping): boolean {
  try {
    localStorage.setItem(scopedStorageKey(legacyMappingStorageKey, scope), JSON.stringify(mapping));
    return true;
  } catch {
    return false;
  }
}
