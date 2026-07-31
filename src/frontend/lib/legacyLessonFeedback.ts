import { campusName, sortLessons } from "@/frontend/lib/helpers";
import type {
  LessonFeedbackEntry,
  LessonFeedbackRecord,
  LessonFeedbackStroke,
  LessonFeedbackStrokeTool,
  LessonFeedbackTextBox
} from "@/frontend/lib/lessonFeedback";
import type { CourseGroup, Student, TeacherVault } from "@/shared/types";

export type LegacyFeedbackStudent = { id: string; name: string };

export type LegacyFeedbackClass = {
  id: string;
  name: string;
  grade: string;
  campus: string;
  subject: string;
  teacher: string;
  students: LegacyFeedbackStudent[];
};

export type LegacyFeedbackLesson = {
  id: string;
  classId: string;
  className: string;
  subject: string;
  teacher: string;
  date: string;
  period: string;
  content: string;
  homework: string;
  generalNotes: string;
  students: LegacyFeedbackStudent[];
  entries: Record<string, Partial<LessonFeedbackEntry>>;
  annotations: LegacyFeedbackAnnotation[];
  textBoxes: LegacyFeedbackTextBox[];
  paperColor?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type LegacyFeedbackAnnotation = {
  id?: string;
  tool?: string;
  color?: string;
  width?: number;
  points?: Array<{ x?: number; y?: number }>;
};

export type LegacyFeedbackTextBox = {
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  color?: string;
  fontSize?: number;
  fontWeight?: number;
  borderColor?: string;
  braceColor?: string;
  backgroundOpacity?: number;
  braceStudentIds?: string[];
  band?: boolean;
};

export type LegacyFeedbackData = {
  version?: number;
  classes: LegacyFeedbackClass[];
  lessons: LegacyFeedbackLesson[];
};

export type LegacyCourseMappings = Record<string, string>;

export type LegacyImportResult = {
  records: LessonFeedbackRecord[];
  skippedLessonCount: number;
  unmatchedStudentCount: number;
};

export function parseLegacyFeedbackJson(text: string): LegacyFeedbackData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("无法解析 JSON，请选择旧反馈项目导出的课堂反馈数据文件。");
  }
  if (!isObject(raw) || !Array.isArray(raw.classes) || !Array.isArray(raw.lessons)) {
    throw new Error("文件格式不正确：没有找到旧反馈项目的班级和课次数据。");
  }

  const classes = raw.classes.map((item, index) => normalizeClass(item, index));
  const classIds = new Set(classes.map((item) => item.id));
  const lessons = raw.lessons.map((item, index) => normalizeLesson(item, index));
  if (lessons.some((lesson) => !classIds.has(lesson.classId) && !lesson.className)) {
    throw new Error("文件中存在无法识别班级的课次记录。");
  }
  return { version: numberValue(raw.version, 1), classes, lessons };
}

export function suggestLegacyCourseMappings(vault: TeacherVault, data: LegacyFeedbackData): LegacyCourseMappings {
  return Object.fromEntries(data.classes.map((legacyClass) => {
    const exact = vault.courseGroups.find((course) => normalizedName(course.name) === normalizedName(legacyClass.name));
    if (exact) return [legacyClass.id, exact.id];
    const fuzzy = vault.courseGroups
      .map((course) => ({ course, score: courseMatchScore(course, legacyClass) }))
      .filter((item) => item.score >= 60)
      .sort((a, b) => b.score - a.score);
    return [legacyClass.id, fuzzy.length === 1 || fuzzy[0]?.score > (fuzzy[1]?.score ?? 0) ? fuzzy[0]?.course.id ?? "" : ""];
  }));
}

export function convertLegacyFeedbackRecords(
  vault: TeacherVault,
  data: LegacyFeedbackData,
  mappings: LegacyCourseMappings
): LegacyImportResult {
  const classes = new Map(data.classes.map((item) => [item.id, item]));
  let skippedLessonCount = 0;
  const unmatchedStudentIds = new Set<string>();
  const records: LessonFeedbackRecord[] = [];

  data.lessons.forEach((legacyLesson) => {
    const legacyClass = classes.get(legacyLesson.classId) ?? [...classes.values()].find((item) => normalizedName(item.name) === normalizedName(legacyLesson.className));
    const courseId = mappings[legacyLesson.classId] ?? (legacyClass ? mappings[legacyClass.id] : undefined);
    const course = vault.courseGroups.find((item) => item.id === courseId);
    if (!course) {
      skippedLessonCount += 1;
      return;
    }
    const studentMap = mapLegacyStudents(vault, course, legacyLesson.students, unmatchedStudentIds);
    const matchedLesson = matchLesson(vault, course.id, legacyLesson.date);
    const students = legacyLesson.students.map((legacyStudent) => {
      const current = studentMap.get(legacyStudent.id);
      return current
        ? { id: current.id, name: current.name, grade: current.grade, status: current.status }
        : {
            id: legacyStudentId(legacyStudent.id),
            name: legacyStudent.name || "未知学生",
            grade: legacyClass?.grade || undefined
          };
    });
    const entryIdMap = new Map(legacyLesson.students.map((student) => [
      student.id,
      studentMap.get(student.id)?.id ?? legacyStudentId(student.id)
    ]));
    const entries = Object.fromEntries(legacyLesson.students.map((student) => {
      const source = legacyLesson.entries[student.id] ?? {};
      return [entryIdMap.get(student.id) as string, normalizeEntry(source)];
    }));
    const createdAt = isoDateTime(legacyLesson.createdAt) ?? `${validDate(legacyLesson.date)}T00:00:00.000Z`;
    const updatedAt = isoDateTime(legacyLesson.updatedAt) ?? createdAt;
    records.push({
      version: 1,
      id: legacyRecordId(legacyLesson.id),
      courseGroupId: course.id,
      lessonId: matchedLesson?.id,
      className: course.name,
      subject: legacyLesson.subject || course.subject,
      campusName: legacyClass?.campus || campusName(vault, matchedLesson?.campusId ?? course.defaultCampusId),
      teacherName: legacyLesson.teacher || legacyClass?.teacher || vault.profile.displayName,
      date: validDate(legacyLesson.date),
      startTime: matchedLesson?.startTime,
      endTime: matchedLesson?.endTime,
      periodLabel: periodLabel(legacyLesson.period, vault, course.id, matchedLesson?.id),
      content: legacyLesson.content,
      homework: legacyLesson.homework,
      generalNotes: legacyLesson.generalNotes,
      students,
      entries,
      annotations: convertAnnotations(legacyLesson.annotations),
      textBoxes: convertTextBoxes(legacyLesson.textBoxes, entryIdMap),
      paperColor: isWhitePaper(legacyLesson.paperColor) ? "white" : "soft",
      createdAt,
      updatedAt,
      legacySourceId: legacyLesson.id
    });
  });

  return { records, skippedLessonCount, unmatchedStudentCount: unmatchedStudentIds.size };
}

function normalizeClass(value: unknown, index: number): LegacyFeedbackClass {
  const item = isObject(value) ? value : {};
  return {
    id: stringValue(item.id) || `legacy-class-${index + 1}`,
    name: stringValue(item.name) || `旧班级 ${index + 1}`,
    grade: stringValue(item.grade),
    campus: stringValue(item.campus),
    subject: stringValue(item.subject),
    teacher: stringValue(item.teacher),
    students: normalizeStudents(item.students)
  };
}

function normalizeLesson(value: unknown, index: number): LegacyFeedbackLesson {
  const item = isObject(value) ? value : {};
  return {
    id: stringValue(item.id) || `legacy-lesson-${index + 1}`,
    classId: stringValue(item.classId),
    className: stringValue(item.className),
    subject: stringValue(item.subject),
    teacher: stringValue(item.teacher),
    date: validDate(stringValue(item.date)),
    period: stringValue(item.period),
    content: stringValue(item.content),
    homework: stringValue(item.homework),
    generalNotes: stringValue(item.generalNotes),
    students: normalizeStudents(item.students),
    entries: isObject(item.entries) ? item.entries as Record<string, Partial<LessonFeedbackEntry>> : {},
    annotations: Array.isArray(item.annotations) ? item.annotations.filter(isObject) as LegacyFeedbackAnnotation[] : [],
    textBoxes: Array.isArray(item.textBoxes) ? item.textBoxes.filter(isObject) as LegacyFeedbackTextBox[] : [],
    paperColor: stringValue(item.paperColor),
    createdAt: stringValue(item.createdAt),
    updatedAt: stringValue(item.updatedAt)
  };
}

function normalizeStudents(value: unknown): LegacyFeedbackStudent[] {
  if (!Array.isArray(value)) return [];
  return value.map((student, index) => {
    if (typeof student === "string") return { id: `legacy-student-${index + 1}`, name: student };
    const item = isObject(student) ? student : {};
    return {
      id: stringValue(item.id) || `legacy-student-${index + 1}`,
      name: stringValue(item.name) || "未知学生"
    };
  });
}

function mapLegacyStudents(
  vault: TeacherVault,
  course: CourseGroup,
  students: LegacyFeedbackStudent[],
  unmatched: Set<string>
): Map<string, Student> {
  const courseStudents = course.studentIds.map((id) => vault.students.find((student) => student.id === id)).filter((student): student is Student => Boolean(student));
  const result = new Map<string, Student>();
  students.forEach((legacyStudent) => {
    const name = normalizedName(legacyStudent.name);
    const matches = courseStudents.filter((student) => normalizedName(student.name) === name);
    const fallbackMatches = vault.students.filter((student) => normalizedName(student.name) === name);
    const current = matches.length === 1 ? matches[0] : fallbackMatches.length === 1 ? fallbackMatches[0] : undefined;
    if (current) result.set(legacyStudent.id, current);
    else unmatched.add(legacyStudent.id);
  });
  return result;
}

function matchLesson(vault: TeacherVault, courseId: string, date: string) {
  const matches = vault.lessons.filter((lesson) => lesson.courseGroupId === courseId && lesson.date === date);
  return matches.length === 1 ? matches[0] : undefined;
}

function periodLabel(period: string, vault: TeacherVault, courseId: string, lessonId?: string): string {
  const trimmed = period.trim();
  if (trimmed) return /^第.+课$/.test(trimmed) ? trimmed : `第 ${trimmed} 课`;
  if (lessonId) {
    const lessons = vault.lessons.filter((lesson) => lesson.courseGroupId === courseId).sort(sortLessons);
    const index = lessons.findIndex((lesson) => lesson.id === lessonId);
    if (index >= 0) return `第 ${index + 1} 课`;
  }
  return "历史课次";
}

function normalizeEntry(entry: Partial<LessonFeedbackEntry>): LessonFeedbackEntry {
  return {
    attendance: stringValue(entry.attendance),
    homework: stringValue(entry.homework),
    listening: stringValue(entry.listening),
    participation: stringValue(entry.participation),
    notes: stringValue(entry.notes),
    comment: stringValue(entry.comment)
  };
}

function convertAnnotations(annotations: LegacyFeedbackAnnotation[]): LessonFeedbackStroke[] {
  return annotations.flatMap((annotation, index) => {
    const points = Array.isArray(annotation.points)
      ? annotation.points.map((point) => ({ x: numberValue(point.x, 0), y: numberValue(point.y, 0) }))
      : [];
    if (points.length === 0) return [];
    return [{
      id: annotation.id || `legacy-stroke-${index + 1}`,
      tool: legacyStrokeTool(annotation.tool),
      color: annotation.color || "#d92d20",
      width: Math.max(numberValue(annotation.width, 2), 1),
      points
    }];
  });
}

function legacyStrokeTool(tool?: string): LessonFeedbackStrokeTool {
  if (tool === "highlighter" || tool === "line" || tool === "arrow" || tool === "ellipse" || tool === "rect") return tool;
  return "pen";
}

function convertTextBoxes(boxes: LegacyFeedbackTextBox[], studentIds: Map<string, string>): LessonFeedbackTextBox[] {
  return boxes.map((box, index) => {
    const borderColor = box.braceColor || box.borderColor || "#d92d20";
    const opacity = clamp(numberValue(box.backgroundOpacity, 0.08), 0, 1);
    return {
      id: box.id || `legacy-textbox-${index + 1}`,
      x: clamp(numberValue(box.x, 520), 20, 744),
      y: Math.max(numberValue(box.y, 310), 20),
      width: clamp(numberValue(box.width, 220), 80, 744),
      height: clamp(numberValue(box.height, 100), 50, 500),
      text: stringValue(box.text),
      color: box.color || "#1f2523",
      fontSize: clamp(numberValue(box.fontSize, 12), 8, 36),
      fontWeight: box.fontWeight && box.fontWeight >= 700 ? 700 : box.fontWeight && box.fontWeight >= 600 ? 600 : 400,
      borderColor,
      backgroundColor: colorWithOpacity(borderColor, opacity),
      studentIds: Array.isArray(box.braceStudentIds) ? box.braceStudentIds.map((id) => studentIds.get(id)).filter((id): id is string => Boolean(id)) : [],
      showBand: Boolean(box.band)
    };
  });
}

function legacyStudentId(value: string): string {
  return `legacy_student_${stableId(value)}`;
}

function legacyRecordId(value: string): string {
  return `legacy_feedback_${stableId(value)}`;
}

function stableId(value: string): string {
  const clean = value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 72) || "item";
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${clean}_${(hash >>> 0).toString(36)}`;
}

function courseMatchScore(course: CourseGroup, legacyClass: LegacyFeedbackClass): number {
  const courseName = normalizedName(course.name);
  const legacyName = normalizedName(legacyClass.name);
  let score = 0;
  if (courseName === legacyName) score += 100;
  else if (courseName.includes(legacyName) || legacyName.includes(courseName)) score += 60;
  if (normalizedName(course.subject) === normalizedName(legacyClass.subject)) score += 15;
  if (legacyClass.grade && courseName.includes(normalizedName(legacyClass.grade))) score += 5;
  return score;
}

function colorWithOpacity(color: string, opacity: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const value = Number.parseInt(match[1], 16);
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`;
}

function isWhitePaper(color?: string): boolean {
  return color?.toLowerCase() === "#fff" || color?.toLowerCase() === "#ffffff" || color?.toLowerCase() === "white";
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s·._-]+/g, "");
}

function validDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
}

function isoDateTime(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function numberValue(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
