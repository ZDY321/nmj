import { describe, expect, it } from "vitest";
import {
  courseUpdateAffectsLessonDefaults,
  normalizeCourseLessonSyncScope,
  repairCourseStudentLinksFromLessons
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

