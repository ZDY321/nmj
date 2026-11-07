// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DeletedLesson, Lesson, TeacherVault } from "@/shared/types";
import type { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { useScheduleTrash } from "./useScheduleTrash";

let root: Root;
let container: HTMLDivElement;
let vault: TeacherVault;
let trash: ReturnType<typeof useScheduleTrash>;
const confirm = vi.fn<ReturnType<typeof useConfirmDialog>["confirm"]>();
const showScheduleError = vi.fn<(message: string) => void>();
const onRestoreDeletedLessons = vi.fn<(ids: string[]) => void>();
const onPermanentlyDeleteDeletedLessons = vi.fn<(ids: string[]) => void>();
function Harness() { trash = useScheduleTrash({ vault, confirm, showScheduleError, onRestoreDeletedLessons, onPermanentlyDeleteDeletedLessons }); return null; }
function render() { act(() => root.render(createElement(StrictMode, null, createElement(Harness)))); }
function confirmLast() { act(() => confirm.mock.lastCall![0].onConfirm()); }
function select(...ids: string[]) { act(() => ids.forEach(id => trash.onToggleSelection(id))); }
function deleted(id: string, patch: Partial<Lesson> = {}, source: DeletedLesson["source"] = "manual"): DeletedLesson {
  return { id: "trash_" + id, deletedAt: "2026-11-07T10:00:00Z", source, reason: id, lesson: { id, date: "2026-11-06", startTime: "10:00", endTime: "12:00", courseGroupId: "course", type: "small_class", status: "completed", expectedStudentIds: [], attendance: [], feeSnapshot: { amount: 123, hours: 2 }, content: { taught: "历史内容", homework: "作业", nextLessonReminder: "" }, ...patch } };
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  vault = createEmptyVault();
  vault.courseGroups = [{ id: "course", name: "原课程", subject: "数学", type: "small_class", status: "paused", studentIds: [], defaultCampusId: "east", feeRule: { mode: "fixed", fixedFee: 500 } }];
  vault.lessons = [deleted("active").lesson];
  vault.deletedLessons = [deleted("original"), deleted("makeup", { linkedOriginalLessonId: "original", status: "scheduled" }, "ai"), deleted("orphan", { courseGroupId: "missing" }), deleted("conflict", { id: "active" }), deleted("external", { courseGroupId: "external", lessonSource: "substitute_class", substituteClass: { presentStudentCount: 3 } }, "sync_overwrite")];
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); render();
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("combines date, source, campus fallback and case-insensitive multiword search without changing the vault", () => {
  const before = structuredClone(vault);
  act(() => { trash.setTrashDateStart("2026-11-06"); trash.setTrashDateEnd("2026-11-06"); trash.setTrashCampusFilter("east"); trash.setTrashSourceFilter("ai"); trash.setTrashSearch("  MAKEUP 数学  "); });
  expect(trash.trashLessons.map(item => item.id)).toEqual(["trash_makeup"]);
  act(() => trash.setTrashDateStart("2026-11-07"));
  expect(trash.trashLessons).toEqual([]);
  expect(vault).toEqual(before);
});
it("keeps hidden selections while selecting and deselecting only visible records", () => {
  select("trash_original");
  act(() => trash.setTrashSourceFilter("ai"));
  expect(trash.selectedVisibleTrashIds).toEqual([]);
  act(() => trash.onToggleAllVisible());
  expect([...trash.selectedTrashIdSet]).toEqual(["trash_original", "trash_makeup"]);
  expect(trash.allVisibleTrashSelected).toBe(true);
  act(() => trash.onToggleAllVisible());
  expect([...trash.selectedTrashIdSet]).toEqual(["trash_original"]);
  act(() => trash.setTrashSearch("no match"));
  act(() => trash.onToggleAllVisible());
  expect([...trash.selectedTrashIdSet]).toEqual(["trash_original"]);
});
it("counts a makeup as restorable only when its original is active or selected in the visible batch", () => {
  select("trash_makeup");
  expect(trash.selectedTrashRestoreCount).toBe(0);
  select("trash_original");
  expect(trash.selectedTrashRestoreCount).toBe(2);
  act(() => trash.setTrashSourceFilter("ai"));
  expect(trash.selectedTrashRestoreCount).toBe(0);
  vault = { ...vault, lessons: [...vault.lessons, vault.deletedLessons![0].lesson] };
  render();
  expect(trash.selectedTrashRestoreCount).toBe(1);
});
it("confirms restoration, skips missing courses and active id conflicts, and retains skipped selection", () => {
  act(() => trash.onToggleAllVisible());
  expect(trash.selectedTrashRestoreCount).toBe(3);
  act(() => trash.onRestore(["trash_makeup", "trash_original", "trash_orphan", "trash_conflict", "trash_external"]));
  expect(onRestoreDeletedLessons).not.toHaveBeenCalled();
  expect(confirm.mock.lastCall![0]).toMatchObject({ title: "恢复选中的 5 节课？", confirmLabel: "恢复" });
  confirmLast();
  expect(onRestoreDeletedLessons).toHaveBeenCalledExactlyOnceWith(["trash_makeup", "trash_original", "trash_external"]);
  expect([...trash.selectedTrashIdSet]).toEqual(["trash_orphan", "trash_conflict"]);
});
it("reports an entirely invalid restore without clearing selection or persisting", () => {
  select("trash_orphan");
  act(() => trash.onRestore(["trash_orphan", "missing"]));
  confirmLast();
  expect(showScheduleError).toHaveBeenCalledWith("选中的课节当前无法恢复，可能已有同 ID 课节或课程档案已不存在。");
  expect(onRestoreDeletedLessons).not.toHaveBeenCalled();
  expect(trash.selectedTrashIdSet.has("trash_orphan")).toBe(true);
});
it("does nothing for empty batches and preserves selection when restoration throws", () => {
  act(() => { trash.onRestore([]); trash.onPermanentDelete([]); });
  expect(confirm).not.toHaveBeenCalled();
  select("trash_original");
  onRestoreDeletedLessons.mockImplementation(() => { throw new Error("restore failed"); });
  act(() => trash.onRestore(["trash_original"]));
  expect(confirmLast).toThrow("restore failed");
  expect(trash.selectedTrashIdSet.has("trash_original")).toBe(true);
});
it("requires danger confirmation before permanent deletion and retains the selection on failure", () => {
  select("trash_original", "trash_external");
  act(() => trash.onPermanentDelete(["trash_original"]));
  expect(onPermanentlyDeleteDeletedLessons).not.toHaveBeenCalled();
  expect(confirm.mock.lastCall![0]).toMatchObject({ title: "彻底删除这条回收站记录？", tone: "danger" });
  onPermanentlyDeleteDeletedLessons.mockImplementationOnce(() => { throw new Error("delete failed"); });
  expect(confirmLast).toThrow("delete failed");
  expect(trash.selectedTrashIdSet.has("trash_original")).toBe(true);
  confirmLast();
  expect(onPermanentlyDeleteDeletedLessons).toHaveBeenLastCalledWith(["trash_original"]);
  expect([...trash.selectedTrashIdSet]).toEqual(["trash_external"]);
});
it("removes unavailable selections on a vault refresh while keeping filters and remaining ids", () => {
  select("trash_original", "trash_external");
  act(() => trash.setTrashSearch("original"));
  vault = { ...vault, deletedLessons: vault.deletedLessons!.filter(item => item.id !== "trash_original") };
  render();
  expect([...trash.selectedTrashIdSet]).toEqual(["trash_external"]);
  expect(trash.trashSearch).toBe("original");
  expect(trash.deletedLessonCount).toBe(4);
});
