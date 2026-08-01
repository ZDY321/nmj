import { getCourse } from "@/frontend/lib/calculations";
import { campusName, findStudent, lessonStudentIds, sortLessons } from "@/frontend/lib/helpers";
import { makeId } from "@/frontend/lib/crypto";
import type { AttendanceStatus, CourseGroup, Lesson, Student, TeacherVault } from "@/shared/types";

export const lessonFeedbackIndexDocType = "lesson-feedback-index";
export const lessonFeedbackIndexDocKey = "primary";
export const lessonFeedbackRecordDocType = "lesson-feedback-record";

export type LessonFeedbackMark = "" | "√" | "○" | "×" | "A" | "B" | "C" | string;

export type LessonFeedbackEntry = {
  attendance: LessonFeedbackMark;
  homework: LessonFeedbackMark;
  listening: LessonFeedbackMark;
  participation: LessonFeedbackMark;
  notes: LessonFeedbackMark;
  comment: string;
  // 评语可单独调整样式；未设置时沿用整表默认值。
  commentColor?: string;
  commentFontSize?: number;
  commentFontWeight?: 400 | 600 | 700;
};

export type LessonFeedbackStudentSnapshot = {
  id: string;
  name: string;
  grade?: string;
  status?: Student["status"];
};

export type LessonFeedbackPoint = {
  x: number;
  y: number;
};

export type LessonFeedbackStrokeTool = "pen" | "highlighter" | "line" | "arrow" | "ellipse" | "rect";

export type LessonFeedbackStroke = {
  id: string;
  tool: LessonFeedbackStrokeTool;
  color: string;
  width: number;
  points: LessonFeedbackPoint[];
};

export type LessonFeedbackBorderStyle = "solid" | "dashed" | "none";

export type LessonFeedbackTextBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  fontSize: number;
  fontWeight: 400 | 600 | 700;
  borderColor: string;
  backgroundColor: string;
  studentIds: string[];
  showBand: boolean;
  // 旧版反馈项目里可逐框调整的样式；未写入时按 dashed / 1.5 处理，兼容既有记录。
  borderStyle?: LessonFeedbackBorderStyle;
  borderWidth?: number;
  // 括号两端的语义不同：
  // - 文本框侧的汇聚点与文本框是一体的，恒定在框左缘中点，拖它等同于拖整个文本框。
  // - 学生侧每个触点各自独立，按 studentId 存偏移，移动其中一个不影响其他人与文本框。
  braceNodes?: Record<string, { dx: number; dy: number }>;
  // 荧光标记：按字符下标记录起止（[start, end)），编辑文本时整体清空后重标，
  // 因此不需要跟随插入/删除做偏移换算。
  highlights?: LessonFeedbackHighlight[];
};

export type LessonFeedbackHighlight = {
  start: number;
  end: number;
  color: string;
};

export type LessonFeedbackRecord = {
  version: 1;
  id: string;
  courseGroupId: string;
  lessonId?: string;
  className: string;
  subject: string;
  campusName: string;
  teacherName: string;
  date: string;
  startTime?: string;
  endTime?: string;
  periodLabel: string;
  content: string;
  homework: string;
  generalNotes: string;
  students: LessonFeedbackStudentSnapshot[];
  entries: Record<string, LessonFeedbackEntry>;
  annotations: LessonFeedbackStroke[];
  textBoxes: LessonFeedbackTextBox[];
  paperColor: "soft" | "white";
  createdAt: string;
  updatedAt: string;
  legacySourceId?: string;
};

export type LessonFeedbackIndexItem = {
  id: string;
  courseGroupId: string;
  lessonId?: string;
  className: string;
  subject: string;
  date: string;
  periodLabel: string;
  studentIds: string[];
  studentNames: string[];
  preview: string;
  createdAt: string;
  updatedAt: string;
  legacySourceId?: string;
};

export type LessonFeedbackIndexDocument = {
  version: 1;
  items: LessonFeedbackIndexItem[];
  updatedAt: string;
};

export function emptyLessonFeedbackIndex(): LessonFeedbackIndexDocument {
  return { version: 1, items: [], updatedAt: new Date(0).toISOString() };
}

export function emptyLessonFeedbackEntry(attendance: LessonFeedbackMark = ""): LessonFeedbackEntry {
  return {
    attendance,
    homework: "",
    listening: "",
    participation: "",
    notes: "",
    comment: ""
  };
}

export function feedbackAttendanceMark(status: AttendanceStatus | undefined): LessonFeedbackMark {
  if (status === "attended" || status === "makeup_completed") return "√";
  if (status === "leave_requested" || status === "makeup_pending") return "○";
  if (status === "absent" || status === "cancelled") return "×";
  return "";
}

// 课次序号只数实际上过的课：取消、待排、草稿以及排在本节之后的课都不计入，
// 因此中途停课或取消不会把编号顶高。给定课次本身若尚未标记完成，也按“下一节”接续。
export function lessonFeedbackPeriodNumber(courseLessons: Lesson[], lesson?: Lesson): number {
  const taught = courseLessons.filter((item) => item.status === "completed" || item.status === "makeup_completed");
  if (!lesson) return taught.length + 1;
  const index = taught.findIndex((item) => item.id === lesson.id);
  if (index >= 0) return index + 1;
  return taught.filter((item) => sortLessons(item, lesson) < 0).length + 1;
}

export function createLessonFeedbackRecord(  vault: TeacherVault,
  course: CourseGroup,
  lesson?: Lesson,
  now = new Date().toISOString()
): LessonFeedbackRecord {
  const studentIds = lesson ? lessonStudentIds(lesson) : course.studentIds;
  const students = Array.from(new Set(studentIds)).map((studentId) => feedbackStudentSnapshot(vault, studentId));
  const entries = Object.fromEntries(students.map((student) => {
    const attendance = lesson?.attendance.find((item) => item.studentId === student.id)?.status;
    return [student.id, emptyLessonFeedbackEntry(feedbackAttendanceMark(attendance))];
  }));
  const courseLessons = vault.lessons
    .filter((item) => item.courseGroupId === course.id)
    .sort(sortLessons);
  const periodNumber = lessonFeedbackPeriodNumber(courseLessons, lesson);

  return {
    version: 1,
    id: makeId("lesson_feedback"),
    courseGroupId: course.id,
    lessonId: lesson?.id,
    className: course.name,
    subject: course.subject,
    campusName: campusName(vault, lesson?.campusId ?? course.defaultCampusId),
    teacherName: vault.profile.displayName,
    date: lesson?.date ?? now.slice(0, 10),
    startTime: lesson?.startTime,
    endTime: lesson?.endTime,
    periodLabel: `第 ${periodNumber} 课`,
    content: lesson?.content.taught ?? "",
    homework: lesson?.content.homework ?? "",
    generalNotes: "",
    students,
    entries,
    annotations: [],
    textBoxes: [],
    paperColor: "soft",
    createdAt: now,
    updatedAt: now
  };
}

export function upsertLessonFeedbackIndexItem(
  index: LessonFeedbackIndexDocument,
  item: LessonFeedbackIndexItem,
  now = new Date().toISOString()
): LessonFeedbackIndexDocument {
  return {
    version: 1,
    items: [item, ...index.items.filter((current) => current.id !== item.id)],
    updatedAt: now
  };
}

export function lessonFeedbackIndexItem(record: LessonFeedbackRecord): LessonFeedbackIndexItem {
  return {
    id: record.id,
    courseGroupId: record.courseGroupId,
    lessonId: record.lessonId,
    className: record.className,
    subject: record.subject,
    date: record.date,
    periodLabel: record.periodLabel,
    studentIds: record.students.map((student) => student.id),
    studentNames: record.students.map((student) => student.name),
    preview: record.content.trim() || record.homework.trim() || record.generalNotes.trim(),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    legacySourceId: record.legacySourceId
  };
}

export function courseForFeedbackRecord(vault: TeacherVault, record: Pick<LessonFeedbackRecord, "courseGroupId">): CourseGroup | undefined {
  return getCourse(vault, record.courseGroupId);
}

function feedbackStudentSnapshot(vault: TeacherVault, studentId: string): LessonFeedbackStudentSnapshot {
  const student = findStudent(vault, studentId);
  return student
    ? { id: student.id, name: student.name, grade: student.grade, status: student.status }
    : { id: studentId, name: "未知学生" };
}
