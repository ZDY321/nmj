import { expect, test } from "@playwright/test";
import { createBenchmarkVault } from "./fixtures";
import { openSyntheticWorkspace } from "./session";

test("AI scheduling keeps generated changes pending until explicit apply and preserves work across tabs", async ({ page, context }) => {
  const vault = createBenchmarkVault({ students: 12, courses: 1, lessons: 3 });
  vault.profile.aiSchedulingEnabled = true;
  const session = await openSyntheticWorkspace(page, context, vault);
  let requests = 0;
  await context.route("**/api/ai/providers", route => route.fulfill({ json: [{ id: "synthetic", name: "隔离测试接口", provider: "openai_compatible", baseUrl: "https://ai.example.invalid/v1", model: "synthetic", enabled: true, isDefault: true, dailyLimit: 10, usedToday: 0, remainingToday: 10, maxOutputTokens: 1000, temperature: 0.5, maskedApiKey: "***", createdAt: "2026-11-07", updatedAt: "2026-11-07", lastTestedAt: null, lastError: null }] }));
  await context.route("**/api/ai/schedule-draft", async route => {
    requests += 1;
    expect(route.request().postDataJSON().instruction).toBe("新增回归学生");
    await route.fulfill({ json: { providerId: "synthetic", model: "synthetic", createdAt: "2026-11-07", text: "synthetic", draft: { summary: "新增一个回归学生", actions: [{ type: "create_student", data: { name: "AI回归学生", grade: "初三", campusId: "campus_a" } }], questions: [], warnings: [] }, providerUsage: { dailyLimit: 10, usedToday: 1, remainingToday: 9 } } });
  });
  await page.getByRole("button", { name: "排课与课时", exact: true }).click();
  await page.getByRole("button", { name: "AI 排课助手", exact: true }).click();
  const input = page.getByPlaceholder("例如：本周一共有几节课？本月 08:00-10:00 有哪些课？或：新增学生张三，三年级，A校区，语文一对一。", { exact: true });
  await input.fill("  新增回归学生  ");
  await page.getByRole("button", { name: "生成建议", exact: true }).click();
  await expect(page.getByText("新增一个回归学生", { exact: true })).toBeVisible();
  expect(requests).toBe(1); expect(session.saveCount).toBe(0);
  await page.getByRole("button", { name: "学生课次统计", exact: true }).click();
  await page.getByRole("button", { name: "AI 排课助手", exact: true }).click();
  await expect(input).toHaveValue("  新增回归学生  ");
  await page.getByRole("button", { name: "确认写入", exact: true }).click();
  await expect.poll(async () => (await session.readSavedVault()).students.length).toBe(13);
  await expect(page.getByRole("button", { name: "确认写入", exact: true })).toBeDisabled();
  const saved = await session.readSavedVault();
  expect(saved.students.find(student => student.name === "AI回归学生")).toMatchObject({ grade: "初三", status: "active" });
  expect(saved.students.slice(0, 12)).toEqual(vault.students); expect(saved.lessons).toEqual(vault.lessons); expect(saved.courseGroups).toEqual(vault.courseGroups);
  await page.getByRole("button", { name: "清空", exact: true }).click();
  await expect(input).toHaveValue("");
  expect(session.pageErrors).toEqual([]); expect(session.unexpectedRequests).toEqual([]);
});
