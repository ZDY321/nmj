import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, BookOpen, CalendarDays, Eye, EyeOff, GraduationCap, Lock, ShieldCheck, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { UserRole } from "@/shared/types";
import { privacyNoticeLines } from "@/frontend/lib/helpers";
import { getPublicSettings } from "@/frontend/lib/cloud";

const usernamePattern = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{1,30}[A-Za-z0-9])$/;
const usernameRuleText = "用户名请使用英文字母、数字、下划线、短横线或点，3-32 位，首尾必须是英文字母或数字。";

function PasswordField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <label className="text-sm font-bold text-[#25324a]">{label}</label>
      <div className="flex">
        <Input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-r-none border-r-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setVisible((v) => !v)}
          className="h-11 w-11 shrink-0 rounded-l-none border-l-0"
          aria-label="切换密码可见性"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </Button>
      </div>
    </div>
  );
}

export function LoginScreen({
  onLogin,
  onRegister
}: {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string) => Promise<UserRole>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordAcknowledged, setPasswordAcknowledged] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPublicSettings()
      .then((settings) => {
        if (cancelled) return;
        setRegistrationEnabled(settings.registrationEnabled);
        if (!settings.registrationEnabled) {
          setMode("login");
        }
      })
      .catch(() => {
        setRegistrationEnabled(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (mode === "register") {
        if (!registrationEnabled) {
          setError("当前暂未开放注册，请联系管理员。");
          return;
        }
        if (!usernamePattern.test(username.trim())) {
          setError(usernameRuleText);
          return;
        }
        if (password.length < 8) {
          setError("密码至少需要 8 位。");
          return;
        }
        if (password !== confirmPassword) {
          setError("两次输入的密码不一致。");
          return;
        }
        if (!passwordAcknowledged) {
          setError("请先勾选确认：你已经阅读提醒，并且已经严肃保存登录密码 / 数据密码。");
          return;
        }
        const role = await onRegister(username.trim(), password);
        setSuccess(
          role === "admin"
            ? "注册成功。第一位注册用户已设为管理员，正在进入工作台。"
            : "注册成功，正在进入工作台。"
        );
        return;
      }
      await onLogin(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法解锁数据。请确认用户名和密码。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="dashboard-shell min-h-screen overflow-hidden p-4 sm:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-[1280px] grid-cols-1 overflow-hidden rounded-[28px] border border-[#dbe4ef] bg-white shadow-[0_24px_70px_rgba(15,35,66,0.14)] lg:grid-cols-[0.95fr_1.05fr]">
        <section className="navy-gradient relative flex min-h-[520px] flex-col justify-between overflow-hidden p-8 text-white sm:p-12">
          <div>
            <div className="mb-14 flex items-center gap-4">
              <div className="orange-gradient flex h-14 w-14 items-center justify-center rounded-[16px] shadow-[0_14px_28px_rgba(255,134,23,0.28)]">
                <GraduationCap size={32} />
              </div>
              <div>
                <div className="text-[34px] font-extrabold leading-none">
                  <span>Teach</span>
                  <span className="text-[#ff911f]">Pro</span>
                </div>
                <div className="mt-2 text-base font-medium text-white/70">课薪记录管理</div>
              </div>
            </div>

            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
              <Badge className="mb-6 bg-white/12 px-4 py-1.5 text-white" variant="outline">
                Private Workspace
              </Badge>
              <h1 className="max-w-[520px] text-[38px] font-extrabold leading-tight sm:text-[48px]">
                管理课时、排课和工资统计
              </h1>
              <div className="mt-8 space-y-4">
                {privacyNoticeLines.map((line, i) => (
                  <div key={line} className="flex gap-3 text-sm leading-relaxed text-white/76">
                    <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#ff911f]" />
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: WalletCards, label: "工资" },
              { icon: CalendarDays, label: "排课" },
              { icon: BookOpen, label: "课时" }
            ].map((item) => (
              <div key={item.label} className="rounded-[16px] border border-white/10 bg-white/[0.055] p-4">
                <item.icon size={22} className="mb-3 text-[#ff911f]" />
                <div className="text-sm font-bold">{item.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center p-5 sm:p-10">
          <Card className="w-full max-w-[480px] border-0 shadow-none">
            <CardHeader className="px-0 pb-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#fff1e2] text-[#ff8617]">
                <Lock size={24} />
              </div>
              <CardTitle className="text-[30px]">{mode === "login" ? "登录工作台" : "首次注册"}</CardTitle>
              <CardDescription className="text-base">
                {mode === "login"
                  ? "输入用户名和数据密码，解锁云端加密数据。"
                  : "首次使用请创建账号，注册完成后进入工作台。"}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <form onSubmit={submit} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#25324a]">
                    {mode === "register" ? "用户名（英文账号）" : "用户名"}
                  </label>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={mode === "register" ? "例如 teacher_niuma 或 teacher.niuma" : undefined}
                  />
                  {mode === "register" && (
                    <p className="text-xs font-semibold leading-5 text-[#64748b]">
                      {usernameRuleText}
                    </p>
                  )}
                </div>
                <PasswordField label="登录密码 / 数据密码" value={password} onChange={setPassword} />
                {mode === "register" && (
                  <>
                    <PasswordField label="再次确认密码" value={confirmPassword} onChange={setConfirmPassword} />
                    <div className="flex gap-3 rounded-[14px] border border-[#fdba74] bg-[#fff7ed] p-4 text-[#9a3412]">
                      <AlertTriangle size={20} className="mt-0.5 shrink-0" />
                      <div className="text-sm font-bold leading-6">
                        请务必严肃保存登录密码 / 数据密码。该密码用于解锁你的加密数据，丢失后无法从云端找回或解密。
                      </div>
                    </div>
                    <label className="flex items-start gap-3 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] p-4 text-sm font-bold leading-6 text-[#25324a]">
                      <input
                        type="checkbox"
                        checked={passwordAcknowledged}
                        onChange={(event) => setPasswordAcknowledged(event.target.checked)}
                        className="mt-1 h-4 w-4 shrink-0 accent-[#ff8617]"
                      />
                      <span>
                        我已阅读提醒，并确认已经保存好登录密码 / 数据密码；我知道密码丢失后无法找回，也无法解密云端数据。
                      </span>
                    </label>
                  </>
                )}
                {error && <p className="rounded-[12px] bg-[#fee2e2] px-4 py-3 text-sm font-bold text-[#dc2626]">{error}</p>}
                {success && <p className="rounded-[12px] bg-[#e8f8ef] px-4 py-3 text-sm font-bold text-[#16a34a]">{success}</p>}
                <Button
                  type="submit"
                  disabled={busy || (mode === "register" && !passwordAcknowledged)}
                  className="h-12 w-full rounded-[14px] text-base"
                >
                  <Lock size={17} />
                  {busy ? "处理中..." : mode === "login" ? "登录并解锁" : "注册账号"}
                </Button>
                {registrationEnabled || mode === "register" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-[#1557c2]"
                    onClick={() => {
                      setMode((c) => (c === "login" ? "register" : "login"));
                      setError("");
                      setSuccess("");
                      setPasswordAcknowledged(false);
                    }}
                  >
                    {mode === "login" ? "还没有账号？先注册" : "已有账号？返回登录"}
                  </Button>
                ) : (
                  <div className="rounded-[12px] bg-[#f8fbff] px-4 py-3 text-center text-sm font-semibold text-[#64748b]">
                    当前暂未开放注册，请联系管理员开通。
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
