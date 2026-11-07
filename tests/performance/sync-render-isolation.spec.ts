import { expect, test } from "@playwright/test";
import { createBenchmarkVault } from "./fixtures";
import { openSyntheticWorkspace } from "./session";
test("cloud version alerts update the shell without rerendering a business page", async ({ page, context }) => {
  const vault = createBenchmarkVault({ students: 12, courses: 2, lessons: 2 });
  const session = await openSyntheticWorkspace(page, context, vault);
  await page.getByRole("button", { name: "排课与课时", exact: true }).click(); await page.getByRole("button", { name: "课程记录", exact: true }).click();
  await context.route("**/api/me/vault/meta", route => route.fulfill({ json: { updatedAt: "2026-11-07T00:00:00.000Z" } }));
  await page.evaluate(() => { window.__benchmark = {}; window.dispatchEvent(new Event("focus")); });
  await expect(page.getByText("云端已有其他设备保存的新版本，建议先同步后继续编辑。", { exact: true })).toBeVisible();
  const counts = await page.evaluate(() => window.__benchmark);
  expect(counts?.App.renders).toBeGreaterThan(0); expect(counts?.ScheduleView?.renders ?? 0).toBe(0); expect(session.saveCount).toBe(0); expect(session.pageErrors).toEqual([]); expect(session.unexpectedRequests).toEqual([]);
});

test("the business page refreshes across midnight while remaining idle within the day", async ({ page, context }) => {
  const vault = createBenchmarkVault({ students: 12, courses: 2, lessons: 2 });
  const session = await openSyntheticWorkspace(page, context, vault);
  await page.getByRole("button", { name: "排课与课时", exact: true }).click(); await page.getByRole("button", { name: "课程记录", exact: true }).click();
  await page.clock.setSystemTime(new Date("2026-11-06T15:58:30.000Z"));
  await page.evaluate(() => { window.__benchmark = {}; }); await page.clock.fastForward(60_000);
  expect(await page.evaluate(() => window.__benchmark?.ScheduleView?.renders ?? 0)).toBe(0);
  await page.clock.fastForward(120_000);
  expect(await page.evaluate(() => window.__benchmark?.ScheduleView?.renders ?? 0)).toBeGreaterThan(0);
  expect(session.pageErrors).toEqual([]); expect(session.unexpectedRequests).toEqual([]);
});
