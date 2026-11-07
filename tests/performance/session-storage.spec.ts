import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createBenchmarkVault } from "./fixtures";
import { openSyntheticWorkspace } from "./session";

test("trusted sessions remain encrypted, restore correctly and fall back safely when persistent storage is full", async ({ page, context }, testInfo) => {
  const vault = createBenchmarkVault({ students: 40, courses: 12, lessons: 240 });
  const session = await openSyntheticWorkspace(page, context, vault);
  const result = await page.evaluate(async () => {
    const { writeUnlockedSession, readUnlockedSession, clearUnlockedSession } = await import(/* @vite-ignore */ "/src/frontend/lib/unlockSession.ts" as string);
    const key = "teacher-salary-tracker:unlocked-session";
    const original = JSON.parse(sessionStorage.getItem(key)!);
    const begin = performance.now(); await writeUnlockedSession({ ...original, persistAfterClose: true }); const writeMs = performance.now() - begin;
    const stored = localStorage.getItem(key)!; const box = JSON.parse(stored);
    const startRead = performance.now(); const restored = await readUnlockedSession(); const readMs = performance.now() - startRead;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key: string, value: string) { if (this === localStorage && key === "teacher-salary-tracker:unlocked-session") throw new DOMException("synthetic capacity", "QuotaExceededError"); originalSetItem.call(this, key, value); };
    try { await writeUnlockedSession({ ...original, persistAfterClose: true }); } finally { Storage.prototype.setItem = originalSetItem; }
    const fallback = await readUnlockedSession(); const hasPersistentFallback = localStorage.getItem(key) !== null;
    clearUnlockedSession(); const cleared = await readUnlockedSession();
    await writeUnlockedSession({ ...original, persistAfterClose: false });
    return { writeMs, readMs, kind: box.kind, plaintextLeaked: stored.includes(original.password) || stored.includes(original.token), restoredName: restored.username, trusted: restored.persistAfterClose, fallbackName: fallback.username, fallbackTrusted: fallback.persistAfterClose, hasPersistentFallback, cleared };
  });
  expect(result).toMatchObject({ kind: "trusted-device-session", plaintextLeaked: false, restoredName: "performance-test", trusted: true, fallbackName: "performance-test", fallbackTrusted: false, hasPersistentFallback: false, cleared: null });
  expect(session.pageErrors).toEqual([]); expect(session.unexpectedRequests).toEqual([]); await writeFile(testInfo.outputPath("trusted-storage.json"), JSON.stringify(result, null, 2));
});

test("measures cache capacity and upload request size with increasing synthetic archives", async ({ page, context }, testInfo) => {
  const base = createBenchmarkVault({ students: 12, courses: 2, lessons: 0 });
  const session = await openSyntheticWorkspace(page, context, base);
  const scales = [240, 1800, 3600, 6000].map(lessons => createBenchmarkVault({ students: 800, courses: 240, lessons }));
  const samples = await page.evaluate(async ({ scales, password }) => {
    const { encryptJson } = await import(/* @vite-ignore */ "/src/frontend/lib/crypto.ts" as string);
    const key = "synthetic-capacity-probe"; const samples = [];
    for (const vault of scales) {
      const start = performance.now(); const encrypted = await encryptJson(vault, password); const encryptMs = performance.now() - start;
      const json = JSON.stringify(encrypted); const body = JSON.stringify({ encryptedPayload: json, expectedUpdatedAt: "synthetic" });
      const uploadStart = performance.now();
      const uploadResponse = await fetch("/__benchmark/upload-probe", { method: "POST", headers: { "content-type": "application/json" }, body });
      const received = await uploadResponse.json(); const loopbackUploadMs = performance.now() - uploadStart;
      let capacityError = ""; const writeStart = performance.now();
      try { localStorage.setItem(key, json); } catch (error) { capacityError = error instanceof Error ? error.name : String(error); }
      const writeMs = performance.now() - writeStart; localStorage.removeItem(key);
      samples.push({ lessons: vault.lessons.length, jsonBytes: new TextEncoder().encode(JSON.stringify(vault)).length, encryptedBytes: new TextEncoder().encode(json).length, uploadBytes: new TextEncoder().encode(body).length, encryptMs, writeMs, capacityError, loopbackUploadMs, receivedBytes: received.receivedBytes });
    }
    return samples;
  }, { scales, password: session.password });
  expect(samples.every(sample => sample.encryptMs > 0 && sample.uploadBytes > sample.jsonBytes && sample.receivedBytes === sample.uploadBytes)).toBe(true);
  expect(samples.filter(sample => sample.capacityError).every(sample => sample.capacityError === "QuotaExceededError")).toBe(true);
  expect(session.pageErrors).toEqual([]); expect(session.unexpectedRequests).toEqual([]); await writeFile(testInfo.outputPath("capacity.json"), JSON.stringify(samples, null, 2)); console.log(JSON.stringify(samples));
});

test("rapid profile edits keep local recovery current and coalesce the cloud upload", async ({ page, context }, testInfo) => {
  const vault = createBenchmarkVault({ students: 40, courses: 12, lessons: 240 });
  const session = await openSyntheticWorkspace(page, context, vault);
  await page.getByRole("button", { name: "档案信息", exact: true }).click();
  await page.evaluate(() => { const original = Storage.prototype.setItem; const log: Array<{ key: string; ms: number; size: number }> = []; Object.assign(window, { __storageMeasurements: log }); Storage.prototype.setItem = function(key, value) { const start = performance.now(); original.call(this, key, value); if (key.includes("unlocked-session")) log.push({ key, ms: performance.now() - start, size: value.length }); }; });
  const input = page.getByPlaceholder("例如：主要负责中心校区，高中数学方向");
  for (let i = 0; i < 6; i += 1) await input.fill("连续编辑 " + i);
  await expect.poll(async () => (await session.readSavedVault()).profile.note).toBe("连续编辑 5");
  const measures = await page.evaluate(() => (window as unknown as { __storageMeasurements: unknown[] }).__storageMeasurements);
  expect(session.saveCount).toBe(1); expect(session.pageErrors).toEqual([]); expect(session.unexpectedRequests).toEqual([]);
  await writeFile(testInfo.outputPath("continuous-edit.json"), JSON.stringify({ edits: 6, uploads: session.saveCount, measures }, null, 2));
});
