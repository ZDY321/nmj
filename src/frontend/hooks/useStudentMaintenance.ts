import { useState } from "react";
import type { Student, TeacherVault } from "@/shared/types";
import type { useConfirmDialog } from "@/frontend/components/ConfirmDialog";

type StudentMaintenanceOptions = {
  vault: TeacherVault;
  visibleStudents: Student[];
  configuredGradeOptions: string[];
  confirm: ReturnType<typeof useConfirmDialog>["confirm"];
  onUpdateStudent: (student: Student) => void;
  onUpdateStudents: (students: Student[]) => void;
  onDeleteStudents: (studentIds: string[]) => void;
  removeCourseDraftStudents: (studentIds: Iterable<string>) => void;
  onOpenEditor: () => void;
  onHighlightStudent: (studentId: string) => void;
  onGradeMessage: (message: string) => void;
};

export function useStudentMaintenance({
  vault, visibleStudents, configuredGradeOptions, confirm,
  onUpdateStudent, onUpdateStudents, onDeleteStudents,
  removeCourseDraftStudents, onOpenEditor, onHighlightStudent, onGradeMessage
}: StudentMaintenanceOptions) {
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  function studentInUse(studentId: string): boolean {
    return (
      vault.courseGroups.some((course) => course.studentIds.includes(studentId)) ||
      vault.lessons.some(
        (lesson) =>
          lesson.expectedStudentIds.includes(studentId) ||
          lesson.makeupStudentId === studentId ||
          lesson.attendance.some((entry) => entry.studentId === studentId)
      ) ||
      (vault.studentProgressRecords ?? []).some((record) => record.studentId === studentId) ||
      (vault.progressChecklistCompletions ?? []).some((completion) => completion.studentId === studentId) ||
      (vault.gradeRecords ?? []).some((record) => record.studentId === studentId)
    );
  }

  function openStudentEditor(student: Student) {
    onOpenEditor();
    setEditingStudent(student);
  }

  function requestArchiveStudent(student: Student) {
    confirm({
      title: `归档学生「${student.name}」？`,
      description: "归档后不会出现在添加课程档案、添加关联学生和班型调整的学生搜索结果中，历史课程和课时记录会保留。",
      confirmLabel: "归档",
      tone: "danger",
      onConfirm: () => {
        removeCourseDraftStudents([student.id]);
        onUpdateStudent({ ...student, status: "paused" });
        onHighlightStudent(student.id);
      }
    });
  }

  function restoreStudent(student: Student) {
    onUpdateStudent({ ...student, status: "active" });
    onHighlightStudent(student.id);
  }

  function updateStudentStatusFromRow(student: Student, status: Student["status"]) {
    if (student.status === status) return;
    if (status !== "active") {
      removeCourseDraftStudents([student.id]);
    }
    onUpdateStudent({ ...student, status });
    onHighlightStudent(student.id);
  }

  function toggleStudentSelection(studentId: string) {
    setSelectedStudentIds((current) =>
      current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]
    );
  }

  function toggleVisibleStudentSelection(checked: boolean) {
    const visibleIds = visibleStudents.map((student) => student.id);
    setSelectedStudentIds((current) => {
      if (checked) return Array.from(new Set([...current, ...visibleIds]));
      const visibleIdSet = new Set(visibleIds);
      return current.filter((id) => !visibleIdSet.has(id));
    });
  }

  function updateSelectedStudentsStatus(status: Student["status"]) {
    const selectedStudents = visibleStudents.filter((student) => selectedStudentIds.includes(student.id));
    if (selectedStudents.length === 0) return;
    const apply = () => {
      const selectedIdSet = new Set(selectedStudents.map((student) => student.id));
      if (status !== "active") {
        removeCourseDraftStudents(selectedIdSet);
      }
      onUpdateStudents(selectedStudents.map((student) => ({ ...student, status })));
      setSelectedStudentIds((current) => current.filter((id) => !selectedIdSet.has(id)));
    };
    if (status === "paused") {
      confirm({
        title: `归档选中的 ${selectedStudents.length} 个学生？`,
        description: "归档后不会出现在添加课程档案、添加关联学生和班型调整的学生搜索结果中，历史课程和课时记录会保留。",
        confirmLabel: "归档",
        tone: "danger",
        onConfirm: apply
      });
      return;
    }
    apply();
  }

  function upgradeSelectedStudents() {
    const selectedStudents = visibleStudents.filter((student) => selectedStudentIds.includes(student.id));
    if (selectedStudents.length === 0) return;
    const gradeIndex = new Map(configuredGradeOptions.map((grade, index) => [grade, index]));
    const updates: Student[] = selectedStudents
      .map((student): Student | null => {
        const index = student.grade ? gradeIndex.get(student.grade) : undefined;
        if (index === undefined || index >= configuredGradeOptions.length - 1) return null;
        return { ...student, grade: configuredGradeOptions[index + 1] };
      })
      .filter((student): student is Student => student !== null);
    if (updates.length === 0) {
      onGradeMessage("选中的学生没有可提升的已配置年级，或已经是最后一个年级。");
      return;
    }
    onUpdateStudents(updates);
    setSelectedStudentIds((current) => current.filter((id) => !updates.some((student) => student.id === id)));
  }

  function deleteSelectedArchivedStudents() {
    const selectedArchivedStudents = visibleStudents.filter((student) => selectedStudentIds.includes(student.id) && student.status === "paused");
    const deletableStudents = selectedArchivedStudents.filter((student) => !studentInUse(student.id));
    const skippedCount = selectedArchivedStudents.length - deletableStudents.length;
    if (deletableStudents.length === 0) return;
    confirm({
      title: `删除选中的 ${deletableStudents.length} 个归档学生？`,
      description: skippedCount > 0
        ? `会永久删除没有课程、课时、进度或成绩引用的归档学生；另有 ${skippedCount} 个学生已有历史记录，会继续保留为归档状态。`
        : "会永久删除这些没有历史引用的归档学生档案。",
      confirmLabel: "删除",
      tone: "danger",
      onConfirm: () => {
        const deletedIds = deletableStudents.map((student) => student.id);
        const deletedIdSet = new Set(deletedIds);
        onDeleteStudents(deletedIds);
        setSelectedStudentIds((current) => current.filter((id) => !deletedIdSet.has(id)));
      }
    });
  }

  function gradeSelectValue(grade?: string): string {
    if (!grade) return "";
    return configuredGradeOptions.includes(grade) ? grade : "";
  }

  function saveStudentDraft() {
    if (!editingStudent?.name.trim()) return;
    const studentId = editingStudent.id;
    const nextStudent = {
      ...editingStudent,
      name: editingStudent.name.trim(),
      grade: editingStudent.grade === "__custom__" ? undefined : editingStudent.grade
    };
    if (nextStudent.status === "paused") {
      removeCourseDraftStudents([studentId]);
    }
    onUpdateStudent(nextStudent);
    setEditingStudent(null);
    onHighlightStudent(studentId);
  }

  function cancelStudentDraft() {
    if (editingStudent) {
      onHighlightStudent(editingStudent.id);
    }
    setEditingStudent(null);
  }

  // Switching editors only dismisses the draft; cancel also highlights its row.
  function dismissStudentEditor() {
    setEditingStudent(null);
  }

  return {
    archiveProps: {
      onOpenStudentEditor: openStudentEditor,
      onRequestArchiveStudent: requestArchiveStudent,
      onRestoreStudent: restoreStudent,
      onUpdateStudentStatus: updateStudentStatusFromRow,
      onDeleteSelectedArchivedStudents: deleteSelectedArchivedStudents,
      selectedStudentIds,
      studentInUse,
      onToggleStudentSelection: toggleStudentSelection,
      onToggleVisibleStudentSelection: toggleVisibleStudentSelection,
      onUpdateSelectedStudentsStatus: updateSelectedStudentsStatus,
      onUpgradeSelectedStudents: upgradeSelectedStudents
    },
    editorProps: {
      editingStudent,
      gradeSelectValue,
      onCancel: cancelStudentDraft,
      onSave: saveStudentDraft,
      setEditingStudent
    },
    dismissStudentEditor
  };
}
