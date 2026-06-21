import {
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  BarChart3,
  FileCheck2,
  ShieldCheck,
  Users,
  WalletCards
} from "lucide-react";
import type {
  AttendanceEntry,
  AttendanceStatus,
  BuiltInCourseType,
  Campus,
  CourseGroup,
  CourseType,
  CustomCourseTypeOption,
  Lesson,
  LessonStatus,
  Student,
  TeacherVault,
  UserRole,
  WeekStart,
  Weekday
} from "@/shared/types";
import { billableHoursForCourseLesson, buildFeeSnapshot, courseUsesStandardBillingHours, getCourse, monthOf, salaryBreakdown, todayIso } from "@/frontend/lib/calculations";
import { durationHours, timesOverlap as timeRangesOverlap } from "@/frontend/lib/time";
import { makeId } from "@/frontend/lib/crypto";

export type ViewKey = "today" | "calendar" | "schedule" | "progress" | "students" | "grades" | "payroll" | "salary" | "admin";

export const viewTitles: Record<ViewKey, string> = {
  today: "今日提醒",
  calendar: "日历总览",
  progress: "进度与作业",
  schedule: "排课与课时",
  students: "档案信息",
  grades: "成绩记录",
  payroll: "工资核对",
  salary: "数据统计",
  admin: "管理后台"
};

export const navItems: Array<{ key: ViewKey; icon: typeof CalendarDays; label: string }> = [
  { key: "today", icon: Bell, label: "今日提醒" },
  { key: "calendar", icon: CalendarCheck, label: "日历总览" },
  { key: "schedule", icon: CalendarDays, label: "排课与课时" },
  { key: "progress", icon: BookOpen, label: "进度与作业" },
  { key: "students", icon: Users, label: "档案信息" },
  { key: "grades", icon: BarChart3, label: "成绩记录" },
  { key: "payroll", icon: FileCheck2, label: "工资核对" },
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

export function isMakeupAttendanceStatus(status: AttendanceStatus): boolean {
  return status === "leave_requested" || status === "absent" || status === "makeup_pending";
}

export function isMakeupNeededAttendanceEntry(entry: Pick<AttendanceEntry, "status" | "makeupExempt">): boolean {
  return isMakeupAttendanceStatus(entry.status) && !entry.makeupExempt;
}

export function lessonStudentIds(lesson: Pick<Lesson, "expectedStudentIds" | "attendance">): string[] {
  return Array.from(new Set([
    ...lesson.expectedStudentIds,
    ...lesson.attendance.map((entry) => entry.studentId)
  ]));
}

export function attendedStudentIdsForLesson(
  lesson: Pick<Lesson, "expectedStudentIds" | "attendance" | "linkedOriginalLessonId">
): string[] {
  const attendedIds = lesson.attendance
    .filter((entry) => entry.status === "attended" || (Boolean(lesson.linkedOriginalLessonId) && entry.status === "makeup_completed"))
    .map((entry) => entry.studentId);
  if (attendedIds.length > 0 || lesson.attendance.length > 0) {
    return Array.from(new Set(attendedIds));
  }
  return Array.from(new Set(lesson.expectedStudentIds));
}

export function attendedStudentNamesForLesson(vault: TeacherVault, lesson: Pick<Lesson, "expectedStudentIds" | "attendance" | "linkedOriginalLessonId">): string {
  return studentNames(vault, attendedStudentIdsForLesson(lesson));
}

export function makeupNeededStudentIds(lesson: Pick<Lesson, "status" | "expectedStudentIds" | "attendance">): string[] {
  const attendanceStudentIds = lesson.attendance
    .filter((entry) => isMakeupNeededAttendanceEntry(entry))
    .map((entry) => entry.studentId);
  if (attendanceStudentIds.length > 0 || lesson.attendance.length > 0) {
    return Array.from(new Set(attendanceStudentIds));
  }
  return lesson.status === "makeup_pending" ? Array.from(new Set(lesson.expectedStudentIds)) : [];
}

export const courseTypeLabels: Record<BuiltInCourseType, string> = {
  one_on_one: "一对一",
  one_on_two: "一对二",
  class: "班课",
  trial: "试听"
};

export const builtInCourseTypeOptions: Array<{ value: BuiltInCourseType; label: string }> = (
  Object.keys(courseTypeLabels) as BuiltInCourseType[]
).map((value) => ({ value, label: courseTypeLabels[value] }));

export function isBuiltInCourseType(type: string): type is BuiltInCourseType {
  return Object.prototype.hasOwnProperty.call(courseTypeLabels, type);
}

export function courseTypeLabel(vault: TeacherVault, type: CourseType): string {
  const preferenceLabel = vault.preferences?.courseTypeLabels?.[type]?.trim();
  if (preferenceLabel) return preferenceLabel;
  if (isBuiltInCourseType(type)) return courseTypeLabels[type];
  return vault.preferences?.customCourseTypes?.find((item) => item.id === type)?.label || type;
}

export function courseTypeOptionsForVault(vault: TeacherVault): Array<{ value: CourseType; label: string }> {
  const customCourseTypes = normalizedCustomCourseTypes(vault.preferences?.customCourseTypes ?? []);
  const disabledCourseTypes = new Set(vault.preferences?.disabledCourseTypes ?? []);
  const activeBuiltInOptions = builtInCourseTypeOptions
    .filter((option) => !disabledCourseTypes.has(option.value))
    .map((option) => ({ value: option.value as CourseType, label: courseTypeLabel(vault, option.value) }));
  const activeCustomOptions = customCourseTypes
    .filter((option) => !disabledCourseTypes.has(option.id))
    .map((option) => ({ value: option.id as CourseType, label: courseTypeLabel(vault, option.id) }));
  const knownValues = new Set<string>([
    ...builtInCourseTypeOptions.map((option) => option.value),
    ...customCourseTypes.map((option) => option.id)
  ]);
  const dataCourseTypes = [...vault.courseGroups.map((course) => course.type), ...vault.lessons.map((lesson) => lesson.type)];
  const unknownCourseTypes = Array.from(new Set(dataCourseTypes)).filter((type) => !knownValues.has(type));

  return sortCourseTypeOptions([
    ...activeBuiltInOptions,
    ...activeCustomOptions,
    ...unknownCourseTypes.map((type) => ({ value: type, label: courseTypeLabel(vault, type) }))
  ]);
}

export function subjectOptionsForVault(vault: TeacherVault): string[] {
  const subjects = [
    ...(vault.preferences?.subjects ?? []),
    ...vault.courseGroups.map((course) => course.subject)
  ]
    .map((subject) => subject.trim())
    .filter(Boolean);
  const uniqueSubjects = Array.from(new Set(subjects));
  return (uniqueSubjects.length > 0 ? uniqueSubjects : ["语文"]).sort(compareByName);
}

export function studentLimitForCourseType(type: CourseType): number | undefined {
  if (type === "one_on_one") return 1;
  if (type === "one_on_two") return 2;
  return undefined;
}

function normalizedCustomCourseTypes(customCourseTypes: CustomCourseTypeOption[]): CustomCourseTypeOption[] {
  const seen = new Set<string>();
  return customCourseTypes.filter((option) => {
    const label = option.label.trim();
    if (!option.id || !label || seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
}

function sortCourseTypeOptions<T extends { value: string; label: string }>(options: T[]): T[] {
  return [...options].sort(
    (a, b) => compareByName(a.label, b.label) || a.value.localeCompare(b.value)
  );
}

export function lessonStatusVariant(status: LessonStatus): "sage" | "amber" | "yellow" | "destructive" | "secondary" | "sky" | "plum" {
  if (status === "completed" || status === "makeup_completed") return "sage";
  if (status === "cancelled") return "destructive";
  if (status === "makeup_pending") return "yellow";
  if (status === "scheduled") return "amber";
  return "secondary";
}

export function lessonStatusSurfaceClass(status: LessonStatus): string {
  if (status === "cancelled") {
    return "border-[#fecaca] bg-[#fff1f2] text-[#7f1d1d]";
  }
  if (status === "completed" || status === "makeup_completed") {
    return "border-[#bbf7d0] bg-[#f0fdf4] text-[#14532d]";
  }
  if (status === "makeup_pending") {
    return "border-[#facc15] bg-[#fef9c3] text-[#854d0e]";
  }
  if (status === "scheduled") {
    return "border-[#fed7aa] bg-[#fff7ed] text-[#7c2d12]";
  }
  return "border-[#dbe4ef] bg-white text-[#25324a]";
}

export const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
export const shortWeekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];
export const privacyNoticeLines = [
  "课程、学生、费用、校区、排课和作业信息会先在你的浏览器中加密。",
  "管理员后台无法查看老师课程明细和工资明细等隐私信息。",
  "管理员后台只能看到账号的角色、状态、注册时间、最近登录时间和删除流程状态。",
  "管理员后台除了查看上述信息和发布公告以外，无任何其他权限。",
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

export function formatPrivateMoney(value: number, visible: boolean): string {
  return visible ? formatMoney(value) : "***";
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
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatMonthIso(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function dateOnlyUtc(dateIso: string): Date {
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(dateIso: string, days: number): string {
  const date = dateOnlyUtc(dateIso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateIso(date);
}

export function weekdayOfDateIso(dateIso: string): Weekday {
  return dateOnlyUtc(dateIso).getUTCDay() as Weekday;
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
  const selected = dateOnlyUtc(date);
  const offset = (selected.getUTCDay() - start + 7) % 7;
  selected.setUTCDate(selected.getUTCDate() - offset);

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(selected);
    day.setUTCDate(selected.getUTCDate() + index);
    return formatDateIso(day);
  });
}

export function findCampus(vault: TeacherVault, campusId?: string): Campus | undefined {
  return vault.campuses.find((campus) => campus.id === campusId);
}

const nameCollator = new Intl.Collator("zh-Hans-CN-u-co-pinyin", {
  numeric: true,
  sensitivity: "base"
});

export function compareByName(a: string, b: string): number {
  return nameCollator.compare(a, b);
}

export function sortCampusesForProfile(campuses: Campus[], homeCampusId?: string): Campus[] {
  return [...campuses].sort((a, b) => {
    if (homeCampusId) {
      if (a.id === homeCampusId && b.id !== homeCampusId) return -1;
      if (b.id === homeCampusId && a.id !== homeCampusId) return 1;
    }
    const nameOrder = compareByName(a.name, b.name);
    return nameOrder || a.id.localeCompare(b.id);
  });
}

export function sortStudentsByName(students: Student[]): Student[] {
  return [...students].sort((a, b) => compareByName(a.name, b.name) || a.id.localeCompare(b.id));
}

export function sortCoursesByName(courses: CourseGroup[]): CourseGroup[] {
  return [...courses].sort(
    (a, b) =>
      compareByName(a.name, b.name) ||
      compareByName(a.subject, b.subject) ||
      a.id.localeCompare(b.id)
  );
}

export function findStudent(vault: TeacherVault, studentId: string): Student | undefined {
  return vault.students.find((student) => student.id === studentId);
}

export function courseName(vault: TeacherVault, courseId: string): string {
  return getCourse(vault, courseId)?.name ?? "未命名课程";
}

export function courseSubject(vault: TeacherVault, courseId: string): string {
  return getCourse(vault, courseId)?.subject ?? "未设置科目";
}

export function campusName(vault: TeacherVault, campusId?: string): string {
  return findCampus(vault, campusId)?.name ?? "未设置校区";
}

export function lessonCampusId(vault: TeacherVault, lesson: Pick<Lesson, "campusId" | "courseGroupId">): string | undefined {
  return lesson.campusId ?? getCourse(vault, lesson.courseGroupId)?.defaultCampusId;
}

export function studentNames(vault: TeacherVault, studentIds: string[]): string {
  return studentIds
    .map((id) => ({ id, name: findStudent(vault, id)?.name ?? "未知学生" }))
    .sort((a, b) => compareByName(a.name, b.name) || a.id.localeCompare(b.id))
    .map((item) => item.name)
    .join("、");
}

export function lessonAttendanceNotes(vault: TeacherVault, lesson: Pick<Lesson, "attendance">): Array<{ studentId: string; studentName: string; note: string }> {
  return lesson.attendance
    .map((entry) => ({
      studentId: entry.studentId,
      studentName: findStudent(vault, entry.studentId)?.name ?? "未知学生",
      note: entry.note?.trim() ?? ""
    }))
    .filter((item) => Boolean(item.note))
    .sort((a, b) => compareByName(a.studentName, b.studentName) || a.studentId.localeCompare(b.studentId));
}

export function lessonAttendanceNoteText(vault: TeacherVault, lesson: Pick<Lesson, "attendance">): string {
  return lessonAttendanceNotes(vault, lesson)
    .map((item) => `${item.studentName}：${item.note}`)
    .join("；");
}

export function formatDurationHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0 小时";
  const rounded = Math.round(hours * 100) / 100;
  return `${String(rounded).replace(/\.0+$|(\.\d*[1-9])0+$/, "$1")} 小时`;
}

export function lessonDurationText(lesson: Pick<Lesson, "startTime" | "endTime">): string {
  return formatDurationHours(durationHours(lesson.startTime, lesson.endTime));
}

export function lessonTimeRangeLabel(lesson: Pick<Lesson, "startTime" | "endTime">): string {
  return `${lesson.startTime}-${lesson.endTime} · 实际时长 ${lessonDurationText(lesson)}`;
}

export function courseTimeRangeBillingLabel(vault: TeacherVault, lesson: Pick<Lesson, "startTime" | "endTime"> & Partial<Pick<Lesson, "feeSnapshot">>, courseId?: string): string {
  const course = courseId ? getCourse(vault, courseId) : undefined;
  if (!course || !courseUsesStandardBillingHours(course)) {
    return lessonTimeRangeLabel(lesson);
  }
  const hasSnapshotHours = lesson.feeSnapshot && Number.isFinite(lesson.feeSnapshot.hours);
  const hours = hasSnapshotHours ? Math.max(lesson.feeSnapshot?.hours ?? 0, 0) : billableHoursForCourseLesson(course, lesson, vault);
  const billingLabel = lesson.feeSnapshot?.manualHours ? "手动计费课时" : "计费课时";
  return `${lesson.startTime}-${lesson.endTime} · 实际时长 ${lessonDurationText(lesson)} · ${billingLabel} ${formatDurationHours(hours)}`;
}

export function lessonTimeRangeBillingLabel(vault: TeacherVault, lesson: Pick<Lesson, "startTime" | "endTime" | "courseGroupId"> & Partial<Pick<Lesson, "feeSnapshot">>): string {
  return courseTimeRangeBillingLabel(vault, lesson, lesson.courseGroupId);
}

export function lessonBillingSummary(vault: TeacherVault, lesson: Pick<Lesson, "startTime" | "endTime" | "courseGroupId"> & Partial<Pick<Lesson, "feeSnapshot">>): string | undefined {
  const course = getCourse(vault, lesson.courseGroupId);
  if (!course || !courseUsesStandardBillingHours(course)) return undefined;
  const hasSnapshotHours = lesson.feeSnapshot && Number.isFinite(lesson.feeSnapshot.hours);
  const hours = hasSnapshotHours ? Math.max(lesson.feeSnapshot?.hours ?? 0, 0) : billableHoursForCourseLesson(course, lesson, vault);
  return `${lesson.feeSnapshot?.manualHours ? "手动计费课时" : "计费课时"} ${formatDurationHours(hours)}`;
}

export function lessonStudentDisplay(vault: TeacherVault, lesson: Pick<Lesson, "type" | "expectedStudentIds" | "attendance" | "linkedOriginalLessonId">): string {
  const expectedStudentCount = new Set(lesson.expectedStudentIds).size;
  const attendedIds = attendedStudentIdsForLesson(lesson);
  const attendedCount = attendedIds.length;
  const attendedNames = studentNames(vault, attendedIds);

  if (lesson.type === "class" && expectedStudentCount > 10) {
    return `${attendedCount}/${expectedStudentCount} 人`;
  }

  if (attendedNames) {
    return `「${attendedNames}」`;
  }

  if (lesson.type === "class") {
    return `${attendedCount}/${expectedStudentCount} 人`;
  }

  return "暂无实到学生";
}

export function previousLesson(vault: TeacherVault, lesson: Lesson): Lesson | undefined {
  if (lesson.syncSourceLessonId) {
    const sourceLesson = vault.lessons.find((item) => item.id === lesson.syncSourceLessonId);
    if (sourceLesson) return sourceLesson;
  }

  if (lesson.syncSourceDate) {
    const sourceLesson = vault.lessons.find(
      (item) =>
        item.courseGroupId === lesson.courseGroupId &&
        item.date === lesson.syncSourceDate &&
        item.startTime === lesson.startTime &&
        item.endTime === lesson.endTime
    );
    if (sourceLesson) return sourceLesson;
  }

  const previous = vault.lessons
    .filter(
      (item) =>
        item.courseGroupId === lesson.courseGroupId &&
        item.status !== "cancelled" &&
        `${item.date} ${item.startTime}` < `${lesson.date} ${lesson.startTime}`
    )
    .sort(sortLessons)
    .at(-1);

  if (previous && lesson.syncTargetStartDate && previous.date < lesson.syncTargetStartDate) {
    return undefined;
  }
  return previous;
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
    syncTargetStartDate?: string;
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
    attendance: course.studentIds.map((studentId) => ({
      studentId,
      status: "attended",
      trial: Boolean(vault.students.find((student) => student.id === studentId)?.temporaryTrial)
    })),
    feeSnapshot: { amount: 0 },
    linkedOriginalLessonId: null,
    sourceScheduleRuleId: values.sourceScheduleRuleId,
    syncTargetStartDate: values.syncTargetStartDate,
    content: {
      taught: "",
      performance: "",
      homework: "",
      nextLessonReminder: "",
      internalNote: ""
    }
  };

  lesson.feeSnapshot = buildFeeSnapshot(vault, course, lesson);
  return lesson;
}

function lessonTimesOverlap(firstStart: string, firstEnd: string, secondStart: string, secondEnd: string): boolean {
  return timeRangesOverlap(firstStart, firstEnd, secondStart, secondEnd);
}

export function buildScheduleSyncLessonsForDate(
  vault: TeacherVault,
  sourceLessons: Lesson[],
  targetDate: string,
  syncTargetStartDate: string
): { lessons: Lesson[]; replaceLessonIds: string[]; skippedCount: number; conflictSkippedCount: number } {
  const replaceLessonIds = new Set<string>();
  const lessons: Lesson[] = [];
  let skippedCount = 0;
  let conflictSkippedCount = 0;

  sourceLessons.forEach((sourceLesson) => {
    const course = getCourse(vault, sourceLesson.courseGroupId);
    if (!course || course.status !== "active") {
      skippedCount += 1;
      return;
    }

    const targetTimeConflicts = vault.lessons.filter(
      (existingLesson) =>
        existingLesson.date === targetDate &&
        existingLesson.status !== "cancelled" &&
        lessonTimesOverlap(existingLesson.startTime, existingLesson.endTime, sourceLesson.startTime, sourceLesson.endTime)
    );
    if (targetTimeConflicts.some((existingLesson) => existingLesson.courseGroupId !== sourceLesson.courseGroupId)) {
      conflictSkippedCount += 1;
      return;
    }
    targetTimeConflicts.forEach((existingLesson) => {
      replaceLessonIds.add(existingLesson.id);
    });

    lessons.push(
      {
        ...createLessonFromCourse(vault, course, {
          date: targetDate,
          startTime: sourceLesson.startTime,
          endTime: sourceLesson.endTime,
          campusId: sourceLesson.campusId ?? course.defaultCampusId,
          status: "scheduled",
          syncTargetStartDate
        })
      }
    );
  });

  return { lessons, replaceLessonIds: [...replaceLessonIds], skippedCount, conflictSkippedCount };
}

export function linkSyncedLessonsToPreviousLessons(vault: TeacherVault, lessons: Lesson[], replaceLessonIds: string[] = []): Lesson[] {
  const replaceLessonIdSet = new Set(replaceLessonIds);
  const timeline = vault.lessons
    .filter((lesson) => !replaceLessonIdSet.has(lesson.id))
    .sort(sortLessons);
  const linkedLessons = new Map<string, Lesson>();

  [...lessons].sort(sortLessons).forEach((lesson) => {
    const lessonDateTime = `${lesson.date} ${lesson.startTime}`;
    const sourceLesson = timeline
      .filter(
        (item) =>
          item.courseGroupId === lesson.courseGroupId &&
          item.status !== "cancelled" &&
          `${item.date} ${item.startTime}` < lessonDateTime
      )
      .sort(sortLessons)
      .at(-1);
    const linkedLesson = sourceLesson
      ? {
          ...lesson,
          syncSourceLessonId: sourceLesson.id,
          syncSourceDate: sourceLesson.date
        }
      : lesson;
    linkedLessons.set(lesson.id, linkedLesson);
    timeline.push(linkedLesson);
  });

  return lessons.map((lesson) => linkedLessons.get(lesson.id) ?? lesson);
}

export function nextSevenDates(fromDate: string): string[] {
  const start = dateOnlyUtc(fromDate);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return formatDateIso(date);
  });
}

export function datesBetween(startDate: string, endDate: string): string[] {
  const start = dateOnlyUtc(startDate);
  const end = dateOnlyUtc(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(formatDateIso(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function calendarDates(month: string, weekStart: WeekStart = 0): string[] {
  const firstDay = dateOnlyUtc(`${month}-01`);
  const cursor = new Date(firstDay);
  const offset = (firstDay.getUTCDay() - weekStart + 7) % 7;
  cursor.setUTCDate(firstDay.getUTCDate() - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(cursor);
    date.setUTCDate(cursor.getUTCDate() + index);
    return formatDateIso(date);
  });
}

export function monthShift(month: string, offset: number): string {
  const date = dateOnlyUtc(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return formatMonthIso(date);
}
