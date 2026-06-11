import type { Dispatch, FormEvent, SetStateAction } from "react";
import { GraduationCap, Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CampusSettingsCard } from "@/frontend/components/CampusSettingsCard";
import { SensitiveAmountField } from "@/frontend/components/SensitiveAmountField";
import { SubjectSettingsCard } from "@/frontend/components/SubjectSettingsCard";
import type { Campus, ClassFeeTier, CourseType, SalaryGradeStage, SalaryGradeStageRateConfig, TeacherVault } from "@/shared/types";
import { backupFeeRuleForCourseType, classHeadcountStageRateForRule, feeRuleForCourseType, fixedFeeForRule, normalizedClassFeeTiers, salaryGradeStageLabels, salaryGradeStageOrder, todayIso } from "@/frontend/lib/calculations";

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

type CustomCourseTypeTemplate = "class" | "non_class";

type CampusCourseSettingsPanelProps = {
  amountsVisible: boolean;
  archiveRowClass: (panel: "campuses", id: string) => string;
  campusAddressInput: string;
  campusInUse: (campusId: string) => boolean;
  campusNameInput: string;
  campusNoteInput: string;
  campusOptions: Campus[];
  confirm: (request: ConfirmRequest) => void;
  courseTypeInUse: (type: CourseType) => boolean;
  courseTypeMessage: string;
  customCourseTypeBaseFee: number;
  customCourseTypeInput: string;
  customCourseTypeMinStudents: number;
  customCourseTypePerStudentFee: number;
  customCourseTypeTemplate: CustomCourseTypeTemplate;
  editingCampus: Campus | null;
  editingCustomCourseTypeId: CourseType | "";
  editingCustomCourseTypeLabel: string;
  editingSubject: string;
  editingSubjectInput: string;
  flashArchiveRow: (panel: "campuses", id: string) => void;
  managedCourseTypes: CourseTypeOption[];
  onAddCampus: (event: FormEvent) => void;
  onAddCustomCourseType: () => void;
  onAddSubject: () => void;
  onCancelCustomCourseTypeEdit: () => void;
  onCancelEditSubject: () => void;
  onDeleteCampus: (campusId: string) => void;
  onDeleteSubject: (subject: string) => void;
  onRequestDeleteCourseType: (courseTypeOption: { id: CourseType; label: string }) => void;
  onRequestSyncCourseTypeFeeRuleToCourses: (type: CourseType) => void;
  onResetCourseTypeFeeRule: (type: CourseType) => void;
  onSaveCustomCourseType: () => void;
  onSaveSubject: () => void;
  onStartEditCustomCourseType: (courseTypeOption: { id: CourseType; label: string }) => void;
  onStartEditSubject: (subject: string) => void;
  onUpdateCampus: (campus: Campus) => void;
  onUpdateCourseTypeClassFeeTier: (type: CourseType, tierId: string, patch: Partial<ClassFeeTier>) => void;
  onUpdateCourseTypeStageRate: (type: CourseType, stage: SalaryGradeStage, patch: Partial<SalaryGradeStageRateConfig>) => void;
  onUpdateCourseTypeFixedRule: (type: CourseType, fixedFee: number) => void;
  onUpdateCourseTypeHourlyRule: (type: CourseType, hourlyRate: number) => void;
  setCampusAddressInput: Dispatch<SetStateAction<string>>;
  setCampusNameInput: Dispatch<SetStateAction<string>>;
  setCampusNoteInput: Dispatch<SetStateAction<string>>;
  setCourseTypeMessage: Dispatch<SetStateAction<string>>;
  setCustomCourseTypeBaseFee: Dispatch<SetStateAction<number>>;
  setCustomCourseTypeInput: Dispatch<SetStateAction<string>>;
  setCustomCourseTypeMinStudents: Dispatch<SetStateAction<number>>;
  setCustomCourseTypePerStudentFee: Dispatch<SetStateAction<number>>;
  setCustomCourseTypeTemplate: Dispatch<SetStateAction<CustomCourseTypeTemplate>>;
  setEditingCampus: Dispatch<SetStateAction<Campus | null>>;
  setEditingCustomCourseTypeLabel: Dispatch<SetStateAction<string>>;
  setEditingSubjectInput: Dispatch<SetStateAction<string>>;
  setSubjectInput: Dispatch<SetStateAction<string>>;
  setSubjectMessage: Dispatch<SetStateAction<string>>;
  subjectInUse: (subject: string) => boolean;
  subjectInput: string;
  subjectMessage: string;
  subjectOptions: string[];
  vault: TeacherVault;
};

export function CampusCourseSettingsPanel({
  amountsVisible,
  archiveRowClass,
  campusAddressInput,
  campusInUse,
  campusNameInput,
  campusNoteInput,
  campusOptions,
  confirm,
  courseTypeInUse,
  courseTypeMessage,
  customCourseTypeBaseFee,
  customCourseTypeInput,
  customCourseTypeMinStudents,
  customCourseTypePerStudentFee,
  customCourseTypeTemplate,
  editingCampus,
  editingCustomCourseTypeId,
  editingCustomCourseTypeLabel,
  editingSubject,
  editingSubjectInput,
  flashArchiveRow,
  managedCourseTypes,
  onAddCampus,
  onAddCustomCourseType,
  onAddSubject,
  onCancelCustomCourseTypeEdit,
  onCancelEditSubject,
  onDeleteCampus,
  onDeleteSubject,
  onRequestDeleteCourseType,
  onRequestSyncCourseTypeFeeRuleToCourses,
  onResetCourseTypeFeeRule,
  onSaveCustomCourseType,
  onSaveSubject,
  onStartEditCustomCourseType,
  onStartEditSubject,
  onUpdateCampus,
  onUpdateCourseTypeClassFeeTier,
  onUpdateCourseTypeStageRate,
  onUpdateCourseTypeFixedRule,
  onUpdateCourseTypeHourlyRule,
  setCampusAddressInput,
  setCampusNameInput,
  setCampusNoteInput,
  setCourseTypeMessage,
  setCustomCourseTypeBaseFee,
  setCustomCourseTypeInput,
  setCustomCourseTypeMinStudents,
  setCustomCourseTypePerStudentFee,
  setCustomCourseTypeTemplate,
  setEditingCampus,
  setEditingCustomCourseTypeLabel,
  setEditingSubjectInput,
  setSubjectInput,
  setSubjectMessage,
  subjectInUse,
  subjectInput,
  subjectMessage,
  subjectOptions,
  vault
}: CampusCourseSettingsPanelProps) {
  const customTemplateIsClass = customCourseTypeTemplate === "class";
  const customTemplateHint = customTemplateIsClass
    ? "班课规则：按教师课时费等级里的班课底费计算，默认 5 人，从第 6 人开始加人头费。"
    : "非班课规则：按教师课时费等级里的一对一基础费计算，默认 1 人，从第 2 人开始加人头费。";
  const today = todayIso();
  const courseTypeMessageIsSuccess = courseTypeMessage.startsWith("同步完成：");

  return (
    <div className="space-y-4">
      <CampusSettingsCard
        archiveRowClass={archiveRowClass}
        campusAddressInput={campusAddressInput}
        campusInUse={campusInUse}
        campusNameInput={campusNameInput}
        campusNoteInput={campusNoteInput}
        campusOptions={campusOptions}
        confirm={confirm}
        editingCampus={editingCampus}
        flashArchiveRow={flashArchiveRow}
        onAddCampus={onAddCampus}
        onDeleteCampus={onDeleteCampus}
        onUpdateCampus={onUpdateCampus}
        setCampusAddressInput={setCampusAddressInput}
        setCampusNameInput={setCampusNameInput}
        setCampusNoteInput={setCampusNoteInput}
        setEditingCampus={setEditingCampus}
        vault={vault}
      />

      <SubjectSettingsCard
        confirm={confirm}
        editingSubject={editingSubject}
        editingSubjectInput={editingSubjectInput}
        onAddSubject={onAddSubject}
        onCancelEditSubject={onCancelEditSubject}
        onDeleteSubject={onDeleteSubject}
        onSaveSubject={onSaveSubject}
        onStartEditSubject={onStartEditSubject}
        setEditingSubjectInput={setEditingSubjectInput}
        setSubjectInput={setSubjectInput}
        setSubjectMessage={setSubjectMessage}
        subjectInUse={subjectInUse}
        subjectInput={subjectInput}
        subjectMessage={subjectMessage}
        subjectOptions={subjectOptions}
      />

      <Card className="h-fit overflow-hidden">
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                <GraduationCap size={14} /> 班型管理
              </div>
              <CardTitle className="text-lg">班型与计费规则</CardTitle>
              <CardDescription>
                班型只维护名称和班课/非班课规则；<span className="font-bold">常规课程金额统一跟随教师课时费等级，并按课程学生年级阶段自动取对应金额。</span>
              </CardDescription>
              <div className="mt-1 text-sm font-semibold leading-5 text-[#64748b]">
                新增课程档案时只需要选择班型、课程名称和关联学生；课时费不再需要在课程档案里单独选择来源。
              </div>
            </div>
            <Badge variant="secondary" className="w-fit">{managedCourseTypes.length} 个可配置</Badge>
          </div>
          <div className="rounded-[14px] border border-[#fed7aa] bg-[#fff7ed] p-3">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_200px_auto] lg:items-center">
              <Input
                value={customCourseTypeInput}
                onChange={(event) => {
                  setCustomCourseTypeInput(event.target.value);
                  if (courseTypeMessage) setCourseTypeMessage("");
                }}
                placeholder="自定义班级名称，例如：一对一、一对二、班课"
                maxLength={24}
                className={`h-10 border-[#fdba74] bg-white text-[#7c2d12] placeholder:text-[#d97706]/70 focus:border-[#ff8617] focus:ring-2 focus:ring-[#ff8617]/20 ${courseTypeMessage ? "border-[#fca5a5] bg-[#fff1f2]" : ""}`}
              />
              <Select
                value={customCourseTypeTemplate}
                onChange={(event) => {
                  const nextTemplate = event.target.value as CustomCourseTypeTemplate;
                  setCustomCourseTypeTemplate(nextTemplate);
                  setCustomCourseTypeMinStudents(nextTemplate === "class" ? 5 : 1);
                }}
                className="h-10 border-[#fdba74] bg-white text-[#7c2d12]"
                aria-label="选择自定义班型计费规则"
              >
                <option value="class">班课计费规则</option>
                <option value="non_class">非班课计费规则</option>
              </Select>
              <Button
                type="button"
                variant="outline"
                className="h-10 border-[#fdba74] bg-white text-[#9a3412] hover:bg-[#ffedd5]"
                disabled={!customCourseTypeInput.trim()}
                onClick={onAddCustomCourseType}
              >
                <Plus size={14} /> 添加班型
              </Button>
            </div>
            <div className="mt-3 rounded-[12px] border border-[#fdba74] bg-white/70 px-3 py-2 text-xs font-bold leading-5 text-[#9a3412]">
              {customTemplateHint} 金额来自“教师课时费等级”，会自动支持自定义等级和小学、初中、高中不同年级阶段。
            </div>
          </div>
          {courseTypeMessage && (
            <div className={`rounded-[12px] border px-3 py-2 text-sm font-bold ${
              courseTypeMessageIsSuccess
                ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]"
                : "border-[#fecaca] bg-[#fff1f2] text-[#b91c1c]"
            }`}>
              {courseTypeMessage}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {managedCourseTypes.map((typeOption) => {
            const type = typeOption.value;
            const savedRule = feeRuleForCourseType(vault, type);
            const rule = backupFeeRuleForCourseType(type, savedRule);
            const tier = normalizedClassFeeTiers(rule)[0];
            const isCustom = type.startsWith("custom_");
            const isEditingType = editingCustomCourseTypeId === type;
            const used = courseTypeInUse(type);
            const isClassType = tier.minStudents > 1;
            const backupMinStudentsLabel = isClassType ? "班课起算人数" : "非班课起算人数";
            const backupBaseFeeLabel = isClassType ? "班课底费" : "一对一基础费";
            const backupHint = isClassType
              ? "班课按「班课底费 + max(到课人数 - 5, 0) * 人头加价」计算。"
              : "非班课按「一对一基础费 + max(到课人数 - 1, 0) * 人头加价」计算。";
            const juniorStageRate = classHeadcountStageRateForRule(rule, type, "junior_3");
            const juniorBaseValue = isClassType ? juniorStageRate.classBaseFee : juniorStageRate.oneOnOneFee;
            const linkedCourseIds = new Set(vault.courseGroups.filter((course) => course.type === type).map((course) => course.id));
            const linkedCourseCount = linkedCourseIds.size;
            const linkedLessonCount = vault.lessons.filter((lesson) => lesson.type === type || linkedCourseIds.has(lesson.courseGroupId)).length;
            const legacyLessonCount = vault.lessons.filter((lesson) => lesson.type === type && !linkedCourseIds.has(lesson.courseGroupId)).length;
            const futureSyncLessonCount = vault.lessons.filter((lesson) =>
              linkedCourseIds.has(lesson.courseGroupId) &&
              !lesson.linkedOriginalLessonId &&
              (lesson.status === "scheduled" || lesson.status === "draft") &&
              lesson.date >= today
            ).length;
            const customDeleteBlockedReason = linkedCourseCount > 0
              ? `还有 ${linkedCourseCount} 个课程档案引用这个班型`
              : linkedLessonCount > 0
                ? `还有 ${linkedLessonCount} 节历史课节引用这个班型${legacyLessonCount > 0 ? `，其中 ${legacyLessonCount} 节是旧课节快照` : ""}`
                : "";
            return (
              <div key={type} className="space-y-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {isEditingType ? (
                      <>
                        <Input
                          value={editingCustomCourseTypeLabel}
                          onChange={(event) => {
                            setEditingCustomCourseTypeLabel(event.target.value);
                            if (courseTypeMessage) setCourseTypeMessage("");
                          }}
                          maxLength={24}
                          className={`h-9 max-w-[220px] border-[#fdba74] bg-white text-sm font-bold text-[#7c2d12] ${courseTypeMessage ? "border-[#fca5a5] bg-[#fff1f2]" : ""}`}
                        />
                        <Button type="button" size="sm" className="h-9" disabled={!editingCustomCourseTypeLabel.trim()} onClick={onSaveCustomCourseType}>
                          <Save size={14} /> 保存
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="h-9" onClick={onCancelCustomCourseTypeEdit}>
                          <X size={14} /> 取消
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="truncate text-base font-extrabold text-[#061226]">{typeOption.label}</span>
                        <Badge variant={isCustom ? "amber" : "sky"}>{isCustom ? "自定义" : "内置"}</Badge>
                        {usesSalaryGradeByDefault(type) && <Badge variant="sage">等级计费优先</Badge>}
                        {used && <span className="text-xs font-extrabold text-[#15803d]">使用中</span>}
                      </>
                    )}
                  </div>
                  {!isEditingType && (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => onStartEditCustomCourseType({ id: type, label: typeOption.label })}>
                        <Pencil size={14} /> 改名
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={linkedCourseCount === 0}
                        onClick={() => onRequestSyncCourseTypeFeeRuleToCourses(type)}
                        title={linkedCourseCount === 0 ? "这个班型还没有已添加课程" : "把当前班课/非班课规则同步到同班型已有课程"}
                      >
                        <RefreshCw size={14} /> 同步到已有课程
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={isCustom && used}
                        onClick={() => onRequestDeleteCourseType({ id: type, label: typeOption.label })}
                        title={isCustom && used ? `${customDeleteBlockedReason}，不能直接删除` : isCustom ? "直接删除自定义班型" : "内置班型会从主列表和添加课程档案中移除"}
                      >
                        <Trash2 size={14} /> 删除
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => onResetCourseTypeFeeRule(type)}>
                        恢复默认规则
                      </Button>
                    </div>
                  )}
                </div>
                {!isEditingType && used && (
                  <div className="flex flex-wrap gap-2 text-xs font-bold">
                    <Badge variant="secondary">已添加课程 {linkedCourseCount}</Badge>
                    <Badge variant="outline">已生成课节 {linkedLessonCount}</Badge>
                    {legacyLessonCount > 0 && <Badge variant="amber">旧课节快照 {legacyLessonCount}</Badge>}
                    <Badge variant="sky">可刷新未来课节 {futureSyncLessonCount}</Badge>
                    <span className="flex items-center text-[#64748b]">同步不会改已完成历史课节金额快照</span>
                  </div>
                )}
                {!isEditingType && isCustom && used && customDeleteBlockedReason && (
                  <div className="rounded-[10px] border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-xs font-bold leading-5 text-[#9a3412]">
                    暂不能删除：{customDeleteBlockedReason}。如果课程档案已经改成新班型，但历史课节仍显示旧班型，可到“课时列表”选择对应日期后使用“刷新当天课节”。
                  </div>
                )}
                {rule.mode === "class_headcount" ? (
                  <div className="rounded-[12px] border border-[#e8eef6] bg-white p-3">
                    <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm font-extrabold text-[#061226]">计费规则</div>
                      <div className="text-xs font-semibold text-[#64748b]">{backupHint}</div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center">
                      <Select
                        value={isClassType ? "class" : "non_class"}
                        onChange={(event) => onUpdateCourseTypeClassFeeTier(type, tier.id, { minStudents: event.target.value === "class" ? 5 : 1 })}
                        className="h-9 bg-white"
                        aria-label="选择班型计费规则"
                      >
                        <option value="class">班课计费规则</option>
                        <option value="non_class">非班课计费规则</option>
                      </Select>
                      <div className="rounded-[10px] border border-[#e8eef6] bg-[#f8fbff] px-3 py-2 text-xs font-semibold leading-5 text-[#64748b]">
                        所有班型都可以手动选择班课或非班课规则。金额统一从“教师课时费等级”读取，课程学生年级会自动对应小学、初中、高中阶段；自定义等级也会被识别。
                      </div>
                    </div>
                  </div>
                ) : type === "trial" ? (
                  <div className="rounded-[12px] border border-[#e8eef6] bg-white p-3">
                    <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm font-extrabold text-[#061226]">试听单次费用</div>
                      <div className="text-xs font-semibold text-[#64748b]">新建试听课程时自动带入，不按小时相乘。</div>
                    </div>
                    <SensitiveAmountField visible={amountsVisible} className="h-9">
                      <Input
                        type="number"
                        min={0}
                        value={fixedFeeForRule(rule)}
                        onChange={(event) => onUpdateCourseTypeFixedRule(type, Math.max(Number(event.target.value), 0))}
                        className="h-9 bg-white"
                      />
                    </SensitiveAmountField>
                  </div>
                ) : (
                  <div className="rounded-[12px] border border-[#e8eef6] bg-white p-3">
                    <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm font-extrabold text-[#061226]">全日制每小时费用</div>
                      <div className="text-xs font-semibold text-[#64748b]">仅全日制按开始和结束时间使用每小时费用折算。</div>
                    </div>
                    <SensitiveAmountField visible={amountsVisible} className="h-9">
                      <Input
                        type="number"
                        min={0}
                        value={rule.hourlyRate ?? 0}
                        onChange={(event) => onUpdateCourseTypeHourlyRule(type, Math.max(Number(event.target.value), 0))}
                        className="h-9 bg-white"
                      />
                    </SensitiveAmountField>
                  </div>
                )}
              </div>
            );
          })}
          {managedCourseTypes.length === 0 && (
            <div className="rounded-[12px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-5 text-center text-sm font-semibold text-[#64748b]">
              暂无可配置班型，可以先添加自定义班型。
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function usesSalaryGradeByDefault(type: CourseType): boolean {
  return type !== "trial" && type !== "full_time";
}
