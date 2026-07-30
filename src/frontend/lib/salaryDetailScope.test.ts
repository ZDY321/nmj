import { describe, expect, it } from "vitest";
import { filterCoursesWithScopedLessons, filterSalaryDetailLessonsByDateScope } from "@/frontend/lib/salaryDetailScope";

const lessons = [
  { id: "june", courseGroupId: "course-old", date: "2026-06-20" },
  { id: "july-early", courseGroupId: "course-current", date: "2026-07-10" },
  { id: "july-late", courseGroupId: "course-current", date: "2026-07-25" },
  { id: "august", courseGroupId: "course-next", date: "2026-08-05" }
];

describe("salary detail date scope", () => {
  it("defaults to the selected month when no detail dates are entered", () => {
    expect(filterSalaryDetailLessonsByDateScope(lessons, "2026-07", "", "").map((lesson) => lesson.id)).toEqual([
      "july-early",
      "july-late"
    ]);
  });

  it("uses the explicit date range across month boundaries", () => {
    expect(filterSalaryDetailLessonsByDateScope(lessons, "2026-07", "2026-06-15", "2026-07-15").map((lesson) => lesson.id)).toEqual([
      "june",
      "july-early"
    ]);
  });

  it("limits course options to courses that have lessons in the current detail scope", () => {
    const scopedLessons = filterSalaryDetailLessonsByDateScope(lessons, "2026-07", "2026-06-15", "2026-07-15");
    const courses = [
      { id: "course-old", name: "历史课程" },
      { id: "course-current", name: "本月课程" },
      { id: "course-next", name: "其他月份课程" }
    ];

    expect(filterCoursesWithScopedLessons(courses, scopedLessons).map((course) => course.id)).toEqual([
      "course-old",
      "course-current"
    ]);
  });
});
