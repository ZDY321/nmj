import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, CalendarDays, FileSpreadsheet, Link2, MapPin, RefreshCw, Save, Search, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { CourseGroup, CourseType, Lesson, TeacherVault } from "@/shared/types";
import { todayIso } from "@/frontend/lib/calculations";
import {
  calendarDates,
  campusName,
  courseName as localCourseName,
  courseSubject,
  courseTypeLabel,
  orderedWeekdayLabels,
  sortCampusesForProfile,
  sortCoursesByName,
  sortLessons,
  studentNames,
  weekStartsOn
} from "@/frontend/lib/helpers";
import {
  buildImportPreview,
  importMappingKey,
  parseScheduleWorkbookFiles,
  summarizeImportPreview,
  type ImportedScheduleLesson,
  type ImportMatchStatus,
  type ImportPreviewLesson,
  type ScheduleImportMapping
} from "@/frontend/lib/scheduleImport";

type StatusFilter = "all" | ImportMatchStatus;

const mappingStorageKey = "teacher-schedule-import-mapping-v1";

export function ScheduleImportPanel({
  vault,
  onOpenLesson
}: {
  vault: TeacherVault;
  onOpenLesson?: (lesson: Lesson) => void;
}) {
  const [rawLessons, setRawLessons] = useState<ImportedScheduleLesson[]>([]);
  const [mapping, setMapping] = useState<ScheduleImportMapping>(() => readSavedMapping());
  const [fileCampusOverrides, setFileCampusOverrides] = useState<ScheduleImportMapping>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(todayIso().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [campusFilter, setCampusFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const campusOptions = useMemo(
    () => sortCampusesForProfile(vault.campuses, vault.profile.homeCampusId),
    [vault.campuses, vault.profile.homeCampusId]
  );
  const courseOptions = useMemo(
    () => sortCoursesByName(vault.courseGroups).filter((course) => course.status === "active"),
    [vault.courseGroups]
  );
  const importedRows = useMemo(
    () => buildImportPreview(vault, rawLessons, mapping, fileCampusOverrides),
    [fileCampusOverrides, mapping, rawLessons, vault]
  );
  const rows = useMemo(
    () => [...importedRows, ...buildLocalOnlyRows(vault, importedRows, rawLessons)],
    [importedRows, rawLessons, vault]
  );
  const summary = useMemo(() => summarizeImportPreview(rows), [rows]);
  const fileSummaries = useMemo(() => summarizeFiles(rawLessons), [rawLessons]);
  const monthOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.date.slice(0, 7)))).sort(),
    [rows]
  );
  const displayMonth = selectedMonth || monthOptions[0] || todayIso().slice(0, 7);
  const filteredRows = useMemo(() => rows.filter((row) => {
    if (displayMonth && !row.date.startsWith(displayMonth)) return false;
    if (campusFilter !== "all" && row.campusId !== campusFilter) return false;
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
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
        row.matchedCourseId ? localCourseName(vault, row.matchedCourseId) : "",
        ...row.issues
      ].join(" ").toLowerCase();
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    return true;
  }), [campusFilter, displayMonth, rows, search, statusFilter, vault]);
  const selectedDateRows = filteredRows.filter((row) => row.date === selectedDate);
  const weekStartPreference = weekStartsOn(vault);
  const days = calendarDates(displayMonth, weekStartPreference);
  const weekdayLabels = orderedWeekdayLabels(weekStartPreference);
  const needsAttention = summary.attendanceMismatch + summary.timeMismatch + summary.courseMismatch + summary.systemMissing + summary.importMissing + summary.needsMapping;

  useEffect(() => {
    if (monthOptions.length === 0) return;
    if (!monthOptions.includes(selectedMonth)) {
      setSelectedMonth(monthOptions[0]);
    }
  }, [monthOptions, selectedMonth]);

  useEffect(() => {
    if (!selectedDate.startsWith(displayMonth)) {
      setSelectedDate(`${displayMonth}-01`);
    }
  }, [displayMonth, selectedDate]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setLoading(true);
    setMessage("正在解析教务 Excel...");
    try {
      const parsed = await parseScheduleWorkbookFiles(files);
      const parsedFileNames = new Set(parsed.map((lesson) => lesson.fileName));
      const nextRawLessons = [
        ...rawLessons.filter((lesson) => !parsedFileNames.has(lesson.fileName)),
        ...parsed
      ].sort((a, b) => `${a.date} ${a.startTime} ${a.campusName}`.localeCompare(`${b.date} ${b.startTime} ${b.campusName}`));
      const nextOverrides = buildDefaultCampusOverrides(vault, nextRawLessons, fileCampusOverrides);
      setRawLessons(nextRawLessons);
      setFileCampusOverrides(nextOverrides);
      if (parsed[0]?.date) {
        setSelectedMonth(parsed[0].date.slice(0, 7));
        setSelectedDate(parsed[0].date);
      }
      setMessage(parsed.length > 0 ? `已加入 ${parsedFileNames.size} 个文件、${parsed.length} 节教务 Excel 课节；当前共 ${nextRawLessons.length} 节。` : "没有从文件中解析到课节，请确认是否为校宝导出的 .xls/.xlsx。");
    } catch (error) {
      setRawLessons([]);
      setMessage(error instanceof Error ? error.message : "课表解析失败。");
    } finally {
      setLoading(false);
    }
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

  function updateFileCampus(fileName: string, campusId: string) {
    setFileCampusOverrides((current) => ({ ...current, [fileName]: campusId }));
  }

  function saveMapping() {
    localStorage.setItem(mappingStorageKey, JSON.stringify(mapping));
    setMessage("课程映射已保存到本机浏览器。");
  }

  function clearImport() {
    setRawLessons([]);
    setFileCampusOverrides({});
    setMessage("");
    setSearch("");
    setStatusFilter("all");
    setCampusFilter("all");
  }

  return (
    <Card className="overflow-hidden border-2 border-[#bfdbfe]">
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
            <FileSpreadsheet size={14} /> 教务课表对账
          </div>
          <CardTitle>教务 Excel 与云端课表核对</CardTitle>
          <CardDescription>教务 Excel 只作为外部对账来源，不会写入云端课表。</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="sky">教务 Excel {rawLessons.length} 节</Badge>
          <Badge variant="sage">已对应 {summary.matched} 节</Badge>
          <Badge variant={needsAttention > 0 ? "amber" : "secondary"}>待核对 {needsAttention} 节</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
          <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-[#061226]">
              <Upload size={16} className="text-[#1557c2]" /> 教务 Excel 文件
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-[#bfdbfe] bg-white px-4 py-3 text-sm font-extrabold text-[#1557c2] transition-colors hover:bg-[#eaf2ff]">
                {loading ? <RefreshCw size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                选择一个或多个 .xls / .xlsx
                <input
                  type="file"
                  accept=".xls,.xlsx"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    void handleFiles(event.target.files);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <Button type="button" variant="outline" disabled={rows.length === 0} onClick={saveMapping}>
                <Save size={15} /> 保存映射
              </Button>
              <Button type="button" variant="outline" disabled={rawLessons.length === 0} onClick={clearImport}>
                <X size={15} /> 清空
              </Button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              {[
                ["文件", fileSummaries.length],
                ["月份", monthOptions.length],
                ["云端缺少", summary.systemMissing],
                ["教务缺少", summary.importMissing]
              ].map(([label, value]) => (
                <div key={label} className="rounded-[12px] border border-[#e8eef6] bg-white px-3 py-2">
                  <div className="text-xs font-semibold text-[#64748b]">{label}</div>
                  <div className="mt-1 text-lg font-extrabold text-[#061226]">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[14px] border border-[#dbe4ef] bg-white p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-[#061226]">
              <MapPin size={16} className="text-[#1557c2]" /> 文件对应校区
            </div>
            <div className="space-y-2">
              {fileSummaries.map((file) => (
                <div key={file.fileName} className="grid grid-cols-1 gap-2 rounded-[12px] border border-[#e8eef6] bg-[#f8fbff] p-3 md:grid-cols-[minmax(0,1fr)_240px]">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-extrabold text-[#061226]">{file.fileName}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs font-bold text-[#64748b]">
                      <Badge variant="secondary" className="text-[10px]">{file.count} 节</Badge>
                      <Badge variant="secondary" className="text-[10px]">{file.months.join("、") || "未知月份"}</Badge>
                      <Badge variant={file.sourceCampus ? "sky" : "amber"} className="text-[10px]">{file.sourceCampus || "文件名未识别校区"}</Badge>
                    </div>
                  </div>
                  <Select value={fileCampusOverrides[file.fileName] ?? ""} onChange={(event) => updateFileCampus(file.fileName, event.target.value)}>
                    <option value="">选择校区</option>
                    {campusOptions.map((campus) => (
                      <option key={campus.id} value={campus.id}>{campus.name}</option>
                    ))}
                  </Select>
                </div>
              ))}
              {fileSummaries.length === 0 && (
                <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-5 text-center text-sm font-semibold text-[#64748b]">
                  暂无教务 Excel 文件
                </div>
              )}
            </div>
          </div>
        </div>

        {message && (
          <div className="rounded-[12px] border border-[#dbe4ef] bg-white px-3 py-2 text-sm font-bold text-[#25324a]">{message}</div>
        )}

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
          {[
            ["已对应", summary.matched, "sage"],
            ["到课异常", summary.attendanceMismatch, "amber"],
            ["时间不一致", summary.timeMismatch, "yellow"],
            ["课程不一致", summary.courseMismatch, "destructive"],
            ["云端缺少", summary.systemMissing, "amber"],
            ["教务缺少", summary.importMissing, "plum"],
            ["待映射", summary.needsMapping, "secondary"]
          ].map(([label, value, variant]) => (
            <div key={label} className="rounded-[12px] border border-[#e8eef6] bg-white px-3 py-2">
              <Badge variant={variant as "sage"} className="text-[10px]">{label}</Badge>
              <div className="mt-2 text-xl font-extrabold text-[#061226]">{value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3 md:grid-cols-2 xl:grid-cols-[160px_220px_220px_minmax(0,1fr)]">
          <Input type="month" value={displayMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
          <Select value={campusFilter} onChange={(event) => setCampusFilter(event.target.value)}>
            <option value="all">全部校区</option>
            {campusOptions.map((campus) => (
              <option key={campus.id} value={campus.id}>{campus.name}</option>
            ))}
          </Select>
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="all">全部状态</option>
            <option value="matched">已对应</option>
            <option value="attendance_mismatch">到课异常</option>
            <option value="time_mismatch">时间不一致</option>
            <option value="course_mismatch">课程不一致</option>
            <option value="system_missing">云端缺少</option>
            <option value="import_missing">教务缺少</option>
            <option value="needs_mapping">待映射</option>
          </Select>
          <label className="relative block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索课程、学生、教室或差异" />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-[16px] border border-[#dbe4ef] bg-white p-3">
            <div className="mb-2 grid grid-cols-7 gap-2">
              {weekdayLabels.map((label) => (
                <div key={label} className="rounded-[10px] bg-[#f8fbff] px-2 py-2 text-center text-xs font-extrabold text-[#64748b]">{label}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {days.map((date) => {
                const dayRows = filteredRows.filter((row) => row.date === date);
                const isSelected = selectedDate === date;
                const isCurrentMonth = date.startsWith(displayMonth);
                const hasProblems = dayRows.some((row) => row.status !== "matched");
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setSelectedDate(date)}
                    className={`min-h-[126px] rounded-[14px] border p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(15,35,66,0.08)] ${
                      isSelected
                        ? "border-[#1557c2] bg-[#eaf2ff] shadow-[0_10px_24px_rgba(21,87,194,0.12)] ring-2 ring-[#bfdbfe]"
                        : !isCurrentMonth
                          ? "border-transparent bg-[#f8fbff] opacity-45"
                          : hasProblems
                            ? "border-[#fed7aa] bg-[#fff7ed]"
                            : dayRows.length > 0
                              ? "border-[#bbf7d0] bg-[#f0fdf4]"
                              : "border-[#e8eef6] bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-extrabold text-[#061226]">{Number(date.slice(8))}</span>
                      {dayRows.length > 0 && <Badge variant={hasProblems ? "amber" : "sage"} className="text-[10px]">{dayRows.length}</Badge>}
                    </div>
                    <div className="mt-2 flex flex-col gap-1">
                      {dayRows.slice(0, 3).map((row) => (
                        <span key={row.id} className={`block truncate rounded-[8px] px-2 py-1 text-[10px] font-bold ${statusPillClass(row.status)}`}>
                          {row.startTime} {row.status === "import_missing" ? "云端" : "教务"} · {row.matchedCourseId ? localCourseName(vault, row.matchedCourseId) : row.title}
                        </span>
                      ))}
                      {dayRows.length > 3 && (
                        <span className="text-[10px] font-bold text-[#64748b]">+{dayRows.length - 3} 条</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-[14px] border border-[#dbe4ef] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-extrabold text-[#061226]">
                    <CalendarDays size={16} className="text-[#1557c2]" /> {selectedDate}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-[#64748b]">当前筛选 {selectedDateRows.length} 条</div>
                </div>
                <Badge variant={selectedDateRows.some((row) => row.status !== "matched") ? "amber" : "sage"}>
                  {selectedDateRows.some((row) => row.status !== "matched") ? "有差异" : "已对应"}
                </Badge>
              </div>
            </div>

            <div className="max-h-[720px] space-y-3 overflow-y-auto pr-1">
              {selectedDateRows.map((row) => (
                <ReconciliationRow
                  key={row.id}
                  row={row}
                  vault={vault}
                  courses={courseOptions}
                  onMap={(courseId) => updateCourseMapping(row, courseId)}
                  onOpenLesson={onOpenLesson}
                />
              ))}
              {selectedDateRows.length === 0 && (
                <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
                  这一天没有符合筛选的对账项
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReconciliationRow({
  row,
  vault,
  courses,
  onMap,
  onOpenLesson
}: {
  row: ImportPreviewLesson;
  vault: TeacherVault;
  courses: CourseGroup[];
  onMap: (courseId: string) => void;
  onOpenLesson?: (lesson: Lesson) => void;
}) {
  const systemLesson = row.systemLessonId ? vault.lessons.find((lesson) => lesson.id === row.systemLessonId) : undefined;
  return (
    <div className={`rounded-[14px] border p-3 ${statusSurfaceClass(row.status)}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
        <Badge variant="secondary">{row.campusName || "未识别校区"}</Badge>
        <Badge variant="secondary">{row.startTime}-{row.endTime}</Badge>
        {row.presentCount !== undefined && row.expectedCount !== undefined && (
          <Badge variant={row.presentCount < row.expectedCount ? "amber" : "secondary"}>{row.presentCount}/{row.expectedCount}</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="rounded-[12px] border border-[#e8eef6] bg-white/80 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-extrabold text-[#1557c2]">
            <FileSpreadsheet size={13} /> 教务 Excel
          </div>
          {row.status === "import_missing" ? (
            <div className="text-sm font-bold text-[#64748b]">教务 Excel 没有对应课节</div>
          ) : (
            <>
              <div className="text-sm font-extrabold leading-5 text-[#061226]">{row.title}</div>
              <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
                {row.subjectHint || "未知科目"} · {courseTypeLabelSafe(vault, row.courseTypeHint)}
                {row.teacher ? ` · 教师：${row.teacher}` : ""}
                {row.room ? ` · 教室：${row.room}` : ""}
              </div>
            </>
          )}
        </div>

        <div className="rounded-[12px] border border-[#e8eef6] bg-white/80 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-extrabold text-[#1557c2]">
              <Link2 size={13} /> 云端课表
            </div>
            {systemLesson && (
              <button
                type="button"
                onClick={() => onOpenLesson?.(systemLesson)}
                className="inline-flex items-center gap-1 rounded-[9px] border border-[#bfdbfe] bg-white px-2 py-1 text-[11px] font-bold text-[#1557c2]"
              >
                <ArrowDownUp size={12} /> 打开
              </button>
            )}
          </div>
          {systemLesson ? (
            <div>
              <div className="text-sm font-extrabold leading-5 text-[#061226]">{localCourseName(vault, systemLesson.courseGroupId)}</div>
              <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
                {systemLesson.startTime}-{systemLesson.endTime} · {courseSubject(vault, systemLesson.courseGroupId)} · {courseTypeLabel(vault, systemLesson.type)} · {campusName(vault, systemLesson.campusId)}
              </div>
              <div className="mt-1 truncate text-xs font-semibold text-[#64748b]">
                {studentNames(vault, systemLesson.expectedStudentIds) || "未设置学生"}
              </div>
            </div>
          ) : (
            <div className="text-sm font-bold text-[#b45309]">云端课表没有对应课节</div>
          )}
        </div>

        {row.status !== "import_missing" && (
          <div>
            <Select value={row.matchedCourseId ?? ""} onChange={(event) => onMap(event.target.value)}>
              <option value="">手动映射课程档案</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name} · {course.subject} · {courseTypeLabel(vault, course.type)}
                </option>
              ))}
            </Select>
            <div className="mt-1 text-xs font-semibold text-[#64748b]">
              {row.mappedCourseId ? "已使用保存映射" : row.matchedCourseId ? `自动匹配：${localCourseName(vault, row.matchedCourseId)}` : "需要手动映射后再核对"}
            </div>
          </div>
        )}
      </div>

      {row.issues.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {row.issues.map((issue) => (
            <Badge key={issue} variant={row.status === "matched" ? "secondary" : "amber"} className="text-[10px]">{issue}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function buildLocalOnlyRows(vault: TeacherVault, importedRows: ImportPreviewLesson[], rawLessons: ImportedScheduleLesson[]): ImportPreviewLesson[] {
  if (rawLessons.length === 0) return [];
  const months = new Set(rawLessons.map((lesson) => lesson.date.slice(0, 7)));
  const campusIds = new Set(importedRows.map((row) => row.campusId).filter((campusId): campusId is string => Boolean(campusId)));
  const usedSystemLessonIds = new Set(importedRows.map((row) => row.systemLessonId).filter((lessonId): lessonId is string => Boolean(lessonId)));
  if (months.size === 0 || campusIds.size === 0) return [];

  return vault.lessons
    .filter((lesson) =>
      lesson.status !== "cancelled" &&
      months.has(lesson.date.slice(0, 7)) &&
      campusIds.has(lessonCampusId(vault, lesson) ?? "") &&
      !usedSystemLessonIds.has(lesson.id)
    )
    .sort(sortLessons)
    .map((lesson): ImportPreviewLesson => {
      const course = vault.courseGroups.find((item) => item.id === lesson.courseGroupId);
      const campusId = lessonCampusId(vault, lesson);
      return {
        id: `local-only-${lesson.id}`,
        fileName: "云端课表",
        campusName: campusName(vault, campusId),
        campusId,
        date: lesson.date,
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        title: course?.name ?? "未知课程",
        subjectHint: course?.subject ?? "",
        courseTypeHint: lesson.type,
        studentNameHint: studentNames(vault, lesson.expectedStudentIds),
        presentCount: lesson.attendance.length,
        expectedCount: lesson.expectedStudentIds.length,
        rawText: "",
        warnings: [],
        matchedCourseId: lesson.courseGroupId,
        status: "import_missing",
        systemLessonId: lesson.id,
        systemLessonLabel: `${lesson.date} ${lesson.startTime}-${lesson.endTime} ${course?.name ?? "未知课程"}`,
        issues: ["教务 Excel 没有对应云端课节"]
      };
    });
}

function summarizeFiles(lessons: ImportedScheduleLesson[]): Array<{ fileName: string; sourceCampus: string; count: number; months: string[] }> {
  const map = new Map<string, { fileName: string; sourceCampus: string; count: number; months: Set<string> }>();
  lessons.forEach((lesson) => {
    const item = map.get(lesson.fileName) ?? { fileName: lesson.fileName, sourceCampus: lesson.campusName, count: 0, months: new Set<string>() };
    item.count += 1;
    item.months.add(lesson.date.slice(0, 7));
    if (!item.sourceCampus && lesson.campusName) item.sourceCampus = lesson.campusName;
    map.set(lesson.fileName, item);
  });
  return Array.from(map.values())
    .map((item) => ({ ...item, months: Array.from(item.months).sort() }))
    .sort((a, b) => a.fileName.localeCompare(b.fileName, "zh-Hans-CN"));
}

function buildDefaultCampusOverrides(vault: TeacherVault, lessons: ImportedScheduleLesson[], current: ScheduleImportMapping): ScheduleImportMapping {
  const next = { ...current };
  summarizeFiles(lessons).forEach((file) => {
    if (next[file.fileName]) return;
    const campus = findCampusByName(vault, file.sourceCampus);
    if (campus) next[file.fileName] = campus.id;
  });
  return next;
}

function readSavedMapping(): ScheduleImportMapping {
  try {
    const raw = localStorage.getItem(mappingStorageKey);
    return raw ? JSON.parse(raw) as ScheduleImportMapping : {};
  } catch {
    return {};
  }
}

function findCampusByName(vault: TeacherVault, name: string) {
  const normalized = normalizeText(name);
  if (!normalized) return undefined;
  return vault.campuses.find((campus) => normalizeText(campus.name) === normalized || normalizeText(campus.id) === normalized);
}

function lessonCampusId(vault: TeacherVault, lesson: Lesson): string | undefined {
  return lesson.campusId ?? vault.courseGroups.find((course) => course.id === lesson.courseGroupId)?.defaultCampusId;
}

function courseTypeLabelSafe(vault: TeacherVault, type: CourseType | "unknown"): string {
  return type === "unknown" ? "未知班型" : courseTypeLabel(vault, type);
}

function statusLabel(status: ImportMatchStatus): string {
  const labels: Record<ImportMatchStatus, string> = {
    matched: "已对应",
    attendance_mismatch: "到课异常",
    time_mismatch: "时间不一致",
    course_mismatch: "课程不一致",
    system_missing: "云端缺少",
    import_missing: "教务缺少",
    needs_mapping: "待映射"
  };
  return labels[status];
}

function statusVariant(status: ImportMatchStatus): "sage" | "amber" | "secondary" | "destructive" | "sky" | "yellow" | "plum" {
  if (status === "matched") return "sage";
  if (status === "time_mismatch") return "yellow";
  if (status === "course_mismatch" || status === "system_missing") return "destructive";
  if (status === "import_missing") return "plum";
  if (status === "needs_mapping") return "secondary";
  return "amber";
}

function statusSurfaceClass(status: ImportMatchStatus): string {
  if (status === "matched") return "border-[#bbf7d0] bg-[#f0fdf4]";
  if (status === "time_mismatch" || status === "attendance_mismatch") return "border-[#fed7aa] bg-[#fff7ed]";
  if (status === "course_mismatch" || status === "system_missing") return "border-[#fecaca] bg-[#fff1f2]";
  if (status === "import_missing") return "border-[#c7d2fe] bg-[#eef0ff]";
  return "border-[#dbe4ef] bg-[#f8fbff]";
}

function statusPillClass(status: ImportMatchStatus): string {
  if (status === "matched") return "bg-[#e8f8ef] text-[#15803d]";
  if (status === "time_mismatch" || status === "attendance_mismatch") return "bg-[#fff3e4] text-[#9a3412]";
  if (status === "course_mismatch" || status === "system_missing") return "bg-[#fee2e2] text-[#b91c1c]";
  if (status === "import_missing") return "bg-[#eef0ff] text-[#5161d6]";
  return "bg-[#eef4fb] text-[#25324a]";
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
