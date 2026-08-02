import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowRight,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  Download,
  Eraser,
  Highlighter,
  Minus,
  MousePointer2,
  PenTool,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
  UsersRound
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { makeId } from "@/frontend/lib/crypto";
import type {
  LessonFeedbackEntry,
  LessonFeedbackFieldKey,
  LessonFeedbackHighlight,
  LessonFeedbackTextStyle,
  LessonFeedbackPoint,
  LessonFeedbackRecord,
  LessonFeedbackStroke,
  LessonFeedbackStrokeTool,
  LessonFeedbackTextBox
} from "@/frontend/lib/lessonFeedback";
import {
  drawFeedbackStroke,
  feedbackPageHeight,
  feedbackPageWidth,
  lessonFeedbackPngBlob,
  renderLessonFeedbackCanvas
} from "@/frontend/lib/lessonFeedbackExport";
import {
  feedbackBraceGeometry,
  feedbackBracePath,
  feedbackSheetLayout,
  feedbackStudentRowCenter
} from "@/frontend/lib/lessonFeedbackLayout";
import { nearestStrokeId } from "@/frontend/lib/lessonFeedbackHitTest";
import { feedbackHighlightColors } from "@/frontend/lib/lessonFeedbackLayout";
import { feedbackTextBoxHighlightRects } from "@/frontend/lib/lessonFeedbackTextMetrics";
import "@/frontend/lessonFeedback.css";

type EditorTool = "select" | "eraser" | "text" | LessonFeedbackStrokeTool;
type SaveState = "idle" | "loading" | "saving" | "saved" | "error" | "conflict";

type BoxInteraction = {
  id: string;
  mode: "move" | "resize";
  startClientX: number;
  startClientY: number;
  startBox: LessonFeedbackTextBox;
  originalRecord: LessonFeedbackRecord;
};

// 与旧项目一致的常用色，避免每次都要开色轮。
const presetColors: Array<{ value: string; label: string }> = [
  { value: "#235f58", label: "墨绿" },
  { value: "#d92d20", label: "红色" },
  { value: "#175cd3", label: "蓝色" },
  { value: "#079455", label: "绿色" },
  { value: "#b54708", label: "橙棕" },
  { value: "#6941c6", label: "紫色" },
  { value: "#111827", label: "近黑" }
];

const blankEntry: LessonFeedbackEntry = {
  attendance: "",
  homework: "",
  listening: "",
  participation: "",
  notes: "",
  comment: ""
};

const fieldLabels: Record<LessonFeedbackFieldKey, string> = {
  content: "上课内容",
  homework: "今日作业",
  generalNotes: "备注",
  teacherName: "教师",
  periodLabel: "课次",
  date: "日期"
};

const fieldDefaultSizes: Record<LessonFeedbackFieldKey, number> = {
  content: 14,
  homework: 14,
  generalNotes: 11,
  teacherName: 13,
  periodLabel: 12,
  date: 12
};

const attendanceCycle = ["", "√", "○", "×"];
const gradeCycle = ["", "A", "B", "C"];
const tools: Array<{ value: EditorTool; label: string; icon: typeof MousePointer2 }> = [
  { value: "select", label: "选择", icon: MousePointer2 },
  { value: "pen", label: "画笔", icon: PenTool },
  { value: "highlighter", label: "荧光笔", icon: Highlighter },
  { value: "line", label: "直线", icon: Minus },
  { value: "arrow", label: "箭头", icon: ArrowRight },
  { value: "ellipse", label: "圆圈", icon: Circle },
  { value: "rect", label: "方框", icon: Square },
  { value: "text", label: "文本框", icon: Type },
  { value: "eraser", label: "橡皮", icon: Eraser }
];

export function LessonFeedbackEditor({
  record,
  onChange,
  saveState = "idle"
}: {
  record: LessonFeedbackRecord;
  onChange: (record: LessonFeedbackRecord) => void;
  saveState?: SaveState;
}) {
  const [activeTool, setActiveTool] = useState<EditorTool>("select");
  const [activeColor, setActiveColor] = useState("#d92d20");
  const [penWidth, setPenWidth] = useState(3);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedTextBoxId, setSelectedTextBoxId] = useState("");
  const [draftStroke, setDraftStroke] = useState<LessonFeedbackStroke | null>(null);
  const [boxInteraction, setBoxInteraction] = useState<BoxInteraction | null>(null);
  const [draftBox, setDraftBox] = useState<{ startX: number; startY: number; x: number; y: number; width: number; height: number } | null>(null);
  const [braceDrag, setBraceDrag] = useState<{
    id: string;
    // studentId 为空表示拖的是文本框侧的汇聚点。
    studentId?: string;
    startClientX: number;
    startClientY: number;
    startOffset: { dx: number; dy: number };
    startBoxX: number;
    startBoxY: number;
    originalRecord: LessonFeedbackRecord;
  } | null>(null);
  const [exportMessage, setExportMessage] = useState("");
  const [zoom, setZoom] = useState(1);
  const [focusedCommentId, setFocusedCommentId] = useState("");
  const [focusedField, setFocusedField] = useState<LessonFeedbackFieldKey | "">("");
  const [selectedStrokeId, setSelectedStrokeId] = useState("");
  const [textSelection, setTextSelection] = useState<{ boxId: string; start: number; end: number } | null>(null);
  const [brushCursor, setBrushCursor] = useState<LessonFeedbackPoint | null>(null);
  const [customHighlight, setCustomHighlight] = useState("#facc15");
  const [strokeDrag, setStrokeDrag] = useState<{
    id: string;
    mode: "move" | "resize";
    startClientX: number;
    startClientY: number;
    startPoints: LessonFeedbackPoint[];
    originalRecord: LessonFeedbackRecord;
  } | null>(null);
  const textAreaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sheetCanvasRef = useRef<HTMLCanvasElement>(null);
  const suppressDeselectRef = useRef(false);
  const latestRecordRef = useRef(record);
  const undoStackRef = useRef<LessonFeedbackRecord[]>([]);
  const redoStackRef = useRef<LessonFeedbackRecord[]>([]);
  const pageHeight = feedbackPageHeight(record);
  // 编辑器与导出共用同一份坐标，屏幕上的位置即导出图里的位置。
  const layout = useMemo(() => feedbackSheetLayout(record.students.length), [record.students.length]);
  const selectedBox = record.textBoxes.find((box) => box.id === selectedTextBoxId);
  const selectedStroke = record.annotations.find((stroke) => stroke.id === selectedStrokeId);
  // 荧光面板对准“正在选字的地方”：文本框或某个学生的评语格。
  const highlightTargetId = textSelection?.boxId
    || (focusedCommentId ? `comment:${focusedCommentId}` : "")
    || (focusedField ? `field:${focusedField}` : "")
    || selectedTextBoxId;
  const highlightTargetMarks = highlightTargetId.startsWith("comment:")
    ? record.entries[highlightTargetId.slice("comment:".length)]?.commentHighlights ?? []
    : highlightTargetId.startsWith("field:")
      ? record.fieldStyles?.[highlightTargetId.slice("field:".length) as LessonFeedbackFieldKey]?.highlights ?? []
      : record.textBoxes.find((box) => box.id === highlightTargetId)?.highlights ?? [];
  const hasHighlightTarget = highlightTargetId.startsWith("comment:")
    ? Boolean(record.entries[highlightTargetId.slice("comment:".length)])
    : highlightTargetId.startsWith("field:")
      ? true
      : record.textBoxes.some((box) => box.id === highlightTargetId);
  const focusedStudent = record.students.find((student) => student.id === focusedCommentId);
  const focusedEntry = focusedStudent
    ? { id: focusedStudent.id, name: focusedStudent.name, entry: record.entries[focusedStudent.id] ?? blankEntry }
    : null;
  const isDrawingTool = activeTool !== "select";
  // 画笔/荧光笔/橡皮显示真实笔头大小，其余工具仍用十字准星。
  const showsBrushCursor = activeTool === "pen" || activeTool === "highlighter" || activeTool === "eraser";
  const brushDiameter = activeTool === "highlighter" ? Math.max(penWidth * 5, 12) : activeTool === "eraser" ? 24 : penWidth;

  latestRecordRef.current = record;

  useEffect(() => {
    setSelectedStudentIds((current) => current.filter((studentId) => record.students.some((student) => student.id === studentId)));
    if (selectedTextBoxId && !record.textBoxes.some((box) => box.id === selectedTextBoxId)) setSelectedTextBoxId("");
  }, [record.id, record.students, record.textBoxes, selectedTextBoxId]);

  // 表格骨架直接复用导出渲染器（includeValues: false），可编辑的值再用 DOM 控件叠上去。
  // 这样屏幕与导出永远同一套几何，不会重现“连线在两边对不上”的问题。
  useEffect(() => {
    const host = sheetCanvasRef.current;
    if (!host) return;
    // backing store 按设备像素比放大、CSS 尺寸保持逻辑像素，文字才不会发虚。
    // 高分屏上再多给一档采样，弥补 canvas 文字相对 DOM 文字偏软的观感。
    const ratio = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
    const painted = renderLessonFeedbackCanvas(record, { scale: ratio, includeValues: false });
    host.width = painted.width;
    host.height = painted.height;
    const context = host.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, host.width, host.height);
    context.drawImage(painted, 0, 0);
  }, [record, pageHeight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(feedbackPageWidth * ratio);
    canvas.height = Math.round(pageHeight * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, feedbackPageWidth, pageHeight);
    record.annotations.forEach((stroke) => {
      drawFeedbackStroke(context, stroke);
    });
    if (draftStroke) drawFeedbackStroke(context, draftStroke);
  }, [draftStroke, pageHeight, record.annotations]);

  useEffect(() => {
    if (!boxInteraction) return;
    const onPointerMove = (event: PointerEvent) => {
      const current = latestRecordRef.current;
      const scale = feedbackPageWidth / Math.max(document.querySelector<HTMLElement>(".lesson-feedback-paper")?.getBoundingClientRect().width ?? feedbackPageWidth, 1);
      const deltaX = (event.clientX - boxInteraction.startClientX) * scale;
      const deltaY = (event.clientY - boxInteraction.startClientY) * scale;
      const next = cloneRecord(current);
      const box = next.textBoxes.find((item) => item.id === boxInteraction.id);
      if (!box) return;
      if (boxInteraction.mode === "move") {
        box.x = clamp(boxInteraction.startBox.x + deltaX, 30, feedbackPageWidth - box.width - 30);
        box.y = clamp(boxInteraction.startBox.y + deltaY, 32, feedbackPageHeight(next) - box.height - 32);
      } else {
        box.width = clamp(boxInteraction.startBox.width + deltaX, 120, feedbackPageWidth - box.x - 30);
        box.height = clamp(boxInteraction.startBox.height + deltaY, 68, 340);
      }
      emit(next, false);
    };
    const onPointerUp = () => {
      undoStackRef.current.push(boxInteraction.originalRecord);
      trimHistory(undoStackRef.current);
      redoStackRef.current = [];
      suppressDeselectRef.current = true;
      setBoxInteraction(null);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [boxInteraction]);

  // 选中的图形可整体平移，或从右下角按比例缩放。
  useEffect(() => {
    if (!strokeDrag) return;
    const onPointerMove = (event: PointerEvent) => {
      const paper = document.querySelector<HTMLElement>(".lesson-feedback-paper");
      const scale = feedbackPageWidth / Math.max(paper?.getBoundingClientRect().width ?? feedbackPageWidth, 1);
      const deltaX = (event.clientX - strokeDrag.startClientX) * scale;
      const deltaY = (event.clientY - strokeDrag.startClientY) * scale;
      const next = cloneRecord(latestRecordRef.current);
      const stroke = next.annotations.find((item) => item.id === strokeDrag.id);
      if (!stroke) return;
      const xs = strokeDrag.startPoints.map((point) => point.x);
      const ys = strokeDrag.startPoints.map((point) => point.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      if (strokeDrag.mode === "move") {
        stroke.points = strokeDrag.startPoints.map((point) => ({ x: point.x + deltaX, y: point.y + deltaY }));
      } else {
        const width = Math.max(...xs) - minX;
        const height = Math.max(...ys) - minY;
        // 以左上角为锚点缩放；下限避免图形被拖成零尺寸后无法再抓取。
        let scaleX = width > 1 ? Math.max(0.1, (width + deltaX) / width) : 1;
        let scaleY = height > 1 ? Math.max(0.1, (height + deltaY) / height) : 1;
        // 按住 Shift 等比缩放：取两轴中较大的变化量，形状不走样。
        if (event.shiftKey) {
          const uniform = Math.abs(scaleX - 1) > Math.abs(scaleY - 1) ? scaleX : scaleY;
          scaleX = uniform;
          scaleY = uniform;
        }
        stroke.points = strokeDrag.startPoints.map((point) => ({
          x: minX + (point.x - minX) * scaleX,
          y: minY + (point.y - minY) * scaleY
        }));
      }
      emit(next, false);
    };
    const onPointerUp = () => {
      undoStackRef.current.push(strokeDrag.originalRecord);
      trimHistory(undoStackRef.current);
      redoStackRef.current = [];
      suppressDeselectRef.current = true;
      setStrokeDrag(null);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [strokeDrag]);

  // 括号两端独立拖动：只改被拖那一端的偏移，另一端保持不动。
  useEffect(() => {
    if (!braceDrag) return;
    const onPointerMove = (event: PointerEvent) => {
      const paper = document.querySelector<HTMLElement>(".lesson-feedback-paper");
      const scale = feedbackPageWidth / Math.max(paper?.getBoundingClientRect().width ?? feedbackPageWidth, 1);
      const deltaX = (event.clientX - braceDrag.startClientX) * scale;
      const deltaY = (event.clientY - braceDrag.startClientY) * scale;
      const next = cloneRecord(latestRecordRef.current);
      const box = next.textBoxes.find((item) => item.id === braceDrag.id);
      if (!box) return;
      if (braceDrag.studentId) {
        // 学生侧：只改这一个学生的偏移，其余学生与汇聚点原地不动。
        const offsets = { ...(box.braceNodes ?? {}) };
        offsets[braceDrag.studentId] = {
          dx: braceDrag.startOffset.dx + deltaX,
          dy: braceDrag.startOffset.dy + deltaY
        };
        box.braceNodes = offsets;
      } else {
        // 文本框侧：汇聚点与文本框是一体的，拖它等同于拖整个文本框。
        box.x = clamp(braceDrag.startBoxX + deltaX, 24, feedbackPageWidth - box.width - 24);
        box.y = clamp(braceDrag.startBoxY + deltaY, 24, Math.max(24, feedbackPageHeight(next) - box.height - 24));
      }
      emit(next, false);
    };
    const onPointerUp = () => {
      undoStackRef.current.push(braceDrag.originalRecord);
      trimHistory(undoStackRef.current);
      redoStackRef.current = [];
      suppressDeselectRef.current = true;
      setBraceDrag(null);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [braceDrag]);

  const rowCenters = useMemo(() => new Map(record.students.map((student, index) => [
    student.id,
    feedbackStudentRowCenter(layout, index)
  ])), [layout, record.students]);

  function emit(nextRecord: LessonFeedbackRecord, history = true): void {
    if (history) {
      undoStackRef.current.push(cloneRecord(latestRecordRef.current));
      trimHistory(undoStackRef.current);
      redoStackRef.current = [];
    }
    const next = { ...nextRecord, updatedAt: new Date().toISOString() };
    latestRecordRef.current = next;
    onChange(next);
  }

  function patchRecord(patch: Partial<LessonFeedbackRecord>, history = false): void {
    emit({ ...cloneRecord(record), ...patch }, history);
  }

  function updateEntry(studentId: string, patch: Partial<LessonFeedbackEntry>, history = false): void {
    const next = cloneRecord(record);
    next.entries[studentId] = { ...next.entries[studentId], ...patch };
    emit(next, history);
  }

  function cycleEntry(studentId: string, field: keyof Pick<LessonFeedbackEntry, "attendance" | "homework" | "listening" | "participation" | "notes">): void {
    const cycle = field === "attendance" ? attendanceCycle : gradeCycle;
    const current = record.entries[studentId]?.[field] ?? "";
    const index = cycle.indexOf(current);
    updateEntry(studentId, { [field]: cycle[(index + 1) % cycle.length] }, true);
  }

  function applyExcellentDefaults(): void {
    const next = cloneRecord(record);
    next.students.forEach((student) => {
      next.entries[student.id] = {
        ...next.entries[student.id],
        attendance: "√",
        homework: "A",
        listening: "A",
        participation: "A",
        notes: "A"
      };
    });
    emit(next);
  }

  function clearMarks(): void {
    const next = cloneRecord(record);
    next.students.forEach((student) => {
      next.entries[student.id] = {
        ...next.entries[student.id],
        attendance: "",
        homework: "",
        listening: "",
        participation: "",
        notes: ""
      };
    });
    emit(next);
  }

  function toggleStudent(studentId: string): void {
    setSelectedStudentIds((current) => current.includes(studentId)
      ? current.filter((id) => id !== studentId)
      : [...current, studentId]);
  }

  function addGroupFeedback(): void {
    if (selectedStudentIds.length === 0) {
      setExportMessage("请先选择需要连线的学生。");
      return;
    }
    const next = cloneRecord(record);
    // 与旧项目一致的默认抬头：单人省略“共同”二字，写完抬头换行，老师接着写评语。
    const names = selectedStudentIds
      .map((studentId) => record.students.find((student) => student.id === studentId)?.name)
      .filter((name): name is string => Boolean(name))
      .join("、");
    const title = selectedStudentIds.length === 1
      ? `（${names}）评价与建议：`
      : `（${names}）共同评价与建议：`;
    const rows = selectedStudentIds
      .map((studentId) => record.students.findIndex((student) => student.id === studentId))
      .filter((index) => index >= 0);
    const firstRow = Math.min(...rows);
    const lastRow = Math.max(...rows);
    const boxX = layout.cols[6] + 6;
    const boxY = clamp(layout.studentStartY + firstRow * layout.studentRowHeight + 4, layout.studentStartY + 4, pageHeight - 130);
    const boxHeight = Math.max(54, (lastRow - firstRow + 1) * layout.studentRowHeight - 8);
    const box: LessonFeedbackTextBox = {
      id: makeId("feedback_box"),
      // 落在“综合评价及建议”列内，括号自左侧汇聚过来。
      x: boxX,
      y: boxY,
      width: layout.cols[7] - layout.cols[6] - 12,
      height: boxHeight,
      // 汇聚点对齐所选行的中点：单人时与该行同高，连线是水平直线。
      braceTipDy: layout.studentStartY + ((firstRow + lastRow + 1) / 2) * layout.studentRowHeight - boxY,
      text: `${title}\n`,
      color: "#111827",
      fontSize: 12,
      fontWeight: 700,
      borderColor: activeColor,
      backgroundColor: "transparent",
      studentIds: [...selectedStudentIds],
      showBand: true
    };
    next.textBoxes.push(box);
    emit(next);
    setSelectedTextBoxId(box.id);
    setActiveTool("select");
    setSelectedStudentIds([]);
  }

  // 拖拽建框：按下拉出矩形，松手按该尺寸创建；只点一下则用默认尺寸。
  function createTextBoxAt(x: number, y: number, width: number, height: number): void {
    const next = cloneRecord(record);
    const box: LessonFeedbackTextBox = {
      id: makeId("feedback_box"),
      x: clamp(x, 24, feedbackPageWidth - width - 24),
      y: clamp(y, 24, Math.max(24, pageHeight - height - 24)),
      width,
      height,
      text: "",
      color: "#111827",
      fontSize: 13,
      fontWeight: 600,
      borderColor: activeColor,
      backgroundColor: "transparent",
      borderStyle: "dashed",
      borderWidth: 1.5,
      studentIds: [],
      showBand: false
    };
    next.textBoxes.push(box);
    emit(next);
    setSelectedTextBoxId(box.id);
    setActiveTool("select");
  }

  function addTextBox(point: LessonFeedbackPoint): void {
    createTextBoxAt(point.x, point.y, 210, 86);
  }

  function patchTextBox(boxId: string, patch: Partial<LessonFeedbackTextBox>, history = false): void {
    const next = cloneRecord(record);
    const box = next.textBoxes.find((item) => item.id === boxId);
    if (!box) return;
    Object.assign(box, patch);
    emit(next, history);
  }

  function beginBraceDrag(event: ReactPointerEvent<SVGCircleElement>, box: LessonFeedbackTextBox, studentId?: string): void {
    event.stopPropagation();
    event.preventDefault();
    const startOffset = studentId
      ? box.braceNodes?.[studentId] ?? { dx: 0, dy: 0 }
      : { dx: 0, dy: 0 };
    setBraceDrag({
      id: box.id,
      studentId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffset,
      startBoxX: box.x,
      startBoxY: box.y,
      originalRecord: cloneRecord(record)
    });
  }

  function highlightRectsFor(box: LessonFeedbackTextBox) {
    if (!box.highlights?.length) return [];
    // 断行以浏览器为准：自算的折行在换行临界点会与 textarea 差一个字，
    // 荧光因此标到相邻的字上。这里直接读浏览器排好的字符矩形。
    return feedbackTextBoxHighlightRects(box.text, box.highlights, textBoxStyleOf(box));
  }

  // 字段样式：读时带默认值，写时只存差异，未调整过的字段不会被写进记录。
  function fieldStyleOf(key: LessonFeedbackFieldKey, defaultSize: number) {
    const style = record.fieldStyles?.[key] ?? {};
    return {
      color: style.color,
      fontSize: style.fontSize ?? defaultSize,
      fontWeight: style.fontWeight ?? 400,
      highlights: style.highlights ?? []
    };
  }

  function patchFieldStyle(key: LessonFeedbackFieldKey, patch: Partial<LessonFeedbackTextStyle>): void {
    const next = cloneRecord(record);
    next.fieldStyles = { ...(next.fieldStyles ?? {}), [key]: { ...(next.fieldStyles?.[key] ?? {}), ...patch } };
    emit(next);
  }

  function fieldTextStyle(key: LessonFeedbackFieldKey, defaultSize: number) {
    const style = fieldStyleOf(key, defaultSize);
    return { color: style.color, fontSize: style.fontSize, fontWeight: style.fontWeight };
  }

  // 字段荧光层：与 cellStyle 生成的内联样式同框（内缩 1、padding 减 1）。
  function fieldHighlightLayer(
    key: LessonFeedbackFieldKey,
    x: number,
    y: number,
    width: number,
    height: number,
    defaultSize: number,
    padding: number
  ) {
    const style = fieldStyleOf(key, defaultSize);
    if (!style.highlights.length) return null;
    const inner = Math.max(0, padding - 1);
    const rects = feedbackTextBoxHighlightRects(fieldTextOf(key), style.highlights, {
      width: width - 2,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      paddingX: inner,
      paddingY: inner
    });
    return (
      <div
        className="lesson-feedback-highlight-layer"
        style={{ left: x + 1, top: y + 1, width: width - 2, height: height - 2, right: "auto", bottom: "auto", zIndex: 2 }}
        aria-hidden="true"
      >
        {rects.map((rect, index) => (
          <span
            key={`${key}-hl-${index}`}
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, background: rect.color }}
          />
        ))}
      </div>
    );
  }

  function fieldTextOf(key: LessonFeedbackFieldKey): string {
    if (key === "content") return record.content;
    if (key === "homework") return record.homework;
    if (key === "generalNotes") return record.generalNotes;
    if (key === "teacherName") return record.teacherName;
    if (key === "periodLabel") return record.periodLabel;
    return record.date;
  }

  function textBoxStyleOf(box: LessonFeedbackTextBox) {
    const border = (box.borderStyle ?? "dashed") === "none" ? 0 : (box.borderWidth ?? 1.5);
    return {
      width: box.width - border * 2,
      fontSize: box.fontSize,
      fontWeight: box.fontWeight
    };
  }

  // 评语格同样以浏览器排版为准；坐标相对格子的 border-box 左上角。
  function commentHighlightRects(entry: LessonFeedbackEntry | undefined) {
    if (!entry?.commentHighlights?.length) return [];
    return feedbackTextBoxHighlightRects(entry.comment, entry.commentHighlights, {
      // 与 cellStyle 生成的内联样式一致：宽度内缩 2、padding 4（= 传入的 5 减 1）。
      width: layout.cols[7] - layout.cols[6] - 2,
      fontSize: entry.commentFontSize ?? 11.5,
      fontWeight: entry.commentFontWeight ?? 400,
      paddingX: 4,
      paddingY: 4
    });
  }

  function applyHighlight(color: string): void {
    if (!textSelection) return;
    const overlap = (item: LessonFeedbackHighlight) => item.end <= textSelection.start || item.start >= textSelection.end;
    const mark = { start: textSelection.start, end: textSelection.end, color };

    if (textSelection.boxId.startsWith("comment:")) {
      const studentId = textSelection.boxId.slice("comment:".length);
      const existing = record.entries[studentId]?.commentHighlights ?? [];
      updateEntry(studentId, { commentHighlights: [...existing.filter(overlap), mark] });
      return;
    }
    if (textSelection.boxId.startsWith("field:")) {
      const key = textSelection.boxId.slice("field:".length) as LessonFeedbackFieldKey;
      const existing = record.fieldStyles?.[key]?.highlights ?? [];
      patchFieldStyle(key, { highlights: [...existing.filter(overlap), mark] });
      return;
    }
    const box = record.textBoxes.find((item) => item.id === textSelection.boxId);
    if (!box) return;
    patchTextBox(box.id, { highlights: [...(box.highlights ?? []).filter(overlap), mark] });
  }

  function clearHighlights(targetId: string): void {
    if (targetId.startsWith("comment:")) {
      updateEntry(targetId.slice("comment:".length), { commentHighlights: [] });
      return;
    }
    if (targetId.startsWith("field:")) {
      patchFieldStyle(targetId.slice("field:".length) as LessonFeedbackFieldKey, { highlights: [] });
      return;
    }
    patchTextBox(targetId, { highlights: [] });
  }

  function beginStrokeDrag(event: ReactPointerEvent<HTMLElement>, stroke: LessonFeedbackStroke, mode: "move" | "resize"): void {
    event.stopPropagation();
    event.preventDefault();
    setStrokeDrag({
      id: stroke.id,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPoints: stroke.points.map((point) => ({ ...point })),
      originalRecord: cloneRecord(record)
    });
  }

  function patchStroke(strokeId: string, patch: Partial<LessonFeedbackStroke>): void {
    const next = cloneRecord(record);
    const stroke = next.annotations.find((item) => item.id === strokeId);
    if (!stroke) return;
    Object.assign(stroke, patch);
    emit(next);
  }

  function deleteTextBox(boxId: string): void {
    const next = cloneRecord(record);
    next.textBoxes = next.textBoxes.filter((box) => box.id !== boxId);
    emit(next);
    setSelectedTextBoxId("");
  }

  function beginBoxInteraction(event: ReactPointerEvent, box: LessonFeedbackTextBox, mode: BoxInteraction["mode"]): void {
    if (activeTool !== "select") return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedTextBoxId(box.id);
    setBoxInteraction({
      id: box.id,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBox: { ...box, studentIds: [...box.studentIds] },
      originalRecord: cloneRecord(record)
    });
  }

  function moveStudent(studentId: string, direction: -1 | 1): void {
    const index = record.students.findIndex((student) => student.id === studentId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= record.students.length) return;
    const next = cloneRecord(record);
    [next.students[index], next.students[target]] = [next.students[target], next.students[index]];
    emit(next);
  }

  function pointerPoint(event: ReactPointerEvent<HTMLCanvasElement>): LessonFeedbackPoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * feedbackPageWidth / rect.width,
      y: (event.clientY - rect.top) * pageHeight / rect.height
    };
  }

  function handleCanvasPointerDown(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const point = pointerPoint(event);
    if (activeTool === "text") {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDraftBox({ startX: point.x, startY: point.y, x: point.x, y: point.y, width: 0, height: 0 });
      return;
    }
    if (activeTool === "eraser") {
      const targetId = nearestStrokeId(record.annotations, point);
      if (!targetId) return;
      const next = cloneRecord(record);
      next.annotations = next.annotations.filter((stroke) => stroke.id !== targetId);
      emit(next);
      return;
    }
    if (activeTool === "select") return;

    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraftStroke({
      id: makeId("feedback_stroke"),
      tool: activeTool,
      color: activeColor,
      width: activeTool === "highlighter" ? Math.max(penWidth * 5, 12) : penWidth,
      points: [point]
    });
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (showsBrushCursor) setBrushCursor(pointerPoint(event));
    if (draftBox) {
      const point = pointerPoint(event);
      setDraftBox((current) => current && {
        ...current,
        x: Math.min(current.startX, point.x),
        y: Math.min(current.startY, point.y),
        width: Math.abs(point.x - current.startX),
        height: Math.abs(point.y - current.startY)
      });
      return;
    }
    if (!draftStroke) return;
    const point = pointerPoint(event);
    setDraftStroke((current) => {
      if (!current) return current;
      if (current.tool === "pen" || current.tool === "highlighter") {
        const previous = current.points.at(-1)!;
        if (Math.hypot(point.x - previous.x, point.y - previous.y) < 1.8) return current;
        return { ...current, points: [...current.points, point] };
      }
      return { ...current, points: current.points.length === 1 ? [...current.points, point] : [current.points[0], point] };
    });
  }

  function finishCanvasStroke(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (draftBox) {
      const { x, y, width, height } = draftBox;
      setDraftBox(null);
      // 拖出的矩形太小时按误触处理，退回默认尺寸。
      if (width < 24 || height < 20) createTextBoxAt(x, y, 210, 86);
      else createTextBoxAt(x, y, Math.max(80, width), Math.max(40, height));
      return;
    }
    if (!draftStroke) return;
    if (draftStroke.points.length === 1) {
      const point = pointerPoint(event);
      draftStroke.points.push({ x: point.x + 0.1, y: point.y + 0.1 });
    }
    const next = cloneRecord(record);
    next.annotations.push(draftStroke);
    setDraftStroke(null);
    emit(next);
  }

  function undo(): void {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current.push(cloneRecord(record));
    trimHistory(redoStackRef.current);
    onChange({ ...previous, updatedAt: new Date().toISOString() });
  }

  function redo(): void {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(cloneRecord(record));
    trimHistory(undoStackRef.current);
    onChange({ ...next, updatedAt: new Date().toISOString() });
  }

  async function copyImage(): Promise<void> {
    try {
      const blob = await lessonFeedbackPngBlob(record);
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("当前浏览器不支持直接复制图片。");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setExportMessage("反馈图片已复制。");
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "复制图片失败。");
    }
  }

  async function downloadImage(): Promise<void> {
    try {
      const blob = await lessonFeedbackPngBlob(record);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${sanitizeFilename(`${record.className}-${record.date}-${record.periodLabel}`)}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportMessage("高清反馈图片已下载。");
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "下载图片失败。");
    }
  }

  return (
    <section className="lesson-feedback-editor" aria-label="课后反馈编辑器">
      <div className="lesson-feedback-actionbar">
        <div className="lesson-feedback-actiongroup">
          <Button type="button" size="sm" onClick={applyExcellentDefaults}>
            <CheckCheck size={15} /> 一键全勤 + 作业 A + 表现 A
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={clearMarks}>清空评分</Button>
          <Button type="button" size="sm" variant="outline" onClick={addGroupFeedback} disabled={selectedStudentIds.length === 0}>
            <UsersRound size={15} /> 多人反馈{selectedStudentIds.length > 0 ? ` (${selectedStudentIds.length})` : ""}
          </Button>
          <div className="lesson-feedback-paperpick" role="group" aria-label="显示比例">
            <span>比例</span>
            <button type="button" className="lesson-feedback-zoom-step" onClick={() => setZoom((current) => clamp(Math.round((current - 0.1) * 10) / 10, 0.5, 2))} title="缩小">−</button>
            <button type="button" className="lesson-feedback-zoom-value" onClick={() => setZoom(1)} title="恢复 100%">{Math.round(zoom * 100)}%</button>
            <button type="button" className="lesson-feedback-zoom-step" onClick={() => setZoom((current) => clamp(Math.round((current + 0.1) * 10) / 10, 0.5, 2))} title="放大">＋</button>
          </div>
          <div className="lesson-feedback-paperpick" role="group" aria-label="纸张颜色">
            <span>纸张</span>
            <button
              type="button"
              className={cn("lesson-feedback-paperdot", record.paperColor !== "white" && "is-active")}
              style={{ background: "#fffdf9" }}
              onClick={() => patchRecord({ paperColor: "soft" }, true)}
              title="米白（默认）"
              aria-label="米白纸张"
            />
            <button
              type="button"
              className={cn("lesson-feedback-paperdot", record.paperColor === "white" && "is-active")}
              style={{ background: "#ffffff" }}
              onClick={() => patchRecord({ paperColor: "white" }, true)}
              title="纯白 A4"
              aria-label="纯白纸张"
            />
          </div>
        </div>
        <div className="lesson-feedback-actiongroup">
          <Button type="button" size="icon" variant="ghost" className="h-9 w-9" onClick={undo} disabled={undoStackRef.current.length === 0} title="撤销">
            <Undo2 size={16} />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-9 w-9" onClick={redo} disabled={redoStackRef.current.length === 0} title="恢复">
            <Redo2 size={16} />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void copyImage()}><Copy size={15} /> 复制图片</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void downloadImage()}><Download size={15} /> 高清 PNG</Button>
          <span className={cn("lesson-feedback-save-state", saveState === "error" || saveState === "conflict" ? "is-error" : "")}>{saveStateLabel(saveState)}</span>
        </div>
      </div>

      <div className="lesson-feedback-workspace">
        <aside className="lesson-feedback-toolrail" aria-label="批注工具">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.value}
                type="button"
                className={cn("lesson-feedback-tool", activeTool === tool.value && "is-active")}
                onClick={() => setActiveTool(tool.value)}
                title={tool.label}
              >
                <Icon size={17} />
                <span>{tool.label}</span>
              </button>
            );
          })}
          <div className="lesson-feedback-tool-divider" />
          <div className="lesson-feedback-section">
            <span className="lesson-feedback-section-title">画笔颜色</span>
            <span className="lesson-feedback-section-hint">画笔 · 荧光笔 · 图形，以及新建文本框的边框色</span>
            <div className="lesson-feedback-palette" role="group" aria-label="画笔与新建文本框的颜色">
              {presetColors.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className={cn("lesson-feedback-dot", activeColor.toLowerCase() === preset.value && "is-active")}
                  style={{ background: preset.value }}
                  onClick={() => setActiveColor(preset.value)}
                  title={preset.label}
                  aria-label={preset.label}
                />
              ))}
              <label className="lesson-feedback-dot lesson-feedback-dot-custom" title="自定义颜色">
                <input type="color" value={activeColor} onChange={(event) => setActiveColor(event.target.value)} />
              </label>
            </div>
          </div>
          <div className="lesson-feedback-section">
            <div className="lesson-feedback-section-head">
              <span className="lesson-feedback-section-title">画笔粗细</span>
              <span className="lesson-feedback-section-value">{penWidth}px</span>
            </div>
            <input className="lesson-feedback-range" type="range" min="1" max="10" value={penWidth} onChange={(event) => setPenWidth(Number(event.target.value))} />
            {/* 直接预览当前粗细，不用先画一笔才知道多粗。 */}
            <span className="lesson-feedback-width-preview" style={{ height: penWidth, background: activeColor }} />
          </div>

        </aside>

        <div className="lesson-feedback-paper-viewport">
          <div className="lesson-feedback-paper-stage" style={{ width: feedbackPageWidth * zoom, height: pageHeight * zoom }}>
          <div
            className={cn("lesson-feedback-paper", isDrawingTool && "is-drawing", showsBrushCursor && "is-brush")}
            style={{ width: feedbackPageWidth, height: pageHeight, transform: `scale(${zoom})` }}
            onFocusCapture={(event) => {
              // 焦点落到评语格以外的控件时，清掉评语焦点与选区，
              // 否则右侧面板会一直停留在上一次点过的学生评语上。
              const target = event.target as HTMLElement;
              if (target.classList?.contains("lesson-feedback-comment-cell")) {
                setFocusedField("");
                return;
              }
              setFocusedCommentId("");
              setTextSelection(null);
              // 不是可样式化的字段就清空，右侧面板才不会停在上一处。
              if (!target.classList?.contains("lesson-feedback-field")) setFocusedField("");
            }}
            onClick={(event) => {
              // 拖动手柄松手会补一个 click，直接清空会让右侧样式栏闪退。
              if (suppressDeselectRef.current) {
                suppressDeselectRef.current = false;
                return;
              }
              if (activeTool !== "select") return;
              // 绘图层在选择模式下不拦截指针，因此空白处的点击会冒泡到这里；
              // 命中图形就选中它，否则视为点空白、取消全部选中。
              const paper = event.currentTarget.getBoundingClientRect();
              const hit = nearestStrokeId(record.annotations, {
                x: (event.clientX - paper.left) * feedbackPageWidth / paper.width,
                y: (event.clientY - paper.top) * pageHeight / paper.height
              });
              setSelectedStrokeId(hit);
              if (hit) {
                setSelectedTextBoxId("");
                setFocusedCommentId("");
                return;
              }
              setSelectedTextBoxId("");
            }}
          >
            <canvas ref={sheetCanvasRef} className="lesson-feedback-sheet-canvas" style={{ width: feedbackPageWidth, height: pageHeight }} />

            <input
              className="lesson-feedback-field"
              style={cellStyle(layout.metaXs[1], layout.metaY, layout.metaXs[2] - layout.metaXs[1], layout.metaHeight, { align: "center", size: 13 })}
              value={record.teacherName}
              onChange={(event) => patchRecord({ teacherName: event.target.value })}
              onFocus={() => setFocusedField("teacherName")}
              aria-label="教师"
            />
            <input
              className="lesson-feedback-field"
              style={cellStyle(layout.metaXs[3], layout.metaY, layout.metaXs[4] - layout.metaXs[3], layout.metaHeight, { align: "center", size: 12 })}
              value={record.periodLabel}
              onChange={(event) => patchRecord({ periodLabel: event.target.value })}
              onFocus={() => setFocusedField("periodLabel")}
              aria-label="课次"
            />
            <input
              className="lesson-feedback-field"
              type="date"
              style={cellStyle(layout.metaXs[5], layout.metaY, layout.metaXs[6] - layout.metaXs[5], layout.metaHeight, { align: "center", size: 12 })}
              value={record.date}
              onChange={(event) => patchRecord({ date: event.target.value })}
              aria-label="日期"
            />

            {fieldHighlightLayer("content", layout.marginX + 84, layout.contentY, layout.contentWidth - 84, layout.contentHeight, 14, 10)}
            {fieldHighlightLayer("homework", layout.marginX + 84, layout.homeworkY, layout.contentWidth - 84, layout.homeworkHeight, 14, 10)}
            {fieldHighlightLayer("generalNotes", layout.rubricXs[1], layout.noteY, layout.contentWidth - 80, layout.noteHeight, 11, 6)}

            <textarea
              className="lesson-feedback-field lesson-feedback-field-block"
              style={{
                ...cellStyle(layout.marginX + 84, layout.contentY, layout.contentWidth - 84, layout.contentHeight, { size: fieldStyleOf("content", 14).fontSize, padding: 10 }),
                ...fieldTextStyle("content", 14)
              }}
              value={record.content}
              onChange={(event) => {
                const cleared = (record.fieldStyles?.content?.highlights?.length ?? 0) > 0;
                if (cleared) patchFieldStyle("content", { highlights: [] });
                patchRecord({ content: event.target.value });
              }}
              onFocus={() => setFocusedField("content")}
              onSelect={(event) => {
                const target = event.currentTarget;
                setTextSelection(
                  target.selectionStart === target.selectionEnd
                    ? null
                    : { boxId: "field:content", start: target.selectionStart, end: target.selectionEnd }
                );
              }}
              aria-label="上课内容"
            />
            <textarea
              className="lesson-feedback-field lesson-feedback-field-block"
              style={{
                ...cellStyle(layout.marginX + 84, layout.homeworkY, layout.contentWidth - 84, layout.homeworkHeight, { size: fieldStyleOf("homework", 14).fontSize, padding: 10 }),
                ...fieldTextStyle("homework", 14)
              }}
              value={record.homework}
              onChange={(event) => {
                const cleared = (record.fieldStyles?.homework?.highlights?.length ?? 0) > 0;
                if (cleared) patchFieldStyle("homework", { highlights: [] });
                patchRecord({ homework: event.target.value });
              }}
              onFocus={() => setFocusedField("homework")}
              onSelect={(event) => {
                const target = event.currentTarget;
                setTextSelection(
                  target.selectionStart === target.selectionEnd
                    ? null
                    : { boxId: "field:homework", start: target.selectionStart, end: target.selectionEnd }
                );
              }}
              aria-label="今日作业"
            />

            {record.students.map((student, index) => {
              const entry = record.entries[student.id];
              const rowY = layout.studentStartY + index * layout.studentRowHeight;
              const selected = selectedStudentIds.includes(student.id);
              const c = layout.cols;
              const marks = [
                { field: "attendance" as const, left: c[1], right: c[2] },
                { field: "listening" as const, left: c[3], right: c[4] },
                { field: "participation" as const, left: c[4], right: c[5] },
                { field: "notes" as const, left: c[5], right: c[6] }
              ];
              return (
                <div key={student.id}>
                  <button
                    type="button"
                    className={cn("lesson-feedback-name-cell", selected && "is-selected")}
                    style={cellStyle(c[0], rowY, c[1] - c[0], layout.studentRowHeight, { align: "center" })}
                    onClick={(event) => { event.stopPropagation(); toggleStudent(student.id); }}
                    title="点选可加入多人反馈"
                  >
                    <span>{student.name}</span>
                  </button>
                  <span className="lesson-feedback-order-buttons" style={{ top: rowY + 3, left: c[1] - 15 }}>
                    <button type="button" onClick={(event) => { event.stopPropagation(); moveStudent(student.id, -1); }} disabled={index === 0} title="上移"><ChevronUp size={10} /></button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); moveStudent(student.id, 1); }} disabled={index === record.students.length - 1} title="下移"><ChevronDown size={10} /></button>
                  </span>
                  {marks.map(({ field, left, right }) => (
                    <button
                      key={field}
                      type="button"
                      className={cn("lesson-feedback-mark-cell", markClass(entry?.[field] ?? ""))}
                      style={cellStyle(left, rowY, right - left, layout.studentRowHeight, { align: "center", size: field === "attendance" ? 18 : 16 })}
                      onClick={(event) => { event.stopPropagation(); cycleEntry(student.id, field); }}
                    >
                      {entry?.[field] || ""}
                    </button>
                  ))}
                  {/* 课后作业允许自定义文字（如“没带”“补交”），点右侧小按钮才在 A/B/C 间循环。 */}
                  <input
                    className={cn("lesson-feedback-mark-input", markClass(entry?.homework ?? ""))}
                    style={cellStyle(c[2], rowY, c[3] - c[2], layout.studentRowHeight, {
                      align: "center",
                      size: (entry?.homework ?? "").length > 1 ? 12 : 17
                    })}
                    value={entry?.homework ?? ""}
                    onChange={(event) => updateEntry(student.id, { homework: event.target.value })}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`${student.name} 课后作业`}
                    title="可直接输入文字，或用右侧按钮切换 A/B/C"
                  />
                  <button
                    type="button"
                    className="lesson-feedback-cycle-button"
                    style={{ top: rowY + 3, left: c[3] - 15 }}
                    onClick={(event) => { event.stopPropagation(); cycleEntry(student.id, "homework"); }}
                    title="切换 A / B / C"
                  >
                    A
                  </button>
                  {(entry?.commentHighlights?.length ?? 0) > 0 && (
                    <div
                      className="lesson-feedback-highlight-layer"
                      // z-index 2：压在骨架 canvas(1) 之上、表单控件(3) 之下，否则会被 canvas 盖住。
                      style={{ left: c[6] + 1, top: rowY + 1, width: c[7] - c[6] - 2, height: layout.studentRowHeight - 2, right: "auto", bottom: "auto", zIndex: 2 }}
                      aria-hidden="true"
                    >
                      {commentHighlightRects(entry).map((rect, index) => (
                        <span
                          key={`${student.id}-hl-${index}`}
                          style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, background: rect.color }}
                        />
                      ))}
                    </div>
                  )}
                  <textarea
                    className="lesson-feedback-field lesson-feedback-comment-cell"
                    style={{
                      ...cellStyle(c[6], rowY, c[7] - c[6], layout.studentRowHeight, {
                        size: entry?.commentFontSize ?? 11.5,
                        padding: 5
                      }),
                      color: entry?.commentColor ?? undefined,
                      fontWeight: entry?.commentFontWeight ?? undefined
                    }}
                    value={entry?.comment ?? ""}
                    onChange={(event) => {
                      // 与文本框同一约定：文字一改就丢掉旧标记，避免下标错位。
                      const cleared = (entry?.commentHighlights?.length ?? 0) > 0 && event.target.value !== entry?.comment;
                      updateEntry(student.id, cleared
                        ? { comment: event.target.value, commentHighlights: [] }
                        : { comment: event.target.value });
                    }}
                    onFocus={() => { setFocusedCommentId(student.id); setSelectedTextBoxId(""); }}
                    onSelect={(event) => {
                      const target = event.currentTarget;
                      setTextSelection(
                        target.selectionStart === target.selectionEnd
                          ? null
                          : { boxId: `comment:${student.id}`, start: target.selectionStart, end: target.selectionEnd }
                      );
                    }}
                    aria-label={`${student.name} 综合评价`}
                  />
                </div>
              );
            })}

            <textarea
              className="lesson-feedback-field lesson-feedback-field-block"
              style={{
                ...cellStyle(layout.rubricXs[1], layout.noteY, layout.contentWidth - 80, layout.noteHeight, { size: fieldStyleOf("generalNotes", 11).fontSize, padding: 6 }),
                ...fieldTextStyle("generalNotes", 11)
              }}
              value={record.generalNotes}
              onChange={(event) => {
                const cleared = (record.fieldStyles?.generalNotes?.highlights?.length ?? 0) > 0;
                if (cleared) patchFieldStyle("generalNotes", { highlights: [] });
                patchRecord({ generalNotes: event.target.value });
              }}
              onFocus={() => setFocusedField("generalNotes")}
              onSelect={(event) => {
                const target = event.currentTarget;
                setTextSelection(
                  target.selectionStart === target.selectionEnd
                    ? null
                    : { boxId: "field:generalNotes", start: target.selectionStart, end: target.selectionEnd }
                );
              }}
              aria-label="备注"
            />

            <svg className="lesson-feedback-connector-layer" width={feedbackPageWidth} height={pageHeight} viewBox={`0 0 ${feedbackPageWidth} ${pageHeight}`} aria-hidden="true">
              {record.textBoxes.flatMap((box) => {
                const geo = feedbackBraceGeometry(box, record, layout);
                if (!geo) return [];
                const bands = box.showBand ? box.studentIds.map((studentId) => {
                  const index = record.students.findIndex((student) => student.id === studentId);
                  if (index < 0) return null;
                  return (
                    <rect
                      key={`${box.id}-band-${studentId}`}
                      x={layout.cols[0]}
                      y={layout.studentStartY + index * layout.studentRowHeight}
                      width={layout.cols[7] - layout.cols[0]}
                      height={layout.studentRowHeight}
                      fill={geo.color}
                      opacity="0.14"
                    />
                  );
                }) : [];
                const branches = geo.nodes.flatMap((node) => [
                  <path key={`${box.id}-path-${node.id}`} d={feedbackBracePath(node, geo.tip)} fill="none" stroke={geo.color} strokeWidth={geo.width} strokeLinecap="round" />,
                  <circle key={`${box.id}-dot-${node.id}`} cx={node.x} cy={node.y} r={Math.max(2.4, geo.width + 0.6)} fill={geo.color} />
                ]);
                // 每个学生一个独立手柄，另加文本框侧的汇聚点手柄。
                const handles = selectedTextBoxId === box.id && activeTool === "select" ? [
                  <circle
                    key={`${box.id}-tip-handle`}
                    className="lesson-feedback-brace-handle"
                    cx={geo.tip.x}
                    cy={geo.tip.y}
                    r={10}
                    fill="#ffffff"
                    fillOpacity="0.35"
                    stroke={geo.color}
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    onPointerDown={(event) => beginBraceDrag(event, box)}
                  />,
                  ...geo.nodes.map((node) => (
                    <circle
                      key={`${box.id}-node-handle-${node.id}`}
                      className="lesson-feedback-brace-handle"
                      cx={node.x}
                      cy={node.y}
                      r={10}
                      fill="#ffffff"
                      fillOpacity="0.35"
                      stroke="#d92d20"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      onPointerDown={(event) => beginBraceDrag(event, box, node.id)}
                    />
                  ))
                ] : [];
                return [
                  ...bands,
                  ...branches,
                  <circle key={`${box.id}-tip`} cx={geo.tip.x} cy={geo.tip.y} r={Math.max(2.6, geo.width + 1)} fill={geo.color} />,
                  ...handles
                ];
              })}
            </svg>

            {record.textBoxes.map((box) => (
              <div
                key={box.id}
                className={cn("lesson-feedback-text-box", selectedTextBoxId === box.id && "is-selected", activeTool !== "select" && "is-disabled")}
                style={{
                  left: box.x,
                  top: box.y,
                  width: box.width,
                  height: box.height,
                  borderColor: box.borderColor,
                  borderStyle: box.borderStyle ?? "dashed",
                  borderWidth: (box.borderStyle ?? "dashed") === "none" ? 0 : (box.borderWidth ?? 1.5),
                  background: box.backgroundColor,
                  color: box.color
                }}
                onClick={(event) => { event.stopPropagation(); setSelectedTextBoxId(box.id); }}
              >
                <button type="button" className="lesson-feedback-box-handle" onPointerDown={(event) => beginBoxInteraction(event, box, "move")} title="拖动文本框">
                  <span>{box.studentIds.length > 0 ? `${box.studentIds.length} 人反馈` : "文本框"}</span>
                </button>
                {/* 荧光层垫在 textarea 下方：文字仍由 textarea 正常渲染，这里只画底色矩形。 */}
                {/* 荧光层与文字区严格同框：inset 取 CSS 边框宽度，内部坐标即页面坐标减去内容区原点。 */}
                <div
                  className="lesson-feedback-highlight-layer"
                  style={{ inset: (box.borderStyle ?? "dashed") === "none" ? 0 : (box.borderWidth ?? 1.5) }}
                  aria-hidden="true"
                >
                  {highlightRectsFor(box).map((rect, index) => (
                    <span
                      key={`${box.id}-hl-${index}`}
                      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, background: rect.color }}
                    />
                  ))}
                </div>
                <textarea
                  ref={(node) => { textAreaRefs.current[box.id] = node; }}
                  value={box.text}
                  placeholder={box.studentIds.length > 0 ? "点击填写多人反馈" : "输入批注"}
                  style={{ color: box.color, fontSize: box.fontSize, fontWeight: box.fontWeight }}
                  onChange={(event) => {
                    // 文本一改就丢掉旧标记：字符下标已经错位，与其猜测偏移不如重标。
                    const cleared = (box.highlights?.length ?? 0) > 0 && event.target.value !== box.text;
                    patchTextBox(box.id, cleared ? { text: event.target.value, highlights: [] } : { text: event.target.value });
                  }}
                  onSelect={(event) => {
                    const target = event.currentTarget;
                    setTextSelection(
                      target.selectionStart === target.selectionEnd
                        ? null
                        : { boxId: box.id, start: target.selectionStart, end: target.selectionEnd }
                    );
                  }}
                />
                {selectedTextBoxId === box.id && (
                  <>
                    <button type="button" className="lesson-feedback-box-delete" onClick={() => deleteTextBox(box.id)} title="删除文本框"><Trash2 size={13} /></button>
                    <button type="button" className="lesson-feedback-box-resize" onPointerDown={(event) => beginBoxInteraction(event, box, "resize")} title="调整大小" />
                  </>
                )}
              </div>
            ))}

            {showsBrushCursor && brushCursor && (
              <span
                className={cn("lesson-feedback-brush-cursor", activeTool === "eraser" && "is-eraser")}
                style={{
                  left: brushCursor.x,
                  top: brushCursor.y,
                  width: brushDiameter,
                  height: brushDiameter,
                  borderColor: activeTool === "eraser" ? undefined : activeColor
                }}
                aria-hidden="true"
              />
            )}

            {selectedStroke && activeTool === "select" && (() => {
              const xs = selectedStroke.points.map((point) => point.x);
              const ys = selectedStroke.points.map((point) => point.y);
              const pad = Math.max(8, selectedStroke.width);
              const left = Math.min(...xs) - pad;
              const top = Math.min(...ys) - pad;
              const width = Math.max(...xs) - Math.min(...xs) + pad * 2;
              const height = Math.max(...ys) - Math.min(...ys) + pad * 2;
              return (
                <div
                  className="lesson-feedback-stroke-frame"
                  style={{ left, top, width, height }}
                  onPointerDown={(event) => beginStrokeDrag(event, selectedStroke, "move")}
                  title="拖动移动图形"
                >
                  {strokeDrag?.mode === "resize" && strokeDrag.id === selectedStroke.id && (
                    <span className="lesson-feedback-stroke-tip">按住 Shift 不变形</span>
                  )}
                  <span
                    className="lesson-feedback-stroke-resize"
                    onPointerDown={(event) => beginStrokeDrag(event, selectedStroke, "resize")}
                    title="拖动缩放；按住 Shift 保持比例不变形"
                  />
                </div>
              );
            })()}

            {draftBox && (
              <div
                className="lesson-feedback-draft-box"
                style={{ left: draftBox.x, top: draftBox.y, width: draftBox.width, height: draftBox.height, borderColor: activeColor }}
                aria-hidden="true"
              />
            )}

            <canvas
              ref={canvasRef}
              className="lesson-feedback-ink-canvas"
              style={{ width: feedbackPageWidth, height: pageHeight, pointerEvents: isDrawingTool ? "auto" : "none" }}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={finishCanvasStroke}
              onPointerCancel={() => { setDraftStroke(null); setDraftBox(null); }}
              onPointerLeave={() => setBrushCursor(null)}
            />
          </div>
          </div>
        </div>

        <aside className={cn("lesson-feedback-siderail", !selectedBox && !focusedEntry && !selectedStroke && !hasHighlightTarget && !focusedField && "is-empty")} aria-label="样式设置">
          {hasHighlightTarget && (
            <div className="lesson-feedback-boxstyle-group">
              <span className="lesson-feedback-boxstyle-title">荧光标记</span>
              <span className="lesson-feedback-section-hint">
                {textSelection ? "点色块给选中的文字加底色" : "先选中文本框或评语里的几个字"}
              </span>
              <div className="lesson-feedback-palette">
                {feedbackHighlightColors.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className="lesson-feedback-dot"
                    style={{ background: preset.value }}
                    disabled={!textSelection}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applyHighlight(preset.value)}
                    title={preset.label}
                    aria-label={preset.label}
                  />
                ))}
                <label className="lesson-feedback-dot lesson-feedback-dot-custom" title="自定义荧光色">
                  <input
                    type="color"
                    value={customHighlight}
                    disabled={!textSelection}
                    onChange={(event) => {
                      setCustomHighlight(event.target.value);
                      applyHighlight(hexToHighlight(event.target.value));
                    }}
                  />
                </label>
              </div>
              {highlightTargetMarks.length > 0 && (
                <button type="button" className="lesson-feedback-wide-button" onClick={() => clearHighlights(highlightTargetId)}>
                  清除荧光标记
                </button>
              )}
            </div>
          )}

          {selectedStroke ? (
            <div className="lesson-feedback-boxstyle" aria-label="图形样式">
              <div className="lesson-feedback-boxstyle-group">
                <span className="lesson-feedback-boxstyle-title">{strokeToolLabel(selectedStroke.tool)}</span>
                <span className="lesson-feedback-boxstyle-label">线条粗细 {selectedStroke.width}px</span>
                <div className="lesson-feedback-segment" role="group" aria-label="线条粗细">
                  <button type="button" className="lesson-feedback-segment-item" onClick={() => patchStroke(selectedStroke.id, { width: clamp(selectedStroke.width - 1, 1, 24) })}>细</button>
                  <button type="button" className="lesson-feedback-segment-item" onClick={() => patchStroke(selectedStroke.id, { width: clamp(selectedStroke.width + 1, 1, 24) })}>粗</button>
                </div>

                <span className="lesson-feedback-boxstyle-label">颜色</span>
                <div className="lesson-feedback-palette">
                  {presetColors.map((preset) => (
                    <button
                      key={`stroke-${preset.value}`}
                      type="button"
                      className={cn("lesson-feedback-dot", selectedStroke.color.toLowerCase() === preset.value && "is-active")}
                      style={{ background: preset.value }}
                      onClick={() => patchStroke(selectedStroke.id, { color: preset.value })}
                      title={preset.label}
                      aria-label={`图形 ${preset.label}`}
                    />
                  ))}
                  <label className="lesson-feedback-dot lesson-feedback-dot-custom" title="自定义颜色">
                    <input type="color" value={selectedStroke.color} onChange={(event) => patchStroke(selectedStroke.id, { color: event.target.value })} />
                  </label>
                </div>

                <button
                  type="button"
                  className="lesson-feedback-danger-button"
                  onClick={() => {
                    const next = cloneRecord(record);
                    next.annotations = next.annotations.filter((stroke) => stroke.id !== selectedStroke.id);
                    setSelectedStrokeId("");
                    emit(next);
                  }}
                >
                  <Trash2 size={13} /> 删除这个图形
                </button>
              </div>
            </div>
          ) : selectedBox ? (
            <div className="lesson-feedback-boxstyle" aria-label="文本框样式">
              <div className="lesson-feedback-boxstyle-group">
                <span className="lesson-feedback-boxstyle-title">外框</span>
                <span className="lesson-feedback-boxstyle-label">边框线型</span>
                <div className="lesson-feedback-segment" role="group" aria-label="边框线型">
                  {([
                    { value: "dashed", label: "虚线" },
                    { value: "solid", label: "实线" },
                    { value: "none", label: "无框" }
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={cn("lesson-feedback-segment-item", (selectedBox.borderStyle ?? "dashed") === option.value && "is-active")}
                      onClick={() => patchTextBox(selectedBox.id, { borderStyle: option.value })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <span className="lesson-feedback-boxstyle-label">边框粗细 {(selectedBox.borderWidth ?? 1.5)}px</span>
                <div className="lesson-feedback-segment" role="group" aria-label="边框粗细">
                  <button type="button" className="lesson-feedback-segment-item" onClick={() => patchTextBox(selectedBox.id, { borderWidth: clamp(Math.round(((selectedBox.borderWidth ?? 1.5) - 0.5) * 2) / 2, 0.5, 6) })}>细</button>
                  <button type="button" className="lesson-feedback-segment-item" onClick={() => patchTextBox(selectedBox.id, { borderWidth: clamp(Math.round(((selectedBox.borderWidth ?? 1.5) + 0.5) * 2) / 2, 0.5, 6) })}>粗</button>
                </div>

                <span className="lesson-feedback-boxstyle-label">边框与连线颜色</span>
                <div className="lesson-feedback-palette">
                  {presetColors.map((preset) => (
                    <button
                      key={`border-${preset.value}`}
                      type="button"
                      className={cn("lesson-feedback-dot", selectedBox.borderColor.toLowerCase() === preset.value && "is-active")}
                      style={{ background: preset.value }}
                      onClick={() => patchTextBox(selectedBox.id, { borderColor: preset.value })}
                      title={preset.label}
                      aria-label={`边框 ${preset.label}`}
                    />
                  ))}
                  <label className="lesson-feedback-dot lesson-feedback-dot-custom" title="自定义边框颜色">
                    <input type="color" value={selectedBox.borderColor} onChange={(event) => patchTextBox(selectedBox.id, { borderColor: event.target.value })} />
                  </label>
                </div>
              </div>

              <div className="lesson-feedback-boxstyle-group">
                <span className="lesson-feedback-boxstyle-title">框内文字</span>
                <span className="lesson-feedback-boxstyle-label">字重</span>
                <div className="lesson-feedback-segment" role="group" aria-label="文字字重">
                  {([
                    { value: 400, label: "常规" },
                    { value: 700, label: "加粗" }
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={cn("lesson-feedback-segment-item", selectedBox.fontWeight === option.value && "is-active")}
                      onClick={() => patchTextBox(selectedBox.id, { fontWeight: option.value })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <span className="lesson-feedback-boxstyle-label">字号 {selectedBox.fontSize}px</span>
                <div className="lesson-feedback-segment" role="group" aria-label="文字字号">
                  <button type="button" className="lesson-feedback-segment-item" onClick={() => patchTextBox(selectedBox.id, { fontSize: clamp(selectedBox.fontSize - 1, 9, 22) })}>A−</button>
                  <button type="button" className="lesson-feedback-segment-item" onClick={() => patchTextBox(selectedBox.id, { fontSize: clamp(selectedBox.fontSize + 1, 9, 22) })}>A＋</button>
                </div>

                <span className="lesson-feedback-boxstyle-label">文字颜色</span>
                <div className="lesson-feedback-palette">
                  {presetColors.map((preset) => (
                    <button
                      key={`text-${preset.value}`}
                      type="button"
                      className={cn("lesson-feedback-dot", selectedBox.color.toLowerCase() === preset.value && "is-active")}
                      style={{ background: preset.value }}
                      onClick={() => patchTextBox(selectedBox.id, { color: preset.value })}
                      title={preset.label}
                      aria-label={`文字 ${preset.label}`}
                    />
                  ))}
                  <label className="lesson-feedback-dot lesson-feedback-dot-custom" title="自定义文字颜色">
                    <input type="color" value={selectedBox.color} onChange={(event) => patchTextBox(selectedBox.id, { color: event.target.value })} />
                  </label>
                </div>
              </div>

              {selectedBox.studentIds.length > 0 && (
                <button
                  type="button"
                  className="lesson-feedback-toggle"
                  role="switch"
                  aria-checked={selectedBox.showBand}
                  onClick={() => patchTextBox(selectedBox.id, { showBand: !selectedBox.showBand })}
                >
                  <span>分组色带</span>
                  <span className={cn("lesson-feedback-toggle-track", selectedBox.showBand && "is-on")}>
                    <span className="lesson-feedback-toggle-knob" />
                  </span>
                </button>
              )}
            </div>
          ) : focusedField ? (
            <div className="lesson-feedback-boxstyle" aria-label="字段文字样式">
              <div className="lesson-feedback-boxstyle-group">
                <span className="lesson-feedback-boxstyle-title">{fieldLabels[focusedField]}</span>
                <span className="lesson-feedback-boxstyle-label">字重</span>
                <div className="lesson-feedback-segment" role="group" aria-label="字段字重">
                  {([
                    { value: 400, label: "常规" },
                    { value: 700, label: "加粗" }
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={cn("lesson-feedback-segment-item", fieldStyleOf(focusedField, 12).fontWeight === option.value && "is-active")}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => patchFieldStyle(focusedField, { fontWeight: option.value })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <span className="lesson-feedback-boxstyle-label">字号 {fieldStyleOf(focusedField, fieldDefaultSizes[focusedField]).fontSize}px</span>
                <div className="lesson-feedback-segment" role="group" aria-label="字段字号">
                  <button
                    type="button"
                    className="lesson-feedback-segment-item"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => patchFieldStyle(focusedField, { fontSize: clamp(fieldStyleOf(focusedField, fieldDefaultSizes[focusedField]).fontSize - 1, 8, 22) })}
                  >
                    A−
                  </button>
                  <button
                    type="button"
                    className="lesson-feedback-segment-item"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => patchFieldStyle(focusedField, { fontSize: clamp(fieldStyleOf(focusedField, fieldDefaultSizes[focusedField]).fontSize + 1, 8, 22) })}
                  >
                    A＋
                  </button>
                </div>

                <span className="lesson-feedback-boxstyle-label">文字颜色</span>
                <div className="lesson-feedback-palette">
                  {presetColors.map((preset) => (
                    <button
                      key={`field-${preset.value}`}
                      type="button"
                      className={cn("lesson-feedback-dot", (fieldStyleOf(focusedField, 12).color ?? "").toLowerCase() === preset.value && "is-active")}
                      style={{ background: preset.value }}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => patchFieldStyle(focusedField, { color: preset.value })}
                      title={preset.label}
                      aria-label={`字段 ${preset.label}`}
                    />
                  ))}
                  <label className="lesson-feedback-dot lesson-feedback-dot-custom" title="自定义文字颜色">
                    <input
                      type="color"
                      value={fieldStyleOf(focusedField, 12).color ?? "#1f2523"}
                      onChange={(event) => patchFieldStyle(focusedField, { color: event.target.value })}
                    />
                  </label>
                </div>

                <button
                  type="button"
                  className="lesson-feedback-wide-button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => patchFieldStyle(focusedField, { color: undefined, fontSize: undefined, fontWeight: undefined })}
                >
                  恢复默认样式
                </button>
              </div>
            </div>
          ) : focusedEntry ? (
            <div className="lesson-feedback-boxstyle" aria-label="评语样式">
              <div className="lesson-feedback-boxstyle-group">
                <span className="lesson-feedback-boxstyle-title">{focusedEntry.name} 的评语</span>
                <span className="lesson-feedback-boxstyle-label">字重</span>
                <div className="lesson-feedback-segment" role="group" aria-label="评语字重">
                  {([
                    { value: 400, label: "常规" },
                    { value: 700, label: "加粗" }
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={cn("lesson-feedback-segment-item", (focusedEntry.entry.commentFontWeight ?? 400) === option.value && "is-active")}
                      onClick={() => updateEntry(focusedEntry.id, { commentFontWeight: option.value })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <span className="lesson-feedback-boxstyle-label">字号 {focusedEntry.entry.commentFontSize ?? 11.5}px</span>
                <div className="lesson-feedback-segment" role="group" aria-label="评语字号">
                  <button type="button" className="lesson-feedback-segment-item" onClick={() => updateEntry(focusedEntry.id, { commentFontSize: clamp((focusedEntry.entry.commentFontSize ?? 11.5) - 1, 8, 18) })}>A−</button>
                  <button type="button" className="lesson-feedback-segment-item" onClick={() => updateEntry(focusedEntry.id, { commentFontSize: clamp((focusedEntry.entry.commentFontSize ?? 11.5) + 1, 8, 18) })}>A＋</button>
                </div>

                <span className="lesson-feedback-boxstyle-label">文字颜色</span>
                <div className="lesson-feedback-palette">
                  {presetColors.map((preset) => (
                    <button
                      key={`comment-${preset.value}`}
                      type="button"
                      className={cn("lesson-feedback-dot", (focusedEntry.entry.commentColor ?? "").toLowerCase() === preset.value && "is-active")}
                      style={{ background: preset.value }}
                      onClick={() => updateEntry(focusedEntry.id, { commentColor: preset.value })}
                      title={preset.label}
                      aria-label={`评语 ${preset.label}`}
                    />
                  ))}
                  <label className="lesson-feedback-dot lesson-feedback-dot-custom" title="自定义评语颜色">
                    <input type="color" value={focusedEntry.entry.commentColor ?? "#1f2523"} onChange={(event) => updateEntry(focusedEntry.id, { commentColor: event.target.value })} />
                  </label>
                </div>

                <button
                  type="button"
                  className="lesson-feedback-wide-button"
                  onClick={() => updateEntry(focusedEntry.id, { commentColor: undefined, commentFontSize: undefined, commentFontWeight: undefined })}
                >
                  恢复默认样式
                </button>
              </div>
            </div>
          ) : (
            <div className="lesson-feedback-siderail-hint">
              <Type size={20} />
              <strong>文字样式</strong>
              <span>选中文本框，或点进任一学生的综合评价，即可在这里调整字号、字重与颜色。</span>
            </div>
          )}
        </aside>
      </div>
      {exportMessage && <div className="lesson-feedback-editor-message">{exportMessage}</div>}
    </section>
  );
}

function cloneRecord(record: LessonFeedbackRecord): LessonFeedbackRecord {
  return typeof structuredClone === "function" ? structuredClone(record) : JSON.parse(JSON.stringify(record)) as LessonFeedbackRecord;
}

function trimHistory(stack: LessonFeedbackRecord[]): void {
  if (stack.length > 100) stack.splice(0, stack.length - 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));}

// 荧光底色必须半透明，否则会盖住文字。
function hexToHighlight(hex: string): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.42)`;
}

function strokeToolLabel(tool: LessonFeedbackStrokeTool): string {
  const labels: Record<LessonFeedbackStrokeTool, string> = {
    pen: "画笔",
    highlighter: "荧光笔",
    line: "直线",
    arrow: "箭头",
    ellipse: "圆圈",
    rect: "方框"
  };
  return labels[tool] ?? "图形";
}

function markClass(value: string): string {
  if (value === "A" || value === "√") return "is-good";
  if (value === "B" || value === "○") return "is-medium";
  if (value === "C" || value === "×") return "is-poor";
  return "";
}

function saveStateLabel(state: SaveState): string {
  if (state === "loading") return "正在读取反馈";
  if (state === "saving") return "正在加密保存";
  if (state === "saved") return "已加密同步";
  if (state === "error") return "保存失败";
  if (state === "conflict") return "云端版本冲突";
  return "自动保存";
}

function sanitizeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "课后反馈";
}

// 控件按单元格坐标绝对定位，四周内缩 1px 以免盖住骨架上的黑色边框。
function cellStyle(
  x: number,
  y: number,
  width: number,
  height: number,
  options: { align?: "left" | "center"; size?: number; padding?: number } = {}
): CSSProperties {
  return {
    left: x + 1,
    top: y + 1,
    width: width - 2,
    height: height - 2,
    textAlign: options.align === "center" ? "center" : "left",
    fontSize: options.size ?? 12,
    padding: options.padding == null ? undefined : `${Math.max(0, options.padding - 1)}px`
  };
}
