import { ArrowDownUp, FileSpreadsheet, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CourseType, Lesson, TeacherVault } from "@/shared/types";
import type { ImportPreviewLesson } from "@/frontend/lib/scheduleImport";
import {
  campusName,
  courseName as localCourseName,
  courseSubject,
  courseTimeRangeBillingLabel,
  courseTypeLabel,
  lessonAttendanceNoteText,
  lessonTimeRangeBillingLabel,
  lessonStatusLabels,
  studentNames
} from "@/frontend/lib/helpers";

export function ScheduleImportRowDetails({
  row,
  vault,
  systemLesson,
  linkedLessons = [],
  onOpenLesson
}: {
  row: ImportPreviewLesson;
  vault: TeacherVault;
  systemLesson?: Lesson;
  linkedLessons?: Lesson[];
  onOpenLesson?: (lesson: Lesson) => void;
}) {
  const systemAttendanceNoteText = systemLesson ? lessonAttendanceNoteText(vault, systemLesson) : "";
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
              {courseTimeRangeBillingLabel(vault, row, row.matchedCourseId ?? row.mappedCourseId)} · {row.campusName || "未识别校区"} · {row.subjectHint || "未知科目"} · {courseTypeLabelSafe(vault, row.courseTypeHint)}
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
              {lessonTimeRangeBillingLabel(vault, systemLesson)} · {courseSubject(vault, systemLesson.courseGroupId)} · {courseTypeLabel(vault, systemLesson.type)} · {campusName(vault, systemLesson.campusId)}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant={systemLesson.status === "cancelled" ? "destructive" : "secondary"} className="text-[10px]">
                云端状态：{lessonStatusLabels[systemLesson.status]}
              </Badge>
              {row.systemPresentCount !== undefined && row.systemExpectedCount !== undefined && (
                <Badge variant={row.status === "attendance_mismatch" ? "amber" : "secondary"} className="text-[10px]">云端实到/应到 {row.systemPresentCount}/{row.systemExpectedCount}</Badge>
              )}
              <Badge variant="secondary" className="text-[10px]">课程档案 {systemLesson.expectedStudentIds.length} 人</Badge>
            </div>
            {systemLesson.note && (
              <div className="mt-2 rounded-[9px] border border-[#fed7aa] bg-[#fff7ed] px-2 py-1 text-xs font-semibold leading-5 text-[#9a3412]">
                云端备注：{systemLesson.note}
              </div>
            )}
            {systemAttendanceNoteText && (
              <div className="mt-2 rounded-[9px] border border-[#fed7aa] bg-[#fff7ed] px-2 py-1 text-xs font-semibold leading-5 text-[#9a3412]">
                {systemAttendanceNoteText}
              </div>
            )}
            <div className="mt-2 text-xs font-semibold leading-5 text-[#64748b]">
              实到：{row.systemPresentStudentNames || "未记录实到学生"}
            </div>
            <div className="mt-1 text-xs font-semibold leading-5 text-[#94a3b8]">
              应到：{row.systemExpectedStudentNames || studentNames(vault, systemLesson.expectedStudentIds) || "未设置学生"}
            </div>
            {linkedLessons.length > 0 && (
              <LinkedSystemLessons
                vault={vault}
                lessons={linkedLessons}
                title="合并目标云端课节"
                onOpenLesson={onOpenLesson}
              />
            )}
          </div>
        ) : linkedLessons.length > 0 ? (
          <LinkedSystemLessons
            vault={vault}
            lessons={linkedLessons}
            title="已人工关联云端课节"
            onOpenLesson={onOpenLesson}
          />
        ) : (
          <div className="text-sm font-bold text-[#b45309]">云端课表没有对应课节</div>
        )}
      </div>
    </div>
  );
}

function LinkedSystemLessons({
  vault,
  lessons,
  title,
  onOpenLesson
}: {
  vault: TeacherVault;
  lessons: Lesson[];
  title: string;
  onOpenLesson?: (lesson: Lesson) => void;
}) {
  return (
    <div className="mt-3 rounded-[10px] border border-[#c7d2fe] bg-[#eef0ff] p-2.5">
      <div className="text-xs font-extrabold text-[#5161d6]">{title}</div>
      <div className="mt-2 space-y-1.5">
        {lessons.map((lesson) => (
          <button
            key={lesson.id}
            type="button"
            onClick={() => onOpenLesson?.(lesson)}
            className="block w-full rounded-[9px] border border-[#dbe4ef] bg-white px-2.5 py-2 text-left text-xs font-semibold leading-5 text-[#64748b] transition-colors hover:border-[#93c5fd] hover:bg-[#f8fbff]"
          >
            <span className="font-extrabold text-[#061226]">{lesson.date} {lessonTimeRangeBillingLabel(vault, lesson)}</span>
            {" · "}{localCourseName(vault, lesson.courseGroupId)}
            {" · "}{courseSubject(vault, lesson.courseGroupId)}
            {" · "}{courseTypeLabel(vault, lesson.type)}
            {" · "}{campusName(vault, lesson.campusId)}
          </button>
        ))}
      </div>
    </div>
  );
}

function courseTypeLabelSafe(vault: TeacherVault, type: CourseType | "unknown"): string {
  return type === "unknown" ? "未知班型" : courseTypeLabel(vault, type);
}

