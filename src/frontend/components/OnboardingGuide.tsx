import {
  ArrowDown,
  BookOpenCheck,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  Landmark,
  LineChart,
  ShieldCheck,
  UsersRound,
  WalletCards
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TeacherVault } from "@/shared/types";
import type { ViewKey } from "@/frontend/lib/helpers";
import { getOnboardingStepStates, type OnboardingStepKey } from "@/frontend/lib/onboarding";

type GuideStep = {
  key: OnboardingStepKey;
  icon: typeof GraduationCap;
  title: string;
  description: string;
  detail: string;
  view: ViewKey;
  studentsPanel?: "profile" | "salaryRules" | "campuses" | "students" | "courses";
  button: string;
  dataDone: boolean;
  visited: boolean;
  done: boolean;
};

type GuideStepContent = Omit<GuideStep, "dataDone" | "visited" | "done">;

export function OnboardingGuide({
  vault,
  visitedSteps,
  onOpenStep,
  onDismiss
}: {
  vault: TeacherVault;
  visitedSteps: OnboardingStepKey[];
  onOpenStep: (stepKey: OnboardingStepKey, view: ViewKey, studentsPanel?: "profile" | "salaryRules" | "campuses" | "students" | "courses") => void;
  onDismiss: () => void;
}) {
  const stepStates = getOnboardingStepStates(vault, visitedSteps);
  const stepStateByKey = new Map(stepStates.map((step) => [step.key, step]));
  const stepContent: GuideStepContent[] = [
    {
      key: "profile",
      icon: Landmark,
      title: "建立校区和个人档案",
      description: "先录入老师信息、默认校区、基本工资和义务课时规则。",
      detail: "这些信息会被后续课程、课时费、工资核对自动引用，建议先把个人信息和工资规则填好。",
      view: "students",
      studentsPanel: "profile",
      button: "去个人信息"
    },
    {
      key: "student_course",
      icon: UsersRound,
      title: "录入学生和课程",
      description: "先在学生列表建档，再到添加课程档案创建一对一、一对二、班课或试听课程。",
      detail: "课程会绑定学生、校区、科目和班型；后面排课时只需要选择课程，金额会按当前规则自动带出。",
      view: "students",
      studentsPanel: "students",
      button: "去学生列表"
    },
    {
      key: "schedule",
      icon: CalendarDays,
      title: "生成课时记录",
      description: "用单节添加、日历点选或批量生成，把未来课程排到系统里。",
      detail: "上课后在课时记录里确认到课状态、补课、临时学生、课程内容和作业。",
      view: "schedule",
      button: "去排课"
    },
    {
      key: "payroll",
      icon: ClipboardCheck,
      title: "每天看提醒，月底核工资",
      description: "今日提醒负责当天跟进，工资核对和数据统计负责月底复盘。",
      detail: "月底先核对课程状态，再看校区小计、义务课时扣费、补贴扣款和最终收入。",
      view: "payroll",
      button: "看核对页"
    },
    {
      key: "grades",
      icon: LineChart,
      title: "补充成绩记录",
      description: "有考试或测验时，按学生和科目录入成绩，后续可看走势。",
      detail: "成绩记录不会影响工资，只用于教学跟进和家长沟通。",
      view: "grades",
      button: "去成绩记录"
    }
  ];
  const steps: GuideStep[] = stepContent.map((step) => {
    const state = stepStateByKey.get(step.key);
    return {
      ...step,
      dataDone: Boolean(state?.dataDone),
      visited: Boolean(state?.visited),
      done: Boolean(state?.done)
    };
  });

  const completed = steps.filter((step) => step.done).length;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="navy-gradient p-5 text-white sm:p-7 lg:p-8">
              <div className="orange-gradient mb-5 flex h-14 w-14 items-center justify-center rounded-[16px] shadow-[0_14px_28px_rgba(255,134,23,0.28)]">
                <GraduationCap size={28} />
              </div>
              <Badge variant="amber" className="mb-4 bg-white/12 text-white">
                首次使用指引
              </Badge>
              <h2 className="max-w-[640px] text-[28px] font-extrabold leading-tight sm:text-[34px]">
                首次设置不用一次做完
              </h2>
              <div className="mt-4 max-w-[640px] rounded-[14px] border border-white/12 bg-white/[0.055] px-4 py-3 text-sm font-semibold leading-7 text-white/76">
                前期搭建基础资料和录入课程信息的时候会比较花时间，但后续的记录课时和核对工资等操作就会轻松很多。
              </div>
              <p className="mt-4 max-w-[620px] text-sm font-semibold leading-7 text-white/72 sm:text-base">
                建议按顺序完成校区、学生、课程、排课、核对这几步；也可以先进入系统，系统不会自动写入示例数据。
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-[14px] border border-white/12 bg-white/[0.055] p-3">
                  <div className="text-2xl font-extrabold">{completed}/{steps.length}</div>
                  <div className="mt-1 text-white/68">已完成</div>
                </div>
                <div className="rounded-[14px] border border-white/12 bg-white/[0.055] p-3">
                  <div className="text-2xl font-extrabold">{vault.students.length}</div>
                  <div className="mt-1 text-white/68">学生</div>
                </div>
                <div className="rounded-[14px] border border-white/12 bg-white/[0.055] p-3">
                  <div className="text-2xl font-extrabold">{vault.lessons.length}</div>
                  <div className="mt-1 text-white/68">课时</div>
                </div>
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onDismiss}
                  className="h-12 rounded-[14px] border-white/18 bg-white/8 text-white hover:bg-white/12 hover:text-white"
                >
                  先进入系统
                </Button>
              </div>
            </div>

            <div className="bg-[#f8fbff] p-4 sm:p-6 lg:p-8">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                    <BookOpenCheck size={15} /> 系统使用流程
                  </div>
                  <h3 className="text-xl font-extrabold text-[#061226]">先建档，再排课，最后核对</h3>
                  <p className="mt-2 max-w-[720px] text-sm font-semibold leading-6 text-[#64748b]">
                    把系统理解成一条流水线：前面资料越完整，后面课时记录、补课处理、工资核对和教学复盘就越自动。
                  </p>
                </div>
                <Badge variant="sky" className="w-fit">点击节点可进入页面</Badge>
              </div>

              <div className="rounded-[18px] border border-[#dbe4ef] bg-white p-4 shadow-sm">
                <div className="space-y-2">
                  {steps.map((step, index) => {
                    const Icon = step.icon;
                    return (
                      <div key={step.title}>
                        <button
                          type="button"
                          onClick={() => onOpenStep(step.key, step.view, step.studentsPanel)}
                          className={`group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-[14px] border p-3 text-left transition-colors ${
                            step.done
                              ? "border-[#bbf7d0] bg-[#f0fdf4] hover:border-[#86efac]"
                              : "border-[#dbe4ef] bg-[#f8fbff] hover:border-[#93c5fd] hover:bg-[#eef5ff]"
                          }`}
                          aria-label={`进入第 ${index + 1} 步：${step.title}`}
                        >
                          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] ${step.done ? "bg-white text-[#15803d]" : "bg-white text-[#1557c2]"}`}>
                            <Icon size={18} />
                          </span>
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-extrabold text-[#64748b]">{String(index + 1).padStart(2, "0")}</span>
                              <span className="text-sm font-extrabold text-[#061226]">{step.title}</span>
                              <Badge variant={step.done ? "sage" : "secondary"} className="px-1.5 py-0 text-[10px]">
                                {step.dataDone ? "已准备" : step.visited ? "已查看" : "建议完成"}
                              </Badge>
                            </span>
                            <span className="mt-1 block text-xs font-semibold leading-5 text-[#475569]">{step.description}</span>
                            <span className="mt-1 block text-[11px] font-semibold leading-5 text-[#94a3b8]">{step.detail}</span>
                          </span>
                          <span className="mt-1 rounded-full border border-[#dbe4ef] bg-white px-2 py-1 text-[11px] font-bold text-[#1557c2] transition-colors group-hover:border-[#93c5fd] group-hover:bg-[#eff6ff]">
                            进入
                          </span>
                        </button>
                        {index < steps.length - 1 && (
                          <div className="ml-5 flex h-7 items-center gap-3 text-[11px] font-bold text-[#94a3b8]">
                            <span className="h-full w-px bg-[#dbe4ef]" />
                            <ArrowDown size={13} />
                            <span>{index === 1 ? "课程建好后进入日常记录" : index === 2 ? "课时确认后进入月底核对" : "继续下一步"}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <GuideNote
          icon={ShieldCheck}
          title="数据安全"
          description="课程、学生、工资和成绩数据会先在浏览器中加密，再同步到云端。密码要自己保存，丢失后无法解密。"
        />
        <GuideNote
          icon={CalendarDays}
          title="日常使用"
          description="上课前看今日提醒；上课后更新到课状态、课程内容和作业；有请假时标记待补课。"
        />
        <GuideNote
          icon={WalletCards}
          title="月底核对"
          description="先核课程状态，再核校区收入、义务课时、补贴扣款，最后看数据统计页的总收入。"
        />
      </div>
    </div>
  );
}

function GuideNote({
  icon: Icon,
  title,
  description
}: {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#eaf2ff] text-[#1557c2]">
          <Icon size={20} />
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription className="leading-6">{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
