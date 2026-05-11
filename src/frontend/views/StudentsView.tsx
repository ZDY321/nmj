import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Building2, GraduationCap, MapPin, Pencil, Plus, Save, Trash2, User, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Campus, CourseGroup, CourseType, Student, TeacherVault } from "@/shared/types";
import { makeId } from "@/frontend/lib/crypto";
import { campusName, studentNames } from "@/frontend/lib/helpers";

export function StudentsView({
  vault,
  onAddCampus,
  onUpdateCampus,
  onDeleteCampus,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
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
  onAddCourse: (course: CourseGroup) => void;
  onUpdateCourse: (course: CourseGroup) => void;
  onDeleteCourse: (courseId: string) => void;
}) {
  const [campusNameInput, setCampusNameInput] = useState("");
  const [studentNameInput, setStudentNameInput] = useState("");
  const [courseNameInput, setCourseNameInput] = useState("");
  const [courseType, setCourseType] = useState<CourseType>("one_on_one");
  const [editingCampus, setEditingCampus] = useState<Campus | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editingCourse, setEditingCourse] = useState<CourseGroup | null>(null);

  function addCampus(e: FormEvent) {
    e.preventDefault();
    if (!campusNameInput.trim()) return;
    onAddCampus({ id: makeId("campus"), name: campusNameInput.trim() });
    setCampusNameInput("");
  }

  function addStudent(e: FormEvent) {
    e.preventDefault();
    if (!studentNameInput.trim()) return;
    onAddStudent({
      id: makeId("student"),
      name: studentNameInput.trim(),
      defaultCampusId: vault.campuses[0]?.id,
      status: "active"
    });
    setStudentNameInput("");
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
      feeRule:
        courseType === "class"
          ? { mode: "class_headcount", baseFee: 80, perPresentStudentFee: 10, makeupFeeMode: "perStudentFee" }
          : { mode: "hourly", hourlyRate: 200 },
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
                placeholder="例如：高一数学班"
              />
              <Select
                value={courseType}
                onChange={(e) => setCourseType(e.target.value as CourseType)}
              >
                <option value="one_on_one">一对一</option>
                <option value="class">班课</option>
              </Select>
              <Button type="submit" className="w-full">
                <Plus size={15} /> 添加课程
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-[#ff8617]" />
              <CardTitle className="text-lg">校区列表</CardTitle>
            </div>
            <Badge variant="secondary">{vault.campuses.length} 个</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {vault.campuses.map((campus) => {
              const isEditing = editingCampus?.id === campus.id;
              const used = campusInUse(campus.id);
              return (
                <motion.div
                  key={campus.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3"
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
                          onClick={() => onDeleteCampus(campus.id)}
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

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-[#ff8617]" />
              <CardTitle className="text-lg">学生列表</CardTitle>
            </div>
            <Badge variant="secondary">{vault.students.length} 人</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {vault.students.map((student) => {
              const isEditing = editingStudent?.id === student.id;
              const used = studentInUse(student.id);
              return (
                <motion.div
                  key={student.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3"
                >
                  {isEditing && editingStudent ? (
                    <div className="space-y-3">
                      <Input
                        value={editingStudent.name}
                        onChange={(event) => setEditingStudent({ ...editingStudent, name: event.target.value })}
                        placeholder="学生姓名"
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
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" size="sm" onClick={() => {
                          if (!editingStudent.name.trim()) return;
                          onUpdateStudent({ ...editingStudent, name: editingStudent.name.trim() });
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
                            <span className="flex items-center gap-1 text-xs text-(--color-muted-foreground)">
                              <MapPin size={10} /> {campusName(vault, student.defaultCampusId)}
                            </span>
                          </div>
                        </div>
                        <Badge variant={student.status === "active" ? "sage" : "secondary"}>
                          {student.status === "active" ? "正常" : "暂停"}
                        </Badge>
                      </div>
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
                          onClick={() => onDeleteStudent(student.id)}
                        >
                          <Trash2 size={14} /> 删除
                        </Button>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
            {vault.students.length === 0 && (
              <p className="py-8 text-center text-sm text-(--color-muted-foreground)">还没有学生</p>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <GraduationCap size={18} className="text-[#ff8617]" />
              <CardTitle className="text-lg">课程与班课</CardTitle>
            </div>
            <Badge variant="secondary">{vault.courseGroups.length} 个</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {vault.courseGroups.map((course) => {
              const isEditing = editingCourse?.id === course.id;
              const used = courseInUse(course.id);
              return (
                <motion.div
                  key={course.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3"
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
                              feeRule:
                                nextType === "class"
                                  ? { mode: "class_headcount", baseFee: 80, perPresentStudentFee: 10, makeupFeeMode: "perStudentFee" }
                                  : { mode: "hourly", hourlyRate: 200 }
                            });
                          }}
                        >
                          <option value="one_on_one">一对一</option>
                          <option value="class">班课</option>
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
                          <Input
                            type="number"
                            value={editingCourse.feeRule.baseFee ?? 0}
                            onChange={(event) => updateEditingCourseFee({ baseFee: Number(event.target.value) })}
                            placeholder="基础费用"
                          />
                          <Input
                            type="number"
                            value={editingCourse.feeRule.perPresentStudentFee ?? 0}
                            onChange={(event) => updateEditingCourseFee({ perPresentStudentFee: Number(event.target.value) })}
                            placeholder="每人费用"
                          />
                        </div>
                      ) : (
                        <Input
                          type="number"
                          value={editingCourse.feeRule.hourlyRate ?? 0}
                          onChange={(event) => updateEditingCourseFee({ hourlyRate: Number(event.target.value) })}
                          placeholder="每小时费用"
                        />
                      )}
                      <div className="space-y-2">
                        <div className="text-sm font-medium">关联学生</div>
                        <div className="grid grid-cols-2 gap-2">
                          {vault.students.map((student) => (
                            <button
                              type="button"
                              key={student.id}
                              onClick={() => toggleCourseStudent(student.id)}
                              className={`rounded-[10px] border px-3 py-2 text-left text-xs font-bold ${
                                editingCourse.studentIds.includes(student.id)
                                  ? "border-[#ff8617] bg-[#fff7ed] text-[#9a3412]"
                                  : "border-[#dbe4ef] bg-white text-[#25324a]"
                              }`}
                            >
                              {student.name}
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
                              {course.type === "class" ? "班课" : "一对一"} · {studentNames(vault, course.studentIds) || "未关联学生"}
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
                          onClick={() => onDeleteCourse(course.id)}
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
    </div>
  );
}
