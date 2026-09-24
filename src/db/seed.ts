// Seed de desenvolvimento: workspace "demo" com o caso de aceitação do MVP (Contratos → Parcelas).
// Idempotente: se o workspace demo já existir, não faz nada. Cards de exemplo passam pelo core.
//   pnpm db:seed
import { eq } from "drizzle-orm";
import { db } from "./index";
import { boards, fieldPhaseSettings, fields, phases, rules, users, workspaceMembers, workspaces } from "./schema";
import { createCard, emitirEventoConfig, garantirIndiceExclusivo, updateFields, type Actor } from "../core";
import { hashSenha } from "../server/auth/senha";

const EMAIL = process.env.PLEXU_SEED_EMAIL ?? "demo@plexu.dev";
const SENHA = process.env.PLEXU_SEED_SENHA ?? "plexu-demo-2026";

async function main() {
  const [existe] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, "demo"));
  if (existe) {
    console.log("seed: workspace 'demo' já existe; nada a fazer.");
    return;
  }

  const ids = await db.transaction(async (tx) => {
    let [u] = await tx.select().from(users).where(eq(users.email, EMAIL));
    if (!u) {
      [u] = await tx.insert(users).values({ email: EMAIL, name: "Demo", auth: { senha: await hashSenha(SENHA), sv: 0 } }).returning();
    }
    const actor: Actor = { type: "user", id: u.id };
    const [ws] = await tx
      .insert(workspaces)
      .values({ slug: "demo", name: "Demo", settings: { timezone: "America/Sao_Paulo" } })
      .returning();
    await tx.insert(workspaceMembers).values({ workspaceId: ws.id, userId: u.id, orgRole: "owner" });
    const cfg = (boardId: string | null, entidade: "workspace" | "board" | "phase" | "field" | "rule", id: string, dados?: Record<string, unknown>) =>
      emitirEventoConfig(tx, { workspaceId: ws.id, boardId, actor }, { entidade, acao: "created", id, dados });
    await cfg(null, "workspace", ws.id, { slug: "demo", seed: true });

    // Parcelas (base)
    const [bp] = await tx.insert(boards).values({ workspaceId: ws.id, slug: "parcelas", name: "Parcelas", kind: "database" }).returning();
    await cfg(bp.id, "board", bp.id);
    const campo = async (
      boardId: string,
      slug: string,
      name: string,
      type: string,
      position: number,
      config: Record<string, unknown> = {},
      extra: { visibleExpr?: string; requiredExpr?: string; helpText?: string } = {},
    ) => {
      const [f] = await tx.insert(fields).values({ boardId, slug, name, type: type as never, position, config, ...extra }).returning();
      await cfg(boardId, "field", f.id, { slug, type });
      return f.id;
    };
    const pNumero = await campo(bp.id, "numero", "Número", "sequence", 0, { sequence: { pattern: "PC-{n}", scope: "global", seed: 1, pad: 4 } });
    await campo(bp.id, "valor", "Valor", "currency", 1, { currency: { code: "BRL" } });
    await campo(bp.id, "vencimento", "Vencimento", "date", 2);
    await campo(bp.id, "medida", "Medida", "boolean", 3);
    await campo(bp.id, "paga", "Paga", "boolean", 4);
    await tx.update(boards).set({ titleFieldId: pNumero }).where(eq(boards.id, bp.id));

    // Aditivos (base): descrição obrigatória em texto longo, que o "Adicionar" rápido da sub-tabela
    // não cobre; o botão abre o formulário completo do board já vinculado ao contrato.
    const [ba] = await tx.insert(boards).values({ workspaceId: ws.id, slug: "aditivos", name: "Aditivos", kind: "database" }).returning();
    await cfg(ba.id, "board", ba.id);
    const aNumero = await campo(ba.id, "numero", "Número", "sequence", 0, { sequence: { pattern: "AD-{n}", scope: "global", seed: 1, pad: 4 } });
    await campo(ba.id, "descricao", "Descrição", "long_text", 1, {}, { requiredExpr: "true", helpText: "O que muda no contrato." });
    await campo(ba.id, "valor", "Valor", "currency", 2, { currency: { code: "BRL" } });
    await tx.update(boards).set({ titleFieldId: aNumero }).where(eq(boards.id, ba.id));

    // Contratos (fluxo)
    const [bc] = await tx.insert(boards).values({ workspaceId: ws.id, slug: "contratos", name: "Contratos", kind: "workflow" }).returning();
    await cfg(bc.id, "board", bc.id);
    const fases: Record<string, string> = {};
    for (const [i, f] of [
      { name: "Elaboração" },
      { name: "Vigente" },
      { name: "Encerrado", terminal: true },
    ].entries()) {
      const [p] = await tx.insert(phases).values({ boardId: bc.id, name: f.name, position: i, isTerminal: f.terminal ?? false }).returning();
      fases[f.name] = p.id;
      await cfg(bc.id, "phase", p.id, { name: f.name });
    }
    const cNumero = await campo(bc.id, "numero", "Número", "sequence", 0, { sequence: { pattern: "CT-{n}/{ano}", scope: "year", seed: 1, pad: 4 } });
    // Fases de preenchimento (decisão 18-revisada): dados do contrato na Elaboração, somente leitura
    // depois (o contratante pode ser corrigido em qualquer fase); "Valor pago" aparece a partir da Vigência.
    const elab = { fill_phases: [fases["Elaboração"]] };
    const cObjeto = await campo(bc.id, "objeto", "Objeto", "text", 1, elab);
    await campo(bc.id, "contratante", "Contratante", "text", 2, { ...elab, editable_everywhere: true });
    await campo(bc.id, "cnpj", "CNPJ", "cnpj", 3, elab);
    const cParcelas = await campo(bc.id, "parcelas", "Parcelas", "relation", 4, {
      relation: { target_board: bp.id, cardinality: "many", exclusive: true, inverse_name: "contrato" },
    });
    await garantirIndiceExclusivo(tx, cParcelas);
    await campo(bc.id, "qtd_parcelas", "Qtd. parcelas", "rollup", 5, { ...elab, rollup: { via_field: cParcelas, agg: "count" } });
    await campo(bc.id, "valor_global", "Valor global", "rollup", 6, { ...elab, rollup: { via_field: cParcelas, agg: "sum", expr: "valor", format: "currency" } });
    await campo(bc.id, "valor_pago", "Valor pago", "rollup", 7, {
      fill_phases: [fases["Vigente"]],
      rollup: { via_field: cParcelas, agg: "sum", expr: "valor", filter_expr: "card.paga == true", format: "currency" },
    });
    await campo(bc.id, "resumo", "Resumo", "dynamic_text", 8, { ...elab, dynamic_text: { template: "{numero} · {qtd_parcelas} parcela(s)" } });
    const cAditivos = await campo(bc.id, "aditivos", "Aditivos", "relation", 9, {
      relation: { target_board: ba.id, cardinality: "many", exclusive: true, inverse_name: "contrato" },
    });
    await garantirIndiceExclusivo(tx, cAditivos);
    await campo(bc.id, "exige_garantia", "Exige garantia", "boolean", 10, elab);
    await campo(
      bc.id,
      "valor_garantia",
      "Valor da garantia",
      "currency",
      11,
      { ...elab, currency: { code: "BRL" } },
      { visibleExpr: "card.exige_garantia == true", requiredExpr: "card.exige_garantia == true" },
    );
    await tx.update(boards).set({ titleFieldId: cNumero }).where(eq(boards.id, bc.id));
    await tx.insert(fieldPhaseSettings).values({ fieldId: cObjeto, phaseId: fases["Elaboração"], required: true });

    const [regra] = await tx
      .insert(rules)
      .values({
        boardId: bc.id,
        kind: "can_leave",
        phaseId: fases["Elaboração"],
        expr: 'filhos("parcelas").contar() > 0 && filhos("parcelas").todos(p, p.medida == true)',
        message: "Todas as parcelas precisam estar medidas (e deve haver ao menos uma).",
      })
      .returning();
    await cfg(bc.id, "rule", regra.id, { kind: "can_leave" });

    return { actor, contratos: bc.id, parcelas: bp.id, cParcelas };
  });

  // Exemplo: um contrato com duas parcelas, uma medida (via core, como qualquer canal)
  const contrato = await createCard({
    boardId: ids.contratos,
    props: { objeto: "Reforma da sede", contratante: "Construtora Beta", cnpj: "11.222.333/0001-81" },
    actor: ids.actor,
  });
  const p1 = await createCard({ boardId: ids.parcelas, props: { valor: 12000, vencimento: "2026-10-10" }, actor: ids.actor });
  const p2 = await createCard({ boardId: ids.parcelas, props: { valor: 8000, vencimento: "2026-11-10" }, actor: ids.actor });
  await updateFields({ cardId: contrato.id, props: { parcelas: [p1.id, p2.id] }, actor: ids.actor });
  await updateFields({ cardId: p1.id, props: { medida: true }, actor: ids.actor });

  console.log(`seed: workspace 'demo' criado. Login: ${EMAIL} / ${SENHA}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
