import { expect, test, type Page } from "@playwright/test";
import { SUBSTITUTE_CLASS_COURSE_GROUP_ID } from "../../src/shared/types";
import { benchmarkDate, createBenchmarkVault } from "./fixtures";
import { openSyntheticWorkspace } from "./session";

function typeCard(page: Page, label: string) {
  return page.locator('div[class~="space-y-3"][class~="p-3"]').filter({ has: page.locator("span").getByText(label, { exact: true }) });
}
function editingTypeCard(page: Page) {
  return page.locator('div[class~="space-y-3"][class~="p-3"]').filter({ has: page.getByRole("button", { name: "保存", exact: true }) });
}
function settingsVault(lessons = 3) {
  const vault = createBenchmarkVault({ students: 12, courses: 1, lessons });
  vault.profile.homeCampusId = "campus_a";
  vault.profile.defaultSalaryGradeId = "custom_salary_browser";
  vault.profile.salaryGradeRules = [{ id: "custom_salary_browser", label: "回归测试等级", baseSalary: 3000, oneOnOneFee: 80, classBaseFee: 180, headcountIncrementFee: 10 }];
  return vault;
}
async function openSettings(page: Page) {
  await page.getByRole("button", { name: "档案信息", exact: true }).click();
  await page.getByRole("button", { name: "校区与班型", exact: true }).click();
}

test("course type naming preserves duplicate checks, edit cancellation and draft fallback after deletion", async ({ page, context }) => {
  const vault = settingsVault();
  const session = await openSyntheticWorkspace(page, context, vault);
  await openSettings(page);
  const name = page.getByPlaceholder("自定义班级名称，例如：一对一、一对二、班课");
  await name.fill(" 小 班 课 ");
  await page.getByRole("button", { name: "添加班型", exact: true }).click();
  await expect(page.getByText("已存在班型「小班课」，不能重复添加同名班型。", { exact: true })).toBeVisible();
  expect(session.saveCount).toBe(0);
  await name.fill("  回归自定义  ");
  await page.getByRole("combobox", { name: "选择自定义班型计费规则", exact: true }).selectOption("non_class");
  await page.getByRole("button", { name: "添加课程档案", exact: true }).click();
  await page.getByRole("button", { name: "校区与班型", exact: true }).click();
  await expect(name).toHaveValue("  回归自定义  ");
  await page.getByRole("button", { name: "添加班型", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).preferences?.customCourseTypes?.some(type => type.label === "回归自定义")).toBe(true);
  let saved = await session.readSavedVault();
  const created = saved.preferences!.customCourseTypes!.find(type => type.label === "回归自定义")!;
  expect(saved.preferences!.courseTypeFeeRules![created.id]).toMatchObject({ mode: "class_headcount", baseFee: 80, perPresentStudentFee: 10, classFeeTiers: [{ minStudents: 1, baseFee: 80 }] });
  expect(saved.preferences!.courseTypeFeeRules![created.id]!.billableStudentCap).toBeUndefined();
  await expect(name).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "选择自定义班型计费规则", exact: true })).toHaveValue("class");
  await typeCard(page, "回归自定义").getByRole("button", { name: "改名", exact: true }).click();
  await editingTypeCard(page).locator('input[maxlength="24"]').fill("取消的名称");
  await editingTypeCard(page).getByRole("button", { name: "取消", exact: true }).click();
  expect((await session.readSavedVault()).preferences!.customCourseTypes!.find(type => type.id === created.id)!.label).toBe("回归自定义");
  await typeCard(page, "回归自定义").getByRole("button", { name: "改名", exact: true }).click();
  await editingTypeCard(page).locator('input[maxlength="24"]').fill("  改名后班型  ");
  await editingTypeCard(page).getByRole("button", { name: "保存", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).preferences!.customCourseTypes!.find(type => type.id === created.id)!.label).toBe("改名后班型");
  await page.getByRole("button", { name: "添加课程档案", exact: true }).click();
  const courseForm = page.locator('form[data-onboarding="course-form"]');
  const courseType = courseForm.locator("select").filter({ has: page.locator('option[value="trial"]') });
  await courseType.selectOption(created.id);
  await page.getByRole("button", { name: "校区与班型", exact: true }).click();
  await typeCard(page, "改名后班型").getByRole("button", { name: "删除", exact: true }).click();
  const deletion = page.getByRole("dialog", { name: "删除班型「改名后班型」？", exact: true });
  await deletion.getByRole("button", { name: "取消", exact: true }).click();
  expect((await session.readSavedVault()).preferences!.customCourseTypes!.some(type => type.id === created.id)).toBe(true);
  await typeCard(page, "改名后班型").getByRole("button", { name: "删除", exact: true }).click();
  await deletion.getByRole("button", { name: "删除", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).preferences!.customCourseTypes!.some(type => type.id === created.id)).toBe(false);
  await page.getByRole("button", { name: "添加课程档案", exact: true }).click();
  await expect(courseType).not.toHaveValue(created.id);
  saved = await session.readSavedVault();
  expect(saved.courseGroups).toEqual(vault.courseGroups);
  expect(saved.lessons).toEqual(vault.lessons);
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});

test("course type fee sync changes only confirmed course defaults and future eligible lessons", async ({ page, context }) => {
  const vault = settingsVault(5);
  vault.lessons[1] = { ...vault.lessons[1], status: "scheduled", date: benchmarkDate };
  vault.lessons[2] = { ...vault.lessons[2], status: "draft", date: "2026-11-07" };
  vault.lessons[3] = { ...vault.lessons[3], status: "scheduled", date: "2026-11-05" };
  vault.lessons[4] = { ...vault.lessons[4], status: "cancelled", date: "2026-11-07" };
  const session = await openSyntheticWorkspace(page, context, vault);
  await openSettings(page);
  const card = typeCard(page, "小班课");
  await card.getByPlaceholder("不封顶").fill("6");
  await expect.poll(async () => (await session.readSavedVault()).preferences?.courseTypeFeeRules?.small_class?.billableStudentCap).toBe(6);
  let saved = await session.readSavedVault();
  expect(saved.courseGroups).toEqual(vault.courseGroups);
  expect(saved.lessons).toEqual(vault.lessons);
  await card.getByRole("button", { name: "同步到已有课程", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "同步「小班课」到已有课程？", exact: true });
  await expect(dialog).toContainText("刷新 2 节未来待上课课节");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  expect((await session.readSavedVault()).courseGroups).toEqual(vault.courseGroups);
  await card.getByRole("button", { name: "同步到已有课程", exact: true }).click();
  await dialog.getByRole("button", { name: "同步更改", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).courseGroups[0].feeRule.mode).toBe("salary_grade");
  saved = await session.readSavedVault();
  expect(saved.courseGroups[0].feeRule).toMatchObject({ mode: "salary_grade", salaryGradeSource: "teacher_default", salaryGradeId: "custom_salary_browser" });
  for (const index of [1, 2]) expect(saved.lessons[index].feeSnapshot.amount).toBe(180);
  for (const index of [0, 3, 4]) expect(saved.lessons[index]).toEqual(vault.lessons[index]);
  expect(saved.students).toEqual(vault.students);
  await expect(card.getByRole("button", { name: "删除", exact: true })).toBeDisabled();
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});

for (const mode of ["type_only", "full_refresh"] as const) {
  test("course type migration preserves mode-specific history and referenced type protection: " + mode, async ({ page, context }) => {
    const vault = settingsVault(4);
    vault.preferences = { ...vault.preferences!, customCourseTypes: [{ id: "custom_old", label: "旧自定义班型" }] };
    vault.courseGroups.push({ ...vault.courseGroups[0], id: "still_old", name: "仍使用旧班型的课程", type: "custom_old" });
    vault.lessons[0] = { ...vault.lessons[0], type: "custom_old", expectedStudentIds: ["student_0"], attendance: [{ studentId: "student_0", status: "attended" }], feeSnapshot: { amount: 137, hours: 2 } };
    vault.lessons[1] = { ...vault.lessons[1], courseGroupId: "missing", type: "custom_old", feeSnapshot: { amount: 88, hours: 2 } };
    vault.lessons[2] = { ...vault.lessons[2], courseGroupId: SUBSTITUTE_CLASS_COURSE_GROUP_ID, type: "custom_old", lessonSource: "substitute_class", substituteClass: { presentStudentCount: 6, salaryGradeStage: "junior_3" }, feeSnapshot: { amount: 72, hours: 2 } };
    vault.lessons[3] = { ...vault.lessons[3], courseGroupId: "still_old", type: "custom_old" };
    const session = await openSyntheticWorkspace(page, context, vault);
    await openSettings(page);
    const card = typeCard(page, "旧自定义班型");
    await expect(card.getByRole("button", { name: "删除", exact: true })).toBeDisabled();
    await card.getByRole("combobox", { name: "选择孤儿课节的目标班型", exact: true }).selectOption("big_class");
    await card.getByRole("button", { name: "一键迁移课节", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "迁移「旧自定义班型」的 3 节旧课节？", exact: true });
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    expect((await session.readSavedVault()).lessons).toEqual(vault.lessons);
    await card.getByRole("button", { name: "一键迁移课节", exact: true }).click();
    await dialog.getByRole("button", { name: mode === "type_only" ? "只改班型标记" : "完整刷新（重算金额）", exact: true }).click();
    await expect.poll(async () => (await session.readSavedVault()).lessons[0].type).toBe("small_class");
    const saved = await session.readSavedVault();
    expect(saved.lessons[1]).toEqual({ ...vault.lessons[1], type: "big_class" });
    expect(saved.lessons[2]).toEqual({ ...vault.lessons[2], type: "small_class" });
    expect(saved.lessons[3]).toEqual(vault.lessons[3]);
    if (mode === "type_only") {
      expect(saved.lessons[0]).toEqual({ ...vault.lessons[0], type: "small_class" });
    } else {
      expect(saved.lessons[0].feeSnapshot.amount).toBe(100);
      expect(saved.lessons[0].expectedStudentIds).toEqual(vault.courseGroups[0].studentIds);
      expect(saved.lessons[0].attendance.map(entry => entry.studentId)).toEqual(vault.courseGroups[0].studentIds);
      expect(saved.lessons[0].content).toEqual(vault.lessons[0].content);
    }
    expect(saved.courseGroups).toEqual(vault.courseGroups);
    expect(saved.students).toEqual(vault.students);
    await expect(page.getByText(/同步完成：已迁移 3 节课节/)).toContainText("另有 1 节课节");
    await expect(card.getByRole("button", { name: "删除", exact: true })).toBeDisabled();
    expect(session.pageErrors).toEqual([]);
    expect(session.unexpectedRequests).toEqual([]);
  });
}
