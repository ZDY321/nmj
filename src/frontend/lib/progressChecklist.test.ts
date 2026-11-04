import { describe, expect, it } from "vitest";
import { checklistCompletionHomeworkStatus, checklistCompletionIsComplete, checklistTemplateGrade, checklistTemplateMatchesContext, groupChecklistCompletionsByDate } from "@/frontend/lib/progressChecklist";
import type { ProgressChecklistCompletion, ProgressChecklistTemplate } from "@/shared/types";

function makeTemplate(patch: Partial<ProgressChecklistTemplate> = {}): ProgressChecklistTemplate {
  return {
    id: "template_1",
    name: "初二物理同步清单",
    subject: "物理",
    items: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch
  };
}

describe("checklist template context matching", () => {
  it("matches the lesson subject and infers a grade from existing template text", () => {
    const template = makeTemplate();

    expect(checklistTemplateGrade(template, ["初一", "初二", "初三"])).toBe("初二");
    expect(checklistTemplateMatchesContext(template, {
      subject: "物理",
      grades: ["初二"],
      gradeOptions: ["初一", "初二", "初三"]
    })).toBe(true);
    expect(checklistTemplateMatchesContext(template, {
      subject: "物理",
      grades: ["初三"],
      gradeOptions: ["初一", "初二", "初三"]
    })).toBe(false);
    expect(checklistTemplateMatchesContext(template, {
      subject: "数学",
      grades: ["初二"],
      gradeOptions: ["初一", "初二", "初三"]
    })).toBe(false);
  });

  it("keeps legacy templates without a detectable grade usable", () => {
    const template = makeTemplate({ name: "力学知识点清单", note: "课堂复习" });

    expect(checklistTemplateGrade(template, ["初一", "初二", "初三"])).toBeUndefined();
    expect(checklistTemplateMatchesContext(template, {
      subject: "物理",
      grades: ["初二"],
      gradeOptions: ["初一", "初二", "初三"]
    })).toBe(true);
  });
});

describe("checklist completion state", () => {
  it("uses three discrete homework states", () => {
    expect(checklistCompletionIsComplete({ source: "taught" })).toBe(true);
    expect(checklistCompletionHomeworkStatus({ source: "homework", homeworkStatus: "not_started" })).toBe("not_started");
    expect(checklistCompletionHomeworkStatus({ source: "homework", homeworkStatus: "partial" })).toBe("partial");
    expect(checklistCompletionHomeworkStatus({ source: "homework", homeworkStatus: "completed" })).toBe("completed");
    expect(checklistCompletionIsComplete({ source: "homework", homeworkStatus: "not_started" })).toBe(false);
    expect(checklistCompletionIsComplete({ source: "homework", homeworkStatus: "partial" })).toBe(false);
    expect(checklistCompletionIsComplete({ source: "homework", homeworkStatus: "completed" })).toBe(true);
  });

  it("maps legacy homework progress to the closest discrete state", () => {
    expect(checklistCompletionHomeworkStatus({ source: "homework" })).toBe("completed");
    expect(checklistCompletionHomeworkStatus({ source: "homework", homeworkProgress: 0 })).toBe("not_started");
    expect(checklistCompletionHomeworkStatus({ source: "homework", homeworkProgress: 45 })).toBe("partial");
    expect(checklistCompletionHomeworkStatus({ source: "homework", homeworkProgress: 100 })).toBe("completed");
  });
});

describe("checklist completion date groups", () => {
  it("shows one matrix marker per date while retaining every record in the group", () => {
    const makeCompletion = (id: string, completedDate: string): ProgressChecklistCompletion => ({
      id,
      templateId: "template_1",
      itemId: "item_1",
      studentId: "student_1",
      courseGroupId: "course_1",
      completedDate,
      updatedAt: `2026-10-${id === "newer" ? "03" : "02"}T00:00:00.000Z`
    });

    const groups = groupChecklistCompletionsByDate([
      makeCompletion("older", "2026-10-02"),
      makeCompletion("newer", "2026-10-02"),
      makeCompletion("next-day", "2026-10-03")
    ]);

    expect(groups.map(({ date }) => date)).toEqual(["2026-10-02", "2026-10-03"]);
    expect(groups[0]?.completions.map(({ id }) => id)).toEqual(["older", "newer"]);
    expect(groups[1]?.completions.map(({ id }) => id)).toEqual(["next-day"]);
  });
});
