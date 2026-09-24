"use server";
// Server actions da área do workspace. Cada uma revalida sessão e pertencimento;
// escrita em cards só pelo src/core; configuração só por src/server/config.
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { addComment, CoreError, createCard, deleteCard, linkCards, moveCard, unlinkCards, updateFields } from "@/core";
import { exigirBoard, exigirCard, exigirConfigurador, exigirMembro } from "@/server/acesso";
import { criarFilho } from "@/server/cards";
import { criarBoard, ErroConfig } from "@/server/config";
import { ajustesDoBoard } from "@/server/config-board";
import { boardPorId, buscarCards, cardDoWorkspace, type BoardCompleto } from "@/server/consultas";
import { estadoCriacao, registroDoForm, valoresDoFormData } from "@/lib/campos-criacao";
import { camposDaFase, hojeSP } from "./b/[board]/_lib/campos-da-fase";
import { propsDoForm } from "@/lib/form-campos";
import { TIPOS_CALCULADOS_UI } from "@/lib/formatar";

export type Resultado = { ok: true } | { ok: false; motivo: string };

async function tentar(fn: () => Promise<unknown>): Promise<Resultado> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof CoreError || e instanceof ErroConfig) return { ok: false, motivo: e.message };
    console.error(e);
    return { ok: false, motivo: "Erro inesperado. Tente novamente." };
  }
}

const caminhoBoard = (ws: string, board: string) => `/w/${ws}/b/${board}`;
const alvoDe = (config: Record<string, unknown>) => String((config.relation as { target_board?: string } | undefined)?.target_board ?? "");

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

export async function criarBoardAction(ws: string, form: FormData): Promise<Resultado> {
  const ctx = await exigirMembro(ws);
  let slug = "";
  const r = await tentar(async () => {
    exigirConfigurador(ctx);
    const kind = String(form.get("kind")) === "database" ? "database" : "workflow";
    ({ slug } = await criarBoard(ctx.ws.id, ctx.actor, { nome: String(form.get("nome") ?? ""), kind }));
  });
  if (!r.ok) return r;
  revalidatePath(`/w/${ws}`);
  redirect(caminhoBoard(ws, slug));
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export async function criarCardAction(ws: string, board: string, phaseId: string | null): Promise<Resultado> {
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  let id = "";
  const r = await tentar(async () => {
    ({ id } = await createCard({ boardId: b.id, phaseId, props: {}, actor: ctx.actor }));
  });
  if (!r.ok) return r;
  redirect(`${caminhoBoard(ws, board)}/c/${id}`);
}

export async function moverCardAction(ws: string, board: string, cardId: string, phaseId: string): Promise<Resultado> {
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  await exigirCard(b, cardId);
  const r = await tentar(() => moveCard({ cardId, toPhaseId: phaseId, actor: ctx.actor }));
  revalidatePath(caminhoBoard(ws, board), "layout");
  return r;
}

/** Exclusão lógica (decisão 17): regras can_delete valem; as ligações ficam inativas. */
export async function excluirCardAction(ws: string, board: string, cardId: string): Promise<Resultado> {
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  await exigirCard(b, cardId);
  const r = await tentar(() => deleteCard({ cardId, actor: ctx.actor }));
  revalidatePath(caminhoBoard(ws, board), "layout");
  return r;
}

export async function salvarCamposAction(ws: string, board: string, cardId: string, form: FormData): Promise<Resultado> {
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  await exigirCard(b, cardId);
  const ids = new Set(form.getAll("campos").map(String));
  const campos = b.campos.filter((c) => ids.has(c.id) && c.type !== "relation" && !TIPOS_CALCULADOS_UI.has(c.type));
  const r = await tentar(() => updateFields({ cardId, props: propsDoForm(form, campos), actor: ctx.actor }));
  revalidatePath(caminhoBoard(ws, board), "layout");
  return r;
}

/** Candidatos para um campo de relação do board (busca no board alvo, por título ou id). */
export async function buscarRelacionaveisAction(ws: string, board: string, fieldId: string, termo: string, excluir: string[]) {
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  const campo = b.campos.find((c) => c.id === fieldId && c.type === "relation");
  const alvo = campo ? alvoDe(campo.config) : "";
  if (!alvo || !(await boardPorId(ctx.ws.id, alvo))) return [];
  return buscarCards(ctx.ws.id, alvo, String(termo).slice(0, 100), excluir.slice(0, 500));
}

export async function ligarAction(ws: string, board: string, cardId: string, fieldId: string, toId: string): Promise<Resultado> {
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  await exigirCard(b, cardId);
  const r = await tentar(() => linkCards({ fieldId, fromCardId: cardId, toCardId: toId, actor: ctx.actor }));
  revalidatePath(caminhoBoard(ws, board), "layout");
  return r;
}

/**
 * Desliga uma relação. lado "origem": o card da página é a origem (campo do board dele).
 * lado "destino": o card da página é o destino; a origem é o outro card (campo do outro board).
 */
export async function desligarAction(
  ws: string,
  board: string,
  cardId: string,
  fieldId: string,
  outroId: string,
  lado: "origem" | "destino",
): Promise<Resultado> {
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  await exigirCard(b, cardId);
  const r = await tentar(async () => {
    if (!(await cardDoWorkspace(ctx.ws.id, outroId))) throw new CoreError("nao_encontrado", "card não encontrado");
    const [from, to] = lado === "origem" ? [cardId, outroId] : [outroId, cardId];
    await unlinkCards({ fieldId, fromCardId: from, toCardId: to, actor: ctx.actor });
  });
  revalidatePath(caminhoBoard(ws, board), "layout");
  return r;
}

export async function criarFilhoAction(
  ws: string,
  board: string,
  cardId: string,
  fieldId: string,
  lado: "origem" | "destino",
  boardFilhoId: string,
  form: FormData,
): Promise<Resultado> {
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  await exigirCard(b, cardId);
  const r = await tentar(async () => {
    const bf = await boardPorId(ctx.ws.id, boardFilhoId);
    const campo = (lado === "origem" ? b : bf)?.campos.find((x) => x.id === fieldId && x.type === "relation");
    const valido =
      bf && campo && (lado === "origem" ? alvoDe(campo.config) === bf.id : alvoDe(campo.config) === b.id);
    if (!bf || !campo || !valido) throw new CoreError("validacao", "relação inválida");
    const ids = new Set(form.getAll("campos").map(String));
    const campos = bf.campos.filter((c) => ids.has(c.id) && c.type !== "relation" && !TIPOS_CALCULADOS_UI.has(c.type));
    const props = Object.fromEntries(Object.entries(propsDoForm(form, campos)).filter(([, v]) => v !== null && v !== false));
    await criarFilho({ actor: ctx.actor, paiId: cardId, campo, lado, boardFilhoId: bf.id, props });
  });
  revalidatePath(caminhoBoard(ws, board), "layout");
  return r;
}

/** Edita um campo de um card relacionado (sub-tabela), validando que ele é do workspace. */
export async function editarRelacionadoAction(
  ws: string,
  board: string,
  cardId: string,
  outroId: string,
  fieldId: string,
  valor: string | number | boolean | null,
): Promise<Resultado> {
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  await exigirCard(b, cardId);
  const r = await tentar(async () => {
    if (!(await cardDoWorkspace(ctx.ws.id, outroId))) throw new CoreError("nao_encontrado", "card não encontrado");
    await updateFields({ cardId: outroId, props: { [fieldId]: valor }, actor: ctx.actor });
  });
  revalidatePath(caminhoBoard(ws, board), "layout");
  return r;
}

export async function comentarAction(ws: string, board: string, cardId: string, form: FormData): Promise<Resultado> {
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  await exigirCard(b, cardId);
  const r = await tentar(() => addComment({ cardId, body: String(form.get("body") ?? ""), actor: ctx.actor }));
  revalidatePath(`${caminhoBoard(ws, board)}/c/${cardId}`);
  return r;
}

export type ResultadoCriacao = { ok: true; id: string } | { ok: false; motivo: string; campos?: string[] };

/**
 * Props da criação a partir do formulário da fase, revalidando no servidor o que o navegador avaliou:
 * só entram campos editáveis e visíveis na fase com os valores enviados. Obrigatórios ficam com o core.
 */
async function propsDaCriacao(b: BoardCompleto, phaseId: string | null, form: FormData) {
  const ajustes = await ajustesDoBoard(b.id);
  const defs = camposDaFase(b, ajustes, phaseId);
  const valores = valoresDoFormData(form);
  const fase = phaseId ? b.fases.find((f) => f.id === phaseId)?.name ?? null : null;
  const estados = estadoCriacao(defs, registroDoForm(defs, valores), fase, hojeSP());
  const enviados = new Set(form.getAll("campos").map(String));
  const campos = defs.filter((c) => enviados.has(c.id) && estados[c.id]?.visivel);
  return Object.fromEntries(
    Object.entries(propsDoForm(form, campos)).filter(([, v]) => v !== null && v !== false && !(Array.isArray(v) && v.length === 0)),
  );
}

async function criarComTratamento(ws: string, board: string, fn: () => Promise<{ id: string }>): Promise<ResultadoCriacao> {
  try {
    const card = await fn();
    revalidatePath(caminhoBoard(ws, board), "layout");
    return { ok: true, id: card.id };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof CoreError) return { ok: false, motivo: e.message, campos: e.campos };
    console.error(e);
    return { ok: false, motivo: "Erro inesperado. Tente novamente." };
  }
}

/** Cria o card pelo formulário da fase. Recusa formulário vazio; erros do core voltam com os campos. */
export async function criarCardComCamposAction(ws: string, board: string, phaseId: string | null, form: FormData): Promise<ResultadoCriacao> {
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  const props = await propsDaCriacao(b, phaseId, form);
  if (!Object.keys(props).length) return { ok: false, motivo: "Preencha ao menos um campo para criar o card." };
  return criarComTratamento(ws, board, () => createCard({ boardId: b.id, phaseId, props, actor: ctx.actor }));
}

/**
 * Cria um filho pelo formulário completo do board filho (fase inicial dele), já vinculado ao pai,
 * numa transação. Usado quando o "Adicionar" rápido da sub-tabela não cobre os obrigatórios.
 */
export async function criarFilhoComCamposAction(
  ws: string,
  board: string,
  cardId: string,
  fieldId: string,
  lado: "origem" | "destino",
  boardFilhoId: string,
  form: FormData,
): Promise<ResultadoCriacao> {
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  await exigirCard(b, cardId);
  const bf = await boardPorId(ctx.ws.id, boardFilhoId);
  const campo = (lado === "origem" ? b : bf)?.campos.find((x) => x.id === fieldId && x.type === "relation");
  if (!bf || !campo || alvoDe(campo.config) !== (lado === "origem" ? bf.id : b.id)) return { ok: false, motivo: "Relação inválida." };
  const props = await propsDaCriacao(bf, bf.fases[0]?.id ?? null, form);
  if (!Object.keys(props).length) return { ok: false, motivo: "Preencha ao menos um campo para criar o card." };
  return criarComTratamento(ws, board, () => criarFilho({ actor: ctx.actor, paiId: cardId, campo, lado, boardFilhoId: bf.id, props }));
}
