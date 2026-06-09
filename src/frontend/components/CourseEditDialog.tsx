import type { Dispatch, ReactNode, SetStateAction } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Save, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SensitiveAmountField } from "@/frontend/components/SensitiveAmountField";
import type { Campus, ClassFeeTier, CourseGroup, CourseType, SalaryGradeId, Student, TeacherVault } from "@/shared/types";
import { calculateClassHeadcountFee, defaultSalaryGradeRule, fixedFeeForRule, normalizedClassFeeTiers, resolveSalaryGradeRule, salaryGradeLabel } from "@/frontend/lib/calculations";
import { formatPrivateMoney, studentLimitForCourseType } from "@/frontend/lib/helpers";

type CourseTypeOption = {
  value: CourseType;
  label: string;
};

type CourseFeeMode = "salary_default" | "salary_specific" | "custom";

type CourseEditDialogProps = {
  amountsVisible: boolean;
  campusOptions: Campus[];
  courseStudentCampusFilter: string;
  courseStudentGradeFilter: string;
  courseStudentScope: "all" | "selected" | "available";
  courseStudentSearch: string;
  editingCourse: CourseGroup | null;
  editingCourseStudentOptions: Student[];
  editingCourseTypeOptions: CourseTypeOption[];
  feeModeValue: (rule: CourseGroup["feeRule"]) => CourseFeeMode;
  firstCourseStudentGrade: (studentIds: string[]) => string | undefined;
  gradeFilterOptions: string[];
  hasUnsetGradeFilterOption: boolean;
  onCancel: () => void;
  onChangeCourseType: (type: CourseType) => void;
  onChangeFeeMode: (mode: CourseFeeMode) => void;
  onChangeSalaryGrade: (salaryGradeId: string) => void;
  onSave: () => void;
  onToggleCourseStudent: (studentId: string) => void;
  onUpdateClassFeeTier: (tierId: string, patch: Partial<ClassFeeTier>) => void;
  onUpdateCourse: (patch: Partial<CourseGroup>) => void;
  onUpdateCourseFee: (patch: Partial<CourseGroup["feeRule"]>) => void;
  onUpdateTrialFixedFee: (fixedFee: number) => void;
  renderSalaryGradeOptions: (currentId?: SalaryGradeId) => ReactNode;
  setCourseStudentCampusFilter: Dispatch<SetStateAction<string>>;
  setCourseStudentGradeFilter: Dispatch<SetStateAction<string>>;
  setCourseStudentScope: Dispatch<SetStateAction<"all" | "selected" | "available">>;
  setCourseStudentSearch: Dispatch<SetStateAction<string>>;
  subjectOptions: string[];
  supportsSalaryGradeFee: (type: CourseType) => boolean;
  vault: TeacherVault;
};

export function CourseEditDialog({
  amountsVisible,
  campusOptions,
  courseStudentCampusFilter,
  courseStudentGradeFilter,
  courseStudentScope,
  courseStudentSearch,
  editingCourse,
  editingCourseStudentOptions,
  editingCourseTypeOptions,
  feeModeValue,
  firstCourseStudentGrade,
  gradeFilterOptions,
  hasUnsetGradeFilterOption,
  onCancel,
  onChangeCourseType,
  onChangeFeeMode,
  onChangeSalaryGrade,
  onSave,
  onToggleCourseStudent,
  onUpdateClassFeeTier,
  onUpdateCourse,
  onUpdateCourseFee,
  onUpdateTrialFixedFee,
  renderSalaryGradeOptions,
  setCourseStudentCampusFilter,
  setCourseStudentGradeFilter,
  setCourseStudentScope,
  setCourseStudentSearch,
  subjectOptions,
  supportsSalaryGradeFee,
  vault
}: CourseEditDialogProps) {
  return (
    <AnimatePresence>
      {editingCourse && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#061226]/36 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onCancel();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="flex max-h-[90vh] w-full max-w-[920px] flex-col overflow-hidden rounded-[18px] border border-[#dbe4ef] bg-white shadow-[0_28px_80px_rgba(6,18,38,0.24)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#e8eef6] p-5">
              <div className="min-w-0">
                <div className="text-lg font-extrabold text-[#061226]">编辑课程</div>
                <div className="mt-1 truncate text-sm font-semibold text-[#64748b]">{editingCourse.name}</div>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={onCancel} aria-label="关闭课程编辑弹窗">
                <X size={17} />
              </Button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Input
                  value={editingCourse.name}
                  onChange={(event) => onUpdateCourse({ name: event.target.value })}
                  placeholder="课程档案名称"
                />
                <Select value={editingCourse.subject || subjectOptions[0] || "未设置"} onChange={(event) => onUpdateCourse({ subject: event.target.value })}>
                  {subjectOptions.map((subject) => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </Select>
                <Select
                  value={editingCourse.type}
                  onChange={(event) => onChangeCourseType(event.target.value as CourseType)}
                >
                  {editingCourseTypeOptions.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </Select>
                <Select
                  value={editingCourse.defaultCampusId ?? ""}
                  onChange={(event) => onUpdateCourse({ defaultCampusId: event.target.value || undefined })}
                >
                  <option value="">未设置校区</option>
                  {campusOptions.map((campus) => (
                    <option key={campus.id} value={campus.id}>{campus.name}</option>
                  ))}
                </Select>
                <Select
                  value={editingCourse.status}
                  onChange={(event) => onUpdateCourse({ status: event.target.value as CourseGroup["status"] })}
                  className="md:col-span-2"
                >
                  <option value="active">启用</option>
                  <option value="paused">暂停</option>
                </Select>
              </div>

              {supportsSalaryGradeFee(editingCourse.type) && (
                <div className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
                  <div>
                    <div className="text-sm font-extrabold text-[#061226]">课时费来源</div>
                    <div className="mt-1 text-xs font-semibold text-[#64748b]">
                      保存后只会同步未来待上课课节；已完成课时保留原金额快照。
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Select value={feeModeValue(editingCourse.feeRule)} onChange={(event) => onChangeFeeMode(event.target.value as CourseFeeMode)}>
                      <option value="salary_default">跟随老师默认课时费等级</option>
                      <option value="salary_specific">指定课时费等级</option>
                      <option value="custom">自定义课时费</option>
                    </Select>
                    {editingCourse.feeRule.mode === "salary_grade" && editingCourse.feeRule.salaryGradeSource === "specific" && (
                      <Select value={editingCourse.feeRule.salaryGradeId ?? vault.profile.defaultSalaryGradeId ?? defaultSalaryGradeRule(vault).id} onChange={(event) => onChangeSalaryGrade(event.target.value)}>
                        {renderSalaryGradeOptions(editingCourse.feeRule.salaryGradeId ?? vault.profile.defaultSalaryGradeId)}
                      </Select>
                    )}
                  </div>
                  {editingCourse.feeRule.mode === "salary_grade" && (
                    <div className="rounded-[12px] border border-[#e8eef6] bg-white px-3 py-2 text-xs font-bold leading-5 text-[#475569]">
                      {resolveSalaryGradeRule(vault, editingCourse.feeRule)
                        ? (() => {
                            const rule = resolveSalaryGradeRule(vault, editingCourse.feeRule);
                            return rule
                              ? `${salaryGradeLabel(rule)}：底薪 ${formatPrivateMoney(rule.baseSalary, amountsVisible)}，一对一 ${formatPrivateMoney(rule.oneOnOneFee, amountsVisible)}，班课底费 ${formatPrivateMoney(rule.classBaseFee, amountsVisible)}，人头加价 ${formatPrivateMoney(rule.headcountIncrementFee, amountsVisible)}。`
                              : "";
                          })()
                        : "还没有设置老师默认课时费等级，请先在老师个人信息里设置，或改为指定课时费等级。"}
                    </div>
                  )}
                </div>
              )}

              {editingCourse.feeRule.mode !== "salary_grade" && (editingCourse.feeRule.mode === "class_headcount" ? (
                <div className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
                  <div>
                    <div className="text-sm font-extrabold text-[#061226]">人数计费模板</div>
                    <div className="mt-1 text-xs font-semibold text-[#64748b]">
                      当前关联 {editingCourse.studentIds.length} 人，2小时标准课预计 {formatPrivateMoney(calculateClassHeadcountFee(editingCourse.feeRule, editingCourse.studentIds.length), amountsVisible)}，实际按上课时长 / 2 折算。
                    </div>
                  </div>
                  {normalizedClassFeeTiers(editingCourse.feeRule).slice(0, 1).map((tier) => (
                    <div key={tier.id} className="grid grid-cols-1 gap-2 rounded-[12px] border border-[#e8eef6] bg-white p-2 sm:grid-cols-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-[#64748b]">最少人数</label>
                        <Input
                          type="number"
                          min={0}
                          value={tier.minStudents}
                          onChange={(event) => onUpdateClassFeeTier(tier.id, { minStudents: Math.max(Number(event.target.value), 0) })}
                          className="h-9"
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
                            className="h-9"
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
                            className="h-9"
                          />
                        </SensitiveAmountField>
                      </div>
                    </div>
                  ))}
                </div>
              ) : editingCourse.type === "trial" ? (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#64748b]">试听单次费用</label>
                  <div className="text-xs font-semibold text-[#64748b]">按单次试听计费，不按上课时长相乘。</div>
                  <SensitiveAmountField visible={amountsVisible}>
                    <Input
                      type="number"
                      min={0}
                      value={fixedFeeForRule(editingCourse.feeRule)}
                      onChange={(event) => onUpdateTrialFixedFee(Math.max(Number(event.target.value), 0))}
                      placeholder="试听单次费用"
                    />
                  </SensitiveAmountField>
                </div>
              ) : editingCourse.feeRule.mode === "hourly" ? (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#64748b]">每小时费用</label>
                  <SensitiveAmountField visible={amountsVisible}>
                    <Input
                      type="number"
                      value={editingCourse.feeRule.hourlyRate ?? 0}
                      onChange={(event) => onUpdateCourseFee({ hourlyRate: Number(event.target.value) })}
                      placeholder="每小时费用"
                    />
                  </SensitiveAmountField>
                </div>
              ) : null)}

              <div className="space-y-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-medium">
                    关联学生（{editingCourse.studentIds.length} 人）
                    {editingCourse.type === "class" && (
                      <span className="ml-2 text-xs font-bold text-[#64748b]">
                        班课需同年级{firstCourseStudentGrade(editingCourse.studentIds) !== undefined ? `：${firstCourseStudentGrade(editingCourse.studentIds) || "未设置年级"}` : ""}
                      </span>
                    )}
                    {studentLimitForCourseType(editingCourse.type) && editingCourse.type !== "one_on_one" && (
                      <span className="ml-2 text-xs font-bold text-[#64748b]">
                        最多选择 {studentLimitForCourseType(editingCourse.type)} 人
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-bold text-[#64748b]">当前显示 {editingCourseStudentOptions.length} 人</span>
                </div>
                {editingCourse.type === "class" && (
                  <div className="rounded-[10px] border border-[#dbe4ef] bg-white px-3 py-2 text-xs font-semibold leading-5 text-[#64748b]">
                    调整班课档案学生只影响之后按课程档案生成的新课节；已经排好的课节会保留本节自己的学生名单。单节课排错时，可到课程详情里单独移除学生或填写备注。
                  </div>
                )}
                <div className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
                  <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <label className="relative block">
                      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                      <Input
                        className="h-10 bg-white pl-9"
                        value={courseStudentSearch}
                        onChange={(event) => setCourseStudentSearch(event.target.value)}
                        placeholder="搜索学生姓名、学科、校区、年级、学校或备注"
                      />
                    </label>
                    <div className="grid grid-cols-3 rounded-[12px] border border-[#dbe4ef] bg-white p-1">
                      {[
                        { key: "all" as const, label: "全部" },
                        { key: "selected" as const, label: "已关联" },
                        { key: "available" as const, label: "未关联" }
                      ].map((item) => (
                        <button
                          type="button"
                          key={item.key}
                          onClick={() => setCourseStudentScope(item.key)}
                          className={`rounded-[9px] px-2 py-2 text-xs font-bold ${
                            courseStudentScope === item.key ? "bg-[#1557c2] text-white" : "text-[#25324a]"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Select value={courseStudentGradeFilter} onChange={(event) => setCourseStudentGradeFilter(event.target.value)} className="h-10">
                      <option value="all">全部年级</option>
                      {hasUnsetGradeFilterOption && <option value="__unset">未设置年级</option>}
                      {gradeFilterOptions.map((grade) => (
                        <option key={grade} value={grade}>{grade}</option>
                      ))}
                    </Select>
                    <Select value={courseStudentCampusFilter} onChange={(event) => setCourseStudentCampusFilter(event.target.value)} className="h-10">
                      <option value="all">全部校区</option>
                      {campusOptions.map((campus) => (
                        <option key={campus.id} value={campus.id}>{campus.name}</option>
                      ))}
                    </Select>
                  </div>
                  {editingCourse.studentIds.length > 0 && (
                    <div className="mt-3 max-h-20 overflow-y-auto pr-1">
                      <div className="flex flex-wrap gap-2">
                        {editingCourse.studentIds.map((studentId) => {
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
                  <div className="mt-3 max-h-[260px] overflow-y-auto pr-1">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {editingCourseStudentOptions.map((student) => {
                        const isSelected = editingCourse.studentIds.includes(student.id);
                        const selectedGrade = editingCourse.type === "class" ? firstCourseStudentGrade(editingCourse.studentIds) : undefined;
                        const isDifferentGrade = editingCourse.type === "class" && selectedGrade !== undefined && !isSelected && (student.grade ?? "") !== selectedGrade;
                        const isAtStudentLimit = !isSelected && Boolean(studentLimitForCourseType(editingCourse.type)) && editingCourse.studentIds.length >= (studentLimitForCourseType(editingCourse.type) ?? 0);
                        return (
                          <button
                            type="button"
                            key={student.id}
                            onClick={() => onToggleCourseStudent(student.id)}
                            disabled={isDifferentGrade || isAtStudentLimit}
                            title={isDifferentGrade ? `班课只能选择 ${selectedGrade} 学生` : isAtStudentLimit ? `最多选择 ${studentLimitForCourseType(editingCourse.type)} 人` : undefined}
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
                            {student.name} · {student.grade || "未设置年级"}{student.status === "paused" ? " · 已归档" : ""}{student.temporaryTrial ? " · 试听" : ""}{isDifferentGrade ? " · 年级不符" : ""}
                          </button>
                        );
                      })}
                    </div>
                    {editingCourseStudentOptions.length === 0 && (
                      <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-white p-5 text-center text-sm font-semibold text-[#64748b]">
                        没有符合条件的学生
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-[#e8eef6] bg-[#f8fbff] p-4">
              <Button type="button" onClick={onSave} disabled={!editingCourse.name.trim()}>
                <Save size={14} /> 保存
              </Button>
              <Button type="button" variant="outline" onClick={onCancel}>
                <X size={14} /> 取消
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
