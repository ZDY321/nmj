// 图形命中检测：按轮廓而非顶点判定，直线中段、方框边、圆周都能点中。
import type { LessonFeedbackPoint, LessonFeedbackStroke } from "@/frontend/lib/lessonFeedback";

export function strokeDistance(stroke: LessonFeedbackStroke, point: LessonFeedbackPoint): number {
  const first = stroke.points[0];
  if (!first) return Infinity;
  const last = stroke.points.at(-1) ?? first;

  if (stroke.tool === "line" || stroke.tool === "arrow") {
    return pointToSegment(point, first, last);
  }
  if (stroke.tool === "rect") {
    const left = Math.min(first.x, last.x);
    const right = Math.max(first.x, last.x);
    const top = Math.min(first.y, last.y);
    const bottom = Math.max(first.y, last.y);
    return Math.min(
      pointToSegment(point, { x: left, y: top }, { x: right, y: top }),
      pointToSegment(point, { x: right, y: top }, { x: right, y: bottom }),
      pointToSegment(point, { x: right, y: bottom }, { x: left, y: bottom }),
      pointToSegment(point, { x: left, y: bottom }, { x: left, y: top })
    );
  }
  if (stroke.tool === "ellipse") {
    const cx = (first.x + last.x) / 2;
    const cy = (first.y + last.y) / 2;
    const rx = Math.abs(last.x - first.x) / 2;
    const ry = Math.abs(last.y - first.y) / 2;
    if (rx < 1 || ry < 1) return Math.hypot(point.x - cx, point.y - cy);
    // 归一化到单位圆，估算到椭圆周的距离。
    const nx = (point.x - cx) / rx;
    const ny = (point.y - cy) / ry;
    const norm = Math.hypot(nx, ny);
    if (norm === 0) return Math.min(rx, ry);
    return Math.abs(norm - 1) * Math.min(rx, ry);
  }
  // 自由笔迹：逐段折线求最近距离。
  let best = Infinity;
  for (let index = 1; index < stroke.points.length; index += 1) {
    best = Math.min(best, pointToSegment(point, stroke.points[index - 1], stroke.points[index]));
  }
  return stroke.points.length === 1 ? Math.hypot(first.x - point.x, first.y - point.y) : best;
}

export function pointToSegment(point: LessonFeedbackPoint, a: LessonFeedbackPoint, b: LessonFeedbackPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

export function nearestStrokeId(strokes: LessonFeedbackStroke[], point: LessonFeedbackPoint, tolerance = 12): string {
  let nearest = "";
  let distance = tolerance;
  strokes.forEach((stroke) => {
    const next = strokeDistance(stroke, point) - stroke.width / 2;
    if (next < distance) {
      distance = next;
      nearest = stroke.id;
    }
  });
  return nearest;
}
