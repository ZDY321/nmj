import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import { CalendarDays, GraduationCap, Plus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SensitiveAmountField } from "@/frontend/components/SensitiveAmountField";
import type { Campus, ClassFeeTier, CourseGroup, CourseType, FeeRule, SalaryGradeId, Student, TeacherVault } from "@/shared/types";
import { calculateClassHeadcountFee, courseTypeUsesClassBilling, defaultSalaryGradeRule, fixedFeeForRule, normalizedClassFeeTiers, resolveSalaryGradeRule, salaryGradeLabel, salaryGradeRateForStage, salaryGradeStageForStudentIds, salaryGradeStageLabels } from "@/frontend/lib/calculations";
import { campusName, formatPrivateMoney, studentLimitForCourseType } from "@/frontend/lib/helpers";

type CourseTypeOption = {
  value: CourseType;
  label: string;
};

type CourseFeeMode = "salary_default" | "salary_specific" | "custom";

type NewCourseFormPanelProps = {
  activeStudentCount: number;
  addCourseStudentOptions: Student[];
  amountsVisible: boolean;
  campusOptions: Campus[];
  courseCampusCustomized: boolean;
  courseCampusInput: string;
  courseFeeRule: FeeRule;
  courseNameInput: string;
  courseStatusInput: CourseGroup["status"];
  courseStudentIds: string[];
  courseSubjectInput: string;
  courseType: CourseType;
  courseTypeOptions: CourseTypeOption[];
  feeModeValue: (rule: FeeRule) => CourseFeeMode;
  firstCourseStudentGrade: (studentIds: string[]) => string | undefined;
  newCourseStudentSearch: string;
  onChangeCourseCampus: (campusId: string) => void;
  onChangeCourseFeeMode: (mode: CourseFeeMode) => void;
  onChangeCourseSalaryGrade: (salaryGradeId: string) => void;
  onChangeCourseType: (courseType: CourseType) => void;
  onOpenSchedule: () => void;
  onSubmit: (event: FormEvent) => void;
  onToggleCourseStudent: (studentId: string) => void;
  onUpdateClassFeeTier: (tierId: string, patch: Partial<ClassFeeTier>) => void;
  onUpdateCourseFee: (patch: Partial<FeeRule>) => void;
  onUpdateTrialFixedFee: (fixedFee: number) => void;
  renderSalaryGradeOptions: (currentId?: SalaryGradeId) => ReactNode;
  setCourseNameEdited: Dispatch<SetStateAction<boolean>>;
  setCourseNameInput: Dispatch<SetStateAction<string>>;
  setCourseStatusInput: Dispatch<SetStateAction<CourseGroup["status"]>>;
  setCourseSubjectInput: Dispatch<SetStateAction<string>>;
  setNewCourseStudentSearch: Dispatch<SetStateAction<string>>;
  subjectOptions: string[];
  suggestedCourseName: string;
  supportsSalaryGradeFee: (type: CourseType) => boolean;
  vault: TeacherVault;
};

export function NewCourseFormPanel({
  activeStudentCount,
  addCourseStudentOptions,
  amountsVisible,
  campusOptions,
  courseCampusCustomized,
  courseCampusInput,
  courseFeeRule,
  courseNameInput,
  courseStatusInput,
  courseStudentIds,
  courseSubjectInput,
  courseType,
  courseTypeOptions,
  feeModeValue,
  firstCourseStudentGrade,
  newCourseStudentSearch,
  onChangeCourseCampus,
  onChangeCourseFeeMode,
  onChangeCourseSalaryGrade,
  onChangeCourseType,
  onOpenSchedule,
  onSubmit,
  onToggleCourseStudent,
  onUpdateClassFeeTier,
  onUpdateCourseFee,
  onUpdateTrialFixedFee,
  renderSalaryGradeOptions,
  setCourseNameEdited,
  setCourseNameInput,
  setCourseStatusInput,
  setCourseSubjectInput,
  setNewCourseStudentSearch,
  subjectOptions,
  suggestedCourseName,
  supportsSalaryGradeFee,
  vault
}: NewCourseFormPanelProps) {
  const usesClassBilling = courseTypeUsesClassBilling(vault, courseType, courseFeeRule);
  const classBillingHint = usesClassBilling
    ? "班课按计费时长统计；例：10:10-12:00 实际 110 分钟，计费 2 小时，义务课时按 2 小时扣减。"
    : "实际课时费按「上课时长 / 2」折算。";

  return (
    <Card className="h-fit overflow-hidden">
      <CardHeader>
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap size={18} className="text-[#ff8617]" />
            <CardTitle className="text-lg">添加课程档案</CardTitle>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-[#bfdbfe] bg-[#eaf2ff] px-2.5 text-xs font-extrabold text-[#1557c2] hover:bg-[#dbeafe] hover:text-[#0f3f8f]"
            onClick={onOpenSchedule}
          >
            <CalendarDays size={13} /> 去排课
          </Button>
        </div>
        <CardDescription>新增时直接设置类型、科目、校区、费用和关联学生。</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3 rounded-[16px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
            <Input
              value={courseNameInput}
              onChange={(event) => {
                const nextName = event.target.value;
                setCourseNameInput(nextName);
                setCourseNameEdited(nextName !== suggestedCourseName);
              }}
              placeholder="课程档案名称"
            />
            <Select value={courseSubjectInput || subjectOptions[0] || "未设置"} onChange={(event) => setCourseSubjectInput(event.target.value)}>
              {subjectOptions.map((subject) => (
                <option key={subject} value={subject}>{subject}</option>
              ))}
            </Select>
            <Select
              value={courseType}
              onChange={(event) => onChangeCourseType(event.target.value as CourseType)}
            >
              {courseTypeOptions.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </Select>
            <Select value={courseCampusInput} onChange={(event) => onChangeCourseCampus(event.target.value)}>
              <option value="">未设置校区</option>
              {campusOptions.map((campus) => (
                <option key={campus.id} value={campus.id}>{campus.name}</option>
              ))}
            </Select>
            <Select value={courseStatusInput} onChange={(event) => setCourseStatusInput(event.target.value as CourseGroup["status"])}>
              <option value="active">启用</option>
              <option value="paused">暂停</option>
            </Select>
          </div>

          {supportsSalaryGradeFee(courseType) && (
            <div className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-white p-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-extrabold text-[#061226]">课时费规则</div>
                <div className="text-xs font-semibold text-[#64748b]">
                  默认跟随教师档案里的课时费等级；金额按学生年级阶段自动对应。{classBillingHint}
                </div>
              </div>
              {courseFeeRule.mode === "salary_grade" && (
                <div className="rounded-[12px] border border-[#e8eef6] bg-[#f8fbff] px-3 py-2 text-xs font-bold leading-5 text-[#475569]">
                  {resolveSalaryGradeRule(vault, courseFeeRule)
                    ? (() => {
                        const rule = resolveSalaryGradeRule(vault, courseFeeRule);
                        if (!rule) return "";
                        const stage = salaryGradeStageForStudentIds(vault, courseStudentIds);
                        if (!amountsVisible) {
                          return `跟随默认等级：${salaryGradeLabel(rule)} · ${stage ? salaryGradeStageLabels[stage] : "未识别年级，按初三"}`;
                        }
                        const rate = salaryGradeRateForStage(rule, stage);
                        return `跟随默认等级：${salaryGradeLabel(rule)} · ${stage ? salaryGradeStageLabels[stage] : "未识别年级，按初三"}：底薪 ${formatPrivateMoney(rule.baseSalary, amountsVisible)}，一对一 ${formatPrivateMoney(rate.oneOnOneFee, amountsVisible)}，班课底费 ${formatPrivateMoney(rate.classBaseFee, amountsVisible)}，人头加价 ${formatPrivateMoney(rate.headcountIncrementFee, amountsVisible)}。`
                      })()
                    : "还没有设置老师默认课时费等级，请先在老师个人信息里设置。"}
                </div>
              )}
            </div>
          )}

          {courseFeeRule.mode !== "salary_grade" && (courseFeeRule.mode === "class_headcount" ? (
            <div className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-white p-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-extrabold text-[#061226]">人数计费模板</div>
                <div className="text-xs font-semibold text-[#64748b]">
                  当前关联 {courseStudentIds.length} 人，{salaryGradeStageForStudentIds(vault, courseStudentIds) ? salaryGradeStageLabels[salaryGradeStageForStudentIds(vault, courseStudentIds)!] : "未识别年级，按初三"} 2小时标准课预计 {formatPrivateMoney(calculateClassHeadcountFee(courseFeeRule, courseStudentIds.length, courseType, salaryGradeStageForStudentIds(vault, courseStudentIds)), amountsVisible)}，{classBillingHint}
                </div>
              </div>
              {normalizedClassFeeTiers(courseFeeRule).slice(0, 1).map((tier) => (
                <div key={tier.id} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#64748b]">最少人数</label>
                    <Input
                      type="number"
                      min={0}
                      value={tier.minStudents}
                      onChange={(event) => onUpdateClassFeeTier(tier.id, { minStudents: Math.max(Number(event.target.value), 0) })}
                      className="h-9 bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#64748b]">基础费用</label>
                    <SensitiveAmountField visible={amountsVisible} className="h-9">
                      <Input
                        type="number"
                        min={0}
                        value={tier.baseFee}
                        onChange={(event) => onUpdateClassFeeTier(tier.id, { baseFee: Math.max(Number(event.target.value), 0) })}
                        className="h-9 bg-white"
                      />
                    </SensitiveAmountField>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#64748b]">每增加一人</label>
                    <SensitiveAmountField visible={amountsVisible} className="h-9">
                      <Input
                        type="number"
                        min={0}
                        value={tier.perStudentFee ?? 0}
                        onChange={(event) => onUpdateClassFeeTier(tier.id, { perStudentFee: Math.max(Number(event.target.value), 0) })}
                        className="h-9 bg-white"
                      />
                    </SensitiveAmountField>
                  </div>
                </div>
              ))}
            </div>
          ) : courseType === "trial" ? (
            <div className="grid grid-cols-1 gap-2 rounded-[14px] border border-[#dbe4ef] bg-white p-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-end">
              <div>
                <div className="text-sm font-extrabold text-[#061226]">试听费用</div>
                <div className="mt-1 text-xs font-semibold text-[#64748b]">按单次试听计费，不按上课时长相乘。</div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#64748b]">试听单次费用</label>
                <SensitiveAmountField visible={amountsVisible} className="h-9">
                  <Input
                    type="number"
                    min={0}
                    value={fixedFeeForRule(courseFeeRule)}
                    onChange={(event) => onUpdateTrialFixedFee(Math.max(Number(event.target.value), 0))}
                    className="h-9 bg-white"
                  />
                </SensitiveAmountField>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 rounded-[14px] border border-[#dbe4ef] bg-white p-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-end">
              <div>
                <div className="text-sm font-extrabold text-[#061226]">课程费用</div>
                <div className="mt-1 text-xs font-semibold text-[#64748b]">全日制按开始和结束时间自动折算课时费。</div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#64748b]">每小时费用</label>
                <SensitiveAmountField visible={amountsVisible} className="h-9">
                  <Input
                    type="number"
                    min={0}
                    value={courseFeeRule.hourlyRate ?? 0}
                    onChange={(event) => onUpdateCourseFee({ hourlyRate: Math.max(Number(event.target.value), 0) })}
                    className="h-9 bg-white"
                  />
                </SensitiveAmountField>
              </div>
            </div>
          ))}

          <div className="space-y-2 rounded-[14px] border border-[#dbe4ef] bg-white p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-medium">
                关联学生（{courseStudentIds.length} / {activeStudentCount}）
                {courseType === "class" && (
                  <span className="ml-2 text-xs font-bold text-[#64748b]">
                    班课需同年级{firstCourseStudentGrade(courseStudentIds) !== undefined ? `：${firstCourseStudentGrade(courseStudentIds) || "未设置年级"}` : ""}
                  </span>
                )}
                {studentLimitForCourseType(courseType) && courseType !== "one_on_one" && (
                  <span className="ml-2 text-xs font-bold text-[#64748b]">
                    最多选择 {studentLimitForCourseType(courseType)} 人
                  </span>
                )}
              </div>
              <span className="text-xs font-bold text-[#64748b]">
                {courseCampusCustomized ? "已手动选择校区" : "默认校区跟随所选学生档案"}
              </span>
            </div>

            <label className="relative block">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
              <Input
                className="h-10 bg-white pl-9"
                value={newCourseStudentSearch}
                onChange={(event) => setNewCourseStudentSearch(event.target.value)}
                placeholder="搜索学生姓名、学科、校区、年级、学校或备注"
              />
            </label>
            {courseStudentIds.length > 0 && (
              <div className="max-h-20 overflow-y-auto pr-1">
                <div className="flex flex-wrap gap-2">
                  {courseStudentIds.map((studentId) => {
                    const student = vault.students.find((item) => item.id === studentId);
                    return (
                      <button
                        type="button"
                        key={studentId}
                        onClick={() => onToggleCourseStudent(studentId)}
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
            <div className="max-h-[220px] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {addCourseStudentOptions.map((student) => {
                  const isSelected = courseStudentIds.includes(student.id);
                  const selectedGrade = courseType === "class" ? firstCourseStudentGrade(courseStudentIds) : undefined;
                  const isDifferentGrade = courseType === "class" && selectedGrade !== undefined && !isSelected && (student.grade ?? "") !== selectedGrade;
                  const isAtStudentLimit = !isSelected && Boolean(studentLimitForCourseType(courseType)) && courseStudentIds.length >= (studentLimitForCourseType(courseType) ?? 0);
                  return (
                    <button
                      type="button"
                      key={student.id}
                      onClick={() => onToggleCourseStudent(student.id)}
                      disabled={isDifferentGrade || isAtStudentLimit}
                      title={isDifferentGrade ? `班课只能选择 ${selectedGrade} 学生` : isAtStudentLimit ? `最多选择 ${studentLimitForCourseType(courseType)} 人` : undefined}
                      className={`rounded-[10px] border px-3 py-2 text-left text-xs font-bold ${
                        isSelected
                          ? "border-[#ff8617] bg-[#fff7ed] text-[#9a3412]"
                          : isDifferentGrade || isAtStudentLimit
                            ? "cursor-not-allowed border-[#e2e8f0] bg-white text-[#94a3b8]"
                            : student.temporaryTrial
                              ? "border-[#c7d2fe] bg-[#eef0ff] text-[#5161d6]"
                              : "border-[#dbe4ef] bg-white text-[#25324a]"
                      }`}
                    >
                      {student.name} · {student.grade || "未设置年级"} · {campusName(vault, student.defaultCampusId)}{student.temporaryTrial ? " · 试听" : ""}{isDifferentGrade ? " · 年级不符" : ""}
                    </button>
                  );
                })}
              </div>
              {addCourseStudentOptions.length === 0 && (
                <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-white p-5 text-center text-sm font-semibold text-[#64748b]">
                  没有符合条件的学生
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={!courseNameInput.trim() && !suggestedCourseName}>
              <Plus size={15} /> 添加课程
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
