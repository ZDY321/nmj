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
import {
  checklistCellKey,
  checklistCompletionAppliesToSource,
  checklistCompletionSource,
  formatChecklistItemLine,
  formatChecklistItemTitle,
  stripChecklistTitlePrefix,
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
  sortCoursesByName,
  sortLessons,
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
  StudentProgressRecord,
  TeacherVault,
  UserRole
} from "@/shared/types";

type ChecklistCellSelection = {
  studentId: string;
  itemId: string;
};

type ChecklistContextRelation = "selected" | "same_day" | "previous" | "next" | "record_only";

type LatestChecklistContext = {
  lesson?: Lesson;
  record?: StudentProgressRecord;
  relation?: ChecklistContextRelation;
};

type ChecklistSyncSource = "taught" | "homework";

type ChecklistSyncCandidate = {
  student: Student;
  item: ProgressChecklistTemplateItem;
  lesson: Lesson;
  record?: StudentProgressRecord;
  source: ChecklistSyncSource;
};

const NEW_TEMPLATE_ID = "__new_template__";
const examChecklistPattern = /真题|试卷|中考|高考|模考|联考|统考|一模|二模|市卷|省卷|十三市|城市|题型|专题|压轴|实验题|选择题|填空题|计算题|综合题/;

export function ProgressChecklistView({
  vault,
  token,
  role,
  focusRequest,
  onSaveChecklistTemplate,
  onDeleteChecklistTemplate,
  onSaveChecklistCompletion,
  onSaveChecklistCompletions,
  onDeleteChecklistCompletion,
  onDeleteChecklistCompletions,
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
  onSaveChecklistCompletions: (completions: ProgressChecklistCompletion[]) => void;
  onDeleteChecklistCompletion: (completionId: string) => void;
  onDeleteChecklistCompletions: (completionIds: string[]) => void;
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
  const [targetDate, setTargetDate] = useState(todayIso());
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [showOnlyLessonStudents, setShowOnlyLessonStudents] = useState(true);
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

  const selectedCourse = courseOptions.find((course) => course.id === selectedCourseId);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const focusLesson = focusRequest?.lessonId ? vault.lessons.find((lesson) => lesson.id === focusRequest.lessonId) : undefined;

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

  const targetDateLessons = useMemo(
    () =>
      vault.lessons
        .filter((lesson) => lesson.courseGroupId === selectedCourseId && lesson.date === targetDate && lesson.status !== "cancelled" && lessonStudentIds(lesson).some((studentId) => findStudent(vault, studentId)?.status === "active"))
        .sort(sortLessons),
    [vault, selectedCourseId, targetDate]
  );
  const selectedLesson = targetDateLessons.find((lesson) => lesson.id === selectedLessonId);

  const courseStudents = useMemo(
    () =>
      (selectedCourse?.studentIds ?? [])
        .map((studentId) => findStudent(vault, studentId))
        .filter((student): student is Student => Boolean(student && student.status === "active"))
        .sort((a, b) => compareByName(a.name, b.name) || a.id.localeCompare(b.id)),
    [selectedCourse?.id, selectedCourse?.studentIds, vault]
  );
  const lessonStudentIdSet = useMemo(
    () => new Set(selectedLesson ? lessonStudentIds(selectedLesson) : []),
    [selectedLesson]
  );
  const lessonStudents = useMemo(
    () => courseStudents.filter((student) => lessonStudentIdSet.has(student.id)),
    [courseStudents, lessonStudentIdSet]
  );
  const selectedStudents = useMemo(
    () => selectedLesson && showOnlyLessonStudents ? lessonStudents : courseStudents,
    [courseStudents, lessonStudents, selectedLesson, showOnlyLessonStudents]
  );
  const selectedStudentIds = useMemo(() => new Set(selectedStudents.map((student) => student.id)), [selectedStudents]);
  const targetContextByStudent = useMemo(
    () => buildLatestChecklistContextMap(vault, selectedCourseId, selectedStudents, targetDate, selectedLessonId),
    [vault, selectedCourseId, selectedStudents, targetDate, selectedLessonId]
  );
  const selectedCellContextByStudent = useMemo(
    () => buildLatestChecklistContextMap(vault, selectedCourseId, selectedStudents, selectedCellDate || targetDate, selectedLessonId),
    [vault, selectedCourseId, selectedStudents, selectedCellDate, targetDate, selectedLessonId]
  );

  useEffect(() => {
    if (selectedLessonId && !targetDateLessons.some((lesson) => lesson.id === selectedLessonId)) {
      setSelectedLessonId("");
    }
  }, [targetDateLessons, selectedLessonId]);

  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.courseGroupId) setSelectedCourseId(focusRequest.courseGroupId);
    if (focusRequest.templateId) setSelectedTemplateId(focusRequest.templateId);
    if (focusRequest.date) {
      setTargetDate(focusRequest.date);
      setSelectedCellDate(focusRequest.date);
    }
    if (focusRequest.lessonId) {
      setSelectedLessonId(focusRequest.lessonId);
      setShowOnlyLessonStudents(true);
    }
    if (focusRequest.studentId && focusRequest.itemId) {
      setSelectedCell({ studentId: focusRequest.studentId, itemId: focusRequest.itemId });
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
  const completionMap = useMemo(() => {
    const map = new Map<string, ProgressChecklistCompletion>();
    completionGroupsByCell.forEach((completions, key) => {
      const completion = primaryChecklistCompletion(completions);
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
      setSelectedCellDate(targetDate || todayIso());
      setCompletionNote("");
    }
  }, [selectedCell, selectedStudents, allItems, targetDate]);

  const selectedStudent = selectedStudents.find((student) => student.id === selectedCell?.studentId);
  const selectedItem = allItems.find((item) => item.id === selectedCell?.itemId);
  const selectedCompletions = selectedCell ? completionGroupsByCell.get(checklistCellKey(selectedCell.studentId, selectedCell.itemId)) ?? [] : [];
  const selectedCompletion = primaryChecklistCompletion(selectedCompletions);
  const selectedLatestContext = selectedStudent ? selectedCellContextByStudent.get(selectedStudent.id) : undefined;
  const selectedLatestLessonChecklist = selectedLatestContext?.lesson ? resolveLessonChecklistLinks(vault, selectedLatestContext.lesson) : null;
  const targetLessonChecklist = selectedLesson ? resolveLessonChecklistLinks(vault, selectedLesson) : null;
  const targetLessonLinkedItemSources = useMemo(
    () => buildLessonLinkedItemSourceMap(targetLessonChecklist),
    [targetLessonChecklist]
  );
  const pendingLessonLinkCompletions = useMemo(
    () => selectedCourse && selectedTemplate
      ? buildLessonLinkedCompletionCandidates(selectedTemplate, selectedStudents, targetContextByStudent, completionGroupsByCell, selectedLesson)
      : { taught: [], homework: [] },
    [selectedCourse?.id, selectedTemplate?.id, selectedTemplate?.updatedAt, selectedStudents, targetContextByStudent, completionGroupsByCell, selectedLesson]
  );

  useEffect(() => {
    setSelectedCellDate(selectedCompletion?.completedDate ?? targetDate);
    setCompletionNote(selectedCompletion?.note ?? "");
  }, [selectedCompletion?.id, selectedCompletion?.completedDate, selectedCompletion?.note, selectedCell?.studentId, selectedCell?.itemId, targetDate]);

  const totalPossible = selectedStudents.length * allItems.length;
  const completedCount = completionMap.size;
  const pendingCount = Math.max(totalPossible - completedCount, 0);
  const fullyCompletedStudents = allItems.length === 0
    ? 0
    : selectedStudents.filter((student) => allItems.every((item) => completionMap.has(checklistCellKey(student.id, item.id)))).length;
  const selectedItemBatchStudents = useMemo(
    () => selectedItem
      ? selectedStudents.filter((student) => !completionMap.has(checklistCellKey(student.id, selectedItem.id)))
      : [],
    [selectedItem, selectedStudents, completionMap]
  );
  const defaultExternalPromptText = `请帮我生成一套学习清单模板，用于教务系统逐项勾选学生完成情况。\n生成内容：\n请按 新版连云港【初中物理苏科版八年级下册】教材要求生成一套可逐项勾选的学习清单模板，适合学生按完成日期记录。\n生成格式要求：\n如果是教材清单，条目标题必须带上教材的章节小标序号（如 1.1、1.2、2.1），不要省略编号。\n如果是真题/试卷清单，分组用地区或年份，条目写试卷名称，不需要编号。\n如果是题型/专题清单，分组用题型名或专题名，条目写具体考点或知识点，不需要编号。\n只输出清单正文；每行一个条目；有分组时使用”分组｜条目标题”的格式；不要输出 Markdown 表格；不要输出解释文字。\n\n教材章节示例：\n第一章 声现象｜1.1 声音是什么\n第一章 声现象｜1.2 乐音与噪声\n第二章 物态变化｜2.1 物质的三态 温度的测量\n\n真题试卷示例：\n2024年连云港卷｜2024年连云港中考物理试卷\n2023年南京卷｜2023年南京中考物理试卷\n\n题型专题示例：\n实验探究题｜凸透镜成像实验\n力学综合题｜浮力与压强综合\n电学专题｜串并联电路识别与计算`;
  const [externalPromptText, setExternalPromptText] = useState(
    vault.preferences?.checklistPromptTemplate || defaultExternalPromptText
  );

  function startNewTemplate() {
    setSelectedTemplateId(NEW_TEMPLATE_ID);
    setTemplateName("");
    setTemplateSubject(selectedCourse?.subject ?? "");
    setTemplateNote("");
    setTemplateItemsText("");
    setItemSearch("");
    setShowOnlyIncomplete(false);
    setSelectedCell(null);
    setSelectedCellDate(targetDate || todayIso());
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
  }

  function saveSelectedCompletion() {
    if (!selectedCourse || !selectedTemplate || !selectedStudent || !selectedItem) return;
    const now = new Date().toISOString();
    const latestContext = selectedCellContextByStudent.get(selectedStudent.id);
    const completedDate = selectedCellDate || targetDate || todayIso();
    const note = completionNote.trim() || undefined;
    if (selectedCompletions.length > 0) {
      onSaveChecklistCompletions(selectedCompletions.map((completion) => ({
        ...completion,
        completedDate,
        lessonId: completion.lessonId ?? latestContext?.lesson?.id,
        progressRecordId: completion.progressRecordId ?? latestContext?.record?.id,
        note,
        updatedAt: now
      })));
      return;
    }
    onSaveChecklistCompletion({
      id: makeId("progress_completion"),
      templateId: selectedTemplate.id,
      itemId: selectedItem.id,
      studentId: selectedStudent.id,
      courseGroupId: selectedCourse.id,
      completedDate,
      lessonId: latestContext?.lesson?.id,
      progressRecordId: latestContext?.record?.id,
      note,
      updatedAt: now
    });
  }

  function clearSelectedCompletion() {
    if (selectedCompletions.length === 0) return;
    onDeleteChecklistCompletions(selectedCompletions.map((completion) => completion.id));
  }

  function syncLessonLinkedCompletions(source: ChecklistSyncSource) {
    if (!selectedCourse || !selectedTemplate) return;
    const candidates = pendingLessonLinkCompletions[source];
    if (candidates.length === 0) return;
    const now = new Date().toISOString();
    const sourceLabel = source === "taught" ? "课堂关联" : "作业关联";
    onSaveChecklistCompletions(candidates.map((candidate) => ({
      id: makeId("progress_completion"),
      templateId: selectedTemplate.id,
      itemId: candidate.item.id,
      studentId: candidate.student.id,
      courseGroupId: selectedCourse.id,
      source,
      completedDate: candidate.lesson.date || todayIso(),
      lessonId: candidate.lesson.id,
      progressRecordId: candidate.record?.id,
      note: `${sourceLabel}完成：${candidate.lesson.date} ${candidate.lesson.startTime}-${candidate.lesson.endTime}`,
      updatedAt: now
    })));
    setSyncMessage(`已完成 ${candidates.length} 个${sourceLabel}条目。`);
  }

  function saveSelectedItemForCurrentStudents() {
    if (!selectedCourse || !selectedTemplate || !selectedItem || selectedItemBatchStudents.length === 0) return;
    const now = new Date().toISOString();
    const completedDate = selectedCellDate || targetDate || todayIso();
    onSaveChecklistCompletions(selectedItemBatchStudents.map((student) => {
      const context = selectedCellContextByStudent.get(student.id);
      return {
        id: makeId("progress_completion"),
        templateId: selectedTemplate.id,
        itemId: selectedItem.id,
        studentId: student.id,
        courseGroupId: selectedCourse.id,
        completedDate,
        lessonId: context?.lesson?.id,
        progressRecordId: context?.record?.id,
        note: completionNote.trim() || `批量标记：${completedDate}`,
        updatedAt: now
      };
    }));
    setSyncMessage(`已把当前条目标记给 ${selectedItemBatchStudents.length} 名学生。`);
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
    setSelectedCellDate(targetDate || todayIso());
    setCompletionNote("");
    setTemplatePanelOpen(true);
    return Boolean(stringValue(templateObject.name) || itemTitles.length > 0 || stringValue(templateObject.note));
  }

  return (
    <div className="space-y-6">
      {dialog}

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

              <div className="space-y-2">
                <label className="text-sm font-bold text-[#25324a]">模板名称</label>
                <Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="例如：2025 江苏中考物理真题清单" />
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
                <label className="text-sm font-bold text-[#25324a]">条目清单</label>
                <Textarea
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
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                <div className="space-y-2 lg:col-span-2">
                  <label className="text-sm font-bold text-[#25324a]">选择课程</label>
                  <Select value={selectedCourseId} onChange={(event) => { setSelectedCourseId(event.target.value); setSelectedLessonId(""); setSyncMessage(""); }}>
                    <option value="">请选择课程</option>
                    {courseOptions.map((course) => (
                      <option key={course.id} value={course.id}>{course.name} · {course.subject}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#25324a]">清单日期</label>
                  <Input
                    type="date"
                    value={targetDate}
                    onChange={(event) => {
                      setTargetDate(event.target.value);
                      setSelectedCellDate(event.target.value);
                      setSelectedLessonId("");
                      setSyncMessage("");
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#25324a]">关联课时</label>
                  <Select value={selectedLessonId} onChange={(event) => { setSelectedLessonId(event.target.value); setSyncMessage(""); }} disabled={!selectedCourse}>
                    <option value="">按日期自动匹配</option>
                    {targetDateLessons.map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>{lesson.startTime}-{lesson.endTime} · {lessonStudentsLabel(vault, lesson)}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2 lg:col-span-2">
                  <label className="text-sm font-bold text-[#25324a]">选择模板</label>
                  <Select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                    <option value="">请选择模板</option>
                    {selectedTemplateId === NEW_TEMPLATE_ID && <option value={NEW_TEMPLATE_ID}>当前草稿（未保存）</option>}
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                  </Select>
                </div>
                <label className={`flex items-center gap-3 rounded-[12px] border px-3 py-2 text-sm font-bold ${selectedLesson ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1557c2]" : "border-[#e8eef6] bg-[#f8fbff] text-[#94a3b8]"}`}>
                  <input
                    type="checkbox"
                    checked={showOnlyLessonStudents}
                    onChange={(event) => setShowOnlyLessonStudents(event.target.checked)}
                    disabled={!selectedLesson}
                    className="h-4 w-4 accent-[#1557c2]"
                  />
                  只看本节学生
                </label>
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
                  {selectedLesson ? (
                    <Badge variant="plum">选中课时 {selectedLesson.date} {selectedLesson.startTime}-{selectedLesson.endTime}</Badge>
                  ) : (
                    <Badge variant="secondary">当天 {targetDateLessons.length} 节课</Badge>
                  )}
                  <Badge variant="amber">{fullyCompletedStudents} 人已全完成</Badge>
                </div>
              )}
              {selectedTemplateId === NEW_TEMPLATE_ID && (
                <div className="rounded-[12px] border border-[#fed7aa] bg-[#fff7ed] p-3 text-sm font-semibold leading-6 text-[#9a3412]">
                  当前下方显示的是未保存草稿。确认无误后点击“保存”，它才会进入正式模板列表并用于长期勾选记录。
                </div>
              )}
              {selectedCourse && selectedTemplate && (
                <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-extrabold text-[#25324a]">
                        <CheckCheck size={16} className="text-[#1557c2]" /> 课时关联完成
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Badge variant={selectedLesson ? "plum" : "secondary"}>{selectedLesson ? `本节 ${selectedLesson.startTime}-${selectedLesson.endTime}` : "按日期就近匹配"}</Badge>
                        <Badge variant="sky">课堂待完成 {pendingLessonLinkCompletions.taught.length}</Badge>
                        <Badge variant="amber">作业待完成 {pendingLessonLinkCompletions.homework.length}</Badge>
                        {syncMessage && <Badge variant="sage">{syncMessage}</Badge>}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button type="button" variant="outline" disabled={pendingLessonLinkCompletions.taught.length === 0} onClick={() => syncLessonLinkedCompletions("taught")}>
                        <CheckCheck size={15} /> 完成本节课堂
                      </Button>
                      <Button type="button" variant="outline" disabled={pendingLessonLinkCompletions.homework.length === 0} onClick={() => syncLessonLinkedCompletions("homework")}>
                        <CheckCheck size={15} /> 完成本节作业
                      </Button>
                    </div>
                  </div>
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
                          {visibleItems.map((item) => {
                            const linkSources = targetLessonLinkedItemSources.get(item.id) ?? [];
                            return (
                              <th key={item.id} className="sticky top-0 z-20 min-w-[150px] border-b border-r border-[#dbe4ef] bg-[#f8fbff] p-3 align-top text-xs font-extrabold text-[#25324a]">
                                {item.chapter && <div className="mb-1 text-[10px] font-bold text-[#5161d6]">{item.chapter}</div>}
                                <div className="max-h-[3.75rem] overflow-hidden leading-5">{formatChecklistItemTitle(item, allItems)}</div>
                                {linkSources.length > 0 && (
                                  <div className="mt-2 grid grid-cols-2 gap-1">
                                    {linkSources.map((source) => (
                                      <Badge key={source} variant={source === "taught" ? "sky" : "amber"} className="w-full justify-center whitespace-nowrap px-1.5 text-[10px]">{source === "taught" ? "上课内容" : "课后作业"}</Badge>
                                    ))}
                                  </div>
                                )}
                              </th>
                            );
                          })}
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
                              const completion = completionMap.get(cellKey);
                              const completions = completionGroupsByCell.get(cellKey) ?? [];
                              const completedSources = completionSourcesForDisplay(completions);
                              const active = selectedCell?.studentId === student.id && selectedCell.itemId === item.id;
                              const linkSources = targetLessonLinkedItemSources.get(item.id) ?? [];
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
                                        {completedSources.length > 0 && (
                                          <div className="mt-1 flex flex-wrap justify-center gap-1">
                                            {completedSources.map((source) => {
                                              const linkedCompletion = completions.find((c) => checklistCompletionSource(c) === source && c.lessonId);
                                              const linkedLesson = linkedCompletion?.lessonId ? vault.lessons.find((l) => l.id === linkedCompletion.lessonId) : undefined;
                                              if (linkedLesson && onOpenLessonInRecords) {
                                                return (
                                                  <Badge
                                                    key={source}
                                                    variant={source === "taught" ? "sky" : "amber"}
                                                    className="cursor-pointer px-1.5 py-0 text-[10px] hover:opacity-80"
                                                    onClick={(event: React.MouseEvent) => { event.stopPropagation(); onOpenLessonInRecords(linkedLesson); }}
                                                  >
                                                    {source === "taught" ? "课堂↗" : "作业↗"}
                                                  </Badge>
                                                );
                                              }
                                              return (
                                                <Badge key={source} variant={source === "taught" ? "sky" : "amber"} className="px-1.5 py-0 text-[10px]">
                                                  {source === "taught" ? "课堂" : "作业"}
                                                </Badge>
                                              );
                                            })}
                                          </div>
                                        )}
                                        {completion.note && (
                                          <div className="mt-1 max-h-[2.2rem] overflow-hidden text-[10px] font-semibold leading-4 text-[#166534]" title={completion.note}>
                                            {completion.note}
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <div className="text-xs font-bold text-[#94a3b8]">待完成</div>
                                        {linkSources.length > 0 && (
                                          <div className="mt-1 text-[10px] font-extrabold text-[#1557c2]">本节已关联</div>
                                        )}
                                      </>
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

                    <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
                      <div className="mb-2 text-sm font-extrabold text-[#25324a]">依托选中日期/课时记录</div>
                      <div className="space-y-2 text-sm text-[#475569]">
                        <div>
                          匹配课时：
                          <span className="font-semibold text-[#061226]">
                            {selectedLatestContext?.lesson
                              ? `${checklistContextRelationLabel(selectedLatestContext.relation)} ${selectedLatestContext.lesson.date} ${selectedLatestContext.lesson.startTime}-${selectedLatestContext.lesson.endTime}`
                              : " 暂无"}
                          </span>
                        </div>
                        <div>
                          匹配课堂关联：
                          <span className="font-semibold text-[#061226]">
                            {formatLessonChecklistSummary(selectedLatestLessonChecklist?.taughtItems, selectedLatestLessonChecklist?.template?.items)}
                          </span>
                        </div>
                        <div>
                          匹配作业关联：
                          <span className="font-semibold text-[#061226]">
                            {formatLessonChecklistSummary(selectedLatestLessonChecklist?.homeworkItems, selectedLatestLessonChecklist?.template?.items)}
                          </span>
                        </div>
                      </div>
                      {selectedItem && isSelectedItemLinkedToLesson(selectedItem.id, selectedLatestLessonChecklist) && (
                        <Badge variant="sky" className="mt-3">
                          匹配课时已关联当前清单条目
                        </Badge>
                      )}
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

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <Button type="button" onClick={saveSelectedCompletion}>
                        <Save size={15} /> {selectedCompletion ? "保存日期" : "标记完成"}
                      </Button>
                      <Button type="button" variant="outline" onClick={saveSelectedItemForCurrentStudents} disabled={selectedItemBatchStudents.length === 0}>
                        <CheckCheck size={15} /> 批量标记 {selectedItemBatchStudents.length || ""}
                      </Button>
                      <Button type="button" variant="destructive" onClick={clearSelectedCompletion} disabled={!selectedCompletion}>
                        <Trash2 size={15} /> 清除勾选
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

function primaryChecklistCompletion(completions: ProgressChecklistCompletion[]): ProgressChecklistCompletion | undefined {
  const sorted = completions
    .slice()
    .sort((a, b) => `${a.completedDate} ${a.updatedAt}`.localeCompare(`${b.completedDate} ${b.updatedAt}`));
  return sorted[sorted.length - 1];
}

function completionGroupAppliesToSource(completions: ProgressChecklistCompletion[], source: ChecklistSyncSource): boolean {
  return completions.some((completion) => checklistCompletionAppliesToSource(completion, source));
}

function completionSourcesForDisplay(completions: ProgressChecklistCompletion[]): ChecklistSyncSource[] {
  const sources = new Set<ChecklistSyncSource>();
  completions.forEach((completion) => {
    const source = checklistCompletionSource(completion);
    if (source) sources.add(source);
  });
  return Array.from(sources);
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

function buildLessonLinkedItemSourceMap(
  lessonChecklist: {
    taughtItems: ProgressChecklistTemplateItem[];
    homeworkItems: ProgressChecklistTemplateItem[];
  } | null
): Map<string, ChecklistSyncSource[]> {
  const result = new Map<string, ChecklistSyncSource[]>();
  lessonChecklist?.taughtItems.forEach((item) => result.set(item.id, [...(result.get(item.id) ?? []), "taught"]));
  lessonChecklist?.homeworkItems.forEach((item) => result.set(item.id, [...(result.get(item.id) ?? []), "homework"]));
  return result;
}

function buildLessonLinkedCompletionCandidates(
  template: ProgressChecklistTemplate,
  students: Student[],
  contextByStudent: Map<string, LatestChecklistContext>,
  completionGroupsByCell: Map<string, ProgressChecklistCompletion[]>,
  selectedLesson?: Lesson
): Record<ChecklistSyncSource, ChecklistSyncCandidate[]> {
  const itemMap = new Map(template.items.map((item) => [item.id, item]));
  const result: Record<ChecklistSyncSource, ChecklistSyncCandidate[]> = { taught: [], homework: [] };
  const seen = new Set<string>();
  const selectedLessonStudentIds = new Set(selectedLesson ? lessonStudentIds(selectedLesson) : []);
  students.forEach((student) => {
    if (selectedLesson && !selectedLessonStudentIds.has(student.id)) return;
    const context = contextByStudent.get(student.id);
    const lesson = selectedLesson ?? context?.lesson;
    if (!lesson || lesson.content.checklistTemplateId !== template.id) return;
    (["taught", "homework"] as const).forEach((source) => {
      const itemIds = source === "taught" ? lesson.content.taughtChecklistItemIds ?? [] : lesson.content.homeworkChecklistItemIds ?? [];
      itemIds.forEach((itemId) => {
        const item = itemMap.get(itemId);
        const key = checklistCellKey(student.id, itemId);
        const sourceKey = `${source}::${key}`;
        if (!item || completionGroupAppliesToSource(completionGroupsByCell.get(key) ?? [], source) || seen.has(sourceKey)) return;
        seen.add(sourceKey);
        result[source].push({ student, item, lesson, record: context?.record, source });
      });
    });
  });
  return result;
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
  students: Student[],
  anchorDate: string,
  preferredLessonId?: string
): Map<string, LatestChecklistContext> {
  const map = new Map<string, LatestChecklistContext>();
  if (!courseGroupId) return map;
  const date = anchorDate || todayIso();

  students.forEach((student) => {
    const lessons = vault.lessons
      .filter((lesson) => lesson.courseGroupId === courseGroupId && lesson.status !== "cancelled" && lessonStudentIds(lesson).includes(student.id))
      .sort(sortLessons);
    const records = (vault.studentProgressRecords ?? [])
      .filter((record) => record.courseGroupId === courseGroupId && record.studentId === student.id)
      .sort((a, b) => `${a.date} ${a.updatedAt}`.localeCompare(`${b.date} ${b.updatedAt}`));
    const preferredLesson = preferredLessonId ? lessons.find((lesson) => lesson.id === preferredLessonId) : undefined;
    const sameDayLesson = lessons.filter((lesson) => lesson.date === date).at(-1);
    const lesson = preferredLesson ?? sameDayLesson ?? nearestLessonToDate(lessons, date);
    const lessonRecord = lesson ? records.filter((record) => record.lessonId === lesson.id).at(-1) : undefined;
    const sameDayRecord = records.filter((record) => record.date === date).at(-1);
    const record = lessonRecord ?? sameDayRecord ?? nearestRecordToDate(records, date);
    map.set(student.id, {
      lesson,
      record,
      relation: lesson ? checklistContextRelation(lesson, date, preferredLesson?.id) : record ? "record_only" : undefined
    });
  });

  return map;
}

function nearestLessonToDate(lessons: Lesson[], anchorDate: string): Lesson | undefined {
  if (lessons.length === 0) return undefined;
  const anchorTime = Date.parse(`${anchorDate}T12:00:00`);
  return lessons
    .slice()
    .sort((a, b) => {
      const diffA = Math.abs(lessonTimeValue(a) - anchorTime);
      const diffB = Math.abs(lessonTimeValue(b) - anchorTime);
      if (diffA !== diffB) return diffA - diffB;
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return `${b.startTime} ${b.endTime}`.localeCompare(`${a.startTime} ${a.endTime}`);
    })[0];
}

function nearestRecordToDate(records: StudentProgressRecord[], anchorDate: string): StudentProgressRecord | undefined {
  if (records.length === 0) return undefined;
  const anchorTime = Date.parse(`${anchorDate}T12:00:00`);
  return records
    .slice()
    .sort((a, b) => {
      const diffA = Math.abs(Date.parse(`${a.date}T12:00:00`) - anchorTime);
      const diffB = Math.abs(Date.parse(`${b.date}T12:00:00`) - anchorTime);
      if (diffA !== diffB) return diffA - diffB;
      return `${b.date} ${b.updatedAt}`.localeCompare(`${a.date} ${a.updatedAt}`);
    })[0];
}

function lessonTimeValue(lesson: Lesson): number {
  const parsed = Date.parse(`${lesson.date}T${lesson.startTime || "00:00"}:00`);
  return Number.isFinite(parsed) ? parsed : Date.parse(`${lesson.date}T12:00:00`);
}

function checklistContextRelation(lesson: Lesson, anchorDate: string, preferredLessonId?: string): ChecklistContextRelation {
  if (preferredLessonId && lesson.id === preferredLessonId) return "selected";
  if (lesson.date === anchorDate) return "same_day";
  return lesson.date < anchorDate ? "previous" : "next";
}

function checklistContextRelationLabel(relation: ChecklistContextRelation | undefined): string {
  if (relation === "selected") return "选中课时";
  if (relation === "same_day") return "当天课时";
  if (relation === "previous") return "前一课时";
  if (relation === "next") return "后一课时";
  if (relation === "record_only") return "仅有记录";
  return "匹配课时";
}

function lessonStudentsLabel(vault: TeacherVault, lesson: Lesson): string {
  const names = lessonStudentIds(lesson)
    .map((studentId) => findStudent(vault, studentId))
    .filter((student): student is Student => Boolean(student && student.status === "active"))
    .map((student) => student.name);
  if (names.length === 0) return "无学生";
  if (names.length <= 2) return names.join("、");
  return `${names.slice(0, 2).join("、")}等${names.length}人`;
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
