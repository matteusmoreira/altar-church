import { test, expect } from "@playwright/test";
test("dragging blocks keeps measurements, position and undo stable", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Mouse drag regression");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/dev/automacoes");
  await page.getByRole("button", { name: "Nova automação", exact: true }).click();
  const node = page.locator('.react-flow__node[data-id="start"]');
  await expect(node).toBeVisible();
  const before = await node.boundingBox();
  expect(before).not.toBeNull();
  await page.evaluate(() => {
    const node = document.querySelector('.react-flow__node[data-id="start"]')!;
    node.setAttribute("data-hidden-during-drag", "0");
    const observer = new MutationObserver(() => {
      if (getComputedStyle(node).visibility === "hidden")
        node.setAttribute("data-hidden-during-drag", "1");
    });
    observer.observe(node, { attributes: true, attributeFilter: ["style"] });
  });
  await page.mouse.move(before!.x + 100, before!.y + 20);
  await page.mouse.down();
  for (let step = 1; step <= 20; step++) {
    await page.mouse.move(before!.x + 100 + step * 4, before!.y + 20 + step * 2);
    await page.waitForTimeout(100);
    await expect(node).toBeVisible();
  }
  await page.mouse.up();
  await expect(node).toHaveAttribute("data-hidden-during-drag", "0");
  const after = await node.boundingBox();
  expect(after!.x).toBeGreaterThan(before!.x + 50);
  expect(after!.width).toBeCloseTo(before!.width, 0);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect.poll(async () => (await node.boundingBox())!.x).toBeCloseTo(before!.x, 0);
  expect(errors).toEqual([]);
});
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
