// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { loginAccount, registerAccount, logoutCloud, clearStoredSession, saveVault, getCloudVaultMeta } from "@/frontend/lib/storage";
import { clearUnlockedSession, readUnlockedSession, writeUnlockedSession, writePersistentLoginPreference } from "@/frontend/lib/unlockSession";
import { useCloudSession } from "./useCloudSession";
vi.mock("@/frontend/lib/storage", () => ({ loginAccount: vi.fn(), registerAccount: vi.fn(), logoutCloud: vi.fn(), clearStoredSession: vi.fn(), clearVault: vi.fn(), loadCloudVaultWithVersion: vi.fn(), saveVault: vi.fn(), getCloudVaultMeta: vi.fn() }));
vi.mock("@/frontend/lib/unlockSession", () => ({ clearUnlockedSession: vi.fn(), readUnlockedSession: vi.fn(), writeUnlockedSession: vi.fn(), writePersistentLoginPreference: vi.fn() }));
let root: Root; let state: ReturnType<typeof useCloudSession>;
const setView = vi.fn(); const setSelectedDate = vi.fn(); const setAmountsVisible = vi.fn(); const setAiSession = vi.fn(); const setNotice = vi.fn(); const setFeedback = vi.fn(); const setOnboarding = vi.fn(); const setSyncNonce = vi.fn(); const confirm = vi.fn();
const vault = createEmptyVault();
function Harness() { state = useCloudSession({ view: "admin", setView, selectedDate: "2026-11-06", setSelectedDate, setAmountsVisible, setAiScheduleSession: setAiSession, setNoticeModalOpen: setNotice, setFeedbackModalOpen: setFeedback, setOnboardingVisible: setOnboarding, setLessonFeedbackSyncNonce: setSyncNonce, confirm }); return null; }
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers(); vi.resetAllMocks(); vi.mocked(readUnlockedSession).mockResolvedValue(null); vi.mocked(writeUnlockedSession).mockResolvedValue(); vi.mocked(logoutCloud).mockResolvedValue(); vi.mocked(getCloudVaultMeta).mockResolvedValue({ updatedAt: "v1" }); vi.mocked(saveVault).mockResolvedValue({ updatedAt: "v2" });
  const account = { username: "synthetic", role: "teacher" as const, createdAt: "" }; const result = { token: "token", account, vault, deletion: null, cloudVersion: "v1" }; vi.mocked(loginAccount).mockResolvedValue(result); vi.mocked(registerAccount).mockResolvedValue(result);
  root = createRoot(document.createElement("div")); await act(async () => root.render(createElement(StrictMode, null, createElement(Harness))));
});
afterEach(() => { act(() => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("loads a teacher session, preserves the trusted-device preference and returns away from admin", async () => {
  expect(state.bootstrapped).toBe(true); await act(async () => state.login("synthetic", "password", true));
  expect(state).toMatchObject({ username: "synthetic", token: "token", role: "teacher", persistLoginAfterClose: true, cloudVersion: "v1" }); expect(setView).toHaveBeenCalledWith("today"); expect(writePersistentLoginPreference).toHaveBeenCalledWith("synthetic", true); expect(writeUnlockedSession).toHaveBeenCalledWith(expect.objectContaining({ username: "synthetic", password: "password", persistAfterClose: true }));
});
it("flushes pending edits before logout and clears session and transient workspace state", async () => {
  await act(async () => state.login("synthetic", "password", false));
  act(() => state.updateVault(draft => { draft.profile.note = "pending"; }));
  await act(async () => { state.signOut(); await vi.advanceTimersByTimeAsync(1); });
  expect(saveVault).toHaveBeenCalledOnce(); expect(vi.mocked(saveVault).mock.lastCall![2].profile.note).toBe("pending"); expect(clearStoredSession).toHaveBeenCalledOnce(); expect(logoutCloud).toHaveBeenCalledWith("token"); expect(clearUnlockedSession).toHaveBeenCalled(); expect(state).toMatchObject({ username: "", token: "", vault: null, persistLoginAfterClose: false, saveState: "idle" }); expect(setAiSession).toHaveBeenCalledWith(null); expect(setNotice).toHaveBeenCalledWith(false); expect(setFeedback).toHaveBeenCalledWith(false);
});
it("returns the registration role and updates preference without changing the account", async () => {
  let role: unknown; await act(async () => { role = await state.register("synthetic", "password", false); }); expect(role).toBe("teacher");
  act(() => state.updatePersistLoginAfterClose(true)); expect(state.username).toBe("synthetic"); expect(writePersistentLoginPreference).toHaveBeenLastCalledWith("synthetic", true);
});
