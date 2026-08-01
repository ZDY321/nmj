import { describe, expect, it } from "vitest";
import { nearestStrokeId, pointToSegment, strokeDistance } from "@/frontend/lib/lessonFeedbackHitTest";
import type { LessonFeedbackStroke, LessonFeedbackStrokeTool } from "@/frontend/lib/lessonFeedback";

function stroke(tool: LessonFeedbackStrokeTool, points: Array<[number, number]>, id = "s1"): LessonFeedbackStroke {
  return { id, tool, color: "#d92d20", width: 3, points: points.map(([x, y]) => ({ x, y })) };
}

describe("annotation hit testing", () => {
  it("measures distance to a segment, not just its endpoints", () => {
    // 线段中点正上方 5px：只比端点会算出 ~50，按轮廓算才是 5。
    expect(pointToSegment({ x: 50, y: 5 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(5);
    expect(pointToSegment({ x: -10, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(10);
  });

  it("hits a line along its middle", () => {
    const line = stroke("line", [[100, 100], [300, 100]]);
    expect(strokeDistance(line, { x: 200, y: 103 })).toBeCloseTo(3, 5);
    expect(nearestStrokeId([line], { x: 200, y: 103 })).toBe("s1");
  });

  it("hits a rectangle on any edge but not through its hollow middle", () => {
    const rect = stroke("rect", [[100, 100], [300, 200]]);
    expect(nearestStrokeId([rect], { x: 200, y: 101 })).toBe("s1");
    expect(nearestStrokeId([rect], { x: 299, y: 150 })).toBe("s1");
    // 方框只描边不填充，正中央不该命中。
    expect(nearestStrokeId([rect], { x: 200, y: 150 })).toBe("");
  });

  it("hits an ellipse on its rim rather than its centre", () => {
    const ellipse = stroke("ellipse", [[100, 100], [300, 200]]);
    expect(nearestStrokeId([ellipse], { x: 300, y: 150 })).toBe("s1");
    expect(nearestStrokeId([ellipse], { x: 200, y: 100 })).toBe("s1");
    expect(nearestStrokeId([ellipse], { x: 200, y: 150 })).toBe("");
  });

  it("hits freehand strokes between recorded points", () => {
    const pen = stroke("pen", [[0, 0], [100, 0], [100, 100]]);
    expect(nearestStrokeId([pen], { x: 50, y: 4 })).toBe("s1");
    expect(nearestStrokeId([pen], { x: 104, y: 50 })).toBe("s1");
  });

  it("returns nothing when the click is far from every shape", () => {
    const line = stroke("line", [[0, 0], [100, 0]]);
    expect(nearestStrokeId([line], { x: 50, y: 400 })).toBe("");
    expect(nearestStrokeId([], { x: 0, y: 0 })).toBe("");
  });

  it("prefers the closest shape when several overlap", () => {
    const far = stroke("line", [[0, 0], [100, 0]], "far");
    const near = stroke("line", [[0, 40], [100, 40]], "near");
    expect(nearestStrokeId([far, near], { x: 50, y: 38 })).toBe("near");
  });
});
