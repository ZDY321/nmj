import {
  CalendarDays,
  GraduationCap,
  ShieldCheck,
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
  title: string;
  description: string;
  detail: string;
  view: ViewKey;
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
  onOpenStep: (stepKey: OnboardingStepKey, view: ViewKey) => void;
  onDismiss: () => void;
}) {
  const stepStates = getOnboardingStepStates(vault, visitedSteps);
  const stepStateByKey = new Map(stepStates.map((step) => [step.key, step]));
  const stepContent: GuideStepContent[] = [
    {
      key: "profile",
      title: "建立校区和个人档案",
      description: "先录入常用校区、基本工资和义务课时规则。",
      detail: "这些信息会被后续课程、课时费、工资核对自动引用，建议先把校区和基本工资填好。",
      view: "students",
      button: "去档案信息"
    },
    {
      key: "student_course",
      title: "录入学生和课程",
      description: "给学生建档，再创建一对一、一对二、班课或试听课程，并设置计费方式。",
      detail: "课程会绑定学生、校区和收费规则；后面排课时只需要选择课程，金额会自动带出。",
      view: "students",
      button: "添加学生课程"
    },
    {
      key: "schedule",
      title: "生成课时记录",
      description: "用单节添加、日历点选或批量生成，把未来课程排到系统里。",
      detail: "上课后在课时记录里确认到课状态、补课、临时学生、课程内容和作业。",
      view: "schedule",
      button: "去排课"
    },
    {
      key: "payroll",
      title: "每天看提醒，月底核工资",
      description: "今日提醒负责当天跟进，工资核对和数据统计负责月底复盘。",
      detail: "月底先核对课程状态，再看校区小计、义务课时扣费、补贴扣款和最终收入。",
      view: "payroll",
      button: "看核对页"
    },
    {
      key: "grades",
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
              <h2 className="max-w-[640px] text-[28px] font-extrabold leading-tight sm:text-[36px]">
                先把基础资料搭起来，后面记录课时和核工资会轻很多
              </h2>
              <p className="mt-4 max-w-[620px] text-sm font-semibold leading-7 text-white/72 sm:text-base">
                这个页面只在空档案首次进入时显示。建议按顺序完成校区、学生、课程、排课、核对这几步；你也可以先跳过，系统不会自动写入示例数据。
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

            <div className="p-4 sm:p-6 lg:p-8">
              <div className="grid grid-cols-1 gap-3">
                {steps.map((step, index) => (
                  <div key={step.title} className="rounded-[16px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenStep(step.key, step.view)}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-extrabold text-[#1557c2] ring-1 ring-[#dbe4ef] transition-colors hover:bg-[#eaf2ff]"
                            aria-label={`进入第 ${index + 1} 步：${step.title}`}
                            title={step.button}
                          >
                            {index + 1}
                          </button>
                          <Badge variant={step.done ? "sage" : "secondary"}>
                            {step.dataDone ? "已准备" : step.visited ? "已查看" : "建议完成"}
                          </Badge>
                        </div>
                        <div className="text-base font-extrabold text-[#061226]">{step.title}</div>
                        <div className="mt-1 text-sm font-semibold leading-6 text-[#25324a]">{step.description}</div>
                        <div className="mt-2 text-xs font-semibold leading-5 text-[#64748b]">{step.detail}</div>
                      </div>
                      <Button
                        type="button"
                        variant={step.done ? "outline" : "secondary"}
                        size="sm"
                        className="shrink-0"
                        onClick={() => onOpenStep(step.key, step.view)}
                      >
                        {step.button}
                      </Button>
                    </div>
                  </div>
                ))}
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
