import { useEffect, useMemo, useState } from "react";
import {
  BookCheck,
  CalendarDays,
  CheckCheck,
  ClipboardList,
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
import { todayIso } from "@/frontend/lib/calculations";
import { makeId } from "@/frontend/lib/crypto";
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

export function ProgressChecklistView({
  vault,
  onSaveChecklistTemplate,
  onDeleteChecklistTemplate,
  onSaveChecklistCompletion,
  onDeleteChecklistCompletion
}: {
  vault: TeacherVault;
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
  const [itemSearch, setItemSearch] = useState("");
  const [showOnlyIncomplete, setShowOnlyIncomplete] = useState(false);
  const [selectedCell, setSelectedCell] = useState<ChecklistCellSelection | null>(null);
  const [selectedCellDate, setSelectedCellDate] = useState(todayIso());
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
    if (!templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0]?.id ?? "");
    }
  }, [templates, selectedTemplateId]);

  const selectedCourse = courseOptions.find((course) => course.id === selectedCourseId);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);

  useEffect(() => {
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

  const allItems = useMemo(
    () => (selectedTemplate?.items ?? []).slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    [selectedTemplate?.id, selectedTemplate?.updatedAt]
  );
  const completionList = useMemo(
    () =>
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
        const matchesSearch = !normalizedItemSearch || item.title.toLowerCase().includes(normalizedItemSearch);
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
    }
  }, [selectedCell, selectedStudents, allItems]);

  const selectedStudent = selectedStudents.find((student) => student.id === selectedCell?.studentId);
  const selectedItem = allItems.find((item) => item.id === selectedCell?.itemId);
  const selectedCompletion = selectedCell ? completionMap.get(checklistCellKey(selectedCell.studentId, selectedCell.itemId)) : undefined;
  const selectedLatestContext = selectedStudent ? latestContextByStudent.get(selectedStudent.id) : undefined;

  useEffect(() => {
    setSelectedCellDate(selectedCompletion?.completedDate ?? todayIso());
  }, [selectedCompletion?.id, selectedCompletion?.completedDate, selectedCell?.studentId, selectedCell?.itemId]);

  const totalPossible = selectedStudents.length * allItems.length;
  const completedCount = completionList.length;
  const pendingCount = Math.max(totalPossible - completedCount, 0);
  const fullyCompletedStudents = allItems.length === 0
    ? 0
    : selectedStudents.filter((student) => allItems.every((item) => completionMap.has(checklistCellKey(student.id, item.id)))).length;

  function startNewTemplate() {
    setSelectedTemplateId("");
    setTemplateName("");
    setTemplateSubject(selectedCourse?.subject ?? "");
    setTemplateNote("");
    setTemplateItemsText("");
  }

  function saveTemplate() {
    const name = templateName.trim();
    const itemTitles = templateItemsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!name || itemTitles.length === 0) return;

    const existingItems = selectedTemplate?.items ?? [];
    const now = new Date().toISOString();
    const nextTemplate: ProgressChecklistTemplate = {
      id: selectedTemplate?.id ?? makeId("progress_template"),
      name,
      subject: templateSubject.trim() || selectedCourse?.subject || undefined,
      note: templateNote.trim() || undefined,
      items: itemTitles.map((title, index) => ({
        id: existingItems[index]?.id ?? makeId("progress_item"),
        title,
        note: existingItems[index]?.note,
        order: index
      })),
      createdAt: selectedTemplate?.createdAt ?? now,
      updatedAt: now
    };
    onSaveChecklistTemplate(nextTemplate);
    setSelectedTemplateId(nextTemplate.id);
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
      note: existing?.note,
      updatedAt: now
    });
  }

  function clearSelectedCompletion() {
    if (!selectedCompletion) return;
    onDeleteChecklistCompletion(selectedCompletion.id);
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
              <ClipboardList size={14} /> 学习清单模板
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

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#25324a]">模板名称</label>
              <Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="例如：七下数学同步教材" />
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
                placeholder="可写教材版本、适用班级、使用说明"
                className="min-h-[88px]"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button type="button" variant="outline" onClick={startNewTemplate}>
                <Plus size={15} /> 新建
              </Button>
              <Button type="button" onClick={saveTemplate} disabled={!templateName.trim() || !templateItemsText.trim()}>
                <Save size={15} /> 保存
              </Button>
              <Button type="button" variant="destructive" onClick={askDeleteTemplate} disabled={!selectedTemplate}>
                <Trash2 size={15} /> 删除
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
                <CheckCheck size={14} /> 学习清单
              </div>
              <CardTitle>按学生查看完成日期</CardTitle>
              <CardDescription>原有进度台账保留不动；这里是新增的清单子页面，用来记录每个学生哪一天完成了哪个知识点。</CardDescription>
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
                    placeholder="搜索知识点"
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
                {!selectedCourse || !selectedTemplate ? (
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
                          <th className="sticky left-0 top-0 z-30 min-w-[210px] border-b border-r border-[#dbe4ef] bg-[#f8fbff] p-3 text-xs font-extrabold text-[#25324a]">
                            学生
                          </th>
                          {visibleItems.map((item) => (
                            <th key={item.id} className="sticky top-0 z-20 min-w-[150px] border-b border-r border-[#dbe4ef] bg-[#f8fbff] p-3 align-top text-xs font-extrabold text-[#25324a]">
                              <div className="max-h-[3.75rem] overflow-hidden leading-5">{item.title}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedStudents.map((student) => (
                          <tr key={student.id} className="odd:bg-white even:bg-[#fbfdff]">
                            <th className="sticky left-0 z-10 min-w-[210px] border-b border-r border-[#dbe4ef] bg-inherit p-3 align-top">
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
                        {selectedItem.title}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-[#25324a]">完成日期</label>
                      <Input type="date" value={selectedCellDate} onChange={(event) => setSelectedCellDate(event.target.value)} />
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
                      </div>
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
    .map((item) => item.title)
    .join("\n");
}

function checklistCellKey(studentId: string, itemId: string): string {
  return `${studentId}::${itemId}`;
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
