import { chromium } from "@playwright/test"

const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newPage()

page.on("console", (msg) => console.log("console:", msg.type(), msg.text()))
page.on("pageerror", (error) => console.log("pageerror:", error.message))
page.on("response", (response) => {
  if (response.url().includes("/api/auth/me")) {
    console.log("auth/me:", response.status(), response.url())
  }
})

await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded", timeout: 60_000 })
console.log("loaded")

for (let second = 0; second < 15; second += 1) {
  const label = await page.locator("form button[type='submit']").textContent().catch(() => "(missing)")
  console.log(`t+${second}s`, label)
  if (label === "Entrar") break
  await page.waitForTimeout(1_000)
}

await browser.close()