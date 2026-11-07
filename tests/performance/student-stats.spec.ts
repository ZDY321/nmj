import { expect, test, type Page } from "@playwright/test";
import { createBenchmarkVault } from "./fixtures";
import { openSyntheticWorkspace } from "./session";

function field(page: Page, label: string) {
  return page.locator('div[class~="space-y-2"]').filter({ has: page.locator("label").getByText(label, { exact: true }) });
}
function metric(page: Page, label: string) {
  return page.locator('div[class~="rounded-[8px]"][class~="p-3"]').filter({ has: page.getByText(label, { exact: true }) });
}
test("student statistics preserve totals, combined filters and filters across panel switches", async ({ page, context }) => {
  const vault = createBenchmarkVault({ students: 12, courses: 2, lessons: 4 });
  vault.lessons[1].status = "scheduled";
  vault.lessons[3].status = "cancelled";
  const session = await openSyntheticWorkspace(page, context, vault);
  await page.getByRole("button", { name: "排课与课时", exact: true }).click();
  await page.getByRole("button", { name: "学生课次统计", exact: true }).click();
  await expect(metric(page, "课节总数")).toContainText("4 节");
  await expect(metric(page, "学生课次")).toContainText("20 人次");
  await expect(metric(page, "涉及学生")).toContainText("10 人");
  await page.getByRole("button", { name: "显示课时费金额", exact: true }).click();
  await expect(metric(page, "已排课课时费合计")).toContainText("400");
  await expect(metric(page, "已完成课时费合计")).toContainText("200");
  await field(page, "学生姓名").locator("input").fill("合成学生0000");
  await field(page, "科目").locator("select").selectOption("语文");
  await field(page, "校区").locator("select").selectOption("campus_a");
  await expect(metric(page, "课节总数")).toContainText("2 节");
  await expect(metric(page, "学生课次")).toContainText("2 人次");
  await page.getByRole("button", { name: /^回收站/ }).click();
  await page.getByRole("button", { name: "学生课次统计", exact: true }).click();
  await expect(field(page, "学生姓名").locator("input")).toHaveValue("合成学生0000");
  await expect(metric(page, "课节总数")).toContainText("2 节");
  await field(page, "上课状态").locator("select").selectOption("cancelled");
  await expect(metric(page, "课节总数")).toContainText("0 节");
  expect(session.saveCount).toBe(0);
  expect(await session.readSavedVault()).toEqual(vault);
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});
