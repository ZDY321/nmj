import { Fragment, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Building2, CalendarDays, ChevronRight, GraduationCap, Plus, Search, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Campus, ClassFeeTier, CourseGroup, CourseType, CustomCourseType, CustomCourseTypeOption, FeeRule, SalaryGradeId, Student, StudentCourseTransition, TeacherProfile, TeacherVault } from "@/shared/types";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { CampusCourseSettingsPanel } from "@/frontend/components/CampusCourseSettingsPanel";
import { CourseEditDialog } from "@/frontend/components/CourseEditDialog";
import { CourseArchiveListPanel } from "@/frontend/components/CourseArchiveListPanel";
import { StudentArchivePanel } from "@/frontend/components/StudentArchivePanel";
import { StudentCourseTransferPanel } from "@/frontend/components/StudentCourseTransferPanel";
import { StudentEditDialog } from "@/frontend/components/StudentEditDialog";
import { SensitiveAmountField } from "@/frontend/components/SensitiveAmountField";
import { TeacherProfilePanel } from "@/frontend/components/TeacherProfilePanel";
import { TeacherSalaryRulesPanel } from "@/frontend/components/TeacherSalaryRulesPanel";
import { makeId } from "@/frontend/lib/crypto";
import { calculateClassHeadcountFee, defaultClassFeeTiers, defaultFeeRuleForCourseType, defaultSalaryGradeRule, feeRuleForCourseType, fixedFeeForRule, normalizedClassFeeTiers, obligationSummary, resolveSalaryGradeRule, salaryGradeLabel, salaryGradeRuleById, salaryGradeRulesForVault, salaryGradeAmountForCount, todayIso } from "@/frontend/lib/calculations";
import { builtInCourseTypeOptions, campusName, compareByName, courseTypeLabel, courseTypeOptionsForVault, formatPrivateMoney, sortCampusesForProfile, sortCoursesByName, sortStudentsByName, studentLimitForCourseType, studentNames, subjectOptionsForVault } from "@/frontend/lib/helpers";

const fixedGradeOptions = ["初一", "初二", "初三"];
const gradeOptions = ["未设置年级", ...fixedGradeOptions, "自定义"];
type ArchivePanel = "profile" | "salaryRules" | "campuses" | "students" | "courses";

export function StudentsView({
  vault,
  onAddCampus,
  onUpdateCampus,
  onDeleteCampus,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onUpdateProfile,
  onAddCourse,
  onUpdateCourse,
  onDeleteCourse,
  onAddCustomCourseType,
  onUpdateCustomCourseType,
  onDeleteCustomCourseType,
  onUpdateCourseTypeLabel,
  onDeleteCourseType,
  onRestoreCourseType,
  onUpdateCourseTypeFeeRule,
  onAddSubject,
  onUpdateSubject,
  onDeleteSubject,
  onTransferStudentCourse,
  onOpenSchedule,
  amountsVisible
}: {
  vault: TeacherVault;
  amountsVisible: boolean;
  onAddCampus: (campus: Campus) => void;
  onUpdateCampus: (campus: Campus) => void;
  onDeleteCampus: (campusId: string) => void;
  onAddStudent: (student: Student) => void;
  onUpdateStudent: (student: Student) => void;
  onDeleteStudent: (studentId: string) => void;
  onUpdateProfile: (profile: TeacherProfile) => void;
  onAddCourse: (course: CourseGroup) => void;
  onUpdateCourse: (course: CourseGroup) => void;
  onDeleteCourse: (courseId: string) => void;
  onAddCustomCourseType: (courseType: CustomCourseTypeOption, feeRule?: FeeRule) => void;
  onUpdateCustomCourseType: (courseType: CustomCourseTypeOption) => void;
  onDeleteCustomCourseType: (courseTypeId: CustomCourseType) => void;
  onUpdateCourseTypeLabel: (courseType: CourseType, label: string) => void;
  onDeleteCourseType: (courseType: CourseType) => void;
  onRestoreCourseType: (courseType: CourseType) => void;
  onUpdateCourseTypeFeeRule: (courseType: CourseType, feeRule: FeeRule) => void;
  onAddSubject: (subject: string) => void;
  onUpdateSubject: (previousSubject: string, nextSubject: string) => void;
  onDeleteSubject: (subject: string) => void;
  onTransferStudentCourse: (transition: StudentCourseTransition) => void;
  onOpenSchedule: () => void;
}) {
  const campusOptions = sortCampusesForProfile(vault.campuses, vault.profile.homeCampusId);
  const courseTypeOptions = courseTypeOptionsForVault(vault);
  const subjectOptions = subjectOptionsForVault(vault);
  const salaryGradeOptions = salaryGradeRulesForVault(vault);
  const selectedProfileSalaryGrade = salaryGradeRuleById(vault.profile.defaultSalaryGradeId, vault);
  const studentOptions = sortStudentsByName(vault.students);
  const activeStudentOptions = sortStudentsByName(vault.students.filter((student) => student.status !== "paused"));
  const archivedStudentOptions = sortStudentsByName(vault.students.filter((student) => student.status === "paused"));
  const courseGroupOptions = sortCoursesByName(vault.courseGroups);
  const customCourseTypes = vault.preferences?.customCourseTypes ?? [];
  const disabledCourseTypes = new Set(vault.preferences?.disabledCourseTypes ?? []);
  const allManagedCourseTypes: Array<{ value: CourseType; label: string }> = [
    ...builtInCourseTypeOptions.map((item) => ({ value: item.value as CourseType, label: courseTypeLabel(vault, item.value) })),
    ...customCourseTypes.map((item) => ({ value: item.id as CourseType, label: item.label }))
  ].sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN") || a.value.localeCompare(b.value));
  const managedCourseTypes = allManagedCourseTypes.filter((item) => !disabledCourseTypes.has(item.value));
  const deletedBuiltInCourseTypes = allManagedCourseTypes.filter(
    (item) => !item.value.startsWith("custom_") && disabledCourseTypes.has(item.value)
  );
  const preferredCampusId = campusOptions[0]?.id ?? "";
  const [campusNameInput, setCampusNameInput] = useState("");
  const [campusAddressInput, setCampusAddressInput] = useState("");
  const [campusNoteInput, setCampusNoteInput] = useState("");
  const [studentNameInput, setStudentNameInput] = useState("");
  const [studentGradeInput, setStudentGradeInput] = useState("");
  const [customGradeInput, setCustomGradeInput] = useState("");
  const [studentSchoolInput, setStudentSchoolInput] = useState("");
  const [studentTemporaryTrialInput, setStudentTemporaryTrialInput] = useState(false);
  const [studentCampusInput, setStudentCampusInput] = useState(preferredCampusId);
  const [studentNoteInput, setStudentNoteInput] = useState("");
  const [courseNameInput, setCourseNameInput] = useState("");
  const [courseNameEdited, setCourseNameEdited] = useState(false);
  const [courseType, setCourseType] = useState<CourseType>("one_on_one");
  const [courseSubjectInput, setCourseSubjectInput] = useState("");
  const [courseCampusInput, setCourseCampusInput] = useState(preferredCampusId);
  const [courseCampusCustomized, setCourseCampusCustomized] = useState(false);
  const [courseStatusInput, setCourseStatusInput] = useState<CourseGroup["status"]>("active");
  const [courseStudentIds, setCourseStudentIds] = useState<string[]>([]);
  const [courseFeeRule, setCourseFeeRule] = useState<FeeRule>(() => feeRuleForCourseType(vault, "one_on_one"));
  const [subjectInput, setSubjectInput] = useState("");
  const [editingSubject, setEditingSubject] = useState("");
  const [editingSubjectInput, setEditingSubjectInput] = useState("");
  const [subjectMessage, setSubjectMessage] = useState("");
  const [customCourseTypeInput, setCustomCourseTypeInput] = useState("");
  const [customCourseTypeTemplate, setCustomCourseTypeTemplate] = useState<"class" | "hourly">("class");
  const [customCourseTypeMinStudents, setCustomCourseTypeMinStudents] = useState(1);
  const [customCourseTypeBaseFee, setCustomCourseTypeBaseFee] = useState(0);
  const [customCourseTypePerStudentFee, setCustomCourseTypePerStudentFee] = useState(0);
  const [customCourseTypeHourlyRate, setCustomCourseTypeHourlyRate] = useState(0);
  const [courseTypeMessage, setCourseTypeMessage] = useState("");
  const [editingCustomCourseTypeId, setEditingCustomCourseTypeId] = useState<CourseType | "">("");
  const [editingCustomCourseTypeLabel, setEditingCustomCourseTypeLabel] = useState("");
  const [editingCampus, setEditingCampus] = useState<Campus | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editingCourse, setEditingCourse] = useState<CourseGroup | null>(null);
  const [flashingArchiveItem, setFlashingArchiveItem] = useState<{ panel: ArchivePanel; id: string } | null>(null);
  const [archivePanel, setArchivePanel] = useState<ArchivePanel>("profile");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [studentCampusFilter, setStudentCampusFilter] = useState("all");
  const [studentStatusFilter, setStudentStatusFilter] = useState<"active" | "archived" | "all">("active");
  const [studentTrialFilter, setStudentTrialFilter] = useState<"all" | "trial" | "regular">("all");
  const [studentCourseTypeFilter, setStudentCourseTypeFilter] = useState<"all" | CourseType>("all");
  const [studentSubjectFilter, setStudentSubjectFilter] = useState("all");
  const [courseSearch, setCourseSearch] = useState("");
  const [courseTypeFilter, setCourseTypeFilter] = useState<"all" | CourseType>("all");
  const [courseGradeFilter, setCourseGradeFilter] = useState("all");
  const [courseSubjectFilter, setCourseSubjectFilter] = useState("all");
  const [courseCampusFilter, setCourseCampusFilter] = useState("all");
  const [archiveSearch, setArchiveSearch] = useState("");
  const [courseStudentSearch, setCourseStudentSearch] = useState("");
  const [newCourseStudentSearch, setNewCourseStudentSearch] = useState("");
  const [courseStudentScope, setCourseStudentScope] = useState<"all" | "selected" | "available">("all");
  const [courseStudentGradeFilter, setCourseStudentGradeFilter] = useState("all");
  const [courseStudentCampusFilter, setCourseStudentCampusFilter] = useState("all");
  const [transferPanelOpen, setTransferPanelOpen] = useState(false);
  const [transferStudentId, setTransferStudentId] = useState(activeStudentOptions[0]?.id ?? "");
  const [transferCourseType, setTransferCourseType] = useState<CourseType>("trial");
  const [transferTargetMode, setTransferTargetMode] = useState<"new" | "existing">("new");
  const [transferTargetCourseId, setTransferTargetCourseId] = useState("");
  const [transferSubjectInput, setTransferSubjectInput] = useState("");
  const [transferCourseNameInput, setTransferCourseNameInput] = useState("");
  const [transferCampusInput, setTransferCampusInput] = useState(preferredCampusId);
  const [transferEndExisting, setTransferEndExisting] = useState(false);
  const [transferMessage, setTransferMessage] = useState("");
  const { confirm, dialog } = useConfirmDialog();
  const normalizedArchiveSearch = archiveSearch.trim().toLowerCase();
  const normalizedCourseStudentSearch = courseStudentSearch.trim().toLowerCase();
  const normalizedNewCourseStudentSearch = newCourseStudentSearch.trim().toLowerCase();
  const normalizedCourseSearch = courseSearch.trim().toLowerCase();
  const gradeFilterOptions = Array.from(new Set(vault.students.map((student) => student.grade).filter(Boolean) as string[]))
    .sort(compareByName);
  const hasStudentsWithoutGrade = vault.students.some((student) => !student.grade);
  const hasUnsetGradeFilterOption = hasStudentsWithoutGrade || vault.courseGroups.some((course) => course.studentIds.length === 0);
  const subjectFilterOptions = subjectOptions;
  const suggestedCourseName = buildSuggestedCourseName(courseType, courseStudentIds);
  const addCourseStudentOptions = activeStudentOptions.filter((student) => {
    const searchable = studentCourseSearchText(vault, student);
    return matchesKeywordSearch(searchable, normalizedNewCourseStudentSearch);
  });
  const visibleStudents = vault.students
    .filter((student) => {
      const matchesStatus =
        studentStatusFilter === "all" ||
        (studentStatusFilter === "archived" ? student.status === "paused" : student.status !== "paused");
      const matchesTrial =
        studentTrialFilter === "all" ||
        (studentTrialFilter === "trial" ? Boolean(student.temporaryTrial) : !student.temporaryTrial);
      const matchesGrade = matchesGradeFilter(student.grade, gradeFilter);
      const matchesCampus = studentCampusFilter === "all" || student.defaultCampusId === studentCampusFilter;
      const studentCourses = vault.courseGroups.filter((course) => course.studentIds.includes(student.id));
      const matchesType = studentCourseTypeFilter === "all" || studentCourses.some((course) => course.type === studentCourseTypeFilter);
      const matchesSubject = studentSubjectFilter === "all" || studentCourses.some((course) => course.subject === studentSubjectFilter);
      const matchesSearch =
        !normalizedArchiveSearch ||
        student.name.toLowerCase().includes(normalizedArchiveSearch) ||
        (student.school ?? "").toLowerCase().includes(normalizedArchiveSearch) ||
        (student.note ?? "").toLowerCase().includes(normalizedArchiveSearch);
      return matchesStatus && matchesTrial && matchesGrade && matchesCampus && matchesType && matchesSubject && matchesSearch;
    })
    .sort((a, b) => compareByName(a.name, b.name) || a.id.localeCompare(b.id));
  const visibleCourses = courseGroupOptions
    .filter((course) => {
      const courseStudents = course.studentIds
        .map((studentId) => vault.students.find((student) => student.id === studentId))
        .filter(Boolean) as Student[];
      const matchesType = courseTypeFilter === "all" || course.type === courseTypeFilter;
      const matchesGrade =
        courseGradeFilter === "all" ||
        (courseGradeFilter === "__unset"
          ? courseStudents.length === 0 || courseStudents.some((student) => !student.grade)
          : courseStudents.some((student) => student.grade === courseGradeFilter));
      const matchesSubject = courseSubjectFilter === "all" || course.subject === courseSubjectFilter;
      const matchesCampus = courseCampusFilter === "all" || course.defaultCampusId === courseCampusFilter;
      const searchable = [
        course.name,
        course.subject,
        courseTypeLabel(vault, course.type),
        campusName(vault, course.defaultCampusId),
        studentNames(vault, course.studentIds),
        course.note ?? "",
        ...courseStudents.flatMap((student) => [student.name, student.grade ?? "", student.school ?? "", student.note ?? ""])
      ].join(" ").toLowerCase();
      const matchesSearch = matchesKeywordSearch(searchable, normalizedCourseSearch);
      return matchesType && matchesGrade && matchesSubject && matchesCampus && matchesSearch;
    })
    .sort((a, b) => compareByName(a.name, b.name) || a.id.localeCompare(b.id));
  const activeStudentCount = activeStudentOptions.length;
  const archivedStudentCount = archivedStudentOptions.length;
  const activeCourses = vault.courseGroups.filter((course) => course.status === "active").length;
  const obligationCampusId = vault.profile.obligationCampusId ?? vault.profile.homeCampusId ?? "";
  const obligationMode = vault.profile.obligationDeductionMode ?? "auto_gap";
  const isManualObligationMode = obligationMode === "manual";
  const obligationMonth = todayIso().slice(0, 7);
  const obligation = obligationSummary(vault, obligationMonth, obligationCampusId || undefined);
  const transferStudent = vault.students.find((student) => student.id === transferStudentId);
  const transferCurrentCourses = transferStudent
    ? courseGroupOptions.filter((course) => course.status === "active" && course.studentIds.includes(transferStudent.id))
    : [];
  const transferSubject = transferSubjectInput.trim() || transferCurrentCourses[0]?.subject || subjectOptions[0] || "未设置";
  const transferTargetCourses = transferStudent
    ? courseGroupOptions.filter(
        (course) =>
          course.status === "active" &&
          course.type === transferCourseType &&
          !course.studentIds.includes(transferStudent.id) &&
          canJoinCourse(vault, course, transferStudent)
      )
    : [];
  const transferTargetCourseIds = transferTargetCourses.map((course) => course.id).join("|");
  const activeStudentOptionIds = activeStudentOptions.map((student) => student.id).join("|");
  const campusOptionIds = [vault.profile.homeCampusId ?? "", ...vault.campuses.map((campus) => campus.id)].join("|");
  const courseTypeOptionIds = courseTypeOptions.map((option) => option.value).join("|");
  const subjectOptionIds = subjectOptions.join("|");
  const editingCourseTypeOptions = editingCourse && !courseTypeOptions.some((type) => type.value === editingCourse.type)
    ? [{ value: editingCourse.type, label: courseTypeLabel(vault, editingCourse.type) }, ...courseTypeOptions]
    : courseTypeOptions;
  const editingCourseStudentOptions = editingCourse
    ? studentOptions.filter((student) => {
        const isSelected = editingCourse.studentIds.includes(student.id);
        if (!isSelected && student.status === "paused") return false;
        const matchesScope =
          courseStudentScope === "all" ||
          (courseStudentScope === "selected" ? isSelected : !isSelected);
        const searchable = studentCourseSearchText(vault, student);
        const matchesSearch = matchesKeywordSearch(searchable, normalizedCourseStudentSearch);
        const matchesGrade = matchesGradeFilter(student.grade, courseStudentGradeFilter);
        const matchesCampus = courseStudentCampusFilter === "all" || student.defaultCampusId === courseStudentCampusFilter;
        return matchesScope && matchesSearch && matchesGrade && matchesCampus;
      })
    : [];

  useEffect(() => {
    const fallbackCampusId = preferredCampusId;
    setStudentCampusInput((current) =>
      current && vault.campuses.some((campus) => campus.id === current) ? current : fallbackCampusId
    );
    setCourseCampusInput((current) =>
      current && vault.campuses.some((campus) => campus.id === current) ? current : fallbackCampusId
    );
  }, [campusOptionIds]);

  useEffect(() => {
    setTransferStudentId((current) =>
      activeStudentOptions.some((student) => student.id === current) ? current : activeStudentOptions[0]?.id ?? ""
    );
  }, [activeStudentOptionIds]);

  useEffect(() => {
    if (!courseNameEdited) {
      setCourseNameInput(suggestedCourseName);
    }
  }, [courseNameEdited, suggestedCourseName]);

  useEffect(() => {
    setTransferCampusInput(transferStudent?.defaultCampusId || preferredCampusId);
  }, [transferStudentId, campusOptionIds]);

  useEffect(() => {
    setTransferTargetCourseId((current) =>
      transferTargetCourses.some((course) => course.id === current) ? current : transferTargetCourses[0]?.id ?? ""
    );
  }, [transferTargetCourseIds]);

  useEffect(() => {
    const fallbackSubject = subjectOptions[0] ?? "未设置";
    setCourseSubjectInput((current) => (current && subjectOptions.includes(current) ? current : fallbackSubject));
    setTransferSubjectInput((current) => (current && subjectOptions.includes(current) ? current : fallbackSubject));
  }, [subjectOptionIds]);

  useEffect(() => {
    if (courseTypeOptions.length === 0) return;
    const fallbackType = courseTypeOptions[0].value;
    if (!courseTypeOptions.some((option) => option.value === courseType)) {
      changeNewCourseType(fallbackType);
    }
    if (!courseTypeOptions.some((option) => option.value === transferCourseType)) {
      setTransferCourseType(fallbackType);
    }
  }, [courseTypeOptionIds]);

  function addCampus(e: FormEvent) {
    e.preventDefault();
    if (!campusNameInput.trim()) return;
    onAddCampus({
      id: makeId("campus"),
      name: campusNameInput.trim(),
      address: campusAddressInput.trim() || undefined,
      note: campusNoteInput.trim() || undefined
    });
    setCampusNameInput("");
    setCampusAddressInput("");
    setCampusNoteInput("");
  }

  function addStudent(e: FormEvent) {
    e.preventDefault();
    submitStudent();
  }

  function submitStudent(forceDuplicate = false) {
    if (!studentNameInput.trim()) return;
    const resolvedGrade = studentGradeInput === "自定义" ? customGradeInput.trim() : studentGradeInput;
    const resolvedCampusId = studentCampusInput || preferredCampusId;
    const duplicateStudent = findDuplicateStudent(studentNameInput.trim(), resolvedGrade, resolvedCampusId);
    if (duplicateStudent && !forceDuplicate) {
      const duplicateStatus = duplicateStudent.status === "paused" ? "，当前已归档" : "";
      confirm({
        title: "可能重复添加学生",
        description: `已有「${duplicateStudent.name}」使用相同姓名、年级和校区${duplicateStatus}。建议先确认是否需要恢复或编辑原档案。`,
        confirmLabel: "仍然添加",
        tone: "danger",
        onConfirm: () => submitStudent(true)
      });
      return;
    }
    onAddStudent({
      id: makeId("student"),
      name: studentNameInput.trim(),
      grade: resolvedGrade || undefined,
      school: studentSchoolInput.trim() || undefined,
      temporaryTrial: studentTemporaryTrialInput,
      defaultCampusId: resolvedCampusId,
      note: studentNoteInput.trim() || undefined,
      status: "active"
    });
    setStudentNameInput("");
    setStudentGradeInput("");
    setCustomGradeInput("");
    setStudentSchoolInput("");
    setStudentTemporaryTrialInput(false);
    setStudentNoteInput("");
  }

  function addCourse(e: FormEvent) {
    e.preventDefault();
    submitCourse();
  }

  function submitCourse(forceDuplicate = false) {
    const resolvedName = courseNameInput.trim() || suggestedCourseName;
    if (!resolvedName) return;
    const normalizedStudentIds = normalizeCourseStudentIds(courseType, activeCourseStudentIds(courseStudentIds));
    const resolvedCampusId = courseCampusInput || firstCourseStudentCampus(normalizedStudentIds) || preferredCampusId;
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
    const feeRule = normalizeCourseFeeRuleForType(courseType, courseFeeRule);
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
    setCourseFeeRule(courseTypeDefaultFeeRule(courseType));
    setNewCourseStudentSearch("");
    setCourseNameEdited(false);
  }

  function applyStudentCourseTransfer(event: FormEvent) {
    event.preventDefault();
    if (!transferStudent) return;

    if (transferTargetMode === "existing") {
      const targetCourse = transferTargetCourses.find((course) => course.id === transferTargetCourseId);
      if (!targetCourse) {
        setTransferMessage("请选择一个可加入的目标课程。");
        return;
      }
      onTransferStudentCourse({
        studentId: transferStudent.id,
        targetCourseId: targetCourse.id,
        subject: targetCourse.subject,
        endExisting: transferEndExisting
      });
      setTransferMessage(`已将「${transferStudent.name}」调整到「${targetCourse.name}」。已有课时不受影响。`);
      return;
    }

    const nextCourseName = transferCourseNameInput.trim() || `${transferStudent.name}${courseTypeLabel(vault, transferCourseType)}`;
    const nextCourse: CourseGroup = {
      id: makeId("course"),
      name: nextCourseName,
      type: transferCourseType,
      subject: transferSubject,
      defaultCampusId: transferCampusInput || transferStudent.defaultCampusId || preferredCampusId,
      studentIds: [transferStudent.id],
      feeRule: courseTypeDefaultFeeRule(transferCourseType),
      status: "active"
    };
    onTransferStudentCourse({
      studentId: transferStudent.id,
      newCourse: nextCourse,
      subject: nextCourse.subject,
      endExisting: transferEndExisting
    });
    setTransferCourseNameInput("");
    setTransferMessage(`已为「${transferStudent.name}」新建「${nextCourse.name}」。已有课时不受影响。`);
  }

  function campusInUse(campusId: string): boolean {
    return (
      vault.students.some((student) => student.defaultCampusId === campusId) ||
      vault.courseGroups.some((course) => course.defaultCampusId === campusId) ||
      vault.lessons.some((lesson) => lesson.campusId === campusId)
    );
  }

  function studentInUse(studentId: string): boolean {
    return (
      vault.courseGroups.some((course) => course.studentIds.includes(studentId)) ||
      vault.lessons.some(
        (lesson) =>
          lesson.expectedStudentIds.includes(studentId) ||
          lesson.attendance.some((entry) => entry.studentId === studentId)
      )
    );
  }

  function courseInUse(courseId: string): boolean {
    return (
      vault.lessons.some((lesson) => lesson.courseGroupId === courseId)
    );
  }

  function subjectInUse(subject: string): boolean {
    return vault.courseGroups.some((course) => course.subject === subject);
  }

  function addSubject() {
    const subject = subjectInput.trim();
    if (!subject) return;
    if (subjectOptions.some((item) => item === subject)) {
      setSubjectMessage(`已存在科目「${subject}」。`);
      return;
    }
    onAddSubject(subject);
    setSubjectInput("");
    setSubjectMessage("");
  }

  function startEditSubject(subject: string) {
    setEditingSubject(subject);
    setEditingSubjectInput(subject);
    setSubjectMessage("");
  }

  function cancelEditSubject() {
    setEditingSubject("");
    setEditingSubjectInput("");
    setSubjectMessage("");
  }

  function saveSubject() {
    const nextSubject = editingSubjectInput.trim();
    if (!editingSubject || !nextSubject) return;
    if (nextSubject !== editingSubject && subjectOptions.some((subject) => subject === nextSubject)) {
      setSubjectMessage(`已存在科目「${nextSubject}」。`);
      return;
    }
    onUpdateSubject(editingSubject, nextSubject);
    cancelEditSubject();
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

  function findDuplicateStudent(name: string, grade: string | undefined, campusId: string | undefined): Student | undefined {
    const normalizedName = normalizeStudentDuplicateValue(name);
    const normalizedGrade = normalizeStudentDuplicateValue(grade ?? "");
    const normalizedCampusId = campusId ?? "";
    return vault.students.find(
      (student) =>
        normalizeStudentDuplicateValue(student.name) === normalizedName &&
        normalizeStudentDuplicateValue(student.grade ?? "") === normalizedGrade &&
        (student.defaultCampusId ?? "") === normalizedCampusId
    );
  }

  function firstCourseStudentCampus(studentIds: string[]): string | undefined {
    return studentIds
      .map((studentId) => vault.students.find((student) => student.id === studentId)?.defaultCampusId)
      .find(Boolean);
  }

  function syncNewCourseCampusFromStudents(studentIds: string[]) {
    if (courseCampusCustomized) return;
    const campusId = firstCourseStudentCampus(studentIds);
    if (campusId) {
      setCourseCampusInput(campusId);
    }
  }

  function changeNewCourseCampus(campusId: string) {
    setCourseCampusInput(campusId);
    setCourseCampusCustomized(true);
  }

  function normalizeCourseStudentIds(type: CourseType, studentIds: string[]): string[] {
    const limit = studentLimitForCourseType(type);
    return limit ? studentIds.slice(0, limit) : studentIds;
  }

  function courseTypeDefaultFeeRule(type: CourseType): FeeRule {
    if (supportsSalaryGradeFee(type) && vault.profile.defaultSalaryGradeId) {
      return {
        mode: "salary_grade",
        salaryGradeSource: "teacher_default",
        salaryGradeId: vault.profile.defaultSalaryGradeId
      };
    }
    return feeRuleForCourseType(vault, type);
  }

  function customFeeRuleForCourseType(type: CourseType): FeeRule {
    if (type === "trial") return defaultFeeRuleForCourseType("trial");
    if (supportsSalaryGradeFee(type)) {
      const minStudents = classHeadcountBaseStudentCount(type);
      const tier = {
        id: "tier_1_plus",
        minStudents,
        baseFee: 0,
        perStudentFee: 0
      };
      return {
        mode: "class_headcount",
        baseFee: tier.baseFee,
        perPresentStudentFee: tier.perStudentFee,
        classFeeTiers: [tier],
        makeupFeeMode: "perStudentFee"
      };
    }
    return { mode: "hourly", hourlyRate: 0 };
  }

  function salaryGradeDefaultFeeRule(): FeeRule {
    return {
      mode: "salary_grade",
      salaryGradeSource: "teacher_default",
      salaryGradeId: vault.profile.defaultSalaryGradeId
    };
  }

  function salaryGradeSpecificFeeRule(id?: SalaryGradeId): FeeRule {
    return {
      mode: "salary_grade",
      salaryGradeSource: "specific",
      salaryGradeId: id ?? vault.profile.defaultSalaryGradeId ?? defaultSalaryGradeRule(vault).id
    };
  }

  function supportsSalaryGradeFee(type: CourseType): boolean {
    return type !== "trial" && type !== "full_time";
  }

  function feeModeValue(rule: FeeRule): "salary_default" | "salary_specific" | "custom" {
    if (rule.mode !== "salary_grade") return "custom";
    return rule.salaryGradeSource === "specific" ? "salary_specific" : "salary_default";
  }

  function changeNewCourseFeeMode(mode: "salary_default" | "salary_specific" | "custom") {
    if (mode === "salary_default") {
      setCourseFeeRule(salaryGradeDefaultFeeRule());
      return;
    }
    if (mode === "salary_specific") {
      setCourseFeeRule(salaryGradeSpecificFeeRule());
      return;
    }
    setCourseFeeRule(customFeeRuleForCourseType(courseType));
  }

  function changeNewCourseSalaryGrade(salaryGradeId: string) {
    setCourseFeeRule(salaryGradeSpecificFeeRule(salaryGradeId as SalaryGradeId));
  }

  function changeEditingCourseFeeMode(mode: "salary_default" | "salary_specific" | "custom") {
    setEditingCourse((current) => {
      if (!current) return current;
      if (mode === "salary_default") {
        return { ...current, feeRule: salaryGradeDefaultFeeRule() };
      }
      if (mode === "salary_specific") {
        const currentGradeId = current.feeRule.mode === "salary_grade" ? current.feeRule.salaryGradeId : undefined;
        return { ...current, feeRule: salaryGradeSpecificFeeRule(currentGradeId) };
      }
      return { ...current, feeRule: customFeeRuleForCourseType(current.type) };
    });
  }

  function changeEditingCourseSalaryGrade(salaryGradeId: string) {
    setEditingCourse((current) =>
      current ? { ...current, feeRule: salaryGradeSpecificFeeRule(salaryGradeId as SalaryGradeId) } : current
    );
  }

  function updateDefaultSalaryGrade(salaryGradeId: string) {
    if (!salaryGradeId) {
      updateProfile({ defaultSalaryGradeId: undefined });
      return;
    }
    const rule = salaryGradeRuleById(salaryGradeId as SalaryGradeId, vault);
    if (!rule) return;
    updateProfile({
      defaultSalaryGradeId: rule.id,
      baseSalary: rule.baseSalary
    });
  }

  function salaryGradeSelectOptions(currentId?: SalaryGradeId): ReactNode {
    const currentRule = currentId ? salaryGradeRuleById(currentId, vault) : undefined;
    const includeCurrentRule = currentRule && !salaryGradeOptions.some((rule) => rule.id === currentRule.id);
    return (
      <>
        {includeCurrentRule && (
          <option value={currentRule.id}>旧规则：{salaryGradeLabel(currentRule)}（建议切换）</option>
        )}
        {salaryGradeOptions.map((rule) => (
          <option key={rule.id} value={rule.id}>{salaryGradeLabel(rule)}</option>
        ))}
      </>
    );
  }

  function buildSuggestedCourseName(type: CourseType, studentIds: string[]): string {
    const primaryStudent = studentIds[0] ? vault.students.find((student) => student.id === studentIds[0]) : undefined;
    if (primaryStudent) {
      return primaryStudent.name;
    }
    if (type === "class") {
      const firstStudentGrade = firstCourseStudentGrade(studentIds);
      return firstStudentGrade !== undefined
        ? `${firstStudentGrade || "未设置年级"}${courseSubjectInput.trim() || "班课"}`
        : "";
    }
    return "";
  }

  function changeNewCourseType(nextType: CourseType) {
    const nextStudentIds = normalizeCourseStudentIds(nextType, activeCourseStudentIds(courseStudentIds));
    setCourseType(nextType);
    setCourseStudentIds(nextStudentIds);
    setCourseFeeRule(courseTypeDefaultFeeRule(nextType));
    syncNewCourseCampusFromStudents(nextStudentIds);
  }

  function addCustomCourseType() {
    const label = customCourseTypeInput.trim();
    if (!label) return;
    const normalizedLabel = normalizeCourseTypeLabel(label);
    const existingType = allManagedCourseTypes.find(
      (option) => normalizeCourseTypeLabel(option.label) === normalizedLabel || normalizeCourseTypeLabel(option.value) === normalizedLabel
    );
    if (existingType) {
      setCourseTypeMessage(`已存在班型「${existingType.label}」，不能重复添加同名班型。`);
      return;
    }
    const option: CustomCourseTypeOption = {
      id: `custom_${makeId("ctype")}` as CustomCourseType,
      label
    };
    onAddCustomCourseType(
      option,
      defaultFeeRuleForCustomTemplate(
        customCourseTypeTemplate,
        customCourseTypeMinStudents,
        customCourseTypeBaseFee,
        customCourseTypePerStudentFee,
        customCourseTypeHourlyRate
      )
    );
    setCustomCourseTypeInput("");
    setCustomCourseTypeTemplate("class");
    setCustomCourseTypeMinStudents(1);
    setCustomCourseTypeBaseFee(0);
    setCustomCourseTypePerStudentFee(0);
    setCustomCourseTypeHourlyRate(0);
    setCourseTypeMessage("");
  }

  function startEditCustomCourseType(courseTypeOption: { id: CourseType; label: string }) {
    setEditingCustomCourseTypeId(courseTypeOption.id);
    setEditingCustomCourseTypeLabel(courseTypeOption.label);
  }

  function saveCustomCourseType() {
    const id = editingCustomCourseTypeId;
    const label = editingCustomCourseTypeLabel.trim();
    if (!id || !label) return;
    const normalizedLabel = normalizeCourseTypeLabel(label);
    const duplicated = allManagedCourseTypes.find(
      (item) => item.value !== id && normalizeCourseTypeLabel(item.label) === normalizedLabel
    );
    if (duplicated) {
      setCourseTypeMessage(`已存在班型「${duplicated.label}」，不能改成同名班型。`);
      return;
    }
    onUpdateCourseTypeLabel(id, label);
    setEditingCustomCourseTypeId("");
    setEditingCustomCourseTypeLabel("");
    setCourseTypeMessage("");
  }

  function cancelCustomCourseTypeEdit() {
    setEditingCustomCourseTypeId("");
    setEditingCustomCourseTypeLabel("");
    setCourseTypeMessage("");
  }

  function customCourseTypeInUse(courseTypeId: CustomCourseType): boolean {
    return (
      vault.courseGroups.some((course) => course.type === courseTypeId) ||
      vault.lessons.some((lesson) => lesson.type === courseTypeId)
    );
  }

  function courseTypeInUse(type: CourseType): boolean {
    return vault.courseGroups.some((course) => course.type === type) || vault.lessons.some((lesson) => lesson.type === type);
  }

  function replaceCourseTypeClassFeeTiers(type: CourseType, nextTiers: ClassFeeTier[]) {
    const current = feeRuleForCourseType(vault, type);
    const sortedTiers = [...nextTiers].sort((a, b) => a.minStudents - b.minStudents);
    const firstTier = sortedTiers[0];
    const nextRule: FeeRule = {
      ...current,
      mode: "class_headcount",
      baseFee: firstTier?.baseFee ?? current.baseFee,
      perPresentStudentFee: firstTier?.perStudentFee ?? current.perPresentStudentFee,
      classFeeTiers: sortedTiers,
      makeupFeeMode: current.makeupFeeMode ?? "perStudentFee"
    };
    onUpdateCourseTypeFeeRule(type, nextRule);
    if (courseType === type) {
      setCourseFeeRule(nextRule);
    }
  }

  function updateCourseTypeClassFeeTier(type: CourseType, tierId: string, patch: Partial<ClassFeeTier>) {
    const rule = feeRuleForCourseType(vault, type);
    const tier = normalizedClassFeeTiers(rule).find((item) => item.id === tierId) ?? normalizedClassFeeTiers(rule)[0] ?? defaultClassFeeTiers(defaultFeeRuleForCourseType(type))[0];
    replaceCourseTypeClassFeeTiers(type, [{ ...tier, ...patch, maxStudents: undefined }]);
  }

  function updateCourseTypeHourlyRule(type: CourseType, hourlyRate: number) {
    const current = feeRuleForCourseType(vault, type);
    const nextRule: FeeRule = {
      ...current,
      mode: "hourly",
      hourlyRate,
      fixedFee: undefined,
      baseFee: undefined,
      perPresentStudentFee: undefined,
      classFeeTiers: undefined
    };
    onUpdateCourseTypeFeeRule(type, nextRule);
    if (courseType === type) {
      setCourseFeeRule(nextRule);
    }
  }

  function updateCourseTypeFixedRule(type: CourseType, fixedFee: number) {
    const current = feeRuleForCourseType(vault, type);
    const nextRule: FeeRule = {
      ...current,
      mode: "fixed",
      fixedFee,
      hourlyRate: undefined,
      baseFee: undefined,
      perPresentStudentFee: undefined,
      classFeeTiers: undefined
    };
    onUpdateCourseTypeFeeRule(type, nextRule);
    if (courseType === type) {
      setCourseFeeRule(nextRule);
    }
  }

  function resetCourseTypeFeeRule(type: CourseType) {
    const current = feeRuleForCourseType(vault, type);
    const nextRule = type === "trial"
      ? defaultFeeRuleForCourseType("trial")
      : current.mode === "class_headcount"
        ? customFeeRuleForCourseType(type)
        : { mode: "hourly" as const, hourlyRate: 0 };
    onUpdateCourseTypeFeeRule(type, nextRule);
    if (courseType === type) {
      setCourseFeeRule(nextRule);
    }
  }

  function courseFeeSummary(course: CourseGroup): string {
    if (course.feeRule.mode === "salary_grade") {
      const rule = resolveSalaryGradeRule(vault, course.feeRule);
      if (!rule) return "课时费等级：未设置默认等级";
      const amount = salaryGradeAmountForCount(rule, course.type, course.studentIds.length);
      const source = course.feeRule.salaryGradeSource === "specific" ? "指定等级" : "跟随默认等级";
      return `${source}：${salaryGradeLabel(rule)}，当前 ${course.studentIds.length} 人 2小时标准课预估 ${formatPrivateMoney(amount, amountsVisible)}`;
    }
    if (course.feeRule.mode === "class_headcount") {
      return `当前 ${course.studentIds.length} 人 2小时标准课预估：${formatPrivateMoney(calculateClassHeadcountFee(course.feeRule, course.studentIds.length), amountsVisible)}`;
    }
    if (course.feeRule.mode === "fixed") {
      return `单节固定费用：${formatPrivateMoney(course.feeRule.fixedFee ?? 0, amountsVisible)}`;
    }
    if (course.type === "trial") {
      return `试听单次费用：${formatPrivateMoney(fixedFeeForRule(course.feeRule), amountsVisible)}`;
    }
    const hourlyRate = course.feeRule.hourlyRate ?? 0;
    return `每小时：${formatPrivateMoney(hourlyRate, amountsVisible)}；2小时预估：${formatPrivateMoney(hourlyRate * 2, amountsVisible)}`;
  }

  function requestDeleteCourseType(courseTypeOption: { id: CourseType; label: string }) {
    const isCustom = courseTypeOption.id.startsWith("custom_");
    confirm({
      title: `删除班型「${courseTypeOption.label}」？`,
      description: isCustom
        ? "自定义班型会从班型列表中直接删除；已被课程或历史课时使用的自定义班型不能直接删除。"
        : "内置班型会从主列表、添加课程档案和筛选下拉中移除，已有课程和历史课时仍会保留显示，可在已删除内置班型中恢复。",
      confirmLabel: "删除",
      tone: "danger",
      onConfirm: () => {
        const fallbackType = courseTypeOptions.find((option) => option.value !== courseTypeOption.id)?.value ?? "one_on_one";
        if (courseType === courseTypeOption.id) changeNewCourseType(fallbackType);
        if (courseTypeFilter === courseTypeOption.id) setCourseTypeFilter("all");
        if (studentCourseTypeFilter === courseTypeOption.id) setStudentCourseTypeFilter("all");
        if (transferCourseType === courseTypeOption.id) setTransferCourseType(fallbackType);
        if (editingCustomCourseTypeId === courseTypeOption.id) cancelCustomCourseTypeEdit();
        if (isCustom) {
          onDeleteCustomCourseType(courseTypeOption.id as CustomCourseType);
        } else {
          onDeleteCourseType(courseTypeOption.id);
        }
      }
    });
  }

  function updateNewCourseFee(patch: Partial<FeeRule>) {
    setCourseFeeRule((current) => ({ ...current, ...patch }));
  }

  function updateNewTrialFixedFee(fixedFee: number) {
    setCourseFeeRule((current) => ({
      ...current,
      mode: "fixed",
      fixedFee,
      hourlyRate: undefined,
      baseFee: undefined,
      perPresentStudentFee: undefined,
      classFeeTiers: undefined
    }));
  }

  function replaceNewClassFeeTiers(nextTiers: ClassFeeTier[]) {
    setCourseFeeRule((current) => {
      const sortedTiers = [...nextTiers].sort((a, b) => a.minStudents - b.minStudents);
      const firstTier = sortedTiers[0];
      return {
        ...current,
        mode: "class_headcount",
        baseFee: firstTier?.baseFee ?? current.baseFee,
        perPresentStudentFee: firstTier?.perStudentFee ?? current.perPresentStudentFee,
        classFeeTiers: sortedTiers
      };
    });
  }

  function updateNewClassFeeTier(tierId: string, patch: Partial<ClassFeeTier>) {
    const tier = normalizedClassFeeTiers(courseFeeRule).find((item) => item.id === tierId) ?? normalizedClassFeeTiers(courseFeeRule)[0];
    replaceNewClassFeeTiers([{ ...tier, ...patch, maxStudents: undefined }]);
  }

  function setNewCourseStudents(nextStudentIds: string[]) {
    const normalizedStudentIds = normalizeCourseStudentIds(courseType, activeCourseStudentIds(nextStudentIds));
    setCourseStudentIds(normalizedStudentIds);
    syncNewCourseCampusFromStudents(normalizedStudentIds);
  }

  function activeCourseStudentIds(studentIds: string[]): string[] {
    return studentIds.filter((studentId) => {
      const student = vault.students.find((item) => item.id === studentId);
      return student?.status !== "paused";
    });
  }

  function toggleNewCourseStudent(studentId: string) {
    const isSelected = courseStudentIds.includes(studentId);
    const student = vault.students.find((item) => item.id === studentId);
    if (!isSelected && student?.status === "paused") return;
    const limit = studentLimitForCourseType(courseType);
    if (limit) {
      if (isSelected) {
        setNewCourseStudents(courseStudentIds.filter((id) => id !== studentId));
      } else if (courseStudentIds.length < limit) {
        setNewCourseStudents([...courseStudentIds, studentId]);
      }
      return;
    }
    if (courseType === "class" && !isSelected) {
      const selectedGrade = firstCourseStudentGrade(courseStudentIds);
      if (selectedGrade !== undefined && (student?.grade ?? "") !== selectedGrade) {
        return;
      }
    }
    setNewCourseStudents(
      isSelected ? courseStudentIds.filter((id) => id !== studentId) : [...courseStudentIds, studentId]
    );
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
    setEditingCourse((current) =>
      current
        ? {
            ...current,
            feeRule: {
              ...current.feeRule,
              mode: "fixed",
              fixedFee,
              hourlyRate: undefined,
              baseFee: undefined,
              perPresentStudentFee: undefined,
              classFeeTiers: undefined
            }
          }
        : current
    );
  }

  function replaceEditingClassFeeTiers(nextTiers: ClassFeeTier[]) {
    setEditingCourse((current) => {
      if (!current) return current;
      const sortedTiers = [...nextTiers].sort((a, b) => a.minStudents - b.minStudents);
      const firstTier = sortedTiers[0];
      return {
        ...current,
        feeRule: {
          ...current.feeRule,
          mode: "class_headcount",
          baseFee: firstTier?.baseFee ?? current.feeRule.baseFee,
          perPresentStudentFee: firstTier?.perStudentFee ?? current.feeRule.perPresentStudentFee,
          classFeeTiers: sortedTiers
        }
      };
    });
  }

  function updateClassFeeTier(tierId: string, patch: Partial<ClassFeeTier>) {
    if (!editingCourse) return;
    const tier = normalizedClassFeeTiers(editingCourse.feeRule).find((item) => item.id === tierId) ?? normalizedClassFeeTiers(editingCourse.feeRule)[0];
    replaceEditingClassFeeTiers([{ ...tier, ...patch, maxStudents: undefined }]);
  }

  function openCourseEditor(course: CourseGroup) {
    setEditingStudent(null);
    setEditingCourse(course);
    setCourseStudentSearch("");
    setCourseStudentScope("all");
    setCourseStudentGradeFilter("all");
    setCourseStudentCampusFilter("all");
  }

  function openStudentEditor(student: Student) {
    setEditingCourse(null);
    setEditingStudent(student);
  }

  function requestArchiveStudent(student: Student) {
    confirm({
      title: `归档学生「${student.name}」？`,
      description: "归档后不会出现在添加课程档案、添加关联学生和班型调整的学生搜索结果中，历史课程和课时记录会保留。",
      confirmLabel: "归档",
      tone: "danger",
      onConfirm: () => {
        setCourseStudentIds((current) => current.filter((studentId) => studentId !== student.id));
        onUpdateStudent({ ...student, status: "paused" });
        flashArchiveRow("students", student.id);
      }
    });
  }

  function restoreStudent(student: Student) {
    onUpdateStudent({ ...student, status: "active" });
    flashArchiveRow("students", student.id);
  }

  function updateProfile(patch: Partial<TeacherProfile>) {
    onUpdateProfile({
      ...vault.profile,
      ...patch
    });
  }

  function updateHomeCampus(campusId: string) {
    const nextCampusId = campusId || undefined;
    onUpdateProfile({
      ...vault.profile,
      homeCampusId: nextCampusId,
      obligationCampusId: vault.profile.obligationCampusId
    });
  }

  function updateObligationCampus(campusId: string) {
    const nextCampusId = campusId || undefined;
    onUpdateProfile({
      ...vault.profile,
      obligationCampusId: nextCampusId
    });
  }

  function gradeSelectValue(grade?: string): string {
    if (!grade) return "";
    if (grade === "__custom__") return "自定义";
    return fixedGradeOptions.includes(grade) ? grade : "自定义";
  }

  function toggleCourseStudent(studentId: string) {
    setEditingCourse((current) => {
      if (!current) return current;
      const isSelected = current.studentIds.includes(studentId);
      const student = vault.students.find((item) => item.id === studentId);
      if (!isSelected && student?.status === "paused") return current;
      const limit = studentLimitForCourseType(current.type);
      if (limit) {
        if (!isSelected && current.studentIds.length >= limit) {
          return current;
        }
        const studentIds = isSelected
          ? current.studentIds.filter((id) => id !== studentId)
          : [...current.studentIds, studentId];
        return {
          ...current,
          studentIds,
          defaultCampusId: !isSelected ? student?.defaultCampusId ?? current.defaultCampusId : current.defaultCampusId
        };
      }
      if (current.type === "class" && !isSelected) {
        const selectedGrade = firstCourseStudentGrade(current.studentIds);
        if (selectedGrade !== undefined && (student?.grade ?? "") !== selectedGrade) {
          return current;
        }
      }
      const studentIds = current.studentIds.includes(studentId)
        ? current.studentIds.filter((id) => id !== studentId)
        : [...current.studentIds, studentId];
      return {
        ...current,
        studentIds,
        defaultCampusId: !isSelected ? student?.defaultCampusId ?? current.defaultCampusId : current.defaultCampusId
      };
    });
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
      setCourseStudentIds((current) => current.filter((id) => id !== studentId));
    }
    onUpdateStudent(nextStudent);
    setEditingStudent(null);
    flashArchiveRow("students", studentId);
  }

  function cancelStudentDraft() {
    if (editingStudent) {
      flashArchiveRow("students", editingStudent.id);
    }
    setEditingStudent(null);
  }

  function firstCourseStudentGrade(studentIds: string[]): string | undefined {
    if (studentIds.length === 0) return undefined;
    return vault.students.find((student) => student.id === studentIds[0])?.grade ?? "";
  }

  function changeEditingCourseType(nextType: CourseType) {
    if (!editingCourse) return;
    const nextStudentIds = normalizeCourseStudentIds(nextType, editingCourse.studentIds);
    const nextFeeRule = supportsSalaryGradeFee(nextType) && editingCourse.feeRule.mode === "salary_grade"
      ? editingCourse.feeRule
      : courseTypeDefaultFeeRule(nextType);
    updateEditingCourse({
      type: nextType,
      feeRule: nextFeeRule,
      studentIds: nextStudentIds,
      defaultCampusId: firstCourseStudentCampus(nextStudentIds) ?? editingCourse.defaultCampusId
    });
  }

  function saveCourseDraft() {
    if (!editingCourse?.name.trim()) return;
    const courseId = editingCourse.id;
    const feeRule = normalizeCourseFeeRuleForType(editingCourse.type, editingCourse.feeRule);
    onUpdateCourse({
      ...editingCourse,
      name: editingCourse.name.trim(),
      subject: editingCourse.subject.trim() || "未设置",
      feeRule
    });
    setEditingCourse(null);
    setCourseStudentSearch("");
    setCourseStudentScope("all");
    setCourseStudentGradeFilter("all");
    setCourseStudentCampusFilter("all");
    flashArchiveRow("courses", courseId);
  }

  function cancelCourseDraft() {
    if (editingCourse) {
      flashArchiveRow("courses", editingCourse.id);
    }
    setEditingCourse(null);
    setCourseStudentSearch("");
    setCourseStudentScope("all");
    setCourseStudentGradeFilter("all");
    setCourseStudentCampusFilter("all");
  }

  function flashArchiveRow(panel: ArchivePanel, id: string) {
    setFlashingArchiveItem({ panel, id });
    window.setTimeout(() => {
      setFlashingArchiveItem((current) => (current?.panel === panel && current.id === id ? null : current));
    }, 1800);
  }

  function archiveRowClass(panel: ArchivePanel, id: string): string {
    return `border-b border-[#e8eef6] bg-white px-3 py-3 last:border-b-0 ${
      flashingArchiveItem?.panel === panel && flashingArchiveItem.id === id ? "archive-row-flash" : ""
    }`;
  }

  return (
    <div className="space-y-6">
      {dialog}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "档案信息", value: `${vault.students.length} 人`, hint: `在读 ${activeStudentCount} 人 / 已归档 ${archivedStudentCount} 人`, icon: Users },
          { label: "校区", value: `${vault.campuses.length} 个`, hint: "教学地点", icon: Building2 },
          { label: "添加课程档案", value: `${vault.courseGroups.length} 个`, hint: `启用 ${activeCourses} 个`, icon: GraduationCap }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="overflow-hidden">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#eaf2ff] text-[#1557c2]">
                  <Icon size={21} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#64748b]">{item.label}</div>
                  <div className="mt-1 text-2xl font-extrabold text-[#061226]">{item.value}</div>
                  <div className="mt-1 text-xs font-bold text-[#94a3b8]">{item.hint}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="space-y-3">
        <div className="overflow-x-auto rounded-[16px] border border-[#dbe4ef] bg-white">
          <div className="flex w-full min-w-max items-center gap-1 p-1 md:min-w-0">
          {[
            { key: "profile" as ArchivePanel, label: "老师个人信息" },
            { key: "salaryRules" as ArchivePanel, label: "课时费计算" },
            { key: "campuses" as ArchivePanel, label: "校区与班型" },
            { key: "students" as ArchivePanel, label: "学生列表" },
            { key: "courses" as ArchivePanel, label: "添加课程档案" }
          ].map((item, index, items) => (
            <Fragment key={item.key}>
            <button
              type="button"
              onClick={() => setArchivePanel(item.key)}
              className={`min-w-[126px] flex-1 rounded-[12px] px-3 py-2 text-sm font-extrabold transition-colors ${
                archivePanel === item.key ? "bg-[#1557c2] text-white" : "text-[#25324a] hover:bg-[#f8fbff]"
              }`}
            >
              {item.label}
            </button>
            {index < items.length - 1 && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f8fbff] text-[#94a3b8] ring-1 ring-[#e8eef6]">
                <ChevronRight size={14} />
              </div>
            )}
            </Fragment>
          ))}
          </div>
        </div>
        <div className="rounded-[10px] border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-xs font-semibold leading-5 text-[#9a3412]">
          删除限制：已有学生、课程或历史课时引用的数据不能直接删除，建议将对应的引用数据全部删除或改为归档状态。
        </div>
        {archivePanel === "profile" && (
          <TeacherProfilePanel
            amountsVisible={amountsVisible}
            campusOptions={campusOptions}
            isManualObligationMode={isManualObligationMode}
            obligation={obligation}
            obligationMode={obligationMode}
            onUpdateDefaultSalaryGrade={updateDefaultSalaryGrade}
            onUpdateHomeCampus={updateHomeCampus}
            onUpdateObligationCampus={updateObligationCampus}
            onUpdateProfile={updateProfile}
            renderSalaryGradeOptions={salaryGradeSelectOptions}
            selectedProfileSalaryGrade={selectedProfileSalaryGrade}
            vault={vault}
          />
        )}
        {archivePanel === "salaryRules" && (
          <TeacherSalaryRulesPanel
            amountsVisible={amountsVisible}
            onUpdateProfile={onUpdateProfile}
            vault={vault}
          />
        )}
        {archivePanel === "students" && (
          <StudentCourseTransferPanel
            activeStudentOptions={activeStudentOptions}
            campusOptions={campusOptions}
            courseTypeOptions={courseTypeOptions}
            onSubmit={applyStudentCourseTransfer}
            setTransferCampusInput={setTransferCampusInput}
            setTransferCourseNameInput={setTransferCourseNameInput}
            setTransferCourseType={setTransferCourseType}
            setTransferEndExisting={setTransferEndExisting}
            setTransferPanelOpen={setTransferPanelOpen}
            setTransferStudentId={setTransferStudentId}
            setTransferSubjectInput={setTransferSubjectInput}
            setTransferTargetCourseId={setTransferTargetCourseId}
            setTransferTargetMode={setTransferTargetMode}
            studentOptionLabel={studentOptionLabel}
            subjectOptions={subjectOptions}
            transferCampusInput={transferCampusInput}
            transferCourseNameInput={transferCourseNameInput}
            transferCourseType={transferCourseType}
            transferCurrentCourses={transferCurrentCourses}
            transferEndExisting={transferEndExisting}
            transferMessage={transferMessage}
            transferPanelOpen={transferPanelOpen}
            transferStudent={transferStudent}
            transferStudentId={transferStudentId}
            transferSubjectInput={transferSubjectInput}
            transferTargetCourseId={transferTargetCourseId}
            transferTargetCourses={transferTargetCourses}
            transferTargetMode={transferTargetMode}
            vault={vault}
          />
        )}
        {archivePanel === "campuses" && (
          <CampusCourseSettingsPanel
            amountsVisible={amountsVisible}
            archiveRowClass={archiveRowClass}
            campusAddressInput={campusAddressInput}
            campusInUse={campusInUse}
            campusNameInput={campusNameInput}
            campusNoteInput={campusNoteInput}
            campusOptions={campusOptions}
            confirm={confirm}
            courseTypeInUse={courseTypeInUse}
            courseTypeMessage={courseTypeMessage}
            customCourseTypeBaseFee={customCourseTypeBaseFee}
            customCourseTypeHourlyRate={customCourseTypeHourlyRate}
            customCourseTypeInput={customCourseTypeInput}
            customCourseTypeMinStudents={customCourseTypeMinStudents}
            customCourseTypePerStudentFee={customCourseTypePerStudentFee}
            customCourseTypeTemplate={customCourseTypeTemplate}
            deletedBuiltInCourseTypes={deletedBuiltInCourseTypes}
            editingCampus={editingCampus}
            editingCustomCourseTypeId={editingCustomCourseTypeId}
            editingCustomCourseTypeLabel={editingCustomCourseTypeLabel}
            editingSubject={editingSubject}
            editingSubjectInput={editingSubjectInput}
            flashArchiveRow={flashArchiveRow}
            managedCourseTypes={managedCourseTypes}
            onAddCampus={addCampus}
            onAddCustomCourseType={addCustomCourseType}
            onAddSubject={addSubject}
            onCancelCustomCourseTypeEdit={cancelCustomCourseTypeEdit}
            onCancelEditSubject={cancelEditSubject}
            onDeleteCampus={onDeleteCampus}
            onDeleteSubject={onDeleteSubject}
            onRequestDeleteCourseType={requestDeleteCourseType}
            onResetCourseTypeFeeRule={resetCourseTypeFeeRule}
            onRestoreCourseType={onRestoreCourseType}
            onSaveCustomCourseType={saveCustomCourseType}
            onSaveSubject={saveSubject}
            onStartEditCustomCourseType={startEditCustomCourseType}
            onStartEditSubject={startEditSubject}
            onUpdateCampus={onUpdateCampus}
            onUpdateCourseTypeClassFeeTier={updateCourseTypeClassFeeTier}
            onUpdateCourseTypeFixedRule={updateCourseTypeFixedRule}
            onUpdateCourseTypeHourlyRule={updateCourseTypeHourlyRule}
            setCampusAddressInput={setCampusAddressInput}
            setCampusNameInput={setCampusNameInput}
            setCampusNoteInput={setCampusNoteInput}
            setCourseTypeMessage={setCourseTypeMessage}
            setCustomCourseTypeBaseFee={setCustomCourseTypeBaseFee}
            setCustomCourseTypeHourlyRate={setCustomCourseTypeHourlyRate}
            setCustomCourseTypeInput={setCustomCourseTypeInput}
            setCustomCourseTypeMinStudents={setCustomCourseTypeMinStudents}
            setCustomCourseTypePerStudentFee={setCustomCourseTypePerStudentFee}
            setCustomCourseTypeTemplate={setCustomCourseTypeTemplate}
            setEditingCampus={setEditingCampus}
            setEditingCustomCourseTypeLabel={setEditingCustomCourseTypeLabel}
            setEditingSubjectInput={setEditingSubjectInput}
            setSubjectInput={setSubjectInput}
            setSubjectMessage={setSubjectMessage}
            subjectInUse={subjectInUse}
            subjectInput={subjectInput}
            subjectMessage={subjectMessage}
            subjectOptions={subjectOptions}
            vault={vault}
          />
        )}

        {archivePanel === "students" && (
          <StudentArchivePanel
            archiveRowClass={archiveRowClass}
            archiveSearch={archiveSearch}
            campusOptions={campusOptions}
            confirm={confirm}
            courseTypeOptions={courseTypeOptions}
            customGradeInput={customGradeInput}
            gradeFilter={gradeFilter}
            gradeFilterOptions={gradeFilterOptions}
            gradeOptions={gradeOptions}
            hasUnsetGradeFilterOption={hasUnsetGradeFilterOption}
            onAddStudent={addStudent}
            onDeleteStudent={onDeleteStudent}
            onOpenStudentEditor={openStudentEditor}
            onRequestArchiveStudent={requestArchiveStudent}
            onRestoreStudent={restoreStudent}
            setArchiveSearch={setArchiveSearch}
            setCustomGradeInput={setCustomGradeInput}
            setGradeFilter={setGradeFilter}
            setStudentCampusFilter={setStudentCampusFilter}
            setStudentCampusInput={setStudentCampusInput}
            setStudentCourseTypeFilter={setStudentCourseTypeFilter}
            setStudentGradeInput={setStudentGradeInput}
            setStudentNameInput={setStudentNameInput}
            setStudentNoteInput={setStudentNoteInput}
            setStudentSchoolInput={setStudentSchoolInput}
            setStudentStatusFilter={setStudentStatusFilter}
            setStudentSubjectFilter={setStudentSubjectFilter}
            setStudentTemporaryTrialInput={setStudentTemporaryTrialInput}
            setStudentTrialFilter={setStudentTrialFilter}
            studentCampusFilter={studentCampusFilter}
            studentCampusInput={studentCampusInput}
            studentCourseTypeFilter={studentCourseTypeFilter}
            studentGradeInput={studentGradeInput}
            studentInUse={studentInUse}
            studentNameInput={studentNameInput}
            studentNoteInput={studentNoteInput}
            studentSchoolInput={studentSchoolInput}
            studentStatusFilter={studentStatusFilter}
            studentSubjectFilter={studentSubjectFilter}
            studentTemporaryTrialInput={studentTemporaryTrialInput}
            studentTrialFilter={studentTrialFilter}
            subjectFilterOptions={subjectFilterOptions}
            vault={vault}
            visibleStudents={visibleStudents}
          />
        )}

        {archivePanel === "courses" && (
        <div className="space-y-4">
        <Card className="h-fit overflow-hidden">
          <CardHeader>
            <div className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <GraduationCap size={18} className="text-[#ff8617]" />
                <CardTitle className="text-lg">添加课程档案</CardTitle>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 border-[#bfdbfe] bg-[#eaf2ff] px-2.5 text-xs font-extrabold text-[#1557c2] hover:bg-[#dbeafe] hover:text-[#0f3f8f]"
                onClick={onOpenSchedule}
              >
                <CalendarDays size={13} /> 去排课
              </Button>
            </div>
            <CardDescription>新增时直接设置类型、科目、校区、费用和关联学生。</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={addCourse} className="space-y-3 rounded-[16px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
                <Input
                  value={courseNameInput}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    setCourseNameInput(nextName);
                    setCourseNameEdited(nextName !== suggestedCourseName);
                  }}
                  placeholder="课程档案名称"
                />
                <Select value={courseSubjectInput || subjectOptions[0] || "未设置"} onChange={(event) => setCourseSubjectInput(event.target.value)}>
                  {subjectOptions.map((subject) => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </Select>
                <Select
                  value={courseType}
                  onChange={(event) => changeNewCourseType(event.target.value as CourseType)}
                >
                  {courseTypeOptions.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </Select>
                <Select value={courseCampusInput} onChange={(event) => changeNewCourseCampus(event.target.value)}>
                  <option value="">未设置校区</option>
                  {campusOptions.map((campus) => (
                    <option key={campus.id} value={campus.id}>{campus.name}</option>
                  ))}
                </Select>
                <Select value={courseStatusInput} onChange={(event) => setCourseStatusInput(event.target.value as CourseGroup["status"])}>
                  <option value="active">启用</option>
                  <option value="paused">暂停</option>
                </Select>
              </div>

              {supportsSalaryGradeFee(courseType) && (
                <div className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-white p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-extrabold text-[#061226]">课时费来源</div>
                    <div className="text-xs font-semibold text-[#64748b]">
                      课时费等级按 2 小时为 1 节设置标准课金额；实际课时费按上课时长 / 2 折算。
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Select value={feeModeValue(courseFeeRule)} onChange={(event) => changeNewCourseFeeMode(event.target.value as "salary_default" | "salary_specific" | "custom")}>
                      <option value="salary_default">跟随老师默认课时费等级</option>
                      <option value="salary_specific">指定课时费等级</option>
                      <option value="custom">自定义课时费</option>
                    </Select>
                    {courseFeeRule.mode === "salary_grade" && courseFeeRule.salaryGradeSource === "specific" && (
                      <Select value={courseFeeRule.salaryGradeId ?? vault.profile.defaultSalaryGradeId ?? defaultSalaryGradeRule(vault).id} onChange={(event) => changeNewCourseSalaryGrade(event.target.value)}>
                        {salaryGradeSelectOptions(courseFeeRule.salaryGradeId ?? vault.profile.defaultSalaryGradeId)}
                      </Select>
                    )}
                  </div>
                  {courseFeeRule.mode === "salary_grade" && (
                    <div className="rounded-[12px] border border-[#e8eef6] bg-[#f8fbff] px-3 py-2 text-xs font-bold leading-5 text-[#475569]">
                      {resolveSalaryGradeRule(vault, courseFeeRule)
                        ? (() => {
                            const rule = resolveSalaryGradeRule(vault, courseFeeRule);
                            return rule
                              ? `${salaryGradeLabel(rule)}：底薪 ${formatPrivateMoney(rule.baseSalary, amountsVisible)}，一对一 ${formatPrivateMoney(rule.oneOnOneFee, amountsVisible)}，班课底费 ${formatPrivateMoney(rule.classBaseFee, amountsVisible)}，人头加价 ${formatPrivateMoney(rule.headcountIncrementFee, amountsVisible)}。`
                              : "";
                          })()
                        : "还没有设置老师默认课时费等级，请先在老师个人信息里设置，或改为指定课时费等级。"}
                    </div>
                  )}
                </div>
              )}

              {courseFeeRule.mode !== "salary_grade" && (courseFeeRule.mode === "class_headcount" ? (
                <div className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-white p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-extrabold text-[#061226]">人数计费模板</div>
                    <div className="text-xs font-semibold text-[#64748b]">
                      当前关联 {courseStudentIds.length} 人，2小时标准课预计 {formatPrivateMoney(calculateClassHeadcountFee(courseFeeRule, courseStudentIds.length), amountsVisible)}，实际按上课时长 / 2 折算
                    </div>
                  </div>
                  {normalizedClassFeeTiers(courseFeeRule).slice(0, 1).map((tier) => (
                    <div key={tier.id} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-[#64748b]">最少人数</label>
                        <Input
                          type="number"
                          min={0}
                          value={tier.minStudents}
                          onChange={(event) => updateNewClassFeeTier(tier.id, { minStudents: Math.max(Number(event.target.value), 0) })}
                          className="h-9 bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-[#64748b]">基础费用</label>
                        <SensitiveAmountField visible={amountsVisible} className="h-9">
                          <Input
                            type="number"
                            min={0}
                            value={tier.baseFee}
                            onChange={(event) => updateNewClassFeeTier(tier.id, { baseFee: Math.max(Number(event.target.value), 0) })}
                            className="h-9 bg-white"
                          />
                        </SensitiveAmountField>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-[#64748b]">每增加一人</label>
                        <SensitiveAmountField visible={amountsVisible} className="h-9">
                          <Input
                            type="number"
                            min={0}
                            value={tier.perStudentFee ?? 0}
                            onChange={(event) => updateNewClassFeeTier(tier.id, { perStudentFee: Math.max(Number(event.target.value), 0) })}
                            className="h-9 bg-white"
                          />
                        </SensitiveAmountField>
                      </div>
                    </div>
                  ))}
                </div>
              ) : courseType === "trial" ? (
                <div className="grid grid-cols-1 gap-2 rounded-[14px] border border-[#dbe4ef] bg-white p-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-end">
                  <div>
                    <div className="text-sm font-extrabold text-[#061226]">试听费用</div>
                    <div className="mt-1 text-xs font-semibold text-[#64748b]">按单次试听计费，不按上课时长相乘。</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#64748b]">试听单次费用</label>
                    <SensitiveAmountField visible={amountsVisible} className="h-9">
                      <Input
                        type="number"
                        min={0}
                        value={fixedFeeForRule(courseFeeRule)}
                        onChange={(event) => updateNewTrialFixedFee(Math.max(Number(event.target.value), 0))}
                        className="h-9 bg-white"
                      />
                    </SensitiveAmountField>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 rounded-[14px] border border-[#dbe4ef] bg-white p-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-end">
                  <div>
                    <div className="text-sm font-extrabold text-[#061226]">课程费用</div>
                    <div className="mt-1 text-xs font-semibold text-[#64748b]">全日制按开始和结束时间自动折算课时费。</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#64748b]">每小时费用</label>
                    <SensitiveAmountField visible={amountsVisible} className="h-9">
                      <Input
                        type="number"
                        min={0}
                        value={courseFeeRule.hourlyRate ?? 0}
                        onChange={(event) => updateNewCourseFee({ hourlyRate: Math.max(Number(event.target.value), 0) })}
                        className="h-9 bg-white"
                      />
                    </SensitiveAmountField>
                  </div>
                </div>
              ))}

              <div className="space-y-2 rounded-[14px] border border-[#dbe4ef] bg-white p-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-medium">
                    关联学生（{courseStudentIds.length} / {activeStudentCount}）
                    {courseType === "class" && (
                      <span className="ml-2 text-xs font-bold text-[#64748b]">
                        班课需同年级{firstCourseStudentGrade(courseStudentIds) !== undefined ? `：${firstCourseStudentGrade(courseStudentIds) || "未设置年级"}` : ""}
                      </span>
                    )}
                    {studentLimitForCourseType(courseType) && courseType !== "one_on_one" && (
                      <span className="ml-2 text-xs font-bold text-[#64748b]">
                        最多选择 {studentLimitForCourseType(courseType)} 人
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-bold text-[#64748b]">
                    {courseCampusCustomized ? "已手动选择校区" : "默认校区跟随所选学生档案"}
                  </span>
                </div>

                <label className="relative block">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                  <Input
                    className="h-10 bg-white pl-9"
                    value={newCourseStudentSearch}
                    onChange={(event) => setNewCourseStudentSearch(event.target.value)}
                    placeholder="搜索学生姓名、学科、校区、年级、学校或备注"
                  />
                </label>
                {courseStudentIds.length > 0 && (
                  <div className="max-h-20 overflow-y-auto pr-1">
                    <div className="flex flex-wrap gap-2">
                      {courseStudentIds.map((studentId) => {
                        const student = vault.students.find((item) => item.id === studentId);
                        return (
                          <button
                            type="button"
                            key={studentId}
                            onClick={() => toggleNewCourseStudent(studentId)}
                            className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#fed7aa] bg-[#fff7ed] px-2.5 py-1 text-xs font-bold text-[#9a3412]"
                            title="点击取消关联"
                          >
                            <span className="truncate">{student?.name ?? "未知学生"}</span>
                            <X size={12} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="max-h-[220px] overflow-y-auto pr-1">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {addCourseStudentOptions.map((student) => {
                      const isSelected = courseStudentIds.includes(student.id);
                      const selectedGrade = courseType === "class" ? firstCourseStudentGrade(courseStudentIds) : undefined;
                      const isDifferentGrade = courseType === "class" && selectedGrade !== undefined && !isSelected && (student.grade ?? "") !== selectedGrade;
                      const isAtStudentLimit = !isSelected && Boolean(studentLimitForCourseType(courseType)) && courseStudentIds.length >= (studentLimitForCourseType(courseType) ?? 0);
                      return (
                        <button
                          type="button"
                          key={student.id}
                          onClick={() => toggleNewCourseStudent(student.id)}
                          disabled={isDifferentGrade || isAtStudentLimit}
                          title={isDifferentGrade ? `班课只能选择 ${selectedGrade} 学生` : isAtStudentLimit ? `最多选择 ${studentLimitForCourseType(courseType)} 人` : undefined}
                          className={`rounded-[10px] border px-3 py-2 text-left text-xs font-bold ${
                            isSelected
                              ? "border-[#ff8617] bg-[#fff7ed] text-[#9a3412]"
                              : isDifferentGrade || isAtStudentLimit
                                ? "cursor-not-allowed border-[#e2e8f0] bg-white text-[#94a3b8]"
                                : student.temporaryTrial
                                  ? "border-[#c7d2fe] bg-[#eef0ff] text-[#5161d6]"
                                  : "border-[#dbe4ef] bg-white text-[#25324a]"
                          }`}
                        >
                          {student.name} · {student.grade || "未设置年级"} · {campusName(vault, student.defaultCampusId)}{student.temporaryTrial ? " · 试听" : ""}{isDifferentGrade ? " · 年级不符" : ""}
                        </button>
                      );
                    })}
                  </div>
                  {addCourseStudentOptions.length === 0 && (
                    <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-white p-5 text-center text-sm font-semibold text-[#64748b]">
                      没有符合条件的学生
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={!courseNameInput.trim() && !suggestedCourseName}>
                  <Plus size={15} /> 添加课程
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <CourseArchiveListPanel
          archiveRowClass={archiveRowClass}
          campusOptions={campusOptions}
          confirm={confirm}
          courseCampusFilter={courseCampusFilter}
          courseFeeSummary={courseFeeSummary}
          courseGradeFilter={courseGradeFilter}
          courseInUse={courseInUse}
          courseSearch={courseSearch}
          courseSubjectFilter={courseSubjectFilter}
          courseTypeFilter={courseTypeFilter}
          courseTypeOptions={courseTypeOptions}
          gradeFilterOptions={gradeFilterOptions}
          hasUnsetGradeFilterOption={hasUnsetGradeFilterOption}
          onDeleteCourse={onDeleteCourse}
          onOpenCourseEditor={openCourseEditor}
          setCourseCampusFilter={setCourseCampusFilter}
          setCourseGradeFilter={setCourseGradeFilter}
          setCourseSearch={setCourseSearch}
          setCourseSubjectFilter={setCourseSubjectFilter}
          setCourseTypeFilter={setCourseTypeFilter}
          subjectFilterOptions={subjectFilterOptions}
          vault={vault}
          visibleCourses={visibleCourses}
        />
        </div>
        )}
      </div>

      <StudentEditDialog
        campusOptions={campusOptions}
        editingStudent={editingStudent}
        gradeOptions={gradeOptions}
        gradeSelectValue={gradeSelectValue}
        onCancel={cancelStudentDraft}
        onSave={saveStudentDraft}
        setEditingStudent={setEditingStudent}
      />

      <CourseEditDialog
        amountsVisible={amountsVisible}
        campusOptions={campusOptions}
        courseStudentCampusFilter={courseStudentCampusFilter}
        courseStudentGradeFilter={courseStudentGradeFilter}
        courseStudentScope={courseStudentScope}
        courseStudentSearch={courseStudentSearch}
        editingCourse={editingCourse}
        editingCourseStudentOptions={editingCourseStudentOptions}
        editingCourseTypeOptions={editingCourseTypeOptions}
        feeModeValue={feeModeValue}
        firstCourseStudentGrade={firstCourseStudentGrade}
        gradeFilterOptions={gradeFilterOptions}
        hasUnsetGradeFilterOption={hasUnsetGradeFilterOption}
        onCancel={cancelCourseDraft}
        onChangeCourseType={changeEditingCourseType}
        onChangeFeeMode={changeEditingCourseFeeMode}
        onChangeSalaryGrade={changeEditingCourseSalaryGrade}
        onSave={saveCourseDraft}
        onToggleCourseStudent={toggleCourseStudent}
        onUpdateClassFeeTier={updateClassFeeTier}
        onUpdateCourse={updateEditingCourse}
        onUpdateCourseFee={updateEditingCourseFee}
        onUpdateTrialFixedFee={updateEditingTrialFixedFee}
        renderSalaryGradeOptions={salaryGradeSelectOptions}
        setCourseStudentCampusFilter={setCourseStudentCampusFilter}
        setCourseStudentGradeFilter={setCourseStudentGradeFilter}
        setCourseStudentScope={setCourseStudentScope}
        setCourseStudentSearch={setCourseStudentSearch}
        subjectOptions={subjectOptions}
        supportsSalaryGradeFee={supportsSalaryGradeFee}
        vault={vault}
      />

    </div>
  );
}

function canJoinCourse(vault: TeacherVault, course: CourseGroup, student: Student): boolean {
  if (student.status === "paused") return false;
  const limit = studentLimitForCourseType(course.type);
  if (limit && course.studentIds.length >= limit) return false;
  if (course.type !== "class" || course.studentIds.length === 0) return true;
  const existingGrade = vault.students.find((item) => item.id === course.studentIds[0])?.grade ?? "";
  return existingGrade === (student.grade ?? "");
}

function studentCourseSearchText(vault: TeacherVault, student: Student): string {
  const studentCourses = vault.courseGroups.filter((course) => course.studentIds.includes(student.id));
  return [
    student.name,
    student.grade ?? "",
    student.school ?? "",
    student.note ?? "",
    campusName(vault, student.defaultCampusId),
    student.status === "paused" ? "已归档 归档 暂停" : "在读 正常",
    student.temporaryTrial ? "试听 临时试听" : "",
    ...studentCourses.flatMap((course) => [
      course.name,
      course.subject,
      courseTypeLabel(vault, course.type),
      campusName(vault, course.defaultCampusId)
    ])
  ].join(" ").toLowerCase();
}

function normalizeCourseTypeLabel(value: string): string {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

function normalizedStudentIdKey(studentIds: string[]): string {
  return [...studentIds].sort().join("|");
}

function normalizeStudentDuplicateValue(value: string): string {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

function classHeadcountBaseStudentCount(type: CourseType): number {
  return type === "class" ? 5 : 1;
}

function defaultFeeRuleForCustomTemplate(
  template: "class" | "hourly",
  minStudents = 1,
  baseFee = 0,
  perStudentFee = 0,
  hourlyRate = 0
): FeeRule {
  if (template === "hourly") {
    return { mode: "hourly", hourlyRate: Math.max(hourlyRate, 0) };
  }
  const tier = {
    id: "tier_1_plus",
    minStudents: Math.max(Math.round(minStudents), 0),
    baseFee: Math.max(baseFee, 0),
    perStudentFee: Math.max(perStudentFee, 0)
  };
  return {
    mode: "class_headcount",
    baseFee: tier.baseFee,
    perPresentStudentFee: tier.perStudentFee,
    classFeeTiers: [tier],
    makeupFeeMode: "perStudentFee"
  };
}

function normalizeCourseFeeRuleForType(type: CourseType, feeRule: FeeRule): FeeRule {
  if (type === "trial") {
    return {
      mode: "fixed",
      fixedFee: fixedFeeForRule(feeRule)
    };
  }
  if (feeRule.mode === "salary_grade") {
    return {
      mode: "salary_grade",
      salaryGradeSource: feeRule.salaryGradeSource ?? "teacher_default",
      salaryGradeId: feeRule.salaryGradeId
    };
  }
  if (feeRule.mode === "class_headcount") {
    const tier = normalizedClassFeeTiers(feeRule)[0] ?? defaultClassFeeTiers(feeRule)[0];
    const normalizedTier = {
      ...tier,
      minStudents: Number.isFinite(tier.minStudents) ? Math.max(Math.round(tier.minStudents), 0) : classHeadcountBaseStudentCount(type),
      maxStudents: undefined
    };
    return {
      ...feeRule,
      mode: "class_headcount",
      baseFee: normalizedTier.baseFee,
      perPresentStudentFee: normalizedTier.perStudentFee,
      classFeeTiers: [normalizedTier]
    };
  }
  return feeRule;
}

function matchesKeywordSearch(searchable: string, normalizedQuery: string): boolean {
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  return terms.length === 0 || terms.every((term) => searchable.includes(term));
}

function matchesGradeFilter(grade: string | undefined, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "__unset") return !grade;
  return grade === filter;
}

function studentOptionLabel(student: Student): string {
  return `${student.name} · ${student.grade || "未设置年级"}`;
}
