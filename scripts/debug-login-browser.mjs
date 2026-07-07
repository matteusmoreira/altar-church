import { chromium } from "@playwright/test"
import { readFileSync } from "node:fs"

const env = readFileSync(".env.local", "utf8")
  .split(/\r?\n/)
  .reduce((acc, line) => {
    const index = line.indexOf("=")
    if (index > 0) acc[line.slice(0, index).trim()] = line.slice(index + 1).trim()
    return acc
  }, {})

const email = "e2e.superadmin@altar-church.test"
const password = env.E2E_DEFAULT_PASSWORD
const baseURL = "http://localhost:3000"

const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newPage()

page.on("console", (msg) => console.log("console:", msg.type(), msg.text()))
page.on("requestfailed", (req) => console.log("request failed:", req.url(), req.failure()?.errorText))
page.on("response", (res) => {
  if (res.url().includes("/api/auth/me") || res.url().includes("token")) {
    console.log("response:", res.status(), res.url())
  }
})

await page.goto(`${baseURL}/login`, { waitUntil: "networkidle" })
console.log("loaded login")

await page.getByRole("button", { name: "Entrar" }).waitFor({ state: "visible", timeout: 15_000 })
console.log("submit ready")

await page.getByLabel("E-mail").fill(email)
await page.getByLabel("Senha").fill(password)
console.log("filled credentials, url:", page.url())
await page.getByRole("button", { name: "Entrar" }).click()
console.log("clicked submit")

try {
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 })
  console.log("navigated to dashboard")
} catch (error) {
  console.log("no dashboard navigation:", error.message)
  console.log("button text:", await page.getByRole("button").last().textContent())
}

await browser.close()