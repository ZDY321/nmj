import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  Calendar,
  ChevronDown,
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
import { LessonsView } from "@/frontend/views/LessonsView";
import { ScheduleView } from "@/frontend/views/ScheduleView";
import { SalaryView } from "@/frontend/views/SalaryView";
import { StudentsView } from "@/frontend/views/StudentsView";
import { TodayView } from "@/frontend/views/TodayView";
import { getCourse } from "@/frontend/lib/calculations";
import { cancelOwnDeletion } from "@/frontend/lib/cloud";
import {
  cloneVault,
  type ViewKey,
  viewTitles,
  datesBetween,
  createLessonFromCourse
} from "@/frontend/lib/helpers";
import { clearVault, loginAccount, logoutCloud, registerAccount, saveVault } from "@/frontend/lib/storage";
import type { Lesson, TeacherVault, UserDeletionState, UserRole } from "@/shared/types";

export function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [role, setRole] = useState<UserRole>("teacher");
  const [deletion, setDeletion] = useState<UserDeletionState | null>(null);
  const [vault, setVault] = useState<TeacherVault | null>(null);
  const [view, setView] = useState<ViewKey>("today");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [noticeModalOpen, setNoticeModalOpen] = useState(false);
  const [noticeReadVersion, setNoticeReadVersion] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function login(nextUsername: string, nextPassword: string) {
    const result = await loginAccount(nextUsername, nextPassword);
    setUsername(result.account.username);
    setPassword(nextPassword);
    setToken(result.token);
    setRole(result.account.role);
    setDeletion(result.deletion);
    setVault(result.vault);
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
    return result.account.role;
  }

  async function persist(nextVault: TeacherVault) {
    if (!username || !password) return;
    setVault(nextVault);
    setSaveState("saving");
    try {
      await saveVault(username, password, nextVault, token);
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 900);
    } catch {
      setSaveState("error");
    }
  }

  function updateVault(updater: (draft: TeacherVault) => void) {
    if (!vault) return;
    const next = cloneVault(vault);
    updater(next);
    void persist(next);
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

  function addScheduledLesson(date: string, courseGroupId: string, startTime: string, endTime: string) {
    if (!vault) return;
    const course = getCourse(vault, courseGroupId);
    if (!course) return;
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
      weekdays.includes(new Date(`${date}T00:00:00`).getDay())
    );
    updateVault((draft) => {
      dates.forEach((date) => {
        const exists = draft.lessons.some(
          (lesson) =>
            lesson.courseGroupId === courseGroupId &&
            lesson.date === date &&
            lesson.startTime === startTime
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

  async function cancelDeletionRequest() {
    if (!token) return;
    await cancelOwnDeletion(token);
    setDeletion(null);
  }

  if (!vault) {
    return (<LoginScreen
      onLogin={login}
      onRegister={register}
    />);
  }

  const activeTitle = viewTitles[view];
  const today = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short"
  }).format(new Date());

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

  return (
    <div className="dashboard-shell flex min-h-screen">
      <Sidebar
        view={view}
        collapsed={collapsed}
        role={role}
        username={username}
        displayName={vault.profile.displayName}
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
              <h1 className="text-[30px] font-extrabold leading-tight text-[#050b18] sm:text-[38px]">
                welcome back,{vault.profile.displayName || "Teacher"}
              </h1>
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

              <div className="flex h-[58px] overflow-hidden rounded-[16px] border border-[#dbe4ef] bg-white p-1 shadow-[0_12px_28px_rgba(15,35,66,0.08)]">
                {["Daily", "Weekly", "Monthly", "Yearly"].map((label) => (
                  <button
                    type="button"
                    key={label}
                    className={`min-w-[78px] rounded-[12px] px-4 text-sm font-bold transition-colors ${
                      label === "Yearly" ? "orange-gradient text-white shadow-[0_10px_20px_rgba(255,134,23,0.22)]" : "text-[#25324a] hover:bg-[#f3f7fb]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex h-[58px] min-w-0 items-center gap-3 rounded-[16px] border border-[#dbe4ef] bg-white px-4 shadow-[0_12px_28px_rgba(15,35,66,0.08)]">
                <Calendar size={20} className="shrink-0 text-[#25324a]" />
                <span className="truncate text-sm font-bold text-[#25324a]">{today}</span>
                <ChevronDown size={16} className="shrink-0 text-[#64748b]" />
              </div>

              <div className="hidden items-center gap-2 md:flex">
                <Button variant="outline" className="h-[58px] rounded-[16px]" onClick={() => {
                  if (token) {
                    void logoutCloud(token);
                  }
                  setVault(null);
                  setPassword("");
                  setToken("");
                  setDeletion(null);
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
          <div className="mb-6 flex flex-col gap-4 rounded-[16px] border border-[#fed7aa] bg-[#fff7ed] p-4 text-[#9a3412] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <AlertTriangle size={22} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-extrabold">账号删除申请待处理</div>
                <div className="mt-1 text-sm font-semibold leading-6">
                  删除计划时间：{new Date(deletion.scheduledAt).toLocaleString("zh-CN")}。在此之前可撤销申请。
                </div>
              </div>
            </div>
            <Button variant="outline" className="shrink-0 border-[#fdba74] bg-white" onClick={cancelDeletionRequest}>
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
                    更新时间：{new Date(vault.notice.updatedAt).toLocaleString("zh-CN")}
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
              <TodayView vault={vault} onUpdateLesson={updateLesson} />
            )}
            {view === "calendar" && (
              <CalendarView vault={vault} />
            )}
            {view === "lessons" && (
              <LessonsView
                vault={vault}
                onAddLesson={addLesson}
                onUpdateLesson={updateLesson}
                onDeleteLesson={deleteLesson}
              />
            )}
            {view === "schedule" && (
              <ScheduleView
                vault={vault}
                onAddRule={(rule) =>
                  updateVault((draft) => {
                    draft.scheduleRules.push(rule);
                  })
                }
                onGenerateDrafts={generateDrafts}
                onAddScheduledLesson={addScheduledLesson}
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
                onAddStudent={(student) =>
                  updateVault((draft) => {
                    draft.students.push(student);
                  })
                }
                onAddCourse={(course) =>
                  updateVault((draft) => {
                    draft.courseGroups.push(course);
                  })
                }
              />
            )}
            {view === "salary" && (
              <SalaryView
                vault={vault}
                onBaseSalaryChange={(value) =>
                  updateVault((draft) => {
                    draft.profile.baseSalary = Number.isFinite(value) ? value : 0;
                  })
                }
              />
            )}
            {view === "admin" && role === "admin" && (
              <AdminView
                vault={vault}
                token={token}
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
  { key: "lessons", label: viewTitles.lessons },
  { key: "schedule", label: viewTitles.schedule },
  { key: "students", label: viewTitles.students },
  { key: "salary", label: viewTitles.salary }
];

function noticeReadKey(username: string): string {
  return `teacher-salary-tracker:notice-read:${username}`;
}
