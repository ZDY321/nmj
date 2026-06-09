import type { Dispatch, FormEvent, SetStateAction } from "react";
import { motion } from "framer-motion";
import { BookOpen, Building2, GraduationCap, MapPin, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SensitiveAmountField } from "@/frontend/components/SensitiveAmountField";
import type { Campus, ClassFeeTier, CourseType, TeacherVault } from "@/shared/types";
import { defaultClassFeeTiers, defaultFeeRuleForCourseType, feeRuleForCourseType, fixedFeeForRule, normalizedClassFeeTiers } from "@/frontend/lib/calculations";

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
  customCourseTypeHourlyRate: number;
  customCourseTypeInput: string;
  customCourseTypeMinStudents: number;
  customCourseTypePerStudentFee: number;
  customCourseTypeTemplate: "class" | "hourly";
  deletedBuiltInCourseTypes: CourseTypeOption[];
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
  onResetCourseTypeFeeRule: (type: CourseType) => void;
  onRestoreCourseType: (courseType: CourseType) => void;
  onSaveCustomCourseType: () => void;
  onSaveSubject: () => void;
  onStartEditCustomCourseType: (courseTypeOption: { id: CourseType; label: string }) => void;
  onStartEditSubject: (subject: string) => void;
  onUpdateCampus: (campus: Campus) => void;
  onUpdateCourseTypeClassFeeTier: (type: CourseType, tierId: string, patch: Partial<ClassFeeTier>) => void;
  onUpdateCourseTypeFixedRule: (type: CourseType, fixedFee: number) => void;
  onUpdateCourseTypeHourlyRule: (type: CourseType, hourlyRate: number) => void;
  setCampusAddressInput: Dispatch<SetStateAction<string>>;
  setCampusNameInput: Dispatch<SetStateAction<string>>;
  setCampusNoteInput: Dispatch<SetStateAction<string>>;
  setCourseTypeMessage: Dispatch<SetStateAction<string>>;
  setCustomCourseTypeBaseFee: Dispatch<SetStateAction<number>>;
  setCustomCourseTypeHourlyRate: Dispatch<SetStateAction<number>>;
  setCustomCourseTypeInput: Dispatch<SetStateAction<string>>;
  setCustomCourseTypeMinStudents: Dispatch<SetStateAction<number>>;
  setCustomCourseTypePerStudentFee: Dispatch<SetStateAction<number>>;
  setCustomCourseTypeTemplate: Dispatch<SetStateAction<"class" | "hourly">>;
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
  customCourseTypeHourlyRate,
  customCourseTypeInput,
  customCourseTypeMinStudents,
  customCourseTypePerStudentFee,
  customCourseTypeTemplate,
  deletedBuiltInCourseTypes,
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
  onResetCourseTypeFeeRule,
  onRestoreCourseType,
  onSaveCustomCourseType,
  onSaveSubject,
  onStartEditCustomCourseType,
  onStartEditSubject,
  onUpdateCampus,
  onUpdateCourseTypeClassFeeTier,
  onUpdateCourseTypeFixedRule,
  onUpdateCourseTypeHourlyRule,
  setCampusAddressInput,
  setCampusNameInput,
  setCampusNoteInput,
  setCourseTypeMessage,
  setCustomCourseTypeBaseFee,
  setCustomCourseTypeHourlyRate,
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
  return (
    <div className="space-y-4">
      <Card className="h-fit overflow-hidden">
        <CardHeader className="gap-3">
          <div className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-[#ff8617]" />
              <CardTitle className="text-lg">校区与班型</CardTitle>
            </div>
            <Badge variant="secondary">{vault.campuses.length} 个</Badge>
          </div>
          <form onSubmit={onAddCampus} className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto]">
            <Input
              value={campusNameInput}
              onChange={(event) => setCampusNameInput(event.target.value)}
              placeholder="校区名称，例如：中心校区"
            />
            <Input
              value={campusAddressInput}
              onChange={(event) => setCampusAddressInput(event.target.value)}
              placeholder="地址，例如：人民路 88 号"
            />
            <Input
              value={campusNoteInput}
              onChange={(event) => setCampusNoteInput(event.target.value)}
              placeholder="备注，可选"
            />
            <Button type="submit">
              <Plus size={15} /> 添加校区
            </Button>
          </form>
        </CardHeader>
        <CardContent className="max-h-[520px] space-y-0 overflow-y-auto pr-2">
          {campusOptions.map((campus) => {
            const isEditing = editingCampus?.id === campus.id;
            const used = campusInUse(campus.id);
            return (
              <motion.div
                key={campus.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={archiveRowClass("campuses", campus.id)}
              >
                {isEditing && editingCampus ? (
                  <div className="space-y-3">
                    <Input
                      value={editingCampus.name}
                      onChange={(event) => setEditingCampus({ ...editingCampus, name: event.target.value })}
                      placeholder="校区名称"
                    />
                    <Input
                      value={editingCampus.address ?? ""}
                      onChange={(event) => setEditingCampus({ ...editingCampus, address: event.target.value })}
                      placeholder="地址"
                    />
                    <Input
                      value={editingCampus.note ?? ""}
                      onChange={(event) => setEditingCampus({ ...editingCampus, note: event.target.value })}
                      placeholder="备注"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          if (!editingCampus.name.trim()) return;
                          const campusId = editingCampus.id;
                          onUpdateCampus({ ...editingCampus, name: editingCampus.name.trim() });
                          setEditingCampus(null);
                          flashArchiveRow("campuses", campusId);
                        }}
                      >
                        <Save size={14} /> 保存
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          flashArchiveRow("campuses", editingCampus.id);
                          setEditingCampus(null);
                        }}
                      >
                        <X size={14} /> 取消
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eaf2ff]">
                      <Building2 size={16} className="text-[#1557c2]" />
                    </div>
                    <div className="min-w-0 flex-1">
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
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 rounded-[9px] p-0"
                        title="编辑校区"
                        aria-label={`编辑校区 ${campus.name}`}
                        onClick={() => setEditingCampus(campus)}
                      >
                        <Pencil size={13} />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="h-8 w-8 rounded-[9px] p-0"
                        disabled={used}
                        title={used ? "已有学生、课程或课时引用，不能直接删除" : "删除校区"}
                        aria-label={`删除校区 ${campus.name}`}
                        onClick={() =>
                          confirm({
                            title: `删除校区「${campus.name}」？`,
                            description: "删除后无法从校区与班型中恢复。",
                            confirmLabel: "删除",
                            tone: "danger",
                            onConfirm: () => onDeleteCampus(campus.id)
                          })
                        }
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
          {vault.campuses.length === 0 && (
            <p className="py-8 text-center text-sm text-(--color-muted-foreground)">还没有校区</p>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit overflow-hidden">
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                <BookOpen size={14} /> 科目管理
              </div>
              <CardTitle className="text-lg">科目列表</CardTitle>
              <CardDescription>新增和编辑课程时统一从这里选择科目；修改科目名称会同步更新已有课程。</CardDescription>
            </div>
            <Badge variant="secondary" className="w-fit">{subjectOptions.length} 个</Badge>
          </div>
          <div className="grid grid-cols-1 gap-2 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              value={subjectInput}
              onChange={(event) => {
                setSubjectInput(event.target.value);
                if (subjectMessage) setSubjectMessage("");
              }}
              placeholder="新增科目，例如：英语、物理"
              maxLength={24}
              className="bg-white"
            />
            <Button type="button" onClick={onAddSubject} disabled={!subjectInput.trim()}>
              <Plus size={14} /> 添加科目
            </Button>
          </div>
          {subjectMessage && (
            <div className="rounded-[12px] border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm font-bold text-[#b91c1c]">
              {subjectMessage}
            </div>
          )}
        </CardHeader>
        <CardContent className="max-h-[360px] space-y-2 overflow-y-auto pr-2">
          {subjectOptions.map((subject) => {
            const isEditing = editingSubject === subject;
            const used = subjectInUse(subject);
            return (
              <motion.div
                key={subject}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-[14px] border border-[#dbe4ef] bg-white p-3"
              >
                {isEditing ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <Input
                      value={editingSubjectInput}
                      onChange={(event) => {
                        setEditingSubjectInput(event.target.value);
                        if (subjectMessage) setSubjectMessage("");
                      }}
                      maxLength={24}
                      className="bg-white"
                    />
                    <Button type="button" size="sm" onClick={onSaveSubject} disabled={!editingSubjectInput.trim()}>
                      <Save size={14} /> 保存
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={onCancelEditSubject}>
                      <X size={14} /> 取消
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eaf2ff]">
                      <BookOpen size={16} className="text-[#1557c2]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold text-[#061226]">{subject}</span>
                      <span className="mt-1 block text-xs font-semibold text-[#64748b]">
                        {used ? "已有课程使用" : "暂无课程使用"}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 rounded-[9px] p-0"
                        onClick={() => onStartEditSubject(subject)}
                        title="编辑科目"
                      >
                        <Pencil size={13} />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="h-8 w-8 rounded-[9px] p-0"
                        disabled={used}
                        title={used ? "已有课程使用，不能直接删除" : "删除科目"}
                        onClick={() =>
                          confirm({
                            title: `删除科目「${subject}」？`,
                            description: "删除后不会再出现在科目管理列表中。",
                            confirmLabel: "删除",
                            tone: "danger",
                            onConfirm: () => onDeleteSubject(subject)
                          })
                        }
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="h-fit overflow-hidden">
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                <GraduationCap size={14} /> 班型管理
              </div>
              <CardTitle className="text-lg">班型与默认计费</CardTitle>
              <CardDescription>班型可改名、按名称排序并设置默认计费；内置班型删除后会从主列表移除，自定义班型未使用时会直接删除。</CardDescription>
              <div className="mt-1 text-sm font-semibold leading-5 text-[#64748b]">
                恢复默认计费会把该班型的默认价格恢复为 0，只影响以后新建的课程，已添加课程不会自动修改。
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
                placeholder="自定义班型，例如：小组课、冲刺课"
                maxLength={24}
                className={`h-10 border-[#fdba74] bg-white text-[#7c2d12] placeholder:text-[#d97706]/70 focus:border-[#ff8617] focus:ring-2 focus:ring-[#ff8617]/20 ${courseTypeMessage ? "border-[#fca5a5] bg-[#fff1f2]" : ""}`}
              />
              <Select
                value={customCourseTypeTemplate}
                onChange={(event) => setCustomCourseTypeTemplate(event.target.value as "class" | "hourly")}
                className="h-10 border-[#fdba74] bg-white text-[#7c2d12]"
                aria-label="选择自定义班型计费模板"
              >
                <option value="class">班课人数计费模板</option>
                <option value="hourly">一对一按小时模板</option>
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
            {customCourseTypeTemplate === "class" ? (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#9a3412]">最少人数</label>
                  <Input
                    type="number"
                    min={0}
                    value={customCourseTypeMinStudents}
                    onChange={(event) => setCustomCourseTypeMinStudents(Math.max(Number(event.target.value), 0))}
                    className="h-9 border-[#fdba74] bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#9a3412]">基础费用</label>
                  <SensitiveAmountField visible={amountsVisible} className="h-9">
                    <Input
                      type="number"
                      min={0}
                      value={customCourseTypeBaseFee}
                      onChange={(event) => setCustomCourseTypeBaseFee(Math.max(Number(event.target.value), 0))}
                      className="h-9 border-[#fdba74] bg-white"
                    />
                  </SensitiveAmountField>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#9a3412]">每增加 1 人费用</label>
                  <SensitiveAmountField visible={amountsVisible} className="h-9">
                    <Input
                      type="number"
                      min={0}
                      value={customCourseTypePerStudentFee}
                      onChange={(event) => setCustomCourseTypePerStudentFee(Math.max(Number(event.target.value), 0))}
                      className="h-9 border-[#fdba74] bg-white"
                    />
                  </SensitiveAmountField>
                </div>
              </div>
            ) : (
              <div className="mt-3 max-w-[220px] space-y-1">
                <label className="text-[11px] font-bold text-[#9a3412]">每小时费用</label>
                <SensitiveAmountField visible={amountsVisible} className="h-9">
                  <Input
                    type="number"
                    min={0}
                    value={customCourseTypeHourlyRate}
                    onChange={(event) => setCustomCourseTypeHourlyRate(Math.max(Number(event.target.value), 0))}
                    className="h-9 border-[#fdba74] bg-white"
                  />
                </SensitiveAmountField>
              </div>
            )}
          </div>
          {courseTypeMessage && (
            <div className="rounded-[12px] border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm font-bold text-[#b91c1c]">
              {courseTypeMessage}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {managedCourseTypes.map((typeOption) => {
            const type = typeOption.value;
            const rule = feeRuleForCourseType(vault, type);
            const tier = normalizedClassFeeTiers(rule)[0] ?? defaultClassFeeTiers(defaultFeeRuleForCourseType(type))[0];
            const isCustom = type.startsWith("custom_");
            const isEditingType = editingCustomCourseTypeId === type;
            const used = courseTypeInUse(type);
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
                        variant="destructive"
                        disabled={isCustom && used}
                        onClick={() => onRequestDeleteCourseType({ id: type, label: typeOption.label })}
                        title={isCustom && used ? "这个自定义班型已有课程或历史课时使用，不能直接删除" : isCustom ? "直接删除自定义班型" : "内置班型会从主列表和添加课程档案中移除"}
                      >
                        <Trash2 size={14} /> 删除
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => onResetCourseTypeFeeRule(type)}>
                        恢复默认计费
                      </Button>
                    </div>
                  )}
                </div>
                {rule.mode === "class_headcount" ? (
                  <div className="rounded-[12px] border border-[#e8eef6] bg-white p-3">
                    <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm font-extrabold text-[#061226]">默认人数计费</div>
                      <div className="text-xs font-semibold text-[#64748b]">按 2 小时为 1 节设置标准课金额；实际课时费按上课时长 / 2 折算。</div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-[#64748b]">最少人数</label>
                        <Input
                          type="number"
                          min={0}
                          value={tier.minStudents}
                          onChange={(event) => onUpdateCourseTypeClassFeeTier(type, tier.id, { minStudents: Math.max(Number(event.target.value), 0) })}
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
                            onChange={(event) => onUpdateCourseTypeClassFeeTier(type, tier.id, { baseFee: Math.max(Number(event.target.value), 0) })}
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
                            onChange={(event) => onUpdateCourseTypeClassFeeTier(type, tier.id, { perStudentFee: Math.max(Number(event.target.value), 0) })}
                            className="h-9 bg-white"
                          />
                        </SensitiveAmountField>
                      </div>
                    </div>
                  </div>
                ) : type === "trial" ? (
                  <div className="rounded-[12px] border border-[#e8eef6] bg-white p-3">
                    <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm font-extrabold text-[#061226]">默认单次费用</div>
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
                      <div className="text-sm font-extrabold text-[#061226]">默认每小时费用</div>
                      <div className="text-xs font-semibold text-[#64748b]">新建该班型课程时自动带入，默认值为 0。</div>
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
          {deletedBuiltInCourseTypes.length > 0 && (
            <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-white p-3">
              <div className="mb-2 text-xs font-extrabold text-[#64748b]">已删除内置班型</div>
              <div className="flex flex-wrap gap-2">
                {deletedBuiltInCourseTypes.map((typeOption) => (
                  <Button
                    key={typeOption.value}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 bg-[#f8fbff] text-xs"
                    onClick={() => onRestoreCourseType(typeOption.value)}
                  >
                    恢复 {typeOption.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
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
