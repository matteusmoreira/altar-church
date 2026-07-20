/* Verificação visual + animações das telas de auth e landing. Uso: node scripts/verify-auth-ui.mjs */
import { chromium } from "@playwright/test"

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const shots = "test-results/auth-ui"
import { mkdirSync } from "node:fs"
mkdirSync(shots, { recursive: true })

const errors = []
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1280, height: 860 },
  colorScheme: "light", // prova que o visual não depende do tema do sistema
  deviceScaleFactor: 2,
})
const page = await context.newPage()
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text().slice(0, 300))
})
page.on("pageerror", (err) => errors.push(String(err).slice(0, 300)))

// --- LOGIN ---
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" })
await page.waitForTimeout(1400) // deixa as animações de entrada rodarem

const loginAnim = await page.evaluate(() => {
  const card = document.querySelector(".animate-fade-up")
  const orb = document.querySelector(".animate-aurora")
  const grid = document.querySelector(".auth-grid")
  const cs = getComputedStyle(card)
  const os = getComputedStyle(orb)
  return {
    cardAnimation: cs.animationName,
    cardOpacity: cs.opacity,
    orbAnimation: os.animationName,
    orbDuration: os.animationDuration,
    gridMask: getComputedStyle(grid).webkitMaskImage !== "none",
    bodyBg: getComputedStyle(document.body).backgroundColor,
  }
})
// o orb deve estar se movendo: compara transform em 2 instantes
const orbT1 = await page.evaluate(() => getComputedStyle(document.querySelector(".animate-aurora")).transform)
await page.waitForTimeout(700)
const orbT2 = await page.evaluate(() => getComputedStyle(document.querySelector(".animate-aurora")).transform)
await page.screenshot({ path: `${shots}/login.png` })

// --- REGISTER ---
await page.goto(`${BASE}/register`, { waitUntil: "networkidle" })
await page.waitForTimeout(1400)
await page.screenshot({ path: `${shots}/register.png` })

// --- LANDING (animações do site) ---
await page.goto(`${BASE}/`, { waitUntil: "networkidle" })
await page.waitForTimeout(1200)
const landingAnim = await page.evaluate(() => {
  const fade = document.querySelector(".animate-fade-up")
  const float = document.querySelector(".animate-float")
  const marquee = document.querySelector(".animate-marquee")
  return {
    fadeUp: fade ? getComputedStyle(fade).animationName : "MISSING",
    float: float ? getComputedStyle(float).animationName : "MISSING",
    marquee: marquee ? getComputedStyle(marquee).animationName : "MISSING",
  }
})
// marquee deve deslocar
const mq1 = await page.evaluate(() => document.querySelector(".animate-marquee")?.getBoundingClientRect().x)
await page.waitForTimeout(800)
const mq2 = await page.evaluate(() => document.querySelector(".animate-marquee")?.getBoundingClientRect().x)
// reveal ao rolar
const revealBefore = await page.evaluate(() => {
  const els = [...document.querySelectorAll("div")].filter((d) => d.className.includes("opacity-0"))
  return els.length
})
await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight * 0.5 }))
await page.waitForTimeout(1200)
const revealAfter = await page.evaluate(() => {
  const els = [...document.querySelectorAll("div")].filter((d) => d.className.includes("opacity-0"))
  return els.length
})
await page.screenshot({ path: `${shots}/landing.png`, fullPage: false })

await browser.close()

const results = {
  login: { ...loginAnim, orbMoving: orbT1 !== orbT2 },
  register: "screenshot ok",
  landing: { ...landingAnim, marqueeMoving: mq1 !== mq2, hiddenRevealsBefore: revealBefore, hiddenRevealsAfter: revealAfter },
  consoleErrors: errors,
}
console.log(JSON.stringify(results, null, 2))

const failures = []
if (loginAnim.cardAnimation !== "fade-up") failures.push("login: fade-up ausente")
if (loginAnim.orbAnimation !== "aurora-drift") failures.push("login: aurora-drift ausente")
if (orbT1 === orbT2) failures.push("login: orb parado")
if (results.landing.fadeUp !== "fade-up") failures.push("landing: fade-up ausente")
if (results.landing.float !== "float") failures.push("landing: float ausente")
if (mq1 === mq2) failures.push("landing: marquee parado")
if (errors.some((e) => e.includes("Hydration"))) failures.push("erro de hidratação")
if (failures.length) {
  console.error("FALHAS:", failures)
  process.exit(1)
}
console.log("OK: animações ativas e sem erros de hidratação")
