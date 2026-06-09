import type { Dispatch, FormEvent, SetStateAction } from "react";
import { ChevronDown, GraduationCap, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Campus, CourseGroup, CourseType, Student, TeacherVault } from "@/shared/types";
import { courseTypeLabel, studentNames } from "@/frontend/lib/helpers";

type CourseTypeOption = {
  value: CourseType;
  label: string;
};

type StudentCourseTransferPanelProps = {
  activeStudentOptions: Student[];
  campusOptions: Campus[];
  courseTypeOptions: CourseTypeOption[];
  onSubmit: (event: FormEvent) => void;
  setTransferCampusInput: Dispatch<SetStateAction<string>>;
  setTransferCourseNameInput: Dispatch<SetStateAction<string>>;
  setTransferCourseType: Dispatch<SetStateAction<CourseType>>;
  setTransferEndExisting: Dispatch<SetStateAction<boolean>>;
  setTransferPanelOpen: Dispatch<SetStateAction<boolean>>;
  setTransferStudentId: Dispatch<SetStateAction<string>>;
  setTransferSubjectInput: Dispatch<SetStateAction<string>>;
  setTransferTargetCourseId: Dispatch<SetStateAction<string>>;
  setTransferTargetMode: Dispatch<SetStateAction<"new" | "existing">>;
  studentOptionLabel: (student: Student) => string;
  subjectOptions: string[];
  transferCampusInput: string;
  transferCourseNameInput: string;
  transferCourseType: CourseType;
  transferCurrentCourses: CourseGroup[];
  transferEndExisting: boolean;
  transferMessage: string;
  transferPanelOpen: boolean;
  transferStudent: Student | undefined;
  transferStudentId: string;
  transferSubjectInput: string;
  transferTargetCourseId: string;
  transferTargetCourses: CourseGroup[];
  transferTargetMode: "new" | "existing";
  vault: TeacherVault;
};

export function StudentCourseTransferPanel({
  activeStudentOptions,
  campusOptions,
  courseTypeOptions,
  onSubmit,
  setTransferCampusInput,
  setTransferCourseNameInput,
  setTransferCourseType,
  setTransferEndExisting,
  setTransferPanelOpen,
  setTransferStudentId,
  setTransferSubjectInput,
  setTransferTargetCourseId,
  setTransferTargetMode,
  studentOptionLabel,
  subjectOptions,
  transferCampusInput,
  transferCourseNameInput,
  transferCourseType,
  transferCurrentCourses,
  transferEndExisting,
  transferMessage,
  transferPanelOpen,
  transferStudent,
  transferStudentId,
  transferSubjectInput,
  transferTargetCourseId,
  transferTargetCourses,
  transferTargetMode,
  vault
}: StudentCourseTransferPanelProps) {
  return (
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
          <form onSubmit={onSubmit} className="space-y-4">
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
                  <label className="text-sm font-medium">课程档案名称</label>
                  <Input
                    value={transferCourseNameInput}
                    onChange={(event) => setTransferCourseNameInput(event.target.value)}
                    placeholder={transferStudent ? `${transferStudent.name}${courseTypeLabel(vault, transferCourseType)}` : "新课程档案名称"}
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
  );
}
