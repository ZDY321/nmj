import { useEffect, useMemo, useState } from "react";
import { BookCheck, BookOpen, NotebookPen, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { compareByName } from "@/frontend/lib/helpers";
import { formatChecklistItemLine, formatChecklistItemTitle } from "@/frontend/lib/progressChecklist";
import type { LessonContent, ProgressChecklistTemplate, ProgressChecklistTemplateItem, TeacherVault } from "@/shared/types";

type ChecklistField = "taught" | "homework";

export function LessonChecklistLinker({
  vault,
  content,
  subjectHint,
  onChange
}: {
  vault: TeacherVault;
  content: LessonContent;
  subjectHint?: string;
  onChange: (content: LessonContent) => void;
}) {
  const [itemSearch, setItemSearch] = useState("");
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
    onChange({
      ...content,
      checklistTemplateId: undefined,
      taughtChecklistItemIds: [],
      homeworkChecklistItemIds: []
    });
  }, [content, onChange, templates]);

  function updateTemplate(templateId: string) {
    const nextTemplate = templates.find((template) => template.id === templateId);
    const validItemIds = new Set(nextTemplate?.items.map((item) => item.id) ?? []);
    onChange({
      ...content,
      checklistTemplateId: templateId || undefined,
      taughtChecklistItemIds: taughtItemIds.filter((itemId) => validItemIds.has(itemId)),
      homeworkChecklistItemIds: homeworkItemIds.filter((itemId) => validItemIds.has(itemId))
    });
    setItemSearch("");
  }

  function toggleChecklistItem(field: ChecklistField, itemId: string) {
    const currentIds = field === "taught" ? taughtItemIds : homeworkItemIds;
    const nextIds = currentIds.includes(itemId)
      ? currentIds.filter((currentId) => currentId !== itemId)
      : [...currentIds, itemId];
    onChange({
      ...content,
      [field === "taught" ? "taughtChecklistItemIds" : "homeworkChecklistItemIds"]: nextIds
    });
  }

  function clearChecklistItems(field: ChecklistField) {
    onChange({
      ...content,
      [field === "taught" ? "taughtChecklistItemIds" : "homeworkChecklistItemIds"]: []
    });
  }

  const taughtItems = resolveSelectedItems(selectedTemplate, taughtItemIds);
  const homeworkItems = resolveSelectedItems(selectedTemplate, homeworkItemIds);

  return (
    <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-extrabold text-[#25324a]">
            <BookCheck size={16} className="text-[#1557c2]" /> 关联学习清单
          </div>
          <div className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">
            这里保存结构化关联，不要求你在上面的文本里按固定格式写知识点。
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="sky">{taughtItems.length} 项关联到本节内容</Badge>
          <Badge variant="amber">{homeworkItems.length} 项关联到课后作业</Badge>
        </div>
      </div>

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
                return (
                  <div key={item.id} className="rounded-[12px] border border-[#dbe4ef] bg-white p-3">
                    {item.chapter && <div className="text-[11px] font-bold text-[#5161d6]">{item.chapter}</div>}
                    <div className="mt-1 text-sm font-extrabold text-[#061226]">{formatChecklistItemTitle(item, selectedTemplate?.items)}</div>
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

          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            <SelectedChecklistItems
              title="本节课内容已关联"
              tone="blue"
              items={taughtItems}
              orderedItems={selectedTemplate?.items}
              onClear={() => clearChecklistItems("taught")}
              onRemove={(itemId) => toggleChecklistItem("taught", itemId)}
            />
            <SelectedChecklistItems
              title="课后作业已关联"
              tone="orange"
              items={homeworkItems}
              orderedItems={selectedTemplate?.items}
              onClear={() => clearChecklistItems("homework")}
              onRemove={(itemId) => toggleChecklistItem("homework", itemId)}
            />
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

function SelectedChecklistItems({
  title,
  tone,
  items,
  orderedItems,
  onClear,
  onRemove
}: {
  title: string;
  tone: "blue" | "orange";
  items: ProgressChecklistTemplateItem[];
  orderedItems?: ProgressChecklistTemplateItem[];
  onClear: () => void;
  onRemove: (itemId: string) => void;
}) {
  const toneClass = tone === "blue" ? "text-[#1557c2]" : "text-[#c2410c]";
  return (
    <div className="rounded-[12px] border border-[#dbe4ef] bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className={`text-sm font-extrabold ${toneClass}`}>{title}</div>
        <Button type="button" size="sm" variant="ghost" onClick={onClear} disabled={items.length === 0}>
          清空
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="text-sm font-semibold text-[#94a3b8]">暂未关联条目</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onRemove(item.id)}
              className="inline-flex items-center gap-1 rounded-full border border-[#dbe4ef] bg-[#f8fbff] px-3 py-1.5 text-left text-xs font-bold text-[#25324a] transition-colors hover:border-[#93c5fd] hover:bg-[#eef5ff]"
              title="点击移除关联"
            >
              <span>{formatChecklistItemLabel(item, orderedItems)}</span>
              <X size={12} className="text-[#94a3b8]" />
            </button>
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

function formatChecklistItemLabel(item: ProgressChecklistTemplateItem, orderedItems?: ProgressChecklistTemplateItem[]): string {
  return formatChecklistItemLine(item, orderedItems);
}
