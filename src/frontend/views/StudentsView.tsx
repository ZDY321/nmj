import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Building2, GraduationCap, MapPin, Plus, User, Users } from "lucide-react";
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
  onAddStudent,
  onAddCourse
}: {
  vault: TeacherVault;
  onAddCampus: (campus: Campus) => void;
  onAddStudent: (student: Student) => void;
  onAddCourse: (course: CourseGroup) => void;
}) {
  const [campusNameInput, setCampusNameInput] = useState("");
  const [studentNameInput, setStudentNameInput] = useState("");
  const [courseNameInput, setCourseNameInput] = useState("");
  const [courseType, setCourseType] = useState<CourseType>("one_on_one");

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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-[#eaf2ff] flex items-center justify-center">
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
            <div className="w-10 h-10 rounded-[12px] bg-[#e8f8ef] flex items-center justify-center">
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
            <div className="w-10 h-10 rounded-[12px] bg-[#fff1e2] flex items-center justify-center">
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
              <div className="space-y-2">
                <label className="text-sm font-medium">类型</label>
                <Select
                  value={courseType}
                  onChange={(e) => setCourseType(e.target.value as CourseType)}
                >
                  <option value="one_on_one">一对一</option>
                  <option value="class">班课</option>
                </Select>
              </div>
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
            {vault.campuses.map((campus) => (
              <motion.div
                key={campus.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eaf2ff]">
                    <Building2 size={16} className="text-[#1557c2]" />
                  </div>
                  <div className="min-w-0">
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
              </motion.div>
            ))}
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
            {vault.students.map((student) => (
              <motion.div
                key={student.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-between p-3 rounded-[14px] bg-[#f8fbff] border border-[#dbe4ef]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#fff1e2] flex items-center justify-center">
                    <span className="text-xs font-bold text-[#ff8617]">{student.name.slice(0, 1)}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium block">{student.name}</span>
                    <span className="text-xs text-(--color-muted-foreground) flex items-center gap-1">
                      <MapPin size={10} /> {campusName(vault, student.defaultCampusId)}
                    </span>
                  </div>
                </div>
                <Badge variant={student.status === "active" ? "sage" : "secondary"}>
                  {student.status === "active" ? "正常" : "暂停"}
                </Badge>
              </motion.div>
            ))}
            {vault.students.length === 0 && (
              <p className="text-sm text-(--color-muted-foreground) text-center py-8">还没有学生</p>
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
            {vault.courseGroups.map((course) => (
              <motion.div
                key={course.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-between p-3 rounded-[14px] bg-[#f8fbff] border border-[#dbe4ef]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#eaf2ff] flex items-center justify-center">
                    <GraduationCap size={16} className="text-[#1557c2]" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-medium block truncate">{course.name}</span>
                    <span className="text-xs text-(--color-muted-foreground)">
                      {course.type === "class" ? "班课" : "一对一"} · {studentNames(vault, course.studentIds)}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-(--color-muted-foreground) shrink-0 ml-2">
                  {campusName(vault, course.defaultCampusId)}
                </span>
              </motion.div>
            ))}
            {vault.courseGroups.length === 0 && (
              <p className="text-sm text-(--color-muted-foreground) text-center py-8">还没有课程</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
