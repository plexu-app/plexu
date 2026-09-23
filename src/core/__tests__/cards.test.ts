// Testes de integração do core contra Postgres real (DATABASE_URL; padrão: docker compose na 5433).
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { cardLinks, events } from "../../db/schema";
import { createCard, deleteCard, linkCards, moveCard, unlinkCards, updateFields } from "../cards";
import { nomeIndiceExclusivo } from "../fields";
import { dataNoFuso } from "../meta";
import { CoreError, type Actor, type CardRow } from "../types";
import { ajustarFase, criarBoard, criarCampo, criarRegra, criarWorkspace, definirTitulo, FUSO } from "./fixtures";

let actor: Actor;
let userId: string;
const ano = dataNoFuso(FUSO).slice(0, 4);

const C = { board: "", fases: {} as Record<string, string>, campos: {} as Record<string, string>, regras: {} as Record<string, string> };
const P = { board: "", campos: {} as Record<string, string> };
const N = { board: "", campos: {} as Record<string, string> };
const S = { board: "", campos: {} as Record<string, string> };
const PR = { board: "", campos: {} as Record<string, string> };

async function erro(p: Promise<unknown>): Promise<CoreError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof CoreError) return e;
    throw e;
  }
  throw new Error("esperava CoreError, operação passou");
}

async function eventosDe(cardId: string) {
  return db.select().from(events).where(eq(events.cardId, cardId)).orderBy(events.occurredAt);
}

beforeAll(async () => {
  const w = await criarWorkspace();
  actor = w.actor;
  userId = w.user.id;
  const ws = w.ws.id;

  // Contratos (workflow)
  const c = await criarBoard(ws, "contratos", [
    { name: "triagem" },
    { name: "elaboracao" },
    { name: "assinatura" },
    { name: "final", terminal: true },
  ]);
  C.board = c.id;
  C.fases = c.fases;
  // Parcelas (database) — criadas antes dos rollups, que apontam para a relação delas.
  const p = await criarBoard(ws, "parcelas");
  P.board = p.id;

  const cc = C.campos;
  cc.numero = await criarCampo(C.board, { slug: "numero", type: "sequence", config: { sequence: { pattern: "CT-{n}/{ano}", scope: "year" } } });
  cc.objeto = await criarCampo(C.board, { slug: "objeto", type: "text", name: "Objeto" });
  cc.assinante = await criarCampo(C.board, { slug: "assinante", type: "text", name: "Assinante", requiredExpr: 'fase == "elaboracao"' });
  cc.cnpj = await criarCampo(C.board, { slug: "cnpj", type: "cnpj", uniqueValue: true });
  cc.cpf = await criarCampo(C.board, { slug: "cpf", type: "cpf" });
  cc.responsavel = await criarCampo(C.board, { slug: "responsavel", type: "person" });
  cc.tipo = await criarCampo(C.board, { slug: "tipo", type: "select", config: { options: ["servico", "compra"] }, defaultValueExpr: '"servico"' });
  cc.tags = await criarCampo(C.board, { slug: "tags", type: "multi_select", config: { options: [{ value: "a" }, { value: "b" }] } });
  cc.aberto_em = await criarCampo(C.board, { slug: "aberto_em", type: "date", defaultValueExpr: "hoje()" });
  cc.valor_ref = await criarCampo(C.board, { slug: "valor_ref", type: "currency", validation: { min: 0 } });
  cc.qtd_itens = await criarCampo(C.board, { slug: "qtd_itens", type: "number" });
  cc.urgente = await criarCampo(C.board, { slug: "urgente", type: "boolean" });

  const pc = P.campos;
  pc.contrato = await criarCampo(P.board, {
    slug: "contrato",
    type: "relation",
    config: { relation: { target_board: C.board, is_parent: true, inverse_name: "parcelas", cardinality: "one" } },
  });
  pc.numero = await criarCampo(P.board, { slug: "numero", type: "sequence", config: { sequence: { pattern: "{pai.numero}/{n}", scope: "parent", parent_field: "contrato", pad: 2 } } });
  pc.valor = await criarCampo(P.board, { slug: "valor", type: "currency" });
  pc.medida = await criarCampo(P.board, { slug: "medida", type: "boolean" });
  pc.rotulo = await criarCampo(P.board, { slug: "rotulo", type: "dynamic_text", config: { dynamic_text: { template: "Parcela {numero} de {pai.numero}" } } });

  cc.total = await criarCampo(C.board, { slug: "total", type: "rollup", config: { rollup: { via_field: pc.contrato, agg: "sum", expr: "valor" } } });
  cc.qtd = await criarCampo(C.board, { slug: "qtd", type: "rollup", config: { rollup: { via_field: pc.contrato, agg: "count" } } });
  cc.medido = await criarCampo(C.board, { slug: "medido", type: "rollup", config: { rollup: { via_field: pc.contrato, agg: "sum", expr: "valor", filter_expr: "card.medida == true" } } });
  cc.resumo = await criarCampo(C.board, { slug: "resumo", type: "dynamic_text", config: { dynamic_text: { template: "{numero}: {qtd} parcela(s), total {total}" } } });
  await definirTitulo(C.board, cc.numero);

  await ajustarFase(cc.objeto, C.fases.triagem, { required: true });
  await ajustarFase(cc.valor_ref, C.fases.assinatura, { editable: false });

  C.regras.back = await criarRegra({ boardId: C.board, kind: "can_back", phaseId: C.fases.elaboracao, expr: 'filhos("parcelas").contar() == 0', message: "Contrato com parcelas não pode voltar" });
  C.regras.final = await criarRegra({ boardId: C.board, kind: "can_enter", phaseId: C.fases.final, expr: 'filhos("parcelas").todos(p, p.medida == true)', message: "Há parcelas não medidas" });
  C.regras.cnpj = await criarRegra({ boardId: C.board, kind: "can_edit", fieldId: cc.cnpj, phaseId: C.fases.assinatura, expr: "false", message: "CNPJ congelado na assinatura" });
  C.regras.del = await criarRegra({ boardId: C.board, kind: "can_delete", expr: "card.qtd == 0", message: "Contrato com parcelas não pode ser excluído" });
  C.regras.leave = await criarRegra({ boardId: C.board, kind: "can_leave", phaseId: C.fases.assinatura, expr: "card.urgente != true", message: "Urgente: tratar antes" });

  // Notas: relação exclusiva com parcelas
  const n = await criarBoard(ws, "notas");
  N.board = n.id;
  N.campos.parcela = await criarCampo(N.board, { slug: "parcela", type: "relation", config: { relation: { target_board: P.board, exclusive: true } } });

  // Solicitações: descrição travada enquanto houver nota ligada
  const s = await criarBoard(ws, "solicitacoes");
  S.board = s.id;
  S.campos.descricao = await criarCampo(S.board, { slug: "descricao", type: "text" });
  S.campos.obs = await criarCampo(S.board, { slug: "obs", type: "text" });
  S.campos.nota = await criarCampo(S.board, {
    slug: "nota",
    type: "relation",
    config: { relation: { target_board: N.board, lock_fields_while_linked: [S.campos.descricao] } },
  });

  // Propostas: sequences global com semente e por ano; regra can_create
  const pr = await criarBoard(ws, "propostas");
  PR.board = pr.id;
  PR.campos.cliente = await criarCampo(PR.board, { slug: "cliente", type: "text" });
  PR.campos.numero = await criarCampo(PR.board, { slug: "numero", type: "sequence", config: { sequence: { pattern: "P{n}", scope: "global", seed: 6573, pad: 0 } } });
  PR.campos.codigo = await criarCampo(PR.board, { slug: "codigo", type: "sequence", config: { sequence: { pattern: "PR-{n:3}/{ano}", scope: "year" } } });
  await criarRegra({ boardId: PR.board, kind: "can_create", expr: 'card.cliente != "bloqueado"', message: "Cliente bloqueado" });
});

const novoContrato = (props: Record<string, unknown> = {}, phaseId?: string) =>
  createCard({ boardId: C.board, phaseId, props: { objeto: "Obra", ...props }, actor });
const novaParcela = (contratoId: string, props: Record<string, unknown> = {}) =>
  createCard({ boardId: P.board, props: { contrato: contratoId, valor: 100, ...props }, actor });

// ---------------------------------------------------------------------------

describe("createCard", () => {
  it("cria na primeira fase, aplica padrões, sequence, título e emite card.created", async () => {
    const c = await novoContrato();
    expect(c.phaseId).toBe(C.fases.triagem);
    expect(c.props[C.campos.tipo]).toBe("servico");
    expect(c.props[C.campos.aberto_em]).toBe(dataNoFuso(FUSO));
    expect(c.props[C.campos.numero]).toMatch(new RegExp(`^CT-\\d{4}/${ano}$`));
    expect(c.title).toBe(c.props[C.campos.numero]);
    expect(c.createdBy).toBe(userId);
    expect(c.computed[C.campos.qtd]).toBe(0);
    const ev = await eventosDe(c.id);
    expect(ev[0]).toMatchObject({ type: "card.created", actorType: "user", actorId: userId, boardId: C.board });
  });

  it("valida e normaliza por tipo", async () => {
    const c = await novoContrato({
      cpf: "529.982.247-25",
      cnpj: "12.ABC.345/01DE-35",
      responsavel: userId,
      tags: ["a", "b", "a"],
      valor_ref: "1234.567",
      qtd_itens: "3",
      urgente: false,
    });
    expect(c.props[C.campos.cpf]).toBe("52998224725");
    expect(c.props[C.campos.cnpj]).toBe("12ABC34501DE35");
    expect(c.props[C.campos.tags]).toEqual(["a", "b"]);
    expect(c.props[C.campos.valor_ref]).toBe(1234.57);
    expect(c.props[C.campos.qtd_itens]).toBe(3);

    const casos: Record<string, unknown>[] = [
      { cpf: "111.111.111-11" },
      { cnpj: "11.222.333/0001-00" },
      { tipo: "outro" },
      { tags: ["z"] },
      { aberto_em: "2026-02-30" },
      { qtd_itens: "abc" },
      { urgente: "sim" },
      { valor_ref: -1 },
      { responsavel: "00000000-0000-4000-8000-000000000000" },
      { inexistente: 1 },
    ];
    for (const props of casos) {
      const e = await erro(novoContrato(props));
      expect(e.codigo, JSON.stringify(props)).toBe("validacao");
    }
    expect((await erro(novoContrato({ numero: "X" }))).codigo).toBe("somente_leitura");
    expect((await erro(novoContrato({ total: 1 }))).codigo).toBe("somente_leitura");
  });

  it("unicidade (unique_value) inclusive sob concorrência", async () => {
    const cnpj = "11.222.333/0001-81";
    await novoContrato({ cnpj });
    expect((await erro(novoContrato({ cnpj }))).codigo).toBe("unicidade");

    const outro = "11.444.777/0001-61";
    const r = await Promise.allSettled([novoContrato({ cnpj: outro }), novoContrato({ cnpj: outro }), novoContrato({ cnpj: outro })]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    for (const x of r.filter((x) => x.status === "rejected")) {
      expect(((x as PromiseRejectedResult).reason as CoreError).codigo).toBe("unicidade");
    }
  });

  it("criar fora da primeira fase exige obrigatórios das fases anteriores", async () => {
    const e = await erro(createCard({ boardId: C.board, phaseId: C.fases.assinatura, props: {}, actor }));
    expect(e.codigo).toBe("obrigatorio");
    expect(e.campos.sort()).toEqual([C.campos.assinante, C.campos.objeto].sort());
    const c = await novoContrato({ assinante: "Beto" }, C.fases.assinatura);
    expect(c.phaseId).toBe(C.fases.assinatura);
  });

  it("can_create bloqueia com ruleId", async () => {
    const e = await erro(createCard({ boardId: PR.board, props: { cliente: "bloqueado" }, actor }));
    expect(e.codigo).toBe("regra");
    expect(e.message).toBe("Cliente bloqueado");
    expect(e.ruleId).toBeTruthy();
  });

  it("recusa ator sem id", async () => {
    const e = await erro(createCard({ boardId: PR.board, props: {}, actor: { type: "api", id: "" } }));
    expect(e.codigo).toBe("ator_invalido");
  });
});

describe("moveCard", () => {
  it("bloqueia por obrigatório de fase anterior (não só da atual)", async () => {
    const c = await novoContrato({ assinante: "Beto" });
    await moveCard({ cardId: c.id, toPhaseId: C.fases.elaboracao, actor });
    // objeto é obrigatório só na triagem; limpo depois de sair dela
    await updateFields({ cardId: c.id, props: { objeto: null }, actor });
    const e = await erro(moveCard({ cardId: c.id, toPhaseId: C.fases.assinatura, actor }));
    expect(e.codigo).toBe("obrigatorio");
    expect(e.campos).toEqual([C.campos.objeto]);
    expect(e.message).toContain("Objeto");
    expect(e.ruleId).toBeNull();

    await updateFields({ cardId: c.id, props: { objeto: "Obra" }, actor });
    const movido = await moveCard({ cardId: c.id, toPhaseId: C.fases.assinatura, actor });
    expect(movido.phaseId).toBe(C.fases.assinatura);
  });

  it("required_expr avaliada com a fase de origem", async () => {
    const c = await novoContrato();
    await moveCard({ cardId: c.id, toPhaseId: C.fases.elaboracao, actor });
    const e = await erro(moveCard({ cardId: c.id, toPhaseId: C.fases.assinatura, actor }));
    expect(e.campos).toEqual([C.campos.assinante]);
  });

  it("can_back bloqueado por filho; liberado sem filhos", async () => {
    const c = await novoContrato({ assinante: "Beto" });
    await moveCard({ cardId: c.id, toPhaseId: C.fases.elaboracao, actor });
    const parcela = await novaParcela(c.id);

    const e = await erro(moveCard({ cardId: c.id, toPhaseId: C.fases.triagem, actor }));
    expect(e.codigo).toBe("regra");
    expect(e.ruleId).toBe(C.regras.back);
    expect(e.message).toBe("Contrato com parcelas não pode voltar");

    await deleteCard({ cardId: parcela.id, actor });
    const voltou = await moveCard({ cardId: c.id, toPhaseId: C.fases.triagem, actor });
    expect(voltou.phaseId).toBe(C.fases.triagem);
  });

  it("can_back com on_fail keep permite voltar", async () => {
    const w = await criarWorkspace();
    const b = await criarBoard(w.ws.id, "k", [{ name: "a" }, { name: "b" }]);
    await criarRegra({ boardId: b.id, kind: "can_back", phaseId: b.fases.b, expr: "false", onFail: { children: "keep" } });
    const c = await createCard({ boardId: b.id, props: {}, actor: w.actor });
    await moveCard({ cardId: c.id, toPhaseId: b.fases.b, actor: w.actor });
    expect((await moveCard({ cardId: c.id, toPhaseId: b.fases.a, actor: w.actor })).phaseId).toBe(b.fases.a);
  });

  it("can_enter e can_leave; fase terminal marca done; evento card.moved", async () => {
    const c = await novoContrato({ assinante: "Beto" }, C.fases.assinatura);
    await novaParcela(c.id, { medida: false });

    let e = await erro(moveCard({ cardId: c.id, toPhaseId: C.fases.final, actor }));
    expect(e.ruleId).toBe(C.regras.final);

    await updateFields({ cardId: c.id, props: { urgente: true }, actor });
    e = await erro(moveCard({ cardId: c.id, toPhaseId: C.fases.final, actor }));
    expect(e.ruleId).toBe(C.regras.leave);
    await updateFields({ cardId: c.id, props: { urgente: false }, actor });

    const [pa] = await db.select().from(cardLinks).where(eq(cardLinks.toCardId, c.id));
    await updateFields({ cardId: pa.fromCardId, props: { medida: true }, actor });
    const fim = await moveCard({ cardId: c.id, toPhaseId: C.fases.final, actor });
    expect(fim.status).toBe("done");
    const mv = (await eventosDe(c.id)).filter((x) => x.type === "card.moved");
    expect(mv.at(-1)?.data).toEqual({ from_phase: C.fases.assinatura, to_phase: C.fases.final });
  });
});

describe("sequence", () => {
  it("por ano e global com semente: 20 inserts concorrentes sem colisão", async () => {
    const criados = await Promise.all(
      Array.from({ length: 20 }, (_, i) => createCard({ boardId: PR.board, props: { cliente: `c${i}` }, actor })),
    );
    const globais = criados.map((c) => c.props[PR.campos.numero] as string).sort();
    const anuais = criados.map((c) => c.props[PR.campos.codigo] as string).sort();
    expect(globais).toEqual(Array.from({ length: 20 }, (_, i) => `P${6573 + i}`).sort());
    expect(anuais).toEqual(Array.from({ length: 20 }, (_, i) => `PR-${String(i + 1).padStart(3, "0")}/${ano}`));
  });

  it("por pai: 20 inserts concorrentes em 2 pais, numeração independente e rollup correto", async () => {
    const [a, b] = await Promise.all([novoContrato(), novoContrato()]);
    const filhos = await Promise.all(Array.from({ length: 20 }, (_, i) => novaParcela(i % 2 ? b.id : a.id, { valor: 10 })));
    for (const pai of [a, b]) {
      const numeros = filhos
        .filter((f) => String(f.props[P.campos.numero]).startsWith(`${pai.props[C.campos.numero]}/`))
        .map((f) => f.props[P.campos.numero])
        .sort();
      expect(numeros).toEqual(Array.from({ length: 10 }, (_, i) => `${pai.props[C.campos.numero]}/${String(i + 1).padStart(2, "0")}`));
    }
    const [pa] = await db.execute<{ computed: Record<string, unknown> }>(sql`select computed from cards where id = ${a.id}`);
    expect(pa.computed[C.campos.qtd]).toBe(10);
    expect(pa.computed[C.campos.total]).toBe(100);
  });

  it("sequence por pai exige o pai na criação", async () => {
    const e = await erro(createCard({ boardId: P.board, props: { valor: 1 }, actor }));
    expect(e.codigo).toBe("sequencia");
  });
});

describe("relações", () => {
  it("relação exclusiva rejeita segundo link (inclusive concorrente) e cria índice único parcial", async () => {
    const c = await novoContrato();
    const [p1, p2] = [await novaParcela(c.id), await novaParcela(c.id)];
    const n1 = await createCard({ boardId: N.board, props: {}, actor });
    const n2 = await createCard({ boardId: N.board, props: {}, actor });

    await linkCards({ fieldId: "parcela", fromCardId: n1.id, toCardId: p1.id, actor });
    const e = await erro(linkCards({ fieldId: "parcela", fromCardId: n2.id, toCardId: p1.id, actor }));
    expect(e.codigo).toBe("relacao_exclusiva");
    expect(e.message).toContain(n1.id);

    const idx = await db.execute(sql`select indexdef from pg_indexes where indexname = ${nomeIndiceExclusivo(N.campos.parcela)}`);
    expect(String(idx[0]?.indexdef)).toMatch(/UNIQUE INDEX .* \(to_card_id\) WHERE/);

    const r = await Promise.allSettled([
      linkCards({ fieldId: N.campos.parcela, fromCardId: n1.id, toCardId: p2.id, actor }),
      linkCards({ fieldId: N.campos.parcela, fromCardId: n2.id, toCardId: p2.id, actor }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const rej = r.find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect((rej.reason as CoreError).codigo).toBe("relacao_exclusiva");

    // depois de desligar, pode ligar em outra nota
    await unlinkCards({ fieldId: "parcela", fromCardId: n1.id, toCardId: p1.id, actor });
    expect((await linkCards({ fieldId: "parcela", fromCardId: n2.id, toCardId: p1.id, actor })).linkId).toBeTruthy();
  });

  it("relação valida board alvo e cardinalidade", async () => {
    const c = await novoContrato();
    const outro = await createCard({ boardId: N.board, props: {}, actor });
    expect((await erro(novaParcela(outro.id))).codigo).toBe("relacao_invalida");
    const p = await novaParcela(c.id);
    const c2 = await novoContrato();
    expect((await erro(linkCards({ fieldId: "contrato", fromCardId: p.id, toCardId: c2.id, actor }))).codigo).toBe("relacao_invalida");
  });

  it("lock_fields_while_linked trava edição enquanto houver link", async () => {
    const nota = await createCard({ boardId: N.board, props: {}, actor });
    const s = await createCard({ boardId: S.board, props: { descricao: "Cimento" }, actor });
    await linkCards({ fieldId: "nota", fromCardId: s.id, toCardId: nota.id, actor });

    const e = await erro(updateFields({ cardId: s.id, props: { descricao: "Areia" }, actor }));
    expect(e.codigo).toBe("campo_travado");
    await updateFields({ cardId: s.id, props: { obs: "livre" }, actor });

    await unlinkCards({ fieldId: "nota", fromCardId: s.id, toCardId: nota.id, actor });
    const ok = await updateFields({ cardId: s.id, props: { descricao: "Areia" }, actor });
    expect(ok.props[S.campos.descricao]).toBe("Areia");
  });

  it("eventos link_added/link_removed nos dois lados", async () => {
    const nota = await createCard({ boardId: N.board, props: {}, actor });
    const s = await createCard({ boardId: S.board, props: {}, actor });
    await updateFields({ cardId: s.id, props: { nota: [nota.id] }, actor });
    await updateFields({ cardId: s.id, props: { nota: [] }, actor });
    const tipos = (await eventosDe(nota.id)).map((x) => [x.type, (x.data as { lado?: string }).lado]);
    expect(tipos).toEqual([
      ["card.created", undefined],
      ["card.link_added", "destino"],
      ["card.link_removed", "destino"],
    ]);
  });
});

describe("campos calculados", () => {
  it("rollup e dynamic_text do pai atualizam ao criar, editar, desligar e excluir filho", async () => {
    const c = await novoContrato();
    const numero = c.props[C.campos.numero];
    const p1 = await novaParcela(c.id, { valor: 100, medida: true });
    const p2 = await novaParcela(c.id, { valor: 50.5 });
    expect(p1.computed[P.campos.rotulo]).toBe(`Parcela ${numero}/01 de ${numero}`);

    const ler = async () => (await db.execute<{ computed: Record<string, unknown> }>(sql`select computed from cards where id = ${c.id}`))[0].computed;
    let pai = await ler();
    expect(pai[C.campos.qtd]).toBe(2);
    expect(pai[C.campos.total]).toBe(150.5);
    expect(pai[C.campos.medido]).toBe(100);
    expect(pai[C.campos.resumo]).toBe(`${numero}: 2 parcela(s), total 150.5`);

    await updateFields({ cardId: p2.id, props: { valor: 20, medida: true }, actor });
    pai = await ler();
    expect(pai[C.campos.total]).toBe(120);
    expect(pai[C.campos.medido]).toBe(120);

    await deleteCard({ cardId: p1.id, actor });
    pai = await ler();
    expect(pai[C.campos.qtd]).toBe(1);
    expect(pai[C.campos.total]).toBe(20);

    const up = (await eventosDe(c.id)).filter((x) => x.type === "card.field_updated" && (x.data as { field_id: string }).field_id === C.campos.qtd);
    expect(up.map((x) => (x.data as { new: unknown }).new)).toEqual([1, 2, 1]);
    expect(up.every((x) => (x.data as { computed?: boolean }).computed === true)).toBe(true);
  });
});

describe("updateFields, can_edit e deleteCard", () => {
  it("field_updated com old/new e só para o que mudou", async () => {
    const c = await novoContrato({ objeto: "A" });
    await updateFields({ cardId: c.id, props: { objeto: "B", tipo: "servico" }, actor });
    const up = (await eventosDe(c.id)).filter((x) => x.type === "card.field_updated" && !(x.data as { computed?: boolean }).computed);
    expect(up.map((x) => x.data)).toEqual([{ field_id: C.campos.objeto, old: "A", new: "B" }]);
  });

  it("can_edit por regra e por editable=false na fase", async () => {
    const c = await novoContrato({ assinante: "Beto" }, C.fases.assinatura);
    let e = await erro(updateFields({ cardId: c.id, props: { cnpj: "11.222.333/0001-81" }, actor }));
    expect(e.ruleId).toBe(C.regras.cnpj);
    e = await erro(updateFields({ cardId: c.id, props: { valor_ref: 10 }, actor }));
    expect(e.codigo).toBe("somente_leitura");
  });

  it("can_delete bloqueia; exclusão lógica remove ligações e emite card.deleted", async () => {
    const c = await novoContrato();
    const p = await novaParcela(c.id);
    expect((await erro(deleteCard({ cardId: c.id, actor }))).ruleId).toBe(C.regras.del);
    const excluida = await deleteCard({ cardId: p.id, actor });
    expect(excluida.deletedAt).toBeInstanceOf(Date);
    expect(await db.select().from(cardLinks).where(eq(cardLinks.fromCardId, p.id))).toHaveLength(0);
    const tipos = (await eventosDe(p.id)).map((x) => x.type);
    expect(tipos.slice(-2)).toEqual(["card.link_removed", "card.deleted"]);
    expect((await erro(updateFields({ cardId: p.id, props: { valor: 1 }, actor }))).codigo).toBe("nao_encontrado");
    await deleteCard({ cardId: c.id, actor });
  });
});

describe("transação", () => {
  it("evento gravado na mesma transação do card (mesmo xmin)", async () => {
    const c = await novoContrato();
    const [row] = await db.execute<{ card: string; ev: string }>(sql`
      select (select xmin::text from cards where id = ${c.id}) as card,
             (select xmin::text from events where card_id = ${c.id} and type = 'card.created') as ev`);
    expect(row.ev).toBe(row.card);
  });

  it("rollback da transação externa não deixa card nem evento", async () => {
    let id = "";
    await expect(
      db.transaction(async (tx) => {
        const c = await createCard({ boardId: PR.board, props: { cliente: "rollback" }, actor }, { tx });
        id = c.id;
        const dentro = await tx.select().from(events).where(eq(events.cardId, c.id));
        expect(dentro.length).toBeGreaterThan(0);
        throw new Error("abortar");
      }),
    ).rejects.toThrow("abortar");
    expect(id).not.toBe("");
    expect(await db.execute(sql`select 1 from cards where id = ${id}`)).toHaveLength(0);
    expect(await db.select().from(events).where(eq(events.cardId, id))).toHaveLength(0);
  });

  it("falha no meio da operação desfaz card e eventos já emitidos", async () => {
    const c = await novoContrato();
    const p = await novaParcela(c.id);
    await createCard({ boardId: N.board, props: { parcela: p.id }, actor });
    const antes = await db.select().from(events).where(and(eq(events.boardId, N.board), eq(events.type, "card.created")));
    // card é inserido e card.created emitido antes de a ligação exclusiva falhar
    const e = await erro(createCard({ boardId: N.board, props: { parcela: p.id }, actor }));
    expect(e.codigo).toBe("relacao_exclusiva");
    const depois = await db.select().from(events).where(and(eq(events.boardId, N.board), eq(events.type, "card.created")));
    expect(depois).toHaveLength(antes.length);
  });

  it("composição: operação com tx roda em savepoint e falha não envenena a transação", async () => {
    const r = await db.transaction(async (tx) => {
      const e = await erro(createCard({ boardId: PR.board, props: { cliente: "bloqueado" }, actor }, { tx }));
      const ok: CardRow = await createCard({ boardId: PR.board, props: { cliente: "ok" }, actor }, { tx });
      return { e, ok };
    });
    expect(r.e.codigo).toBe("regra");
    expect(r.ok.id).toBeTruthy();
  });
});
