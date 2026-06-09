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
  note?: string;
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
  systemLessonStatus?: Lesson["status"];
  systemLessonNote?: string;
  systemPresentCount?: number;
  systemExpectedCount?: number;
  systemPresentStudentNames?: string;
  systemExpectedStudentNames?: string;
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

export type MergedScheduleExportSummary = {
  fileCount: number;
  dayCount: number;
  lessonCount: number;
  actualLessonCount: number;
  absentLessonCount: number;
};

const subjectHints = ["语文", "数学", "英语", "物理", "化学", "生物", "科学", "历史", "地理", "政治"];

export function parseCampusFromFileName(fileName: string): string | undefined {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const groups = Array.from(baseName.matchAll(/[（(]([^）)]+)[）)]/g))
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));
  if (groups.length === 0) return undefined;
  const candidates = groups.filter((value) => !/^\d{4}(?:[-_/年]\d{1,2})?(?:[-_/月]\d{1,2}日?)?$/.test(value) && !/^(副本|copy|备份|课表|课程表)$/i.test(value));
  return candidates.find((value) => /校区|中心|分校|教学点/.test(value)) ?? candidates[0] ?? groups[0];
}

export function parseExportYearFromFileName(fileName: string): number | undefined {
  const year = fileName.match(/(?:^|[^\d])(20\d{2})(?=[^\d]|$)/)?.[1];
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
    const note = extractScheduleNote(body);
    const subjectHint = inferSubjectHint(title);
    const courseTypeHint = inferCourseTypeHint(title, expectedCount);
    const warnings: string[] = [];
    if (!countMatch) warnings.push("缺少实到/应到");
    if (presentCount !== undefined && expectedCount !== undefined && presentCount < expectedCount) warnings.push("未全员到课");
    if (isLikelyCancelledImportedLesson({ presentCount, note, rawText: body })) warnings.push("未开课/取消");
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
      note,
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
    const autoMatchedCourse = matchCourse(vault, normalizedLesson, campus?.id);
    const sameTimeMatchedCourse = !mappedCourse
      ? findSameTimeCourseThatLooksLikeImportedLesson(vault, normalizedLesson, campus?.id, autoMatchedCourse?.id)
      : undefined;
    const matchedCourse = mappedCourse ?? sameTimeMatchedCourse ?? autoMatchedCourse;
    const exactLesson = matchedCourse
      ? findExactSystemLesson(vault, lesson, matchedCourse.id, campus?.id)
      : undefined;
    const sameTimeDifferentCourse = !exactLesson
      ? findSameTimeDifferentCourseLesson(vault, lesson, matchedCourse?.id, campus?.id)
      : undefined;
    const sameCourseDifferentTime = matchedCourse && !exactLesson && !sameTimeDifferentCourse
      ? findSameCourseDifferentTimeLesson(vault, lesson, matchedCourse.id, campus?.id)
      : undefined;
    const systemLesson = exactLesson ?? sameTimeDifferentCourse ?? sameCourseDifferentTime;
    const systemAttendance = systemLesson ? systemLessonAttendanceSnapshot(vault, systemLesson) : undefined;
    const systemCompletionIssue = exactLesson ? importSystemCompletionIssue(lesson, exactLesson) : "";
    const attendanceIssue = systemAttendance && lesson.presentCount !== undefined && lesson.expectedCount !== undefined
      ? importAttendanceIssue(lesson, systemAttendance)
      : "";
    const issues = [
      campus ? "" : "校区未匹配",
      matchedCourse ? "" : "课程未匹配",
      systemCompletionIssue,
      attendanceIssue,
      exactLesson ? "" : sameTimeDifferentCourse ? `同一时间云端课程不一致：${systemLessonLabel(vault, sameTimeDifferentCourse)}，请检查课程映射或云端课表` : "",
      exactLesson || sameTimeDifferentCourse ? "" : sameCourseDifferentTime ? `云端同课程时间不一致：教务 ${lesson.date} ${lesson.startTime}-${lesson.endTime}，云端 ${systemLessonLabel(vault, sameCourseDifferentTime)}` : "",
      campus && matchedCourse && !systemLesson ? "云端课表缺少这节教务 Excel 课节" : ""
    ].filter(Boolean);
    const status: ImportMatchStatus = !campus || !matchedCourse
      ? "needs_mapping"
      : exactLesson
        ? systemCompletionIssue || attendanceIssue ? "attendance_mismatch" : "matched"
        : sameTimeDifferentCourse
          ? "course_mismatch"
          : sameCourseDifferentTime
            ? "time_mismatch"
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
      systemLessonStatus: systemLesson?.status,
      systemLessonNote: systemLesson?.note,
      systemPresentCount: systemAttendance?.presentCount,
      systemExpectedCount: systemAttendance?.expectedCount,
      systemPresentStudentNames: systemAttendance?.presentStudentNames,
      systemExpectedStudentNames: systemAttendance?.expectedStudentNames,
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

export function downloadMergedScheduleWorkbook(lessons: ImportedScheduleLesson[]): MergedScheduleExportSummary {
  if (lessons.length === 0) {
    throw new Error("请先选择要合并的教务 Excel。");
  }

  const sortedLessons = [...lessons].sort(compareImportedLessons);
  const dayGroups = groupImportedLessonsByDate(sortedLessons);
  const summary: MergedScheduleExportSummary = {
    fileCount: new Set(sortedLessons.map((lesson) => lesson.fileName)).size,
    dayCount: dayGroups.length,
    lessonCount: sortedLessons.length,
    actualLessonCount: sortedLessons.filter(isActualImportedLesson).length,
    absentLessonCount: sortedLessons.filter(hasAbsentImportedStudent).length
  };
  const workbook = XLSX.utils.book_new();
  const dailySheet = XLSX.utils.aoa_to_sheet(buildMergedDailyRows(dayGroups, summary));
  dailySheet["!cols"] = [
    { wch: 18 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 90 }
  ];
  dailySheet["!rows"] = [
    { hpt: 24 },
    { hpt: 8 },
    { hpt: 22 }
  ];
  styleMergedSheetHeader(dailySheet, 1, 5);
  styleMergedSheetHeader(dailySheet, 3, 8);
  XLSX.utils.book_append_sheet(workbook, dailySheet, "每日合并");

  const detailSheet = XLSX.utils.aoa_to_sheet(buildMergedDetailRows(sortedLessons));
  detailSheet["!cols"] = [
    { wch: 12 },
    { wch: 8 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
    { wch: 34 },
    { wch: 10 },
    { wch: 12 },
    { wch: 8 },
    { wch: 8 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 24 },
    { wch: 50 }
  ];
  detailSheet["!rows"] = [{ hpt: 22 }];
  styleMergedSheetHeader(detailSheet, 1, 17);
  XLSX.utils.book_append_sheet(workbook, detailSheet, "课程明细");
  XLSX.writeFile(workbook, `教务课表合并_${mergedExportDateRange(sortedLessons)}.xlsx`);
  return summary;
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

function groupImportedLessonsByDate(lessons: ImportedScheduleLesson[]): Array<{ date: string; lessons: ImportedScheduleLesson[] }> {
  const map = new Map<string, ImportedScheduleLesson[]>();
  lessons.forEach((lesson) => {
    const group = map.get(lesson.date) ?? [];
    group.push(lesson);
    map.set(lesson.date, group);
  });
  return Array.from(map.entries())
    .map(([date, groupedLessons]) => ({ date, lessons: groupedLessons.sort(compareImportedLessons) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildMergedDailyRows(
  dayGroups: Array<{ date: string; lessons: ImportedScheduleLesson[] }>,
  summary: MergedScheduleExportSummary
): Array<Array<string | number>> {
  return [
    [
      `来源文件数：${summary.fileCount}`,
      `日期天数：${summary.dayCount}`,
      `总课节：${summary.lessonCount}`,
      `实际开课：${summary.actualLessonCount}`,
      `有学生未到：${summary.absentLessonCount}`
    ],
    [],
    ["日期", "星期", "总课节", "实际开课", "有学生未到", "应到总人次", "实到总人次", "同日课程合并"],
    ...dayGroups.map(({ date, lessons }) => {
      const actualLessons = lessons.filter(isActualImportedLesson).length;
      const absentLessons = lessons.filter(hasAbsentImportedStudent).length;
      const expectedTotal = sumDefinedCounts(lessons, "expectedCount");
      const presentTotal = sumDefinedCounts(lessons, "presentCount");
      return [
        date,
        weekdayLabel(date),
        lessons.length,
        actualLessons,
        absentLessons,
        expectedTotal,
        presentTotal,
        lessons.map(formatMergedDailyLesson).join("\n")
      ];
    })
  ];
}

function buildMergedDetailRows(lessons: ImportedScheduleLesson[]): Array<Array<string | number>> {
  return [
    ["日期", "星期", "开始", "结束", "校区", "课程", "科目", "班型", "实到", "应到", "实际开课", "有学生未到", "教师", "助教", "教室", "来源文件", "原始内容"],
    ...lessons.map((lesson) => [
      lesson.date,
      weekdayLabel(lesson.date),
      lesson.startTime,
      lesson.endTime,
      lesson.campusName || "未识别校区",
      lesson.title,
      lesson.subjectHint || "未知科目",
      importedCourseTypeLabel(lesson.courseTypeHint),
      lesson.presentCount ?? "",
      lesson.expectedCount ?? "",
      isActualImportedLesson(lesson) ? "是" : "否",
      hasAbsentImportedStudent(lesson) ? "是" : "否",
      lesson.teacher ?? "",
      lesson.assistant ?? "",
      lesson.room ?? "",
      lesson.fileName,
      lesson.rawText
    ])
  ];
}

function styleMergedSheetHeader(sheet: XLSX.WorkSheet, rowNumber: number, columnCount: number) {
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const cellAddress = XLSX.utils.encode_cell({ r: rowNumber - 1, c: columnIndex });
    const cell = sheet[cellAddress];
    if (!cell) continue;
    cell.s = {
      ...(cell.s ?? {}),
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      font: { bold: true }
    };
  }
}

function formatMergedDailyLesson(lesson: ImportedScheduleLesson): string {
  return [
    `${lesson.startTime}-${lesson.endTime}`,
    lesson.campusName || "未识别校区",
    lesson.title || "未命名课程",
    `实到/应到 ${formatImportedCount(lesson.presentCount)}/${formatImportedCount(lesson.expectedCount)}`,
    hasAbsentImportedStudent(lesson) ? "有学生未到" : "",
    lesson.teacher ? `教师：${lesson.teacher}` : "",
    lesson.room ? `教室：${lesson.room}` : "",
    lesson.fileName
  ].filter(Boolean).join(" | ");
}

function compareImportedLessons(a: ImportedScheduleLesson, b: ImportedScheduleLesson): number {
  return `${a.date} ${a.startTime} ${a.endTime} ${a.campusName} ${a.title}`.localeCompare(`${b.date} ${b.startTime} ${b.endTime} ${b.campusName} ${b.title}`, "zh-Hans-CN");
}

function isActualImportedLesson(lesson: ImportedScheduleLesson): boolean {
  return lesson.presentCount === undefined ? true : lesson.presentCount > 0;
}

function hasAbsentImportedStudent(lesson: ImportedScheduleLesson): boolean {
  return lesson.presentCount !== undefined && lesson.expectedCount !== undefined && lesson.presentCount < lesson.expectedCount;
}

function sumDefinedCounts(lessons: ImportedScheduleLesson[], key: "presentCount" | "expectedCount"): number {
  return lessons.reduce((sum, lesson) => sum + (lesson[key] ?? 0), 0);
}

function formatImportedCount(value: number | undefined): string {
  return value === undefined ? "-" : String(value);
}

function importedCourseTypeLabel(type: CourseType | "unknown"): string {
  const labels: Record<string, string> = {
    one_on_one: "一对一",
    one_on_two: "一对二",
    class: "班课",
    trial: "试听",
    full_time: "全日制",
    unknown: "未知班型"
  };
  return labels[type] ?? type;
}

function weekdayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("zh-CN", { weekday: "short" });
}

function mergedExportDateRange(lessons: ImportedScheduleLesson[]): string {
  const dates = lessons.map((lesson) => lesson.date).sort();
  const firstDate = dates[0] ?? "未识别日期";
  const lastDate = dates[dates.length - 1] ?? firstDate;
  return firstDate === lastDate ? firstDate : `${firstDate}_${lastDate}`;
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

function findSameTimeCourseThatLooksLikeImportedLesson(vault: TeacherVault, lesson: ImportedScheduleLesson, campusId?: string, fallbackCourseId?: string): CourseGroup | undefined {
  const sameTimeLessons = activeSystemLessonsForDate(vault, lesson.date, campusId)
    .filter((item) => item.startTime === lesson.startTime && item.endTime === lesson.endTime);
  const bestLesson = sameTimeLessons.find((item) => courseLooksLikeImportedLesson(vault, item.courseGroupId, lesson))
    ?? sameTimeLessons.find((item) => item.courseGroupId === fallbackCourseId);
  return bestLesson ? vault.courseGroups.find((course) => course.id === bestLesson.courseGroupId) : undefined;
}

function courseLooksLikeImportedLesson(vault: TeacherVault, courseId: string, lesson: ImportedScheduleLesson): boolean {
  const course = vault.courseGroups.find((item) => item.id === courseId);
  if (!course) return false;

  const title = normalizeText(lesson.title);
  const courseName = normalizeText(course.name);
  const lessonSubject = normalizeText(lesson.subjectHint);
  const courseSubject = normalizeText(course.subject);
  const subjectMatches = Boolean(lessonSubject && courseSubject && lessonSubject === courseSubject);
  const typeMatches = lesson.courseTypeHint === "unknown" || lesson.courseTypeHint === course.type;
  const studentMatches = course.studentIds.some((studentId) => {
    const studentName = normalizeText(vault.students.find((student) => student.id === studentId)?.name ?? "");
    const studentHint = normalizeText(lesson.studentNameHint ?? "");
    return Boolean(
      studentName &&
      (
        title.includes(studentName) ||
        (studentHint && (studentName === studentHint || studentName.includes(studentHint) || studentHint.includes(studentName)))
      )
    );
  });
  const courseNameIsOnlySubject = Boolean(courseSubject && courseName === courseSubject);
  const courseNameMatchesTitle = Boolean(courseName && !courseNameIsOnlySubject && (title.includes(courseName) || courseName.includes(title)));

  if (courseNameMatchesTitle && (typeMatches || subjectMatches || studentMatches)) return true;
  if (studentMatches && (subjectMatches || Boolean(courseSubject && title.includes(courseSubject)))) return true;
  return false;
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
  return text.match(new RegExp(`${field}：\\s*(.*?)(?=\\s+(?:教师|助教|教室|实到\\/应到|取消原因|未上课原因|缺勤原因|课程备注|备注|说明|原因)：|$)`))?.[1]?.trim();
}

function extractScheduleNote(text: string): string | undefined {
  const namedNote = ["取消原因", "未上课原因", "缺勤原因", "课程备注", "备注", "说明", "原因"]
    .map((field) => extractNamedField(text, field))
    .find((value): value is string => Boolean(value));
  if (namedNote) return namedNote;
  return text.match(/(?:取消|停课|请假|未上|不上课|未开课|课消|缺勤|无学生)[^。；;\n]*/)?.[0]?.trim();
}

function isLikelyCancelledImportedLesson(lesson: Pick<ImportedScheduleLesson, "presentCount" | "note" | "rawText">): boolean {
  if (lesson.presentCount !== 0) return false;
  return /取消|停课|请假|未上|不上课|未开课|课消|缺勤|无学生/.test(`${lesson.note ?? ""} ${lesson.rawText}`);
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
    lesson.date === date &&
    (!campusId || systemLessonCampusId(vault, lesson) === campusId)
  );
}

function findExactSystemLesson(vault: TeacherVault, lesson: ImportedScheduleLesson, courseId: string, campusId?: string): Lesson | undefined {
  const candidates = activeSystemLessonsForDate(vault, lesson.date, campusId).filter((item) =>
    item.courseGroupId === courseId &&
    item.startTime === lesson.startTime &&
    item.endTime === lesson.endTime
  );
  return preferredSystemLessonForImportedLesson(candidates, lesson);
}

function findSameCourseDifferentTimeLesson(vault: TeacherVault, lesson: ImportedScheduleLesson, courseId: string, campusId?: string): Lesson | undefined {
  const candidates = activeSystemLessonsForDate(vault, lesson.date, campusId).filter((item) => item.courseGroupId === courseId);
  const overlapping = candidates.filter((item) => timeOverlaps(item.startTime, item.endTime, lesson.startTime, lesson.endTime));
  return preferredSystemLessonForImportedLesson(overlapping, lesson) ?? preferredSystemLessonForImportedLesson(candidates, lesson);
}

function findSameTimeDifferentCourseLesson(vault: TeacherVault, lesson: ImportedScheduleLesson, courseId?: string, campusId?: string): Lesson | undefined {
  const candidates = activeSystemLessonsForDate(vault, lesson.date, campusId).filter((item) =>
    item.courseGroupId !== courseId &&
    item.startTime === lesson.startTime &&
    item.endTime === lesson.endTime
  );
  return preferredSystemLessonForImportedLesson(candidates, lesson);
}

function preferredSystemLessonForImportedLesson(candidates: Lesson[], lesson: Pick<ImportedScheduleLesson, "presentCount" | "note" | "rawText">): Lesson | undefined {
  if (candidates.length <= 1) return candidates[0];
  const importedLooksCancelled = isLikelyCancelledImportedLesson(lesson) || lesson.presentCount === 0;
  return [...candidates].sort((a, b) => {
    const aCancelledMatch = a.status === "cancelled" ? importedLooksCancelled : !importedLooksCancelled;
    const bCancelledMatch = b.status === "cancelled" ? importedLooksCancelled : !importedLooksCancelled;
    return Number(bCancelledMatch) - Number(aCancelledMatch);
  })[0];
}

function systemLessonAttendanceSnapshot(vault: TeacherVault, lesson: Lesson): {
  presentCount: number;
  expectedCount: number;
  presentStudentNames: string;
  expectedStudentNames: string;
  status: Lesson["status"];
} {
  const expectedStudentIds = Array.from(new Set(lesson.expectedStudentIds));
  if (lesson.status === "cancelled") {
    return {
      presentCount: 0,
      expectedCount: 0,
      presentStudentNames: "",
      expectedStudentNames: studentNamesForIds(vault, expectedStudentIds),
      status: lesson.status
    };
  }
  const presentStudentIds = lesson.attendance
    .filter((entry) => entry.status === "attended" || (Boolean(lesson.linkedOriginalLessonId) && entry.status === "makeup_completed"))
    .map((entry) => entry.studentId);
  const effectivePresentStudentIds = lesson.attendance.length > 0
    ? Array.from(new Set(presentStudentIds))
    : Array.from(new Set(lesson.expectedStudentIds));
  return {
    presentCount: effectivePresentStudentIds.length,
    expectedCount: expectedStudentIds.length,
    presentStudentNames: studentNamesForIds(vault, effectivePresentStudentIds),
    expectedStudentNames: studentNamesForIds(vault, expectedStudentIds),
    status: lesson.status
  };
}

function importAttendanceIssue(
  lesson: Pick<ImportedScheduleLesson, "presentCount" | "expectedCount">,
  systemAttendance: { presentCount: number; expectedCount: number; status?: Lesson["status"] }
): string {
  if (systemAttendance.status === "cancelled" && lesson.presentCount === 0 && systemAttendance.presentCount === 0) return "";
  if (lesson.presentCount === systemAttendance.presentCount && lesson.expectedCount === systemAttendance.expectedCount) return "";
  return `到课人数不一致：教务 ${lesson.presentCount}/${lesson.expectedCount}，云端 ${systemAttendance.presentCount}/${systemAttendance.expectedCount}`;
}

function importSystemCompletionIssue(lesson: Pick<ImportedScheduleLesson, "presentCount" | "note" | "rawText">, systemLesson: Lesson): string {
  if (systemLesson.status === "completed" || systemLesson.status === "makeup_completed") return "";
  if (systemLesson.status === "cancelled" && (lesson.presentCount === 0 || isLikelyCancelledImportedLesson(lesson))) return "";
  return `云端课节尚未标记完成：当前状态为「${systemLesson.status === "scheduled" ? "待上课" : systemLesson.status === "draft" ? "草稿" : systemLesson.status}」`;
}

function studentNamesForIds(vault: TeacherVault, studentIds: string[]): string {
  return studentIds
    .map((studentId) => vault.students.find((student) => student.id === studentId)?.name ?? "")
    .filter(Boolean)
    .join("、");
}

function systemLessonLabel(vault: TeacherVault, lesson: Lesson): string {
  const course = vault.courseGroups.find((item) => item.id === lesson.courseGroupId);
  return `${lesson.date} ${lesson.startTime}-${lesson.endTime} ${course?.name ?? "未知课程"}`;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
