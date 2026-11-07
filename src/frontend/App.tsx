import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { LoginScreen } from "@/frontend/components/LoginScreen";
import { OnboardingGuide } from "@/frontend/components/OnboardingGuide";
import { Sidebar } from "@/frontend/components/Sidebar";
import { SyncCountdownBadge } from "@/frontend/components/SyncCountdownBadge";
import { TimeGreeting } from "@/frontend/components/TimeGreeting";
import { WorkspaceViews } from "@/frontend/components/WorkspaceViews";
import { useAppDate } from "@/frontend/hooks/useAppDate";
import { useCloudSession } from "@/frontend/hooks/useCloudSession";
import { useNavigationState } from "@/frontend/hooks/useNavigationState";
import { useStableCallbacks } from "@/frontend/hooks/useStableCallbacks";
import { useVaultActions } from "@/frontend/hooks/useVaultActions";
import { syncCheckIntervalSeconds } from "@/frontend/hooks/useVaultPersistence";
import { formatAppDateLabel, formatAppDateTime, todayIso } from "@/frontend/lib/calculations";
import { submitFeedback } from "@/frontend/lib/cloud";
import {
  navItems,
  viewTitles,
  type ViewKey
} from "@/frontend/lib/helpers";
import {
  readPersistentLoginPreference
} from "@/frontend/lib/unlockSession";
import type {
  AiScheduleSession
} from "@/shared/types";
import {
  AlertTriangle,
  Bell,
  Calendar,
  Compass,
  Eye,
  EyeOff,
  GraduationCap,
  LogOut,
  Menu,
  MessageSquare,
  RefreshCw,
  Send
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export function App() {
  const [view, setView] = useState<ViewKey>("today");
  const [collapsed, setCollapsed] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [noticeModalOpen, setNoticeModalOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [feedbackContent, setFeedbackContent] = useState("");
  const [feedbackState, setFeedbackState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [feedbackError, setFeedbackError] = useState("");
  const [noticeReadVersion, setNoticeReadVersion] = useState("");
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [amountsVisible, setAmountsVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [lessonFeedbackSyncNonce, setLessonFeedbackSyncNonce] = useState(0);
  const [aiScheduleSession, setAiScheduleSession] = useState<AiScheduleSession | null>(null);
  const appDate = useAppDate();
  const { confirm, dialog } = useConfirmDialog();

  const {
    username,
    password,
    token,
    role,
    deletion,
    vault,
    bootstrapped,
    persistLoginAfterClose,
    saveState,
    cloudVersion,
    remoteCloudVersion,
    syncState,
    syncMessage,
    syncCountdownResetKey,
    login,
    register,
    updatePersistLoginAfterClose,
    signOut,
    clearCurrentLocalCache,
    persist,
    updateVault,
    syncLatestCloudVault,
    confirmForceOverwriteCloud,
    cancelDeletionRequest
  } = useCloudSession({ view, setView, selectedDate, setSelectedDate, setAmountsVisible, setAiScheduleSession, setNoticeModalOpen, setFeedbackModalOpen, setOnboardingVisible, setLessonFeedbackSyncNonce, confirm });

  const {
    onboardingStepIndex,
    setOnboardingCalendarDateSelected,
    scheduleCalendarFocus,
    studentsPanelFocus,
    progressChecklistFocus,
    progressSectionFocus,
    calendarOverviewFocus,
    payrollReviewFocus,
    lessonFeedbackFocus,
    activeOnboardingStep,
    isCalendarOnboarding,
    guideNeedsAttention,
    dismissOnboarding,
    openOnboardingManually,
    changeOnboardingStep,
    completeOnboarding,
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
    returnToViewFromSchedule
  } = useNavigationState({ vault, username, view, setView, onboardingVisible, setOnboardingVisible, setNoticeModalOpen, setFeedbackModalOpen, setMobileNavOpen });

  const {
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
  } = useVaultActions({ vault, updateVault, persist, setAiScheduleSession });

  useEffect(() => {
    if (!vault || !username || !vault.notice.enabled) return;
    const storedVersion = localStorage.getItem(noticeReadKey(username));
    setNoticeReadVersion(storedVersion ?? "");
    setNoticeModalOpen(storedVersion !== vault.notice.updatedAt);
  }, [username, vault?.notice.enabled, vault?.notice.updatedAt]);

  function acknowledgeNotice() {
    if (!vault || !username) return;
    localStorage.setItem(noticeReadKey(username), vault.notice.updatedAt);
    setNoticeReadVersion(vault.notice.updatedAt);
    setNoticeModalOpen(false);
  }

  async function sendFeedback() {
    const content = feedbackContent.trim();
    if (!content || !token) return;
    setFeedbackState("sending");
    setFeedbackError("");
    try {
      await submitFeedback(token, feedbackTitle.trim(), content);
      setFeedbackState("sent");
      setFeedbackTitle("");
      setFeedbackContent("");
      window.setTimeout(() => {
        setFeedbackModalOpen(false);
        setFeedbackState("idle");
      }, 900);
    } catch (error) {
      setFeedbackState("error");
      setFeedbackError(error instanceof Error ? error.message : "反馈发送失败。");
    }
  }

  const workspaceState = useMemo(() => ({ appDate, view, amountsVisible, selectedDate, lessonFeedbackSyncNonce, aiScheduleSession, username, password, token, role, vault, persistLoginAfterClose, scheduleCalendarFocus, studentsPanelFocus, progressChecklistFocus, progressSectionFocus, calendarOverviewFocus, payrollReviewFocus, lessonFeedbackFocus, isCalendarOnboarding }), [appDate, view, amountsVisible, selectedDate, lessonFeedbackSyncNonce, aiScheduleSession, username, password, token, role, vault, persistLoginAfterClose, scheduleCalendarFocus, studentsPanelFocus, progressChecklistFocus, progressSectionFocus, calendarOverviewFocus, payrollReviewFocus, lessonFeedbackFocus, isCalendarOnboarding]);
  const workspaceCallbacks = useStableCallbacks({ updatePersistLoginAfterClose, clearCurrentLocalCache, updateVault, setOnboardingCalendarDateSelected, changeView, openLessonInCalendar, openTodayLessonInScheduleRecords, openCalendarLessonInScheduleRecords, openCalendarDateInScheduleRecords, openProgressLessonInScheduleRecords, openLessonInProgressChecklist, openLessonInFeedback, openPayrollReviewLessonInScheduleRecords, openPayrollReconcileLessonInScheduleRecords, openPayrollSuggestedScheduleInCalendar, returnToViewFromSchedule, updateWeekStart, addGrade, updateGrade, deleteGrade, addLesson, addLessons, addLessonAndUpdateLesson, updateLesson, updateLessons, updateCalendarDayNote, deleteLesson, restoreDeletedLessons, permanentlyDeleteDeletedLessons, updateCampus, deleteCampus, updateStudent, updateStudents, updateProfile, deleteStudent, deleteStudents, addCourse, updateCourse, updateCourses, syncCoursesToLessons, deleteCourse, transferStudentCourse, addCustomTimePreset, deleteCustomTimePreset, addCustomCourseType, updateCourseTypeLabel, deleteCourseType, updateCourseTypeFeeRule, syncCourseTypeFeeRuleToCourses, migrateCourseTypeLessons, updateAiScheduleSession, applyAiScheduleDraft, addSubject, updateSubject, deleteSubject, deleteCustomCourseType, addSalaryAdjustment, deleteSalaryAdjustment, addTodo, updateTodo, deleteTodo, mergeTodosIntoMemo, saveMemo, deleteMemo, saveStudentProgressRecord, saveStudentProgressRecords, deleteStudentProgressRecord, saveProgressChecklistTemplate, deleteProgressChecklistTemplate, saveExternalPromptTemplate, saveProgressChecklistCompletion, updateProgressChecklistCompletions, saveProgressChecklistCompletions, deleteProgressChecklistCompletion, addGradeRecord, deleteGradeRecord, generateDrafts });

  if (!bootstrapped) {
    return (
      <div className="dashboard-shell flex min-h-screen items-center justify-center p-6">
        <div className="rounded-[18px] border border-[#dbe4ef] bg-white px-6 py-5 text-center shadow-[0_18px_50px_rgba(15,35,66,0.1)]">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#fff1e2] text-[#ff8617]">
            <GraduationCap size={24} />
          </div>
          <div className="text-base font-extrabold text-[#061226]">正在恢复会话</div>
          <div className="mt-1 text-sm font-semibold text-[#64748b]">请稍候</div>
        </div>
      </div>
    );
  }

  if (!vault) {
    return (<LoginScreen
      onLogin={login}
      onRegister={register}
      getPersistentLoginPreference={readPersistentLoginPreference}
    />);
  }

  const activeTitle = viewTitles[view];
  const selectedDateLabel = formatAppDateLabel(selectedDate, {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short"
  });

  const mobileItems = role === "admin"
    ? [...viewTitlesList, { key: "admin" as ViewKey, label: viewTitles.admin }]
    : viewTitlesList;
  const hasUnreadNotice = vault.notice.enabled && noticeReadVersion !== vault.notice.updatedAt;
  const saveBadgeVariant =
    saveState === "saved" ? "sage" : saveState === "saving" ? "amber" : saveState === "error" ? "destructive" : "secondary";
  const saveCompactLabel =
    saveState === "saving" ? "同步中" : saveState === "saved" ? "已同步" : saveState === "error" ? "同步失败" : "云端";
  const saveFullLabel =
    saveState === "saving" ? "同步中..." : saveState === "saved" ? "已加密同步" : saveState === "error" ? "云端同步失败" : "云端加密";
  const syncButtonLabel =
    syncState === "checking" ? "检查中" : syncState === "syncing" ? "同步中" : remoteCloudVersion ? "有更新" : "同步";
  const showSyncAlert = Boolean(syncMessage) && (syncState === "outdated" || syncState === "conflict" || syncState === "error");

  return (
    <div className="dashboard-shell flex min-h-screen">
      {dialog}
      <Sidebar
        view={view}
        collapsed={collapsed}
        role={role}
        username={username}
        onViewChange={changeView}
        onToggle={() => setCollapsed((v) => !v)}
      />

      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1720px] px-3 py-4 sm:px-6 lg:px-9 lg:py-9">
          <div className="mb-5 flex items-center justify-between gap-3 md:hidden">
            <button
              type="button"
              onClick={() => setMobileNavOpen((open) => !open)}
              className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#042b50] text-white shadow-[0_12px_26px_rgba(3,31,61,0.24)]"
              aria-label="打开导航"
            >
              <Menu size={22} />
            </button>
            <div className="flex min-w-0 items-center gap-2">
              <div className="orange-gradient flex h-10 w-10 items-center justify-center rounded-[12px] text-white">
                <GraduationCap size={22} />
              </div>
              <div className="truncate text-lg font-extrabold text-[#061226]">TeachPro</div>
            </div>
            <Badge variant={saveBadgeVariant}>
              {saveCompactLabel}
            </Badge>
          </div>

          {mobileNavOpen && (
            <div className="app-fade-down mb-5 grid grid-cols-2 gap-2 rounded-[18px] border border-[#dbe4ef] bg-white p-3 shadow-[0_14px_34px_rgba(15,35,66,0.1)] md:hidden">
                {mobileItems.map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => {
                      changeView(item.key);
                      setMobileNavOpen(false);
                    }}
                    className={`rounded-[12px] px-3 py-2 text-left text-sm font-bold ${
                      view === item.key ? "orange-gradient text-white" : "bg-[#f3f7fb] text-[#25324a]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={openOnboardingManually}
                  className={`rounded-[12px] px-3 py-2 text-left text-sm font-bold ${
                    guideNeedsAttention ? "orange-gradient text-white shadow-[0_10px_22px_rgba(255,134,23,0.22)]" : "bg-[#eaf2ff] text-[#1557c2]"
                  }`}
                >
                  新手指引{guideNeedsAttention ? " · 待配置" : ""}
                </button>
            </div>
          )}

          <header className="app-fade-down mb-6 flex flex-col gap-4 lg:mb-8 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#64748b] md:hidden">
                <span>{activeTitle}</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <h1 className="break-words text-[28px] font-extrabold leading-tight text-[#050b18] sm:text-[38px]">
                  <TimeGreeting />
                </h1>
              </div>
            </div>

            <div
              className={`grid ${
                role === "admin"
                  ? "grid-cols-[56px_56px_56px_56px_minmax(0,1fr)]"
                  : "grid-cols-[56px_56px_56px_56px_56px_minmax(0,1fr)]"
              } gap-2 sm:flex sm:flex-wrap sm:gap-3 xl:justify-end`}
            >
              <button
                type="button"
                onClick={() => setNoticeModalOpen(true)}
                className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] border border-[#dbe4ef] bg-white text-[#25324a] shadow-[0_12px_28px_rgba(15,35,66,0.08)] transition-colors hover:bg-[#f8fbff] sm:h-[58px] sm:w-[58px]"
                aria-label="查看系统公告"
                title="系统公告"
              >
                <Bell size={21} />
                {hasUnreadNotice && (
                  <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-[#ef4444] ring-2 ring-white" />
                )}
              </button>

              <button
                type="button"
                onClick={openOnboardingManually}
                className={`relative flex h-14 min-w-[56px] shrink-0 items-center justify-center rounded-[16px] border transition-colors sm:h-[58px] ${
                  guideNeedsAttention
                    ? "orange-gradient gap-2 border-[#ffb15c] px-3 text-white shadow-[0_14px_30px_rgba(255,134,23,0.24)] ring-2 ring-[#ffb15c]/35 sm:w-auto sm:px-4"
                    : "w-14 border-[#dbe4ef] bg-white text-[#25324a] shadow-[0_12px_28px_rgba(15,35,66,0.08)] hover:bg-[#f8fbff] sm:w-[58px]"
                }`}
                aria-label="查看新手指引"
                title={guideNeedsAttention ? "新手指引：基础配置待完成" : "新手指引"}
              >
                <Compass size={21} />
                {guideNeedsAttention && (
                  <>
                    <span className="hidden text-sm font-extrabold sm:inline">新手指引</span>
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[10px] font-extrabold text-white ring-2 ring-white">
                      待
                    </span>
                  </>
                )}
              </button>

              {role !== "admin" && (
                <button
                  type="button"
                  onClick={() => {
                    setFeedbackModalOpen(true);
                    setFeedbackState("idle");
                    setFeedbackError("");
                  }}
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] border border-[#dbe4ef] bg-white text-[#25324a] shadow-[0_12px_28px_rgba(15,35,66,0.08)] transition-colors hover:bg-[#f8fbff] sm:h-[58px] sm:w-[58px]"
                  aria-label="发送功能反馈"
                  title="功能反馈"
                >
                  <MessageSquare size={21} />
                </button>
              )}

              <button
                type="button"
                onClick={() => setAmountsVisible((visible) => !visible)}
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] border shadow-[0_12px_28px_rgba(15,35,66,0.08)] transition-colors sm:h-[58px] sm:w-[58px] ${
                  amountsVisible
                    ? "border-[#bfdbfe] bg-[#eaf2ff] text-[#1557c2] ring-2 ring-[#bfdbfe]/60"
                    : "border-[#dbe4ef] bg-white text-[#25324a] hover:bg-[#f8fbff]"
                }`}
                aria-label={amountsVisible ? "隐藏课时费金额" : "显示课时费金额"}
                aria-pressed={amountsVisible}
                title={amountsVisible ? "隐藏课时费金额" : "显示课时费金额"}
              >
                {amountsVisible ? <EyeOff size={21} /> : <Eye size={21} />}
              </button>

              <button
                type="button"
                onClick={() => void syncLatestCloudVault()}
                disabled={syncState === "syncing" || saveState === "saving"}
                className={`relative flex h-14 min-w-[56px] shrink-0 items-center justify-center rounded-[16px] border transition-colors sm:h-[58px] sm:w-auto sm:gap-2 sm:px-4 ${
                  remoteCloudVersion || syncState === "conflict"
                    ? "border-[#ffb15c] bg-[#fff7ed] text-[#9a3412] shadow-[0_12px_28px_rgba(255,134,23,0.12)]"
                    : "border-[#dbe4ef] bg-white text-[#25324a] shadow-[0_12px_28px_rgba(15,35,66,0.08)] hover:bg-[#f8fbff]"
                } disabled:cursor-not-allowed disabled:opacity-60`}
                aria-label="同步云端数据"
                title="同步云端最新数据"
              >
                <RefreshCw size={20} className={syncState === "syncing" || syncState === "checking" ? "animate-spin" : undefined} />
                <span className="hidden text-sm font-extrabold sm:inline">{syncButtonLabel}</span>
                {(remoteCloudVersion || syncState === "conflict") && (
                  <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-[#ef4444] ring-2 ring-white" />
                )}
                <SyncCountdownBadge
                  intervalSeconds={syncCheckIntervalSeconds}
                  enabled={Boolean(token && cloudVersion)}
                  syncState={syncState}
                  saving={saveState === "saving"}
                  hasRemoteVersion={Boolean(remoteCloudVersion)}
                  resetKey={syncCountdownResetKey}
                />
              </button>

              <label className="flex h-14 min-w-0 items-center gap-2 rounded-[16px] border border-[#dbe4ef] bg-white px-3 shadow-[0_12px_28px_rgba(15,35,66,0.08)] sm:h-[58px] sm:gap-3 sm:px-4">
                <Calendar size={20} className="shrink-0 text-[#25324a]" />
                <span className="hidden truncate text-sm font-bold text-[#25324a] sm:block">{selectedDateLabel}</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-[10px] border border-[#dbe4ef] bg-white px-2 text-sm font-bold text-[#25324a] outline-none focus:border-[#ff8617] focus:ring-2 focus:ring-[#ff8617]/20 sm:flex-none sm:px-3"
                  aria-label="选择提醒日期"
                />
              </label>

              <div className="hidden items-center gap-2 md:flex">
                <Button variant="outline" className="h-[58px] rounded-[16px]" onClick={signOut}>
                  <LogOut size={18} /> 退出
                </Button>
              </div>

              <Badge
                variant={saveBadgeVariant}
                className="hidden h-[58px] items-center rounded-[16px] px-4 text-sm md:inline-flex"
              >
                {saveFullLabel}
              </Badge>
            </div>
          </header>

        {showSyncAlert && (
          <div className={`mb-6 rounded-[16px] border p-4 ${
            syncState === "conflict" || syncState === "error"
              ? "border-[#fecaca] bg-[#fff1f2] text-[#991b1b]"
              : "border-[#fed7aa] bg-[#fff7ed] text-[#9a3412]"
          }`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-extrabold">
                  {syncState === "conflict" ? "保存被阻止，云端已有新版本" : syncState === "error" ? "云端同步异常" : "云端已有新版本"}
                </div>
                <div className="mt-1 text-sm font-semibold leading-6">{syncMessage}</div>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="border-current bg-white/80"
                  disabled={saveState === "saving"}
                  onClick={() => void syncLatestCloudVault()}
                >
                  <RefreshCw size={15} /> 同步云端最新数据
                </Button>
                {syncState === "conflict" && (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={saveState === "saving"}
                    onClick={confirmForceOverwriteCloud}
                  >
                    确认覆盖云端
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {deletion && (
          <div className="mb-6 flex flex-col gap-4 rounded-[16px] border border-[#fecaca] bg-[#fff1f2] p-4 text-[#991b1b] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <AlertTriangle size={22} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-extrabold">账号删除申请待处理</div>
                <div className="mt-1 text-sm font-semibold leading-6">
                  {deletion.scheduledAt
                    ? `删除计划时间：${formatAppDateTime(deletion.scheduledAt)}。在此之前可撤销申请。`
                    : "管理员已发起删除申请，正在等待二次确认。在此之前可撤销申请。"}
                </div>
              </div>
            </div>
            <Button variant="outline" className="shrink-0 border-[#fca5a5] bg-white text-[#991b1b]" onClick={cancelDeletionRequest}>
              撤销删除申请
            </Button>
          </div>
        )}

        {noticeModalOpen && vault.notice.enabled && !onboardingVisible && (
          <div className="app-fade-in fixed inset-0 z-50 flex items-center justify-center bg-[#061226]/40 p-4 backdrop-blur-sm">
              <div className="app-modal-panel w-full max-w-[520px] overflow-hidden rounded-[22px] border border-[#dbe4ef] bg-white shadow-[0_30px_80px_rgba(6,18,38,0.24)]">
                <div className="flex items-start gap-4 border-b border-[#e8eef6] p-6">
                  <div className="orange-gradient flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white">
                    <Bell size={22} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase text-[#ff8617]">系统公告</p>
                    <h2 className="mt-1 text-2xl font-extrabold leading-tight text-[#061226]">
                      {vault.notice.title}
                    </h2>
                  </div>
                </div>
                <div className="p-6">
                  <p className="whitespace-pre-wrap text-[15px] leading-7 text-[#25324a]">
                    {vault.notice.content}
                  </p>
                  <p className="mt-4 text-xs font-semibold text-[#64748b]">
                    更新时间：{formatAppDateTime(vault.notice.updatedAt)}
                  </p>
                  <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <Button variant="outline" onClick={() => setNoticeModalOpen(false)}>
                      稍后查看
                    </Button>
                    <Button onClick={acknowledgeNotice}>
                      已阅读并确认
                    </Button>
                  </div>
                </div>
              </div>
          </div>
        )}

        {role !== "admin" && feedbackModalOpen && (
          <div className="app-fade-in fixed inset-0 z-50 flex items-center justify-center bg-[#061226]/40 p-4 backdrop-blur-sm">
              <div className="app-modal-panel w-full max-w-[560px] overflow-hidden rounded-[22px] border border-[#dbe4ef] bg-white shadow-[0_30px_80px_rgba(6,18,38,0.24)]">
                <div className="flex items-start gap-4 border-b border-[#e8eef6] p-6">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#eaf2ff] text-[#1557c2]">
                    <MessageSquare size={22} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase text-[#1557c2]">功能反馈</p>
                    <h2 className="mt-1 text-2xl font-extrabold leading-tight text-[#061226]">发送给管理员</h2>
                    <p className="mt-2 text-sm font-semibold leading-6 text-[#64748b]">
                      这里只做单向提交，管理员可在后台查看和标注处理进度。
                    </p>
                  </div>
                </div>
                <div className="space-y-4 p-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[#25324a]">主题</label>
                    <Input
                      value={feedbackTitle}
                      onChange={(event) => setFeedbackTitle(event.target.value)}
                      placeholder="例如：排课页面希望增加筛选"
                      maxLength={120}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[#25324a]">反馈内容</label>
                    <Textarea
                      value={feedbackContent}
                      onChange={(event) => setFeedbackContent(event.target.value)}
                      placeholder="写下功能改进、使用问题或需要优化的地方..."
                      className="min-h-[150px]"
                      maxLength={4000}
                    />
                    <div className="text-right text-xs font-semibold text-[#94a3b8]">
                      {feedbackContent.length} / 4000
                    </div>
                  </div>
                  {feedbackState === "sent" && (
                    <div className="rounded-[12px] border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-sm font-bold text-[#166534]">
                      已发送给管理员。
                    </div>
                  )}
                  {feedbackError && (
                    <div className="rounded-[12px] border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm font-bold text-[#b91c1c]">
                      {feedbackError}
                    </div>
                  )}
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <Button
                      variant="outline"
                      disabled={feedbackState === "sending"}
                      onClick={() => setFeedbackModalOpen(false)}
                    >
                      取消
                    </Button>
                    <Button
                      disabled={!feedbackContent.trim() || feedbackState === "sending"}
                      onClick={sendFeedback}
                    >
                      <Send size={15} /> {feedbackState === "sending" ? "发送中" : "发送反馈"}
                    </Button>
                  </div>
                </div>
              </div>
          </div>
        )}

        {onboardingVisible && (
          <OnboardingGuide
            step={activeOnboardingStep}
            stepIndex={onboardingStepIndex}
            onStepChange={changeOnboardingStep}
            onComplete={completeOnboarding}
            onDismiss={dismissOnboarding}
          />
        )}
        <WorkspaceViews state={workspaceState} callbacks={workspaceCallbacks} />
        </div>
      </main>
    </div>
  );
}

const viewTitlesList: Array<{ key: ViewKey; label: string }> = [
  ...navItems.map((item) => ({ key: item.key, label: item.label }))
];

function noticeReadKey(username: string): string {
  return `teacher-salary-tracker:notice-read:${username}`;
}
