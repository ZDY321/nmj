import * as XLSX from "xlsx";
import type { CourseGroup, CourseType, Lesson, TeacherVault } from "@/shared/types";

export type ImportedScheduleLesson = {
  id: string;
  fileName: string;
  campusName: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  subjectHint: string;
  courseTypeHint: CourseType | "unknown";
  studentNameHint?: string;
  teacher?: string;
  assistant?: string;
  room?: string;
  presentCount?: number;
  expectedCount?: number;
  rawText: string;
  warnings: string[];
};

export type ImportMatchStatus =
  | "matched"
  | "attendance_mismatch"
  | "time_mismatch"
  | "course_mismatch"
  | "system_missing"
  | "import_missing"
  | "needs_mapping";

export type ImportPreviewLesson = ImportedScheduleLesson & {
  campusId?: string;
  matchedCourseId?: string;
  mappedCourseId?: string;
  status: ImportMatchStatus;
  systemLessonId?: string;
  systemLessonLabel?: string;
  issues: string[];
};

export type ScheduleImportMapping = Record<string, string>;

export type ScheduleImportSummary = {
  total: number;
  matched: number;
  attendanceMismatch: number;
  timeMismatch: number;
  courseMismatch: number;
  systemMissing: number;
  importMissing: number;
  needsMapping: number;
  byCampus: ImportSummaryGroup[];
  byDate: ImportSummaryGroup[];
  bySubject: ImportSummaryGroup[];
  byCourseType: ImportSummaryGroup[];
};

export type ImportSummaryGroup = { key: string; count: number; selected: number };

const subjectHints = ["语文", "数学", "英语", "物理", "化学", "生物", "科学", "历史", "地理", "政治"];

export function parseCampusFromFileName(fileName: string): string | undefined {
  return fileName.match(/[（(]([^）)]+)[）)]/)?.[1]?.trim();
}

export function parseExportYearFromFileName(fileName: string): number | undefined {
  const year = fileName.match(/(20\d{2})-\d{2}-\d{2}/)?.[1];
  return year ? Number(year) : undefined;
}

export function normalizeScheduleCellText(value: unknown): string {
  return String(value ?? "")
    .replace(/\r/g, "\n")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
}

export function importMappingKey(lesson: Pick<ImportedScheduleLesson, "campusName" | "title" | "studentNameHint" | "subjectHint" | "courseTypeHint">): string {
  return [
    normalizeText(lesson.campusName),
    normalizeText(lesson.title),
    normalizeText(lesson.studentNameHint ?? ""),
    normalizeText(lesson.subjectHint),
    lesson.courseTypeHint
  ].join("|");
}

export function parseScheduleCell(
  cellText: unknown,
  context: { fileName: string; campusName: string; year: number }
): ImportedScheduleLesson[] {
  const text = normalizeScheduleCellText(cellText);
  const dateMatch = text.match(/^(\d{1,2})月(\d{1,2})日\s*([\s\S]*)$/);
  if (!dateMatch) return [];

  const month = dateMatch[1].padStart(2, "0");
  const day = dateMatch[2].padStart(2, "0");
  const date = `${context.year}-${month}-${day}`;
  const rest = dateMatch[3];
  const lessonPattern = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s+([\s\S]*?)(?=(?:\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s+)|$)/g;
  const lessons: ImportedScheduleLesson[] = [];

  for (const match of rest.matchAll(lessonPattern)) {
    const startTime = normalizeTime(match[1]) ?? match[1];
    const endTime = normalizeTime(match[2]) ?? match[2];
    const body = normalizeScheduleCellText(match[3]);
    const title = body.split(/\s+教师：/)[0]?.trim() ?? "";
    const countMatch = body.match(/实到\/应到：\s*(\d+)\s*\/\s*(\d+)/);
    const expectedCount = countMatch ? Number(countMatch[2]) : undefined;
    const presentCount = countMatch ? Number(countMatch[1]) : undefined;
    const subjectHint = inferSubjectHint(title);
    const courseTypeHint = inferCourseTypeHint(title, expectedCount);
    const warnings: string[] = [];
    if (!countMatch) warnings.push("缺少实到/应到");
    if (presentCount !== undefined && expectedCount !== undefined && presentCount < expectedCount) warnings.push("未全员到课");
    if (!title) warnings.push("缺少课程标题");

    lessons.push({
      id: `${context.fileName}-${date}-${startTime}-${endTime}-${lessons.length}`,
      fileName: context.fileName,
      campusName: context.campusName,
      date,
      startTime,
      endTime,
      title,
      subjectHint,
      courseTypeHint,
      studentNameHint: inferStudentNameHint(title, courseTypeHint),
      teacher: extractNamedField(body, "教师"),
      assistant: extractNamedField(body, "助教"),
      room: extractNamedField(body, "教室"),
      presentCount,
      expectedCount,
      rawText: body,
      warnings
    });
  }

  return lessons;
}

export async function parseScheduleWorkbookFile(file: File): Promise<ImportedScheduleLesson[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const campusName = parseCampusFromFileName(file.name) ?? "";
  const year = parseExportYearFromFileName(file.name) ?? new Date().getFullYear();
  const lessons: ImportedScheduleLesson[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
    for (const row of rows) {
      for (const cell of row) {
        lessons.push(...parseScheduleCell(cell, { fileName: file.name, campusName, year }));
      }
    }
  }

  return lessons;
}

export async function parseScheduleWorkbookFiles(files: FileList | File[]): Promise<ImportedScheduleLesson[]> {
  const fileArray = Array.from(files);
  const batches = await Promise.all(fileArray.map(parseScheduleWorkbookFile));
  return batches.flat().sort((a, b) => `${a.date} ${a.startTime} ${a.campusName}`.localeCompare(`${b.date} ${b.startTime} ${b.campusName}`));
}

export function buildImportPreview(
  vault: TeacherVault,
  lessons: ImportedScheduleLesson[],
  mapping: ScheduleImportMapping,
  campusOverrides: ScheduleImportMapping = {}
): ImportPreviewLesson[] {
  return lessons.map((lesson) => {
    const campus = campusOverrides[lesson.fileName]
      ? vault.campuses.find((item) => item.id === campusOverrides[lesson.fileName])
      : matchCampus(vault, lesson.campusName);
    const normalizedLesson = campus ? { ...lesson, campusName: campus.name } : lesson;
    const mappedCourseId = mapping[importMappingKey(normalizedLesson)] ?? mapping[importMappingKey(lesson)];
    const mappedCourse = mappedCourseId ? vault.courseGroups.find((course) => course.id === mappedCourseId) : undefined;
    const matchedCourse = mappedCourse ?? matchCourse(vault, normalizedLesson, campus?.id);
    const exactLesson = matchedCourse
      ? findExactSystemLesson(vault, lesson, matchedCourse.id, campus?.id)
      : undefined;
    const sameCourseDifferentTime = matchedCourse && !exactLesson
      ? findSameCourseDifferentTimeLesson(vault, lesson, matchedCourse.id, campus?.id)
      : undefined;
    const sameTimeDifferentCourse = !exactLesson && !sameCourseDifferentTime
      ? findSameTimeDifferentCourseLesson(vault, lesson, matchedCourse?.id, campus?.id)
      : undefined;
    const systemLesson = exactLesson ?? sameCourseDifferentTime ?? sameTimeDifferentCourse;
    const issues = [
      ...lesson.warnings,
      campus ? "" : "校区未匹配",
      matchedCourse ? "" : "课程未匹配",
      exactLesson ? "" : sameCourseDifferentTime ? `云端同课程时间不一致：${systemLessonLabel(vault, sameCourseDifferentTime)}` : "",
      exactLesson || sameCourseDifferentTime ? "" : sameTimeDifferentCourse ? `云端同时间课程不一致：${systemLessonLabel(vault, sameTimeDifferentCourse)}` : "",
      campus && matchedCourse && !systemLesson ? "云端课表缺少这节教务 Excel 课节" : ""
    ].filter(Boolean);
    const status: ImportMatchStatus = !campus || !matchedCourse
      ? "needs_mapping"
      : exactLesson
        ? lesson.warnings.length > 0 ? "attendance_mismatch" : "matched"
        : sameCourseDifferentTime
          ? "time_mismatch"
          : sameTimeDifferentCourse
            ? "course_mismatch"
            : "system_missing";
    return {
      ...lesson,
      campusName: campus?.name ?? lesson.campusName,
      campusId: campus?.id,
      matchedCourseId: matchedCourse?.id,
      mappedCourseId,
      status,
      systemLessonId: systemLesson?.id,
      systemLessonLabel: systemLesson ? systemLessonLabel(vault, systemLesson) : undefined,
      issues
    };
  });
}

export function summarizeImportPreview(rows: ImportPreviewLesson[]): ScheduleImportSummary {
  return {
    total: rows.length,
    matched: rows.filter((row) => row.status === "matched").length,
    attendanceMismatch: rows.filter((row) => row.status === "attendance_mismatch").length,
    timeMismatch: rows.filter((row) => row.status === "time_mismatch").length,
    courseMismatch: rows.filter((row) => row.status === "course_mismatch").length,
    systemMissing: rows.filter((row) => row.status === "system_missing").length,
    importMissing: rows.filter((row) => row.status === "import_missing").length,
    needsMapping: rows.filter((row) => row.status === "needs_mapping").length,
    byCampus: groupedSummary(rows, (row) => row.campusName || "未识别校区"),
    byDate: groupedSummary(rows, (row) => row.date),
    bySubject: groupedSummary(rows, (row) => row.subjectHint || "未知科目"),
    byCourseType: groupedSummary(rows, (row) => row.courseTypeHint)
  };
}

function groupedSummary(rows: ImportPreviewLesson[], keyFor: (row: ImportPreviewLesson) => string): ImportSummaryGroup[] {
  const map = new Map<string, ImportSummaryGroup>();
  rows.forEach((row) => {
    const key = keyFor(row);
    const item = map.get(key) ?? { key, count: 0, selected: 0 };
    item.count += 1;
    if (row.status === "matched") item.selected += 1;
    map.set(key, item);
  });
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "zh-Hans-CN"));
}

function matchCampus(vault: TeacherVault, campusName: string) {
  const normalized = normalizeText(campusName);
  if (!normalized) return undefined;
  return vault.campuses.find((campus) => normalizeText(campus.id) === normalized || normalizeText(campus.name) === normalized);
}

function matchCourse(vault: TeacherVault, lesson: ImportedScheduleLesson, campusId?: string): CourseGroup | undefined {
  const normalizedTitle = normalizeText(lesson.title);
  const studentName = normalizeText(lesson.studentNameHint ?? "");
  const subject = normalizeText(lesson.subjectHint);
  const candidates = vault.courseGroups.filter((course) => {
    if (course.status !== "active") return false;
    if (campusId && course.defaultCampusId && course.defaultCampusId !== campusId) return false;
    if (lesson.courseTypeHint !== "unknown" && course.type !== lesson.courseTypeHint) return false;
    if (subject && normalizeText(course.subject) !== subject) return false;
    return true;
  });
  if (lesson.courseTypeHint === "one_on_one" && studentName) {
    const byStudent = candidates.find((course) =>
      course.studentIds.some((studentId) => normalizeText(vault.students.find((student) => student.id === studentId)?.name ?? "") === studentName)
    );
    if (byStudent) return byStudent;
  }
  return candidates.find((course) => normalizedTitle.includes(normalizeText(course.name)) || normalizeText(course.name).includes(normalizedTitle));
}

function inferStudentNameHint(title: string, courseType: CourseType | "unknown"): string | undefined {
  if (courseType !== "one_on_one" && courseType !== "trial") return undefined;
  return title.includes("_") ? title.split("_", 1)[0]?.trim() : undefined;
}

function inferSubjectHint(title: string): string {
  return subjectHints.find((subject) => title.includes(subject)) ?? "";
}

function inferCourseTypeHint(title: string, expectedCount?: number): CourseType | "unknown" {
  if (title.includes("试听")) return "trial";
  if (/一对二|1对2|1V2/i.test(title)) return "one_on_two";
  if (/1V1|一对一|1对1/i.test(title)) return "one_on_one";
  if (title.includes("班")) return "class";
  if ((expectedCount ?? 0) > 2) return "class";
  return "unknown";
}

function extractNamedField(text: string, field: string): string | undefined {
  return text.match(new RegExp(`${field}：\\s*(.*?)(?=\\s+教师：|\\s+助教：|\\s+教室：|\\s+实到\\/应到：|$)`))?.[1]?.trim();
}

function normalizeTime(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function timeOverlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}

function systemLessonCampusId(vault: TeacherVault, lesson: Lesson): string | undefined {
  return lesson.campusId ?? vault.courseGroups.find((course) => course.id === lesson.courseGroupId)?.defaultCampusId;
}

function activeSystemLessonsForDate(vault: TeacherVault, date: string, campusId?: string): Lesson[] {
  return vault.lessons.filter((lesson) =>
    lesson.status !== "cancelled" &&
    lesson.date === date &&
    (!campusId || systemLessonCampusId(vault, lesson) === campusId)
  );
}

function findExactSystemLesson(vault: TeacherVault, lesson: ImportedScheduleLesson, courseId: string, campusId?: string): Lesson | undefined {
  return activeSystemLessonsForDate(vault, lesson.date, campusId).find((item) =>
    item.courseGroupId === courseId &&
    item.startTime === lesson.startTime &&
    item.endTime === lesson.endTime
  );
}

function findSameCourseDifferentTimeLesson(vault: TeacherVault, lesson: ImportedScheduleLesson, courseId: string, campusId?: string): Lesson | undefined {
  const candidates = activeSystemLessonsForDate(vault, lesson.date, campusId).filter((item) => item.courseGroupId === courseId);
  return candidates.find((item) => timeOverlaps(item.startTime, item.endTime, lesson.startTime, lesson.endTime)) ?? candidates[0];
}

function findSameTimeDifferentCourseLesson(vault: TeacherVault, lesson: ImportedScheduleLesson, courseId?: string, campusId?: string): Lesson | undefined {
  return activeSystemLessonsForDate(vault, lesson.date, campusId).find((item) =>
    item.courseGroupId !== courseId &&
    item.startTime === lesson.startTime &&
    item.endTime === lesson.endTime
  );
}

function systemLessonLabel(vault: TeacherVault, lesson: Lesson): string {
  const course = vault.courseGroups.find((item) => item.id === lesson.courseGroupId);
  return `${lesson.date} ${lesson.startTime}-${lesson.endTime} ${course?.name ?? "未知课程"}`;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
