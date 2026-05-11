import {
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ShieldCheck,
  Users,
  WalletCards
} from "lucide-react";
import type {
  AttendanceStatus,
  Campus,
  CourseGroup,
  Lesson,
  LessonStatus,
  ScheduleRule,
  Student,
  TeacherVault,
  UserRole,
  WeekStart,
  Weekday
} from "@/shared/types";
import { calculateFee, getCourse, hoursBetween, monthOf, presentCount, salaryBreakdown, todayIso } from "@/frontend/lib/calculations";
import { makeId } from "@/frontend/lib/crypto";

export type ViewKey = "today" | "calendar" | "schedule" | "students" | "salary" | "admin";

export const viewTitles: Record<ViewKey, string> = {
  today: "今日提醒",
  calendar: "日历总览",
  schedule: "排课与课时",
  students: "学生与校区",
  salary: "数据统计",
  admin: "管理后台"
};

export const navItems: Array<{ key: ViewKey; icon: typeof CalendarDays; label: string }> = [
  { key: "today", icon: Bell, label: "今日提醒" },
  { key: "calendar", icon: CalendarCheck, label: "日历总览" },
  { key: "schedule", icon: CalendarDays, label: "排课与课时" },
  { key: "students", icon: Users, label: "学生与校区" },
  { key: "salary", icon: WalletCards, label: "数据统计" }
];

export const attendanceLabels: Record<AttendanceStatus, string> = {
  attended: "到课",
  leave_requested: "请假",
  absent: "缺席",
  cancelled: "取消",
  makeup_pending: "待补课",
  makeup_completed: "已补课"
};

export const lessonStatusLabels: Record<LessonStatus, string> = {
  draft: "草稿",
  scheduled: "待上课",
  completed: "已完成",
  cancelled: "已取消",
  makeup_pending: "待补课",
  makeup_completed: "补课完成"
};

export const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
export const shortWeekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];
export const privacyNoticeLines = [
  "课程、学生、费用、校区、排课和作业信息会先在你的浏览器中加密。",
  "管理员后台无法查看老师课程明细和工资明细等隐私信息。",
  "管理员后台只能看到账号的角色、状态、注册时间、最近登录时间和删除流程状态。",
  "如果直接查看数据库，敏感内容也只会是密文。",
  "登录密码/数据密码必须由你自己严肃保存，丢失后无法找回，也无法解析云端密文。"
];

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0
  }).format(value);
}

export function isToday(date: string): boolean {
  return date === todayIso();
}

export function sortLessons(a: Lesson, b: Lesson): number {
  return `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`);
}

export function cloneVault(vault: TeacherVault): TeacherVault {
  return structuredClone(vault);
}

export function formatDateIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatMonthIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function weekStartsOn(vault: TeacherVault): WeekStart {
  return vault.preferences?.weekStartsOn ?? 0;
}

export function orderedWeekdays(start: WeekStart): Weekday[] {
  return Array.from({ length: 7 }, (_, index) => ((start + index) % 7) as Weekday);
}

export function orderedWeekdayLabels(start: WeekStart, labels = weekdayLabels): string[] {
  return orderedWeekdays(start).map((day) => labels[day]);
}

export function weekDatesFor(date: string, start: WeekStart): string[] {
  const selected = new Date(`${date}T00:00:00`);
  const offset = (selected.getDay() - start + 7) % 7;
  selected.setDate(selected.getDate() - offset);

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(selected);
    day.setDate(selected.getDate() + index);
    return formatDateIso(day);
  });
}

export function findCampus(vault: TeacherVault, campusId?: string): Campus | undefined {
  return vault.campuses.find((campus) => campus.id === campusId);
}

export function findStudent(vault: TeacherVault, studentId: string): Student | undefined {
  return vault.students.find((student) => student.id === studentId);
}

export function courseName(vault: TeacherVault, courseId: string): string {
  return getCourse(vault, courseId)?.name ?? "未命名课程";
}

export function campusName(vault: TeacherVault, campusId?: string): string {
  return findCampus(vault, campusId)?.name ?? "未设置校区";
}

export function studentNames(vault: TeacherVault, studentIds: string[]): string {
  return studentIds.map((id) => findStudent(vault, id)?.name ?? "未知学生").join("、");
}

export function previousHomework(vault: TeacherVault, lesson: Lesson): string {
  const previous = vault.lessons
    .filter(
      (item) =>
        item.courseGroupId === lesson.courseGroupId &&
        `${item.date} ${item.startTime}` < `${lesson.date} ${lesson.startTime}` &&
        Boolean(item.content.homework.trim())
    )
    .sort(sortLessons)
    .at(-1);

  return previous?.content.homework || lesson.content.nextLessonReminder;
}

export function createLessonFromCourse(
  vault: TeacherVault,
  course: CourseGroup,
  values: {
    date: string;
    startTime: string;
    endTime: string;
    campusId?: string;
    status?: LessonStatus;
    sourceScheduleRuleId?: string;
  }
): Lesson {
  const lesson: Lesson = {
    id: makeId("lesson"),
    date: values.date,
    startTime: values.startTime,
    endTime: values.endTime,
    courseGroupId: course.id,
    campusId: values.campusId ?? course.defaultCampusId,
    type: course.type,
    status: values.status ?? "scheduled",
    expectedStudentIds: [...course.studentIds],
    attendance: course.studentIds.map((studentId) => ({ studentId, status: "attended" })),
    feeSnapshot: { amount: 0 },
    linkedOriginalLessonId: null,
    sourceScheduleRuleId: values.sourceScheduleRuleId,
    content: {
      taught: "",
      performance: "",
      homework: "",
      nextLessonReminder: "",
      internalNote: ""
    }
  };

  const reminder = previousHomework(vault, lesson);
  lesson.content.nextLessonReminder = reminder;
  lesson.feeSnapshot = {
    baseFee: course.feeRule.baseFee,
    hourlyRate: course.feeRule.hourlyRate,
    fixedFee: course.feeRule.fixedFee,
    perPresentStudentFee: course.feeRule.perPresentStudentFee,
    presentStudentCount: presentCount(lesson),
    hours: hoursBetween(lesson.startTime, lesson.endTime),
    amount: calculateFee(course.feeRule, lesson)
  };
  return lesson;
}

export function nextSevenDates(fromDate: string): string[] {
  const start = new Date(`${fromDate}T00:00:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return formatDateIso(date);
  });
}

export function datesBetween(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(formatDateIso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function calendarDates(month: string, weekStart: WeekStart = 0): string[] {
  const firstDay = new Date(`${month}-01T00:00:00`);
  const cursor = new Date(firstDay);
  const offset = (firstDay.getDay() - weekStart + 7) % 7;
  cursor.setDate(firstDay.getDate() - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(cursor);
    date.setDate(cursor.getDate() + index);
    return formatDateIso(date);
  });
}

export function monthShift(month: string, offset: number): string {
  const date = new Date(`${month}-01T00:00:00`);
  date.setMonth(date.getMonth() + offset);
  return formatMonthIso(date);
}
