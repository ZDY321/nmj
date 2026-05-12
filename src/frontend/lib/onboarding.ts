import type { TeacherVault } from "@/shared/types";
import type { ViewKey } from "@/frontend/lib/helpers";

export const onboardingStepKeys = ["profile", "student_course", "schedule", "payroll", "grades"] as const;

export type OnboardingStepKey = (typeof onboardingStepKeys)[number];

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
      view: "grades",
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
