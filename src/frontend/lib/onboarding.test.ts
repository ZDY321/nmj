import { describe, expect, it } from "vitest";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { getOnboardingStepStates, getOnboardingTourStartIndex, onboardingTourSteps } from "@/frontend/lib/onboarding";

describe("onboarding progress", () => {
  it("resumes the exact saved step even within a chapter", () => {
    expect(onboardingTourSteps[getOnboardingTourStartIndex("salary-rules")].id).toBe("salary-rules");
    expect(onboardingTourSteps[getOnboardingTourStartIndex("records")].id).toBe("records");
    expect(onboardingTourSteps[getOnboardingTourStartIndex("payroll")].id).toBe("payroll");
    expect(onboardingTourSteps[getOnboardingTourStartIndex("calendar-records")].id).toBe("calendar-records");
  });

  it("carries existing chapter progress into the new tour", () => {
    const index = getOnboardingTourStartIndex(null, ["profile", "student_course"]);
    expect(onboardingTourSteps[index].id).toBe("calendar");
  });

  it("handles obsolete saved steps and permits replay after completion", () => {
    expect(getOnboardingTourStartIndex("removed-step")).toBe(0);
    expect(getOnboardingTourStartIndex(null, ["profile", "student_course", "schedule", "payroll", "grades"])).toBe(0);
  });

  it("does not treat entering a tour as creating actual setup data", () => {
    const states = getOnboardingStepStates(createEmptyVault(), ["profile"]);
    expect(states[0]).toMatchObject({ visited: true, done: true, dataDone: false });
    expect(states.slice(1).every((step) => !step.done)).toBe(true);
  });
});
