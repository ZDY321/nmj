import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Building2, FileText, GraduationCap, MapPin, Pencil, Plus, Save, Search, Settings, Trash2, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Campus, ClassFeeTier, CourseGroup, CourseType, FeeRule, Student, StudentCourseTransition, TeacherProfile, TeacherVault } from "@/shared/types";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { makeId } from "@/frontend/lib/crypto";
import { calculateClassHeadcountFee, defaultClassFeeTiers, normalizedClassFeeTiers } from "@/frontend/lib/calculations";
import { campusName, courseTypeLabels, formatMoney, studentNames } from "@/frontend/lib/helpers";

const fixedGradeOptions = ["初一", "初二", "初三"];
const gradeOptions = ["未设置", ...fixedGradeOptions, "自定义"];
type ArchivePanel = "campuses" | "students" | "courses";

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
  onTransferStudentCourse
}: {
  vault: TeacherVault;
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
  onTransferStudentCourse: (transition: StudentCourseTransition) => void;
}) {
  const [campusNameInput, setCampusNameInput] = useState("");
  const [campusAddressInput, setCampusAddressInput] = useState("");
  const [campusNoteInput, setCampusNoteInput] = useState("");
  const [studentNameInput, setStudentNameInput] = useState("");
  const [studentGradeInput, setStudentGradeInput] = useState("");
  const [customGradeInput, setCustomGradeInput] = useState("");
  const [studentSchoolInput, setStudentSchoolInput] = useState("");
  const [studentTemporaryTrialInput, setStudentTemporaryTrialInput] = useState(false);
  const [studentCampusInput, setStudentCampusInput] = useState(vault.campuses[0]?.id ?? "");
  const [studentNoteInput, setStudentNoteInput] = useState("");
  const [courseNameInput, setCourseNameInput] = useState("");
  const [courseType, setCourseType] = useState<CourseType>("one_on_one");
  const [editingCampus, setEditingCampus] = useState<Campus | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editingCourse, setEditingCourse] = useState<CourseGroup | null>(null);
  const [flashingArchiveItem, setFlashingArchiveItem] = useState<{ panel: ArchivePanel; id: string } | null>(null);
  const [archivePanel, setArchivePanel] = useState<ArchivePanel>("campuses");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [studentCampusFilter, setStudentCampusFilter] = useState("all");
  const [courseTypeFilter, setCourseTypeFilter] = useState<"all" | CourseType>("all");
  const [archiveSearch, setArchiveSearch] = useState("");
  const [courseStudentSearch, setCourseStudentSearch] = useState("");
  const [courseStudentScope, setCourseStudentScope] = useState<"all" | "selected" | "available">("all");
  const [transferStudentId, setTransferStudentId] = useState(vault.students[0]?.id ?? "");
  const [transferCourseType, setTransferCourseType] = useState<CourseType>("trial");
  const [transferTargetMode, setTransferTargetMode] = useState<"new" | "existing">("new");
  const [transferTargetCourseId, setTransferTargetCourseId] = useState("");
  const [transferSubjectInput, setTransferSubjectInput] = useState("");
  const [transferCourseNameInput, setTransferCourseNameInput] = useState("");
  const [transferCampusInput, setTransferCampusInput] = useState(vault.campuses[0]?.id ?? "");
  const [transferEndExisting, setTransferEndExisting] = useState(false);
  const [transferMessage, setTransferMessage] = useState("");
  const { confirm, dialog } = useConfirmDialog();
  const normalizedArchiveSearch = archiveSearch.trim().toLowerCase();
  const normalizedCourseStudentSearch = courseStudentSearch.trim().toLowerCase();
  const visibleStudents = vault.students.filter((student) => {
    const matchesGrade = gradeFilter === "all" || (student.grade || "") === gradeFilter;
    const matchesCampus = studentCampusFilter === "all" || student.defaultCampusId === studentCampusFilter;
    const matchesSearch =
      !normalizedArchiveSearch ||
      student.name.toLowerCase().includes(normalizedArchiveSearch) ||
      (student.school ?? "").toLowerCase().includes(normalizedArchiveSearch) ||
      (student.note ?? "").toLowerCase().includes(normalizedArchiveSearch);
    return matchesGrade && matchesCampus && matchesSearch;
  });
  const gradeFilterOptions = Array.from(new Set(vault.students.map((student) => student.grade).filter(Boolean) as string[]));
  const visibleCourses = vault.courseGroups.filter((course) => courseTypeFilter === "all" || course.type === courseTypeFilter);
  const activeStudents = vault.students.filter((student) => student.status === "active").length;
  const activeCourses = vault.courseGroups.filter((course) => course.status === "active").length;
  const obligationCampusId = vault.profile.obligationCampusId ?? "";
  const obligationMode = vault.profile.obligationDeductionMode ?? "auto_gap";
  const isManualObligationMode = obligationMode === "manual";
  const obligationCourses = vault.courseGroups.filter((course) => !obligationCampusId || course.defaultCampusId === obligationCampusId);
  const transferStudent = vault.students.find((student) => student.id === transferStudentId);
  const transferCurrentCourses = transferStudent
    ? vault.courseGroups.filter((course) => course.status === "active" && course.studentIds.includes(transferStudent.id))
    : [];
  const transferSubject = transferSubjectInput.trim() || transferCurrentCourses[0]?.subject || "未设置";
  const transferTargetCourses = transferStudent
    ? vault.courseGroups.filter(
        (course) =>
          course.status === "active" &&
          course.type === transferCourseType &&
          !course.studentIds.includes(transferStudent.id) &&
          canJoinCourse(vault, course, transferStudent)
      )
    : [];
  const transferTargetCourseIds = transferTargetCourses.map((course) => course.id).join("|");

  useEffect(() => {
    setTransferStudentId((current) =>
      vault.students.some((student) => student.id === current) ? current : vault.students[0]?.id ?? ""
    );
  }, [vault.students]);

  useEffect(() => {
    setTransferCampusInput((current) =>
      current && vault.campuses.some((campus) => campus.id === current) ? current : vault.campuses[0]?.id ?? ""
    );
  }, [vault.campuses]);

  useEffect(() => {
    setTransferTargetCourseId((current) =>
      transferTargetCourses.some((course) => course.id === current) ? current : transferTargetCourses[0]?.id ?? ""
    );
  }, [transferTargetCourseIds]);

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
    if (!studentNameInput.trim()) return;
    const resolvedGrade = studentGradeInput === "自定义" ? customGradeInput.trim() : studentGradeInput;
    onAddStudent({
      id: makeId("student"),
      name: studentNameInput.trim(),
      grade: resolvedGrade || undefined,
      school: studentSchoolInput.trim() || undefined,
      temporaryTrial: studentTemporaryTrialInput,
      defaultCampusId: studentCampusInput || vault.campuses[0]?.id,
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
    if (!courseNameInput.trim()) return;
    onAddCourse({
      id: makeId("course"),
      name: courseNameInput.trim(),
      type: courseType,
      subject: "未设置",
      defaultCampusId: vault.campuses[0]?.id,
      studentIds: [],
      feeRule: defaultFeeRule(courseType),
      status: "active"
    });
    setCourseNameInput("");
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

    const nextCourseName = transferCourseNameInput.trim() || `${transferStudent.name}${courseTypeLabels[transferCourseType]}`;
    const nextCourse: CourseGroup = {
      id: makeId("course"),
      name: nextCourseName,
      type: transferCourseType,
      subject: transferSubject,
      defaultCampusId: transferCampusInput || transferStudent.defaultCampusId || vault.campuses[0]?.id,
      studentIds: [transferStudent.id],
      feeRule: defaultFeeRule(transferCourseType),
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

  function updateEditingCourse(patch: Partial<CourseGroup>) {
    setEditingCourse((current) => (current ? { ...current, ...patch } : current));
  }

  function updateEditingCourseFee(patch: Partial<CourseGroup["feeRule"]>) {
    setEditingCourse((current) =>
      current ? { ...current, feeRule: { ...current.feeRule, ...patch } } : current
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
    setEditingCourse(course);
    setCourseStudentSearch("");
    setCourseStudentScope("all");
  }

  function updateProfile(patch: Partial<TeacherProfile>) {
    onUpdateProfile({
      ...vault.profile,
      ...patch
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
      if (current.type === "class" && !isSelected) {
        const selectedGrade = firstCourseStudentGrade(current.studentIds);
        if (selectedGrade !== undefined && (student?.grade ?? "") !== selectedGrade) {
          return current;
        }
      }
      const studentIds = current.studentIds.includes(studentId)
        ? current.studentIds.filter((id) => id !== studentId)
        : [...current.studentIds, studentId];
      return { ...current, studentIds };
    });
  }

  function firstCourseStudentGrade(studentIds: string[]): string | undefined {
    if (studentIds.length === 0) return undefined;
    return vault.students.find((student) => student.id === studentIds[0])?.grade ?? "";
  }

  function saveCourseDraft() {
    if (!editingCourse?.name.trim()) return;
    const courseId = editingCourse.id;
    const feeRule = editingCourse.type === "class"
      ? {
          ...editingCourse.feeRule,
          mode: "class_headcount" as const,
          classFeeTiers: [{ ...(normalizedClassFeeTiers(editingCourse.feeRule)[0] ?? defaultClassFeeTiers(editingCourse.feeRule)[0]), maxStudents: undefined }]
        }
      : editingCourse.feeRule;
    onUpdateCourse({
      ...editingCourse,
      name: editingCourse.name.trim(),
      subject: editingCourse.subject.trim() || "未设置",
      feeRule
    });
    setEditingCourse(null);
    setCourseStudentSearch("");
    setCourseStudentScope("all");
    flashArchiveRow("courses", courseId);
  }

  function cancelCourseDraft() {
    if (editingCourse) {
      flashArchiveRow("courses", editingCourse.id);
    }
    setEditingCourse(null);
    setCourseStudentSearch("");
    setCourseStudentScope("all");
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
          { label: "档案信息", value: `${vault.students.length} 人`, hint: `正常学生 ${activeStudents} 人`, icon: Users },
          { label: "校区", value: `${vault.campuses.length} 个`, hint: "教学地点", icon: Building2 },
          { label: "课程/班课", value: `${vault.courseGroups.length} 个`, hint: `启用 ${activeCourses} 个`, icon: GraduationCap }
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

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
            <Settings size={14} /> 个人与义务课时设置
          </div>
          <CardTitle>老师个人信息</CardTitle>
          <CardDescription>校区归属和义务课时扣费会用于月底工资核对。</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">显示姓名</label>
            <Input value={vault.profile.displayName} onChange={(event) => updateProfile({ displayName: event.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">所在校区</label>
            <Select value={vault.profile.homeCampusId ?? ""} onChange={(event) => updateProfile({ homeCampusId: event.target.value || undefined })}>
              <option value="">未设置</option>
              {vault.campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>{campus.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">义务课时扣费校区</label>
            <Select
              value={vault.profile.obligationCampusId ?? ""}
              onChange={(event) =>
                updateProfile({
                  obligationCampusId: event.target.value || undefined,
                  obligationCourseGroupId: undefined
                })
              }
            >
              <option value="">不扣义务课时</option>
              {vault.campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>{campus.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">扣费方式</label>
            <Select
              value={obligationMode}
              onChange={(event) => updateProfile({ obligationDeductionMode: event.target.value as TeacherProfile["obligationDeductionMode"] })}
            >
              <option value="auto_gap">按缺少义务小时自动扣</option>
              <option value="manual">手动填写扣除金额</option>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">对应班级 / 课程</label>
            <Select
              value={vault.profile.obligationCourseGroupId ?? ""}
              onChange={(event) => updateProfile({ obligationCourseGroupId: event.target.value || undefined })}
            >
              <option value="">扣费校区全部课程</option>
              {obligationCourses.map((course) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">每月义务小时</label>
            <Input
              type="number"
              value={vault.profile.monthlyObligationHours ?? 0}
              onChange={(event) => updateProfile({ monthlyObligationHours: Number(event.target.value) })}
              disabled={isManualObligationMode}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">每小时扣费</label>
            <Input
              type="number"
              value={vault.profile.obligationHourlyDeduction ?? 0}
              onChange={(event) => updateProfile({ obligationHourlyDeduction: Number(event.target.value) })}
              disabled={isManualObligationMode}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">手动扣除金额</label>
            <Input
              type="number"
              value={vault.profile.manualObligationDeduction ?? 0}
              onChange={(event) => updateProfile({ manualObligationDeduction: Number(event.target.value) })}
              disabled={(vault.profile.obligationDeductionMode ?? "auto_gap") !== "manual"}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">联系方式</label>
            <Input value={vault.profile.phone ?? ""} onChange={(event) => updateProfile({ phone: event.target.value })} placeholder="手机号 / 微信" />
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
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 rounded-[16px] border border-[#dbe4ef] bg-white p-1">
          {[
            { key: "campuses" as ArchivePanel, label: "校区列表" },
            { key: "students" as ArchivePanel, label: "学生列表" },
            { key: "courses" as ArchivePanel, label: "课程与班课" }
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setArchivePanel(item.key)}
              className={`rounded-[12px] px-3 py-2 text-sm font-extrabold transition-colors ${
                archivePanel === item.key ? "bg-[#1557c2] text-white" : "text-[#25324a] hover:bg-[#f8fbff]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="rounded-[10px] border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-xs font-semibold leading-5 text-[#9a3412]">
          删除限制：已有学生、课程或历史课时引用的数据不能直接删除，建议将对应的引用数据全部删除或改为暂停状态。
        </div>
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
                <Badge variant="sky" className="w-fit">{transferCurrentCourses.length} 个当前课程</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={applyStudentCourseTransfer} className="space-y-4">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">学生</label>
                    <Select value={transferStudentId} onChange={(event) => setTransferStudentId(event.target.value)}>
                      {vault.students.map((student) => (
                        <option key={student.id} value={student.id}>{student.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">新班型</label>
                    <Select value={transferCourseType} onChange={(event) => setTransferCourseType(event.target.value as CourseType)}>
                      <option value="trial">试听</option>
                      <option value="class">班课</option>
                      <option value="one_on_one">一对一</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">科目</label>
                    <Input
                      value={transferSubjectInput}
                      onChange={(event) => setTransferSubjectInput(event.target.value)}
                      placeholder={transferCurrentCourses[0]?.subject || "未设置"}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">处理方式</label>
                    <div className="grid grid-cols-2 rounded-[12px] border border-[#dbe4ef] bg-white p-1">
                      {[
                        { key: "new" as const, label: "新建课程" },
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
                        placeholder={transferStudent ? `${transferStudent.name}${courseTypeLabels[transferCourseType]}` : "新课程名称"}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">默认校区</label>
                      <Select value={transferCampusInput} onChange={(event) => setTransferCampusInput(event.target.value)}>
                        <option value="">未设置校区</option>
                        {vault.campuses.map((campus) => (
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
                        当前没有可加入的同班型课程，可以切换为新建课程。
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-[#061226]">当前课程</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {transferCurrentCourses.length > 0 ? transferCurrentCourses.map((course) => (
                        <Badge key={course.id} variant={course.type === "class" ? "sky" : course.type === "trial" ? "plum" : "sage"}>
                          {course.name} · {courseTypeLabels[course.type]}
                        </Badge>
                      )) : (
                        <Badge variant="secondary">暂无当前课程</Badge>
                      )}
                    </div>
                  </div>
                  <label className="flex shrink-0 items-center gap-3 rounded-[12px] border border-[#dbe4ef] bg-white px-3 py-2 text-sm font-bold text-[#25324a]">
                    <input
                      type="checkbox"
                      checked={transferEndExisting}
                      onChange={(event) => setTransferEndExisting(event.target.checked)}
                      className="h-4 w-4 accent-[#ff8617]"
                    />
                    转班后从旧同科目课程中移除该学生
                  </label>
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
          </Card>
        )}
        {archivePanel === "campuses" && (
        <Card className="h-fit overflow-hidden">
          <CardHeader className="gap-3">
            <div className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-[#ff8617]" />
                <CardTitle className="text-lg">校区列表</CardTitle>
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
            {vault.campuses.map((campus) => {
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
                              description: "删除后无法从校区列表中恢复。",
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
        )}

        {archivePanel === "students" && (
        <Card className="h-fit overflow-hidden">
          <CardHeader className="gap-3">
            <div className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-[#ff8617]" />
                <CardTitle className="text-lg">学生列表</CardTitle>
              </div>
              <Badge variant="secondary">{visibleStudents.length} / {vault.students.length} 人</Badge>
            </div>
            <form onSubmit={addStudent} className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              <Input
                value={studentNameInput}
                onChange={(e) => setStudentNameInput(e.target.value)}
                placeholder="例如：学生 E"
              />
              <Select value={studentGradeInput} onChange={(e) => setStudentGradeInput(e.target.value)}>
                {gradeOptions.map((grade) => (
                  <option key={grade} value={grade === "未设置" ? "" : grade}>{grade}</option>
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
                {vault.campuses.map((campus) => (
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
            <div className="grid grid-cols-2 gap-2">
              <Select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)} className="h-10">
                <option value="all">全部年级</option>
                {gradeFilterOptions.map((grade) => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </Select>
              <Select value={studentCampusFilter} onChange={(event) => setStudentCampusFilter(event.target.value)} className="h-10">
                <option value="all">全部校区</option>
                {vault.campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>{campus.name}</option>
                ))}
              </Select>
            </div>
          </CardHeader>
          <CardContent className="max-h-[520px] space-y-0 overflow-y-auto pr-2">
            {visibleStudents.map((student) => {
              const isEditing = editingStudent?.id === student.id;
              const used = studentInUse(student.id);
              return (
                <motion.div
                  key={student.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={archiveRowClass("students", student.id)}
                >
                  {isEditing && editingStudent ? (
                    <div className="space-y-3">
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
                          <option key={grade} value={grade === "未设置" ? "" : grade}>{grade}</option>
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
                        {vault.campuses.map((campus) => (
                          <option key={campus.id} value={campus.id}>{campus.name}</option>
                        ))}
                      </Select>
                      <Select
                        value={editingStudent.status}
                        onChange={(event) => setEditingStudent({ ...editingStudent, status: event.target.value as Student["status"] })}
                      >
                        <option value="active">正常</option>
                        <option value="paused">暂停</option>
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
                        className="min-h-[76px]"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" size="sm" onClick={() => {
                          if (!editingStudent.name.trim()) return;
                          const studentId = editingStudent.id;
                          onUpdateStudent({
                            ...editingStudent,
                            name: editingStudent.name.trim(),
                            grade: editingStudent.grade === "__custom__" ? undefined : editingStudent.grade
                          });
                          setEditingStudent(null);
                          flashArchiveRow("students", studentId);
                        }}>
                          <Save size={14} /> 保存
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => {
                          flashArchiveRow("students", editingStudent.id);
                          setEditingStudent(null);
                        }}>
                          <X size={14} /> 取消
                        </Button>
                      </div>
                    </div>
                  ) : (
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
                          <Badge variant={student.status === "active" ? "sage" : "secondary"}>
                            {student.status === "active" ? "正常" : "暂停"}
                          </Badge>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 rounded-[9px] p-0"
                            title="编辑学生"
                            aria-label={`编辑学生 ${student.name}`}
                            onClick={() => setEditingStudent(student)}
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
                            onClick={() =>
                              confirm({
                                title: `删除学生「${student.name}」？`,
                                description: "已有历史课时建议保留为暂停状态，确认删除后将从档案信息移除。",
                                confirmLabel: "删除",
                                tone: "danger",
                                onConfirm: () => onDeleteStudent(student.id)
                              })
                            }
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
                  )}
                </motion.div>
              );
            })}
            {visibleStudents.length === 0 && (
              <p className="py-8 text-center text-sm text-(--color-muted-foreground)">还没有学生</p>
            )}
          </CardContent>
        </Card>
        )}

        {archivePanel === "courses" && (
        <Card className="h-fit overflow-hidden">
          <CardHeader className="gap-3">
            <div className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <GraduationCap size={18} className="text-[#ff8617]" />
                <CardTitle className="text-lg">课程与班课</CardTitle>
              </div>
              <Badge variant="secondary">{visibleCourses.length} / {vault.courseGroups.length} 个</Badge>
            </div>
            <form onSubmit={addCourse} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_160px_auto]">
              <Input
                value={courseNameInput}
                onChange={(e) => setCourseNameInput(e.target.value)}
                placeholder="例如：初三数学班"
              />
              <Select
                value={courseType}
                onChange={(e) => setCourseType(e.target.value as CourseType)}
              >
                <option value="one_on_one">一对一</option>
                <option value="class">班课</option>
                <option value="trial">试听</option>
              </Select>
              <Button type="submit">
                <Plus size={15} /> 添加课程
              </Button>
            </form>
            <Select value={courseTypeFilter} onChange={(event) => setCourseTypeFilter(event.target.value as "all" | CourseType)} className="h-10">
              <option value="all">全部课程类型</option>
              <option value="one_on_one">一对一</option>
              <option value="class">班课</option>
              <option value="trial">试听</option>
            </Select>
          </CardHeader>
          <CardContent className="max-h-[520px] space-y-0 overflow-y-auto pr-2">
            {visibleCourses.map((course) => {
              const isEditing = editingCourse?.id === course.id;
              const used = courseInUse(course.id);
              const courseStudentOptions = isEditing && editingCourse
                ? vault.students.filter((student) => {
                    const isSelected = editingCourse.studentIds.includes(student.id);
                    const matchesScope =
                      courseStudentScope === "all" ||
                      (courseStudentScope === "selected" ? isSelected : !isSelected);
                    const searchable = [
                      student.name,
                      student.grade ?? "",
                      student.school ?? "",
                      student.note ?? "",
                      student.temporaryTrial ? "试听 临时试听" : ""
                    ].join(" ").toLowerCase();
                    const matchesSearch = !normalizedCourseStudentSearch || searchable.includes(normalizedCourseStudentSearch);
                    return matchesScope && matchesSearch;
                  })
                : [];
              return (
                <motion.div
                  key={course.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={archiveRowClass("courses", course.id)}
                >
                  {isEditing && editingCourse ? (
                    <div className="space-y-3">
                      <Input
                        value={editingCourse.name}
                        onChange={(event) => updateEditingCourse({ name: event.target.value })}
                        placeholder="课程名称"
                      />
                      <Input
                        value={editingCourse.subject}
                        onChange={(event) => updateEditingCourse({ subject: event.target.value })}
                        placeholder="科目"
                      />
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Select
                          value={editingCourse.type}
                          onChange={(event) => {
                            const nextType = event.target.value as CourseType;
                            updateEditingCourse({
                              type: nextType,
                              feeRule: defaultFeeRule(nextType)
                            });
                          }}
                        >
                          <option value="one_on_one">一对一</option>
                          <option value="class">班课</option>
                          <option value="trial">试听</option>
                        </Select>
                        <Select
                          value={editingCourse.defaultCampusId ?? ""}
                          onChange={(event) => updateEditingCourse({ defaultCampusId: event.target.value || undefined })}
                        >
                          <option value="">未设置校区</option>
                          {vault.campuses.map((campus) => (
                            <option key={campus.id} value={campus.id}>{campus.name}</option>
                          ))}
                        </Select>
                      </div>
                      <Select
                        value={editingCourse.status}
                        onChange={(event) => updateEditingCourse({ status: event.target.value as CourseGroup["status"] })}
                      >
                        <option value="active">启用</option>
                        <option value="paused">暂停</option>
                      </Select>
                      {editingCourse.type === "class" ? (
                        <div className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
                          <div>
                            <div className="text-sm font-extrabold text-[#061226]">班课人数计费</div>
                            <div className="mt-1 text-xs font-semibold text-[#64748b]">
                              当前关联 {editingCourse.studentIds.length} 人，预计 {formatMoney(calculateClassHeadcountFee(editingCourse.feeRule, editingCourse.studentIds.length))}
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
                                <Input
                                  type="number"
                                  min={0}
                                  value={tier.baseFee}
                                  onChange={(event) => updateClassFeeTier(tier.id, { baseFee: Math.max(Number(event.target.value), 0) })}
                                  className="h-9"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[11px] font-bold text-[#64748b]">每增加一人</label>
                                <Input
                                  type="number"
                                  min={0}
                                  value={tier.perStudentFee ?? 0}
                                  onChange={(event) => updateClassFeeTier(tier.id, { perStudentFee: Math.max(Number(event.target.value), 0) })}
                                  className="h-9"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-[#64748b]">
                            {editingCourse.type === "trial" ? "试听每小时费用" : "每小时费用"}
                          </label>
                          <Input
                            type="number"
                            value={editingCourse.feeRule.hourlyRate ?? 0}
                            onChange={(event) => updateEditingCourseFee({ hourlyRate: Number(event.target.value) })}
                            placeholder={editingCourse.type === "trial" ? "试听每小时费用" : "每小时费用"}
                          />
                        </div>
                      )}
                      <div className="space-y-2">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-sm font-medium">
                            关联学生（{editingCourse.studentIds.length} / {vault.students.length}）
                            {editingCourse.type === "class" && (
                              <span className="ml-2 text-xs font-bold text-[#64748b]">
                                班课需同年级{firstCourseStudentGrade(editingCourse.studentIds) !== undefined ? `：${firstCourseStudentGrade(editingCourse.studentIds) || "未设置年级"}` : ""}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-bold text-[#64748b]">当前显示 {courseStudentOptions.length} 人</span>
                        </div>
                        <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
                          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
                            <label className="relative block">
                              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                              <Input
                                className="h-10 pl-9"
                                value={courseStudentSearch}
                                onChange={(event) => setCourseStudentSearch(event.target.value)}
                                placeholder="搜索学生姓名、年级、学校或备注"
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
                              {courseStudentOptions.map((student) => {
                                const isSelected = editingCourse.studentIds.includes(student.id);
                                const selectedGrade = editingCourse.type === "class" ? firstCourseStudentGrade(editingCourse.studentIds) : undefined;
                                const isDifferentGrade = editingCourse.type === "class" && selectedGrade !== undefined && !isSelected && (student.grade ?? "") !== selectedGrade;
                                return (
                                  <button
                                    type="button"
                                    key={student.id}
                                    onClick={() => toggleCourseStudent(student.id)}
                                    disabled={isDifferentGrade}
                                    title={isDifferentGrade ? `班课只能选择 ${selectedGrade} 学生` : undefined}
                                    className={`rounded-[10px] border px-3 py-2 text-left text-xs font-bold ${
                                      isSelected
                                        ? "border-[#ff8617] bg-[#fff7ed] text-[#9a3412]"
                                        : isDifferentGrade
                                          ? "cursor-not-allowed border-[#e2e8f0] bg-white text-[#94a3b8]"
                                          : student.temporaryTrial
                                            ? "border-[#c7d2fe] bg-[#eef0ff] text-[#5161d6]"
                                            : "border-[#dbe4ef] bg-white text-[#25324a]"
                                    }`}
                                  >
                                    {student.name}{student.grade ? ` · ${student.grade}` : ""}{student.temporaryTrial ? " · 试听" : ""}{isDifferentGrade ? " · 年级不符" : ""}
                                  </button>
                                );
                              })}
                            </div>
                            {courseStudentOptions.length === 0 && (
                              <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-white p-5 text-center text-sm font-semibold text-[#64748b]">
                                没有符合条件的学生
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" size="sm" onClick={saveCourseDraft}>
                          <Save size={14} /> 保存
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={cancelCourseDraft}>
                          <X size={14} /> 取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eaf2ff]">
                          <GraduationCap size={16} className="text-[#1557c2]" />
                        </div>
                        <div className="min-w-0">
                          <span className="block truncate text-sm font-medium">{course.name}</span>
                          <span className="text-xs text-(--color-muted-foreground)">
                            {courseTypeLabels[course.type]} · {studentNames(vault, course.studentIds) || "未关联学生"}
                          </span>
                          {course.type === "class" && (
                            <span className="mt-1 block text-xs font-bold text-[#1557c2]">
                              当前 {course.studentIds.length} 人预估：{formatMoney(calculateClassHeadcountFee(course.feeRule, course.studentIds.length))}
                            </span>
                          )}
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
                          onClick={() => openCourseEditor(course)}
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
                          onClick={() =>
                            confirm({
                              title: `删除课程「${course.name}」？`,
                              description: "删除课程不会自动清理历史课时。已有引用时建议先暂停课程。",
                              confirmLabel: "删除",
                              tone: "danger",
                              onConfirm: () => onDeleteCourse(course.id)
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
            {visibleCourses.length === 0 && (
              <p className="py-8 text-center text-sm text-(--color-muted-foreground)">当前筛选下没有课程</p>
            )}
          </CardContent>
        </Card>
        )}
      </div>

    </div>
  );
}

function canJoinCourse(vault: TeacherVault, course: CourseGroup, student: Student): boolean {
  if (course.type !== "class" || course.studentIds.length === 0) return true;
  const existingGrade = vault.students.find((item) => item.id === course.studentIds[0])?.grade ?? "";
  return existingGrade === (student.grade ?? "");
}

function defaultFeeRule(type: CourseType): FeeRule {
  if (type === "class") {
    const baseFee = 80;
    const perPresentStudentFee = 10;
    return {
      mode: "class_headcount",
      baseFee,
      perPresentStudentFee,
      classFeeTiers: defaultClassFeeTiers({ mode: "class_headcount", baseFee, perPresentStudentFee }),
      makeupFeeMode: "perStudentFee"
    };
  }
  return { mode: "hourly", hourlyRate: type === "trial" ? 0 : 200 };
}
