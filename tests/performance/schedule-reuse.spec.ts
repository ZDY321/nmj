import { expect, test, type Page } from "@playwright/test";
import { createBenchmarkVault } from "./fixtures";
import { openSyntheticWorkspace } from "./session";
function reuseCard(page: Page) { return page.locator('div[class~="rounded-[18px]"]').filter({ has: page.getByRole("heading", { name: "复用排课", exact: true }) }); }
function dateField(page: Page, label: string) { return reuseCard(page).locator('div[class~="space-y-2"]').filter({ has: page.locator("label").getByText(label, { exact: true }) }).locator("input"); }

test("day reuse confirms replacement and preserves the source and unrelated lesson history", async ({ page, context }) => {
  const vault = createBenchmarkVault({ students: 12, courses: 2, lessons: 3 });
  vault.lessons[0] = { ...vault.lessons[0], date: "2026-10-30", status: "cancelled" };
  vault.lessons[1] = { ...vault.lessons[1], date: "2026-11-06", startTime: "14:00", endTime: "16:00" };
  vault.lessons[2] = { ...vault.lessons[2], date: "2026-11-06", status: "scheduled" };
  const session = await openSyntheticWorkspace(page, context, vault);
  await page.getByRole("button", { name: "排课与课时", exact: true }).click();
  await page.locator('button[class~="min-w-[112px]"]').getByText("排课", { exact: true }).click();
  const card = reuseCard(page);
  await dateField(page, "1. 要排课的日期").fill("2026-11-06");
  await dateField(page, "2. 复用哪一天的排课").fill("2026-10-30");
  await card.getByRole("button", { name: "确认应用到目标日", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "目标日期已有同课程课节", exact: true });
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  expect(session.saveCount).toBe(0);
  await card.getByRole("button", { name: "确认应用到目标日", exact: true }).click();
  await dialog.getByRole("button", { name: "覆盖并复用", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).deletedLessons!.length).toBe(1);
  const saved = await session.readSavedVault();
  expect(saved.lessons.find(lesson => lesson.id === vault.lessons[0].id)).toEqual(vault.lessons[0]);
  expect(saved.lessons.find(lesson => lesson.id === vault.lessons[1].id)).toEqual(vault.lessons[1]);
  expect(saved.lessons.some(lesson => lesson.id === vault.lessons[2].id)).toBe(false);
  const added = saved.lessons.find(lesson => !vault.lessons.some(original => original.id === lesson.id))!;
  expect(added).toMatchObject({ date: "2026-11-06", status: "scheduled", courseGroupId: "course_0", expectedStudentIds: vault.courseGroups[0].studentIds, feeSnapshot: { amount: 100, hours: 2 } });
  expect(saved.deletedLessons![0]).toMatchObject({ lesson: vault.lessons[2], source: "sync_overwrite" });
  expect(saved.courseGroups).toEqual(vault.courseGroups);
  expect(saved.students).toEqual(vault.students);
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});
