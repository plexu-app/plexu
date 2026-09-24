// Import/export de template no banco de teste: ida e volta, validação e comportamento no core.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createCard, estadoDosCampos, linkCards, moveCard } from "../../core";
import { CoreError } from "../../core/types";
import { validarTemplate, type Template } from "../../lib/template";
import { db } from "..";
import { users, workspaceMembers } from "../schema";
import { ErroImportacao, exportarTemplate, importarTemplate } from "../template";

const TEMPLATE: Template = {
  plexu_template: 1,
  name: "Compras (teste)",
  boards: [
    {
      key: "pedidos",
      name: "Pedidos",
      kind: "workflow",
      title_field: "numero",
      phases: [
        { key: "abertura", name: "Abertura" },
        { key: "aprovacao", name: "Aprovação" },
        { key: "entregue", name: "Entregue", terminal: true },
      ],
      fields: [
        { key: "numero", name: "Número", type: "sequence", sequence: { pattern: "PC-{n}", scope: "global", seed: 1, pad: 3 } },
        { key: "objeto", name: "Objeto", type: "text", required: "true", fill_phases: ["abertura"] },
        { key: "urgente", name: "Urgente", type: "boolean", fill_phases: ["abertura"], editable_everywhere: true },
        { key: "motivo", name: "Motivo", type: "long_text", visible: "card.urgente == true", fill_phases: ["abertura"] },
        { key: "itens", name: "Itens", type: "relation", relation: { board: "itens", cardinality: "many", exclusive: true, inverse_name: "pedido" } },
        { key: "total", name: "Total", type: "rollup", rollup: { via: "itens", agg: "sum", expr: "valor", format: "currency" } },
        { key: "resumo", name: "Resumo", type: "dynamic_text", dynamic_text: { template: "{numero}: {objeto}" } },
      ],
      rules: [{ kind: "can_leave", phase: "abertura", expr: 'filhos("itens").contar() > 0', message: "Inclua ao menos um item." }],
      automations: [{ key: "a1", name: "Avisar comprador", trigger: { event: "card_created" }, actions: [{ type: "send_email_template" }], status: "pendente" }],
    },
    {
      key: "itens",
      name: "Itens",
      kind: "database",
      title_field: "descricao",
      phases: [],
      fields: [
        { key: "descricao", name: "Descrição", type: "text" },
        { key: "valor", name: "Valor", type: "currency", currency: { code: "BRL" } },
      ],
    },
  ],
};

let email: string;
beforeAll(async () => {
  email = `tpl-${randomUUID().slice(0, 8)}@teste.dev`;
  await db.insert(users).values({ email, name: "Importador" });
});

describe("importarTemplate", () => {
  it("cria workspace, boards, fases, campos e regras que funcionam no core", async () => {
    const nome = `Tpl ${randomUUID().slice(0, 6)}`;
    const r = await importarTemplate(TEMPLATE, { workspace: nome, membro: email });
    expect(r.workspace.criado).toBe(true);
    expect(r.automacoesPendentes).toBe(1);
    const [u] = await db.select().from(users).where(eq(users.email, email));
    expect((await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, r.workspace.id)))[0]).toMatchObject({ userId: u.id, orgRole: "owner" });

    const actor = { type: "user" as const, id: u.id };
    const pedidos = r.boards.find((b) => b.key === "pedidos")!.id;
    const itens = r.boards.find((b) => b.key === "itens")!.id;
    const p = await createCard({ boardId: pedidos, props: { objeto: "Cadeiras" }, actor });
    expect(p.title).toBe("PC-001");
    const e = await estadoDosCampos({ cardId: p.id, actor });
    const ex = await exportarTemplate(r.workspace.slug, ["pedidos", "itens"]);
    const idDe = async (slug: string) => {
      const { fields } = await import("../schema");
      const { and } = await import("drizzle-orm");
      return (await db.select().from(fields).where(and(eq(fields.boardId, pedidos), eq(fields.slug, slug))))[0].id;
    };
    expect(e[await idDe("motivo")].visivel).toBe(false);

    // Regra do template: não sai da abertura sem itens
    const x = await moveCard({ cardId: p.id, toPhaseId: (await exportarFases(r.workspace.slug)).get("aprovacao")!, actor }).catch((err) => err);
    expect(x).toBeInstanceOf(CoreError);
    expect((x as CoreError).message).toBe("Inclua ao menos um item.");

    // Relação 1:N e rollup
    const i1 = await createCard({ boardId: itens, props: { descricao: "Cadeira", valor: 100 }, actor });
    const i2 = await createCard({ boardId: itens, props: { descricao: "Mesa", valor: 250.5 }, actor });
    await linkCards({ fieldId: "itens", fromCardId: p.id, toCardId: i1.id, actor });
    const depois = await linkCards({ fieldId: "itens", fromCardId: p.id, toCardId: i2.id, actor }).then(() => estadoDosCampos({ cardId: p.id, actor }));
    expect(depois).toBeTruthy();
    const { cards } = await import("../schema");
    const [lido] = await db.select().from(cards).where(eq(cards.id, p.id));
    expect(lido.computed[await idDe("total")]).toBe(350.5);
    expect(ex.boards).toHaveLength(2);
  });

  it("exporta de volta o mesmo modelo (ida e volta)", async () => {
    const r = await importarTemplate(TEMPLATE, { workspace: `Tpl ${randomUUID().slice(0, 6)}` });
    const ex = await exportarTemplate(r.workspace.slug, ["pedidos", "itens"], TEMPLATE.name);
    expect(validarTemplate(ex)).toEqual([]);
    const semAutomacoes = {
      ...TEMPLATE,
      boards: TEMPLATE.boards.map((b) => {
        const c = { ...b };
        delete c.automations;
        return c;
      }),
    };
    expect(ex).toEqual(semAutomacoes);
  });

  it("recusa template inválido sem gravar nada", async () => {
    const ruim: Template = { ...TEMPLATE, boards: [{ ...TEMPLATE.boards[0], fields: [...TEMPLATE.boards[0].fields, { key: "x", name: "X", type: "relation", relation: { board: "nao_existe" } }] }] };
    const nome = `Tpl ${randomUUID().slice(0, 6)}`;
    const e = await importarTemplate(ruim, { workspace: nome }).catch((err) => err);
    expect(e).toBeInstanceOf(ErroImportacao);
    expect((e as ErroImportacao).erros.map((x) => x.mensagem)).toContain("relação para board desconhecido: nao_existe");
    const { workspaces } = await import("../schema");
    expect(await db.select().from(workspaces).where(eq(workspaces.name, nome))).toHaveLength(0);
  });
});

async function exportarFases(wsSlug: string) {
  const { boards, phases, workspaces } = await import("../schema");
  const { and } = await import("drizzle-orm");
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, wsSlug));
  const [b] = await db.select().from(boards).where(and(eq(boards.workspaceId, ws.id), eq(boards.slug, "pedidos")));
  const fs = await db.select().from(phases).where(eq(phases.boardId, b.id));
  const t = await exportarTemplate(wsSlug, ["pedidos", "itens"]);
  return new Map(t.boards[0].phases.map((p) => [p.key, fs.find((f) => f.name === p.name)!.id]));
}
