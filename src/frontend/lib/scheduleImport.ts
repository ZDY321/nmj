import * as XLSX from "xlsx";
import type { CourseGroup, CourseType, Lesson, TeacherVault } from "@/shared/types";
import { createLessonFromCourse } from "@/frontend/lib/helpers";

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

export type ImportMatchStatus = "ready" | "duplicate" | "conflict" | "needs_mapping" | "abnormal";

export type ImportPreviewLesson = ImportedScheduleLesson & {
  campusId?: string;
  matchedCourseId?: string;
  mappedCourseId?: string;
  selected: boolean;
  status: ImportMatchStatus;
  systemLessonId?: string;
  systemLessonLabel?: string;
  issues: string[];
};

export type ScheduleImportMapping = Record<string, string>;

export type ScheduleImportSummary = {
  total: number;
  selected: number;
  ready: number;
  duplicates: number;
  conflicts: number;
  abnormal: number;
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
  previousSelectedIds = new Set<string>()
): ImportPreviewLesson[] {
  return lessons.map((lesson) => {
    const campus = matchCampus(vault, lesson.campusName);
    const mappedCourseId = mapping[importMappingKey(lesson)];
    const matchedCourse = mappedCourseId
      ? vault.courseGroups.find((course) => course.id === mappedCourseId)
      : matchCourse(vault, lesson, campus?.id);
    const systemLesson = matchedCourse
      ? vault.lessons.find((item) =>
          item.status !== "cancelled" &&
          item.courseGroupId === matchedCourse.id &&
          item.date === lesson.date &&
          item.startTime === lesson.startTime &&
          item.endTime === lesson.endTime
        )
      : undefined;
    const conflict = vault.lessons.find((item) =>
      item.status !== "cancelled" &&
      item.date === lesson.date &&
      timeOverlaps(item.startTime, item.endTime, lesson.startTime, lesson.endTime) &&
      (!matchedCourse || item.courseGroupId !== matchedCourse.id)
    );
    const issues = [
      ...lesson.warnings,
      campus ? "" : "校区未匹配",
      matchedCourse ? "" : "课程未匹配",
      systemLesson ? "系统已有同课程同时间课节" : "",
      conflict ? `与系统课节冲突：${systemLessonLabel(vault, conflict)}` : ""
    ].filter(Boolean);
    const status: ImportMatchStatus = !campus || !matchedCourse
      ? "needs_mapping"
      : systemLesson
        ? "duplicate"
        : conflict
          ? "conflict"
          : lesson.warnings.length > 0
            ? "abnormal"
            : "ready";
    return {
      ...lesson,
      campusId: campus?.id,
      matchedCourseId: matchedCourse?.id,
      mappedCourseId,
      selected: previousSelectedIds.has(lesson.id) || status === "ready",
      status,
      systemLessonId: systemLesson?.id ?? conflict?.id,
      systemLessonLabel: systemLesson ? systemLessonLabel(vault, systemLesson) : conflict ? systemLessonLabel(vault, conflict) : undefined,
      issues
    };
  });
}

export function buildLessonsFromImportPreview(vault: TeacherVault, rows: ImportPreviewLesson[]): Lesson[] {
  const lessons: Lesson[] = [];
  rows
    .filter((row) => row.selected && row.campusId && row.matchedCourseId && row.status !== "duplicate" && row.status !== "conflict")
    .forEach((row) => {
      const course = vault.courseGroups.find((item) => item.id === row.matchedCourseId);
      if (!course) return;
      const lesson = createLessonFromCourse(vault, course, {
        date: row.date,
        startTime: row.startTime,
        endTime: row.endTime,
        campusId: row.campusId,
        status: row.presentCount === 0 ? "makeup_pending" : "scheduled"
      });
      lessons.push({
        ...lesson,
        attendance: normalizeImportedAttendance(lesson, row),
        note: [
          `教务导入：${row.title}`,
          row.teacher ? `教师：${row.teacher}` : "",
          row.room ? `教室：${row.room}` : "",
          row.presentCount !== undefined && row.expectedCount !== undefined ? `实到/应到：${row.presentCount}/${row.expectedCount}` : ""
        ].filter(Boolean).join("；")
      });
    });
  return lessons;
}

export function summarizeImportPreview(rows: ImportPreviewLesson[]): ScheduleImportSummary {
  const selected = rows.filter((row) => row.selected);
  return {
    total: rows.length,
    selected: selected.length,
    ready: rows.filter((row) => row.status === "ready").length,
    duplicates: rows.filter((row) => row.status === "duplicate").length,
    conflicts: rows.filter((row) => row.status === "conflict").length,
    abnormal: rows.filter((row) => row.status === "abnormal").length,
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
    if (row.selected) item.selected += 1;
    map.set(key, item);
  });
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "zh-Hans-CN"));
}

function normalizeImportedAttendance(lesson: Lesson, row: ImportPreviewLesson): Lesson["attendance"] {
  if (row.courseTypeHint !== "one_on_one" || row.presentCount === undefined || row.expectedCount === undefined) {
    return lesson.attendance;
  }
  if (row.presentCount >= row.expectedCount) {
    return lesson.attendance.map((entry) => ({ ...entry, status: "attended" }));
  }
  return lesson.attendance.map((entry) => ({ ...entry, status: "makeup_pending", note: "教务导入：未正常到课，原因待确认" }));
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

function systemLessonLabel(vault: TeacherVault, lesson: Lesson): string {
  const course = vault.courseGroups.find((item) => item.id === lesson.courseGroupId);
  return `${lesson.date} ${lesson.startTime}-${lesson.endTime} ${course?.name ?? "未知课程"}`;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
