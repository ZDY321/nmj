import { Fragment, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, BookOpen, Building2, CalendarDays, ChevronDown, ChevronRight, FileText, GraduationCap, MapPin, Pencil, Plus, RotateCcw, Save, Search, Settings, Trash2, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Campus, ClassFeeTier, CourseGroup, CourseType, CustomCourseType, CustomCourseTypeOption, FeeRule, Student, StudentCourseTransition, TeacherProfile, TeacherVault } from "@/shared/types";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { makeId } from "@/frontend/lib/crypto";
import { calculateClassHeadcountFee, defaultClassFeeTiers, defaultFeeRuleForCourseType, feeRuleForCourseType, fixedFeeForRule, normalizedClassFeeTiers, obligationSummary, todayIso } from "@/frontend/lib/calculations";
import { builtInCourseTypeOptions, campusName, compareByName, courseTypeLabel, courseTypeOptionsForVault, formatPrivateMoney, sortCampusesForProfile, sortCoursesByName, sortStudentsByName, studentLimitForCourseType, studentNames, subjectOptionsForVault } from "@/frontend/lib/helpers";

const fixedGradeOptions = ["初一", "初二", "初三"];
const gradeOptions = ["未设置年级", ...fixedGradeOptions, "自定义"];
type ArchivePanel = "profile" | "campuses" | "students" | "courses";

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
      return matchesStatus && matchesGrade && matchesCampus && matchesType && matchesSubject && matchesSearch;
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
    return feeRuleForCourseType(vault, type);
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
    onAddCustomCourseType(option, defaultFeeRuleForCustomTemplate(customCourseTypeTemplate));
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
        ? defaultFeeRuleForCourseType("class")
        : { mode: "hourly" as const, hourlyRate: 0 };
    onUpdateCourseTypeFeeRule(type, nextRule);
    if (courseType === type) {
      setCourseFeeRule(nextRule);
    }
  }

  function courseFeeSummary(course: CourseGroup): string {
    if (course.feeRule.mode === "class_headcount") {
      return `当前 ${course.studentIds.length} 人单节预估：${formatPrivateMoney(calculateClassHeadcountFee(course.feeRule, course.studentIds.length), amountsVisible)}`;
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
          <Card className="overflow-hidden">
            <CardHeader>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                <Settings size={14} /> 个人与义务课时设置
              </div>
              <CardTitle>老师个人信息</CardTitle>
              <CardDescription>义务课时自动从本校区非试听课里按单节总课时费从低到高抵扣，本校区不足时再合并其他校区课次继续抵扣。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">显示姓名</label>
                  <Input value={vault.profile.displayName} onChange={(event) => updateProfile({ displayName: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">所在校区</label>
                  <Select value={vault.profile.homeCampusId ?? ""} onChange={(event) => updateHomeCampus(event.target.value)}>
                    <option value="">未设置</option>
                    {campusOptions.map((campus) => (
                      <option key={campus.id} value={campus.id}>{campus.name}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">义务课时本校区</label>
                  <Select value={vault.profile.obligationCampusId ?? ""} onChange={(event) => updateObligationCampus(event.target.value)}>
                    <option value="">跟随所在校区</option>
                    {campusOptions.map((campus) => (
                      <option key={campus.id} value={campus.id}>{campus.name}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">扣义务课时方式</label>
                  <Select
                    value={obligationMode}
                    onChange={(event) => updateProfile({ obligationDeductionMode: event.target.value as TeacherProfile["obligationDeductionMode"] })}
                  >
                    <option value="auto_gap">按单节总课时费从低到高自动抵扣，不足按小时补扣</option>
                    <option value="manual">手动填写扣除金额</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">每月义务小时</label>
                  <Input
                    type="number"
                    min={0}
                    value={vault.profile.monthlyObligationHours ?? 0}
                    onChange={(event) => updateProfile({ monthlyObligationHours: Math.max(Number(event.target.value), 0) })}
                    disabled={isManualObligationMode}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">每小时补扣费用</label>
                  <SensitiveAmountField visible={amountsVisible}>
                    <Input
                      type="number"
                      min={0}
                      value={vault.profile.obligationHourlyDeduction ?? 0}
                      onChange={(event) => updateProfile({ obligationHourlyDeduction: Math.max(Number(event.target.value), 0) })}
                      disabled={isManualObligationMode}
                    />
                  </SensitiveAmountField>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">手动扣除金额</label>
                  <SensitiveAmountField visible={amountsVisible}>
                    <Input
                      type="number"
                      min={0}
                      value={vault.profile.manualObligationDeduction ?? 0}
                      onChange={(event) => updateProfile({ manualObligationDeduction: Math.max(Number(event.target.value), 0) })}
                      disabled={!isManualObligationMode}
                    />
                  </SensitiveAmountField>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">基本工资</label>
                  <SensitiveAmountField visible={amountsVisible}>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-extrabold text-[#64748b]">¥</span>
                      <Input
                        type="number"
                        min={0}
                        value={vault.profile.baseSalary}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          updateProfile({ baseSalary: Number.isFinite(value) ? Math.max(value, 0) : 0 });
                        }}
                        className="pl-10"
                      />
                    </div>
                  </SensitiveAmountField>
                </div>
                <div className="space-y-2 lg:col-span-3">
                  <label className="text-sm font-medium">个人备注</label>
                  <Textarea
                    value={vault.profile.note ?? ""}
                    onChange={(event) => updateProfile({ note: event.target.value })}
                    placeholder="例如：主要负责中心校区，高中数学方向"
                    className="min-h-[76px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-[16px] border border-[#fecaca] bg-[#fff1f2] p-3 md:grid-cols-4">
                {[
                  { label: "义务目标", value: `${obligation.requiredHours.toFixed(1)} 小时` },
                  { label: "本月应扣", value: `${obligation.deductedHours.toFixed(1)} 小时` },
                  { label: "补扣小时", value: `${obligation.fallbackHours.toFixed(1)} 小时` },
                  { label: "本月扣费", value: formatPrivateMoney(obligation.amount, amountsVisible) }
                ].map((item) => (
                  <div key={item.label} className="rounded-[12px] border border-[#fecaca] bg-[#fee2e2] p-3">
                    <div className="text-xs font-bold text-[#991b1b]">{item.label}</div>
                    <div className="mt-1 text-lg font-extrabold text-[#7f1d1d]">{item.value}</div>
                  </div>
                ))}
              </div>

              {!isManualObligationMode && (
                <div className="space-y-3 rounded-[16px] border border-[#dbe4ef] bg-white p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-extrabold text-[#061226]">义务课时自动抵扣明细</div>
                      <div className="mt-1 text-xs font-semibold text-[#64748b]">
                        {campusName(vault, obligationCampusId)} · {obligationMonth}，先扣本校区单节总课时费较低的课次；本校区不够时，再把其他校区课次合并后从低到高继续抵扣；试听不参与抵扣。
                      </div>
                    </div>
                    <Badge variant="secondary">{obligation.courseBreakdown.length} 个课程</Badge>
                  </div>
                  <div className="space-y-2">
                    {obligation.courseBreakdown.map((item, index) => {
                      const course = vault.courseGroups.find((candidate) => candidate.id === item.courseId);
                      return (
                        <div key={item.courseId} className="rounded-[12px] border border-[#e8eef6] bg-[#f8fbff] p-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={index === 0 ? "amber" : "secondary"}>{index + 1}</Badge>
                              <span className="truncate text-sm font-extrabold text-[#061226]">{item.courseName}</span>
                              {course && <span className="text-xs font-semibold text-[#64748b]">{courseTypeLabel(vault, course.type)} · {course.subject} · {campusName(vault, course.defaultCampusId)}</span>}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-[#64748b]">
                              <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-[#dbe4ef]">本月 {item.lessonCount} 节</span>
                              <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-[#dbe4ef]">可扣 {item.availableHours.toFixed(1)} 小时</span>
                              <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-[#dbe4ef]">已扣 {item.deductedHours.toFixed(1)} 小时</span>
                              <span className="rounded-full bg-[#fee2e2] px-2.5 py-1 text-[#b91c1c]">扣 {formatPrivateMoney(item.amount, amountsVisible)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {obligation.courseBreakdown.length === 0 && (
                      <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-5 text-center text-sm font-semibold text-[#64748b]">
                        本月没有可用于义务抵扣的非试听已完成课程，义务小时会全部按每小时补扣费用计算。
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        {archivePanel === "students" && (
          <Card className="overflow-hidden">
            <CardHeader className="gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                    <GraduationCap size={14} /> 班型调整
                  </div>
                  <CardTitle className="text-lg">学生课程关系</CardTitle>
                  <CardDescription>调整后只影响后续新建课时；已经生成的课时保留原学生、班型和费用快照。</CardDescription>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="sky" className="w-fit">{transferCurrentCourses.length} 个当前课程</Badge>
                  <Button type="button" variant="outline" size="sm" onClick={() => setTransferPanelOpen((open) => !open)}>
                    <ChevronDown size={14} className={`transition-transform ${transferPanelOpen ? "rotate-180" : ""}`} />
                    {transferPanelOpen ? "收起" : "展开"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            {transferPanelOpen && (
            <CardContent className="space-y-4">
              <form onSubmit={applyStudentCourseTransfer} className="space-y-4">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">学生</label>
                    <Select value={transferStudentId} onChange={(event) => setTransferStudentId(event.target.value)}>
                      {activeStudentOptions.map((student) => (
                        <option key={student.id} value={student.id}>{studentOptionLabel(student)}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">新班型</label>
                    <Select value={transferCourseType} onChange={(event) => setTransferCourseType(event.target.value as CourseType)}>
                      {courseTypeOptions.map((type) => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">科目</label>
                    <Select value={transferSubjectInput || transferCurrentCourses[0]?.subject || subjectOptions[0] || "未设置"} onChange={(event) => setTransferSubjectInput(event.target.value)}>
                      {subjectOptions.map((subject) => (
                        <option key={subject} value={subject}>{subject}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">处理方式</label>
                    <div className="grid grid-cols-2 rounded-[12px] border border-[#dbe4ef] bg-white p-1">
                      {[
                        { key: "new" as const, label: "新建档案" },
                        { key: "existing" as const, label: "加入已有" }
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setTransferTargetMode(item.key)}
                          className={`rounded-[9px] px-3 py-2 text-xs font-bold ${
                            transferTargetMode === item.key ? "bg-[#1557c2] text-white" : "text-[#25324a]"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {transferTargetMode === "new" ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">课程名称</label>
                      <Input
                        value={transferCourseNameInput}
                        onChange={(event) => setTransferCourseNameInput(event.target.value)}
                        placeholder={transferStudent ? `${transferStudent.name}${courseTypeLabel(vault, transferCourseType)}` : "新课程名称"}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">默认校区</label>
                      <Select value={transferCampusInput} onChange={(event) => setTransferCampusInput(event.target.value)}>
                        <option value="">未设置校区</option>
                        {campusOptions.map((campus) => (
                          <option key={campus.id} value={campus.id}>{campus.name}</option>
                        ))}
                      </Select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">目标课程</label>
                    <Select value={transferTargetCourseId} onChange={(event) => setTransferTargetCourseId(event.target.value)}>
                      {transferTargetCourses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name} · {course.subject} · {studentNames(vault, course.studentIds) || "未关联学生"}
                        </option>
                      ))}
                    </Select>
                    {transferTargetCourses.length === 0 && (
                      <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] px-3 py-2 text-xs font-semibold text-[#64748b]">
                        当前没有可加入的同班型课程，可以切换为新建档案。
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="text-sm font-extrabold text-[#061226]">当前课程</div>
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#64748b]">
                        <input
                          type="checkbox"
                          checked={transferEndExisting}
                          onChange={(event) => setTransferEndExisting(event.target.checked)}
                          className="h-3.5 w-3.5 accent-[#ff8617]"
                        />
                        转班后从旧同科目课程中移除该学生
                      </label>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {transferCurrentCourses.length > 0 ? transferCurrentCourses.map((course) => (
                        <Badge key={course.id} variant={course.type === "class" ? "sky" : course.type === "trial" ? "plum" : "sage"}>
                          {course.name} · {courseTypeLabel(vault, course.type)}
                        </Badge>
                      )) : (
                        <Badge variant="secondary">暂无当前课程</Badge>
                      )}
                    </div>
                  </div>
                  <Button type="submit" disabled={!transferStudentId || (transferTargetMode === "existing" && !transferTargetCourseId)}>
                    <Save size={15} /> 保存调整
                  </Button>
                </div>
              </form>
              {transferMessage && (
                <div className="rounded-[12px] border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-sm font-bold text-[#166534]">
                  {transferMessage}
                </div>
              )}
            </CardContent>
            )}
          </Card>
        )}
        {archivePanel === "campuses" && (
        <div className="space-y-4">
        <Card className="h-fit overflow-hidden">
          <CardHeader className="gap-3">
            <div className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-[#ff8617]" />
                <CardTitle className="text-lg">校区与班型</CardTitle>
              </div>
              <Badge variant="secondary">{vault.campuses.length} 个</Badge>
            </div>
            <form onSubmit={addCampus} className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto]">
              <Input
                value={campusNameInput}
                onChange={(e) => setCampusNameInput(e.target.value)}
                placeholder="校区名称，例如：中心校区"
              />
              <Input
                value={campusAddressInput}
                onChange={(e) => setCampusAddressInput(e.target.value)}
                placeholder="地址，例如：人民路 88 号"
              />
              <Input
                value={campusNoteInput}
                onChange={(e) => setCampusNoteInput(e.target.value)}
                placeholder="备注，可选"
              />
              <Button type="submit">
                <Plus size={15} /> 添加校区
              </Button>
            </form>
          </CardHeader>
          <CardContent className="max-h-[520px] space-y-0 overflow-y-auto pr-2">
            {campusOptions.map((campus) => {
              const isEditing = editingCampus?.id === campus.id;
              const used = campusInUse(campus.id);
              return (
                <motion.div
                  key={campus.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={archiveRowClass("campuses", campus.id)}
                >
                  {isEditing && editingCampus ? (
                    <div className="space-y-3">
                      <Input
                        value={editingCampus.name}
                        onChange={(event) => setEditingCampus({ ...editingCampus, name: event.target.value })}
                        placeholder="校区名称"
                      />
                      <Input
                        value={editingCampus.address ?? ""}
                        onChange={(event) => setEditingCampus({ ...editingCampus, address: event.target.value })}
                        placeholder="地址"
                      />
                      <Input
                        value={editingCampus.note ?? ""}
                        onChange={(event) => setEditingCampus({ ...editingCampus, note: event.target.value })}
                        placeholder="备注"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" size="sm" onClick={() => {
                          if (!editingCampus.name.trim()) return;
                          const campusId = editingCampus.id;
                          onUpdateCampus({ ...editingCampus, name: editingCampus.name.trim() });
                          setEditingCampus(null);
                          flashArchiveRow("campuses", campusId);
                        }}>
                          <Save size={14} /> 保存
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => {
                          flashArchiveRow("campuses", editingCampus.id);
                          setEditingCampus(null);
                        }}>
                          <X size={14} /> 取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eaf2ff]">
                        <Building2 size={16} className="text-[#1557c2]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{campus.name}</span>
                        <span className="mt-1 flex items-center gap-1 text-xs text-(--color-muted-foreground)">
                          <MapPin size={10} /> {campus.address || "未填写地址"}
                        </span>
                        {campus.note && (
                          <span className="mt-1 block text-xs leading-5 text-(--color-muted-foreground)">
                            {campus.note}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 rounded-[9px] p-0"
                          title="编辑校区"
                          aria-label={`编辑校区 ${campus.name}`}
                          onClick={() => setEditingCampus(campus)}
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="h-8 w-8 rounded-[9px] p-0"
                          disabled={used}
                          title={used ? "已有学生、课程或课时引用，不能直接删除" : "删除校区"}
                          aria-label={`删除校区 ${campus.name}`}
                          onClick={() =>
                            confirm({
                              title: `删除校区「${campus.name}」？`,
                              description: "删除后无法从校区与班型中恢复。",
                              confirmLabel: "删除",
                              tone: "danger",
                              onConfirm: () => onDeleteCampus(campus.id)
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
            {vault.campuses.length === 0 && (
              <p className="py-8 text-center text-sm text-(--color-muted-foreground)">还没有校区</p>
            )}
          </CardContent>
        </Card>
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
              <Button type="button" onClick={addSubject} disabled={!subjectInput.trim()}>
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
                      <Button type="button" size="sm" onClick={saveSubject} disabled={!editingSubjectInput.trim()}>
                        <Save size={14} /> 保存
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={cancelEditSubject}>
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
                        <Button type="button" size="sm" variant="outline" className="h-8 w-8 rounded-[9px] p-0" onClick={() => startEditSubject(subject)} title="编辑科目">
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
        <Card className="h-fit overflow-hidden">
          <CardHeader className="gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                  <GraduationCap size={14} /> 班型管理
                </div>
                <CardTitle className="text-lg">班型与默认计费</CardTitle>
                <CardDescription>班型可改名、按名称排序并设置默认计费；内置班型删除后会从主列表移除，自定义班型未使用时会直接删除。</CardDescription>
                <div className="mt-1 text-sm font-semibold leading-5 text-[#64748b]">
                  恢复默认计费会把该班型的默认价格恢复为 0，只影响以后新建的课程，已添加课程不会自动修改。
                </div>
              </div>
              <Badge variant="secondary" className="w-fit">{managedCourseTypes.length} 个可配置</Badge>
            </div>
            <div className="grid grid-cols-1 gap-2 rounded-[14px] border border-[#fed7aa] bg-[#fff7ed] p-3 lg:grid-cols-[minmax(0,1fr)_200px_auto] lg:items-center">
              <Input
                value={customCourseTypeInput}
                onChange={(event) => {
                  setCustomCourseTypeInput(event.target.value);
                  if (courseTypeMessage) setCourseTypeMessage("");
                }}
                placeholder="自定义班型，例如：小组课、冲刺课"
                maxLength={24}
                className={`h-10 border-[#fdba74] bg-white text-[#7c2d12] placeholder:text-[#d97706]/70 focus:border-[#ff8617] focus:ring-2 focus:ring-[#ff8617]/20 ${courseTypeMessage ? "border-[#fca5a5] bg-[#fff1f2]" : ""}`}
              />
              <Select
                value={customCourseTypeTemplate}
                onChange={(event) => setCustomCourseTypeTemplate(event.target.value as "class" | "hourly")}
                className="h-10 border-[#fdba74] bg-white text-[#7c2d12]"
                aria-label="选择自定义班型计费模板"
              >
                <option value="class">班课人数计费模板</option>
                <option value="hourly">一对一按小时模板</option>
              </Select>
              <Button type="button" variant="outline" className="h-10 border-[#fdba74] bg-white text-[#9a3412] hover:bg-[#ffedd5]" disabled={!customCourseTypeInput.trim()} onClick={addCustomCourseType}>
                <Plus size={14} /> 添加班型
              </Button>
            </div>
            {courseTypeMessage && (
              <div className="rounded-[12px] border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm font-bold text-[#b91c1c]">
                {courseTypeMessage}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {managedCourseTypes.map((typeOption) => {
              const type = typeOption.value;
              const rule = feeRuleForCourseType(vault, type);
              const tier = normalizedClassFeeTiers(rule)[0] ?? defaultClassFeeTiers(defaultFeeRuleForCourseType(type))[0];
              const isCustom = type.startsWith("custom_");
              const isEditingType = editingCustomCourseTypeId === type;
              const used = courseTypeInUse(type);
              return (
                <div key={type} className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      {isEditingType ? (
                        <>
                          <Input
                            value={editingCustomCourseTypeLabel}
                            onChange={(event) => {
                              setEditingCustomCourseTypeLabel(event.target.value);
                              if (courseTypeMessage) setCourseTypeMessage("");
                            }}
                            maxLength={24}
                            className={`h-9 max-w-[220px] border-[#fdba74] bg-white text-sm font-bold text-[#7c2d12] ${courseTypeMessage ? "border-[#fca5a5] bg-[#fff1f2]" : ""}`}
                          />
                          <Button type="button" size="sm" className="h-9" disabled={!editingCustomCourseTypeLabel.trim()} onClick={saveCustomCourseType}>
                            <Save size={14} /> 保存
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="h-9" onClick={cancelCustomCourseTypeEdit}>
                            <X size={14} /> 取消
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="truncate text-base font-extrabold text-[#061226]">{typeOption.label}</span>
                          <Badge variant={isCustom ? "amber" : "sky"}>{isCustom ? "自定义" : "内置"}</Badge>
                          {used && <span className="text-xs font-extrabold text-[#15803d]">使用中</span>}
                        </>
                      )}
                    </div>
                    {!isEditingType && (
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => startEditCustomCourseType({ id: type, label: typeOption.label })}>
                          <Pencil size={14} /> 改名
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={isCustom && used}
                          onClick={() => requestDeleteCourseType({ id: type, label: typeOption.label })}
                          title={isCustom && used ? "这个自定义班型已有课程或历史课时使用，不能直接删除" : isCustom ? "直接删除自定义班型" : "内置班型会从主列表和添加课程档案中移除"}
                        >
                          <Trash2 size={14} /> 删除
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => resetCourseTypeFeeRule(type)}>
                          恢复默认计费
                        </Button>
                      </div>
                    )}
                  </div>
                  {rule.mode === "class_headcount" ? (
                  <div className="rounded-[12px] border border-[#e8eef6] bg-white p-3">
                    <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm font-extrabold text-[#061226]">默认人数计费</div>
                      <div className="text-xs font-semibold text-[#64748b]">按单节课计费，不按小时相乘；添加课程档案后可单独微调。</div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-[#64748b]">最少人数</label>
                        <Input
                          type="number"
                          min={0}
                          value={tier.minStudents}
                          onChange={(event) => updateCourseTypeClassFeeTier(type, tier.id, { minStudents: Math.max(Number(event.target.value), 0) })}
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
                            onChange={(event) => updateCourseTypeClassFeeTier(type, tier.id, { baseFee: Math.max(Number(event.target.value), 0) })}
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
                            onChange={(event) => updateCourseTypeClassFeeTier(type, tier.id, { perStudentFee: Math.max(Number(event.target.value), 0) })}
                            className="h-9 bg-white"
                          />
                        </SensitiveAmountField>
                      </div>
                    </div>
                  </div>
                  ) : type === "trial" ? (
                  <div className="rounded-[12px] border border-[#e8eef6] bg-white p-3">
                    <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm font-extrabold text-[#061226]">默认单次费用</div>
                      <div className="text-xs font-semibold text-[#64748b]">新建试听课程时自动带入，不按小时相乘。</div>
                    </div>
                    <SensitiveAmountField visible={amountsVisible} className="h-9">
                      <Input
                        type="number"
                        min={0}
                        value={fixedFeeForRule(rule)}
                        onChange={(event) => updateCourseTypeFixedRule(type, Math.max(Number(event.target.value), 0))}
                        className="h-9 bg-white"
                      />
                    </SensitiveAmountField>
                  </div>
                  ) : (
                  <div className="rounded-[12px] border border-[#e8eef6] bg-white p-3">
                    <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm font-extrabold text-[#061226]">默认每小时费用</div>
                      <div className="text-xs font-semibold text-[#64748b]">新建该班型课程时自动带入，默认值为 0。</div>
                    </div>
                    <SensitiveAmountField visible={amountsVisible} className="h-9">
                      <Input
                        type="number"
                        min={0}
                        value={rule.hourlyRate ?? 0}
                        onChange={(event) => updateCourseTypeHourlyRule(type, Math.max(Number(event.target.value), 0))}
                        className="h-9 bg-white"
                      />
                    </SensitiveAmountField>
                  </div>
                  )}
                </div>
              );
            })}
            {deletedBuiltInCourseTypes.length > 0 && (
              <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-white p-3">
                <div className="mb-2 text-xs font-extrabold text-[#64748b]">已删除内置班型</div>
                <div className="flex flex-wrap gap-2">
                  {deletedBuiltInCourseTypes.map((typeOption) => (
                    <Button
                      key={typeOption.value}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 bg-[#f8fbff] text-xs"
                      onClick={() => onRestoreCourseType(typeOption.value)}
                    >
                      恢复 {typeOption.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {managedCourseTypes.length === 0 && (
              <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-5 text-center text-sm font-semibold text-[#64748b]">
                暂无可配置班型，可以先添加自定义班型。
              </div>
            )}
          </CardContent>
        </Card>
        </div>
        )}

        {archivePanel === "students" && (
        <Card className="h-fit overflow-hidden">
          <CardHeader className="gap-3">
            <div className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-[#ff8617]" />
                <CardTitle className="text-lg">学生列表</CardTitle>
              </div>
              <Badge variant="secondary">
                {visibleStudents.length} / {vault.students.length} 人
                {studentStatusFilter !== "all" ? ` · ${studentStatusFilter === "archived" ? "已归档" : "在读"}` : ""}
              </Badge>
            </div>
            <form onSubmit={addStudent} className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              <Input
                value={studentNameInput}
                onChange={(e) => setStudentNameInput(e.target.value)}
                placeholder="例如：学生 E"
              />
              <Select value={studentGradeInput} onChange={(e) => setStudentGradeInput(e.target.value)}>
                {gradeOptions.map((grade) => (
                  <option key={grade} value={grade === "未设置年级" ? "" : grade}>{grade}</option>
                ))}
              </Select>
              {studentGradeInput === "自定义" && (
                <Input
                  value={customGradeInput}
                  onChange={(e) => setCustomGradeInput(e.target.value)}
                  placeholder="输入自定义年级"
                />
              )}
              <Input
                value={studentSchoolInput}
                onChange={(e) => setStudentSchoolInput(e.target.value)}
                placeholder="所在学校，例如：实验中学"
              />
              <Select value={studentCampusInput} onChange={(e) => setStudentCampusInput(e.target.value)}>
                <option value="">未设置校区</option>
                {campusOptions.map((campus) => (
                  <option key={campus.id} value={campus.id}>{campus.name}</option>
                ))}
              </Select>
              <Input
                value={studentNoteInput}
                onChange={(e) => setStudentNoteInput(e.target.value)}
                placeholder="档案备注，可选"
              />
              <label className="flex min-h-11 items-center gap-3 rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2 text-sm font-bold text-[#25324a]">
                <input
                  type="checkbox"
                  checked={studentTemporaryTrialInput}
                  onChange={(event) => setStudentTemporaryTrialInput(event.target.checked)}
                  className="h-4 w-4 accent-[#ff8617]"
                />
                临时试听学生
              </label>
              <Button type="submit">
                <Plus size={15} /> 添加学生
              </Button>
            </form>
            <label className="relative block">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
              <Input className="h-10 pl-9" value={archiveSearch} onChange={(event) => setArchiveSearch(event.target.value)} placeholder="搜索学生姓名、学校或备注" />
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
              <Select value={studentStatusFilter} onChange={(event) => setStudentStatusFilter(event.target.value as "active" | "archived" | "all")} className="h-10">
                <option value="active">在读学生</option>
                <option value="archived">已归档学生</option>
                <option value="all">全部学生</option>
              </Select>
              <Select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)} className="h-10">
                <option value="all">全部年级</option>
                {hasUnsetGradeFilterOption && <option value="__unset">未设置年级</option>}
                {gradeFilterOptions.map((grade) => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </Select>
              <Select value={studentCampusFilter} onChange={(event) => setStudentCampusFilter(event.target.value)} className="h-10">
                <option value="all">全部校区</option>
                {campusOptions.map((campus) => (
                  <option key={campus.id} value={campus.id}>{campus.name}</option>
                ))}
              </Select>
              <Select value={studentCourseTypeFilter} onChange={(event) => setStudentCourseTypeFilter(event.target.value as "all" | CourseType)} className="h-10">
                <option value="all">全部班型</option>
                {courseTypeOptions.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </Select>
              <Select value={studentSubjectFilter} onChange={(event) => setStudentSubjectFilter(event.target.value)} className="h-10">
                <option value="all">全部科目</option>
                {subjectFilterOptions.map((subject) => (
                  <option key={subject} value={subject}>{subject}</option>
                ))}
              </Select>
            </div>
          </CardHeader>
          <CardContent className="max-h-[520px] space-y-0 overflow-y-auto pr-2">
            {visibleStudents.map((student) => {
              const used = studentInUse(student.id);
              const archived = student.status === "paused";
              return (
                <motion.div
                  key={student.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`${archiveRowClass("students", student.id)} cursor-pointer transition-colors hover:bg-[#f8fbff]`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openStudentEditor(student)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openStudentEditor(student);
                    }
                  }}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fff1e2]">
                          <span className="text-xs font-bold text-[#ff8617]">{student.name.slice(0, 1)}</span>
                        </div>
                        <div className="min-w-0">
                          <span className="block truncate text-sm font-medium">{student.name}</span>
                          <div className="mt-1 flex flex-wrap gap-1 text-xs text-(--color-muted-foreground)">
                            <span className="flex items-center gap-1"><MapPin size={10} /> {campusName(vault, student.defaultCampusId)}</span>
                            <span>{student.grade || "未设置年级"}</span>
                            <span>{student.school || "未填写学校"}</span>
                            {student.temporaryTrial && <span className="font-bold text-[#5161d6]">临时试听</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                        <Badge variant={archived ? "secondary" : "sage"}>
                          {archived ? "已归档" : "在读"}
                        </Badge>
                        {archived ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 rounded-[9px] border-[#bbf7d0] bg-[#f0fdf4] p-0 text-[#166534] hover:bg-[#dcfce7] hover:text-[#14532d]"
                            title="恢复学生"
                            aria-label={`恢复学生 ${student.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              restoreStudent(student);
                            }}
                          >
                            <RotateCcw size={13} />
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 rounded-[9px] border-[#fed7aa] bg-[#fff7ed] p-0 text-[#9a3412] hover:bg-[#ffedd5] hover:text-[#7c2d12]"
                            title="归档学生"
                            aria-label={`归档学生 ${student.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              requestArchiveStudent(student);
                            }}
                          >
                            <Archive size={13} />
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 rounded-[9px] p-0"
                          title="编辑学生"
                          aria-label={`编辑学生 ${student.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openStudentEditor(student);
                          }}
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="h-8 w-8 rounded-[9px] p-0"
                          disabled={used}
                          title={used ? "已有课程或课时引用，不能直接删除" : "删除学生"}
                          aria-label={`删除学生 ${student.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            confirm({
                              title: `删除学生「${student.name}」？`,
                              description: "已有历史课时建议保留为归档状态，确认删除后将从档案信息移除。",
                              confirmLabel: "删除",
                              tone: "danger",
                              onConfirm: () => onDeleteStudent(student.id)
                            });
                          }}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>
                    {student.note && (
                      <div className="rounded-[12px] border border-[#e8eef6] bg-white px-3 py-2 text-xs font-semibold leading-5 text-[#64748b]">
                        <FileText size={12} className="mr-1 inline" />
                        {student.note}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
            {visibleStudents.length === 0 && (
              <p className="py-8 text-center text-sm text-(--color-muted-foreground)">
                {studentStatusFilter === "archived" ? "还没有已归档学生" : "还没有符合条件的学生"}
              </p>
            )}
          </CardContent>
        </Card>
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
                  placeholder="课程名称"
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

              {courseFeeRule.mode === "class_headcount" ? (
                <div className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-white p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-extrabold text-[#061226]">人数计费模板</div>
                    <div className="text-xs font-semibold text-[#64748b]">
                      当前关联 {courseStudentIds.length} 人，单节预计 {formatPrivateMoney(calculateClassHeadcountFee(courseFeeRule, courseStudentIds.length), amountsVisible)}，不按小时相乘；课时统计按就近半小时归一
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
                    <div className="mt-1 text-xs font-semibold text-[#64748b]">按开始和结束时间自动折算课时费。</div>
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
              )}

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

        <Card className="h-fit overflow-hidden">
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                  <GraduationCap size={14} /> 已添加课程
                </div>
                <CardTitle className="text-lg">课程档案列表</CardTitle>
                <CardDescription>筛选和数量只作用于下方已添加课程。</CardDescription>
              </div>
              <Badge variant="secondary" className="w-fit">{visibleCourses.length} / {vault.courseGroups.length} 个</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="relative block">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
              <Input
                className="h-10 pl-9"
                value={courseSearch}
                onChange={(event) => setCourseSearch(event.target.value)}
                placeholder="搜索课程名称、学科、校区、学生或班型"
              />
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Select value={courseTypeFilter} onChange={(event) => setCourseTypeFilter(event.target.value as "all" | CourseType)} className="h-10">
                <option value="all">全部课程类型</option>
                {courseTypeOptions.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </Select>
              <Select value={courseGradeFilter} onChange={(event) => setCourseGradeFilter(event.target.value)} className="h-10">
                <option value="all">全部年级</option>
                {hasUnsetGradeFilterOption && <option value="__unset">未设置年级</option>}
                {gradeFilterOptions.map((grade) => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </Select>
              <Select value={courseSubjectFilter} onChange={(event) => setCourseSubjectFilter(event.target.value)} className="h-10">
                <option value="all">全部科目</option>
                {subjectFilterOptions.map((subject) => (
                  <option key={subject} value={subject}>{subject}</option>
                ))}
              </Select>
              <Select value={courseCampusFilter} onChange={(event) => setCourseCampusFilter(event.target.value)} className="h-10">
                <option value="all">全部校区</option>
                {campusOptions.map((campus) => (
                  <option key={campus.id} value={campus.id}>{campus.name}</option>
                ))}
              </Select>
          </div>
          <div className="max-h-[520px] space-y-0 overflow-y-auto pr-2">
            {visibleCourses.map((course) => {
              const used = courseInUse(course.id);
              return (
                <motion.div
                  key={course.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`${archiveRowClass("courses", course.id)} cursor-pointer transition-colors hover:bg-[#f8fbff]`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openCourseEditor(course)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openCourseEditor(course);
                    }
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eaf2ff]">
                        <GraduationCap size={16} className="text-[#1557c2]" />
                      </div>
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-medium">{course.name}</span>
                        <span className="text-xs text-(--color-muted-foreground)">
                          {courseTypeLabel(vault, course.type)} · {course.subject} · {studentNames(vault, course.studentIds) || "未关联学生"}
                        </span>
                        <span className="mt-1 block text-xs font-bold text-[#1557c2]">
                          {courseFeeSummary(course)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge variant={course.status === "active" ? "sage" : "secondary"}>
                        {course.status === "active" ? "启用" : "暂停"}
                      </Badge>
                      <span className="mr-1 max-w-[96px] truncate text-xs text-(--color-muted-foreground)" title={campusName(vault, course.defaultCampusId)}>
                        {campusName(vault, course.defaultCampusId)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 rounded-[9px] p-0"
                        title="编辑课程"
                        aria-label={`编辑课程 ${course.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openCourseEditor(course);
                        }}
                      >
                        <Pencil size={13} />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="h-8 w-8 rounded-[9px] p-0"
                        disabled={used}
                        title={used ? "已有课时引用，不能直接删除" : "删除课程"}
                        aria-label={`删除课程 ${course.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          confirm({
                            title: `删除课程「${course.name}」？`,
                            description: "删除课程不会自动清理历史课时。已有引用时建议先暂停课程。",
                            confirmLabel: "删除",
                            tone: "danger",
                            onConfirm: () => onDeleteCourse(course.id)
                          });
                        }}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            {visibleCourses.length === 0 && (
              <p className="py-8 text-center text-sm text-(--color-muted-foreground)">当前筛选下没有课程</p>
            )}
          </div>
          </CardContent>
        </Card>
        </div>
        )}
      </div>

      <AnimatePresence>
        {editingStudent && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-[#061226]/36 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) cancelStudentDraft();
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
                <Button type="button" variant="ghost" size="icon" onClick={cancelStudentDraft} aria-label="关闭学生编辑弹窗">
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
                <Button type="button" onClick={saveStudentDraft} disabled={!editingStudent.name.trim()}>
                  <Save size={14} /> 保存
                </Button>
                <Button type="button" variant="outline" onClick={cancelStudentDraft}>
                  <X size={14} /> 取消
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingCourse && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-[#061226]/36 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) cancelCourseDraft();
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="flex max-h-[90vh] w-full max-w-[920px] flex-col overflow-hidden rounded-[18px] border border-[#dbe4ef] bg-white shadow-[0_28px_80px_rgba(6,18,38,0.24)]"
            >
              <div className="flex items-start justify-between gap-4 border-b border-[#e8eef6] p-5">
                <div className="min-w-0">
                  <div className="text-lg font-extrabold text-[#061226]">编辑课程</div>
                  <div className="mt-1 truncate text-sm font-semibold text-[#64748b]">{editingCourse.name}</div>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={cancelCourseDraft} aria-label="关闭课程编辑弹窗">
                  <X size={17} />
                </Button>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Input
                    value={editingCourse.name}
                    onChange={(event) => updateEditingCourse({ name: event.target.value })}
                    placeholder="课程名称"
                  />
                  <Select value={editingCourse.subject || subjectOptions[0] || "未设置"} onChange={(event) => updateEditingCourse({ subject: event.target.value })}>
                    {subjectOptions.map((subject) => (
                      <option key={subject} value={subject}>{subject}</option>
                    ))}
                  </Select>
                  <Select
                    value={editingCourse.type}
                    onChange={(event) => {
                      const nextType = event.target.value as CourseType;
                      const nextStudentIds = normalizeCourseStudentIds(nextType, editingCourse.studentIds);
                      updateEditingCourse({
                        type: nextType,
                        feeRule: courseTypeDefaultFeeRule(nextType),
                        studentIds: nextStudentIds,
                        defaultCampusId: firstCourseStudentCampus(nextStudentIds) ?? editingCourse.defaultCampusId
                      });
                    }}
                  >
                    {editingCourseTypeOptions.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </Select>
                  <Select
                    value={editingCourse.defaultCampusId ?? ""}
                    onChange={(event) => updateEditingCourse({ defaultCampusId: event.target.value || undefined })}
                  >
                    <option value="">未设置校区</option>
                    {campusOptions.map((campus) => (
                      <option key={campus.id} value={campus.id}>{campus.name}</option>
                    ))}
                  </Select>
                  <Select
                    value={editingCourse.status}
                    onChange={(event) => updateEditingCourse({ status: event.target.value as CourseGroup["status"] })}
                    className="md:col-span-2"
                  >
                    <option value="active">启用</option>
                    <option value="paused">暂停</option>
                  </Select>
                </div>

                {editingCourse.feeRule.mode === "class_headcount" ? (
                  <div className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
                    <div>
                      <div className="text-sm font-extrabold text-[#061226]">人数计费模板</div>
                      <div className="mt-1 text-xs font-semibold text-[#64748b]">
                        当前关联 {editingCourse.studentIds.length} 人，单节预计 {formatPrivateMoney(calculateClassHeadcountFee(editingCourse.feeRule, editingCourse.studentIds.length), amountsVisible)}，不按小时相乘；课时统计按就近半小时归一。
                      </div>
                    </div>
                    {normalizedClassFeeTiers(editingCourse.feeRule).slice(0, 1).map((tier) => (
                      <div key={tier.id} className="grid grid-cols-1 gap-2 rounded-[12px] border border-[#e8eef6] bg-white p-2 sm:grid-cols-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-[#64748b]">最少人数</label>
                          <Input
                            type="number"
                            min={0}
                            value={tier.minStudents}
                            onChange={(event) => updateClassFeeTier(tier.id, { minStudents: Math.max(Number(event.target.value), 0) })}
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-[#64748b]">基础费用</label>
                          <SensitiveAmountField visible={amountsVisible} className="h-9">
                            <Input
                              type="number"
                              min={0}
                              value={tier.baseFee}
                              onChange={(event) => updateClassFeeTier(tier.id, { baseFee: Math.max(Number(event.target.value), 0) })}
                              className="h-9"
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
                              onChange={(event) => updateClassFeeTier(tier.id, { perStudentFee: Math.max(Number(event.target.value), 0) })}
                              className="h-9"
                            />
                          </SensitiveAmountField>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : editingCourse.type === "trial" ? (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#64748b]">试听单次费用</label>
                    <div className="text-xs font-semibold text-[#64748b]">按单次试听计费，不按上课时长相乘。</div>
                    <SensitiveAmountField visible={amountsVisible}>
                      <Input
                        type="number"
                        min={0}
                        value={fixedFeeForRule(editingCourse.feeRule)}
                        onChange={(event) => updateEditingTrialFixedFee(Math.max(Number(event.target.value), 0))}
                        placeholder="试听单次费用"
                      />
                    </SensitiveAmountField>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#64748b]">每小时费用</label>
                    <SensitiveAmountField visible={amountsVisible}>
                      <Input
                        type="number"
                        value={editingCourse.feeRule.hourlyRate ?? 0}
                        onChange={(event) => updateEditingCourseFee({ hourlyRate: Number(event.target.value) })}
                        placeholder="每小时费用"
                      />
                    </SensitiveAmountField>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-medium">
                      关联学生（{editingCourse.studentIds.length} 人）
                      {editingCourse.type === "class" && (
                        <span className="ml-2 text-xs font-bold text-[#64748b]">
                          班课需同年级{firstCourseStudentGrade(editingCourse.studentIds) !== undefined ? `：${firstCourseStudentGrade(editingCourse.studentIds) || "未设置年级"}` : ""}
                        </span>
                      )}
                      {studentLimitForCourseType(editingCourse.type) && editingCourse.type !== "one_on_one" && (
                        <span className="ml-2 text-xs font-bold text-[#64748b]">
                          最多选择 {studentLimitForCourseType(editingCourse.type)} 人
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-[#64748b]">当前显示 {editingCourseStudentOptions.length} 人</span>
                  </div>
                  <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
                      <label className="relative block">
                        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                        <Input
                          className="h-10 bg-white pl-9"
                          value={courseStudentSearch}
                          onChange={(event) => setCourseStudentSearch(event.target.value)}
                          placeholder="搜索学生姓名、学科、校区、年级、学校或备注"
                        />
                      </label>
                      <div className="grid grid-cols-3 rounded-[12px] border border-[#dbe4ef] bg-white p-1">
                        {[
                          { key: "all" as const, label: "全部" },
                          { key: "selected" as const, label: "已关联" },
                          { key: "available" as const, label: "未关联" }
                        ].map((item) => (
                          <button
                            type="button"
                            key={item.key}
                            onClick={() => setCourseStudentScope(item.key)}
                            className={`rounded-[9px] px-2 py-2 text-xs font-bold ${
                              courseStudentScope === item.key ? "bg-[#1557c2] text-white" : "text-[#25324a]"
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Select value={courseStudentGradeFilter} onChange={(event) => setCourseStudentGradeFilter(event.target.value)} className="h-10">
                        <option value="all">全部年级</option>
                        {hasUnsetGradeFilterOption && <option value="__unset">未设置年级</option>}
                        {gradeFilterOptions.map((grade) => (
                          <option key={grade} value={grade}>{grade}</option>
                        ))}
                      </Select>
                      <Select value={courseStudentCampusFilter} onChange={(event) => setCourseStudentCampusFilter(event.target.value)} className="h-10">
                        <option value="all">全部校区</option>
                        {campusOptions.map((campus) => (
                          <option key={campus.id} value={campus.id}>{campus.name}</option>
                        ))}
                      </Select>
                    </div>
                    {editingCourse.studentIds.length > 0 && (
                      <div className="mt-3 max-h-20 overflow-y-auto pr-1">
                        <div className="flex flex-wrap gap-2">
                          {editingCourse.studentIds.map((studentId) => {
                            const student = vault.students.find((item) => item.id === studentId);
                            return (
                              <button
                                type="button"
                                key={studentId}
                                onClick={() => toggleCourseStudent(studentId)}
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
                    <div className="mt-3 max-h-[260px] overflow-y-auto pr-1">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {editingCourseStudentOptions.map((student) => {
                          const isSelected = editingCourse.studentIds.includes(student.id);
                          const selectedGrade = editingCourse.type === "class" ? firstCourseStudentGrade(editingCourse.studentIds) : undefined;
                          const isDifferentGrade = editingCourse.type === "class" && selectedGrade !== undefined && !isSelected && (student.grade ?? "") !== selectedGrade;
                          const isAtStudentLimit = !isSelected && Boolean(studentLimitForCourseType(editingCourse.type)) && editingCourse.studentIds.length >= (studentLimitForCourseType(editingCourse.type) ?? 0);
                          return (
                            <button
                              type="button"
                              key={student.id}
                              onClick={() => toggleCourseStudent(student.id)}
                              disabled={isDifferentGrade || isAtStudentLimit}
                              title={isDifferentGrade ? `班课只能选择 ${selectedGrade} 学生` : isAtStudentLimit ? `最多选择 ${studentLimitForCourseType(editingCourse.type)} 人` : undefined}
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
                              {student.name} · {student.grade || "未设置年级"}{student.status === "paused" ? " · 已归档" : ""}{student.temporaryTrial ? " · 试听" : ""}{isDifferentGrade ? " · 年级不符" : ""}
                            </button>
                          );
                        })}
                      </div>
                      {editingCourseStudentOptions.length === 0 && (
                        <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-white p-5 text-center text-sm font-semibold text-[#64748b]">
                          没有符合条件的学生
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-[#e8eef6] bg-[#f8fbff] p-4">
                <Button type="button" onClick={saveCourseDraft} disabled={!editingCourse.name.trim()}>
                  <Save size={14} /> 保存
                </Button>
                <Button type="button" variant="outline" onClick={cancelCourseDraft}>
                  <X size={14} /> 取消
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

function defaultFeeRuleForCustomTemplate(template: "class" | "hourly"): FeeRule {
  if (template === "hourly") {
    return { mode: "hourly", hourlyRate: 0 };
  }
  return defaultFeeRuleForCourseType("class");
}

function normalizeCourseFeeRuleForType(type: CourseType, feeRule: FeeRule): FeeRule {
  if (type === "trial") {
    return {
      mode: "fixed",
      fixedFee: fixedFeeForRule(feeRule)
    };
  }
  if (feeRule.mode === "class_headcount") {
    return {
      ...feeRule,
      mode: "class_headcount",
      classFeeTiers: [{ ...(normalizedClassFeeTiers(feeRule)[0] ?? defaultClassFeeTiers(feeRule)[0]), maxStudents: undefined }]
    };
  }
  return feeRule;
}

function matchesKeywordSearch(searchable: string, normalizedQuery: string): boolean {
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  return terms.length === 0 || terms.every((term) => searchable.includes(term));
}

function SensitiveAmountField({
  visible,
  children,
  className = "h-10"
}: {
  visible: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (visible) return <>{children}</>;
  return (
    <div className={`flex items-center rounded-[10px] border border-[#dbe4ef] bg-[#f8fbff] px-3 text-sm font-extrabold text-[#64748b] ${className}`}>
      ***
    </div>
  );
}

function matchesGradeFilter(grade: string | undefined, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "__unset") return !grade;
  return grade === filter;
}

function studentOptionLabel(student: Student): string {
  return `${student.name} · ${student.grade || "未设置年级"}`;
}
