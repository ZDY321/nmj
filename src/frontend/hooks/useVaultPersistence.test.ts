// @vitest-environment happy-dom
import { act, createElement, StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TeacherVault } from "@/shared/types";
import { ApiError } from "@/frontend/lib/cloud";
import { createEmptyVault } from "@/frontend/lib/sampleData";
import { getCloudVaultMeta, loadCloudVaultWithVersion, saveVault } from "@/frontend/lib/storage";
import { useVaultPersistence } from "./useVaultPersistence";
vi.mock("@/frontend/lib/storage", () => ({ getCloudVaultMeta: vi.fn(), loadCloudVaultWithVersion: vi.fn(), saveVault: vi.fn() }));
let container: HTMLDivElement; let root: Root;
let persistence: ReturnType<typeof useVaultPersistence>;
let initial: TeacherVault;
const remember = vi.fn(); const confirm = vi.fn(); const setFeedbackNonce = vi.fn();
function Harness() {
  const [vault, setVault] = useState<TeacherVault | null>(initial);
  persistence = useVaultPersistence({ username: "synthetic", password: "test", token: "token", vault, setVault, cloudRestorePending: false, rememberUnlockedSession: remember, repairedVaultForCourseLinks: value => value, setLessonFeedbackSyncNonce: setFeedbackNonce, confirm });
  return null;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers(); vi.resetAllMocks(); initial = createEmptyVault();
  vi.mocked(getCloudVaultMeta).mockResolvedValue({ updatedAt: "v1" }); vi.mocked(saveVault).mockResolvedValue({ updatedAt: "v2" });
  container = document.createElement("div"); root = createRoot(container);
  await act(async () => root.render(createElement(StrictMode, null, createElement(Harness))));
  await act(async () => persistence.setCloudVersion("v1"));
});
afterEach(() => { act(() => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("coalesces rapid edits into one upload and retains changes from consecutive updater calls", async () => {
  act(() => { persistence.updateVault(draft => { draft.profile.displayName = "first"; }); persistence.updateVault(draft => { draft.profile.baseSalary = 123; }); });
  await act(async () => { await vi.advanceTimersByTimeAsync(499); }); expect(saveVault).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(saveVault).toHaveBeenCalledOnce(); expect(vi.mocked(saveVault).mock.lastCall![2].profile).toMatchObject({ displayName: "first", baseSalary: 123 }); expect(persistence.cloudVersion).toBe("v2");
});
it("serializes overlapping saves and uses the version returned by the preceding write", async () => {
  let resolveFirst!: (value: { updatedAt: string }) => void;
  vi.mocked(saveVault).mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; })).mockResolvedValueOnce({ updatedAt: "v3" });
  let first!: Promise<void>; let second!: Promise<void>;
  await act(async () => { first = persistence.persist({ ...initial, profile: { ...initial.profile, displayName: "one" } }); second = persistence.persist({ ...initial, profile: { ...initial.profile, displayName: "two" } }); });
  expect(saveVault).toHaveBeenCalledOnce(); await act(async () => { resolveFirst({ updatedAt: "v2" }); await first; await second; });
  expect(vi.mocked(saveVault).mock.calls.map(call => (typeof call[3] === "object" ? call[3].expectedUpdatedAt : undefined))).toEqual(["v1", "v2"]); expect(persistence.cloudVersion).toBe("v3"); expect(persistence.vaultRef.current?.profile.displayName).toBe("two");
});
it("keeps local edits on a conflict and only removes version protection after explicit overwrite confirmation", async () => {
  vi.mocked(getCloudVaultMeta).mockReturnValue(new Promise(() => {}));
  vi.mocked(saveVault).mockRejectedValueOnce(new ApiError("conflict", 409, undefined, { currentUpdatedAt: "remote" }));
  await act(async () => { await persistence.persist({ ...initial, profile: { ...initial.profile, displayName: "local" } }); });
  expect(persistence).toMatchObject({ saveState: "error", syncState: "conflict", remoteCloudVersion: "remote" }); expect(persistence.vaultRef.current?.profile.displayName).toBe("local");
  act(() => persistence.confirmForceOverwriteCloud()); expect(saveVault).toHaveBeenCalledTimes(1);
  await act(async () => { await confirm.mock.lastCall![0].onConfirm(); });
  expect(vi.mocked(saveVault).mock.lastCall![3]).toMatchObject({ force: true, expectedUpdatedAt: undefined });
});
it("does not upload before the cloud version is known", async () => {
  await act(async () => persistence.setCloudVersion(""));
  await act(async () => { await persistence.persist(initial); }); expect(saveVault).not.toHaveBeenCalled(); expect(persistence.saveState).toBe("error"); expect(remember).toHaveBeenCalledWith({ vault: initial });
});
it("flushes the debounce before synchronizing and then installs the fetched version", async () => {
  vi.mocked(loadCloudVaultWithVersion).mockResolvedValue({ vault: { ...initial, profile: { ...initial.profile, displayName: "cloud" } }, updatedAt: "v4" });
  act(() => persistence.updateVault(draft => { draft.profile.displayName = "pending"; }));
  await act(async () => { await persistence.syncLatestCloudVault(); });
  expect(saveVault).toHaveBeenCalledOnce(); expect(loadCloudVaultWithVersion).toHaveBeenCalledWith("token", "test", "synthetic", { allowLocalFallback: false }); expect(persistence.vaultRef.current?.profile.displayName).toBe("cloud"); expect(persistence.cloudVersion).toBe("v4"); expect(setFeedbackNonce).toHaveBeenCalled();
});

it("waits for an already uploading save when flushing before sign-out", async () => {
  let release!: (result: { updatedAt: string }) => void;
  vi.mocked(saveVault).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  let save!: Promise<void>; let flushed = false;
  await act(async () => { save = persistence.persist(initial); });
  const flushing = persistence.flushPendingPersist().then(() => { flushed = true; });
  await Promise.resolve(); expect(flushed).toBe(false);
  await act(async () => { release({ updatedAt: "v2" }); await save; await flushing; }); expect(flushed).toBe(true);
});
