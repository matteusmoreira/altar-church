import { readFileSync } from "node:fs"
import { chromium } from "@playwright/test"

const doc = readFileSync("docs/testing/e2e-accounts.local.md", "utf8")
const account = JSON.parse(doc.match(/```json\s*([\s\S]*?)```/)[1]).accounts.superadmin

const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newPage()

page.on("response", async (response) => {
  if (!response.url().includes("/auth/v1/token")) return
  console.log("token status:", response.status())
  console.log("token body:", await response.text())
})

await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" })
await page.getByLabel("E-mail").fill(account.email)
await page.getByLabel("Senha").fill(account.password)
await page.getByRole("button", { name: "Entrar" }).click()
await page.waitForTimeout(3_000)
await browser.close()