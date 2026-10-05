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
    actionTimeout: 20_000,
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
    env: {
      ...process.env,
      // Expõe /dev/voluntariado (prévia fictícia) no build de produção do E2E.
      E2E_VOLUNTEER_PREVIEW: "1",
      // A suíte loga dezenas de vezes do mesmo IP; afrouxa o rate limit do
      // login só no servidor de teste (defaults de produção continuam 30/8).
      LOGIN_RATE_LIMIT_IP_MAX: "1000",
      LOGIN_RATE_LIMIT_IDENTIFIER_MAX: "100",
    },
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chrome-desktop",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        storageState: "playwright/.auth/admin.json",
      },
    },
    {
      name: "chrome-mobile",
      dependencies: ["setup"],
      use: {
        ...devices["Pixel 5"],
        channel: "chrome",
        storageState: "playwright/.auth/admin.json",
      },
    },
  ],
})
