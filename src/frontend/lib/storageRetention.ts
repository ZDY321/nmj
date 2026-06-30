import type { DeletedLesson, Lesson, LessonStatus, TeacherVault } from "@/shared/types";

export type LessonYearStatusStats = {
  year: string;
  total: number;
  statuses: Partial<Record<LessonStatus, number>>;
};

export type StorageRetentionStats = {
  estimatedJsonBytes: number;
  students: {
    total: number;
    active: number;
    transition: number;
    archived: number;
  };
  courses: {
    total: number;
    active: number;
    paused: number;
  };
  lessons: {
    total: number;
    byYear: LessonYearStatusStats[];
  };
  trash: {
    total: number;
    estimatedJsonBytes: number;
    olderThanRetentionCount: number;
    olderThanRetentionIds: string[];
  };
  scheduleImport: {
    reviewCount: number;
    mappingCount: number;
  };
  longContentLessonCount: number;
};

const longContentThreshold = 500;

export function buildStorageRetentionStats(
  vault: TeacherVault,
  options: { now?: Date; trashRetentionDays?: number } = {}
): StorageRetentionStats {
  const trashRetentionDays = options.trashRetentionDays ?? 90;
  const now = options.now ?? new Date();
  const cutoffTime = now.getTime() - trashRetentionDays * 24 * 60 * 60 * 1000;
  const deletedLessons = vault.deletedLessons ?? [];
  const olderTrash = deletedLessons.filter((item) => isDeletedBefore(item, cutoffTime));

  return {
    estimatedJsonBytes: estimateJsonBytes(vault),
    students: {
      total: vault.students.length,
      active: vault.students.filter((student) => student.status === "active").length,
      transition: vault.students.filter((student) => student.status === "transition").length,
      archived: vault.students.filter((student) => student.status === "paused").length
    },
    courses: {
      total: vault.courseGroups.length,
      active: vault.courseGroups.filter((course) => course.status === "active").length,
      paused: vault.courseGroups.filter((course) => course.status === "paused").length
    },
    lessons: {
      total: vault.lessons.length,
      byYear: lessonsByYear(vault.lessons)
    },
    trash: {
      total: deletedLessons.length,
      estimatedJsonBytes: estimateJsonBytes(deletedLessons),
      olderThanRetentionCount: olderTrash.length,
      olderThanRetentionIds: olderTrash.map((item) => item.id)
    },
    scheduleImport: {
      reviewCount: vault.scheduleImport?.reviews.length ?? 0,
      mappingCount: Object.keys(vault.scheduleImport?.mappings ?? {}).length
    },
    longContentLessonCount: vault.lessons.filter(hasLongLessonContent).length
  };
}

export function formatStorageSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function estimateJsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function lessonsByYear(lessons: Lesson[]): LessonYearStatusStats[] {
  const byYear = new Map<string, LessonYearStatusStats>();
  lessons.forEach((lesson) => {
    const year = lesson.date.slice(0, 4) || "未知";
    const current = byYear.get(year) ?? { year, total: 0, statuses: {} };
    current.total += 1;
    current.statuses[lesson.status] = (current.statuses[lesson.status] ?? 0) + 1;
    byYear.set(year, current);
  });
  return Array.from(byYear.values()).sort((left, right) => right.year.localeCompare(left.year));
}

function isDeletedBefore(item: DeletedLesson, cutoffTime: number): boolean {
  const deletedTime = new Date(item.deletedAt).getTime();
  return Number.isFinite(deletedTime) && deletedTime < cutoffTime;
}

function hasLongLessonContent(lesson: Lesson): boolean {
  const text = [
    lesson.content.taught,
    lesson.content.performance,
    lesson.content.homework,
    lesson.content.nextLessonReminder,
    lesson.content.internalNote,
    lesson.note
  ].filter(Boolean).join("\n");
  return text.length >= longContentThreshold;
}
