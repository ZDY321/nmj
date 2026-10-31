import { describe, expect, it } from "vitest";
import {
  composeLessonContentField,
  feedbackLessonFieldDisplayIndex,
  feedbackLessonFieldStoredIndex,
  feedbackLessonFieldText,
  lessonContentFieldNotes,
  removeLessonChecklistItem,
  restoreFeedbackLessonFieldHeading,
  syncLessonChecklistContent,
  updateLessonContentField,
  updateLessonContentFromFeedback
} from "@/frontend/lib/lessonContent";
import type { LessonContent, ProgressChecklistTemplate } from "@/shared/types";

const templates: ProgressChecklistTemplate[] = [{
  id: "template_a",
  name: "物理清单",
  items: [
    { id: "item_a", chapter: "第一章", title: "力的概念", order: 1 },
    { id: "item_b", chapter: "第一章", title: "力的测量", order: 2 }
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
}];

const legacyContent: LessonContent = {
  taught: "课堂自定义笔记",
  homework: "作业自定义笔记",
  nextLessonReminder: "",
  checklistTemplateId: "template_a",
  taughtChecklistItemIds: ["item_a"],
  homeworkChecklistItemIds: ["item_b"]
};

describe("lesson content checklist integration", () => {
  it("hides checklist labels in feedback text while preserving editable synchronization", () => {
    const stored = "课堂补充\n\n【关联学习清单·本节课内容】\n- 一次函数";
    const displayed = feedbackLessonFieldText(stored, "taught");
    const edited = displayed.replace("课堂补充", "课堂重点");
    const restored = restoreFeedbackLessonFieldHeading(edited, stored, "taught");

    expect(displayed).toBe("课堂补充\n\n- 一次函数");
    expect(restored).toBe("课堂重点\n\n【关联学习清单·本节课内容】\n- 一次函数");
    const displayedItemIndex = displayed.indexOf("- 一次函数");
    expect(feedbackLessonFieldDisplayIndex(restored, "taught", restored.indexOf("- 一次函数"))).toBe(displayedItemIndex);
    expect(feedbackLessonFieldStoredIndex(restored, "taught", displayedItemIndex)).toBe(restored.indexOf("- 一次函数"));
  });

  it("keeps legacy notes editable while adding linked items to feedback-compatible text", () => {
    const synced = syncLessonChecklistContent(legacyContent, templates);

    expect(lessonContentFieldNotes(synced, "taught")).toBe("课堂自定义笔记");
    expect(lessonContentFieldNotes(synced, "homework")).toBe("作业自定义笔记");
    expect(synced.taught).toContain("课堂自定义笔记");
    expect(synced.taught).toContain("力的概念");
    expect(synced.homework).toContain("作业自定义笔记");
    expect(synced.homework).toContain("力的测量");
  });

  it("regenerates linked text once when a teacher edits their own notes", () => {
    const synced = syncLessonChecklistContent(legacyContent, templates);
    const updated = updateLessonContentField(synced, templates, "taught", "补充课堂例题");

    expect(updated.taught).toContain("补充课堂例题");
    expect(updated.taught.match(/力的概念/g)).toHaveLength(1);
    expect(lessonContentFieldNotes(updated, "taught")).toBe("补充课堂例题");
  });

  it("preserves checklist links when feedback edits sync back to the lesson", () => {
    const feedbackContent = composeLessonContentField(legacyContent, templates, "taught", "反馈中更新的内容");
    const feedbackHomework = composeLessonContentField(legacyContent, templates, "homework", "反馈中更新的作业");
    const updated = updateLessonContentFromFeedback(legacyContent, templates, {
      taught: feedbackContent,
      homework: feedbackHomework
    });

    expect(lessonContentFieldNotes(updated, "taught")).toBe("反馈中更新的内容");
    expect(lessonContentFieldNotes(updated, "homework")).toBe("反馈中更新的作业");
    expect(updated.taught).toContain("力的概念");
    expect(updated.homework).toContain("力的测量");
  });

  it("removes a linked item from the generated feedback text without dropping notes", () => {
    const synced = syncLessonChecklistContent(legacyContent, templates);
    const updated = removeLessonChecklistItem(synced, templates, "taught", "item_a");

    expect(updated.taught).toBe("课堂自定义笔记");
    expect(updated.taughtChecklistItemIds).toEqual([]);
    expect(updated.homework).toContain("力的测量");
  });
});
