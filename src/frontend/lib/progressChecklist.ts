import type { ProgressChecklistTemplateItem } from "@/shared/types";

export type ProgressChecklistFocus = {
  courseGroupId?: string;
  templateId?: string;
  lessonId?: string;
  date?: string;
  studentId?: string;
  itemId?: string;
  nonce: number;
};

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
