import { FileCheck2 } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { lessonStatusLabels } from "@/frontend/lib/helpers";
import type { Campus, CourseType, Lesson } from "@/shared/types";

type LessonStatusFilter = "all" | Lesson["status"];

export function PayrollReviewFiltersCard({
  selectedStartDate,
  selectedEndDate,
  primaryMonth,
  campusFilter,
  typeFilter,
  statusFilter,
  gradeFilter,
  campusOptions,
  courseTypeOptions,
  gradeOptions,
  onStartDateChange,
  onEndDateChange,
  onPrimaryMonthChange,
  onCampusChange,
  onTypeChange,
  onStatusChange,
  onGradeChange
}: {
  selectedStartDate: string;
  selectedEndDate: string;
  primaryMonth: string;
  campusFilter: string;
  typeFilter: "all" | CourseType;
  statusFilter: LessonStatusFilter;
  gradeFilter: string;
  campusOptions: Campus[];
  courseTypeOptions: Array<{ value: CourseType; label: string }>;
  gradeOptions: string[];
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onPrimaryMonthChange: (value: string) => void;
  onCampusChange: (value: string) => void;
  onTypeChange: (value: "all" | CourseType) => void;
  onStatusChange: (value: LessonStatusFilter) => void;
  onGradeChange: (value: string) => void;
}) {
  const isDateRangeValid = Boolean(selectedStartDate && selectedEndDate && selectedStartDate <= selectedEndDate);

  return (
    <Card data-onboarding="payroll-filters" className="overflow-hidden">
      <CardHeader className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
            <FileCheck2 size={14} /> 月底工资核对
          </div>
          <CardTitle>按日期范围核对课程、义务课时和收入</CardTitle>
          <CardDescription className="mt-2">
            选择日期范围和义务课时主月份，再按校区、课程类型、状态和年级核对工资。
          </CardDescription>
        </div>
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:w-auto 2xl:min-w-[900px]">
          <div className="space-y-2">
            <label className="text-sm font-medium">开始日期</label>
            <Input
              type="date"
              value={selectedStartDate}
              max={selectedEndDate || undefined}
              onChange={(event) => onStartDateChange(event.target.value)}
              aria-invalid={!isDateRangeValid}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">结束日期</label>
            <Input
              type="date"
              value={selectedEndDate}
              min={selectedStartDate || undefined}
              onChange={(event) => onEndDateChange(event.target.value)}
              aria-invalid={!isDateRangeValid}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">义务课时主月份</label>
            <Input
              type="month"
              value={primaryMonth}
              onChange={(event) => onPrimaryMonthChange(event.target.value)}
            />
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
          {!isDateRangeValid && (
            <p className="text-sm font-medium text-[#b91c1c] sm:col-span-2 xl:col-span-4">请选择有效的开始日期和结束日期，且开始日期不能晚于结束日期。</p>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}
