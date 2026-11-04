import type { ProgressChecklistCompletion, ProgressChecklistTemplate, ProgressChecklistTemplateItem } from "@/shared/types";

export type ChecklistCompletionSource = "taught" | "homework";
export type ChecklistHomeworkStatus = "not_started" | "partial" | "completed";

export type ProgressChecklistFocus = {
  courseGroupId?: string;
  templateId?: string;
  lessonId?: string;
  date?: string;
  studentId?: string;
  itemId?: string;
  nonce: number;
};

export type ChecklistLessonDateMarker = {
  studentId: string;
  itemId: string;
  date: string;
  lessonId: string;
};

export type ChecklistDateMarker = {
  studentId: string;
  itemId: string;
  date: string;
  completions: ProgressChecklistCompletion[];
  lessonIds: string[];
};

export type ChecklistLessonDateCandidate = {
  id: string;
  date: string;
  courseGroupId: string;
  status: string;
  studentIds: string[];
};

export function checklistTemplateGrade(template: ProgressChecklistTemplate, gradeOptions: string[] = []): string | undefined {
  const searchable = `${template.name} ${template.note ?? ""}`.toLowerCase();
  return gradeOptions
    .map((grade) => grade.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .find((grade) => searchable.includes(grade.toLowerCase()));
}

export function checklistTemplateMatchesContext(
  template: ProgressChecklistTemplate,
  context: { subject?: string; grades?: string[]; gradeOptions?: string[] }
): boolean {
  const subject = context.subject?.trim().toLowerCase();
  const templateSubject = template.subject?.trim().toLowerCase();
  if (subject && templateSubject && subject !== templateSubject) return false;

  const grades = new Set((context.grades ?? []).map((grade) => grade.trim().toLowerCase()).filter(Boolean));
  const templateGrade = checklistTemplateGrade(template, context.gradeOptions)?.toLowerCase();
  return grades.size === 0 || !templateGrade || grades.has(templateGrade);
}

export function checklistCellKey(studentId: string, itemId: string): string {
  return `${studentId}::${itemId}`;
}

export function buildChecklistDateMarkers(
  completions: ProgressChecklistCompletion[],
  lessonMarkers: ChecklistLessonDateMarker[]
): Map<string, ChecklistDateMarker[]> {
  const groups = new Map<string, ChecklistDateMarker>();
  completions.forEach((completion) => {
    const key = checklistCellKey(completion.studentId, completion.itemId);
    const groupKey = `${key}::${completion.completedDate}`;
    const group = groups.get(groupKey) ?? {
      studentId: completion.studentId,
      itemId: completion.itemId,
      date: completion.completedDate,
      completions: [],
      lessonIds: []
    };
    group.completions.push(completion);
    if (completion.lessonId && !group.lessonIds.includes(completion.lessonId)) group.lessonIds.push(completion.lessonId);
    groups.set(groupKey, group);
  });
  lessonMarkers.forEach((marker) => {
    const key = checklistCellKey(marker.studentId, marker.itemId);
    const groupKey = `${key}::${marker.date}`;
    const group = groups.get(groupKey) ?? {
      studentId: marker.studentId,
      itemId: marker.itemId,
      date: marker.date,
      completions: [],
      lessonIds: []
    };
    if (!group.lessonIds.includes(marker.lessonId)) group.lessonIds.push(marker.lessonId);
    groups.set(groupKey, group);
  });

  const result = new Map<string, ChecklistDateMarker[]>();
  groups.forEach((marker) => {
    marker.completions.sort((a, b) => `${a.updatedAt} ${a.id}`.localeCompare(`${b.updatedAt} ${b.id}`));
    marker.lessonIds.sort((a, b) => a.localeCompare(b));
    const key = checklistCellKey(marker.studentId, marker.itemId);
    result.set(key, [...(result.get(key) ?? []), marker]);
  });
  result.forEach((markers) => markers.sort((a, b) => a.date.localeCompare(b.date)));
  return result;
}

export function checklistCompletionDateChanged(existingDate: string | undefined, nextDate: string): boolean {
  return existingDate !== undefined && existingDate !== nextDate;
}

export function checklistLessonIdsForDateMarker(
  marker: Pick<ChecklistDateMarker, "date" | "lessonIds">,
  candidates: ChecklistLessonDateCandidate[],
  courseGroupId: string,
  studentId: string
): string[] {
  const sameDayCandidates = candidates.filter((lesson) =>
    lesson.courseGroupId === courseGroupId &&
    lesson.date === marker.date &&
    lesson.status !== "cancelled" &&
    lesson.studentIds.includes(studentId)
  );
  const linkedSameDayCandidates = sameDayCandidates.filter((lesson) => marker.lessonIds.includes(lesson.id));
  if (linkedSameDayCandidates.length > 0) return linkedSameDayCandidates.map((lesson) => lesson.id);
  return sameDayCandidates.length === 1 ? [sameDayCandidates[0].id] : [];
}

export function checklistCompletionSource(completion: Pick<ProgressChecklistCompletion, "source" | "note">): ChecklistCompletionSource | undefined {
  if (completion.source === "taught" || completion.source === "homework") return completion.source;
  const note = completion.note ?? "";
  if (note.includes("课堂关联") || note.includes("课堂完成") || note.includes("本节课堂")) return "taught";
  if (note.includes("作业关联") || note.includes("作业完成") || note.includes("本节作业")) return "homework";
  return undefined;
}

export function checklistCompletionAppliesToSource(
  completion: Pick<ProgressChecklistCompletion, "source" | "note">,
  source: ChecklistCompletionSource
): boolean {
  const resolvedSource = checklistCompletionSource(completion);
  return !resolvedSource || resolvedSource === source;
}

export function checklistCompletionHomeworkStatus(
  completion: Pick<ProgressChecklistCompletion, "source" | "note" | "homeworkStatus" | "homeworkProgress">
): ChecklistHomeworkStatus | undefined {
  if (checklistCompletionSource(completion) !== "homework") return undefined;
  if (completion.homeworkStatus) return completion.homeworkStatus;
  if (completion.homeworkProgress === undefined || completion.homeworkProgress >= 100) return "completed";
  return completion.homeworkProgress <= 0 ? "not_started" : "partial";
}

export function checklistCompletionIsComplete(
  completion: Pick<ProgressChecklistCompletion, "source" | "note" | "homeworkStatus" | "homeworkProgress">
): boolean {
  const status = checklistCompletionHomeworkStatus(completion);
  return status !== "not_started" && status !== "partial";
}

const CHINESE_NUMBER_VALUES: Record<string, number> = {
  "零": 0,
  "〇": 0,
  "一": 1,
  "二": 2,
  "两": 2,
  "三": 3,
  "四": 4,
  "五": 5,
  "六": 6,
  "七": 7,
  "八": 8,
  "九": 9
};

const CHINESE_NUMBER_UNITS: Record<string, number> = {
  "十": 10,
  "百": 100,
  "千": 1000
};

export function checklistChapterIndex(chapter?: string): string | undefined {
  const normalized = chapter?.trim();
  if (!normalized) return undefined;

  const explicitIndex = normalized.match(/(\d+(?:\.\d+)+)/)?.[1];
  if (explicitIndex) return explicitIndex;

  const matches = Array.from(normalized.matchAll(/第\s*([一二三四五六七八九十百千零〇两\d]+)\s*(章|节|单元|课|讲)/g));
  if (matches.length === 0) return undefined;

  const parts = matches
    .map((match) => parseOrdinalNumber(match[1]))
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0)
    .map((value) => String(value));

  return parts.length > 0 ? parts.join(".") : undefined;
}

export function stripChecklistTitlePrefix(chapter: string | undefined, title: string): string {
  const normalizedTitle = title.trim();
  const chapterIndex = checklistChapterIndex(chapter);
  if (!chapterIndex || !normalizedTitle) return normalizedTitle;

  const escapedIndex = escapeRegExp(chapterIndex);
  const stripped = normalizedTitle.replace(
    new RegExp(`^${escapedIndex}(?:\\.\\d+)*(?!\\d)(?:\\s*[.．、:：-]\\s*|\\s+)?`),
    ""
  ).trim();

  return stripped || normalizedTitle;
}

export function formatChecklistItemTitle(
  item: Pick<ProgressChecklistTemplateItem, "id" | "chapter" | "title">,
  orderedItems?: Array<Pick<ProgressChecklistTemplateItem, "id" | "chapter" | "title" | "order">>
): string {
  const normalizedTitle = stripChecklistTitlePrefix(item.chapter, item.title);
  const chapterIndex = checklistDisplayIndex(item, orderedItems);
  return chapterIndex ? `${chapterIndex} ${normalizedTitle}` : normalizedTitle;
}

export function formatChecklistItemLine(
  item: Pick<ProgressChecklistTemplateItem, "id" | "chapter" | "title">,
  orderedItems?: Array<Pick<ProgressChecklistTemplateItem, "id" | "chapter" | "title" | "order">>
): string {
  const title = formatChecklistItemTitle(item, orderedItems);
  return item.chapter ? `${item.chapter}｜${title}` : title;
}

export function checklistDisplayIndex(
  item: Pick<ProgressChecklistTemplateItem, "id" | "chapter" | "title">,
  orderedItems?: Array<Pick<ProgressChecklistTemplateItem, "id" | "chapter" | "title" | "order">>
): string | undefined {
  const chapterIndex = checklistChapterIndex(item.chapter);
  if (!chapterIndex) return undefined;
  if (chapterIndex.includes(".")) return chapterIndex;
  if (!orderedItems || !item.chapter?.trim()) return chapterIndex;

  const chapterKey = item.chapter.trim();
  const chapterItems = orderedItems.filter((candidate) => candidate.chapter?.trim() === chapterKey);
  const position = chapterItems.findIndex((candidate) => candidate.id === item.id);
  if (position < 0) return chapterIndex;
  return `${chapterIndex}.${position + 1}`;
}

function parseOrdinalNumber(token: string): number | null {
  const normalized = token.trim();
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) return Number(normalized);

  let result = 0;
  let current = 0;
  for (const char of normalized) {
    if (char in CHINESE_NUMBER_VALUES) {
      current = CHINESE_NUMBER_VALUES[char];
      continue;
    }
    if (char in CHINESE_NUMBER_UNITS) {
      const unit = CHINESE_NUMBER_UNITS[char];
      result += (current || 1) * unit;
      current = 0;
      continue;
    }
    return null;
  }
  return result + current;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
