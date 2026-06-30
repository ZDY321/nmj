import { useEffect, useMemo, useState, type DragEvent } from "react";
import { FileSpreadsheet, Link2, Search, Trash2, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { CourseGroup, CourseType, ScheduleImportVaultState, TeacherVault } from "@/shared/types";
import { campusName, compareByName, courseHasActiveStudent, courseName, courseTypeLabel, sortCoursesByName, studentNames } from "@/frontend/lib/helpers";
import {
  buildImportPreview,
  importMappingKey,
  parseScheduleWorkbookFiles,
  type ImportedScheduleLesson,
  type ImportPreviewLesson,
  type ScheduleImportMapping
} from "@/frontend/lib/scheduleImport";
import { readSavedMapping, writeSavedMapping } from "@/frontend/lib/scheduleImportReview";

export function ScheduleImportCourseMappingPanel({
  vault,
  scheduleImportState,
  storageScope,
  onSaveScheduleImport
}: {
  vault: TeacherVault;
  scheduleImportState?: ScheduleImportVaultState | null;
  storageScope?: string;
  onSaveScheduleImport?: (state: ScheduleImportVaultState) => void;
}) {
  const persistedScheduleImport = scheduleImportState ?? vault.scheduleImport;
  const externalMapping = useMemo(
    () => ({
      ...readSavedMapping(storageScope),
      ...(persistedScheduleImport?.mappings ?? {}),
      ...(vault.scheduleImport?.mappings ?? {})
    }),
    [persistedScheduleImport?.updatedAt, storageScope, vault.scheduleImport?.updatedAt]
  );
  const [rawLessons, setRawLessons] = useState<ImportedScheduleLesson[]>([]);
  const [mapping, setMapping] = useState<ScheduleImportMapping>(externalMapping);
  const [search, setSearch] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);

  useEffect(() => {
    setMapping((current) => ({ ...externalMapping, ...current }));
  }, [externalMapping]);

  const courseOptions = useMemo(() => sortCoursesByName(vault.courseGroups), [vault.courseGroups]);
  const previewRows = useMemo(() => buildImportPreview(vault, rawLessons, mapping), [mapping, rawLessons, vault]);
  const importedCourses = useMemo(() => buildImportedCourseRows(rawLessons, previewRows, mapping), [mapping, previewRows, rawLessons]);
  const filteredCourses = useMemo(
    () => filterMappingCourses(vault, courseOptions, courseSearch),
    [courseOptions, courseSearch, vault]
  );
  const visibleRows = useMemo(
    () => filterImportedCourseRows(vault, importedCourses, mapping, search),
    [importedCourses, mapping, search, vault]
  );
  const mappedCount = importedCourses.filter((row) => courseIdForMappingRow(mapping, row)).length;
  const suggestedCount = importedCourses.filter((row) => !courseIdForMappingRow(mapping, row) && row.suggestedCourseId).length;
  const savedMappingCount = Object.keys(mapping).length;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setLoading(true);
    setMessage("正在解析教务 Excel 课程名称...");
    try {
      const parsed = await parseScheduleWorkbookFiles(files);
      setRawLessons(parsed);
      setMessage(parsed.length > 0 ? `已读取 ${new Set(parsed.map((lesson) => lesson.fileName)).size} 个文件、${new Set(parsed.map(importMappingKey)).size} 个教务课程名称。` : "没有从文件中解析到课程，请确认是否为校宝导出的 .xls/.xlsx。");
    } catch (error) {
      setRawLessons([]);
      setMessage(error instanceof Error ? error.message : "课程名称解析失败。");
    } finally {
      setLoading(false);
    }
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!loading) setDraggingFiles(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = loading ? "none" : "copy";
    if (!loading) setDraggingFiles(true);
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setDraggingFiles(false);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDraggingFiles(false);
    if (loading || event.dataTransfer.files.length === 0) return;
    void handleFiles(event.dataTransfer.files);
  }

  function updateMapping(row: ImportedCourseMappingRow, courseId: string) {
    const nextMapping = { ...mapping };
    setMappingValue(nextMapping, row, courseId);
    persistMapping(nextMapping, courseId ? "课程名称映射已保存，下次教务对账导入会自动复用。" : "课程名称映射已清除。", courseId ? "课程名称映射已保存到本机浏览器。" : "课程名称映射已从本机浏览器清除。");
  }

  function applySuggestedMappings() {
    const nextMapping = { ...mapping };
    let changed = 0;
    importedCourses.forEach((row) => {
      if (courseIdForMappingRow(nextMapping, row) || !row.suggestedCourseId) return;
      setMappingValue(nextMapping, row, row.suggestedCourseId);
      changed += 1;
    });
    if (changed === 0) return;
    persistMapping(nextMapping, `已采用 ${changed} 条自动建议并保存到云端加密档案。`, `已采用 ${changed} 条自动建议并保存到本机浏览器。`);
  }

  function persistMapping(nextMapping: ScheduleImportMapping, cloudMessage: string, localMessage: string) {
    setMapping(nextMapping);
    const localOk = writeSavedMapping(storageScope, nextMapping);
    if (onSaveScheduleImport) {
      const previous = persistedScheduleImport ?? vault.scheduleImport;
      onSaveScheduleImport({
        mappings: { ...nextMapping },
        resolutions: { ...(previous?.resolutions ?? {}) },
        reviews: [...(previous?.reviews ?? [])],
        splitMergeExcludedLessonIds: previous?.splitMergeExcludedLessonIds ?? [],
        updatedAt: new Date().toISOString()
      });
      setMessage(cloudMessage);
      return;
    }
    setMessage(localOk ? localMessage : "保存失败：浏览器本地存储空间可能不足。");
  }

  return (
    <Card className="overflow-hidden border-2 border-[#bfdbfe]">
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
            <Link2 size={14} /> 课程名称映射
          </div>
          <CardTitle>教务课程名对应云端课程档案</CardTitle>
          <CardDescription>先导入校宝 Excel 扫出课程名称，再集中保存映射；保存后“教务课表对账”会自动复用。</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">已保存 {savedMappingCount} 个规则</Badge>
          <Badge variant={mappedCount === importedCourses.length && importedCourses.length > 0 ? "sage" : "amber"}>本次已映射 {mappedCount}/{importedCourses.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_auto]">
          <label
            className={`flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-[12px] border border-dashed px-4 py-3 text-center text-sm font-extrabold transition-colors ${draggingFiles ? "border-[#1557c2] bg-[#dbeafe] text-[#1557c2] ring-2 ring-[#bfdbfe]" : "border-[#93c5fd] bg-[#eaf2ff] text-[#1557c2] hover:bg-[#dbeafe]"}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <span className="flex items-center justify-center gap-2">
              <FileSpreadsheet size={16} /> {loading ? "解析中..." : draggingFiles ? "松开导入 Excel" : "拖拽或选择教务 Excel"}
            </span>
            <span className="text-[11px] font-bold text-[#64748b]">支持 .xls / .xlsx 单个或多个文件</span>
            <input
              type="file"
              accept=".xls,.xlsx"
              multiple
              disabled={loading}
              className="hidden"
              onChange={(event) => {
                void handleFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <Button type="button" variant="outline" disabled={suggestedCount === 0} onClick={applySuggestedMappings}>
            <Wand2 size={15} /> 采用自动建议 {suggestedCount > 0 ? suggestedCount : ""}
          </Button>
          <Button type="button" variant="outline" disabled={rawLessons.length === 0} onClick={() => setRawLessons([])}>
            <Trash2 size={15} /> 清空本次导入
          </Button>
        </div>

        {message && (
          <div className="rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2 text-sm font-bold text-[#25324a]">
            {message}
          </div>
        )}

        <div className="rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2 text-xs font-semibold leading-5 text-[#64748b]">
          映射按“校区 + 教务课程名称 + 学生提示 + 科目 + 班型”保存。教务课程名和云端课程名不一致时，只要这里保存过，下个月导入同类 Excel 就会自动对应。
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <label className="relative block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <Input className="h-10 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索教务课程名、校区、科目或已映射课程" />
          </label>
          <label className="relative block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <Input className="h-10 pl-9" value={courseSearch} onChange={(event) => setCourseSearch(event.target.value)} placeholder="搜索右侧云端课程下拉选项" />
          </label>
        </div>

        <div className="space-y-3">
          {visibleRows.map((row) => {
            const selectedCourseId = courseIdForMappingRow(mapping, row) ?? "";
            const selectedCourse = selectedCourseId ? vault.courseGroups.find((course) => course.id === selectedCourseId) : undefined;
            const suggestedCourse = !selectedCourseId && row.suggestedCourseId ? vault.courseGroups.find((course) => course.id === row.suggestedCourseId) : undefined;
            const selectCourses = selectedCourse && !filteredCourses.some((course) => course.id === selectedCourse.id)
              ? [selectedCourse, ...filteredCourses]
              : filteredCourses;
            return (
              <div key={row.key} className="rounded-[14px] border border-[#dbe4ef] bg-white p-4">
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="break-words text-base font-extrabold text-[#061226]">{row.title || "未命名课程"}</span>
                      <Badge variant="secondary" className="text-[10px]">{row.count} 节</Badge>
                      <Badge variant="sky" className="text-[10px]">{row.months.join("、")}</Badge>
                      {selectedCourseId && <Badge variant="sage" className="text-[10px]">已保存映射</Badge>}
                      {!selectedCourseId && suggestedCourse && <Badge variant="amber" className="text-[10px]">有自动建议</Badge>}
                    </div>
                    <div className="mt-2 text-xs font-semibold leading-5 text-[#64748b]">
                      {row.campusName || "未识别校区"} · {row.subjectHint || "未知科目"} · {courseTypeLabelSafe(vault, row.courseTypeHint)}{row.studentNameHint ? ` · 学生提示：${row.studentNameHint}` : ""}
                    </div>
                    {suggestedCourse && (
                      <button
                        type="button"
                        onClick={() => updateMapping(row, suggestedCourse.id)}
                        className="mt-2 rounded-[10px] border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-left text-xs font-bold leading-5 text-[#9a3412]"
                      >
                        采用自动建议：{mappingCourseOptionLabel(vault, suggestedCourse)}
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_112px]">
                      <Select value={selectedCourseId} onChange={(event) => updateMapping(row, event.target.value)}>
                        <option value="">选择云端课程档案</option>
                        {selectCourses.map((course) => (
                          <option key={course.id} value={course.id}>{mappingCourseOptionLabel(vault, course)}</option>
                        ))}
                        {selectCourses.length === 0 && <option disabled>没有匹配的课程档案</option>}
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 border-[#fecaca] text-[#b91c1c] hover:bg-[#fef2f2]"
                        disabled={!selectedCourseId}
                        onClick={() => updateMapping(row, "")}
                      >
                        <Trash2 size={14} /> 删除映射
                      </Button>
                    </div>
                    <div className="text-xs font-semibold leading-5 text-[#64748b]">
                      {selectedCourse ? `当前映射：${mappingCourseOptionLabel(vault, selectedCourse)}` : "未保存映射；对账时仍会尝试自动匹配，但课程名不一致时建议在这里固定保存。"}
                      {courseSearch.trim() && ` · 下拉显示 ${selectCourses.length} 项`}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {rawLessons.length === 0 && (
            <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
              先导入一份校宝课表 Excel，系统会提取其中的教务课程名称用于维护映射。
            </div>
          )}
          {rawLessons.length > 0 && visibleRows.length === 0 && (
            <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
              当前搜索条件下没有课程名称。
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

type ImportedCourseMappingRow = {
  key: string;
  normalizedKey: string;
  title: string;
  campusName: string;
  subjectHint: string;
  courseTypeHint: CourseType | "unknown";
  studentNameHint?: string;
  count: number;
  months: string[];
  suggestedCourseId?: string;
};

function buildImportedCourseRows(
  lessons: ImportedScheduleLesson[],
  previewRows: ImportPreviewLesson[],
  mapping: ScheduleImportMapping
): ImportedCourseMappingRow[] {
  const rows = new Map<string, ImportedCourseMappingRow & { monthSet: Set<string> }>();
  lessons.forEach((lesson, index) => {
    const preview = previewRows[index];
    const key = importMappingKey(lesson);
    const normalizedKey = preview ? importMappingKey(preview) : key;
    const current = rows.get(key) ?? {
      key,
      normalizedKey,
      title: lesson.title,
      campusName: preview?.campusName ?? lesson.campusName,
      subjectHint: lesson.subjectHint,
      courseTypeHint: lesson.courseTypeHint,
      studentNameHint: lesson.studentNameHint,
      count: 0,
      monthSet: new Set<string>(),
      months: [],
      suggestedCourseId: undefined
    };
    current.count += 1;
    current.monthSet.add(lesson.date.slice(0, 7));
    if (!courseIdForMappingRow(mapping, current) && preview?.matchedCourseId) {
      current.suggestedCourseId = preview.matchedCourseId;
    }
    rows.set(key, current);
  });
  return Array.from(rows.values())
    .map(({ monthSet, ...row }) => ({ ...row, months: Array.from(monthSet).sort() }))
    .sort((a, b) => compareByName(a.campusName, b.campusName) || compareByName(a.title, b.title));
}

function courseIdForMappingRow(mapping: ScheduleImportMapping, row: Pick<ImportedCourseMappingRow, "key" | "normalizedKey">): string | undefined {
  return mapping[row.normalizedKey] ?? mapping[row.key];
}

function setMappingValue(mapping: ScheduleImportMapping, row: ImportedCourseMappingRow, courseId: string) {
  if (courseId) {
    mapping[row.key] = courseId;
    mapping[row.normalizedKey] = courseId;
    return;
  }
  delete mapping[row.key];
  delete mapping[row.normalizedKey];
}

function filterImportedCourseRows(vault: TeacherVault, rows: ImportedCourseMappingRow[], mapping: ScheduleImportMapping, query: string): ImportedCourseMappingRow[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return rows;
  return rows.filter((row) => {
    const mappedCourse = courseIdForMappingRow(mapping, row)
      ? vault.courseGroups.find((course) => course.id === courseIdForMappingRow(mapping, row))
      : undefined;
    const haystack = [
      row.title,
      row.campusName,
      row.subjectHint,
      row.studentNameHint ?? "",
      courseTypeLabelSafe(vault, row.courseTypeHint),
      mappedCourse ? mappingCourseOptionLabel(vault, mappedCourse) : ""
    ].join(" ").toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

function filterMappingCourses(vault: TeacherVault, courses: CourseGroup[], query: string): CourseGroup[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matched = terms.length === 0
    ? courses
    : courses.filter((course) => {
      const haystack = [
        course.name,
        course.subject,
        studentNames(vault, course.studentIds),
        courseTypeLabel(vault, course.type),
        campusName(vault, course.defaultCampusId),
        course.note ?? "",
        mappingCourseStatusLabel(vault, course)
      ].join(" ").toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  return matched.slice(0, 100);
}

function mappingCourseOptionLabel(vault: TeacherVault, course: CourseGroup): string {
  const students = studentNames(vault, course.studentIds) || "未关联学生";
  const statusLabel = mappingCourseStatusLabel(vault, course);
  return `${courseName(vault, course.id)} · ${course.subject} · ${students}${statusLabel ? ` · ${statusLabel}` : ""}`;
}

function mappingCourseStatusLabel(vault: TeacherVault, course: CourseGroup): string {
  if (course.status === "paused") return "课程已暂停";
  if (courseHasActiveStudent(vault, course)) return "";
  if (course.studentIds.length === 0) return "未关联学生";
  const linkedStudents = course.studentIds
    .map((studentId) => vault.students.find((student) => student.id === studentId))
    .filter(Boolean);
  return linkedStudents.some((student) => student?.status === "transition") ? "学生过渡期" : "学生已归档";
}

function courseTypeLabelSafe(vault: TeacherVault, type: CourseType | "unknown"): string {
  return type === "unknown" ? "未知班型" : courseTypeLabel(vault, type);
}