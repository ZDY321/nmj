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

export function createLessonFeedbackRecord(
  vault: TeacherVault,
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
  const lessonIndex = lesson ? courseLessons.findIndex((item) => item.id === lesson.id) : -1;
  const periodNumber = lessonIndex >= 0 ? lessonIndex + 1 : courseLessons.length + 1;

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
