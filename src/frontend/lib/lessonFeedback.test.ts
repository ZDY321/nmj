import { describe, expect, it } from "vitest";
import { createLessonFeedbackRecord, feedbackAttendanceMark, lessonFeedbackIndexItem } from "@/frontend/lib/lessonFeedback";
import { createSampleVault } from "@/frontend/lib/sampleData";

describe("lesson feedback model", () => {
  it("builds a feedback snapshot from an existing lesson", () => {
    const vault = createSampleVault();
    const course = vault.courseGroups.find((item) => item.id === "course_class_math")!;
    const lesson = vault.lessons.find((item) => item.id === "lesson_20260509_class")!;

    const record = createLessonFeedbackRecord(vault, course, lesson, "2026-07-31T08:00:00.000Z");

    expect(record.courseGroupId).toBe(course.id);
    expect(record.lessonId).toBe(lesson.id);
    expect(record.students.map((student) => student.id)).toEqual(lesson.expectedStudentIds);
    expect(record.entries.student_b.attendance).toBe("√");
    expect(record.entries.student_c.attendance).toBe("○");
    expect(record.content).toBe(lesson.content.taught);
    expect(record.homework).toBe(lesson.content.homework);
  });

  it("keeps index metadata independent from later record edits", () => {
    const vault = createSampleVault();
    const course = vault.courseGroups[0];
    const record = createLessonFeedbackRecord(vault, course, undefined, "2026-07-31T08:00:00.000Z");
    const item = lessonFeedbackIndexItem(record);

    record.students[0].name = "Changed";

    expect(item.studentNames).toEqual(["学生 A"]);
    expect(item.preview).toBe("");
  });

  it("maps payroll attendance into feedback-only marks", () => {
    expect(feedbackAttendanceMark("attended")).toBe("√");
    expect(feedbackAttendanceMark("leave_requested")).toBe("○");
    expect(feedbackAttendanceMark("absent")).toBe("×");
  });
});
