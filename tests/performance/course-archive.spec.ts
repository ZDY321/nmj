import { expect, test, type Page } from "@playwright/test";
import { createBenchmarkVault } from "./fixtures";
import { openSyntheticWorkspace } from "./session";

function archiveVault() {
  const vault = createBenchmarkVault({ students: 12, courses: 5, lessons: 4 });
  vault.profile.homeCampusId = "campus_a";
  vault.students[0] = { ...vault.students[0], grade: "初一", school: "档案搜索学校", note: "重点复习" };
  vault.students[1] = { ...vault.students[1], grade: "初二" };
  vault.students[2] = { ...vault.students[2], status: "transition" };
  const rosters = [["student_0"], ["student_1"], [], ["student_2"], ["student_10"]];
  vault.courseGroups = vault.courseGroups.map((course, index) => ({ ...course, studentIds: rosters[index], type: index === 1 ? "one_on_one" : "small_class" }));
  vault.lessons = vault.lessons.map(lesson => ({ ...lesson, courseGroupId: "course_0" }));
  return vault;
}
function listPanel(page: Page) {
  return page.locator('div[class~="h-fit"][class~="overflow-hidden"]').filter({ has: page.getByRole("heading", { name: "课程档案列表", exact: true }) });
}
function listSelect(page: Page, label: string) {
  return listPanel(page).locator('div[class~="space-y-2"]').filter({ has: page.locator("label").getByText(label, { exact: true }) }).locator("select");
}
function rowChoice(page: Page, index: number) {
  return listPanel(page).getByRole("checkbox", { name: "选择课程 合成课程" + String(index).padStart(4, "0"), exact: true });
}
function search(page: Page) { return listPanel(page).getByPlaceholder("搜索课程档案名称、学科、校区、学生或班型"); }
async function openArchive(page: Page) {
  await page.getByRole("button", { name: "档案信息", exact: true }).click();
  await page.getByRole("button", { name: "添加课程档案", exact: true }).click();
  return listPanel(page);
}

test("course archive combines filters, preserves tab state and distinguishes effective course status", async ({ page, context }) => {
  const vault = archiveVault();
  const session = await openSyntheticWorkspace(page, context, vault);
  const panel = await openArchive(page);
  await expect(panel.getByRole("checkbox", { name: /^选择课程 / })).toHaveCount(2);
  await expect(panel.getByText("2 / 5 个 · 启用", { exact: true })).toBeVisible();
  await search(page).fill("档案搜索学校 复习");
  await expect(rowChoice(page, 0)).toBeVisible();
  await expect(panel.getByRole("checkbox", { name: /^选择课程 / })).toHaveCount(1);
  await search(page).fill("合成学生0001 一对一");
  await listSelect(page, "班型筛选").selectOption("one_on_one");
  await listSelect(page, "年级").selectOption("初二");
  await listSelect(page, "科目").selectOption("数学");
  await listSelect(page, "校区").selectOption("campus_b");
  await expect(rowChoice(page, 1)).toBeVisible();
  await page.getByRole("button", { name: "学生列表", exact: true }).click();
  await page.getByRole("button", { name: "添加课程档案", exact: true }).click();
  await expect(search(page)).toHaveValue("合成学生0001 一对一");
  await expect(listSelect(page, "班型筛选")).toHaveValue("one_on_one");
  await expect(listSelect(page, "年级")).toHaveValue("初二");
  await expect(listSelect(page, "科目")).toHaveValue("数学");
  await expect(listSelect(page, "校区")).toHaveValue("campus_b");
  await search(page).fill("");
  for (const label of ["班型筛选", "年级", "科目", "校区"]) await listSelect(page, label).selectOption("all");
  await listSelect(page, "课程状态").selectOption("paused");
  await expect(panel.getByRole("checkbox", { name: /^选择课程 / })).toHaveCount(3);
  for (const index of [2, 3, 4]) {
    await expect(rowChoice(page, index)).toBeVisible();
    const row = panel.locator('div[role="button"]').filter({ has: page.getByRole("checkbox", { name: "选择课程 合成课程" + String(index).padStart(4, "0"), exact: true }) });
    await expect(row.getByText("结课", { exact: true })).toBeVisible();
  }
  await listSelect(page, "课程状态").selectOption("all");
  await listSelect(page, "年级").selectOption("__unset");
  await expect(panel.getByRole("checkbox", { name: /^选择课程 / })).toHaveCount(1);
  await expect(rowChoice(page, 2)).toBeVisible();
  expect(session.saveCount).toBe(0);
  expect((await session.readSavedVault()).courseGroups).toEqual(vault.courseGroups);
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});

test("course batch status acts only on visible selections and preserves hidden checks and lesson snapshots", async ({ page, context }) => {
  const vault = archiveVault();
  const session = await openSyntheticWorkspace(page, context, vault);
  const panel = await openArchive(page);
  await rowChoice(page, 0).check();
  await rowChoice(page, 1).check();
  await search(page).fill("合成课程0000");
  const allVisible = panel.getByRole("checkbox", { name: /^选择当前筛选/ });
  await allVisible.uncheck();
  await expect(rowChoice(page, 0)).not.toBeChecked();
  await allVisible.check();
  await expect(rowChoice(page, 0)).toBeChecked();
  await panel.getByRole("button", { name: "结课", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "将选中的 1 个课程设为结课？", exact: true });
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  expect(session.saveCount).toBe(0);
  await expect(rowChoice(page, 0)).toBeChecked();
  await panel.getByRole("button", { name: "结课", exact: true }).click();
  await dialog.getByRole("button", { name: "结课", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).courseGroups[0].status).toBe("paused");
  let saved = await session.readSavedVault();
  expect(saved.courseGroups).toEqual(vault.courseGroups.map((course, index) => index === 0 ? { ...course, status: "paused" } : course));
  expect(saved.lessons).toEqual(vault.lessons);
  await expect(panel.getByText("结课完成：已处理 1 个课程档案。", { exact: true })).toBeVisible();
  await search(page).fill("");
  await expect(rowChoice(page, 1)).toBeChecked();
  await listSelect(page, "课程状态").selectOption("all");
  await expect(rowChoice(page, 0)).not.toBeChecked();
  await search(page).fill("合成课程0000");
  await rowChoice(page, 0).check();
  await panel.getByRole("button", { name: "启用", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).courseGroups[0].status).toBe("active");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await search(page).fill("");
  await expect(rowChoice(page, 1)).toBeChecked();
  await expect(rowChoice(page, 0)).not.toBeChecked();
  saved = await session.readSavedVault();
  expect(saved.courseGroups).toEqual(vault.courseGroups);
  expect(saved.students).toEqual(vault.students);
  expect(saved.lessons).toEqual(vault.lessons);
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});

test("course archive sync refreshes all filtered courses but only eligible future lesson snapshots", async ({ page, context }) => {
  const vault = createBenchmarkVault({ students: 12, courses: 3, lessons: 9 });
  vault.courseGroups[0] = { ...vault.courseGroups[0], name: "需同步甲", type: "one_on_one", studentIds: ["student_0"], defaultCampusId: "campus_b", feeRule: { mode: "fixed", fixedFee: 80 } };
  vault.courseGroups[1] = { ...vault.courseGroups[1], name: "需同步乙", type: "one_on_one", studentIds: ["student_1"], defaultCampusId: "campus_b", feeRule: { mode: "fixed", fixedFee: 90 } };
  vault.lessons = vault.lessons.map((lesson, index) => ({ ...lesson, courseGroupId: index === 7 ? "course_2" : [1, 5, 8].includes(index) ? "course_1" : "course_0", date: index === 0 ? "2026-11-06" : index === 3 ? "2026-11-05" : "2026-11-07", status: index === 1 || index === 6 ? "draft" : index === 4 ? "completed" : index === 5 ? "cancelled" : index === 8 ? "makeup_completed" : "scheduled", ...(index === 2 ? { linkedOriginalLessonId: "lesson_4" } : {}), note: "同步时保留备注" }));
  const session = await openSyntheticWorkspace(page, context, vault);
  const panel = await openArchive(page);
  await search(page).fill("需同步");
  await panel.getByRole("checkbox", { name: "选择课程 需同步甲", exact: true }).check();
  await panel.getByRole("button", { name: "同步当前筛选课程", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "同步当前筛选课程？", exact: true });
  await expect(dialog).toContainText("2 个课程档案，刷新 3 节未来待上课课节");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  expect(session.saveCount).toBe(0);
  await panel.getByRole("button", { name: "同步当前筛选课程", exact: true }).click();
  await dialog.getByRole("button", { name: "同步刷新", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).lessons[0].feeSnapshot.amount).toBe(80);
  const saved = await session.readSavedVault();
  for (const index of [0, 1, 6]) {
    const lesson = saved.lessons[index];
    const course = vault.courseGroups[index === 1 ? 1 : 0];
    expect(lesson).toMatchObject({ type: "one_on_one", campusId: "campus_b", expectedStudentIds: course.studentIds, note: "同步时保留备注", content: vault.lessons[index].content, feeSnapshot: { amount: index === 1 ? 90 : 80 } });
    expect(lesson.attendance.map(entry => entry.studentId)).toEqual(course.studentIds);
  }
  for (const index of [2, 3, 4, 5, 7, 8]) expect(saved.lessons[index]).toEqual(vault.lessons[index]);
  expect(saved.courseGroups).toEqual(vault.courseGroups);
  expect(saved.students).toEqual(vault.students);
  await expect(panel.getByText("同步完成：已刷新 2 个课程档案下的 3 节未来待上课课节。", { exact: true })).toBeVisible();
  await expect(panel.getByRole("checkbox", { name: "选择课程 需同步甲", exact: true })).toBeChecked();
  await expect(panel.getByRole("checkbox", { name: "选择课程 需同步乙", exact: true })).not.toBeChecked();
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});

test("course deletion protects current lesson references and retains the original recycle-bin boundary", async ({ page, context }) => {
  const vault = archiveVault();
  vault.lessons[1] = { ...vault.lessons[1], status: "cancelled" };
  vault.deletedLessons = [{ id: "recycled", lesson: { ...vault.lessons[0], id: "deleted-lesson", courseGroupId: "course_2" }, deletedAt: "2026-11-05T00:00:00.000Z", source: "manual" }];
  const session = await openSyntheticWorkspace(page, context, vault);
  const panel = await openArchive(page);
  await listSelect(page, "课程状态").selectOption("all");
  await expect(panel.getByRole("button", { name: "删除课程 合成课程0000", exact: true })).toBeDisabled();
  await expect(panel.getByRole("button", { name: "删除课程 合成课程0001", exact: true })).toBeEnabled();
  await rowChoice(page, 2).check();
  await panel.getByRole("button", { name: "删除课程 合成课程0002", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "删除课程「合成课程0002」？", exact: true });
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  expect(session.saveCount).toBe(0);
  await expect(rowChoice(page, 2)).toBeChecked();
  await panel.getByRole("button", { name: "删除课程 合成课程0002", exact: true }).click();
  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).courseGroups.length).toBe(4);
  const saved = await session.readSavedVault();
  expect(saved.courseGroups).toEqual(vault.courseGroups.filter(course => course.id !== "course_2"));
  expect(saved.lessons).toEqual(vault.lessons);
  expect(saved.deletedLessons).toEqual(vault.deletedLessons);
  expect(saved.students).toEqual(vault.students);
  await expect(rowChoice(page, 2)).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "结课", exact: true })).toBeDisabled();
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});

test("deleting a course type resets only its course-list filter and retains hidden selections", async ({ page, context }) => {
  const vault = archiveVault();
  vault.preferences!.customCourseTypes = [{ id: "custom_archive", label: "列表临时班型" }];
  const session = await openSyntheticWorkspace(page, context, vault);
  const panel = await openArchive(page);
  await rowChoice(page, 0).check();
  await listSelect(page, "班型筛选").selectOption("custom_archive");
  await listSelect(page, "年级").selectOption("初二");
  await listSelect(page, "科目").selectOption("数学");
  await listSelect(page, "校区").selectOption("campus_b");
  await search(page).fill("0001");
  await expect(panel.getByRole("checkbox", { name: /^选择课程 / })).toHaveCount(0);
  await page.getByRole("button", { name: "校区与班型", exact: true }).click();
  const card = page.locator('div[class~="space-y-3"][class~="p-3"]').filter({ has: page.locator("span").getByText("列表临时班型", { exact: true }) });
  await card.getByRole("button", { name: "删除", exact: true }).click();
  await page.getByRole("dialog", { name: "删除班型「列表临时班型」？", exact: true }).getByRole("button", { name: "删除", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).preferences?.customCourseTypes?.length).toBe(0);
  await page.getByRole("button", { name: "添加课程档案", exact: true }).click();
  await expect(listSelect(page, "班型筛选")).toHaveValue("all");
  await expect(listSelect(page, "年级")).toHaveValue("初二");
  await expect(listSelect(page, "科目")).toHaveValue("数学");
  await expect(listSelect(page, "校区")).toHaveValue("campus_b");
  await expect(search(page)).toHaveValue("0001");
  await expect(rowChoice(page, 1)).toBeVisible();
  for (const label of ["年级", "科目", "校区"]) await listSelect(page, label).selectOption("all");
  await search(page).fill("");
  await expect(rowChoice(page, 0)).toBeChecked();
  const saved = await session.readSavedVault();
  expect(saved.courseGroups).toEqual(vault.courseGroups);
  expect(saved.lessons).toEqual(vault.lessons);
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});
