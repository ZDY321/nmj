import { expect, type BrowserContext, type Page } from "@playwright/test";
import type { TeacherVault } from "../../src/shared/types";
import { decryptJson, encryptJson } from "../../src/frontend/lib/crypto";
import { benchmarkDate } from "./fixtures";

export async function openSyntheticWorkspace(page: Page, context: BrowserContext, vault: TeacherVault) {
  const password = "synthetic-performance-password";
  let encryptedPayload = JSON.stringify(await encryptJson(vault, password));
  let cloudVersion = "2026-11-06T01:00:00.000Z";
  let saveCount = 0;
  const pageErrors: string[] = [];
  const unexpectedRequests: string[] = [];
  page.on("pageerror", error => { pageErrors.push(error.message); console.error("Browser error:", error.message); });
  page.on("requestfailed", request => console.error("Failed request:", request.url(), request.failure()));
  // Every API request is handled in memory. No credentials or requests reach a real backend.
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:5174") {
      unexpectedRequests.push(request.url());
      return route.abort();
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/me/vault") {
      if (request.method() === "PUT") {
        const body = request.postDataJSON();
        expect(body.expectedUpdatedAt).toBe(cloudVersion);
        encryptedPayload = body.encryptedPayload;
        cloudVersion = new Date(Date.parse(cloudVersion) + 1000).toISOString();
        saveCount += 1;
        return route.fulfill({ json: { ok: true, updatedAt: cloudVersion } });
      }
      return route.fulfill({ json: { encrypted_payload: encryptedPayload, updated_at: cloudVersion } });
    }
    if (url.pathname === "/api/me/vault/meta") return route.fulfill({ json: { updatedAt: cloudVersion } });
    if (url.pathname === "/api/public/login-notice") return route.fulfill({ json: vault.notice });
    if (url.pathname === "/api/public/settings") return route.fulfill({ json: { registrationEnabled: true, aiSchedulingEnabled: false } });
    if (url.pathname === "/api/ai/providers") return route.fulfill({ json: [] });
    unexpectedRequests.push(request.method() + " " + url.pathname);
    return route.fulfill({ status: 404, json: { error: "Unexpected benchmark API request" } });
  });
  await page.clock.install({ time: new Date("2026-11-06T02:00:00.000Z") });
  await context.addInitScript(({ vault, password, cloudVersion, benchmarkDate }) => {
    sessionStorage.setItem("teacher-salary-tracker:unlocked-session", JSON.stringify({
      username: "performance-test", password, token: "synthetic-token", role: "teacher", deletion: null,
      vault, cloudVersion, selectedDate: benchmarkDate, persistAfterClose: false
    }));
    localStorage.setItem("teacher-salary-tracker:onboarding-dismissed:performance-test", "true");
  }, { vault, password, cloudVersion, benchmarkDate });
  await page.goto("/");
  page.on("console", message => { if (message.type() === "error") console.error(message.text()); });
  await expect(page.getByRole("button", { name: "同步云端数据", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  return {
    password,
    pageErrors,
    unexpectedRequests,
    get saveCount() { return saveCount; },
    readSavedVault: () => decryptJson<TeacherVault>(JSON.parse(encryptedPayload), password)
  };
}
