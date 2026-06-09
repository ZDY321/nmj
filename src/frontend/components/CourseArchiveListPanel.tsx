import type { Dispatch, SetStateAction } from "react";
import { motion } from "framer-motion";
import { GraduationCap, Pencil, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Campus, CourseGroup, CourseType, TeacherVault } from "@/shared/types";
import { campusName, courseTypeLabel, studentNames } from "@/frontend/lib/helpers";

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

type CourseArchiveListPanelProps = {
  archiveRowClass: (panel: "courses", id: string) => string;
  campusOptions: Campus[];
  confirm: (request: ConfirmRequest) => void;
  courseCampusFilter: string;
  courseFeeSummary: (course: CourseGroup) => string;
  courseGradeFilter: string;
  courseInUse: (courseId: string) => boolean;
  courseSearch: string;
  courseSubjectFilter: string;
  courseTypeFilter: "all" | CourseType;
  courseTypeOptions: CourseTypeOption[];
  gradeFilterOptions: string[];
  hasUnsetGradeFilterOption: boolean;
  onDeleteCourse: (courseId: string) => void;
  onOpenCourseEditor: (course: CourseGroup) => void;
  setCourseCampusFilter: Dispatch<SetStateAction<string>>;
  setCourseGradeFilter: Dispatch<SetStateAction<string>>;
  setCourseSearch: Dispatch<SetStateAction<string>>;
  setCourseSubjectFilter: Dispatch<SetStateAction<string>>;
  setCourseTypeFilter: Dispatch<SetStateAction<"all" | CourseType>>;
  subjectFilterOptions: string[];
  vault: TeacherVault;
  visibleCourses: CourseGroup[];
};

export function CourseArchiveListPanel({
  archiveRowClass,
  campusOptions,
  confirm,
  courseCampusFilter,
  courseFeeSummary,
  courseGradeFilter,
  courseInUse,
  courseSearch,
  courseSubjectFilter,
  courseTypeFilter,
  courseTypeOptions,
  gradeFilterOptions,
  hasUnsetGradeFilterOption,
  onDeleteCourse,
  onOpenCourseEditor,
  setCourseCampusFilter,
  setCourseGradeFilter,
  setCourseSearch,
  setCourseSubjectFilter,
  setCourseTypeFilter,
  subjectFilterOptions,
  vault,
  visibleCourses
}: CourseArchiveListPanelProps) {
  return (
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
            placeholder="搜索课程档案名称、学科、校区、学生或班型"
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
                onClick={() => onOpenCourseEditor(course)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenCourseEditor(course);
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
                        onOpenCourseEditor(course);
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
  );
}
