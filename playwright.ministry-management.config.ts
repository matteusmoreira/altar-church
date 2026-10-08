import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e", testMatch: "ministry-management.spec.ts", workers: 1,
  timeout: 120_000, expect: { timeout: 20_000 }, reporter: "list",
  use: { baseURL: process.env.E2E_BASE_URL || "http://localhost:3191", headless: true,
    screenshot: "only-on-failure", trace: "off", video: "off" },
})
