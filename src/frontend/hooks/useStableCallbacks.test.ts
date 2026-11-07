// @vitest-environment happy-dom
import { act, createElement, memo, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useStableCallbacks } from "./useStableCallbacks";
it("keeps memoized business views idle for status updates while invoking the latest committed closure", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); const root = createRoot(container);
  let renders = 0; let update!: (value: number) => void; let callbacks!: { read: () => number; fail: () => never };
  const Child = memo(({ handlers }: { handlers: typeof callbacks }) => { callbacks = handlers; renders += 1; return null; });
  function Harness() { const [status, setStatus] = useState(0); update = setStatus; const handlers = useStableCallbacks({ read: () => status, fail: () => { throw new Error(String(status)); } }); return createElement(Child, { handlers }); }
  try {
    act(() => root.render(createElement(Harness))); const original = callbacks;
    act(() => update(1)); act(() => update(2));
    expect(renders).toBe(1); expect(callbacks).toBe(original); expect(callbacks.read()).toBe(2); expect(callbacks.fail).toThrow("2");
  } finally { act(() => root.unmount()); vi.unstubAllGlobals(); }
});
