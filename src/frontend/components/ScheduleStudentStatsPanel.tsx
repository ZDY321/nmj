import { AnimatePresence, motion } from "framer-motion";
import { Search, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TimeTextInput } from "@/components/ui/time-text-input";
import type { Campus, CourseGroup, Lesson, TeacherVault } from "@/shared/types";
import {
  attendanceLabels,
  courseTypeLabel,
  courseTypeOptionsForVault,
  formatPrivateMoney,
  lessonStatusLabels,
  lessonStatusVariant
} from "@/frontend/lib/helpers";
import {
  isStudentStatsDateRangeValid,
  isStudentStatsTimeRangeValid
} from "@/frontend/lib/scheduleViewHelpers";
import type { buildStudentStatsGroupedLessonRows, buildStudentStatsRows } from "@/frontend/lib/scheduleViewHelpers";
import type { CourseTypeFilter } from "@/frontend/lib/scheduleViewTypes";

type StudentStatsRows = ReturnType<typeof buildStudentStatsRows>;
type StudentStatsGroupedLessonRows = ReturnType<typeof buildStudentStatsGroupedLessonRows>;
type StudentStatsStatusFilter = "all" | Lesson["status"];

type ScheduleStudentStatsPanelProps = {
  amountsVisible: boolean;
  campusOptions: Campus[];
  completedCount: number;
  courseGroupOptions: CourseGroup[];
  expandedGroupIds: string[];
  groupedLessonRows: StudentStatsGroupedLessonRows;
  lessonCount: number;
  onOpenLesson: (lesson: Lesson) => void;
  onToggleGroup: (groupId: string) => void;
  rows: StudentStatsRows;
  setCampusFilter: (value: string) => void;
  setCourseFilter: (value: string) => void;
  setCourseTypeFilter: (value: CourseTypeFilter) => void;
  setDateEnd: (value: string) => void;
  setDateStart: (value: string) => void;
  setNameFilter: (value: string) => void;
  setStartTime: (value: string) => void;
  setEndTime: (value: string) => void;
  setStatusFilter: (value: StudentStatsStatusFilter) => void;
  setSubjectFilter: (value: string) => void;
  studentLessonCount: number;
  subjectOptions: string[];
  totalFee: number;
  values: {
    campusFilter: string;
    courseFilter: string;
    courseTypeFilter: CourseTypeFilter;
    dateEnd: string;
    dateStart: string;
    endTime: string;
    nameFilter: string;
    startTime: string;
    statusFilter: StudentStatsStatusFilter;
    subjectFilter: string;
  };
  vault: TeacherVault;
};

export function ScheduleStudentStatsPanel({
  amountsVisible,
  campusOptions,
  completedCount,
  courseGroupOptions,
  expandedGroupIds,
  groupedLessonRows,
  lessonCount,
  onOpenLesson,
  onToggleGroup,
  rows,
  setCampusFilter,
  setCourseFilter,
  setCourseTypeFilter,
  setDateEnd,
  setDateStart,
  setNameFilter,
  setStartTime,
  setEndTime,
  setStatusFilter,
  setSubjectFilter,
  studentLessonCount,
  subjectOptions,
  totalFee,
  values,
  vault
}: ScheduleStudentStatsPanelProps) {
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
            <UserCheck size={14} /> 学生课次统计
          </div>
          <CardTitle>按学生查看课程数量</CardTitle>
          <CardDescription>学生、课程、科目、校区、日期、时间和状态会同时生效，筛选结果为合并条件后的交集。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
            <label className="relative block">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
              <Input
                className="pl-9"
                value={values.nameFilter}
                onChange={(event) => setNameFilter(event.target.value)}
                placeholder="筛选学生姓名"
              />
            </label>
            <Select value={values.courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
              <option value="all">全部课程</option>
              {courseGroupOptions.map((course) => (
                <option key={course.id} value={course.id}>{course.name} · {course.subject} · {courseTypeLabel(vault, course.type)}</option>
              ))}
            </Select>
            <Select value={values.courseTypeFilter} onChange={(event) => setCourseTypeFilter(event.target.value as CourseTypeFilter)}>
              <option value="all">全部班型</option>
              {courseTypeOptionsForVault(vault).map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </Select>
            <Select value={values.subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
              <option value="all">全部科目</option>
              {subjectOptions.map((subject) => (
                <option key={subject} value={subject}>{subject}</option>
              ))}
            </Select>
            <Select value={values.campusFilter} onChange={(event) => setCampusFilter(event.target.value)}>
              <option value="all">全部校区</option>
              {campusOptions.map((campus) => (
                <option key={campus.id} value={campus.id}>{campus.name}</option>
              ))}
            </Select>
            <div className="space-y-2">
              <label className="text-sm font-medium">开始日期</label>
              <Input
                type="date"
                value={values.dateStart}
                onChange={(event) => setDateStart(event.target.value)}
                className={!isStudentStatsDateRangeValid(values.dateStart, values.dateEnd) ? "border-[#fca5a5] bg-[#fff1f2]" : undefined}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">结束日期</label>
              <Input
                type="date"
                value={values.dateEnd}
                min={values.dateStart}
                onChange={(event) => setDateEnd(event.target.value)}
                className={!isStudentStatsDateRangeValid(values.dateStart, values.dateEnd) ? "border-[#fca5a5] bg-[#fff1f2]" : undefined}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">开始时间</label>
              <TimeTextInput
                value={values.startTime}
                onValueChange={setStartTime}
                className={!isStudentStatsTimeRangeValid(values.startTime, values.endTime) ? "border-[#fca5a5] bg-[#fff1f2]" : undefined}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">结束时间</label>
              <TimeTextInput
                value={values.endTime}
                onValueChange={setEndTime}
                className={!isStudentStatsTimeRangeValid(values.startTime, values.endTime) ? "border-[#fca5a5] bg-[#fff1f2]" : undefined}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">上课状态</label>
              <Select value={values.statusFilter} onChange={(event) => setStatusFilter(event.target.value as StudentStatsStatusFilter)}>
                <option value="all">全部状态</option>
                {Object.entries(lessonStatusLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              { label: "实际课节", value: `${lessonCount} 节` },
              { label: "学生课次", value: `${studentLessonCount} 人次` },
              { label: "涉及学生", value: `${rows.length} 人` },
              { label: "已完成", value: `${completedCount} 节` },
              { label: "课时费合计", value: formatPrivateMoney(totalFee, amountsVisible) }
            ].map((item) => (
              <div key={item.label} className="rounded-[12px] border border-[#e8eef6] bg-[#f8fbff] p-3">
                <div className="text-xs font-semibold text-[#64748b]">{item.label}</div>
                <div className="mt-1 break-words text-base font-extrabold text-[#061226]">{item.value}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>学生课程数量</CardTitle>
            <CardDescription className="mt-1">一对一按学生展示；非一对一班型会放在同一节课里折叠，展开后查看每个学生。</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="w-fit">{rows.length} 人</Badge>
            <Badge variant="sky" className="w-fit">{groupedLessonRows.length} 组</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {groupedLessonRows.map((row, index) => {
            const isExpanded = expandedGroupIds.includes(row.groupId);
            const lesson = row.kind === "grouped" ? vault.lessons.find((item) => item.id === row.lessonId) : undefined;
            return row.kind === "grouped" ? (
              <motion.div
                key={row.groupId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                className="rounded-[14px] border border-[#cfe0f5] bg-[#f8fbff] p-4"
              >
                <button
                  type="button"
                  onClick={() => onToggleGroup(row.groupId)}
                  className="flex w-full flex-col gap-3 text-left lg:flex-row lg:items-start lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eaf2ff] text-sm font-extrabold text-[#1557c2]">
                        {row.studentCount}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-base font-extrabold text-[#061226]">{row.courseName}</div>
                        <div className="mt-1 text-xs font-semibold text-[#64748b]">
                          {row.date} · {row.startTime}-{row.endTime} · {row.campusName}
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">{row.subject}</Badge>
                      <Badge variant="sky" className="text-[10px]">{row.courseTypeLabel}</Badge>
                      <Badge variant={lessonStatusVariant(row.status)} className="text-[10px]">{lessonStatusLabels[row.status]}</Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
                    {[
                      { label: "学生课次", value: `${row.studentCount} 人次` },
                      { label: "课时", value: `${row.hours.toFixed(1)} 小时` },
                      { label: "课时费", value: formatPrivateMoney(row.amount, amountsVisible) },
                      { label: "明细", value: isExpanded ? "收起" : "展开" }
                    ].map((item) => (
                      <div key={item.label} className="rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2">
                        <div className="text-[11px] font-semibold text-[#64748b]">{item.label}</div>
                        <div className="mt-1 text-sm font-extrabold text-[#061226]">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 rounded-[12px] border border-[#e8eef6] bg-white p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="text-xs font-bold text-[#64748b]">同一节课里的学生</div>
                          {lesson && (
                            <Button type="button" size="sm" variant="outline" onClick={() => onOpenLesson(lesson)}>
                              查看课节
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          {row.students.map((student) => (
                            <div key={`${row.groupId}-${student.studentId}`} className="rounded-[10px] border border-[#eef2f7] bg-[#f8fbff] px-3 py-2 text-xs font-semibold text-[#64748b]">
                              <div className="font-extrabold text-[#061226]">{student.studentName}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <Badge variant={student.attendanceStatus === "attended" ? "sage" : student.attendanceStatus === "cancelled" ? "destructive" : "yellow"} className="text-[10px]">
                                  {attendanceLabels[student.attendanceStatus]}
                                </Badge>
                                {student.note && <span className="truncate">{student.note}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.div
                key={row.studentId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eaf2ff] text-sm font-extrabold text-[#1557c2]">
                        {row.studentName.slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-base font-extrabold text-[#061226]">{row.studentName}</div>
                        <div className="mt-1 text-xs font-semibold text-[#64748b]">
                          {row.courseNames.length > 0 ? row.courseNames.join("、") : "未关联课程名"}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:min-w-[640px] xl:grid-cols-6">
                    {[
                      { label: "总课次", value: `${row.total} 节` },
                      { label: "已完成", value: `${row.completed} 节` },
                      { label: "待上/待补", value: `${row.pending} 节` },
                      { label: "已取消", value: `${row.cancelled} 节` },
                      { label: "课时", value: `${row.hours.toFixed(1)} 小时` },
                      { label: "课时费", value: formatPrivateMoney(row.amount, amountsVisible) }
                    ].map((item) => (
                      <div key={item.label} className="rounded-[10px] border border-[#e8eef6] bg-white px-3 py-2">
                        <div className="text-[11px] font-semibold text-[#64748b]">{item.label}</div>
                        <div className="mt-1 text-sm font-extrabold text-[#061226]">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-4 rounded-[12px] border border-[#e8eef6] bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-xs font-bold text-[#64748b]">符合筛选的课程明细</div>
                    <Badge variant="secondary">{row.details.length} 节</Badge>
                  </div>
                  <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
                    {row.details.map((detail) => {
                      const lesson = vault.lessons.find((item) => item.id === detail.lessonId);
                      if (!lesson) return null;
                      return (
                        <button
                          key={`${row.studentId}-${detail.lessonId}`}
                          type="button"
                          onClick={() => onOpenLesson(lesson)}
                          className="grid w-full grid-cols-1 gap-2 rounded-[10px] border border-[#eef2f7] bg-[#f8fbff] px-3 py-2 text-left text-xs font-semibold text-[#64748b] transition-colors hover:border-[#1557c2] hover:bg-[#eef5ff] md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-extrabold text-[#061226]">{detail.courseName}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span>{detail.date} · {detail.startTime}-{detail.endTime} · {detail.campusName}</span>
                              <Badge variant="secondary" className="text-[10px]">
                                {detail.subject}
                              </Badge>
                              <Badge variant="secondary" className="text-[10px]">
                                {detail.courseTypeLabel}
                              </Badge>
                              <Badge variant={lessonStatusVariant(detail.status)} className="text-[10px]">
                                {lessonStatusLabels[detail.status]}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 md:justify-end">
                            <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-[#dbe4ef]">{detail.hours.toFixed(1)} 小时</span>
                            <span className="rounded-full bg-[#eaf2ff] px-2.5 py-1 font-extrabold text-[#1557c2]">{formatPrivateMoney(detail.amount, amountsVisible)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            );
          })}
          {groupedLessonRows.length === 0 && (
            <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
              没有符合当前筛选条件的学生课次
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
