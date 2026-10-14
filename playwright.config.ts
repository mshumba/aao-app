import { defineConfig } from "@playwright/test";
const baseURL = process.env.EXPO_BASE_URL || "http://localhost:8081";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results",
  webServer: process.env.EXPO_BASE_URL
    ? undefined
    : {
        command: "npx expo start --web --localhost --port 8081",
        // The deterministic on-device account service, even if a developer's
        // .env points at a real Supabase project.
        env: { EXPO_PUBLIC_AUTH_MODE: "local" },
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    headless: true,
    viewport: { width: 375, height: 667 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
