import { describe, expect, it } from "vitest";
import {
  createLessonFeedbackRecord,
  feedbackAttendanceMark,
  lessonFeedbackIndexItem,
  lessonFeedbackPeriodNumber,
  upsertLessonFeedbackIndexItem,
  type LessonFeedbackIndexDocument
} from "@/frontend/lib/lessonFeedback";
import type { Lesson } from "@/shared/types";
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


  it("merges a record into a remote index without dropping other devices' entries", () => {
    const vault = createSampleVault();
    const course = vault.courseGroups[0];
    const mine = lessonFeedbackIndexItem(createLessonFeedbackRecord(vault, course, undefined, "2026-07-31T08:00:00.000Z"));
    // 另一台设备在本机读取索引之后新增的两条反馈。
    const remote: LessonFeedbackIndexDocument = {
      version: 1,
      items: [
        { ...mine, id: "remote_a" },
        { ...mine, id: "remote_b" }
      ],
      updatedAt: "2026-07-31T09:00:00.000Z"
    };

    const merged = upsertLessonFeedbackIndexItem(remote, mine, "2026-07-31T10:00:00.000Z");

    expect(merged.items.map((item) => item.id)).toEqual([mine.id, "remote_a", "remote_b"]);
    expect(merged.updatedAt).toBe("2026-07-31T10:00:00.000Z");
  });

  it("replaces an existing entry in place instead of duplicating it", () => {
    const vault = createSampleVault();
    const course = vault.courseGroups[0];
    const item = lessonFeedbackIndexItem(createLessonFeedbackRecord(vault, course, undefined, "2026-07-31T08:00:00.000Z"));
    const index: LessonFeedbackIndexDocument = {
      version: 1,
      items: [{ ...item, preview: "旧内容" }, { ...item, id: "other" }],
      updatedAt: "2026-07-31T09:00:00.000Z"
    };

    const merged = upsertLessonFeedbackIndexItem(index, { ...item, preview: "新内容" }, "2026-07-31T10:00:00.000Z");

    expect(merged.items).toHaveLength(2);
    expect(merged.items[0].preview).toBe("新内容");
    expect(merged.items.filter((entry) => entry.id === item.id)).toHaveLength(1);
  });
});


// 课次编号只数实际上过的课：停课、取消、待排都不该把编号顶高。
describe("lesson feedback period numbering", () => {
  function lesson(id: string, date: string, status: Lesson["status"]): Lesson {
    return { id, date, startTime: "09:00", status } as Lesson;
  }

  it("counts only completed lessons", () => {
    const lessons = [
      lesson("a", "2026-05-01", "completed"),
      lesson("b", "2026-05-08", "cancelled"),
      lesson("c", "2026-05-15", "completed"),
      lesson("d", "2026-05-22", "makeup_completed")
    ];
    expect(lessonFeedbackPeriodNumber(lessons, lessons[0])).toBe(1);
    expect(lessonFeedbackPeriodNumber(lessons, lessons[2])).toBe(2);
    expect(lessonFeedbackPeriodNumber(lessons, lessons[3])).toBe(3);
  });

  it("skips cancelled and pending lessons instead of inflating the number", () => {
    const lessons = [
      lesson("a", "2026-05-01", "completed"),
      lesson("b", "2026-05-08", "cancelled"),
      lesson("c", "2026-05-15", "scheduled"),
      lesson("d", "2026-05-22", "draft"),
      lesson("e", "2026-05-29", "makeup_pending"),
      lesson("f", "2026-06-05", "completed")
    ];
    // 中间四节没上成，所以 6/5 只是第 2 节实际课。
    expect(lessonFeedbackPeriodNumber(lessons, lessons[5])).toBe(2);
  });

  it("continues from the last taught lesson for a not-yet-completed lesson", () => {
    const lessons = [
      lesson("a", "2026-05-01", "completed"),
      lesson("b", "2026-05-08", "completed"),
      lesson("c", "2026-05-15", "scheduled")
    ];
    // 今天这节还没标完成，接在已上的 2 节之后。
    expect(lessonFeedbackPeriodNumber(lessons, lessons[2])).toBe(3);
  });

  it("ignores later lessons when numbering a back-filled one", () => {
    const lessons = [
      lesson("a", "2026-05-01", "completed"),
      lesson("b", "2026-05-08", "scheduled"),
      lesson("c", "2026-05-15", "completed")
    ];
    // 补写 5/8 的反馈时，只数它之前上过的课，不受 5/15 影响。
    expect(lessonFeedbackPeriodNumber(lessons, lessons[1])).toBe(2);
  });

  it("numbers a brand-new lesson after every taught one", () => {
    const lessons = [
      lesson("a", "2026-05-01", "completed"),
      lesson("b", "2026-05-08", "completed"),
      lesson("c", "2026-05-15", "cancelled")
    ];
    expect(lessonFeedbackPeriodNumber(lessons)).toBe(3);
    expect(lessonFeedbackPeriodNumber([])).toBe(1);
  });
});