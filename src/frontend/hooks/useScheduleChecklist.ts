import type { LessonChecklistPerStudentStatus, LessonChecklistStudentItemStatus } from "@/frontend/components/LessonChecklistLinker";
import { todayIso } from "@/frontend/lib/calculations";
import { makeId } from "@/frontend/lib/crypto";
import {
  compareByName,
  findStudent,
  lessonStudentIds
} from "@/frontend/lib/helpers";
import { checklistCompletionAppliesToSource, formatChecklistItemLine } from "@/frontend/lib/progressChecklist";
import type { Lesson, ProgressChecklistCompletion, ProgressChecklistTemplate, StudentProgressRecord, TeacherVault } from "@/shared/types";
import { useEffect, useState } from "react";

type LessonChecklistSource = "taught" | "homework";
type LessonChecklistSyncSource = "homework";

type LessonChecklistSyncCandidate = {
  studentId: string;
  itemId: string;
  progressRecordId?: string;
};

type LessonChecklistSyncSummary = {
  templateName: string;
  studentCount: number;
  homeworkLinkedItemCount: number;
  homeworkPendingCount: number;
  homeworkCompletedCount: number;
};

type LessonChecklistSyncResult = {
  studentId: string;
  studentName: string;
  homeworkSyncedCount: number;
};

function checklistCellKey(studentId: string, itemId: string): string {
  return `${studentId}::${itemId}`;
}

function linkedChecklistItemIds(
  lesson: Lesson,
  template: ProgressChecklistTemplate,
  source: LessonChecklistSource
): string[] {
  const validItemIds = new Set(template.items.map((item) => item.id));
  const rawItemIds = source === "taught" ? lesson.content.taughtChecklistItemIds ?? [] : lesson.content.homeworkChecklistItemIds ?? [];
  return Array.from(new Set(rawItemIds)).filter((itemId) => validItemIds.has(itemId));
}

function buildLessonChecklistSyncCandidates({
  lesson,
  template,
  studentIds,
  completions,
  progressRecords,
  source,
  progressRecordLessonId = lesson.id
}: {
  lesson: Lesson;
  template: ProgressChecklistTemplate;
  studentIds: string[];
  completions: ProgressChecklistCompletion[];
  progressRecords: StudentProgressRecord[];
  source: LessonChecklistSource;
  progressRecordLessonId?: string;
}): LessonChecklistSyncCandidate[] {
  const itemIds = linkedChecklistItemIds(lesson, template, source);
  if (itemIds.length === 0 || studentIds.length === 0) return [];

  const existingKeys = new Set(
    completions
      .filter((completion) =>
        completion.templateId === template.id &&
        completion.courseGroupId === lesson.courseGroupId &&
        completion.lessonId === lesson.id &&
        checklistCompletionAppliesToSource(completion, source)
      )
      .map((completion) => checklistCellKey(completion.studentId, completion.itemId))
  );
  const progressRecordByStudentId = new Map<string, StudentProgressRecord>();
  progressRecords
    .filter((record) => record.courseGroupId === lesson.courseGroupId && record.lessonId === progressRecordLessonId)
    .sort((a, b) => `${a.date} ${a.updatedAt}`.localeCompare(`${b.date} ${b.updatedAt}`))
    .forEach((record) => progressRecordByStudentId.set(record.studentId, record));

  return studentIds.flatMap((studentId) =>
    itemIds
      .filter((itemId) => !existingKeys.has(checklistCellKey(studentId, itemId)))
      .map((itemId) => ({
        studentId,
        itemId,
        progressRecordId: progressRecordByStudentId.get(studentId)?.id
      }))
  );
}

function buildLessonChecklistSyncSummary({
  lesson,
  template,
  studentCount,
  homeworkPendingCount
}: {
  lesson: Lesson;
  template: ProgressChecklistTemplate;
  studentCount: number;
  homeworkPendingCount: number;
}): LessonChecklistSyncSummary {
  const homeworkLinkedItemCount = linkedChecklistItemIds(lesson, template, "homework").length;
  const homeworkTotal = homeworkLinkedItemCount * studentCount;
  return {
    templateName: template.name,
    studentCount,
    homeworkLinkedItemCount,
    homeworkPendingCount,
    homeworkCompletedCount: Math.max(homeworkTotal - homeworkPendingCount, 0)
  };
}

interface ScheduleChecklistOptions {
  vault: TeacherVault;
  selected: Lesson | undefined;
  selectedPreviousLesson: Lesson | undefined;
  onSaveChecklistCompletions: (completions: ProgressChecklistCompletion[]) => void;
  onUpdateChecklistCompletions: (completions: ProgressChecklistCompletion[], deleteIds: string[]) => void;
}

export function useScheduleChecklist({ vault, selected, selectedPreviousLesson, onSaveChecklistCompletions, onUpdateChecklistCompletions }: ScheduleChecklistOptions) {
  const [checklistSyncMessage, setChecklistSyncMessage] = useState("");
  const [checklistSyncResult, setChecklistSyncResult] = useState<LessonChecklistSyncResult[]>([]);
  const [checklistLastSyncSource, setChecklistLastSyncSource] = useState<LessonChecklistSyncSource | null>(null);
  const selectedChecklistStudentIds = selected
    ? lessonStudentIds(selected).filter((studentId) => findStudent(vault, studentId)?.status === "active")
    : [];
  const selectedPreviousChecklistTemplate = selectedPreviousLesson?.content.checklistTemplateId
    ? (vault.progressChecklistTemplates ?? []).find((template) => template.id === selectedPreviousLesson.content.checklistTemplateId)
    : undefined;
  const selectedPreviousHomeworkChecklistSyncCandidates = selected && selectedPreviousLesson && selectedPreviousChecklistTemplate
    ? buildLessonChecklistSyncCandidates({
        lesson: selectedPreviousLesson,
        template: selectedPreviousChecklistTemplate,
        studentIds: selectedChecklistStudentIds,
        completions: vault.progressChecklistCompletions ?? [],
        progressRecords: vault.studentProgressRecords ?? [],
        source: "homework",
        progressRecordLessonId: selected.id
      })
    : [];
  const selectedChecklistSyncSummary = selected && selectedPreviousLesson && selectedPreviousChecklistTemplate
    ? buildLessonChecklistSyncSummary({
        lesson: selectedPreviousLesson,
        template: selectedPreviousChecklistTemplate,
        studentCount: selectedChecklistStudentIds.length,
        homeworkPendingCount: selectedPreviousHomeworkChecklistSyncCandidates.length
      })
    : undefined;

  const selectedChecklistPerStudentStatus: LessonChecklistPerStudentStatus[] = (() => {
    if (!selected || !selectedPreviousLesson || !selectedPreviousChecklistTemplate) return [];
    const completions = vault.progressChecklistCompletions ?? [];
    const homeworkItemIds = Array.from(new Set(selectedPreviousLesson.content.homeworkChecklistItemIds ?? []));
    const homeworkItemsForStudent = (studentId: string): LessonChecklistStudentItemStatus[] => homeworkItemIds
      .map((itemId) => {
        const item = selectedPreviousChecklistTemplate.items.find((candidate) => candidate.id === itemId);
        if (!item) return undefined;
        const completed = completions.some((completion) =>
          completion.templateId === selectedPreviousChecklistTemplate.id &&
          completion.courseGroupId === selectedPreviousLesson.courseGroupId &&
          completion.lessonId === selectedPreviousLesson.id &&
          completion.studentId === studentId &&
          completion.itemId === itemId &&
          checklistCompletionAppliesToSource(completion, "homework")
        );
        return { itemId, label: formatChecklistItemLine(item, selectedPreviousChecklistTemplate.items), completed };
      })
      .filter((item): item is LessonChecklistStudentItemStatus => Boolean(item));
    return selectedChecklistStudentIds
      .map((studentId) => {
        const homeworkItems = homeworkItemsForStudent(studentId);
        return {
          studentId,
          studentName: findStudent(vault, studentId)?.name ?? "未知学生",
          homeworkItems,
          homeworkPendingCount: homeworkItems.filter((item) => !item.completed).length
        };
      })
      .sort((a, b) => compareByName(a.studentName, b.studentName) || a.studentId.localeCompare(b.studentId));
  })();

  useEffect(() => {
    setChecklistSyncMessage("");
    setChecklistSyncResult([]);
    setChecklistLastSyncSource(null);
  }, [selected?.id]);

  function syncSelectedLessonChecklist() {
    if (!selected || !selectedPreviousLesson || !selectedPreviousChecklistTemplate) return;
    const candidates = selectedPreviousHomeworkChecklistSyncCandidates;
    setChecklistLastSyncSource("homework");
    if (candidates.length === 0) {
      setChecklistSyncResult([]);
      setChecklistSyncMessage("上节作业已全部检查完成。");
      return;
    }

    const countsByStudent = new Map<string, number>();
    for (const candidate of candidates) {
      countsByStudent.set(candidate.studentId, (countsByStudent.get(candidate.studentId) ?? 0) + 1);
    }
    setChecklistSyncResult(
      Array.from(countsByStudent.entries())
        .map(([studentId, count]) => ({
          studentId,
          studentName: findStudent(vault, studentId)?.name ?? "未知学生",
          homeworkSyncedCount: count
        }))
        .sort((a, b) => compareByName(a.studentName, b.studentName) || a.studentId.localeCompare(b.studentId))
    );

    const now = new Date().toISOString();
    onSaveChecklistCompletions(candidates.map((candidate) => ({
      id: makeId("progress_completion"),
      templateId: selectedPreviousChecklistTemplate.id,
      itemId: candidate.itemId,
      studentId: candidate.studentId,
      courseGroupId: selectedPreviousLesson.courseGroupId,
      source: "homework",
      completedDate: selected.date || todayIso(),
      lessonId: selectedPreviousLesson.id,
      progressRecordId: candidate.progressRecordId,
      note: `本节检查上节课后作业：${selected.date} ${selected.startTime}-${selected.endTime}`,
      updatedAt: now
    })));
    setChecklistSyncMessage(`已检查 ${candidates.length} 个上节作业条目。`);
  }

  function toggleSelectedLessonChecklistCompletion(
    studentId: string,
    itemId: string,
    completed: boolean
  ) {
    if (!selected || !selectedPreviousLesson || !selectedPreviousChecklistTemplate) return;
    const completions = (vault.progressChecklistCompletions ?? []).filter((completion) =>
      completion.templateId === selectedPreviousChecklistTemplate.id &&
      completion.courseGroupId === selectedPreviousLesson.courseGroupId &&
      completion.lessonId === selectedPreviousLesson.id &&
      completion.studentId === studentId &&
      completion.itemId === itemId &&
      checklistCompletionAppliesToSource(completion, "homework")
    );
    const now = new Date().toISOString();

    if (completed) {
      if (completions.length > 0) return;
      const candidate = selectedPreviousHomeworkChecklistSyncCandidates.find((entry) => entry.studentId === studentId && entry.itemId === itemId);
      onUpdateChecklistCompletions([{
        id: makeId("progress_completion"),
        templateId: selectedPreviousChecklistTemplate.id,
        itemId,
        studentId,
        courseGroupId: selectedPreviousLesson.courseGroupId,
        source: "homework",
        completedDate: selected.date || todayIso(),
        lessonId: selectedPreviousLesson.id,
        progressRecordId: candidate?.progressRecordId,
        note: `本节检查上节课后作业：${selected.date} ${selected.startTime}-${selected.endTime}`,
        updatedAt: now
      }], []);
      setChecklistLastSyncSource("homework");
      setChecklistSyncMessage("已标记上节作业完成。");
      return;
    }

    onUpdateChecklistCompletions([], completions.map((completion) => completion.id));
    setChecklistLastSyncSource("homework");
    setChecklistSyncMessage("已撤销上节作业的完成标记。");
  }

  return {
    checklistSyncMessage,
    checklistSyncResult,
    checklistLastSyncSource,
    selectedChecklistSyncSummary,
    selectedChecklistPerStudentStatus,
    syncSelectedLessonChecklist,
    toggleSelectedLessonChecklistCompletion
  };
}
