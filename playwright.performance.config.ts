import { defineConfig } from "@playwright/test";

const benchmarkLabel = (process.env.BENCHMARK_LABEL || "current").replace(/[^a-zA-Z0-9_-]/g, "_");

export default defineConfig({
  testDir: "./tests/performance",
  testMatch: "**/*.spec.ts",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  reporter: "line",
  outputDir: "artifacts/performance/" + benchmarkLabel,
  preserveOutput: "always",
  use: {
    baseURL: "http://127.0.0.1:5174",
    channel: process.env.BENCHMARK_BROWSER || "msedge",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Asia/Shanghai"
  },
  webServer: {
    command: "npm run dev:performance",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    timeout: 60_000
  }
});
