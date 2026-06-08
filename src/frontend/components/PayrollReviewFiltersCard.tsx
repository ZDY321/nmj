import { FileCheck2 } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { lessonStatusLabels } from "@/frontend/lib/helpers";
import type { Campus, CourseType, Lesson } from "@/shared/types";

type LessonStatusFilter = "all" | Lesson["status"];

export function PayrollReviewFiltersCard({
  selectedMonth,
  campusFilter,
  typeFilter,
  statusFilter,
  gradeFilter,
  campusOptions,
  courseTypeOptions,
  gradeOptions,
  onMonthChange,
  onCampusChange,
  onTypeChange,
  onStatusChange,
  onGradeChange
}: {
  selectedMonth: string;
  campusFilter: string;
  typeFilter: "all" | CourseType;
  statusFilter: LessonStatusFilter;
  gradeFilter: string;
  campusOptions: Campus[];
  courseTypeOptions: Array<{ value: CourseType; label: string }>;
  gradeOptions: string[];
  onMonthChange: (value: string) => void;
  onCampusChange: (value: string) => void;
  onTypeChange: (value: "all" | CourseType) => void;
  onStatusChange: (value: LessonStatusFilter) => void;
  onGradeChange: (value: string) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
            <FileCheck2 size={14} /> 月底工资核对
          </div>
          <CardTitle>按校区核对课程、义务课时和本月收入</CardTitle>
          <CardDescription className="mt-2">
            先选月份和校区，再核对每节课的状态、班型、学生和扣费后小计。
          </CardDescription>
        </div>
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:w-auto lg:min-w-[860px] xl:grid-cols-5">
          <div className="space-y-2">
            <label className="text-sm font-medium">月份</label>
            <Input type="month" value={selectedMonth} onChange={(event) => onMonthChange(event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">校区</label>
            <Select value={campusFilter} onChange={(event) => onCampusChange(event.target.value)}>
              <option value="all">全部校区</option>
              {campusOptions.map((campus) => (
                <option key={campus.id} value={campus.id}>{campus.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">课程类型</label>
            <Select value={typeFilter} onChange={(event) => onTypeChange(event.target.value as "all" | CourseType)}>
              <option value="all">全部类型</option>
              {courseTypeOptions.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">状态</label>
            <Select value={statusFilter} onChange={(event) => onStatusChange(event.target.value as LessonStatusFilter)}>
              <option value="all">全部状态</option>
              {Object.entries(lessonStatusLabels).map(([status, label]) => (
                <option key={status} value={status}>{label}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">年级</label>
            <Select value={gradeFilter} onChange={(event) => onGradeChange(event.target.value)}>
              <option value="all">全部年级</option>
              {gradeOptions.map((grade) => (
                <option key={grade} value={grade}>{grade}</option>
              ))}
            </Select>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
