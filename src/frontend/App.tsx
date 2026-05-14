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
import { ScheduleView } from "@/frontend/views/ScheduleView";
import { SalaryView } from "@/frontend/views/SalaryView";
import { StudentsView } from "@/frontend/views/StudentsView";
import { TodayView } from "@/frontend/views/TodayView";
import { currentAppHour, defaultFeeRuleForCourseType, formatAppDateLabel, formatAppDateTime, getCourse, todayIso } from "@/frontend/lib/calculations";
import { ApiError, cancelOwnDeletion, submitFeedback } from "@/frontend/lib/cloud";
import {
  cloneVault,
  type ViewKey,
  viewTitles,
  datesBetween,
  createLessonFromCourse,
  weekdayOfDateIso
} from "@/frontend/lib/helpers";
import { isOnboardingSetupComplete, normalizeOnboardingStepKeys, type OnboardingStepKey } from "@/frontend/lib/onboarding";
import { clearVault, getCloudVaultMeta, loadCloudVaultWithVersion, loginAccount, logoutCloud, registerAccount, saveVault } from "@/frontend/lib/storage";
import type {
  Campus,
  CourseGroup,
  CourseType,
  CustomCourseType,
  CustomCourseTypeOption,
  FeeRule,
  GradeRecord,
  Lesson,
  SalaryAdjustment,
  Student,
  StudentCourseTransition,
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
};

type ScheduleCalendarFocus = {
  date: string;
  lessonId?: string;
  nonce: number;
};

const unlockedSessionKey = "teacher-salary-tracker:unlocked-session";
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
  const [collapsed, setCollapsed] = useState(false);
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
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [cloudVersion, setCloudVersion] = useState("");
  const [remoteCloudVersion, setRemoteCloudVersion] = useState("");
  const [syncState, setSyncState] = useState<"idle" | "checking" | "syncing" | "outdated" | "conflict" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [syncCountdownSeconds, setSyncCountdownSeconds] = useState(syncCheckIntervalSeconds);
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [scheduleCalendarFocus, setScheduleCalendarFocus] = useState<ScheduleCalendarFocus | null>(null);
  const [greetingTime, setGreetingTime] = useState(() => new Date());
  const cloudVersionRef = useRef("");
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
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
      ...next
    };
    if (!session.username || !session.password || !session.token || !session.vault) return;
    writeUnlockedSession(session);
  }

  async function login(nextUsername: string, nextPassword: string) {
    const result = await loginAccount(nextUsername, nextPassword);
    setUsername(result.account.username);
    setPassword(nextPassword);
    setToken(result.token);
    setRole(result.account.role);
    setDeletion(result.deletion);
    setVault(result.vault);
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
      cloudVersion: result.cloudVersion
    });
    if (view === "admin" && result.account.role !== "admin") {
      setView("today");
    }
  }

  async function register(nextUsername: string, nextPassword: string): Promise<UserRole> {
    const result = await registerAccount(nextUsername, nextPassword);
    setUsername(result.account.username);
    setPassword(nextPassword);
    setToken(result.token);
    setRole(result.account.role);
    setDeletion(result.deletion);
    setVault(result.vault);
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
      cloudVersion: result.cloudVersion
    });
    return result.account.role;
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
    setSaveState("saving");
    const saveJob = saveChainRef.current.then(async () => {
      try {
        const result = await saveVault(username, password, nextVault, {
          token,
          expectedUpdatedAt: options.force ? undefined : cloudVersionRef.current || undefined,
          force: options.force
        });
        const nextCloudVersion = result.updatedAt ?? cloudVersionRef.current;
        if (nextCloudVersion) {
          cloudVersionRef.current = nextCloudVersion;
          setCloudVersion(nextCloudVersion);
        }
        setRemoteCloudVersion("");
        setSyncState("idle");
        setSyncMessage("");
        rememberUnlockedSession({ vault: nextVault, cloudVersion: nextCloudVersion });
        setSaveState("saved");
        window.setTimeout(() => setSaveState("idle"), 900);
      } catch (error) {
        rememberUnlockedSession({ vault: nextVault });
        setSaveState("error");
        if (error instanceof ApiError && error.status === 409) {
          const currentUpdatedAt = typeof error.body?.currentUpdatedAt === "string" ? error.body.currentUpdatedAt : "";
          setRemoteCloudVersion(currentUpdatedAt);
          setSyncState("conflict");
          setSyncMessage("云端已有其他设备更新。当前页面的修改只保存在本机，继续保存前请先同步云端，或明确覆盖云端。");
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
    if (saveState === "saving") {
      setSyncState("error");
      setSyncMessage("正在保存当前修改，请保存完成后再同步云端数据。");
      return;
    }
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
    if (!token || !cloudVersion || document.hidden) return;
    if (saveState === "saving") return;
    if (!silent) {
      setSyncState("checking");
      setSyncMessage("正在检查云端版本...");
    }
    try {
      const meta = await getCloudVaultMeta(token);
      if (meta.updatedAt && meta.updatedAt !== cloudVersion) {
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

  function updateLesson(lesson: Lesson) {
    updateVault((draft) => {
      draft.lessons = draft.lessons.map((item) => (item.id === lesson.id ? lesson : item));
    });
  }

  function deleteLesson(lessonId: string) {
    updateVault((draft) => {
      draft.lessons = draft.lessons.filter((lesson) => lesson.id !== lessonId);
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
      draft.students = draft.students.map((item) => (item.id === student.id ? student : item));
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
      draft.courseGroups = draft.courseGroups.map((item) => (item.id === course.id ? course : item));
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

  function addCustomCourseType(courseType: CustomCourseTypeOption) {
    updateVault((draft) => {
      const current = draft.preferences?.customCourseTypes ?? [];
      const normalizedLabel = courseType.label.trim();
      if (!normalizedLabel || current.some((item) => item.id === courseType.id || item.label.trim() === normalizedLabel)) return;
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        customCourseTypes: [...current, { ...courseType, label: normalizedLabel }],
        courseTypeFeeRules: {
          ...(draft.preferences?.courseTypeFeeRules ?? {}),
          [courseType.id]: draft.preferences?.courseTypeFeeRules?.[courseType.id] ?? defaultFeeRuleForCourseType(courseType.id)
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
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        disabledCourseTypes: Array.from(new Set([...(draft.preferences?.disabledCourseTypes ?? []), courseType]))
      };
    });
  }

  function restoreCourseType(courseType: CourseType) {
    updateVault((draft) => {
      draft.preferences = {
        ...(draft.preferences ?? { weekStartsOn: 0 }),
        disabledCourseTypes: (draft.preferences?.disabledCourseTypes ?? []).filter((type) => type !== courseType)
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

  function addScheduledLesson(date: string, courseGroupId: string, startTime: string, endTime: string) {
    if (!vault) return;
    const course = getCourse(vault, courseGroupId);
    if (!course || course.status !== "active") return;
    if (hasLessonConflict(vault.lessons, date, startTime, endTime)) return;
    addLesson(
      createLessonFromCourse(vault, course, {
        date,
        startTime,
        endTime,
        campusId: course.defaultCampusId,
        status: "scheduled"
      })
    );
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
    localStorage.removeItem(unlockedSessionKey);
    const stored = readUnlockedSession();
    if (stored) {
      try {
        const session = JSON.parse(stored) as UnlockedSession;
        if (!session.username || !session.password || !session.token || !session.vault) {
          clearUnlockedSession();
        } else {
          const today = todayIso();
          const cachedCloudVersion = session.cloudVersion ?? "";
          setUsername(session.username);
          setPassword(session.password);
          setToken(session.token);
          setRole(session.role);
          setDeletion(session.deletion);
          setVault(session.vault);
          setCloudVersion(cachedCloudVersion);
          setSelectedDate(today);
          writeUnlockedSession({
            ...session,
            selectedDate: today,
            cloudVersion: cachedCloudVersion
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
                cloudVersion: nextCloudVersion
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
    setScheduleCalendarFocus({ date: lesson.date, lessonId: lesson.id, nonce: Date.now() });
    setView("schedule");
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
                  ? "grid-cols-[56px_56px_56px_minmax(0,1fr)]"
                  : "grid-cols-[56px_56px_56px_56px_minmax(0,1fr)]"
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
                onUpdateLesson={updateLesson}
                onAddTodo={addTodo}
                onUpdateTodo={updateTodo}
                onDeleteTodo={deleteTodo}
              />
            )}
            {!onboardingVisible && view === "calendar" && (
              <CalendarView vault={vault} onWeekStartChange={updateWeekStart} onOpenLessonInCalendar={openLessonInCalendar} />
            )}
            {!onboardingVisible && view === "schedule" && (
              <ScheduleView
                vault={vault}
                onAddLesson={addLesson}
                onUpdateLesson={updateLesson}
                onDeleteLesson={deleteLesson}
                onAddCustomTimePreset={addCustomTimePreset}
                onDeleteCustomTimePreset={deleteCustomTimePreset}
                onGenerateDrafts={generateDrafts}
                onAddScheduledLesson={addScheduledLesson}
                onWeekStartChange={updateWeekStart}
                calendarFocus={scheduleCalendarFocus}
              />
            )}
            {!onboardingVisible && view === "students" && (
              <StudentsView
                vault={vault}
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
                onDeleteCourse={deleteCourse}
                onAddCustomCourseType={addCustomCourseType}
                onUpdateCustomCourseType={updateCustomCourseType}
                onDeleteCustomCourseType={deleteCustomCourseType}
                onUpdateCourseTypeLabel={updateCourseTypeLabel}
                onDeleteCourseType={deleteCourseType}
                onRestoreCourseType={restoreCourseType}
                onUpdateCourseTypeFeeRule={updateCourseTypeFeeRule}
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
              <PayrollReviewView vault={vault} onOpenLessonInCalendar={openLessonInCalendar} />
            )}
            {!onboardingVisible && view === "salary" && (
              <SalaryView
                vault={vault}
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
                onNoticeChange={(notice) =>
                  updateVault((draft) => {
                    draft.notice = notice;
                  })
                }
                onClearData={() => {
                  clearVault(username);
                  setVault(null);
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
  { key: "today", label: viewTitles.today },
  { key: "calendar", label: viewTitles.calendar },
  { key: "schedule", label: viewTitles.schedule },
  { key: "students", label: viewTitles.students },
  { key: "grades", label: viewTitles.grades },
  { key: "payroll", label: viewTitles.payroll },
  { key: "salary", label: viewTitles.salary }
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

function readUnlockedSession(): string | null {
  return sessionStorage.getItem(unlockedSessionKey);
}

function writeUnlockedSession(session: UnlockedSession): void {
  sessionStorage.setItem(unlockedSessionKey, JSON.stringify(session));
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

function hasLessonConflict(lessons: Lesson[], date: string, startTime: string, endTime: string): boolean {
  return lessons.some(
    (lesson) =>
      lesson.date === date &&
      lesson.status !== "cancelled" &&
      timesOverlap(lesson.startTime, lesson.endTime, startTime, endTime)
  );
}

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
