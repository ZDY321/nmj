// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Lesson, TeacherVault } from "@/shared/types";
import type { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import type { SchedulePanel } from "@/frontend/lib/scheduleViewTypes";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { useScheduleReuse } from "./useScheduleReuse";
let container: HTMLDivElement;
let root: Root;
let vault: TeacherVault;
let selectedCalendarDate: string;
let schedulePanel: SchedulePanel;
let reuse: ReturnType<typeof useScheduleReuse>;
const confirm = vi.fn<ReturnType<typeof useConfirmDialog>["confirm"]>();
const onAddLessons = vi.fn<(lessons: Lesson[], options?: { replaceLessonIds?: string[] }) => void>();
const setSelectedCalendarDate = vi.fn<(date: string) => void>();
const setCalendarMonth = vi.fn<(month: string) => void>();
const setScheduleError = vi.fn<(message: string) => void>();
const showScheduleError = vi.fn<(message: string) => void>();
const showScheduleNotice = vi.fn<(message: string) => void>();
function Harness() {
  reuse = useScheduleReuse({ vault, initialFocusedDate: "2026-11-07", selectedCalendarDate, weekStartPreference: 1, schedulePanel, confirm, onAddLessons, setSelectedCalendarDate, setCalendarMonth, setScheduleError, showScheduleError, showScheduleNotice });
  return null;
}
function render() { act(() => root.render(createElement(StrictMode, null, createElement(Harness)))); }
function lesson(id: string, patch: Partial<Lesson> = {}): Lesson {
  return { id, date: "2026-10-31", startTime: "10:00", endTime: "12:00", courseGroupId: "course", type: "small_class", status: "cancelled", expectedStudentIds: ["old"], attendance: [], feeSnapshot: { amount: 999, hours: 2 }, content: { taught: "原内容", homework: "原作业", nextLessonReminder: "" }, ...patch };
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks();
  vault = createEmptyVault();
  vault.students = [{ id: "a", name: "学生", status: "active" }];
  vault.courseGroups = [{ id: "course", name: "课程", subject: "语文", type: "small_class", status: "active", defaultCampusId: "east", studentIds: ["a"], feeRule: { mode: "fixed", fixedFee: 120 } }];
  vault.lessons = [lesson("source")]; selectedCalendarDate = "2026-11-07"; schedulePanel = "calendar";
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); render();
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("initializes previous-week dates and eligible selection, then follows calendar date changes", () => {
  expect(reuse).toMatchObject({ syncSourceDate: "2026-10-31", syncTargetDate: "2026-11-07", syncRangeSourceStart: "2026-10-26", syncRangeSourceEnd: "2026-11-01", syncRangeTargetStart: "2026-11-02", syncRangeTargetEnd: "2026-11-08", selectedSyncLessonIds: ["source"] });
  act(() => reuse.setAllSyncLessons(false)); render(); expect(reuse.selectedSyncLessonIds).toEqual([]);
  selectedCalendarDate = "2026-11-08"; render();
  expect(reuse.syncSourceDate).toBe("2026-11-01"); expect(reuse.syncTargetDate).toBe("2026-11-08");
});
it("preserves surviving selections and excludes paused or empty courses", () => {
  vault = { ...vault, lessons: [...vault.lessons, lesson("second"), lesson("missing", { courseGroupId: "missing" })] }; render();
  expect(reuse.selectedSyncLessonIds).toEqual(["source"]);
  act(() => reuse.setAllSyncLessons(true)); expect(reuse.selectedSyncLessonIds).toEqual(["source", "second"]);
  vault = { ...vault, courseGroups: vault.courseGroups.map(course => ({ ...course, status: "paused" as const })) }; render();
  expect(reuse.selectedSyncLessonIds).toEqual([]);
});
it("reuses cancelled lessons as scheduled using current roster and fees, retaining the source snapshot", () => {
  const before = structuredClone(vault);
  act(() => reuse.copySelectedLessonsToDate());
  const [lessons, options] = onAddLessons.mock.lastCall!;
  expect(lessons).toHaveLength(1);
  expect(lessons[0]).toMatchObject({ date: "2026-11-07", status: "scheduled", expectedStudentIds: ["a"], campusId: "east", feeSnapshot: { amount: 120 }, syncTargetStartDate: "2026-11-07" });
  expect(lessons[0].id).not.toBe("source"); expect(options).toEqual({ replaceLessonIds: [] });
  expect(setSelectedCalendarDate).toHaveBeenCalledWith("2026-11-07"); expect(setCalendarMonth).toHaveBeenCalledWith("2026-11");
  expect(showScheduleNotice).toHaveBeenCalledWith("已复用 1 节课程。"); expect(vault).toEqual(before);
});
it("waits for confirmation before replacing a same-course lesson and captures the original target", () => {
  vault = { ...vault, lessons: [...vault.lessons, lesson("target", { date: "2026-11-07", status: "scheduled" })] }; render();
  act(() => reuse.copySelectedLessonsToDate());
  expect(onAddLessons).not.toHaveBeenCalled(); expect(confirm.mock.lastCall![0].title).toBe("目标日期已有同课程课节");
  act(() => reuse.setSyncTargetDate("2026-11-09"));
  act(() => confirm.mock.lastCall![0].onConfirm());
  expect(onAddLessons.mock.lastCall![0][0].date).toBe("2026-11-07");
  expect(onAddLessons.mock.lastCall![1]).toEqual({ replaceLessonIds: ["target"] });
});
it("skips another course occupying the target time without asking to overwrite", () => {
  vault = { ...vault, lessons: [...vault.lessons, lesson("other", { courseGroupId: "other", date: "2026-11-07", status: "scheduled" })] }; render();
  act(() => reuse.copySelectedLessonsToDate());
  expect(onAddLessons).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
  expect(showScheduleError).toHaveBeenCalledWith("目标时间已有其他课程，已跳过复用，未覆盖原有手动排课。");
});
it("validates missing, identical and empty single-day input", () => {
  act(() => reuse.setSyncTargetDate("")); act(() => reuse.copySelectedLessonsToDate());
  expect(showScheduleError).toHaveBeenLastCalledWith("请选择要复用的来源日期和目标日期。");
  act(() => reuse.setSyncTargetDate("2026-10-31")); act(() => reuse.copySelectedLessonsToDate());
  expect(showScheduleError).toHaveBeenLastCalledWith("来源日期和目标日期不能相同。");
  act(() => { reuse.setSyncTargetDate("2026-11-07"); reuse.setAllSyncLessons(false); }); act(() => reuse.copySelectedLessonsToDate());
  expect(showScheduleError).toHaveBeenLastCalledWith("请至少勾选一节要复用的课程。"); expect(onAddLessons).not.toHaveBeenCalled();
});
it("validates range lengths and copies all eligible source days independently of single-day selection", () => {
  act(() => { reuse.setAllSyncLessons(false); reuse.setSyncRangeSourceStart("2026-10-31"); reuse.setSyncRangeSourceEnd("2026-11-01"); reuse.setSyncRangeTargetStart("2026-11-07"); reuse.setSyncRangeTargetEnd("2026-11-07"); });
  act(() => reuse.copyLessonRangeToDateRange());
  expect(showScheduleError).toHaveBeenLastCalledWith("来源日期段有 2 天，目标日期段有 1 天，请保持天数一致。");
  act(() => reuse.setSyncRangeTargetEnd("2026-11-08")); act(() => reuse.copyLessonRangeToDateRange());
  expect(onAddLessons.mock.lastCall![0]).toHaveLength(1); expect(onAddLessons.mock.lastCall![0][0].date).toBe("2026-11-07");
});
it("does not navigate or clear errors if persistence throws", () => {
  onAddLessons.mockImplementation(() => { throw new Error("save failed"); });
  expect(() => act(() => reuse.copySelectedLessonsToDate())).toThrow("save failed");
  expect(setSelectedCalendarDate).not.toHaveBeenCalled(); expect(setScheduleError).not.toHaveBeenCalled(); expect(showScheduleNotice).not.toHaveBeenCalled();
  expect(reuse.selectedSyncLessonIds).toEqual(["source"]);
});
it("does not move the calendar when applying from the planning panel", () => {
  schedulePanel = "schedule"; render(); act(() => reuse.copySelectedLessonsToDate());
  expect(onAddLessons).toHaveBeenCalledOnce(); expect(setSelectedCalendarDate).not.toHaveBeenCalled(); expect(setCalendarMonth).not.toHaveBeenCalled();
});
