import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Bell, Database, KeyRound, Lock, MessageSquare, RefreshCw, Save, ShieldCheck, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AdminSummary, AdminUser, FeedbackStatus, Notice, TeacherVault, UserFeedback, UserStatus } from "@/shared/types";
import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { MetricCard } from "@/frontend/components/MetricCard";
import {
  cancelUserDeletion,
  confirmUserDeletion,
  getAdminFeedback,
  getAdminSummary,
  getAdminUsers,
  lookupPasswordSalt,
  requestUserDeletion,
  runDueDeletions,
  updateAdminFeedback,
  updateAdminNotice,
  updateRegistrationEnabled
} from "@/frontend/lib/cloud";
import { derivePasswordVerifier } from "@/frontend/lib/crypto";
import { formatAppDateTime } from "@/frontend/lib/calculations";

const statusLabels: Record<UserStatus, string> = {
  active: "正常",
  disabled: "停用",
  delete_requested: "删除申请中",
  delete_scheduled: "等待自动删除",
  deleted: "已删除"
};

const feedbackStatusLabels: Record<FeedbackStatus, string> = {
  unread: "未读",
  read: "已读",
  in_progress: "处理中",
  completed: "已完成"
};

function feedbackStatusVariant(status: FeedbackStatus): "sage" | "amber" | "secondary" | "sky" {
  if (status === "completed") return "sage";
  if (status === "in_progress") return "amber";
  if (status === "read") return "sky";
  return "secondary";
}

function statusVariant(status: UserStatus): "sage" | "amber" | "destructive" | "secondary" {
  if (status === "active") return "sage";
  if (status === "delete_requested" || status === "delete_scheduled") return "amber";
  if (status === "deleted") return "destructive";
  return "secondary";
}

function isMigrationMessage(message: string): boolean {
  return message.includes("云端迁移") || message.includes("D1") || message.includes("migration");
}

export function AdminView({
  vault,
  token,
  adminUsername,
  onNoticeChange,
  onClearData
}: {
  vault: TeacherVault;
  token: string;
  adminUsername: string;
  onNoticeChange: (notice: Notice) => void;
  onClearData: () => void;
}) {
  const [title, setTitle] = useState(vault.notice.title);
  const [content, setContent] = useState(vault.notice.content);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [feedbackItems, setFeedbackItems] = useState<UserFeedback[]>([]);
  const [feedbackFilter, setFeedbackFilter] = useState<"all" | FeedbackStatus>("all");
  const [feedbackNotes, setFeedbackNotes] = useState<Record<string, string>>({});
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [deleteReasons, setDeleteReasons] = useState<Record<string, string>>({});
  const [deletePasswords, setDeletePasswords] = useState<Record<string, string>>({});
  const [confirmingDeleteUser, setConfirmingDeleteUser] = useState<AdminUser | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  useEffect(() => {
    setTitle(vault.notice.title);
    setContent(vault.notice.content);
  }, [vault.notice.title, vault.notice.content]);

  useEffect(() => {
    void refresh();
  }, [token]);

  async function refresh() {
    if (!token) return;
    setBusy(true);
    setMessage("");
    try {
      const [nextSummary, nextUsers] = await Promise.all([
        getAdminSummary(token),
        getAdminUsers(token)
      ]);
      setSummary(nextSummary);
      setUsers(nextUsers);
      setRegistrationEnabled(nextSummary.registrationEnabled);
      try {
        const nextFeedback = await getAdminFeedback(token);
        setFeedbackItems(nextFeedback);
        setFeedbackNotes(
          Object.fromEntries(nextFeedback.map((item) => [item.id, item.adminNote ?? ""]))
        );
      } catch (feedbackError) {
        setFeedbackItems([]);
        setFeedbackNotes({});
        const feedbackMessage = feedbackError instanceof Error ? feedbackError.message : "用户反馈列表加载失败。";
        setMessage(
          isMigrationMessage(feedbackMessage)
            ? "用户反馈列表暂时不可用：云端 D1 还没执行最新迁移。请在 Cloudflare D1 按顺序执行 migrations/0003_user_feedback.sql 后刷新。其他管理员数据已正常加载。"
            : feedbackMessage
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "管理员数据加载失败。");
    } finally {
      setBusy(false);
    }
  }

  async function saveNotice() {
    setBusy(true);
    setMessage("");
    try {
      const updated = await updateAdminNotice(token, {
        enabled: true,
        title,
        content,
        updatedAt: new Date().toISOString()
      });
      onNoticeChange(updated);
      setMessage("系统公告已更新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "公告保存失败。");
    } finally {
      setBusy(false);
    }
  }

  async function toggleRegistration() {
    setBusy(true);
    setMessage("");
    try {
      const next = await updateRegistrationEnabled(token, !registrationEnabled);
      setRegistrationEnabled(next.registrationEnabled);
      setSummary((current) => current ? { ...current, registrationEnabled: next.registrationEnabled } : current);
      setMessage(next.registrationEnabled ? "注册入口已开启。" : "注册入口已关闭。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "注册开关更新失败。");
    } finally {
      setBusy(false);
    }
  }

  async function updateUser(nextUser: Promise<AdminUser>) {
    setBusy(true);
    setMessage("");
    try {
      const updated = await nextUser;
      setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)));
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "用户操作失败。");
    } finally {
      setBusy(false);
    }
  }

  async function setFeedbackStatus(feedback: UserFeedback, status: FeedbackStatus) {
    setBusy(true);
    setMessage("");
    try {
      const updated = await updateAdminFeedback(token, feedback.id, status, feedbackNotes[feedback.id] ?? "");
      setFeedbackItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setFeedbackNotes((current) => ({ ...current, [updated.id]: updated.adminNote ?? "" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "反馈状态更新失败。");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDueUsers() {
    setBusy(true);
    setMessage("");
    try {
      const result = await runDueDeletions(token);
      setMessage(`已自动删除 ${result.deleted} 个到期账号。`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "自动删除执行失败。");
    } finally {
      setBusy(false);
    }
  }

  function askDeleteDueUsers() {
    confirm({
      title: "执行到期账号删除？",
      description: "会立即删除所有已经到期的账号和加密数据，未到期账号不会被处理。",
      confirmLabel: "执行删除",
      tone: "danger",
      onConfirm: () => void deleteDueUsers()
    });
  }

  function askClearData() {
    confirm({
      title: "删除当前本地缓存？",
      description: "会清除当前浏览器里的本地加密缓存和登录状态，之后需要重新登录。",
      confirmLabel: "删除缓存",
      tone: "danger",
      onConfirm: onClearData
    });
  }

  async function submitVerifiedDeleteRequest(user: AdminUser) {
    const targetPassword = deletePasswords[user.id] ?? "";
    if (!targetPassword) {
      setMessage(`请先输入账号「${user.username}」的登录密码。`);
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const lookup = await lookupPasswordSalt(user.username);
      const targetPasswordVerifier = await derivePasswordVerifier(targetPassword, lookup.passwordSalt);
      const updated = await requestUserDeletion(token, user.id, deleteReasons[user.id] ?? "", targetPasswordVerifier);
      setUsers((current) => current.map((currentUser) => (currentUser.id === updated.id ? updated : currentUser)));
      setDeleteReasons((current) => {
        const next = { ...current };
        delete next[user.id];
        return next;
      });
      setDeletePasswords((current) => {
        const next = { ...current };
        delete next[user.id];
        return next;
      });
      await refresh();
      setMessage(`账号「${user.username}」已通过密码验证并进入删除计划。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除申请验证失败。");
    } finally {
      setBusy(false);
    }
  }

  function askVerifiedDeleteRequest(user: AdminUser) {
    const targetPassword = deletePasswords[user.id] ?? "";
    if (!targetPassword) {
      setMessage(`请先输入账号「${user.username}」的登录密码。`);
      return;
    }

    confirm({
      title: `验证删除账号「${user.username}」？`,
      description: "验证通过后账号会进入删除计划。到期执行前仍可在用户列表撤销。",
      confirmLabel: "验证删除",
      tone: "danger",
      onConfirm: () => void submitVerifiedDeleteRequest(user)
    });
  }

  function openDeleteConfirm(user: AdminUser) {
    setConfirmingDeleteUser(user);
    setConfirmPassword("");
    setConfirmError("");
  }

  function closeDeleteConfirm() {
    if (confirmBusy) return;
    setConfirmingDeleteUser(null);
    setConfirmPassword("");
    setConfirmError("");
  }

  async function submitDeleteConfirm() {
    if (!confirmingDeleteUser) return;
    const nextPassword = confirmPassword;
    if (!nextPassword) {
      setConfirmError("请输入当前管理员密码。");
      return;
    }

    setBusy(true);
    setConfirmBusy(true);
    setConfirmError("");
    setMessage("");
    try {
      const lookup = await lookupPasswordSalt(adminUsername);
      const passwordVerifier = await derivePasswordVerifier(nextPassword, lookup.passwordSalt);
      const updated = await confirmUserDeletion(token, confirmingDeleteUser.id, passwordVerifier);
      setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)));
      setConfirmingDeleteUser(null);
      setConfirmPassword("");
      await refresh();
    } catch (error) {
      setConfirmError(error instanceof Error ? error.message : "删除确认失败。");
    } finally {
      setConfirmBusy(false);
      setBusy(false);
    }
  }

  const activeUsers = summary?.users.active ?? 0;
  const pendingDeletion = summary?.users.pendingDeletion ?? 0;
  const encryptedDocuments = summary?.encryptedDocuments ?? 0;
  const filteredFeedback = feedbackItems.filter((item) => feedbackFilter === "all" || item.status === feedbackFilter);
  const unreadFeedback = feedbackItems.filter((item) => item.status === "unread").length;

  return (
    <div className="space-y-6">
      {dialog}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="活跃用户" value={`${activeUsers}`} hint={`总账号 ${summary?.users.total ?? 0}`} variant={1} index={0} />
        <MetricCard label="待删除" value={`${pendingDeletion}`} hint="10 天到期后自动删除" variant={2} index={1} />
        <MetricCard label="加密文档" value={`${encryptedDocuments}`} hint="仅保存密文" variant={3} index={2} />
      </div>

      {message && (
        <div className="rounded-[14px] border border-[#dbe4ef] bg-white px-4 py-3 text-sm font-bold text-[#25324a]">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
                <Bell size={14} /> 公告设置
              </div>
              <CardTitle>系统公告</CardTitle>
              <CardDescription>公告从 D1 统一读取，所有用户登录后都会看到</CardDescription>
            </div>
            <Button size="sm" disabled={busy} onClick={saveNotice}>
              <Save size={15} /> 保存
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">标题</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">内容</label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
              <ShieldCheck size={14} /> 系统设置
            </div>
            <CardTitle>注册与隐私边界</CardTitle>
            <CardDescription>管理员只能看账号元数据，不能查看老师明文数据</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col gap-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-extrabold text-[#061226]">用户注册</div>
                <div className="mt-1 text-sm font-semibold text-[#64748b]">
                  当前状态：{registrationEnabled ? "允许新用户注册" : "已关闭注册入口"}
                </div>
              </div>
              <Button variant={registrationEnabled ? "destructive" : "default"} disabled={busy} onClick={toggleRegistration}>
                {registrationEnabled ? "关闭注册" : "开启注册"}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { icon: Lock, text: "不显示课程内容" },
                { icon: Users, text: "不显示学生姓名" },
                { icon: Database, text: "不显示课时费明细" },
                { icon: ShieldCheck, text: "只管理账号状态" }
              ].map((item, i) => (
                <motion.div
                  key={item.text}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  whileHover={{ x: 4 }}
                  className="flex items-center gap-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#eaf2ff]">
                    <item.icon size={14} className="text-[#1557c2]" />
                  </div>
                  <span className="text-sm font-medium">{item.text}</span>
                </motion.div>
              ))}
            </div>

            <Button variant="destructive" className="w-full" onClick={askClearData}>
              <Trash2 size={15} /> 删除当前本地缓存
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff8617]">
              <MessageSquare size={14} /> 用户反馈
            </div>
            <CardTitle>功能改进与优化建议</CardTitle>
            <CardDescription>用户只能单向发送；这里的处理进度和标注不会返回给用户。</CardDescription>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-[150px_auto] lg:w-auto">
            <Select value={feedbackFilter} onChange={(event) => setFeedbackFilter(event.target.value as "all" | FeedbackStatus)}>
              <option value="all">全部反馈</option>
              <option value="unread">未读</option>
              <option value="read">已读</option>
              <option value="in_progress">处理中</option>
              <option value="completed">已完成</option>
            </Select>
            <Badge variant={unreadFeedback ? "amber" : "secondary"} className="justify-center">
              {unreadFeedback ? `${unreadFeedback} 条未读` : "无未读"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredFeedback.map((item) => (
            <div key={item.id} className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="break-words text-base text-[#061226]">{item.title}</strong>
                    <Badge variant={feedbackStatusVariant(item.status)}>{feedbackStatusLabels[item.status]}</Badge>
                  </div>
                  <div className="mt-2 text-xs font-bold text-[#64748b]">
                    {item.username} · {formatAppDateTime(item.createdAt)}
                  </div>
                  <div className="mt-3 whitespace-pre-wrap rounded-[12px] border border-[#e8eef6] bg-white px-3 py-2 text-sm font-semibold leading-6 text-[#25324a]">
                    {item.content}
                  </div>
                </div>
                <div className="w-full shrink-0 space-y-2 lg:w-[320px]">
                  <Select
                    value={item.status}
                    onChange={(event) => void setFeedbackStatus(item, event.target.value as FeedbackStatus)}
                    disabled={busy}
                  >
                    <option value="unread">未读</option>
                    <option value="read">已读</option>
                    <option value="in_progress">处理中</option>
                    <option value="completed">已完成</option>
                  </Select>
                  <Textarea
                    value={feedbackNotes[item.id] ?? ""}
                    onChange={(event) =>
                      setFeedbackNotes((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                    placeholder="管理员内部标注，不会返回给用户"
                    className="min-h-[88px] bg-white"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void setFeedbackStatus(item, item.status)}
                    className="w-full"
                  >
                    <Save size={14} /> 保存标注
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {filteredFeedback.length === 0 && (
            <div className="rounded-[14px] border border-dashed border-[#cbd6e3] bg-[#f8fbff] p-8 text-center text-sm font-semibold text-[#64748b]">
              当前没有用户反馈
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
              <Users size={14} /> 用户列表
            </div>
            <CardTitle>真实云端用户</CardTitle>
            <CardDescription>删除流程：申请、二次确认、撤销或 10 天到期自动删除</CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" disabled={busy} onClick={refresh}>
              <RefreshCw size={15} /> 刷新
            </Button>
            <Button variant="outline" disabled={busy} onClick={askDeleteDueUsers}>
              <Trash2 size={15} /> 执行到期删除
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-separate border-spacing-y-2 text-left text-sm">
              <thead>
                <tr className="text-xs font-extrabold uppercase text-[#64748b]">
                  <th className="px-3 py-2">账号</th>
                  <th className="px-3 py-2">角色</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">最近登录</th>
                  <th className="px-3 py-2">删除计划</th>
                  <th className="px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="bg-[#f8fbff] align-top">
                    <td className="rounded-l-[12px] px-3 py-3 font-extrabold text-[#061226]">{user.username}</td>
                    <td className="px-3 py-3">
                      <Badge variant={user.role === "admin" ? "plum" : "sky"}>
                        {user.role === "admin" ? "管理员" : "老师"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={statusVariant(user.status)}>{statusLabels[user.status]}</Badge>
                    </td>
                    <td className="px-3 py-3 text-[#475569]">
                      {user.lastLoginAt ? formatAppDateTime(user.lastLoginAt) : "未登录"}
                    </td>
                    <td className="px-3 py-3 text-[#475569]">
                      {user.deletion ? (
                        <div className="space-y-1">
                          <div>{formatAppDateTime(user.deletion.scheduledAt)}</div>
                          {user.deletion.noticeCount > 0 && !user.deletion.cancelledAt && (
                            <div className="text-xs font-semibold text-[#9a3412]">
                              已提醒 {user.deletion.noticeCount} 次
                            </div>
                          )}
                        </div>
                      ) : "无"}
                    </td>
                    <td className="rounded-r-[12px] px-3 py-3">
                      {user.status === "active" && (
                        <div className="flex w-[300px] max-w-full flex-col gap-2 2xl:w-[380px] 2xl:flex-row 2xl:items-center">
                          <Input
                            value={deleteReasons[user.id] ?? ""}
                            onChange={(event) =>
                              setDeleteReasons((current) => ({ ...current, [user.id]: event.target.value }))
                            }
                            placeholder="删除原因"
                            className="h-9 min-w-0 2xl:w-[126px] 2xl:flex-none"
                          />
                          <Input
                            type="password"
                            value={deletePasswords[user.id] ?? ""}
                            onChange={(event) =>
                              setDeletePasswords((current) => ({ ...current, [user.id]: event.target.value }))
                            }
                            placeholder="被删除账号密码"
                            autoComplete="new-password"
                            className="h-9 min-w-0 2xl:w-[142px] 2xl:flex-none"
                          />
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={busy}
                            className="shrink-0"
                            onClick={() => askVerifiedDeleteRequest(user)}
                          >
                            <Trash2 size={14} /> 验证删除
                          </Button>
                        </div>
                      )}
                      {(user.status === "delete_requested" || user.status === "delete_scheduled") && (
                        <div className="flex flex-wrap gap-2">
                          {user.status === "delete_requested" && (
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={busy}
                              onClick={() => openDeleteConfirm(user)}
                            >
                              二次确认
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => updateUser(cancelUserDeletion(token, user.id))}
                          >
                            撤销
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="rounded-[14px] bg-[#f8fbff] px-4 py-8 text-center font-semibold text-[#64748b]">
                      暂无用户
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {confirmingDeleteUser && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#061226]/40 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            className="w-full max-w-[460px] overflow-hidden rounded-[20px] border border-[#fecaca] bg-white shadow-[0_30px_80px_rgba(6,18,38,0.24)]"
          >
            <div className="border-b border-[#fee2e2] bg-[#fff1f2] p-5">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#dc2626]">
                <KeyRound size={14} /> 密码确认
              </div>
              <div className="text-xl font-extrabold text-[#7f1d1d]">确认删除申请</div>
              <div className="mt-2 text-sm font-semibold leading-6 text-[#991b1b]">
                将账号「{confirmingDeleteUser.username}」进入正式删除计划前，需要输入当前管理员密码。
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div className="space-y-2">
                <label className="text-sm font-bold text-[#25324a]">当前管理员密码</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="输入当前登录管理员密码"
                  autoFocus
                />
              </div>
              {confirmError && (
                <div className="rounded-[12px] border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm font-bold text-[#b91c1c]">
                  {confirmError}
                </div>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" disabled={confirmBusy} onClick={closeDeleteConfirm}>
                  取消
                </Button>
                <Button type="button" variant="destructive" disabled={confirmBusy} onClick={submitDeleteConfirm}>
                  <Trash2 size={15} /> 确认删除
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
