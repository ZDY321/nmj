import type { Lesson, TeacherVault } from "@/shared/types";
import {
  campusName,
  compareByName,
  sortLessons,
  studentNames
} from "@/frontend/lib/helpers";
import {
  type ImportedScheduleLesson,
  type ImportPreviewLesson,
  type ScheduleImportMapping
} from "@/frontend/lib/scheduleImport";
import type { ScheduleImportFileSummary } from "@/frontend/lib/scheduleImportReviewStorage";
import { lessonCampusId } from "@/frontend/lib/scheduleImportReviewLessons";

export function buildLocalOnlyRows(vault: TeacherVault, importedRows: ImportPreviewLesson[], rawLessons: ImportedScheduleLesson[]): ImportPreviewLesson[] {
  if (rawLessons.length === 0) return [];
  const months = new Set(rawLessons.map((lesson) => lesson.date.slice(0, 7)));
  const campusIds = new Set(importedRows.map((row) => row.campusId).filter((campusId): campusId is string => Boolean(campusId)));
  const usedSystemLessonIds = new Set(importedRows.map((row) => row.systemLessonId).filter((lessonId): lessonId is string => Boolean(lessonId)));
  if (months.size === 0 || campusIds.size === 0) return [];

  return vault.lessons
    .filter((lesson) =>
      months.has(lesson.date.slice(0, 7)) &&
      campusIds.has(lessonCampusId(vault, lesson) ?? "") &&
      !usedSystemLessonIds.has(lesson.id)
    )
    .sort(sortLessons)
    .map((lesson): ImportPreviewLesson => {
      const course = vault.courseGroups.find((item) => item.id === lesson.courseGroupId);
      const campusId = lessonCampusId(vault, lesson);
      const systemPresentStudentIds = lesson.status === "cancelled"
        ? []
        : lesson.attendance.length > 0
        ? lesson.attendance
          .filter((entry) => entry.status === "attended" || (Boolean(lesson.linkedOriginalLessonId) && entry.status === "makeup_completed"))
          .map((entry) => entry.studentId)
        : lesson.expectedStudentIds;
      const systemPresentCount = Array.from(new Set(systemPresentStudentIds)).length;
      const systemExpectedCount = lesson.status === "cancelled" ? 0 : Array.from(new Set(lesson.expectedStudentIds)).length;
      return {
        id: `local-only-${lesson.id}`,
        fileName: "云端课表",
        campusName: campusName(vault, campusId),
        campusId,
        date: lesson.date,
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        title: course?.name ?? "未知课程",
        subjectHint: course?.subject ?? "",
        courseTypeHint: lesson.type,
        studentNameHint: studentNames(vault, lesson.expectedStudentIds),
        presentCount: systemPresentCount,
        expectedCount: systemExpectedCount,
        rawText: "",
        warnings: [],
        matchedCourseId: lesson.courseGroupId,
        status: "import_missing",
        systemLessonId: lesson.id,
        systemLessonLabel: `${lesson.date} ${lesson.startTime}-${lesson.endTime} ${course?.name ?? "未知课程"}`,
        systemLessonStatus: lesson.status,
        systemLessonNote: lesson.note,
        systemPresentCount,
        systemExpectedCount,
        systemPresentStudentNames: studentNames(vault, Array.from(new Set(systemPresentStudentIds))),
        systemExpectedStudentNames: studentNames(vault, Array.from(new Set(lesson.expectedStudentIds))),
        issues: ["教务 Excel 没有对应云端课节"]
      };
    });
}

export function summarizeFiles(lessons: ImportedScheduleLesson[]): ScheduleImportFileSummary[] {
  const map = new Map<string, { fileName: string; sourceCampus: string; count: number; months: Set<string> }>();
  lessons.forEach((lesson) => {
    const item = map.get(lesson.fileName) ?? { fileName: lesson.fileName, sourceCampus: lesson.campusName, count: 0, months: new Set<string>() };
    item.count += 1;
    item.months.add(lesson.date.slice(0, 7));
    if (!item.sourceCampus && lesson.campusName) item.sourceCampus = lesson.campusName;
    map.set(lesson.fileName, item);
  });
  return Array.from(map.values())
    .map((item) => ({ ...item, months: Array.from(item.months).sort() }))
    .sort((a, b) => compareByName(a.fileName, b.fileName));
}

export function buildDefaultCampusOverrides(vault: TeacherVault, lessons: ImportedScheduleLesson[], current: ScheduleImportMapping): ScheduleImportMapping {
  const next = { ...current };
  summarizeFiles(lessons).forEach((file) => {
    if (next[file.fileName]) return;
    const campus = findCampusByName(vault, [file.sourceCampus, file.fileName]);
    if (campus) next[file.fileName] = campus.id;
  });
  return next;
}

export function applyCampusOverridesToLessons(
  vault: TeacherVault,
  lessons: ImportedScheduleLesson[],
  fileCampusOverrides: ScheduleImportMapping
): ImportedScheduleLesson[] {
  return lessons.map((lesson) => {
    const campusId = fileCampusOverrides[lesson.fileName];
    const campus = campusId ? vault.campuses.find((item) => item.id === campusId) : undefined;
    return campus ? { ...lesson, campusName: campus.name } : lesson;
  });
}

function findCampusByName(vault: TeacherVault, values: string | string[]) {
  const normalizedValues = (Array.isArray(values) ? values : [values])
    .map(normalizeText)
    .filter(Boolean);
  if (normalizedValues.length === 0) return undefined;
  const campuses = [...vault.campuses].sort((a, b) => normalizeText(b.name).length - normalizeText(a.name).length);
  const matches = campuses.flatMap((campus) => {
    const campusKeywords = campusNameKeywords(campus.name);
    const campusIdKey = normalizeText(campus.id);
    return normalizedValues.flatMap((value, valueIndex) => {
      const nameScore = campusNameMatchScore(campusKeywords, value);
      const idScore = campusIdKey && value === campusIdKey ? 1000 : 0;
      const score = Math.max(nameScore, idScore);
      return score > 0 ? [{ campus, score, valueIndex }] : [];
    });
  });
  return matches.sort((a, b) =>
    b.score - a.score ||
    a.valueIndex - b.valueIndex ||
    normalizeText(b.campus.name).length - normalizeText(a.campus.name).length ||
    compareByName(a.campus.name, b.campus.name)
  )[0]?.campus;
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[【】\[\]{}（）()_\-—–·.,，。:：]/g, "");
}

function campusNameKeywords(campusName: string): string[] {
  const fullName = normalizeText(campusName);
  const shortName = normalizeText(campusName.replace(/(?:校区|分校|校|中心|教学点)$/g, ""));
  const markerPrefix = normalizeText(campusName.match(/^(.+?)(?:校区|分校|校|中心|教学点)/)?.[1] ?? "");
  return Array.from(new Set([fullName, shortName, markerPrefix]))
    .filter((keyword) => keyword.length >= 2);
}

function campusNameMatchScore(campusKeywords: string[], value: string): number {
  if (campusKeywords.length === 0 || !value) return 0;
  const exactKeyword = campusKeywords.find((keyword) => value === keyword);
  if (exactKeyword) return 900 + exactKeyword.length;
  const includedKeyword = campusKeywords.find((keyword) => value.includes(keyword));
  if (includedKeyword) return 700 + includedKeyword.length;
  return 0;
}
