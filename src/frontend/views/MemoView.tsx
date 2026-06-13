import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bold,
  Clock3,
  Code2,
  Columns2,
  Eye,
  FileText,
  Heading1,
  Link,
  List,
  ListChecks,
  Pencil,
  PencilLine,
  Plus,
  Quote,
  Save,
  Search,
  Table2,
  Trash2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { makeId } from "@/frontend/lib/crypto";
import type { MemoItem, TeacherVault } from "@/shared/types";

type MarkdownEditorMode = "edit" | "split" | "preview";

export function MemoView({
  vault,
  onSaveMemo,
  onDeleteMemo
}: {
  vault: TeacherVault;
  onSaveMemo: (memo: MemoItem) => void;
  onDeleteMemo: (memoId: string) => void;
}) {
  const [selectedMemoId, setSelectedMemoId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [search, setSearch] = useState("");
  const [editorMode, setEditorMode] = useState<MarkdownEditorMode>("split");
  const contentInputRef = useRef<HTMLTextAreaElement>(null);
  const { confirm, dialog } = useConfirmDialog();
  const memos = useMemo(() => sortedMemos(vault.memoItems ?? []), [vault.memoItems]);
  const selectedMemo = memos.find((memo) => memo.id === selectedMemoId);
  const normalizedSearch = search.trim().toLowerCase();
  const visibleMemos = memos.filter((memo) => {
    if (!normalizedSearch) return true;
    return (
      memo.title.toLowerCase().includes(normalizedSearch) ||
      memo.content.toLowerCase().includes(normalizedSearch) ||
      formatMemoDateTime(memo.createdAt).includes(normalizedSearch) ||
      formatMemoDateTime(memo.updatedAt).includes(normalizedSearch)
    );
  });
  const hasDraft = Boolean(title.trim() || content.trim());
  const canSave = Boolean(title.trim() || content.trim());

  useEffect(() => {
    if (!selectedMemoId || selectedMemo) return;
    startNewMemo();
  }, [selectedMemo, selectedMemoId]);

  function startNewMemo() {
    setSelectedMemoId("");
    setTitle("");
    setContent("");
  }

  function selectMemo(memo: MemoItem) {
    setSelectedMemoId(memo.id);
    setTitle(memo.title);
    setContent(memo.content);
  }

  function saveMemo() {
    if (!canSave) return;
    const now = new Date().toISOString();
    const normalizedTitle = title.trim() || firstLineTitle(content);
    onSaveMemo({
      id: selectedMemo?.id ?? makeId("memo"),
      title: normalizedTitle,
      content: content.trim(),
      createdAt: selectedMemo?.createdAt ?? now,
      updatedAt: now
    });
    if (!selectedMemo) {
      setSelectedMemoId("");
      setTitle("");
      setContent("");
    }
  }

  function askDeleteMemo(memo: MemoItem) {
    confirm({
      title: `删除备忘录「${memo.title}」？`,
      description: `创建时间：${formatMemoDateTime(memo.createdAt)}`,
      confirmLabel: "删除",
      tone: "danger",
      onConfirm: () => {
        onDeleteMemo(memo.id);
        if (selectedMemoId === memo.id) startNewMemo();
      }
    });
  }

  function replaceSelectedText(nextTextForSelection: (selected: string) => { text: string; cursorOffset?: number }, fallback = "") {
    const input = contentInputRef.current;
    const start = input?.selectionStart ?? content.length;
    const end = input?.selectionEnd ?? content.length;
    const selected = content.slice(start, end) || fallback;
    const replacement = nextTextForSelection(selected);
    const nextContent = `${content.slice(0, start)}${replacement.text}${content.slice(end)}`;
    setContent(nextContent);
    window.setTimeout(() => {
      const nextInput = contentInputRef.current;
      if (!nextInput) return;
      const cursor = start + (replacement.cursorOffset ?? replacement.text.length);
      nextInput.focus();
      nextInput.setSelectionRange(cursor, cursor);
    }, 0);
  }

  function wrapSelection(before: string, after: string, fallback: string) {
    replaceSelectedText((selected) => ({
      text: `${before}${selected}${after}`,
      cursorOffset: before.length + selected.length
    }), fallback);
  }

  function prefixSelectedLines(prefix: string, fallback: string) {
    replaceSelectedText((selected) => ({
      text: selected.split(/\r?\n/).map((line) => `${prefix}${line}`).join("\n")
    }), fallback);
  }

  function insertBlock(block: string) {
    replaceSelectedText(() => ({ text: block }), "");
  }

  return (
    <div className="space-y-6">
      {dialog}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "备忘录", value: `${memos.length} 条`, hint: "已保存笔记" },
          { label: "搜索结果", value: `${visibleMemos.length} 条`, hint: search.trim() ? "当前筛选" : "全部显示" },
          { label: "当前编辑", value: selectedMemo ? "修改中" : hasDraft ? "新建中" : "空白", hint: selectedMemo ? formatMemoDateTime(selectedMemo.updatedAt) : "可直接记录长文字" }
        ].map((item, index) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
          >
            <Card className="overflow-hidden">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#eef0ff] text-[#5161d6]">
                  <FileText size={22} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#64748b]">{item.label}</div>
                  <div className="mt-1 text-2xl font-extrabold text-[#061226]">{item.value}</div>
                  <div className="mt-1 truncate text-xs font-semibold text-[#64748b]">{item.hint}</div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-[#e8eef6] pb-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#5161d6]">
                  <FileText size={14} /> 备忘录
                </div>
                <CardTitle className="text-xl">已保存笔记</CardTitle>
                <CardDescription className="mt-2">按最后修改时间排序，支持搜索标题、正文和时间。</CardDescription>
              </div>
              <Button type="button" size="sm" onClick={startNewMemo}>
                <Plus size={14} /> 新建
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索备忘录标题、正文或时间" />
            </div>
            <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
              {visibleMemos.map((memo, index) => {
                const active = selectedMemoId === memo.id;
                return (
                  <motion.button
                    key={memo.id}
                    type="button"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    onClick={() => selectMemo(memo)}
                    className={`w-full rounded-[14px] border p-4 text-left transition-colors ${
                      active
                        ? "border-[#5161d6] bg-[#eef0ff] ring-1 ring-[#c7d2fe]"
                        : "border-[#dbe4ef] bg-[#f8fbff] hover:border-[#5161d6]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-extrabold text-[#061226]">{memo.title}</div>
                        <div className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-[#64748b]">
                          {memo.content || "空白备忘录"}
                        </div>
                      </div>
                      {active && <Badge variant="sky" className="shrink-0 text-[10px]">编辑中</Badge>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-[#64748b]">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 ring-1 ring-[#dbe4ef]">
                        <Clock3 size={12} /> 创建 {formatMemoDateTime(memo.createdAt)}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 ring-1 ring-[#dbe4ef]">
                        <Pencil size={12} /> 修改 {formatMemoDateTime(memo.updatedAt)}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
              {visibleMemos.length === 0 && (
                <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
                  当前没有匹配的备忘录
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-[#e8eef6] pb-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
                  <Pencil size={14} /> {selectedMemo ? "修改备忘录" : "新建备忘录"}
                </div>
                <CardTitle className="text-xl">{selectedMemo ? selectedMemo.title : "记录长文字"}</CardTitle>
                <CardDescription className="mt-2">
                  {selectedMemo
                    ? `创建 ${formatMemoDateTime(selectedMemo.createdAt)} · 修改 ${formatMemoDateTime(selectedMemo.updatedAt)}`
                    : "保存后会记录创建时间和最后修改时间。"}
                </CardDescription>
              </div>
              {selectedMemo && (
                <Button type="button" size="sm" variant="destructive" onClick={() => askDeleteMemo(selectedMemo)}>
                  <Trash2 size={14} /> 删除
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">标题</label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：家长沟通记录 / 近期注意事项" />
            </div>
            <div className="space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <label className="text-sm font-medium">内容</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { mode: "edit" as MarkdownEditorMode, label: "编辑", icon: PencilLine },
                    { mode: "split" as MarkdownEditorMode, label: "分屏", icon: Columns2 },
                    { mode: "preview" as MarkdownEditorMode, label: "预览", icon: Eye }
                  ].map((item) => {
                    const Icon = item.icon;
                    const active = editorMode === item.mode;
                    return (
                      <Button
                        key={item.mode}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        onClick={() => setEditorMode(item.mode)}
                      >
                        <Icon size={14} /> {item.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] p-2">
                {[
                  { label: "标题", icon: Heading1, action: () => prefixSelectedLines("## ", "小标题") },
                  { label: "加粗", icon: Bold, action: () => wrapSelection("**", "**", "重点内容") },
                  { label: "列表", icon: List, action: () => prefixSelectedLines("- ", "列表项") },
                  { label: "任务", icon: ListChecks, action: () => prefixSelectedLines("- [ ] ", "待办项") },
                  { label: "引用", icon: Quote, action: () => prefixSelectedLines("> ", "引用内容") },
                  { label: "代码", icon: Code2, action: () => wrapSelection("\n```text\n", "\n```\n", "代码内容") },
                  { label: "链接", icon: Link, action: () => wrapSelection("[", "](https://)", "链接文字") },
                  { label: "表格", icon: Table2, action: () => insertBlock("\n| 项目 | 内容 |\n| --- | --- |\n|  |  |\n") }
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <Button key={item.label} type="button" size="sm" variant="outline" onClick={item.action} title={item.label}>
                      <Icon size={14} /> {item.label}
                    </Button>
                  );
                })}
              </div>

              <div className={`grid gap-3 ${editorMode === "split" ? "xl:grid-cols-2" : "grid-cols-1"}`}>
                {(editorMode === "edit" || editorMode === "split") && (
                  <Textarea
                    ref={contentInputRef}
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder={"可以记录较长的备忘内容，支持 Markdown，例如：\n\n## 小标题\n- 列表项\n**重点内容**"}
                    className="min-h-[420px] resize-y font-mono leading-6"
                  />
                )}
                {(editorMode === "preview" || editorMode === "split") && (
                  <MarkdownPreview content={content} />
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs font-semibold text-[#64748b]">
                {content.length} 字
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={startNewMemo}>
                  <Plus size={14} /> 新建
                </Button>
                <Button type="button" onClick={saveMemo} disabled={!canSave}>
                  <Save size={14} /> 保存备忘录
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  const source = content.trim();
  return (
    <div className="min-h-[420px] overflow-auto rounded-[12px] border border-[#dbe4ef] bg-white p-4">
      {source ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {source}
        </ReactMarkdown>
      ) : (
        <div className="flex min-h-[360px] items-center justify-center rounded-[10px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] text-sm font-semibold text-[#64748b]">
          暂无可预览内容
        </div>
      )}
    </div>
  );
}

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="mb-4 mt-1 text-2xl font-extrabold leading-tight text-[#061226]">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-3 mt-5 text-xl font-extrabold leading-tight text-[#061226]">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-4 text-lg font-extrabold leading-tight text-[#061226]">{children}</h3>,
  p: ({ children }) => <p className="my-3 whitespace-pre-wrap text-sm font-semibold leading-7 text-[#25324a]">{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6 text-sm font-semibold leading-7 text-[#25324a]">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6 text-sm font-semibold leading-7 text-[#25324a]">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 rounded-r-[10px] border-l-4 border-[#5161d6] bg-[#eef0ff] px-4 py-2 text-sm font-semibold leading-7 text-[#25324a]">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="font-extrabold text-[#1557c2] underline underline-offset-2">
      {children}
    </a>
  ),
  hr: () => <hr className="my-5 border-[#dbe4ef]" />,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-[12px] border border-[#dbe4ef]">
      <table className="w-full min-w-[420px] border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[#f8fbff] text-[#061226]">{children}</thead>,
  th: ({ children }) => <th className="border-b border-r border-[#dbe4ef] px-3 py-2 text-left font-extrabold last:border-r-0">{children}</th>,
  td: ({ children }) => <td className="border-b border-r border-[#e8eef6] px-3 py-2 align-top font-semibold text-[#25324a] last:border-r-0">{children}</td>,
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-[12px] bg-[#061226] p-4 text-sm leading-6 text-white">
      {children}
    </pre>
  ),
  code: ({ children, className }) => (
    <code className={`${className ?? ""} rounded bg-[#eef0ff] px-1.5 py-0.5 font-mono text-[0.92em] font-bold text-[#5161d6]`}>
      {children}
    </code>
  ),
  input: ({ checked }) => (
    <input type="checkbox" checked={Boolean(checked)} readOnly className="mr-2 h-4 w-4 align-middle accent-[#5161d6]" />
  )
};

function sortedMemos(memos: MemoItem[]): MemoItem[] {
  return [...memos].sort((a, b) => {
    const updatedOrder = b.updatedAt.localeCompare(a.updatedAt);
    return updatedOrder || b.createdAt.localeCompare(a.createdAt);
  });
}

function firstLineTitle(content: string): string {
  const firstLine = content.trim().split(/\r?\n/)[0]?.trim();
  return firstLine ? firstLine.slice(0, 40) : "未命名备忘录";
}

function formatMemoDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "未知时间";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}
