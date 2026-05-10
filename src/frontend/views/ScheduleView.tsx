import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Clock, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ScheduleRule, TeacherVault, Weekday } from "@/shared/types";
import { getCourse, todayIso } from "@/frontend/lib/calculations";
import { makeId } from "@/frontend/lib/crypto";
import {
  calendarDates,
  campusName,
  courseName,
  datesBetween,
  monthShift,
  createLessonFromCourse,
  weekdayLabels
} from "@/frontend/lib/helpers";

export function ScheduleView({
  vault,
  onAddRule,
  onGenerateDrafts,
  onAddScheduledLesson
}: {
  vault: TeacherVault;
  onAddRule: (rule: ScheduleRule) => void;
  onGenerateDrafts: (
    startDate: string,
    endDate: string,
    weekdays: Weekday[],
    courseGroupId: string,
    startTime: string,
    endTime: string
  ) => void;
  onAddScheduledLesson: (date: string, courseGroupId: string, startTime: string, endTime: string) => void;
}) {
  const [courseGroupId, setCourseGroupId] = useState(vault.courseGroups[0]?.id ?? "");
  const [weekday, setWeekday] = useState<Weekday>(3);
  const [selectedWeekdays, setSelectedWeekdays] = useState<Weekday[]>([3]);
  const [startTime, setStartTime] = useState("19:00");
  const [endTime, setEndTime] = useState("21:00");
  const [rangeStart, setRangeStart] = useState(todayIso());
  const [rangeEnd, setRangeEnd] = useState(monthShift(todayIso().slice(0, 7), 1) + "-01");
  const [calendarMonth, setCalendarMonth] = useState(todayIso().slice(0, 7));

  function submit(event: FormEvent) {
    event.preventDefault();
    const course = getCourse(vault, courseGroupId);
    if (!course) return;
    onAddRule({
      id: makeId("rule"),
      courseGroupId,
      weekday,
      startTime,
      endTime,
      campusId: course.defaultCampusId,
      effectiveFrom: todayIso(),
      enabled: true
    });
  }

  function toggleWeekday(day: Weekday) {
    setSelectedWeekdays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort()
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="overflow-hidden">
          <form onSubmit={submit}>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <div className="flex items-center gap-2 text-[#ff8617] text-xs font-bold uppercase tracking-widest mb-1">
                  <CalendarCheck size={14} /> 固定排课
                </div>
                <CardTitle>排课规则</CardTitle>
                <CardDescription>选择课程和星期，批量生成待确认课程</CardDescription>
              </div>
              <Button type="submit" size="sm">
                <Plus size={15} /> 添加规则
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">课程</label>
                  <Select
                    value={courseGroupId}
                    onChange={(e) => setCourseGroupId(e.target.value)}
                  >
                    {vault.courseGroups.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">添加规则用星期</label>
                  <Select
                    value={weekday}
                    onChange={(e) => setWeekday(Number(e.target.value) as Weekday)}
                  >
                    {weekdayLabels.map((label, i) => (
                      <option key={label} value={i}>{label}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">开始</label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">结束</label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">范围开始</label>
                  <Input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">范围结束</label>
                  <Input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">选择生成星期</p>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {weekdayLabels.map((label, i) => (
                    <Button
                      key={label}
                      type="button"
                      variant={selectedWeekdays.includes(i as Weekday) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleWeekday(i as Weekday)}
                      className={selectedWeekdays.includes(i as Weekday) ? "orange-gradient shadow-[0_10px_20px_rgba(255,134,23,0.18)]" : ""}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() =>
                  onGenerateDrafts(rangeStart, rangeEnd, selectedWeekdays, courseGroupId, startTime, endTime)
                }
              >
                <CalendarCheck size={16} /> 按日期范围生成待确认课程
              </Button>
            </CardContent>
          </form>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-[#1557c2] text-xs font-bold uppercase tracking-widest mb-1">
                <CalendarDays size={14} /> 点击日历排课
              </div>
              <CardTitle>日历排课</CardTitle>
              <CardDescription>选好课程和时间后，点击日期即可排课</CardDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setCalendarMonth((m: string) => monthShift(m, -1))}>
                <ChevronLeft size={18} />
              </Button>
              <span className="font-bold w-[80px] text-center">{calendarMonth}</span>
              <Button variant="ghost" size="icon" onClick={() => setCalendarMonth((m: string) => monthShift(m, 1))}>
                <ChevronRight size={18} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {weekdayLabels.map((d) => (
                <div key={d} className="text-center text-xs font-bold text-(--color-muted-foreground) py-2">{d}</div>
              ))}
              {calendarDates(calendarMonth).map((date) => {
                const dayLessons = vault.lessons.filter((l) => l.date === date);
                const isCurrentMonth = date.startsWith(calendarMonth);
                return (
                  <motion.button
                    key={date}
                    whileHover={{ scale: 1.08, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onAddScheduledLesson(date, courseGroupId, startTime, endTime)}
                    className={`relative flex flex-col items-start p-2.5 rounded-[14px] min-h-[90px] text-left transition-all border ${
                      isCurrentMonth
                        ? "bg-white border-[#dbe4ef] hover:border-[#ff8617] hover:shadow-[0_10px_24px_rgba(15,35,66,0.08)]"
                        : "bg-white border-transparent opacity-40"
                    }`}
                  >
                    <span className={`text-sm font-bold ${isCurrentMonth ? "text-(--color-foreground)" : ""}`}>
                      {Number(date.slice(8))}
                    </span>
                    {dayLessons.length > 0 ? (
                      <Badge variant="secondary" className="mt-1 text-[10px]">{dayLessons.length} 节</Badge>
                    ) : (
                      <span className="text-[10px] text-(--color-muted-foreground) mt-1">点击排课</span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex items-center gap-2 text-[#ff8617] text-xs font-bold uppercase tracking-widest mb-1">
            <Clock size={14} /> 已设置规则
          </div>
          <CardTitle>排课规则列表</CardTitle>
          <CardDescription>排课规则也会作为敏感数据加密保存</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {vault.scheduleRules.map((rule) => (
            <motion.div
              key={rule.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between p-4 rounded-[14px] bg-[#f8fbff] border border-[#dbe4ef] hover:shadow-[0_10px_24px_rgba(15,35,66,0.08)] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[12px] bg-[#fff1e2] flex items-center justify-center">
                  <Clock size={16} className="text-[#ff8617]" />
                </div>
                <div>
                  <strong className="text-sm font-semibold">{courseName(vault, rule.courseGroupId)}</strong>
                  <p className="text-xs text-(--color-muted-foreground)">
                    {weekdayLabels[rule.weekday]} {rule.startTime}-{rule.endTime} · {campusName(vault, rule.campusId)}
                  </p>
                </div>
              </div>
              <Badge variant={rule.enabled ? "sage" : "secondary"}>{rule.enabled ? "启用" : "停用"}</Badge>
            </motion.div>
          ))}
          {vault.scheduleRules.length === 0 && (
            <p className="text-sm text-(--color-muted-foreground) text-center py-8">还没有排课规则</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
