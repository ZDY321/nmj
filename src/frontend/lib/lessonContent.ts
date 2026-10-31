import { formatChecklistItemLine } from "@/frontend/lib/progressChecklist";
import type { LessonContent, ProgressChecklistTemplate } from "@/shared/types";

export type LessonContentChecklistField = "taught" | "homework";

type LessonContentNotesField = "taughtNotes" | "homeworkNotes";

function notesFieldFor(field: LessonContentChecklistField): LessonContentNotesField {
  return field === "taught" ? "taughtNotes" : "homeworkNotes";
}

function checklistIdsFor(content: LessonContent, field: LessonContentChecklistField): string[] {
  return field === "taught" ? content.taughtChecklistItemIds ?? [] : content.homeworkChecklistItemIds ?? [];
}

function checklistSectionHeading(field: LessonContentChecklistField): string {
  return field === "taught" ? "【关联学习清单·本节课内容】" : "【关联学习清单·课后作业】";
}

export function feedbackLessonFieldText(value: string, field: LessonContentChecklistField): string {
  const heading = checklistSectionHeading(field);
  const headingStart = value.indexOf(heading);
  if (headingStart < 0) return value;
  const headingEnd = headingStart + heading.length;
  const sectionStart = value[headingEnd] === "\n" ? headingEnd + 1 : headingEnd;
  return value.slice(0, headingStart) + value.slice(sectionStart);
}

export function restoreFeedbackLessonFieldHeading(
  value: string,
  previousValue: string,
  field: LessonContentChecklistField
): string {
  const heading = checklistSectionHeading(field);
  const headingIndex = previousValue.indexOf(heading);
  if (headingIndex < 0) return value;

  const previousDisplay = feedbackLessonFieldText(previousValue, field);
  let prefix = 0;
  while (prefix < previousDisplay.length && prefix < value.length && previousDisplay[prefix] === value[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < previousDisplay.length - prefix &&
    suffix < value.length - prefix &&
    previousDisplay[previousDisplay.length - suffix - 1] === value[value.length - suffix - 1]
  ) suffix += 1;

  const displayHeadingIndex = headingIndex;
  const oldSuffixStart = previousDisplay.length - suffix;
  const mappedHeadingIndex = displayHeadingIndex <= prefix
    ? displayHeadingIndex
    : displayHeadingIndex >= oldSuffixStart
      ? displayHeadingIndex + value.length - previousDisplay.length
      : prefix + (value.length - prefix - suffix);
  return `${value.slice(0, mappedHeadingIndex)}${heading}\n${value.slice(mappedHeadingIndex)}`;
}

export function feedbackLessonFieldStoredIndex(value: string, field: LessonContentChecklistField, index: number): number {
  const heading = checklistSectionHeading(field);
  const headingIndex = value.indexOf(heading);
  if (headingIndex < 0) return index;
  const hiddenLength = heading.length + (value[headingIndex + heading.length] === "\n" ? 1 : 0);
  return index >= headingIndex ? index + hiddenLength : index;
}

export function feedbackLessonFieldDisplayIndex(value: string, field: LessonContentChecklistField, index: number): number {
  const heading = checklistSectionHeading(field);
  const headingIndex = value.indexOf(heading);
  if (headingIndex < 0 || index <= headingIndex) return index;
  const hiddenEnd = headingIndex + heading.length + (value[headingIndex + heading.length] === "\n" ? 1 : 0);
  if (index < hiddenEnd) return headingIndex;
  return index - (hiddenEnd - headingIndex);
}

export function lessonContentFieldNotes(content: LessonContent, field: LessonContentChecklistField): string {
  const savedNotes = content[notesFieldFor(field)];
  if (typeof savedNotes === "string") return savedNotes;
  return stripLessonChecklistSection(content[field], field);
}

export function stripLessonChecklistSection(value: string, field: LessonContentChecklistField): string {
  const sectionStart = value.indexOf(checklistSectionHeading(field));
  return sectionStart < 0 ? value : value.slice(0, sectionStart).trimEnd();
}

export function linkedChecklistItems(
  content: LessonContent,
  templates: ProgressChecklistTemplate[],
  field: LessonContentChecklistField
) {
  const template = templates.find((candidate) => candidate.id === content.checklistTemplateId);
  if (!template) return [];
  const selectedIds = new Set(checklistIdsFor(content, field));
  return template.items
    .filter((item) => selectedIds.has(item.id))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function composeLessonContentField(
  content: LessonContent,
  templates: ProgressChecklistTemplate[],
  field: LessonContentChecklistField,
  notes = lessonContentFieldNotes(content, field)
): string {
  const cleanNotes = stripLessonChecklistSection(notes, field);
  const template = templates.find((candidate) => candidate.id === content.checklistTemplateId);
  const items = linkedChecklistItems(content, templates, field);
  if (items.length === 0) return cleanNotes;
  const linkedLines = items.map((item) => `- ${formatChecklistItemLine(item, template?.items)}`);
  const linkedSection = [checklistSectionHeading(field), ...linkedLines].join("\n");
  return [cleanNotes.trimEnd(), linkedSection].filter(Boolean).join("\n\n");
}

export function syncLessonChecklistContent(
  content: LessonContent,
  templates: ProgressChecklistTemplate[]
): LessonContent {
  const taughtNotes = lessonContentFieldNotes(content, "taught");
  const homeworkNotes = lessonContentFieldNotes(content, "homework");
  return {
    ...content,
    taughtNotes,
    taught: composeLessonContentField(content, templates, "taught", taughtNotes),
    homeworkNotes,
    homework: composeLessonContentField(content, templates, "homework", homeworkNotes)
  };
}

export function updateLessonContentField(
  content: LessonContent,
  templates: ProgressChecklistTemplate[],
  field: LessonContentChecklistField,
  notes: string
): LessonContent {
  const nextContent = { ...content, [notesFieldFor(field)]: notes };
  return {
    ...nextContent,
    [field]: composeLessonContentField(nextContent, templates, field, notes)
  };
}

export function updateLessonContentFromFeedback(
  content: LessonContent,
  templates: ProgressChecklistTemplate[],
  patch: Pick<LessonContent, "taught" | "homework">
): LessonContent {
  return syncLessonChecklistContent({
    ...content,
    taughtNotes: stripLessonChecklistSection(patch.taught, "taught"),
    homeworkNotes: stripLessonChecklistSection(patch.homework, "homework")
  }, templates);
}

export function removeLessonChecklistItem(
  content: LessonContent,
  templates: ProgressChecklistTemplate[],
  field: LessonContentChecklistField,
  itemId: string
): LessonContent {
  const ids = checklistIdsFor(content, field).filter((id) => id !== itemId);
  const nextContent = field === "taught"
    ? { ...content, taughtChecklistItemIds: ids }
    : { ...content, homeworkChecklistItemIds: ids };
  return syncLessonChecklistContent(nextContent, templates);
}
