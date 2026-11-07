import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { benchmarkScales, createBenchmarkVault } from "./fixtures";
import { openSyntheticWorkspace } from "./session";

declare global {
  interface Window {
    __benchmark?: Record<string, { renders: number; commits: number; commitMs: number }>;
  }
}

async function clearMeasurements(page: Page) {
  await page.evaluate(() => { window.__benchmark = {}; });
}

async function measurements(page: Page) {
  return page.evaluate(() => Object.fromEntries(["App", "ScheduleView", "StudentsView"].map(name => [
    name, window.__benchmark?.[name] ?? { renders: 0, commits: 0, commitMs: 0 }
  ])));
}

async function measureAction(page: Page, action: () => Promise<unknown>) {
  await clearMeasurements(page);
  const start = await page.evaluate(() => performance.now());
  await action();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  return { elapsedMs: (await page.evaluate(() => performance.now())) - start, renders: await measurements(page) };
}

for (const scale of benchmarkScales) {
  test(scale.name + " workspace performance", async ({ page, context }, testInfo) => {
    const vault = createBenchmarkVault(scale);
    const session = await openSyntheticWorkspace(page, context, vault);
    const { password, pageErrors, unexpectedRequests } = session;

    const scheduleOpen = await measureAction(page, async () => {
      await page.getByRole("button", { name: "排课与课时", exact: true }).click();
      try {
        await expect(page.getByRole("button", { name: "课程记录", exact: true })).toBeVisible();
      } catch (error) {
        console.error("Load diagnostics", await measurements(page), await page.locator("main").innerText());
        throw error;
      }
    });
    expect(scheduleOpen.renders.ScheduleView.renders).toBeGreaterThan(0);
    const schedulePanel = await measureAction(page, () => page.getByRole("button", { name: "课程记录", exact: true }).click());
    await clearMeasurements(page);
    await page.clock.fastForward(60_000);
    const scheduleIdle = await measurements(page);

    await page.getByRole("button", { name: /合成课程0000.*已完成/ }).first().click();
    const attendanceSelect = page.locator("select").filter({ has: page.locator('option[value="attended"]') }).first();
    if (!(await attendanceSelect.isVisible())) await page.getByRole("button", { name: /^关联学生/ }).click();
    const attendance = await measureAction(page, () => attendanceSelect.selectOption("absent"));
    await expect(attendanceSelect).toHaveValue("absent");
    await expect.poll(() => session.saveCount).toBeGreaterThan(0);
    const attendanceVault = await session.readSavedVault();
    expect(attendanceVault.lessons.find(lesson => lesson.id === "lesson_0")?.attendance[0].status).toBe("absent");

    const studentsOpen = await measureAction(page, async () => {
      await page.getByRole("button", { name: "档案信息", exact: true }).click();
      await expect(page.getByRole("button", { name: "学生列表", exact: true })).toBeVisible();
    });
    await page.getByRole("button", { name: "学生列表", exact: true }).click();
    const filterInput = page.getByPlaceholder("搜索学生姓名、学校或备注");
    const studentFilter = [];
    for (const term of ["合成学生000", "合成学生001", "合成学生002", "合成学生003", "合成学生004"]) {
      studentFilter.push(await measureAction(page, () => filterInput.fill(term)));
    }
    await clearMeasurements(page);
    await page.clock.fastForward(60_000);
    const studentsIdle = await measurements(page);
    if (process.env.BENCHMARK_LABEL !== "before") {
      expect(scheduleIdle.App.renders).toBe(0);
      expect(scheduleIdle.ScheduleView.renders).toBe(0);
      expect(studentsIdle.App.renders).toBe(0);
      expect(studentsIdle.StudentsView.renders).toBe(0);
    }

    await page.getByRole("button", { name: "老师个人信息", exact: true }).click();
    const note = page.getByPlaceholder("例如：主要负责中心校区，高中数学方向");
    const previousSaveCount = session.saveCount;
    const save = await measureAction(page, async () => {
      await note.fill("合成性能测试备注");
      await expect.poll(() => session.saveCount).toBeGreaterThan(previousSaveCount);
    });

    const batch = await page.evaluate(async (vault) => {
      const { applyLessonUpdates, cleanupResolvedMakeupLessons, syncOriginalLessonFromMakeupCompletion, recalculateLinkedMakeupLessonFeeSnapshots } =
        await import(/* @vite-ignore */ "/src/frontend/lib/vaultMutations.ts" as string);
      const updates = vault.lessons.slice(0, Math.min(200, vault.lessons.length)).map(lesson => ({ ...lesson, note: "批量性能测量" }));
      const samples = [];
      for (let i = 0; i < 5; i += 1) {
        const oldVault = structuredClone(vault);
        const newVault = structuredClone(vault);
        const oldUpdates = structuredClone(updates);
        const newUpdates = structuredClone(updates);
        let start = performance.now();
        const affected = new Set<string>();
        for (const lesson of oldUpdates) {
          const previous = oldVault.lessons.find(item => item.id === lesson.id);
          if (previous?.linkedOriginalLessonId) affected.add(previous.linkedOriginalLessonId);
          if (lesson.linkedOriginalLessonId) affected.add(lesson.linkedOriginalLessonId);
          if (!lesson.linkedOriginalLessonId) affected.add(lesson.id);
          cleanupResolvedMakeupLessons(oldVault, lesson);
          const next = syncOriginalLessonFromMakeupCompletion(oldVault, lesson);
          oldVault.lessons = oldVault.lessons.map(item => item.id === next.id ? next : item);
        }
        affected.forEach(id => recalculateLinkedMakeupLessonFeeSnapshots(oldVault, id));
        const previousMs = performance.now() - start;
        start = performance.now();
        applyLessonUpdates(newVault, newUpdates);
        const optimizedMs = performance.now() - start;
        if (JSON.stringify(oldVault) !== JSON.stringify(newVault)) throw new Error("Batch output differs from previous algorithm");
        samples.push({ previousMs, optimizedMs });
      }
      return { updatedLessons: updates.length, samples };
    }, vault);

    const storage = await page.evaluate(async ({ vault, password }) => {
      // Import the application's real encryption function in the browser.
      const { encryptJson } = await import(/* @vite-ignore */ "/src/frontend/lib/crypto.ts" as string);
      const cacheKey = "teacher-salary-tracker:vault:performance-test";
      const previousCache = localStorage.getItem(cacheKey);
      const samples = [];
      for (let i = 0; i < 5; i += 1) {
        let start = performance.now();
        structuredClone(vault);
        const cloneMs = performance.now() - start;
        start = performance.now();
        const json = JSON.stringify(vault);
        const serializeMs = performance.now() - start;
        start = performance.now();
        const box = await encryptJson(vault, password);
        const encryptMs = performance.now() - start;
        start = performance.now();
        localStorage.setItem(cacheKey, JSON.stringify(box));
        const localWriteMs = performance.now() - start;
        samples.push({ cloneMs, serializeMs, encryptMs, localWriteMs, jsonBytes: new TextEncoder().encode(json).length });
      }
      if (previousCache === null) localStorage.removeItem(cacheKey);
      else localStorage.setItem(cacheKey, previousCache);
      return samples;
    }, { vault, password });

    expect(pageErrors).toEqual([]);
    expect(unexpectedRequests).toEqual([]);
    const result = {
      label: process.env.BENCHMARK_LABEL || "current", scale, browser: context.browser()?.version(),
      mode: "Vite development + React StrictMode; local in-memory API; synthetic data",
      scheduleOpen, schedulePanel, scheduleIdle, attendance, studentsOpen, studentFilter, studentsIdle, save, storage, batch
    };
    await writeFile(testInfo.outputPath("measurements.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  });
}
