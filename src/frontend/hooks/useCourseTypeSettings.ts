import { useState } from "react";
import type { ClassFeeTier, CourseType, CustomCourseType, CustomCourseTypeOption, FeeRule, TeacherVault } from "@/shared/types";
import type { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { makeId } from "@/frontend/lib/crypto";
import { backupFeeRuleForCourseType, billableStudentCapForCourseType, classHeadcountBaseStudentCountForRule, classHeadcountFeeRuleForCourseType, defaultFeeRuleForCourseType, defaultSalaryGradeRule, feeRuleForCourseType, normalizedClassFeeTiers, salaryGradeRateForStage, salaryGradeRuleById, todayIso } from "@/frontend/lib/calculations";
import { builtInCourseTypeOptions, compareByName, courseTypeLabel } from "@/frontend/lib/helpers";
import { courseTypeUsageCounts } from "@/frontend/lib/courseTypeUsage";
import type { CourseTypeMigrationMode, CourseTypeMigrationResult } from "@/frontend/lib/vaultMutations";

export type CustomCourseTypeTemplate = "class" | "non_class";

type CourseTypeSettingsOptions = {
  vault: TeacherVault;
  courseTypeOptions: Array<{ value: CourseType; label: string }>;
  confirm: ReturnType<typeof useConfirmDialog>["confirm"];
  onAddCustomCourseType: (courseType: CustomCourseTypeOption, feeRule?: FeeRule) => void;
  onDeleteCustomCourseType: (courseTypeId: CustomCourseType) => void;
  onUpdateCourseTypeLabel: (courseType: CourseType, label: string) => void;
  onDeleteCourseType: (courseType: CourseType) => void;
  onUpdateCourseTypeFeeRule: (courseType: CourseType, feeRule: FeeRule) => void;
  onSyncCourseTypeFeeRuleToCourses: (courseType: CourseType) => void;
  onMigrateCourseTypeLessons: (fromType: CourseType, orphanTargetType: CourseType, mode: CourseTypeMigrationMode) => CourseTypeMigrationResult;
  syncNewCourseFeeRule: (type: CourseType, feeRule?: FeeRule) => void;
  onBeforeDeleteCourseType: (type: CourseType, fallbackType: CourseType) => void;
};

export function useCourseTypeSettings({
  vault, courseTypeOptions, confirm, onAddCustomCourseType, onDeleteCustomCourseType,
  onUpdateCourseTypeLabel, onDeleteCourseType, onUpdateCourseTypeFeeRule,
  onSyncCourseTypeFeeRuleToCourses, onMigrateCourseTypeLessons, syncNewCourseFeeRule, onBeforeDeleteCourseType
}: CourseTypeSettingsOptions) {
  const customCourseTypes = vault.preferences?.customCourseTypes ?? [];
  const disabledCourseTypes = new Set(vault.preferences?.disabledCourseTypes ?? []);
  const allManagedCourseTypes: Array<{ value: CourseType; label: string }> = [
    ...builtInCourseTypeOptions.map((item) => ({ value: item.value as CourseType, label: courseTypeLabel(vault, item.value) })),
    ...customCourseTypes.map((item) => ({ value: item.id as CourseType, label: item.label }))
  ].sort((a, b) => compareByName(a.label, b.label) || a.value.localeCompare(b.value));
  const managedCourseTypes = allManagedCourseTypes.filter((item) => !disabledCourseTypes.has(item.value));
  const [customCourseTypeInput, setCustomCourseTypeInput] = useState("");
  const [customCourseTypeTemplate, setCustomCourseTypeTemplate] = useState<CustomCourseTypeTemplate>("class");
  const [courseTypeMessage, setCourseTypeMessage] = useState("");
  const [migrationOrphanTargetType, setMigrationOrphanTargetType] = useState<CourseType>("small_class");
  const [editingCustomCourseTypeId, setEditingCustomCourseTypeId] = useState<CourseType | "">("");
  const [editingCustomCourseTypeLabel, setEditingCustomCourseTypeLabel] = useState("");

  function addCustomCourseType() {
    const label = customCourseTypeInput.trim();
    if (!label) return;
    const normalizedLabel = normalizeCourseTypeLabel(label);
    const existingType = allManagedCourseTypes.find(
      (option) => normalizeCourseTypeLabel(option.label) === normalizedLabel || normalizeCourseTypeLabel(option.value) === normalizedLabel
    );
    if (existingType) {
      setCourseTypeMessage(`已存在班型「${existingType.label}」，不能重复添加同名班型。`);
      return;
    }
    const option: CustomCourseTypeOption = {
      id: `custom_${makeId("ctype")}` as CustomCourseType,
      label
    };
    onAddCustomCourseType(
      option,
      defaultFeeRuleForCustomTemplate(customCourseTypeTemplate, vault)
    );
    setCustomCourseTypeInput("");
    setCustomCourseTypeTemplate("class");
    setCourseTypeMessage("");
  }

  function startEditCustomCourseType(courseTypeOption: { id: CourseType; label: string }) {
    setEditingCustomCourseTypeId(courseTypeOption.id);
    setEditingCustomCourseTypeLabel(courseTypeOption.label);
  }

  function saveCustomCourseType() {
    const id = editingCustomCourseTypeId;
    const label = editingCustomCourseTypeLabel.trim();
    if (!id || !label) return;
    const normalizedLabel = normalizeCourseTypeLabel(label);
    const duplicated = allManagedCourseTypes.find(
      (item) => item.value !== id && normalizeCourseTypeLabel(item.label) === normalizedLabel
    );
    if (duplicated) {
      setCourseTypeMessage(`已存在班型「${duplicated.label}」，不能改成同名班型。`);
      return;
    }
    onUpdateCourseTypeLabel(id, label);
    setEditingCustomCourseTypeId("");
    setEditingCustomCourseTypeLabel("");
    setCourseTypeMessage("");
  }

  function cancelCustomCourseTypeEdit() {
    setEditingCustomCourseTypeId("");
    setEditingCustomCourseTypeLabel("");
    setCourseTypeMessage("");
  }

  function courseTypeInUse(type: CourseType): boolean {
    return vault.courseGroups.some((course) => course.type === type) || vault.lessons.some((lesson) => lesson.type === type);
  }

  function replaceCourseTypeClassFeeTiers(type: CourseType, nextTiers: ClassFeeTier[]) {
    const current = feeRuleForCourseType(vault, type);
    const sortedTiers = [...nextTiers].sort((a, b) => a.minStudents - b.minStudents);
    const firstTier = sortedTiers[0];
    const nextRule: FeeRule = {
      ...current,
      mode: "class_headcount",
      baseFee: firstTier?.baseFee ?? current.baseFee,
      perPresentStudentFee: firstTier?.perStudentFee ?? current.perPresentStudentFee,
      classFeeTiers: sortedTiers,
      stageRates: backupFeeRuleForCourseType(type, current).stageRates,
      makeupFeeMode: current.makeupFeeMode ?? "perStudentFee"
    };
    onUpdateCourseTypeFeeRule(type, nextRule);
    syncNewCourseFeeRule(type);
  }

  function updateCourseTypeClassFeeTier(type: CourseType, tierId: string, patch: Partial<ClassFeeTier>) {
    const rule = backupFeeRuleForCourseType(type, feeRuleForCourseType(vault, type));
    const tier = normalizedClassFeeTiers(rule).find((item) => item.id === tierId) ?? normalizedClassFeeTiers(rule)[0];
    replaceCourseTypeClassFeeTiers(type, [{ ...tier, ...patch, maxStudents: undefined }]);
  }

  function updateCourseTypeBillableCap(type: CourseType, cap: number | undefined) {
    const current = backupFeeRuleForCourseType(type, feeRuleForCourseType(vault, type));
    const nextRule: FeeRule = {
      ...current,
      billableStudentCap: Number.isFinite(cap) ? Math.max(Math.floor(cap ?? 0), 0) : undefined
    };
    onUpdateCourseTypeFeeRule(type, nextRule);
    syncNewCourseFeeRule(type);
  }

  function updateCourseTypeHourlyRule(type: CourseType, hourlyRate: number) {
    const current = feeRuleForCourseType(vault, type);
    const nextRule: FeeRule = {
      ...current,
      mode: "hourly",
      hourlyRate,
      fixedFee: undefined,
      baseFee: undefined,
      perPresentStudentFee: undefined,
      classFeeTiers: undefined
    };
    onUpdateCourseTypeFeeRule(type, nextRule);
    syncNewCourseFeeRule(type);
  }

  function updateCourseTypeFixedRule(type: CourseType, fixedFee: number) {
    const current = feeRuleForCourseType(vault, type);
    const nextRule: FeeRule = {
      ...current,
      mode: "fixed",
      fixedFee,
      hourlyRate: undefined,
      baseFee: undefined,
      perPresentStudentFee: undefined,
      classFeeTiers: undefined
    };
    onUpdateCourseTypeFeeRule(type, nextRule);
    syncNewCourseFeeRule(type, nextRule);
  }

  function resetCourseTypeFeeRule(type: CourseType) {
    const current = feeRuleForCourseType(vault, type);
    const backupRule = backupFeeRuleForCourseType(type, current);
    const tier = backupRule.mode === "class_headcount" ? normalizedClassFeeTiers(backupRule)[0] : undefined;
    const nextRule = type === "trial"
      ? defaultFeeRuleForCourseType(type)
      : defaultFeeRuleForCustomTemplate(
          (tier?.minStudents ?? classHeadcountBaseStudentCountForRule(type, backupRule)) > 1 ? "class" : "non_class",
          vault
        );
    onUpdateCourseTypeFeeRule(type, nextRule);
    syncNewCourseFeeRule(type, nextRule);
  }

  function requestSyncCourseTypeFeeRuleToCourses(type: CourseType) {
    const label = courseTypeLabel(vault, type);
    const counts = courseTypeUsageCounts(vault, type, todayIso());
    if (counts.courseCount === 0) {
      setCourseTypeMessage(`班型「${label}」还没有已添加课程，不需要同步。`);
      return;
    }
    confirm({
      title: `同步「${label}」到已有课程？`,
      description: `会把 ${counts.courseCount} 个同班型常规课程统一改为跟随教师默认课时费等级，并按当前班课/非班课规则刷新 ${counts.futureLessonCount} 节未来待上课课节的金额快照。已完成或历史课节保留原金额。`,
      confirmLabel: "同步更改",
      onConfirm: () => {
        onSyncCourseTypeFeeRuleToCourses(type);
        setCourseTypeMessage(`同步完成：已处理「${label}」的 ${counts.courseCount} 个已有课程，并刷新 ${counts.futureLessonCount} 节未来待上课课节。`);
      }
    });
  }

  function requestMigrateCourseTypeLessons(type: CourseType) {
    const label = courseTypeLabel(vault, type);
    const pendingCount = courseTypeUsageCounts(vault, type, todayIso()).legacyLessonCount;
    if (pendingCount === 0) {
      setCourseTypeMessage(`班型「${label}」没有需要迁移的旧课节快照。`);
      return;
    }
    const orphanLabel = courseTypeLabel(vault, migrationOrphanTargetType);

    function runMigration(mode: CourseTypeMigrationMode) {
      const result = onMigrateCourseTypeLessons(type, migrationOrphanTargetType, mode);
      if (result.total === 0) {
        setCourseTypeMessage(
          result.skipped > 0
            ? `没有可迁移的课节：${result.skipped} 节课节的课程档案本身仍是「${label}」，请先在课程档案里改成新班型。`
            : `班型「${label}」没有需要迁移的旧课节快照。`
        );
        return;
      }
      const parts = [
        result.byCourse > 0 ? `${result.byCourse} 节跟随课程档案` : "",
        result.substitute > 0 ? `${result.substitute} 节代课归为小班课` : "",
        result.orphan > 0 ? `${result.orphan} 节按指定的「${orphanLabel}」` : ""
      ].filter(Boolean);
      const skippedText = result.skipped > 0
        ? `另有 ${result.skipped} 节课节的课程档案仍是「${label}」，已跳过，需要先改课程档案。`
        : `现在可以删除班型「${label}」了。`;
      const modeText = mode === "full_refresh"
        ? `其中 ${result.refreshed} 节已按当前课程档案完整刷新并重算金额。`
        : "所有课节的学生名单、出勤和金额快照保持不变。";
      setCourseTypeMessage(`同步完成：已迁移 ${result.total} 节课节（${parts.join("，")}）。${modeText}${skippedText}`);
    }

    confirm({
      title: `迁移「${label}」的 ${pendingCount} 节旧课节？`,
      description: `有课程档案的课节会跟随各自档案的班型，代课课节归为小班课，找不到课程档案的课节归到「${orphanLabel}」。\n\n「只改班型标记」只改班型，学生名单、出勤和金额快照都不动，历史工资不受影响（推荐）。\n「完整刷新」会按当前课程档案重写学生名单和出勤，并用最新的人头分档、计费人数上限规则重算金额，历史工资会变化。`,
      confirmLabel: "只改班型标记",
      secondaryLabel: "完整刷新（重算金额）",
      onConfirm: () => runMigration("type_only"),
      onSecondary: () => runMigration("full_refresh")
    });
  }

  function requestDeleteCourseType(courseTypeOption: { id: CourseType; label: string }) {
    const isCustom = courseTypeOption.id.startsWith("custom_");
    confirm({
      title: `删除班型「${courseTypeOption.label}」？`,
      description: isCustom
        ? "自定义班型会从班型列表中直接删除；已被课程或历史课时使用的自定义班型不能直接删除。"
        : "内置班型只是从主列表、添加课程档案和筛选下拉中隐藏，并清理该班型的旧名称和旧计费规则配置；已有课程和历史课节不会被删除，仍然保留原样。",
      confirmLabel: "删除",
      tone: "danger",
      onConfirm: () => {
        const fallbackType = courseTypeOptions.find((option) => option.value !== courseTypeOption.id)?.value ?? "one_on_one";
        onBeforeDeleteCourseType(courseTypeOption.id, fallbackType);
        if (editingCustomCourseTypeId === courseTypeOption.id) cancelCustomCourseTypeEdit();
        if (isCustom) {
          onDeleteCustomCourseType(courseTypeOption.id as CustomCourseType);
        } else {
          onDeleteCourseType(courseTypeOption.id);
        }
      }
    });
  }

  return {
    courseTypeInUse,
    courseTypeMessage,
    customCourseTypeInput,
    customCourseTypeTemplate,
    editingCustomCourseTypeId,
    editingCustomCourseTypeLabel,
    managedCourseTypes,
    onAddCustomCourseType: addCustomCourseType,
    onCancelCustomCourseTypeEdit: cancelCustomCourseTypeEdit,
    onRequestDeleteCourseType: requestDeleteCourseType,
    onRequestSyncCourseTypeFeeRuleToCourses: requestSyncCourseTypeFeeRuleToCourses,
    onRequestMigrateCourseTypeLessons: requestMigrateCourseTypeLessons,
    migrationOrphanTargetType,
    setMigrationOrphanTargetType,
    onResetCourseTypeFeeRule: resetCourseTypeFeeRule,
    onSaveCustomCourseType: saveCustomCourseType,
    onStartEditCustomCourseType: startEditCustomCourseType,
    onUpdateCourseTypeClassFeeTier: updateCourseTypeClassFeeTier,
    onUpdateCourseTypeBillableCap: updateCourseTypeBillableCap,
    onUpdateCourseTypeFixedRule: updateCourseTypeFixedRule,
    onUpdateCourseTypeHourlyRule: updateCourseTypeHourlyRule,
    setCourseTypeMessage,
    setCustomCourseTypeInput,
    setCustomCourseTypeTemplate,
    setEditingCustomCourseTypeLabel
  };
}

function normalizeCourseTypeLabel(value: string): string {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

function defaultFeeRuleForCustomTemplate(
  template: CustomCourseTypeTemplate,
  vault: TeacherVault
): FeeRule {
  const templateType: CourseType = template === "class" ? "small_class" : "one_on_one";
  const minStudents = template === "class" ? 5 : 1;
  const defaultGradeRule = salaryGradeRuleById(vault.profile.defaultSalaryGradeId, vault) ?? defaultSalaryGradeRule(vault);
  const juniorRate = salaryGradeRateForStage(defaultGradeRule, "junior_3");
  const baseFee = template === "class" ? juniorRate.classBaseFee : juniorRate.oneOnOneFee;
  return classHeadcountFeeRuleForCourseType(
    templateType,
    baseFee,
    juniorRate.headcountIncrementFee,
    minStudents,
    "perStudentFee",
    defaultGradeRule.stageRates,
    billableStudentCapForCourseType(templateType)
  );
}
