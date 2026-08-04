import { describe, expect, it } from "vitest";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import {
  calendarLessonsForDateWithFilters,
  filterStudentStatsLessons,
  type CalendarLessonFilters,
  type StudentStatsLessonFilters
} from "@/frontend/lib/scheduleViewHelpers";
import type { CourseGroup, Lesson, TeacherVault } from "@/shared/types";

const defaultFilters: StudentStatsLessonFilters = {
  campusFilter: "all",
  courseFilter: "all",
  courseTypeFilter: "all",
  dateEnd: "2026-07-31",
  dateStart: "2026-07-01",
  endTime: "",
  normalizedNameFilter: "",
  startTime: "",
  statusFilter: "all",
  subjectFilter: "all",
  makeupFilter: "all"
};

const defaultCalendarFilters: CalendarLessonFilters = {
  campusFilter: "all",
  courseTypeFilter: "all",
  gradeFilter: "all",
  makeupFilter: "all",
  studentFilter: "",
  subjectFilter: "all"
};

function makeCourse(id: string, studentId: string, status: CourseGroup["status"] = "active"): CourseGroup {
  return {
    id,
    name: id,
    type: "one_on_one",
    subject: "Math",
    studentIds: [studentId],
    feeRule: { mode: "fixed", fixedFee: 100 },
    status
  };
}

function makeLesson(id: string, courseGroupId: string, studentId: string): Lesson {
  return {
    id,
    date: "2026-07-15",
    startTime: "19:00",
    endTime: "21:00",
    courseGroupId,
    type: "one_on_one",
    status: "completed",
    expectedStudentIds: [studentId],
    attendance: [{ studentId, status: "attended" }],
    feeSnapshot: { amount: 100, hours: 2 },
    content: { taught: "", homework: "", nextLessonReminder: "" }
  };
}

function makeStatsVault(): TeacherVault {
  const vault = createEmptyVault("tester");
  vault.students = [
    { id: "student_active", name: "Active", status: "active" },
    { id: "student_transition", name: "Transition", status: "transition" },
    { id: "student_archived", name: "Archived", status: "paused" }
  ];
  vault.courseGroups = [
    makeCourse("course_active", "student_active"),
    makeCourse("course_transition", "student_transition"),
    makeCourse("course_paused", "student_archived", "paused")
  ];
  vault.lessons = [
    makeLesson("lesson_active", "course_active", "student_active"),
    makeLesson("lesson_transition", "course_transition", "student_transition"),
    makeLesson("lesson_paused", "course_paused", "student_archived")
  ];
  return vault;
}

describe("student lesson statistics filters", () => {
  it("keeps historical lessons for paused and non-active students in the all-courses scope", () => {
    const vault = makeStatsVault();

    expect(filterStudentStatsLessons(vault, defaultFilters).map((lesson) => lesson.id)).toEqual([
      "lesson_active",
      "lesson_transition",
      "lesson_paused"
    ]);
  });

  it("can filter directly to a transition student's historical course", () => {
    const vault = makeStatsVault();

    expect(filterStudentStatsLessons(vault, {
      ...defaultFilters,
      courseFilter: "course_transition"
    }).map((lesson) => lesson.id)).toEqual(["lesson_transition"]);
  });
});

describe("calendar lesson filters", () => {
  it("filters lessons by course type", () => {
    const vault = makeStatsVault();
    vault.lessons = [
      makeLesson("lesson_one_on_one", "course_active", "student_active"),
      {
        ...makeLesson("lesson_class", "course_transition", "student_transition"),
        type: "class"
      }
    ];

    expect(calendarLessonsForDateWithFilters(vault, "2026-07-15", {
      ...defaultCalendarFilters,
      courseTypeFilter: "class"
    }).map((lesson) => lesson.id)).toEqual(["lesson_class"]);
  });
});
