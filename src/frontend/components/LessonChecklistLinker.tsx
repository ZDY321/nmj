import { useEffect, useMemo, useState } from "react";
import { BookCheck, BookOpen, Check, CheckCheck, ChevronDown, Circle, ExternalLink, NotebookPen, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { compareByName, findStudent, lessonStudentIds, lessonTimeRangeLabel } from "@/frontend/lib/helpers";
import { checklistCompletionAppliesToSource, formatChecklistItemLine, formatChecklistItemTitle } from "@/frontend/lib/progressChecklist";
import { linkedChecklistItems, removeLessonChecklistItem, syncLessonChecklistContent, type LessonContentChecklistField } from "@/frontend/lib/lessonContent";
import type { Lesson, LessonContent, ProgressChecklistTemplate, ProgressChecklistTemplateItem, TeacherVault } from "@/shared/types";

type ChecklistField = "taught" | "homework";

type LessonChecklistSyncSummary = {
  templateName: string;
  studentCount: number;
  taughtLinkedItemCount: number;
  homeworkLinkedItemCount: number;
  taughtPendingCount: number;
  homeworkPendingCount: number;
  taughtCompletedCount: number;
  homeworkCompletedCount: number;
};

type LessonChecklistSyncResult = {
  studentId: string;
  studentName: string;
  taughtSyncedCount: number;
  homeworkSyncedCount: number;
};

type PreviousLessonChecklistItemProgress = {
  item: ProgressChecklistTemplateItem;
  completedCount: number;
  totalStudentCount: number;
};

type PreviousLessonChecklistProgress = {
  lesson: Lesson;
  template: ProgressChecklistTemplate;
  studentCount: number;
  totalCompletedCount: number;
  totalPossibleCount: number;
  taughtItems: PreviousLessonChecklistItemProgress[];
  homeworkItems: PreviousLessonChecklistItemProgress[];
  nextPendingItems: ProgressChecklistTemplateItem[];
};

export type LessonChecklistStudentItemStatus = {
  itemId: string;
  label: string;
  completed: boolean;
};

export type LessonChecklistPerStudentStatus = {
  studentId: string;
  studentName: string;
  taughtItems: LessonChecklistStudentItemStatus[];
  homeworkItems: LessonChecklistStudentItemStatus[];
  taughtPendingCount: number;
  homeworkPendingCount: number;
};

export function LessonChecklistLinker({
  vault,
  lesson,
  previousLesson,
  content,
  subjectHint,
  onChange,
  onOpenChecklist,
  onSyncChecklist,
  syncMessage,
  syncSummary,
  perStudentStatus,
  onToggleCompletion,
  syncResult,
  lastSyncSource
}: {
  vault: TeacherVault;
  lesson?: Lesson;
  previousLesson?: Lesson;
  content: LessonContent;
  subjectHint?: string;
  onChange: (content: LessonContent) => void;
  onOpenChecklist?: () => void;
  onSyncChecklist?: (source: ChecklistField) => void;
  syncMessage?: string;
  syncSummary?: LessonChecklistSyncSummary;
  perStudentStatus?: LessonChecklistPerStudentStatus[];
  onToggleCompletion?: (studentId: string, itemId: string, source: ChecklistField, completed: boolean) => void;
  syncResult?: LessonChecklistSyncResult[];
  lastSyncSource?: ChecklistField | null;
}) {
  const [itemSearch, setItemSearch] = useState("");
  const [studentDetailExpanded, setStudentDetailExpanded] = useState(false);
  const templates = useMemo(
    () =>
      [...(vault.progressChecklistTemplates ?? [])].sort(
        (a, b) =>
          compareByName(a.subject || "", b.subject || "") ||
          compareByName(a.name, b.name) ||
          a.id.localeCompare(b.id)
      ),
    [vault.progressChecklistTemplates]
  );
  const selectedTemplate = templates.find((template) => template.id === content.checklistTemplateId);
  const selectedSubject = subjectHint?.trim() ?? "";
  const taughtItemIds = content.taughtChecklistItemIds ?? [];
  const homeworkItemIds = content.homeworkChecklistItemIds ?? [];
  const visibleItems = useMemo(() => {
    const normalizedSearch = itemSearch.trim().toLowerCase();
    return (selectedTemplate?.items ?? [])
      .slice()
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .filter((item) => {
        if (!normalizedSearch) return true;
        const searchable = `${item.chapter ?? ""} ${item.title}`.toLowerCase();
        return normalizedSearch.split(/\s+/).filter(Boolean).every((term) => searchable.includes(term));
      });
  }, [itemSearch, selectedTemplate]);

  useEffect(() => {
    if (!content.checklistTemplateId) return;
    if (templates.some((template) => template.id === content.checklistTemplateId)) return;
    onChange(syncLessonChecklistContent({
      ...content,
      checklistTemplateId: undefined,
      taughtChecklistItemIds: [],
      homeworkChecklistItemIds: []
    }, templates));
  }, [content, onChange, templates]);

  function updateTemplate(templateId: string) {
    const nextTemplate = templates.find((template) => template.id === templateId);
    const validItemIds = new Set(nextTemplate?.items.map((item) => item.id) ?? []);
    onChange(syncLessonChecklistContent({
      ...content,
      checklistTemplateId: templateId || undefined,
      taughtChecklistItemIds: taughtItemIds.filter((itemId) => validItemIds.has(itemId)),
      homeworkChecklistItemIds: homeworkItemIds.filter((itemId) => validItemIds.has(itemId))
    }, templates));
    setItemSearch("");
  }

  function toggleChecklistItem(field: ChecklistField, itemId: string) {
    const currentIds = field === "taught" ? taughtItemIds : homeworkItemIds;
    const nextIds = currentIds.includes(itemId)
      ? currentIds.filter((currentId) => currentId !== itemId)
      : [...currentIds, itemId];
    onChange(syncLessonChecklistContent({
      ...content,
      [field === "taught" ? "taughtChecklistItemIds" : "homeworkChecklistItemIds"]: nextIds
    }, templates));
  }

  const taughtItems = resolveSelectedItems(selectedTemplate, taughtItemIds);
  const homeworkItems = resolveSelectedItems(selectedTemplate, homeworkItemIds);
  const previousLinkedItemIds = useMemo(() => {
    if (!selectedTemplate || previousLesson?.content.checklistTemplateId !== selectedTemplate.id) {
      return { taught: new Set<string>(), homework: new Set<string>() };
    }
    const validItemIds = new Set(selectedTemplate.items.map((item) => item.id));
    return {
      taught: new Set(uniqueIds(previousLesson.content.taughtChecklistItemIds ?? []).filter((itemId) => validItemIds.has(itemId))),
      homework: new Set(uniqueIds(previousLesson.content.homeworkChecklistItemIds ?? []).filter((itemId) => validItemIds.has(itemId)))
    };
  }, [previousLesson, selectedTemplate]);
  const previousChecklistProgress = useMemo(
    () => buildPreviousLessonChecklistProgress(vault, lesson, previousLesson),
    [vault, lesson, previousLesson]
  );

  return (
    <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-extrabold text-[#25324a]">
            <BookCheck size={16} className="text-[#1557c2]" /> 关联学习清单
          </div>
          <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
            关联条目会显示在对应的课程内容或作业区域。
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {onOpenChecklist && (
            <Button type="button" variant="outline" size="sm" onClick={onOpenChecklist}>
              <ExternalLink size={14} /> 打开学习清单
            </Button>
          )}
          <Badge variant="sky">{taughtItems.length} 项关联到本节内容</Badge>
          <Badge variant="amber">{homeworkItems.length} 项关联到课后作业</Badge>
        </div>
      </div>

      {syncSummary && onSyncChecklist && (
        <div className="mt-4 rounded-[12px] border border-[#dbeafe] bg-white p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 text-sm font-semibold leading-6 text-[#475569]">
              <div className="font-extrabold text-[#25324a]">本节完成到学生清单</div>
              <div>
                {syncSummary.templateName} · {syncSummary.studentCount} 名在读学生 · 课堂 {syncSummary.taughtCompletedCount}/{syncSummary.taughtCompletedCount + syncSummary.taughtPendingCount} · 作业 {syncSummary.homeworkCompletedCount}/{syncSummary.homeworkCompletedCount + syncSummary.homeworkPendingCount}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onSyncChecklist("taught")} disabled={syncSummary.taughtLinkedItemCount === 0 || syncSummary.taughtPendingCount === 0}>
                <CheckCheck size={14} /> 完成课堂 {syncSummary.taughtPendingCount || ""}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => onSyncChecklist("homework")} disabled={syncSummary.homeworkLinkedItemCount === 0 || syncSummary.homeworkPendingCount === 0}>
                <CheckCheck size={14} /> 完成作业 {syncSummary.homeworkPendingCount || ""}
              </Button>
            </div>
          </div>
          {syncMessage && <Badge variant={syncMessage.includes("已完成") || syncMessage.includes("全部") ? "sage" : "secondary"} className="mt-3">{syncMessage}</Badge>}

          {perStudentStatus && perStudentStatus.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-[10px] border border-[#e8eef6] bg-[#f8fbff] px-3 py-2 text-left text-xs font-bold text-[#475569] transition-colors hover:bg-[#eef5ff]"
                onClick={() => setStudentDetailExpanded((v) => !v)}
              >
                <span>学生完成明细 · {perStudentStatus.length} 人{lastSyncSource ? ` · 最近完成${lastSyncSource === "taught" ? "课堂" : "作业"}` : ""}</span>
                <ChevronDown size={14} className={`text-[#64748b] transition-transform ${studentDetailExpanded ? "rotate-180" : ""}`} />
              </button>
              {studentDetailExpanded && (
                <div className="mt-2 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                  {perStudentStatus.map((student) => {
                    const resultEntry = syncResult?.find((r) => r.studentId === student.studentId);
                    const focusedPendingCount = lastSyncSource === "taught"
                      ? student.taughtPendingCount
                      : lastSyncSource === "homework"
                        ? student.homeworkPendingCount
                        : student.taughtPendingCount + student.homeworkPendingCount;
                    const showTaught = !lastSyncSource || lastSyncSource === "taught";
                    const showHomework = !lastSyncSource || lastSyncSource === "homework";
                    return (
                      <div
                        key={student.studentId}
                        className="rounded-[8px] border border-[#e8eef6] bg-white p-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-[#25324a]">{student.studentName}</span>
                          <span className="font-semibold text-[#64748b]">
                            {showTaught && `课堂 ${student.taughtItems.length - student.taughtPendingCount}/${student.taughtItems.length}`}
                            {showTaught && showHomework && " · "}
                            {showHomework && `作业 ${student.homeworkItems.length - student.homeworkPendingCount}/${student.homeworkItems.length}`}
                          </span>
                        </div>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          {showTaught && student.taughtItems.length > 0 && (
                            <ChecklistStudentItemGroup
                              title="课堂"
                              items={student.taughtItems}
                              onToggle={onToggleCompletion ? (item) => onToggleCompletion(student.studentId, item.itemId, "taught", !item.completed) : undefined}
                              resultCount={resultEntry?.taughtSyncedCount ?? 0}
                              tone="blue"
                            />
                          )}
                          {showHomework && student.homeworkItems.length > 0 && (
                            <ChecklistStudentItemGroup
                              title="作业"
                              items={student.homeworkItems}
                              onToggle={onToggleCompletion ? (item) => onToggleCompletion(student.studentId, item.itemId, "homework", !item.completed) : undefined}
                              resultCount={resultEntry?.homeworkSyncedCount ?? 0}
                              tone="orange"
                            />
                          )}
                          {focusedPendingCount === 0 && (
                            <span className="self-center text-xs font-semibold text-[#15803d]">所示条目已完成</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <PreviousLessonChecklistProgressCard progress={previousChecklistProgress} />
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <label className="text-sm font-bold text-[#25324a]">清单模板</label>
          <Select value={content.checklistTemplateId ?? ""} onChange={(event) => updateTemplate(event.target.value)}>
            <option value="">不关联模板</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} · {template.subject || "未设科目"}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-[#25324a]">搜索条目</label>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <Input
              className="pl-9"
              value={itemSearch}
              onChange={(event) => setItemSearch(event.target.value)}
              disabled={!selectedTemplate}
              placeholder={selectedTemplate ? "搜索章节或知识点" : "先选择模板"}
            />
          </div>
        </div>
      </div>

      {selectedTemplate ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="secondary">{selectedTemplate.subject || selectedSubject || "未设科目"}</Badge>
            <Badge variant="secondary">{selectedTemplate.items.length} 项</Badge>
            {selectedSubject && <Badge variant="plum">当前课程：{selectedSubject}</Badge>}
          </div>

          <div className="mt-4 max-h-[240px] space-y-2 overflow-y-auto pr-1">
            {visibleItems.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-white p-4 text-sm font-semibold text-[#64748b]">
                当前搜索没有命中条目。
              </div>
            ) : (
              visibleItems.map((item) => {
                const taughtSelected = taughtItemIds.includes(item.id);
                const homeworkSelected = homeworkItemIds.includes(item.id);
                const previousTaughtSelected = previousLinkedItemIds.taught.has(item.id);
                const previousHomeworkSelected = previousLinkedItemIds.homework.has(item.id);
                const hasCurrentLink = taughtSelected || homeworkSelected;
                const hasPreviousLink = previousTaughtSelected || previousHomeworkSelected;
                return (
                  <div
                    key={item.id}
                    className={`rounded-[12px] border p-3 ${
                      hasCurrentLink
                        ? "border-[#93c5fd] bg-white"
                        : hasPreviousLink
                          ? "border-[#facc15] bg-[#fffdf2]"
                          : "border-[#dbe4ef] bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        {item.chapter && <div className="text-[11px] font-bold text-[#5161d6]">{item.chapter}</div>}
                        <div className="mt-1 text-sm font-extrabold text-[#061226]">{formatChecklistItemTitle(item, selectedTemplate?.items)}</div>
                      </div>
                      {(hasCurrentLink || hasPreviousLink) && (
                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                          {taughtSelected && <Badge variant="sky" className="px-1.5 py-0 text-[10px]">本节内容</Badge>}
                          {homeworkSelected && <Badge variant="amber" className="px-1.5 py-0 text-[10px]">本节作业</Badge>}
                          {previousTaughtSelected && <Badge variant="outline" className="border-[#93c5fd] bg-[#eff6ff] px-1.5 py-0 text-[10px] text-[#1557c2]">上节内容</Badge>}
                          {previousHomeworkSelected && <Badge variant="outline" className="border-[#fdba74] bg-[#fff7ed] px-1.5 py-0 text-[10px] text-[#c2410c]">上节作业</Badge>}
                        </div>
                      )}
                    </div>
                    {item.note && (
                      <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
                        {item.note}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={taughtSelected ? "default" : "outline"}
                        onClick={() => toggleChecklistItem("taught", item.id)}
                      >
                        <BookOpen size={13} /> {taughtSelected ? "已关联到内容" : "关联到内容"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={homeworkSelected ? "default" : "outline"}
                        onClick={() => toggleChecklistItem("homework", item.id)}
                      >
                        <NotebookPen size={13} /> {homeworkSelected ? "已关联到作业" : "关联到作业"}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </>
      ) : (
        <div className="mt-4 rounded-[12px] border border-dashed border-[#cbd6e3] bg-white p-4 text-sm font-semibold leading-6 text-[#64748b]">
          选一个学习清单模板后，就能通过模板筛选和搜索把条目分别关联到本节课内容或课后作业。
        </div>
      )}
    </div>
  );
}

function ChecklistStudentItemGroup({
  title,
  items,
  onToggle,
  resultCount,
  tone
}: {
  title: string;
  items: LessonChecklistStudentItemStatus[];
  onToggle?: (item: LessonChecklistStudentItemStatus) => void;
  resultCount: number;
  tone: "blue" | "orange";
}) {
  const toneClass = tone === "blue" ? "text-[#1557c2]" : "text-[#c2410c]";
  return (
    <div className="min-w-0">
      <div className={`mb-1 flex items-center gap-1.5 text-[10px] font-extrabold ${toneClass}`}>
        <span>{title}</span>
        {resultCount > 0 && <Badge variant="sage" className="px-1.5 py-0 text-[10px]">本次+{resultCount}</Badge>}
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <button
            key={item.itemId}
            type="button"
            onClick={() => onToggle?.(item)}
            disabled={!onToggle}
            aria-pressed={item.completed}
            title={`${item.completed ? "撤销完成" : "标记完成"}：${item.label}`}
            className={`flex w-full items-start gap-1.5 rounded-[6px] border px-2 py-1.5 text-left text-[11px] font-semibold leading-4 transition-colors ${
              item.completed
                ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534] hover:border-[#86efac]"
                : "border-[#e8eef6] bg-[#f8fbff] text-[#475569] hover:border-[#93c5fd] hover:bg-[#eef5ff]"
            }`}
          >
            {item.completed ? <Check size={13} className="mt-0.5 shrink-0" /> : <Circle size={13} className="mt-0.5 shrink-0 text-[#94a3b8]" />}
            <span className="min-w-0 break-words">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function LessonChecklistLinkedItems({
  vault,
  content,
  field,
  onChange
}: {
  vault: TeacherVault;
  content: LessonContent;
  field: LessonContentChecklistField;
  onChange: (content: LessonContent) => void;
}) {
  const templates = vault.progressChecklistTemplates ?? [];
  const items = linkedChecklistItems(content, templates, field);
  if (items.length === 0) return null;
  const orderedItems = templates.find((template) => template.id === content.checklistTemplateId)?.items;
  const toneClass = field === "taught"
    ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]"
    : "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]";

  return (
    <div className="flex flex-wrap items-start gap-1.5 pt-1">
      {items.map((item) => {
        const label = formatChecklistItemLabel(item, orderedItems);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(removeLessonChecklistItem(content, templates, field, item.id))}
            className={`inline-flex max-w-full items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-left text-xs font-semibold leading-5 transition-colors hover:opacity-80 ${toneClass}`}
            title="移除关联"
            aria-label={`移除关联条目：${label}`}
          >
            <span className="break-words">{label}</span>
            <X size={12} className="shrink-0 opacity-70" />
          </button>
        );
      })}
    </div>
  );
}

function PreviousLessonChecklistProgressCard({ progress }: { progress?: PreviousLessonChecklistProgress }) {
  if (!progress) return null;
  const completedLabel = progress.totalPossibleCount > 0
    ? `${progress.totalCompletedCount}/${progress.totalPossibleCount}`
    : "暂无学生";
  return (
    <div className="mt-4 rounded-[12px] border border-[#dbeafe] bg-white p-3">
      <div>
        <div>
          <div className="flex items-center gap-2">
            <div className="text-sm font-extrabold text-[#25324a]">上一节学习清单进度</div>
            <Badge variant="secondary" className="shrink-0 whitespace-nowrap">{progress.studentCount} 名学生</Badge>
          </div>
          <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
            来源：{progress.lesson.date} {lessonTimeRangeLabel(progress.lesson)} · {progress.template.name} · 当前学生累计 {completedLabel}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <PreviousLessonChecklistProgressItems
          title="上课内容"
          tone="blue"
          items={progress.taughtItems}
          orderedItems={progress.template.items}
          emptyText="上一节未关联上课内容"
        />
        <PreviousLessonChecklistProgressItems
          title="课后作业"
          tone="orange"
          items={progress.homeworkItems}
          orderedItems={progress.template.items}
          emptyText="上一节未关联课后作业"
        />
      </div>

      {progress.nextPendingItems.length > 0 && (
        <div className="mt-3 rounded-[10px] border border-[#e8eef6] bg-[#f8fbff] p-3">
          <div className="mb-2 text-xs font-extrabold text-[#25324a]">未完成靠前条目</div>
          <div className="flex flex-wrap gap-2">
            {progress.nextPendingItems.map((item) => (
              <Badge key={item.id} variant="outline" className="max-w-full whitespace-normal text-left leading-5">
                {formatChecklistItemLabel(item, progress.template.items)}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PreviousLessonChecklistProgressItems({
  title,
  tone,
  items,
  orderedItems,
  emptyText
}: {
  title: string;
  tone: "blue" | "orange";
  items: PreviousLessonChecklistItemProgress[];
  orderedItems: ProgressChecklistTemplateItem[];
  emptyText: string;
}) {
  const toneClass = tone === "blue" ? "text-[#1557c2]" : "text-[#c2410c]";
  const badgeVariant = tone === "blue" ? "sky" : "amber";
  return (
    <div className="rounded-[10px] border border-[#e8eef6] bg-[#f8fbff] p-3">
      <div className={`mb-2 text-xs font-extrabold ${toneClass}`}>{title}</div>
      {items.length === 0 ? (
        <div className="text-xs font-semibold text-[#94a3b8]">{emptyText}</div>
      ) : (
        <div className="space-y-2">
          {items.map(({ item, completedCount, totalStudentCount }) => (
            <div key={item.id} className="flex items-start justify-between gap-2 rounded-[8px] border border-[#e8eef6] bg-white px-3 py-2">
              <div className="min-w-0 text-xs font-bold leading-5 text-[#25324a]">
                {formatChecklistItemLabel(item, orderedItems)}
              </div>
              <Badge variant={badgeVariant} className="shrink-0 px-1.5 py-0 text-[10px]">
                {totalStudentCount > 0 ? `${completedCount}/${totalStudentCount}` : "暂无"}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function resolveSelectedItems(
  template: ProgressChecklistTemplate | undefined,
  itemIds: string[]
): ProgressChecklistTemplateItem[] {
  const itemMap = new Map((template?.items ?? []).map((item) => [item.id, item]));
  return itemIds
    .map((itemId) => itemMap.get(itemId))
    .filter((item): item is ProgressChecklistTemplateItem => Boolean(item));
}

function buildPreviousLessonChecklistProgress(
  vault: TeacherVault,
  lesson: Lesson | undefined,
  previousLesson: Lesson | undefined
): PreviousLessonChecklistProgress | undefined {
  if (!previousLesson?.content.checklistTemplateId) return undefined;
  const template = (vault.progressChecklistTemplates ?? []).find((item) => item.id === previousLesson.content.checklistTemplateId);
  if (!template) return undefined;
  const studentIds = activeLessonStudentIds(vault, lesson ?? previousLesson);
  const completionKeysForSource = (source: ChecklistField) => new Set(
    (vault.progressChecklistCompletions ?? [])
      .filter((completion) =>
        completion.templateId === template.id &&
        completion.courseGroupId === previousLesson.courseGroupId &&
        studentIds.includes(completion.studentId) &&
        checklistCompletionAppliesToSource(completion, source)
      )
      .map((completion) => checklistCompletionKey(completion.studentId, completion.itemId))
  );
  const taughtCompletedKeys = completionKeysForSource("taught");
  const homeworkCompletedKeys = completionKeysForSource("homework");
  const taughtSelectedItems = resolveSelectedItems(template, uniqueIds(previousLesson.content.taughtChecklistItemIds ?? []));
  const homeworkSelectedItems = resolveSelectedItems(template, uniqueIds(previousLesson.content.homeworkChecklistItemIds ?? []));
  const previousLinkedItems = Array.from(new Map([...taughtSelectedItems, ...homeworkSelectedItems].map((item) => [item.id, item])).values());
  const itemProgress = (items: ProgressChecklistTemplateItem[], completedKeys: Set<string>) => items.map((item) => ({
    item,
    totalStudentCount: studentIds.length,
    completedCount: studentIds.filter((studentId) => completedKeys.has(checklistCompletionKey(studentId, item.id))).length
  }));
  const totalCompletedCount = taughtSelectedItems.reduce(
    (sum, item) => sum + studentIds.filter((studentId) => taughtCompletedKeys.has(checklistCompletionKey(studentId, item.id))).length,
    0
  ) + homeworkSelectedItems.reduce(
    (sum, item) => sum + studentIds.filter((studentId) => homeworkCompletedKeys.has(checklistCompletionKey(studentId, item.id))).length,
    0
  );
  const nextPendingItems = previousLinkedItems
    .slice()
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .filter((item) => studentIds.some((studentId) =>
      !taughtCompletedKeys.has(checklistCompletionKey(studentId, item.id)) ||
      !homeworkCompletedKeys.has(checklistCompletionKey(studentId, item.id))
    ))
    .slice(0, 4);

  return {
    lesson: previousLesson,
    template,
    studentCount: studentIds.length,
    totalCompletedCount,
    totalPossibleCount: (taughtSelectedItems.length + homeworkSelectedItems.length) * studentIds.length,
    taughtItems: itemProgress(taughtSelectedItems, taughtCompletedKeys),
    homeworkItems: itemProgress(homeworkSelectedItems, homeworkCompletedKeys),
    nextPendingItems
  };
}

function activeLessonStudentIds(vault: TeacherVault, lesson: Lesson): string[] {
  const studentIds = lessonStudentIds(lesson);
  const activeStudentIds = studentIds.filter((studentId) => findStudent(vault, studentId)?.status === "active");
  return activeStudentIds.length > 0 ? activeStudentIds : studentIds;
}

function checklistCompletionKey(studentId: string, itemId: string): string {
  return `${studentId}::${itemId}`;
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}
function formatChecklistItemLabel(item: ProgressChecklistTemplateItem, orderedItems?: ProgressChecklistTemplateItem[]): string {
  return formatChecklistItemLine(item, orderedItems);
}
