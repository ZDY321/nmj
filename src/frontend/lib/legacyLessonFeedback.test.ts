import { describe, expect, it } from "vitest";
import { convertLegacyFeedbackRecords, parseLegacyFeedbackJson, suggestLegacyCourseMappings } from "./legacyLessonFeedback";
import type { TeacherVault } from "@/shared/types";

const vault: TeacherVault = {
  version: 1,
  profile: { displayName: "李老师", baseSalary: 0, currency: "CNY", obligationDeductionMode: "auto_gap", monthlyObligationHours: 0, obligationHourlyDeduction: 0, manualObligationDeduction: 0 },
  campuses: [{ id: "campus", name: "中心校区" }],
  students: [{ id: "student-current", name: "小林", grade: "五年级", status: "active" }],
  courseGroups: [{ id: "course-current", name: "五年级语文班", type: "class", subject: "语文", defaultCampusId: "campus", studentIds: ["student-current"], feeRule: { mode: "fixed", fixedFee: 100 }, status: "active" }],
  scheduleRules: [],
  lessons: [{ id: "lesson-current", date: "2026-07-31", startTime: "18:30", endTime: "20:00", courseGroupId: "course-current", type: "class", status: "completed", expectedStudentIds: ["student-current"], attendance: [{ studentId: "student-current", status: "attended" }], feeSnapshot: { amount: 100 }, content: { taught: "", homework: "", nextLessonReminder: "" } }],
  salaryAdjustments: [],
  notice: { title: "", content: "", enabled: false, updatedAt: "" }
};

const legacyJson = JSON.stringify({
  version: 4,
  classes: [{ id: "old-class", name: "五年级语文班", grade: "五年级", campus: "旧校区", subject: "语文", teacher: "王老师", students: [{ id: "old-student", name: "小林" }, { id: "missing-student", name: "小周" }] }],
  lessons: [{ id: "old-lesson", classId: "old-class", className: "五年级语文班", subject: "语文", teacher: "王老师", date: "2026-07-31", period: "8", content: "阅读理解", homework: "练习册", generalNotes: "复习", students: [{ id: "old-student", name: "小林" }, { id: "missing-student", name: "小周" }], entries: { "old-student": { attendance: "√", homework: "A", listening: "A", participation: "B", notes: "A", comment: "认真" } }, annotations: [{ id: "stroke", tool: "arrow", color: "#f00", width: 3, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }], textBoxes: [{ id: "box", x: 470, y: 300, width: 270, height: 100, text: "共同反馈", braceColor: "#235f58", braceStudentIds: ["old-student", "missing-student"], band: true }], createdAt: "2026-07-31T10:00:00Z", updatedAt: "2026-07-31T11:00:00Z" }]
});

describe("legacy feedback import", () => {
  it("parses the original classes and lessons format", () => {
    const data = parseLegacyFeedbackJson(legacyJson);
    expect(data.classes).toHaveLength(1);
    expect(data.lessons[0].textBoxes).toHaveLength(1);
  });

  it("suggests exact course mappings", () => {
    const data = parseLegacyFeedbackJson(legacyJson);
    expect(suggestLegacyCourseMappings(vault, data)).toEqual({ "old-class": "course-current" });
  });

  it("preserves feedback visuals and maps known students to the current archive", () => {
    const data = parseLegacyFeedbackJson(legacyJson);
    const result = convertLegacyFeedbackRecords(vault, data, { "old-class": "course-current" });
    const record = result.records[0];
    expect(record.lessonId).toBe("lesson-current");
    expect(record.students[0].id).toBe("student-current");
    expect(record.students[1].id).toMatch(/^legacy_student_/);
    expect(record.textBoxes[0].studentIds).toEqual(["student-current", record.students[1].id]);
    expect(record.textBoxes[0].showBand).toBe(true);
    expect(record.annotations[0].tool).toBe("arrow");
    expect(record.legacySourceId).toBe("old-lesson");
    expect(result.unmatchedStudentCount).toBe(1);
  });
});
