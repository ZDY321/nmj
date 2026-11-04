import { useEffect, useMemo, useState } from "react";
import {
  BookCheck,
  CalendarDays,
  CheckCheck,
  Copy,
  ClipboardList,
  CornerUpLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Plus,
  Save,
  Search,
  Trash2,
  X
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
import {
  buildChecklistDateMarkers,
  checklistCellKey,
  checklistCompletionHomeworkStatus,
  checklistCompletionIsComplete,
  checklistCompletionSource,
  checklistCompletionDateChanged,
  checklistLessonIdsForDateMarker,
  checklistTemplateMatchesContext,
  formatChecklistItemLine,
  formatChecklistItemTitle,
  stripChecklistTitlePrefix,
  type ChecklistDateMarker,
  type ProgressChecklistFocus
} from "@/frontend/lib/progressChecklist";
import { stringValue } from "@/frontend/lib/typeGuards";
import {
  campusName,
  compareByName,
  courseHasActiveStudent,
  courseName,
  courseTypeLabel,
  findStudent,
  lessonStudentIds,
  lessonStatusLabels,
  sortCoursesByName,
  subjectOptionsForVault
} from "@/frontend/lib/helpers";
import type {
  AiProviderConfig,
  AiScheduleDraftResponse,
  Lesson,
  ProgressChecklistCompletion,
  ProgressChecklistTemplate,
  ProgressChecklistTemplateItem,
  Student,
  TeacherVault,
  UserRole
} from "@/shared/types";

type ChecklistCellSelection = {
  studentId: string;
  itemId: string;
};

const NEW_TEMPLATE_ID = "__new_template__";
const NEW_COMPLETION_ID = "__new_completion__";
const examChecklistPattern = /真题|试卷|中考|高考|模考|联考|统考|一模|二模|市卷|省卷|十三市|城市|题型|专题|压轴|实验题|选择题|填空题|计算题|综合题/;

export function ProgressChecklistView({
  vault,
  token,
  role,
  focusRequest,
  onSaveChecklistTemplate,
  onDeleteChecklistTemplate,
  onSaveChecklistCompletion,
  onDeleteChecklistCompletion,
  onOpenLessonInRecords,
  onSaveExternalPromptTemplate
}: {
  vault: TeacherVault;
  token?: string;
  role: UserRole;
  focusRequest?: ProgressChecklistFocus | null;
  onSaveChecklistTemplate: (template: ProgressChecklistTemplate) => void;
  onDeleteChecklistTemplate: (templateId: string) => void;
  onSaveChecklistCompletion: (completion: ProgressChecklistCompletion) => void;
  onDeleteChecklistCompletion: (completionId: string) => void;
  onOpenLessonInRecords?: (lesson: Lesson) => void;
  onSaveExternalPromptTemplate?: (template: string) => void;
}) {
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateNote, setTemplateNote] = useState("");
  const [templateItemsText, setTemplateItemsText] = useState("");
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [showOnlyIncomplete, setShowOnlyIncomplete] = useState(false);
  const [selectedCell, setSelectedCell] = useState<ChecklistCellSelection | null>(null);
  const [selectedCompletionId, setSelectedCompletionId] = useState(NEW_COMPLETION_ID);
  const [selectedDateDetail, setSelectedDateDetail] = useState<ChecklistDateMarker | null>(null);
  const [completionSource, setCompletionSource] = useState<"taught" | "homework">("homework");
  const [homeworkStatus, setHomeworkStatus] = useState<"not_started" | "partial" | "completed">("not_started");
  const [selectedCellDate, setSelectedCellDate] = useState(todayIso());
  const [completionNote, setCompletionNote] = useState("");
  const [aiProviders, setAiProviders] = useState<AiProviderConfig[]>([]);
  const [aiProviderId, setAiProviderId] = useState("");
  const [aiPrompt, setAiPrompt] = useState("请按教材、真题、专题或题型要求生成一套可逐项勾选的学习清单模板，适合学生按完成日期记录。");
  const [aiMessage, setAiMessage] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [promptCopyMessage, setPromptCopyMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const { confirm, dialog } = useConfirmDialog();
  const aiFeatureEnabled = role === "admin"
    ? Boolean(vault.profile.aiSchedulingAdminEnabled ?? vault.profile.aiSchedulingEnabled)
    : Boolean(vault.profile.aiSchedulingEnabled);

  const subjectOptions = useMemo(() => subjectOptionsForVault(vault), [vault]);
  const courseOptions = useMemo(
    () => sortCoursesByName(vault.courseGroups).filter((course) => course.status === "active" && courseHasActiveStudent(vault, course)),
    [vault]
  );
  const allTemplates = useMemo(
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
    if (!token || !aiFeatureEnabled) {
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
  }, [token, aiFeatureEnabled]);

  useEffect(() => {
    if (!selectedDateDetail) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedDateDetail(null);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selectedDateDetail]);

  const selectedCourse = courseOptions.find((course) => course.id === selectedCourseId);
  const focusLesson = focusRequest?.lessonId ? vault.lessons.find((lesson) => lesson.id === focusRequest.lessonId) : undefined;

  const courseStudents = useMemo(
    () =>
      (selectedCourse?.studentIds ?? [])
        .map((studentId) => findStudent(vault, studentId))
        .filter((student): student is Student => Boolean(student && student.status === "active"))
        .sort((a, b) => compareByName(a.name, b.name) || a.id.localeCompare(b.id)),
    [selectedCourse?.id, selectedCourse?.studentIds, vault]
  );
  const templates = useMemo(
    () => allTemplates.filter((template) => !selectedCourse || checklistTemplateMatchesContext(template, {
      subject: selectedCourse.subject,
      grades: courseStudents.map((student) => student.grade ?? ""),
      gradeOptions: vault.preferences?.grades
    })),
    [allTemplates, selectedCourse?.id, selectedCourse?.subject, courseStudents, vault.preferences?.grades]
  );
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);

  useEffect(() => {
    if (selectedTemplateId === NEW_TEMPLATE_ID) return;
    if (!templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0]?.id ?? "");
    }
  }, [templates, selectedTemplateId]);

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
  }, [selectedTemplateId, selectedTemplate?.id, selectedTemplate?.updatedAt, selectedCourse?.subject]);

  const selectedStudents = courseStudents;
  const selectedStudentIds = useMemo(() => new Set(selectedStudents.map((student) => student.id)), [selectedStudents]);

  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.courseGroupId) setSelectedCourseId(focusRequest.courseGroupId);
    if (focusRequest.templateId) setSelectedTemplateId(focusRequest.templateId);
    if (focusRequest.date) setSelectedCellDate(focusRequest.date);
    if (focusRequest.studentId && focusRequest.itemId) {
      setSelectedCell({ studentId: focusRequest.studentId, itemId: focusRequest.itemId });
      const matchingCompletion = (vault.progressChecklistCompletions ?? [])
        .filter((completion) => completion.templateId === focusRequest.templateId
          && completion.courseGroupId === focusRequest.courseGroupId
          && completion.studentId === focusRequest.studentId
          && completion.itemId === focusRequest.itemId)
        .sort(compareChecklistCompletions)
        .at(-1);
      setSelectedCompletionId(matchingCompletion?.id ?? NEW_COMPLETION_ID);
    }
    setTemplatePanelOpen(false);
    setSyncMessage("");
  }, [focusRequest?.nonce]);

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
        (completion) => completion.templateId === selectedTemplateId && completion.courseGroupId === selectedCourseId && selectedStudentIds.has(completion.studentId)
      ),
    [vault.progressChecklistCompletions, selectedTemplateId, selectedCourseId, selectedStudentIds]
  );
  const completionGroupsByCell = useMemo(() => {
    const groups = new Map<string, ProgressChecklistCompletion[]>();
    completionList.forEach((completion) => {
      const key = checklistCellKey(completion.studentId, completion.itemId);
      groups.set(key, [...(groups.get(key) ?? []), completion]);
    });
    return groups;
  }, [completionList]);
  const lessonDateMarkers = useMemo(() => {
    if (selectedTemplateId === NEW_TEMPLATE_ID) return [];
    const validItemIds = new Set(allItems.map((item) => item.id));
    return vault.lessons.flatMap((lesson) => {
      if (lesson.courseGroupId !== selectedCourseId
        || lesson.content.checklistTemplateId !== selectedTemplateId
        || (lesson.status !== "completed" && lesson.status !== "makeup_completed")) {
        return [];
      }
      const linkedItemIds = Array.from(new Set(lesson.content.taughtChecklistItemIds ?? []))
        .filter((itemId) => validItemIds.has(itemId));
      if (linkedItemIds.length === 0) return [];
      const activeStudentIds = lessonStudentIds(lesson).filter((studentId) => selectedStudentIds.has(studentId));
      return activeStudentIds.flatMap((studentId) => linkedItemIds.map((itemId) => ({
        studentId,
        itemId,
        date: lesson.date,
        lessonId: lesson.id
      })));
    });
  }, [allItems, selectedCourseId, selectedStudentIds, selectedTemplateId, vault.lessons]);
  const dateMarkersByCell = useMemo(
    () => buildChecklistDateMarkers(completionList, lessonDateMarkers),
    [completionList, lessonDateMarkers]
  );
  const completionMap = useMemo(() => {
    const map = new Map<string, ProgressChecklistCompletion>();
    completionGroupsByCell.forEach((completions, key) => {
      const completion = completions
        .filter(checklistCompletionIsComplete)
        .slice()
        .sort(compareChecklistCompletions)
        .at(-1);
      if (completion) map.set(key, completion);
    });
    return map;
  }, [completionGroupsByCell]);
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
  const selectedCompletions = selectedCell ? completionGroupsByCell.get(checklistCellKey(selectedCell.studentId, selectedCell.itemId)) ?? [] : [];
  const selectedCompletion = selectedCompletions.find((completion) => completion.id === selectedCompletionId);

  useEffect(() => {
    setSelectedCellDate(selectedCompletion?.completedDate ?? todayIso());
    setCompletionNote(selectedCompletion?.note ?? "");
    setCompletionSource(selectedCompletion ? resolveCompletionSource(selectedCompletion) : "homework");
    setHomeworkStatus(selectedCompletion ? checklistCompletionHomeworkStatus(selectedCompletion) ?? "completed" : "not_started");
  }, [selectedCompletion?.id, selectedCompletion?.completedDate, selectedCompletion?.note, selectedCompletionId, selectedCell?.studentId, selectedCell?.itemId]);

  const totalPossible = selectedStudents.length * allItems.length;
  const completedCount = completionMap.size;
  const pendingCount = Math.max(totalPossible - completedCount, 0);
  const fullyCompletedStudents = allItems.length === 0
    ? 0
    : selectedStudents.filter((student) => allItems.every((item) => completionMap.has(checklistCellKey(student.id, item.id)))).length;
  const defaultExternalPromptText = `请帮我生成一套学习清单模板，用于教务系统逐项勾选学生完成情况。\n生成内容：\n请按 新版连云港【初中物理苏科版八年级下册】教材要求生成一套可逐项勾选的学习清单模板，适合学生按完成日期记录。\n生成格式要求：\n如果是教材清单，条目标题必须带上教材的章节小标序号（如 1.1、1.2、2.1），不要省略编号。\n如果是真题/试卷清单，分组用地区或年份，条目写试卷名称，不需要编号。\n如果是题型/专题清单，分组用题型名或专题名，条目写具体考点或知识点，不需要编号。\n只输出清单正文；每行一个条目；有分组时使用”分组｜条目标题”的格式；不要输出 Markdown 表格；不要输出解释文字。\n\n教材章节示例：\n第一章 声现象｜1.1 声音是什么\n第一章 声现象｜1.2 乐音与噪声\n第二章 物态变化｜2.1 物质的三态 温度的测量\n\n真题试卷示例：\n2024年连云港卷｜2024年连云港中考物理试卷\n2023年南京卷｜2023年南京中考物理试卷\n\n题型专题示例：\n实验探究题｜凸透镜成像实验\n力学综合题｜浮力与压强综合\n电学专题｜串并联电路识别与计算`;
  const [externalPromptText, setExternalPromptText] = useState(
    vault.preferences?.checklistPromptTemplate || defaultExternalPromptText
  );

  function startNewTemplate() {
    setTemplatePanelOpen(true);
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
    setSyncMessage("");
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
      items: buildStableTemplateItems(parsedItems, existingItems),
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
    const completions = completionGroupsByCell.get(checklistCellKey(studentId, itemId)) ?? [];
    setSelectedCompletionId(completions.slice().sort(compareChecklistCompletions).at(-1)?.id ?? NEW_COMPLETION_ID);
  }

  function saveSelectedCompletion() {
    if (!selectedCourse || !selectedTemplate || !selectedStudent || !selectedItem) return;
    const now = new Date().toISOString();
    const completedDate = selectedCellDate || todayIso();
    const dateChanged = checklistCompletionDateChanged(selectedCompletion?.completedDate, completedDate);
    const note = completionNote.trim() || undefined;
    const matchingLesson = findUniqueChecklistLessonForDate(vault.lessons, selectedCourse.id, selectedStudent.id, completedDate);
    const completion: ProgressChecklistCompletion = {
      ...(selectedCompletion ?? {}),
      id: dateChanged ? makeId("progress_completion") : selectedCompletion?.id ?? makeId("progress_completion"),
      templateId: selectedTemplate.id,
      itemId: selectedItem.id,
      studentId: selectedStudent.id,
      courseGroupId: selectedCourse.id,
      source: completionSource,
      homeworkStatus: completionSource === "homework" ? homeworkStatus : undefined,
      homeworkProgress: undefined,
      completedDate,
      lessonId: matchingLesson?.id ?? (dateChanged ? undefined : selectedCompletion?.lessonId),
      note,
      updatedAt: now
    };
    onSaveChecklistCompletion(completion);
    setSelectedCompletionId(completion.id);
  }

  function startNewCompletion() {
    setSelectedCompletionId(NEW_COMPLETION_ID);
    setCompletionSource("homework");
    setHomeworkStatus("not_started");
    setSelectedCellDate(todayIso());
    setCompletionNote("");
  }

  function deleteSelectedCompletion() {
    if (!selectedCompletion) return;
    confirm({
      title: "删除这条记录？",
      description: `将删除 ${selectedCompletion.completedDate} 的${resolveCompletionSource(selectedCompletion) === "taught" ? "课堂" : "作业"}记录，不影响其他日期。`,
      confirmLabel: "删除记录",
      tone: "danger",
      onConfirm: () => {
        onDeleteChecklistCompletion(selectedCompletion.id);
        setSelectedCompletionId(NEW_COMPLETION_ID);
      }
    });
  }

  async function copyExternalAiPrompt() {
    try {
      await navigator.clipboard.writeText(externalPromptText);
      setPromptCopyMessage("已复制提示词");
    } catch {
      setPromptCopyMessage("复制失败，请手动选中复制");
    }
  }

  function saveExternalPromptTemplate() {
    if (onSaveExternalPromptTemplate) {
      onSaveExternalPromptTemplate(externalPromptText);
      setPromptCopyMessage("模板已保存");
    }
  }

  async function generateAiTemplateDraft() {
    if (!aiFeatureEnabled) {
      setAiMessage("前端 AI 已关闭，可复制下方提示词到外部 AI 使用。");
      return;
    }
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
            "title 字段要服从用户原话；用户要求试卷名字/名称/目录时，只写试卷名称，不要额外加“完成、订正、复盘、错因”等动作词。"
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

  const selectedDateDetailItem = selectedDateDetail
    ? allItems.find((item) => item.id === selectedDateDetail.itemId)
    : undefined;
  const selectedDateDetailLessons = selectedDateDetail
    ? checklistLessonsForDateMarker(selectedDateDetail, selectedCourse?.id ?? "", vault.lessons, selectedDateDetail.studentId)
    : [];

  return (
    <div className="space-y-6">
      {dialog}

      {selectedDateDetail && (
        <div
          role="presentation"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#061226]/45 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedDateDetail(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="checklist-date-detail-title"
            className="flex max-h-[88vh] w-full max-w-[720px] flex-col overflow-hidden rounded-[12px] border border-[#dbe4ef] bg-white shadow-[0_28px_80px_rgba(6,18,38,0.28)]"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[#e8eef6] p-5">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2 text-xs font-bold text-[#1557c2]">
                  <CalendarDays size={15} /> 清单日期详情
                </div>
                <h2 id="checklist-date-detail-title" className="text-lg font-extrabold text-[#061226]">
                  {selectedDateDetail.date} · {findStudent(vault, selectedDateDetail.studentId)?.name ?? "学生"}
                </h2>
                <div className="mt-1 text-sm font-semibold text-[#64748b]">
                  {selectedCourse?.name ?? "课程"} · {selectedDateDetailItem ? formatChecklistItemTitle(selectedDateDetailItem, allItems) : "清单条目"}
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="关闭日期详情" onClick={() => setSelectedDateDetail(null)}>
                <X size={18} />
              </Button>
            </header>

            <div className="min-h-0 space-y-5 overflow-y-auto p-5">
              <section className="space-y-2">
                <h3 className="text-sm font-extrabold text-[#25324a]">关联课程详情 · {selectedDateDetailLessons.length} 节</h3>
                {selectedDateDetailLessons.length > 0 ? selectedDateDetailLessons.map((lesson) => (
                  <article key={lesson.id} className="rounded-[8px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1 text-sm">
                        <div className="font-extrabold text-[#061226]">{courseName(vault, lesson.courseGroupId)}</div>
                        <div className="font-semibold text-[#475569]">{lesson.date} · {lesson.startTime}-{lesson.endTime}</div>
                        <div className="text-xs font-semibold text-[#64748b]">
                          {campusName(vault, lesson.campusId ?? selectedCourse?.defaultCampusId)} · {lessonStatusLabels[lesson.status]}
                        </div>
                        {lesson.content.taught.trim() && (
                          <p className="mt-2 whitespace-pre-wrap text-xs font-medium leading-5 text-[#475569]">{lesson.content.taught}</p>
                        )}
                      </div>
                      {onOpenLessonInRecords && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="shrink-0 border-[#bfdbfe] bg-white text-[#1557c2]"
                          onClick={() => {
                            setSelectedDateDetail(null);
                            onOpenLessonInRecords(lesson);
                          }}
                        >
                          <ExternalLink size={14} /> 打开课程详情
                        </Button>
                      )}
                    </div>
                  </article>
                )) : (
                  <div className="rounded-[8px] border border-dashed border-[#cbd6e3] p-4 text-sm font-semibold text-[#64748b]">
                    这一天没有找到明确关联的课程记录。
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-extrabold text-[#25324a]">完成记录 · {selectedDateDetail.completions.length} 条</h3>
                {selectedDateDetail.completions.length > 0 ? selectedDateDetail.completions.map((completion) => (
                  <div key={completion.id} className="flex flex-col gap-2 rounded-[8px] border border-[#e2e8f0] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 text-sm">
                      <div className="font-bold text-[#25324a]">{completion.completedDate} · {completionStateLabel(completion)}</div>
                      {completion.note && <div className="mt-1 whitespace-pre-wrap text-xs text-[#64748b]">{completion.note}</div>}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => {
                        setSelectedCell({ studentId: selectedDateDetail.studentId, itemId: selectedDateDetail.itemId });
                        setSelectedCompletionId(completion.id);
                        setSelectedDateDetail(null);
                      }}
                    >
                      编辑记录
                    </Button>
                  </div>
                )) : (
                  <div className="text-xs font-medium text-[#64748b]">此日期来自课程中关联的授课内容，没有单独的完成记录。</div>
                )}
              </section>
            </div>

            <footer className="flex justify-end border-t border-[#e8eef6] bg-[#f8fbff] p-4">
              <Button type="button" variant="outline" onClick={() => setSelectedDateDetail(null)}>关闭</Button>
            </footer>
          </section>
        </div>
      )}

      {focusLesson && onOpenLessonInRecords && (
        <div className="flex flex-col gap-3 rounded-[14px] border border-[#bfdbfe] bg-[#f8fbff] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm font-semibold leading-6 text-[#475569]">
            <div className="font-extrabold text-[#25324a]">来自课程详情</div>
            <div>{courseName(vault, focusLesson.courseGroupId)} · {focusLesson.date} {focusLesson.startTime}-{focusLesson.endTime}</div>
          </div>
          <Button type="button" variant="outline" className="w-fit border-[#bfdbfe] bg-white text-[#1557c2]" onClick={() => onOpenLessonInRecords(focusLesson)}>
            <CornerUpLeft size={15} /> 返回当前课时
          </Button>
        </div>
      )}

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
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                  <ClipboardList size={14} /> 学习清单模板
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
              </div>
              <CardTitle>模板管理</CardTitle>
              <CardDescription>把同一本书或同一套知识点整理成固定清单，后续可重复用于不同学生课程。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-bold text-[#25324a]">已有模板</label>
                  <Button type="button" variant="outline" size="sm" onClick={startNewTemplate}>
                    <Plus size={15} /> 新建
                  </Button>
                </div>
                <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
                  {selectedTemplateId === NEW_TEMPLATE_ID && (
                    <div role="status" className="rounded-[12px] border border-[#93c5fd] bg-[#eff6ff] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 break-words font-extrabold text-[#061226]">{currentTemplateName || "新建模板"}</div>
                        <Badge variant="amber" className="shrink-0">未保存</Badge>
                      </div>
                      <div className="mt-1 text-xs font-semibold text-[#64748b]">在下方编辑内容，点击“保存”即可创建。</div>
                    </div>
                  )}
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
                  {templates.length === 0 && selectedTemplateId !== NEW_TEMPLATE_ID && (
                    <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-4 text-sm font-semibold text-[#64748b]">
                      还没有模板，点击右上方“新建”创建一套教材清单。
                    </div>
                  )}
                </div>
              </div>

              {aiFeatureEnabled && (
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

              <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-extrabold text-[#25324a]">
                      <BookCheck size={16} className="text-[#1557c2]" /> 外部AI提示词生成模板示例
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={saveExternalPromptTemplate} disabled={externalPromptText.trim() === (vault.preferences?.checklistPromptTemplate ?? "").trim()}>
                        <Save size={14} /> 保存
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={copyExternalAiPrompt}>
                        <Copy size={14} /> 复制
                      </Button>
                    </div>
                  </div>
                  <div className="mb-2 text-xs font-semibold text-[#64748b]">建议使用豆包或DeepSeek</div>
                  <Textarea value={externalPromptText} onChange={(event) => setExternalPromptText(event.target.value)} className="min-h-[160px] bg-white text-xs leading-5" />
                  {promptCopyMessage && <Badge variant={promptCopyMessage.includes("已") ? "sage" : "secondary"} className="mt-3">{promptCopyMessage}</Badge>}
                  <div className="mt-2 text-xs font-semibold leading-5 text-[#64748b]">
                    格式说明：每行一个条目，用竖线（｜）分隔左右两列。左侧为分组标签，右侧为条目标题，具体内容可自行调整。
                  </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-extrabold text-[#25324a]">{selectedTemplate ? "编辑模板" : "新建模板"}</div>
                {selectedTemplate && (
                  <Button type="button" variant="destructive" size="sm" onClick={askDeleteTemplate}>
                    <Trash2 size={15} /> 删除
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <label htmlFor="checklist-template-name" className="text-sm font-bold text-[#25324a]">模板名称</label>
                <Input id="checklist-template-name" value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="例如：2025 江苏中考物理真题清单" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-[#25324a]">关联科目</label>
                <Select value={templateSubject} onChange={(event) => setTemplateSubject(event.target.value)}>
                  <option value="">请选择科目</option>
                  {subjectOptions.map((subject) => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="checklist-template-items" className="text-sm font-bold text-[#25324a]">条目清单</label>
                <Textarea
                  id="checklist-template-items"
                  value={templateItemsText}
                  onChange={(event) => setTemplateItemsText(event.target.value)}
                  placeholder={"每行一个知识点，例如：\n整式乘法\n平方差公式\n完全平方公式"}
                  className="min-h-[220px]"
                />
                <div className="text-xs font-semibold leading-5 text-[#64748b]">
                  保存时会按条目内容保留原有勾选记录；中间插入新行不会把历史记录串到下一条。
                </div>
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
              <div className="space-y-2">
                <Button
                  type="button"
                  onClick={saveTemplate}
                  disabled={!canSaveTemplate}
                  className="w-full disabled:border-[#e5e7eb] disabled:bg-[#f3f4f6] disabled:text-[#9ca3af] disabled:shadow-none"
                >
                  <Save size={15} /> 保存
                </Button>
                {!currentTemplateName || draftTemplateItems.length === 0 ? (
                  <div className="text-xs font-semibold text-[#64748b]">填写模板名称和至少一条清单内容后即可保存。</div>
                ) : null}
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
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                <div className="space-y-2 lg:col-span-2">
                  <label className="text-sm font-bold text-[#25324a]">选择课程</label>
                  <Select value={selectedCourseId} onChange={(event) => { setSelectedCourseId(event.target.value); setSelectedDateDetail(null); setSyncMessage(""); }}>
                    <option value="">请选择课程</option>
                    {courseOptions.map((course) => (
                      <option key={course.id} value={course.id}>{course.name} · {course.subject}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2 lg:col-span-2">
                  <label className="text-sm font-bold text-[#25324a]">选择模板</label>
                  <Select value={selectedTemplateId} onChange={(event) => { setSelectedTemplateId(event.target.value); setSelectedDateDetail(null); }}>
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
                  <Badge variant="sky">显示 {selectedStudents.length}/{courseStudents.length} 人</Badge>
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
                  <CardDescription>按日期查看课堂和作业状态；选择单元格后可编辑每条历史记录。</CardDescription>
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
                              const cellKey = checklistCellKey(student.id, item.id);
                              const dateMarkers = dateMarkersByCell.get(cellKey) ?? [];
                              const active = selectedCell?.studentId === student.id && selectedCell.itemId === item.id;
                              return (
                                <td key={`${student.id}-${item.id}`} className="border-b border-r border-[#dbe4ef] p-2 align-top">
                                  <div
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => selectChecklistCell(student.id, item.id)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                          event.preventDefault();
                                          selectChecklistCell(student.id, item.id);
                                        }
                                      }}
                                      className={`flex min-h-[68px] w-full flex-col items-center justify-center gap-1 rounded-[6px] border px-2 py-2 text-center transition-colors ${
                                        active
                                          ? "border-[#ff8617] bg-[#fff7ed]"
                                          : dateMarkers.length > 0
                                            ? "border-[#cbd5e1] bg-white hover:border-[#93c5fd]"
                                            : "border-[#e8eef6] bg-[#f8fbff] hover:border-[#93c5fd] hover:bg-[#eef5ff]"
                                      }`}
                                    >
                                      {dateMarkers.length > 0 ? (
                                        <div className="flex w-full flex-col items-center gap-1">
                                          {dateMarkers.map((marker) => {
                                            const representative = marker.completions.at(-1);
                                            const states = Array.from(new Set(marker.completions.map(completionStateLabel)));
                                            const associatedLessonCount = checklistLessonsForDateMarker(
                                              marker,
                                              selectedCourse?.id ?? "",
                                              vault.lessons,
                                              student.id
                                            ).length;
                                            const markerTitle = [
                                              ...states,
                                              associatedLessonCount > 0 ? `${associatedLessonCount} 节关联课程` : "无关联课程"
                                            ].join(" · ");
                                            return (
                                              <button
                                                key={marker.date}
                                                type="button"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  setSelectedDateDetail(marker);
                                                }}
                                                aria-label={`查看 ${marker.date} 的课程详情和完成记录`}
                                                title={`${marker.date} · ${markerTitle}`}
                                                className={`max-w-full whitespace-nowrap rounded-[4px] px-1.5 py-1 text-[10px] font-extrabold leading-none hover:brightness-95 ${representative ? completionStateClasses(representative) : "bg-[#dbeafe] text-[#1d4ed8]"}`}
                                              >
                                                {marker.date}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        <span className="text-xs font-bold text-[#94a3b8]">无记录</span>
                                      )}
                                  </div>
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
                <CardDescription>选择学生和知识点后，在这里查看并维护每个日期的记录。</CardDescription>
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
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-sm font-bold text-[#25324a]">完成日期记录 ({selectedCompletions.length})</label>
                        <Button type="button" variant="outline" size="sm" onClick={startNewCompletion}>
                          <Plus size={14} /> 新增记录
                        </Button>
                      </div>
                      {selectedCompletions.length > 0 ? (
                        <div className="max-h-48 space-y-1 overflow-y-auto">
                          {selectedCompletions.slice().sort(compareChecklistCompletions).map((entry) => (
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() => setSelectedCompletionId(entry.id)}
                              className={`flex w-full items-center justify-between gap-3 rounded-[6px] border px-3 py-2 text-left text-xs font-bold ${selectedCompletionId === entry.id ? "border-[#ff8617] bg-[#fff7ed]" : "border-[#e2e8f0] bg-white hover:bg-[#f8fbff]"}`}
                            >
                              <span>{entry.completedDate} · {completionStateLabel(entry)}</span>
                              <span className="text-[#64748b]">{selectedCompletionId === entry.id ? "编辑中" : "编辑"}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-[6px] border border-dashed border-[#cbd6e3] px-3 py-2 text-xs text-[#64748b]">还没有记录，新增一条开始记录。</div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-[#25324a]">日期</label>
                        <Input type="date" value={selectedCellDate} onChange={(event) => setSelectedCellDate(event.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-[#25324a]">记录类型</label>
                        <Select value={completionSource} onChange={(event) => setCompletionSource(event.target.value as "taught" | "homework")}>
                          <option value="taught">课堂</option>
                          <option value="homework">作业</option>
                        </Select>
                      </div>
                    </div>

                    {completionSource === "homework" && (
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-[#25324a]">作业状态</label>
                        <Select value={homeworkStatus} onChange={(event) => setHomeworkStatus(event.target.value as "not_started" | "partial" | "completed")}>
                          <option value="not_started">未完成</option>
                          <option value="partial">部分完成</option>
                          <option value="completed">已完成</option>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-[#25324a]">备注</label>
                      <Textarea
                        value={completionNote}
                        onChange={(event) => setCompletionNote(event.target.value)}
                        placeholder="例如：今天只完成前半部分；课堂会做但课后还要再练；已和家长说明需要补一节。"
                        className="min-h-[88px]"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button type="button" onClick={saveSelectedCompletion}>
                        <Save size={15} /> {selectedCompletion ? "保存记录" : "新增记录"}
                      </Button>
                      <Button type="button" variant="destructive" onClick={deleteSelectedCompletion} disabled={!selectedCompletion}>
                        <Trash2 size={15} /> 删除这条记录
                      </Button>
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

function compareChecklistCompletions(a: ProgressChecklistCompletion, b: ProgressChecklistCompletion): number {
  return `${a.completedDate} ${a.updatedAt} ${a.id}`.localeCompare(`${b.completedDate} ${b.updatedAt} ${b.id}`);
}

function checklistLessonsForDateMarker(
  marker: ChecklistDateMarker,
  courseGroupId: string,
  lessons: Lesson[],
  studentId: string
): Lesson[] {
  const lessonIds = checklistLessonIdsForDateMarker(
    marker,
    lessons.map((lesson) => ({
      id: lesson.id,
      date: lesson.date,
      courseGroupId: lesson.courseGroupId,
      status: lesson.status,
      studentIds: lessonStudentIds(lesson)
    })),
    courseGroupId,
    studentId
  );
  const linkedIds = new Set(lessonIds);
  return lessons
    .filter((lesson) => linkedIds.has(lesson.id))
    .sort((a, b) => `${a.startTime} ${a.id}`.localeCompare(`${b.startTime} ${b.id}`));
}

function findUniqueChecklistLessonForDate(
  lessons: Lesson[],
  courseGroupId: string,
  studentId: string,
  date: string
): Lesson | undefined {
  const matchingLessons = lessons.filter((lesson) =>
    lesson.courseGroupId === courseGroupId &&
    lesson.date === date &&
    lesson.status !== "cancelled" &&
    lessonStudentIds(lesson).includes(studentId)
  );
  return matchingLessons.length === 1 ? matchingLessons[0] : undefined;
}

function resolveCompletionSource(completion: ProgressChecklistCompletion): "taught" | "homework" {
  return checklistCompletionSource(completion) ?? "homework";
}

function completionStateLabel(completion: ProgressChecklistCompletion): string {
  if (resolveCompletionSource(completion) === "taught") return "已讲";
  const status = checklistCompletionHomeworkStatus({ ...completion, source: "homework" });
  if (status === "not_started") return "未完成";
  if (status === "partial") return "部分完成";
  return "已完成";
}

function completionStateClasses(completion: ProgressChecklistCompletion): string {
  if (resolveCompletionSource(completion) === "taught") return "bg-[#dbeafe] text-[#1d4ed8]";
  const status = checklistCompletionHomeworkStatus({ ...completion, source: "homework" });
  if (status === "not_started") return "bg-[#e2e8f0] text-[#475569]";
  if (status === "partial") return "bg-[#ffedd5] text-[#c2410c]";
  return "bg-[#dcfce7] text-[#15803d]";
}

function buildStableTemplateItems(
  parsedItems: ProgressChecklistTemplateItem[],
  existingItems: ProgressChecklistTemplateItem[]
): ProgressChecklistTemplateItem[] {
  const existingByKey = new Map<string, ProgressChecklistTemplateItem[]>();
  existingItems.forEach((item) => {
    const key = checklistItemIdentityKey(item);
    existingByKey.set(key, [...(existingByKey.get(key) ?? []), item]);
  });
  return parsedItems.map((item, index) => {
    const matched = existingByKey.get(checklistItemIdentityKey(item))?.shift();
    return {
      id: matched?.id ?? makeId("progress_item"),
      chapter: item.chapter || matched?.chapter,
      title: item.title,
      note: matched?.note,
      order: index
    };
  });
}

function checklistItemIdentityKey(item: Pick<ProgressChecklistTemplateItem, "chapter" | "title">): string {
  return `${normalizeChecklistIdentityText(item.chapter ?? "")}\u001f${normalizeChecklistIdentityText(item.title)}`;
}

function normalizeChecklistIdentityText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
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

function buildChecklistAiInstruction(prompt: string): string {
  const normalized = prompt.trim();
  if (!examChecklistPattern.test(normalized)) return normalized;

  return [
    normalized,
    "",
    "本次清单检测为真题/试卷/考试类清单：",
    "1. 不要按教材章节目录生成条目；即使用户提到“教材相同/教材版本”，也只把它当作筛选真题范围的条件。",
    "2. 请按用户指定的粒度组织条目：用户说“试卷名字/试卷名称/目录/清单”时，只列试卷名称；用户说题型/专题/复盘时，才按题型、专题或复盘步骤组织。",
    "3. chapter 字段写分组标签，例如“连云港卷”“南京卷”“实验探究题”“力学综合题”“错题复盘”。",
    "4. title 字段不要自作主张加任务动作。用户要求生成试卷名字时，title 只写“2020年连云港中考物理试卷”这类名称，不要写“完成2020年连云港中考物理试卷并订正错因”。",
    "5. 如果无法确认具体试卷题号，不要编造题号；按用户指定年份、地区和科目生成试卷名称即可。"
  ].join("\n");
}
