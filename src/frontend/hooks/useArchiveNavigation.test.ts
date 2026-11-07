// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useArchiveNavigation, type ArchivePanel } from "./useArchiveNavigation";

let root: Root;
let container: HTMLDivElement;
let focusRequest: { panel: ArchivePanel; nonce: number } | null;
let navigation: ReturnType<typeof useArchiveNavigation>;
function Harness() { navigation = useArchiveNavigation(focusRequest); return null; }
function render() { act(() => root.render(createElement(StrictMode, null, createElement(Harness)))); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  focusRequest = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  render();
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("opens profile initially and preserves a manually selected panel across unrelated renders", () => {
  expect(navigation.archivePanel).toBe("profile");
  act(() => navigation.setArchivePanel("courses"));
  render();
  expect(navigation.archivePanel).toBe("courses");
});
it("applies a focus request only when its nonce changes", () => {
  focusRequest = { panel: "students", nonce: 1 };
  render();
  expect(navigation.archivePanel).toBe("students");
  focusRequest = { panel: "campuses", nonce: 1 };
  render();
  expect(navigation.archivePanel).toBe("students");
  focusRequest = { panel: "salaryRules", nonce: 2 };
  render();
  expect(navigation.archivePanel).toBe("salaryRules");
  focusRequest = null;
  render();
  expect(navigation.archivePanel).toBe("salaryRules");
});
it("highlights only the matching row and clears it after the original delay", () => {
  act(() => navigation.flashArchiveRow("students", "a"));
  expect(navigation.archiveRowClass("students", "a")).toContain("archive-row-flash");
  expect(navigation.archiveRowClass("courses", "a")).not.toContain("archive-row-flash");
  expect(navigation.archiveRowClass("students", "b")).not.toContain("archive-row-flash");
  act(() => vi.advanceTimersByTime(1799));
  expect(navigation.archiveRowClass("students", "a")).toContain("archive-row-flash");
  act(() => vi.advanceTimersByTime(1));
  expect(navigation.archiveRowClass("students", "a")).not.toContain("archive-row-flash");
});
it("does not let an earlier row timer clear a later row highlight", () => {
  act(() => navigation.flashArchiveRow("students", "a"));
  act(() => vi.advanceTimersByTime(900));
  act(() => navigation.flashArchiveRow("campuses", "b"));
  act(() => vi.advanceTimersByTime(900));
  expect(navigation.archiveRowClass("campuses", "b")).toContain("archive-row-flash");
  act(() => vi.advanceTimersByTime(900));
  expect(navigation.archiveRowClass("campuses", "b")).not.toContain("archive-row-flash");
});
