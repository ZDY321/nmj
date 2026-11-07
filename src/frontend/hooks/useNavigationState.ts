import { todayIso } from "@/frontend/lib/calculations";
import {
  type ViewKey
} from "@/frontend/lib/helpers";
import { getOnboardingTourStartIndex, getOnboardingTourStep, isOnboardingSetupComplete, normalizeOnboardingStepKeys, onboardingTourSteps, type OnboardingStepKey } from "@/frontend/lib/onboarding";
import type { ProgressChecklistFocus } from "@/frontend/lib/progressChecklist";
import type { ProgressSectionView } from "@/frontend/views/ProgressView";
import type {
  CourseType,
  Lesson,
  TeacherVault
} from "@/shared/types";
import { useEffect, useRef, useState } from "react";

type CalendarOverviewFocusState = {
  selectedDate: string;
  month: string;
  overviewPage: "month" | "week";
  weekCampusFilter: string;
  weekCourseTypeFilter: "all" | CourseType;
  weekGradeFilter: string;
  weekSubjectFilter: string;
  weekStudentFilter: string;
  weekMakeupFilter: "all" | "any_makeup" | "regular_makeup" | "substitute_class";
};

type PayrollPanelFocus = "review" | "reconcile" | "mapping" | "guide";

type StudentsPanelFocus = "profile" | "salaryRules" | "campuses" | "students" | "courses";

type ScheduleCalendarFocus = {
  date: string;
  lessonId?: string;
  targetPanel?: "calendar" | "schedule" | "records";
  calendarMode?: "schedule" | "view";
  scheduleDraft?: {
    courseGroupId?: string;
    startTime?: string;
    endTime?: string;
  };
  nonce: number;
  returnTarget?: {
    kind: "view";
    view: ViewKey;
    label: string;
    calendarFocus?: CalendarOverviewFocusState;
    payrollPanel?: PayrollPanelFocus;
  } | null;
};

function onboardingDismissedKey(username: string): string {
  return `teacher-salary-tracker:onboarding-dismissed:${username}`;
}

function onboardingProgressKey(username: string): string {
  return `teacher-salary-tracker:onboarding-progress:${username}`;
}

function onboardingCurrentStepKey(username: string): string {
  return `teacher-salary-tracker:onboarding-current-step:${username}`;
}

function readOnboardingVisitedSteps(username: string): OnboardingStepKey[] {
  try {
    return normalizeOnboardingStepKeys(JSON.parse(localStorage.getItem(onboardingProgressKey(username)) ?? "[]"));
  } catch {
    return [];
  }
}

function shouldShowOnboarding(vault: TeacherVault): boolean {
  return (
    vault.campuses.length === 0 &&
    vault.students.length === 0 &&
    vault.courseGroups.length === 0 &&
    vault.lessons.length === 0 &&
    (vault.gradeRecords ?? []).length === 0 &&
    vault.salaryAdjustments.length === 0
  );
}

interface NavigationStateOptions {
  vault: TeacherVault | null;
  username: string;
  view: ViewKey;
  setView: (view: ViewKey) => void;
  onboardingVisible: boolean;
  setOnboardingVisible: (value: boolean) => void;
  setNoticeModalOpen: (value: boolean) => void;
  setFeedbackModalOpen: (value: boolean) => void;
  setMobileNavOpen: (value: boolean) => void;
}

export function useNavigationState({ vault, username, view, setView, onboardingVisible, setOnboardingVisible, setNoticeModalOpen, setFeedbackModalOpen, setMobileNavOpen }: NavigationStateOptions) {
  const [onboardingStepIndex, setOnboardingStepIndex] = useState(0);
  const [onboardingCalendarDateSelected, setOnboardingCalendarDateSelected] = useState(false);

  const onboardingAccountRef = useRef<string | null>(null);

  const [onboardingVisitedSteps, setOnboardingVisitedSteps] = useState<OnboardingStepKey[]>([]);
  const [scheduleCalendarFocus, setScheduleCalendarFocus] = useState<ScheduleCalendarFocus | null>(null);
  const [studentsPanelFocus, setStudentsPanelFocus] = useState<{ panel: StudentsPanelFocus; nonce: number } | null>(null);
  const [progressChecklistFocus, setProgressChecklistFocus] = useState<ProgressChecklistFocus | null>(null);
  const [progressSectionFocus, setProgressSectionFocus] = useState<{ section: ProgressSectionView; nonce: number } | null>(null);
  const [calendarOverviewFocus, setCalendarOverviewFocus] = useState<(CalendarOverviewFocusState & { nonce: number }) | null>(null);
  const [payrollReviewFocus, setPayrollReviewFocus] = useState<{ panel: PayrollPanelFocus; nonce: number } | null>(null);
  const [lessonFeedbackFocus, setLessonFeedbackFocus] = useState<{ lessonId: string; nonce: number } | null>(null);

  useEffect(() => {
    if (!username) {
      setOnboardingVisitedSteps([]);
      return;
    }
    setOnboardingVisitedSteps(readOnboardingVisitedSteps(username));
  }, [username]);

  useEffect(() => {
    if (!vault || !username) {
      onboardingAccountRef.current = null;
      setOnboardingVisible(false);
      return;
    }
    // Initialize once per login so editing a highlighted form cannot restart or close the tour.
    if (onboardingAccountRef.current === username) return;
    onboardingAccountRef.current = username;
    const dismissed = localStorage.getItem(onboardingDismissedKey(username)) === "true";
    if (!dismissed && shouldShowOnboarding(vault)) {
      openOnboardingStep(getOnboardingTourStartIndex(localStorage.getItem(onboardingCurrentStepKey(username)), readOnboardingVisitedSteps(username)));
    }
  }, [username, vault]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [view]);

  const activeOnboardingStep = getOnboardingTourStep(onboardingStepIndex, view, onboardingCalendarDateSelected);

  const isCalendarOnboarding = onboardingVisible && activeOnboardingStep.id === "calendar-records";

  const guideNeedsAttention = vault ? !isOnboardingSetupComplete(vault, onboardingVisitedSteps) : false;

  function dismissOnboarding() {
    if (username) {
      localStorage.setItem(onboardingDismissedKey(username), "true");
    }
    setNoticeModalOpen(false);
    setOnboardingVisible(false);
  }

  function openOnboardingManually() {
    openOnboardingStep(getOnboardingTourStartIndex(localStorage.getItem(onboardingCurrentStepKey(username)), onboardingVisitedSteps));
  }

  function recordOnboardingStep(stepKey: OnboardingStepKey) {
    if (!username) return;
    setOnboardingVisitedSteps((current) => {
      const stored = readOnboardingVisitedSteps(username);
      const next = Array.from(new Set([...stored, ...current, stepKey]));
      if (next.length === current.length && current.includes(stepKey)) return current;
      localStorage.setItem(onboardingProgressKey(username), JSON.stringify(next));
      return next;
    });
  }

  function openOnboardingStep(index: number) {
    const step = onboardingTourSteps[index];
    if (!step) return;
    setNoticeModalOpen(false);
    setFeedbackModalOpen(false);
    setMobileNavOpen(false);
    setOnboardingStepIndex(index);
    setOnboardingVisible(true);
    if (username) localStorage.setItem(onboardingCurrentStepKey(username), step.id);
    const nonce = Date.now();
    if (step.id === "calendar-records") {
      const date = todayIso();
      setOnboardingCalendarDateSelected(false);
      setCalendarOverviewFocus({
        selectedDate: date,
        month: date.slice(0, 7),
        overviewPage: "month",
        weekCampusFilter: "all",
        weekCourseTypeFilter: "all",
        weekGradeFilter: "all",
        weekSubjectFilter: "all",
        weekStudentFilter: "",
        weekMakeupFilter: "all",
        nonce
      });
    }
    if (step.studentsPanel) {
      setStudentsPanelFocus({ panel: step.studentsPanel, nonce });
    }
    if (step.schedulePanel) {
      setScheduleCalendarFocus({ date: todayIso(), targetPanel: step.schedulePanel, calendarMode: "view", nonce });
    }
    if (step.group === "payroll") setPayrollReviewFocus({ panel: "review", nonce });
    if (step.group === "grades") {
      setLessonFeedbackFocus(null);
      setProgressChecklistFocus(null);
      setProgressSectionFocus({ section: "grades", nonce });
    }
    setView(step.view);
  }

  function changeOnboardingStep(index: number) {
    const current = onboardingTourSteps[onboardingStepIndex];
    const next = onboardingTourSteps[index];
    if (!next) return;
    if (index === onboardingStepIndex + 1 && next.group !== current.group) {
      recordOnboardingStep(current.group);
    }
    openOnboardingStep(index);
  }

  function completeOnboarding() {
    recordOnboardingStep(onboardingTourSteps[onboardingStepIndex].group);
    if (username) localStorage.removeItem(onboardingCurrentStepKey(username));
    dismissOnboarding();
  }

  function changeView(nextView: ViewKey) {
    if (onboardingVisible) {
      dismissOnboarding();
    }
    if (nextView === "schedule") {
      setScheduleCalendarFocus({
        date: todayIso(),
        targetPanel: "calendar",
        calendarMode: "view",
        nonce: Date.now()
      });
    }
    if (nextView === "progress") {
      setProgressSectionFocus(null);
    }
    if (nextView !== "progress") {
      setLessonFeedbackFocus(null);
    }
    setView(nextView);
  }

  function openLessonInCalendar(lesson: Lesson) {
    setNoticeModalOpen(false);
    setFeedbackModalOpen(false);
    setMobileNavOpen(false);
    setOnboardingVisible(false);
    setScheduleCalendarFocus({ date: lesson.date, lessonId: lesson.id, targetPanel: "calendar", nonce: Date.now() });
    setView("schedule");
  }

  function openLessonInScheduleRecords(lesson: Lesson, returnTarget?: ScheduleCalendarFocus["returnTarget"]) {
    openDateInScheduleRecords(lesson.date, returnTarget, lesson.id);
  }

  function openDateInScheduleRecords(date: string, returnTarget?: ScheduleCalendarFocus["returnTarget"], lessonId?: string) {
    setNoticeModalOpen(false);
    setFeedbackModalOpen(false);
    setMobileNavOpen(false);
    setOnboardingVisible(isCalendarOnboarding && returnTarget?.view === "calendar");
    setScheduleCalendarFocus({ date, lessonId, targetPanel: "records", returnTarget: returnTarget ?? null, nonce: Date.now() });
    setView("schedule");
  }

  function openTodayLessonInScheduleRecords(lesson: Lesson) {
    openLessonInScheduleRecords(lesson, { kind: "view", view: "today", label: "返回今日提醒" });
  }

  function openCalendarLessonInScheduleRecords(lesson: Lesson, calendarFocus: CalendarOverviewFocusState) {
    openLessonInScheduleRecords(lesson, {
      kind: "view",
      view: "calendar",
      label: "返回日历总览",
      calendarFocus
    });
  }

  function openCalendarDateInScheduleRecords(date: string, calendarFocus: CalendarOverviewFocusState) {
    openDateInScheduleRecords(date, {
      kind: "view",
      view: "calendar",
      label: "返回日历总览",
      calendarFocus
    });
  }

  function openProgressLessonInScheduleRecords(lesson: Lesson) {
    openLessonInScheduleRecords(lesson, { kind: "view", view: "progress", label: "返回学情与作业" });
  }

  function openLessonInProgressChecklist(lesson: Lesson) {
    setNoticeModalOpen(false);
    setFeedbackModalOpen(false);
    setMobileNavOpen(false);
    setOnboardingVisible(false);
    setLessonFeedbackFocus(null);
    setProgressSectionFocus(null);
    setProgressChecklistFocus({
      courseGroupId: lesson.courseGroupId,
      templateId: lesson.content.checklistTemplateId,
      lessonId: lesson.id,
      date: lesson.date,
      nonce: Date.now()
    });
    setProgressSectionFocus(null);
    setView("progress");
  }

  function openLessonInFeedback(lesson: Lesson) {
    setNoticeModalOpen(false);
    setFeedbackModalOpen(false);
    setMobileNavOpen(false);
    setOnboardingVisible(false);
    setProgressChecklistFocus(null);
    setLessonFeedbackFocus({ lessonId: lesson.id, nonce: Date.now() });
    setProgressSectionFocus(null);
    // 课后反馈已并入“学情与作业”，跳转落到该页的反馈子页。
    setView("progress");
  }

  function openPayrollReviewLessonInScheduleRecords(lesson: Lesson) {
    openLessonInScheduleRecords(lesson, {
      kind: "view",
      view: "payroll",
      label: "返回工资核对",
      payrollPanel: "review"
    });
  }

  function openPayrollReconcileLessonInScheduleRecords(lesson: Lesson) {
    openLessonInScheduleRecords(lesson, {
      kind: "view",
      view: "payroll",
      label: "返回教务课表对账",
      payrollPanel: "reconcile"
    });
  }

  function openPayrollSuggestedScheduleInCalendar(request: { date: string; startTime: string; endTime: string; courseGroupId?: string }) {
    setNoticeModalOpen(false);
    setFeedbackModalOpen(false);
    setMobileNavOpen(false);
    setOnboardingVisible(false);
    setScheduleCalendarFocus({
      date: request.date,
      targetPanel: "calendar",
      calendarMode: "schedule",
      scheduleDraft: {
        courseGroupId: request.courseGroupId,
        startTime: request.startTime,
        endTime: request.endTime
      },
      returnTarget: {
        kind: "view",
        view: "payroll",
        label: "返回教务课表对账",
        payrollPanel: "reconcile"
      },
      nonce: Date.now()
    });
    setView("schedule");
  }

  function returnToViewFromSchedule(target: NonNullable<ScheduleCalendarFocus["returnTarget"]>) {
    setNoticeModalOpen(false);
    setFeedbackModalOpen(false);
    setMobileNavOpen(false);
    setOnboardingVisible(isCalendarOnboarding && target.view === "calendar");
    if (target.view === "calendar" && target.calendarFocus) {
      setCalendarOverviewFocus({ ...target.calendarFocus, nonce: Date.now() });
    }
    if (target.view === "payroll" && target.payrollPanel) {
      setPayrollReviewFocus({ panel: target.payrollPanel, nonce: Date.now() });
    }
    setView(target.view);
  }

  return {
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
  };
}
