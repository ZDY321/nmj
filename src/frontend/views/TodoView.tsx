import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Archive,
  CalendarDays,
  CheckCheck,
  Clock3,
  FileText,
  NotebookPen,
  Pencil,
  Plus,
  RotateCcw,
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
import { todayIso } from "@/frontend/lib/calculations";
import { makeId } from "@/frontend/lib/crypto";
import { groupOpenTodos, sortArchivedTodos, sortCompletedTodos } from "@/frontend/lib/todos";
import type { MemoItem, TeacherVault, TodoItem } from "@/shared/types";

type TodoStatusFilter = "open" | "overdue" | "upcoming" | "undated" | "all" | "done" | "archived";

export function TodoView({
  vault,
  selectedDate,
  onAddTodo,
  onUpdateTodo,
  onDeleteTodo,
  onMergeTodosToMemo
}: {
  vault: TeacherVault;
  selectedDate: string;
  onAddTodo: (todo: TodoItem) => void;
  onUpdateTodo: (todo: TodoItem) => void;
  onDeleteTodo: (todoId: string) => void;
  onMergeTodosToMemo: (todoIds: string[], memo: MemoItem) => void;
}) {
  const [todoTitle, setTodoTitle] = useState("");
  const [todoDueDate, setTodoDueDate] = useState(selectedDate);
  const [statusFilter, setStatusFilter] = useState<TodoStatusFilter>("open");
  const [search, setSearch] = useState("");
  const [editingTodoId, setEditingTodoId] = useState("");
  const [editingTodoTitle, setEditingTodoTitle] = useState("");
  const [editingTodoDueDate, setEditingTodoDueDate] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTodoIds, setSelectedTodoIds] = useState<string[]>([]);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeTitle, setMergeTitle] = useState("");
  const [mergeContent, setMergeContent] = useState("");
  const { confirm, dialog } = useConfirmDialog();
  const today = todayIso();
  const todoGroups = groupOpenTodos(vault.todoItems ?? [], today);
  const openTodos = [...todoGroups.overdue, ...todoGroups.upcoming, ...todoGroups.undated];
  const doneTodos = sortCompletedTodos(vault.todoItems ?? []);
  const archivedTodos = sortArchivedTodos(vault.todoItems ?? []);
  const dueTodayCount = openTodos.filter((todo) => todo.dueDate === today).length;
  const overdueCount = todoGroups.overdue.length;
  const normalizedSearch = search.trim().toLowerCase();
  const memoTitleById = useMemo(
    () => new Map((vault.memoItems ?? []).map((memo) => [memo.id, memo.title])),
    [vault.memoItems]
  );
  const matchesSearch = (todo: TodoItem) =>
      !normalizedSearch ||
      todo.title.toLowerCase().includes(normalizedSearch) ||
      (todo.note ?? "").toLowerCase().includes(normalizedSearch) ||
      (todo.dueDate ?? "").includes(normalizedSearch) ||
      (todo.archivedMemoId ? (memoTitleById.get(todo.archivedMemoId) ?? "").toLowerCase().includes(normalizedSearch) : false);
  const allSections = [
    {
      key: "overdue" as const,
      title: "已逾期",
      description: "按最早逾期日期优先",
      badgeVariant: "destructive" as const,
      todos: todoGroups.overdue
    },
    {
      key: "upcoming" as const,
      title: "今天及未来",
      description: "按最近截止日期优先",
      badgeVariant: "sky" as const,
      todos: todoGroups.upcoming
    },
    {
      key: "undated" as const,
      title: "未设置日期",
      description: "按最近创建时间优先",
      badgeVariant: "secondary" as const,
      todos: todoGroups.undated
    },
    {
      key: "done" as const,
      title: "已完成",
      description: "已完成事项单独保留，便于回看",
      badgeVariant: "sage" as const,
      todos: doneTodos
    },
    {
      key: "archived" as const,
      title: "已归档",
      description: "已合并到备忘录，可随时恢复为未完成待办",
      badgeVariant: "secondary" as const,
      todos: archivedTodos
    }
  ];
  const visibleSections = allSections
    .filter((section) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "open") return section.key === "overdue" || section.key === "upcoming" || section.key === "undated";
      return section.key === statusFilter;
    })
    .map((section) => ({ ...section, todos: section.todos.filter(matchesSearch) }))
    .filter((section) => section.todos.length > 0);
  const visibleTodoCount = visibleSections.reduce((sum, section) => sum + section.todos.length, 0);
  const visibleOpenTodoIds = visibleSections.flatMap((section) =>
    section.todos.filter((todo) => todo.status === "open").map((todo) => todo.id)
  );
  const selectedTodoIdSet = new Set(selectedTodoIds);
  const selectedTodos = openTodos.filter((todo) => selectedTodoIdSet.has(todo.id));
  const allVisibleOpenSelected = visibleOpenTodoIds.length > 0 && visibleOpenTodoIds.every((id) => selectedTodoIdSet.has(id));

  function addTodo() {
    const title = todoTitle.trim();
    if (!title) return;
    onAddTodo({
      id: makeId("todo"),
      title,
      dueDate: todoDueDate || undefined,
      status: "open",
      priority: "normal",
      createdAt: new Date().toISOString()
    });
    setTodoTitle("");
  }

  function startEditTodo(todo: TodoItem) {
    setEditingTodoId(todo.id);
    setEditingTodoTitle(todo.title);
    setEditingTodoDueDate(todo.dueDate ?? "");
  }

  function cancelEditTodo() {
    setEditingTodoId("");
    setEditingTodoTitle("");
    setEditingTodoDueDate("");
  }

  function saveTodo(todo: TodoItem) {
    const title = editingTodoTitle.trim();
    if (!title) return;
    onUpdateTodo({
      ...todo,
      title,
      dueDate: editingTodoDueDate || undefined
    });
    cancelEditTodo();
  }

  function askDeleteTodo(todo: TodoItem) {
    confirm({
      title: `删除待办「${todo.title}」？`,
      description: todo.dueDate ? `截止日期：${todo.dueDate}` : "删除后这条待办不会再显示。",
      confirmLabel: "删除",
      tone: "danger",
      onConfirm: () => {
        onDeleteTodo(todo.id);
        setSelectedTodoIds((current) => current.filter((id) => id !== todo.id));
      }
    });
  }

  function toggleSelectionMode() {
    setSelectionMode((current) => !current);
    setSelectedTodoIds([]);
  }

  function toggleTodoSelection(todoId: string) {
    setSelectedTodoIds((current) =>
      current.includes(todoId) ? current.filter((id) => id !== todoId) : [...current, todoId]
    );
  }

  function toggleVisibleSelection() {
    if (allVisibleOpenSelected) {
      setSelectedTodoIds((current) => current.filter((id) => !visibleOpenTodoIds.includes(id)));
      return;
    }
    setSelectedTodoIds((current) => [...new Set([...current, ...visibleOpenTodoIds])]);
  }

  function openMergeDialog() {
    if (selectedTodos.length === 0) return;
    setMergeTitle(`长期跟进事项汇总（${today}）`);
    setMergeContent(buildMemoContent(selectedTodos, today));
    setMergeDialogOpen(true);
  }

  function closeMergeDialog() {
    setMergeDialogOpen(false);
    setMergeTitle("");
    setMergeContent("");
  }

  function mergeSelectedTodos() {
    if (selectedTodos.length === 0 || (!mergeTitle.trim() && !mergeContent.trim())) return;
    const now = new Date().toISOString();
    const memo: MemoItem = {
      id: makeId("memo"),
      title: mergeTitle.trim() || "长期跟进事项汇总",
      content: mergeContent.trim(),
      createdAt: now,
      updatedAt: now
    };
    onMergeTodosToMemo(selectedTodos.map((todo) => todo.id), memo);
    closeMergeDialog();
    setSelectedTodoIds([]);
    setSelectionMode(false);
    setStatusFilter("open");
  }

  function restoreTodo(todo: TodoItem) {
    const { archivedAt: _archivedAt, archivedMemoId: _archivedMemoId, ...restoredTodo } = todo;
    onUpdateTodo({ ...restoredTodo, status: "open" });
  }

  return (
    <div className="space-y-6">
      {dialog}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "未完成", value: `${openTodos.length} 条`, icon: NotebookPen, tone: "bg-[#fff1e2] text-[#ff8617]" },
          { label: "今日截止", value: `${dueTodayCount} 条`, icon: CalendarDays, tone: "bg-[#eaf2ff] text-[#1557c2]" },
          { label: "已逾期", value: `${overdueCount} 条`, icon: Clock3, tone: "bg-[#fff1f2] text-[#b91c1c]" },
          { label: "已完成", value: `${doneTodos.length} 条`, icon: CheckCheck, tone: "bg-[#e8f8ef] text-[#15803d]" },
          { label: "已归档", value: `${archivedTodos.length} 条`, icon: Archive, tone: "bg-[#f1f5f9] text-[#475569]" }
        ].map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
            >
              <Card className="overflow-hidden">
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
            </motion.div>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-[#e8eef6] pb-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
                <NotebookPen size={14} /> 待办事项
              </div>
              <CardTitle className="text-xl">跟进事项</CardTitle>
              <CardDescription className="mt-2">未完成事项会在今日提醒中汇总显示；长期事项可批量合并到备忘录并归档。</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={openTodos.length ? "amber" : "secondary"} className="w-fit">
                {openTodos.length ? `${openTodos.length} 条未完成` : "已清空"}
              </Badge>
              <Button type="button" size="sm" variant={selectionMode ? "default" : "outline"} onClick={toggleSelectionMode}>
                {selectionMode ? <X size={14} /> : <Archive size={14} />}
                {selectionMode ? "退出整理" : "批量整理"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_auto]">
            <Input value={todoTitle} onChange={(event) => setTodoTitle(event.target.value)} placeholder="例如：联系家长确认补课时间" />
            <Input type="date" value={todoDueDate} onChange={(event) => setTodoDueDate(event.target.value)} />
            <Button type="button" onClick={addTodo} disabled={!todoTitle.trim()}>
              <Plus size={15} /> 添加待办
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3 md:grid-cols-[1fr_180px]">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索待办内容、截止日期或关联备忘录" />
            </div>
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as TodoStatusFilter)}>
              <option value="open">未完成（分组）</option>
              <option value="overdue">仅看已逾期</option>
              <option value="upcoming">仅看今天及未来</option>
              <option value="undated">仅看未设日期</option>
              <option value="archived">仅看已归档</option>
              <option value="all">全部状态</option>
              <option value="done">已完成</option>
            </Select>
          </div>

          {selectionMode && (
            <div className="flex flex-col gap-3 rounded-[14px] border border-[#bfdbfe] bg-[#eff6ff] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-extrabold text-[#1557c2]">已选择 {selectedTodos.length} 条未完成待办</div>
                <div className="mt-1 text-xs font-semibold text-[#64748b]">合并后会创建新备忘录，原待办转入“已归档”，不会计入今日提醒。</div>
              </div>
              <div className="flex flex-wrap gap-2 sm:shrink-0">
                <Button type="button" size="sm" variant="outline" onClick={toggleVisibleSelection} disabled={visibleOpenTodoIds.length === 0}>
                  {allVisibleOpenSelected ? "取消当前页选择" : "选择当前页"}
                </Button>
                <Button type="button" size="sm" onClick={openMergeDialog} disabled={selectedTodos.length === 0}>
                  <FileText size={14} /> 合并为备忘录
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {visibleSections.map((section, sectionIndex) => (
              <section key={section.key} className="space-y-3">
                <div className="flex flex-col gap-2 rounded-[12px] bg-[#f8fbff] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-extrabold text-[#061226]">{section.title}</div>
                    <div className="mt-0.5 text-xs font-semibold text-[#64748b]">{section.description}</div>
                  </div>
                  <Badge variant={section.badgeVariant} className="w-fit">{section.todos.length} 条</Badge>
                </div>
                {section.todos.map((todo, index) => {
                  const isEditingTodo = editingTodoId === todo.id;
                  const isOverdue = todo.status === "open" && Boolean(todo.dueDate) && todo.dueDate! < today;
                  const isDueToday = todo.status === "open" && todo.dueDate === today;
                  const isArchived = todo.status === "archived";
                  const isSelected = selectedTodoIdSet.has(todo.id);
                  const linkedMemoTitle = todo.archivedMemoId ? memoTitleById.get(todo.archivedMemoId) : undefined;
                  return (
                    <motion.div
                      key={todo.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: sectionIndex * 0.03 + index * 0.02 }}
                      className={`flex flex-col gap-3 rounded-[14px] border p-3 sm:flex-row sm:items-center sm:justify-between ${
                        isArchived
                          ? "border-[#cbd5e1] bg-[#f8fafc]"
                          : todo.status === "done"
                            ? "border-[#dbe4ef] bg-[#f8fbff] opacity-75"
                            : isSelected
                              ? "border-[#60a5fa] bg-[#eff6ff] ring-2 ring-[#bfdbfe]"
                              : isOverdue
                                ? "border-[#fecaca] bg-[#fff1f2]"
                                : isDueToday
                                  ? "border-[#bfdbfe] bg-[#eff6ff]"
                                  : "border-[#fed7aa] bg-[#fff7ed]"
                      }`}
                    >
                      {isEditingTodo ? (
                        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_180px]">
                          <Input
                            value={editingTodoTitle}
                            onChange={(event) => setEditingTodoTitle(event.target.value)}
                            placeholder="待办内容"
                            className="bg-white"
                          />
                          <Input
                            type="date"
                            value={editingTodoDueDate}
                            onChange={(event) => setEditingTodoDueDate(event.target.value)}
                            className="bg-white"
                          />
                        </div>
                      ) : (
                        <label className={`flex min-w-0 flex-1 items-start gap-3 ${selectionMode && todo.status === "open" ? "cursor-pointer" : ""}`}>
                          {selectionMode && todo.status === "open" ? (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleTodoSelection(todo.id)}
                              className="mt-1 h-4 w-4 accent-[#1557c2]"
                            />
                          ) : isArchived ? (
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[#64748b]">
                              <Archive size={16} />
                            </span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={todo.status === "done"}
                              onChange={(event) => onUpdateTodo({ ...todo, status: event.target.checked ? "done" : "open" })}
                              className="mt-1 h-4 w-4 accent-[#ff8617]"
                            />
                          )}
                          <span className="min-w-0">
                            <span className={`block text-sm font-extrabold ${todo.status === "done" ? "text-[#64748b] line-through" : "text-[#061226]"}`}>
                              {todo.title}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#64748b]">
                              <span>{todo.dueDate ? `截止：${todo.dueDate}` : "未设置截止日期"}</span>
                              {isDueToday && <Badge variant="sky" className="text-[10px]">今日截止</Badge>}
                              {isOverdue && <Badge variant="destructive" className="text-[10px]">已逾期</Badge>}
                              {isArchived && <Badge variant="secondary" className="text-[10px]">已归档</Badge>}
                              {linkedMemoTitle && <span className="truncate">备忘录：{linkedMemoTitle}</span>}
                            </span>
                          </span>
                        </label>
                      )}
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                        {isEditingTodo ? (
                          <>
                            <Button type="button" size="sm" onClick={() => saveTodo(todo)} disabled={!editingTodoTitle.trim()}>
                              <Save size={14} /> 保存
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={cancelEditTodo}>
                              <X size={14} /> 取消
                            </Button>
                          </>
                        ) : isArchived ? (
                          <>
                            <Button type="button" size="sm" variant="outline" onClick={() => restoreTodo(todo)}>
                              <RotateCcw size={14} /> 恢复待办
                            </Button>
                            <Button type="button" size="sm" variant="destructive" onClick={() => askDeleteTodo(todo)}>
                              <Trash2 size={14} /> 删除
                            </Button>
                          </>
                        ) : selectionMode && todo.status === "open" ? null : (
                          <>
                            <Button type="button" size="sm" variant="outline" onClick={() => startEditTodo(todo)}>
                              <Pencil size={14} /> 编辑
                            </Button>
                            <Button type="button" size="sm" variant="destructive" onClick={() => askDeleteTodo(todo)}>
                              <Trash2 size={14} /> 删除
                            </Button>
                          </>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </section>
            ))}
            {visibleTodoCount === 0 && (
              <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
                当前筛选下没有待办事项
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {mergeDialogOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#061226]/45 p-4" role="dialog" aria-modal="true" aria-label="合并待办为备忘录">
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto shadow-2xl">
            <CardHeader className="border-b border-[#e8eef6]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                    <FileText size={14} /> 合并为备忘录
                  </div>
                  <CardTitle className="text-xl">整理 {selectedTodos.length} 条长期跟进事项</CardTitle>
                  <CardDescription className="mt-2">保存后，备忘录会保留整理内容，原待办将进入“已归档”。</CardDescription>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={closeMergeDialog} aria-label="关闭">
                  <X size={15} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-5 sm:p-6">
              <div className="space-y-2">
                <label className="text-sm font-extrabold text-[#25324a]">备忘录标题</label>
                <Input value={mergeTitle} onChange={(event) => setMergeTitle(event.target.value)} placeholder="例如：长期跟进事项汇总" autoFocus />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-extrabold text-[#25324a]">备忘录内容</label>
                <Textarea
                  value={mergeContent}
                  onChange={(event) => setMergeContent(event.target.value)}
                  className="min-h-[300px] font-mono text-sm leading-6"
                  placeholder="整理选中的待办事项"
                />
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={closeMergeDialog}>取消</Button>
                <Button type="button" onClick={mergeSelectedTodos} disabled={!mergeTitle.trim() && !mergeContent.trim()}>
                  <Archive size={14} /> 创建备忘录并归档
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function buildMemoContent(todos: TodoItem[], createdDate: string): string {
  const lines = todos.map((todo) => {
    const dueDate = todo.dueDate ? `截止：${todo.dueDate}` : "未设置截止日期";
    const note = todo.note?.trim() ? `\n  - 原备注：${todo.note.trim()}` : "";
    return `- [ ] ${todo.title}（${dueDate}）${note}`;
  });

  return [
    "## 长期跟进事项",
    "",
    `> 由 ${todos.length} 条待办合并归档，整理日期：${createdDate}`,
    "",
    ...lines
  ].join("\n");
}
