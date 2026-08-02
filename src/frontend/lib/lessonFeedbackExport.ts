// 课后反馈导出：按 lessonFeedbackLayout 的坐标把整张表画到 canvas。
//
// 版式对齐旧版反馈项目（app.js 的 renderSheetSvg）：黑框米白纸、双层合并表头、
// 八格信息栏、底部评价量表、空白行虚线引导。几何一律取自 lessonFeedbackLayout，
// 不要在这里另算坐标——编辑器叠层用的是同一份数据，各算各的就会重现“导出与屏幕对不上”。
//
// 旧项目走 SVG 字符串 → Image → drawImage，这里直接用 canvas 绘制：省掉一次图片解码，
// 输出一致但更快。

import {
  feedbackAttendanceLegend,
  feedbackBodyFontFamily,
  feedbackBorderColor,
  feedbackBracePath,
  feedbackBraceGeometry,
  feedbackExportScale,
  feedbackFormatDate,
  feedbackGuideLine,
  feedbackInkColor,
  feedbackMarkColor,
  feedbackPageWidth,
  feedbackPaperWarm,
  feedbackPaperWhite,
  feedbackRubricRows,
  feedbackSheetLayout,
  feedbackSheetTitle,
  feedbackTitleFontFamily,
  feedbackWrappedTextLayout,
  type FeedbackSheetLayout,
  type FeedbackWrappedTextOptions
} from "@/frontend/lib/lessonFeedbackLayout";
import { feedbackTextBoxHighlightRects, feedbackTextBoxLines } from "@/frontend/lib/lessonFeedbackTextMetrics";
import type {
  LessonFeedbackEntry,
  LessonFeedbackFieldKey,
  LessonFeedbackPoint,
  LessonFeedbackRecord,
  LessonFeedbackStroke,
  LessonFeedbackTextBox
} from "@/frontend/lib/lessonFeedback";

export { feedbackPageWidth } from "@/frontend/lib/lessonFeedbackLayout";

export function feedbackPageHeight(record: Pick<LessonFeedbackRecord, "students" | "textBoxes">): number {
  const layout = feedbackSheetLayout(record.students.length);
  const textBoxBottom = record.textBoxes.reduce((max, box) => Math.max(max, box.y + box.height + 32), 0);
  return Math.max(layout.height, textBoxBottom);
}

export async function lessonFeedbackPngBlob(record: LessonFeedbackRecord, scale = feedbackExportScale): Promise<Blob> {
  const canvas = renderLessonFeedbackCanvas(record, scale);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("无法生成课后反馈图片。")), "image/png");
  });
}

export type RenderFeedbackOptions = {
  scale?: number;
  // false 时只画表格骨架与固定文字，留给编辑器把可编辑的值用 DOM 控件叠上去。
  // 骨架与导出图共用同一套坐标，屏幕所见即导出所得。
  includeValues?: boolean;
};

export function renderLessonFeedbackCanvas(
  record: LessonFeedbackRecord,
  options: number | RenderFeedbackOptions = {}
): HTMLCanvasElement {
  const settings = typeof options === "number" ? { scale: options } : options;
  const scale = settings.scale ?? feedbackExportScale;
  const includeValues = settings.includeValues ?? true;
  const layout = feedbackSheetLayout(record.students.length);
  const height = feedbackPageHeight(record);
  const canvas = document.createElement("canvas");
  canvas.width = feedbackPageWidth * scale;
  canvas.height = height * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持图片导出。");
  context.scale(scale, scale);
  context.fillStyle = record.paperColor === "white" ? feedbackPaperWhite : feedbackPaperWarm;
  context.fillRect(0, 0, feedbackPageWidth, height);

  drawSheetTitle(context);
  drawMetaRow(context, record, layout, includeValues);
  drawContentRows(context, record, layout, includeValues);
  drawStudentTable(context, record, layout, includeValues);
  drawRubric(context, record, layout, includeValues);
  drawBands(context, record, layout);
  // 顺序与旧项目一致：色带在最底，括号次之，文本框压在最上，汇聚点因此藏在框沿下。
  drawBraces(context, record, layout);
  if (includeValues) {
    drawTextBoxes(context, record, layout);
    record.annotations.forEach((stroke) => drawFeedbackStroke(context, stroke));
  }
  return canvas;
}

function drawSheetTitle(context: CanvasRenderingContext2D): void {
  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = feedbackInkColor;
  context.font = `600 25px ${feedbackTitleFontFamily}`;
  // canvas 没有 letter-spacing，逐字加间距以还原标题的疏朗感。
  drawTrackedText(context, feedbackSheetTitle, feedbackPageWidth / 2, 43, 2);
  context.restore();
}

function drawTrackedText(
  context: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  tracking: number
): void {
  const characters = Array.from(text);
  const widths = characters.map((character) => context.measureText(character).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + tracking * Math.max(0, characters.length - 1);
  let cursor = centerX - total / 2;
  context.textAlign = "left";
  characters.forEach((character, index) => {
    context.fillText(character, cursor, y);
    cursor += widths[index] + tracking;
  });
  context.textAlign = "center";
}

function drawMetaRow(
  context: CanvasRenderingContext2D,
  record: LessonFeedbackRecord,
  layout: FeedbackSheetLayout,
  includeValues: boolean
): void {
  const { marginX: m, contentWidth: w, metaY, metaHeight, metaXs } = layout;
  strokeRect(context, m, metaY, w, metaHeight, 1.1);
  metaXs.slice(1, -1).forEach((x) => strokeLine(context, x, metaY, x, metaY + metaHeight));

  const centerY = metaY + metaHeight / 2;
  const labels: Array<[string, number, number]> = [
    ["教师", metaXs[0], metaXs[1]],
    ["课次", metaXs[2], metaXs[3]],
    ["日期", metaXs[4], metaXs[5]],
    ["班级", metaXs[6], metaXs[7]]
  ];
  labels.forEach(([text, left, right]) => {
    fillCenteredText(context, text, (left + right) / 2, centerY, 12, 600);
  });

  // 班级取自课程档案，不可编辑，因此始终画在骨架里。
  fillCenteredText(context, record.className || "", (metaXs[7] + metaXs[8]) / 2, centerY, 13, 650);
  if (!includeValues) return;
  const teacherStyle = record.fieldStyles?.teacherName ?? {};
  const periodStyle = record.fieldStyles?.periodLabel ?? {};
  drawCellText(context, record.teacherName, metaXs[1], metaY, metaXs[2] - metaXs[1], metaHeight, {
    size: teacherStyle.fontSize ?? 13,
    weight: teacherStyle.fontWeight ?? 400,
    fill: teacherStyle.color ?? feedbackInkColor,
    anchor: "middle"
  });
  drawCellText(context, record.periodLabel, metaXs[3], metaY, metaXs[4] - metaXs[3], metaHeight, {
    size: periodStyle.fontSize ?? 12,
    weight: periodStyle.fontWeight ?? 400,
    fill: periodStyle.color ?? feedbackInkColor,
    anchor: "middle"
  });
  drawCellText(context, feedbackFormatDate(record.date), metaXs[5], metaY, metaXs[6] - metaXs[5], metaHeight, { size: 12, anchor: "middle" });
}

function drawContentRows(
  context: CanvasRenderingContext2D,
  record: LessonFeedbackRecord,
  layout: FeedbackSheetLayout,
  includeValues: boolean
): void {
  const { marginX: m, contentWidth: w } = layout;
  const rows: Array<[string, string, number, number, LessonFeedbackFieldKey]> = [
    ["上课内容", record.content, layout.contentY, layout.contentHeight, "content"],
    ["今日作业", record.homework, layout.homeworkY, layout.homeworkHeight, "homework"]
  ];
  rows.forEach(([label, value, y, height, key]) => {
    strokeRect(context, m, y, w, height);
    strokeLine(context, m + 84, y, m + 84, y + height);
    fillCenteredText(context, label, m + 42, y + height / 2, 13, 650);
    if (!includeValues) return;
    const style = record.fieldStyles?.[key] ?? {};
    if (style.highlights?.length) {
      feedbackTextBoxHighlightRects(value, style.highlights, {
        width: w - 84 - 2,
        fontSize: style.fontSize ?? 14,
        fontWeight: style.fontWeight ?? 400,
        paddingX: 9,
        paddingY: 9
      }).forEach((rect) => {
        context.fillStyle = rect.color;
        context.fillRect(m + 84 + 1 + rect.x, y + 1 + rect.y, rect.width, rect.height);
      });
    }
    drawCellText(context, value, m + 84, y, w - 84, height, {
      size: style.fontSize ?? 14,
      weight: style.fontWeight ?? 400,
      fill: style.color ?? feedbackInkColor,
      padding: 10,
      valign: "top"
    });
  });
}

function drawStudentTable(
  context: CanvasRenderingContext2D,
  record: LessonFeedbackRecord,
  layout: FeedbackSheetLayout,
  includeValues: boolean
): void {
  const { marginX: m, contentWidth: w, cols: c, tableY, headerTopHeight, studentStartY, studentTableBottom } = layout;
  const mainHeight = studentTableBottom - tableY;
  strokeRect(context, m, tableY, w, mainHeight, 1.1);

  // 有学生的行画实线，空白行改用浅色虚线——纵向分隔线在此处切换。
  const filledBottom = Math.min(studentTableBottom, studentStartY + record.students.length * layout.studentRowHeight);
  const columnLine = (x: number, startY: number) => {
    if (filledBottom > startY) strokeLine(context, x, startY, x, filledBottom);
    if (filledBottom < studentTableBottom) {
      strokeGuideLine(context, x, Math.max(startY, filledBottom), x, studentTableBottom);
    }
  };
  // 姓名/出勤/课后作业/综合评价的竖线自表头顶端起：视觉上等同 rowspan=2。
  [c[1], c[2], c[3], c[6]].forEach((x) => columnLine(x, tableY));
  // 听课/参与/笔记的竖线只在第二层出现：视觉上等同 colspan=3 的子列。
  [c[4], c[5]].forEach((x) => columnLine(x, tableY + headerTopHeight));

  strokeLine(context, c[3], tableY + headerTopHeight, c[6], tableY + headerTopHeight);
  strokeLine(context, m, studentStartY, m + w, studentStartY);

  for (let index = 1; index <= layout.studentSlots; index += 1) {
    const y = studentStartY + index * layout.studentRowHeight;
    if (index > record.students.length) {
      strokeGuideLine(context, m, y, c[6], y);
    } else {
      strokeLine(context, m, y, c[6], y);
    }
    // 综合评价列恒为虚线，像纸质表格里预留的书写格。
    strokeGuideLine(context, c[6], y, m + w, y);
  }

  const fullHeaderCenter = tableY + (headerTopHeight + layout.headerBottomHeight) / 2;
  fillCenteredText(context, "姓名", (c[0] + c[1]) / 2, fullHeaderCenter, 12, 650);
  fillCenteredText(context, "出勤", (c[1] + c[2]) / 2, fullHeaderCenter, 12, 650);
  drawCellText(context, "课后作业", c[2], tableY, c[3] - c[2], 56, { size: 11, anchor: "middle", weight: 650 });
  fillCenteredText(context, "课堂表现评价（A/B/C）", (c[3] + c[6]) / 2, tableY + 14, 11, 650);
  drawCellText(context, "综合评价及建议", c[6], tableY, c[7] - c[6], 56, { size: 11, anchor: "middle", weight: 650 });
  fillCenteredText(context, "听课表现", (c[3] + c[4]) / 2, tableY + 42, 10.5, 600);
  fillCenteredText(context, "课堂参与", (c[4] + c[5]) / 2, tableY + 42, 10.5, 600);
  fillCenteredText(context, "课堂笔记", (c[5] + c[6]) / 2, tableY + 42, 10.5, 600);

  record.students.forEach((student, index) => {
    const rowY = studentStartY + index * layout.studentRowHeight;
    const markY = rowY + layout.studentRowHeight / 2;
    const entry = record.entries[student.id] as LessonFeedbackEntry | undefined;
    // 姓名在编辑器里由可点选的按钮承担，骨架不画，避免与 DOM 文字重影。
    if (!includeValues) return;
    drawCellText(context, student.name, c[0], rowY, c[1] - c[0], layout.studentRowHeight, {
      size: student.name.length > 5 ? 11 : 12.5,
      anchor: "middle",
      weight: 600,
      padding: 2
    });
    if (!entry) return;
    fillCenteredText(context, entry.attendance, (c[1] + c[2]) / 2, markY, 18, 700, feedbackMarkColor(entry.attendance));
    drawHomeworkMark(context, entry.homework, c[2], rowY, c[3] - c[2], layout.studentRowHeight);
    fillCenteredText(context, entry.listening, (c[3] + c[4]) / 2, markY, 16, 700, feedbackMarkColor(entry.listening));
    fillCenteredText(context, entry.participation, (c[4] + c[5]) / 2, markY, 16, 700, feedbackMarkColor(entry.participation));
    fillCenteredText(context, entry.notes, (c[5] + c[6]) / 2, markY, 16, 700, feedbackMarkColor(entry.notes));
    const commentSize = entry.commentFontSize ?? 11.5;
    const commentWeight = entry.commentFontWeight ?? 400;
    if (entry.commentHighlights?.length) {
      // 与编辑器同一套浏览器排版；坐标基准是格子内缩 1px 后的 border-box。
      feedbackTextBoxHighlightRects(entry.comment, entry.commentHighlights, {
        width: c[7] - c[6] - 2,
        fontSize: commentSize,
        fontWeight: commentWeight,
        paddingX: 4,
        paddingY: 4
      }).forEach((rect) => {
        context.fillStyle = rect.color;
        context.fillRect(c[6] + 1 + rect.x, rowY + 1 + rect.y, rect.width, rect.height);
      });
    }
    drawCellText(context, entry.comment, c[6], rowY, c[7] - c[6], layout.studentRowHeight, {
      size: commentSize,
      weight: commentWeight,
      fill: entry.commentColor ?? feedbackInkColor,
      padding: 5
    });
  });
}

const presetHomeworkMarks = new Set(["A", "B", "C", "√", "○", "×"]);

function drawHomeworkMark(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const text = String(value || "");
  if (!text) return;
  const fill = feedbackMarkColor(text);
  if (presetHomeworkMarks.has(text) && text.length <= 1) {
    fillCenteredText(context, text, x + width / 2, y + height / 2, 17, 700, fill);
    return;
  }
  drawCellText(context, text, x, y, width, height, {
    size: text.length > 4 ? 11 : 12,
    weight: 700,
    fill,
    anchor: "middle",
    padding: 2,
    lineHeight: 14,
    ellipsis: false
  });
}

function drawRubric(
  context: CanvasRenderingContext2D,
  record: LessonFeedbackRecord,
  layout: FeedbackSheetLayout,
  includeValues: boolean
): void {
  const { marginX: m, contentWidth: w, rubricXs } = layout;
  const rubricBottom = layout.noteY + layout.noteHeight;

  strokeRect(context, m, layout.rubricTitleY, w, layout.rubricTitleHeight);
  fillCenteredText(context, "附：学生各项表现评价量表", m + w / 2, layout.rubricTitleY + layout.rubricTitleHeight / 2, 12, 600);

  strokeRect(context, m, layout.rubricHeaderY, w, rubricBottom - layout.rubricHeaderY);
  // A/B/C 的竖线止于出勤行：出勤与备注行右侧因此读作合并单元格。
  rubricXs.slice(1, -1).forEach((x) => strokeLine(context, x, layout.rubricHeaderY, x, layout.attendanceY));
  strokeLine(context, rubricXs[1], layout.attendanceY, rubricXs[1], rubricBottom);
  strokeLine(context, m, layout.rubricHeaderY + layout.rubricHeaderHeight, m + w, layout.rubricHeaderY + layout.rubricHeaderHeight);
  for (let index = 1; index <= feedbackRubricRows.length; index += 1) {
    const y = layout.rubricHeaderY + layout.rubricHeaderHeight + index * layout.rubricRowHeight;
    strokeLine(context, m, y, m + w, y);
  }
  strokeLine(context, m, layout.noteY, m + w, layout.noteY);

  const headerCenter = layout.rubricHeaderY + layout.rubricHeaderHeight / 2;
  fillCenteredText(context, "项目", (rubricXs[0] + rubricXs[1]) / 2, headerCenter, 12, 650);
  ["A", "B", "C"].forEach((grade, index) => {
    fillCenteredText(context, grade, (rubricXs[index + 1] + rubricXs[index + 2]) / 2, headerCenter, 13, 700);
  });

  feedbackRubricRows.forEach((row, index) => {
    const rowY = layout.rubricHeaderY + layout.rubricHeaderHeight + index * layout.rubricRowHeight;
    drawCellText(context, row[0], rubricXs[0], rowY, rubricXs[1] - rubricXs[0], layout.rubricRowHeight, {
      size: 11,
      anchor: "middle",
      weight: 600,
      padding: 2
    });
    for (let column = 1; column <= 3; column += 1) {
      drawCellText(context, row[column], rubricXs[column], rowY, rubricXs[column + 1] - rubricXs[column], layout.rubricRowHeight, {
        size: 10,
        anchor: "middle",
        padding: 3
      });
    }
  });

  fillCenteredText(context, "出勤", (rubricXs[0] + rubricXs[1]) / 2, layout.attendanceY + layout.attendanceHeight / 2, 11, 600);
  drawCellText(context, feedbackAttendanceLegend, rubricXs[1], layout.attendanceY, w - 80, layout.attendanceHeight, {
    size: 10.5,
    anchor: "middle"
  });
  fillCenteredText(context, "备注", (rubricXs[0] + rubricXs[1]) / 2, layout.noteY + layout.noteHeight / 2, 11, 600);
  if (!includeValues) return;
  const noteStyle = record.fieldStyles?.generalNotes ?? {};
  if (noteStyle.highlights?.length) {
    feedbackTextBoxHighlightRects(record.generalNotes, noteStyle.highlights, {
      width: w - 80 - 2,
      fontSize: noteStyle.fontSize ?? 11,
      fontWeight: noteStyle.fontWeight ?? 400,
      paddingX: 5,
      paddingY: 5
    }).forEach((rect) => {
      context.fillStyle = rect.color;
      context.fillRect(rubricXs[1] + 1 + rect.x, layout.noteY + 1 + rect.y, rect.width, rect.height);
    });
  }
  drawCellText(context, record.generalNotes, rubricXs[1], layout.noteY, w - 80, layout.noteHeight, {
    size: noteStyle.fontSize ?? 11,
    weight: noteStyle.fontWeight ?? 400,
    fill: noteStyle.color ?? feedbackInkColor,
    padding: 6
  });
}

function drawBands(context: CanvasRenderingContext2D, record: LessonFeedbackRecord, layout: FeedbackSheetLayout): void {
  const { cols: c } = layout;
  record.textBoxes.forEach((box) => {
    if (!box.showBand || !box.studentIds?.length) return;
    context.save();
    context.globalAlpha = 0.14;
    context.fillStyle = box.borderColor || box.color;
    box.studentIds.forEach((id) => {
      const index = record.students.findIndex((student) => student.id === id);
      if (index < 0) return;
      const y = layout.studentStartY + index * layout.studentRowHeight;
      context.fillRect(c[0], y, c[7] - c[0], layout.studentRowHeight);
    });
    context.restore();
  });
}

function drawTextBoxes(context: CanvasRenderingContext2D, record: LessonFeedbackRecord, layout: FeedbackSheetLayout): void {
  record.textBoxes.forEach((box) => {
    const borderStyle = box.borderStyle ?? "dashed";
    const borderWidth = box.borderWidth ?? 1.5;
    context.save();
    if (box.backgroundColor && box.backgroundColor !== "transparent") {
      context.fillStyle = box.backgroundColor;
      context.fillRect(box.x, box.y, box.width, box.height);
    }
    if (borderStyle !== "none") {
      context.strokeStyle = box.borderColor || box.color;
      context.lineWidth = borderWidth;
      context.setLineDash(borderStyle === "dashed" ? [6, 4] : []);
      context.strokeRect(box.x, box.y, box.width, box.height);
      context.setLineDash([]);
    }
    context.restore();

    // clip 把超出框的行裁掉，避免文字漫到框外。
    context.save();
    context.beginPath();
    context.rect(box.x, box.y, box.width, box.height);
    context.clip();
    context.font = `${box.fontWeight} ${box.fontSize}px ${feedbackBodyFontFamily}`;
    // 断行与荧光位置都取自浏览器对同样式镜像元素的真实排版，导出图因此与网页
    // textarea 逐字一致，不会在换行处差一个字；荧光压在文字下方，先画底色再画字。
    const border = (box.borderStyle ?? "dashed") === "none" ? 0 : (box.borderWidth ?? 1.5);
    const style = { width: box.width - border * 2, fontSize: box.fontSize, fontWeight: box.fontWeight };
    const originX = box.x + border;
    const originY = box.y + border;

    feedbackTextBoxHighlightRects(box.text, box.highlights ?? [], style).forEach((rect) => {
      context.fillStyle = rect.color;
      context.fillRect(originX + rect.x, originY + rect.y, rect.width, rect.height);
    });

    const lines = feedbackTextBoxLines(box.text, style);
    const lineHeight = box.fontSize * 1.45;
    context.fillStyle = box.color;
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    lines.forEach((line, index) => {
      // 2 是 textarea 的上内边距，0.82em 把基线落到与 DOM 相同的位置。
      context.fillText(line, originX + 3, originY + 2 + box.fontSize * 0.82 + index * lineHeight);
    });
    context.restore();
    void layout;
  });
}

function drawBraces(context: CanvasRenderingContext2D, record: LessonFeedbackRecord, layout: FeedbackSheetLayout): void {
  record.textBoxes.forEach((box) => {
    const geo = feedbackBraceGeometry(box, record, layout);
    if (!geo) return;
    context.save();
    context.strokeStyle = geo.color;
    context.fillStyle = geo.color;
    context.lineWidth = geo.width;
    context.lineCap = "round";
    const dotRadius = Math.max(2.4, geo.width + 0.6);
    geo.nodes.forEach((node) => {
      const midX = (node.x + geo.tip.x) / 2;
      context.beginPath();
      context.moveTo(node.x, node.y);
      context.quadraticCurveTo(midX, node.y, geo.tip.x, geo.tip.y);
      context.stroke();
      context.beginPath();
      context.arc(node.x, node.y, dotRadius, 0, Math.PI * 2);
      context.fill();
    });
    context.beginPath();
    context.arc(geo.tip.x, geo.tip.y, Math.max(2.6, geo.width + 1), 0, Math.PI * 2);
    context.fill();
    context.restore();
  });
}

function strokeRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  lineWidth = 1
): void {
  context.save();
  context.strokeStyle = feedbackBorderColor;
  context.lineWidth = lineWidth;
  context.strokeRect(x, y, width, height);
  context.restore();
}

function strokeLine(context: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  context.save();
  context.strokeStyle = feedbackBorderColor;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
  context.restore();
}

function strokeGuideLine(context: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  context.save();
  context.strokeStyle = feedbackGuideLine.stroke;
  context.globalAlpha = feedbackGuideLine.opacity;
  context.lineWidth = feedbackGuideLine.width;
  context.setLineDash([...feedbackGuideLine.dash]);
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
  context.restore();
}

function fillCenteredText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  weight: number,
  fill = feedbackInkColor
): void {
  if (!text) return;
  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = fill;
  context.font = `${weight} ${size}px ${feedbackBodyFontFamily}`;
  context.fillText(text, x, y);
  context.restore();
}

type CellTextOptions = FeedbackWrappedTextOptions & { weight?: number; fill?: string };

function drawCellText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: CellTextOptions = {}
): void {
  const placed = feedbackWrappedTextLayout(text, x, y, width, height, options);
  if (!placed) return;
  context.save();
  context.textAlign = placed.anchor === "middle" ? "center" : "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = options.fill || feedbackInkColor;
  context.font = `${options.weight || 400} ${options.size || 12}px ${feedbackBodyFontFamily}`;
  placed.lines.forEach((lineText, index) => {
    context.fillText(lineText, placed.x, placed.firstY + index * placed.lineHeight);
  });
  context.restore();
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

export type { LessonFeedbackTextBox };
export { feedbackBracePath };
