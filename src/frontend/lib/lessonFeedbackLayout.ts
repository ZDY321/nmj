// 课后反馈表的唯一几何来源。
//
// 屏幕编辑器与导出 PNG 必须共用这里的坐标与折行算法：旧版反馈项目之所以“所见即所得”，
// 靠的就是单一几何函数同时供两侧调用。此前新版把连线几何写了两份（屏幕起点 x=498、
// 导出起点 x=746），导出图与编辑器必然对不上，括号线因此错乱。任何新的绘制需求都应
// 先在此处产出坐标，再由两侧各自渲染。
//
// 数值全部对齐旧项目 app.js 的 layoutFor()/renderSheetSvg()，改动会直接影响导出版式。

import type { LessonFeedbackRecord, LessonFeedbackTextBox } from "@/frontend/lib/lessonFeedback";

export const feedbackPageWidth = 794;
export const feedbackBasePageHeight = 1123;
export const feedbackExportScale = 3;

export const feedbackPaperWarm = "#fffdf9";
export const feedbackPaperWhite = "#ffffff";
export const feedbackInkColor = "#1f2523";
export const feedbackBorderColor = "#303735";
export const feedbackTitleFontFamily = "STSong, SimSun, Microsoft YaHei, serif";
export const feedbackBodyFontFamily = "Microsoft YaHei, PingFang SC, Noto Sans SC, sans-serif";

// 表头大标题。旧项目允许在“表格文字”里改，此处先固定为用户在用的名称。
export const feedbackSheetTitle = "冲锋课堂反馈表";

// 空白行与“综合评价及建议”整列使用的浅色虚线，模拟纸质表格的书写引导线。
export const feedbackGuideLine = {
  stroke: "#9aa8a3",
  opacity: 0.42,
  dash: [4, 5] as [number, number],
  width: 0.65
};

export const feedbackRubricRows: ReadonlyArray<readonly [string, string, string, string]> = [
  ["听课表现", "注意力集中\n无走神或讲闲话等现象", "偶尔注意力分散\n偶有走神或讲闲话等现象", "显著分心\n走神或讲闲话等现象严重"],
  ["课堂参与", "课堂参与度高\n积极回答问题、主动反馈", "课堂参与度一般\n偶尔回答问题、被动反馈", "课堂参与度差\n基本不回答问题、不反馈"],
  ["课后作业", "完成且没有错误", "完成但有少量错误", "未完成或大量错误"],
  ["课堂笔记", "笔记认真完整", "有笔记但不完整", "无课堂笔记"]
];

// 全角空格分隔，与旧项目一致。
export const feedbackAttendanceLegend = "正常出勤打√　迟到○　缺勤×";

export type FeedbackSheetLayout = {
  width: number;
  height: number;
  marginX: number;
  contentWidth: number;
  metaY: number;
  metaHeight: number;
  contentY: number;
  contentHeight: number;
  homeworkY: number;
  homeworkHeight: number;
  tableY: number;
  headerTopHeight: number;
  headerBottomHeight: number;
  studentRowHeight: number;
  studentSlots: number;
  studentStartY: number;
  studentTableBottom: number;
  rubricTitleY: number;
  rubricTitleHeight: number;
  rubricHeaderY: number;
  rubricHeaderHeight: number;
  rubricRowHeight: number;
  attendanceY: number;
  attendanceHeight: number;
  noteY: number;
  noteHeight: number;
  bottom: number;
  cols: number[];
  metaXs: number[];
  rubricXs: number[];
};

// 学生列分界（页面坐标）：姓名 | 出勤 | 课后作业 | 听课 | 参与 | 笔记 | 综合评价
const sheetColumns = [42, 118, 174, 250, 322, 394, 466, 752];

export function feedbackSheetLayout(studentCount: number): FeedbackSheetLayout {
  const marginX = 42;
  const contentWidth = 710;
  const metaY = 66;
  const metaHeight = 32;
  const contentY = 98;
  const contentHeight = 72;
  const homeworkY = 170;
  const homeworkHeight = 72;
  const tableY = 242;
  const headerTopHeight = 28;
  const headerBottomHeight = 28;
  const studentRowHeight = 32;
  // 至少 12 行：学生不足时余下的行留白并画虚线，保持纸质表格的固定观感。
  const studentSlots = Math.max(12, studentCount);
  const studentStartY = tableY + headerTopHeight + headerBottomHeight;
  const studentTableBottom = studentStartY + studentSlots * studentRowHeight;
  const rubricTitleY = studentTableBottom;
  const rubricTitleHeight = 36;
  const rubricHeaderY = rubricTitleY + rubricTitleHeight;
  const rubricHeaderHeight = 28;
  const rubricRowHeight = 46;
  const attendanceY = rubricHeaderY + rubricHeaderHeight + feedbackRubricRows.length * rubricRowHeight;
  const attendanceHeight = 34;
  const noteY = attendanceY + attendanceHeight;
  const noteHeight = 36;
  const bottom = noteY + noteHeight;

  return {
    width: feedbackPageWidth,
    height: Math.max(feedbackBasePageHeight, bottom + 38),
    marginX,
    contentWidth,
    metaY,
    metaHeight,
    contentY,
    contentHeight,
    homeworkY,
    homeworkHeight,
    tableY,
    headerTopHeight,
    headerBottomHeight,
    studentRowHeight,
    studentSlots,
    studentStartY,
    studentTableBottom,
    rubricTitleY,
    rubricTitleHeight,
    rubricHeaderY,
    rubricHeaderHeight,
    rubricRowHeight,
    attendanceY,
    attendanceHeight,
    noteY,
    noteHeight,
    bottom,
    cols: sheetColumns,
    metaXs: [
      marginX,
      marginX + 50,
      marginX + 142,
      marginX + 194,
      marginX + 294,
      marginX + 340,
      marginX + 460,
      marginX + 508,
      marginX + contentWidth
    ],
    rubricXs: [marginX, marginX + 80, marginX + 290, marginX + 500, marginX + contentWidth]
  };
}

export function feedbackStudentRowCenter(layout: FeedbackSheetLayout, index: number): number {
  return layout.studentStartY + index * layout.studentRowHeight + layout.studentRowHeight / 2;
}

// 半角按 0.56 个汉字宽计。折行按此估算，不依赖 canvas 测量，屏幕与导出结果才能一致。
export function feedbackTextUnits(text: string): number {
  let units = 0;
  for (const char of String(text)) {
    units += /[\u0000-\u00ff]/.test(char) ? 0.56 : 1;
  }
  return units;
}

export function feedbackWrapText(text: string, maxUnits: number): string[] {
  const output: string[] = [];
  for (const paragraph of String(text || "").replace(/\r/g, "").split("\n")) {
    if (!paragraph) {
      output.push("");
      continue;
    }
    let line = "";
    let units = 0;
    for (const char of paragraph) {
      const charUnit = /[\u0000-\u00ff]/.test(char) ? 0.56 : 1;
      if (line && units + charUnit > maxUnits) {
        output.push(line);
        line = char;
        units = charUnit;
      } else {
        line += char;
        units += charUnit;
      }
    }
    if (line || !output.length) output.push(line);
  }
  return output;
}

export type FeedbackWrappedTextOptions = {
  size?: number;
  lineHeight?: number;
  anchor?: "start" | "middle";
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  maxLines?: number;
  ellipsis?: boolean;
  unitScale?: number;
  valign?: "top" | "center";
  // 传入真实的文字测量函数后按实际宽度折行（canvas measureText / DOM 度量）。
  // 表格单元格沿用旧项目的估算宽度；文本框必须用它，否则导出断行会与网页不一致。
  measure?: (text: string) => number;
};

export type FeedbackWrappedTextLayout = {
  lines: string[];
  x: number;
  firstY: number;
  lineHeight: number;
  anchor: "start" | "middle";
};

// 按真实测量宽度折行，规则与浏览器 textarea 一致：逐字累加，超宽即换行。
export function feedbackWrapTextMeasured(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  const output: string[] = [];
  for (const paragraph of String(text || "").replace(/\r/g, "").split("\n")) {
    if (!paragraph) {
      output.push("");
      continue;
    }
    let line = "";
    for (const char of paragraph) {
      const candidate = line + char;
      if (line && measure(candidate) > maxWidth) {
        output.push(line);
        line = char;
      } else {
        line = candidate;
      }
    }
    if (line || !output.length) output.push(line);
  }
  return output;
}

// 与旧项目 svgWrappedText 同一套排版规则，供两侧渲染器使用。
export function feedbackWrappedTextLayout(
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: FeedbackWrappedTextOptions = {}
): FeedbackWrappedTextLayout | null {
  if (!text) return null;
  const size = options.size || 12;
  const lineHeight = options.lineHeight || size * 1.45;
  const anchor = options.anchor || "start";
  const padding = options.padding ?? 7;
  const paddingX = options.paddingX ?? padding;
  const paddingY = options.paddingY ?? padding;
  const maxLines = Math.max(1, Math.floor((height - paddingY * 2) / lineHeight));
  const allLines = options.measure
    ? feedbackWrapTextMeasured(text, width - paddingX * 2, options.measure)
    : feedbackWrapText(text, Math.max(1, (width - paddingX * 2) / (size * (options.unitScale || 0.94))));
  const lines = options.maxLines === Infinity ? allLines : allLines.slice(0, options.maxLines || maxLines);
  if (options.ellipsis !== false && allLines.length > lines.length && lines.length) {
    const last = lines.length - 1;
    lines[last] = `${lines[last].slice(0, Math.max(0, lines[last].length - 1))}…`;
  }
  const totalHeight = lines.length * lineHeight;
  const firstY = options.valign === "top"
    ? y + paddingY + size * 0.82
    : y + Math.max(paddingY + size * 0.72, (height - totalHeight) / 2 + lineHeight * 0.62);

  return {
    lines,
    x: anchor === "middle" ? x + width / 2 : x + paddingX,
    firstY,
    lineHeight,
    anchor
  };
}

export function feedbackMarkColor(value: string): string {
  if (value === "A" || value === "√") return "#14795d";
  if (value === "B" || value === "○") return "#a85617";
  if (value === "C" || value === "×") return "#bd3029";
  return feedbackInkColor;
}

export function feedbackFormatDate(dateText: string): string {
  if (!dateText) return "未填写日期";
  const [year, month, day] = dateText.split("-");
  if (!year || !month || !day) return dateText;
  return `${year}.${Number(month)}.${Number(day)}`;
}

// 括号连线：学生侧触点仍留在“课堂笔记”列内，但自列心右移半个字，
// 既不盖住评分文字，也不会贴到右侧的文本框上。
const braceNodeShift = 8;

export type FeedbackBracePoint = { x: number; y: number };

export type FeedbackBraceGeometry = {
  tip: FeedbackBracePoint;
  nodes: Array<FeedbackBracePoint & { id: string }>;
  color: string;
  width: number;
};

export function feedbackBraceGeometry(
  box: LessonFeedbackTextBox,
  record: Pick<LessonFeedbackRecord, "students">,
  layout: FeedbackSheetLayout
): FeedbackBraceGeometry | null {
  const ids = Array.isArray(box.studentIds) ? box.studentIds : [];
  if (!ids.length) return null;
  // 汇聚点与文本框一体，随框移动；纵向位置默认取框高中点，
  // 建框时会写入对齐所选行中点的偏移，单人反馈因此得到水平直线。
  const tip = { x: box.x, y: box.y + (box.braceTipDy ?? box.height / 2) };
  // 学生侧触点各自独立：基准 X 取自表格“综合评价”列的固定位置，不随文本框移动，
  // 每个学生再叠加自己的偏移，移动一个不牵动其他人，也不牵动汇聚点。
  const baseX = (layout.cols[5] + layout.cols[6]) / 2 + braceNodeShift;
  const nodeOffsets = box.braceNodes ?? {};
  const nodes = ids
    .map((id) => {
      const index = record.students.findIndex((student) => student.id === id);
      if (index < 0) return null;
      const offset = nodeOffsets[id] ?? { dx: 0, dy: 0 };
      return {
        id,
        x: baseX + offset.dx,
        y: feedbackStudentRowCenter(layout, index) + offset.dy
      };
    })
    .filter((node): node is FeedbackBracePoint & { id: string } => node !== null);
  if (!nodes.length) return null;

  return {
    tip,
    nodes,
    color: box.borderColor || "#235f58",
    width: Math.min(Math.max(Number(box.borderWidth) || 2, 1), 8)
  };
}

// 二次贝塞尔：先水平离开指点再弯向汇聚点，多条并列即读作括号。
export function feedbackBracePath(node: FeedbackBracePoint, tip: FeedbackBracePoint): string {
  const midX = (node.x + tip.x) / 2;
  return `M ${node.x} ${node.y} Q ${midX} ${node.y} ${tip.x} ${tip.y}`;
}

export type FeedbackHighlightRect = { x: number; y: number; width: number; height: number; color: string };

// 把「第 m 到第 n 个字符」换算成屏幕矩形。
// 折行结果与正文渲染共用同一套 lines，所以高亮条与文字必然对齐；
// 跨行的选区会拆成多个矩形，每行一条。
export function feedbackHighlightRects(
  text: string,
  highlights: Array<{ start: number; end: number; color: string }>,
  box: { x: number; y: number; width: number; height: number },
  options: FeedbackWrappedTextOptions & { measure: (value: string) => number }
): FeedbackHighlightRect[] {
  if (!text || !highlights?.length) return [];
  const placed = feedbackWrappedTextLayout(text, box.x, box.y, box.width, box.height, options);
  if (!placed) return [];

  const size = options.size || 12;
  const rects: FeedbackHighlightRect[] = [];
  // 逐行推进：记录每行在原文里的起止下标，再与高亮区间求交集。
  let cursor = 0;
  placed.lines.forEach((line, index) => {
    // 折行时被吃掉的换行符要跳过，行首下标才能与原文对齐。
    if (index > 0 && text.charCodeAt(cursor) === 10) cursor += 1;
    const lineStart = cursor;
    const lineEnd = lineStart + line.length;
    cursor = lineEnd;

    highlights.forEach((highlight) => {
      const from = Math.max(highlight.start, lineStart);
      const to = Math.min(highlight.end, lineEnd);
      if (from >= to) return;
      const before = line.slice(0, from - lineStart);
      const inside = line.slice(from - lineStart, to - lineStart);
      const top = placed.firstY + index * placed.lineHeight - size * 0.92;
      rects.push({
        x: placed.x + options.measure(before),
        y: top,
        width: options.measure(inside),
        height: size * 1.28,
        color: highlight.color
      });
    });
  });
  return rects;
}

// 常用荧光色：半透明，压在文字下方仍能看清字。
export const feedbackHighlightColors: Array<{ value: string; label: string }> = [
  { value: "rgba(250, 204, 21, 0.45)", label: "荧光黄" },
  { value: "rgba(74, 222, 128, 0.42)", label: "荧光绿" },
  { value: "rgba(244, 114, 182, 0.38)", label: "荧光粉" },
  { value: "rgba(96, 165, 250, 0.38)", label: "荧光蓝" }
];
