import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Link2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ScheduleImportIssueList } from "@/frontend/components/ScheduleImportIssueList";
import type { ScheduleImportSavedRow, ScheduleImportReviewRecord, TeacherVault } from "@/shared/types";
import { courseName as localCourseName, courseSubject, courseTimeRangeBillingLabel, lessonAttendanceNoteText, lessonStatusLabels, lessonTimeRangeBillingLabel } from "@/frontend/lib/helpers";
import {
  courseTypeLabelSafe,
  effectiveSavedRowStatus,
  formatSavedReviewCount,
  linkedLessonsForSavedRow,
  linkedSystemLessonIdsFromSavedRows,
  matchesSavedReviewRowFilters,
  resolutionExcludesImportStats,
  resolutionStatusLabel,
  savedRowSystemAttendance,
  savedRowSystemLesson,
  savedRowSystemLessonLabel,
  statusLabel,
  statusFilterOptions,
  statusSurfaceClass,
  statusVariant,
  type StatusFilter
} from "@/frontend/lib/scheduleImportReview";

export function ScheduleImportSavedReviewRows({
  review,
  vault
}: {
  review: ScheduleImportReviewRecord;
  vault: TeacherVault;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [search, setSearch] = useState("");
  const dateOptions = useMemo(() => Array.from(new Set(review.rows.map((row) => row.date))).sort(), [review.rows]);
  const linkedSystemLessonIds = useMemo(() => linkedSystemLessonIdsFromSavedRows(review.rows), [review.rows]);
  const filteredRows = useMemo(
    () => review.rows
      .filter((row) => dateFilter === "all" || row.date === dateFilter)
      .filter((row) => matchesSavedReviewRowFilters(row, { linkedSystemLessonIds, search, statusFilter, vault }))
      .sort((a, b) => `${a.date} ${a.startTime} ${a.endTime}`.localeCompare(`${b.date} ${b.startTime} ${b.endTime}`)),
    [dateFilter, linkedSystemLessonIds, review.rows, search, statusFilter, vault]
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
          {statusFilterOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
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
  linkedSystemLessonIds
}: {
  row: ScheduleImportSavedRow;
  vault: TeacherVault;
  linkedSystemLessonIds: Set<string>;
}) {
  const rowStatus = effectiveSavedRowStatus(row, linkedSystemLessonIds);
  const reviewed = Boolean(row.resolutionStatus && row.resolutionStatus !== "unreviewed");
  const excludedFromImportStats = resolutionExcludesImportStats(row.resolutionStatus);
  const resolvedAsMatched = row.status !== "matched" && rowStatus === "matched" && !excludedFromImportStats;
  const linkedLessons = linkedLessonsForSavedRow(vault, row);
  const systemLesson = savedRowSystemLesson(vault, row);
  const systemLessonLabel = savedRowSystemLessonLabel(vault, row);
  const systemAttendance = savedRowSystemAttendance(vault, row);
  const systemCourseId = systemLesson?.courseGroupId ?? row.matchedCourseId;
  const importTimeLabel = courseTimeRangeBillingLabel(vault, row, row.matchedCourseId ?? row.mappedCourseId);
  const systemTimeLabel = systemLesson ? lessonTimeRangeBillingLabel(vault, systemLesson) : "";
  const systemAttendanceNoteText = systemLesson ? lessonAttendanceNoteText(vault, systemLesson) : "";
  const usesCurrentSystemLesson = Boolean(systemLesson && row.systemLessonLabel && systemLessonLabel !== row.systemLessonLabel);
  return (
    <div className={`rounded-[14px] border p-3 ${statusSurfaceClass(rowStatus, reviewed && !resolvedAsMatched)}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(rowStatus)}>{statusLabel(rowStatus)}</Badge>
            <Badge variant="secondary">{row.date}</Badge>
            <Badge variant="secondary">教务 {importTimeLabel}</Badge>
            {systemLesson && (
              <Badge variant={systemTimeLabel === importTimeLabel ? "secondary" : "sky"}>
                云端 {systemTimeLabel}
              </Badge>
            )}
            {systemAttendance.status === "cancelled" && <Badge variant="destructive">{lessonStatusLabels[systemAttendance.status]}</Badge>}
            {row.resolutionStatus && row.resolutionStatus !== "unreviewed" && <Badge variant="sky">{resolutionStatusLabel(row.resolutionStatus)}</Badge>}
            {excludedFromImportStats && <Badge variant="secondary">不计入导入统计</Badge>}
            {resolvedAsMatched && <Badge variant="sage">已计入已对应</Badge>}
            {usesCurrentSystemLesson && <Badge variant="sky">当前云端时间</Badge>}
          </div>
          <div className="truncate text-sm font-extrabold text-[#061226]">
            {row.matchedCourseId ? localCourseName(vault, row.matchedCourseId) : row.title || systemLessonLabel || "未命名课程"}
          </div>
        </div>
        <div className="shrink-0 rounded-[10px] border border-[#e8eef6] bg-white/80 px-3 py-2 text-xs font-bold text-[#64748b]">
          教务 {formatSavedReviewCount(row.presentCount)}/{formatSavedReviewCount(row.expectedCount)} · 云端 {formatSavedReviewCount(systemAttendance.presentCount)}/{formatSavedReviewCount(systemAttendance.expectedCount)}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-[12px] border border-[#e8eef6] bg-white/80 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-extrabold text-[#1557c2]">
            <FileSpreadsheet size={13} /> 教务 Excel
          </div>
          <div className="text-sm font-extrabold leading-5 text-[#061226]">{row.status === "import_missing" ? "教务 Excel 没有对应课节" : row.title}</div>
          <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
            {courseTimeRangeBillingLabel(vault, row, row.matchedCourseId ?? row.mappedCourseId)} · {row.campusName || "未识别校区"} · {row.subjectHint || "未知科目"} · {courseTypeLabelSafe(vault, row.courseTypeHint)}
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
          {row.note && (
            <div className="mt-2 rounded-[9px] border border-[#fed7aa] bg-[#fff7ed] px-2 py-1 text-xs font-semibold leading-5 text-[#9a3412]">
              教务备注：{row.note}
            </div>
          )}
          {row.rawText && (
            <div className="mt-2 rounded-[9px] border border-[#e8eef6] bg-[#f8fbff] px-2 py-1 text-xs font-semibold leading-5 text-[#64748b]">
              原始内容：{row.rawText}
            </div>
          )}
        </div>

        <div className="rounded-[12px] border border-[#e8eef6] bg-white/80 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-extrabold text-[#1557c2]">
            <Link2 size={13} /> 云端课表
          </div>
          <div className="text-sm font-extrabold leading-5 text-[#061226]">{systemLessonLabel || "云端课表没有对应课节"}</div>
          <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
            {systemLesson ? `${lessonTimeRangeBillingLabel(vault, systemLesson)} · ` : ""}{systemCourseId ? `课程档案：${localCourseName(vault, systemCourseId)}` : "未映射课程档案"}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {systemAttendance.status && (
              <Badge variant={systemAttendance.status === "cancelled" ? "destructive" : "secondary"} className="text-[10px]">
                云端状态：{lessonStatusLabels[systemAttendance.status]}
              </Badge>
            )}
            <Badge variant={row.status === "attendance_mismatch" ? "amber" : "secondary"} className="text-[10px]">
              实到/应到 {formatSavedReviewCount(systemAttendance.presentCount)}/{formatSavedReviewCount(systemAttendance.expectedCount)}
            </Badge>
          </div>
          {systemAttendance.note && (
            <div className="mt-2 rounded-[9px] border border-[#fed7aa] bg-[#fff7ed] px-2 py-1 text-xs font-semibold leading-5 text-[#9a3412]">
              云端备注：{systemAttendance.note}
            </div>
          )}
          {systemAttendanceNoteText && (
            <div className="mt-2 rounded-[9px] border border-[#fed7aa] bg-[#fff7ed] px-2 py-1 text-xs font-semibold leading-5 text-[#9a3412]">
              {systemAttendanceNoteText}
            </div>
          )}
          <div className="mt-2 text-xs font-semibold leading-5 text-[#64748b]">
            实到：{systemAttendance.presentStudentNames || "未记录实到学生"}
          </div>
          <div className="mt-1 text-xs font-semibold leading-5 text-[#94a3b8]">
            应到：{systemAttendance.expectedStudentNames || "未设置学生"}
          </div>
        </div>
      </div>

      {linkedLessons.length > 0 && (
        <div className="mt-3 rounded-[12px] border border-[#c7d2fe] bg-[#eef0ff] p-3">
          <div className="text-xs font-extrabold text-[#5161d6]">关联云端课节</div>
          <div className="mt-2 space-y-1.5">
            {linkedLessons.map((lesson) => (
              <div key={lesson.id} className="rounded-[9px] border border-[#dbe4ef] bg-white px-2.5 py-2 text-xs font-semibold text-[#64748b]">
                <span className="font-extrabold text-[#061226]">{lesson.date} {lessonTimeRangeBillingLabel(vault, lesson)}</span>
                {" · "}{localCourseName(vault, lesson.courseGroupId)}
                {" · "}{courseSubject(vault, lesson.courseGroupId)}
              </div>
            ))}
          </div>
        </div>
      )}

      {(row.issues.length > 0 || row.resolutionNote) && (
        <div className="mt-3 rounded-[12px] border border-[#e8eef6] bg-white/80 p-3">
          {row.issues.length > 0 ? <ScheduleImportIssueList issues={row.issues} compact /> : <div className="text-xs font-semibold text-[#64748b]">无差异</div>}
          {row.resolutionNote && <div className="mt-2 rounded-[9px] border border-[#bfdbfe] bg-[#eaf2ff] px-2 py-1 text-xs font-semibold text-[#1557c2]">标注：{row.resolutionNote}</div>}
        </div>
      )}
    </div>
  );
}
