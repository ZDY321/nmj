import { useArchiveNavigation } from "@/frontend/hooks/useArchiveNavigation";
import type { ArchivePanel } from "@/frontend/hooks/useArchiveNavigation";
import { useArchiveSettings } from "@/frontend/hooks/useArchiveSettings";
import { useCourseArchive } from "@/frontend/hooks/useCourseArchive";
import { matchesKeywordSearch, studentCourseSearchText } from "@/frontend/lib/archiveSearch";
import { useStudentCourseTransfer } from "@/frontend/hooks/useStudentCourseTransfer";
import { useCourseTypeSettings } from "@/frontend/hooks/useCourseTypeSettings";
import { useStudentCreation } from "@/frontend/hooks/useStudentCreation";
import { useStudentFilters } from "@/frontend/hooks/useStudentFilters";
import { useStudentMaintenance } from "@/frontend/hooks/useStudentMaintenance";
import { useNewCourseForm } from "@/frontend/hooks/useNewCourseForm";
import { useCourseEditor } from "@/frontend/hooks/useCourseEditor";
import { firstCourseStudentGrade as courseStudentGrade, supportsSalaryGradeFee } from "@/frontend/lib/courseFormRules";
import { courseFeeSummary as formatCourseFeeSummary } from "@/frontend/lib/courseFeePresentation";
import { buildStudentCourseIndex } from "@/frontend/lib/studentCourseIndex";
import { Fragment, useMemo } from "react";
import { Building2, ChevronRight, GraduationCap, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { Campus, CourseGroup, CourseType, CustomCourseType, CustomCourseTypeOption, FeeRule, Student, StudentCourseTransition, TeacherProfile, TeacherVault } from "@/shared/types";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { CampusCourseSettingsPanel } from "@/frontend/components/CampusCourseSettingsPanel";
import { CourseEditDialog } from "@/frontend/components/CourseEditDialog";
import { CourseArchiveListPanel } from "@/frontend/components/CourseArchiveListPanel";
import { StudentArchivePanel } from "@/frontend/components/StudentArchivePanel";
import { StudentCourseTransferPanel } from "@/frontend/components/StudentCourseTransferPanel";
import { StudentEditDialog } from "@/frontend/components/StudentEditDialog";
import { TeacherProfilePanel } from "@/frontend/components/TeacherProfilePanel";
import { TeacherSalaryRulesPanel } from "@/frontend/components/TeacherSalaryRulesPanel";
import { NewCourseFormPanel } from "@/frontend/components/NewCourseFormPanel";
import { compareByName, matchesGradeFilter, courseRequiresSameGradeStudents, courseTypeLabel, courseTypeOptionsForVault, sortCampusesForProfile, sortCoursesByName, sortStudentsByName } from "@/frontend/lib/helpers";
import type { CourseTypeMigrationMode, CourseTypeMigrationResult } from "@/frontend/lib/vaultMutations";

export function StudentsView({
  vault,
  onAddCampus,
  onUpdateCampus,
  onDeleteCampus,
  onAddStudent,
  onAddStudents,
  onUpdateStudent,
  onUpdateStudents,
  onDeleteStudent,
  onDeleteStudents,
  onUpdateProfile,
  onAddGrade,
  onUpdateGrade,
  onDeleteGrade,
  onAddCourse,
  onUpdateCourse,
  onUpdateCourses,
  onSyncCoursesToLessons,
  onDeleteCourse,
  onAddCustomCourseType,
  onDeleteCustomCourseType,
  onUpdateCourseTypeLabel,
  onDeleteCourseType,
  onUpdateCourseTypeFeeRule,
  onSyncCourseTypeFeeRuleToCourses,
  onMigrateCourseTypeLessons,
  onAddSubject,
  onUpdateSubject,
  onDeleteSubject,
  onTransferStudentCourse,
  onOpenSchedule,
  amountsVisible,
  focusRequest
}: {
  vault: TeacherVault;
  amountsVisible: boolean;
  focusRequest?: { panel: ArchivePanel; nonce: number } | null;
  onAddCampus: (campus: Campus) => void;
  onUpdateCampus: (campus: Campus) => void;
  onDeleteCampus: (campusId: string) => void;
  onAddStudent: (student: Student) => void;
  onAddStudents: (students: Student[]) => void;
  onUpdateStudent: (student: Student) => void;
  onUpdateStudents: (students: Student[]) => void;
  onDeleteStudent: (studentId: string) => void;
  onDeleteStudents: (studentIds: string[]) => void;
  onUpdateProfile: (profile: TeacherProfile) => void;
  onAddGrade: (grade: string) => void;
  onUpdateGrade: (previousGrade: string, nextGrade: string) => void;
  onDeleteGrade: (grade: string) => void;
  onAddCourse: (course: CourseGroup) => void;
  onUpdateCourse: (course: CourseGroup) => void;
  onUpdateCourses: (courses: CourseGroup[]) => void;
  onSyncCoursesToLessons: (courseIds: string[]) => void;
  onDeleteCourse: (courseId: string) => void;
  onAddCustomCourseType: (courseType: CustomCourseTypeOption, feeRule?: FeeRule) => void;
  onDeleteCustomCourseType: (courseTypeId: CustomCourseType) => void;
  onUpdateCourseTypeLabel: (courseType: CourseType, label: string) => void;
  onDeleteCourseType: (courseType: CourseType) => void;
  onUpdateCourseTypeFeeRule: (courseType: CourseType, feeRule: FeeRule) => void;
  onSyncCourseTypeFeeRuleToCourses: (courseType: CourseType) => void;
  onMigrateCourseTypeLessons: (
    fromType: CourseType,
    orphanTargetType: CourseType,
    mode: CourseTypeMigrationMode
  ) => CourseTypeMigrationResult;
  onAddSubject: (subject: string) => void;
  onUpdateSubject: (previousSubject: string, nextSubject: string) => void;
  onDeleteSubject: (subject: string) => void;
  onTransferStudentCourse: (transition: StudentCourseTransition) => void;
  onOpenSchedule: () => void;
}) {
  const studentCourseIndex = useMemo(() => buildStudentCourseIndex(vault), [vault.students, vault.courseGroups]);
  const firstCourseStudentGrade = (studentIds: string[]) => courseStudentGrade(vault, studentIds);
  const campusOptions = sortCampusesForProfile(vault.campuses, vault.profile.homeCampusId);
  const courseTypeOptions = courseTypeOptionsForVault(vault);
  const archiveSettings = useArchiveSettings({ vault, onAddCampus, onAddSubject, onUpdateSubject, onAddGrade, onUpdateGrade });
  const { configuredGradeOptions, subjectOptions } = archiveSettings;
  const studentOptions = sortStudentsByName(vault.students);
  const currentStudentOptions = sortStudentsByName(vault.students.filter((student) => student.status === "active"));
  const courseSelectableStudentOptions = currentStudentOptions;
  const transitionStudentOptions = sortStudentsByName(vault.students.filter((student) => student.status === "transition"));
  const archivedStudentOptions = sortStudentsByName(vault.students.filter((student) => student.status === "paused"));
  const courseGroupOptions = sortCoursesByName(vault.courseGroups);
  const preferredCampusId = campusOptions[0]?.id ?? "";
  const gradeOptions = ["未设置年级", ...configuredGradeOptions];
  const { archivePanel, setArchivePanel, flashArchiveRow, archiveRowClass } = useArchiveNavigation(focusRequest);
  const { confirm, dialog } = useConfirmDialog();
  const courseArchive = useCourseArchive({ vault, courseGroupOptions, studentCourseIndex, confirm, onUpdateCourses, onSyncCoursesToLessons });
  const studentCreation = useStudentCreation({ vault, preferredCampusId, confirm, onAddStudent, onAddStudents });
  const studentFilters = useStudentFilters({ vault, coursesByStudentId: studentCourseIndex.coursesByStudentId });
  const newCourseForm = useNewCourseForm({ vault, preferredCampusId, subjectOptions, courseTypeOptions, confirm, onAddCourse });
  const studentCourseTransfer = useStudentCourseTransfer({ vault, courseGroupOptions, preferredCampusId, subjectOptions, courseTypeOptions, onTransferStudentCourse });
  const courseTypeSettings = useCourseTypeSettings({
    vault, courseTypeOptions, confirm, onAddCustomCourseType, onDeleteCustomCourseType,
    onUpdateCourseTypeLabel, onDeleteCourseType, onUpdateCourseTypeFeeRule,
    onSyncCourseTypeFeeRuleToCourses, onMigrateCourseTypeLessons,
    syncNewCourseFeeRule: newCourseForm.syncCourseTypeFeeRule,
    onBeforeDeleteCourseType: (type, fallbackType) => {
      if (newCourseForm.formProps.courseType === type) newCourseForm.formProps.onChangeCourseType(fallbackType);
      if (courseArchive.courseTypeFilter === type) courseArchive.setCourseTypeFilter("all");
      if (studentFilters.studentCourseTypeFilter === type) studentFilters.setStudentCourseTypeFilter("all");
      if (studentCourseTransfer.transferCourseType === type) studentCourseTransfer.setTransferCourseType(fallbackType);
    }
  });
  const {
    editingCourse,
    courseStudentSearch,
    setCourseStudentSearch,
    courseStudentScope,
    setCourseStudentScope,
    courseStudentGradeFilter,
    setCourseStudentGradeFilter,
    courseStudentCampusFilter,
    setCourseStudentCampusFilter,
    updateEditingCourse,
    updateEditingCourseFee,
    updateEditingTrialFixedFee,
    updateClassFeeTier,
    openCourseEditor,
    dismissCourseEditor,
    toggleCourseStudent,
    changeEditingCourseType,
    saveCourseDraft,
    cancelCourseDraft
  } = useCourseEditor({ vault, onUpdateCourse, onOpen: () => studentMaintenance.dismissStudentEditor(), onFinish: (id) => flashArchiveRow("courses", id) });
  const normalizedCourseStudentSearch = courseStudentSearch.trim().toLowerCase();
  const normalizedNewCourseStudentSearch = newCourseForm.formProps.newCourseStudentSearch.trim().toLowerCase();
  const addCourseGradeFilterOptions = Array.from(new Set(courseSelectableStudentOptions.map((student) => student.grade).filter(Boolean) as string[]))
    .sort(compareByName);
  const addCourseHasUnsetGradeFilterOption = courseSelectableStudentOptions.some((student) => !student.grade);
  const subjectFilterOptions = subjectOptions;
  const addCourseStudentOptions = courseSelectableStudentOptions.filter((student) => {
    const matchesSearch = !normalizedNewCourseStudentSearch || matchesKeywordSearch(
      studentCourseSearchText(vault, student, studentCourseIndex.coursesByStudentId.get(student.id) ?? []), normalizedNewCourseStudentSearch
    );
    return matchesSearch &&
      matchesGradeFilter(student.grade, newCourseForm.formProps.newCourseStudentGradeFilter) &&
      (newCourseForm.formProps.newCourseStudentCampusFilter === "all" || student.defaultCampusId === newCourseForm.formProps.newCourseStudentCampusFilter);
  });
  const studentMaintenance = useStudentMaintenance({
    vault, visibleStudents: studentFilters.visibleStudents, configuredGradeOptions, confirm,
    onUpdateStudent, onUpdateStudents, onDeleteStudents,
    removeCourseDraftStudents: newCourseForm.removeStudents,
    onOpenEditor: dismissCourseEditor,
    onHighlightStudent: (id) => flashArchiveRow("students", id),
    onGradeMessage: archiveSettings.setGradeMessage
  });
  const activeStudentCount = currentStudentOptions.length;
  const transitionStudentCount = transitionStudentOptions.length;
  const archivedStudentCount = archivedStudentOptions.length;
  const editingCourseTypeOptions = editingCourse && !courseTypeOptions.some((type) => type.value === editingCourse.type)
    ? [{ value: editingCourse.type, label: courseTypeLabel(vault, editingCourse.type) }, ...courseTypeOptions]
    : courseTypeOptions;
  const editingCourseStudentOptions = editingCourse
    ? studentOptions.filter((student) => {
        const isSelected = editingCourse.studentIds.includes(student.id);
        if (!isSelected && student.status !== "active") return false;
        const matchesScope =
          courseStudentScope === "all" ||
          (courseStudentScope === "selected" ? isSelected : !isSelected);
        const matchesSearch = !normalizedCourseStudentSearch || matchesKeywordSearch(
          studentCourseSearchText(vault, student, studentCourseIndex.coursesByStudentId.get(student.id) ?? []), normalizedCourseStudentSearch
        );
        const matchesGrade = matchesGradeFilter(student.grade, courseStudentGradeFilter);
        const requiresSameGrade = courseRequiresSameGradeStudents(vault, editingCourse.type, editingCourse.feeRule);
        const selectedGrade = requiresSameGrade ? firstCourseStudentGrade(editingCourse.studentIds) : undefined;
        const matchesSelectedGrade = !requiresSameGrade || selectedGrade === undefined || isSelected || (student.grade ?? "") === selectedGrade;
        const matchesCampus = courseStudentCampusFilter === "all" || student.defaultCampusId === courseStudentCampusFilter;
        return matchesScope && matchesSearch && matchesGrade && matchesSelectedGrade && matchesCampus;
      })
    : [];

  function courseFeeSummary(course: CourseGroup): string {
    return formatCourseFeeSummary(vault, course, amountsVisible);
  }

  return (
    <div className="space-y-6">
      {dialog}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "档案信息", value: `${vault.students.length} 人`, hint: `在读 ${activeStudentCount} 人 / 过渡 ${transitionStudentCount} 人 / 已归档 ${archivedStudentCount} 人`, icon: Users },
          { label: "校区", value: `${vault.campuses.length} 个`, hint: "教学地点", icon: Building2 },
          { label: "添加课程档案", value: `${vault.courseGroups.length} 个`, hint: `启用 ${courseArchive.activeCourses} 个`, icon: GraduationCap }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="overflow-hidden">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#eaf2ff] text-[#1557c2]">
                  <Icon size={21} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#64748b]">{item.label}</div>
                  <div className="mt-1 text-2xl font-extrabold text-[#061226]">{item.value}</div>
                  <div className="mt-1 text-xs font-bold text-[#94a3b8]">{item.hint}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="space-y-3">
        <div className="overflow-x-auto rounded-[16px] border border-[#dbe4ef] bg-white">
          <div className="flex w-full min-w-max items-center gap-1 p-1 md:min-w-0">
          {[
            { key: "profile" as ArchivePanel, label: "老师个人信息" },
            { key: "salaryRules" as ArchivePanel, label: "课时费计算" },
            { key: "campuses" as ArchivePanel, label: "校区与班型" },
            { key: "students" as ArchivePanel, label: "学生列表" },
            { key: "courses" as ArchivePanel, label: "添加课程档案" }
          ].map((item, index, items) => (
            <Fragment key={item.key}>
            <button
              type="button"
              onClick={() => setArchivePanel(item.key)}
              className={`min-w-[126px] flex-1 rounded-[12px] px-3 py-2 text-sm font-extrabold transition-colors ${
                archivePanel === item.key ? "bg-[#1557c2] text-white" : "text-[#25324a] hover:bg-[#f8fbff]"
              }`}
            >
              {item.label}
            </button>
            {index < items.length - 1 && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f8fbff] text-[#94a3b8] ring-1 ring-[#e8eef6]">
                <ChevronRight size={14} />
              </div>
            )}
            </Fragment>
          ))}
          </div>
        </div>
        <div className="rounded-[10px] border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-xs font-semibold leading-5 text-[#9a3412]">
          计费原则：课节金额以创建或刷新时保存的快照为准；档案和课时费规则调整默认用于新建课节，已排未上课节只有在课程档案同步或手动刷新时才会更新，已完成历史课节保留原金额。
        </div>
        {archivePanel === "profile" && (
          <TeacherProfilePanel
            amountsVisible={amountsVisible}
            campusOptions={campusOptions}
            onUpdateProfile={onUpdateProfile}
            vault={vault}
          />
        )}
        {archivePanel === "salaryRules" && (
          <TeacherSalaryRulesPanel
            amountsVisible={amountsVisible}
            onUpdateProfile={onUpdateProfile}
            vault={vault}
          />
        )}
        {archivePanel === "students" && (
          <StudentCourseTransferPanel
            {...studentCourseTransfer}
            campusOptions={campusOptions}
            courseTypeOptions={courseTypeOptions}
            subjectOptions={subjectOptions}
            vault={vault}
          />
        )}
        {archivePanel === "campuses" && (
          <CampusCourseSettingsPanel
            {...courseTypeSettings}
            {...archiveSettings.panelProps}
            amountsVisible={amountsVisible}
            archiveRowClass={archiveRowClass}
            campusOptions={campusOptions}
            confirm={confirm}
            onDeleteGrade={onDeleteGrade}
            flashArchiveRow={flashArchiveRow}
            onDeleteCampus={onDeleteCampus}
            onDeleteSubject={onDeleteSubject}
            onUpdateCampus={onUpdateCampus}
            vault={vault}
          />
        )}

        {archivePanel === "students" && (
          <StudentArchivePanel
            {...studentCreation}
            {...studentFilters}
            {...studentMaintenance.archiveProps}
            archiveRowClass={archiveRowClass}
            campusOptions={campusOptions}
            confirm={confirm}
            courseTypeOptions={courseTypeOptions}
            gradeOptions={gradeOptions}
            onDeleteStudent={onDeleteStudent}
            subjectFilterOptions={subjectFilterOptions}
            vault={vault}
          />
        )}

        {archivePanel === "courses" && (
        <div className="space-y-4">
        <NewCourseFormPanel
          {...newCourseForm.formProps}
          activeStudentCount={activeStudentCount}
          addCourseStudentOptions={addCourseStudentOptions}
          amountsVisible={amountsVisible}
          campusOptions={campusOptions}
          courseTypeOptions={courseTypeOptions}
          firstCourseStudentGrade={firstCourseStudentGrade}
          gradeFilterOptions={addCourseGradeFilterOptions}
          hasUnsetGradeFilterOption={addCourseHasUnsetGradeFilterOption}
          onOpenSchedule={onOpenSchedule}
          subjectOptions={subjectOptions}
          supportsSalaryGradeFee={supportsSalaryGradeFee}
          vault={vault}
        />

        <CourseArchiveListPanel
          {...courseArchive}
          archiveRowClass={archiveRowClass}
          campusOptions={campusOptions}
          confirm={confirm}
          courseFeeSummary={courseFeeSummary}
          courseTypeOptions={courseTypeOptions}
          onDeleteCourse={onDeleteCourse}
          onOpenCourseEditor={openCourseEditor}
          subjectFilterOptions={subjectFilterOptions}
          vault={vault}
        />
        </div>
        )}
      </div>

      <StudentEditDialog
        {...studentMaintenance.editorProps}
        campusOptions={campusOptions}
        gradeOptions={gradeOptions}
      />

      <CourseEditDialog
        amountsVisible={amountsVisible}
        campusOptions={campusOptions}
        courseStudentCampusFilter={courseStudentCampusFilter}
        courseStudentGradeFilter={courseStudentGradeFilter}
        courseStudentScope={courseStudentScope}
        courseStudentSearch={courseStudentSearch}
        editingCourse={editingCourse}
        editingCourseStudentOptions={editingCourseStudentOptions}
        editingCourseTypeOptions={editingCourseTypeOptions}
        courseFeeSummary={courseFeeSummary}
        firstCourseStudentGrade={firstCourseStudentGrade}
        gradeFilterOptions={editingCourse
          ? Array.from(new Set(studentOptions.filter((student) => editingCourse.studentIds.includes(student.id) || student.status === "active").map((student) => student.grade).filter(Boolean) as string[])).sort(compareByName)
          : []}
        hasUnsetGradeFilterOption={Boolean(editingCourse && studentOptions.some((student) => (editingCourse.studentIds.includes(student.id) || student.status === "active") && !student.grade))}
        onCancel={cancelCourseDraft}
        onChangeCourseType={changeEditingCourseType}
        onSave={saveCourseDraft}
        onToggleCourseStudent={toggleCourseStudent}
        onUpdateClassFeeTier={updateClassFeeTier}
        onUpdateCourse={updateEditingCourse}
        onUpdateCourseFee={updateEditingCourseFee}
        onUpdateTrialFixedFee={updateEditingTrialFixedFee}
        setCourseStudentCampusFilter={setCourseStudentCampusFilter}
        setCourseStudentGradeFilter={setCourseStudentGradeFilter}
        setCourseStudentScope={setCourseStudentScope}
        setCourseStudentSearch={setCourseStudentSearch}
        subjectOptions={subjectOptions}
        supportsSalaryGradeFee={supportsSalaryGradeFee}
        vault={vault}
      />

    </div>
  );
}
