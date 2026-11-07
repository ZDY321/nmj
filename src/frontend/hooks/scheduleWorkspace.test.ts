// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Lesson, TeacherVault } from "@/shared/types";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { createLessonFromCourse } from "@/frontend/lib/helpers";
import { isOrderedTimeRange } from "@/frontend/lib/scheduleViewHelpers";
import { useScheduleAttendance } from "./useScheduleAttendance";
import { useScheduleChecklist } from "./useScheduleChecklist";
import { useScheduleNavigation } from "./useScheduleNavigation";
import { useScheduleSubstitute } from "./useScheduleSubstitute";
let container: HTMLDivElement;
let root: Root;
let vault: TeacherVault;
let selected: Lesson;
let previous: Lesson;
let calendarDate: string;
let attendance: ReturnType<typeof useScheduleAttendance>;
let checklist: ReturnType<typeof useScheduleChecklist>;
let navigation: ReturnType<typeof useScheduleNavigation>;
let substitute: ReturnType<typeof useScheduleSubstitute>;
const confirm = vi.fn<Parameters<typeof useScheduleAttendance>[0]["confirm"]>();
const onUpdateLesson = vi.fn<(lesson: Lesson) => void>();
const onUpdateLessons = vi.fn();
const onAddLesson = vi.fn();
const onAddLessonAndUpdateLesson = vi.fn<(added: Lesson, original: Lesson) => void>();
const onSaveChecklistCompletions = vi.fn();
const onUpdateChecklistCompletions = vi.fn();
const openLessonInRecords = vi.fn();
const setSelectedCalendarDate = vi.fn();
const setCalendarMonth = vi.fn();
const showScheduleError = vi.fn();
const showScheduleNotice = vi.fn();
const findTimeConflict = vi.fn<Parameters<typeof useScheduleAttendance>[0]["findTimeConflict"]>();
const noop = () => {};
function Harness() {
  const common = { vault, selectedCalendarDate: calendarDate, weekStartPreference: 1 as const, confirm, findTimeConflict, validateTimeRange: isOrderedTimeRange, showScheduleError, showScheduleNotice, setSelectedCalendarDate, setCalendarMonth };
  attendance = useScheduleAttendance({ ...common, selected, selectedId: selected.id, studentOptions: vault.students, onUpdateLesson, onUpdateLessons, onAddLessonAndUpdateLesson, openLessonInRecords });
  checklist = useScheduleChecklist({ vault, selected, selectedPreviousLesson: previous, onSaveChecklistCompletions, onUpdateChecklistCompletions });
  navigation = useScheduleNavigation({ vault, calendarFocus: { date: "2026-11-09", nonce: 1, targetPanel: "calendar" }, weekStartPreference: 1, onReturnToView: noop, setCalendarCourseGroupId: noop, setSingleCourseGroupId: noop, setCalendarStartTime: noop, setSingleStartTime: noop, setCalendarEndTime: noop, setSingleEndTime: noop, setSingleDate: noop });
  substitute = useScheduleSubstitute({ ...common, onAddLesson, setSelectedId: noop, setLessonDay: noop, setScheduleError: noop });
  return null;
}
function render() { act(() => root.render(createElement(StrictMode, null, createElement(Harness)))); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks(); vault = createEmptyVault(); calendarDate = "2026-11-09";
  vault.students = [{ id: "a", name: "在读", status: "active" }, { id: "b", name: "已停", status: "paused" }, { id: "trial", name: "试听", status: "active", temporaryTrial: true }];
  vault.courseGroups = [{ id: "course", name: "课程", subject: "语文", type: "small_class", status: "active", studentIds: ["a"], defaultCampusId: "east", feeRule: { mode: "fixed", fixedFee: 120 } }];
  previous = createLessonFromCourse(vault, vault.courseGroups[0], { date: "2026-11-02", startTime: "10:00", endTime: "12:00", status: "completed" });
  previous.content = { ...previous.content, checklistTemplateId: "template", homeworkChecklistItemIds: ["item", "item", "missing"] };
  selected = createLessonFromCourse(vault, vault.courseGroups[0], { date: calendarDate, startTime: "10:00", endTime: "12:00", status: "completed" });
  vault.lessons = [previous, selected];
  vault.progressChecklistTemplates = [{ id: "template", name: "单元一", items: [{ id: "item", title: "作业", order: 0 }], createdAt: "", updatedAt: "" }];
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); render();
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("single-student attendance updates status and preserves unrelated history and notes", () => {
  selected = { ...selected, attendance: [{ studentId: "a", status: "attended", note: "保留", makeupExempt: true }] }; render(); const before = structuredClone(vault);
  act(() => attendance.updateAttendance("a", "absent"));
  expect(onUpdateLesson.mock.lastCall![0]).toMatchObject({ status: "makeup_pending", attendance: [{ studentId: "a", status: "absent", note: "保留" }] }); expect(vault).toEqual(before);
});
it("adds only active temporary students, retaining trial metadata and clearing the draft after save", () => {
  act(() => attendance.setTemporaryStudentId("b")); act(() => attendance.addTemporaryStudent()); expect(onUpdateLesson).not.toHaveBeenCalled();
  act(() => attendance.setTemporaryStudentId("trial")); act(() => attendance.addTemporaryStudent());
  expect(onUpdateLesson.mock.lastCall![0].attendance.at(-1)).toMatchObject({ studentId: "trial", temporary: true, trial: true, note: "试听加入" }); expect(attendance.temporaryStudentId).toBe("");
});
it("makeup conflicts wait for confirmation and retain the original selected date in that confirmation", () => {
  selected = { ...selected, attendance: [{ studentId: "a", status: "makeup_pending" }] }; render(); findTimeConflict.mockReturnValue(previous);
  act(() => attendance.createSelectedMakeupLesson(["a"])); expect(onAddLessonAndUpdateLesson).not.toHaveBeenCalled();
  act(() => attendance.setMakeupDate("2026-12-01")); act(() => confirm.mock.lastCall![0].onConfirm());
  const [added, original] = onAddLessonAndUpdateLesson.mock.lastCall!;
  expect(added).toMatchObject({ date: "2026-11-09", linkedOriginalLessonId: selected.id, expectedStudentIds: ["a"], status: "scheduled" });
  expect(original.attendance[0].status).toBe("makeup_pending"); expect(openLessonInRecords).toHaveBeenCalledWith(added);
});
it("clears selection-dependent attendance controls and follows a new calendar date", () => {
  act(() => { attendance.setAttendancePanelOpen(true); attendance.setMakeupArrangementOpen(true); });
  selected = previous; calendarDate = "2026-11-23"; render();
  expect(attendance.attendancePanelOpen).toBe(false); expect(attendance.makeupArrangementOpen).toBe(false); expect(attendance.makeupDate).toBe("2026-11-23");
});
it("checklist sync ignores missing and duplicate items, writes previous-lesson homework and preserves taught completions", () => {
  vault.progressChecklistCompletions = [{ id: "taught", templateId: "template", itemId: "item", studentId: "a", courseGroupId: "course", source: "taught", lessonId: previous.id, completedDate: "2026-11-02", updatedAt: "" }]; render();
  expect(checklist.selectedChecklistSyncSummary?.homeworkPendingCount).toBe(1); act(() => checklist.syncSelectedLessonChecklist());
  expect(onSaveChecklistCompletions.mock.lastCall![0]).toHaveLength(1); expect(onSaveChecklistCompletions.mock.lastCall![0][0]).toMatchObject({ source: "homework", lessonId: previous.id, completedDate: selected.date, studentId: "a", itemId: "item" });
  expect(vault.progressChecklistCompletions).toHaveLength(1);
});
it("undoing homework completion deletes only the matching source and resets messages on lesson change", () => {
  const common = { templateId: "template", itemId: "item", studentId: "a", courseGroupId: "course", lessonId: previous.id, completedDate: "2026-11-02", updatedAt: "" };
  vault.progressChecklistCompletions = [{ ...common, id: "taught", source: "taught" }, { ...common, id: "homework", source: "homework" }]; render();
  act(() => checklist.toggleSelectedLessonChecklistCompletion("a", "item", false)); expect(onUpdateChecklistCompletions).toHaveBeenCalledWith([], ["homework"]);
  selected = previous; render(); expect(checklist.checklistSyncMessage).toBe(""); expect(checklist.checklistSyncResult).toEqual([]);
});
it("record navigation retains calendar return state and supports lesson history", () => {
  act(() => { navigation.setCalendarMonth("2026-12"); navigation.setCalendarDetailDate("2026-11-09"); });
  act(() => navigation.openLessonInRecords(selected)); expect(navigation.schedulePanel).toBe("records");
  act(() => navigation.openLessonInRecords(previous)); act(() => navigation.goBackToPreviousLesson()); expect(navigation.selected.id).toBe(selected.id);
  act(() => navigation.goBackToLessonSource()); expect(navigation).toMatchObject({ schedulePanel: "calendar", calendarMonth: "2026-12", calendarDetailDate: "2026-11-09" });
});
it("opening a date clears record filters and substitute navigation selects its existing management tab", () => {
  act(() => { navigation.setCampusFilter("missing"); navigation.setShowOnlyMakeup(true); }); act(() => navigation.openDateInRecords("2026-11-09"));
  expect(navigation).toMatchObject({ campusFilter: "all", showOnlyMakeup: false, selectedId: selected.id, effectiveLessonScope: "day" });
  act(() => navigation.switchSchedulePanel("substitute")); expect(navigation).toMatchObject({ schedulePanel: "makeup", makeupManagementTab: "substitute" });
});
it("substitute records require a positive headcount and clear only the saved record fields", () => {
  act(() => substitute.addSubstituteClassRecord()); expect(onAddLesson).not.toHaveBeenCalled(); expect(showScheduleError).toHaveBeenCalledWith("请填写代班补课到课人数。");
  act(() => { substitute.setSubstitutePresentStudentCount("4"); substitute.setSubstituteTitle("代课"); substitute.setSubstituteSubject("数学"); substitute.setSubstituteBillingHours("1.5"); }); act(() => substitute.addSubstituteClassRecord());
  expect(onAddLesson.mock.lastCall![0]).toMatchObject({ lessonSource: "substitute_class", date: "2026-11-09", substituteClass: { presentStudentCount: 4, subject: "数学", title: "代课" }, feeSnapshot: { hours: 1.5, manualHours: true } });
  expect(substitute).toMatchObject({ substituteTitle: "", substitutePresentStudentCount: "", substituteSubject: "数学", substituteBillingHours: "1.5" });
});
