import type { TeacherVault } from "@/shared/types";
import type { ViewKey } from "@/frontend/lib/helpers";

export const onboardingStepKeys = ["profile", "student_course", "schedule", "payroll", "grades"] as const;

export type OnboardingStepKey = (typeof onboardingStepKeys)[number];

export type OnboardingTourStep = {
  id: string;
  group: OnboardingStepKey;
  groupLabel: string;
  title: string;
  description: string;
  hint: string;
  target: string;
  view: ViewKey;
  studentsPanel?: "profile" | "salaryRules" | "campuses" | "students" | "courses";
  schedulePanel?: "calendar" | "schedule" | "records";
};

export const onboardingTourSteps: readonly OnboardingTourStep[] = [
  {
    id: "campuses", group: "profile", groupLabel: "基础设置", view: "students", studentsPanel: "campuses",
    target: "campus-form", title: "先添加上课的校区",
    description: "点击这里展开，填写校区名称，再点「添加校区」。学生和课程都会用到它。",
    hint: "先添加一个常用校区就够了，地址和备注可以晚点补。"
  },
  {
    id: "profile", group: "profile", groupLabel: "基础设置", view: "students", studentsPanel: "profile",
    target: "teacher-profile", title: "设置你的个人信息",
    description: "填写姓名，选择所在校区，再按实际情况设置义务课时。",
    hint: "这里修改后会自动保存，可以先了解，稍后再填写。"
  },
  {
    id: "salary-rules", group: "profile", groupLabel: "基础设置", view: "students", studentsPanel: "salaryRules",
    target: "salary-rules", title: "确认课时费怎么算",
    description: "在这里查看和调整课时费等级。创建课程时选择对应等级，就能自动带出费用。",
    hint: "先核对自己常用的等级，其他规则以后再调整。"
  },
  {
    id: "students", group: "student_course", groupLabel: "学生与课程", view: "students", studentsPanel: "students",
    target: "student-form", title: "给学生建一份档案",
    description: "填写学生姓名，选择年级和校区，再点「添加学生」。学生较多时，也可以使用下方的批量添加。",
    hint: "先建学生档案，下一步才能把学生关联到课程。"
  },
  {
    id: "courses", group: "student_course", groupLabel: "学生与课程", view: "students", studentsPanel: "courses",
    target: "course-form", title: "把学生关联到课程",
    description: "选择班型、科目和校区，勾选上课学生，确认费用后保存课程档案。",
    hint: "课程档案建好后，排课时直接选这门课即可。"
  },
  {
    id: "calendar", group: "schedule", groupLabel: "排课与记录", view: "schedule", schedulePanel: "calendar",
    target: "schedule-calendar", title: "在日历里查看课表",
    description: "点击日期查看当天课程。切换到「排课」后，选好课程和时间，就能点选日期添加课时。",
    hint: "先用「查看」熟悉课表，再按需切换到「排课」。"
  },
  {
    id: "planning", group: "schedule", groupLabel: "排课与记录", view: "schedule", schedulePanel: "schedule",
    target: "lesson-planning", title: "添加一节上课时间",
    description: "选择已建好的课程，设置日期和时间，再点「添加待上课」。固定课表也可以用下方的批量生成。",
    hint: "没有可选课程时，先返回「学生与课程」完成建档。"
  },
  {
    id: "records", group: "schedule", groupLabel: "排课与记录", view: "schedule", schedulePanel: "records",
    target: "lesson-records", title: "上完课，记得更新状态",
    description: "在课程记录里选中课节，核实到课情况，再更新为「已完成」。请假或补课也在课节详情里处理。",
    hint: "已完成和补课完成的课节会用于计算实际课时费。"
  },
  {
    id: "calendar-records", group: "schedule", groupLabel: "排课与记录", view: "calendar",
    target: "calendar-overview-grid", title: "从日历快速找到课程",
    description: "这里是左侧的「日历总览」。点击一个日期，查看当天安排了哪些课程。",
    hint: "「排课与课时 → 日历查看」也支持：选日期，再点日期标题或课程进入记录。"
  },
  {
    id: "payroll", group: "payroll", groupLabel: "工资核对", view: "payroll",
    target: "payroll-filters", title: "月底在这里核对工资",
    description: "先选月份和校区，再向下查看课时费、义务课时扣费和课节明细。",
    hint: "金额有疑问时，先检查课程记录中的到课人数和完成状态。"
  },
  {
    id: "grades", group: "grades", groupLabel: "成绩记录", view: "progress",
    target: "grade-form", title: "有测验时，再记一笔成绩",
    description: "选择学生和科目，填写考试名称、得分和满分，再点「添加成绩」。下方可以查看成绩变化。",
    hint: "这一步可以按需使用，成绩记录不会影响工资。"
  }
];

export function getOnboardingTourStep(index: number, view: ViewKey, calendarDateSelected = false): OnboardingTourStep {
  const step = onboardingTourSteps[index];
  if (step.id !== "calendar-records") return step;
  if (view === "schedule") {
    return {
      ...step,
      target: "lesson-records",
      title: "已经打开对应的课程记录",
      description: "这里保留了你刚才选择的日期。点击课节，核对到课情况、上课状态和课程内容。",
      hint: "可点「返回日历总览」回去查看，或点「下一步」继续了解工资核对。"
    };
  }
  if (calendarDateSelected) {
    return {
      ...step,
      target: "calendar-overview-details",
      title: "点日期或课程，打开课时记录",
      description: "这里是所选日期的课程。点上方「查看当天课时」打开当天全部记录；也可以点某节课程查看详情。",
      hint: "进入记录后引导会继续，也可以点「返回日历总览」回到所选日期。"
    };
  }
  return step;
}

export function getOnboardingTourStartIndex(savedId: unknown, visitedSteps: OnboardingStepKey[] = []): number {
  const savedIndex = onboardingTourSteps.findIndex((step) => step.id === savedId);
  if (savedIndex >= 0) return savedIndex;
  const nextIndex = onboardingTourSteps.findIndex((step) => !visitedSteps.includes(step.group));
  return Math.max(0, nextIndex);
}

export type OnboardingStepState = {
  key: OnboardingStepKey;
  view: ViewKey;
  dataDone: boolean;
  visited: boolean;
  done: boolean;
};

export function getOnboardingStepStates(vault: TeacherVault, visitedSteps: OnboardingStepKey[] = []): OnboardingStepState[] {
  const visited = new Set(visitedSteps);
  const steps: Array<Omit<OnboardingStepState, "visited" | "done">> = [
    {
      key: "profile",
      view: "students",
      dataDone: vault.campuses.length > 0 || vault.profile.baseSalary > 0
    },
    {
      key: "student_course",
      view: "students",
      dataDone: vault.students.length > 0 && vault.courseGroups.length > 0
    },
    {
      key: "schedule",
      view: "schedule",
      dataDone: vault.lessons.length > 0
    },
    {
      key: "payroll",
      view: "payroll",
      dataDone: vault.lessons.some((lesson) => lesson.status === "completed" || lesson.status === "makeup_completed")
    },
    {
      key: "grades",
      view: "progress",
      dataDone: Boolean(vault.gradeRecords?.length)
    }
  ];

  return steps.map((step) => {
    const wasVisited = visited.has(step.key);
    return {
      ...step,
      visited: wasVisited,
      done: step.dataDone || wasVisited
    };
  });
}

export function isOnboardingSetupComplete(vault: TeacherVault, visitedSteps: OnboardingStepKey[] = []): boolean {
  return getOnboardingStepStates(vault, visitedSteps).every((step) => step.done);
}

export function normalizeOnboardingStepKeys(value: unknown): OnboardingStepKey[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is OnboardingStepKey =>
    typeof item === "string" && onboardingStepKeys.includes(item as OnboardingStepKey)
  );
}
