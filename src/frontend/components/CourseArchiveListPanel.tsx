import type { Dispatch, SetStateAction } from "react";
import { motion } from "framer-motion";
import { GraduationCap, Pencil, RefreshCw, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Campus, CourseGroup, CourseType, TeacherVault } from "@/shared/types";
import { campusName, courseHasActiveStudent, courseTypeLabel, studentNames } from "@/frontend/lib/helpers";

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
  courseArchiveMessage: string;
  courseCampusFilter: string;
  courseFeeSummary: (course: CourseGroup) => string;
  courseGradeFilter: string;
  courseInUse: (courseId: string) => boolean;
  courseSearch: string;
  courseStatusFilter: "active" | "paused" | "all";
  courseSubjectFilter: string;
  courseTypeFilter: "all" | CourseType;
  courseTypeOptions: CourseTypeOption[];
  gradeFilterOptions: string[];
  hasUnsetGradeFilterOption: boolean;
  onDeleteCourse: (courseId: string) => void;
  onOpenCourseEditor: (course: CourseGroup) => void;
  onRequestSyncVisibleCourses: () => void;
  onToggleCourseSelection: (courseId: string) => void;
  onToggleVisibleCourseSelection: (checked: boolean) => void;
  onUpdateSelectedCoursesStatus: (status: CourseGroup["status"]) => void;
  selectedCourseIds: string[];
  setCourseCampusFilter: Dispatch<SetStateAction<string>>;
  setCourseGradeFilter: Dispatch<SetStateAction<string>>;
  setCourseSearch: Dispatch<SetStateAction<string>>;
  setCourseStatusFilter: Dispatch<SetStateAction<"active" | "paused" | "all">>;
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
  courseArchiveMessage,
  courseCampusFilter,
  courseFeeSummary,
  courseGradeFilter,
  courseInUse,
  courseSearch,
  courseStatusFilter,
  courseSubjectFilter,
  courseTypeFilter,
  courseTypeOptions,
  gradeFilterOptions,
  hasUnsetGradeFilterOption,
  onDeleteCourse,
  onOpenCourseEditor,
  onRequestSyncVisibleCourses,
  onToggleCourseSelection,
  onToggleVisibleCourseSelection,
  onUpdateSelectedCoursesStatus,
  selectedCourseIds,
  setCourseCampusFilter,
  setCourseGradeFilter,
  setCourseSearch,
  setCourseStatusFilter,
  setCourseSubjectFilter,
  setCourseTypeFilter,
  subjectFilterOptions,
  vault,
  visibleCourses
}: CourseArchiveListPanelProps) {
  const selectedVisibleCount = visibleCourses.filter((course) => selectedCourseIds.includes(course.id)).length;
  const allVisibleSelected = visibleCourses.length > 0 && selectedVisibleCount === visibleCourses.length;

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
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Badge variant="secondary" className="w-fit">
                {visibleCourses.length} / {vault.courseGroups.length} 个
                {courseStatusFilter !== "all" ? ` · ${courseStatusFilter === "active" ? "启用" : "暂停"}` : ""}
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 border-[#1557c2] bg-[#1557c2] text-white shadow-sm hover:border-[#0f49aa] hover:bg-[#0f49aa] hover:text-white disabled:border-[#bfdbfe] disabled:bg-[#dbeafe] disabled:text-[#64748b]"
                title="课程档案变更后，刷新当前筛选课程的未来待上课课节快照"
                onClick={onRequestSyncVisibleCourses}
                disabled={visibleCourses.length === 0}
              >
                <RefreshCw size={14} /> 同步当前筛选课程
              </Button>
            </div>
            <div className="max-w-[420px] rounded-[10px] border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2 text-xs font-semibold leading-5 text-[#1557c2] sm:text-right">
              修改课程档案的班型、校区、学生名单或金额后，用它刷新当前筛选课程的未来待上课课节；历史和已完成课节不会改。
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {courseArchiveMessage && (
          <div className="rounded-[12px] border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2 text-sm font-semibold text-[#1557c2]">
            {courseArchiveMessage}
          </div>
        )}
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
          <Input
            className="h-10 pl-9"
            value={courseSearch}
            onChange={(event) => setCourseSearch(event.target.value)}
            placeholder="搜索课程档案名称、学科、校区、学生或班型"
          />
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <Select value={courseStatusFilter} onChange={(event) => setCourseStatusFilter(event.target.value as "active" | "paused" | "all")} className="h-10">
            <option value="active">启用课程</option>
            <option value="paused">暂停课程</option>
            <option value="all">全部课程</option>
          </Select>
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
        <div className="flex flex-col gap-2 rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] p-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-xs font-bold text-[#25324a]">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              disabled={visibleCourses.length === 0}
              onChange={(event) => onToggleVisibleCourseSelection(event.target.checked)}
              className="h-4 w-4 accent-[#1557c2]"
            />
            选择当前筛选 {selectedVisibleCount > 0 ? ` · 已选 ${selectedVisibleCount}` : ""}
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" className="h-8 border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]" disabled={selectedVisibleCount === 0} onClick={() => onUpdateSelectedCoursesStatus("active")}>启用</Button>
            <Button type="button" size="sm" variant="destructive" className="h-8" disabled={selectedVisibleCount === 0} onClick={() => onUpdateSelectedCoursesStatus("paused")}>暂停</Button>
          </div>
        </div>
        <div className="max-h-[520px] space-y-0 overflow-y-auto pr-2">
          {visibleCourses.map((course) => {
            const used = courseInUse(course.id);
            const effectivelyPaused = course.status === "paused" || !courseHasActiveStudent(vault, course);
            const selected = selectedCourseIds.includes(course.id);
            return (
              <motion.div
                key={course.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`${archiveRowClass("courses", course.id)} ${selected ? "bg-[#f8fbff]" : ""} cursor-pointer transition-colors hover:bg-[#f8fbff]`}
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
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleCourseSelection(course.id)}
                      onClick={(event) => event.stopPropagation()}
                      className="h-4 w-4 shrink-0 accent-[#1557c2]"
                      aria-label={`选择课程 ${course.name}`}
                    />
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eaf2ff]">
                      <GraduationCap size={16} className="text-[#1557c2]" />
                    </div>
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium">{course.name}</span>
                      <span className="text-xs text-(--color-muted-foreground)">
                        {courseTypeLabel(vault, course.type)} · {course.subject} · {studentNames(vault, course.studentIds) || "未关联学生"}
                      </span>
                      <span className="mt-1 block whitespace-pre-line text-xs font-bold text-[#1557c2]">
                        {courseFeeSummary(course)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant={effectivelyPaused ? "secondary" : "sage"}>
                      {effectivelyPaused ? "暂停" : "启用"}
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
