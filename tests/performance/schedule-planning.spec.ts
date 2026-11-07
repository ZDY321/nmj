import { expect, test, type Page } from "@playwright/test";
import { createBenchmarkVault } from "./fixtures";
import { openSyntheticWorkspace } from "./session";
function card(page: Page) { return page.locator('div[class~="rounded-[18px]"]').filter({ has: page.getByRole("heading", { name: "批量生成课时", exact: true }) }); }
function field(page: Page, label: string) { return card(page).locator('div[class~="space-y-2"]').filter({ has: page.locator("label").getByText(label, { exact: true }) }).locator("input"); }
async function openPlanning(page: Page) {
  await page.getByRole("button", { name: "排课与课时", exact: true }).click();
  await page.locator('button[class~="min-w-[112px]"]').getByText("排课", { exact: true }).click();
}
test("ordinary and weekly planning retain fee snapshots, draft state and deduplication", async ({ page, context }) => {
  const vault = createBenchmarkVault({ students: 12, courses: 2, lessons: 1 });
  const session = await openSyntheticWorkspace(page, context, vault); await openPlanning(page);
  await field(page, "日期开始").fill("2026-11-09"); await field(page, "日期结束").fill("2026-11-16");
  await card(page).getByRole("button", { name: "周一", exact: true }).click();
  await field(page, "计费课时").fill("1.5");
  await card(page).getByRole("button", { name: "加入模板", exact: true }).click(); expect(session.saveCount).toBe(0);
  await card(page).getByRole("button", { name: "按日期范围生成待上课", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).lessons.length).toBe(3);
  await card(page).getByRole("button", { name: "按周循环模板生成待上课", exact: true }).click();
  await expect(page.getByText("没有新增课节，2 节已排课。", { exact: true })).toBeVisible();
  await page.locator('button[class~="min-w-[112px]"]').getByText("日历查看", { exact: true }).click(); await openPlanning(page);
  await expect(field(page, "计费课时")).toHaveValue("1.5"); await expect(card(page).getByRole("button", { name: "套用", exact: true })).toHaveCount(1);
  const saved = await session.readSavedVault();
  expect(saved.lessons.find(lesson => lesson.id === vault.lessons[0].id)).toEqual(vault.lessons[0]);
  expect(saved.lessons.filter(lesson => lesson.id !== vault.lessons[0].id).map(lesson => ({ date: lesson.date, status: lesson.status, hours: lesson.feeSnapshot.hours }))).toEqual([{ date: "2026-11-09", status: "scheduled", hours: 1.5 }, { date: "2026-11-16", status: "scheduled", hours: 1.5 }]);
  expect(saved.courseGroups).toEqual(vault.courseGroups); expect(session.pageErrors).toEqual([]); expect(session.unexpectedRequests).toEqual([]);
});
test("per-day planning writes only after confirmation and avoids duplicate time groups", async ({ page, context }) => {
  const vault = createBenchmarkVault({ students: 12, courses: 2, lessons: 0 });
  const session = await openSyntheticWorkspace(page, context, vault); await openPlanning(page);
  await field(page, "日期开始").fill("2026-11-09"); await field(page, "日期结束").fill("2026-11-16");
  await card(page).getByRole("button", { name: "周一", exact: true }).click(); await card(page).getByRole("switch").click();
  await card(page).getByRole("button", { name: "添加时间组", exact: true }).click();
  await card(page).getByRole("button", { name: "按日分时生成待上课", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "确认按日分时生成课时？", exact: true });
  await expect(dialog).toBeVisible(); expect(session.saveCount).toBe(0); await dialog.getByRole("button", { name: "确认生成", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).lessons.length).toBe(2);
  expect((await session.readSavedVault()).lessons.every(lesson => lesson.status === "scheduled")).toBe(true);
  expect(session.pageErrors).toEqual([]); expect(session.unexpectedRequests).toEqual([]);
});
