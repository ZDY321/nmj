// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncCountdownBadge } from "./SyncCountdownBadge";

type BadgeProps = ComponentProps<typeof SyncCountdownBadge>;

let container: HTMLDivElement;
let root: Root;
let props: BadgeProps;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  props = {
    intervalSeconds: 300,
    enabled: true,
    hasRemoteVersion: false,
    syncState: "idle",
    saving: false,
    resetKey: 0
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function render(patch: Partial<BadgeProps> = {}) {
  props = { ...props, ...patch };
  act(() => root.render(createElement(SyncCountdownBadge, props)));
}

function advance(seconds: number) {
  act(() => vi.advanceTimersByTime(seconds * 1000));
}

describe("SyncCountdownBadge", () => {
  it("updates only the badge while its parent and business view stay idle", () => {
    let parentRenders = 0;
    let viewRenders = 0;
    function BusinessView() {
      viewRenders += 1;
      return createElement("main", null, "课程工作台");
    }
    function Workspace() {
      parentRenders += 1;
      return createElement("div", null,
        createElement(SyncCountdownBadge, props),
        createElement(BusinessView)
      );
    }
    act(() => root.render(createElement(Workspace)));
    const initialParentRenders = parentRenders;
    const initialViewRenders = viewRenders;

    for (let second = 0; second < 5; second += 1) advance(1);

    expect(container.querySelector("span")?.textContent).toBe("295s");
    expect(parentRenders).toBe(initialParentRenders);
    expect(viewRenders).toBe(initialViewRenders);
  });

  it("pauses while hidden or saving and resumes from the remaining time", () => {
    render();
    advance(2);
    expect(container.textContent).toBe("298s");
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    advance(10);
    expect(container.textContent).toBe("298s");
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    render({ saving: true });
    advance(10);
    expect(container.textContent).toBe("298s");
    render({ saving: false });
    advance(1);
    expect(container.textContent).toBe("297s");
  });

  it("resets after a successful cloud check without changing the remaining time on ordinary rerenders", () => {
    render();
    advance(10);
    render();
    expect(container.textContent).toBe("290s");
    render({ resetKey: 1 });
    expect(container.textContent).toBe("300s");
    advance(1);
    expect(container.textContent).toBe("299s");
  });

  it("freezes on conflict, shows zero when outdated, and restarts after cloud sync", () => {
    render();
    advance(5);
    render({ syncState: "conflict", hasRemoteVersion: true });
    advance(5);
    expect(container.textContent).toBe("295s");
    expect(container.querySelector("span")?.className).toContain("bg-[#ef4444]");
    render({ syncState: "outdated" });
    expect(container.textContent).toBe("0s");
    advance(5);
    expect(container.textContent).toBe("0s");
    render({ syncState: "syncing" });
    expect(container.textContent).toBe("...");
    render({ syncState: "idle", hasRemoteVersion: false, resetKey: 1 });
    expect(container.textContent).toBe("300s");
    expect(container.querySelector("span")?.className).toContain("bg-[#dcfce7]");
    advance(1);
    expect(container.textContent).toBe("299s");
  });

  it("preserves the warning colors, busy label, and zero lower bound", () => {
    render();
    advance(255);
    expect(container.textContent).toBe("45s");
    expect(container.querySelector("span")?.className).toContain("bg-[#ffedd5]");
    advance(30);
    expect(container.textContent).toBe("15s");
    expect(container.querySelector("span")?.className).toContain("bg-[#fee2e2]");
    render({ syncState: "checking" });
    expect(container.textContent).toBe("...");
    advance(30);
    render({ syncState: "idle" });
    expect(container.textContent).toBe("0s");
  });

  it("waits for a cloud session and removes the timer on logout", () => {
    render({ enabled: false });
    advance(5);
    expect(container.textContent).toBe("300s");
    render({ enabled: true });
    advance(1);
    expect(container.textContent).toBe("299s");
    act(() => root.render(null));
    expect(vi.getTimerCount()).toBe(0);
    render();
    expect(container.textContent).toBe("300s");
  });
});
