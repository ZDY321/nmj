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
  const [exportMessage, setExportMessage] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sheetCanvasRef = useRef<HTMLCanvasElement>(null);
  const latestRecordRef = useRef(record);
  const undoStackRef = useRef<LessonFeedbackRecord[]>([]);
  const redoStackRef = useRef<LessonFeedbackRecord[]>([]);
  const pageHeight = feedbackPageHeight(record);
  // 编辑器与导出共用同一份坐标，屏幕上的位置即导出图里的位置。
  const layout = useMemo(() => feedbackSheetLayout(record.students.length), [record.students.length]);
  const selectedBox = record.textBoxes.find((box) => box.id === selectedTextBoxId);
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
    const ratio = window.devicePixelRatio || 1;
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

  function addTextBox(point: LessonFeedbackPoint): void {
    const next = cloneRecord(record);
    const box: LessonFeedbackTextBox = {
      id: makeId("feedback_box"),
      x: clamp(point.x, 30, feedbackPageWidth - 230),
      y: clamp(point.y, 32, pageHeight - 120),
      width: 210,
      height: 86,
      text: "",
      color: "#25324a",
      fontSize: 13,
      fontWeight: 600,
      borderColor: activeColor,
      backgroundColor: "transparent",
      studentIds: [],
      showBand: false
    };
    next.textBoxes.push(box);
    emit(next);
    setSelectedTextBoxId(box.id);
    setActiveTool("select");
  }

  function patchTextBox(boxId: string, patch: Partial<LessonFeedbackTextBox>, history = false): void {
    const next = cloneRecord(record);
    const box = next.textBoxes.find((item) => item.id === boxId);
    if (!box) return;
    Object.assign(box, patch);
    emit(next, history);
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
      addTextBox(point);
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
          <label className="lesson-feedback-color" title="批注颜色">
            <input type="color" value={activeColor} onChange={(event) => setActiveColor(event.target.value)} />
          </label>
          <label className="lesson-feedback-width" title="线条粗细">
            <span>{penWidth}px</span>
            <input type="range" min="1" max="10" value={penWidth} onChange={(event) => setPenWidth(Number(event.target.value))} />
          </label>

          {selectedBox && (
            <>
              <div className="lesson-feedback-tool-divider" />
              <div className="lesson-feedback-boxstyle" aria-label="文本框样式">
                <span className="lesson-feedback-boxstyle-title">文本框</span>

                <div className="lesson-feedback-boxstyle-row" role="group" aria-label="边框样式">
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

                <div className="lesson-feedback-boxstyle-row" role="group" aria-label="字重">
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

                <div className="lesson-feedback-boxstyle-row" role="group" aria-label="字号">
                  <button type="button" className="lesson-feedback-chip" onClick={() => patchTextBox(selectedBox.id, { fontSize: clamp(selectedBox.fontSize - 1, 9, 22) })}>A-</button>
                  <span className="lesson-feedback-boxstyle-value">{selectedBox.fontSize}</span>
                  <button type="button" className="lesson-feedback-chip" onClick={() => patchTextBox(selectedBox.id, { fontSize: clamp(selectedBox.fontSize + 1, 9, 22) })}>A+</button>
                </div>

                <div className="lesson-feedback-boxstyle-row">
                  <label className="lesson-feedback-swatch" title="文字颜色">
                    <input type="color" value={selectedBox.color} onChange={(event) => patchTextBox(selectedBox.id, { color: event.target.value })} />
                    <span>文字</span>
                  </label>
                  <label className="lesson-feedback-swatch" title="边框与连线颜色">
                    <input type="color" value={selectedBox.borderColor} onChange={(event) => patchTextBox(selectedBox.id, { borderColor: event.target.value })} />
                    <span>边框</span>
                  </label>
                </div>

                {selectedBox.studentIds.length > 0 && (
                  <button
                    type="button"
                    className={cn("lesson-feedback-chip lesson-feedback-chip-wide", selectedBox.showBand && "is-active")}
                    onClick={() => patchTextBox(selectedBox.id, { showBand: !selectedBox.showBand })}
                  >
                    {selectedBox.showBand ? "隐藏色带" : "显示色带"}
                  </button>
                )}
              </div>
            </>
          )}
        </aside>

        <div className="lesson-feedback-paper-viewport">
          <div
            className={cn("lesson-feedback-paper", isDrawingTool && "is-drawing")}
            style={{ width: feedbackPageWidth, height: pageHeight }}
            onClick={() => setSelectedTextBoxId("")}
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
                { field: "homework" as const, left: c[2], right: c[3] },
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
                  <textarea
                    className="lesson-feedback-field lesson-feedback-comment-cell"
                    style={cellStyle(c[6], rowY, c[7] - c[6], layout.studentRowHeight, { size: 11.5, padding: 5 })}
                    value={entry?.comment ?? ""}
                    onChange={(event) => updateEntry(student.id, { comment: event.target.value })}
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
                return [
                  ...bands,
                  ...branches,
                  <circle key={`${box.id}-tip`} cx={geo.tip.x} cy={geo.tip.y} r={Math.max(2.6, geo.width + 1)} fill={geo.color} />
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

            <canvas
              ref={canvasRef}
              className="lesson-feedback-ink-canvas"
              style={{ width: feedbackPageWidth, height: pageHeight, pointerEvents: isDrawingTool ? "auto" : "none" }}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={finishCanvasStroke}
              onPointerCancel={() => setDraftStroke(null)}
            />
          </div>
        </div>
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
