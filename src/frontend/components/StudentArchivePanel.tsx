import type { Dispatch, FormEvent, SetStateAction } from "react";
import { motion } from "framer-motion";
import { Archive, FileText, MapPin, Pencil, Plus, RotateCcw, Search, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Campus, CourseType, Student, TeacherVault } from "@/shared/types";
import { campusName } from "@/frontend/lib/helpers";

type ConfirmRequest = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "normal";
  onConfirm: () => void;
};

type CourseTypeOption = {
  value: CourseType;
  label: string;
};

type StudentArchivePanelProps = {
  archiveRowClass: (panel: "students", id: string) => string;
  archiveSearch: string;
  campusOptions: Campus[];
  confirm: (request: ConfirmRequest) => void;
  courseTypeOptions: CourseTypeOption[];
  customGradeInput: string;
  gradeFilter: string;
  gradeFilterOptions: string[];
  gradeOptions: string[];
  hasUnsetGradeFilterOption: boolean;
  onAddStudent: (event: FormEvent) => void;
  onDeleteStudent: (studentId: string) => void;
  onOpenStudentEditor: (student: Student) => void;
  onRequestArchiveStudent: (student: Student) => void;
  onRestoreStudent: (student: Student) => void;
  setArchiveSearch: Dispatch<SetStateAction<string>>;
  setCustomGradeInput: Dispatch<SetStateAction<string>>;
  setGradeFilter: Dispatch<SetStateAction<string>>;
  setStudentCampusFilter: Dispatch<SetStateAction<string>>;
  setStudentCampusInput: Dispatch<SetStateAction<string>>;
  setStudentCourseTypeFilter: Dispatch<SetStateAction<"all" | CourseType>>;
  setStudentGradeInput: Dispatch<SetStateAction<string>>;
  setStudentNameInput: Dispatch<SetStateAction<string>>;
  setStudentNoteInput: Dispatch<SetStateAction<string>>;
  setStudentSchoolInput: Dispatch<SetStateAction<string>>;
  setStudentStatusFilter: Dispatch<SetStateAction<"active" | "archived" | "all">>;
  setStudentSubjectFilter: Dispatch<SetStateAction<string>>;
  setStudentTemporaryTrialInput: Dispatch<SetStateAction<boolean>>;
  setStudentTrialFilter: Dispatch<SetStateAction<"all" | "trial" | "regular">>;
  studentCampusFilter: string;
  studentCampusInput: string;
  studentCourseTypeFilter: "all" | CourseType;
  studentGradeInput: string;
  studentInUse: (studentId: string) => boolean;
  studentNameInput: string;
  studentNoteInput: string;
  studentSchoolInput: string;
  studentStatusFilter: "active" | "archived" | "all";
  studentSubjectFilter: string;
  studentTemporaryTrialInput: boolean;
  studentTrialFilter: "all" | "trial" | "regular";
  subjectFilterOptions: string[];
  vault: TeacherVault;
  visibleStudents: Student[];
};

export function StudentArchivePanel({
  archiveRowClass,
  archiveSearch,
  campusOptions,
  confirm,
  courseTypeOptions,
  customGradeInput,
  gradeFilter,
  gradeFilterOptions,
  gradeOptions,
  hasUnsetGradeFilterOption,
  onAddStudent,
  onDeleteStudent,
  onOpenStudentEditor,
  onRequestArchiveStudent,
  onRestoreStudent,
  setArchiveSearch,
  setCustomGradeInput,
  setGradeFilter,
  setStudentCampusFilter,
  setStudentCampusInput,
  setStudentCourseTypeFilter,
  setStudentGradeInput,
  setStudentNameInput,
  setStudentNoteInput,
  setStudentSchoolInput,
  setStudentStatusFilter,
  setStudentSubjectFilter,
  setStudentTemporaryTrialInput,
  setStudentTrialFilter,
  studentCampusFilter,
  studentCampusInput,
  studentCourseTypeFilter,
  studentGradeInput,
  studentInUse,
  studentNameInput,
  studentNoteInput,
  studentSchoolInput,
  studentStatusFilter,
  studentSubjectFilter,
  studentTemporaryTrialInput,
  studentTrialFilter,
  subjectFilterOptions,
  vault,
  visibleStudents
}: StudentArchivePanelProps) {
  return (
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
        <form onSubmit={onAddStudent} className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          <Input
            value={studentNameInput}
            onChange={(event) => setStudentNameInput(event.target.value)}
            placeholder="例如：学生 E"
          />
          <Select value={studentGradeInput} onChange={(event) => setStudentGradeInput(event.target.value)}>
            {gradeOptions.map((grade) => (
              <option key={grade} value={grade === "未设置年级" ? "" : grade}>{grade}</option>
            ))}
          </Select>
          {studentGradeInput === "自定义" && (
            <Input
              value={customGradeInput}
              onChange={(event) => setCustomGradeInput(event.target.value)}
              placeholder="输入自定义年级"
            />
          )}
          <Input
            value={studentSchoolInput}
            onChange={(event) => setStudentSchoolInput(event.target.value)}
            placeholder="所在学校，例如：实验中学"
          />
          <Select value={studentCampusInput} onChange={(event) => setStudentCampusInput(event.target.value)}>
            <option value="">未设置校区</option>
            {campusOptions.map((campus) => (
              <option key={campus.id} value={campus.id}>{campus.name}</option>
            ))}
          </Select>
          <Input
            value={studentNoteInput}
            onChange={(event) => setStudentNoteInput(event.target.value)}
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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <Select value={studentStatusFilter} onChange={(event) => setStudentStatusFilter(event.target.value as "active" | "archived" | "all")} className="h-10">
            <option value="active">在读学生</option>
            <option value="archived">已归档学生</option>
            <option value="all">全部学生</option>
          </Select>
          <Select value={studentTrialFilter} onChange={(event) => setStudentTrialFilter(event.target.value as "all" | "trial" | "regular")} className="h-10">
            <option value="all">全部档案</option>
            <option value="trial">仅试听档案</option>
            <option value="regular">非试听档案</option>
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
              onClick={() => onOpenStudentEditor(student)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenStudentEditor(student);
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
                          onRestoreStudent(student);
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
                          onRequestArchiveStudent(student);
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
                        onOpenStudentEditor(student);
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
  );
}
