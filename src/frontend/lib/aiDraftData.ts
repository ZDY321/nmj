import {
  courseTypeLabel,
  datesBetween
} from "@/frontend/lib/helpers";
import { normalizeTimeText } from "@/frontend/lib/time";
import {
  arrayValue as arrayValueLocal,
  isPlainRecord as isPlainRecordLocal,
  stringValue
} from "@/frontend/lib/typeGuards";
import type {
  Campus,
  CourseGroup,
  CourseType,
  Student,
  TeacherVault
} from "@/shared/types";

import type { AiDraftContext } from "./aiDraftTypes";

export function normalizeAiStudentStatus(value: unknown): "active" | "transition" | "paused" | undefined {
  const normalized = stringValue(value).toLowerCase();
  if (normalized === "active" || normalized === "在读" || normalized === "正常") return "active";
  if (normalized === "transition" || normalized === "pending" || normalized === "过渡" || normalized === "过渡期" || normalized === "待定" || normalized === "升学") return "transition";
  if (normalized === "paused" || normalized === "archived" || normalized === "归档" || normalized === "已归档" || normalized === "暂停") return "paused";
  return undefined;
}

export function normalizeAiCourseType(value: unknown, vault: TeacherVault | null = null): CourseType {
  const normalized = stringValue(value).toLowerCase();
  if (normalized === "one_on_one" || normalized === "一对一") return "one_on_one";
  if (normalized === "one_on_two" || normalized === "一对二") return "one_on_two";
  if (normalized === "small_class" || normalized === "小班课" || normalized === "小班") return "small_class";
  if (normalized === "big_class" || normalized === "大班课" || normalized === "大班") return "big_class";
  if (normalized === "class" || normalized === "班课" || normalized === "多人班课") return "small_class";
  if (normalized === "trial" || normalized === "试听") return "trial";
  if (normalized === "full_time" || normalized === "全职" || normalized === "全日制") return "small_class";
  const matchedCustomType = vault?.preferences?.customCourseTypes?.find((item) =>
    item.id.toLowerCase() === normalized || item.label.trim().toLowerCase() === normalized
  );
  if (matchedCustomType) return matchedCustomType.id;
  const matchedKnownType = vault
    ? Array.from(new Set([...vault.courseGroups.map((course) => course.type), ...vault.lessons.map((lesson) => lesson.type)]))
        .find((type) => type.toLowerCase() === normalized || courseTypeLabel(vault, type).trim().toLowerCase() === normalized)
    : undefined;
  if (matchedKnownType) return matchedKnownType;
  return "small_class";
}

export function createAiDraftData({ nextVault, makeId, messages }: AiDraftContext) {
  const campusByName = (name: unknown): Campus | undefined => {
    const normalized = stringValue(name).toLowerCase();
    if (!normalized) return undefined;
    return nextVault.campuses.find((campus) => campus.id.toLowerCase() === normalized || campus.name.trim().toLowerCase() === normalized);
  };

  const studentByName = (name: unknown): Student | undefined => {
    const normalized = stringValue(name).toLowerCase();
    if (!normalized) return undefined;
    return nextVault.students.find((student) => student.id.toLowerCase() === normalized || student.name.trim().toLowerCase() === normalized);
  };

  const courseByIdOrName = (value: unknown): CourseGroup | undefined => {
    const normalized = stringValue(value).toLowerCase();
    if (!normalized) return undefined;
    return nextVault.courseGroups.find((course) => course.id.toLowerCase() === normalized || course.name.trim().toLowerCase() === normalized);
  };

  const courseMatchesData = (course: CourseGroup, data: Record<string, unknown>): boolean => {
    const requestedSubject = stringValue(data.subject);
    const requestedType = data.type === undefined || data.type === null || data.type === "" ? "" : normalizeAiCourseType(data.type, nextVault);
    const requestedCampus = data.campus === undefined ? undefined : campusByName(data.campus);
    const requestedStudentIds = studentIdsFromAiData(data);
    if (requestedSubject && course.subject.trim().toLowerCase() !== requestedSubject.toLowerCase()) return false;
    if (requestedType && course.type !== requestedType) return false;
    if (requestedCampus && course.defaultCampusId !== requestedCampus.id) return false;
    if (requestedStudentIds.length > 0) {
      const currentIds = new Set(course.studentIds);
      if (!requestedStudentIds.every((studentId) => currentIds.has(studentId))) return false;
    }
    return true;
  };

  const ensureStudent = (data: Record<string, unknown>): Student | null => {
    const name = stringValue(data.name ?? data.studentName);
    if (!name) return null;
    const grade = stringValue(data.grade);
    const campus = campusByName(data.campus);
    const existing = nextVault.students.find((student) =>
      student.name.trim().toLowerCase() === name.toLowerCase() &&
      (!grade || (student.grade ?? "").trim().toLowerCase() === grade.toLowerCase()) &&
      (!campus || student.defaultCampusId === campus.id)
    );
    if (existing) return existing;

    const student: Student = {
      id: makeId("student"),
      name,
      grade: grade || undefined,
      defaultCampusId: campus?.id,
      note: stringValue(data.note) || undefined,
      temporaryTrial: Boolean(data.temporaryTrial),
      status: "active"
    };
    nextVault.students.push(student);
    messages.push(`新增学生「${student.name}」`);
    return student;
  };

  const studentIdsFromNames = (values: unknown): string[] => {
    const rawValues = Array.isArray(values) ? values : values === undefined || values === null || values === "" ? [] : [values];
    return rawValues
      .map((value) => {
        if (isPlainRecordLocal(value)) {
          const directId = stringValue(value.id ?? value.studentId);
          const student = nextVault.students.find((item) => item.id === directId) ?? studentByName(value.name ?? value.studentName);
          return student?.id ?? "";
        }
        const directId = stringValue(value);
        const student = nextVault.students.find((item) => item.id === directId) ?? studentByName(value);
        return student?.id ?? "";
      })
      .filter(Boolean);
  };

  const studentIdsFromAiData = (data: Record<string, unknown>): string[] => {
    const directStudentId = stringValue(data.studentId);
    const directStudent = directStudentId ? nextVault.students.find((student) => student.id === directStudentId) : undefined;
    return Array.from(new Set([
      directStudent?.id ?? "",
      ...studentIdsFromNames(data.studentIds ?? data.studentNames ?? data.students ?? data.studentsToAdd),
      ...studentIdsFromNames(data.studentName ?? data.student)
    ].filter(Boolean)));
  };

  const normalizeAiDate = (value: unknown): string | null => {
    const raw = stringValue(value).replace(/[./]/g, "-");
    const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return null;
    const normalized = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    return datesBetween(normalized, normalized)[0] === normalized ? normalized : null;
  };

  const normalizeAiTime = (value: unknown): string | null => {
    return normalizeTimeText(stringValue(value));
  };

  const falseyAiValue = (value: unknown): boolean => {
    if (value === false) return true;
    const normalized = stringValue(value).toLowerCase();
    return normalized === "false" || normalized === "no" || normalized === "0" || normalized === "不包含" || normalized === "不包括" || normalized === "排除";
  };

  const dateListFromAi = (listValue: unknown, singleValue: unknown, startValue: unknown, endValue: unknown): string[] => {
    const explicitDates = arrayValueLocal(listValue).map(stringValue).filter(Boolean);
    if (explicitDates.length > 0) return explicitDates;
    const singleDate = stringValue(singleValue);
    if (singleDate) return [singleDate];
    const startDate = stringValue(startValue);
    const endDate = stringValue(endValue);
    if (startDate && endDate) return datesBetween(startDate, endDate);
    return startDate ? [startDate] : [];
  };

  return {
    campusByName,
    studentByName,
    courseByIdOrName,
    courseMatchesData,
    ensureStudent,
    studentIdsFromNames,
    studentIdsFromAiData,
    normalizeAiDate,
    normalizeAiTime,
    falseyAiValue,
    dateListFromAi
  };
}
