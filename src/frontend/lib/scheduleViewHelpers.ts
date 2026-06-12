import type { AiProviderConfig, AttendanceStatus, CourseGroup, DeletedLesson, Lesson, TeacherVault, WeekStart } from "@/shared/types";
import { formatAppDateTime, getCourse, lessonBillableHours, todayIso } from "@/frontend/lib/calculations";
import { timeToMinutes as parseTimeToMinutes } from "@/frontend/lib/time";
import {
  addDays,
  attendedStudentNamesForLesson,
  campusName,
  compareByName,
  courseName,
  courseSubject,
  courseTypeLabel,
  findStudent,
  formatDateIso,
  isMakeupAttendanceStatus,
  lessonStatusLabels,
  lessonStudentIds,
  makeupNeededStudentIds,
  sortLessons,
  studentNames,
  subjectOptionsForVault,
  weekdayLabels,
  weekdayOfDateIso
} from "@/frontend/lib/helpers";
import type { CourseTypeFilter, LessonScope } from "@/frontend/lib/scheduleViewTypes";

export function offsetDate(offset: number): string {
  return addDays(todayIso(), offset);
}

export function isoWeekValue(dateIso: string): string {
  const date = parseDateOnlyUtc(dateIso);
  const day = date.getUTCDay() || 7;
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - day);
  const year = thursday.getUTCFullYear();
  const firstThursday = parseDateOnlyUtc(`${year}-01-04`);
  const firstDay = firstThursday.getUTCDay() || 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 4 - firstDay);
  const week = Math.floor((thursday.getTime() - firstThursday.getTime()) / 604_800_000) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function datesForIsoWeekValue(value: string): string[] {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) return [];
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = parseDateOnlyUtc(`${year}-01-04`);
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    return formatDateIso(date);
  });
}

export function datesBetweenLocal(startDate: string, endDate: string): string[] {
  const start = parseDateOnlyUtc(startDate);
  const end = parseDateOnlyUtc(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(formatDateIso(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function parseDateOnlyUtc(dateIso: string): Date {
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const aStartMinutes = timeToMinutes(aStart);
  const aEndMinutes = timeToMinutes(aEnd);
  const bStartMinutes = timeToMinutes(bStart);
  const bEndMinutes = timeToMinutes(bEnd);
  if (![aStartMinutes, aEndMinutes, bStartMinutes, bEndMinutes].every(Number.isFinite)) return false;
  return aStartMinutes < bEndMinutes && bStartMinutes < aEndMinutes;
}

export function isOrderedTimeRange(startTime: string, endTime: string): boolean {
  if (!startTime || !endTime) return false;
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  return Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && startMinutes < endMinutes;
}

export function isOrderedDateRange(startDate: string, endDate: string): boolean {
  return Boolean(startDate && endDate && startDate <= endDate);
}

export function isCompletedLessonStatus(status: string): boolean {
  return status === "completed" || status === "makeup_completed";
}

export function isPendingLessonStatus(status: string): boolean {
  return status === "draft" || status === "scheduled" || status === "makeup_pending";
}

export function attendanceStatusForLessonStatus(status: Lesson["status"]): AttendanceStatus {
  if (status === "cancelled") return "cancelled";
  if (status === "makeup_pending") return "makeup_pending";
  if (status === "makeup_completed") return "makeup_completed";
  return "attended";
}

export function lessonStatusForAttendanceStatus(status: AttendanceStatus): Lesson["status"] {
  if (status === "cancelled") return "cancelled";
  if (status === "makeup_completed") return "makeup_completed";
  if (isMakeupAttendanceStatus(status)) return "makeup_pending";
  return "completed";
}

export function aiChatEndpoint(baseUrl: string, provider?: AiProviderConfig): string {
  const normalized = baseUrl
    .trim()
    .replace(/\s+/g, "")
    .replace(/\/+$/, "")
    .replace(/\/v1\/chat\/completions$/i, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/v1\/responses$/i, "")
    .replace(/\/responses$/i, "")
    .replace(/\/v1\/messages$/i, "")
    .replace(/\/messages$/i, "");
  if (!normalized) return "";
  const path = provider?.provider === "openai_response"
    ? "responses"
    : provider?.provider === "anthropic"
      ? "messages"
      : "chat/completions";
  return /\/v1$/i.test(normalized) ? `${normalized}/${path}` : `${normalized}/v1/${path}`;
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function textValue(value: unknown, fallback = "未填写"): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

export function formatAiValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "未填写";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "无";
    return value.map((item) => formatAiValue(item)).join("、");
  }
  if (isPlainRecord(value)) {
    return Object.entries(value)
      .map(([key, item]) => `${aiFieldLabel(key)}：${formatAiValue(item)}`)
      .join("\n");
  }
  return String(value);
}

export function aiActionLabel(type: string): string {
  const labels: Record<string, string> = {
    create_student: "新增学生",
    update_student: "修改学生档案",
    modify_student: "修改学生档案",
    rename_student: "修改学生姓名",
    create_course: "添加课程档案",
    create_course_type: "新增班型",
    create_custom_course_type: "新增班型",
    update_course: "修改课程",
    modify_course: "修改课程",
    delete_course: "删除/暂停课程",
    pause_course: "暂停课程",
    migrate_course: "迁移课程",
    move_course_lessons: "迁移课节",
    delete_lesson: "删除课节",
    remove_lesson: "删除课节",
    cancel_lesson: "删除课节",
    schedule_lessons: "新增排课",
    sync_lessons: "同步排课",
    ask_clarification: "需要补充信息"
  };
  return labels[type] ?? type;
}

export function aiFieldLabel(key: string): string {
  const labels: Record<string, string> = {
    studentId: "学生ID",
    studentName: "学生姓名",
    currentName: "当前姓名",
    oldName: "原姓名",
    sourceStudentName: "原学生姓名",
    sourceName: "原姓名",
    newStudentName: "新学生姓名",
    targetName: "新姓名",
    studentNames: "学生",
    name: "名称",
    newName: "新名称",
    courseName: "课程档案名称",
    courseId: "课程",
    sourceCourseId: "原课程",
    sourceCourseName: "原课程",
    targetCourseId: "目标课程",
    targetCourseName: "目标课程",
    newCourseName: "新课程档案名称",
    type: "班型",
    targetType: "目标班型",
    subject: "科目",
    campus: "校区",
    defaultCampusId: "默认校区",
    grade: "年级",
    school: "学校",
    status: "状态",
    temporaryTrial: "试听标记",
    mode: "处理方式",
    deleteMode: "删除方式",
    forceDelete: "强制删除",
    lessonUpdateScope: "课节同步范围",
    applyToLessons: "课节同步范围",
    updateLessons: "课节同步范围",
    migrateLessons: "迁移课节",
    moveLessons: "迁移课节",
    effectiveFrom: "生效开始日期",
    effectiveTo: "生效结束日期",
    pauseSource: "暂停原课程",
    date: "日期",
    dates: "日期",
    dateStart: "开始日期",
    dateEnd: "结束日期",
    startDate: "开始日期",
    endDate: "结束日期",
    fromDate: "开始日期",
    toDate: "结束日期",
    weekday: "星期",
    weekdays: "星期",
    startTime: "开始时间",
    endTime: "结束时间",
    sourceDate: "来源日期",
    targetDate: "目标日期",
    sourceDateStart: "来源开始日期",
    sourceDateEnd: "来源结束日期",
    targetDateStart: "目标开始日期",
    targetDateEnd: "目标结束日期",
    sourceDates: "来源日期",
    targetDates: "目标日期",
    overwriteExisting: "覆盖已有课节",
    includeCancelled: "包含已取消课节",
    lessonId: "课节",
    lessonIds: "课节",
    scheduledOnly: "仅删除待上课",
    includeCompleted: "包含已完成课",
    deleteCompleted: "删除已完成课",
    note: "备注",
    reason: "原因",
    confidence: "置信度"
  };
  return labels[key] ?? key;
}

export function isStudentStatsDateRangeValid(startDate: string, endDate: string): boolean {
  return !startDate || !endDate || startDate <= endDate;
}

export function isStudentStatsTimeRangeValid(startTime: string, endTime: string): boolean {
  if (!startTime && !endTime) return true;
  if (startTime && !Number.isFinite(timeToMinutes(startTime))) return false;
  if (endTime && !Number.isFinite(timeToMinutes(endTime))) return false;
  return !startTime || !endTime || timeToMinutes(startTime) <= timeToMinutes(endTime);
}

export function timeToMinutes(value: string): number {
  return parseTimeToMinutes(value);
}

export function lessonSearchText(vault: TeacherVault, lesson: Lesson): string {
  const course = getCourse(vault, lesson.courseGroupId);
  const studentFields = lessonStudentIds(lesson).flatMap((studentId) => {
    const student = findStudent(vault, studentId);
    return [
      student?.name ?? "",
      student?.grade ?? "",
      campusName(vault, student?.defaultCampusId),
      student?.note ?? ""
    ];
  });
  return [
    course?.name ?? "",
    course?.subject ?? "",
    courseTypeLabel(vault, lesson.type),
    campusName(vault, lesson.campusId ?? course?.defaultCampusId),
    lessonStatusLabels[lesson.status],
    studentNames(vault, lesson.expectedStudentIds),
    lesson.note ?? "",
    ...studentFields
  ].join(" ").toLowerCase();
}

export function deletedLessonSearchText(vault: TeacherVault, item: DeletedLesson): string {
  const lesson = item.lesson;
  return [
    deletedLessonSourceLabel(item.source),
    item.reason ?? "",
    formatAppDateTime(item.deletedAt),
    lessonSearchText(vault, lesson),
    lesson.content.taught,
    lesson.content.homework,
    lesson.content.performance ?? "",
    lesson.content.nextLessonReminder,
    lesson.content.internalNote ?? ""
  ].join(" ").toLowerCase();
}

export function canRestoreDeletedLesson(vault: TeacherVault, activeLessonIds: Set<string>, item: DeletedLesson): boolean {
  return !activeLessonIds.has(item.lesson.id) && Boolean(getCourse(vault, item.lesson.courseGroupId));
}

export function deletedLessonSourceLabel(source: DeletedLesson["source"]): string {
  if (source === "ai") return "AI 删除";
  if (source === "sync_overwrite") return "同步覆盖";
  return "手动删除";
}

export function deletedLessonSourceVariant(source: DeletedLesson["source"]): "amber" | "sky" | "secondary" {
  if (source === "ai") return "amber";
  if (source === "sync_overwrite") return "sky";
  return "secondary";
}

export function filterScheduleCourseOptions(vault: TeacherVault, courses: CourseGroup[], query: string, currentCourseId: string): CourseGroup[] {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? courses.filter((course) => {
        const courseStudents = course.studentIds
          .map((studentId) => findStudent(vault, studentId))
          .filter((student): student is NonNullable<typeof student> => Boolean(student));
        const searchable = [
          course.name,
          course.subject,
          courseTypeLabel(vault, course.type),
          campusName(vault, course.defaultCampusId),
          studentNames(vault, course.studentIds),
          ...courseStudents.flatMap((student) => [
            student?.name ?? "",
            student?.grade ?? "",
            campusName(vault, student?.defaultCampusId),
            student?.note ?? ""
          ])
        ].join(" ").toLowerCase();
        return normalizedQuery.split(/\s+/).filter(Boolean).every((term) => searchable.includes(term));
      })
    : courses;
  const currentCourse = courses.find((course) => course.id === currentCourseId);
  if (currentCourse && !filtered.some((course) => course.id === currentCourse.id)) {
    return [currentCourse, ...filtered];
  }
  return filtered;
}

export function buildStudentStatsRows(vault: TeacherVault, lessons: Lesson[], normalizedNameFilter: string) {
  const rows = new Map<string, {
    studentId: string;
    studentName: string;
    total: number;
    completed: number;
    pending: number;
    cancelled: number;
    hours: number;
    amount: number;
    courseNames: string[];
    details: Array<{
      lessonId: string;
      courseName: string;
      subject: string;
      courseTypeLabel: string;
      campusName: string;
      date: string;
      startTime: string;
      endTime: string;
      status: Lesson["status"];
      hours: number;
      amount: number;
    }>;
  }>();

  lessons.forEach((lesson) => {
    const hours = lessonBillableHours(lesson);
    const amount = lesson.feeSnapshot.amount;
    lessonStudentIds(lesson).forEach((studentId) => {
      const student = findStudent(vault, studentId);
      const studentName = student?.name ?? "未知学生";
      if (normalizedNameFilter && !studentName.toLowerCase().includes(normalizedNameFilter)) return;
      const current = rows.get(studentId) ?? {
        studentId,
        studentName,
        total: 0,
        completed: 0,
        pending: 0,
        cancelled: 0,
        hours: 0,
        amount: 0,
        courseNames: [],
        details: []
      };

      current.total += 1;
      current.hours += hours;
      current.amount += amount;
      if (isCompletedLessonStatus(lesson.status)) {
        current.completed += 1;
      } else if (isPendingLessonStatus(lesson.status)) {
        current.pending += 1;
      } else if (lesson.status === "cancelled") {
        current.cancelled += 1;
      }

      const name = courseName(vault, lesson.courseGroupId);
      const typeLabel = courseTypeLabel(vault, lesson.type);
      const typedName = `${name}（${typeLabel}）`;
      if (!current.courseNames.includes(typedName)) {
        current.courseNames.push(typedName);
      }
      current.details.push({
        lessonId: lesson.id,
        courseName: name,
        subject: courseSubject(vault, lesson.courseGroupId),
        courseTypeLabel: typeLabel,
        campusName: campusName(vault, lesson.campusId),
        date: lesson.date,
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        status: lesson.status,
        hours,
        amount
      });
      rows.set(studentId, current);
    });
  });

  return [...rows.values()]
    .map((row) => ({ ...row, courseNames: [...row.courseNames].sort(compareByName) }))
    .sort((a, b) => compareByName(a.studentName, b.studentName) || a.studentId.localeCompare(b.studentId));
}

export function buildStudentStatsGroupedLessonRows(vault: TeacherVault, lessons: Lesson[], normalizedNameFilter: string) {
  const oneToOneLessons = lessons.filter((lesson) => isOneOnOneStatsLesson(vault, lesson));
  const groupedLessons = lessons.filter((lesson) => !isOneOnOneStatsLesson(vault, lesson));
  const oneToOneRows = buildStudentStatsRows(
    vault,
    oneToOneLessons,
    normalizedNameFilter
  ).map((row) => ({ kind: "student" as const, groupId: `student-${row.studentId}`, ...row }));

  const groupedRows = groupedLessons
    .map((lesson) => {
      const filteredStudentIds = filteredStudentIdsForStats(vault, lesson, normalizedNameFilter);
      if (filteredStudentIds.length === 0) return null;
      const hours = lessonBillableHours(lesson);
      return {
        kind: "grouped" as const,
        groupId: `lesson-${lesson.id}`,
        lessonId: lesson.id,
        courseName: courseName(vault, lesson.courseGroupId),
        subject: courseSubject(vault, lesson.courseGroupId),
        courseTypeLabel: courseTypeLabel(vault, lesson.type),
        campusName: campusName(vault, lesson.campusId),
        date: lesson.date,
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        status: lesson.status,
        studentCount: filteredStudentIds.length,
        hours,
        amount: lesson.feeSnapshot.amount,
        students: filteredStudentIds
          .map((studentId) => {
            const attendance = lesson.attendance.find((entry) => entry.studentId === studentId);
            return {
              studentId,
              studentName: findStudent(vault, studentId)?.name ?? "未知学生",
              attendanceStatus: attendance?.status ?? attendanceStatusForLessonStatus(lesson.status),
              note: attendance?.note ?? ""
            };
          })
          .sort((a, b) => compareByName(a.studentName, b.studentName) || a.studentId.localeCompare(b.studentId))
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  return [...groupedRows, ...oneToOneRows].sort((a, b) => {
    const aDateTime = a.kind === "grouped" ? `${a.date} ${a.startTime}` : a.details[0] ? `${a.details[0].date} ${a.details[0].startTime}` : "";
    const bDateTime = b.kind === "grouped" ? `${b.date} ${b.startTime}` : b.details[0] ? `${b.details[0].date} ${b.details[0].startTime}` : "";
    if (aDateTime !== bDateTime) return bDateTime.localeCompare(aDateTime);
    const aLabel = a.kind === "grouped" ? a.courseName : a.studentName;
    const bLabel = b.kind === "grouped" ? b.courseName : b.studentName;
    return compareByName(aLabel, bLabel) || a.groupId.localeCompare(b.groupId);
  });
}

function isOneOnOneStatsLesson(vault: TeacherVault, lesson: Lesson): boolean {
  const course = getCourse(vault, lesson.courseGroupId);
  if (lesson.type === "one_on_one" || course?.type === "one_on_one") return true;
  return false;
}

export function filteredStudentIdsForStats(vault: TeacherVault, lesson: Lesson, normalizedNameFilter: string): string[] {
  return lessonStudentIds(lesson).filter((studentId) => {
    const studentName = findStudent(vault, studentId)?.name ?? "未知学生";
    return !normalizedNameFilter || studentName.toLowerCase().includes(normalizedNameFilter);
  });
}

export type CalendarLessonFilters = {
  campusFilter: string;
  gradeFilter: string;
  subjectFilter: string;
  studentFilter: string;
};

export function matchesCalendarLessonFilters(vault: TeacherVault, lesson: Lesson, filters: CalendarLessonFilters): boolean {
  const course = getCourse(vault, lesson.courseGroupId);
  const campusId = lesson.campusId ?? course?.defaultCampusId;
  const studentIds = lessonStudentIds(lesson);
  const searchable = [
    courseName(vault, lesson.courseGroupId),
    courseSubject(vault, lesson.courseGroupId),
    campusName(vault, campusId),
    studentNames(vault, studentIds),
    lesson.note ?? "",
    ...studentIds.map((studentId) => {
      const student = findStudent(vault, studentId);
      return [student?.name ?? "", student?.grade ?? "", student?.note ?? ""].join(" ");
    })
  ].join(" ").toLowerCase();
  const matchesCampus = filters.campusFilter === "all" || campusId === filters.campusFilter;
  const matchesGrade =
    filters.gradeFilter === "all" ||
    studentIds.some((studentId) => findStudent(vault, studentId)?.grade?.trim() === filters.gradeFilter);
  const matchesSubject = filters.subjectFilter === "all" || course?.subject === filters.subjectFilter;
  const searchTerms = filters.studentFilter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matchesStudent = searchTerms.length === 0 || searchTerms.every((term) => searchable.includes(term));
  return matchesCampus && matchesGrade && matchesSubject && matchesStudent;
}

export function calendarLessonsForDateWithFilters(vault: TeacherVault, date: string, filters: CalendarLessonFilters): Lesson[] {
  return vault.lessons
    .filter((lesson) => lesson.date === date && matchesCalendarLessonFilters(vault, lesson, filters))
    .sort(sortLessons);
}

export type ScheduleRecordLessonFilters = {
  campusFilter: string;
  courseTypeFilter: CourseTypeFilter;
  effectiveDay: string;
  lessonMonth: string;
  lessonRangeEnd: string;
  lessonRangeStart: string;
  lessonWeek: string;
  normalizedStudentFilter: string;
  scope: LessonScope;
  showOnlyMakeup: boolean;
};

export function filterScheduleRecordLessons(vault: TeacherVault, filters: ScheduleRecordLessonFilters): Lesson[] {
  const scopeDates = filters.scope === "week" ? datesForIsoWeekValue(filters.lessonWeek) : [];
  const searchTerms = filters.normalizedStudentFilter.split(/\s+/).filter(Boolean);
  return vault.lessons
    .filter((lesson) => {
      const course = getCourse(vault, lesson.courseGroupId);
      const campusId = lesson.campusId ?? course?.defaultCampusId;
      const searchText = lessonSearchText(vault, lesson);
      const matchesScope =
        filters.scope === "month"
          ? lesson.date.startsWith(filters.lessonMonth)
          : filters.scope === "day"
            ? lesson.date === filters.effectiveDay
            : filters.scope === "range"
              ? isOrderedDateRange(filters.lessonRangeStart, filters.lessonRangeEnd) && lesson.date >= filters.lessonRangeStart && lesson.date <= filters.lessonRangeEnd
              : scopeDates.includes(lesson.date);
      const matchesCampus = filters.campusFilter === "all" || campusId === filters.campusFilter;
      const matchesType = filters.courseTypeFilter === "all" || lesson.type === filters.courseTypeFilter;
      const matchesStudent = searchTerms.length === 0 || searchTerms.every((term) => searchText.includes(term));
      const matchesMakeup =
        !filters.showOnlyMakeup ||
        makeupNeededStudentIds(lesson).length > 0 ||
        (lesson.status === "makeup_pending" && lesson.attendance.length === 0) ||
        Boolean(lesson.linkedOriginalLessonId);
      return matchesScope && matchesCampus && matchesType && matchesStudent && matchesMakeup;
    })
    .sort(sortLessons)
    .reverse();
}

export type StudentStatsLessonFilters = {
  campusFilter: string;
  courseFilter: string;
  courseTypeFilter: CourseTypeFilter;
  dateEnd: string;
  dateStart: string;
  endTime: string;
  normalizedNameFilter: string;
  startTime: string;
  statusFilter: "all" | Lesson["status"];
  subjectFilter: string;
};

export function filterStudentStatsLessons(vault: TeacherVault, filters: StudentStatsLessonFilters): Lesson[] {
  return vault.lessons
    .filter((lesson) => {
      const course = getCourse(vault, lesson.courseGroupId);
      const campusId = lesson.campusId ?? course?.defaultCampusId;
      const studentIds = lessonStudentIds(lesson);
      const matchesStudent =
        !filters.normalizedNameFilter ||
        studentIds.some((studentId) =>
          (findStudent(vault, studentId)?.name ?? "").toLowerCase().includes(filters.normalizedNameFilter)
        );
      const matchesCourse = filters.courseFilter === "all" || lesson.courseGroupId === filters.courseFilter;
      const matchesType = filters.courseTypeFilter === "all" || lesson.type === filters.courseTypeFilter;
      const matchesSubject = filters.subjectFilter === "all" || course?.subject === filters.subjectFilter;
      const matchesCampus = filters.campusFilter === "all" || campusId === filters.campusFilter;
      const matchesStatus = filters.statusFilter === "all" || lesson.status === filters.statusFilter;
      const matchesDate =
        (!filters.dateStart || lesson.date >= filters.dateStart) &&
        (!filters.dateEnd || lesson.date <= filters.dateEnd) &&
        (!filters.dateStart || !filters.dateEnd || filters.dateStart <= filters.dateEnd);
      const matchesTime =
        (!filters.startTime || timeToMinutes(lesson.startTime) >= timeToMinutes(filters.startTime)) &&
        (!filters.endTime || timeToMinutes(lesson.endTime) <= timeToMinutes(filters.endTime)) &&
        (!filters.startTime || !filters.endTime || timeToMinutes(filters.startTime) <= timeToMinutes(filters.endTime));
      return matchesStudent && matchesCourse && matchesType && matchesSubject && matchesCampus && matchesStatus && matchesDate && matchesTime;
    })
    .sort(sortLessons);
}

export type TrashLessonFilters = {
  campusFilter: string;
  dateEnd: string;
  dateStart: string;
  normalizedSearch: string;
  sourceFilter: "all" | DeletedLesson["source"];
};

export function sortDeletedLessons(items: DeletedLesson[]): DeletedLesson[] {
  return [...items].sort((a, b) =>
    `${b.deletedAt} ${b.lesson.date} ${b.lesson.startTime}`.localeCompare(`${a.deletedAt} ${a.lesson.date} ${a.lesson.startTime}`)
  );
}

export function filterTrashLessons(vault: TeacherVault, deletedLessons: DeletedLesson[], filters: TrashLessonFilters): DeletedLesson[] {
  const searchTerms = filters.normalizedSearch.split(/\s+/).filter(Boolean);
  return deletedLessons.filter((item) => {
    const lesson = item.lesson;
    const course = getCourse(vault, lesson.courseGroupId);
    const campusId = lesson.campusId ?? course?.defaultCampusId;
    const matchesDate =
      (!filters.dateStart || lesson.date >= filters.dateStart) &&
      (!filters.dateEnd || lesson.date <= filters.dateEnd) &&
      (!filters.dateStart || !filters.dateEnd || filters.dateStart <= filters.dateEnd);
    const matchesCampus = filters.campusFilter === "all" || campusId === filters.campusFilter;
    const matchesSource = filters.sourceFilter === "all" || item.source === filters.sourceFilter;
    const searchText = deletedLessonSearchText(vault, item);
    const matchesSearch = searchTerms.length === 0 || searchTerms.every((term) => searchText.includes(term));
    return matchesDate && matchesCampus && matchesSource && matchesSearch;
  });
}

type ScheduleAiAnalyticsLesson = {
  id: string;
  date: string;
  weekday: string;
  startTime: string;
  endTime: string;
  courseId: string;
  courseName: string;
  subject: string;
  courseType: string;
  campus: string;
  status: Lesson["status"];
  statusLabel: string;
  students: string;
  hours: number;
  feeAmount: number | null;
  feeKnown: boolean;
};

export function buildScheduleAiContext(
  vault: TeacherVault,
  options: {
    calendarMonth: string;
    selectedCalendarDate: string;
    weekStartPreference: WeekStart;
  }
) {
  const today = todayIso();
  const currentMonth = today.slice(0, 7);
  const analyticsStart = addDays(today, -90);
  const analyticsEnd = addDays(today, 120);
  const activeStudents = vault.students
    .filter((student) => student.status === "active")
    .map((student) => ({
      id: student.id,
      name: student.name,
      grade: student.grade ?? "",
      school: student.school ?? "",
      campus: campusName(vault, student.defaultCampusId),
      note: student.note ?? "",
      status: student.status,
      temporaryTrial: student.temporaryTrial ?? false
    }));
  const activeCourses = vault.courseGroups
    .filter((course) => course.status === "active")
    .map((course) => ({
      id: course.id,
      name: course.name,
      subject: course.subject,
      type: courseTypeLabel(vault, course.type),
      campus: campusName(vault, course.defaultCampusId),
      students: studentNames(vault, course.studentIds)
    }));
  const nearbyLessons = vault.lessons
    .filter((lesson) => lesson.date >= addDays(today, -14) && lesson.date <= addDays(today, 45))
    .sort(sortLessons)
    .map((lesson) => ({
      id: lesson.id,
      date: lesson.date,
      startTime: lesson.startTime,
      endTime: lesson.endTime,
      courseId: lesson.courseGroupId,
      courseName: courseName(vault, lesson.courseGroupId),
      subject: courseSubject(vault, lesson.courseGroupId),
      campus: campusName(vault, lesson.campusId),
      status: lessonStatusLabels[lesson.status],
      students: attendedStudentNamesForLesson(vault, lesson) || studentNames(vault, lessonStudentIds(lesson))
    }));
  const analyticsLessons: ScheduleAiAnalyticsLesson[] = vault.lessons
    .filter((lesson) => lesson.date >= analyticsStart && lesson.date <= analyticsEnd)
    .sort(sortLessons)
    .map((lesson) => {
      const course = getCourse(vault, lesson.courseGroupId);
      const amount = lesson.feeSnapshot.amount;
      const hasKnownFee = Number.isFinite(amount);
      return {
        id: lesson.id,
        date: lesson.date,
        weekday: weekdayLabels[weekdayOfDateIso(lesson.date)],
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        courseId: lesson.courseGroupId,
        courseName: courseName(vault, lesson.courseGroupId),
        subject: courseSubject(vault, lesson.courseGroupId),
        courseType: courseTypeLabel(vault, lesson.type),
        campus: campusName(vault, lesson.campusId ?? course?.defaultCampusId),
        status: lesson.status,
        statusLabel: lessonStatusLabels[lesson.status],
        students: studentNames(vault, lessonStudentIds(lesson)),
        hours: lessonBillableHours(lesson),
        feeAmount: hasKnownFee ? amount : null,
        feeKnown: hasKnownFee
      };
    });
  const summariseLessons = (lessons: ScheduleAiAnalyticsLesson[]) => ({
    count: lessons.length,
    totalHours: Number(lessons.reduce((sum, lesson) => sum + lesson.hours, 0).toFixed(2)),
    knownFeeCount: lessons.filter((lesson) => lesson.feeKnown).length,
    totalKnownFee: lessons.reduce((sum, lesson) => sum + (lesson.feeAmount ?? 0), 0),
    hasUnknownFee: lessons.some((lesson) => !lesson.feeKnown),
    byDate: Object.values(lessons.reduce<Record<string, { date: string; count: number; totalHours: number; totalKnownFee: number }>>((map, lesson) => {
      const item = map[lesson.date] ?? { date: lesson.date, count: 0, totalHours: 0, totalKnownFee: 0 };
      item.count += 1;
      item.totalHours = Number((item.totalHours + lesson.hours).toFixed(2));
      item.totalKnownFee += lesson.feeAmount ?? 0;
      map[lesson.date] = item;
      return map;
    }, {}))
  });
  const currentWeekStart = addDays(today, -((weekdayOfDateIso(today) - options.weekStartPreference + 7) % 7));
  const currentWeekEnd = addDays(currentWeekStart, 6);
  const currentWeekLessons = analyticsLessons.filter((lesson) => lesson.date >= currentWeekStart && lesson.date <= currentWeekEnd);
  const currentMonthLessons = analyticsLessons.filter((lesson) => lesson.date.startsWith(currentMonth));
  const morningEightToTenLessons = analyticsLessons.filter((lesson) => lesson.startTime < "10:00" && lesson.endTime > "08:00");

  return {
    today,
    selectedCalendarDate: options.selectedCalendarDate,
    selectedCalendarMonth: options.calendarMonth,
    campuses: vault.campuses.map((campus) => ({ id: campus.id, name: campus.name })),
    subjects: subjectOptionsForVault(vault),
    activeStudents,
    activeCourses,
    nearbyLessons,
    analyticsRange: { start: analyticsStart, end: analyticsEnd },
    analyticsLessons,
    lessonAnalytics: {
      currentWeek: { start: currentWeekStart, end: currentWeekEnd, ...summariseLessons(currentWeekLessons) },
      currentMonth: { month: currentMonth, ...summariseLessons(currentMonthLessons) }
    },
    timeWindowSummaries: {
      morningEightToTen: {
        startTime: "08:00",
        endTime: "10:00",
        ...summariseLessons(morningEightToTenLessons)
      }
    }
  };
}

export function attendanceSurfaceClass(status: AttendanceStatus, isTemporary: boolean): string {
  if (status === "leave_requested" || status === "makeup_pending") {
    return "border-[#facc15] bg-[#fef9c3]";
  }
  if (status === "absent" || status === "cancelled") {
    return "border-[#fecaca] bg-[#fff1f2]";
  }
  if (isTemporary) {
    return "border-[#c7d2fe] bg-[#eef0ff]";
  }
  return "border-[#dbe4ef] bg-[#f8fbff]";
}
