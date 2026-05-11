import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Building2, CalendarCheck, FileText, GraduationCap, MapPin, Pencil, Plus, Save, Search, Settings, Trash2, User, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Campus, CourseGroup, CourseType, FeeRule, Student, TeacherProfile, TeacherVault } from "@/shared/types";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { makeId } from "@/frontend/lib/crypto";
import { campusName, courseName, courseTypeLabels, studentNames, weekdayLabels } from "@/frontend/lib/helpers";

const fixedGradeOptions = ["初一", "初二", "初三"];
const gradeOptions = ["未设置", ...fixedGradeOptions, "自定义"];

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
  onDeleteCourse
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
}) {
  const [campusNameInput, setCampusNameInput] = useState("");
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
  const [gradeFilter, setGradeFilter] = useState("all");
  const [studentCampusFilter, setStudentCampusFilter] = useState("all");
  const [archiveSearch, setArchiveSearch] = useState("");
  const { confirm, dialog } = useConfirmDialog();
  const normalizedArchiveSearch = archiveSearch.trim().toLowerCase();
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
  const activeStudents = vault.students.filter((student) => student.status === "active").length;
  const activeCourses = vault.courseGroups.filter((course) => course.status === "active").length;
  const scheduleRuleCount = vault.scheduleRules.length;
  const obligationCampusId = vault.profile.obligationCampusId ?? "";
  const obligationCourses = vault.courseGroups.filter((course) => !obligationCampusId || course.defaultCampusId === obligationCampusId);

  function addCampus(e: FormEvent) {
    e.preventDefault();
    if (!campusNameInput.trim()) return;
    onAddCampus({ id: makeId("campus"), name: campusNameInput.trim() });
    setCampusNameInput("");
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
    const firstStudent = vault.students[0]?.id;
    onAddCourse({
      id: makeId("course"),
      name: courseNameInput.trim(),
      type: courseType,
      subject: "未设置",
      defaultCampusId: vault.campuses[0]?.id,
      studentIds: firstStudent ? [firstStudent] : [],
      feeRule: defaultFeeRule(courseType),
      status: "active"
    });
    setCourseNameInput("");
  }

  function campusInUse(campusId: string): boolean {
    return (
      vault.students.some((student) => student.defaultCampusId === campusId) ||
      vault.courseGroups.some((course) => course.defaultCampusId === campusId) ||
      vault.scheduleRules.some((rule) => rule.campusId === campusId) ||
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
      vault.scheduleRules.some((rule) => rule.courseGroupId === courseId) ||
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
      const studentIds = current.studentIds.includes(studentId)
        ? current.studentIds.filter((id) => id !== studentId)
        : [...current.studentIds, studentId];
      return { ...current, studentIds };
    });
  }

  function saveCourseDraft() {
    if (!editingCourse?.name.trim()) return;
    onUpdateCourse({
      ...editingCourse,
      name: editingCourse.name.trim(),
      subject: editingCourse.subject.trim() || "未设置"
    });
    setEditingCourse(null);
  }

  return (
    <div className="space-y-6">
      {dialog}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "档案信息", value: `${vault.students.length} 人`, hint: `正常学生 ${activeStudents} 人`, icon: Users },
          { label: "校区", value: `${vault.campuses.length} 个`, hint: "教学地点", icon: Building2 },
          { label: "课程/班课", value: `${vault.courseGroups.length} 个`, hint: `启用 ${activeCourses} 个`, icon: GraduationCap },
          { label: "固定规则", value: `${scheduleRuleCount} 条`, hint: "排课规则归档", icon: CalendarCheck }
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
              value={vault.profile.obligationDeductionMode ?? "auto_gap"}
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
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">每小时扣费</label>
            <Input
              type="number"
              value={vault.profile.obligationHourlyDeduction ?? 0}
              onChange={(event) => updateProfile({ obligationHourlyDeduction: Number(event.target.value) })}
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

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#eaf2ff]">
              <Building2 size={18} className="text-[#1557c2]" />
            </div>
            <div>
              <CardTitle className="text-lg">校区</CardTitle>
              <CardDescription>管理教学地点</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={addCampus} className="space-y-3">
              <Input
                value={campusNameInput}
                onChange={(e) => setCampusNameInput(e.target.value)}
                placeholder="例如：中心校区"
              />
              <Button type="submit" className="w-full">
                <Plus size={15} /> 添加校区
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#e8f8ef]">
              <User size={18} className="text-[#16a34a]" />
            </div>
            <div>
              <CardTitle className="text-lg">学生</CardTitle>
              <CardDescription>管理学生名单</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={addStudent} className="space-y-3">
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
              <label className="flex items-center gap-3 rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] px-3 py-2 text-sm font-bold text-[#25324a]">
                <input
                  type="checkbox"
                  checked={studentTemporaryTrialInput}
                  onChange={(event) => setStudentTemporaryTrialInput(event.target.checked)}
                  className="h-4 w-4 accent-[#ff8617]"
                />
                临时试听学生
              </label>
              <Button type="submit" className="w-full">
                <Plus size={15} /> 添加学生
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#fff1e2]">
              <GraduationCap size={18} className="text-[#ff8617]" />
            </div>
            <div>
              <CardTitle className="text-lg">课程 / 班课</CardTitle>
              <CardDescription>设置课程类型和计费规则</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={addCourse} className="space-y-3">
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
              <Button type="submit" className="w-full">
                <Plus size={15} /> 添加课程
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 xl:items-start">
        <Card className="h-fit overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-[#ff8617]" />
              <CardTitle className="text-lg">校区列表</CardTitle>
            </div>
            <Badge variant="secondary">{vault.campuses.length} 个</Badge>
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
                  className="border-b border-[#e8eef6] bg-white px-3 py-3 last:border-b-0"
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
                          onUpdateCampus({ ...editingCampus, name: editingCampus.name.trim() });
                          setEditingCampus(null);
                        }}>
                          <Save size={14} /> 保存
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditingCampus(null)}>
                          <X size={14} /> 取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
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
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditingCampus(campus)}>
                          <Pencil size={14} /> 编辑
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={used}
                          title={used ? "已有学生、课程、规则或课时引用，不能直接删除" : "删除校区"}
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
                          <Trash2 size={14} /> 删除
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
            <div className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-[#ff8617]" />
                <CardTitle className="text-lg">学生列表</CardTitle>
              </div>
              <Badge variant="secondary">{visibleStudents.length} / {vault.students.length} 人</Badge>
            </div>
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
                  className="border-b border-[#e8eef6] bg-white px-3 py-3 last:border-b-0"
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
                          onUpdateStudent({
                            ...editingStudent,
                            name: editingStudent.name.trim(),
                            grade: editingStudent.grade === "__custom__" ? undefined : editingStudent.grade
                          });
                          setEditingStudent(null);
                        }}>
                          <Save size={14} /> 保存
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditingStudent(null)}>
                          <X size={14} /> 取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
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
                        <Badge variant={student.status === "active" ? "sage" : "secondary"}>
                          {student.status === "active" ? "正常" : "暂停"}
                        </Badge>
                      </div>
                      {student.note && (
                        <div className="rounded-[12px] border border-[#e8eef6] bg-white px-3 py-2 text-xs font-semibold leading-5 text-[#64748b]">
                          <FileText size={12} className="mr-1 inline" />
                          {student.note}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditingStudent(student)}>
                          <Pencil size={14} /> 编辑
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={used}
                          title={used ? "已有课程或课时引用，不能直接删除" : "删除学生"}
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
                          <Trash2 size={14} /> 删除
                        </Button>
                      </div>
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

        <Card className="h-fit overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <GraduationCap size={18} className="text-[#ff8617]" />
              <CardTitle className="text-lg">课程与班课</CardTitle>
            </div>
            <Badge variant="secondary">{vault.courseGroups.length} 个</Badge>
          </CardHeader>
          <CardContent className="max-h-[520px] space-y-0 overflow-y-auto pr-2">
            {vault.courseGroups.map((course) => {
              const isEditing = editingCourse?.id === course.id;
              const used = courseInUse(course.id);
              return (
                <motion.div
                  key={course.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border-b border-[#e8eef6] bg-white px-3 py-3 last:border-b-0"
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
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-[#64748b]">班课基础费用</label>
                            <Input
                              type="number"
                              value={editingCourse.feeRule.baseFee ?? 0}
                              onChange={(event) => updateEditingCourseFee({ baseFee: Number(event.target.value) })}
                              placeholder="基础费用"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-[#64748b]">每名到课学生费用</label>
                            <Input
                              type="number"
                              value={editingCourse.feeRule.perPresentStudentFee ?? 0}
                              onChange={(event) => updateEditingCourseFee({ perPresentStudentFee: Number(event.target.value) })}
                              placeholder="每人费用"
                            />
                          </div>
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
                        <div className="text-sm font-medium">关联学生（{editingCourse.studentIds.length} / {vault.students.length}）</div>
                        <div className="grid grid-cols-2 gap-2">
                          {vault.students.map((student) => (
                            <button
                              type="button"
                              key={student.id}
                              onClick={() => toggleCourseStudent(student.id)}
                              className={`rounded-[10px] border px-3 py-2 text-left text-xs font-bold ${
                                editingCourse.studentIds.includes(student.id)
                                  ? "border-[#ff8617] bg-[#fff7ed] text-[#9a3412]"
                                  : student.temporaryTrial
                                  ? "border-[#c7d2fe] bg-[#eef0ff] text-[#5161d6]"
                                  : "border-[#dbe4ef] bg-white text-[#25324a]"
                              }`}
                            >
                              {student.name}{student.temporaryTrial ? " · 试听" : ""}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" size="sm" onClick={saveCourseDraft}>
                          <Save size={14} /> 保存
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditingCourse(null)}>
                          <X size={14} /> 取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
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
                          </div>
                        </div>
                        <span className="shrink-0 text-xs text-(--color-muted-foreground)">
                          {campusName(vault, course.defaultCampusId)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditingCourse(course)}>
                          <Pencil size={14} /> 编辑
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={used}
                          title={used ? "已有规则或课时引用，不能直接删除" : "删除课程"}
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
                          <Trash2 size={14} /> 删除
                        </Button>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
            {vault.courseGroups.length === 0 && (
              <p className="py-8 text-center text-sm text-(--color-muted-foreground)">还没有课程</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-[14px] border border-[#fed7aa] bg-[#fff7ed] px-4 py-3 text-sm font-semibold leading-6 text-[#9a3412]">
        删除限制说明：已有学生、课程、排课规则或历史课时引用的数据不能直接删除，建议改为暂停状态，以免影响工资和课时核对。
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
            <CalendarCheck size={14} /> 教务规则归档
          </div>
          <CardTitle>档案信息中的排课规则</CardTitle>
          <CardDescription>固定排课仍在排课页编辑，这里按课程归档查看，方便核对档案和教务配置。</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {vault.scheduleRules.map((rule) => (
            <div key={rule.id} className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-extrabold text-[#061226]">{courseName(vault, rule.courseGroupId)}</div>
                  <div className="mt-1 text-xs font-semibold text-[#64748b]">
                    {weekdayLabels[rule.weekday]} · {rule.startTime}-{rule.endTime} · {campusName(vault, rule.campusId)}
                  </div>
                </div>
                <Badge variant={rule.enabled ? "sage" : "secondary"}>{rule.enabled ? "启用" : "停用"}</Badge>
              </div>
            </div>
          ))}
          {vault.scheduleRules.length === 0 && (
            <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b] lg:col-span-2">
              还没有固定排课规则
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function defaultFeeRule(type: CourseType): FeeRule {
  if (type === "class") {
    return { mode: "class_headcount", baseFee: 80, perPresentStudentFee: 10, makeupFeeMode: "perStudentFee" };
  }
  return { mode: "hourly", hourlyRate: type === "trial" ? 0 : 200 };
}
