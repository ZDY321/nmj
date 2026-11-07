import { expect, test, type Page } from "@playwright/test";
import type { TeacherVault } from "../../src/shared/types";
import { createBenchmarkVault } from "./fixtures";
import { openSyntheticWorkspace } from "./session";

function transferVault() {
  const vault = createBenchmarkVault({ students: 12, courses: 6, lessons: 9 });
  vault.profile.homeCampusId = "campus_a";
  vault.profile.defaultSalaryGradeId = "custom_salary_browser";
  vault.profile.salaryGradeRules = [{ id: "custom_salary_browser", label: "回归测试等级", baseSalary: 3000, oneOnOneFee: 80, classBaseFee: 180, headcountIncrementFee: 10 }];
  vault.preferences = { ...vault.preferences!, subjects: ["语文", "数学", "英语"], courseTypeFeeRules: { trial: { mode: "fixed", fixedFee: 75 } } };
  const rosters = [["student_0"], ["student_0", "student_1"], ["student_0", "student_2"], ["student_3"], ["student_4"], ["student_0"]];
  vault.courseGroups = vault.courseGroups.map((course, index) => ({ ...course, subject: index === 2 ? "语文" : index === 4 ? "英语" : "数学", studentIds: rosters[index], defaultCampusId: index === 4 ? "campus_b" : "campus_a", status: index === 5 ? "paused" : "active" }));
  const statuses = ["completed", "scheduled", "draft", "cancelled", "makeup_pending", "makeup_completed"] as const;
  vault.lessons = vault.lessons.map((lesson, index) => ({ ...lesson, date: index === 0 ? "2026-11-05" : "2026-11-07", status: statuses[index % statuses.length], expectedStudentIds: [...vault.courseGroups[index % 6].studentIds], attendance: vault.courseGroups[index % 6].studentIds.map(studentId => ({ studentId, status: "attended" })) }));
  // The app clears legacy scheduleRules on startup; use the current empty format here.
  return vault;
}
function transferPanel(page: Page) {
  return page.locator('div[class~="overflow-hidden"][class~="rounded-[18px]"]').filter({ has: page.getByRole("heading", { name: "学生课程关系", exact: true }) });
}
function transferField(page: Page, label: string) {
  return transferPanel(page).locator('div[class~="space-y-2"]').filter({ has: page.locator("label").getByText(label, { exact: true }) });
}
function transferSelect(page: Page, label: string) { return transferField(page, label).locator("select"); }
async function openTransfer(page: Page) {
  await page.getByRole("button", { name: "档案信息", exact: true }).click();
  await page.getByRole("button", { name: "学生列表", exact: true }).click();
  const panel = transferPanel(page);
  await expect(panel.getByRole("button", { name: "保存调整", exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "展开", exact: true }).click();
  return panel;
}
function expectSnapshotsUnchanged(saved: TeacherVault, initial: TeacherVault) {
  expect(saved.students).toEqual(initial.students);
  expect(saved.lessons).toEqual(initial.lessons);
  expect(saved.scheduleRules).toEqual(initial.scheduleRules);
}

test("transfer creates courses with original trial and salary defaults while retaining draft choices", async ({ page, context }) => {
  const vault = transferVault();
  const session = await openSyntheticWorkspace(page, context, vault);
  const panel = await openTransfer(page);
  const name = transferField(page, "课程档案名称").locator("input");
  const subject = transferSelect(page, "科目");
  const campus = transferSelect(page, "默认校区");
  await transferSelect(page, "学生").selectOption("student_0");
  await transferSelect(page, "新班型").selectOption("trial");
  await subject.selectOption("数学");
  await campus.selectOption("campus_b");
  await name.fill("  调班新试听课  ");
  await panel.getByRole("button", { name: "加入已有", exact: true }).click();
  await expect(panel.getByRole("button", { name: "保存调整", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "新建档案", exact: true }).click();
  await panel.getByRole("button", { name: "收起", exact: true }).click();
  await page.getByRole("button", { name: "添加课程档案", exact: true }).click();
  await page.getByRole("button", { name: "学生列表", exact: true }).click();
  await panel.getByRole("button", { name: "展开", exact: true }).click();
  await expect(name).toHaveValue("  调班新试听课  ");
  await expect(subject).toHaveValue("数学");
  await expect(campus).toHaveValue("campus_b");
  await expect(panel.getByRole("checkbox")).not.toBeChecked();
  await panel.getByRole("button", { name: "保存调整", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).courseGroups.length).toBe(7);
  let saved = await session.readSavedVault();
  expect(saved.courseGroups.slice(0, 6)).toEqual(vault.courseGroups);
  expect(saved.courseGroups[6]).toEqual({ id: expect.stringMatching(/^course_/), name: "调班新试听课", type: "trial", subject: "数学", defaultCampusId: "campus_b", studentIds: ["student_0"], feeRule: { mode: "fixed", fixedFee: 75 }, status: "active" });
  await expect(name).toHaveValue("");
  await expect(subject).toHaveValue("数学");
  await expect(campus).toHaveValue("campus_b");
  await expect(panel.getByText("已为「合成学生0000」新建「调班新试听课」。已有课时不受影响。", { exact: true })).toBeVisible();
  expectSnapshotsUnchanged(saved, vault);
  await transferSelect(page, "新班型").selectOption("one_on_one");
  await panel.getByRole("button", { name: "保存调整", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).courseGroups.length).toBe(8);
  saved = await session.readSavedVault();
  expect(saved.courseGroups[7]).toEqual({ id: expect.stringMatching(/^course_/), name: "合成学生0000一对一", type: "one_on_one", subject: "数学", defaultCampusId: "campus_b", studentIds: ["student_0"], feeRule: { mode: "salary_grade", salaryGradeSource: "teacher_default", salaryGradeId: "custom_salary_browser" }, status: "active" });
  expect(saved.courseGroups.slice(0, 6)).toEqual(vault.courseGroups);
  expectSnapshotsUnchanged(saved, vault);
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});

test("joining an existing target removes only old same-subject memberships and preserves lesson snapshots", async ({ page, context }) => {
  const vault = transferVault();
  const session = await openSyntheticWorkspace(page, context, vault);
  const panel = await openTransfer(page);
  const name = transferField(page, "课程档案名称").locator("input");
  await name.fill("保留新建草稿");
  await transferSelect(page, "新班型").selectOption("small_class");
  await transferSelect(page, "科目").selectOption("语文");
  await transferSelect(page, "默认校区").selectOption("campus_a");
  await panel.getByRole("button", { name: "加入已有", exact: true }).click();
  const target = transferSelect(page, "目标课程");
  await expect(target.locator("option")).toHaveCount(2);
  await target.selectOption("course_3");
  await panel.getByRole("checkbox", { name: "转班后从旧同科目课程档案中移除该学生", exact: true }).check();
  await panel.getByRole("button", { name: "保存调整", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).courseGroups[3].studentIds).toEqual(["student_3", "student_0"]);
  const saved = await session.readSavedVault();
  expect(saved.courseGroups).toEqual(vault.courseGroups.map((course, index) => index === 0 || index === 5 ? { ...course, studentIds: [], status: "paused" } : index === 1 ? { ...course, studentIds: ["student_1"] } : index === 3 ? { ...course, studentIds: ["student_3", "student_0"] } : course));
  expectSnapshotsUnchanged(saved, vault);
  await expect(panel.getByText("已将「合成学生0000」调整到「合成课程0003」。已有课时不受影响。", { exact: true })).toBeVisible();
  await expect(transferSelect(page, "科目")).toHaveValue("语文");
  // The old course still has another student, so it becomes an eligible target again.
  await expect(target).toHaveValue("course_1");
  await expect(target.locator("option")).toHaveCount(2);
  await expect(target.locator('option[value="course_3"]')).toHaveCount(0);
  await panel.getByRole("button", { name: "新建档案", exact: true }).click();
  await expect(name).toHaveValue("保留新建草稿");
  await expect(panel.getByRole("checkbox")).toBeChecked();
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});

test("new-course transfer can end old same-subject relationships without changing scheduled lessons", async ({ page, context }) => {
  const vault = transferVault();
  const session = await openSyntheticWorkspace(page, context, vault);
  const panel = await openTransfer(page);
  await transferSelect(page, "科目").selectOption("数学");
  await transferField(page, "课程档案名称").locator("input").fill("替换旧数学关系");
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "保存调整", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).courseGroups.length).toBe(7);
  const saved = await session.readSavedVault();
  expect(saved.courseGroups.slice(0, 6)).toEqual(vault.courseGroups.map((course, index) => index === 0 || index === 5 ? { ...course, studentIds: [], status: "paused" } : index === 1 ? { ...course, studentIds: ["student_1"] } : course));
  expect(saved.courseGroups[6]).toMatchObject({ name: "替换旧数学关系", type: "trial", subject: "数学", studentIds: ["student_0"], status: "active" });
  expectSnapshotsUnchanged(saved, vault);
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});

test("transfer options exclude archived students, mismatched grades and full one-on-one courses", async ({ page, context }) => {
  const vault = transferVault();
  vault.students[3] = { ...vault.students[3], grade: "初二" };
  vault.students[11] = { ...vault.students[11], grade: undefined, status: "transition" };
  vault.courseGroups[5] = { ...vault.courseGroups[5], type: "one_on_one", status: "active", studentIds: ["student_5"] };
  const session = await openSyntheticWorkspace(page, context, vault);
  const panel = await openTransfer(page);
  await expect(transferSelect(page, "学生").locator('option[value="student_10"]')).toHaveCount(0);
  await expect(transferSelect(page, "学生").locator('option[value="student_11"]')).toHaveCount(1);
  await panel.getByRole("button", { name: "加入已有", exact: true }).click();
  const submit = panel.getByRole("button", { name: "保存调整", exact: true });
  await expect(submit).toBeDisabled();
  await expect(panel.getByText("当前没有可加入的同班型课程，可以切换为新建档案。", { exact: true })).toBeVisible();
  await transferSelect(page, "新班型").selectOption("small_class");
  const target = transferSelect(page, "目标课程");
  await expect(target.locator("option")).toHaveCount(1);
  await expect(target).toHaveValue("course_4");
  await expect(submit).toBeEnabled();
  await transferSelect(page, "学生").selectOption("student_11");
  await expect(submit).toBeDisabled();
  await transferSelect(page, "学生").selectOption("student_0");
  await transferSelect(page, "新班型").selectOption("one_on_one");
  await expect(submit).toBeDisabled();
  await expect(target.locator("option")).toHaveCount(0);
  expect(session.saveCount).toBe(0);
  expectSnapshotsUnchanged(await session.readSavedVault(), vault);
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});

test("course type deletion resets the transfer type while preserving the rest of its draft", async ({ page, context }) => {
  const vault = transferVault();
  vault.preferences!.customCourseTypes = [{ id: "custom_transfer", label: "调班临时班型" }];
  const session = await openSyntheticWorkspace(page, context, vault);
  const panel = await openTransfer(page);
  const type = transferSelect(page, "新班型");
  const name = transferField(page, "课程档案名称").locator("input");
  await type.selectOption("custom_transfer");
  await name.fill("删除班型后保留");
  await transferSelect(page, "科目").selectOption("英语");
  await transferSelect(page, "默认校区").selectOption("campus_b");
  await panel.getByRole("checkbox").check();
  await page.getByRole("button", { name: "校区与班型", exact: true }).click();
  const card = page.locator('div[class~="space-y-3"][class~="p-3"]').filter({ has: page.locator("span").getByText("调班临时班型", { exact: true }) });
  await card.getByRole("button", { name: "删除", exact: true }).click();
  const deletion = page.getByRole("dialog", { name: "删除班型「调班临时班型」？", exact: true });
  await deletion.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "学生列表", exact: true }).click();
  await expect(type).toHaveValue("custom_transfer");
  await expect(name).toHaveValue("删除班型后保留");
  await page.getByRole("button", { name: "校区与班型", exact: true }).click();
  await card.getByRole("button", { name: "删除", exact: true }).click();
  await deletion.getByRole("button", { name: "删除", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).preferences?.customCourseTypes?.length).toBe(0);
  await page.getByRole("button", { name: "学生列表", exact: true }).click();
  const fallback = await type.locator("option").first().getAttribute("value");
  expect(fallback).toBeTruthy();
  await expect(type).toHaveValue(fallback!);
  await expect(type.locator('option[value="custom_transfer"]')).toHaveCount(0);
  await expect(name).toHaveValue("删除班型后保留");
  await expect(transferSelect(page, "科目")).toHaveValue("英语");
  await expect(transferSelect(page, "默认校区")).toHaveValue("campus_b");
  await expect(panel.getByRole("checkbox")).toBeChecked();
  const saved = await session.readSavedVault();
  expect(saved.courseGroups).toEqual(vault.courseGroups);
  expectSnapshotsUnchanged(saved, vault);
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});
