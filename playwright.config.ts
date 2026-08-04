import { defineConfig, devices } from "@playwright/test";
import { loadE2EEnvironment, readE2EConfig } from "./e2e/support/environment";

loadE2EEnvironment();

const e2e = readE2EConfig({ requireSecrets: false });
const baseUrl = e2e.baseUrl;
const localApp = ["localhost", "127.0.0.1", "0.0.0.0"].includes(new URL(baseUrl).hostname);
const startServer = localApp && process.env.E2E_START_SERVER !== "false";
const vercelProtectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: process.env.E2E_MODE === "mega" ? 15 * 60_000 : 4 * 60_000,
  expect: {
    timeout: 15_000,
  },
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  outputDir: "test-results/e2e",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    actionTimeout: 20_000,
    baseURL: baseUrl,
    extraHTTPHeaders: vercelProtectionBypass
      ? {
          "x-vercel-protection-bypass": vercelProtectionBypass,
          "x-vercel-set-bypass-cookie": "true",
        }
      : undefined,
    locale: "fr-CA",
    navigationTimeout: 30_000,
    timezoneId: "America/Toronto",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: startServer
    ? {
        command: "npm run dev",
        url: baseUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
