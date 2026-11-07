import { expect, test } from "@playwright/test";
import { createBenchmarkVault } from "./fixtures";
import { openSyntheticWorkspace } from "./session";
test("legacy schedule rules are cleared once after session restore without stale version writes", async ({ page, context }) => {
  const vault = createBenchmarkVault({ students: 12, courses: 2, lessons: 1 });
  vault.scheduleRules = [{ id: "legacy", courseGroupId: "course_0", weekday: 1, startTime: "10:00", endTime: "12:00", effectiveFrom: "2026-01-01", enabled: true }];
  const session = await openSyntheticWorkspace(page, context, vault);
  await expect.poll(async () => (await session.readSavedVault()).scheduleRules.length).toBe(0);
  await page.clock.fastForward(2000); await page.waitForLoadState("networkidle");
  const saved = await session.readSavedVault(); expect(saved.lessons).toEqual(vault.lessons); expect(saved.students).toEqual(vault.students); expect(session.saveCount).toBe(1); expect(session.pageErrors).toEqual([]); expect(session.unexpectedRequests).toEqual([]);
});
