import { expect, test, type Locator, type Page } from "@playwright/test";
import { createBenchmarkVault } from "./fixtures";
import { openSyntheticWorkspace } from "./session";

function feeInput(scope: Locator, label: string) {
  return scope.locator("div.space-y-1").filter({ has: scope.page().locator("label").getByText(label, { exact: true }) }).locator("input");
}
function editorDialog(page: Page) {
  return page.locator("div.fixed").filter({ has: page.getByRole("button", { name: "关闭课程编辑弹窗" }) });
}

test("course forms preserve fees, hidden amounts, cancel and save behavior", async ({ page, context }) => {
  const vault = createBenchmarkVault({ students: 12, courses: 2, lessons: 8 });
  vault.courseGroups[0].feeRule = { mode: "class_headcount", classFeeTiers: [{ id: "tier", minStudents: 2, baseFee: 120, perStudentFee: 15 }], makeupFeeMode: "custom" };
  vault.courseGroups[1].feeRule = { mode: "hourly", hourlyRate: 50 };
  const originalCourse = structuredClone(vault.courseGroups[0]);
  const session = await openSyntheticWorkspace(page, context, vault);
  await page.getByRole("button", { name: "档案信息", exact: true }).click();
  await page.getByRole("button", { name: "添加课程档案", exact: true }).click();
  const form = page.locator('form[data-onboarding="course-form"]');

  // Amounts start hidden; headcount remains editable in both forms.
  await expect(feeInput(form, "最少人数")).toBeVisible();
  await expect(feeInput(form, "基础费用")).toHaveCount(0);
  await page.getByRole("button", { name: "编辑课程 合成课程0000", exact: true }).click();
  let dialog = editorDialog(page);
  await expect(feeInput(dialog, "最少人数")).toHaveValue("2");
  await expect(feeInput(dialog, "基础费用")).toHaveCount(0);
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "显示课时费金额", exact: true }).click();
  await feeInput(form, "基础费用").fill("-20");
  await expect(feeInput(form, "基础费用")).toHaveValue("0");
  await feeInput(form, "基础费用").fill("155");
  await feeInput(form, "每增加一人").fill("");
  await expect(feeInput(form, "每增加一人")).toHaveValue("0");
  await form.getByPlaceholder("课程档案名称").fill("  新课程回归  ");
  await form.getByRole("button", { name: /合成学生0000/ }).click();
  const beforeAdd = session.saveCount;
  await form.getByRole("button", { name: "添加课程", exact: true }).click();
  await expect.poll(() => session.saveCount).toBeGreaterThan(beforeAdd);
  let saved = await session.readSavedVault();
  const added = saved.courseGroups.find(course => course.name === "新课程回归");
  expect(added).toMatchObject({ type: "one_on_one", studentIds: ["student_0"], defaultCampusId: "campus_a", feeRule: { mode: "class_headcount", baseFee: 155, perPresentStudentFee: 0 } });

  await page.getByRole("button", { name: "编辑课程 合成课程0000", exact: true }).click();
  dialog = editorDialog(page);
  await feeInput(dialog, "基础费用").fill("999");
  await dialog.getByPlaceholder("课程档案名称").fill("取消的草稿");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "编辑课程 合成课程0000", exact: true }).click();
  dialog = editorDialog(page);
  await expect(feeInput(dialog, "基础费用")).toHaveValue("120");
  await expect(dialog.getByPlaceholder("课程档案名称")).toHaveValue("合成课程0000");
  expect((await session.readSavedVault()).courseGroups.find(course => course.id === originalCourse.id)).toEqual(originalCourse);

  await feeInput(dialog, "基础费用").fill("200");
  await feeInput(dialog, "每增加一人").fill("25");
  await dialog.getByPlaceholder("课程档案名称").fill("  保存课程回归  ");
  const beforeEdit = session.saveCount;
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => session.saveCount).toBeGreaterThan(beforeEdit);
  saved = await session.readSavedVault();
  expect(saved.courseGroups.find(course => course.id === originalCourse.id)).toMatchObject({ name: "保存课程回归", studentIds: originalCourse.studentIds, feeRule: { mode: "class_headcount", baseFee: 200, perPresentStudentFee: 25, makeupFeeMode: "custom", stageRates: { senior_3: { oneOnOneFee: 0, classBaseFee: 200, headcountIncrementFee: 25 } } } });
  for (const original of vault.lessons.filter(lesson => lesson.status === "completed")) {
    expect(saved.lessons.find(lesson => lesson.id === original.id)).toEqual(original);
  }

  // Existing hourly courses retain their direct input semantics.
  await page.getByRole("button", { name: "编辑课程 合成课程0001", exact: true }).click();
  dialog = editorDialog(page);
  const hourly = dialog.getByPlaceholder("每小时费用");
  await expect(hourly).not.toHaveAttribute("min");
  await hourly.fill("-12");
  await expect(hourly).toHaveValue("-12");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "隐藏课时费金额", exact: true }).click();
  await page.getByRole("button", { name: "编辑课程 保存课程回归", exact: true }).click();
  dialog = editorDialog(page);
  await expect(feeInput(dialog, "基础费用")).toHaveCount(0);
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});


test("new course draft preserves duplicate confirmation and reset behavior", async ({ page, context }) => {
  const vault = createBenchmarkVault({ students: 12, courses: 1, lessons: 1 });
  vault.profile.homeCampusId = "campus_a";
  vault.courseGroups[0] = { ...vault.courseGroups[0], name: "已有一对一", type: "one_on_one", studentIds: ["student_1"], defaultCampusId: "campus_b" };
  const session = await openSyntheticWorkspace(page, context, vault);
  await page.getByRole("button", { name: "档案信息", exact: true }).click();
  await page.getByRole("button", { name: "添加课程档案", exact: true }).click();
  const form = page.locator('form[data-onboarding="course-form"]');
  const courseCampus = form.locator("select").filter({ has: page.locator('option[value=""]').getByText("未设置校区", { exact: true }) });
  const studentCampus = form.locator("select").filter({ has: page.locator("option").getByText("全部校区", { exact: true }) });
  const studentGrade = form.locator("select").filter({ has: page.locator("option").getByText("全部年级", { exact: true }) });
  const name = form.getByPlaceholder("课程档案名称");
  const studentSearch = form.getByPlaceholder("搜索学生姓名、学科、校区、年级、学校或备注");
  await form.getByRole("button", { name: /^合成学生0001 ·/ }).click();
  await expect(name).toHaveValue("合成学生0001");
  await expect(courseCampus).toHaveValue("campus_b");
  await courseCampus.selectOption("campus_a");
  await form.getByRole("button", { name: "合成学生0001", exact: true }).click();
  await form.getByRole("button", { name: /^合成学生0001 ·/ }).click();
  await expect(courseCampus).toHaveValue("campus_a");
  await courseCampus.selectOption("campus_b");
  await name.fill("  确认后的新课程  ");
  await studentCampus.selectOption("campus_b");
  await studentGrade.selectOption("初三");
  await studentSearch.fill("合成学生0001");
  const beforeSubmit = session.saveCount;
  await form.getByRole("button", { name: "添加课程", exact: true }).click();
  const duplicate = page.getByRole("dialog", { name: "可能重复添加课程", exact: true });
  await expect(duplicate).toBeVisible();
  await duplicate.getByRole("button", { name: "取消", exact: true }).click();
  await expect(duplicate).toHaveCount(0);
  await expect(name).toHaveValue("  确认后的新课程  ");
  expect(session.saveCount).toBe(beforeSubmit);
  expect((await session.readSavedVault()).courseGroups).toHaveLength(1);
  await form.getByRole("button", { name: "添加课程", exact: true }).click();
  await duplicate.getByRole("button", { name: "仍然添加", exact: true }).click();
  await expect(duplicate).toHaveCount(0);
  await expect.poll(() => session.saveCount).toBeGreaterThan(beforeSubmit);
  const saved = await session.readSavedVault();
  expect(saved.courseGroups).toHaveLength(2);
  expect(saved.courseGroups.find(course => course.name === "确认后的新课程")).toMatchObject({ studentIds: ["student_1"], defaultCampusId: "campus_b", type: "one_on_one", status: "active" });
  await expect(name).toHaveValue("");
  await expect(courseCampus).toHaveValue("campus_a");
  await expect(studentSearch).toHaveValue("");
  await expect(studentGrade).toHaveValue("初三");
  await expect(studentCampus).toHaveValue("campus_b");
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});

test("new course draft survives tab changes, settings edits and student archival", async ({ page, context }) => {
  const vault = createBenchmarkVault({ students: 12, courses: 1, lessons: 1 });
  vault.profile.homeCampusId = "campus_a";
  const session = await openSyntheticWorkspace(page, context, vault);
  await page.getByRole("button", { name: "档案信息", exact: true }).click();
  await page.getByRole("button", { name: "显示课时费金额", exact: true }).click();
  await page.getByRole("button", { name: "添加课程档案", exact: true }).click();
  const form = page.locator('form[data-onboarding="course-form"]');
  const courseType = form.locator("select").filter({ has: page.locator('option[value="trial"]') });
  const courseCampus = form.locator("select").filter({ has: page.locator('option[value=""]').getByText("未设置校区", { exact: true }) });
  await courseType.selectOption("trial");
  await form.getByRole("button", { name: /^合成学生0001 ·/ }).click();
  await expect(courseCampus).toHaveValue("campus_b");
  await form.getByPlaceholder("课程档案名称").fill("保留试听草稿");
  await page.getByRole("button", { name: "校区与班型", exact: true }).click();
  const trialSettings = page.locator("div").filter({ has: page.getByText("新建试听课程时自动带入，不按小时相乘。", { exact: true }) }).filter({ has: page.locator('input[type="number"]') });
  const trialAmount = trialSettings.last().locator('input[type="number"]');
  await trialAmount.fill("77");
  await expect.poll(async () => (await session.readSavedVault()).preferences?.courseTypeFeeRules?.trial?.fixedFee).toBe(77);
  await page.getByRole("button", { name: "添加课程档案", exact: true }).click();
  await expect(form.getByPlaceholder("课程档案名称")).toHaveValue("保留试听草稿");
  await expect(courseType).toHaveValue("trial");
  await expect(courseCampus).toHaveValue("campus_b");
  await expect(feeInput(form, "试听单次费用")).toHaveValue("77");
  await expect(form.getByRole("button", { name: "合成学生0001", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "学生列表", exact: true }).click();
  await page.getByRole("button", { name: "归档学生 合成学生0001", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "归档", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).students.find(student => student.id === "student_1")?.status).toBe("paused");
  await page.getByRole("button", { name: "添加课程档案", exact: true }).click();
  await expect(form.getByPlaceholder("课程档案名称")).toHaveValue("保留试听草稿");
  await expect(courseCampus).toHaveValue("campus_b");
  await expect(form.getByRole("button", { name: /合成学生0001/ })).toHaveCount(0);
  await expect(feeInput(form, "试听单次费用")).toHaveValue("77");
  expect((await session.readSavedVault()).courseGroups).toHaveLength(1);
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedRequests).toEqual([]);
});
