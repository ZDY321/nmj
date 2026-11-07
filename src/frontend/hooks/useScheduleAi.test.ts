// @vitest-environment happy-dom
import { act, createElement, StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AiProviderConfig, AiScheduleDraftResponse, AiScheduleSession } from "@/shared/types";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { generateAiScheduleDraft, getAiProviders, getUsableAiProviders } from "@/frontend/lib/cloud";
import { useScheduleAi } from "./useScheduleAi";
vi.mock("@/frontend/lib/cloud", () => ({ generateAiScheduleDraft: vi.fn(), getAiProviders: vi.fn(), getUsableAiProviders: vi.fn() }));
let root: Root;
let container: HTMLDivElement;
let ai: ReturnType<typeof useScheduleAi>;
let isAdmin: boolean;
const vault = createEmptyVault();
const apply = vi.fn<(session: AiScheduleSession | null) => { ok: boolean; message: string }>();
const provider: AiProviderConfig = { id: "test", name: "测试", provider: "openai_compatible", baseUrl: "https://ai.example.invalid/v1", model: "synthetic", enabled: true, isDefault: true, dailyLimit: 10, maxOutputTokens: 1000, temperature: 0.5, maskedApiKey: "***", createdAt: "2026-11-07", updatedAt: "2026-11-07", lastTestedAt: null, lastError: null };
const response: AiScheduleDraftResponse = { providerId: "test", model: "synthetic", createdAt: "2026-11-07", text: "result", draft: { actions: [{ type: "noop" }], summary: "回归建议", questions: [] }, providerUsage: { dailyLimit: 10, usedToday: 2, remainingToday: 8 } };
function Harness() {
  const [session, setSession] = useState<AiScheduleSession | null>(null);
  ai = useScheduleAi({ vault, token: "synthetic", isAdmin, aiSession: session, onAiSessionChange: setSession, onApplyAiDraft: apply, calendarMonth: "2026-11", selectedCalendarDate: "2026-11-07", weekStartPreference: 1 });
  return null;
}
async function render() { await act(async () => { root.render(createElement(StrictMode, null, createElement(Harness))); }); }
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks(); isAdmin = false;
  vi.mocked(getUsableAiProviders).mockResolvedValue([provider]); vi.mocked(getAiProviders).mockResolvedValue([provider]); vi.mocked(generateAiScheduleDraft).mockResolvedValue(response);
  apply.mockReturnValue({ ok: true, message: "写入完成" });
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); await render();
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("loads the role-specific providers, selects an enabled default and limits endpoint visibility", async () => {
  expect(getUsableAiProviders).toHaveBeenCalledWith("synthetic"); expect(getAiProviders).not.toHaveBeenCalled();
  expect(ai.aiProviderId).toBe("test"); expect(ai.canShowAiProviderEndpoint).toBe(false);
  isAdmin = true; await render(); expect(getAiProviders).toHaveBeenCalledWith("synthetic"); expect(ai.canShowAiProviderEndpoint).toBe(true);
});
it("validates instructions, generates a draft with current context and updates usage", async () => {
  await act(async () => ai.onSubmitAiDraft()); expect(generateAiScheduleDraft).not.toHaveBeenCalled();
  expect(ai.aiMessage).toBe("请先填写要让 AI 处理的内容。");
  act(() => ai.onPatchSession({ instruction: "  安排课程  " })); await act(async () => ai.onSubmitAiDraft());
  expect(generateAiScheduleDraft).toHaveBeenCalledWith("synthetic", expect.objectContaining({ providerId: "test", taskType: "auto", instruction: "安排课程", context: expect.any(Object) }));
  expect(ai.aiDraft).toEqual(response); expect(ai.aiDraftCanApply).toBe(true); expect(ai.aiLoading).toBe(false);
  expect(ai.selectedAiUsage).toEqual({ dailyLimit: 10, usedToday: 2, remainingToday: 8 });
});
it("keeps draft actions unavailable while questions remain and incorporates followup answers", async () => {
  act(() => ai.onPatchSession({ instruction: "安排课程", followupAnswer: "  周三  ", draft: { ...response, draft: { actions: [{ type: "noop" }], questions: ["哪一天？"] } } }));
  expect(ai.aiDraftCanApply).toBe(false);
  await act(async () => ai.onSubmitAiFollowup());
  const request = vi.mocked(generateAiScheduleDraft).mock.lastCall![1];
  expect(request.instruction).toContain("1. 哪一天？"); expect(request.instruction).toContain("周三");
  expect(ai.aiInstruction).toBe(request.instruction); expect(ai.aiFollowupAnswer).toBe(""); expect(ai.aiDraftCanApply).toBe(true);
});
it("clears failed generated drafts and retains the instruction for retry", async () => {
  act(() => ai.onPatchSession({ instruction: "保留需求", draft: response }));
  vi.mocked(generateAiScheduleDraft).mockRejectedValueOnce(new Error("生成失败"));
  await act(async () => ai.onSubmitAiDraft());
  expect(ai.aiDraft).toBeNull(); expect(ai.aiInstruction).toBe("保留需求"); expect(ai.aiMessage).toBe("生成失败"); expect(ai.aiLoading).toBe(false);
});
it("applies a verified draft once during the cooldown and disables reapplication after success", () => {
  vi.useFakeTimers(); act(() => ai.onPatchSession({ instruction: "需求", draft: response }));
  act(() => ai.onApplyAiDraft()); expect(apply).toHaveBeenCalledOnce(); expect(ai.aiApplying).toBe(true);
  act(() => ai.onApplyAiDraft()); expect(apply).toHaveBeenCalledOnce();
  act(() => vi.advanceTimersByTime(250)); expect(ai.aiApplying).toBe(false); expect(ai.aiDraftCanApply).toBe(false); expect(ai.aiApplyResult).toEqual({ ok: true, message: "写入完成" });
  act(() => ai.onClearAiWork()); expect(ai.canClearAiWork).toBe(false); expect(ai.aiProviderId).toBe("test");
});
it("retains the draft and presents a failed apply result for correction", () => {
  vi.useFakeTimers(); apply.mockReturnValue({ ok: false, message: "校验失败" });
  act(() => ai.onPatchSession({ draft: response })); act(() => ai.onApplyAiDraft()); act(() => vi.advanceTimersByTime(250));
  expect(ai.aiApplyResult).toEqual({ ok: false, message: "AI 建议写入失败：校验失败" }); expect(ai.aiDraft).toEqual(response); expect(ai.aiDraftCanApply).toBe(true);
});
it("reports provider refresh failures without replacing the current provider list", async () => {
  vi.mocked(getUsableAiProviders).mockRejectedValueOnce(new Error("加载失败")); await act(async () => ai.onRefreshAiProviders());
  expect(ai.aiMessage).toBe("加载失败"); expect(ai.selectedAiProvider).toEqual(provider);
});
