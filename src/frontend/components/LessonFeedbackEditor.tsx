import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
  feedbackStudentRowHeight,
  feedbackStudentTableTop,
  lessonFeedbackPngBlob
} from "@/frontend/lib/lessonFeedbackExport";
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
  const latestRecordRef = useRef(record);
  const undoStackRef = useRef<LessonFeedbackRecord[]>([]);
  const redoStackRef = useRef<LessonFeedbackRecord[]>([]);
  const pageHeight = feedbackPageHeight(record);
  const isDrawingTool = activeTool !== "select";

  latestRecordRef.current = record;

  useEffect(() => {
    setSelectedStudentIds((current) => current.filter((studentId) => record.students.some((student) => student.id === studentId)));
    if (selectedTextBoxId && !record.textBoxes.some((box) => box.id === selectedTextBoxId)) setSelectedTextBoxId("");
  }, [record.id, record.students, record.textBoxes, selectedTextBoxId]);

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
    feedbackStudentTableTop + 66 + index * feedbackStudentRowHeight + feedbackStudentRowHeight / 2
  ])), [record.students]);

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
    const centers = selectedStudentIds.map((studentId) => rowCenters.get(studentId)).filter((value): value is number => value != null);
    const centerY = centers.length > 0 ? centers.reduce((sum, value) => sum + value, 0) / centers.length : feedbackStudentTableTop + 100;
    const next = cloneRecord(record);
    const box: LessonFeedbackTextBox = {
      id: makeId("feedback_box"),
      x: 536,
      y: clamp(centerY - 48, feedbackStudentTableTop + 68, pageHeight - 130),
      width: 190,
      height: 96,
      text: "点击填写多人反馈",
      color: "#25324a",
      fontSize: 13,
      fontWeight: 600,
      borderColor: activeColor,
      backgroundColor: "#ffffff",
      studentIds: [...selectedStudentIds],
      showBand: true
    };
    next.textBoxes.push(box);
    emit(next);
    setSelectedTextBoxId(box.id);
    setActiveTool("select");
  }

  function addTextBox(point: LessonFeedbackPoint): void {
    const next = cloneRecord(record);
    const box: LessonFeedbackTextBox = {
      id: makeId("feedback_box"),
      x: clamp(point.x, 30, feedbackPageWidth - 230),
      y: clamp(point.y, 32, pageHeight - 120),
      width: 210,
      height: 86,
      text: "输入批注",
      color: "#25324a",
      fontSize: 13,
      fontWeight: 600,
      borderColor: activeColor,
      backgroundColor: "#ffffff",
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
        </aside>

        <div className="lesson-feedback-paper-viewport">
          <div
            className={cn("lesson-feedback-paper", isDrawingTool && "is-drawing")}
            style={{ width: feedbackPageWidth, height: pageHeight }}
            onClick={() => setSelectedTextBoxId("")}
          >
            <header className="lesson-feedback-paper-header">
              <h2>课堂学习反馈</h2>
              <div>{record.className} · {record.subject} · {record.date} · {record.periodLabel}</div>
              <div className="lesson-feedback-paper-meta">
                <span>教师：{record.teacherName || "未设置"}</span>
                <span>校区：{record.campusName || "未设置"}</span>
                <span>时间：{record.startTime && record.endTime ? `${record.startTime}-${record.endTime}` : "未设置"}</span>
              </div>
            </header>

            <label className="lesson-feedback-block lesson-feedback-content-block">
              <span>课堂内容</span>
              <textarea value={record.content} onChange={(event) => patchRecord({ content: event.target.value })} />
            </label>
            <label className="lesson-feedback-block lesson-feedback-homework-block">
              <span>今日作业</span>
              <textarea value={record.homework} onChange={(event) => patchRecord({ homework: event.target.value })} />
            </label>

            <div className="lesson-feedback-student-table">
              <div className="lesson-feedback-table-header">
                <span>学生</span><span>到课</span><span>作业</span><span>听课表现</span><span>课堂参与</span><span>课堂笔记</span><span>综合评价</span>
              </div>
              {record.students.map((student, index) => {
                const entry = record.entries[student.id];
                const selected = selectedStudentIds.includes(student.id);
                return (
                  <div key={student.id} className={cn("lesson-feedback-student-row", selected && "is-selected")}>
                    <div className="lesson-feedback-student-name">
                      <input type="checkbox" checked={selected} onChange={() => toggleStudent(student.id)} aria-label={`选择 ${student.name}`} />
                      <button type="button" onClick={() => toggleStudent(student.id)}>{student.name}</button>
                      <span className="lesson-feedback-order-buttons">
                        <button type="button" onClick={() => moveStudent(student.id, -1)} disabled={index === 0} title="上移"><ChevronUp size={12} /></button>
                        <button type="button" onClick={() => moveStudent(student.id, 1)} disabled={index === record.students.length - 1} title="下移"><ChevronDown size={12} /></button>
                      </span>
                    </div>
                    {(["attendance", "homework", "listening", "participation", "notes"] as const).map((field) => (
                      <button
                        key={field}
                        type="button"
                        className={cn("lesson-feedback-mark", markClass(entry?.[field] ?? ""))}
                        onClick={() => cycleEntry(student.id, field)}
                      >
                        {entry?.[field] || "-"}
                      </button>
                    ))}
                    <textarea value={entry?.comment ?? ""} onChange={(event) => updateEntry(student.id, { comment: event.target.value })} placeholder="个性化评价" />
                  </div>
                );
              })}
              {Array.from({ length: Math.max(8 - record.students.length, 0) }, (_, index) => <div className="lesson-feedback-empty-row" key={`empty-${index}`} />)}
            </div>

            <label className="lesson-feedback-general-notes" style={{ top: feedbackStudentTableTop + 66 + Math.max(record.students.length, 8) * feedbackStudentRowHeight + 24 }}>
              <span>本节补充说明</span>
              <textarea value={record.generalNotes} onChange={(event) => patchRecord({ generalNotes: event.target.value })} />
            </label>

            <svg className="lesson-feedback-connector-layer" width={feedbackPageWidth} height={pageHeight} viewBox={`0 0 ${feedbackPageWidth} ${pageHeight}`} aria-hidden="true">
              {record.textBoxes.flatMap((box) => {
                const centers = box.studentIds.map((studentId) => rowCenters.get(studentId)).filter((value): value is number => value != null);
                const band = box.showBand && centers.length > 0 ? (
                  <rect
                    key={`${box.id}-band`}
                    x="48"
                    y={Math.min(...centers) - feedbackStudentRowHeight / 2 + 2}
                    width="698"
                    height={Math.max(...centers) - Math.min(...centers) + feedbackStudentRowHeight - 4}
                    fill={box.borderColor}
                    opacity="0.08"
                  />
                ) : null;
                const lines = centers.map((centerY, index) => {
                  const targetX = box.x;
                  const targetY = clamp(centerY, box.y + 16, box.y + box.height - 16);
                  return <path key={`${box.id}-line-${index}`} d={`M 498 ${centerY} C 516 ${centerY}, ${targetX - 20} ${targetY}, ${targetX} ${targetY}`} fill="none" stroke={box.borderColor} strokeWidth="1.5" />;
                });
                return [band, ...lines];
              })}
            </svg>

            {record.textBoxes.map((box) => (
              <div
                key={box.id}
                className={cn("lesson-feedback-text-box", selectedTextBoxId === box.id && "is-selected", activeTool !== "select" && "is-disabled")}
                style={{ left: box.x, top: box.y, width: box.width, height: box.height, borderColor: box.borderColor, background: box.backgroundColor, color: box.color }}
                onClick={(event) => { event.stopPropagation(); setSelectedTextBoxId(box.id); }}
              >
                <button type="button" className="lesson-feedback-box-handle" onPointerDown={(event) => beginBoxInteraction(event, box, "move")} title="拖动文本框">
                  <span>{box.studentIds.length > 0 ? `${box.studentIds.length} 人反馈` : "文本框"}</span>
                </button>
                <textarea
                  value={box.text}
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
  return Math.min(Math.max(value, min), Math.max(min, max));
}

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
