import { useState } from "react";
import type { ClassFeeTier, CourseGroup, CourseType, TeacherVault } from "@/shared/types";
import { canAddStudentToCourse, courseTypeDefaultFeeRule, firstCourseStudentCampus, normalizeCourseFeeRuleForType, normalizeCourseStudentIds, patchedCourseClassFeeTiers, supportsSalaryGradeFee, withCourseClassFeeTiers, withTrialFixedFee } from "@/frontend/lib/courseFormRules";

type CourseEditorOptions = {
  vault: TeacherVault;
  onUpdateCourse: (course: CourseGroup) => void;
  onOpen: () => void;
  onFinish: (courseId: string) => void;
};

export function useCourseEditor({ vault, onUpdateCourse, onOpen, onFinish }: CourseEditorOptions) {
  const [editingCourse, setEditingCourse] = useState<CourseGroup | null>(null);
  const [courseStudentSearch, setCourseStudentSearch] = useState("");
  const [courseStudentScope, setCourseStudentScope] = useState<"all" | "selected" | "available">("all");
  const [courseStudentGradeFilter, setCourseStudentGradeFilter] = useState("all");
  const [courseStudentCampusFilter, setCourseStudentCampusFilter] = useState("all");

  function resetStudentFilters() {
    setCourseStudentSearch("");
    setCourseStudentScope("all");
    setCourseStudentGradeFilter("all");
    setCourseStudentCampusFilter("all");
  }

  // Switching to the student editor closes only the draft; save/cancel also reset filters.
  function dismissCourseEditor() {
    setEditingCourse(null);
  }

  function updateEditingCourse(patch: Partial<CourseGroup>) {
    setEditingCourse((current) => (current ? { ...current, ...patch } : current));
  }

  function updateEditingCourseFee(patch: Partial<CourseGroup["feeRule"]>) {
    setEditingCourse((current) =>
      current ? { ...current, feeRule: { ...current.feeRule, ...patch } } : current
    );
  }

  function updateEditingTrialFixedFee(fixedFee: number) {
    setEditingCourse((current) => current ? { ...current, feeRule: withTrialFixedFee(current.feeRule, fixedFee) } : current);
  }

  function replaceEditingClassFeeTiers(nextTiers: ClassFeeTier[]) {
    setEditingCourse((current) => {
      if (!current) return current;
      const feeRule = withCourseClassFeeTiers(current.feeRule, nextTiers);
      return { ...current, feeRule, studentIds: normalizeCourseStudentIds(vault, current.type, current.studentIds, feeRule) };
    });
  }

  function updateClassFeeTier(tierId: string, patch: Partial<ClassFeeTier>) {
    if (!editingCourse) return;
    replaceEditingClassFeeTiers(patchedCourseClassFeeTiers(editingCourse.feeRule, tierId, patch));
  }

  function openCourseEditor(course: CourseGroup) {
    onOpen();
    setEditingCourse(course);
    resetStudentFilters();
  }

  function toggleCourseStudent(studentId: string) {
    setEditingCourse((current) => {
      if (!current) return current;
      const isSelected = current.studentIds.includes(studentId);
      const student = vault.students.find((item) => item.id === studentId);
      if (!isSelected) {
        if (student?.status !== "active") return current;
        if (!canAddStudentToCourse(vault, current.type, current.feeRule, current.studentIds, student)) return current;
      }
      const studentIds = isSelected
        ? current.studentIds.filter((id) => id !== studentId)
        : [...current.studentIds, studentId];
      return {
        ...current,
        studentIds,
        defaultCampusId: !isSelected ? student?.defaultCampusId ?? current.defaultCampusId : current.defaultCampusId
      };
    });
  }

  function changeEditingCourseType(nextType: CourseType) {
    if (!editingCourse) return;
    const nextFeeRule = supportsSalaryGradeFee(nextType) && editingCourse.feeRule.mode === "salary_grade"
      ? editingCourse.feeRule
      : courseTypeDefaultFeeRule(vault, nextType);
    const nextStudentIds = normalizeCourseStudentIds(vault, nextType, editingCourse.studentIds, nextFeeRule);
    updateEditingCourse({
      type: nextType,
      feeRule: nextFeeRule,
      studentIds: nextStudentIds,
      defaultCampusId: firstCourseStudentCampus(vault, nextStudentIds) ?? editingCourse.defaultCampusId
    });
  }

  function saveCourseDraft() {
    if (!editingCourse?.name.trim()) return;
    const courseId = editingCourse.id;
    const feeRule = normalizeCourseFeeRuleForType(editingCourse.type, editingCourse.feeRule);
    const studentIds = normalizeCourseStudentIds(vault, editingCourse.type, editingCourse.studentIds, feeRule);
    onUpdateCourse({
      ...editingCourse,
      name: editingCourse.name.trim(),
      subject: editingCourse.subject.trim() || "未设置",
      studentIds,
      defaultCampusId: firstCourseStudentCampus(vault, studentIds) ?? editingCourse.defaultCampusId,
      feeRule
    });
    setEditingCourse(null);
    resetStudentFilters();
    onFinish(courseId);
  }

  function cancelCourseDraft() {
    if (editingCourse) {
      onFinish(editingCourse.id);
    }
    setEditingCourse(null);
    resetStudentFilters();
  }

  return {
    editingCourse,
    courseStudentSearch,
    setCourseStudentSearch,
    courseStudentScope,
    setCourseStudentScope,
    courseStudentGradeFilter,
    setCourseStudentGradeFilter,
    courseStudentCampusFilter,
    setCourseStudentCampusFilter,
    updateEditingCourse,
    updateEditingCourseFee,
    updateEditingTrialFixedFee,
    updateClassFeeTier,
    openCourseEditor,
    dismissCourseEditor,
    toggleCourseStudent,
    changeEditingCourseType,
    saveCourseDraft,
    cancelCourseDraft
  };
}
