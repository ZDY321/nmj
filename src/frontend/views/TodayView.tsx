import { motion } from "framer-motion";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  NotebookPen,
  Users,
  XCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Lesson, TeacherVault } from "@/shared/types";
import {
  attendanceLabels,
  campusName,
  courseName,
  findStudent,
  formatMoney,
  isToday,
  lessonStatusLabels,
  lessonStatusVariant,
  previousHomework,
  previousLesson,
  sortLessons,
  studentNames
} from "@/frontend/lib/helpers";

export function TodayView({
  vault,
  selectedDate,
  onUpdateLesson
}: {
  vault: TeacherVault;
  selectedDate: string;
  onUpdateLesson: (lesson: Lesson) => void;
}) {
  const selectedDateLessons = vault.lessons.filter((lesson) => lesson.date === selectedDate).sort(sortLessons);
  const waitingLessons = selectedDateLessons.filter((lesson) => lesson.status === "scheduled" || lesson.status === "draft");
  const cancelledLessons = selectedDateLessons.filter((lesson) => lesson.status === "cancelled");
  const campusCounts = vault.campuses
    .map((campus) => ({
      campus,
      count: selectedDateLessons.filter((lesson) => lesson.campusId === campus.id).length
    }))
    .filter((item) => item.count > 0);
  const homeworkReminderCount = selectedDateLessons.filter((lesson) => previousHomework(vault, lesson).trim()).length;
  const selectedDateLabel = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(new Date(`${selectedDate}T00:00:00`));

  function quickStatus(lesson: Lesson, status: "completed" | "cancelled") {
    onUpdateLesson({ ...lesson, status });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[ 
          { label: isToday(selectedDate) ? "今日课程" : "选中日期课程", value: `${selectedDateLessons.length} 节`, icon: CalendarDays },
          { label: "待上课", value: `${waitingLessons.length} 节`, icon: Clock3 },
          { label: "作业提醒", value: `${homeworkReminderCount} 条`, icon: NotebookPen },
          { label: "已取消", value: `${cancelledLessons.length} 条`, icon: XCircle }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="overflow-hidden">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#fff1e2] text-[#ff8617]">
                  <Icon size={22} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#64748b]">{item.label}</div>
                  <div className="mt-1 text-2xl font-extrabold text-[#061226]">{item.value}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-extrabold text-[#061226]">各校区课程数量</div>
              <div className="mt-1 text-sm font-semibold text-[#64748b]">
                {selectedDateLabel} 的校区分布，便于提前确认通勤和教室。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {campusCounts.length > 0 ? campusCounts.map((item) => (
                <Badge key={item.campus.id} variant="sky" className="px-3 py-1">
                  {item.campus.name} · {item.count} 节
                </Badge>
              )) : (
                <Badge variant="secondary" className="px-3 py-1">暂无校区课程</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-[#e8eef6] pb-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-[#ff8617]">
                <BookOpen size={14} /> 今日提醒
              </div>
              <CardTitle className="text-xl">
                {isToday(selectedDate) ? "今天应该上的课程" : "选中日期课程"}
              </CardTitle>
              <CardDescription className="mt-2">
                {selectedDateLabel}，按上课时间排列，并显示上节课留下的作业提醒。
              </CardDescription>
            </div>
            <Badge variant={selectedDateLessons.length ? "sky" : "secondary"} className="w-fit">
              {selectedDateLessons.length ? `${selectedDateLessons.length} 节` : "无课程"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-4 sm:p-6">
          {selectedDateLessons.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
              {isToday(selectedDate) ? "今天没有已生成的课程。" : "这一天没有已生成的课程。"}
            </div>
          ) : (
            selectedDateLessons.map((lesson, index) => {
              const homework = previousHomework(vault, lesson).trim();
              const previous = previousLesson(vault, lesson);
              const campusTone = campusColorClass(vault.campuses.findIndex((campus) => campus.id === lesson.campusId));
              return (
                <motion.article
                  key={lesson.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className="rounded-[16px] border border-[#dbe4ef] bg-white p-4 shadow-[0_10px_26px_rgba(15,35,66,0.06)] sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-extrabold text-[#061226]">
                        {courseName(vault, lesson.courseGroupId)}
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-[#64748b]">
                        <span className="flex items-center gap-1 rounded-full bg-[#f3f7fb] px-2.5 py-1">
                          <Clock3 size={13} /> {lesson.startTime}-{lesson.endTime}
                        </span>
                        <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 ${campusTone}`}>
                          <MapPin size={13} /> {campusName(vault, lesson.campusId)}
                        </span>
                        <span className="flex items-center gap-1 rounded-full bg-[#f3f7fb] px-2.5 py-1">
                          <Users size={13} /> {studentNames(vault, lesson.expectedStudentIds) || "未设置学生"}
                        </span>
                      </div>
                    </div>
                    <Badge variant={lessonStatusVariant(lesson.status)} className="w-fit">
                      {lessonStatusLabels[lesson.status]}
                    </Badge>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                    <div className="rounded-[14px] border border-[#e8eef6] bg-[#f8fbff] p-4">
                      <div className="mb-2 text-sm font-extrabold text-[#25324a]">学生情况</div>
                      <div className="flex flex-wrap gap-2">
                        {lesson.attendance.length > 0 ? lesson.attendance.map((entry) => (
                          <span key={entry.studentId} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#475569] ring-1 ring-[#dbe4ef]">
                            {findStudent(vault, entry.studentId)?.name ?? "未知学生"} · {attendanceLabels[entry.status]}
                          </span>
                        )) : lesson.expectedStudentIds.map((studentId) => (
                          <span key={studentId} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#475569] ring-1 ring-[#dbe4ef]">
                            {findStudent(vault, studentId)?.name ?? "未知学生"}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[14px] border border-[#e8eef6] bg-[#f8fbff] p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#25324a]">
                        <BookOpen size={16} className="text-[#1557c2]" />
                        上节课内容
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-[#475569]">
                        {previous?.content.taught.trim() || "上一节课没有记录内容。"}
                      </p>
                    </div>
                    <div className="rounded-[14px] border border-[#e8eef6] bg-[#f8fbff] p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#25324a]">
                        <NotebookPen size={16} className="text-[#ff8617]" />
                        上节课作业
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-[#475569]">
                        {homework || "上一节课没有记录作业。"}
                      </p>
                    </div>
                  </div>

                  {lesson.status === "cancelled" && (
                    <div className="mt-4 rounded-[14px] border border-[#fecaca] bg-[#fff1f2] p-3">
                      <label className="text-sm font-extrabold text-[#7f1d1d]">取消备注</label>
                      <Input
                        value={lesson.note ?? ""}
                        onChange={(event) => onUpdateLesson({ ...lesson, note: event.target.value })}
                        placeholder="填写取消原因，例如学生请假 / 校区临时停课"
                        className="mt-2 bg-white"
                      />
                    </div>
                  )}

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-bold text-[#061226]">
                      本节预计金额：{formatMoney(lesson.feeSnapshot.amount)}
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                      <Button size="sm" onClick={() => quickStatus(lesson, "completed")} className="bg-[#16a34a] shadow-none hover:bg-[#15803d]">
                        <CheckCircle2 size={15} /> 完成
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => quickStatus(lesson, "cancelled")}>
                        <XCircle size={15} /> 取消
                      </Button>
                    </div>
                  </div>
                </motion.article>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function campusColorClass(index: number): string {
  const tones = [
    "bg-[#eaf2ff] text-[#1557c2] ring-1 ring-[#bfdbfe]",
    "bg-[#fff3e4] text-[#c2410c] ring-1 ring-[#fed7aa]",
    "bg-[#e8f8ef] text-[#15803d] ring-1 ring-[#bbf7d0]",
    "bg-[#eef0ff] text-[#5161d6] ring-1 ring-[#c7d2fe]",
    "bg-[#fef2f2] text-[#dc2626] ring-1 ring-[#fecaca]"
  ];
  return tones[Math.max(index, 0) % tones.length];
}
