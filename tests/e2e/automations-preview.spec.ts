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


test("interactive messages: editable cards before upload, ordering, limits and undo on desktop/mobile", async ({ page }, info) => {
  await page.goto("/dev/automacoes");
  await page.getByRole("button", { name: "Nova automação", exact: true }).click();
  const mobile=info.project.name === "mobile";
  if(mobile) await page.getByRole("button",{name:"Blocos",exact:true}).click();
  await page.getByRole("button",{name:"Enviar WhatsApp",exact:true}).click();
  const editor=page.locator("aside").filter({has:page.getByLabel("Formato da mensagem")});
  await editor.getByLabel("Formato da mensagem").selectOption("button");
  await editor.getByLabel("Texto do botão 1").fill("Participar");
  await editor.getByLabel("Valor da ação").fill("participar");
  await editor.getByLabel("Rodapé da mensagem").fill("Igreja");
  await editor.getByRole("button",{name:"Adicionar botão",exact:true}).click();
  await editor.getByLabel("Texto do botão 2").fill("Saiba mais");
  await editor.getByRole("button",{name:"Mover para cima",exact:true}).last().click();
  await expect(editor.getByLabel("Texto do botão 1")).toHaveValue("Saiba mais");
  await editor.getByLabel("Formato da mensagem").selectOption("list");
  await editor.getByLabel("Nome do item").fill("Opção inicial");
  for(let i=1;i<10;i++) await editor.getByRole("button",{name:"Adicionar item",exact:true}).click();
  await expect(editor.getByRole("button",{name:"Adicionar item",exact:true})).toBeDisabled();
  const identifiers=await editor.getByLabel("Resposta do item").evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value));
  expect(new Set(identifiers).size).toBe(10);
  await editor.getByRole("button",{name:"Excluir item",exact:true}).nth(1).click();
  await editor.getByRole("button",{name:"Adicionar item",exact:true}).click();
  const after=await editor.getByLabel("Resposta do item").evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value));
  expect(new Set(after).size).toBe(10);
  await editor.getByLabel("Formato da mensagem").selectOption("carousel");
  await expect(editor.getByLabel("Texto do cartão")).toHaveValue("Cartão 1");
  await editor.getByLabel("Texto do cartão").fill("Cartão sem upload obrigatório para editar");
  await editor.getByLabel("Texto do botão 1").fill("Inscrever");
  await editor.getByRole("button",{name:"Adicionar cartão",exact:true}).click();
  await expect(editor.getByLabel("Texto do cartão")).toHaveCount(2);
  await editor.getByLabel("Texto do cartão").nth(1).fill("Segundo cartão");
  await editor.getByRole("button",{name:"Mover para cima",exact:true}).last().click();
  await expect(editor.getByLabel("Texto do cartão").first()).toHaveValue("Segundo cartão");
  // Config panel scroll does not prevent the top-level undo action from working.
  await page.getByRole("button",{name:"Desfazer",exact:true}).click();
  await expect(editor.getByLabel("Texto do cartão").first()).toHaveValue("Cartão sem upload obrigatório para editar");
  await page.getByRole("button",{name:"Refazer",exact:true}).click();
  await expect(editor.getByLabel("Texto do cartão").first()).toHaveValue("Segundo cartão");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const layout = await editor.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return {
      background: getComputedStyle(element).backgroundColor,
      fits: [...element.querySelectorAll("button,input,select,textarea")].every(control => {
        const box = control.getBoundingClientRect();
        return box.width === 0 || (box.left >= bounds.left - 1 && box.right <= bounds.right + 1);
      }),
    };
  });
  expect(layout.fits).toBe(true);
  expect(layout.background).not.toMatch(/transparent|\/\s*0\.6\s*\)/);
  await page.screenshot({path:`artifacts/automations-messages-${info.project.name}.png`,fullPage:true});
});

test("specific form, Kanban configuration and unpublished draft simulation", async ({ page },info) => {
  await page.goto("/dev/automacoes");
  await page.getByRole("button",{name:"Nova automação",exact:true}).click();
  const mobile=info.project.name === "mobile";
  if(mobile) await page.getByRole("button",{name:"Blocos",exact:true}).click();
  await page.getByRole("button",{name:"Mover no Kanban",exact:true}).click();
  await page.getByLabel("Coluna do Kanban").selectOption({label:"Primeiro contato"});
  await expect(page.getByLabel("Coluna do Kanban")).toHaveValue("70000000-0000-4000-8000-000000000001");
  if(mobile) await page.getByRole("button",{name:"Fechar",exact:true}).click();
  await page.locator(".react-flow__node").filter({hasText:"Início"}).first().click();
  await page.getByLabel("Quando iniciar").selectOption("event");
  await page.getByLabel("Evento",{exact:true}).selectOption("form.submitted");
  await page.getByLabel("Formulário",{exact:true}).selectOption({label:"Novos visitantes"});
  await expect(page.getByLabel("Formulário",{exact:true})).toHaveValue("60000000-0000-4000-8000-000000000001");
  if(mobile) await page.getByRole("button",{name:"Fechar",exact:true}).click();
  await page.getByRole("button",{name:"Testar automação",exact:true}).click();
  const panel=page.getByRole("region",{name:"Teste da automação"});
  await panel.getByRole("button",{name:"Iniciar simulação",exact:true}).click();
  await panel.getByRole("button",{name:"Avançar bloco",exact:true}).click();
  await panel.getByRole("button",{name:"Avançar bloco",exact:true}).click();
  await expect(panel.getByText("Simulação concluída. Nenhum cadastro foi alterado.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
