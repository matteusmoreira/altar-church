import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "automations-preview.spec.ts",
  workers: 1,
  timeout: 60000,
  reporter: "list",
  use: { baseURL: "http://localhost:3100", headless: true, channel: "chrome" },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 960 },
      },
    },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100/dev/automacoes",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
