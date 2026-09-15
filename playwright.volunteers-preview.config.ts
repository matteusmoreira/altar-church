import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "volunteer-preview.spec.ts",
  timeout: 30_000,
  workers: 1,
  reporter: "list",
  outputDir: "test-results/volunteer-preview",
  use: { baseURL: "http://127.0.0.1:3107", screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
})
