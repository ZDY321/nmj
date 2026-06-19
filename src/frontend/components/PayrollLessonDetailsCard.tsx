import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { completedAmount } from "@/frontend/lib/calculations";
import {
  campusName,
  courseName,
  courseSubject,
  courseTypeLabel,
  formatPrivateMoney,
  lessonAttendanceNoteText,
  lessonCampusId,
  lessonStatusLabels,
  lessonStatusSurfaceClass,
  lessonStatusVariant,
  lessonTimeRangeLabel,
  studentNames
} from "@/frontend/lib/helpers";
import type { CourseGroup, Lesson, TeacherVault } from "@/shared/types";

type LessonStatusFilter = "all" | Lesson["status"];

export function PayrollLessonDetailsCard({
  vault,
  amountsVisible,
  courseOptions,
  detailLessons,
  filteredLessonCount,
  startDateFilter,
  endDateFilter,
  courseFilter,
  studentFilter,
  statusFilter,
  onStartDateChange,
  onEndDateChange,
  onCourseFilterChange,
  onStudentFilterChange,
  onStatusFilterChange,
  onOpenLesson
}: {
  vault: TeacherVault;
  amountsVisible: boolean;
  courseOptions: CourseGroup[];
  detailLessons: Lesson[];
  filteredLessonCount: number;
  startDateFilter: string;
  endDateFilter: string;
  courseFilter: string;
  studentFilter: string;
  statusFilter: LessonStatusFilter;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onCourseFilterChange: (value: string) => void;
  onStudentFilterChange: (value: string) => void;
  onStatusFilterChange: (value: LessonStatusFilter) => void;
  onOpenLesson?: (lesson: Lesson) => void;
}) {
  function hasAttendanceException(lesson: Lesson): boolean {
    return lesson.attendance.some((entry) => entry.status === "leave_requested" || entry.status === "absent" || entry.status === "makeup_pending");
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
          <Users size={14} /> 课程明细
        </div>
        <CardTitle>校区课程明细</CardTitle>
        <CardDescription>这里展示课程记录与课时费明细，可在当前月份、校区、类型、状态和年级基础上继续筛选。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2">
            <label className="text-sm font-medium">开始日期</label>
            <Input type="date" value={startDateFilter} onChange={(event) => onStartDateChange(event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">结束日期</label>
            <Input type="date" value={endDateFilter} onChange={(event) => onEndDateChange(event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">具体课程</label>
            <Select value={courseFilter} onChange={(event) => onCourseFilterChange(event.target.value)}>
              <option value="all">全部课程</option>
              {courseOptions.map((course) => (
                <option key={course.id} value={course.id}>{course.name} · {course.subject}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">学生筛选</label>
            <Input value={studentFilter} onChange={(event) => onStudentFilterChange(event.target.value)} placeholder="输入学生名或备注" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">状态筛选</label>
            <Select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as LessonStatusFilter)}>
              <option value="all">全部状态</option>
              {Object.entries(lessonStatusLabels).map(([status, label]) => (
                <option key={status} value={status}>{label}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-2 rounded-[14px] border border-[#e8eef6] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-extrabold text-[#061226]">当前明细结果</div>
            <div className="mt-1 text-xs font-semibold text-[#64748b]">
              明细筛选 {detailLessons.length} 条；上方工资核对筛选共 {filteredLessonCount} 条。
            </div>
          </div>
          <Badge variant="secondary" className="w-fit">{detailLessons.length} 条记录</Badge>
        </div>
        {detailLessons.map((lesson, index) => {
          const hasException = hasAttendanceException(lesson);
          const attendanceNoteText = lessonAttendanceNoteText(vault, lesson);
          return (
            <motion.button
              key={lesson.id}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.02 }}
              onClick={() => onOpenLesson?.(lesson)}
              className={`w-full rounded-[14px] border p-4 text-left transition-all hover:border-[#ff8617] hover:shadow-[0_10px_24px_rgba(15,35,66,0.08)] ${
                hasException ? "border-[#fed7aa] bg-[#fff7ed]" : lessonStatusSurfaceClass(lesson.status)
              }`}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-base text-[#061226]">{courseName(vault, lesson.courseGroupId)}</strong>
                    <Badge variant="secondary">{courseSubject(vault, lesson.courseGroupId)}</Badge>
                    <Badge variant={lessonStatusVariant(lesson.status)}>{lessonStatusLabels[lesson.status]}</Badge>
                    <Badge variant="secondary">{courseTypeLabel(vault, lesson.type)}</Badge>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[#475569]">
                    {lesson.date} · {lessonTimeRangeLabel(lesson)} · {campusName(vault, lessonCampusId(vault, lesson))}
                  </div>
                  <div className="mt-1 text-sm text-[#64748b]">{studentNames(vault, lesson.expectedStudentIds) || "未设置学生"}</div>
                  {hasException && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {lesson.attendance
                        .filter((entry) => entry.status === "leave_requested" || entry.status === "absent" || entry.status === "makeup_pending")
                        .map((entry) => (
                          <Badge key={entry.studentId} variant="amber">
                            {studentNames(vault, [entry.studentId])} · 请假/待补
                          </Badge>
                        ))}
                    </div>
                  )}
                  {lesson.note && (
                    <div className="mt-2 rounded-[10px] bg-white/72 px-3 py-2 text-sm font-semibold text-[#7f1d1d]">
                      备注：{lesson.note}
                    </div>
                  )}
                  {attendanceNoteText && (
                    <div className="mt-2 rounded-[10px] bg-white/72 px-3 py-2 text-sm font-semibold text-[#9a3412]">
                      学生备注：{attendanceNoteText}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs font-bold text-[#64748b]">确认金额</div>
                  <div className="mt-1 text-lg font-extrabold text-[#061226]">{formatPrivateMoney(completedAmount(lesson), amountsVisible)}</div>
                </div>
              </div>
            </motion.button>
          );
        })}
        {detailLessons.length === 0 && (
          <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
            当前筛选下没有课时记录
          </div>
        )}
      </CardContent>
    </Card>
  );
}
