// 文本框断行以浏览器为准。
//
// 自己写的折行算法（逐字累加超宽即换行）与浏览器的实际断行规则并不一致：
// 浏览器还要处理中日韩禁则、标点避头尾、空格合并等细则。两者在换行临界点会
// 差一个字，于是荧光标记就会标到相邻的字上——正是"只有换行处附近出错"的原因。
//
// 这里用一个与 textarea 样式完全相同的隐藏镜像元素，让浏览器自己排版，
// 再读回真实的行切分与字符矩形。屏幕与导出都以此为准，断行才真正一致。

export type FeedbackTextBoxStyle = {
  /** textarea 的 border-box 宽度，即文本框宽度减去两侧边框。 */
  width: number;
  fontSize: number;
  fontWeight: number;
  lineHeightRatio?: number;
  paddingX?: number;
  paddingY?: number;
};

export type FeedbackTextRect = { x: number; y: number; width: number; height: number };

const mirrorFontFamily = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
let mirrorElement: HTMLDivElement | null = null;

function mirrorFor(text: string, style: FeedbackTextBoxStyle): { node: HTMLDivElement; textNode: Text } | null {
  if (typeof document === "undefined") return null;
  if (!mirrorElement) {
    mirrorElement = document.createElement("div");
    mirrorElement.setAttribute("aria-hidden", "true");
    // 移出视口而不是 display:none —— 后者不参与排版，量不到任何尺寸。
    mirrorElement.style.position = "fixed";
    mirrorElement.style.top = "-10000px";
    mirrorElement.style.left = "-10000px";
    mirrorElement.style.visibility = "hidden";
    mirrorElement.style.pointerEvents = "none";
    document.body.appendChild(mirrorElement);
  }
  const node = mirrorElement;
  // 以下每一项都必须与 .lesson-feedback-text-box textarea 的 CSS 对齐，
  // 任意一项不同都会让镜像的断行与真实 textarea 分家。
  node.style.boxSizing = "border-box";
  node.style.width = `${style.width}px`;
  node.style.padding = `${style.paddingY ?? 2}px ${style.paddingX ?? 3}px`;
  node.style.font = `${style.fontWeight} ${style.fontSize}px ${mirrorFontFamily}`;
  node.style.lineHeight = String(style.lineHeightRatio ?? 1.45);
  node.style.letterSpacing = "0";
  node.style.whiteSpace = "pre-wrap";
  node.style.overflowWrap = "break-word";
  node.style.wordBreak = "break-all";
  node.style.border = "0";
  node.textContent = text;
  const textNode = node.firstChild;
  return textNode instanceof Text ? { node, textNode } : null;
}

/** 浏览器实际排出的每一行文字。 */
export function feedbackTextBoxLines(text: string, style: FeedbackTextBoxStyle): string[] {
  if (!text) return [];
  const mirror = mirrorFor(text, style);
  if (!mirror) return text.split("\n");

  const range = document.createRange();
  const lines: string[] = [];
  let lineStart = 0;
  let previousTop: number | null = null;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      lines.push(text.slice(lineStart, index));
      lineStart = index + 1;
      previousTop = null;
      continue;
    }
    range.setStart(mirror.textNode, index);
    range.setEnd(mirror.textNode, index + 1);
    const top = range.getBoundingClientRect().top;
    if (previousTop !== null && top - previousTop > 0.5) {
      lines.push(text.slice(lineStart, index));
      lineStart = index;
    }
    previousTop = top;
  }
  lines.push(text.slice(lineStart));
  return lines;
}

/**
 * 荧光矩形，坐标相对 textarea 的 border-box 左上角。
 * 直接读浏览器排好的字符矩形，跨行的选区会自动拆成多条。
 */
export function feedbackTextBoxHighlightRects(
  text: string,
  highlights: Array<{ start: number; end: number; color: string }>,
  style: FeedbackTextBoxStyle
): Array<FeedbackTextRect & { color: string }> {
  if (!text || !highlights?.length) return [];
  const mirror = mirrorFor(text, style);
  if (!mirror) return [];

  const origin = mirror.node.getBoundingClientRect();
  const range = document.createRange();
  const output: Array<FeedbackTextRect & { color: string }> = [];

  highlights.forEach((highlight) => {
    const start = Math.max(0, Math.min(highlight.start, text.length));
    const end = Math.max(start, Math.min(highlight.end, text.length));
    if (start >= end) return;
    range.setStart(mirror.textNode, start);
    range.setEnd(mirror.textNode, end);
    Array.from(range.getClientRects()).forEach((rect) => {
      if (rect.width <= 0 || rect.height <= 0) return;
      output.push({
        x: rect.left - origin.left,
        y: rect.top - origin.top,
        width: rect.width,
        height: rect.height,
        color: highlight.color
      });
    });
  });
  return output;
}
