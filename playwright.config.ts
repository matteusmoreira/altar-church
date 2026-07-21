import { defineConfig, devices } from "@playwright/test"

const remoteBaseURL = process.env.E2E_BASE_URL
const baseURL = remoteBaseURL ?? "http://localhost:3000"

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: {
    timeout: 20_000,
  },
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
  ],
  use: {
    baseURL,
    channel: "chrome",
    headless: process.env.E2E_HEADLESS === "1",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: remoteBaseURL ? undefined : {
    command: "npm run build && npm run start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chrome-desktop",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
      },
    },
    {
      name: "chrome-mobile",
      use: {
        ...devices["Pixel 5"],
        channel: "chrome",
      },
    },
  ],
})
