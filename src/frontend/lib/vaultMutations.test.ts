import { describe, expect, it } from "vitest";
import {
  courseUpdateAffectsLessonDefaults,
  moveLessonsToTrash,
  normalizeCourseLessonSyncScope,
  repairCourseStudentLinksFromLessons,
  restoreLessonsFromTrash
} from "@/frontend/lib/vaultMutations";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import type { CourseGroup, Lesson } from "@/shared/types";

const baseCourse: CourseGroup = {
  id: "course_1",
  name: "数学 A 班",
  type: "class",
  subject: "数学",
  defaultCampusId: "campus_1",
  studentIds: ["student_1", "student_2"],
  feeRule: {
    mode: "salary_grade",
    salaryGradeSource: "teacher_default"
  },
  status: "active"
};

describe("vault mutation helpers", () => {
  it("normalizes course lesson sync scope aliases", () => {
    expect(normalizeCourseLessonSyncScope(undefined)).toBe("future_scheduled");
    expect(normalizeCourseLessonSyncScope("不同步")).toBe("none");
    expect(normalizeCourseLessonSyncScope("全部")).toBe("all");
    expect(normalizeCourseLessonSyncScope("未完成课节")).toBe("all_unfinished");
    expect(normalizeCourseLessonSyncScope("unexpected")).toBe("future_scheduled");
  });

  it("detects course default changes that should sync lessons", () => {
    expect(courseUpdateAffectsLessonDefaults(baseCourse, { ...baseCourse })).toBe(false);
    expect(courseUpdateAffectsLessonDefaults(baseCourse, { ...baseCourse, defaultCampusId: "campus_2" })).toBe(true);
    expect(courseUpdateAffectsLessonDefaults(baseCourse, { ...baseCourse, studentIds: ["student_1"] })).toBe(true);
    expect(courseUpdateAffectsLessonDefaults(baseCourse, {
      ...baseCourse,
      feeRule: { mode: "fixed", fixedFee: 120 }
    })).toBe(true);
  });

  it("repairs empty one-on-one course links from historical lessons for active students", () => {
    const vault = createEmptyVault("tester");
    vault.students = [
      { id: "student_1", name: "小明", status: "active" },
      { id: "student_2", name: "小红", status: "paused" }
    ];
    vault.courseGroups = [{ ...baseCourse, id: "course_1", type: "one_on_one", studentIds: [], status: "paused" }];
    vault.lessons = [makeLesson("lesson_1", "course_1", ["student_1"]), makeLesson("lesson_2", "course_1", ["student_2"])];

    expect(repairCourseStudentLinksFromLessons(vault, "student_1")).toBe(1);
    expect(vault.courseGroups[0].studentIds).toEqual(["student_1"]);
    expect(vault.courseGroups[0].status).toBe("active");
  });

  it("does not overwrite courses that already keep a student link", () => {
    const vault = createEmptyVault("tester");
    vault.students = [{ id: "student_1", name: "小明", status: "active" }];
    vault.courseGroups = [{ ...baseCourse, id: "course_1", type: "one_on_one", studentIds: ["student_archived"], status: "paused" }];
    vault.lessons = [makeLesson("lesson_1", "course_1", ["student_1"])];

    expect(repairCourseStudentLinksFromLessons(vault, "student_1")).toBe(0);
    expect(vault.courseGroups[0].studentIds).toEqual(["student_archived"]);
    expect(vault.courseGroups[0].status).toBe("paused");
  });

  it("clears original lesson auto makeup notes when a scheduled makeup lesson is deleted", () => {
    const vault = createEmptyVault("tester");
    vault.students = [
      { id: "student_1", name: "小明", status: "active" },
      { id: "student_2", name: "小红", status: "active" }
    ];
    vault.courseGroups = [baseCourse];
    const original = makeLesson("lesson_original", "course_1", ["student_1", "student_2"]);
    original.status = "completed";
    original.attendance = [
      { studentId: "student_1", status: "attended" },
      { studentId: "student_2", status: "makeup_pending", note: "已安排 2026-06-10 补课" }
    ];
    const makeup = {
      ...makeLesson("lesson_makeup", "course_1", ["student_2"]),
      date: "2026-06-10",
      status: "scheduled" as const,
      linkedOriginalLessonId: original.id,
      makeupOriginalDate: original.date,
      makeupScheduledDate: "2026-06-10",
      note: "小红 补 2026-06-01 的课程"
    };
    vault.lessons = [original, makeup];

    moveLessonsToTrash(vault, [makeup], "manual", "手动删除课节");

    const nextOriginal = vault.lessons.find((lesson) => lesson.id === original.id);
    expect(vault.lessons.some((lesson) => lesson.id === makeup.id)).toBe(false);
    expect(vault.deletedLessons).toHaveLength(1);
    expect(nextOriginal?.attendance.find((entry) => entry.studentId === "student_2")).toMatchObject({
      status: "makeup_pending"
    });
    expect(nextOriginal?.attendance.find((entry) => entry.studentId === "student_2")?.note).toBeUndefined();
  });

  it("reopens original lesson makeup status when a completed makeup lesson is deleted", () => {
    const vault = createEmptyVault("tester");
    vault.students = [{ id: "student_1", name: "小明", status: "active" }];
    vault.courseGroups = [baseCourse];
    const original = makeLesson("lesson_original_done", "course_1", ["student_1"]);
    original.status = "makeup_completed";
    original.attendance = [{ studentId: "student_1", status: "makeup_completed", note: "2026-06-10 已补课完成" }];
    const makeup = {
      ...makeLesson("lesson_makeup_done", "course_1", ["student_1"]),
      date: "2026-06-10",
      status: "makeup_completed" as const,
      linkedOriginalLessonId: original.id,
      makeupOriginalDate: original.date,
      makeupScheduledDate: "2026-06-10",
      attendance: [{ studentId: "student_1", status: "makeup_completed" as const }]
    };
    vault.lessons = [original, makeup];

    moveLessonsToTrash(vault, [makeup], "manual", "手动删除课节");

    const nextOriginal = vault.lessons.find((lesson) => lesson.id === original.id);
    expect(nextOriginal?.status).toBe("makeup_pending");
    expect(nextOriginal?.attendance[0]).toMatchObject({ status: "makeup_pending" });
    expect(nextOriginal?.attendance[0].note).toBeUndefined();
  });

  it("re-syncs the original lesson when a completed makeup lesson is restored", () => {
    const vault = createEmptyVault("tester");
    vault.students = [{ id: "student_1", name: "小明", status: "active" }];
    vault.courseGroups = [baseCourse];
    const original = makeLesson("lesson_original_restore", "course_1", ["student_1"]);
    original.status = "makeup_completed";
    original.attendance = [{ studentId: "student_1", status: "makeup_completed", note: "2026-06-10 已补课完成" }];
    const makeup = {
      ...makeLesson("lesson_makeup_restore", "course_1", ["student_1"]),
      date: "2026-06-10",
      status: "makeup_completed" as const,
      linkedOriginalLessonId: original.id,
      makeupOriginalDate: original.date,
      makeupScheduledDate: "2026-06-10",
      attendance: [{ studentId: "student_1", status: "makeup_completed" as const }]
    };
    vault.lessons = [original, makeup];

    moveLessonsToTrash(vault, [makeup], "manual", "手动删除课节");
    const deletedId = vault.deletedLessons?.[0]?.id;
    expect(deletedId).toBeTruthy();
    restoreLessonsFromTrash(vault, [deletedId!]);

    const restoredOriginal = vault.lessons.find((lesson) => lesson.id === original.id);
    expect(restoredOriginal?.status).toBe("makeup_completed");
    expect(restoredOriginal?.attendance[0]).toMatchObject({ status: "makeup_completed" });
  });

  it("moves linked makeup lessons to trash when an original lesson is deleted", () => {
    const vault = createEmptyVault("tester");
    vault.students = [{ id: "student_1", name: "小明", status: "active" }];
    vault.courseGroups = [baseCourse];
    const original = makeLesson("lesson_original_cascade", "course_1", ["student_1"]);
    const makeup = {
      ...makeLesson("lesson_makeup_cascade", "course_1", ["student_1"]),
      date: "2026-06-10",
      status: "scheduled" as const,
      linkedOriginalLessonId: original.id,
      makeupOriginalDate: original.date,
      makeupScheduledDate: "2026-06-10"
    };
    vault.lessons = [original, makeup];

    moveLessonsToTrash(vault, [original], "manual", "手动删除课节");

    expect(vault.lessons).toHaveLength(0);
    expect(vault.deletedLessons?.map((item) => item.lesson.id)).toEqual(expect.arrayContaining([original.id, makeup.id]));
  });
});
function makeLesson(id: string, courseGroupId: string, studentIds: string[]): Lesson {
  return {
    id,
    courseGroupId,
    date: "2026-06-01",
    startTime: "18:00",
    endTime: "20:00",
    type: "one_on_one",
    campusId: "campus_1",
    status: "completed",
    expectedStudentIds: studentIds,
    attendance: studentIds.map((studentId) => ({ studentId, status: "attended" as const })),
    feeSnapshot: { hourlyRate: 0, hours: 2, amount: 0 },
    content: { taught: "", homework: "", nextLessonReminder: "" }
  };
}

