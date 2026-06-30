import { describe, expect, it } from "vitest";
import { buildStorageRetentionStats, formatStorageSize } from "@/frontend/lib/storageRetention";
import type { DeletedLesson, Lesson, TeacherVault } from "@/shared/types";

function makeLesson(id: string, date: string, patch: Partial<Lesson> = {}): Lesson {
  return {
    id,
    date,
    startTime: "10:00",
    endTime: "12:00",
    courseGroupId: "course_1",
    type: "one_on_one",
    status: "completed",
    expectedStudentIds: ["student_1"],
    attendance: [{ studentId: "student_1", status: "attended" }],
    feeSnapshot: { amount: 100 },
    content: { taught: "", homework: "", nextLessonReminder: "" },
    ...patch
  };
}

function makeDeletedLesson(id: string, deletedAt: string): DeletedLesson {
  return {
    id,
    lesson: makeLesson(`lesson_${id}`, "2026-01-01"),
    deletedAt,
    source: "manual",
    reason: "test"
  };
}

function makeVault(patch: Partial<TeacherVault> = {}): TeacherVault {
  return {
    version: 1,
    profile: { displayName: "Teacher", baseSalary: 0, currency: "CNY" },
    preferences: { weekStartsOn: 1 },
    campuses: [{ id: "campus_1", name: "Main" }],
    students: [
      { id: "student_1", name: "A", status: "active" },
      { id: "student_2", name: "B", status: "transition" },
      { id: "student_3", name: "C", status: "paused" }
    ],
    courseGroups: [
      {
        id: "course_1",
        name: "Math",
        type: "one_on_one",
        subject: "Math",
        studentIds: ["student_1"],
        feeRule: { mode: "fixed", fixedFee: 100 },
        status: "active"
      },
      {
        id: "course_2",
        name: "Paused",
        type: "class",
        subject: "Math",
        studentIds: [],
        feeRule: { mode: "fixed", fixedFee: 100 },
        status: "paused"
      }
    ],
    scheduleRules: [],
    lessons: [],
    salaryAdjustments: [],
    notice: { enabled: false, title: "", content: "", updatedAt: "2026-06-01T00:00:00.000Z" },
    ...patch
  };
}

describe("storage retention stats", () => {
  it("summarizes vault growth sources and old trash ids", () => {
    const stats = buildStorageRetentionStats(
      makeVault({
        lessons: [
          makeLesson("lesson_1", "2026-06-01", { status: "completed" }),
          makeLesson("lesson_2", "2026-06-02", { status: "scheduled" }),
          makeLesson("lesson_3", "2025-05-01", {
            content: { taught: "x".repeat(520), homework: "", nextLessonReminder: "" }
          })
        ],
        deletedLessons: [
          makeDeletedLesson("old", "2026-01-01T00:00:00.000Z"),
          makeDeletedLesson("recent", "2026-06-15T00:00:00.000Z")
        ],
        scheduleImport: {
          mappings: { A: "course_1", B: "course_2" },
          reviews: [
            {
              id: "review_1",
              savedAt: "2026-06-01T00:00:00.000Z",
              month: "2026-06",
              selectedDate: "2026-06-01",
              rawLessonCount: 1,
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
                needsMapping: 0
              },
              rows: []
            }
          ],
          updatedAt: "2026-06-01T00:00:00.000Z"
        }
      }),
      { now: new Date("2026-06-30T00:00:00.000Z") }
    );

    expect(stats.students).toEqual({ total: 3, active: 1, transition: 1, archived: 1 });
    expect(stats.courses).toEqual({ total: 2, active: 1, paused: 1 });
    expect(stats.lessons.byYear).toEqual([
      { year: "2026", total: 2, statuses: { completed: 1, scheduled: 1 } },
      { year: "2025", total: 1, statuses: { completed: 1 } }
    ]);
    expect(stats.trash.olderThanRetentionIds).toEqual(["old"]);
    expect(stats.scheduleImport).toEqual({ reviewCount: 1, mappingCount: 2 });
    expect(stats.longContentLessonCount).toBe(1);
    expect(stats.estimatedJsonBytes).toBeGreaterThan(0);
  });

  it("formats storage sizes with stable units", () => {
    expect(formatStorageSize(0)).toBe("0 B");
    expect(formatStorageSize(512)).toBe("512 B");
    expect(formatStorageSize(1536)).toBe("1.50 KB");
    expect(formatStorageSize(12 * 1024)).toBe("12.0 KB");
  });
});
