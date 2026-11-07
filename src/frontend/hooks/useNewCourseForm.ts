import { useEffect, useState, type FormEvent } from "react";
import type { ClassFeeTier, CourseGroup, CourseType, FeeRule, TeacherVault } from "@/shared/types";
import type { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { backupFeeRuleForCourseType, feeRuleForCourseType, isClassBillingCourseType } from "@/frontend/lib/calculations";
import { makeId } from "@/frontend/lib/crypto";
import { canAddStudentToCourse, courseTypeDefaultFeeRule, firstCourseStudentCampus, firstCourseStudentGrade, normalizeCourseFeeRuleForType, normalizeCourseStudentIds, patchedCourseClassFeeTiers, withCourseClassFeeTiers, withTrialFixedFee } from "@/frontend/lib/courseFormRules";

type NewCourseFormOptions = {
  vault: TeacherVault;
  preferredCampusId: string;
  subjectOptions: string[];
  courseTypeOptions: Array<{ value: CourseType }>;
  confirm: ReturnType<typeof useConfirmDialog>["confirm"];
  onAddCourse: (course: CourseGroup) => void;
};

export function useNewCourseForm({ vault, preferredCampusId, subjectOptions, courseTypeOptions, confirm, onAddCourse }: NewCourseFormOptions) {
  const [courseNameInput, setCourseNameInput] = useState("");
  const [courseNameEdited, setCourseNameEdited] = useState(false);
  const [courseType, setCourseType] = useState<CourseType>("one_on_one");
  const [courseSubjectInput, setCourseSubjectInput] = useState("");
  const [courseCampusInput, setCourseCampusInput] = useState(preferredCampusId);
  const [courseCampusCustomized, setCourseCampusCustomized] = useState(false);
  const [courseStatusInput, setCourseStatusInput] = useState<CourseGroup["status"]>("active");
  const [courseStudentIds, setCourseStudentIds] = useState<string[]>([]);
  const [courseFeeRule, setCourseFeeRule] = useState<FeeRule>(() => backupFeeRuleForCourseType("one_on_one", feeRuleForCourseType(vault, "one_on_one")));
  const [newCourseStudentSearch, setNewCourseStudentSearch] = useState("");
  const [newCourseStudentGradeFilter, setNewCourseStudentGradeFilter] = useState("all");
  const [newCourseStudentCampusFilter, setNewCourseStudentCampusFilter] = useState("all");
  const suggestedCourseName = buildSuggestedCourseName(courseType, courseStudentIds);
  const campusOptionIds = [vault.profile.homeCampusId ?? "", ...vault.campuses.map((campus) => campus.id)].join("|");
  const subjectOptionIds = subjectOptions.join("|");
  const courseTypeOptionIds = courseTypeOptions.map((option) => option.value).join("|");

  // Compare option identities so unrelated vault changes do not reset the draft.
  useEffect(() => {
    setCourseCampusInput((current) =>
      current && vault.campuses.some((campus) => campus.id === current) ? current : preferredCampusId
    );
  }, [campusOptionIds]);

  useEffect(() => {
    if (!courseNameEdited) setCourseNameInput(suggestedCourseName);
  }, [courseNameEdited, suggestedCourseName]);

  useEffect(() => {
    const fallbackSubject = subjectOptions[0] ?? "未设置";
    setCourseSubjectInput((current) => (current && subjectOptions.includes(current) ? current : fallbackSubject));
  }, [subjectOptionIds]);

  useEffect(() => {
    if (courseTypeOptions.length === 0) return;
    if (!courseTypeOptions.some((option) => option.value === courseType)) {
      changeNewCourseType(courseTypeOptions[0].value);
    }
  }, [courseTypeOptionIds]);

  function addCourse(e: FormEvent) {
    e.preventDefault();
    submitCourse();
  }

  function submitCourse(forceDuplicate = false) {
    const resolvedName = courseNameInput.trim() || suggestedCourseName;
    if (!resolvedName) return;
    const feeRule = normalizeCourseFeeRuleForType(courseType, courseFeeRule);
    const normalizedStudentIds = normalizeCourseStudentIds(vault, courseType, activeCourseStudentIds(courseStudentIds), feeRule);
    const resolvedCampusId = courseCampusInput || firstCourseStudentCampus(vault, normalizedStudentIds) || preferredCampusId;
    const resolvedSubject = courseSubjectInput.trim() || subjectOptions[0] || "未设置";
    const duplicateCourse = findDuplicateCourse(courseType, resolvedCampusId, resolvedSubject, normalizedStudentIds);
    if (duplicateCourse && !forceDuplicate) {
      confirm({
        title: "可能重复添加课程",
        description: `已有「${duplicateCourse.name}」使用相同班型、校区、科目和学生。请确认是否仍要新增一条课程。`,
        confirmLabel: "仍然添加",
        tone: "danger",
        onConfirm: () => submitCourse(true)
      });
      return;
    }
    onAddCourse({
      id: makeId("course"),
      name: resolvedName,
      type: courseType,
      subject: resolvedSubject,
      defaultCampusId: resolvedCampusId,
      studentIds: normalizedStudentIds,
      feeRule,
      status: courseStatusInput
    });
    setCourseNameInput("");
    setCourseSubjectInput("");
    setCourseStudentIds([]);
    setCourseCampusInput(preferredCampusId);
    setCourseCampusCustomized(false);
    setCourseStatusInput("active");
    setCourseFeeRule(courseTypeDefaultFeeRule(vault, courseType));
    setNewCourseStudentSearch("");
    setCourseNameEdited(false);
  }

  function findDuplicateCourse(type: CourseType, campusId: string | undefined, subject: string, studentIds: string[]): CourseGroup | undefined {
    const studentKey = normalizedStudentIdKey(studentIds);
    const normalizedSubject = subject.trim().toLowerCase();
    return vault.courseGroups.find(
      (course) =>
        course.type === type &&
        (course.defaultCampusId ?? "") === (campusId ?? "") &&
        course.subject.trim().toLowerCase() === normalizedSubject &&
        normalizedStudentIdKey(course.studentIds) === studentKey
    );
  }

  function syncNewCourseCampusFromStudents(studentIds: string[]) {
    if (courseCampusCustomized) return;
    const campusId = firstCourseStudentCampus(vault, studentIds);
    if (campusId) {
      setCourseCampusInput(campusId);
    }
  }

  function changeNewCourseCampus(campusId: string) {
    setCourseCampusInput(campusId);
    setCourseCampusCustomized(true);
  }

  function applyNewCourseFeeRule(nextRule: FeeRule) {
    setCourseFeeRule(nextRule);
    setCourseStudentIds((current) => normalizeCourseStudentIds(vault, courseType, current, nextRule));
  }

  function buildSuggestedCourseName(type: CourseType, studentIds: string[]): string {
    const primaryStudent = studentIds[0] ? vault.students.find((student) => student.id === studentIds[0]) : undefined;
    if (primaryStudent) {
      return primaryStudent.name;
    }
    if (isClassBillingCourseType(type)) {
      const firstStudentGrade = firstCourseStudentGrade(vault, studentIds);
      return firstStudentGrade !== undefined
        ? `${firstStudentGrade || "未设置年级"}${courseSubjectInput.trim() || "班课"}`
        : "";
    }
    return "";
  }

  function changeNewCourseType(nextType: CourseType) {
    const nextFeeRule = courseTypeDefaultFeeRule(vault, nextType);
    const nextStudentIds = normalizeCourseStudentIds(vault, nextType, activeCourseStudentIds(courseStudentIds), nextFeeRule);
    setCourseType(nextType);
    setCourseStudentIds(nextStudentIds);
    setCourseFeeRule(nextFeeRule);
    syncNewCourseCampusFromStudents(nextStudentIds);
  }

  function updateNewCourseFee(patch: Partial<FeeRule>) {
    applyNewCourseFeeRule({ ...courseFeeRule, ...patch });
  }

  function updateNewTrialFixedFee(fixedFee: number) {
    applyNewCourseFeeRule(withTrialFixedFee(courseFeeRule, fixedFee));
  }

  function replaceNewClassFeeTiers(nextTiers: ClassFeeTier[]) {
    applyNewCourseFeeRule(withCourseClassFeeTiers(courseFeeRule, nextTiers));
  }

  function updateNewClassFeeTier(tierId: string, patch: Partial<ClassFeeTier>) {
    replaceNewClassFeeTiers(patchedCourseClassFeeTiers(courseFeeRule, tierId, patch));
  }

  function setNewCourseStudents(nextStudentIds: string[]) {
    const normalizedStudentIds = normalizeCourseStudentIds(vault, courseType, activeCourseStudentIds(nextStudentIds), courseFeeRule);
    setCourseStudentIds(normalizedStudentIds);
    syncNewCourseCampusFromStudents(normalizedStudentIds);
  }

  function activeCourseStudentIds(studentIds: string[]): string[] {
    return studentIds.filter((studentId) => {
      const student = vault.students.find((item) => item.id === studentId);
      return student?.status === "active";
    });
  }

  function toggleNewCourseStudent(studentId: string) {
    const isSelected = courseStudentIds.includes(studentId);
    const student = vault.students.find((item) => item.id === studentId);
    if (!isSelected) {
      if (student?.status !== "active") return;
      if (!canAddStudentToCourse(vault, courseType, courseFeeRule, courseStudentIds, student)) return;
    }
    setNewCourseStudents(
      isSelected ? courseStudentIds.filter((id) => id !== studentId) : [...courseStudentIds, studentId]
    );
  }

  // Student maintenance removes selections without changing the chosen campus.
  function removeStudents(studentIds: Iterable<string>) {
    const removedIds = new Set(studentIds);
    setCourseStudentIds((current) => current.filter((id) => !removedIds.has(id)));
  }

  // Settings changes replace the fee only. Form edits also normalize the roster.
  function syncCourseTypeFeeRule(type: CourseType, nextRule?: FeeRule) {
    if (courseType === type) setCourseFeeRule(nextRule ?? courseTypeDefaultFeeRule(vault, type));
  }

  return {
    formProps: {
      courseCampusCustomized,
      courseCampusInput,
      courseFeeRule,
      courseNameInput,
      courseStatusInput,
      courseStudentIds,
      courseSubjectInput,
      courseType,
      newCourseStudentSearch,
      newCourseStudentGradeFilter,
      newCourseStudentCampusFilter,
      onChangeCourseCampus: changeNewCourseCampus,
      onChangeCourseType: changeNewCourseType,
      onSubmit: addCourse,
      onToggleCourseStudent: toggleNewCourseStudent,
      onUpdateClassFeeTier: updateNewClassFeeTier,
      onUpdateCourseFee: updateNewCourseFee,
      onUpdateTrialFixedFee: updateNewTrialFixedFee,
      setCourseNameEdited,
      setCourseNameInput,
      setCourseStatusInput,
      setCourseSubjectInput,
      setNewCourseStudentSearch,
      setNewCourseStudentGradeFilter,
      setNewCourseStudentCampusFilter,
      suggestedCourseName
    },
    removeStudents,
    syncCourseTypeFeeRule
  };
}

function normalizedStudentIdKey(studentIds: string[]): string {
  return [...studentIds].sort().join("|");
}
