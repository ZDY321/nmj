import { expect, test, type Page } from "@playwright/test";
import type { DeletedLesson } from "../../src/shared/types";
import { createBenchmarkVault } from "./fixtures";
import { openSyntheticWorkspace } from "./session";

function trashVault() {
  const vault = createBenchmarkVault({ students: 12, courses: 1, lessons: 2 });
  const entry = (id: string, source: DeletedLesson["source"] = "manual"): DeletedLesson => ({ id: "trash_" + id, source, deletedAt: "2026-11-06T08:00:00Z", reason: id, lesson: { ...structuredClone(vault.lessons[0]), id, note: id } });
  vault.deletedLessons = [entry("recover"), entry("original"), entry("makeup", "ai"), entry("orphan"), entry("conflict")];
  vault.deletedLessons[2].lesson.linkedOriginalLessonId = "original";
  vault.deletedLessons[2].lesson.status = "scheduled";
  vault.deletedLessons[3].lesson.courseGroupId = "missing";
  vault.deletedLessons[4].lesson.id = vault.lessons[0].id;
  return vault;
}
function row(page: Page, reason: string) {
  return page.locator('div[class~="rounded-[14px]"][class~="p-4"]').filter({ has: page.getByText("删除原因：" + reason, { exact: true }) });
}
async function openTrash(page: Page) {
  await page.getByRole("button", { name: "排课与课时", exact: true }).click();
  await page.getByRole("button", { name: /^回收站/ }).click();
}

test("trash restores a confirmed record with its exact history and retains hidden selections", async ({ page, context }) => {
  const vault = trashVault();
  const session = await openSyntheticWorkspace(page, context, vault);
  await openTrash(page);
  await expect(row(page, "orphan").getByRole("button", { name: "恢复", exact: true })).toBeDisabled();
  await expect(row(page, "conflict").getByRole("button", { name: "恢复", exact: true })).toBeDisabled();
  await expect(row(page, "makeup").getByRole("button", { name: "恢复", exact: true })).toBeDisabled();
  await row(page, "orphan").getByRole("checkbox").check();
  const search = page.getByPlaceholder("搜索课程、学生、科目、校区、备注或删除原因", { exact: true });
  await search.fill("  RECOVER  ");
  await page.getByRole("checkbox", { name: "全选当前筛选结果", exact: true }).check();
  await page.getByRole("button", { name: "恢复选中 1", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "恢复这节课？", exact: true });
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  expect(session.saveCount).toBe(0);
  await page.getByRole("button", { name: "恢复选中 1", exact: true }).click();
  await dialog.getByRole("button", { name: "恢复", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).lessons.length).toBe(3);
  await search.fill("");
  await expect(row(page, "orphan").getByRole("checkbox")).toBeChecked();
  await expect(row(page, "recover")).toHaveCount(0);
  const saved = await session.readSavedVault();
  expect(saved.lessons).toEqual([...vault.lessons, vault.deletedLessons![0].lesson]);
  expect(saved.deletedLessons).toEqual(vault.deletedLessons!.slice(1));
  expect(saved.courseGroups).toEqual(vault.courseGroups);
  expect(saved.students).toEqual(vault.students);
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});

test("trash keeps batch makeup eligibility, tab filters and confirmed permanent-delete cascading", async ({ page, context }) => {
  const vault = trashVault();
  const session = await openSyntheticWorkspace(page, context, vault);
  await openTrash(page);
  await row(page, "makeup").getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: /^恢复选中/ })).toBeDisabled();
  await row(page, "original").getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: "恢复选中 2", exact: true })).toBeEnabled();
  const search = page.getByPlaceholder("搜索课程、学生、科目、校区、备注或删除原因", { exact: true });
  await search.fill("original");
  await page.getByRole("button", { name: "学生课次统计", exact: true }).click();
  await page.getByRole("button", { name: /^回收站/ }).click();
  await expect(search).toHaveValue("original");
  await expect(row(page, "original").getByRole("checkbox")).toBeChecked();
  await page.getByRole("button", { name: "彻底删除选中", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "彻底删除这条回收站记录？", exact: true });
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  expect(session.saveCount).toBe(0);
  await page.getByRole("button", { name: "彻底删除选中", exact: true }).click();
  await dialog.getByRole("button", { name: "彻底删除", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).deletedLessons!.length).toBe(3);
  await search.fill("");
  await expect(page.getByText("已选 0 条", { exact: true })).toBeVisible();
  const saved = await session.readSavedVault();
  expect(saved.deletedLessons).toEqual(vault.deletedLessons!.filter(item => !["trash_original", "trash_makeup"].includes(item.id)));
  expect(saved.lessons).toEqual(vault.lessons);
  expect(saved.courseGroups).toEqual(vault.courseGroups);
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});
