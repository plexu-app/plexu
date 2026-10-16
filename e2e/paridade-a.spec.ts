// Parte A do redesign (docs/design/prompt-redesign-pr2.md): cabeçalho em 3 faixas, kanban paginado com as
// medidas do prompt (getBoundingClientRect), cartão, lista com colunas salvas e sidebar < 1600px.
// A rolagem infinita usa o board de carga (seed --carga=100: 40 cards na primeira fase).
import { execFileSync } from "node:child_process";
import { expect, test, type Locator, type Page } from "@playwright/test";

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

/** Caixa e estilos calculados de um elemento. */
const medir = (l: Locator) =>
  l.evaluate((el) => {
    const b = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      x: b.x,
      w: b.width,
      h: b.height,
      padding: s.padding,
      paddingLeft: s.paddingLeft,
      marginTop: s.marginTop,
      marginBottom: s.marginBottom,
      borderTop: s.borderTopWidth,
      borderBottom: s.borderBottomWidth,
      cor: s.color,
      corBordaBaixo: s.borderBottomColor,
    };
  });

const corDoToken = (page: Page, token: string) =>
  page.evaluate((t) => {
    const el = document.createElement("span");
    el.style.color = `var(${t})`;
    document.body.append(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  }, token);

test.describe("parte A: shell, kanban e lista", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page);
  });

  test("cabeçalho em 3 faixas com as medidas do prompt; recolher esconde 2 e 3 e persiste", async ({ page }) => {
    await page.goto("/w/demo/b/pedidos");
    const global = await medir(page.locator('[data-faixa="global"]'));
    expect([global.h, global.paddingLeft]).toEqual([56, "24px"]);
    expect((await medir(page.locator('[data-faixa="contexto"]'))).h).toBe(48);
    expect((await medir(page.locator('[data-faixa="visoes"]'))).h).toBe(48);
    const abas = page.locator("[data-aba-visao]");
    const [kanban, lista] = [await medir(abas.nth(0)), await medir(abas.nth(1))];
    expect([kanban.h, kanban.padding]).toEqual([40, "12px 16px"]);
    expect(lista.x - (kanban.x + kanban.w)).toBe(12); // gap entre abas
    const acento = await corDoToken(page, "--accent");
    expect([kanban.cor, kanban.corBordaBaixo, kanban.borderBottom]).toEqual([acento, acento, "2px"]); // ativa: texto e sublinhado
    expect((await medir(page.locator("[data-busca-board]"))).w).toBe(232);
    await expect(page.getByRole("navigation", { name: "Navegação do board" }).getByRole("link", { name: "Fluxo" })).toHaveAttribute("aria-current", "page");

    // Recolher: só a faixa global fica; persiste depois de recarregar; mostrar volta
    await page.getByRole("button", { name: "Recolher cabeçalho" }).click();
    await expect(page.locator('[data-faixa="contexto"]')).toBeHidden();
    await expect(page.locator('[data-faixa="visoes"]')).toBeHidden();
    await page.reload();
    await expect(page.locator('[data-faixa="visoes"]')).toBeHidden();
    await page.getByRole("button", { name: "Mostrar cabeçalho" }).click();
    await expect(page.locator('[data-faixa="visoes"]')).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-faixa="contexto"]')).toBeVisible();

    // Nome do board abre as informações; Conexões lista os boards relacionados
    await page.getByRole("button", { name: /Pedidos/ }).first().click();
    await expect(page.locator("[data-info-board]")).toContainText("Fluxo");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Conexões", exact: true }).click();
    const conexoes = page.getByRole("dialog", { name: "Boards conectados" });
    await expect(conexoes.getByRole("link", { name: "Clientes" })).toBeVisible();
    await expect(conexoes.getByRole("link", { name: "Itens" })).toBeVisible();
  });

  test("kanban: medidas de fase e cartão, + só onde cria, conexões, tempos e descrição na fase vazia", async ({ page }) => {
    await page.goto("/w/demo/b/pedidos");
    const area = await medir(page.locator("[data-kanban]"));
    expect([area.paddingLeft, area.borderTop]).toEqual(["24px", "1px"]);
    const fase = page.locator('[data-fase="Novo"]');
    const f = await medir(fase);
    expect([f.w, f.marginTop]).toEqual([280, "16px"]);
    const cab = await medir(fase.locator("[data-cabecalho-fase]"));
    expect([cab.w, cab.h, cab.borderTop]).toEqual([256, 40, "3px"]);
    const cartao = fase.locator("[data-card]").first();
    expect((await medir(cartao)).w).toBe(256);
    expect((await medir(cartao.locator("[data-corpo-cartao]"))).padding).toBe("12px 12px 12px 8px");
    expect((await medir(fase.locator("[data-lista-fase] > li").first())).marginBottom).toBe("8px");

    // "+" só na primeira fase (formulário inicial) e nas que permitem criação; botão flutuante
    await expect(fase.getByRole("button", { name: "Novo cartão em Novo" })).toBeVisible();
    await expect(page.locator('[data-fase="Em separação"]').getByRole("button", { name: /^Novo cartão em/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Criar novo cartão" })).toBeVisible();

    // Cartão: campos resumidos, tempos e conexão N:1 marcada "mostrar no card"
    const pd1 = page.locator("[data-card]").filter({ hasText: "PD-0001" });
    await expect(pd1.locator('[data-campo-cartao="Valor total"]')).toBeVisible();
    await expect(pd1.locator("[data-tempos]")).toBeVisible();
    await expect(pd1.locator("[data-conexoes-cartao]")).toContainText("Mercado Aurora");
    await pd1.getByRole("button", { name: "Esconder conexões" }).click();
    await expect(pd1.locator("[data-conexoes-cartao]")).toHaveCount(0);

    // Busca no servidor: sem resultado, cada fase mostra a sua descrição
    await page.getByLabel("Filtrar cartões").fill("zzz-nenhum");
    await expect(page).toHaveURL(/q=zzz-nenhum/);
    await expect(fase.locator("[data-fase-vazia]")).toHaveText("Pedidos recebidos, aguardando conferência.");
    await expect(page.locator("[data-card]")).toHaveCount(0);
    await page.getByLabel("Filtrar cartões").fill("PD-0004");
    await expect(page.locator("[data-card]")).toHaveCount(1);
  });

  test("rolagem infinita: 15 cards por fase e o resto ao rolar (fase com 40)", async ({ page }) => {
    test.setTimeout(240_000);
    execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/db/seed.ts", "--carga=100"], { env: { ...process.env, DATABASE_URL: URL_BANCO }, stdio: "ignore" });
    await page.goto("/w/carga/b/volume");
    const fase = page.locator('[data-fase="Entrada"]');
    await expect(fase.locator("[data-cabecalho-fase]")).toContainText("40");
    await expect(fase.locator("[data-card]")).toHaveCount(15);
    const lista = fase.locator("[data-lista-fase]");
    for (const esperado of [30, 40]) {
      await lista.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await expect(fase.locator("[data-card]")).toHaveCount(esperado);
    }
    await expect(fase.locator("[data-carregando-fase]")).toHaveCount(0);

    // Lista do mesmo board: 50 por página, mais ao rolar; seleção e mover em massa
    await page.goto("/w/carga/b/volume/table");
    await expect(page.locator("[data-contagem-lista]")).toHaveText("50 de 100 cartões");
    await page.getByLabel(/^Selecionar Item/).first().check();
    await page.getByLabel(/^Selecionar Item/).nth(1).check();
    const massa = page.getByRole("group", { name: "Ações em massa" });
    await expect(massa).toContainText("2 selecionado(s)");
    await massa.getByLabel("Mover selecionados para").selectOption({ label: "Triagem" });
    await massa.getByRole("button", { name: "Mover" }).click();
    await expect(page.getByText("2 movido(s)")).toBeVisible();
  });

  test("lista: colunas escolhidas e ordenadas ficam salvas na view; ordenação no servidor", async ({ page }) => {
    await page.goto("/w/demo/b/pedidos/table");
    const cabecalhos = page.locator("[data-coluna-lista]");
    await expect(cabecalhos.first()).toHaveAttribute("data-coluna-lista", "Fase atual");
    const salvar = async (fn: (painel: Locator) => Promise<void>) => {
      await page.getByRole("button", { name: "Colunas" }).click();
      const painel = page.getByRole("dialog", { name: "Colunas da lista" });
      await fn(painel);
      await painel.getByRole("button", { name: "Salvar colunas" }).click();
      await expect(page.getByText("Colunas salvas")).toBeVisible();
    };
    try {
      await salvar(async (p) => {
        await p.locator('[data-opcao-coluna="Responsáveis"]').getByRole("checkbox").uncheck();
        await p.getByRole("button", { name: "Subir Título" }).click(); // Título antes de Fase atual
      });
      await page.reload();
      await expect(cabecalhos.first()).toHaveAttribute("data-coluna-lista", "Título");
      await expect(page.locator('[data-coluna-lista="Responsáveis"]')).toHaveCount(0);
    } finally {
      await salvar((p) => p.getByRole("button", { name: "Padrão" }).click()); // todas, na ordem original
    }
    // Ordenar pelo título: o servidor devolve em ordem
    await page.locator('[data-coluna-lista="Título"]').getByRole("button").click();
    await expect(page).toHaveURL(/ordem=__titulo&dir=asc/);
    await expect(page.locator("[data-linha]").first()).toContainText("PD-0001");
    await expect(page.locator('[data-coluna-lista="Título"]')).toHaveAttribute("aria-sort", "ascending");
  });

  test("sidebar começa recolhida abaixo de 1600px e aberta acima, sem escolha salva", async ({ page }) => {
    const nav = page.getByRole("complementary", { name: "Navegação" });
    await page.evaluate(() => localStorage.removeItem("plexu:sidebar"));
    await page.reload();
    expect((await nav.boundingBox())!.width).toBeLessThan(80);
    await page.setViewportSize({ width: 1700, height: 900 });
    await page.reload();
    expect((await nav.boundingBox())!.width).toBeGreaterThan(200);
  });
});
