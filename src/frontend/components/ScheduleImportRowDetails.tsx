import { useMemo, useState } from "react";
import { ArrowDownUp, FileSpreadsheet, Link2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { CourseGroup, CourseType, Lesson, TeacherVault } from "@/shared/types";
import type { ImportPreviewLesson } from "@/frontend/lib/scheduleImport";
import {
  campusName,
  courseName as localCourseName,
  courseSubject,
  courseTypeLabel,
  studentNames
} from "@/frontend/lib/helpers";

export function ScheduleImportRowDetails({
  row,
  vault,
  courses,
  systemLesson,
  onMap,
  onOpenLesson
}: {
  row: ImportPreviewLesson;
  vault: TeacherVault;
  courses: CourseGroup[];
  systemLesson?: Lesson;
  onMap: (courseId: string) => void;
  onOpenLesson?: (lesson: Lesson) => void;
}) {
  return (
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
              {row.startTime}-{row.endTime} · {row.campusName || "未识别校区"} · {row.subjectHint || "未知科目"} · {courseTypeLabelSafe(vault, row.courseTypeHint)}
              {row.teacher ? ` · 教师：${row.teacher}` : ""}
              {row.room ? ` · 教室：${row.room}` : ""}
            </div>
            {row.presentCount !== undefined && row.expectedCount !== undefined && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant={row.presentCount < row.expectedCount ? "amber" : "secondary"} className="text-[10px]">教务实到/应到 {row.presentCount}/{row.expectedCount}</Badge>
                {row.warnings.map((warning) => (
                  <Badge key={warning} variant="secondary" className="text-[10px]">教务标记：{warning}</Badge>
                ))}
              </div>
            )}
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
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.systemPresentCount !== undefined && row.systemExpectedCount !== undefined && (
                <Badge variant={row.status === "attendance_mismatch" ? "amber" : "secondary"} className="text-[10px]">云端实到/应到 {row.systemPresentCount}/{row.systemExpectedCount}</Badge>
              )}
              <Badge variant="secondary" className="text-[10px]">课程档案 {systemLesson.expectedStudentIds.length} 人</Badge>
            </div>
            <div className="mt-2 text-xs font-semibold leading-5 text-[#64748b]">
              实到：{row.systemPresentStudentNames || "未记录实到学生"}
            </div>
            <div className="mt-1 text-xs font-semibold leading-5 text-[#94a3b8]">
              应到：{row.systemExpectedStudentNames || studentNames(vault, systemLesson.expectedStudentIds) || "未设置学生"}
            </div>
          </div>
        ) : (
          <div className="text-sm font-bold text-[#b45309]">云端课表没有对应课节</div>
        )}
      </div>

      {row.status !== "import_missing" && (
        <CourseMappingSelect
          row={row}
          vault={vault}
          courses={courses}
          onMap={onMap}
        />
      )}
    </div>
  );
}

function CourseMappingSelect({
  row,
  vault,
  courses,
  onMap
}: {
  row: ImportPreviewLesson;
  vault: TeacherVault;
  courses: CourseGroup[];
  onMap: (courseId: string) => void;
}) {
  const [courseSearch, setCourseSearch] = useState("");
  const filteredCourses = useMemo(
    () => filterMappingCourses(vault, courses, courseSearch, row.matchedCourseId),
    [courseSearch, courses, row.matchedCourseId, vault]
  );
  return (
    <div className="space-y-2">
      <label className="relative block">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
        <Input
          className="h-10 pl-9 text-sm"
          value={courseSearch}
          onChange={(event) => setCourseSearch(event.target.value)}
          placeholder="搜索课程档案名或科目"
        />
      </label>
      <Select value={row.matchedCourseId ?? ""} onChange={(event) => onMap(event.target.value)}>
        <option value="">手动映射课程档案</option>
        {filteredCourses.map((course) => (
          <option key={course.id} value={course.id}>{mappingCourseOptionLabel(vault, course)}</option>
        ))}
        {filteredCourses.length === 0 && <option disabled>没有匹配的课程档案</option>}
      </Select>
      <div className="text-xs font-semibold text-[#64748b]">
        {row.mappedCourseId ? "已使用保存映射" : row.matchedCourseId ? `自动匹配：${localCourseName(vault, row.matchedCourseId)}` : "需要手动映射后再核对"}
        {courseSearch.trim() && ` · 当前显示 ${filteredCourses.length} 项`}
      </div>
    </div>
  );
}

function filterMappingCourses(vault: TeacherVault, courses: CourseGroup[], query: string, selectedCourseId?: string): CourseGroup[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const selectedCourse = selectedCourseId ? vault.courseGroups.find((course) => course.id === selectedCourseId) : undefined;
  const matched = terms.length === 0
    ? courses
    : courses.filter((course) => {
      const haystack = [
        course.name,
        course.subject,
        course.note ?? ""
      ].join(" ").toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  const withSelected = selectedCourse && !matched.some((course) => course.id === selectedCourse.id)
    ? [selectedCourse, ...matched]
    : matched;
  return withSelected.slice(0, 80);
}

function mappingCourseOptionLabel(vault: TeacherVault, course: CourseGroup): string {
  return localCourseName(vault, course.id);
}

function courseTypeLabelSafe(vault: TeacherVault, type: CourseType | "unknown"): string {
  return type === "unknown" ? "未知班型" : courseTypeLabel(vault, type);
}
