import type { Dispatch, SetStateAction } from "react";
import { motion } from "framer-motion";
import { BookOpen, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ConfirmRequest = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "normal";
  onConfirm: () => void;
};

type SubjectSettingsCardProps = {
  confirm: (request: ConfirmRequest) => void;
  editingSubject: string;
  editingSubjectInput: string;
  onAddSubject: () => void;
  onCancelEditSubject: () => void;
  onDeleteSubject: (subject: string) => void;
  onSaveSubject: () => void;
  onStartEditSubject: (subject: string) => void;
  setEditingSubjectInput: Dispatch<SetStateAction<string>>;
  setSubjectInput: Dispatch<SetStateAction<string>>;
  setSubjectMessage: Dispatch<SetStateAction<string>>;
  subjectInUse: (subject: string) => boolean;
  subjectInput: string;
  subjectMessage: string;
  subjectOptions: string[];
};

export function SubjectSettingsCard({
  confirm,
  editingSubject,
  editingSubjectInput,
  onAddSubject,
  onCancelEditSubject,
  onDeleteSubject,
  onSaveSubject,
  onStartEditSubject,
  setEditingSubjectInput,
  setSubjectInput,
  setSubjectMessage,
  subjectInUse,
  subjectInput,
  subjectMessage,
  subjectOptions
}: SubjectSettingsCardProps) {
  return (
    <Card className="h-fit overflow-hidden">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
              <BookOpen size={14} /> 科目管理
            </div>
            <CardTitle className="text-lg">科目列表</CardTitle>
            <CardDescription>新增和编辑课程时统一从这里选择科目；修改科目名称会同步更新已有课程。</CardDescription>
          </div>
          <Badge variant="secondary" className="w-fit">{subjectOptions.length} 个</Badge>
        </div>
        <div className="grid grid-cols-1 gap-2 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            value={subjectInput}
            onChange={(event) => {
              setSubjectInput(event.target.value);
              if (subjectMessage) setSubjectMessage("");
            }}
            placeholder="新增科目，例如：英语、物理"
            maxLength={24}
            className="bg-white"
          />
          <Button type="button" onClick={onAddSubject} disabled={!subjectInput.trim()}>
            <Plus size={14} /> 添加科目
          </Button>
        </div>
        {subjectMessage && (
          <div className="rounded-[12px] border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm font-bold text-[#b91c1c]">
            {subjectMessage}
          </div>
        )}
      </CardHeader>
      <CardContent className="max-h-[360px] space-y-2 overflow-y-auto pr-2">
        {subjectOptions.map((subject) => {
          const isEditing = editingSubject === subject;
          const used = subjectInUse(subject);
          return (
            <motion.div
              key={subject}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-[14px] border border-[#dbe4ef] bg-white p-3"
            >
              {isEditing ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <Input
                    value={editingSubjectInput}
                    onChange={(event) => {
                      setEditingSubjectInput(event.target.value);
                      if (subjectMessage) setSubjectMessage("");
                    }}
                    maxLength={24}
                    className="bg-white"
                  />
                  <Button type="button" size="sm" onClick={onSaveSubject} disabled={!editingSubjectInput.trim()}>
                    <Save size={14} /> 保存
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={onCancelEditSubject}>
                    <X size={14} /> 取消
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eaf2ff]">
                    <BookOpen size={16} className="text-[#1557c2]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold text-[#061226]">{subject}</span>
                    <span className="mt-1 block text-xs font-semibold text-[#64748b]">
                      {used ? "已有课程使用" : "暂无课程使用"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 rounded-[9px] p-0"
                      onClick={() => onStartEditSubject(subject)}
                      title="编辑科目"
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="h-8 w-8 rounded-[9px] p-0"
                      disabled={used}
                      title={used ? "已有课程使用，不能直接删除" : "删除科目"}
                      onClick={() =>
                        confirm({
                          title: `删除科目「${subject}」？`,
                          description: "删除后不会再出现在科目管理列表中。",
                          confirmLabel: "删除",
                          tone: "danger",
                          onConfirm: () => onDeleteSubject(subject)
                        })
                      }
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </CardContent>
    </Card>
  );
}
