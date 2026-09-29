/**
 * Setup de autenticacao E2E (1 login por papel).
 * Roda uma vez antes das specs e grava storageState em playwright/.auth/<papel>.json.
 * Sem isso, cada spec loga via UI (~41 loginAs x 2 projetos) e estoura o rate limit
 * do login (30/IP e 8/identificador por 15min) — DESAFIOS.md 21/09/2026.
 */
import { expect, test as setup } from "@playwright/test"
import path from "node:path"
import { readE2EAccounts, type E2EAccount } from "./helpers/accounts"

const authDir = path.join(process.cwd(), "playwright", ".auth")

async function saveRoleSession(
  page: import("@playwright/test").Page,
  account: E2EAccount,
  file: string,
) {
  await page.context().clearCookies()
  await page.goto("/login", { waitUntil: "load" })
  await page.locator('[data-testid="login-form"][data-ready="true"]').waitFor({ timeout: 15_000 })
  await expect(page.getByTestId("login-submit")).toBeEnabled()
  await page.getByLabel("E-mail").fill(account.email)
  await page.locator("#password").fill(account.password)
  await page.getByRole("button", { name: "Entrar" }).click()
  const portalRole = ["member", "volunteer", "ministry_leader"].includes(account.role)
  await expect(page).toHaveURL(portalRole ? /\/membro/ : /\/dashboard/, { timeout: 20_000 })
  await page.context().storageState({ path: file })
}

setup("autentica papeis E2E", async ({ page }) => {
  const e2e = readE2EAccounts()
  const targets: { account: E2EAccount; file: string }[] = [
    { account: e2e.accounts.superadmin, file: path.join(authDir, "superadmin.json") },
    { account: e2e.accounts.admin, file: path.join(authDir, "admin.json") },
    { account: e2e.accounts.member, file: path.join(authDir, "member.json") },
  ]
  if (e2e.portalAccounts?.volunteer) {
    targets.push({ account: e2e.portalAccounts.volunteer, file: path.join(authDir, "volunteer.json") })
  }
  if (e2e.portalAccounts?.ministryLeader) {
    targets.push({ account: e2e.portalAccounts.ministryLeader, file: path.join(authDir, "ministry-leader.json") })
  }

  for (const { account, file } of targets) {
    await saveRoleSession(page, account, file)
  }
})
