import type { Dispatch, SetStateAction } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Campus, Student } from "@/shared/types";

type StudentEditDialogProps = {
  campusOptions: Campus[];
  editingStudent: Student | null;
  gradeOptions: string[];
  gradeSelectValue: (grade?: string) => string;
  onCancel: () => void;
  onSave: () => void;
  setEditingStudent: Dispatch<SetStateAction<Student | null>>;
};

export function StudentEditDialog({
  campusOptions,
  editingStudent,
  gradeOptions,
  gradeSelectValue,
  onCancel,
  onSave,
  setEditingStudent
}: StudentEditDialogProps) {
  return (
    <AnimatePresence>
      {editingStudent && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#061226]/36 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onCancel();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[18px] border border-[#dbe4ef] bg-white shadow-[0_28px_80px_rgba(6,18,38,0.24)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#e8eef6] p-5">
              <div className="min-w-0">
                <div className="text-lg font-extrabold text-[#061226]">编辑学生</div>
                <div className="mt-1 truncate text-sm font-semibold text-[#64748b]">{editingStudent.name}</div>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={onCancel} aria-label="关闭学生编辑弹窗">
                <X size={17} />
              </Button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
              <Input
                value={editingStudent.name}
                onChange={(event) => setEditingStudent({ ...editingStudent, name: event.target.value })}
                placeholder="学生姓名"
              />
              <Select
                value={gradeSelectValue(editingStudent.grade)}
                onChange={(event) => setEditingStudent({ ...editingStudent, grade: event.target.value === "自定义" ? "__custom__" : event.target.value || undefined })}
              >
                {gradeOptions.map((grade) => (
                  <option key={grade} value={grade === "未设置年级" ? "" : grade}>{grade}</option>
                ))}
              </Select>
              {gradeSelectValue(editingStudent.grade) === "自定义" && (
                <Input
                  value={editingStudent.grade === "__custom__" ? "" : editingStudent.grade ?? ""}
                  onChange={(event) => setEditingStudent({ ...editingStudent, grade: event.target.value })}
                  placeholder="输入自定义年级"
                />
              )}
              <Input
                value={editingStudent.school ?? ""}
                onChange={(event) => setEditingStudent({ ...editingStudent, school: event.target.value || undefined })}
                placeholder="所在学校"
              />
              <Select
                value={editingStudent.defaultCampusId ?? ""}
                onChange={(event) => setEditingStudent({ ...editingStudent, defaultCampusId: event.target.value || undefined })}
              >
                <option value="">未设置校区</option>
                {campusOptions.map((campus) => (
                  <option key={campus.id} value={campus.id}>{campus.name}</option>
                ))}
              </Select>
              <Select
                value={editingStudent.status}
                onChange={(event) => setEditingStudent({ ...editingStudent, status: event.target.value as Student["status"] })}
              >
                <option value="active">在读</option>
                <option value="paused">已归档</option>
              </Select>
              <label className="flex items-center gap-3 rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2 text-sm font-bold text-[#25324a]">
                <input
                  type="checkbox"
                  checked={Boolean(editingStudent.temporaryTrial)}
                  onChange={(event) => setEditingStudent({ ...editingStudent, temporaryTrial: event.target.checked })}
                  className="h-4 w-4 accent-[#ff8617]"
                />
                临时试听学生
              </label>
              <Textarea
                value={editingStudent.note ?? ""}
                onChange={(event) => setEditingStudent({ ...editingStudent, note: event.target.value })}
                placeholder="档案备注，例如学习情况、家长沟通、排课偏好"
                className="min-h-[92px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-[#e8eef6] bg-[#f8fbff] p-4">
              <Button type="button" onClick={onSave} disabled={!editingStudent.name.trim()}>
                <Save size={14} /> 保存
              </Button>
              <Button type="button" variant="outline" onClick={onCancel}>
                <X size={14} /> 取消
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
