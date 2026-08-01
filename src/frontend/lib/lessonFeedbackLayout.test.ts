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

  // 文本框改用真实测量折行，导出断行才能与网页 textarea 一致。
  it("wraps by measured width when a measure function is supplied", () => {
    // 每个字符固定 10px 宽，可用宽度 (100 - 8*2) = 84 → 每行 8 个字符。
    const measure = (value: string) => value.length * 10;
    const layout = feedbackWrappedTextLayout("abcdefghijklmnop", 0, 0, 100, 200, {
      size: 12,
      padding: 8,
      maxLines: Infinity,
      ellipsis: false,
      measure
    });
    expect(layout!.lines).toEqual(["abcdefgh", "ijklmnop"]);
  });

  it("honours explicit newlines when measuring", () => {
    const measure = (value: string) => value.length * 10;
    const layout = feedbackWrappedTextLayout("ab\ncd", 0, 0, 100, 200, {
      padding: 8,
      maxLines: Infinity,
      ellipsis: false,
      measure
    });
    expect(layout!.lines).toEqual(["ab", "cd"]);
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

  it("anchors the tip on the box and parks student dots beside the comment column", () => {
    const layout = feedbackSheetLayout(4);
    const geo = feedbackBraceGeometry(box, record, layout)!;

    expect(geo.tip).toEqual({ x: 536, y: 368 });
    // 学生侧触点留在“课堂笔记”列内，自列心右移半个字：既不盖评分，也不贴文本框。
    const expectedX = (layout.cols[5] + layout.cols[6]) / 2 + 6;
    expect(geo.nodes.map((node) => node.x)).toEqual([expectedX, expectedX]);
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
    // 汇聚点贴住文本框左缘；触点则以表格列为基准，二者互不牵动。
    expect(first.tip.x).toBe(box.x);
    const columnCentre = (layout.cols[5] + layout.cols[6]) / 2;
    first.nodes.forEach((node) => {
      expect(node.x - columnCentre).toBe(6);
      // 必须仍在课堂笔记列内，不能溢到评语列。
      expect(node.x).toBeLessThan(layout.cols[6]);
    });
  });

  it("keeps finger dots aligned with the rows the export paints", () => {
    const layout = feedbackSheetLayout(4);
    const geo = feedbackBraceGeometry(box, record, layout)!;
    geo.nodes.forEach((node) => {
      const index = record.students.findIndex((student) => student.id === node.id);
      expect(node.y).toBe(feedbackStudentRowCenter(layout, index));
    });
  });

  // 学生侧每个触点独立：移动其中一个，其他学生与汇聚点都不能跟着动。
  it("moves one student's dot without disturbing the others or the tip", () => {
    const layout = feedbackSheetLayout(4);
    const base = feedbackBraceGeometry(box, record, layout)!;
    const moved = feedbackBraceGeometry({ ...box, braceNodes: { s2: { dx: -18, dy: 7 } } }, record, layout)!;

    expect(moved.tip).toEqual(base.tip);
    expect(moved.nodes[0].x).toBe(base.nodes[0].x - 18);
    expect(moved.nodes[0].y).toBe(base.nodes[0].y + 7);
    // 第二个学生没被拖过，必须停在原处。
    expect(moved.nodes[1]).toEqual(base.nodes[1]);
  });

  it("keeps every student's dot independent of the others", () => {
    const layout = feedbackSheetLayout(4);
    const base = feedbackBraceGeometry(box, record, layout)!;
    const moved = feedbackBraceGeometry(
      { ...box, braceNodes: { s2: { dx: -10, dy: 0 }, s4: { dx: 6, dy: -4 } } },
      record,
      layout
    )!;

    expect(moved.nodes[0].x).toBe(base.nodes[0].x - 10);
    expect(moved.nodes[1].x).toBe(base.nodes[1].x + 6);
    expect(moved.nodes[1].y).toBe(base.nodes[1].y - 4);
  });

  // 汇聚点与文本框一体，纵向位置可由 braceTipDy 指定。
  it("keeps the tip on the box's left edge, centred by default", () => {
    const layout = feedbackSheetLayout(4);
    const geo = feedbackBraceGeometry(box, record, layout)!;

    expect(geo.tip).toEqual({ x: box.x, y: box.y + box.height / 2 });
  });

  // 单人反馈时汇聚点与该学生同高，连线才是水平直线而不是斜线。
  it("draws a level line for a single student when the tip aligns to that row", () => {
    const layout = feedbackSheetLayout(4);
    const rowCentre = feedbackStudentRowCenter(layout, 1);
    const single = { ...box, studentIds: ["s2"], braceTipDy: rowCentre - box.y };
    const geo = feedbackBraceGeometry(single, record, layout)!;

    expect(geo.nodes).toHaveLength(1);
    expect(geo.tip.y).toBe(rowCentre);
    expect(geo.nodes[0].y).toBe(geo.tip.y);
  });

  it("centres the tip across the spanned rows for a group", () => {
    const layout = feedbackSheetLayout(4);
    // 选中第 2、4 行时，汇聚点应落在两行中点之间。
    const midway = (feedbackStudentRowCenter(layout, 1) + feedbackStudentRowCenter(layout, 3)) / 2;
    const group = { ...box, braceTipDy: midway - box.y };
    const geo = feedbackBraceGeometry(group, record, layout)!;

    expect(geo.tip.y).toBe(midway);
    expect(geo.nodes[0].y).toBeLessThan(geo.tip.y);
    expect(geo.nodes[1].y).toBeGreaterThan(geo.tip.y);
  });

  it("carries the tip along when the box moves, leaving student dots put", () => {
    const layout = feedbackSheetLayout(4);
    const base = feedbackBraceGeometry(box, record, layout)!;
    const shifted = feedbackBraceGeometry({ ...box, x: box.x + 60, y: box.y + 30 }, record, layout)!;

    // 汇聚点跟着框走……
    expect(shifted.tip.x).toBe(box.x + 60);
    expect(shifted.tip.y).toBe(base.tip.y + 30);
    // ……学生侧触点不受文本框位置影响。
    expect(shifted.nodes).toEqual(base.nodes);
  });
});
