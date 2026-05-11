import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  Calendar,
  GraduationCap,
  LogOut,
  Menu
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoginScreen } from "@/frontend/components/LoginScreen";
import { Sidebar } from "@/frontend/components/Sidebar";
import { AdminView } from "@/frontend/views/AdminView";
import { CalendarView } from "@/frontend/views/CalendarView";
import { GradesView } from "@/frontend/views/GradesView";
import { PayrollReviewView } from "@/frontend/views/PayrollReviewView";
import { ScheduleView } from "@/frontend/views/ScheduleView";
import { SalaryView } from "@/frontend/views/SalaryView";
import { StudentsView } from "@/frontend/views/StudentsView";
import { TodayView } from "@/frontend/views/TodayView";
import { currentAppHour, formatAppDateLabel, formatAppDateTime, getCourse, todayIso } from "@/frontend/lib/calculations";
import { cancelOwnDeletion } from "@/frontend/lib/cloud";
import {
  cloneVault,
  type ViewKey,
  viewTitles,
  datesBetween,
  createLessonFromCourse,
  weekdayOfDateIso
} from "@/frontend/lib/helpers";
import { clearVault, loginAccount, logoutCloud, registerAccount, saveVault } from "@/frontend/lib/storage";
import type {
  Campus,
  CourseGroup,
  GradeRecord,
  Lesson,
  SalaryAdjustment,
  Student,
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
};

const unlockedSessionKey = "teacher-salary-tracker:unlocked-session";

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
  const [noticeReadVersion, setNoticeReadVersion] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [greetingTime, setGreetingTime] = useState(() => new Date());

  function rememberUnlockedSession(next?: Partial<UnlockedSession>) {
    const session: UnlockedSession = {
      username,
      password,
      token,
      role,
      deletion,
      vault: vault!,
      selectedDate,
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
    rememberUnlockedSession({
      username: result.account.username,
      password: nextPassword,
      token: result.token,
      role: result.account.role,
      deletion: result.deletion,
      vault: result.vault
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
    rememberUnlockedSession({
      username: result.account.username,
      password: nextPassword,
      token: result.token,
      role: result.account.role,
      deletion: result.deletion,
      vault: result.vault
    });
    return result.account.role;
  }

  async function persist(nextVault: TeacherVault) {
    if (!username || !password) return;
    setVault(nextVault);
    setSaveState("saving");
    try {
      await saveVault(username, password, nextVault, token);
      rememberUnlockedSession({ vault: nextVault });
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 900);
    } catch {
      rememberUnlockedSession({ vault: nextVault });
      setSaveState("error");
    }
  }

  function updateVault(updater: (draft: TeacherVault) => void) {
    if (!vault) return;
    const next = cloneVault(vault);
    updater(next);
    void persist(next);
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
    if (!course) return;
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
    if (!course) return;
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
        const session = JSON.parse(stored) as UnlockedSession;
        if (!session.username || !session.password || !session.token || !session.vault) {
          clearUnlockedSession();
        } else {
          setUsername(session.username);
          setPassword(session.password);
          setToken(session.token);
          setRole(session.role);
          setDeletion(session.deletion);
          setVault(session.vault);
          setSelectedDate(session.selectedDate || todayIso());
          writeUnlockedSession({
            ...session,
            selectedDate: session.selectedDate || todayIso()
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
    if (!vault) return;
    rememberUnlockedSession({ selectedDate });
  }, [selectedDate]);

  function acknowledgeNotice() {
    if (!vault || !username) return;
    localStorage.setItem(noticeReadKey(username), vault.notice.updatedAt);
    setNoticeReadVersion(vault.notice.updatedAt);
    setNoticeModalOpen(false);
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
  const greeting = greetingFor(greetingTime);

  return (
    <div className="dashboard-shell flex min-h-screen">
      <Sidebar
        view={view}
        collapsed={collapsed}
        role={role}
        username={username}
        onViewChange={setView}
        onToggle={() => setCollapsed((v) => !v)}
      />

      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1720px] px-4 py-5 sm:px-6 lg:px-9 lg:py-9">
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
                      setView(item.key);
                      setMobileNavOpen(false);
                    }}
                    className={`rounded-[12px] px-3 py-2 text-left text-sm font-bold ${
                      view === item.key ? "orange-gradient text-white" : "bg-[#f3f7fb] text-[#25324a]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
            className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between"
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
              <p className="mt-2 text-base text-[#475569] sm:text-lg">
                今天的课时、收入、排课和待处理事项已汇总在这里。
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap xl:justify-end">
              <button
                type="button"
                onClick={() => setNoticeModalOpen(true)}
                className="relative flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[16px] border border-[#dbe4ef] bg-white text-[#25324a] shadow-[0_12px_28px_rgba(15,35,66,0.08)] transition-colors hover:bg-[#f8fbff]"
                aria-label="查看系统公告"
                title="系统公告"
              >
                <Bell size={21} />
                {hasUnreadNotice && (
                  <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-[#ef4444] ring-2 ring-white" />
                )}
              </button>

              <label className="flex h-[58px] min-w-0 items-center gap-3 rounded-[16px] border border-[#dbe4ef] bg-white px-4 shadow-[0_12px_28px_rgba(15,35,66,0.08)]">
                <Calendar size={20} className="shrink-0 text-[#25324a]" />
                <span className="hidden truncate text-sm font-bold text-[#25324a] sm:block">{selectedDateLabel}</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="h-10 rounded-[10px] border border-[#dbe4ef] bg-white px-3 text-sm font-bold text-[#25324a] outline-none focus:border-[#ff8617] focus:ring-2 focus:ring-[#ff8617]/20"
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
          {noticeModalOpen && vault.notice.enabled && (
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

        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {view === "today" && (
              <TodayView
                vault={vault}
                selectedDate={selectedDate}
                onUpdateLesson={updateLesson}
                onAddTodo={addTodo}
                onUpdateTodo={updateTodo}
                onDeleteTodo={deleteTodo}
              />
            )}
            {view === "calendar" && (
              <CalendarView vault={vault} onWeekStartChange={updateWeekStart} />
            )}
            {view === "schedule" && (
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
              />
            )}
            {view === "students" && (
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
              />
            )}
            {view === "grades" && (
              <GradesView
                vault={vault}
                onAddGradeRecord={addGradeRecord}
                onDeleteGradeRecord={deleteGradeRecord}
              />
            )}
            {view === "payroll" && (
              <PayrollReviewView vault={vault} />
            )}
            {view === "salary" && (
              <SalaryView
                vault={vault}
                onBaseSalaryChange={(value) =>
                  updateVault((draft) => {
                    draft.profile.baseSalary = Number.isFinite(value) ? value : 0;
                  })
                }
                onAddAdjustment={addSalaryAdjustment}
                onDeleteAdjustment={deleteSalaryAdjustment}
              />
            )}
            {view === "admin" && role === "admin" && (
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

function readUnlockedSession(): string | null {
  return sessionStorage.getItem(unlockedSessionKey) ?? localStorage.getItem(unlockedSessionKey);
}

function writeUnlockedSession(session: UnlockedSession): void {
  const serialized = JSON.stringify(session);
  sessionStorage.setItem(unlockedSessionKey, serialized);
  localStorage.setItem(unlockedSessionKey, serialized);
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
