import { test, expect } from "@playwright/test";
test("workspace, manual builder, touch controls, undo and review", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/dev/automacoes");
  await expect(
    page.getByRole("heading", { name: "Automações", exact: true }),
  ).toBeVisible();
  for (const tab of [
    "Modelos prontos",
    "Execuções",
    "Tarefas",
    "Configurações",
    "Histórico arquivado",
    "Fluxos",
  ]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Nova automação", exact: true })
    .click();
  await expect(page.getByLabel("Nome do fluxo")).toBeVisible();
  const mobile = info.project.name === "mobile";
  if (mobile)
    await page.getByRole("button", { name: "Blocos", exact: true }).tap();
  await page.getByRole("button", { name: "Esperar", exact: true }).click();
  await expect(page.getByLabel("Nome do bloco")).toHaveValue("Esperar");
  await page.getByLabel("Nome do bloco").fill("Esperar acolhimento");
  await page.getByRole("button", { name: "Duplicar", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  if (mobile)
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: "Simular e revisar público" }).click();
  await expect(
    page.getByText("Simulação · 2 pessoas no público"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publicar", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `artifacts/automations-${info.project.name}.png`,
  });
});
