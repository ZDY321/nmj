import { useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  CheckCheck,
  Clock3,
  NotebookPen,
  Pencil,
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
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { todayIso } from "@/frontend/lib/calculations";
import { makeId } from "@/frontend/lib/crypto";
import type { TeacherVault, TodoItem } from "@/shared/types";

type TodoStatusFilter = "open" | "all" | "done";

export function TodoView({
  vault,
  selectedDate,
  onAddTodo,
  onUpdateTodo,
  onDeleteTodo
}: {
  vault: TeacherVault;
  selectedDate: string;
  onAddTodo: (todo: TodoItem) => void;
  onUpdateTodo: (todo: TodoItem) => void;
  onDeleteTodo: (todoId: string) => void;
}) {
  const [todoTitle, setTodoTitle] = useState("");
  const [todoDueDate, setTodoDueDate] = useState(selectedDate);
  const [statusFilter, setStatusFilter] = useState<TodoStatusFilter>("open");
  const [search, setSearch] = useState("");
  const [editingTodoId, setEditingTodoId] = useState("");
  const [editingTodoTitle, setEditingTodoTitle] = useState("");
  const [editingTodoDueDate, setEditingTodoDueDate] = useState("");
  const { confirm, dialog } = useConfirmDialog();
  const today = todayIso();
  const todos = sortedTodos(vault.todoItems ?? []);
  const openTodos = todos.filter((todo) => todo.status === "open");
  const doneTodos = todos.filter((todo) => todo.status === "done");
  const dueTodayCount = openTodos.filter((todo) => todo.dueDate === today).length;
  const overdueCount = openTodos.filter((todo) => todo.dueDate && todo.dueDate < today).length;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleTodos = todos.filter((todo) => {
    const matchesStatus =
      statusFilter === "all" ||
      todo.status === statusFilter;
    const matchesSearch =
      !normalizedSearch ||
      todo.title.toLowerCase().includes(normalizedSearch) ||
      (todo.note ?? "").toLowerCase().includes(normalizedSearch) ||
      (todo.dueDate ?? "").includes(normalizedSearch);
    return matchesStatus && matchesSearch;
  });

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
      onConfirm: () => onDeleteTodo(todo.id)
    });
  }

  return (
    <div className="space-y-6">
      {dialog}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "未完成", value: `${openTodos.length} 条`, icon: NotebookPen, tone: "bg-[#fff1e2] text-[#ff8617]" },
          { label: "今日截止", value: `${dueTodayCount} 条`, icon: CalendarDays, tone: "bg-[#eaf2ff] text-[#1557c2]" },
          { label: "已逾期", value: `${overdueCount} 条`, icon: Clock3, tone: "bg-[#fff1f2] text-[#b91c1c]" },
          { label: "已完成", value: `${doneTodos.length} 条`, icon: CheckCheck, tone: "bg-[#e8f8ef] text-[#15803d]" }
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
              <CardDescription className="mt-2">未完成事项会在今日提醒中汇总显示。</CardDescription>
            </div>
            <Badge variant={openTodos.length ? "amber" : "secondary"} className="w-fit">
              {openTodos.length ? `${openTodos.length} 条未完成` : "已清空"}
            </Badge>
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
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索待办内容或截止日期" />
            </div>
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as TodoStatusFilter)}>
              <option value="open">未完成</option>
              <option value="all">全部状态</option>
              <option value="done">已完成</option>
            </Select>
          </div>

          <div className="space-y-3">
            {visibleTodos.map((todo, index) => {
              const isEditingTodo = editingTodoId === todo.id;
              const isOverdue = todo.status === "open" && Boolean(todo.dueDate) && todo.dueDate! < today;
              const isDueToday = todo.status === "open" && todo.dueDate === today;
              return (
                <motion.div
                  key={todo.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className={`flex flex-col gap-3 rounded-[14px] border p-3 sm:flex-row sm:items-center sm:justify-between ${
                    todo.status === "done"
                      ? "border-[#dbe4ef] bg-[#f8fbff] opacity-75"
                      : isOverdue
                        ? "border-[#fecaca] bg-[#fff1f2]"
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
                    <label className="flex min-w-0 flex-1 items-start gap-3">
                      <input
                        type="checkbox"
                        checked={todo.status === "done"}
                        onChange={(event) => onUpdateTodo({ ...todo, status: event.target.checked ? "done" : "open" })}
                        className="mt-1 h-4 w-4 accent-[#ff8617]"
                      />
                      <span className="min-w-0">
                        <span className={`block text-sm font-extrabold ${todo.status === "done" ? "text-[#64748b] line-through" : "text-[#061226]"}`}>
                          {todo.title}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-2 text-xs font-semibold text-[#64748b]">
                          <span>{todo.dueDate ? `截止：${todo.dueDate}` : "未设置截止日期"}</span>
                          {isDueToday && <Badge variant="sky" className="text-[10px]">今日截止</Badge>}
                          {isOverdue && <Badge variant="destructive" className="text-[10px]">已逾期</Badge>}
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
                    ) : (
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
            {visibleTodos.length === 0 && (
              <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
                当前筛选下没有待办事项
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function sortedTodos(todos: TodoItem[]): TodoItem[] {
  return [...todos].sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    return `${a.dueDate ?? "9999-99-99"} ${a.createdAt}`.localeCompare(`${b.dueDate ?? "9999-99-99"} ${b.createdAt}`);
  });
}
