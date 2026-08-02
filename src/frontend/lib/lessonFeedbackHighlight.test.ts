import { describe, expect, it } from "vitest";
import { feedbackHighlightRects, feedbackTextBoxContentRect } from "@/frontend/lib/lessonFeedbackLayout";

// 固定 10px/字的测量函数：可用宽度 100-8*2=84 → 每行 8 个字符，便于精确断言。
const measure = (value: string) => value.length * 10;
const box = { x: 0, y: 0, width: 100, height: 200 };
const options = {
  size: 10,
  padding: 8,
  valign: "top" as const,
  maxLines: Infinity,
  ellipsis: false,
  measure
};

describe("highlight rectangles", () => {
  it("covers exactly the selected characters on one line", () => {
    const rects = feedbackHighlightRects("abcdefg", [{ start: 2, end: 5, color: "yellow" }], box, options);

    expect(rects).toHaveLength(1);
    // 前两个字符 20px，选中三个字符 30px。
    expect(rects[0].x).toBe(8 + 20);
    expect(rects[0].width).toBe(30);
    expect(rects[0].color).toBe("yellow");
  });

  it("splits a selection that spans a wrapped line into one rect per line", () => {
    // 16 个字符 → 每行 8 个，折成两行；选中第 6-11 个跨越折行处。
    const rects = feedbackHighlightRects("abcdefghijklmnop", [{ start: 6, end: 11, color: "y" }], box, options);

    expect(rects).toHaveLength(2);
    // 第一行尾部两个字符。
    expect(rects[0].width).toBe(20);
    // 第二行开头三个字符，紧贴左内边距。
    expect(rects[1].x).toBe(8);
    expect(rects[1].width).toBe(30);
    // 第二行必须比第一行低一个行高。
    expect(rects[1].y).toBeGreaterThan(rects[0].y);
  });

  it("keeps indices aligned across explicit newlines", () => {
    // "ab\ncd"：换行符占一个下标，cd 是第 3、4 个字符。
    const rects = feedbackHighlightRects("ab\ncd", [{ start: 3, end: 5, color: "y" }], box, options);

    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBe(8);
    expect(rects[0].width).toBe(20);
  });

  it("supports several highlights at once", () => {
    const rects = feedbackHighlightRects(
      "abcdefg",
      [{ start: 0, end: 2, color: "y" }, { start: 4, end: 6, color: "g" }],
      box,
      options
    );

    expect(rects.map((rect) => rect.color)).toEqual(["y", "g"]);
    expect(rects[0].x).toBe(8);
    expect(rects[1].x).toBe(8 + 40);
  });

  it("ignores ranges that fall outside the text or are empty", () => {
    expect(feedbackHighlightRects("abc", [{ start: 5, end: 9, color: "y" }], box, options)).toEqual([]);
    expect(feedbackHighlightRects("abc", [{ start: 2, end: 2, color: "y" }], box, options)).toEqual([]);
    expect(feedbackHighlightRects("", [{ start: 0, end: 2, color: "y" }], box, options)).toEqual([]);
    expect(feedbackHighlightRects("abc", [], box, options)).toEqual([]);
  });

  it("clips a range that runs past the end of the text", () => {
    const rects = feedbackHighlightRects("abc", [{ start: 1, end: 99, color: "y" }], box, options);

    expect(rects).toHaveLength(1);
    // 只覆盖实际存在的 bc 两个字符，不会画出文字之外。
    expect(rects[0].width).toBe(20);
  });
});

// 网页上 textarea 是 border-box 且铺满文本框，边框会吃掉可用宽度。
// 导出必须扣掉同样的量，否则每行能放的字数不同、折行位置错开，荧光就会标到别的字上。
describe("text box content rect", () => {
  const box = { x: 100, y: 50, width: 200, height: 90 };

  it("subtracts the border on all four sides", () => {
    const rect = feedbackTextBoxContentRect({ ...box, borderStyle: "dashed", borderWidth: 1.5 });

    expect(rect.x).toBe(101.5);
    expect(rect.y).toBe(51.5);
    expect(rect.width).toBe(197);
    expect(rect.height).toBe(87);
  });

  it("uses the full box when the border is switched off", () => {
    const rect = feedbackTextBoxContentRect({ ...box, borderStyle: "none", borderWidth: 3 });

    expect(rect).toEqual({ x: 100, y: 50, width: 200, height: 90 });
  });

  it("tracks a thicker border so wrapping stays in step", () => {
    const thin = feedbackTextBoxContentRect({ ...box, borderStyle: "solid", borderWidth: 1 });
    const thick = feedbackTextBoxContentRect({ ...box, borderStyle: "solid", borderWidth: 4 });

    expect(thin.width - thick.width).toBe(6);
  });

  it("defaults to the dashed 1.5px border used by new boxes", () => {
    expect(feedbackTextBoxContentRect(box).width).toBe(197);
  });

  it("never collapses below one pixel on a tiny box", () => {
    const rect = feedbackTextBoxContentRect({ x: 0, y: 0, width: 2, height: 2, borderWidth: 10 });

    expect(rect.width).toBeGreaterThanOrEqual(1);
    expect(rect.height).toBeGreaterThanOrEqual(1);
  });

  it("shifts highlight rects by the border inset", () => {
    const measure = (value: string) => value.length * 10;
    const options = { size: 10, paddingX: 3, paddingY: 2, valign: "top" as const, maxLines: Infinity, ellipsis: false, measure };
    const content = feedbackTextBoxContentRect({ ...box, borderWidth: 2 });
    const rects = feedbackHighlightRects("abcd", [{ start: 0, end: 2, color: "y" }], content, options);

    // 内容区左缘 102 + 左内边距 3。
    expect(rects[0].x).toBe(105);
  });
});
