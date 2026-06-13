import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Calendar,
  GraduationCap,
  LogOut,
  Menu,
  MessageSquare,
  Eye,
  EyeOff,
  RefreshCw,
  Send
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoginScreen } from "@/frontend/components/LoginScreen";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { OnboardingGuide } from "@/frontend/components/OnboardingGuide";
import { Sidebar } from "@/frontend/components/Sidebar";
import { AdminView } from "@/frontend/views/AdminView";
import { CalendarView } from "@/frontend/views/CalendarView";
import { GradesView } from "@/frontend/views/GradesView";
import { PayrollReviewView } from "@/frontend/views/PayrollReviewView";
import { ProgressView } from "@/frontend/views/ProgressView";
import { ScheduleView } from "@/frontend/views/ScheduleView";
import { SalaryView } from "@/frontend/views/SalaryView";
import { StudentsView } from "@/frontend/views/StudentsView";
import { TodayView } from "@/frontend/views/TodayView";
import { TodoView } from "@/frontend/views/TodoView";
import { buildFeeSnapshot, currentAppHour, defaultFeeRuleForCourseType, defaultSalaryGradeRule, feeRuleForCourseType, formatAppDateLabel, formatAppDateTime, getCourse, salaryGradeRateForStage, salaryGradeRuleById, todayIso } from "@/frontend/lib/calculations";
import { ApiError, cancelOwnDeletion, submitFeedback } from "@/frontend/lib/cloud";
import {
  buildScheduleSyncLessonsForDate,
  cloneVault,
  type ViewKey,
  viewTitles,
  datesBetween,
  createLessonFromCourse,
  courseTypeLabel,
  linkSyncedLessonsToPreviousLessons,
  lessonStudentIds,
  makeupNeededStudentIds,
  navItems,
  weekdayOfDateIso
} from "@/frontend/lib/helpers";
import { isOnboardingSetupComplete, normalizeOnboardingStepKeys, type OnboardingStepKey } from "@/frontend/lib/onboarding";
import { attendanceStatusForLessonStatus } from "@/frontend/lib/scheduleViewHelpers";
import { clearVault, getCloudVaultMeta, loadCloudVaultWithVersion, loginAccount, logoutCloud, registerAccount, saveVault } from "@/frontend/lib/storage";
import { makeId } from "@/frontend/lib/crypto";
import { normalizeTimeText, timeToMinutes, timesOverlap } from "@/frontend/lib/time";
import {
  arrayValue as arrayValueLocal,
  isPlainRecord as isPlainRecordLocal,
  numberValue,
  stringValue
} from "@/frontend/lib/typeGuards";
import type {
  Campus,
  AiScheduleSession,
  AttendanceStatus,
  ClassFeeTier,
  CourseGroup,
  CourseType,
  CustomCourseType,
  CustomCourseTypeOption,
  DeletedLessonSource,
  FeeRule,
  GradeRecord,
  Lesson,
  ProgressChecklistCompletion,
  ProgressChecklistTemplate,
  SalaryAdjustment,
  SalaryGradeId,
  Student,
  StudentCourseTransition,
  StudentProgressRecord,
  TeacherVault,
  TeacherProfile,
  TimePreset,
  TodoItem,
  UserDeletionState,
  UserRole,
  WeekStart
} from "@/shared/types";

type UnlockedSession = {
  username: string;
  password: string;
  token: string;
  role: UserRole;
  deletion: UserDeletionState | null;
  vault: TeacherVault;
  selectedDate: string;
  cloudVersion?: string;
  persistAfterClose?: boolean;
};

type StoredUnlockedSession = {
  raw: string;
  persistAfterClose: boolean;
};

type CalendarOverviewFocusState = {
  selectedDate: string;
  month: string;
  overviewPage: "month" | "week";
  weekCampusFilter: string;
  weekGradeFilter: string;
  weekSubjectFilter: string;
  weekStudentFilter: string;
};

type PayrollPanelFocus = "review" | "reconcile";

type ScheduleCalendarFocus = {
  date: string;
  lessonId?: string;
  targetPanel?: "calendar" | "records";
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

const unlockedSessionKey = "teacher-salary-tracker:unlocked-session";
const persistentLoginPreferencePrefix = "teacher-salary-tracker:persistent-login:";
const syncCheckIntervalSeconds = 90;

export function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [role, setRole] = useState<UserRole>("teacher");
  const [deletion, setDeletion] = useState<UserDeletionState | null>(null);
  const [vault, setVault] = useState<TeacherVault | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
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
  const [onboardingVisitedSteps, setOnboardingVisitedSteps] = useState<OnboardingStepKey[]>([]);
  const [amountsVisible, setAmountsVisible] = useState(false);
  const [persistLoginAfterClose, setPersistLoginAfterClose] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [cloudVersion, setCloudVersion] = useState("");
  const [remoteCloudVersion, setRemoteCloudVersion] = useState("");
  const [syncState, setSyncState] = useState<"idle" | "checking" | "syncing" | "outdated" | "conflict" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [syncCountdownSeconds, setSyncCountdownSeconds] = useState(syncCheckIntervalSeconds);
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [scheduleCalendarFocus, setScheduleCalendarFocus] = useState<ScheduleCalendarFocus | null>(null);
  const [calendarOverviewFocus, setCalendarOverviewFocus] = useState<(CalendarOverviewFocusState & { nonce: number }) | null>(null);
  const [payrollReviewFocus, setPayrollReviewFocus] = useState<{ panel: PayrollPanelFocus; nonce: number } | null>(null);
  const [aiScheduleSession, setAiScheduleSession] = useState<AiScheduleSession | null>(null);
  const [greetingTime, setGreetingTime] = useState(() => new Date());
  const cloudVersionRef = useRef("");
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSaveCountRef = useRef(0);
  const cloudCheckSeqRef = useRef(0);
  const skipCloudCheckUntilRef = useRef(0);
  const { confirm, dialog } = useConfirmDialog();

  function rememberUnlockedSession(next?: Partial<UnlockedSession>) {
    const session: UnlockedSession = {
      username,
      password,
      token,
      role,
      deletion,
      vault: vault!,
      selectedDate,
      cloudVersion,
      persistAfterClose: persistLoginAfterClose,
      ...next
    };
    if (!session.username || !session.password || !session.token || !session.vault) return;
    writeUnlockedSession(session);
  }

  async function login(nextUsername: string, nextPassword: string, nextPersistLoginAfterClose: boolean) {
    const result = await loginAccount(nextUsername, nextPassword);
    setUsername(result.account.username);
    setPassword(nextPassword);
    setToken(result.token);
    setRole(result.account.role);
    setDeletion(result.deletion);
    setVault(result.vault);
    setAmountsVisible(false);
    setPersistLoginAfterClose(nextPersistLoginAfterClose);
    writePersistentLoginPreference(result.account.username, nextPersistLoginAfterClose);
    cloudVersionRef.current = result.cloudVersion;
    setCloudVersion(result.cloudVersion);
    setRemoteCloudVersion("");
    setSyncState("idle");
    setSyncMessage("");
    rememberUnlockedSession({
      username: result.account.username,
      password: nextPassword,
      token: result.token,
      role: result.account.role,
      deletion: result.deletion,
      vault: result.vault,
      cloudVersion: result.cloudVersion,
      persistAfterClose: nextPersistLoginAfterClose
    });
    if (view === "admin" && result.account.role !== "admin") {
      setView("today");
    }
  }

  async function register(nextUsername: string, nextPassword: string, nextPersistLoginAfterClose: boolean): Promise<UserRole> {
    const result = await registerAccount(nextUsername, nextPassword);
    setUsername(result.account.username);
    setPassword(nextPassword);
    setToken(result.token);
    setRole(result.account.role);
    setDeletion(result.deletion);
    setVault(result.vault);
    setAmountsVisible(false);
    setPersistLoginAfterClose(nextPersistLoginAfterClose);
    writePersistentLoginPreference(result.account.username, nextPersistLoginAfterClose);
    cloudVersionRef.current = result.cloudVersion;
    setCloudVersion(result.cloudVersion);
    setRemoteCloudVersion("");
    setSyncState("idle");
    setSyncMessage("");
    rememberUnlockedSession({
      username: result.account.username,
      password: nextPassword,
      token: result.token,
      role: result.account.role,
      deletion: result.deletion,
      vault: result.vault,
      cloudVersion: result.cloudVersion,
      persistAfterClose: nextPersistLoginAfterClose
    });
    return result.account.role;
  }

  function updatePersistLoginAfterClose(nextPersistLoginAfterClose: boolean) {
    setPersistLoginAfterClose(nextPersistLoginAfterClose);
    if (username) {
      writePersistentLoginPreference(username, nextPersistLoginAfterClose);
    }
    rememberUnlockedSession({ persistAfterClose: nextPersistLoginAfterClose });
  }

  async function persist(nextVault: TeacherVault, options: { force?: boolean } = {}) {
    if (!username || !password) return;
    setVault(nextVault);
    if (token && !options.force && !cloudVersionRef.current) {
      rememberUnlockedSession({ vault: nextVault });
      setSaveState("error");
      setSyncState("error");
      setSyncMessage("云端版本尚未确认。当前修改已保存在本机页面，请先同步云端数据后再继续保存，避免覆盖其他设备的数据。");
      return;
    }
    pendingSaveCountRef.current += 1;
    cloudCheckSeqRef.current += 1;
    setSaveState("saving");
    const saveJob = saveChainRef.current.then(async () => {
      let savedSuccessfully = false;
      let nextCloudVersion = cloudVersionRef.current;
      try {
        const result = await saveVault(username, password, nextVault, {
          token,
          expectedUpdatedAt: options.force ? undefined : cloudVersionRef.current || undefined,
          force: options.force
        });
        nextCloudVersion = result.updatedAt ?? cloudVersionRef.current;
        if (nextCloudVersion) {
          cloudVersionRef.current = nextCloudVersion;
          setCloudVersion(nextCloudVersion);
        }
        rememberUnlockedSession({ vault: nextVault, cloudVersion: nextCloudVersion });
        savedSuccessfully = true;
      } catch (error) {
        rememberUnlockedSession({ vault: nextVault });
        if (error instanceof ApiError && error.status === 409) {
          const currentUpdatedAt = typeof error.body?.currentUpdatedAt === "string" ? error.body.currentUpdatedAt : "";
          setRemoteCloudVersion(currentUpdatedAt);
          setSyncState("conflict");
          setSyncMessage("云端已有其他设备更新。当前页面的修改只保存在本机，继续保存前请先同步云端，或明确覆盖云端。");
        }
        setSaveState("error");
      } finally {
        pendingSaveCountRef.current = Math.max(pendingSaveCountRef.current - 1, 0);
        if (savedSuccessfully) {
          skipCloudCheckUntilRef.current = Date.now() + 2500;
          if (pendingSaveCountRef.current === 0) {
            setRemoteCloudVersion("");
            setSyncState("idle");
            setSyncMessage("");
            setSaveState("saved");
            window.setTimeout(() => {
              if (pendingSaveCountRef.current === 0) {
                setSaveState("idle");
              }
            }, 900);
          } else {
            setSaveState("saving");
          }
        }
      }
    });
    saveChainRef.current = saveJob.catch(() => undefined);
    await saveJob;
  }

  function updateVault(updater: (draft: TeacherVault) => void) {
    if (!vault) return;
    const next = cloneVault(vault);
    updater(next);
    void persist(next);
  }

  async function syncLatestCloudVault() {
    if (!username || !password || !token) return;
    if (saveState === "saving" || pendingSaveCountRef.current > 0) {
      setSyncState("error");
      setSyncMessage("正在保存当前修改，请保存完成后再同步云端数据。");
      return;
    }
    cloudCheckSeqRef.current += 1;
    setSyncState("syncing");
    setSyncMessage("正在同步云端最新数据...");
    try {
      const cloud = await loadCloudVaultWithVersion(token, password, username, { allowLocalFallback: false });
      const nextCloudVersion = cloud.updatedAt || cloudVersion;
      setVault(cloud.vault);
      cloudVersionRef.current = nextCloudVersion;
      setCloudVersion(nextCloudVersion);
      setRemoteCloudVersion("");
      setSyncState("idle");
      setSyncMessage("");
      setSaveState("idle");
      setSyncCountdownSeconds(syncCheckIntervalSeconds);
      rememberUnlockedSession({ vault: cloud.vault, cloudVersion: nextCloudVersion });
    } catch (error) {
      setSyncState("error");
      setSyncMessage(error instanceof Error ? error.message : "云端同步失败，请稍后重试。");
    }
  }

  async function checkCloudVersion(silent = true) {
    const localCloudVersion = cloudVersionRef.current;
    if (!token || !localCloudVersion || document.hidden) return;
    if (saveState === "saving" || pendingSaveCountRef.current > 0 || Date.now() < skipCloudCheckUntilRef.current) return;
    const checkSeq = ++cloudCheckSeqRef.current;
    if (!silent) {
      setSyncState("checking");
      setSyncMessage("正在检查云端版本...");
    }
    try {
      const meta = await getCloudVaultMeta(token);
      if (checkSeq !== cloudCheckSeqRef.current) return;
      if (pendingSaveCountRef.current > 0 || Date.now() < skipCloudCheckUntilRef.current) return;
      const latestLocalCloudVersion = cloudVersionRef.current;
      if (meta.updatedAt && meta.updatedAt !== latestLocalCloudVersion) {
        setRemoteCloudVersion(meta.updatedAt);
        setSyncState("outdated");
        setSyncMessage("云端已有其他设备保存的新版本，建议先同步后继续编辑。");
        setSyncCountdownSeconds(0);
        return;
      }
      setRemoteCloudVersion("");
      if (syncState === "checking" || syncState === "outdated") {
        setSyncState("idle");
        setSyncMessage("");
      }
      setSyncCountdownSeconds(syncCheckIntervalSeconds);
    } catch (error) {
      if (!silent) {
        setSyncState("error");
        setSyncMessage(error instanceof Error ? error.message : "云端版本检查失败。");
      }
    }
  }

  function forceOverwriteCloud() {
    if (!vault) return;
    void persist(vault, { force: true });
  }

  function confirmForceOverwriteCloud() {
    confirm({
      title: "确认用当前页面覆盖云端？",
      description: "这会把当前页面里的整份档案保存为云端最新版本。其他设备稍后会提示云端已有更新；如果当前页面缺少其他设备刚改的数据，那些数据会被覆盖。",
      confirmLabel: "覆盖云端",
      cancelLabel: "先不同步",
      tone: "danger",
      onConfirm: forceOverwriteCloud
    });
  }

  function updateWeekStart(weekStart: WeekStart) {
    updateVault((draft) => {
      draft.preferences = {
        ...(draft.preferences ?? {}),
        weekStartsOn: weekStart
      };
    });
  }

  function addLesson(lesson: Lesson) {
    updateVault((draft) => {
      draft.lessons.push(lesson);
    });
  }

  function addLessons(lessons: Lesson[], options: { replaceLessonIds?: string[] } = {}) {
    if (lessons.length === 0) return;
    updateVault((draft) => {
      const replaceLessonIds = new Set(options.replaceLessonIds ?? []);
      if (replaceLessonIds.size > 0) {
        moveLessonsToTrash(
          draft,
          draft.lessons.filter((lesson) => replaceLessonIds.has(lesson.id)),
          "sync_overwrite",
          "同步排课覆盖旧课节"
        );
      }
      draft.lessons.push(...lessons);
    });
  }

  function addLessonAndUpdateLesson(lessonToAdd: Lesson, lessonToUpdate: Lesson) {
    updateVault((draft) => {
      draft.lessons.push(lessonToAdd);
      draft.lessons = draft.lessons.map((item) => (item.id === lessonToUpdate.id ? lessonToUpdate : item));
    });
  }

  function updateLesson(lesson: Lesson) {
    updateVault((draft) => {
      cleanupResolvedMakeupLessons(draft, lesson);
      const nextLesson = syncOriginalLessonFromMakeupCompletion(draft, lesson);
      draft.lessons = draft.lessons.map((item) => (item.id === nextLesson.id ? nextLesson : item));
    });
  }

  function updateLessons(lessons: Lesson[]) {
    if (lessons.length === 0) return;
    updateVault((draft) => {
      lessons.forEach((lesson) => {
        cleanupResolvedMakeupLessons(draft, lesson);
        const nextLesson = syncOriginalLessonFromMakeupCompletion(draft, lesson);
        draft.lessons = draft.lessons.map((item) => (item.id === nextLesson.id ? nextLesson : item));
      });
    });
  }

  function deleteLesson(lessonId: string) {
    updateVault((draft) => {
      const lesson = draft.lessons.find((item) => item.id === lessonId);
      if (lesson) {
        moveLessonsToTrash(draft, [lesson], "manual", "手动删除课节");
      }
    });
  }

  function restoreDeletedLessons(deletedLessonIds: string[]) {
    if (deletedLessonIds.length === 0) return;
    updateVault((draft) => {
      const idSet = new Set(deletedLessonIds);
      const activeLessonIds = new Set(draft.lessons.map((lesson) => lesson.id));
      const deletedLessons = draft.deletedLessons ?? [];
      const restorables = deletedLessons
        .filter((item) => idSet.has(item.id) && !activeLessonIds.has(item.lesson.id))
        .map((item) => item.lesson);
      draft.lessons.push(...restorables);
      draft.deletedLessons = deletedLessons.filter((item) => !idSet.has(item.id));
    });
  }

  function permanentlyDeleteDeletedLessons(deletedLessonIds: string[]) {
    if (deletedLessonIds.length === 0) return;
    updateVault((draft) => {
      const idSet = new Set(deletedLessonIds);
      draft.deletedLessons = (draft.deletedLessons ?? []).filter((item) => !idSet.has(item.id));
    });
  }

  function updateCampus(campus: Campus) {
    updateVault((draft) => {
      draft.campuses = draft.campuses.map((item) => (item.id === campus.id ? campus : item));
    });
  }

  function deleteCampus(campusId: string) {
    updateVault((draft) => {
      draft.campuses = draft.campuses.filter((campus) => campus.id !== campusId);
    });
  }

  function updateStudent(student: Student) {
    updateVault((draft) => {
      const previousStudent = draft.students.find((item) => item.id === student.id);
      if (previousStudent && Boolean(previousStudent.temporaryTrial) !== Boolean(student.temporaryTrial)) {
        materializeStudentTrialStatusOnLessons(draft, student.id, Boolean(previousStudent.temporaryTrial));
      }
      draft.students = draft.students.map((item) => (item.id === student.id ? student : item));
      if (previousStudent && Boolean(previousStudent.temporaryTrial) !== Boolean(student.temporaryTrial)) {
        syncFutureLessonsWithStudentTrialStatus(draft, student.id, Boolean(student.temporaryTrial));
      }
    });
  }

  function updateProfile(profile: TeacherProfile) {
    updateVault((draft) => {
      draft.profile = profile;
    });
  }

  function deleteStudent(studentId: string) {
    updateVault((draft) => {
      draft.students = draft.students.filter((student) => student.id !== studentId);
    });
  }

  function updateCourse(course: CourseGroup) {
    updateVault((draft) => {
      const previousCourse = draft.courseGroups.find((item) => item.id === course.id);
      draft.courseGroups = draft.courseGroups.map((item) => (item.id === course.id ? course : item));
      if (previousCourse && courseUpdateAffectsLessonDefaults(previousCourse, course)) {
        syncLessonsWithCourseDefaults(draft, course, "future_scheduled");
      }
    });
  }

  function syncCoursesToLessons(courseIds: string[]) {
    const courseIdSet = new Set(courseIds);
    if (courseIdSet.size === 0) return;
    updateVault((draft) => {
      draft.courseGroups
        .filter((course) => courseIdSet.has(course.id))
        .forEach((course) => {
          syncLessonsWithCourseDefaults(draft, course, "future_scheduled");
        });
    });
  }

  function deleteCourse(courseId: string) {
    updateVault((draft) => {
      draft.courseGroups = draft.courseGroups.filter((course) => course.id !== courseId);
    });
  }

  function transferStudentCourse(transition: StudentCourseTransition) {
    updateVault((draft) => {
      const targetSubject =
        transition.subject ??
        transition.newCourse?.subject ??
        draft.courseGroups.find((course) => course.id === transition.targetCourseId)?.subject;

      if (transition.endExisting) {
        draft.courseGroups = draft.courseGroups.map((course) => {
          if (!course.studentIds.includes(transition.studentId)) return course;
          if (transition.targetCourseId && course.id === transition.targetCourseId) {
            return { ...course, status: "active" };
          }
          if (targetSubject && course.subject !== targetSubject) return course;

          const nextStudentIds = course.studentIds.filter((id) => id !== transition.studentId);
          return {
            ...course,
            studentIds: nextStudentIds,
            status: nextStudentIds.length === 0 ? "paused" : course.status
          };
        });
      }

      if (transition.targetCourseId) {
        draft.courseGroups = draft.courseGroups.map((course) =>
          course.id === transition.targetCourseId
            ? {
                ...course,
                status: "active",
                studentIds: course.studentIds.includes(transition.studentId)
                  ? course.studentIds
                  : [...course.studentIds, transition.studentId]
              }
            : course
        );
      }

      if (transition.newCourse) {
        draft.courseGroups.push(transition.newCourse);
      }
    });
  }

  function addCustomTimePreset(preset: TimePreset) {
    updateVault((draft) => {
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        customTimePresets: [...(draft.preferences?.customTimePresets ?? []), preset]
      };
    });
  }

  function deleteCustomTimePreset(presetId: string) {
    updateVault((draft) => {
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        customTimePresets: (draft.preferences?.customTimePresets ?? []).filter((preset) => preset.id !== presetId)
      };
    });
  }

  function addCustomCourseType(courseType: CustomCourseTypeOption, feeRule?: FeeRule) {
    updateVault((draft) => {
      const current = draft.preferences?.customCourseTypes ?? [];
      const normalizedLabel = courseType.label.trim();
      if (!normalizedLabel || current.some((item) => item.id === courseType.id || item.label.trim() === normalizedLabel)) return;
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        customCourseTypes: [...current, { ...courseType, label: normalizedLabel }],
        courseTypeFeeRules: {
          ...(draft.preferences?.courseTypeFeeRules ?? {}),
          [courseType.id]: feeRule ?? draft.preferences?.courseTypeFeeRules?.[courseType.id] ?? defaultFeeRuleForCourseType(courseType.id)
        }
      };
    });
  }

  function updateCustomCourseType(courseType: CustomCourseTypeOption) {
    updateVault((draft) => {
      const current = draft.preferences?.customCourseTypes ?? [];
      const normalizedLabel = courseType.label.trim();
      if (!normalizedLabel || current.some((item) => item.id !== courseType.id && item.label.trim() === normalizedLabel)) return;
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        customCourseTypes: current.map((item) => (item.id === courseType.id ? { ...item, label: normalizedLabel } : item))
      };
    });
  }

  function updateCourseTypeLabel(courseType: CourseType, label: string) {
    updateVault((draft) => {
      const normalizedLabel = label.trim();
      if (!normalizedLabel) return;
      if (courseType.startsWith("custom_")) {
        const current = draft.preferences?.customCourseTypes ?? [];
        if (current.some((item) => item.id !== courseType && item.label.trim() === normalizedLabel)) return;
        draft.preferences = {
          ...(draft.preferences ?? { weekStartsOn: 0 }),
          customCourseTypes: current.map((item) => (item.id === courseType ? { ...item, label: normalizedLabel } : item))
        };
        return;
      }
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        courseTypeLabels: {
          ...(draft.preferences?.courseTypeLabels ?? {}),
          [courseType]: normalizedLabel
        }
      };
    });
  }

  function deleteCourseType(courseType: CourseType) {
    updateVault((draft) => {
      const courseTypeLabels = { ...(draft.preferences?.courseTypeLabels ?? {}) };
      const courseTypeFeeRules = { ...(draft.preferences?.courseTypeFeeRules ?? {}) };
      delete courseTypeLabels[courseType];
      delete courseTypeFeeRules[courseType];
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        disabledCourseTypes: Array.from(new Set([...(draft.preferences?.disabledCourseTypes ?? []), courseType])),
        courseTypeLabels,
        courseTypeFeeRules
      };
    });
  }

  function updateCourseTypeFeeRule(courseType: CourseType, feeRule: FeeRule) {
    updateVault((draft) => {
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        courseTypeFeeRules: {
          ...(draft.preferences?.courseTypeFeeRules ?? {}),
          [courseType]: feeRule
        }
      };
    });
  }

  function syncCourseTypeFeeRuleToCourses(courseType: CourseType) {
    updateVault((draft) => {
      const defaultSalaryFeeRule: FeeRule = {
        mode: "salary_grade",
        salaryGradeSource: "teacher_default",
        salaryGradeId: draft.profile.defaultSalaryGradeId ?? defaultSalaryGradeRule(draft).id
      };
      draft.courseGroups = draft.courseGroups.map((course) => {
        if (course.type !== courseType) return course;
        if (course.type === "trial" || course.type === "full_time") return course;
        return {
          ...course,
          feeRule: cloneFeeRule(defaultSalaryFeeRule)
        };
      });
      draft.courseGroups
        .filter((course) => course.type === courseType)
        .forEach((course) => {
          syncLessonsWithCourseDefaults(draft, course, "future_scheduled");
        });
    });
  }

  function updateAiScheduleSession(session: AiScheduleSession | null) {
    setAiScheduleSession(session);
  }

  function applyAiScheduleDraft(session: AiScheduleSession | null): { ok: boolean; message: string } {
    if (!vault || !session?.draft) {
      return { ok: false, message: "没有可执行的 AI 建议。请先生成建议。" };
    }
    const parsedDraft = session.draft.draft;
    if (!isPlainRecordLocal(parsedDraft)) {
      return { ok: false, message: "AI 建议不是标准结构，无法确认写入。" };
    }
    const actions = arrayValueLocal(parsedDraft.actions).filter(isPlainRecordLocal);
    if (actions.length === 0) {
      return { ok: false, message: "AI 建议里没有可执行动作。请先补充信息后重新生成。" };
    }

    const nextVault = cloneVault(vault);
    const messages: string[] = [];
    const blockers: string[] = [];

    const campusByName = (name: unknown): Campus | undefined => {
      const normalized = stringValue(name).toLowerCase();
      if (!normalized) return undefined;
      return nextVault.campuses.find((campus) => campus.id.toLowerCase() === normalized || campus.name.trim().toLowerCase() === normalized);
    };

    const studentByName = (name: unknown): Student | undefined => {
      const normalized = stringValue(name).toLowerCase();
      if (!normalized) return undefined;
      return nextVault.students.find((student) => student.id.toLowerCase() === normalized || student.name.trim().toLowerCase() === normalized);
    };

    const courseByIdOrName = (value: unknown): CourseGroup | undefined => {
      const normalized = stringValue(value).toLowerCase();
      if (!normalized) return undefined;
      return nextVault.courseGroups.find((course) => course.id.toLowerCase() === normalized || course.name.trim().toLowerCase() === normalized);
    };

    const courseMatchesData = (course: CourseGroup, data: Record<string, unknown>): boolean => {
      const requestedSubject = stringValue(data.subject);
      const requestedType = data.type === undefined || data.type === null || data.type === "" ? "" : normalizeAiCourseType(data.type, nextVault);
      const requestedCampus = data.campus === undefined ? undefined : campusByName(data.campus);
      const requestedStudentIds = studentIdsFromAiData(data);
      if (requestedSubject && course.subject.trim().toLowerCase() !== requestedSubject.toLowerCase()) return false;
      if (requestedType && course.type !== requestedType) return false;
      if (requestedCampus && course.defaultCampusId !== requestedCampus.id) return false;
      if (requestedStudentIds.length > 0) {
        const currentIds = new Set(course.studentIds);
        if (!requestedStudentIds.every((studentId) => currentIds.has(studentId))) return false;
      }
      return true;
    };

    const ensureStudent = (data: Record<string, unknown>): Student | null => {
      const name = stringValue(data.name ?? data.studentName);
      if (!name) return null;
      const grade = stringValue(data.grade);
      const campus = campusByName(data.campus);
      const existing = nextVault.students.find((student) =>
        student.name.trim().toLowerCase() === name.toLowerCase() &&
        (!grade || (student.grade ?? "").trim().toLowerCase() === grade.toLowerCase()) &&
        (!campus || student.defaultCampusId === campus.id)
      );
      if (existing) return existing;

      const student: Student = {
        id: makeId("student"),
        name,
        grade: grade || undefined,
        defaultCampusId: campus?.id,
        note: stringValue(data.note) || undefined,
        temporaryTrial: Boolean(data.temporaryTrial),
        status: "active"
      };
      nextVault.students.push(student);
      messages.push(`新增学生「${student.name}」`);
      return student;
    };

    const studentIdsFromNames = (values: unknown): string[] => {
      const rawValues = Array.isArray(values) ? values : values === undefined || values === null || values === "" ? [] : [values];
      return rawValues
        .map((value) => {
          if (isPlainRecordLocal(value)) {
            const directId = stringValue(value.id ?? value.studentId);
            const student = nextVault.students.find((item) => item.id === directId) ?? studentByName(value.name ?? value.studentName);
            return student?.id ?? "";
          }
          const directId = stringValue(value);
          const student = nextVault.students.find((item) => item.id === directId) ?? studentByName(value);
          return student?.id ?? "";
        })
        .filter(Boolean);
    };

    const studentIdsFromAiData = (data: Record<string, unknown>): string[] => {
      const directStudentId = stringValue(data.studentId);
      const directStudent = directStudentId ? nextVault.students.find((student) => student.id === directStudentId) : undefined;
      return Array.from(new Set([
        directStudent?.id ?? "",
        ...studentIdsFromNames(data.studentIds ?? data.studentNames ?? data.students ?? data.studentsToAdd),
        ...studentIdsFromNames(data.studentName ?? data.student)
      ].filter(Boolean)));
    };

    const createCourseTypeFromAi = (data: Record<string, unknown>) => {
      const label = stringValue(data.label ?? data.name ?? data.courseTypeName);
      if (!label) return;
      const normalizedLabel = label.trim();
      const requestedId = stringValue(data.id ?? data.courseTypeId);
      const id = requestedId.startsWith("custom_") ? requestedId : `custom_${makeId("ctype")}`;
      const current = nextVault.preferences?.customCourseTypes ?? [];
      const existingType = current.find((item) => item.id === id || item.label.trim().toLowerCase() === normalizedLabel.toLowerCase());
      if (existingType) return;
      const templateMode = stringValue(data.templateMode ?? data.template ?? data.mode).toLowerCase();
      const feeRule = defaultFeeRuleForCustomTemplate(
        nextVault,
        templateMode === "hourly" ? "hourly" : templateMode === "non_class" || templateMode === "one_on_one" ? "non_class" : "class"
      );
      nextVault.preferences = {
        ...(nextVault.preferences ?? { weekStartsOn: 0 }),
        customCourseTypes: [...current, { id: id as CustomCourseType, label: normalizedLabel }],
        courseTypeFeeRules: {
          ...(nextVault.preferences?.courseTypeFeeRules ?? {}),
          [id]: feeRule
        }
      };
      messages.push(`新增班型「${normalizedLabel}」`);
    };

    const aiDataFeeMode = (data: Record<string, unknown>): FeeRule["mode"] | null => {
      const source = isPlainRecordLocal(data.feeRule) ? data.feeRule : data;
      const mode = stringValue(source.mode ?? source.feeMode).toLowerCase();
      if (mode === "salary_grade" || mode === "salary" || mode === "岗位薪资" || mode === "岗位薪资等级" || mode === "课时费等级") return "salary_grade";
      if (mode === "class_headcount" || mode === "class") return "class_headcount";
      if (mode === "fixed") return "fixed";
      if (mode === "hourly") return "hourly";
      if (
        source.baseFee !== undefined ||
        source.classBaseFee !== undefined ||
        source.minimumFee !== undefined ||
        source.perPresentStudentFee !== undefined ||
        source.perStudentFee !== undefined ||
        source.extraStudentFee !== undefined ||
        source.headcountFee !== undefined ||
        source.minStudents !== undefined ||
        source.minimumStudents !== undefined ||
        source.includedStudents !== undefined
      ) {
        return "class_headcount";
      }
      if (source.fixedFee !== undefined) return "fixed";
      if (source.hourlyRate !== undefined || source.rate !== undefined) return "hourly";
      return null;
    };

    const enforceAiFeeModeMatchesCourseType = (
      data: Record<string, unknown>,
      type: CourseType,
      courseLabel: string
    ): boolean => {
      const requestedMode = aiDataFeeMode(data);
      if (!requestedMode) return true;
      const templateMode = defaultFeeRuleForVaultCourseType(nextVault, type).mode;
      if (requestedMode === templateMode) return true;
      blockers.push(
        `未写入课程「${courseLabel}」：AI 试图把班型「${courseTypeLabel(nextVault, type)}」从「${feeModeLabel(templateMode)}」改成「${feeModeLabel(requestedMode)}」。课程档案需沿用后台班型计费模式；请先在后台修改班型计费，或改选按人数计费的班型。`
      );
      return false;
    };

    const needsClassFeeConfirmation = (
      data: Record<string, unknown>,
      type: CourseType,
      studentCount: number,
      fallback?: FeeRule,
      forceCheck = false
    ): string | null => {
      const source = isPlainRecordLocal(data.feeRule) ? data.feeRule : data;
      const templateRule = fallback ?? defaultFeeRuleForVaultCourseType(nextVault, type);
      const mode = stringValue(source.mode ?? source.feeMode).toLowerCase();
      const hasExplicitClassFeeSignal =
        mode === "class_headcount" ||
        mode === "class" ||
        source.baseFee !== undefined ||
        source.classBaseFee !== undefined ||
        source.minimumFee !== undefined ||
        source.perPresentStudentFee !== undefined ||
        source.perStudentFee !== undefined ||
        source.extraStudentFee !== undefined ||
        source.headcountFee !== undefined ||
        source.minStudents !== undefined ||
        source.minimumStudents !== undefined ||
        source.includedStudents !== undefined;
      const hasClassFeeSignal =
        forceCheck ||
        templateRule.mode === "class_headcount" ||
        hasExplicitClassFeeSignal;
      if (!hasClassFeeSignal) return null;

      const explicitDefault = Boolean(
        source.useDefaultFeeRule ??
        source.useDefaultClassFee ??
        source.useTemplateFeeRule ??
        source.useExistingFeeRule ??
        source.keepFeeRule
      );
      if (explicitDefault) return null;

      const hasMinStudents = source.minStudents !== undefined || source.minimumStudents !== undefined || source.includedStudents !== undefined;
      const hasBaseFee = source.baseFee !== undefined || source.classBaseFee !== undefined || source.minimumFee !== undefined;
      const hasPerStudentFee =
        source.perPresentStudentFee !== undefined ||
        source.perStudentFee !== undefined ||
        source.extraStudentFee !== undefined ||
        source.headcountFee !== undefined;
      if (!hasMinStudents || !hasBaseFee || !hasPerStudentFee) {
        return "班课/多人课需要先确认计费规则：最少人数、基础费用、每增加1人费用。最少人数不是当前关联学生人数，通常从 1 人起。";
      }

      const minStudents = numberValue(source.minStudents ?? source.minimumStudents ?? source.includedStudents);
      if (studentCount > 1 && minStudents === studentCount) {
        return `当前关联 ${studentCount} 人，但最少人数通常不是关联人数。请确认最少人数是否为 ${studentCount}，还是 1，并同时确认基础费用和每增加1人费用。`;
      }
      return null;
    };

    const ensureCourse = (data: Record<string, unknown>): CourseGroup | null => {
      const requestedId = stringValue(data.courseId ?? data.id);
      const existingById = requestedId ? nextVault.courseGroups.find((course) => course.id === requestedId) : undefined;
      if (existingById) return existingById;
      const name = stringValue(data.name ?? data.courseName);
      if (!name) return null;
      const normalizedName = name.toLowerCase();
      const existingByName = nextVault.courseGroups.find((course) =>
        course.name.trim().toLowerCase() === normalizedName && courseMatchesData(course, data)
      );
      if (existingByName) return existingByName;
      const type = normalizeAiCourseType(data.type, nextVault);
      const subject = stringValue(data.subject) || "语文";
      const campus = campusByName(data.campus);
      const studentIds = studentIdsFromAiData(data);
      if (!enforceAiFeeModeMatchesCourseType(data, type, name)) return null;
      const feeConfirmation = needsClassFeeConfirmation(data, type, studentIds.length, undefined, defaultFeeRuleForVaultCourseType(nextVault, type).mode === "class_headcount");
      if (feeConfirmation) {
        blockers.push(`未新增课程「${name}」：${feeConfirmation}`);
        return null;
      }
      const feeRule = feeRuleFromAiData(data, nextVault, type);
      const course: CourseGroup = {
        id: makeId("course"),
        name,
        type,
        subject,
        defaultCampusId: campus?.id,
        studentIds,
        feeRule,
        note: stringValue(data.note) || undefined,
        status: "active"
      };
      nextVault.courseGroups.push(course);
      messages.push(`新增课程「${course.name}」`);
      return course;
    };

    const updateCourseFromAi = (data: Record<string, unknown>): CourseGroup | null => {
      const course = courseByIdOrName(data.courseId ?? data.id ?? data.name ?? data.courseName);
      if (!course) return null;
      const previousType = course.type;
      const nextType = data.type === undefined || data.type === null || data.type === "" ? course.type : normalizeAiCourseType(data.type, nextVault);
      const nextStudentIds = studentIdsFromAiData(data);
      const campus = data.campus === undefined ? undefined : campusByName(data.campus);
      if (!enforceAiFeeModeMatchesCourseType(data, nextType, course.name)) return null;
      const source = isPlainRecordLocal(data.feeRule) ? data.feeRule : data;
      const mode = stringValue(source.mode ?? source.feeMode).toLowerCase();
      const hasFeeEdit =
        mode === "class_headcount" ||
        mode === "class" ||
        source.baseFee !== undefined ||
        source.classBaseFee !== undefined ||
        source.minimumFee !== undefined ||
        source.perPresentStudentFee !== undefined ||
        source.perStudentFee !== undefined ||
        source.extraStudentFee !== undefined ||
        source.headcountFee !== undefined ||
        source.minStudents !== undefined ||
        source.minimumStudents !== undefined ||
        source.includedStudents !== undefined;
      const feeConfirmation = needsClassFeeConfirmation(
        data,
        nextType,
        nextStudentIds.length > 0 ? nextStudentIds.length : course.studentIds.length,
        nextType !== previousType ? undefined : course.feeRule,
        nextType !== previousType || hasFeeEdit
      );
      if (feeConfirmation) {
        blockers.push(`未更新课程「${course.name}」：${feeConfirmation}`);
        return null;
      }
      const nextFeeRule = feeRuleFromAiData(data, nextVault, nextType, nextType !== previousType ? undefined : course.feeRule);
      const nextCourse: CourseGroup = {
        ...course,
        name: stringValue(data.newName ?? data.name ?? data.courseName) || course.name,
        subject: stringValue(data.subject) || course.subject,
        type: nextType,
        defaultCampusId: data.campus === undefined ? course.defaultCampusId : campus?.id,
        studentIds: nextStudentIds.length > 0 ? nextStudentIds : course.studentIds,
        feeRule: nextFeeRule,
        note: data.note === undefined ? course.note : stringValue(data.note) || undefined,
        status: data.status === "paused" ? "paused" : data.status === "active" ? "active" : course.status
      };
      nextVault.courseGroups = nextVault.courseGroups.map((item) => (item.id === course.id ? nextCourse : item));
      if (courseUpdateAffectsLessonDefaults(course, nextCourse)) {
        const scope = normalizeCourseLessonSyncScope(data.lessonUpdateScope ?? data.applyToLessons ?? data.updateLessons);
        const syncedCount = syncLessonsWithCourseDefaults(nextVault, nextCourse, scope);
        if (syncedCount > 0) {
          messages.push(`已按新课程规则同步 ${syncedCount} 节未完成排课`);
        }
      }
      messages.push(`已更新课程「${nextCourse.name}」`);
      return nextCourse;
    };

    const updateStudentFromAi = (data: Record<string, unknown>): Student | null => {
      const requestedId = stringValue(data.studentId ?? data.id);
      const currentName = stringValue(data.studentName ?? data.currentName ?? data.oldName ?? data.fromName ?? data.sourceStudentName ?? data.sourceName);
      const hasOtherFields =
        data.grade !== undefined ||
        data.school !== undefined ||
        data.campus !== undefined ||
        data.defaultCampusId !== undefined ||
        data.note !== undefined ||
        data.status !== undefined ||
        data.temporaryTrial !== undefined ||
        data.newName !== undefined ||
        data.newStudentName !== undefined ||
        data.targetName !== undefined;
      const lookupName = currentName || (!requestedId && hasOtherFields ? stringValue(data.name) : "");
      const student = requestedId
        ? nextVault.students.find((item) => item.id === requestedId)
        : lookupName
          ? studentByName(lookupName)
          : undefined;
      if (!student) return null;

      const previousName = student.name;
      const updates: string[] = [];
      let renamed = false;
      const nextName = stringValue(data.newName ?? data.newStudentName ?? data.targetName ?? ((requestedId || currentName) ? data.name : ""));
      if (nextName.trim() && nextName.trim() !== student.name.trim()) {
        student.name = nextName.trim();
        renamed = true;
        updates.push(`姓名改为「${student.name}」`);
      }
      if (data.grade !== undefined) {
        const grade = stringValue(data.grade);
        student.grade = grade || undefined;
        updates.push(student.grade ? `年级改为「${student.grade}」` : "年级已清空");
      }
      if (data.school !== undefined) {
        const school = stringValue(data.school);
        student.school = school || undefined;
        updates.push(student.school ? `学校改为「${student.school}」` : "学校已清空");
      }
      if (data.campus !== undefined || data.defaultCampusId !== undefined) {
        const campus = campusByName(data.campus ?? data.defaultCampusId);
        student.defaultCampusId = campus?.id;
        updates.push(student.defaultCampusId ? `默认校区改为「${campus?.name ?? student.defaultCampusId}」` : "默认校区已清空");
      }
      if (data.note !== undefined) {
        const note = stringValue(data.note);
        student.note = note || undefined;
        updates.push(student.note ? "备注已更新" : "备注已清空");
      }
      if (data.status !== undefined) {
        const status = stringValue(data.status).toLowerCase();
        if (status === "active" || status === "paused") {
          student.status = status;
          updates.push(status === "active" ? "状态改为在读" : "状态改为归档");
        }
      }
      if (data.temporaryTrial !== undefined) {
        const previousTrial = Boolean(student.temporaryTrial);
        const nextTrial = Boolean(data.temporaryTrial);
        if (previousTrial !== nextTrial) {
          materializeStudentTrialStatusOnLessons(nextVault, student.id, previousTrial);
        }
        student.temporaryTrial = Boolean(data.temporaryTrial);
        updates.push(student.temporaryTrial ? "已标记试听" : "已取消试听标记");
        if (previousTrial !== nextTrial) {
          const syncedCount = syncFutureLessonsWithStudentTrialStatus(nextVault, student.id, nextTrial);
          if (syncedCount > 0) {
            updates.push(`已同步 ${syncedCount} 节未来未上课程`);
          }
        }
      }
      if (updates.length === 0) return null;

      if (renamed && updates.length === 1) {
        messages.push(`已将学生「${previousName}」改名为「${student.name}」`);
      } else {
        messages.push(`已更新学生「${renamed ? previousName : student.name}」：${updates.join("；")}`);
      }
      return student;
    };

    const deleteOrPauseCourseFromAi = (data: Record<string, unknown>) => {
      const course = courseByIdOrName(data.courseId ?? data.id ?? data.name ?? data.courseName);
      if (!course) return;
      const inUse = nextVault.lessons.some((lesson) => lesson.courseGroupId === course.id);
      const mode = stringValue(data.mode ?? data.deleteMode ?? data.action).toLowerCase();
      const force = Boolean(data.forceDelete ?? data.force);
      if (mode === "pause" || mode === "paused" || mode === "archive" || mode === "归档" || mode === "暂停") {
        nextVault.courseGroups = nextVault.courseGroups.map((item) =>
          item.id === course.id ? { ...item, status: "paused" } : item
        );
        messages.push(`已暂停课程「${course.name}」`);
        return;
      }
      if (inUse && mode !== "force_delete" && !force) {
        nextVault.courseGroups = nextVault.courseGroups.map((item) =>
          item.id === course.id ? { ...item, status: "paused" } : item
        );
        messages.push(`课程「${course.name}」已有课时引用，已改为暂停`);
        return;
      }
      nextVault.courseGroups = nextVault.courseGroups.filter((item) => item.id !== course.id);
      moveLessonsToTrash(
        nextVault,
        nextVault.lessons.filter((lesson) => lesson.courseGroupId === course.id),
        "ai",
        `AI 强制删除课程「${course.name}」连带课节`
      );
      messages.push(`已删除课程「${course.name}」${inUse ? "及其课时" : ""}`);
    };

    const migrateCourseFromAi = (data: Record<string, unknown>) => {
      const source = courseByIdOrName(data.sourceCourseId ?? data.fromCourseId ?? data.courseId ?? data.id ?? data.sourceCourseName ?? data.courseName);
      if (!source) return;
      const target = courseByIdOrName(data.targetCourseId ?? data.toCourseId ?? data.targetCourseName)
        ?? ensureCourse({
          ...data,
          courseId: undefined,
          id: undefined,
          name: data.targetCourseName ?? data.newCourseName ?? data.newName ?? data.name ?? source.name,
          courseName: data.targetCourseName ?? data.newCourseName ?? data.newName ?? data.name ?? source.name,
          type: data.targetType ?? data.type ?? source.type,
          subject: data.subject ?? source.subject,
          campus: data.campus,
          students: data.students ?? data.studentNames ?? source.studentIds.map((studentId) => nextVault.students.find((student) => student.id === studentId)?.name).filter(Boolean)
        });
      if (!target) return;
      const migrateLessons = data.migrateLessons !== false && data.moveLessons !== false;
      const effectiveFrom = stringValue(data.effectiveFrom ?? data.fromDate);
      const effectiveTo = stringValue(data.effectiveTo ?? data.toDate);
      const studentIds = studentIdsFromAiData(data);
      const nextTargetStudentIds = Array.from(new Set([...target.studentIds, ...(studentIds.length > 0 ? studentIds : source.studentIds)]));
      Object.assign(target, {
        status: "active",
        studentIds: nextTargetStudentIds
      });
      if (migrateLessons) {
        let migratedCount = 0;
        nextVault.lessons = nextVault.lessons.map((lesson) => {
          if (lesson.courseGroupId !== source.id) return lesson;
          if (effectiveFrom && lesson.date < effectiveFrom) return lesson;
          if (effectiveTo && lesson.date > effectiveTo) return lesson;
          migratedCount += 1;
          return recalculateLessonFeeSnapshot(nextVault, {
            ...lesson,
            courseGroupId: target.id,
            type: target.type,
            campusId: target.defaultCampusId ?? lesson.campusId,
            expectedStudentIds: lesson.expectedStudentIds.length > 0 ? lesson.expectedStudentIds : nextTargetStudentIds
          });
        });
        messages.push(`已迁移 ${migratedCount} 节课到课程「${target.name}」`);
      }
      if (data.pauseSource !== false) {
        nextVault.courseGroups = nextVault.courseGroups.map((course) =>
          course.id === source.id ? { ...course, status: "paused" } : course
        );
      }
    };

    const deleteLessonFromAi = (data: Record<string, unknown>) => {
      const lessonIds = Array.from(new Set([
        ...arrayValueLocal(data.lessonIds).map(stringValue),
        stringValue(data.lessonId ?? data.id)
      ].filter(Boolean)));
      const lessonIdSet = new Set(lessonIds);
      const lessonDates = dateListFromAi(data.dates, data.date, data.dateStart ?? data.startDate ?? data.fromDate, data.dateEnd ?? data.endDate ?? data.toDate);
      const lessonDateSet = new Set(lessonDates);
      const startTime = stringValue(data.startTime);
      const endTime = stringValue(data.endTime);
      const courseName = stringValue(data.courseName ?? data.name);
      const subject = stringValue(data.subject);
      const courseId = stringValue(data.courseId);
      const deleteScheduledOnly = data.scheduledOnly !== false && data.includeCompleted !== true && data.deleteCompleted !== true;
      const hasDateRange = lessonDates.length > 0;
      const hasSpecificTime = Boolean(startTime || endTime);
      const hasCourseFilter = Boolean(courseId || courseName || subject);
      const hasSpecificIds = lessonIds.length > 0;
      if (!hasSpecificIds && !hasDateRange) {
        blockers.push("删除课节缺少明确日期或课节ID，已拒绝执行，避免误删历史课程。");
        return;
      }
      const matchedLessons = nextVault.lessons.filter((lesson) => {
        if (hasSpecificIds && !lessonIdSet.has(lesson.id)) return false;
        if (hasDateRange && !lessonDateSet.has(lesson.date)) return false;
        if (deleteScheduledOnly && lesson.status !== "scheduled" && lesson.status !== "draft" && lesson.status !== "makeup_pending") return false;
        if (courseId && lesson.courseGroupId !== courseId) return false;
        if (startTime && lesson.startTime !== startTime) return false;
        if (endTime && lesson.endTime !== endTime) return false;
        if (!courseName && !subject) return true;
        const course = nextVault.courseGroups.find((item) => item.id === lesson.courseGroupId);
        if (!course) return false;
        if (courseName && course.name.trim().toLowerCase() !== courseName.toLowerCase()) return false;
        if (subject && course.subject.trim().toLowerCase() !== subject.toLowerCase()) return false;
        return true;
      });
      if (matchedLessons.length === 0) {
        blockers.push(`没有找到符合${hasDateRange ? ` ${lessonDates[0]}${lessonDates.length > 1 ? ` 至 ${lessonDates.at(-1)}` : ""}` : ""} 条件的待上课课节。`);
        return;
      }
      if (!hasDateRange && !hasSpecificIds && matchedLessons.length > 1) {
        blockers.push(`删除课节匹配到 ${matchedLessons.length} 节，但缺少明确日期或课节ID，已拒绝执行。`);
        return;
      }
      if (!hasSpecificIds && !hasSpecificTime && !hasCourseFilter && matchedLessons.length > 80) {
        blockers.push(`删除课节将影响 ${matchedLessons.length} 节，范围过大，已拒绝执行。请缩小日期范围或指定课程。`);
        return;
      }
      moveLessonsToTrash(nextVault, matchedLessons, "ai", "AI 删除课节");
      const preview = matchedLessons
        .slice(0, 12)
        .map((lesson) => `「${lesson.date} ${lesson.startTime}-${lesson.endTime} · ${nextVault.courseGroups.find((course) => course.id === lesson.courseGroupId)?.name ?? "未知课程"}」`);
      messages.push(`已将 ${matchedLessons.length} 节课移入回收站${hasDateRange ? `（${lessonDates[0]}${lessonDates.length > 1 ? ` 至 ${lessonDates.at(-1)}` : ""}）` : ""}${preview.length > 0 ? `：${preview.join("；")}${matchedLessons.length > preview.length ? `；另 ${matchedLessons.length - preview.length} 节` : ""}` : ""}`);
    };

    const addStudentsToCourse = (course: CourseGroup, studentIds: string[]) => {
      if (studentIds.length === 0) return;
      const nextIds = Array.from(new Set([...course.studentIds, ...studentIds]));
      if (nextIds.length === course.studentIds.length) return;
      course.studentIds = nextIds;
      messages.push(`已将学生加入课程「${course.name}」`);
    };

    const addStudentsToLessons = (lessonIds: string[], studentIds: string[]) => {
      if (lessonIds.length === 0 || studentIds.length === 0) return;
      let changedCount = 0;
      nextVault.lessons = nextVault.lessons.map((lesson) => {
        if (!lessonIds.includes(lesson.id)) return lesson;
        const expectedStudentIds = Array.from(new Set([...lesson.expectedStudentIds, ...studentIds]));
        const attendanceStudentIds = new Set(lesson.attendance.map((entry) => entry.studentId));
        const attendance = [
          ...lesson.attendance,
          ...studentIds
            .filter((studentId) => !attendanceStudentIds.has(studentId))
            .map((studentId) => ({ studentId, status: "attended" as const }))
        ];
        changedCount += 1;
        return recalculateLessonFeeSnapshot(nextVault, {
          ...lesson,
          expectedStudentIds,
          attendance
        });
      });
      if (changedCount > 0) {
        messages.push(`已更新 ${changedCount} 节课的关联学生`);
      }
    };

    const normalizeAiDate = (value: unknown): string | null => {
      const raw = stringValue(value).replace(/[./]/g, "-");
      const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (!match) return null;
      const normalized = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
      return datesBetween(normalized, normalized)[0] === normalized ? normalized : null;
    };

    const normalizeAiTime = (value: unknown): string | null => {
      return normalizeTimeText(stringValue(value));
    };

    const createScheduledLessonsFromAi = (
      lessonItems: Array<Record<string, unknown>>,
      defaults: Record<string, unknown>,
      defaultCourse: CourseGroup | null
    ) => {
      if (lessonItems.length === 0) return;
      let createdCount = 0;
      const skippedReasons: string[] = [];
      const createdByCourse = new Map<string, number>();
      const fallbackStartTime = normalizeAiTime(defaults.startTime) ?? "19:00";
      const fallbackEndTime = normalizeAiTime(defaults.endTime) ?? "21:00";

      lessonItems.forEach((item, index) => {
        const merged = { ...defaults, ...item };
        const course =
          courseByIdOrName(merged.courseId ?? merged.courseGroupId ?? merged.courseName ?? merged.name) ??
          defaultCourse ??
          ensureCourse({ ...merged, lessons: undefined });
        const requestedLabel = `第 ${index + 1} 节`;
        if (!course) {
          skippedReasons.push(`${requestedLabel}缺少可匹配课程`);
          return;
        }

        const date = normalizeAiDate(merged.date);
        if (!date) {
          skippedReasons.push(`${requestedLabel}（${course.name}）日期无效`);
          return;
        }
        const startTime = merged.startTime === undefined ? fallbackStartTime : normalizeAiTime(merged.startTime);
        const endTime = merged.endTime === undefined ? fallbackEndTime : normalizeAiTime(merged.endTime);
        if (!startTime || !endTime || timeToMinutes(startTime) >= timeToMinutes(endTime)) {
          skippedReasons.push(`${date} ${course.name} 时间无效`);
          return;
        }

        const duplicate = nextVault.lessons.some((lesson) =>
          lesson.status !== "cancelled" &&
          lesson.courseGroupId === course.id &&
          lesson.date === date &&
          lesson.startTime === startTime &&
          lesson.endTime === endTime
        );
        if (duplicate) {
          skippedReasons.push(`${date} ${startTime}-${endTime}「${course.name}」已存在`);
          return;
        }

        const conflict = nextVault.lessons.find((lesson) =>
          lesson.status !== "cancelled" &&
          lesson.date === date &&
          timesOverlap(lesson.startTime, lesson.endTime, startTime, endTime)
        );
        if (conflict) {
          const conflictCourse = nextVault.courseGroups.find((courseItem) => courseItem.id === conflict.courseGroupId);
          skippedReasons.push(`${date} ${startTime}-${endTime}「${course.name}」与「${conflictCourse?.name ?? "未知课程"} ${conflict.startTime}-${conflict.endTime}」冲突`);
          return;
        }

        const campus = campusByName(merged.campus ?? merged.campusName);
        nextVault.lessons.push(createLessonFromCourse(nextVault, course, {
          date,
          startTime,
          endTime,
          campusId: campus?.id ?? course.defaultCampusId,
          status: "scheduled"
        }));
        createdCount += 1;
        createdByCourse.set(course.name, (createdByCourse.get(course.name) ?? 0) + 1);
      });

      if (createdCount > 0) {
        const courseSummary = Array.from(createdByCourse.entries())
          .map(([name, count]) => `${name} ${count} 节`)
          .join("、");
        messages.push(`已新增 ${createdCount} 节排课${courseSummary ? `：${courseSummary}` : ""}`);
        if (skippedReasons.length > 0) {
          messages.push(`另有 ${skippedReasons.length} 节未新增：${skippedReasons.slice(0, 6).join("；")}${skippedReasons.length > 6 ? `；另 ${skippedReasons.length - 6} 节` : ""}`);
        }
        return;
      }

      if (skippedReasons.length > 0) {
        blockers.push(`AI 排课建议已识别，但没有新增课节：${skippedReasons.slice(0, 8).join("；")}${skippedReasons.length > 8 ? `；另 ${skippedReasons.length - 8} 节` : ""}`);
      }
    };

    const createLessonsForCourse = (course: CourseGroup, data: Record<string, unknown>) => {
      const dates = arrayValueLocal(data.dates).map(normalizeAiDate).filter((date): date is string => Boolean(date));
      const singleDate = normalizeAiDate(data.date);
      if (singleDate) dates.push(singleDate);
      const lessonItems = arrayValueLocal(data.lessons).filter(isPlainRecordLocal);
      const lessonRequests = lessonItems.length > 0
        ? lessonItems
        : Array.from(new Set(dates)).map((date) => ({ date }));
      createScheduledLessonsFromAi(lessonRequests, data, course);
    };

    const falseyAiValue = (value: unknown): boolean => {
      if (value === false) return true;
      const normalized = stringValue(value).toLowerCase();
      return normalized === "false" || normalized === "no" || normalized === "0" || normalized === "不包含" || normalized === "不包括" || normalized === "排除";
    };

    const dateListFromAi = (listValue: unknown, singleValue: unknown, startValue: unknown, endValue: unknown): string[] => {
      const explicitDates = arrayValueLocal(listValue).map(stringValue).filter(Boolean);
      if (explicitDates.length > 0) return explicitDates;
      const singleDate = stringValue(singleValue);
      if (singleDate) return [singleDate];
      const startDate = stringValue(startValue);
      const endDate = stringValue(endValue);
      if (startDate && endDate) return datesBetween(startDate, endDate);
      return startDate ? [startDate] : [];
    };

    const applyScheduleSyncFromAi = (data: Record<string, unknown>): boolean => {
      const sourceLessonIds = Array.from(new Set([
        ...arrayValueLocal(data.lessonIds ?? data.sourceLessonIds).map(stringValue),
        stringValue(data.lessonId ?? data.sourceLessonId)
      ].filter(Boolean)));
      const sourceLessonIdSet = new Set(sourceLessonIds);
      const sourceDates = dateListFromAi(
        data.sourceDates,
        data.sourceDate,
        data.sourceDateStart ?? data.sourceStartDate,
        data.sourceDateEnd ?? data.sourceEndDate
      );
      const targetDates = dateListFromAi(
        data.targetDates,
        data.targetDate,
        data.targetDateStart ?? data.targetStartDate,
        data.targetDateEnd ?? data.targetEndDate
      );
      const hasScheduleSyncShape =
        sourceDates.length > 0 ||
        targetDates.length > 0 ||
        stringValue(data.sourceDateStart ?? data.sourceStartDate ?? data.sourceDateEnd ?? data.sourceEndDate) ||
        stringValue(data.targetDateStart ?? data.targetStartDate ?? data.targetDateEnd ?? data.targetEndDate);
      if (!hasScheduleSyncShape) return false;

      if (targetDates.length === 0) {
        blockers.push("同步课节缺少目标日期。");
        return true;
      }

      const includeCancelled = !falseyAiValue(data.includeCancelled ?? data.copyCancelled ?? data.cancelledLessons);
      const sourceSnapshot = [...nextVault.lessons];
      const emptySourceDates: string[] = [];

      const buildSyncBatch = (sourceLessons: Lesson[], targetDate: string, targetStartDate: string) => {
        const filteredSourceLessons = sourceLessons.filter((lesson) => includeCancelled || lesson.status !== "cancelled");
        return filteredSourceLessons.length > 0
          ? buildScheduleSyncLessonsForDate(nextVault, filteredSourceLessons, targetDate, targetStartDate)
          : { lessons: [], replaceLessonIds: [], skippedCount: 0, conflictSkippedCount: 0 };
      };

      const syncBuilds: Array<ReturnType<typeof buildScheduleSyncLessonsForDate>> = [];

      if (sourceDates.length === 0 && sourceLessonIds.length > 0) {
        if (targetDates.length !== 1) {
          blockers.push("按课节同步时，请只提供一个目标日期。");
          return true;
        }
        const selectedSourceLessons = sourceSnapshot.filter((lesson) => sourceLessonIdSet.has(lesson.id));
        syncBuilds.push(buildSyncBatch(selectedSourceLessons, targetDates[0], targetDates[0]));
      } else {
        if (sourceDates.length === 0) {
          blockers.push("同步课节缺少来源日期。");
          return true;
        }
        if (sourceDates.length !== targetDates.length) {
          blockers.push("同步课节的来源日期和目标日期数量不一致，请重新生成建议。");
          return true;
        }
        const targetStartDate = targetDates[0];
        sourceDates.forEach((sourceDate, index) => {
          const sourceLessons = sourceSnapshot.filter((lesson) =>
            lesson.date === sourceDate &&
            (sourceLessonIdSet.size === 0 || sourceLessonIdSet.has(lesson.id))
          );
          if (sourceLessons.length === 0) {
            emptySourceDates.push(sourceDate);
            return;
          }
          syncBuilds.push(buildSyncBatch(sourceLessons, targetDates[index], targetStartDate));
        });
      }

      const replaceLessonIds = Array.from(new Set(syncBuilds.flatMap((build) => build.replaceLessonIds)));
      const lessonsToAdd = linkSyncedLessonsToPreviousLessons(
        nextVault,
        syncBuilds.flatMap((build) => build.lessons),
        replaceLessonIds
      );
      const skippedCount = syncBuilds.reduce((sum, build) => sum + build.skippedCount, 0);
      const conflictSkippedCount = syncBuilds.reduce((sum, build) => sum + build.conflictSkippedCount, 0);
      const syncedCount = lessonsToAdd.length;
      const replacedCount = replaceLessonIds.length;

      if (syncedCount === 0) {
        blockers.push(
          conflictSkippedCount > 0
            ? "目标时间已有其他课程，已跳过同步，未覆盖原有手动排课。"
            : skippedCount > 0
              ? "来源课程已暂停或缺失，未同步课节。"
              : "没有找到可同步的来源课节。"
        );
        return true;
      }

      if (replaceLessonIds.length > 0) {
        const replaceLessonIdSet = new Set(replaceLessonIds);
        moveLessonsToTrash(
          nextVault,
          nextVault.lessons.filter((lesson) => replaceLessonIdSet.has(lesson.id)),
          "sync_overwrite",
          "AI 同步排课覆盖旧课节"
        );
      }
      nextVault.lessons.push(...lessonsToAdd);

      const sourceLabel = sourceDates.length > 1
        ? `${sourceDates[0]} 至 ${sourceDates[sourceDates.length - 1]}`
        : sourceDates[0] ?? `${sourceLessonIds.length} 个来源课节`;
      const targetLabel = targetDates.length > 1
        ? `${targetDates[0]} 至 ${targetDates[targetDates.length - 1]}`
        : targetDates[0];
      messages.push(
        `已同步 ${syncedCount} 节课：${sourceLabel} 到 ${targetLabel}${replacedCount > 0 ? `，覆盖 ${replacedCount} 节已有课节` : ""}${skippedCount > 0 ? `，${skippedCount} 节来源课程已暂停未同步` : ""}${emptySourceDates.length > 0 ? `，${emptySourceDates.length} 个来源日期没有课节` : ""}`
        + `${conflictSkippedCount > 0 ? `，${conflictSkippedCount} 节目标时间已有其他课程已跳过` : ""}`
      );
      return true;
    };

    actions.forEach((action) => {
      const type = stringValue(action.type ?? action.action);
      const data = isPlainRecordLocal(action.data) ? action.data : action;
      if (type === "create_student") {
        ensureStudent(data);
        return;
      }
      if (type === "update_student" || type === "modify_student" || type === "rename_student") {
        updateStudentFromAi(data);
        return;
      }
      if (type === "create_course_type" || type === "create_custom_course_type") {
        createCourseTypeFromAi(data);
        return;
      }
      if (type === "create_course") {
        ensureCourse(data);
        return;
      }
      if (type === "update_course" || type === "modify_course") {
        updateCourseFromAi(data);
        return;
      }
      if (type === "delete_course" || type === "pause_course") {
        deleteOrPauseCourseFromAi(type === "pause_course" ? { ...data, mode: "pause" } : data);
        return;
      }
      if (type === "migrate_course" || type === "move_course_lessons") {
        migrateCourseFromAi(data);
        return;
      }
      if (type === "delete_lesson" || type === "remove_lesson" || type === "cancel_lesson") {
        deleteLessonFromAi(data);
        return;
      }
      if (type === "schedule_lessons") {
        const lessonItems = arrayValueLocal(data.lessons).filter(isPlainRecordLocal);
        if (lessonItems.length > 0) {
          const course = courseByIdOrName(data.courseId ?? data.courseGroupId ?? data.courseName ?? data.name) ?? null;
          createScheduledLessonsFromAi(lessonItems, data, course);
          return;
        }
        const course = ensureCourse(data);
        if (course) createLessonsForCourse(course, data);
        return;
      }
      if (type === "sync_lessons") {
        if (applyScheduleSyncFromAi(data)) return;
        const lessonIds = Array.from(new Set([
          ...arrayValueLocal(data.lessonIds).map(stringValue),
          stringValue(data.lessonId)
        ].filter(Boolean)));
        const studentIds = studentIdsFromAiData(data);
        addStudentsToLessons(lessonIds, studentIds);
        const affectedCourseIds = Array.from(new Set(
          nextVault.lessons.filter((lesson) => lessonIds.includes(lesson.id)).map((lesson) => lesson.courseGroupId)
        ));
        affectedCourseIds.forEach((courseId) => {
          const course = nextVault.courseGroups.find((item) => item.id === courseId);
          if (course) addStudentsToCourse(course, studentIds);
        });
      }
    });

    if (blockers.length > 0) {
      return { ok: false, message: blockers.join("；") };
    }

    if (messages.length === 0) {
      return { ok: false, message: "AI 建议没有被识别为可写入内容，请补充信息后重新生成。" };
    }

    void persist(nextVault);
    return { ok: true, message: `AI 建议已写入：${messages.join("；")}` };
  }

  function addSubject(subject: string) {
    const normalizedSubject = subject.trim();
    if (!normalizedSubject) return;
    updateVault((draft) => {
      const subjects = draft.preferences?.subjects ?? [];
      if (subjects.some((item) => item.trim() === normalizedSubject)) return;
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        subjects: [...subjects, normalizedSubject]
      };
    });
  }

  function updateSubject(previousSubject: string, nextSubject: string) {
    const normalizedPrevious = previousSubject.trim();
    const normalizedNext = nextSubject.trim();
    if (!normalizedPrevious || !normalizedNext) return;
    updateVault((draft) => {
      const subjects = draft.preferences?.subjects ?? [];
      const nextSubjects = subjects
        .map((item) => (item.trim() === normalizedPrevious ? normalizedNext : item.trim()))
        .filter(Boolean);
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        subjects: Array.from(new Set(nextSubjects))
      };
      draft.courseGroups = draft.courseGroups.map((course) =>
        course.subject.trim() === normalizedPrevious ? { ...course, subject: normalizedNext } : course
      );
    });
  }

  function deleteSubject(subject: string) {
    const normalizedSubject = subject.trim();
    if (!normalizedSubject) return;
    updateVault((draft) => {
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        subjects: (draft.preferences?.subjects ?? []).filter((item) => item.trim() !== normalizedSubject)
      };
    });
  }

  function deleteCustomCourseType(courseTypeId: CustomCourseType) {
    updateVault((draft) => {
      const inUse =
        draft.courseGroups.some((course) => course.type === courseTypeId) ||
        draft.lessons.some((lesson) => lesson.type === courseTypeId);
      if (inUse) return;
      const courseTypeFeeRules = { ...(draft.preferences?.courseTypeFeeRules ?? {}) };
      const courseTypeLabels = { ...(draft.preferences?.courseTypeLabels ?? {}) };
      delete courseTypeFeeRules[courseTypeId];
      delete courseTypeLabels[courseTypeId];
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        customCourseTypes: (draft.preferences?.customCourseTypes ?? []).filter((item) => item.id !== courseTypeId),
        disabledCourseTypes: (draft.preferences?.disabledCourseTypes ?? []).filter((type) => type !== courseTypeId),
        courseTypeLabels,
        courseTypeFeeRules
      };
    });
  }

  function addSalaryAdjustment(adjustment: SalaryAdjustment) {
    updateVault((draft) => {
      draft.salaryAdjustments.push(adjustment);
    });
  }

  function deleteSalaryAdjustment(adjustmentId: string) {
    updateVault((draft) => {
      draft.salaryAdjustments = draft.salaryAdjustments.filter((adjustment) => adjustment.id !== adjustmentId);
    });
  }

  function addTodo(todo: TodoItem) {
    updateVault((draft) => {
      draft.todoItems = [todo, ...(draft.todoItems ?? [])];
    });
  }

  function updateTodo(todo: TodoItem) {
    updateVault((draft) => {
      draft.todoItems = (draft.todoItems ?? []).map((item) => (item.id === todo.id ? todo : item));
    });
  }

  function deleteTodo(todoId: string) {
    updateVault((draft) => {
      draft.todoItems = (draft.todoItems ?? []).filter((todo) => todo.id !== todoId);
    });
  }

  function saveStudentProgressRecord(record: StudentProgressRecord) {
    updateVault((draft) => {
      const records = draft.studentProgressRecords ?? [];
      const exists = records.some((item) => item.id === record.id);
      draft.studentProgressRecords = exists
        ? records.map((item) => (item.id === record.id ? record : item))
        : [record, ...records];
    });
  }

  function saveStudentProgressRecords(recordsToSave: StudentProgressRecord[]) {
    if (recordsToSave.length === 0) return;
    updateVault((draft) => {
      const incomingIds = new Set(recordsToSave.map((record) => record.id));
      draft.studentProgressRecords = [
        ...recordsToSave,
        ...(draft.studentProgressRecords ?? []).filter((record) => !incomingIds.has(record.id))
      ];
    });
  }

  function deleteStudentProgressRecord(recordId: string) {
    updateVault((draft) => {
      draft.studentProgressRecords = (draft.studentProgressRecords ?? []).filter((record) => record.id !== recordId);
    });
  }

  function saveProgressChecklistTemplate(template: ProgressChecklistTemplate) {
    updateVault((draft) => {
      const templates = draft.progressChecklistTemplates ?? [];
      const exists = templates.some((item) => item.id === template.id);
      draft.progressChecklistTemplates = exists
        ? templates.map((item) => (item.id === template.id ? template : item))
        : [template, ...templates];

      const validItemIds = new Set(template.items.map((item) => item.id));
      draft.progressChecklistCompletions = (draft.progressChecklistCompletions ?? []).filter(
        (completion) => completion.templateId !== template.id || validItemIds.has(completion.itemId)
      );
    });
  }

  function deleteProgressChecklistTemplate(templateId: string) {
    updateVault((draft) => {
      draft.progressChecklistTemplates = (draft.progressChecklistTemplates ?? []).filter((template) => template.id !== templateId);
      draft.progressChecklistCompletions = (draft.progressChecklistCompletions ?? []).filter((completion) => completion.templateId !== templateId);
    });
  }

  function saveProgressChecklistCompletion(completion: ProgressChecklistCompletion) {
    updateVault((draft) => {
      const completions = draft.progressChecklistCompletions ?? [];
      const exists = completions.some((item) => item.id === completion.id);
      draft.progressChecklistCompletions = exists
        ? completions.map((item) => (item.id === completion.id ? completion : item))
        : [completion, ...completions];
    });
  }

  function deleteProgressChecklistCompletion(completionId: string) {
    updateVault((draft) => {
      draft.progressChecklistCompletions = (draft.progressChecklistCompletions ?? []).filter((completion) => completion.id !== completionId);
    });
  }

  function addGradeRecord(record: GradeRecord) {
    updateVault((draft) => {
      draft.gradeRecords = [record, ...(draft.gradeRecords ?? [])];
    });
  }

  function deleteGradeRecord(recordId: string) {
    updateVault((draft) => {
      draft.gradeRecords = (draft.gradeRecords ?? []).filter((record) => record.id !== recordId);
    });
  }

  function generateDrafts(
    startDate: string,
    endDate: string,
    weekdays: number[],
    courseGroupId: string,
    startTime: string,
    endTime: string
  ) {
    if (!vault) return;
    const course = getCourse(vault, courseGroupId);
    if (!course || course.status !== "active") return;
    const dates = datesBetween(startDate, endDate).filter((date) =>
      weekdays.includes(weekdayOfDateIso(date))
    );
    updateVault((draft) => {
      dates.forEach((date) => {
        const exists = draft.lessons.some(
          (lesson) =>
            lesson.date === date &&
            lesson.status !== "cancelled" &&
            timesOverlap(lesson.startTime, lesson.endTime, startTime, endTime)
        );
        if (!exists) {
          draft.lessons.push(
            createLessonFromCourse(draft, course, {
              date,
              startTime,
              endTime,
              campusId: course.defaultCampusId,
              status: "scheduled"
            })
          );
        }
      });
    });
  }

  useEffect(() => {
    const stored = readUnlockedSession();
    if (stored) {
      try {
        const session = JSON.parse(stored.raw) as UnlockedSession;
        if (!session.username || !session.password || !session.token || !session.vault) {
          clearUnlockedSession();
        } else {
          const today = todayIso();
          const cachedCloudVersion = session.cloudVersion ?? "";
          const restoredPersistLoginAfterClose = Boolean(session.persistAfterClose ?? stored.persistAfterClose);
          setUsername(session.username);
          setPassword(session.password);
          setToken(session.token);
          setRole(session.role);
          setDeletion(session.deletion);
          setVault(session.vault);
          setCloudVersion(cachedCloudVersion);
          setSelectedDate(today);
          setPersistLoginAfterClose(restoredPersistLoginAfterClose);
          writePersistentLoginPreference(session.username, restoredPersistLoginAfterClose);
          writeUnlockedSession({
            ...session,
            selectedDate: today,
            cloudVersion: cachedCloudVersion,
            persistAfterClose: restoredPersistLoginAfterClose
          });
          void loadCloudVaultWithVersion(session.token, session.password, session.username, { allowLocalFallback: false })
            .then((cloud) => {
              const nextCloudVersion = cloud.updatedAt || cachedCloudVersion;
              setVault(cloud.vault);
              setCloudVersion(nextCloudVersion);
              setRemoteCloudVersion("");
              setSyncState("idle");
              setSyncMessage("");
              writeUnlockedSession({
                ...session,
                vault: cloud.vault,
                selectedDate: today,
                cloudVersion: nextCloudVersion,
                persistAfterClose: restoredPersistLoginAfterClose
              });
            })
            .catch(() => {
              setSyncState("error");
              setSyncMessage("云端数据读取失败，当前显示本机缓存。");
            });
        }
      } catch {
        clearUnlockedSession();
      }
    }
    setBootstrapped(true);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setGreetingTime(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    cloudVersionRef.current = cloudVersion;
  }, [cloudVersion]);

  useEffect(() => {
    if (!vault || vault.scheduleRules.length === 0 || !username || !password) return;
    void persist({ ...vault, scheduleRules: [] });
  }, [vault?.scheduleRules.length, username, password]);

  useEffect(() => {
    if (!vault || !username || !vault.notice.enabled) return;
    const storedVersion = localStorage.getItem(noticeReadKey(username));
    setNoticeReadVersion(storedVersion ?? "");
    setNoticeModalOpen(storedVersion !== vault.notice.updatedAt);
  }, [username, vault?.notice.enabled, vault?.notice.updatedAt]);

  useEffect(() => {
    if (!username) {
      setOnboardingVisitedSteps([]);
      return;
    }
    setOnboardingVisitedSteps(readOnboardingVisitedSteps(username));
  }, [username]);

  useEffect(() => {
    if (!vault || !username) {
      setOnboardingVisible(false);
      return;
    }
    const dismissed = localStorage.getItem(onboardingDismissedKey(username)) === "true";
    setOnboardingVisible(!dismissed && shouldShowOnboarding(vault));
  }, [username, vault]);

  useEffect(() => {
    if (!vault) return;
    rememberUnlockedSession({ selectedDate });
  }, [selectedDate]);

  useEffect(() => {
    if (!token || !cloudVersion) return;
    if (syncState === "outdated" || syncState === "conflict") return;
    const timer = window.setInterval(() => {
      if (document.hidden || saveState === "saving") return;
      setSyncCountdownSeconds((current) => Math.max(current - 1, 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [token, cloudVersion, syncState, saveState]);

  useEffect(() => {
    if (!token || !cloudVersion) return;
    const checkWhenVisible = () => {
      if (!document.hidden) {
        void checkCloudVersion(true);
      }
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void checkCloudVersion(true);
      }
    };
    checkWhenVisible();
    window.addEventListener("focus", checkWhenVisible);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const timer = window.setInterval(() => {
      if (!document.hidden && syncState !== "outdated" && syncState !== "conflict") {
        void checkCloudVersion(true);
      }
    }, syncCheckIntervalSeconds * 1000);
    return () => {
      window.removeEventListener("focus", checkWhenVisible);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(timer);
    };
  }, [token, cloudVersion, syncState, saveState]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [view]);

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

  async function cancelDeletionRequest() {
    if (!token) return;
    await cancelOwnDeletion(token);
    setDeletion(null);
  }

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

  const activeTitle = onboardingVisible ? "首次使用指引" : viewTitles[view];
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
  const syncCountdownTone =
    syncState === "outdated" || syncState === "conflict" || remoteCloudVersion
      ? "bg-[#ef4444] text-white"
      : syncCountdownSeconds <= 15
        ? "bg-[#fee2e2] text-[#b91c1c]"
        : syncCountdownSeconds <= 45
          ? "bg-[#ffedd5] text-[#9a3412]"
          : "bg-[#dcfce7] text-[#166534]";
  const showSyncAlert = Boolean(syncMessage) && (syncState === "outdated" || syncState === "conflict" || syncState === "error");
  const greeting = greetingFor(greetingTime);
  const guideNeedsAttention = !isOnboardingSetupComplete(vault, onboardingVisitedSteps);

  function dismissOnboarding() {
    if (username) {
      localStorage.setItem(onboardingDismissedKey(username), "true");
    }
    setNoticeModalOpen(false);
    setOnboardingVisible(false);
  }

  function openOnboardingManually() {
    setNoticeModalOpen(false);
    setFeedbackModalOpen(false);
    setMobileNavOpen(false);
    setOnboardingVisible(true);
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

  function openOnboardingStep(stepKey: OnboardingStepKey, nextView: ViewKey) {
    recordOnboardingStep(stepKey);
    dismissOnboarding();
    setView(nextView);
  }

  function changeView(nextView: ViewKey) {
    if (onboardingVisible) {
      dismissOnboarding();
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
    setNoticeModalOpen(false);
    setFeedbackModalOpen(false);
    setMobileNavOpen(false);
    setOnboardingVisible(false);
    setScheduleCalendarFocus({ date: lesson.date, lessonId: lesson.id, targetPanel: "records", returnTarget: returnTarget ?? null, nonce: Date.now() });
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

  function openProgressLessonInScheduleRecords(lesson: Lesson) {
    openLessonInScheduleRecords(lesson, { kind: "view", view: "progress", label: "返回进度与作业" });
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
    setOnboardingVisible(false);
    if (target.view === "calendar" && target.calendarFocus) {
      setCalendarOverviewFocus({ ...target.calendarFocus, nonce: Date.now() });
    }
    if (target.view === "payroll" && target.payrollPanel) {
      setPayrollReviewFocus({ panel: target.payrollPanel, nonce: Date.now() });
    }
    setView(target.view);
  }

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

          <AnimatePresence>
            {mobileNavOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-5 grid grid-cols-2 gap-2 rounded-[18px] border border-[#dbe4ef] bg-white p-3 shadow-[0_14px_34px_rgba(15,35,66,0.1)] md:hidden"
              >
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
              </motion.div>
            )}
          </AnimatePresence>

          <motion.header
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex flex-col gap-4 lg:mb-8 xl:flex-row xl:items-start xl:justify-between"
          >
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#64748b] md:hidden">
                <span>{activeTitle}</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <h1 className="break-words text-[28px] font-extrabold leading-tight text-[#050b18] sm:text-[38px]">
                  {greeting}
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
                <BookOpen size={21} />
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
                <span className={`absolute -bottom-1 -right-1 min-w-7 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold leading-none ring-2 ring-white ${syncCountdownTone}`}>
                  {syncState === "checking" || syncState === "syncing" ? "..." : `${syncCountdownSeconds}s`}
                </span>
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
                <Button variant="outline" className="h-[58px] rounded-[16px]" onClick={() => {
                  if (token) {
                    void logoutCloud(token);
                  }
                  setVault(null);
                  setAmountsVisible(false);
                  setPassword("");
                  setToken("");
                  setDeletion(null);
                  setCloudVersion("");
                  setRemoteCloudVersion("");
                  setSyncState("idle");
                  setSyncMessage("");
                  clearUnlockedSession();
                }}>
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
          </motion.header>

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
                  删除计划时间：{formatAppDateTime(deletion.scheduledAt)}。在此之前可撤销申请。
                </div>
              </div>
            </div>
            <Button variant="outline" className="shrink-0 border-[#fca5a5] bg-white text-[#991b1b]" onClick={cancelDeletionRequest}>
              撤销删除申请
            </Button>
          </div>
        )}

        <AnimatePresence>
          {noticeModalOpen && vault.notice.enabled && !onboardingVisible && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center bg-[#061226]/40 p-4 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                className="w-full max-w-[520px] overflow-hidden rounded-[22px] border border-[#dbe4ef] bg-white shadow-[0_30px_80px_rgba(6,18,38,0.24)]"
              >
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
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {role !== "admin" && feedbackModalOpen && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center bg-[#061226]/40 p-4 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                className="w-full max-w-[560px] overflow-hidden rounded-[22px] border border-[#dbe4ef] bg-white shadow-[0_30px_80px_rgba(6,18,38,0.24)]"
              >
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
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div
            key={onboardingVisible ? "onboarding" : view}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {onboardingVisible && (
              <OnboardingGuide
                vault={vault}
                visitedSteps={onboardingVisitedSteps}
                onOpenStep={openOnboardingStep}
                onDismiss={dismissOnboarding}
              />
            )}
            {!onboardingVisible && view === "today" && (
              <TodayView
                vault={vault}
                selectedDate={selectedDate}
                amountsVisible={amountsVisible}
                onUpdateLesson={updateLesson}
                onOpenTodos={() => setView("todos")}
                onOpenLessonInRecords={openTodayLessonInScheduleRecords}
              />
            )}
            {!onboardingVisible && view === "todos" && (
              <TodoView
                vault={vault}
                selectedDate={selectedDate}
                onAddTodo={addTodo}
                onUpdateTodo={updateTodo}
                onDeleteTodo={deleteTodo}
              />
            )}
            {!onboardingVisible && view === "calendar" && (
              <CalendarView
                vault={vault}
                amountsVisible={amountsVisible}
                onUpdateLessons={updateLessons}
                onWeekStartChange={updateWeekStart}
                onOpenLessonInRecords={openCalendarLessonInScheduleRecords}
                focusRequest={calendarOverviewFocus}
              />
            )}
            {!onboardingVisible && view === "schedule" && (
              <ScheduleView
                vault={vault}
                amountsVisible={amountsVisible}
                onAddLesson={addLesson}
                onAddLessons={addLessons}
                onAddLessonAndUpdateLesson={addLessonAndUpdateLesson}
                onUpdateLesson={updateLesson}
                onUpdateLessons={updateLessons}
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
              />
            )}
            {!onboardingVisible && view === "progress" && (
              <ProgressView
                vault={vault}
                token={token}
                onSaveProgressRecord={saveStudentProgressRecord}
                onSaveProgressRecords={saveStudentProgressRecords}
                onDeleteProgressRecord={deleteStudentProgressRecord}
                onSaveChecklistTemplate={saveProgressChecklistTemplate}
                onDeleteChecklistTemplate={deleteProgressChecklistTemplate}
                onSaveChecklistCompletion={saveProgressChecklistCompletion}
                onDeleteChecklistCompletion={deleteProgressChecklistCompletion}
                onOpenLessonInRecords={openProgressLessonInScheduleRecords}
              />
            )}
            {!onboardingVisible && view === "students" && (
              <StudentsView
                vault={vault}
                amountsVisible={amountsVisible}
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
                onUpdateStudent={updateStudent}
                onDeleteStudent={deleteStudent}
                onUpdateProfile={updateProfile}
                onAddCourse={(course) =>
                  updateVault((draft) => {
                    draft.courseGroups.push(course);
                  })
                }
                onUpdateCourse={updateCourse}
                onSyncCoursesToLessons={syncCoursesToLessons}
                onDeleteCourse={deleteCourse}
                onAddCustomCourseType={addCustomCourseType}
                onUpdateCustomCourseType={updateCustomCourseType}
                onDeleteCustomCourseType={deleteCustomCourseType}
                onUpdateCourseTypeLabel={updateCourseTypeLabel}
                onDeleteCourseType={deleteCourseType}
                onUpdateCourseTypeFeeRule={updateCourseTypeFeeRule}
                onSyncCourseTypeFeeRuleToCourses={syncCourseTypeFeeRuleToCourses}
                onAddSubject={addSubject}
                onUpdateSubject={updateSubject}
                onDeleteSubject={deleteSubject}
                onTransferStudentCourse={transferStudentCourse}
                onOpenSchedule={() => changeView("schedule")}
              />
            )}
            {!onboardingVisible && view === "grades" && (
              <GradesView
                vault={vault}
                onAddGradeRecord={addGradeRecord}
                onDeleteGradeRecord={deleteGradeRecord}
              />
            )}
            {!onboardingVisible && view === "payroll" && (
              <PayrollReviewView
                vault={vault}
                amountsVisible={amountsVisible}
                panelFocus={payrollReviewFocus}
                storageScope={username}
                onSaveScheduleImport={(state) =>
                  updateVault((draft) => {
                    draft.scheduleImport = state;
                  })
                }
                onOpenLessonInCalendar={openPayrollReconcileLessonInScheduleRecords}
                onSuggestSchedule={openPayrollSuggestedScheduleInCalendar}
              />
            )}
            {!onboardingVisible && view === "salary" && (
              <SalaryView
                vault={vault}
                amountsVisible={amountsVisible}
                onAddAdjustment={addSalaryAdjustment}
                onDeleteAdjustment={deleteSalaryAdjustment}
                onOpenLessonInCalendar={openLessonInCalendar}
              />
            )}
            {!onboardingVisible && view === "admin" && role === "admin" && (
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
                onClearData={() => {
                  clearVault(username);
                  setVault(null);
                  setAmountsVisible(false);
                  setPassword("");
                  setToken("");
                  setDeletion(null);
                  setCloudVersion("");
                  setRemoteCloudVersion("");
                  setSyncState("idle");
                  setSyncMessage("");
                  clearUnlockedSession();
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
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

function onboardingDismissedKey(username: string): string {
  return `teacher-salary-tracker:onboarding-dismissed:${username}`;
}

function onboardingProgressKey(username: string): string {
  return `teacher-salary-tracker:onboarding-progress:${username}`;
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

function persistentLoginPreferenceKey(username: string): string {
  return `${persistentLoginPreferencePrefix}${encodeURIComponent(username)}`;
}

function readPersistentLoginPreference(username: string): boolean {
  if (!username.trim()) return false;
  return localStorage.getItem(persistentLoginPreferenceKey(username.trim())) === "true";
}

function writePersistentLoginPreference(username: string, persistAfterClose: boolean): void {
  if (!username.trim()) return;
  localStorage.setItem(persistentLoginPreferenceKey(username.trim()), persistAfterClose ? "true" : "false");
}

function readUnlockedSession(): StoredUnlockedSession | null {
  const sessionSession = sessionStorage.getItem(unlockedSessionKey);
  if (sessionSession) {
    return { raw: sessionSession, persistAfterClose: false };
  }
  const persistentSession = localStorage.getItem(unlockedSessionKey);
  if (persistentSession) {
    return { raw: persistentSession, persistAfterClose: true };
  }
  return null;
}

function writeUnlockedSession(session: UnlockedSession): void {
  const serialized = JSON.stringify(session);
  if (session.persistAfterClose) {
    localStorage.setItem(unlockedSessionKey, serialized);
    sessionStorage.removeItem(unlockedSessionKey);
    return;
  }
  sessionStorage.setItem(unlockedSessionKey, serialized);
  localStorage.removeItem(unlockedSessionKey);
}

function clearUnlockedSession(): void {
  sessionStorage.removeItem(unlockedSessionKey);
  localStorage.removeItem(unlockedSessionKey);
}

function greetingFor(date: Date): string {
  const hour = currentAppHour(date);
  if (hour >= 5 && hour < 11) return "早上好";
  if (hour >= 11 && hour < 14) return "中午好";
  if (hour >= 14 && hour < 18) return "下午好";
  return "晚上好";
}

function recalculateLessonFeeSnapshot(vault: TeacherVault, lesson: Lesson): Lesson {
  const course = getCourse(vault, lesson.courseGroupId);
  if (!course) return lesson;
  const normalizedLesson: Lesson = {
    ...lesson,
    attendance: lesson.attendance.map((entry) => ({
      ...entry,
      trial: entry.trial ?? Boolean(vault.students.find((student) => student.id === entry.studentId)?.temporaryTrial)
    }))
  };
  return {
    ...normalizedLesson,
    feeSnapshot: {
      ...buildFeeSnapshot(vault, course, normalizedLesson)
    }
  };
}

function cloneFeeRule(rule: FeeRule): FeeRule {
  return structuredClone(rule);
}

function moveLessonsToTrash(vault: TeacherVault, lessons: Lesson[], source: DeletedLessonSource, reason?: string) {
  if (lessons.length === 0) return;
  const lessonIds = new Set(lessons.map((lesson) => lesson.id));
  const trashedLessonIds = new Set((vault.deletedLessons ?? []).map((item) => item.lesson.id));
  const deletedAt = new Date().toISOString();
  const deletedItems = lessons
    .filter((lesson) => !trashedLessonIds.has(lesson.id))
    .map((lesson) => ({
      id: makeId("deleted_lesson"),
      lesson,
      deletedAt,
      source,
      reason
    }));
  vault.deletedLessons = [...(vault.deletedLessons ?? []), ...deletedItems];
  vault.lessons = vault.lessons.filter((lesson) => !lessonIds.has(lesson.id));
}

type CourseLessonSyncScope = "future_scheduled" | "all_unfinished" | "all" | "none";

function courseUpdateAffectsLessonDefaults(previousCourse: CourseGroup, nextCourse: CourseGroup): boolean {
  return (
    previousCourse.type !== nextCourse.type ||
    previousCourse.defaultCampusId !== nextCourse.defaultCampusId ||
    JSON.stringify(previousCourse.studentIds) !== JSON.stringify(nextCourse.studentIds) ||
    JSON.stringify(previousCourse.feeRule) !== JSON.stringify(nextCourse.feeRule)
  );
}

function normalizeCourseLessonSyncScope(value: unknown): CourseLessonSyncScope {
  const normalized = stringValue(value).toLowerCase();
  if (!normalized || normalized === "default" || normalized === "future" || normalized === "future_scheduled" || normalized === "未来" || normalized === "未来待上课") {
    return "future_scheduled";
  }
  if (normalized === "none" || normalized === "false" || normalized === "不更新" || normalized === "不同步") return "none";
  if (normalized === "all" || normalized === "全部" || normalized === "所有课节") return "all";
  if (normalized === "unfinished" || normalized === "all_unfinished" || normalized === "未完成" || normalized === "未完成课节") return "all_unfinished";
  return "future_scheduled";
}

function shouldSyncLessonWithCourseDefaults(lesson: Lesson, scope: CourseLessonSyncScope): boolean {
  if (scope === "none") return false;
  if (scope === "all") return true;
  if (lesson.linkedOriginalLessonId) return false;
  if (lesson.status !== "scheduled" && lesson.status !== "draft") return false;
  if (scope === "all_unfinished") return true;
  return lesson.date >= todayIso();
}

function lessonAttendanceFromCourse(vault: TeacherVault, lesson: Lesson, course: CourseGroup): Lesson["attendance"] {
  const existingByStudent = new Map(lesson.attendance.map((entry) => [entry.studentId, entry]));
  const fallbackStatus = attendanceStatusForLessonStatus(lesson.status);
  return course.studentIds.map((studentId) => {
    const existing = existingByStudent.get(studentId);
    if (existing) {
      return {
        ...existing,
        trial: existing.trial ?? Boolean(vault.students.find((student) => student.id === studentId)?.temporaryTrial)
      };
    }
    return {
      studentId,
      status: fallbackStatus,
      trial: Boolean(vault.students.find((student) => student.id === studentId)?.temporaryTrial)
    };
  });
}

function syncLessonsWithCourseDefaults(vault: TeacherVault, course: CourseGroup, scope: CourseLessonSyncScope): number {
  let changedCount = 0;
  vault.lessons = vault.lessons.map((lesson) => {
    if (lesson.courseGroupId !== course.id || !shouldSyncLessonWithCourseDefaults(lesson, scope)) return lesson;
    changedCount += 1;
    return recalculateLessonFeeSnapshot(vault, {
      ...lesson,
      type: course.type,
      campusId: course.defaultCampusId,
      expectedStudentIds: [...course.studentIds],
      attendance: lessonAttendanceFromCourse(vault, lesson, course),
      trialStudentCount: course.type === "class" ? lesson.trialStudentCount ?? 0 : 0,
      trialFee: course.type === "class" ? lesson.trialFee ?? 0 : 0
    });
  });
  return changedCount;
}

function shouldSyncFutureLessonWithStudentTrialStatus(lesson: Lesson): boolean {
  if (lesson.date < todayIso()) return false;
  return lesson.status !== "completed" && lesson.status !== "cancelled" && lesson.status !== "makeup_completed";
}

function materializeStudentTrialStatusOnLessons(vault: TeacherVault, studentId: string, currentTrial: boolean) {
  vault.lessons = vault.lessons.map((lesson) => {
    let changed = false;
    const attendance = lesson.attendance.map((entry) => {
      if (entry.studentId !== studentId || entry.trial !== undefined) return entry;
      changed = true;
      return { ...entry, trial: currentTrial };
    });
    return changed ? { ...lesson, attendance } : lesson;
  });
}

function syncFutureLessonsWithStudentTrialStatus(vault: TeacherVault, studentId: string, nextTrial: boolean): number {
  let changedCount = 0;
  vault.lessons = vault.lessons.map((lesson) => {
    if (!shouldSyncFutureLessonWithStudentTrialStatus(lesson)) return lesson;
    let changed = false;
    const attendance = lesson.attendance.map((entry) => {
      if (entry.studentId !== studentId || entry.trial === nextTrial) return entry;
      changed = true;
      return { ...entry, trial: nextTrial };
    });
    if (!changed) return lesson;
    changedCount += 1;
    return recalculateLessonFeeSnapshot(vault, { ...lesson, attendance });
  });
  return changedCount;
}

function cleanupResolvedMakeupLessons(vault: TeacherVault, updatedOriginal: Lesson) {
  if (updatedOriginal.linkedOriginalLessonId) return;
  const previousOriginal = vault.lessons.find((lesson) => lesson.id === updatedOriginal.id);
  if (!previousOriginal) return;

  const previousNeededStudentIds = new Set(makeupNeededStudentIds(previousOriginal));
  if (previousNeededStudentIds.size === 0) return;
  const nextNeededStudentIds = new Set(makeupNeededStudentIds(updatedOriginal));
  const resolvedStudentIds = Array.from(previousNeededStudentIds).filter((studentId) => !nextNeededStudentIds.has(studentId));
  if (resolvedStudentIds.length === 0) return;
  const resolvedStudentSet = new Set(resolvedStudentIds);
  if (updatedOriginal.status === "makeup_pending" && nextNeededStudentIds.size === 0) {
    updatedOriginal.status = lessonStatusAfterResolvedMakeup(updatedOriginal);
  }

  vault.lessons = vault.lessons.flatMap((lesson) => {
    if (lesson.linkedOriginalLessonId !== updatedOriginal.id || lesson.status === "cancelled") {
      return [lesson];
    }

    const makeupStudentIds = lessonStudentIds(lesson);
    const keptStudentIds = makeupStudentIds.filter((studentId) => !resolvedStudentSet.has(studentId));
    if (keptStudentIds.length === makeupStudentIds.length) {
      return [lesson];
    }
    if (keptStudentIds.length === 0) {
      return [];
    }

    return [recalculateLessonFeeSnapshot(vault, {
      ...lesson,
      expectedStudentIds: lesson.expectedStudentIds.filter((studentId) => keptStudentIds.includes(studentId)),
      attendance: lesson.attendance.filter((entry) => keptStudentIds.includes(entry.studentId)),
      makeupStudentId: keptStudentIds.length === 1 ? keptStudentIds[0] : undefined,
      note: removeResolvedMakeupNames(lesson.note, vault, resolvedStudentIds)
    })];
  });
}

function syncOriginalLessonFromMakeupCompletion(vault: TeacherVault, updatedMakeupLesson: Lesson): Lesson {
  const originalId = updatedMakeupLesson.linkedOriginalLessonId;
  if (!originalId) return updatedMakeupLesson;
  const isCompletedMakeupStatus = updatedMakeupLesson.status === "completed" || updatedMakeupLesson.status === "makeup_completed";
  if (!isCompletedMakeupStatus) return updatedMakeupLesson;
  const original = vault.lessons.find((lesson) => lesson.id === originalId);
  if (!original) return updatedMakeupLesson;

  const completedStudentIds = new Set(lessonStudentIds(updatedMakeupLesson));
  if (completedStudentIds.size === 0) return updatedMakeupLesson;
  const nextOriginal: Lesson = {
    ...original,
    attendance: original.attendance.map((entry) =>
      completedStudentIds.has(entry.studentId)
        ? { ...entry, status: "makeup_completed" as AttendanceStatus, note: entry.note || `${updatedMakeupLesson.date} 已补课完成` }
        : entry
    )
  };
  const remainingMakeupStudentIds = new Set(makeupNeededStudentIds(nextOriginal));
  if ((nextOriginal.status === "makeup_pending" || original.status === "makeup_pending") && remainingMakeupStudentIds.size === 0) {
    nextOriginal.status = lessonStatusAfterResolvedMakeup(nextOriginal);
  }

  const normalizedMakeupLesson = updatedMakeupLesson.status === "completed"
    ? {
        ...updatedMakeupLesson,
        status: "makeup_completed" as const,
        attendance: updatedMakeupLesson.attendance.map((entry) => (
          entry.status === "attended" ? { ...entry, status: "makeup_completed" as AttendanceStatus } : entry
        ))
      }
    : updatedMakeupLesson;

  const recalculatedOriginal = recalculateLessonFeeSnapshot(vault, nextOriginal);
  const recalculatedMakeup = recalculateLessonFeeSnapshot(vault, normalizedMakeupLesson);
  vault.lessons = vault.lessons.map((lesson) => {
    if (lesson.id === original.id) return recalculatedOriginal;
    if (lesson.id === updatedMakeupLesson.id) return recalculatedMakeup;
    return lesson;
  });
  return recalculatedMakeup;
}

function lessonStatusAfterResolvedMakeup(lesson: Lesson): Lesson["status"] {
  if (lesson.attendance.length > 0 && lesson.attendance.every((entry) => entry.status === "cancelled")) {
    return "cancelled";
  }
  if (lesson.attendance.length > 0 && lesson.attendance.every((entry) => entry.status === "makeup_completed")) {
    return "makeup_completed";
  }
  return "completed";
}

function removeResolvedMakeupNames(note: string | undefined, vault: TeacherVault, studentIds: string[]): string | undefined {
  if (!note) return note;
  return studentIds.reduce((current, studentId) => {
    const studentName = vault.students.find((student) => student.id === studentId)?.name;
    return studentName ? current.replaceAll(studentName, "").replace(/、{2,}/g, "、").replace(/^、|、(?= 补 )/g, "").trim() : current;
  }, note);
}

function feeModeLabel(mode: FeeRule["mode"]): string {
  if (mode === "salary_grade") return "课时费等级计费";
  if (mode === "class_headcount") return "按人数班课计费";
  if (mode === "fixed") return "按单节固定计费";
  return "按小时计费";
}

function defaultFeeRuleForVaultCourseType(vault: TeacherVault, type: CourseType): FeeRule {
  if (type !== "trial" && type !== "full_time") {
    return {
      mode: "salary_grade",
      salaryGradeSource: "teacher_default",
      salaryGradeId: vault.profile.defaultSalaryGradeId ?? defaultSalaryGradeRule(vault).id
    };
  }
  return feeRuleForCourseType(vault, type);
}

function defaultFeeRuleForCustomTemplate(
  vault: TeacherVault,
  template: "class" | "non_class" | "hourly"
): FeeRule {
  if (template === "hourly") {
    return { mode: "hourly", hourlyRate: 0 };
  }
  const defaultGradeRule = salaryGradeRuleById(vault.profile.defaultSalaryGradeId, vault) ?? defaultSalaryGradeRule(vault);
  const juniorRate = salaryGradeRateForStage(defaultGradeRule, "junior_3");
  const minStudents = template === "class" ? 5 : 1;
  const baseFee = template === "class" ? juniorRate.classBaseFee : juniorRate.oneOnOneFee;
  const tier = {
    id: "tier_1_plus",
    minStudents: Math.max(Math.round(minStudents), 0),
    baseFee: Math.max(baseFee, 0),
    perStudentFee: Math.max(juniorRate.headcountIncrementFee, 0)
  };
  return {
    mode: "class_headcount",
    baseFee: tier.baseFee,
    perPresentStudentFee: tier.perStudentFee,
    classFeeTiers: [tier],
    stageRates: defaultGradeRule.stageRates,
    makeupFeeMode: "perStudentFee"
  };
}

function feeRuleFromAiData(data: Record<string, unknown>, vault: TeacherVault, type: CourseType, fallback?: FeeRule): FeeRule {
  const source = isPlainRecordLocal(data.feeRule) ? data.feeRule : data;
  const courseTypeRule = defaultFeeRuleForVaultCourseType(vault, type);
  const templateRule = fallback?.mode === courseTypeRule.mode ? fallback : courseTypeRule;
  const mode = stringValue(source.mode ?? source.feeMode).toLowerCase();
  const salaryGradeId = stringValue(source.salaryGradeId ?? source.gradeId ?? source.positionGradeId);
  if (mode === "salary_grade" || mode === "salary" || mode === "岗位薪资" || mode === "岗位薪资等级" || mode === "课时费等级") {
    return {
      mode: "salary_grade",
      salaryGradeSource: salaryGradeId ? "specific" : "teacher_default",
      salaryGradeId: (salaryGradeId || vault.profile.defaultSalaryGradeId) as SalaryGradeId | undefined
    };
  }
  const baseFee = numberValue(source.baseFee ?? source.classBaseFee ?? source.minimumFee);
  const perStudentFee = numberValue(source.perPresentStudentFee ?? source.perStudentFee ?? source.extraStudentFee ?? source.headcountFee);
  const minStudents = numberValue(source.minStudents ?? source.minimumStudents ?? source.includedStudents);
  const hourlyRate = numberValue(source.hourlyRate ?? source.rate);
  const fixedFee = numberValue(source.fixedFee);

  if (templateRule.mode === "class_headcount") {
    const tier = normalizedSingleClassFeeTier(templateRule);
    const nextTier = {
      id: tier.id,
      minStudents: Math.max(Math.round(minStudents ?? tier.minStudents ?? 1), 0),
      baseFee: Math.max(baseFee ?? tier.baseFee ?? 0, 0),
      perStudentFee: Math.max(perStudentFee ?? tier.perStudentFee ?? 0, 0)
    };
    return {
      ...templateRule,
      mode: "class_headcount",
      baseFee: nextTier.baseFee,
      perPresentStudentFee: nextTier.perStudentFee,
      classFeeTiers: [nextTier],
      makeupFeeMode: templateRule.makeupFeeMode ?? "perStudentFee"
    };
  }

  if (templateRule.mode === "fixed") {
    return {
      mode: "fixed",
      fixedFee: Math.max(fixedFee ?? templateRule.fixedFee ?? 0, 0)
    };
  }

  return {
    mode: "hourly",
    hourlyRate: Math.max(hourlyRate ?? templateRule.hourlyRate ?? 0, 0)
  };
}

function normalizedSingleClassFeeTier(rule: FeeRule): ClassFeeTier {
  const explicit = (rule.classFeeTiers ?? []).filter((tier) => Number.isFinite(tier.minStudents));
  const tier = explicit.length > 0
    ? [...explicit].sort((a, b) => a.minStudents - b.minStudents)[0]
    : {
        id: "tier_1_plus",
        minStudents: 1,
        baseFee: rule.baseFee ?? 0,
        perStudentFee: rule.perPresentStudentFee ?? 0
      };
  return {
    id: tier.id || "tier_1_plus",
    minStudents: tier.minStudents,
    baseFee: tier.baseFee,
    perStudentFee: tier.perStudentFee
  };
}

function normalizeAiCourseType(value: unknown, vault: TeacherVault | null = null): CourseType {
  const normalized = stringValue(value).toLowerCase();
  if (normalized === "one_on_one" || normalized === "一对一") return "one_on_one";
  if (normalized === "one_on_two" || normalized === "一对二") return "one_on_two";
  if (normalized === "class" || normalized === "班课" || normalized === "多人班课") return "class";
  if (normalized === "trial" || normalized === "试听") return "trial";
  if (normalized === "full_time" || normalized === "全职" || normalized === "全日制") return "full_time";
  const matchedCustomType = vault?.preferences?.customCourseTypes?.find((item) =>
    item.id.toLowerCase() === normalized || item.label.trim().toLowerCase() === normalized
  );
  if (matchedCustomType) return matchedCustomType.id;
  const matchedKnownType = vault
    ? Array.from(new Set([...vault.courseGroups.map((course) => course.type), ...vault.lessons.map((lesson) => lesson.type)]))
        .find((type) => type.toLowerCase() === normalized || courseTypeLabel(vault, type).trim().toLowerCase() === normalized)
    : undefined;
  if (matchedKnownType) return matchedKnownType;
  return "class";
}
