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
  const focusedStudent = record.students.find((student) => student.id === focusedCommentId);
  const focusedEntry = focusedStudent
    ? { id: focusedStudent.id, name: focusedStudent.name, entry: record.entries[focusedStudent.id] ?? blankEntry }
    : null;
  const isDrawingTool = activeTool !== "select";

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
    record.annotations.forEach((stroke) => drawFeedbackStroke(context, stroke));
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
    const box: LessonFeedbackTextBox = {
      id: makeId("feedback_box"),
      // 落在“综合评价及建议”列内，括号自左侧汇聚过来。
      x: layout.cols[6] + 6,
      y: clamp(layout.studentStartY + firstRow * layout.studentRowHeight + 4, layout.studentStartY + 4, pageHeight - 130),
      width: layout.cols[7] - layout.cols[6] - 12,
      height: Math.max(54, (lastRow - firstRow + 1) * layout.studentRowHeight - 8),
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
            <span className="lesson-feedback-section-title">显示比例 {Math.round(zoom * 100)}%</span>
            <span className="lesson-feedback-section-hint">只影响屏幕显示，导出图始终为原始清晰度</span>
            <div className="lesson-feedback-boxstyle-row">
              <button type="button" className="lesson-feedback-chip" onClick={() => setZoom((current) => clamp(Math.round((current - 0.1) * 10) / 10, 0.5, 2))}>-</button>
              <button type="button" className="lesson-feedback-chip" onClick={() => setZoom(1)}>100%</button>
              <button type="button" className="lesson-feedback-chip" onClick={() => setZoom((current) => clamp(Math.round((current + 0.1) * 10) / 10, 0.5, 2))}>+</button>
            </div>
          </div>
          <div className="lesson-feedback-section">
            <span className="lesson-feedback-section-title">画笔粗细 {penWidth}px</span>
            <input className="lesson-feedback-range" type="range" min="1" max="10" value={penWidth} onChange={(event) => setPenWidth(Number(event.target.value))} />
          </div>

        </aside>

        <div className="lesson-feedback-paper-viewport">
          <div className="lesson-feedback-paper-stage" style={{ width: feedbackPageWidth * zoom, height: pageHeight * zoom }}>
          <div
            className={cn("lesson-feedback-paper", isDrawingTool && "is-drawing")}
            style={{ width: feedbackPageWidth, height: pageHeight, transform: `scale(${zoom})` }}
            onClick={() => {
              // 拖动手柄松手会补一个 click，直接清空会让右侧样式栏闪退。
              if (suppressDeselectRef.current) {
                suppressDeselectRef.current = false;
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
              aria-label="教师"
            />
            <input
              className="lesson-feedback-field"
              style={cellStyle(layout.metaXs[3], layout.metaY, layout.metaXs[4] - layout.metaXs[3], layout.metaHeight, { align: "center", size: 12 })}
              value={record.periodLabel}
              onChange={(event) => patchRecord({ periodLabel: event.target.value })}
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

            <textarea
              className="lesson-feedback-field lesson-feedback-field-block"
              style={cellStyle(layout.marginX + 84, layout.contentY, layout.contentWidth - 84, layout.contentHeight, { size: 14, padding: 10 })}
              value={record.content}
              onChange={(event) => patchRecord({ content: event.target.value })}
              aria-label="上课内容"
            />
            <textarea
              className="lesson-feedback-field lesson-feedback-field-block"
              style={cellStyle(layout.marginX + 84, layout.homeworkY, layout.contentWidth - 84, layout.homeworkHeight, { size: 14, padding: 10 })}
              value={record.homework}
              onChange={(event) => patchRecord({ homework: event.target.value })}
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
                    onChange={(event) => updateEntry(student.id, { comment: event.target.value })}
                    onFocus={() => { setFocusedCommentId(student.id); setSelectedTextBoxId(""); }}
                    aria-label={`${student.name} 综合评价`}
                  />
                </div>
              );
            })}

            <textarea
              className="lesson-feedback-field lesson-feedback-field-block"
              style={cellStyle(layout.rubricXs[1], layout.noteY, layout.contentWidth - 80, layout.noteHeight, { size: 11, padding: 6 })}
              value={record.generalNotes}
              onChange={(event) => patchRecord({ generalNotes: event.target.value })}
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
                <textarea
                  value={box.text}
                  placeholder={box.studentIds.length > 0 ? "点击填写多人反馈" : "输入批注"}
                  style={{ color: box.color, fontSize: box.fontSize, fontWeight: box.fontWeight }}
                  onChange={(event) => patchTextBox(box.id, { text: event.target.value })}
                />
                {selectedTextBoxId === box.id && (
                  <>
                    <button type="button" className="lesson-feedback-box-delete" onClick={() => deleteTextBox(box.id)} title="删除文本框"><Trash2 size={13} /></button>
                    <button type="button" className="lesson-feedback-box-resize" onPointerDown={(event) => beginBoxInteraction(event, box, "resize")} title="调整大小" />
                  </>
                )}
              </div>
            ))}

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
            />
          </div>
          </div>
        </div>

        <aside className={cn("lesson-feedback-siderail", !selectedBox && !focusedEntry && "is-empty")} aria-label="文本框样式">
          {selectedBox ? (
            <div className="lesson-feedback-boxstyle" aria-label="文本框样式">
              <div className="lesson-feedback-boxstyle-group">
                <span className="lesson-feedback-boxstyle-title">外框</span>
                <span className="lesson-feedback-boxstyle-label">边框线型</span>
                <div className="lesson-feedback-boxstyle-row" role="group" aria-label="边框线型">
                  {([
                    { value: "dashed", label: "虚线" },
                    { value: "solid", label: "实线" },
                    { value: "none", label: "无框" }
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={cn("lesson-feedback-chip", (selectedBox.borderStyle ?? "dashed") === option.value && "is-active")}
                      onClick={() => patchTextBox(selectedBox.id, { borderStyle: option.value })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <span className="lesson-feedback-boxstyle-label">边框粗细 {(selectedBox.borderWidth ?? 1.5)}px</span>
                <div className="lesson-feedback-boxstyle-row">
                  <button type="button" className="lesson-feedback-chip" onClick={() => patchTextBox(selectedBox.id, { borderWidth: clamp(Math.round(((selectedBox.borderWidth ?? 1.5) - 0.5) * 2) / 2, 0.5, 6) })}>细</button>
                  <button type="button" className="lesson-feedback-chip" onClick={() => patchTextBox(selectedBox.id, { borderWidth: clamp(Math.round(((selectedBox.borderWidth ?? 1.5) + 0.5) * 2) / 2, 0.5, 6) })}>粗</button>
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
                <div className="lesson-feedback-boxstyle-row" role="group" aria-label="文字字重">
                  {([
                    { value: 400, label: "常规" },
                    { value: 700, label: "加粗" }
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={cn("lesson-feedback-chip", selectedBox.fontWeight === option.value && "is-active")}
                      onClick={() => patchTextBox(selectedBox.id, { fontWeight: option.value })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <span className="lesson-feedback-boxstyle-label">字号 {selectedBox.fontSize}px</span>
                <div className="lesson-feedback-boxstyle-row" role="group" aria-label="文字字号">
                  <button type="button" className="lesson-feedback-chip" onClick={() => patchTextBox(selectedBox.id, { fontSize: clamp(selectedBox.fontSize - 1, 9, 22) })}>A-</button>
                  <button type="button" className="lesson-feedback-chip" onClick={() => patchTextBox(selectedBox.id, { fontSize: clamp(selectedBox.fontSize + 1, 9, 22) })}>A+</button>
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
                  className={cn("lesson-feedback-chip lesson-feedback-chip-wide", selectedBox.showBand && "is-active")}
                  onClick={() => patchTextBox(selectedBox.id, { showBand: !selectedBox.showBand })}
                >
                  {selectedBox.showBand ? "隐藏分组色带" : "显示分组色带"}
                </button>
              )}
            </div>
          ) : focusedEntry ? (
            <div className="lesson-feedback-boxstyle" aria-label="评语样式">
              <div className="lesson-feedback-boxstyle-group">
                <span className="lesson-feedback-boxstyle-title">{focusedEntry.name} 的评语</span>
                <span className="lesson-feedback-boxstyle-label">字重</span>
                <div className="lesson-feedback-boxstyle-row" role="group" aria-label="评语字重">
                  {([
                    { value: 400, label: "常规" },
                    { value: 700, label: "加粗" }
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={cn("lesson-feedback-chip", (focusedEntry.entry.commentFontWeight ?? 400) === option.value && "is-active")}
                      onClick={() => updateEntry(focusedEntry.id, { commentFontWeight: option.value })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <span className="lesson-feedback-boxstyle-label">字号 {focusedEntry.entry.commentFontSize ?? 11.5}px</span>
                <div className="lesson-feedback-boxstyle-row" role="group" aria-label="评语字号">
                  <button type="button" className="lesson-feedback-chip" onClick={() => updateEntry(focusedEntry.id, { commentFontSize: clamp((focusedEntry.entry.commentFontSize ?? 11.5) - 1, 8, 18) })}>A-</button>
                  <button type="button" className="lesson-feedback-chip" onClick={() => updateEntry(focusedEntry.id, { commentFontSize: clamp((focusedEntry.entry.commentFontSize ?? 11.5) + 1, 8, 18) })}>A+</button>
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
                  className="lesson-feedback-chip lesson-feedback-chip-wide"
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

function nearestStrokeId(strokes: LessonFeedbackStroke[], point: LessonFeedbackPoint): string {
  let nearest = "";
  let distance = 20;
  strokes.forEach((stroke) => {
    stroke.points.forEach((candidate) => {
      const nextDistance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (nextDistance < distance) {
        distance = nextDistance;
        nearest = stroke.id;
      }
    });
  });
  return nearest;
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
