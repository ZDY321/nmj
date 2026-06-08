import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FileSpreadsheet, Link2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Lesson, ScheduleImportSavedRow, ScheduleImportReviewRecord, ScheduleImportResolutionStatus, TeacherVault } from "@/shared/types";
import type { ImportMatchStatus } from "@/frontend/lib/scheduleImport";
import { courseName as localCourseName, courseSubject, courseTypeLabel } from "@/frontend/lib/helpers";

type ResolutionFilter = `resolution:${ScheduleImportResolutionStatus}`;
type StatusFilter = "all" | ImportMatchStatus | ResolutionFilter;
type BadgeVariant = "sage" | "amber" | "secondary" | "destructive" | "sky" | "yellow" | "plum";

export function ScheduleImportSavedReviewRows({
  review,
  vault,
  linkedSystemLessonIdsFromRows,
  matchesRowFilters,
  effectiveRowStatus,
  linkedLessonsForRow,
  lessonDurationHours,
  courseTypeLabelSafe,
  statusSurfaceClass,
  statusVariant,
  statusLabel,
  resolutionStatusLabel,
  formatSavedReviewCount,
  renderIssueList
}: {
  review: ScheduleImportReviewRecord;
  vault: TeacherVault;
  linkedSystemLessonIdsFromRows: (rows: ScheduleImportSavedRow[]) => Set<string>;
  matchesRowFilters: (row: ScheduleImportSavedRow, filters: { linkedSystemLessonIds: Set<string>; statusFilter: StatusFilter; search: string; vault: TeacherVault }) => boolean;
  effectiveRowStatus: (row: ScheduleImportSavedRow, linkedSystemLessonIds?: Set<string>) => ImportMatchStatus;
  linkedLessonsForRow: (vault: TeacherVault, row: ScheduleImportSavedRow) => Lesson[];
  lessonDurationHours: (lesson: Pick<Lesson, "startTime" | "endTime">) => number;
  courseTypeLabelSafe: (vault: TeacherVault, type: ScheduleImportSavedRow["courseTypeHint"]) => string;
  statusSurfaceClass: (status: ImportMatchStatus, reviewed?: boolean) => string;
  statusVariant: (status: ImportMatchStatus) => BadgeVariant;
  statusLabel: (status: ImportMatchStatus) => string;
  resolutionStatusLabel: (status: ScheduleImportResolutionStatus) => string;
  formatSavedReviewCount: (value: number | undefined) => string;
  renderIssueList: (issues: string[], compact?: boolean) => ReactNode;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [search, setSearch] = useState("");
  const dateOptions = useMemo(() => Array.from(new Set(review.rows.map((row) => row.date))).sort(), [review.rows]);
  const linkedSystemLessonIds = useMemo(() => linkedSystemLessonIdsFromRows(review.rows), [linkedSystemLessonIdsFromRows, review.rows]);
  const filteredRows = useMemo(
    () => review.rows
      .filter((row) => dateFilter === "all" || row.date === dateFilter)
      .filter((row) => matchesRowFilters(row, { linkedSystemLessonIds, search, statusFilter, vault }))
      .sort((a, b) => `${a.date} ${a.startTime} ${a.endTime}`.localeCompare(`${b.date} ${b.startTime} ${b.endTime}`)),
    [dateFilter, linkedSystemLessonIds, matchesRowFilters, review.rows, search, statusFilter, vault]
  );

  useEffect(() => {
    setDateFilter("all");
    setSearch("");
    setStatusFilter("all");
  }, [review.id]);

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[180px_220px_minmax(0,1fr)]">
        <Select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
          <option value="all">全部日期</option>
          {dateOptions.map((date) => (
            <option key={date} value={date}>{date}</option>
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
          <option value="resolution:accepted">确认无误</option>
          <option value="resolution:time_variance_ok">时间偏差正常</option>
          <option value="resolution:split_merge_ok">拆分合并正常</option>
          <option value="resolution:excel_error">教务表错误</option>
          <option value="resolution:fixed">已修正</option>
          <option value="resolution:cloud_error">云端需修正</option>
        </Select>
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
          <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索保存明细里的课程、学生、教室或差异" />
        </label>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2 text-xs font-bold text-[#64748b]">
        <span>当前显示 {filteredRows.length} 条</span>
        <span>保存明细 {review.rows.length} 条</span>
      </div>

      <div className="max-h-[620px] space-y-3 overflow-y-auto pr-1">
        {filteredRows.map((row) => (
          <SavedReviewRowCard
            key={row.id}
            row={row}
            vault={vault}
            linkedSystemLessonIds={linkedSystemLessonIds}
            effectiveRowStatus={effectiveRowStatus}
            linkedLessonsForRow={linkedLessonsForRow}
            lessonDurationHours={lessonDurationHours}
            courseTypeLabelSafe={courseTypeLabelSafe}
            statusSurfaceClass={statusSurfaceClass}
            statusVariant={statusVariant}
            statusLabel={statusLabel}
            resolutionStatusLabel={resolutionStatusLabel}
            formatSavedReviewCount={formatSavedReviewCount}
            renderIssueList={renderIssueList}
          />
        ))}
        {filteredRows.length === 0 && (
          <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-white p-8 text-center text-sm font-semibold text-[#64748b]">
            这条保存对账里没有符合筛选的明细
          </div>
        )}
      </div>
    </div>
  );
}

function SavedReviewRowCard({
  row,
  vault,
  linkedSystemLessonIds,
  effectiveRowStatus,
  linkedLessonsForRow,
  lessonDurationHours,
  courseTypeLabelSafe,
  statusSurfaceClass,
  statusVariant,
  statusLabel,
  resolutionStatusLabel,
  formatSavedReviewCount,
  renderIssueList
}: {
  row: ScheduleImportSavedRow;
  vault: TeacherVault;
  linkedSystemLessonIds: Set<string>;
  effectiveRowStatus: (row: ScheduleImportSavedRow, linkedSystemLessonIds?: Set<string>) => ImportMatchStatus;
  linkedLessonsForRow: (vault: TeacherVault, row: ScheduleImportSavedRow) => Lesson[];
  lessonDurationHours: (lesson: Pick<Lesson, "startTime" | "endTime">) => number;
  courseTypeLabelSafe: (vault: TeacherVault, type: ScheduleImportSavedRow["courseTypeHint"]) => string;
  statusSurfaceClass: (status: ImportMatchStatus, reviewed?: boolean) => string;
  statusVariant: (status: ImportMatchStatus) => BadgeVariant;
  statusLabel: (status: ImportMatchStatus) => string;
  resolutionStatusLabel: (status: ScheduleImportResolutionStatus) => string;
  formatSavedReviewCount: (value: number | undefined) => string;
  renderIssueList: (issues: string[], compact?: boolean) => ReactNode;
}) {
  const rowStatus = effectiveRowStatus(row, linkedSystemLessonIds);
  const reviewed = Boolean(row.resolutionStatus && row.resolutionStatus !== "unreviewed");
  const resolvedAsMatched = row.status !== "matched" && rowStatus === "matched";
  const linkedLessons = linkedLessonsForRow(vault, row);
  return (
    <div className={`rounded-[14px] border p-3 ${statusSurfaceClass(rowStatus, reviewed && !resolvedAsMatched)}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(rowStatus)}>{statusLabel(rowStatus)}</Badge>
            <Badge variant="secondary">{row.date}</Badge>
            <Badge variant="secondary">{row.startTime}-{row.endTime}</Badge>
            {row.resolutionStatus && row.resolutionStatus !== "unreviewed" && <Badge variant="sky">{resolutionStatusLabel(row.resolutionStatus)}</Badge>}
            {resolvedAsMatched && <Badge variant="sage">已计入已对应</Badge>}
          </div>
          <div className="truncate text-sm font-extrabold text-[#061226]">
            {row.matchedCourseId ? localCourseName(vault, row.matchedCourseId) : row.title || row.systemLessonLabel || "未命名课程"}
          </div>
        </div>
        <div className="shrink-0 rounded-[10px] border border-[#e8eef6] bg-white/80 px-3 py-2 text-xs font-bold text-[#64748b]">
          教务 {formatSavedReviewCount(row.presentCount)}/{formatSavedReviewCount(row.expectedCount)} · 云端 {formatSavedReviewCount(row.systemPresentCount)}/{formatSavedReviewCount(row.systemExpectedCount)}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-[12px] border border-[#e8eef6] bg-white/80 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-extrabold text-[#1557c2]">
            <FileSpreadsheet size={13} /> 教务 Excel
          </div>
          <div className="text-sm font-extrabold leading-5 text-[#061226]">{row.status === "import_missing" ? "教务 Excel 没有对应课节" : row.title}</div>
          <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
            {row.campusName || "未识别校区"} · {row.subjectHint || "未知科目"} · {courseTypeLabelSafe(vault, row.courseTypeHint)}
            {row.teacher ? ` · 教师：${row.teacher}` : ""}
            {row.room ? ` · 教室：${row.room}` : ""}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant={row.presentCount !== undefined && row.expectedCount !== undefined && row.presentCount < row.expectedCount ? "amber" : "secondary"} className="text-[10px]">
              实到/应到 {formatSavedReviewCount(row.presentCount)}/{formatSavedReviewCount(row.expectedCount)}
            </Badge>
            {row.warnings.map((warning) => (
              <Badge key={warning} variant="secondary" className="text-[10px]">教务标记：{warning}</Badge>
            ))}
          </div>
        </div>

        <div className="rounded-[12px] border border-[#e8eef6] bg-white/80 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-extrabold text-[#1557c2]">
            <Link2 size={13} /> 云端课表
          </div>
          <div className="text-sm font-extrabold leading-5 text-[#061226]">{row.systemLessonLabel || "云端课表没有对应课节"}</div>
          <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
            {row.matchedCourseId ? `课程档案：${localCourseName(vault, row.matchedCourseId)}` : "未映射课程档案"}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant={row.status === "attendance_mismatch" ? "amber" : "secondary"} className="text-[10px]">
              实到/应到 {formatSavedReviewCount(row.systemPresentCount)}/{formatSavedReviewCount(row.systemExpectedCount)}
            </Badge>
          </div>
          <div className="mt-2 text-xs font-semibold leading-5 text-[#64748b]">
            实到：{row.systemPresentStudentNames || "未记录实到学生"}
          </div>
          <div className="mt-1 text-xs font-semibold leading-5 text-[#94a3b8]">
            应到：{row.systemExpectedStudentNames || "未设置学生"}
          </div>
        </div>
      </div>

      {linkedLessons.length > 0 && (
        <div className="mt-3 rounded-[12px] border border-[#c7d2fe] bg-[#eef0ff] p-3">
          <div className="text-xs font-extrabold text-[#5161d6]">关联云端课节</div>
          <div className="mt-2 space-y-1.5">
            {linkedLessons.map((lesson) => (
              <div key={lesson.id} className="rounded-[9px] border border-[#dbe4ef] bg-white px-2.5 py-2 text-xs font-semibold text-[#64748b]">
                <span className="font-extrabold text-[#061226]">{lesson.date} {lesson.startTime}-{lesson.endTime}</span>
                {" · "}{localCourseName(vault, lesson.courseGroupId)}
                {" · "}{courseSubject(vault, lesson.courseGroupId)}
                {" · "}{lessonDurationHours(lesson).toFixed(1)} 小时
              </div>
            ))}
          </div>
        </div>
      )}

      {(row.issues.length > 0 || row.resolutionNote) && (
        <div className="mt-3 rounded-[12px] border border-[#e8eef6] bg-white/80 p-3">
          {row.issues.length > 0 ? renderIssueList(row.issues, true) : <div className="text-xs font-semibold text-[#64748b]">无差异</div>}
          {row.resolutionNote && <div className="mt-2 rounded-[9px] border border-[#bfdbfe] bg-[#eaf2ff] px-2 py-1 text-xs font-semibold text-[#1557c2]">标注：{row.resolutionNote}</div>}
        </div>
      )}
    </div>
  );
}
