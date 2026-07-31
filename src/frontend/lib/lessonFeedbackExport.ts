import type { LessonFeedbackPoint, LessonFeedbackRecord, LessonFeedbackStroke } from "@/frontend/lib/lessonFeedback";

export const feedbackPageWidth = 794;
export const feedbackStudentRowHeight = 42;
export const feedbackStudentTableTop = 300;

export function feedbackPageHeight(record: Pick<LessonFeedbackRecord, "students" | "textBoxes">): number {
  const tableBottom = feedbackStudentTableTop + 66 + Math.max(record.students.length, 8) * feedbackStudentRowHeight;
  const textBoxBottom = record.textBoxes.reduce((max, box) => Math.max(max, box.y + box.height + 32), 0);
  return Math.max(1123, tableBottom + 250, textBoxBottom);
}

export async function lessonFeedbackPngBlob(record: LessonFeedbackRecord, scale = 2): Promise<Blob> {
  const canvas = renderLessonFeedbackCanvas(record, scale);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("无法生成课后反馈图片。")), "image/png");
  });
}

export function renderLessonFeedbackCanvas(record: LessonFeedbackRecord, scale = 2): HTMLCanvasElement {
  const height = feedbackPageHeight(record);
  const canvas = document.createElement("canvas");
  canvas.width = feedbackPageWidth * scale;
  canvas.height = height * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持图片导出。");
  context.scale(scale, scale);
  context.fillStyle = record.paperColor === "white" ? "#ffffff" : "#fffdf5";
  context.fillRect(0, 0, feedbackPageWidth, height);
  context.strokeStyle = "#c8d2dc";
  context.lineWidth = 1;
  context.strokeRect(24, 24, feedbackPageWidth - 48, height - 48);

  drawHeader(context, record);
  drawContentBlocks(context, record);
  const rowCenters = drawStudentTable(context, record);
  drawFeedbackBandsAndConnectors(context, record, rowCenters);
  drawTextBoxes(context, record);
  record.annotations.forEach((stroke) => drawFeedbackStroke(context, stroke));
  return canvas;
}

function drawHeader(context: CanvasRenderingContext2D, record: LessonFeedbackRecord): void {
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#102a43";
  context.font = "700 28px Microsoft YaHei, sans-serif";
  context.fillText("课堂学习反馈", feedbackPageWidth / 2, 62);
  context.font = "600 13px Microsoft YaHei, sans-serif";
  context.fillStyle = "#52667a";
  context.fillText(`${record.className} · ${record.subject} · ${record.date} · ${record.periodLabel}`, feedbackPageWidth / 2, 94);

  context.textAlign = "left";
  context.font = "600 12px Microsoft YaHei, sans-serif";
  context.fillText(`教师：${record.teacherName || "未设置"}`, 48, 122);
  context.fillText(`校区：${record.campusName || "未设置"}`, 300, 122);
  context.fillText(`时间：${record.startTime && record.endTime ? `${record.startTime}-${record.endTime}` : "未设置"}`, 520, 122);
}

function drawContentBlocks(context: CanvasRenderingContext2D, record: LessonFeedbackRecord): void {
  drawTextBlock(context, 48, 148, 698, 58, "课堂内容", record.content || "未填写");
  drawTextBlock(context, 48, 216, 698, 58, "今日作业", record.homework || "未填写");
}

function drawTextBlock(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string
): void {
  context.fillStyle = "#f6f9fc";
  context.strokeStyle = "#d5dee8";
  context.fillRect(x, y, width, height);
  context.strokeRect(x, y, width, height);
  context.fillStyle = "#1557c2";
  context.font = "700 12px Microsoft YaHei, sans-serif";
  context.fillText(label, x + 12, y + 18);
  context.fillStyle = "#25324a";
  context.font = "500 13px Microsoft YaHei, sans-serif";
  drawWrappedText(context, value, x + 82, y + 12, width - 94, 18, 2);
}

function drawStudentTable(context: CanvasRenderingContext2D, record: LessonFeedbackRecord): Map<string, number> {
  const x = 48;
  const width = 698;
  const columns = [0, 110, 166, 226, 294, 372, 450, 698];
  const headerHeight = 66;
  const rows = Math.max(record.students.length, 8);
  const bottom = feedbackStudentTableTop + headerHeight + rows * feedbackStudentRowHeight;
  const rowCenters = new Map<string, number>();

  context.fillStyle = "#eaf2ff";
  context.fillRect(x, feedbackStudentTableTop, width, headerHeight);
  context.strokeStyle = "#8ba4be";
  context.strokeRect(x, feedbackStudentTableTop, width, bottom - feedbackStudentTableTop);
  columns.slice(1, -1).forEach((column) => line(context, x + column, feedbackStudentTableTop, x + column, bottom));
  line(context, x, feedbackStudentTableTop + headerHeight, x + width, feedbackStudentTableTop + headerHeight);
  for (let index = 1; index <= rows; index += 1) {
    line(context, x, feedbackStudentTableTop + headerHeight + index * feedbackStudentRowHeight, x + width, feedbackStudentTableTop + headerHeight + index * feedbackStudentRowHeight);
  }

  const labels = ["学生", "到课", "作业", "听课表现", "课堂参与", "课堂笔记", "综合评价"];
  context.fillStyle = "#25324a";
  context.font = "700 11px Microsoft YaHei, sans-serif";
  context.textAlign = "center";
  labels.forEach((label, index) => {
    const left = x + columns[index];
    const right = x + columns[index + 1];
    context.fillText(label, (left + right) / 2, feedbackStudentTableTop + headerHeight / 2);
  });

  record.students.forEach((student, index) => {
    const top = feedbackStudentTableTop + headerHeight + index * feedbackStudentRowHeight;
    const centerY = top + feedbackStudentRowHeight / 2;
    rowCenters.set(student.id, centerY);
    const entry = record.entries[student.id];
    context.fillStyle = "#102a43";
    context.font = "600 12px Microsoft YaHei, sans-serif";
    context.fillText(student.name, x + 55, centerY);
    const values = [entry?.attendance, entry?.homework, entry?.listening, entry?.participation, entry?.notes];
    context.font = "700 15px Microsoft YaHei, sans-serif";
    values.forEach((value, fieldIndex) => {
      const left = x + columns[fieldIndex + 1];
      const right = x + columns[fieldIndex + 2];
      context.fillStyle = markColor(value || "");
      context.fillText(value || "", (left + right) / 2, centerY);
    });
    context.textAlign = "left";
    context.fillStyle = "#52667a";
    context.font = "500 10px Microsoft YaHei, sans-serif";
    drawWrappedText(context, entry?.comment || "", x + columns[6] + 6, top + 6, columns[7] - columns[6] - 12, 13, 2);
    context.textAlign = "center";
  });
  context.textAlign = "left";
  return rowCenters;
}

function drawFeedbackBandsAndConnectors(
  context: CanvasRenderingContext2D,
  record: LessonFeedbackRecord,
  rowCenters: Map<string, number>
): void {
  record.textBoxes.forEach((box) => {
    const centers = box.studentIds.map((studentId) => rowCenters.get(studentId)).filter((value): value is number => value != null);
    if (box.showBand && centers.length > 0) {
      const top = Math.min(...centers) - feedbackStudentRowHeight / 2 + 2;
      const bottom = Math.max(...centers) + feedbackStudentRowHeight / 2 - 2;
      context.save();
      context.globalAlpha = 0.09;
      context.fillStyle = box.borderColor;
      context.fillRect(48, top, 698, bottom - top);
      context.restore();
    }
    centers.forEach((centerY) => {
      const targetX = box.x > 397 ? box.x : box.x + box.width;
      const targetY = Math.max(box.y + 18, Math.min(centerY, box.y + box.height - 18));
      context.strokeStyle = box.borderColor;
      context.lineWidth = 1.5;
      line(context, 746, centerY, targetX, targetY);
      context.fillStyle = box.borderColor;
      context.beginPath();
      context.arc(746, centerY, 2.5, 0, Math.PI * 2);
      context.fill();
    });
  });
}

function drawTextBoxes(context: CanvasRenderingContext2D, record: LessonFeedbackRecord): void {
  record.textBoxes.forEach((box) => {
    context.fillStyle = box.backgroundColor;
    context.strokeStyle = box.borderColor;
    context.lineWidth = 1.5;
    context.fillRect(box.x, box.y, box.width, box.height);
    context.strokeRect(box.x, box.y, box.width, box.height);
    context.fillStyle = box.color;
    context.font = `${box.fontWeight} ${box.fontSize}px Microsoft YaHei, sans-serif`;
    drawWrappedText(context, box.text, box.x + 8, box.y + 10, box.width - 16, box.fontSize * 1.45, Math.max(1, Math.floor((box.height - 16) / (box.fontSize * 1.45))));
  });
}

export function drawFeedbackStroke(context: CanvasRenderingContext2D, stroke: LessonFeedbackStroke): void {
  if (stroke.points.length === 0) return;
  context.save();
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalAlpha = stroke.tool === "highlighter" ? 0.28 : 1;
  const first = stroke.points[0];
  const last = stroke.points.at(-1) ?? first;
  context.beginPath();
  if (stroke.tool === "pen" || stroke.tool === "highlighter") {
    context.moveTo(first.x, first.y);
    stroke.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    if (stroke.points.length === 1) context.lineTo(first.x + 0.1, first.y + 0.1);
  } else if (stroke.tool === "line" || stroke.tool === "arrow") {
    context.moveTo(first.x, first.y);
    context.lineTo(last.x, last.y);
  } else if (stroke.tool === "rect") {
    context.rect(first.x, first.y, last.x - first.x, last.y - first.y);
  } else if (stroke.tool === "ellipse") {
    context.ellipse((first.x + last.x) / 2, (first.y + last.y) / 2, Math.abs(last.x - first.x) / 2, Math.abs(last.y - first.y) / 2, 0, 0, Math.PI * 2);
  }
  context.stroke();
  if (stroke.tool === "arrow") drawArrowHead(context, first, last, stroke.width);
  context.restore();
}

function drawArrowHead(context: CanvasRenderingContext2D, start: LessonFeedbackPoint, end: LessonFeedbackPoint, width: number): void {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const size = Math.max(10, width * 4);
  context.beginPath();
  context.moveTo(end.x, end.y);
  context.lineTo(end.x - size * Math.cos(angle - Math.PI / 6), end.y - size * Math.sin(angle - Math.PI / 6));
  context.moveTo(end.x, end.y);
  context.lineTo(end.x - size * Math.cos(angle + Math.PI / 6), end.y - size * Math.sin(angle + Math.PI / 6));
  context.stroke();
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
): void {
  const lines: string[] = [];
  String(value || "").split(/\r?\n/).forEach((paragraph) => {
    let line = "";
    Array.from(paragraph).forEach((character) => {
      const candidate = line + character;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = character;
      } else {
        line = candidate;
      }
    });
    lines.push(line);
  });
  lines.slice(0, maxLines).forEach((lineText, index) => context.fillText(lineText, x, y + index * lineHeight));
}

function line(context: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

function markColor(value: string): string {
  if (value === "A" || value === "√") return "#15803d";
  if (value === "B" || value === "○") return "#c2410c";
  if (value === "C" || value === "×") return "#b91c1c";
  return "#25324a";
}
