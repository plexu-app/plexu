// Parte C do redesign (docs/design/prompt-redesign-pr2.md): configurações do board em modal grande
// (formulário da fase com paleta e prévia, editor de campo com dependências, condicionais em campos) e a
// página de automações (lista em cards, editor em dois painéis, logs). Medidas com getBoundingClientRect.
import { expect, test, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";

const EMAIL = process.env.PLEXU_SEED_EMAIL ?? "demo@plexu.dev";
const SENHA = process.env.PLEXU_SEED_SENHA ?? "plexu-demo-2026";
const URL_BANCO = process.env.E2E_DATABASE_URL ?? "postgres://plexu:plexu@localhost:5433/plexu_e2e";

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
    return { x: b.x, y: b.y, w: b.width, h: b.height, raio: s.borderTopLeftRadius };
  });

test.describe("parte C: configurações e automações", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await entrar(page);
  });

  test("modal de configurações: abas, paleta de 270px, prévia de 520px na cor da fase, editor de 760px com dependências", async ({ page }) => {
    await page.goto("/w/demo/b/pedidos/settings");
    const modal = page.locator("[data-modal-config]");
    const m = await medir(modal);
    expect([m.w, m.raio]).toEqual([1440, "12px"]);
    await expect(modal.getByRole("tab")).toHaveText(["Formulário inicial", "Fases", "Pessoas", "E-mail", "Configurações do fluxo"]);
    expect((await medir(page.locator("[data-paleta]"))).w).toBe(270);
    expect((await medir(page.locator("[data-cartao-formulario]"))).w).toBe(520);
    await expect(page.locator("[data-cartao-formulario]")).toContainText("Novo");
    await expect(page.locator("[data-seletor-fase]")).toHaveText("Novo");

    // Fases: seletor com as outras fases; trocar de fase troca a prévia
    await modal.getByRole("tab", { name: "Fases" }).click();
    await expect(page).toHaveURL(/aba=fases/);
    await expect(page.locator("[data-seletor-fase]")).toHaveText("Em separação");
    await page.locator("[data-seletor-fase]").click();
    await page.getByRole("dialog", { name: "Escolher fase" }).getByRole("button", { name: "Enviado" }).click();
    await expect(page.locator("[data-cartao-formulario]")).toContainText("Pedidos a caminho do cliente.");

    // Editor de campo: 760px, prévia ao vivo e dependências (Referência está no cartão do kanban)
    await modal.getByRole("tab", { name: "Formulário inicial" }).click();
    const ref = page.locator('[data-campo-formulario="Referência"]');
    await ref.hover();
    await ref.getByRole("button", { name: "Editar Referência" }).click();
    const editor = page.getByRole("dialog", { name: /Editar campo: Referência/ });
    expect((await medir(page.locator("[data-editor-campo]"))).w).toBe(760);
    await expect(editor.getByTestId("previa-campo")).toContainText("Esta é uma prévia do seu campo");
    await editor.locator("[data-dependencias-campo] summary").click();
    await expect(editor.locator("[data-dependencias-campo]")).toContainText("Campos no card do kanban");
  });

  test("paleta adiciona campo na fase; arrastar reordena; arquivar e restaurar pelo filtro", async ({ page }) => {
    test.setTimeout(240_000);
    const nome = `Observação ${Date.now().toString(36)}`;
    await page.goto("/w/demo/b/pedidos/settings?aba=fases");
    await page.locator("[data-seletor-fase]").click();
    await page.getByRole("dialog", { name: "Escolher fase" }).getByRole("button", { name: "Em separação" }).click();
    await expect(page.locator("[data-cartao-formulario]")).toContainText("Em separação");

    // Clique na paleta: editor já com o tipo e a fase atual marcada
    await page.getByRole("button", { name: "Adicionar campo Texto longo" }).click();
    const editor = page.getByRole("dialog", { name: "Novo campo" });
    await expect(editor.getByLabel("Tipo do campo")).toHaveValue("long_text");
    await expect(editor.getByRole("group", { name: "Preenchido nas fases" }).getByLabel("Em separação")).toBeChecked();
    await editor.getByLabel("Nome do campo").fill(nome);
    await editor.getByRole("button", { name: "Salvar campo" }).click();
    await expect(page.getByText("Campo criado")).toBeVisible();
    const linhas = page.locator("[data-campo-formulario]");
    await expect(linhas.last()).toHaveAttribute("data-campo-formulario", nome);

    // Arrastar pela alça para antes do primeiro campo
    const novo = page.locator(`[data-campo-formulario="${nome}"]`);
    await novo.hover();
    const alca = novo.getByRole("button", { name: `Arrastar ${nome}` });
    const a = (await alca.boundingBox())!;
    const b = (await linhas.first().boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + 10, a.y - 10, { steps: 4 });
    await page.mouse.move(b.x + 40, b.y + 8, { steps: 15 });
    // A UI reordena na hora; espera a gravação antes de recarregar
    const gravou = page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]);
    await page.mouse.up();
    await gravou;
    await expect(linhas.first()).toHaveAttribute("data-campo-formulario", nome);
    await page.reload();
    await expect(page.locator("[data-campo-formulario]").first()).toHaveAttribute("data-campo-formulario", nome);

    // Arquivar pelo ⋯; aparece em "arquivados"; restaurar volta; arquivar de novo (limpeza)
    const arquivar = async () => {
      page.once("dialog", (d) => d.accept());
      await page.locator(`[data-campo-formulario="${nome}"]`).hover();
      await page.getByRole("button", { name: `Mais opções de ${nome}` }).click();
      await page.getByRole("dialog", { name: `Opções do campo ${nome}` }).getByRole("button", { name: "Arquivar" }).click();
      await expect(page.locator(`[data-campo-formulario="${nome}"]`)).toHaveCount(0);
    };
    await arquivar();
    await page.getByLabel("Filtro de campos").selectOption("arquivados");
    await page.locator("[data-campos-arquivados] li").filter({ hasText: nome }).getByRole("button", { name: "Restaurar" }).click();
    await page.getByLabel("Filtro de campos").selectOption("ativos");
    await expect(page.locator(`[data-campo-formulario="${nome}"]`)).toBeVisible();
    await arquivar();
  });

  test("condicional em campos gera a expressão certa nos campos (e some ao excluir)", async ({ page }) => {
    const sql = postgres(URL_BANCO, { max: 1, onnotice: () => {} });
    const campo = async (slug: string) =>
      (await sql`select f.id, f.visible_expr, f.required_expr from fields f join boards b on b.id = f.board_id join workspaces w on w.id = b.workspace_id
        where w.slug = 'demo' and b.slug = 'pedidos' and f.slug = ${slug}`)[0];
    const original = await campo("janela");
    try {
      await page.goto("/w/demo/b/pedidos/settings");
      await page.getByRole("button", { name: /Condicionais em campos/ }).click();
      const dlg = page.locator("[data-condicionais]");
      expect((await medir(dlg)).w).toBe(520);
      await dlg.getByRole("button", { name: "Nova condicional" }).click();
      // Condição: Entrega expressa é igual a sim
      await dlg.getByRole("button", { name: "Condição", exact: true }).click();
      await dlg.getByLabel("Campo", { exact: true }).selectOption({ label: "Entrega expressa" });
      await dlg.getByRole("button", { name: "Sugerir nome" }).click();
      await expect(dlg.getByLabel("Nome da condicional")).toHaveValue("Se Entrega expressa é sim");
      // Quando verdadeiro: exibir e tornar obrigatório a Janela de entrega
      const verdade = dlg.locator('[data-ramo="seVerdadeiro"]');
      await verdade.getByRole("button", { name: /Campos da ação 1/ }).click();
      await page.getByRole("dialog", { name: /Campos da ação 1/ }).getByLabel("Janela de entrega").check();
      await page.keyboard.press("Escape"); // fecha só o menu de campos, não a janela de condicionais
      await expect(page.getByRole("dialog", { name: /Campos da ação 1/ })).toHaveCount(0);
      await expect(dlg).toBeVisible();
      await verdade.getByRole("button", { name: "+ ação" }).click();
      await verdade.getByLabel("Ação 2 (Quando verdadeiro)", { exact: true }).selectOption({ label: "Tornar obrigatório" });
      await verdade.getByRole("button", { name: /Campos da ação 2/ }).click();
      await page.getByRole("dialog", { name: /Campos da ação 2/ }).getByLabel("Janela de entrega").check();
      await page.keyboard.press("Escape");
      await dlg.getByRole("button", { name: "Salvar condicional" }).click();
      await expect(page.getByText("Condicional salva")).toBeVisible();
      await expect(dlg.locator('[data-condicional="Se Entrega expressa é sim"]')).toContainText("exibir Janela de entrega");

      const gerado = await campo("janela");
      expect([gerado.visible_expr, gerado.required_expr]).toEqual(["(card.expressa == true)", "(card.expressa == true)"]);

      // Excluir a condicional desfaz o que ela gerou
      page.once("dialog", (d) => d.accept());
      await dlg.getByRole("button", { name: "Excluir Se Entrega expressa é sim" }).click();
      await expect(page.getByText("Condicional excluída")).toBeVisible();
      const depois = await campo("janela");
      expect([depois.visible_expr, depois.required_expr]).toEqual([null, null]);
    } finally {
      // O seed tem essas expressões direto no campo: volta como estava para os outros testes.
      await sql`update fields set visible_expr = ${original.visible_expr}, required_expr = ${original.required_expr} where id = ${original.id}`;
      await sql`update boards set settings = settings - 'conditionals' - 'conditionals_generated' where id = (select board_id from fields where id = ${original.id})`;
      await sql.end();
    }
  });

  test("automações: cards largos com evento/ação/atualização; editor em dois painéis; logs com duração", async ({ page }) => {
    await page.goto("/w/demo/b/pedidos");
    await page.getByRole("navigation", { name: "Navegação do board" }).getByRole("link", { name: "Automações" }).click();
    await page.waitForURL(/\/automacoes$/);
    const lista = page.locator("[data-lista-automacoes]");
    expect((await medir(lista)).w).toBe(1100);
    await expect(page.locator("[data-contador-automacoes]")).toHaveText(/^Mostrando \d+ automaç(ão|ões)$/);
    const card = page.locator('[data-automacao="Concluir pedido quando todas as entregas chegarem"]');
    await expect(card.locator("dt")).toHaveText(["Evento", "Ação", "Atualizado em", "Atualizado por"]);
    await expect(card).toContainText("Mover card");
    await expect(card.getByRole("switch", { name: /^Ligar / })).toBeChecked();

    // Linha compacta e busca
    await page.getByRole("button", { name: "Linhas" }).click();
    await expect(card).toContainText("→");
    await page.getByLabel("Buscar automação").fill("nenhuma-assim");
    await expect(page.locator("[data-contador-automacoes]")).toHaveText("Mostrando 0 automações");
    await page.getByLabel("Buscar automação").fill("");

    // Editor: título, evento → ação lado a lado com conector, salvar na largura da ação
    await page.getByRole("link", { name: "Concluir pedido quando todas as entregas chegarem" }).click();
    const editor = page.getByRole("form", { name: "Editar automação" });
    await expect(editor.getByLabel("Nome da automação")).toHaveValue("Concluir pedido quando todas as entregas chegarem");
    const evento = await medir(editor.locator('[data-painel="evento"]'));
    const acao = await medir(editor.locator('[data-painel="acao"]'));
    expect(acao.x).toBeGreaterThan(evento.x + evento.w); // lado a lado
    expect(Math.abs(acao.y - evento.y)).toBeLessThan(2);
    await expect(editor.locator("[data-conector]")).toBeVisible();
    expect((await medir(editor.getByRole("button", { name: "Salvar automação" }))).w).toBe(acao.w);
    await editor.getByRole("button", { name: "+ adicionar condição" }).click();
    await expect(editor.getByText("e também siga estas condições")).toBeVisible();

    // Logs: tabela com duração e filtro por status
    await editor.getByRole("link", { name: "Ver logs" }).click();
    await expect(page).toHaveURL(/aba=logs/);
    await expect(page.getByLabel("Filtrar por status")).toBeVisible();
    await expect(page.locator("thead th").filter({ hasText: "Duração" })).toHaveCount(1);
  });
});
