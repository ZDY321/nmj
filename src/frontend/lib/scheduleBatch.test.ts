import { describe, expect, it } from "vitest";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { createLessonFromCourse } from "@/frontend/lib/helpers";
import {
  buildBatchLessonPreview,
  buildBatchSchedulePreview,
  endDateForRepeatWeeks,
  generateBatchLessonsInVault,
  type BatchLessonOptions,
  type BatchLessonTime
} from "@/frontend/lib/scheduleBatch";
import type { Lesson } from "@/shared/types";

const options: BatchLessonOptions = {
  startDate: "2026-09-13",
  endDate: "2026-10-10",
  weekdays: [3],
  courseGroupId: "math",
  startTime: "19:00",
  endTime: "21:00"
};
const expectedDates = ["2026-09-16", "2026-09-23", "2026-09-30", "2026-10-07"];

function makeVault() {
  const vault = createEmptyVault("tester");
  vault.students = [{ id: "student", name: "学生", status: "active" }];
  vault.courseGroups = [{
    id: "math", name: "数学", type: "one_on_one", subject: "数学", studentIds: ["student"],
    status: "active", feeRule: { mode: "fixed", fixedFee: 100 }, defaultCampusId: "campus"
  }];
  return vault;
}

function makeLesson(patch: Partial<Lesson> = {}): Lesson {
  const vault = makeVault();
  return {
    ...createLessonFromCourse(vault, vault.courseGroups[0], {
      date: "2026-09-16", startTime: "19:00", endTime: "21:00", status: "scheduled"
    }),
    ...patch
  };
}

function candidate(patch: Partial<BatchLessonTime> = {}): BatchLessonTime {
  return { date: "2026-09-16", startTime: "19:00", endTime: "21:00", courseGroupId: "math", ...patch };
}

describe("batch lesson generation", () => {
  it.each(["end_date", "weeks"])("fills empty dates without treating existing occurrences as conflicts in %s mode", (mode) => {
    const vault = makeVault();
    const existing = makeLesson();
    vault.lessons = [existing];
    const settings = { ...options, endDate: mode === "weeks" ? endDateForRepeatWeeks(options.startDate, 4) : options.endDate };
    const preview = buildBatchLessonPreview(vault.lessons, settings);

    expect(preview.creatableItems.map((item) => item.date)).toEqual(expectedDates.slice(1));
    expect(preview.existingItems.map((item) => item.date)).toEqual([expectedDates[0]]);
    expect(preview.conflicts).toEqual([]);
    expect(vault.lessons).toEqual([existing]);

    expect(generateBatchLessonsInVault(vault, settings)).toEqual({ candidateCount: 4, createdCount: 3, conflictCount: 0, existingCount: 1 });
    expect(vault.lessons.map((lesson) => lesson.date)).toEqual(expectedDates);
    expect(vault.lessons[0]).toBe(existing);
  });

  it("does not report its own newly generated lessons as conflicts or generate them twice", () => {
    const vault = makeVault();
    expect(generateBatchLessonsInVault(vault, { ...options, manualBillingHours: 1.5 })).toEqual({ candidateCount: 4, createdCount: 4, conflictCount: 0, existingCount: 0 });
    expect(vault.lessons.every((lesson) => lesson.status === "scheduled" && lesson.feeSnapshot.hours === 1.5 && lesson.campusId === "campus")).toBe(true);
    const lessonIds = vault.lessons.map((lesson) => lesson.id);

    const preview = buildBatchLessonPreview(vault.lessons, options);
    expect(preview.conflicts).toEqual([]);
    expect(preview.existingItems).toHaveLength(4);
    expect(preview.creatableItems).toEqual([]);
    expect(generateBatchLessonsInVault(vault, options)).toEqual({ candidateCount: 4, createdCount: 0, conflictCount: 0, existingCount: 4 });
    expect(vault.lessons.map((lesson) => lesson.id)).toEqual(lessonIds);
  });

  it("reports only the date with a real overlap and still fills the other weeks", () => {
    const vault = makeVault();
    const overlap = makeLesson({ date: "2026-09-23", courseGroupId: "english", startTime: "20:00", endTime: "22:00" });
    vault.lessons = [overlap];
    const preview = buildBatchLessonPreview(vault.lessons, options);
    expect(preview.conflicts).toEqual([{ candidate: candidate({ date: "2026-09-23" }), conflictingLesson: overlap, source: "existing" }]);

    expect(generateBatchLessonsInVault(vault, options)).toEqual({ candidateCount: 4, createdCount: 3, conflictCount: 1, existingCount: 0 });
    expect(vault.lessons.slice(1).map((lesson) => lesson.date)).toEqual(["2026-09-16", "2026-09-30", "2026-10-07"]);
  });

  it("ignores cancelled lessons, other dates, and touching time boundaries", () => {
    const lessons = [
      makeLesson({ status: "cancelled" }),
      makeLesson({ date: "2026-09-17" }),
      makeLesson({ date: "2026-09-23", startTime: "17:00", endTime: "19:00" }),
      makeLesson({ date: "2026-09-30", startTime: "21:00", endTime: "22:00" })
    ];
    const preview = buildBatchLessonPreview(lessons, options);
    expect(preview.creatableItems.map((item) => item.date)).toEqual(expectedDates);
    expect(preview.existingItems).toEqual([]);
    expect(preview.conflicts).toEqual([]);
  });

  it("recognizes the same occurrence when stored time formatting differs", () => {
    const preview = buildBatchLessonPreview([makeLesson({ startTime: "9:00", endTime: "10:00" })], { ...options, startTime: "09:00", endTime: "10:00" });
    expect(preview.existingItems).toHaveLength(1);
    expect(preview.conflicts).toEqual([]);
  });

  it("keeps overlapping times for the same course as real conflicts", () => {
    const preview = buildBatchLessonPreview([makeLesson({ startTime: "18:30", endTime: "20:30" })], options);
    expect(preview.existingItems).toEqual([]);
    expect(preview.conflicts).toHaveLength(1);
  });

  it("includes exactly the requested weeks across month and year boundaries", () => {
    expect(endDateForRepeatWeeks("2026-09-13", 1)).toBe("2026-09-19");
    expect(endDateForRepeatWeeks("2026-12-27", 2)).toBe("2027-01-09");
    expect(buildBatchLessonPreview([], { ...options, startDate: "2026-12-27", endDate: endDateForRepeatWeeks("2026-12-27", 2), weekdays: [0, 3, 3] }).creatableItems.map((item) => item.date))
      .toEqual(["2026-12-27", "2026-12-30", "2027-01-03", "2027-01-06"]);
    expect(endDateForRepeatWeeks("2026-09-13", 0)).toBe("");
  });
});

describe("batch time groups and weekly templates", () => {
  it("deduplicates identical items and keeps same-time items on different days", () => {
    const items = [candidate(), candidate(), candidate({ date: "2026-09-23" })];
    const preview = buildBatchSchedulePreview([], items);
    expect(preview.creatableItems).toEqual([items[0], items[2]]);
    expect(preview.duplicateItems).toEqual([items[1]]);
    expect(preview.conflicts).toEqual([]);
    expect(items).toHaveLength(3);
  });

  it("distinguishes existing timetable conflicts from overlaps inside the current batch", () => {
    const existing = makeLesson({ date: "2026-09-23", courseGroupId: "english" });
    const items = [candidate(), candidate({ startTime: "20:00", endTime: "22:00" }), candidate({ date: "2026-09-23" })];
    const preview = buildBatchSchedulePreview([existing], items);
    expect(preview.creatableItems).toEqual([items[0]]);
    expect(preview.conflicts).toEqual([
      { candidate: items[1], conflictingLesson: items[0], source: "batch" },
      { candidate: items[2], conflictingLesson: existing, source: "existing" }
    ]);
  });

  it("still rejects a different course at an identical time", () => {
    const items = [candidate(), candidate({ courseGroupId: "english" })];
    const preview = buildBatchSchedulePreview([], items);
    expect(preview.duplicateItems).toEqual([]);
    expect(preview.conflicts).toHaveLength(1);
  });
});
