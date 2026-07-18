import { chromium } from "@playwright/test"
import { readFileSync } from "node:fs"

const doc = readFileSync("docs/testing/e2e-accounts.local.md", "utf8")
const account = JSON.parse(doc.match(/```json\s*([\s\S]*?)```/)[1]).accounts.superadmin

const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newPage()

page.on("console", (msg) => console.log("console:", msg.type(), msg.text()))
page.on("response", (response) => {
  const url = response.url()
  if (url.includes("/api/auth/me") || url.includes("/auth/v1/token")) {
    console.log("response:", response.status(), url)
  }
})

await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" })
await page.getByRole("button", { name: "Entrar" }).waitFor({ state: "visible" })
await page.getByLabel("E-mail").fill(account.email)
await page.getByLabel("Senha").fill(account.password)
await page.getByRole("button", { name: "Entrar" }).click()

try {
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 })
  console.log("dashboard ok", page.url())
} catch {
  console.log("dashboard fail", page.url())
  console.log("toast:", await page.locator("[data-sonner-toast]").allTextContents().catch(() => []))
  console.log("button:", await page.locator("form button[type='button']").last().textContent().catch(() => ""))
}

await browser.close()
