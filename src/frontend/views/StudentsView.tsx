import { Fragment, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Building2, ChevronRight, GraduationCap, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Campus, ClassFeeTier, CourseGroup, CourseType, CustomCourseType, CustomCourseTypeOption, FeeRule, SalaryGradeId, SalaryGradeStage, SalaryGradeStageRateConfig, Student, StudentCourseTransition, TeacherProfile, TeacherVault } from "@/shared/types";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { CampusCourseSettingsPanel } from "@/frontend/components/CampusCourseSettingsPanel";
import { CourseEditDialog } from "@/frontend/components/CourseEditDialog";
import { CourseArchiveListPanel } from "@/frontend/components/CourseArchiveListPanel";
import { StudentArchivePanel } from "@/frontend/components/StudentArchivePanel";
import { StudentCourseTransferPanel } from "@/frontend/components/StudentCourseTransferPanel";
import { StudentEditDialog } from "@/frontend/components/StudentEditDialog";
import { TeacherProfilePanel } from "@/frontend/components/TeacherProfilePanel";
import { TeacherSalaryRulesPanel } from "@/frontend/components/TeacherSalaryRulesPanel";
import { NewCourseFormPanel } from "@/frontend/components/NewCourseFormPanel";
import { makeId } from "@/frontend/lib/crypto";
import { backupFeeRuleForCourseType, billableStudentCapForCourseType, billableStudentCapForRule, calculateClassHeadcountFee, classHeadcountBaseStudentCountForRule, classHeadcountFeeRuleForCourseType, classHeadcountRuleUsesClassBase, classHeadcountStageRateForRule, courseUsesClassBilling, defaultFeeRuleForCourseType, defaultSalaryGradeRule, feeRuleForCourseType, fixedFeeForRule, isClassBillingCourseType, normalizedClassFeeTiers, obligationSummary, resolveSalaryGradeRule, salaryGradeLabel, salaryGradeRateForStage, salaryGradeRuleById, salaryGradeRulesForVault, salaryGradeAmountForCount, salaryGradeStageForCourse, salaryGradeStageForStudentIds, salaryGradeStageLabels, salaryGradeStageOrder, todayIso } from "@/frontend/lib/calculations";
import { builtInCourseTypeOptions, campusName, compareByName, courseHasActiveStudent, courseRequiresSameGradeStudents, courseTypeLabel, courseTypeOptionsForVault, formatPrivateMoney, sortCampusesForProfile, sortCoursesByName, sortStudentsByName, studentLimitForCourseType, studentNames, subjectOptionsForVault } from "@/frontend/lib/helpers";
import type { CourseTypeMigrationMode, CourseTypeMigrationResult } from "@/frontend/lib/vaultMutations";

const fixedGradeOptions = ["初一", "初二", "初三"];
const gradeOptions = ["未设置年级", ...fixedGradeOptions, "自定义"];
type ArchivePanel = "profile" | "salaryRules" | "campuses" | "students" | "courses";
type StudentStatusFilter = "active" | "transition" | "archived" | "all";
type CustomCourseTypeTemplate = "class" | "non_class";

export function StudentsView({
  vault,
  onAddCampus,
  onUpdateCampus,
  onDeleteCampus,
  onAddStudent,
  onAddStudents,
  onUpdateStudent,
  onUpdateStudents,
  onDeleteStudent,
  onDeleteStudents,
  onUpdateProfile,
  onAddCourse,
  onUpdateCourse,
  onUpdateCourses,
  onSyncCoursesToLessons,
  onDeleteCourse,
  onAddCustomCourseType,
  onUpdateCustomCourseType,
  onDeleteCustomCourseType,
  onUpdateCourseTypeLabel,
  onDeleteCourseType,
  onUpdateCourseTypeFeeRule,
  onSyncCourseTypeFeeRuleToCourses,
  onMigrateCourseTypeLessons,
  onAddSubject,
  onUpdateSubject,
  onDeleteSubject,
  onTransferStudentCourse,
  onOpenSchedule,
  amountsVisible,
  focusRequest
}: {
  vault: TeacherVault;
  amountsVisible: boolean;
  focusRequest?: { panel: ArchivePanel; nonce: number } | null;
  onAddCampus: (campus: Campus) => void;
  onUpdateCampus: (campus: Campus) => void;
  onDeleteCampus: (campusId: string) => void;
  onAddStudent: (student: Student) => void;
  onAddStudents: (students: Student[]) => void;
  onUpdateStudent: (student: Student) => void;
  onUpdateStudents: (students: Student[]) => void;
  onDeleteStudent: (studentId: string) => void;
  onDeleteStudents: (studentIds: string[]) => void;
  onUpdateProfile: (profile: TeacherProfile) => void;
  onAddCourse: (course: CourseGroup) => void;
  onUpdateCourse: (course: CourseGroup) => void;
  onUpdateCourses: (courses: CourseGroup[]) => void;
  onSyncCoursesToLessons: (courseIds: string[]) => void;
  onDeleteCourse: (courseId: string) => void;
  onAddCustomCourseType: (courseType: CustomCourseTypeOption, feeRule?: FeeRule) => void;
  onUpdateCustomCourseType: (courseType: CustomCourseTypeOption) => void;
  onDeleteCustomCourseType: (courseTypeId: CustomCourseType) => void;
  onUpdateCourseTypeLabel: (courseType: CourseType, label: string) => void;
  onDeleteCourseType: (courseType: CourseType) => void;
  onUpdateCourseTypeFeeRule: (courseType: CourseType, feeRule: FeeRule) => void;
  onSyncCourseTypeFeeRuleToCourses: (courseType: CourseType) => void;
  onMigrateCourseTypeLessons: (
    fromType: CourseType,
    orphanTargetType: CourseType,
    mode: CourseTypeMigrationMode
  ) => CourseTypeMigrationResult;
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
  const currentStudentOptions = sortStudentsByName(vault.students.filter((student) => student.status === "active"));
  const courseSelectableStudentOptions = currentStudentOptions;
  const transitionStudentOptions = sortStudentsByName(vault.students.filter((student) => student.status === "transition"));
  const archivedStudentOptions = sortStudentsByName(vault.students.filter((student) => student.status === "paused"));
  const courseGroupOptions = sortCoursesByName(vault.courseGroups);
  const customCourseTypes = vault.preferences?.customCourseTypes ?? [];
  const disabledCourseTypes = new Set(vault.preferences?.disabledCourseTypes ?? []);
  const allManagedCourseTypes: Array<{ value: CourseType; label: string }> = [
    ...builtInCourseTypeOptions.map((item) => ({ value: item.value as CourseType, label: courseTypeLabel(vault, item.value) })),
    ...customCourseTypes.map((item) => ({ value: item.id as CourseType, label: item.label }))
  ].sort((a, b) => compareByName(a.label, b.label) || a.value.localeCompare(b.value));
  const managedCourseTypes = allManagedCourseTypes.filter((item) => !disabledCourseTypes.has(item.value));
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
  const [batchStudentText, setBatchStudentText] = useState("");
  const [batchStudentMessage, setBatchStudentMessage] = useState("");
  const [courseNameInput, setCourseNameInput] = useState("");
  const [courseNameEdited, setCourseNameEdited] = useState(false);
  const [courseType, setCourseType] = useState<CourseType>("one_on_one");
  const [courseSubjectInput, setCourseSubjectInput] = useState("");
  const [courseCampusInput, setCourseCampusInput] = useState(preferredCampusId);
  const [courseCampusCustomized, setCourseCampusCustomized] = useState(false);
  const [courseStatusInput, setCourseStatusInput] = useState<CourseGroup["status"]>("active");
  const [courseStudentIds, setCourseStudentIds] = useState<string[]>([]);
  const [courseFeeRule, setCourseFeeRule] = useState<FeeRule>(() => backupFeeRuleForCourseType("one_on_one", feeRuleForCourseType(vault, "one_on_one")));
  const [subjectInput, setSubjectInput] = useState("");
  const [editingSubject, setEditingSubject] = useState("");
  const [editingSubjectInput, setEditingSubjectInput] = useState("");
  const [subjectMessage, setSubjectMessage] = useState("");
  const [customCourseTypeInput, setCustomCourseTypeInput] = useState("");
  const [customCourseTypeTemplate, setCustomCourseTypeTemplate] = useState<CustomCourseTypeTemplate>("class");
  const [customCourseTypeMinStudents, setCustomCourseTypeMinStudents] = useState(5);
  const [customCourseTypeBaseFee, setCustomCourseTypeBaseFee] = useState(0);
  const [customCourseTypePerStudentFee, setCustomCourseTypePerStudentFee] = useState(0);
  const [courseTypeMessage, setCourseTypeMessage] = useState("");
  const [migrationOrphanTargetType, setMigrationOrphanTargetType] = useState<CourseType>("small_class");
  const [editingCustomCourseTypeId, setEditingCustomCourseTypeId] = useState<CourseType | "">("");
  const [editingCustomCourseTypeLabel, setEditingCustomCourseTypeLabel] = useState("");
  const [editingCampus, setEditingCampus] = useState<Campus | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editingCourse, setEditingCourse] = useState<CourseGroup | null>(null);
  const [flashingArchiveItem, setFlashingArchiveItem] = useState<{ panel: ArchivePanel; id: string } | null>(null);
  const [archivePanel, setArchivePanel] = useState<ArchivePanel>("profile");

  useEffect(() => {
    if (focusRequest?.panel) {
      setArchivePanel(focusRequest.panel);
    }
  }, [focusRequest?.nonce]);
  const [gradeFilter, setGradeFilter] = useState("all");
  const [studentCampusFilter, setStudentCampusFilter] = useState("all");
  const [studentStatusFilter, setStudentStatusFilter] = useState<StudentStatusFilter>("active");
  const [studentTrialFilter, setStudentTrialFilter] = useState<"all" | "trial" | "regular">("all");
  const [studentCourseTypeFilter, setStudentCourseTypeFilter] = useState<"all" | CourseType>("all");
  const [studentSubjectFilter, setStudentSubjectFilter] = useState("all");
  const [courseSearch, setCourseSearch] = useState("");
  const [courseStatusFilter, setCourseStatusFilter] = useState<"active" | "paused" | "all">("active");
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
  const [courseArchiveMessage, setCourseArchiveMessage] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
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
  const addCourseStudentOptions = courseSelectableStudentOptions.filter((student) => {
    const searchable = studentCourseSearchText(vault, student);
    return matchesKeywordSearch(searchable, normalizedNewCourseStudentSearch);
  });
  const visibleStudents = vault.students
    .filter((student) => {
      const matchesStatus = matchesStudentStatusFilter(student, studentStatusFilter);
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
      const hasActiveStudent = courseHasActiveStudent(vault, course);
      const matchesStatus =
        courseStatusFilter === "all" ||
        (courseStatusFilter === "active" ? course.status === "active" && hasActiveStudent : course.status === "paused" || !hasActiveStudent);
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
      return matchesStatus && matchesType && matchesGrade && matchesSubject && matchesCampus && matchesSearch;
    })
    .sort((a, b) => compareByName(a.name, b.name) || a.id.localeCompare(b.id));
  const activeStudentCount = currentStudentOptions.length;
  const transitionStudentCount = transitionStudentOptions.length;
  const archivedStudentCount = archivedStudentOptions.length;
  const activeCourses = vault.courseGroups.filter((course) => course.status === "active" && courseHasActiveStudent(vault, course)).length;
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
        if (!isSelected && student.status !== "active") return false;
        const matchesScope =
          courseStudentScope === "all" ||
          (courseStudentScope === "selected" ? isSelected : !isSelected);
        const searchable = studentCourseSearchText(vault, student);
        const matchesSearch = matchesKeywordSearch(searchable, normalizedCourseStudentSearch);
        const matchesGrade = matchesGradeFilter(student.grade, courseStudentGradeFilter);
        const requiresSameGrade = courseRequiresSameGradeStudents(vault, editingCourse.type, editingCourse.feeRule);
        const selectedGrade = requiresSameGrade ? firstCourseStudentGrade(editingCourse.studentIds) : undefined;
        const matchesSelectedGrade = !requiresSameGrade || selectedGrade === undefined || isSelected || (student.grade ?? "") === selectedGrade;
        const matchesCampus = courseStudentCampusFilter === "all" || student.defaultCampusId === courseStudentCampusFilter;
        return matchesScope && matchesSearch && matchesGrade && matchesSelectedGrade && matchesCampus;
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

  function submitStudent(forceDuplicate = false, forceMissingGrade = false) {
    if (!studentNameInput.trim()) return;
    const resolvedGrade = studentGradeInput === "自定义" ? customGradeInput.trim() : studentGradeInput;
    const resolvedCampusId = studentCampusInput || preferredCampusId;
    if (!resolvedGrade && !forceMissingGrade) {
      confirm({
        title: "未设置学生年级？",
        description: "学生年级会影响班课同年级筛选和暑假班、课时费结算判断。建议先设置年级后再添加。",
        confirmLabel: "仍然添加",
        cancelLabel: "返回设置",
        tone: "danger",
        onConfirm: () => submitStudent(forceDuplicate, true)
      });
      return;
    }
    const duplicateStudent = findDuplicateStudent(studentNameInput.trim(), resolvedGrade, resolvedCampusId);
    if (duplicateStudent && !forceDuplicate) {
      const duplicateStatus = duplicateStudent.status === "paused" ? "，当前已归档" : duplicateStudent.status === "transition" ? "，当前为过渡期" : "";
      confirm({
        title: "可能重复添加学生",
        description: `已有「${duplicateStudent.name}」使用相同姓名、年级和校区${duplicateStatus}。建议先确认是否需要恢复或编辑原档案。`,
        confirmLabel: "仍然添加",
        tone: "danger",
        onConfirm: () => submitStudent(true, forceMissingGrade)
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

  function addBatchStudents() {
    submitBatchStudents();
  }

  function submitBatchStudents(forceMissingGrade = false) {
    const rows = parseStudentBatchRows(batchStudentText).filter((row) => !row.isHeader);
    if (rows.length === 0) {
      setBatchStudentMessage("请先粘贴至少一行学生信息。");
      return;
    }

    const defaultGrade = studentGradeInput === "自定义" ? customGradeInput.trim() : studentGradeInput;
    const hasMissingGrade = rows.some((row) => !normalizeStudentGradeValue(row.grade) && !defaultGrade);
    if (hasMissingGrade && !forceMissingGrade) {
      confirm({
        title: "批量添加包含未设置年级的学生？",
        description: "学生年级会影响班课同年级筛选和暑假班、课时费结算判断。建议先设置默认年级，或在每行第 2 列写年级。",
        confirmLabel: "仍然添加",
        cancelLabel: "返回设置",
        tone: "danger",
        onConfirm: () => submitBatchStudents(true)
      });
      return;
    }

    const resolvedCampusId = studentCampusInput || preferredCampusId || undefined;
    const defaultSchool = studentSchoolInput.trim();
    const defaultNote = studentNoteInput.trim();
    const batchDuplicateKeys = new Set<string>();
    const studentsToAdd: Student[] = [];
    let skippedDuplicateCount = 0;

    rows.forEach((row) => {
      const name = row.name.trim();
      const grade = normalizeStudentGradeValue(row.grade) || defaultGrade || undefined;
      const school = row.school?.trim() || defaultSchool || undefined;
      const note = row.note?.trim() || defaultNote || undefined;
      const duplicateKey = studentDuplicateKey(name, grade, resolvedCampusId);
      if (batchDuplicateKeys.has(duplicateKey) || findDuplicateStudent(name, grade, resolvedCampusId)) {
        skippedDuplicateCount += 1;
        return;
      }
      batchDuplicateKeys.add(duplicateKey);
      studentsToAdd.push({
        id: makeId("student"),
        name,
        grade,
        school,
        temporaryTrial: studentTemporaryTrialInput,
        defaultCampusId: resolvedCampusId,
        note,
        status: "active"
      });
    });

    if (studentsToAdd.length === 0) {
      setBatchStudentMessage(skippedDuplicateCount > 0 ? `没有新增学生，已跳过 ${skippedDuplicateCount} 条重复记录。` : "没有识别到可添加的学生。");
      return;
    }

    onAddStudents(studentsToAdd);
    setBatchStudentText("");
    setBatchStudentMessage(`已批量添加 ${studentsToAdd.length} 名学生${skippedDuplicateCount > 0 ? `，跳过 ${skippedDuplicateCount} 条重复记录` : ""}。`);
  }

  function addCourse(e: FormEvent) {
    e.preventDefault();
    submitCourse();
  }

  function submitCourse(forceDuplicate = false) {
    const resolvedName = courseNameInput.trim() || suggestedCourseName;
    if (!resolvedName) return;
    const feeRule = normalizeCourseFeeRuleForType(courseType, courseFeeRule);
    const normalizedStudentIds = normalizeCourseStudentIds(courseType, activeCourseStudentIds(courseStudentIds), feeRule);
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
          lesson.makeupStudentId === studentId ||
          lesson.attendance.some((entry) => entry.studentId === studentId)
      ) ||
      (vault.studentProgressRecords ?? []).some((record) => record.studentId === studentId) ||
      (vault.progressChecklistCompletions ?? []).some((completion) => completion.studentId === studentId) ||
      (vault.gradeRecords ?? []).some((record) => record.studentId === studentId)
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

  function normalizeCourseStudentIds(type: CourseType, studentIds: string[], feeRule?: FeeRule): string[] {
    let nextStudentIds = studentIds;
    if (courseRequiresSameGradeStudents(vault, type, feeRule)) {
      const selectedGrade = firstCourseStudentGrade(nextStudentIds);
      if (selectedGrade !== undefined) {
        nextStudentIds = nextStudentIds.filter((studentId) => (vault.students.find((student) => student.id === studentId)?.grade ?? "") === selectedGrade);
      }
    }
    const limit = studentLimitForCourseType(type);
    return limit ? nextStudentIds.slice(0, limit) : nextStudentIds;
  }

  function courseTypeDefaultFeeRule(type: CourseType): FeeRule {
    if (supportsSalaryGradeFee(type)) return salaryGradeDefaultFeeRule();
    return customFeeRuleForCourseType(type);
  }

  function customFeeRuleForCourseType(type: CourseType): FeeRule {
    return backupFeeRuleForCourseType(type, feeRuleForCourseType(vault, type));
  }

  function salaryGradeDefaultFeeRule(): FeeRule {
    return {
      mode: "salary_grade",
      salaryGradeSource: "teacher_default",
      salaryGradeId: vault.profile.defaultSalaryGradeId ?? defaultSalaryGradeRule(vault).id
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
    return type !== "trial";
  }

  function feeModeValue(rule: FeeRule): "salary_default" | "salary_specific" | "custom" {
    if (rule.mode !== "salary_grade") return "custom";
    return rule.salaryGradeSource === "specific" ? "salary_specific" : "salary_default";
  }

  function applyNewCourseFeeRule(nextRule: FeeRule) {
    setCourseFeeRule(nextRule);
    setCourseStudentIds((current) => normalizeCourseStudentIds(courseType, current, nextRule));
  }

  function changeNewCourseFeeMode(mode: "salary_default" | "salary_specific" | "custom") {
    if (mode === "salary_default") {
      applyNewCourseFeeRule(salaryGradeDefaultFeeRule());
      return;
    }
    if (mode === "salary_specific") {
      applyNewCourseFeeRule(salaryGradeSpecificFeeRule());
      return;
    }
    applyNewCourseFeeRule(customFeeRuleForCourseType(courseType));
  }

  function changeNewCourseSalaryGrade(salaryGradeId: string) {
    applyNewCourseFeeRule(salaryGradeSpecificFeeRule(salaryGradeId as SalaryGradeId));
  }

  function changeEditingCourseFeeMode(mode: "salary_default" | "salary_specific" | "custom") {
    setEditingCourse((current) => {
      if (!current) return current;
      if (mode === "salary_default") {
        const feeRule = salaryGradeDefaultFeeRule();
        return { ...current, feeRule, studentIds: normalizeCourseStudentIds(current.type, current.studentIds, feeRule) };
      }
      if (mode === "salary_specific") {
        const currentGradeId = current.feeRule.mode === "salary_grade" ? current.feeRule.salaryGradeId : undefined;
        const feeRule = salaryGradeSpecificFeeRule(currentGradeId);
        return { ...current, feeRule, studentIds: normalizeCourseStudentIds(current.type, current.studentIds, feeRule) };
      }
      const feeRule = customFeeRuleForCourseType(current.type);
      return { ...current, feeRule, studentIds: normalizeCourseStudentIds(current.type, current.studentIds, feeRule) };
    });
  }

  function changeEditingCourseSalaryGrade(salaryGradeId: string) {
    setEditingCourse((current) => {
      if (!current) return current;
      const feeRule = salaryGradeSpecificFeeRule(salaryGradeId as SalaryGradeId);
      return { ...current, feeRule, studentIds: normalizeCourseStudentIds(current.type, current.studentIds, feeRule) };
    });
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
    if (isClassBillingCourseType(type)) {
      const firstStudentGrade = firstCourseStudentGrade(studentIds);
      return firstStudentGrade !== undefined
        ? `${firstStudentGrade || "未设置年级"}${courseSubjectInput.trim() || "班课"}`
        : "";
    }
    return "";
  }

  function changeNewCourseType(nextType: CourseType) {
    const nextFeeRule = courseTypeDefaultFeeRule(nextType);
    const nextStudentIds = normalizeCourseStudentIds(nextType, activeCourseStudentIds(courseStudentIds), nextFeeRule);
    setCourseType(nextType);
    setCourseStudentIds(nextStudentIds);
    setCourseFeeRule(nextFeeRule);
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
      defaultFeeRuleForCustomTemplate(customCourseTypeTemplate, vault)
    );
    setCustomCourseTypeInput("");
    setCustomCourseTypeTemplate("class");
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
      stageRates: backupFeeRuleForCourseType(type, current).stageRates,
      makeupFeeMode: current.makeupFeeMode ?? "perStudentFee"
    };
    onUpdateCourseTypeFeeRule(type, nextRule);
    if (courseType === type) {
      setCourseFeeRule(courseTypeDefaultFeeRule(type));
    }
  }

  function updateCourseTypeClassFeeTier(type: CourseType, tierId: string, patch: Partial<ClassFeeTier>) {
    const rule = backupFeeRuleForCourseType(type, feeRuleForCourseType(vault, type));    const tier = normalizedClassFeeTiers(rule).find((item) => item.id === tierId) ?? normalizedClassFeeTiers(rule)[0];
    replaceCourseTypeClassFeeTiers(type, [{ ...tier, ...patch, maxStudents: undefined }]);
  }

  function updateCourseTypeBillableCap(type: CourseType, cap: number | undefined) {
    const current = backupFeeRuleForCourseType(type, feeRuleForCourseType(vault, type));
    const nextRule: FeeRule = {
      ...current,
      billableStudentCap: Number.isFinite(cap) ? Math.max(Math.floor(cap ?? 0), 0) : undefined
    };
    onUpdateCourseTypeFeeRule(type, nextRule);
    if (courseType === type) {
      setCourseFeeRule(courseTypeDefaultFeeRule(type));
    }
  }

  function updateCourseTypeStageRate(type: CourseType, stage: SalaryGradeStage, patch: Partial<SalaryGradeStageRateConfig>) {
    const current = backupFeeRuleForCourseType(type, feeRuleForCourseType(vault, type));
    const nextStageRates = salaryGradeStageOrder.reduce(
      (rates, item) => {
        rates[item] = classHeadcountStageRateForRule(current, type, item);
        return rates;
      },
      {} as Record<SalaryGradeStage, SalaryGradeStageRateConfig>
    );
    nextStageRates[stage] = {
      ...nextStageRates[stage],
      ...patch
    };
    const tier = normalizedClassFeeTiers(current)[0];
    const displayRate = nextStageRates.junior_3;
    const usesClassBase = classHeadcountRuleUsesClassBase(type, current);
    const nextRule: FeeRule = {
      ...current,
      mode: "class_headcount",
      baseFee: usesClassBase ? displayRate.classBaseFee : displayRate.oneOnOneFee,
      perPresentStudentFee: displayRate.headcountIncrementFee,
      classFeeTiers: [{
        ...tier,
        baseFee: usesClassBase ? displayRate.classBaseFee : displayRate.oneOnOneFee,
        perStudentFee: displayRate.headcountIncrementFee,
        maxStudents: undefined
      }],
      stageRates: nextStageRates,
      makeupFeeMode: current.makeupFeeMode ?? "perStudentFee"
    };
    onUpdateCourseTypeFeeRule(type, nextRule);
    if (courseType === type) {
      setCourseFeeRule(courseTypeDefaultFeeRule(type));
    }
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
      setCourseFeeRule(courseTypeDefaultFeeRule(type));
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
    const backupRule = backupFeeRuleForCourseType(type, current);
    const tier = backupRule.mode === "class_headcount" ? normalizedClassFeeTiers(backupRule)[0] : undefined;
    const nextRule = type === "trial"
      ? defaultFeeRuleForCourseType(type)
      : defaultFeeRuleForCustomTemplate(
          (tier?.minStudents ?? classHeadcountBaseStudentCountForRule(type, backupRule)) > 1 ? "class" : "non_class",
          vault
        );
    onUpdateCourseTypeFeeRule(type, nextRule);
    if (courseType === type) {
      setCourseFeeRule(nextRule);
    }
  }

  function courseFeeSummary(course: CourseGroup): string {
    const classBillingText = courseUsesClassBilling(course, vault) ? "\n班课例：实际 110 分钟，计费 2 小时，义务课时按计费时长扣减" : "";
    const cap = billableStudentCapForRule(course.type, feeRuleForCourseType(vault, course.type));
    const overflow = cap === undefined ? 0 : Math.max(course.studentIds.length - cap, 0);
    const capText = overflow > 0 ? `（超出计费人数上限 ${cap} 人，其中 ${overflow} 人不计课时费）` : "";
    if (course.feeRule.mode === "salary_grade") {
      const rule = resolveSalaryGradeRule(vault, course.feeRule);
      if (!rule) return "课时费等级：未设置默认等级";
      const stage = salaryGradeStageForCourse(vault, course);
      const amount = salaryGradeAmountForCount(rule, course.type, course.studentIds.length, stage, classHeadcountBaseStudentCountForRule(course.type, feeRuleForCourseType(vault, course.type)), cap);
      const source = course.feeRule.salaryGradeSource === "specific" ? "指定等级" : "跟随默认等级";
      return `${source}：${salaryGradeLabel(rule)} · ${stage ? salaryGradeStageLabels[stage] : "未识别年级，按初三"}，当前 ${course.studentIds.length} 人 2小时标准课预估 ${formatPrivateMoney(amount, amountsVisible)}${capText}${classBillingText}`;
    }
    if (course.feeRule.mode === "class_headcount") {
      const stage = salaryGradeStageForCourse(vault, course);
      const amount = calculateClassHeadcountFee(course.feeRule, course.studentIds.length, course.type, stage);
      return `自定义课时费：${stage ? salaryGradeStageLabels[stage] : "未识别年级，按初三"}，当前 ${course.studentIds.length} 人 2小时标准课预估 ${formatPrivateMoney(amount, amountsVisible)}${capText}${classBillingText}`;
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

  function courseTypeUsageCounts(type: CourseType): { courseCount: number; lessonCount: number; futureLessonCount: number } {
    const courseIds = new Set(vault.courseGroups.filter((course) => course.type === type).map((course) => course.id));
    const today = todayIso();
    const lessonCount = vault.lessons.filter((lesson) => lesson.type === type || courseIds.has(lesson.courseGroupId)).length;
    const futureLessonCount = vault.lessons.filter((lesson) =>
      courseIds.has(lesson.courseGroupId) &&
      !lesson.linkedOriginalLessonId &&
      (lesson.status === "scheduled" || lesson.status === "draft") &&
      lesson.date >= today
    ).length;
    return {
      courseCount: courseIds.size,
      lessonCount,
      futureLessonCount
    };
  }

  function futureSyncableLessonCountForCourses(courses: CourseGroup[]): number {
    const courseIds = new Set(courses.map((course) => course.id));
    const today = todayIso();
    return vault.lessons.filter((lesson) =>
      courseIds.has(lesson.courseGroupId) &&
      !lesson.linkedOriginalLessonId &&
      (lesson.status === "scheduled" || lesson.status === "draft") &&
      lesson.date >= today
    ).length;
  }

  function requestSyncVisibleCoursesToLessons() {
    const courses = visibleCourses;
    const lessonCount = futureSyncableLessonCountForCourses(courses);
    if (courses.length === 0) {
      setCourseArchiveMessage("当前筛选下没有课程档案，不需要同步。");
      return;
    }
    if (lessonCount === 0) {
      setCourseArchiveMessage(`当前筛选下 ${courses.length} 个课程档案没有未来待上课课节，不需要同步。`);
      return;
    }
    confirm({
      title: "同步当前筛选课程？",
      description: `会按当前课程档案列表筛选出的 ${courses.length} 个课程档案，刷新 ${lessonCount} 节未来待上课课节的班型、校区、学生名单和金额快照。已完成或历史课节保留原信息。`,
      confirmLabel: "同步刷新",
      onConfirm: () => {
        onSyncCoursesToLessons(courses.map((course) => course.id));
        setCourseArchiveMessage(`同步完成：已刷新 ${courses.length} 个课程档案下的 ${lessonCount} 节未来待上课课节。`);
      }
    });
  }

  function requestSyncCourseTypeFeeRuleToCourses(type: CourseType) {
    const label = courseTypeLabel(vault, type);
    const counts = courseTypeUsageCounts(type);
    if (counts.courseCount === 0) {
      setCourseTypeMessage(`班型「${label}」还没有已添加课程，不需要同步。`);
      return;
    }
    confirm({
      title: `同步「${label}」到已有课程？`,
      description: `会把 ${counts.courseCount} 个同班型常规课程统一改为跟随教师默认课时费等级，并按当前班课/非班课规则刷新 ${counts.futureLessonCount} 节未来待上课课节的金额快照。已完成或历史课节保留原金额。`,
      confirmLabel: "同步更改",
      onConfirm: () => {
        onSyncCourseTypeFeeRuleToCourses(type);
        setCourseTypeMessage(`同步完成：已处理「${label}」的 ${counts.courseCount} 个已有课程，并刷新 ${counts.futureLessonCount} 节未来待上课课节。`);
      }
    });
  }

  function legacyLessonCountForCourseType(type: CourseType): number {
    const courseIds = new Set(vault.courseGroups.filter((course) => course.type === type).map((course) => course.id));
    return vault.lessons.filter((lesson) => lesson.type === type && !courseIds.has(lesson.courseGroupId)).length;
  }

  function requestMigrateCourseTypeLessons(type: CourseType) {
    const label = courseTypeLabel(vault, type);
    const pendingCount = legacyLessonCountForCourseType(type);
    if (pendingCount === 0) {
      setCourseTypeMessage(`班型「${label}」没有需要迁移的旧课节快照。`);
      return;
    }
    const orphanLabel = courseTypeLabel(vault, migrationOrphanTargetType);

    function runMigration(mode: CourseTypeMigrationMode) {
      const result = onMigrateCourseTypeLessons(type, migrationOrphanTargetType, mode);
      if (result.total === 0) {
        setCourseTypeMessage(
          result.skipped > 0
            ? `没有可迁移的课节：${result.skipped} 节课节的课程档案本身仍是「${label}」，请先在课程档案里改成新班型。`
            : `班型「${label}」没有需要迁移的旧课节快照。`
        );
        return;
      }
      const parts = [
        result.byCourse > 0 ? `${result.byCourse} 节跟随课程档案` : "",
        result.substitute > 0 ? `${result.substitute} 节代课归为小班课` : "",
        result.orphan > 0 ? `${result.orphan} 节按指定的「${orphanLabel}」` : ""
      ].filter(Boolean);
      const skippedText = result.skipped > 0
        ? `另有 ${result.skipped} 节课节的课程档案仍是「${label}」，已跳过，需要先改课程档案。`
        : `现在可以删除班型「${label}」了。`;
      const modeText = mode === "full_refresh"
        ? `其中 ${result.refreshed} 节已按当前课程档案完整刷新并重算金额。`
        : "所有课节的学生名单、出勤和金额快照保持不变。";
      setCourseTypeMessage(`同步完成：已迁移 ${result.total} 节课节（${parts.join("，")}）。${modeText}${skippedText}`);
    }

    confirm({
      title: `迁移「${label}」的 ${pendingCount} 节旧课节？`,
      description: `有课程档案的课节会跟随各自档案的班型，代课课节归为小班课，找不到课程档案的课节归到「${orphanLabel}」。\n\n「只改班型标记」只改班型，学生名单、出勤和金额快照都不动，历史工资不受影响（推荐）。\n「完整刷新」会按当前课程档案重写学生名单和出勤，并用最新的人头分档、计费人数上限规则重算金额，历史工资会变化。`,
      confirmLabel: "只改班型标记",
      secondaryLabel: "完整刷新（重算金额）",
      onConfirm: () => runMigration("type_only"),
      onSecondary: () => runMigration("full_refresh")
    });
  }

  function requestDeleteCourseType(courseTypeOption: { id: CourseType; label: string }) {
    const isCustom = courseTypeOption.id.startsWith("custom_");
    confirm({
      title: `删除班型「${courseTypeOption.label}」？`,
      description: isCustom
        ? "自定义班型会从班型列表中直接删除；已被课程或历史课时使用的自定义班型不能直接删除。"
        : "内置班型只是从主列表、添加课程档案和筛选下拉中隐藏，并清理该班型的旧名称和旧计费规则配置；已有课程和历史课节不会被删除，仍然保留原样。",
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
    applyNewCourseFeeRule({ ...courseFeeRule, ...patch });
  }

  function updateNewTrialFixedFee(fixedFee: number) {
    applyNewCourseFeeRule({
      ...courseFeeRule,
      mode: "fixed",
      fixedFee,
      hourlyRate: undefined,
      baseFee: undefined,
      perPresentStudentFee: undefined,
      classFeeTiers: undefined
    });
  }

  function replaceNewClassFeeTiers(nextTiers: ClassFeeTier[]) {
    const sortedTiers = [...nextTiers].sort((a, b) => a.minStudents - b.minStudents);
    const firstTier = sortedTiers[0];
    applyNewCourseFeeRule({
      ...courseFeeRule,
      mode: "class_headcount",
      baseFee: firstTier?.baseFee ?? courseFeeRule.baseFee,
      perPresentStudentFee: firstTier?.perStudentFee ?? courseFeeRule.perPresentStudentFee,
      classFeeTiers: sortedTiers,
      stageRates: firstTier ? stageRatesFromTierForCourseType(courseType, firstTier) : courseFeeRule.stageRates
    });
  }

  function updateNewClassFeeTier(tierId: string, patch: Partial<ClassFeeTier>) {
    const tier = normalizedClassFeeTiers(courseFeeRule).find((item) => item.id === tierId) ?? normalizedClassFeeTiers(courseFeeRule)[0];
    replaceNewClassFeeTiers([{ ...tier, ...patch, maxStudents: undefined }]);
  }

  function setNewCourseStudents(nextStudentIds: string[]) {
    const normalizedStudentIds = normalizeCourseStudentIds(courseType, activeCourseStudentIds(nextStudentIds), courseFeeRule);
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
      if (!canAddStudentToCourse(courseType, courseFeeRule, courseStudentIds, student)) return;
    }
    setNewCourseStudents(
      isSelected ? courseStudentIds.filter((id) => id !== studentId) : [...courseStudentIds, studentId]
    );
  }

  function canAddStudentToCourse(type: CourseType, feeRule: FeeRule | undefined, selectedStudentIds: string[], student: Student): boolean {
    const selectedGrade = courseRequiresSameGradeStudents(vault, type, feeRule) ? firstCourseStudentGrade(selectedStudentIds) : undefined;
    if (selectedGrade !== undefined && (student.grade ?? "") !== selectedGrade) return false;
    const limit = studentLimitForCourseType(type);
    return !limit || selectedStudentIds.length < limit;
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
      const feeRule: FeeRule = {
        ...current.feeRule,
        mode: "class_headcount",
        baseFee: firstTier?.baseFee ?? current.feeRule.baseFee,
        perPresentStudentFee: firstTier?.perStudentFee ?? current.feeRule.perPresentStudentFee,
        classFeeTiers: sortedTiers,
        stageRates: firstTier ? stageRatesFromTierForCourseType(current.type, firstTier) : current.feeRule.stageRates
      };
      return {
        ...current,
        feeRule,
        studentIds: normalizeCourseStudentIds(current.type, current.studentIds, feeRule)
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

  function updateStudentStatusFromRow(student: Student, status: Student["status"]) {
    if (student.status === status) return;
    if (status !== "active") {
      setCourseStudentIds((current) => current.filter((studentId) => studentId !== student.id));
    }
    onUpdateStudent({ ...student, status });
    flashArchiveRow("students", student.id);
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
        setCourseStudentIds((current) => current.filter((studentId) => !selectedIdSet.has(studentId)));
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

  function toggleCourseSelection(courseId: string) {
    setSelectedCourseIds((current) =>
      current.includes(courseId) ? current.filter((id) => id !== courseId) : [...current, courseId]
    );
  }

  function toggleVisibleCourseSelection(checked: boolean) {
    const visibleIds = visibleCourses.map((course) => course.id);
    setSelectedCourseIds((current) => {
      if (checked) return Array.from(new Set([...current, ...visibleIds]));
      const visibleIdSet = new Set(visibleIds);
      return current.filter((id) => !visibleIdSet.has(id));
    });
  }

  function updateSelectedCoursesStatus(status: CourseGroup["status"]) {
    const selectedCourses = visibleCourses.filter((course) => selectedCourseIds.includes(course.id));
    if (selectedCourses.length === 0) return;
    const apply = () => {
      const selectedIdSet = new Set(selectedCourses.map((course) => course.id));
      onUpdateCourses(selectedCourses.map((course) => ({ ...course, status })));
      setSelectedCourseIds((current) => current.filter((id) => !selectedIdSet.has(id)));
      setCourseArchiveMessage(`${status === "active" ? "启用" : "结课"}完成：已处理 ${selectedCourses.length} 个课程档案。`);
    };
    if (status === "paused") {
      confirm({
        title: `将选中的 ${selectedCourses.length} 个课程设为结课？`,
        description: "课程结课后仍会保留历史课时；需要继续排课时可重新启用。",
        confirmLabel: "结课",
        tone: "danger",
        onConfirm: apply
      });
      return;
    }
    apply();
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
      if (!isSelected) {
        if (student?.status !== "active") return current;
        if (!canAddStudentToCourse(current.type, current.feeRule, current.studentIds, student)) return current;
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
    const nextFeeRule = supportsSalaryGradeFee(nextType) && editingCourse.feeRule.mode === "salary_grade"
      ? editingCourse.feeRule
      : courseTypeDefaultFeeRule(nextType);
    const nextStudentIds = normalizeCourseStudentIds(nextType, editingCourse.studentIds, nextFeeRule);
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
    const studentIds = normalizeCourseStudentIds(editingCourse.type, editingCourse.studentIds, feeRule);
    onUpdateCourse({
      ...editingCourse,
      name: editingCourse.name.trim(),
      subject: editingCourse.subject.trim() || "未设置",
      studentIds,
      defaultCampusId: firstCourseStudentCampus(studentIds) ?? editingCourse.defaultCampusId,
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
          { label: "档案信息", value: `${vault.students.length} 人`, hint: `在读 ${activeStudentCount} 人 / 过渡 ${transitionStudentCount} 人 / 已归档 ${archivedStudentCount} 人`, icon: Users },
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
          计费原则：课节金额以创建或刷新时保存的快照为准；档案和课时费规则调整默认用于新建课节，已排未上课节只有在课程档案同步或手动刷新时才会更新，已完成历史课节保留原金额。
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
            customCourseTypeInput={customCourseTypeInput}
            customCourseTypeMinStudents={customCourseTypeMinStudents}
            customCourseTypePerStudentFee={customCourseTypePerStudentFee}
            customCourseTypeTemplate={customCourseTypeTemplate}
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
            onRequestSyncCourseTypeFeeRuleToCourses={requestSyncCourseTypeFeeRuleToCourses}
            onRequestMigrateCourseTypeLessons={requestMigrateCourseTypeLessons}
            migrationOrphanTargetType={migrationOrphanTargetType}
            setMigrationOrphanTargetType={setMigrationOrphanTargetType}
            onResetCourseTypeFeeRule={resetCourseTypeFeeRule}
            onSaveCustomCourseType={saveCustomCourseType}
            onSaveSubject={saveSubject}
            onStartEditCustomCourseType={startEditCustomCourseType}
            onStartEditSubject={startEditSubject}
            onUpdateCampus={onUpdateCampus}
            onUpdateCourseTypeClassFeeTier={updateCourseTypeClassFeeTier}
            onUpdateCourseTypeBillableCap={updateCourseTypeBillableCap}
            onUpdateCourseTypeStageRate={updateCourseTypeStageRate}
            onUpdateCourseTypeFixedRule={updateCourseTypeFixedRule}
            onUpdateCourseTypeHourlyRule={updateCourseTypeHourlyRule}
            setCampusAddressInput={setCampusAddressInput}
            setCampusNameInput={setCampusNameInput}
            setCampusNoteInput={setCampusNoteInput}
            setCourseTypeMessage={setCourseTypeMessage}
            setCustomCourseTypeBaseFee={setCustomCourseTypeBaseFee}
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
            batchStudentMessage={batchStudentMessage}
            batchStudentText={batchStudentText}
            campusOptions={campusOptions}
            confirm={confirm}
            courseTypeOptions={courseTypeOptions}
            customGradeInput={customGradeInput}
            gradeFilter={gradeFilter}
            gradeFilterOptions={gradeFilterOptions}
            gradeOptions={gradeOptions}
            hasUnsetGradeFilterOption={hasUnsetGradeFilterOption}
            onAddStudent={addStudent}
            onBatchAddStudents={addBatchStudents}
            onDeleteStudent={onDeleteStudent}
            onDeleteSelectedArchivedStudents={deleteSelectedArchivedStudents}
            onOpenStudentEditor={openStudentEditor}
            onRequestArchiveStudent={requestArchiveStudent}
            onRestoreStudent={restoreStudent}
            onUpdateStudentStatus={updateStudentStatusFromRow}
            setArchiveSearch={setArchiveSearch}
            setBatchStudentText={setBatchStudentText}
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
            selectedStudentIds={selectedStudentIds}
            studentStatusFilter={studentStatusFilter}
            studentSubjectFilter={studentSubjectFilter}
            studentTemporaryTrialInput={studentTemporaryTrialInput}
            studentTrialFilter={studentTrialFilter}
            subjectFilterOptions={subjectFilterOptions}
            vault={vault}
            visibleStudents={visibleStudents}
            onToggleStudentSelection={toggleStudentSelection}
            onToggleVisibleStudentSelection={toggleVisibleStudentSelection}
            onUpdateSelectedStudentsStatus={updateSelectedStudentsStatus}
          />
        )}

        {archivePanel === "courses" && (
        <div className="space-y-4">
        <NewCourseFormPanel
          activeStudentCount={activeStudentCount}
          addCourseStudentOptions={addCourseStudentOptions}
          amountsVisible={amountsVisible}
          campusOptions={campusOptions}
          courseCampusCustomized={courseCampusCustomized}
          courseCampusInput={courseCampusInput}
          courseFeeRule={courseFeeRule}
          courseNameInput={courseNameInput}
          courseStatusInput={courseStatusInput}
          courseStudentIds={courseStudentIds}
          courseSubjectInput={courseSubjectInput}
          courseType={courseType}
          courseTypeOptions={courseTypeOptions}
          feeModeValue={feeModeValue}
          firstCourseStudentGrade={firstCourseStudentGrade}
          newCourseStudentSearch={newCourseStudentSearch}
          onChangeCourseCampus={changeNewCourseCampus}
          onChangeCourseFeeMode={changeNewCourseFeeMode}
          onChangeCourseSalaryGrade={changeNewCourseSalaryGrade}
          onChangeCourseType={changeNewCourseType}
          onOpenSchedule={onOpenSchedule}
          onSubmit={addCourse}
          onToggleCourseStudent={toggleNewCourseStudent}
          onUpdateClassFeeTier={updateNewClassFeeTier}
          onUpdateCourseFee={updateNewCourseFee}
          onUpdateTrialFixedFee={updateNewTrialFixedFee}
          renderSalaryGradeOptions={salaryGradeSelectOptions}
          setCourseNameEdited={setCourseNameEdited}
          setCourseNameInput={setCourseNameInput}
          setCourseStatusInput={setCourseStatusInput}
          setCourseSubjectInput={setCourseSubjectInput}
          setNewCourseStudentSearch={setNewCourseStudentSearch}
          subjectOptions={subjectOptions}
          suggestedCourseName={suggestedCourseName}
          supportsSalaryGradeFee={supportsSalaryGradeFee}
          vault={vault}
        />

        <CourseArchiveListPanel
          archiveRowClass={archiveRowClass}
          campusOptions={campusOptions}
          confirm={confirm}
          courseArchiveMessage={courseArchiveMessage}
          courseCampusFilter={courseCampusFilter}
          courseFeeSummary={courseFeeSummary}
          courseGradeFilter={courseGradeFilter}
          courseInUse={courseInUse}
          courseSearch={courseSearch}
          courseStatusFilter={courseStatusFilter}
          courseSubjectFilter={courseSubjectFilter}
          courseTypeFilter={courseTypeFilter}
          courseTypeOptions={courseTypeOptions}
          gradeFilterOptions={gradeFilterOptions}
          hasUnsetGradeFilterOption={hasUnsetGradeFilterOption}
          onDeleteCourse={onDeleteCourse}
          onOpenCourseEditor={openCourseEditor}
          onRequestSyncVisibleCourses={requestSyncVisibleCoursesToLessons}
          selectedCourseIds={selectedCourseIds}
          onToggleCourseSelection={toggleCourseSelection}
          onToggleVisibleCourseSelection={toggleVisibleCourseSelection}
          onUpdateSelectedCoursesStatus={updateSelectedCoursesStatus}
          setCourseCampusFilter={setCourseCampusFilter}
          setCourseGradeFilter={setCourseGradeFilter}
          setCourseSearch={setCourseSearch}
          setCourseStatusFilter={setCourseStatusFilter}
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
        courseFeeSummary={courseFeeSummary}
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
  if (!courseRequiresSameGradeStudents(vault, course.type, course.feeRule) || course.studentIds.length === 0) return true;
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
    studentStatusSearchText(student.status),
    student.temporaryTrial ? "试听 临时试听" : "",
    ...studentCourses.flatMap((course) => [
      course.name,
      course.subject,
      courseTypeLabel(vault, course.type),
      campusName(vault, course.defaultCampusId)
    ])
  ].join(" ").toLowerCase();
}

function matchesStudentStatusFilter(student: Student, filter: StudentStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "archived") return student.status === "paused";
  return student.status === filter;
}

function studentStatusSearchText(status: Student["status"]): string {
  if (status === "paused") return "已归档 归档 暂停";
  if (status === "transition") return "过渡期 升学 中考 待定 缓冲";
  return "在读 正常";
}
function normalizeCourseTypeLabel(value: string): string {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

function normalizedStudentIdKey(studentIds: string[]): string {
  return [...studentIds].sort().join("|");
}

type ParsedStudentBatchRow = {
  name: string;
  grade?: string;
  school?: string;
  note?: string;
  isHeader: boolean;
};

function parseStudentBatchRows(text: string): ParsedStudentBatchRow[] {
  return text
    .split(/\r?\n/)
    .map(parseStudentBatchLine)
    .filter((row): row is ParsedStudentBatchRow => Boolean(row));
}

function parseStudentBatchLine(line: string): ParsedStudentBatchRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const hasExplicitDelimiter = /[｜|\t,，]/.test(trimmed);
  const parts = hasExplicitDelimiter
    ? trimTrailingEmptyParts(trimmed.split(/[｜|\t,，]/).map((part) => part.trim()))
    : trimmed.split(/\s+/).map((part) => part.trim()).filter(Boolean);
  const [name = "", grade, school, ...noteParts] = parts;
  if (!name) return null;
  const note = noteParts.join("，");
  return {
    name,
    grade,
    school,
    note: note || undefined,
    isHeader: isStudentBatchHeader(name, grade, school)
  };
}

function trimTrailingEmptyParts(parts: string[]): string[] {
  const nextParts = [...parts];
  while (nextParts.length > 0 && !nextParts[nextParts.length - 1]) {
    nextParts.pop();
  }
  return nextParts;
}

function isStudentBatchHeader(name: string, grade?: string, school?: string): boolean {
  const normalizedName = normalizeStudentDuplicateValue(name);
  if (normalizedName !== "姓名" && normalizedName !== "学生姓名") return false;
  const normalizedGrade = normalizeStudentDuplicateValue(grade ?? "");
  const normalizedSchool = normalizeStudentDuplicateValue(school ?? "");
  return !grade || normalizedGrade.includes("年级") || normalizedSchool.includes("学校");
}

function normalizeStudentGradeValue(value?: string): string {
  const grade = value?.trim() ?? "";
  return grade === "未设置年级" ? "" : grade;
}

function studentDuplicateKey(name: string, grade: string | undefined, campusId: string | undefined): string {
  return [
    normalizeStudentDuplicateValue(name),
    normalizeStudentDuplicateValue(grade ?? ""),
    campusId ?? ""
  ].join("|");
}

function normalizeStudentDuplicateValue(value: string): string {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

function defaultFeeRuleForCustomTemplate(
  template: CustomCourseTypeTemplate,
  vault: TeacherVault
): FeeRule {
  const templateType: CourseType = template === "class" ? "small_class" : "one_on_one";
  const minStudents = template === "class" ? 5 : 1;
  const defaultGradeRule = salaryGradeRuleById(vault.profile.defaultSalaryGradeId, vault) ?? defaultSalaryGradeRule(vault);
  const juniorRate = salaryGradeRateForStage(defaultGradeRule, "junior_3");
  const baseFee = template === "class" ? juniorRate.classBaseFee : juniorRate.oneOnOneFee;
  return classHeadcountFeeRuleForCourseType(
    templateType,
    baseFee,
    juniorRate.headcountIncrementFee,
    minStudents,
    "perStudentFee",
    defaultGradeRule.stageRates,
    billableStudentCapForCourseType(templateType)
  );
}

function stageRatesFromTierForCourseType(type: CourseType, tier: ClassFeeTier): Record<SalaryGradeStage, SalaryGradeStageRateConfig> {
  const usesClassBase = tier.minStudents > 1;
  const rate = {
    oneOnOneFee: usesClassBase ? 0 : Math.max(tier.baseFee, 0),
    classBaseFee: usesClassBase ? Math.max(tier.baseFee, 0) : 0,
    headcountIncrementFee: Math.max(tier.perStudentFee ?? 0, 0)
  };
  return salaryGradeStageOrder.reduce(
    (rates, stage) => {
      rates[stage] = rate;
      return rates;
    },
    {} as Record<SalaryGradeStage, SalaryGradeStageRateConfig>
  );
}

function normalizeCourseFeeRuleForType(type: CourseType, feeRule: FeeRule): FeeRule {
  if (type === "trial") return backupFeeRuleForCourseType(type, feeRule);
  if (feeRule.mode === "salary_grade") {
    return {
      mode: "salary_grade",
      salaryGradeSource: feeRule.salaryGradeSource ?? "teacher_default",
      salaryGradeId: feeRule.salaryGradeId
    };
  }
  return backupFeeRuleForCourseType(type, feeRule);
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
