// Card aberto (docs/design/prompt-redesign-pr2.md, parte B; seed "demo"): modal sobre o board ao abrir
// pelo kanban, página ao abrir pela URL; três colunas com as medidas do prompt; relações no formulário da
// fase; conexões (pais e filhos) como mini-cards; mover só para destinos permitidos (regra esconde,
// obrigatório vazio desabilita com o motivo uma vez); histórico por fase com edição no lugar; abas.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { anexarComprovante } from "./apoio";

const EMAIL = process.env.PLEXU_SEED_EMAIL ?? "demo@plexu.dev";
const SENHA = process.env.PLEXU_SEED_SENHA ?? "plexu-demo-2026";

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/w\/demo$/);
}

const medir = (l: Locator) =>
  l.evaluate((el) => {
    const b = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return { x: b.x, y: b.y, w: b.width, h: b.height, padding: s.padding, raio: s.borderTopLeftRadius, rolagem: s.overflowY, bordaEsq: s.borderLeftWidth };
  });

test.describe("parte B: card aberto", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 }); // 1600 - 16 de margem = 1584 ≥ 1436: colunas na largura máxima
    await entrar(page);
  });

  test("abre em modal pelo kanban (board por baixo) e como página pela URL; medidas do prompt", async ({ page }) => {
    await page.goto("/w/demo/b/pedidos");
    await page.locator("[data-card]").filter({ hasText: "PD-0004" }).click();
    await page.waitForURL(/\/w\/demo\/c\/[0-9a-f-]{36}$/);
    const painel = page.getByTestId("painel-card");
    await expect(painel).toHaveAttribute("data-modo", "modal");
    await expect(page.locator("[data-kanban]")).toBeAttached(); // board continua montado por baixo
    await expect(page.getByTestId("titulo-card")).toHaveText("PD-0004");

    // Margem de 8px do viewport, largura máxima de 1440px (centrado quando sobra espaço), raio de 12px
    const m = await medir(painel);
    expect([m.y, m.w, m.raio]).toEqual([8, 1440, "12px"]);
    expect(m.x).toBe((1600 - 1440) / 2);
    await page.setViewportSize({ width: 1400, height: 900 });
    expect((await medir(painel)).x).toBe(8);
    expect((await medir(painel)).w).toBe(1400 - 16);
    await page.setViewportSize({ width: 1600, height: 900 });
    const esq = await medir(painel.getByTestId("coluna-esquerda"));
    const centro = await medir(painel.getByTestId("coluna-atual"));
    const dir = await medir(painel.getByTestId("coluna-lateral"));
    expect([esq.x - m.x, esq.w, esq.padding, esq.rolagem]).toEqual([32, 564, "24px 24px 24px 0px", "auto"]);
    expect([centro.w, centro.padding, centro.bordaEsq, centro.rolagem]).toEqual([564, "24px", "1px", "auto"]);
    expect([dir.w, dir.bordaEsq, dir.rolagem]).toEqual([276, "1px", "visible"]);
    const aba = await medir(painel.locator('[data-aba-card="Formulário"]'));
    expect([aba.h, aba.padding]).toEqual([24, "4px 8px"]);
    expect((await medir(painel.locator("[data-mover] button").first())).h).toBe(34);
    for (const b of await painel.locator("[data-acoes-topo] > * button, [data-acoes-topo] > button").all()) expect((await medir(b)).w).toBe(32);

    // Esc fecha e volta ao board; a URL direta abre a página do card
    const url = page.url();
    await page.keyboard.press("Escape");
    await page.waitForURL(/\/w\/demo\/b\/pedidos$/);
    await expect(painel).toHaveCount(0);
    await page.goto(url);
    await expect(page.getByTestId("painel-card")).toHaveAttribute("data-modo", "pagina");
    await page.getByRole("button", { name: "Fechar" }).click();
    await page.waitForURL(/\/w\/demo\/b\/pedidos$/);
  });

  test("relações no formulário, mover só para o permitido, histórico com edição e abas", async ({ page }) => {
    test.setTimeout(300_000); // fluxo longo; no modo dev cada rota compila na primeira visita
    await page.goto("/w/demo/b/pedidos");
    await page.getByRole("button", { name: "Criar novo cartão" }).click();
    const novo = page.getByRole("dialog", { name: "Novo cartão" });
    await novo.getByLabel("Referência").fill("Pedido do card (e2e)");
    await novo.getByLabel("Contato").fill("Compras Card");
    await anexarComprovante(novo);
    await novo.getByRole("button", { name: "Criar cartão" }).click();
    await page.waitForURL(/\/w\/demo\/c\/[0-9a-f-]{36}$/);
    const urlPedido = page.url();
    const painel = page.getByTestId("painel-card");
    const esquerda = painel.getByTestId("coluna-esquerda");
    const atual = painel.getByTestId("coluna-atual");
    const lateral = painel.getByTestId("coluna-lateral");

    // Centro: "Fase atual" com o chip, descrição da fase e campos em uma coluna (inputs de 40px)
    await expect(atual.getByTestId("fase-card")).toHaveText("Novo");
    await expect(atual.locator("[data-descricao-fase]")).toHaveText("Pedidos recebidos, aguardando conferência.");
    const ref = atual.locator('[data-campo="Referência"]').getByRole("textbox");
    await expect(ref).toHaveValue("Pedido do card (e2e)");
    expect((await medir(ref)).h).toBe(40);
    const [a, b] = [await medir(atual.locator('[data-campo="Referência"]')), await medir(atual.locator('[data-campo="Contato"]'))];
    expect(a.x).toBe(b.x); // uma coluna: um embaixo do outro
    expect(b.y).toBeGreaterThan(a.y);
    // Esquerda: formulário inicial com quem criou
    await expect(esquerda.locator('[data-fase-anterior="Formulário inicial"]')).toContainText(/Criado por Demo · hoje/);

    // Salvamento automático: erro mantém o valor com a mensagem; corrigir salva sozinho
    const cnpj = atual.locator('[data-campo="CNPJ"]');
    await cnpj.getByRole("textbox").fill("11.222.333/0001-00");
    await cnpj.getByRole("textbox").press("Tab");
    await expect(cnpj).toHaveAttribute("data-salvamento", "erro");
    await expect(cnpj.locator("[data-erro-campo]")).toContainText(/CNPJ/i);
    await cnpj.getByRole("textbox").fill("11.222.333/0001-81");
    await expect(cnpj).toHaveAttribute("data-salvamento", "salvo");

    // N:1 com busca; vira conexão (mini-card) à esquerda
    const cliente = atual.locator('[data-campo="Cliente"]');
    await cliente.getByLabel("Ligar Cliente").fill("Horizonte");
    await cliente.getByRole("option", { name: /Loja Horizonte/ }).getByRole("button").click();
    await expect(cliente.getByRole("link", { name: "Loja Horizonte" })).toBeVisible();
    await expect(esquerda.locator('[data-mini-card="Loja Horizonte"]')).toContainText("Clientes");

    // Mover: "Enviado" tem regra (itens separados) e some; obrigatório vazio desabilita com o motivo uma vez
    await expect(lateral.locator('[data-mover="Enviado"]')).toHaveCount(0);
    await expect(lateral.locator('[data-mover="Em separação"] button')).toBeEnabled();
    await atual.locator('[data-campo="Entrega expressa"]').getByRole("checkbox").check(); // exige Janela de entrega
    await expect(atual.locator('[data-campo="Entrega expressa"]')).toHaveAttribute("data-salvamento", "salvo");
    await expect(lateral.locator('[data-mover="Em separação"] button')).toBeDisabled();
    await expect(lateral.locator("[data-motivo-mover]")).toHaveCount(1);
    await expect(lateral.locator("[data-motivo-mover]")).toContainText("Janela de entrega");
    await atual.locator('[data-campo="Janela de entrega"]').getByRole("textbox").fill("Manhã");
    await expect(atual.locator('[data-campo="Janela de entrega"]')).toHaveAttribute("data-salvamento", "salvo");
    await expect(lateral.locator('[data-mover="Em separação"] button')).toBeEnabled();

    // 1:N pela sub-tabela; item separado libera "Enviado"
    const itens = atual.locator('[data-subtabela="Itens"]');
    await itens.getByLabel("Valor", { exact: true }).fill("700");
    await itens.getByRole("button", { name: "Adicionar" }).click();
    await expect(itens.locator("[data-linha]")).toHaveCount(1);
    await itens.locator("[data-linha]").getByLabel(/^Separado de /).check();
    await expect(lateral.getByRole("button", { name: "Mover para Enviado" })).toBeEnabled();
    await lateral.getByRole("button", { name: "Mover para Enviado" }).click();
    await expect(atual.getByTestId("fase-card")).toHaveText("Enviado");
    // Voltar: só a fase imediatamente anterior aparece, como pill neutra
    await expect(lateral.getByRole("button", { name: "Voltar para Em separação" })).toBeVisible();
    await expect(lateral.getByRole("button", { name: "Voltar para Novo" })).toHaveCount(0);

    // Histórico por fase: Formulário inicial em leitura; Contato (editable_everywhere) edita no lugar
    const inicial = esquerda.locator('[data-fase-anterior="Formulário inicial"]');
    const referencia = inicial.locator('[data-campo-anterior="Referência"]');
    const contato = inicial.locator('[data-campo-anterior="Contato"]');
    await expect(referencia).toContainText("Pedido do card (e2e)");
    await expect(referencia.getByRole("button", { name: "Editar Referência" })).toHaveCount(0);
    await contato.hover();
    await contato.getByRole("button", { name: "Editar Contato" }).click();
    await contato.getByLabel("Contato").fill("Compras Card Ltda.");
    await contato.getByRole("button", { name: "Salvar" }).click();
    await expect(contato).toContainText("Compras Card Ltda.");
    await page.reload();
    await expect(page.getByTestId("painel-card").locator('[data-campo-anterior="Contato"]')).toContainText("Compras Card Ltda.");

    // Abas: atividades (movimento com as fases), anexos por campo, e-mail em breve
    const p = page.getByTestId("painel-card");
    await p.getByRole("tab", { name: /Atividades/ }).click();
    await expect(p.getByTestId("historico")).toContainText("moveu de Novo para Enviado");
    await p.getByRole("tab", { name: /Anexos/ }).click();
    await expect(p.locator("[data-anexos-card]")).toContainText("Comprovante do pedido");
    await p.getByRole("tab", { name: "E-mail" }).click();
    await expect(p.getByText("Em breve")).toBeVisible();

    // No cliente, o pedido aparece em "conectado a" (relação inversa)
    await page.goto(urlPedido);
    await page.getByTestId("coluna-esquerda").locator('[data-mini-card="Loja Horizonte"]').getByRole("link", { name: "Loja Horizonte" }).click();
    // Da página do card, o card relacionado abre em modal por cima (rota interceptada)
    const modal = page.locator('[data-testid="painel-card"][data-modo="modal"]');
    await expect(modal.getByTestId("titulo-card")).toHaveText("Loja Horizonte");
    const idPedido = urlPedido.split("/c/")[1];
    const conexoes = modal.getByTestId("coluna-esquerda").locator("[data-conexoes]");
    if (await conexoes.getByRole("button", { name: /Mostrar mais/ }).count()) await conexoes.getByRole("button", { name: /Mostrar mais/ }).click();
    await expect(conexoes.locator(`a[href$="/c/${idPedido}"]`).first()).toContainText("PD-");
  });
});
