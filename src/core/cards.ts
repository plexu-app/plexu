// Único caminho de escrita em cards (invariante 1). Cada operação:
// transação → regras → escrita → recálculo de computed → eventos (mesma transação) → retorno.
import { and, count, eq } from "drizzle-orm";
import { db } from "../db";
import { cardLinks, cards } from "../db/schema";
import { emitirEvento, type DadosLink, type OrigemEvento } from "./events";
import {
  aplicarPadroes,
  atribuirSequencias,
  garantirIndiceExclusivo,
  nomeIndiceExclusivo,
  normalizarEntrada,
  recalcular,
  verificarUnicidade,
} from "./fields";
import {
  acharCampo,
  carregarQuadro,
  configRelacao,
  lerCard,
  lerLigacoes,
  RASCUNHO,
  registro,
  tituloDe,
  vistaDe,
  type Campo,
  type Ligacao,
  type Op,
  type Quadro,
  type VistaCard,
} from "./meta";
import { canBack, canCreate, canDelete, canEdit, canEnter, canLeave, compilar, type ResultadoRegra } from "./rules";
import { CoreError, validarAtor, type Actor, type CardRow, type OpcoesOp, type Tx } from "./types";

// ---------------------------------------------------------------------------
// Infra
// ---------------------------------------------------------------------------

async function executar<T>(actor: Actor, opts: OpcoesOp | undefined, fn: (op: Op) => Promise<T>): Promise<T> {
  validarAtor(actor);
  const run = (tx: Tx) => fn({ tx, actor, quadros: new Map() });
  try {
    return opts?.tx ? await opts.tx.transaction(run) : await db.transaction(run);
  } catch (e) {
    throw traduzirErro(e);
  }
}

function traduzirErro(e: unknown): unknown {
  if (e instanceof CoreError) return e;
  const pg = (e as { cause?: unknown })?.cause ?? e;
  const { code, constraint_name } = (pg ?? {}) as { code?: string; constraint_name?: string };
  if (code === "23505" && constraint_name?.startsWith("card_links_excl_")) {
    return new CoreError("relacao_exclusiva", "relação exclusiva: o card de destino já está ligado a outro card nesta relação");
  }
  return e;
}

function exigir(r: ResultadoRegra): void {
  if (!r.ok) throw new CoreError(r.codigo, r.motivo, { ruleId: r.ruleId, campos: r.campos });
}

const origemDe = (op: Op, c: Pick<CardRow, "id" | "workspaceId" | "boardId">): OrigemEvento => ({
  workspaceId: c.workspaceId,
  boardId: c.boardId,
  cardId: c.id,
  actor: op.actor,
});

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// ---------------------------------------------------------------------------
// Ligações (internas; usadas por create/update/link/unlink/delete)
// ---------------------------------------------------------------------------

/** Card de destino válido para a relação: existe, mesmo workspace, board alvo e filter_expr. */
async function validarDestino(op: Op, campo: Campo, workspaceId: string, toId: string): Promise<CardRow> {
  let alvo: CardRow;
  try {
    alvo = await lerCard(op, toId);
  } catch {
    throw new CoreError("relacao_invalida", `relação '${campo.name}': card ${toId} não encontrado`, { campos: [campo.id] });
  }
  const cfg = configRelacao(campo);
  if (alvo.workspaceId !== workspaceId || (cfg.target_board && alvo.boardId !== cfg.target_board)) {
    throw new CoreError("relacao_invalida", `relação '${campo.name}': card ${toId} não pertence ao board alvo`, {
      campos: [campo.id],
    });
  }
  if (cfg.filter_expr) {
    const q = await carregarQuadro(op, alvo.boardId);
    let passa = false;
    try {
      passa = compilar(cfg.filter_expr).evaluateBool({ card: registro(q, vistaDe(alvo)) });
    } catch (e) {
      throw new CoreError("relacao_invalida", `relação '${campo.name}': filter_expr inválida: ${(e as Error).message}`);
    }
    if (!passa) {
      throw new CoreError("relacao_invalida", `relação '${campo.name}': card ${toId} não atende ao filtro da relação`, {
        campos: [campo.id],
      });
    }
  }
  return alvo;
}

async function inserirLigacao(op: Op, campo: Campo, de: CardRow, para: CardRow): Promise<string | null> {
  const cfg = configRelacao(campo);
  const [{ n }] = await op.tx
    .select({ n: count() })
    .from(cardLinks)
    .where(and(eq(cardLinks.fieldId, campo.id), eq(cardLinks.fromCardId, de.id)));
  if (cfg.cardinality === "one" && n > 0) {
    throw new CoreError("relacao_invalida", `relação '${campo.name}' aceita um único card`, { campos: [campo.id] });
  }
  if (cfg.exclusive) {
    await garantirIndiceExclusivo(op.tx, campo.id);
    const [outro] = await op.tx
      .select({ from: cardLinks.fromCardId })
      .from(cardLinks)
      .where(and(eq(cardLinks.fieldId, campo.id), eq(cardLinks.toCardId, para.id)));
    if (outro && outro.from !== de.id) {
      throw new CoreError(
        "relacao_exclusiva",
        `relação exclusiva '${campo.name}': o card ${para.id} já está ligado ao card ${outro.from}`,
        { campos: [campo.id] },
      );
    }
  }
  const [link] = await op.tx
    .insert(cardLinks)
    .values({ fieldId: campo.id, fromCardId: de.id, toCardId: para.id, position: n })
    .onConflictDoNothing({ target: [cardLinks.fieldId, cardLinks.fromCardId, cardLinks.toCardId] })
    .returning({ id: cardLinks.id });
  if (!link) return null; // já existia
  await eventosLigacao(op, "card.link_added", campo.id, link.id, de, para);
  return link.id;
}

async function removerLigacao(op: Op, l: Ligacao, motivo?: DadosLink["motivo"]): Promise<void> {
  const removidas = await op.tx.delete(cardLinks).where(eq(cardLinks.id, l.linkId)).returning({ id: cardLinks.id });
  if (!removidas.length) return;
  const [de] = await op.tx.select().from(cards).where(eq(cards.id, l.fromCardId));
  const [para] = await op.tx.select().from(cards).where(eq(cards.id, l.toCardId));
  await eventosLigacao(op, "card.link_removed", l.campo.id, l.linkId, de, para, motivo);
}

async function eventosLigacao(
  op: Op,
  type: "card.link_added" | "card.link_removed",
  fieldId: string,
  linkId: string,
  de: CardRow,
  para: CardRow,
  motivo?: DadosLink["motivo"],
): Promise<void> {
  const base = { field_id: fieldId, link_id: linkId, from_card_id: de.id, to_card_id: para.id, motivo };
  await emitirEvento(op.tx, origemDe(op, de), { type, data: { ...base, lado: "origem" } });
  await emitirEvento(op.tx, origemDe(op, para), { type, data: { ...base, lado: "destino" } });
}

// ---------------------------------------------------------------------------
// createCard
// ---------------------------------------------------------------------------

export interface CreateCardInput {
  boardId: string;
  /** Fase inicial. Padrão: primeira fase (workflow). Criar em outra fase aplica obrigatórios anteriores + can_enter. */
  phaseId?: string | null;
  /** Valores por field_id ou slug. Relação: id ou lista de ids de destino. */
  props?: Record<string, unknown>;
  assignees?: string[];
  dueAt?: Date | null;
  actor: Actor;
}

export function createCard(input: CreateCardInput, opts?: OpcoesOp): Promise<CardRow> {
  return executar(input.actor, opts, async (op) => {
    const q = await carregarQuadro(op, input.boardId);
    const faseId = faseInicial(q, input.phaseId);
    const ent = await normalizarEntrada(op, q, input.props ?? {});

    const rascunho: VistaCard = { id: null, phaseId: faseId, title: "", status: "open", props: {}, computed: {} };
    for (const [k, v] of ent.props) if (v !== null) rascunho.props[k] = v;

    const destinos: { campo: Campo; alvo: CardRow }[] = [];
    const ligacoes: Ligacao[] = [];
    for (const [fid, ids] of ent.relacoes) {
      const campo = q.campoPorId.get(fid)!;
      for (const id of ids) {
        const alvo = await validarDestino(op, campo, q.workspaceId, id);
        destinos.push({ campo, alvo });
        ligacoes.push({ linkId: "", campo, fromCardId: RASCUNHO, toCardId: id });
      }
    }

    await aplicarPadroes(op, q, rascunho, ligacoes, new Set([...ent.props.keys(), ...ent.relacoes.keys()]));
    exigir(await canCreate(op, { quadro: q, card: rascunho, ligacoes, faseId }));
    await verificarUnicidade(op, q, null, new Map(Object.entries(rascunho.props)));
    await atribuirSequencias(op, q, rascunho, ligacoes);

    const fase = faseId ? q.fasePorId.get(faseId)! : null;
    const agora = new Date();
    const [card] = await op.tx
      .insert(cards)
      .values({
        workspaceId: q.workspaceId,
        boardId: q.id,
        phaseId: faseId,
        title: tituloDe(q, rascunho.props, {}),
        props: rascunho.props,
        assignees: input.assignees ?? [],
        dueAt: input.dueAt ?? null,
        status: fase?.isTerminal ? "done" : "open",
        createdBy: op.actor.type === "user" ? op.actor.id : null,
        phaseEnteredAt: faseId ? agora : null,
      })
      .returning();
    await emitirEvento(op.tx, origemDe(op, card), { type: "card.created", data: { phase_id: faseId, props: card.props } });

    for (const { campo, alvo } of destinos) await inserirLigacao(op, campo, card, alvo);
    await recalcular(op, [card.id], { semEventos: [card.id] });
    return lerCard(op, card.id);
  });
}

function faseInicial(q: Quadro, phaseId: string | null | undefined): string | null {
  if (!q.fases.length) {
    if (phaseId) throw new CoreError("validacao", "board sem fases não aceita phaseId");
    return null;
  }
  const id = phaseId ?? q.fases[0].id;
  if (!q.fasePorId.has(id)) throw new CoreError("nao_encontrado", `fase ${id} não encontrada neste board`);
  return id;
}

// ---------------------------------------------------------------------------
// updateFields
// ---------------------------------------------------------------------------

export interface UpdateFieldsInput {
  cardId: string;
  /** Valores por field_id ou slug; null limpa. Relação: lista completa desejada de destinos. */
  props: Record<string, unknown>;
  actor: Actor;
}

export function updateFields(input: UpdateFieldsInput, opts?: OpcoesOp): Promise<CardRow> {
  return executar(input.actor, opts, async (op) => {
    const card = await lerCard(op, input.cardId, true);
    const q = await carregarQuadro(op, card.boardId);
    const ent = await normalizarEntrada(op, q, input.props);
    const ligs = await lerLigacoes(op, [card.id]);
    const vista = vistaDe(card);

    const mudancas = [...ent.props].filter(([fid, v]) => !igual(card.props[fid], v));
    const relacoes = [...ent.relacoes].map(([fid, desejados]) => {
      const atuais = ligs.filter((l) => l.campo.id === fid && l.fromCardId === card.id);
      return {
        campo: q.campoPorId.get(fid)!,
        remover: atuais.filter((l) => !desejados.includes(l.toCardId)),
        adicionar: desejados.filter((id) => !atuais.some((l) => l.toCardId === id)),
      };
    }).filter((r) => r.remover.length || r.adicionar.length);

    for (const campo of [...mudancas.map(([fid]) => q.campoPorId.get(fid)!), ...relacoes.map((r) => r.campo)]) {
      exigir(await canEdit(op, { quadro: q, card: vista, ligacoes: ligs, campo }));
    }
    if (!mudancas.length && !relacoes.length) return card;

    await verificarUnicidade(op, q, card.id, new Map(mudancas));
    const props = { ...card.props };
    for (const [fid, v] of mudancas) {
      if (v === null) delete props[fid];
      else props[fid] = v;
    }
    if (mudancas.length) {
      await op.tx
        .update(cards)
        .set({ props, title: tituloDe(q, props, card.computed), updatedAt: new Date() })
        .where(eq(cards.id, card.id));
      for (const [fid, v] of mudancas) {
        await emitirEvento(op.tx, origemDe(op, card), {
          type: "card.field_updated",
          data: { field_id: fid, old: card.props[fid] ?? null, new: v },
        });
      }
    }

    const tocados: string[] = [];
    for (const r of relacoes) {
      for (const l of r.remover) {
        await removerLigacao(op, l);
        tocados.push(l.toCardId);
      }
      for (const id of r.adicionar) {
        await inserirLigacao(op, r.campo, card, await validarDestino(op, r.campo, card.workspaceId, id));
      }
    }
    await recalcular(op, [card.id, ...tocados]);
    return lerCard(op, card.id);
  });
}

// ---------------------------------------------------------------------------
// moveCard
// ---------------------------------------------------------------------------

export interface MoveCardInput {
  cardId: string;
  toPhaseId: string;
  actor: Actor;
}

/** Avançar: can_leave(origem, com obrigatórios de todas as fases até ela) + can_enter(destino). Voltar: can_back + can_enter. */
export function moveCard(input: MoveCardInput, opts?: OpcoesOp): Promise<CardRow> {
  return executar(input.actor, opts, async (op) => {
    const card = await lerCard(op, input.cardId, true);
    const q = await carregarQuadro(op, card.boardId);
    const destino = q.fasePorId.get(input.toPhaseId);
    if (!destino) throw new CoreError("nao_encontrado", `fase ${input.toPhaseId} não encontrada neste board`);
    if (card.phaseId === destino.id) return card;

    const origem = card.phaseId ? q.fasePorId.get(card.phaseId) ?? null : null;
    const alvo = { quadro: q, card: vistaDe(card), ligacoes: await lerLigacoes(op, [card.id]) };
    if (origem && destino.position < origem.position) {
      exigir(await canBack(op, { ...alvo, origem: origem.id, destino: destino.id }));
    } else if (origem) {
      exigir(await canLeave(op, { ...alvo, origem: origem.id, destino: destino.id }));
    }
    exigir(await canEnter(op, { ...alvo, origem: origem?.id ?? null, destino: destino.id }));

    const status = destino.isTerminal ? "done" : card.status === "done" ? "open" : card.status;
    await op.tx
      .update(cards)
      .set({ phaseId: destino.id, phaseEnteredAt: new Date(), status, updatedAt: new Date() })
      .where(eq(cards.id, card.id));
    await emitirEvento(op.tx, origemDe(op, card), {
      type: "card.moved",
      data: { from_phase: card.phaseId, to_phase: destino.id },
    });
    await recalcular(op, [card.id]);
    return lerCard(op, card.id);
  });
}

// ---------------------------------------------------------------------------
// linkCards / unlinkCards
// ---------------------------------------------------------------------------

export interface LinkInput {
  /** Campo de relação (id ou slug) no board do card de origem. */
  fieldId: string;
  fromCardId: string;
  toCardId: string;
  actor: Actor;
}

async function campoRelacao(op: Op, card: CardRow, chave: string): Promise<{ q: Quadro; campo: Campo }> {
  const q = await carregarQuadro(op, card.boardId);
  const campo = acharCampo(q, chave);
  if (!campo || campo.type !== "relation") {
    throw new CoreError("validacao", `campo de relação ${chave} não existe no board do card de origem`);
  }
  return { q, campo };
}

export function linkCards(input: LinkInput, opts?: OpcoesOp): Promise<{ linkId: string | null }> {
  return executar(input.actor, opts, async (op) => {
    const de = await lerCard(op, input.fromCardId, true);
    const { q, campo } = await campoRelacao(op, de, input.fieldId);
    exigir(await canEdit(op, { quadro: q, card: vistaDe(de), campo }));
    const para = await validarDestino(op, campo, de.workspaceId, input.toCardId);
    const linkId = await inserirLigacao(op, campo, de, para);
    if (linkId) await recalcular(op, [de.id, para.id]);
    return { linkId };
  });
}

export function unlinkCards(input: LinkInput, opts?: OpcoesOp): Promise<{ removido: boolean }> {
  return executar(input.actor, opts, async (op) => {
    const de = await lerCard(op, input.fromCardId, true);
    const { q, campo } = await campoRelacao(op, de, input.fieldId);
    const ligs = await lerLigacoes(op, [de.id]);
    const l = ligs.find((x) => x.campo.id === campo.id && x.fromCardId === de.id && x.toCardId === input.toCardId);
    if (!l) return { removido: false };
    exigir(await canEdit(op, { quadro: q, card: vistaDe(de), ligacoes: ligs, campo }));
    await removerLigacao(op, l);
    await recalcular(op, [de.id, l.toCardId]);
    return { removido: true };
  });
}

// ---------------------------------------------------------------------------
// deleteCard (soft)
// ---------------------------------------------------------------------------

export interface DeleteCardInput {
  cardId: string;
  actor: Actor;
}

/** Exclusão lógica: can_delete, remove as ligações (com eventos) e marca deleted_at. */
export function deleteCard(input: DeleteCardInput, opts?: OpcoesOp): Promise<CardRow> {
  return executar(input.actor, opts, async (op) => {
    const card = await lerCard(op, input.cardId, true);
    const q = await carregarQuadro(op, card.boardId);
    const ligs = await lerLigacoes(op, [card.id]);
    exigir(await canDelete(op, { quadro: q, card: vistaDe(card), ligacoes: ligs }));

    for (const l of ligs) await removerLigacao(op, l, "card_deleted");
    const [excluido] = await op.tx
      .update(cards)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(cards.id, card.id))
      .returning();
    await emitirEvento(op.tx, origemDe(op, card), { type: "card.deleted", data: { phase_id: card.phaseId } });
    const outros = ligs.map((l) => (l.fromCardId === card.id ? l.toCardId : l.fromCardId)).filter((id) => id !== card.id);
    await recalcular(op, outros);
    return excluido;
  });
}

export { nomeIndiceExclusivo };
