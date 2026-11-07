// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TeacherVault } from "@/shared/types";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { createLessonFromCourse } from "@/frontend/lib/helpers";
import { isOrderedDateRange, isOrderedTimeRange } from "@/frontend/lib/scheduleViewHelpers";
import { useScheduleBatchPlanning } from "./useScheduleBatchPlanning";
type Options = Parameters<typeof useScheduleBatchPlanning>[0];
let container: HTMLDivElement;
let root: Root;
let vault: TeacherVault;
let planning: ReturnType<typeof useScheduleBatchPlanning>;
const confirm = vi.fn<Options["confirm"]>();
const onAddLessons = vi.fn<Options["onAddLessons"]>();
const onGenerateDrafts = vi.fn<Options["onGenerateDrafts"]>();
const showScheduleError = vi.fn();
const showScheduleNotice = vi.fn();
function Harness() {
  planning = useScheduleBatchPlanning({ vault, courseSelectionOptions: vault.courseGroups.filter(course => course.status === "active"), confirm, onAddLessons, onGenerateDrafts, showScheduleError, showScheduleNotice, validateTimeRange: isOrderedTimeRange, validateDateRange: isOrderedDateRange, suggestedBillingHoursForDraft: () => 2 });
  return null;
}
function render() { act(() => root.render(createElement(StrictMode, null, createElement(Harness)))); }
function selectMonday() { act(() => { planning.setRangeStart("2026-11-09"); planning.setRangeEnd("2026-11-16"); planning.onToggleWeekday(1); }); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks();
  vault = createEmptyVault();
  vault.students = [{ id: "student", name: "学生", status: "active" }];
  vault.courseGroups = [{ id: "course", name: "课程", subject: "语文", status: "active", type: "small_class", defaultCampusId: "east", studentIds: ["student"], feeRule: { mode: "fixed", fixedFee: 120 } }];
  onGenerateDrafts.mockReturnValue({ candidateCount: 2, createdCount: 2, existingCount: 0, conflictCount: 0 });
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); render();
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("derives target dates and repeat weeks while allowing a manual end-date override", () => {
  selectMonday(); act(() => planning.setBatchLessonTargetCount("3")); expect(planning.rangeEnd).toBe("2026-11-23");
  act(() => planning.setRangeEnd("2026-11-30")); expect(planning.batchLessonTargetCount).toBe("");
  act(() => { planning.setBatchRepeatMode("weeks"); planning.setBatchRepeatWeeks("2"); });
  expect(planning.batchEffectiveRangeEnd).toBe("2026-11-22"); expect(planning.rangeEnd).toBe("2026-11-30");
  act(() => planning.setBatchRepeatWeeks("0")); act(() => planning.onBatchGenerate());
  expect(showScheduleError).toHaveBeenLastCalledWith("重复周数至少为 1。"); expect(onGenerateDrafts).not.toHaveBeenCalled();
});
it("retains the automatic two-hour end and normalized manual billing for ordinary batches", () => {
  selectMonday(); act(() => planning.setRuleStartTime("23:00")); expect(planning.ruleEndTime).toBe("23:59");
  act(() => planning.setRuleStartTime("invalid")); expect(planning.ruleEndTime).toBe("23:59");
  act(() => { planning.setRuleStartTime("10:00"); planning.setRuleBillingHours(" -2 "); }); act(() => planning.onBatchGenerate());
  expect(confirm).not.toHaveBeenCalled(); expect(onGenerateDrafts).toHaveBeenCalledWith("2026-11-09", "2026-11-16", [1], "course", "10:00", "12:00", 0);
  expect(showScheduleNotice).toHaveBeenLastCalledWith("已生成 2 节待上课。");
});
it("merges matching weekly slots and restores their exact draft values", () => {
  selectMonday(); act(() => planning.setRuleBillingHours(" 1.5 ")); act(() => planning.onAddWeeklyPatternSlot());
  act(() => { planning.onToggleWeekday(1); planning.onToggleWeekday(3); }); act(() => planning.onAddWeeklyPatternSlot());
  expect(planning.weeklyPatternSlots).toHaveLength(1); expect(planning.weeklyPatternSlots[0]).toMatchObject({ weekdays: [1, 3], billingHours: "1.5" });
  act(() => { planning.setRuleStartTime("08:00"); planning.setRuleBillingHours(""); });
  act(() => planning.onApplyWeeklyPatternSlot(planning.weeklyPatternSlots[0]));
  expect(planning).toMatchObject({ selectedWeekdays: [1, 3], ruleStartTime: "19:00", ruleEndTime: "21:00", ruleBillingHours: "1.5" });
  act(() => planning.onDeleteWeeklyPatternSlot(planning.weeklyPatternSlots[0].id)); expect(planning.weeklyPatternSlots).toEqual([]);
});
it("seeds per-day groups and restores only the first group's time when leaving the mode", () => {
  selectMonday(); act(() => planning.onSetBatchPerDayMode(true));
  const group = planning.batchTimeGroups[0]; expect(group).toMatchObject({ weekdays: [1], startTime: "19:00", endTime: "21:00" });
  act(() => { planning.onUpdateBatchTimeGroup(group.id, { startTime: "08:00", endTime: "09:00", billingHours: "1", weekdays: [3] }); planning.onToggleWeekday(5); });
  act(() => planning.onSetBatchPerDayMode(false));
  expect(planning).toMatchObject({ ruleStartTime: "08:00", ruleEndTime: "09:00", ruleBillingHours: "1", selectedWeekdays: [1, 5] });
  act(() => planning.onSetBatchPerDayMode(true)); expect(planning.batchTimeGroups).toHaveLength(1); expect(planning.batchTimeGroups[0].weekdays).toEqual([1, 5]);
});
it("requires confirmation for per-day generation and rejects unassigned weekdays", () => {
  selectMonday(); act(() => planning.onSetBatchPerDayMode(true)); act(() => planning.onToggleWeekday(3));
  act(() => planning.onBatchGenerate()); expect(onAddLessons).not.toHaveBeenCalled();
  act(() => confirm.mock.lastCall![0].onConfirm()); expect(showScheduleError.mock.lastCall![0]).toContain("尚未分配");
  act(() => planning.onToggleBatchTimeGroupWeekday(planning.batchTimeGroups[0].id, 3)); act(() => planning.onBatchGenerate()); act(() => confirm.mock.lastCall![0].onConfirm());
  expect(onAddLessons.mock.lastCall![0]).toHaveLength(3); expect(onAddLessons.mock.lastCall![0][0]).toMatchObject({ status: "scheduled", campusId: "east", expectedStudentIds: ["student"], feeSnapshot: { amount: 120 } });
});
it("weekly generation skips existing and overlapping candidates without changing original history", () => {
  selectMonday(); act(() => planning.onAddWeeklyPatternSlot());
  act(() => { planning.setRuleStartTime("20:00"); }); act(() => planning.onAddWeeklyPatternSlot());
  const existing = createLessonFromCourse(vault, vault.courseGroups[0], { date: "2026-11-09", startTime: "19:00", endTime: "21:00", status: "scheduled" });
  vault = { ...vault, lessons: [existing] }; render(); const before = structuredClone(vault);
  expect(planning.weeklyPatternExistingCount).toBe(1); expect(planning.weeklyPatternConflictCount).toBe(2);
  act(() => planning.onGenerateWeeklyPattern()); expect(onAddLessons).not.toHaveBeenCalled();
  act(() => planning.setRangeEnd("2026-12-31")); act(() => confirm.mock.lastCall![0].onConfirm());
  expect(onAddLessons.mock.lastCall![0]).toHaveLength(1); expect(onAddLessons.mock.lastCall![0][0]).toMatchObject({ date: "2026-11-16", startTime: "19:00" }); expect(vault).toEqual(before);
});
it("falls back to an active course without discarding weekly templates and rejects unavailable slots", () => {
  selectMonday(); act(() => planning.onAddWeeklyPatternSlot());
  vault = { ...vault, courseGroups: [{ ...vault.courseGroups[0], status: "paused" }, { ...vault.courseGroups[0], id: "new" }] }; render();
  expect(planning.ruleCourseGroupId).toBe("new"); expect(planning.weeklyPatternSlots).toHaveLength(1); expect(planning.weeklyPatternInvalidSlotCount).toBe(1);
  act(() => planning.onGenerateWeeklyPattern()); expect(showScheduleError.mock.lastCall![0]).toContain("已暂停"); expect(onAddLessons).not.toHaveBeenCalled();
});
it("does not claim success or clear drafts if the persistence callback throws", () => {
  selectMonday(); act(() => planning.onAddWeeklyPatternSlot()); showScheduleNotice.mockClear(); onAddLessons.mockImplementation(() => { throw new Error("save failed"); });
  expect(() => act(() => planning.onGenerateWeeklyPattern())).toThrow("save failed");
  expect(showScheduleNotice).not.toHaveBeenCalled(); expect(planning.weeklyPatternSlots).toHaveLength(1);
});
