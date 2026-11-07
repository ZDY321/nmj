import { expect, test, type Page } from "@playwright/test";
import { createBenchmarkVault } from "./fixtures";
import { openSyntheticWorkspace } from "./session";

function studentDialog(page: Page) {
  return page.locator("div.fixed").filter({ has: page.getByRole("button", { name: "关闭学生编辑弹窗", exact: true }) });
}
function studentStatusFilter(page: Page) {
  return page.locator("select").filter({ has: page.locator('option[value="archived"]') });
}

test("student editor preserves cancel and status-specific course draft behavior", async ({ page, context }) => {
  const vault = createBenchmarkVault({ students: 12, courses: 1, lessons: 3 });
  vault.profile.homeCampusId = "campus_a";
  const session = await openSyntheticWorkspace(page, context, vault);
  await page.getByRole("button", { name: "档案信息", exact: true }).click();
  await page.getByRole("button", { name: "添加课程档案", exact: true }).click();
  const form = page.locator('form[data-onboarding="course-form"]');
  await form.getByRole("button", { name: /^合成学生0001 ·/ }).click();
  await page.getByRole("button", { name: "学生列表", exact: true }).click();
  await page.getByRole("button", { name: "编辑学生 合成学生0001", exact: true }).click();
  let editor = studentDialog(page);
  await editor.getByPlaceholder("学生姓名").fill("取消的学生草稿");
  await editor.getByPlaceholder("所在学校").fill("取消的学校");
  const beforeCancel = session.saveCount;
  await editor.getByRole("button", { name: "取消", exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(session.saveCount).toBe(beforeCancel);
  expect((await session.readSavedVault()).students.find(student => student.id === "student_1")).toEqual(vault.students[1]);

  await page.getByRole("button", { name: "编辑学生 合成学生0001", exact: true }).click();
  editor = studentDialog(page);
  await expect(editor.getByPlaceholder("学生姓名")).toHaveValue("合成学生0001");
  await editor.getByPlaceholder("学生姓名").fill("   ");
  await expect(editor.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
  await editor.getByPlaceholder("学生姓名").fill("  学生编辑回归  ");
  await editor.getByPlaceholder("所在学校").fill("新学校");
  await editor.locator("select").filter({ has: page.locator('option[value="transition"]') }).selectOption("transition");
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(async () => (await session.readSavedVault()).students.find(student => student.id === "student_1")?.status).toBe("transition");
  expect((await session.readSavedVault()).students.find(student => student.id === "student_1")).toMatchObject({ name: "学生编辑回归", school: "新学校" });
  await page.getByRole("button", { name: "添加课程档案", exact: true }).click();
  await expect(form.getByRole("button", { name: "学生编辑回归", exact: true })).toBeVisible();
  await expect(form.getByPlaceholder("课程档案名称")).toHaveValue("学生编辑回归");

  await page.getByRole("button", { name: "学生列表", exact: true }).click();
  await studentStatusFilter(page).selectOption("all");
  await page.getByRole("button", { name: "编辑学生 学生编辑回归", exact: true }).click();
  editor = studentDialog(page);
  await editor.locator("select").filter({ has: page.locator('option[value="transition"]') }).selectOption("paused");
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(async () => (await session.readSavedVault()).students.find(student => student.id === "student_1")?.status).toBe("paused");
  await page.getByRole("button", { name: "添加课程档案", exact: true }).click();
  await expect(form.getByRole("button", { name: /学生编辑回归/ })).toHaveCount(0);
  await expect(form.getByPlaceholder("课程档案名称")).toHaveValue("");
  const courseCampus = form.locator("select").filter({ has: page.locator("option").getByText("未设置校区", { exact: true }) });
  await expect(courseCampus).toHaveValue("campus_b");
  const saved = await session.readSavedVault();
  expect(saved.lessons).toEqual(vault.lessons);
  expect(saved.courseGroups).toEqual(vault.courseGroups);
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});

test("student batch actions affect only selected visible rows and retain hidden selections", async ({ page, context }) => {
  const vault = createBenchmarkVault({ students: 12, courses: 1, lessons: 3 });
  vault.preferences!.grades = ["初二", "初一", "初三"];
  vault.students[0].grade = "初一";
  vault.students[1].grade = "初二";
  const session = await openSyntheticWorkspace(page, context, vault);
  await page.getByRole("button", { name: "档案信息", exact: true }).click();
  await page.getByRole("button", { name: "学生列表", exact: true }).click();
  await page.getByRole("checkbox", { name: "选择学生 合成学生0000", exact: true }).check();
  await page.getByRole("checkbox", { name: "选择学生 合成学生0001", exact: true }).check();
  const search = page.getByPlaceholder("搜索学生姓名、学校或备注");
  await search.fill("合成学生0001");
  await page.getByRole("button", { name: "升一年级", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).students.find(student => student.id === "student_1")?.grade).toBe("初一");
  expect((await session.readSavedVault()).students.find(student => student.id === "student_0")?.grade).toBe("初一");
  await search.fill("");
  await expect(page.getByRole("checkbox", { name: "选择学生 合成学生0000", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "选择学生 合成学生0001", exact: true })).not.toBeChecked();
  await page.getByRole("checkbox", { name: "选择学生 合成学生0001", exact: true }).check();
  await search.fill("合成学生0000");
  await page.getByRole("button", { name: "归档", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "归档选中的 1 个学生？", exact: true });
  const beforeCancel = session.saveCount;
  await confirmation.getByRole("button", { name: "取消", exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  expect(session.saveCount).toBe(beforeCancel);
  await expect(page.getByRole("checkbox", { name: "选择学生 合成学生0000", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "归档", exact: true }).click();
  await confirmation.getByRole("button", { name: "归档", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).students.find(student => student.id === "student_0")?.status).toBe("paused");
  await search.fill("");
  await expect(page.getByRole("checkbox", { name: "选择学生 合成学生0001", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "设为过渡期", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).students.find(student => student.id === "student_1")?.status).toBe("transition");
  await studentStatusFilter(page).selectOption("all");
  await expect(page.getByRole("checkbox", { name: "选择学生 合成学生0000", exact: true })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "选择学生 合成学生0001", exact: true })).not.toBeChecked();
  const saved = await session.readSavedVault();
  expect(saved.students.slice(2)).toEqual(vault.students.slice(2));
  expect(saved.lessons).toEqual(vault.lessons);
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});

test("student deletion retains referenced archives and requires confirmation for unused rows", async ({ page, context }) => {
  const vault = createBenchmarkVault({ students: 12, courses: 1, lessons: 3 });
  for (const index of [0, 9, 10, 11]) vault.students[index].status = "paused";
  vault.gradeRecords = [{ id: "student-grade", studentId: "student_9", subject: "数学", examName: "回归测试", date: "2026-11-06", score: 90 }];
  const session = await openSyntheticWorkspace(page, context, vault);
  await page.getByRole("button", { name: "档案信息", exact: true }).click();
  await page.getByRole("button", { name: "学生列表", exact: true }).click();
  await studentStatusFilter(page).selectOption("archived");
  for (const index of [0, 9, 10, 11]) {
    await page.getByRole("checkbox", { name: "选择学生 合成学生" + String(index).padStart(4, "0"), exact: true }).check();
  }
  await expect(page.getByRole("button", { name: "删除归档学生 合成学生0000", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "删除归档学生 合成学生0009", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "删除归档 2", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "删除选中的 2 个归档学生？", exact: true });
  await expect(confirmation).toContainText("另有 2 个学生已有历史记录");
  await confirmation.getByRole("button", { name: "取消", exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  expect((await session.readSavedVault()).students).toEqual(vault.students);
  await page.getByRole("button", { name: "删除归档 2", exact: true }).click();
  await confirmation.getByRole("button", { name: "删除", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).students.length).toBe(10);
  const saved = await session.readSavedVault();
  expect(saved.students).toEqual(vault.students.filter(student => !["student_10", "student_11"].includes(student.id)));
  expect(saved.lessons).toEqual(vault.lessons);
  expect(saved.courseGroups).toEqual(vault.courseGroups);
  expect(saved.gradeRecords).toEqual(vault.gradeRecords);
  await expect(page.getByRole("checkbox", { name: "选择学生 合成学生0000", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "选择学生 合成学生0009", exact: true })).toBeChecked();
  await expect(page.getByRole("button", { name: /^删除归档\s*$/ })).toBeDisabled();
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});
