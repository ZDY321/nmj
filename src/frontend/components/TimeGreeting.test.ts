// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeGreeting } from "./TimeGreeting";
import { useAppDate } from "@/frontend/hooks/useAppDate";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("TimeGreeting", () => {
  it.each([
    ["04:59", "晚上好", "早上好"],
    ["10:59", "早上好", "中午好"],
    ["13:59", "中午好", "下午好"],
    ["17:59", "下午好", "晚上好"]
  ])("preserves the Shanghai time boundary at %s", (time, before, after) => {
    vi.setSystemTime(new Date("2026-11-06T" + time + ":00+08:00"));
    act(() => root.render(createElement(TimeGreeting)));
    expect(container.textContent).toBe(before);
    act(() => vi.advanceTimersByTime(60_000));
    expect(container.textContent).toBe(after);
  });

  it("isolates minute updates while still refreshing the workspace across midnight", () => {
    vi.setSystemTime(new Date("2026-11-06T23:58:00+08:00"));
    let workspaceRenders = 0;
    let businessRenders = 0;
    function BusinessView() {
      businessRenders += 1;
      return createElement("main", null, "课程工作台");
    }
    function Workspace() {
      workspaceRenders += 1;
      const date = useAppDate();
      return createElement("div", null, createElement(TimeGreeting), createElement("time", null, date), createElement(BusinessView));
    }
    act(() => root.render(createElement(Workspace)));
    const before = { workspaceRenders, businessRenders };
    act(() => vi.advanceTimersByTime(60_000));
    expect({ workspaceRenders, businessRenders }).toEqual(before);
    expect(container.querySelector("time")?.textContent).toBe("2026-11-06");
    act(() => vi.advanceTimersByTime(60_000));
    expect(container.querySelector("time")?.textContent).toBe("2026-11-07");
    expect(businessRenders).toBe(before.businessRenders + 1);
  });

  it("cleans up both clocks when the workspace unmounts", () => {
    function Workspace() {
      useAppDate();
      return createElement(TimeGreeting);
    }
    act(() => root.render(createElement(Workspace)));
    expect(vi.getTimerCount()).toBe(2);
    act(() => root.render(null));
    expect(vi.getTimerCount()).toBe(0);
  });
});
