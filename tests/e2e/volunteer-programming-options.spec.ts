import { expect, test } from "@playwright/test";

test("tipo e local oferecem seleção e cadastro dentro do campo", async ({ page }) => {
  let mutations = 0;
  page.on("request", (request) => { if (request.method() === "POST") mutations++; });
  await page.goto("/dev/voluntariado?month=2026-09", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Nova escala", exact: true }).click();
  const wizard = page.getByTestId("programming-wizard");
  await wizard.getByRole("button", { name: "Tipo Culto", exact: true }).click();
  await page.getByRole("button", { name: "Faxina", exact: true }).click();
  await expect(wizard.getByRole("button", { name: "Tipo Faxina", exact: true })).toBeVisible();
  await wizard.getByRole("button", { name: "Tipo Faxina", exact: true }).click();
  await page.getByRole("button", { name: "Excluir Faxina", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("As escalas já cadastradas serão preservadas");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await wizard.getByRole("button", { name: "Local Selecione local", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sem local", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Cadastrar local", exact: true }).fill("Salão de teste");
  await page.getByRole("button", { name: "Cadastrar local", exact: true }).click();
  await expect(page.getByText("Esta é uma prévia com dados fictícios. Alterações e envios estão desabilitados.", { exact: true })).toBeVisible();
  expect(mutations).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
