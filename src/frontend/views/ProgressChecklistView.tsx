import { useEffect, useMemo, useState } from "react";
import {
  BookCheck,
  CalendarDays,
  CheckCheck,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Plus,
  Save,
  Search,
  Trash2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { generateAiScheduleDraft, getUsableAiProviders } from "@/frontend/lib/cloud";
import { todayIso } from "@/frontend/lib/calculations";
import { makeId } from "@/frontend/lib/crypto";
import { formatChecklistItemLine, formatChecklistItemTitle, stripChecklistTitlePrefix } from "@/frontend/lib/progressChecklist";
import {
  campusName,
  compareByName,
  courseTypeLabel,
  findStudent,
  lessonStudentIds,
  sortCoursesByName,
  sortLessons
} from "@/frontend/lib/helpers";
import type {
  AiProviderConfig,
  AiScheduleDraftResponse,
  Lesson,
  ProgressChecklistCompletion,
  ProgressChecklistTemplate,
  ProgressChecklistTemplateItem,
  Student,
  StudentProgressRecord,
  TeacherVault
} from "@/shared/types";

type ChecklistCellSelection = {
  studentId: string;
  itemId: string;
};

type LatestChecklistContext = {
  lesson?: Lesson;
  record?: StudentProgressRecord;
};

const NEW_TEMPLATE_ID = "__new_template__";
const examChecklistPattern = /真题|试卷|中考|高考|模考|联考|统考|一模|二模|市卷|省卷|十三市|城市|题型|专题|压轴|实验题|选择题|填空题|计算题|综合题/;

export function ProgressChecklistView({
  vault,
  token,
  onSaveChecklistTemplate,
  onDeleteChecklistTemplate,
  onSaveChecklistCompletion,
  onDeleteChecklistCompletion
}: {
  vault: TeacherVault;
  token?: string;
  onSaveChecklistTemplate: (template: ProgressChecklistTemplate) => void;
  onDeleteChecklistTemplate: (templateId: string) => void;
  onSaveChecklistCompletion: (completion: ProgressChecklistCompletion) => void;
  onDeleteChecklistCompletion: (completionId: string) => void;
}) {
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateNote, setTemplateNote] = useState("");
  const [templateItemsText, setTemplateItemsText] = useState("");
  const [templatePanelOpen, setTemplatePanelOpen] = useState(true);
  const [itemSearch, setItemSearch] = useState("");
  const [showOnlyIncomplete, setShowOnlyIncomplete] = useState(false);
  const [selectedCell, setSelectedCell] = useState<ChecklistCellSelection | null>(null);
  const [selectedCellDate, setSelectedCellDate] = useState(todayIso());
  const [completionNote, setCompletionNote] = useState("");
  const [aiProviders, setAiProviders] = useState<AiProviderConfig[]>([]);
  const [aiProviderId, setAiProviderId] = useState("");
  const [aiPrompt, setAiPrompt] = useState("请按教材、真题、专题或题型要求生成一套可逐项勾选的学习清单模板，适合学生按完成日期记录。");
  const [aiMessage, setAiMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  const courseOptions = useMemo(
    () => sortCoursesByName(vault.courseGroups).filter((course) => course.studentIds.length > 0),
    [vault.courseGroups]
  );
  const templates = useMemo(
    () => [...(vault.progressChecklistTemplates ?? [])].sort(
      (a, b) => compareByName(a.name, b.name) || a.id.localeCompare(b.id)
    ),
    [vault.progressChecklistTemplates]
  );

  useEffect(() => {
    if (!courseOptions.some((course) => course.id === selectedCourseId)) {
      setSelectedCourseId(courseOptions[0]?.id ?? "");
    }
  }, [courseOptions, selectedCourseId]);

  useEffect(() => {
    if (selectedTemplateId === NEW_TEMPLATE_ID) return;
    if (!templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0]?.id ?? "");
    }
  }, [templates, selectedTemplateId]);

  useEffect(() => {
    if (!token) {
      setAiProviders([]);
      setAiProviderId("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const providers = await getUsableAiProviders(token);
        if (cancelled) return;
        setAiProviders(providers);
        setAiProviderId((current) => current && providers.some((provider) => provider.id === current && provider.enabled)
          ? current
          : providers.find((provider) => provider.enabled && provider.isDefault)?.id ?? providers.find((provider) => provider.enabled)?.id ?? "");
      } catch (error) {
        if (!cancelled) {
          setAiMessage(error instanceof Error ? error.message : "AI 模板配置加载失败。");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const selectedCourse = courseOptions.find((course) => course.id === selectedCourseId);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);

  useEffect(() => {
    if (selectedTemplateId === NEW_TEMPLATE_ID) return;
    if (selectedTemplate) {
      setTemplateName(selectedTemplate.name);
      setTemplateSubject(selectedTemplate.subject ?? selectedCourse?.subject ?? "");
      setTemplateNote(selectedTemplate.note ?? "");
      setTemplateItemsText(templateItemsToText(selectedTemplate.items));
      return;
    }
    setTemplateName("");
    setTemplateSubject(selectedCourse?.subject ?? "");
    setTemplateNote("");
    setTemplateItemsText("");
  }, [selectedTemplate?.id, selectedTemplate?.updatedAt, selectedCourse?.subject]);

  const selectedStudents = useMemo(
    () =>
      (selectedCourse?.studentIds ?? [])
        .map((studentId) => findStudent(vault, studentId))
        .filter((student): student is Student => Boolean(student))
        .sort((a, b) => compareByName(a.name, b.name) || a.id.localeCompare(b.id)),
    [selectedCourse?.id, selectedCourse?.studentIds, vault]
  );
  const latestContextByStudent = useMemo(
    () => buildLatestChecklistContextMap(vault, selectedCourseId, selectedStudents),
    [vault, selectedCourseId, selectedStudents]
  );

  const draftTemplateItems = useMemo(
    () => parseTemplateItemsText(templateItemsText),
    [templateItemsText]
  );
  const normalizedDraftItemsText = useMemo(
    () => templateItemsToText(draftTemplateItems),
    [draftTemplateItems]
  );
  const normalizedStoredItemsText = useMemo(
    () => selectedTemplate ? templateItemsToText(selectedTemplate.items) : "",
    [selectedTemplate?.id, selectedTemplate?.updatedAt]
  );
  const currentTemplateName = templateName.trim();
  const currentTemplateSubject = templateSubject.trim() || (selectedCourse?.subject ?? "");
  const currentTemplateNote = templateNote.trim();
  const storedTemplateName = selectedTemplate?.name.trim() ?? "";
  const storedTemplateSubject = selectedTemplate?.subject ?? (selectedCourse?.subject ?? "");
  const storedTemplateNote = selectedTemplate?.note?.trim() ?? "";
  const templateIsDirty = selectedTemplateId === NEW_TEMPLATE_ID
    ? Boolean(currentTemplateName || currentTemplateSubject || currentTemplateNote || normalizedDraftItemsText)
    : currentTemplateName !== storedTemplateName
      || currentTemplateSubject !== storedTemplateSubject
      || currentTemplateNote !== storedTemplateNote
      || normalizedDraftItemsText !== normalizedStoredItemsText;
  const canSaveTemplate = Boolean(currentTemplateName && draftTemplateItems.length > 0 && templateIsDirty);
  const allItems = useMemo(
    () => (selectedTemplateId === NEW_TEMPLATE_ID ? draftTemplateItems : (selectedTemplate?.items ?? [])).slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    [selectedTemplateId, selectedTemplate?.id, selectedTemplate?.updatedAt, draftTemplateItems]
  );
  const completionList = useMemo(
    () =>
      selectedTemplateId === NEW_TEMPLATE_ID
        ? []
        :
      (vault.progressChecklistCompletions ?? []).filter(
        (completion) => completion.templateId === selectedTemplateId && completion.courseGroupId === selectedCourseId
      ),
    [vault.progressChecklistCompletions, selectedTemplateId, selectedCourseId]
  );
  const completionMap = useMemo(
    () => new Map(completionList.map((completion) => [checklistCellKey(completion.studentId, completion.itemId), completion])),
    [completionList]
  );
  const normalizedItemSearch = itemSearch.trim().toLowerCase();
  const visibleItems = useMemo(
    () =>
      allItems.filter((item) => {
        const searchable = `${item.chapter ?? ""} ${item.title}`.toLowerCase();
        const matchesSearch = !normalizedItemSearch
          || normalizedItemSearch.split(/\s+/).filter(Boolean).every((term) => searchable.includes(term));
        const matchesIncomplete = !showOnlyIncomplete || selectedStudents.some((student) => !completionMap.has(checklistCellKey(student.id, item.id)));
        return matchesSearch && matchesIncomplete;
      }),
    [allItems, normalizedItemSearch, showOnlyIncomplete, selectedStudents, completionMap]
  );

  useEffect(() => {
    if (!selectedCell) return;
    if (!selectedStudents.some((student) => student.id === selectedCell.studentId) || !allItems.some((item) => item.id === selectedCell.itemId)) {
      setSelectedCell(null);
      setSelectedCellDate(todayIso());
      setCompletionNote("");
    }
  }, [selectedCell, selectedStudents, allItems]);

  const selectedStudent = selectedStudents.find((student) => student.id === selectedCell?.studentId);
  const selectedItem = allItems.find((item) => item.id === selectedCell?.itemId);
  const selectedCompletion = selectedCell ? completionMap.get(checklistCellKey(selectedCell.studentId, selectedCell.itemId)) : undefined;
  const selectedLatestContext = selectedStudent ? latestContextByStudent.get(selectedStudent.id) : undefined;
  const selectedLatestLessonChecklist = selectedLatestContext?.lesson ? resolveLessonChecklistLinks(vault, selectedLatestContext.lesson) : null;

  useEffect(() => {
    setSelectedCellDate(selectedCompletion?.completedDate ?? todayIso());
    setCompletionNote(selectedCompletion?.note ?? "");
  }, [selectedCompletion?.id, selectedCompletion?.completedDate, selectedCompletion?.note, selectedCell?.studentId, selectedCell?.itemId]);

  const totalPossible = selectedStudents.length * allItems.length;
  const completedCount = completionList.length;
  const pendingCount = Math.max(totalPossible - completedCount, 0);
  const fullyCompletedStudents = allItems.length === 0
    ? 0
    : selectedStudents.filter((student) => allItems.every((item) => completionMap.has(checklistCellKey(student.id, item.id)))).length;

  function startNewTemplate() {
    setSelectedTemplateId(NEW_TEMPLATE_ID);
    setTemplateName("");
    setTemplateSubject(selectedCourse?.subject ?? "");
    setTemplateNote("");
    setTemplateItemsText("");
    setItemSearch("");
    setShowOnlyIncomplete(false);
    setSelectedCell(null);
    setSelectedCellDate(todayIso());
    setCompletionNote("");
    setAiMessage("");
  }

  function saveTemplate() {
    const name = currentTemplateName;
    const parsedItems = draftTemplateItems;
    if (!canSaveTemplate || !name || parsedItems.length === 0) return;

    const existingItems = selectedTemplateId === NEW_TEMPLATE_ID ? [] : selectedTemplate?.items ?? [];
    const now = new Date().toISOString();
    const nextTemplate: ProgressChecklistTemplate = {
      id: selectedTemplateId === NEW_TEMPLATE_ID ? makeId("progress_template") : selectedTemplate?.id ?? makeId("progress_template"),
      name,
      subject: currentTemplateSubject || undefined,
      note: currentTemplateNote || undefined,
      items: parsedItems.map((item, index) => {
        return {
          id: existingItems[index]?.id ?? makeId("progress_item"),
          chapter: item.chapter || existingItems[index]?.chapter,
          title: item.title,
          note: existingItems[index]?.note,
          order: index
        };
      }),
      createdAt: selectedTemplateId === NEW_TEMPLATE_ID ? now : selectedTemplate?.createdAt ?? now,
      updatedAt: now
    };
    onSaveChecklistTemplate(nextTemplate);
    setSelectedTemplateId(nextTemplate.id);
    setItemSearch("");
    setShowOnlyIncomplete(false);
    setSelectedCell(null);
  }

  function askDeleteTemplate() {
    if (!selectedTemplate) return;
    confirm({
      title: `删除模板「${selectedTemplate.name}」？`,
      description: "会同时删除这个模板下的所有完成勾选记录。",
      confirmLabel: "删除",
      tone: "danger",
      onConfirm: () => {
        onDeleteChecklistTemplate(selectedTemplate.id);
        setSelectedTemplateId("");
        setSelectedCell(null);
      }
    });
  }

  function selectChecklistCell(studentId: string, itemId: string) {
    setSelectedCell({ studentId, itemId });
  }

  function saveSelectedCompletion() {
    if (!selectedCourse || !selectedTemplate || !selectedStudent || !selectedItem) return;
    const now = new Date().toISOString();
    const existing = completionMap.get(checklistCellKey(selectedStudent.id, selectedItem.id));
    const latestContext = latestContextByStudent.get(selectedStudent.id);
    onSaveChecklistCompletion({
      id: existing?.id ?? makeId("progress_completion"),
      templateId: selectedTemplate.id,
      itemId: selectedItem.id,
      studentId: selectedStudent.id,
      courseGroupId: selectedCourse.id,
      completedDate: selectedCellDate || todayIso(),
      lessonId: existing?.lessonId ?? latestContext?.lesson?.id,
      progressRecordId: existing?.progressRecordId ?? latestContext?.record?.id,
      note: completionNote.trim() || undefined,
      updatedAt: now
    });
  }

  function clearSelectedCompletion() {
    if (!selectedCompletion) return;
    onDeleteChecklistCompletion(selectedCompletion.id);
  }

  async function generateAiTemplateDraft() {
    if (!token) {
      setAiMessage("请先登录后再使用 AI 生成模板。");
      return;
    }
    const fallbackProviderId = aiProviders.find((provider) => provider.enabled && provider.isDefault)?.id
      ?? aiProviders.find((provider) => provider.enabled)?.id
      ?? "";
    const providerId = aiProviderId || fallbackProviderId;
    if (!providerId) {
      setAiMessage("当前没有可用的 AI 接口配置。");
      return;
    }
    const prompt = aiPrompt.trim();
    if (!prompt) {
      setAiMessage("请先填写 AI 生成说明。");
      return;
    }
    setAiLoading(true);
    setAiMessage("正在生成模板草稿...");
    try {
      const instruction = buildChecklistAiInstruction(prompt);
      const result = await generateAiScheduleDraft(token, {
        providerId,
        taskType: "progress_checklist",
        instruction,
        context: {
          courseId: selectedCourse?.id ?? "",
          courseName: selectedCourse?.name ?? "",
          subject: selectedCourse?.subject ?? "",
          existingTemplateId: selectedTemplate?.id ?? "",
          existingTemplateName: selectedTemplate?.name ?? "",
          checklistGuidance: [
            "清单条目必须服从用户指定依据；用户说真题/试卷/地区/年份/题型时，不要改成教材章节目录。",
            "如果用户同时说教材版本和真题来源，教材版本只用于限定真题范围，不用于生成章节目录。",
            "chapter 字段可作为分组标签，不限于教材章节；可写城市卷、年份、题型、专题或复盘阶段。",
            "title 字段要写成具体可完成的任务，便于学生按完成日期逐项勾选。"
          ]
        }
      });
      if (!applyAiChecklistDraft(result)) {
        setAiMessage("AI 已返回内容，但未识别出模板结构，请查看原始结果后手动调整。");
      } else {
        setAiMessage("AI 模板草稿已填入表单，请核对后保存。");
      }
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "AI 模板生成失败。");
    } finally {
      setAiLoading(false);
    }
  }

  function applyAiChecklistDraft(result: AiScheduleDraftResponse): boolean {
    if (!result.draft || typeof result.draft !== "object") return false;
    const draft = result.draft as Record<string, unknown>;
    const template = draft.template;
    if (!template || typeof template !== "object") return false;
    const templateObject = template as Record<string, unknown>;
    const itemObjects = Array.isArray(templateObject.items) ? templateObject.items : [];
    const structuredItems = itemObjects
      .map((item, index) => {
        if (!item || typeof item !== "object") return null;
        const itemObject = item as Record<string, unknown>;
        const chapter = stringValue(itemObject.chapter);
        const title = stringValue(itemObject.title);
        if (!title) return null;
        const note = stringValue(itemObject.note);
        return {
          id: `ai-draft-item-${index}`,
          chapter: chapter || undefined,
          title: note ? `${title}（${note}）` : title,
          order: index
        } satisfies ProgressChecklistTemplateItem;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const itemTitles = structuredItems
      .map((item) => formatChecklistItemLine(item, structuredItems))
      .filter(Boolean);
    if (stringValue(templateObject.name)) setTemplateName(stringValue(templateObject.name));
    if (stringValue(templateObject.subject)) {
      setTemplateSubject(stringValue(templateObject.subject));
    } else if (selectedCourse?.subject) {
      setTemplateSubject(selectedCourse.subject);
    }
    setTemplateNote(stringValue(templateObject.note));
    setTemplateItemsText(itemTitles.join("\n"));
    setSelectedTemplateId(NEW_TEMPLATE_ID);
    setItemSearch("");
    setShowOnlyIncomplete(false);
    setSelectedCell(null);
    setSelectedCellDate(todayIso());
    setCompletionNote("");
    setTemplatePanelOpen(true);
    return Boolean(stringValue(templateObject.name) || itemTitles.length > 0 || stringValue(templateObject.note));
  }

  return (
    <div className="space-y-6">
      {dialog}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "清单模板", value: `${templates.length} 套`, icon: ClipboardList, tone: "bg-[#eaf2ff] text-[#1557c2]" },
          { label: "知识点条目", value: `${allItems.length} 项`, icon: BookCheck, tone: "bg-[#fff3e4] text-[#c2410c]" },
          { label: "已完成勾选", value: `${completedCount} 格`, icon: CheckCheck, tone: "bg-[#e8f8ef] text-[#15803d]" },
          { label: "待完成", value: `${pendingCount} 格`, icon: CalendarDays, tone: "bg-[#eef0ff] text-[#5161d6]" }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="overflow-hidden">
              <CardContent className="flex items-center gap-4 p-5">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] ${item.tone}`}>
                  <Icon size={22} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#64748b]">{item.label}</div>
                  <div className="mt-1 text-2xl font-extrabold text-[#061226]">{item.value}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className={`grid grid-cols-1 gap-4 ${templatePanelOpen ? "xl:grid-cols-[340px_minmax(0,1fr)]" : "xl:grid-cols-[minmax(0,1fr)]"}`}>
        {templatePanelOpen && (
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                  <ClipboardList size={14} /> 学习清单模板
                </div>
                <CardTitle>模板管理</CardTitle>
                <CardDescription>把同一本书或同一套知识点整理成固定清单，后续可重复用于不同学生课程。</CardDescription>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="secondary" className="w-fit">{templates.length} 套</Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTemplatePanelOpen(false)}
                  className="border-[#bfdbfe] bg-[#eff6ff] text-[#1557c2] shadow-sm hover:border-[#93c5fd] hover:bg-[#dbeafe] hover:text-[#0f4aa0]"
                >
                  <ChevronLeft size={14} />
                  收起侧栏
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-[#25324a]">已有模板</label>
                <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
                  {templates.map((template) => {
                    const active = template.id === selectedTemplateId;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => setSelectedTemplateId(template.id)}
                        className={`w-full rounded-[12px] border p-3 text-left transition-colors ${
                          active
                            ? "border-[#93c5fd] bg-[#eff6ff]"
                            : "border-[#e8eef6] bg-white hover:border-[#cbd6e3] hover:bg-[#f8fbff]"
                        }`}
                      >
                        <div className="font-extrabold text-[#061226]">{template.name}</div>
                        <div className="mt-1 text-xs font-semibold text-[#64748b]">
                          {(template.subject || "未设科目")} · {template.items.length} 项
                        </div>
                      </button>
                    );
                  })}
                  {templates.length === 0 && (
                    <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-4 text-sm font-semibold text-[#64748b]">
                      还没有模板，先创建一套教材清单。
                    </div>
                  )}
                </div>
              </div>

              {token && (
                <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-[#25324a]">
                    <BookCheck size={16} className="text-[#1557c2]" /> AI 生成模板草稿
                  </div>
                  {aiProviders.length > 1 && (
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-[#25324a]">AI 接口</label>
                      <Select value={aiProviderId} onChange={(event) => setAiProviderId(event.target.value)}>
                        {aiProviders.filter((provider) => provider.enabled).map((provider) => (
                          <option key={provider.id} value={provider.id}>{provider.name} · {provider.model}</option>
                        ))}
                      </Select>
                    </div>
                  )}
                  <div className="mt-3 space-y-2">
                    <label className="text-sm font-bold text-[#25324a]">生成说明</label>
                    <Textarea
                      value={aiPrompt}
                      onChange={(event) => setAiPrompt(event.target.value)}
                      placeholder="例如：按江苏省十三市 2025 年中考物理真题，按城市卷和题型生成可勾选清单；不要按教材章节目录生成。"
                      className="min-h-[110px] bg-white"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button type="button" onClick={generateAiTemplateDraft} disabled={aiLoading}>
                      <BookCheck size={15} /> {aiLoading ? "生成中..." : "AI 生成模板"}
                    </Button>
                    {aiMessage && (
                      <Badge variant={aiMessage.includes("已") || aiMessage.includes("成功") ? "sage" : aiMessage.includes("正在") ? "amber" : "secondary"}>
                        {aiMessage}
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-bold text-[#25324a]">模板名称</label>
                <Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="例如：2025 江苏中考物理真题清单" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-[#25324a]">关联科目</label>
                <Input value={templateSubject} onChange={(event) => setTemplateSubject(event.target.value)} placeholder="例如：数学 / 英语" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-[#25324a]">条目清单</label>
                <Textarea
                  value={templateItemsText}
                  onChange={(event) => setTemplateItemsText(event.target.value)}
                  placeholder={"每行一个知识点，例如：\n整式乘法\n平方差公式\n完全平方公式"}
                  className="min-h-[220px]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-[#25324a]">备注</label>
                <Textarea
                  value={templateNote}
                  onChange={(event) => setTemplateNote(event.target.value)}
                  placeholder="可写教材版本、真题来源、适用班级、使用说明"
                  className="min-h-[88px]"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button type="button" variant="outline" onClick={startNewTemplate}>
                  <Plus size={15} /> 新建
                </Button>
                <Button
                  type="button"
                  onClick={saveTemplate}
                  disabled={!canSaveTemplate}
                  className="disabled:border-[#e5e7eb] disabled:bg-[#f3f4f6] disabled:text-[#9ca3af] disabled:shadow-none"
                >
                  <Save size={15} /> 保存
                </Button>
                <Button type="button" variant="destructive" onClick={askDeleteTemplate} disabled={!selectedTemplate}>
                  <Trash2 size={15} /> 删除
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
                  <CheckCheck size={14} /> 学习清单
                </div>
                <CardTitle>按学生查看完成日期</CardTitle>
                <CardDescription>原有进度台账保留不动；这里是新增的清单子页面，用来记录每个学生哪一天完成了哪个知识点。</CardDescription>
              </div>
              {!templatePanelOpen && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTemplatePanelOpen(true)}
                  className="border-[#fdba74] bg-[#fff7ed] text-[#c2410c] shadow-sm hover:border-[#fb923c] hover:bg-[#ffedd5] hover:text-[#9a3412]"
                >
                  <ChevronRight size={14} />
                  展开模板区
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#25324a]">选择课程</label>
                  <Select value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)}>
                    <option value="">请选择课程</option>
                    {courseOptions.map((course) => (
                      <option key={course.id} value={course.id}>{course.name} · {course.subject}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#25324a]">选择模板</label>
                  <Select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                    <option value="">请选择模板</option>
                    {selectedTemplateId === NEW_TEMPLATE_ID && <option value={NEW_TEMPLATE_ID}>当前草稿（未保存）</option>}
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <label className="relative block">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                  <Input
                    className="pl-9"
                    value={itemSearch}
                    onChange={(event) => setItemSearch(event.target.value)}
                    placeholder="搜索章节或知识点"
                  />
                </label>
                <label className="flex w-fit items-center gap-3 rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2 text-sm font-bold text-[#25324a]">
                  <input
                    type="checkbox"
                    checked={showOnlyIncomplete}
                    onChange={(event) => setShowOnlyIncomplete(event.target.checked)}
                    className="h-4 w-4 accent-[#ff8617]"
                  />
                  只看未全员完成
                </label>
              </div>

              {selectedCourse && (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{selectedCourse.subject}</Badge>
                  <Badge variant="secondary">{courseTypeLabel(vault, selectedCourse.type)}</Badge>
                  <Badge variant="secondary">{campusName(vault, selectedCourse.defaultCampusId)}</Badge>
                  <Badge variant="sky">{selectedStudents.length} 人</Badge>
                  <Badge variant="amber">{fullyCompletedStudents} 人已全完成</Badge>
                </div>
              )}
              {selectedTemplateId === NEW_TEMPLATE_ID && (
                <div className="rounded-[12px] border border-[#fed7aa] bg-[#fff7ed] p-3 text-sm font-semibold leading-6 text-[#9a3412]">
                  当前下方显示的是未保存草稿。确认无误后点击“保存”，它才会进入正式模板列表并用于长期勾选记录。
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="overflow-hidden">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>清单矩阵</CardTitle>
                  <CardDescription>行是学生，列是知识点；点单元格后在右侧标记完成日期。</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="w-fit">{selectedStudents.length} 名学生</Badge>
                  <Badge variant="plum" className="w-fit">{visibleItems.length} 个显示条目</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {!selectedCourse || (!selectedTemplate && selectedTemplateId !== NEW_TEMPLATE_ID) ? (
                  <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
                    先选择课程和模板，就能开始勾选完成日期。
                  </div>
                ) : visibleItems.length === 0 ? (
                  <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
                    当前条件下没有可显示的知识点条目。
                  </div>
                ) : (
                  <div className="max-h-[72vh] overflow-auto rounded-[14px] border border-[#dbe4ef] bg-white">
                    <table className="min-w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="bg-[#f8fbff]">
                          <th className="sticky top-0 z-30 min-w-[210px] border-b border-r border-[#dbe4ef] bg-[#f8fbff] p-3 text-xs font-extrabold text-[#25324a] md:left-0">
                            学生
                          </th>
                          {visibleItems.map((item) => (
                            <th key={item.id} className="sticky top-0 z-20 min-w-[150px] border-b border-r border-[#dbe4ef] bg-[#f8fbff] p-3 align-top text-xs font-extrabold text-[#25324a]">
                              {item.chapter && <div className="mb-1 text-[10px] font-bold text-[#5161d6]">{item.chapter}</div>}
                              <div className="max-h-[3.75rem] overflow-hidden leading-5">{formatChecklistItemTitle(item, allItems)}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedStudents.map((student) => (
                          <tr key={student.id} className="odd:bg-white even:bg-[#fbfdff]">
                            <th className="min-w-[210px] border-b border-r border-[#dbe4ef] bg-inherit p-3 align-top md:sticky md:left-0 md:z-10">
                              <div className="font-extrabold text-[#061226]">{student.name}</div>
                              <div className="mt-1 text-xs font-semibold text-[#64748b]">
                                {student.grade || "未设年级"}
                              </div>
                            </th>
                            {visibleItems.map((item) => {
                              const completion = completionMap.get(checklistCellKey(student.id, item.id));
                              const active = selectedCell?.studentId === student.id && selectedCell.itemId === item.id;
                              return (
                                <td key={`${student.id}-${item.id}`} className="border-b border-r border-[#dbe4ef] p-2 align-top">
                                  <button
                                    type="button"
                                    onClick={() => selectChecklistCell(student.id, item.id)}
                                    className={`flex min-h-[74px] w-full flex-col items-center justify-center rounded-[10px] border px-2 py-3 text-center transition-colors ${
                                      active
                                        ? "border-[#ff8617] bg-[#fff7ed]"
                                        : completion
                                          ? "border-[#bbf7d0] bg-[#f0fdf4] hover:border-[#86efac]"
                                          : "border-[#e8eef6] bg-[#f8fbff] hover:border-[#93c5fd] hover:bg-[#eef5ff]"
                                    }`}
                                  >
                                    {completion ? (
                                      <>
                                        <div className="text-lg font-extrabold text-[#15803d]">✓</div>
                                        <div className="mt-1 text-xs font-bold text-[#166534]">{completion.completedDate.slice(5)}</div>
                                        {completion.note && (
                                          <div className="mt-1 max-h-[2.2rem] overflow-hidden text-[10px] font-semibold leading-4 text-[#166534]" title={completion.note}>
                                            {completion.note}
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <div className="text-xs font-bold text-[#94a3b8]">待完成</div>
                                    )}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader>
                <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#5161d6]">
                  <BookCheck size={14} /> 条目详情
                </div>
                <CardTitle>完成日期设置</CardTitle>
                <CardDescription>选中某个学生和知识点后，在这里标记完成或修改日期。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedStudent || !selectedItem || !selectedCourse ? (
                  <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-6 text-center text-sm font-semibold text-[#64748b]">
                    请先点左侧矩阵里的一个单元格。
                  </div>
                ) : (
                  <>
                    <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
                      <div className="text-sm font-extrabold text-[#061226]">{selectedStudent.name}</div>
                      <div className="mt-1 text-xs font-semibold text-[#64748b]">
                        {selectedCourse.name} · {selectedCourse.subject}
                      </div>
                      <div className="mt-3 rounded-[12px] border border-[#e8eef6] bg-white p-3 text-sm font-bold text-[#25324a]">
                        {selectedItem.chapter && <div className="mb-1 text-xs font-extrabold text-[#5161d6]">{selectedItem.chapter}</div>}
                        {formatChecklistItemTitle(selectedItem, allItems)}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-[#25324a]">完成日期</label>
                      <Input type="date" value={selectedCellDate} onChange={(event) => setSelectedCellDate(event.target.value)} />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-[#25324a]">备注</label>
                      <Textarea
                        value={completionNote}
                        onChange={(event) => setCompletionNote(event.target.value)}
                        placeholder="例如：今天只完成前半部分；课堂会做但课后还要再练；已和家长说明需要补一节。"
                        className="min-h-[88px]"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button type="button" onClick={saveSelectedCompletion}>
                        <Save size={15} /> {selectedCompletion ? "保存日期" : "标记完成"}
                      </Button>
                      <Button type="button" variant="destructive" onClick={clearSelectedCompletion} disabled={!selectedCompletion}>
                        <Trash2 size={15} /> 清除勾选
                      </Button>
                    </div>

                    <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
                      <div className="mb-2 text-sm font-extrabold text-[#25324a]">依托现有每日记录</div>
                      <div className="space-y-2 text-sm text-[#475569]">
                        <div>
                          最近课时：
                          <span className="font-semibold text-[#061226]">
                            {selectedLatestContext?.lesson
                              ? `${selectedLatestContext.lesson.date} ${selectedLatestContext.lesson.startTime}-${selectedLatestContext.lesson.endTime}`
                              : " 暂无"}
                          </span>
                        </div>
                        <div>
                          最近进度：
                          <span className="font-semibold text-[#061226]">
                            {selectedLatestContext?.record?.progressText?.trim() || " 暂无记录"}
                          </span>
                        </div>
                        <div>
                          下次处理：
                          <span className="font-semibold text-[#061226]">
                            {selectedLatestContext?.record?.nextPlan?.trim() || " 暂无记录"}
                          </span>
                        </div>
                        <div>
                          最近课堂关联：
                          <span className="font-semibold text-[#061226]">
                            {formatLessonChecklistSummary(selectedLatestLessonChecklist?.taughtItems, selectedLatestLessonChecklist?.template?.items)}
                          </span>
                        </div>
                        <div>
                          最近作业关联：
                          <span className="font-semibold text-[#061226]">
                            {formatLessonChecklistSummary(selectedLatestLessonChecklist?.homeworkItems, selectedLatestLessonChecklist?.template?.items)}
                          </span>
                        </div>
                      </div>
                      {selectedItem && isSelectedItemLinkedToLesson(selectedItem.id, selectedLatestLessonChecklist) && (
                        <Badge variant="sky" className="mt-3">
                          最近课时已关联当前清单条目
                        </Badge>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function templateItemsToText(items: ProgressChecklistTemplateItem[]): string {
  return items
    .slice()
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((item) => formatChecklistItemLine(item, items))
    .join("\n");
}

function checklistCellKey(studentId: string, itemId: string): string {
  return `${studentId}::${itemId}`;
}

function parseTemplateItemsText(text: string): ProgressChecklistTemplateItem[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parsed = parseTemplateLine(line);
      return {
        id: `draft-item-${index}`,
        chapter: parsed.chapter,
        title: parsed.title,
        order: index
      };
    });
}

function parseTemplateLine(line: string): { chapter?: string; title: string } {
  const normalized = line.trim();
  const match = /^(.*?)\s*[|｜>]\s*(.+)$/.exec(normalized);
  if (!match) {
    return { title: normalized };
  }
  const chapter = match[1]?.trim();
  const title = stripChecklistTitlePrefix(chapter, match[2]?.trim() || normalized);
  return {
    chapter: chapter || undefined,
    title
  };
}

function resolveLessonChecklistLinks(
  vault: TeacherVault,
  lesson: Lesson
): {
  template?: ProgressChecklistTemplate;
  taughtItems: ProgressChecklistTemplateItem[];
  homeworkItems: ProgressChecklistTemplateItem[];
} | null {
  const templateId = lesson.content.checklistTemplateId;
  if (!templateId) return null;
  const template = (vault.progressChecklistTemplates ?? []).find((item) => item.id === templateId);
  if (!template) return null;
  const itemMap = new Map(template.items.map((item) => [item.id, item]));
  const taughtItems = (lesson.content.taughtChecklistItemIds ?? [])
    .map((itemId) => itemMap.get(itemId))
    .filter((item): item is ProgressChecklistTemplateItem => Boolean(item));
  const homeworkItems = (lesson.content.homeworkChecklistItemIds ?? [])
    .map((itemId) => itemMap.get(itemId))
    .filter((item): item is ProgressChecklistTemplateItem => Boolean(item));
  return { template, taughtItems, homeworkItems };
}

function formatLessonChecklistSummary(
  items: ProgressChecklistTemplateItem[] | undefined,
  orderedItems?: ProgressChecklistTemplateItem[]
): string {
  if (!items || items.length === 0) return " 暂无";
  return ` ${items.map((item) => formatChecklistItemLine(item, orderedItems ?? items)).join("、")}`;
}

function isSelectedItemLinkedToLesson(
  itemId: string,
  lessonChecklist: {
    taughtItems: ProgressChecklistTemplateItem[];
    homeworkItems: ProgressChecklistTemplateItem[];
  } | null
): boolean {
  if (!lessonChecklist) return false;
  return [...lessonChecklist.taughtItems, ...lessonChecklist.homeworkItems].some((item) => item.id === itemId);
}

function buildLatestChecklistContextMap(
  vault: TeacherVault,
  courseGroupId: string,
  students: Student[]
): Map<string, LatestChecklistContext> {
  const map = new Map<string, LatestChecklistContext>();
  if (!courseGroupId) return map;

  students.forEach((student) => {
    const lessons = vault.lessons
      .filter((lesson) => lesson.courseGroupId === courseGroupId && lessonStudentIds(lesson).includes(student.id))
      .sort(sortLessons);
    const records = (vault.studentProgressRecords ?? [])
      .filter((record) => record.courseGroupId === courseGroupId && record.studentId === student.id)
      .sort((a, b) => `${a.date} ${a.updatedAt}`.localeCompare(`${b.date} ${b.updatedAt}`));
    map.set(student.id, {
      lesson: lessons.at(-1),
      record: records.at(-1)
    });
  });

  return map;
}

function buildChecklistAiInstruction(prompt: string): string {
  const normalized = prompt.trim();
  if (!examChecklistPattern.test(normalized)) return normalized;

  return [
    normalized,
    "",
    "本次清单检测为真题/试卷/考试类清单：",
    "1. 不要按教材章节目录生成条目；即使用户提到“教材相同/教材版本”，也只把它当作筛选真题范围的条件。",
    "2. 请按试卷来源、城市/地区、年份、题型、专题、复盘步骤等组织条目。",
    "3. chapter 字段写分组标签，例如“连云港卷”“南京卷”“实验探究题”“力学综合题”“错题复盘”。",
    "4. title 字段写具体可完成任务，例如“完成连云港卷选择题并订正错因”，不能只写“声现象”“光现象”“物态变化”等教材章节名。",
    "5. 如果无法确认具体十三市试卷题号，不要编造题号；可以生成按城市卷/题型/专题完成与订正的任务清单。"
  ].join("\n");
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
