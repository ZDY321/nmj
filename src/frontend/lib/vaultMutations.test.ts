import { describe, expect, it } from "vitest";
import {
  courseUpdateAffectsLessonDefaults,
  normalizeCourseLessonSyncScope
} from "@/frontend/lib/vaultMutations";
import type { CourseGroup } from "@/shared/types";

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
});
