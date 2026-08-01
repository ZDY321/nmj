import { describe, expect, it } from "vitest";
import {
  feedbackBraceGeometry,
  feedbackBracePath,
  feedbackFormatDate,
  feedbackMarkColor,
  feedbackSheetLayout,
  feedbackStudentRowCenter,
  feedbackTextUnits,
  feedbackWrapText,
  feedbackWrappedTextLayout
} from "@/frontend/lib/lessonFeedbackLayout";
import type { LessonFeedbackRecord, LessonFeedbackTextBox } from "@/frontend/lib/lessonFeedback";

describe("lesson feedback sheet layout", () => {
  it("reproduces the legacy geometry constants", () => {
    const layout = feedbackSheetLayout(8);

    expect(layout.width).toBe(794);
    expect(layout.marginX).toBe(42);
    expect(layout.contentWidth).toBe(710);
    expect(layout.cols).toEqual([42, 118, 174, 250, 322, 394, 466, 752]);
    expect(layout.metaXs).toEqual([42, 92, 184, 236, 336, 382, 502, 550, 752]);
    expect(layout.rubricXs).toEqual([42, 122, 332, 542, 752]);
    expect(layout.studentStartY).toBe(298);
    expect(layout.studentRowHeight).toBe(32);
  });

  it("keeps at least twelve student slots so short classes still fill the sheet", () => {
    expect(feedbackSheetLayout(3).studentSlots).toBe(12);
    expect(feedbackSheetLayout(12).studentSlots).toBe(12);
    expect(feedbackSheetLayout(18).studentSlots).toBe(18);
  });

  it("grows the page only once the sheet outgrows A4", () => {
    expect(feedbackSheetLayout(8).height).toBe(1123);
    const tall = feedbackSheetLayout(30);
    expect(tall.height).toBe(tall.bottom + 38);
    expect(tall.height).toBeGreaterThan(1123);
  });

  // 折行必须与旧项目逐字一致，否则同一段评语在新旧导出图里断行位置会不同。
  it("wraps text exactly like the legacy sheet renderer", () => {
    expect(feedbackWrapText("注意力集中\n无走神或讲闲话等现象", 9.5)).toEqual([
      "注意力集中",
      "无走神或讲闲话等现",
      "象"
    ]);
    expect(feedbackWrapText("课堂参与度高\n积极回答问题、主动反馈", 9.5)).toEqual([
      "课堂参与度高",
      "积极回答问题、主动",
      "反馈"
    ]);
    expect(feedbackWrapText("Hello World 混合ABC中文测试", 8)).toEqual([
      "Hello World 混",
      "合ABC中文测试"
    ]);
    expect(feedbackWrapText("完成且没有错误", 9.5)).toEqual(["完成且没有错误"]);
    expect(feedbackWrapText("", 5)).toEqual([""]);
  });

  it("counts half-width characters as 0.56 of a CJK glyph", () => {
    expect(feedbackTextUnits("中文")).toBe(2);
    expect(feedbackTextUnits("ab")).toBeCloseTo(1.12, 5);
  });

  it("truncates overflowing cell text with an ellipsis", () => {
    // 评语列宽 286、行高 32，一行约放 25 个汉字；超出部分截断并以省略号收尾。
    const long = "这是一段远超单行容量的评语内容".repeat(3);
    const layout = feedbackWrappedTextLayout(long, 466, 300, 286, 32, { size: 11.5, padding: 5 });
    expect(layout).not.toBeNull();
    expect(layout!.lines).toHaveLength(1);
    expect(layout!.lines[0].endsWith("…")).toBe(true);
  });

  it("keeps text that fits untouched", () => {
    const layout = feedbackWrappedTextLayout("表现稳定", 466, 300, 286, 32, { size: 11.5, padding: 5 });
    expect(layout!.lines).toEqual(["表现稳定"]);
  });

  it("returns no layout for empty text so blank cells stay blank", () => {
    expect(feedbackWrappedTextLayout("", 0, 0, 100, 30)).toBeNull();
  });

  it("formats dates the way the legacy sheet prints them", () => {
    expect(feedbackFormatDate("2026-07-30")).toBe("2026.7.30");
    expect(feedbackFormatDate("")).toBe("未填写日期");
  });

  it("colours marks by grade", () => {
    expect(feedbackMarkColor("A")).toBe("#14795d");
    expect(feedbackMarkColor("√")).toBe("#14795d");
    expect(feedbackMarkColor("C")).toBe("#bd3029");
    expect(feedbackMarkColor("")).toBe("#1f2523");
  });
});

describe("lesson feedback brace geometry", () => {
  const box: LessonFeedbackTextBox = {
    id: "box_1",
    x: 536,
    y: 320,
    width: 190,
    height: 96,
    text: "",
    color: "#235f58",
    borderColor: "#235f58",
    backgroundColor: "transparent",
    fontSize: 12,
    fontWeight: 700,
    studentIds: ["s2", "s4"]
  } as LessonFeedbackTextBox;

  const record: Pick<LessonFeedbackRecord, "students"> = {
    students: [
      { id: "s1", name: "一" },
      { id: "s2", name: "二" },
      { id: "s3", name: "三" },
      { id: "s4", name: "四" }
    ]
  };

  it("fans finger dots 34px left of the tip and anchors the tip on the box edge", () => {
    const layout = feedbackSheetLayout(4);
    const geo = feedbackBraceGeometry(box, record, layout)!;

    expect(geo.tip).toEqual({ x: 536, y: 368 });
    expect(geo.nodes.map((node) => node.x)).toEqual([502, 502]);
    expect(geo.nodes.map((node) => node.y)).toEqual([
      feedbackStudentRowCenter(layout, 1),
      feedbackStudentRowCenter(layout, 3)
    ]);
  });

  it("drops students that no longer exist and yields nothing when none remain", () => {
    const layout = feedbackSheetLayout(4);
    const partial = { ...box, studentIds: ["s2", "ghost"] };
    expect(feedbackBraceGeometry(partial, record, layout)!.nodes).toHaveLength(1);

    const missing = { ...box, studentIds: ["ghost"] };
    expect(feedbackBraceGeometry(missing, record, layout)).toBeNull();
    expect(feedbackBraceGeometry({ ...box, studentIds: [] }, record, layout)).toBeNull();
  });

  it("bows each branch horizontally before converging on the tip", () => {
    expect(feedbackBracePath({ x: 502, y: 330 }, { x: 536, y: 368 })).toBe("M 502 330 Q 519 330 536 368");
  });

  // 屏幕与导出此前各算各的连线（起点相差 248px），导出图里的括号因此错位。
  // 两侧现在都只能从这里取几何，这条测试锁住该约定。
  it("gives screen and export the same anchors for one record", () => {
    const layout = feedbackSheetLayout(4);
    const first = feedbackBraceGeometry(box, record, layout)!;
    const second = feedbackBraceGeometry(box, record, layout)!;

    expect(second.tip).toEqual(first.tip);
    expect(second.nodes).toEqual(first.nodes);
    // 汇聚点贴住文本框左缘，指点落在其左侧固定跨距处。
    expect(first.tip.x).toBe(box.x);
    first.nodes.forEach((node) => expect(box.x - node.x).toBe(34));
  });

  it("keeps finger dots aligned with the rows the export paints", () => {
    const layout = feedbackSheetLayout(4);
    const geo = feedbackBraceGeometry(box, record, layout)!;
    geo.nodes.forEach((node) => {
      const index = record.students.findIndex((student) => student.id === node.id);
      expect(node.y).toBe(feedbackStudentRowCenter(layout, index));
    });
  });
});
