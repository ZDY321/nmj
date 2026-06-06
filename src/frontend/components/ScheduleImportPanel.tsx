import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownUp, CheckCircle2, FileSpreadsheet, RefreshCw, Save, Search, SlidersHorizontal, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { CourseGroup, Lesson, TeacherVault } from "@/shared/types";
import { courseTypeLabel, createLessonFromCourse, sortCoursesByName } from "@/frontend/lib/helpers";
import {
  buildImportPreview,
  buildLessonsFromImportPreview,
  importMappingKey,
  parseScheduleWorkbookFiles,
  summarizeImportPreview,
  type ImportedScheduleLesson,
  type ImportMatchStatus,
  type ImportPreviewLesson,
  type ScheduleImportMapping
} from "@/frontend/lib/scheduleImport";

type ViewMode = "merged" | "table" | "system";
type StatusFilter = "all" | ImportMatchStatus;

const mappingStorageKey = "teacher-schedule-import-mapping-v1";

export function ScheduleImportPanel({
  vault,
  onAddLessons,
  onOpenLesson
}: {
  vault: TeacherVault;
  onAddLessons: (lessons: Lesson[], options?: { replaceLessonIds?: string[] }) => void;
  onOpenLesson: (lesson: Lesson) => void;
}) {
  const [rawLessons, setRawLessons] = useState<ImportedScheduleLesson[]>([]);
  const [rows, setRows] = useState<ImportPreviewLesson[]>([]);
  const [mapping, setMapping] = useState<ScheduleImportMapping>(() => readSavedMapping());
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("merged");
  const [campusFilter, setCampusFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [courseTypeFilter, setCourseTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  useEffect(() => {
    if (rawLessons.length === 0) {
      setRows([]);
      return;
    }
    const selectedIds = new Set(rows.filter((row) => row.selected).map((row) => row.id));
    setRows(buildImportPreview(vault, rawLessons, mapping, selectedIds));
  }, [mapping, rawLessons, vault]);

  const summary = useMemo(() => summarizeImportPreview(rows), [rows]);
  const courseOptions = useMemo(() => sortCoursesByName(vault.courseGroups).filter((course) => course.status === "active"), [vault.courseGroups]);
  const campusOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.campusName || "未识别校区"))).sort(), [rows]);
  const subjectOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.subjectHint || "未知科目"))).sort(), [rows]);
  const courseTypeOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.courseTypeHint))).sort(), [rows]);
  const filteredRows = rows.filter((row) => {
    if (campusFilter !== "all" && (row.campusName || "未识别校区") !== campusFilter) return false;
    if (subjectFilter !== "all" && (row.subjectHint || "未知科目") !== subjectFilter) return false;
    if (courseTypeFilter !== "all" && row.courseTypeHint !== courseTypeFilter) return false;
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    if (selectedDate && row.date !== selectedDate) return false;
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length > 0) {
      const haystack = [
        row.title,
        row.studentNameHint ?? "",
        row.campusName,
        row.subjectHint,
        row.teacher ?? "",
        row.room ?? "",
        row.systemLessonLabel ?? "",
        courseName(row.matchedCourseId, courseOptions)
      ].join(" ").toLowerCase();
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    return true;
  });
  const systemRows = filteredRows.filter((row) => row.systemLessonId);
  const visibleRows = viewMode === "system" ? systemRows : filteredRows;
  const importableRows = rows.filter((row) => row.selected && row.campusId && row.matchedCourseId && row.status !== "duplicate" && row.status !== "conflict");

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setLoading(true);
    setMessage("正在解析教务课表...");
    try {
      const parsed = await parseScheduleWorkbookFiles(files);
      setRawLessons(parsed);
      setRows(buildImportPreview(vault, parsed, mapping));
      setMessage(parsed.length > 0 ? `已解析 ${parsed.length} 节课，请先核对筛选和映射。` : "没有从文件中解析到课节，请确认是否为校宝导出的 .xls/.xlsx。");
    } catch (error) {
      setRawLessons([]);
      setRows([]);
      setMessage(error instanceof Error ? error.message : "课表解析失败。");
    } finally {
      setLoading(false);
    }
  }

  function updateRowSelection(rowId: string, selected: boolean) {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, selected } : row)));
  }

  function updateCourseMapping(row: ImportPreviewLesson, courseId: string) {
    const key = importMappingKey(row);
    const nextMapping = { ...mapping };
    if (courseId) {
      nextMapping[key] = courseId;
    } else {
      delete nextMapping[key];
    }
    setMapping(nextMapping);
  }

  function saveMapping() {
    localStorage.setItem(mappingStorageKey, JSON.stringify(mapping));
    setMessage("手动映射已保存到本机浏览器。");
  }

  function clearImport() {
    setRawLessons([]);
    setRows([]);
    setMessage("");
    setSearch("");
    setSelectedDate("");
    setCampusFilter("all");
    setSubjectFilter("all");
    setCourseTypeFilter("all");
    setStatusFilter("all");
  }

  function importSelected() {
    const lessons = buildLessonsFromImportPreview(vault, rows);
    if (lessons.length === 0) {
      setMessage("没有可导入课节。请先勾选已匹配且无重复/冲突的课节。");
      return;
    }
    onAddLessons(lessons);
    setRows((current) => current.map((row) => (row.selected ? { ...row, selected: false } : row)));
    setMessage(`已导入 ${lessons.length} 节课。重复、冲突和未匹配课节已自动保留在预览中，不会写入。`);
  }

  return (
    <div className="space-y-5">
      <Card className="border-2 border-[#bfdbfe]">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
              <FileSpreadsheet size={14} /> 教务课表导入
            </div>
            <CardTitle>校宝课表导入核对</CardTitle>
            <CardDescription>支持校宝导出的 .xls/.xlsx，本地解析后先筛选、映射和核对，再写入系统课表。</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="sky">解析 {summary.total} 节</Badge>
            <Badge variant="sage">已选 {summary.selected} 节</Badge>
            <Badge variant={summary.needsMapping + summary.conflicts + summary.abnormal > 0 ? "amber" : "secondary"}>
              待处理 {summary.needsMapping + summary.conflicts + summary.abnormal} 节
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4 lg:flex-row lg:items-center lg:justify-between">
            <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-[#bfdbfe] bg-white px-4 py-3 text-sm font-extrabold text-[#1557c2] transition-colors hover:bg-[#eaf2ff]">
              <Upload size={16} />
              选择 .xls / .xlsx 文件
              <input type="file" accept=".xls,.xlsx" multiple className="hidden" onChange={(event) => void handleFiles(event.target.files)} />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={rows.length === 0} onClick={saveMapping}>
                <Save size={15} /> 保存映射
              </Button>
              <Button type="button" variant="outline" disabled={rows.length === 0} onClick={clearImport}>
                <X size={15} /> 清空导入
              </Button>
              <Button type="button" disabled={loading || importableRows.length === 0} onClick={importSelected}>
                {loading ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                导入已选 {importableRows.length} 节
              </Button>
            </div>
          </div>
          {message && (
            <div className="rounded-[12px] border border-[#dbe4ef] bg-white px-3 py-2 text-sm font-bold text-[#25324a]">{message}</div>
          )}

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            {[
              ["总课节", summary.total],
              ["可直接导入", summary.ready],
              ["异常", summary.abnormal],
              ["未映射", summary.needsMapping],
              ["重复", summary.duplicates],
              ["冲突", summary.conflicts],
              ["已选", summary.selected]
            ].map(([label, value]) => (
              <div key={label} className="rounded-[12px] border border-[#e8eef6] bg-white px-3 py-2">
                <div className="text-xs font-semibold text-[#64748b]">{label}</div>
                <div className="mt-1 text-lg font-extrabold text-[#061226]">{value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={viewMode === "merged" ? "sky" : "secondary"} className="cursor-pointer" onClick={() => setViewMode("merged")}>合并视图</Badge>
                <Badge variant={viewMode === "table" ? "sky" : "secondary"} className="cursor-pointer" onClick={() => setViewMode("table")}>表格视图</Badge>
                <Badge variant={viewMode === "system" ? "sky" : "secondary"} className="cursor-pointer" onClick={() => setViewMode("system")}>系统对比</Badge>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-6">
                <label className="relative md:col-span-2">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                  <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="人名 / 班级 / 课程 / 教室" />
                </label>
                <Input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
                <Select value={campusFilter} onChange={(event) => setCampusFilter(event.target.value)}>
                  <option value="all">全部校区</option>
                  {campusOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </Select>
                <Select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
                  <option value="all">全部科目</option>
                  {subjectOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </Select>
                <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                  <option value="all">全部状态</option>
                  <option value="ready">可导入</option>
                  <option value="abnormal">异常</option>
                  <option value="needs_mapping">待映射</option>
                  <option value="duplicate">重复</option>
                  <option value="conflict">冲突</option>
                </Select>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
                <Select value={courseTypeFilter} onChange={(event) => setCourseTypeFilter(event.target.value)}>
                  <option value="all">全部班型</option>
                  {courseTypeOptions.map((item) => <option key={item} value={item}>{courseTypeLabelSafe(vault, item)}</option>)}
                </Select>
                <Button type="button" variant="outline" onClick={() => setRows((current) => current.map((row) => ({ ...row, selected: filteredRows.some((item) => item.id === row.id) && row.status !== "duplicate" && row.status !== "conflict" && Boolean(row.matchedCourseId) })))}>
                  <SlidersHorizontal size={15} /> 选择当前筛选
                </Button>
                <Button type="button" variant="outline" onClick={() => setRows((current) => current.map((row) => filteredRows.some((item) => item.id === row.id) ? { ...row, selected: false } : row))}>
                  <X size={15} /> 取消当前筛选
                </Button>
              </div>

              <div className="space-y-2">
                {visibleRows.map((row) => (
                  <ImportRow
                    key={row.id}
                    row={row}
                    vault={vault}
                    courses={courseOptions}
                    viewMode={viewMode}
                    onToggle={(selected) => updateRowSelection(row.id, selected)}
                    onMap={(courseId) => updateCourseMapping(row, courseId)}
                    onOpenLesson={onOpenLesson}
                  />
                ))}
                {visibleRows.length === 0 && (
                  <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
                    {rows.length === 0 ? "请先选择教务课表文件。" : "当前筛选没有课节。"}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <SummaryCard title="校区（人数）" items={summary.byCampus} />
              <SummaryCard title="每日详情" items={summary.byDate.slice(0, 12)} />
              <SummaryCard title="课程与科目" items={[...summary.bySubject, ...summary.byCourseType.map((item) => ({ ...item, key: courseTypeLabelSafe(vault, item.key) }))]} />
              <div className="rounded-[14px] border border-[#fed7aa] bg-[#fff7ed] p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#9a3412]">
                  <AlertTriangle size={15} /> 导入说明
                </div>
                <div className="space-y-1 text-xs font-semibold leading-5 text-[#9a3412]">
                  <div>一对一 0/1 会标记为待确认补课，不直接猜请假或缺席。</div>
                  <div>班课通常只有人数，无法自动确认具体学生到课。</div>
                  <div>重复和冲突课节默认不写入；可在系统对比视图追溯查看。</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ImportRow({
  row,
  vault,
  courses,
  viewMode,
  onToggle,
  onMap,
  onOpenLesson
}: {
  row: ImportPreviewLesson;
  vault: TeacherVault;
  courses: CourseGroup[];
  viewMode: ViewMode;
  onToggle: (selected: boolean) => void;
  onMap: (courseId: string) => void;
  onOpenLesson: (lesson: Lesson) => void;
}) {
  const systemLesson = row.systemLessonId ? vault.lessons.find((lesson) => lesson.id === row.systemLessonId) : undefined;
  return (
    <div className={`rounded-[12px] border p-3 ${statusClass(row.status, row.selected)}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="checkbox"
              checked={row.selected}
              disabled={row.status === "duplicate" || row.status === "conflict" || !row.matchedCourseId}
              onChange={(event) => onToggle(event.target.checked)}
              className="h-4 w-4 accent-[#1557c2]"
            />
            <span className="font-extrabold text-[#061226]">{row.date} {row.startTime}-{row.endTime}</span>
            <Badge variant={statusVariant(row.status)} className="text-[10px]">{statusLabel(row.status)}</Badge>
            <Badge variant="secondary" className="text-[10px]">{row.campusName || "未识别校区"}</Badge>
            <Badge variant="secondary" className="text-[10px]">{row.presentCount ?? "?"}/{row.expectedCount ?? "?"}</Badge>
          </div>
          <div className="mt-2 text-sm font-semibold leading-6 text-[#25324a]">{row.title}</div>
          {viewMode !== "table" && (
            <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
              {row.studentNameHint ? `学生：${row.studentNameHint} · ` : ""}{row.subjectHint || "未知科目"} · {courseTypeLabelSafe(vault, row.courseTypeHint)} · {row.teacher ? `教师：${row.teacher} · ` : ""}{row.room ? `教室：${row.room}` : ""}
            </div>
          )}
          {viewMode !== "table" && row.issues.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {row.issues.map((issue) => <Badge key={issue} variant="amber" className="text-[10px]">{issue}</Badge>)}
            </div>
          )}
          {viewMode === "system" && row.systemLessonLabel && (
            <button
              type="button"
              disabled={!systemLesson}
              onClick={() => systemLesson && onOpenLesson(systemLesson)}
              className="mt-2 inline-flex items-center gap-2 rounded-[10px] border border-[#bfdbfe] bg-white px-3 py-2 text-xs font-bold text-[#1557c2] disabled:text-[#64748b]"
            >
              <ArrowDownUp size={13} /> {row.systemLessonLabel}
            </button>
          )}
        </div>
        <div className="w-full lg:w-[280px]">
          <Select value={row.matchedCourseId ?? ""} onChange={(event) => onMap(event.target.value)}>
            <option value="">手动映射课程</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name} · {course.subject} · {courseTypeLabel(vault, course.type)}
              </option>
            ))}
          </Select>
          <div className="mt-1 text-xs font-semibold text-[#64748b]">
            {row.mappedCourseId ? "已使用保存映射" : row.matchedCourseId ? `自动匹配：${courseName(row.matchedCourseId, courses)}` : "需要手动映射"}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, items }: { title: string; items: Array<{ key: string; count: number; selected: number }> }) {
  return (
    <div className="rounded-[14px] border border-[#dbe4ef] bg-white p-4">
      <div className="mb-3 text-sm font-extrabold text-[#061226]">{title}</div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-2 rounded-[10px] border border-[#e8eef6] bg-[#f8fbff] px-3 py-2 text-sm">
            <span className="min-w-0 truncate font-semibold text-[#25324a]">{item.key}</span>
            <span className="shrink-0 font-extrabold text-[#1557c2]">{item.selected}/{item.count}</span>
          </div>
        ))}
        {items.length === 0 && <div className="text-sm font-semibold text-[#64748b]">暂无数据</div>}
      </div>
    </div>
  );
}

function readSavedMapping(): ScheduleImportMapping {
  try {
    const raw = localStorage.getItem(mappingStorageKey);
    return raw ? JSON.parse(raw) as ScheduleImportMapping : {};
  } catch {
    return {};
  }
}

function courseName(courseId: string | undefined, courses: CourseGroup[]): string {
  return courses.find((course) => course.id === courseId)?.name ?? "";
}

function courseTypeLabelSafe(vault: TeacherVault, type: string): string {
  return type === "unknown" ? "未知班型" : courseTypeLabel(vault, type as CourseGroup["type"]);
}

function statusLabel(status: ImportMatchStatus): string {
  const labels: Record<ImportMatchStatus, string> = {
    ready: "可导入",
    abnormal: "异常",
    needs_mapping: "待映射",
    duplicate: "重复",
    conflict: "冲突"
  };
  return labels[status];
}

function statusVariant(status: ImportMatchStatus): "sage" | "amber" | "secondary" | "destructive" | "sky" {
  if (status === "ready") return "sage";
  if (status === "duplicate") return "secondary";
  if (status === "conflict") return "destructive";
  return "amber";
}

function statusClass(status: ImportMatchStatus, selected: boolean): string {
  if (selected) return "border-[#bfdbfe] bg-[#eff6ff]";
  if (status === "conflict") return "border-[#fecaca] bg-[#fff1f2]";
  if (status === "abnormal" || status === "needs_mapping") return "border-[#fed7aa] bg-[#fff7ed]";
  if (status === "duplicate") return "border-[#dbe4ef] bg-[#f8fbff]";
  return "border-[#e8eef6] bg-white";
}
