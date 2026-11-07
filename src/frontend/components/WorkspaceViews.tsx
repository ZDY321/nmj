import { useCloudSession } from "@/frontend/hooks/useCloudSession";
import { useNavigationState } from "@/frontend/hooks/useNavigationState";
import { useVaultActions } from "@/frontend/hooks/useVaultActions";
import {
  type ViewKey
} from "@/frontend/lib/helpers";
import { updateLessonContentFromFeedback } from "@/frontend/lib/lessonContent";
import type {
  AiScheduleSession
} from "@/shared/types";
import { lazy, memo, Suspense } from "react";

const AdminView = lazy(() => import("@/frontend/views/AdminView").then((module) => ({ default: module.AdminView })));
const CalendarView = lazy(() => import("@/frontend/views/CalendarView").then((module) => ({ default: module.CalendarView })));
const PayrollReviewView = lazy(() => import("@/frontend/views/PayrollReviewView").then((module) => ({ default: module.PayrollReviewView })));
const ProgressView = lazy(() => import("@/frontend/views/ProgressView").then((module) => ({ default: module.ProgressView })));
const ScheduleView = lazy(() => import("@/frontend/views/ScheduleView").then((module) => ({ default: module.ScheduleView })));
const SalaryView = lazy(() => import("@/frontend/views/SalaryView").then((module) => ({ default: module.SalaryView })));
const StudentsView = lazy(() => import("@/frontend/views/StudentsView").then((module) => ({ default: module.StudentsView })));
const TodayView = lazy(() => import("@/frontend/views/TodayView").then((module) => ({ default: module.TodayView })));

export type WorkspaceState = Pick<ReturnType<typeof useCloudSession>, "username" | "password" | "token" | "role" | "vault" | "persistLoginAfterClose"> &
  Pick<ReturnType<typeof useNavigationState>, "scheduleCalendarFocus" | "studentsPanelFocus" | "progressChecklistFocus" | "progressSectionFocus" | "calendarOverviewFocus" | "payrollReviewFocus" | "lessonFeedbackFocus" | "isCalendarOnboarding"> & {
  appDate: string;
  view: ViewKey;
  amountsVisible: boolean;
  selectedDate: string;
  lessonFeedbackSyncNonce: number;
  aiScheduleSession: AiScheduleSession | null;
};
export type WorkspaceCallbacks = Pick<ReturnType<typeof useCloudSession>, "updatePersistLoginAfterClose" | "clearCurrentLocalCache" | "updateVault"> &
  Pick<ReturnType<typeof useNavigationState>, "setOnboardingCalendarDateSelected" | "changeView" | "openLessonInCalendar" | "openTodayLessonInScheduleRecords" | "openCalendarLessonInScheduleRecords" | "openCalendarDateInScheduleRecords" | "openProgressLessonInScheduleRecords" | "openLessonInProgressChecklist" | "openLessonInFeedback" | "openPayrollReviewLessonInScheduleRecords" | "openPayrollReconcileLessonInScheduleRecords" | "openPayrollSuggestedScheduleInCalendar" | "returnToViewFromSchedule"> &
  Pick<ReturnType<typeof useVaultActions>, "updateWeekStart" | "addGrade" | "updateGrade" | "deleteGrade" | "addLesson" | "addLessons" | "addLessonAndUpdateLesson" | "updateLesson" | "updateLessons" | "updateCalendarDayNote" | "deleteLesson" | "restoreDeletedLessons" | "permanentlyDeleteDeletedLessons" | "updateCampus" | "deleteCampus" | "updateStudent" | "updateStudents" | "updateProfile" | "deleteStudent" | "deleteStudents" | "addCourse" | "updateCourse" | "updateCourses" | "syncCoursesToLessons" | "deleteCourse" | "transferStudentCourse" | "addCustomTimePreset" | "deleteCustomTimePreset" | "addCustomCourseType" | "updateCourseTypeLabel" | "deleteCourseType" | "updateCourseTypeFeeRule" | "syncCourseTypeFeeRuleToCourses" | "migrateCourseTypeLessons" | "updateAiScheduleSession" | "applyAiScheduleDraft" | "addSubject" | "updateSubject" | "deleteSubject" | "deleteCustomCourseType" | "addSalaryAdjustment" | "deleteSalaryAdjustment" | "addTodo" | "updateTodo" | "deleteTodo" | "mergeTodosIntoMemo" | "saveMemo" | "deleteMemo" | "saveStudentProgressRecord" | "saveStudentProgressRecords" | "deleteStudentProgressRecord" | "saveProgressChecklistTemplate" | "deleteProgressChecklistTemplate" | "saveExternalPromptTemplate" | "saveProgressChecklistCompletion" | "updateProgressChecklistCompletions" | "saveProgressChecklistCompletions" | "deleteProgressChecklistCompletion" | "addGradeRecord" | "deleteGradeRecord" | "generateDrafts">;

export const WorkspaceViews = memo(function WorkspaceViews({ state, callbacks }: { state: WorkspaceState; callbacks: WorkspaceCallbacks }) {
  const {
    view,
    amountsVisible,
    selectedDate,
    lessonFeedbackSyncNonce,
    aiScheduleSession,
    username,
    password,
    token,
    role,
    vault,
    persistLoginAfterClose,
    scheduleCalendarFocus,
    studentsPanelFocus,
    progressChecklistFocus,
    progressSectionFocus,
    calendarOverviewFocus,
    payrollReviewFocus,
    lessonFeedbackFocus,
    isCalendarOnboarding
  } = state;
  const {
    updatePersistLoginAfterClose,
    clearCurrentLocalCache,
    updateVault,
    setOnboardingCalendarDateSelected,
    changeView,
    openLessonInCalendar,
    openTodayLessonInScheduleRecords,
    openCalendarLessonInScheduleRecords,
    openCalendarDateInScheduleRecords,
    openProgressLessonInScheduleRecords,
    openLessonInProgressChecklist,
    openLessonInFeedback,
    openPayrollReviewLessonInScheduleRecords,
    openPayrollReconcileLessonInScheduleRecords,
    openPayrollSuggestedScheduleInCalendar,
    returnToViewFromSchedule,
    updateWeekStart,
    addGrade,
    updateGrade,
    deleteGrade,
    addLesson,
    addLessons,
    addLessonAndUpdateLesson,
    updateLesson,
    updateLessons,
    updateCalendarDayNote,
    deleteLesson,
    restoreDeletedLessons,
    permanentlyDeleteDeletedLessons,
    updateCampus,
    deleteCampus,
    updateStudent,
    updateStudents,
    updateProfile,
    deleteStudent,
    deleteStudents,
    addCourse,
    updateCourse,
    updateCourses,
    syncCoursesToLessons,
    deleteCourse,
    transferStudentCourse,
    addCustomTimePreset,
    deleteCustomTimePreset,
    addCustomCourseType,
    updateCourseTypeLabel,
    deleteCourseType,
    updateCourseTypeFeeRule,
    syncCourseTypeFeeRuleToCourses,
    migrateCourseTypeLessons,
    updateAiScheduleSession,
    applyAiScheduleDraft,
    addSubject,
    updateSubject,
    deleteSubject,
    deleteCustomCourseType,
    addSalaryAdjustment,
    deleteSalaryAdjustment,
    addTodo,
    updateTodo,
    deleteTodo,
    mergeTodosIntoMemo,
    saveMemo,
    deleteMemo,
    saveStudentProgressRecord,
    saveStudentProgressRecords,
    deleteStudentProgressRecord,
    saveProgressChecklistTemplate,
    deleteProgressChecklistTemplate,
    saveExternalPromptTemplate,
    saveProgressChecklistCompletion,
    updateProgressChecklistCompletions,
    saveProgressChecklistCompletions,
    deleteProgressChecklistCompletion,
    addGradeRecord,
    deleteGradeRecord,
    generateDrafts
  } = callbacks;
  if (!vault) return null;
  return (<div key={view} className="app-fade-up">
              <Suspense fallback={<ViewLoading />}>
                {view === "today" && (
                  <TodayView
                    vault={vault}
                    selectedDate={selectedDate}
                    amountsVisible={amountsVisible}
                    onUpdateLesson={updateLesson}
                    onAddTodo={addTodo}
                    onUpdateTodo={updateTodo}
                    onDeleteTodo={deleteTodo}
                    onMergeTodosToMemo={mergeTodosIntoMemo}
                    onSaveMemo={saveMemo}
                    onDeleteMemo={deleteMemo}
                    onOpenLessonInRecords={openTodayLessonInScheduleRecords}
                    onOpenLessonFeedback={openLessonInFeedback}
                  />
                )}
                {view === "calendar" && (
                  <CalendarView
                    vault={vault}
                    amountsVisible={amountsVisible}
                    onUpdateLessons={updateLessons}
                    onWeekStartChange={updateWeekStart}
                    onOpenLessonInRecords={openCalendarLessonInScheduleRecords}
                    onOpenDateInRecords={openCalendarDateInScheduleRecords}
                    onSelectDate={isCalendarOnboarding ? () => setOnboardingCalendarDateSelected(true) : undefined}
                    focusRequest={calendarOverviewFocus}
                  />
                )}
                {view === "schedule" && (
                  <ScheduleView
                    vault={vault}
                    amountsVisible={amountsVisible}
                    onAddLesson={addLesson}
                    onAddLessons={addLessons}
                    onAddLessonAndUpdateLesson={addLessonAndUpdateLesson}
                    onUpdateLesson={updateLesson}
                    onUpdateLessons={updateLessons}
                    onUpdateCalendarDayNote={updateCalendarDayNote}
                    onDeleteLesson={deleteLesson}
                    onRestoreDeletedLessons={restoreDeletedLessons}
                    onPermanentlyDeleteDeletedLessons={permanentlyDeleteDeletedLessons}
                    onAddCustomTimePreset={addCustomTimePreset}
                    onDeleteCustomTimePreset={deleteCustomTimePreset}
                    onGenerateDrafts={generateDrafts}
                    onWeekStartChange={updateWeekStart}
                    role={role}
                    token={token}
                    calendarFocus={scheduleCalendarFocus}
                    aiSession={aiScheduleSession}
                    onAiSessionChange={updateAiScheduleSession}
                    onApplyAiDraft={applyAiScheduleDraft}
                    onReturnToView={returnToViewFromSchedule}
                    onSaveChecklistCompletions={saveProgressChecklistCompletions}
                    onUpdateChecklistCompletions={updateProgressChecklistCompletions}
                    onOpenProgressChecklist={openLessonInProgressChecklist}
                    onOpenLessonFeedback={openLessonInFeedback}
                  />
                )}
                {view === "progress" && (
                  <ProgressView
                    vault={vault}
                    token={token}
                    password={password}
                    role={role}
                    checklistFocus={progressChecklistFocus}
                    lessonFeedbackFocus={lessonFeedbackFocus}
                    lessonFeedbackSyncNonce={lessonFeedbackSyncNonce}
                    sectionFocus={progressSectionFocus}
                    onSaveProgressRecord={saveStudentProgressRecord}
                    onSaveProgressRecords={saveStudentProgressRecords}
                    onDeleteProgressRecord={deleteStudentProgressRecord}
                    onSaveChecklistTemplate={saveProgressChecklistTemplate}
                    onDeleteChecklistTemplate={deleteProgressChecklistTemplate}
                    onSaveChecklistCompletion={saveProgressChecklistCompletion}
                    onDeleteChecklistCompletion={deleteProgressChecklistCompletion}
                    onSaveExternalPromptTemplate={saveExternalPromptTemplate}
                    onAddGradeRecord={addGradeRecord}
                    onDeleteGradeRecord={deleteGradeRecord}
                    onOpenLessonInRecords={openProgressLessonInScheduleRecords}
                    onUpdateLessonContent={(lessonId, patch) => {
                      const lesson = vault.lessons.find((item) => item.id === lessonId);
                      if (lesson) updateLesson({
                        ...lesson,
                        content: updateLessonContentFromFeedback(lesson.content, vault.progressChecklistTemplates ?? [], patch)
                      });
                    }}
                  />
                )}
                {view === "students" && (
                  <StudentsView
                    vault={vault}
                    amountsVisible={amountsVisible}
                    focusRequest={studentsPanelFocus}
                    onAddCampus={(campus) =>
                      updateVault((draft) => {
                        draft.campuses.push(campus);
                      })
                    }
                    onUpdateCampus={updateCampus}
                    onDeleteCampus={deleteCampus}
                    onAddStudent={(student) =>
                      updateVault((draft) => {
                        draft.students.push(student);
                      })
                    }
                    onAddStudents={(students) =>
                      updateVault((draft) => {
                        draft.students.push(...students);
                      })
                    }
                    onUpdateStudent={updateStudent}
                    onUpdateStudents={updateStudents}
                    onDeleteStudent={deleteStudent}
                    onDeleteStudents={deleteStudents}
                    onUpdateProfile={updateProfile}
                    onAddGrade={addGrade}
                    onUpdateGrade={updateGrade}
                    onDeleteGrade={deleteGrade}
                    onAddCourse={addCourse}

                    onUpdateCourse={updateCourse}
                    onUpdateCourses={updateCourses}
                    onSyncCoursesToLessons={syncCoursesToLessons}
                    onDeleteCourse={deleteCourse}
                    onAddCustomCourseType={addCustomCourseType}
                    onDeleteCustomCourseType={deleteCustomCourseType}
                    onUpdateCourseTypeLabel={updateCourseTypeLabel}
                    onDeleteCourseType={deleteCourseType}
                    onUpdateCourseTypeFeeRule={updateCourseTypeFeeRule}
                    onSyncCourseTypeFeeRuleToCourses={syncCourseTypeFeeRuleToCourses}
                    onMigrateCourseTypeLessons={migrateCourseTypeLessons}
                    onAddSubject={addSubject}
                    onUpdateSubject={updateSubject}
                    onDeleteSubject={deleteSubject}
                    onTransferStudentCourse={transferStudentCourse}
                    onOpenSchedule={() => changeView("schedule")}
                  />
                )}
                {view === "payroll" && (
                  <PayrollReviewView
                    vault={vault}
                    amountsVisible={amountsVisible}
                    token={token}
                    isAdmin={role === "admin"}
                    password={password}
                    panelFocus={payrollReviewFocus}
                    storageScope={username}
                    onSaveScheduleImport={(state) =>
                      updateVault((draft) => {
                        draft.scheduleImport = state;
                      })
                    }
                    onOpenReviewLessonInCalendar={openPayrollReviewLessonInScheduleRecords}
                    onOpenReconcileLessonInCalendar={openPayrollReconcileLessonInScheduleRecords}
                    onSuggestSchedule={openPayrollSuggestedScheduleInCalendar}
                  />
                )}
                {view === "salary" && (
                  <SalaryView
                    vault={vault}
                    amountsVisible={amountsVisible}
                    onAddAdjustment={addSalaryAdjustment}
                    onDeleteAdjustment={deleteSalaryAdjustment}
                    onOpenLessonInCalendar={openLessonInCalendar}
                  />
                )}
                {view === "admin" && role === "admin" && (
                  <AdminView
                    vault={vault}
                    token={token}
                    adminUsername={username}
                    persistLoginAfterClose={persistLoginAfterClose}
                    onPersistLoginAfterCloseChange={updatePersistLoginAfterClose}
                    onNoticeChange={(notice) =>
                      updateVault((draft) => {
                        draft.notice = notice;
                      })
                    }
                    onUpdateProfile={(patch) =>
                      updateVault((draft) => {
                        draft.profile = { ...draft.profile, ...patch };
                      })
                    }
                    onPermanentlyDeleteDeletedLessons={permanentlyDeleteDeletedLessons}
                    onClearData={clearCurrentLocalCache}
                  />
                )}
              </Suspense>
        </div>);
});

function ViewLoading() {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-[16px] border border-[#dbe4ef] bg-white text-sm font-bold text-[#64748b]">
      正在加载...
    </div>
  );
}
