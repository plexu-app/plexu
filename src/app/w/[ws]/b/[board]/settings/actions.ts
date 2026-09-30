"use server";
// Configuração do board (owner/admin). Sem SQL aqui: tudo via src/server/config-board.
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { Actor } from "@/core";
import { exigirBoard, exigirConfigurador, exigirMembro } from "@/server/acesso";
import { ErroConfig } from "@/server/config";
import {
  arquivarAcao,
  arquivarAutomacao,
  ativarAutomacao,
  reexecutar,
  salvarAcao,
  salvarAutomacao,
  testarAutomacao,
  type DadosAcao,
  type DadosAutomacao,
} from "@/server/automacoes";
import { buscarCards } from "@/server/consultas";
import {
  ajustarCampoNaFase,
  arquivarCampo,
  arquivarFase,
  atualizarFase,
  ativarRegra,
  criarCampo,
  criarFase,
  criarRegra,
  definirExibicaoKanban,
  definirFasesCampo,
  editarCampo,
  editarRegra,
  moverFase,
  type DadosCampo,
  type DadosRegra,
} from "@/server/config-board";

export type ResultadoConfig = { ok: true } | { ok: false; motivo: string };

async function comBoard(ws: string, board: string, fn: (a: { wsId: string; boardId: string; actor: Actor }) => Promise<unknown>): Promise<ResultadoConfig> {
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  try {
    exigirConfigurador(ctx);
    await fn({ wsId: ctx.ws.id, boardId: b.id, actor: ctx.actor });
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ErroConfig) return { ok: false, motivo: e.message };
    console.error(e);
    return { ok: false, motivo: "Erro inesperado. Tente novamente." };
  }
  revalidatePath(`/w/${ws}/b/${board}`, "layout");
  return { ok: true };
}

export async function criarFaseAction(ws: string, board: string, nome: string) {
  return comBoard(ws, board, (a) => criarFase(a, nome));
}
export async function atualizarFaseAction(ws: string, board: string, faseId: string, dados: { nome?: string; terminal?: boolean; cor?: string | null }) {
  return comBoard(ws, board, (a) => atualizarFase(a, faseId, dados));
}
export async function moverFaseAction(ws: string, board: string, faseId: string, direcao: -1 | 1) {
  return comBoard(ws, board, (a) => moverFase(a, faseId, direcao === -1 ? -1 : 1));
}
export async function arquivarFaseAction(ws: string, board: string, faseId: string) {
  return comBoard(ws, board, (a) => arquivarFase(a, faseId));
}

export async function salvarCampoAction(ws: string, board: string, fieldId: string | null, dados: DadosCampo) {
  return comBoard(ws, board, (a) => (fieldId ? editarCampo(a, fieldId, dados) : criarCampo(a, dados)));
}
/** Fases de preenchimento do campo ([] = todas as fases). Coluna "Preenchido em" e arrastar entre grupos. */
export async function definirFasesCampoAction(ws: string, board: string, fieldId: string, fases: string[]) {
  return comBoard(ws, board, (a) => definirFasesCampo(a, fieldId, Array.isArray(fases) ? fases.slice(0, 100) : []));
}
export async function arquivarCampoAction(ws: string, board: string, fieldId: string) {
  return comBoard(ws, board, (a) => arquivarCampo(a, fieldId));
}
export async function ajustarFaseAction(
  ws: string,
  board: string,
  fieldId: string,
  faseId: string,
  ajuste: { visible: boolean | null; editable: boolean | null; required: boolean | null },
) {
  return comBoard(ws, board, (a) => ajustarCampoNaFase(a, fieldId, faseId, ajuste));
}

export async function salvarRegraAction(ws: string, board: string, ruleId: string | null, dados: DadosRegra) {
  return comBoard(ws, board, (a) => (ruleId ? editarRegra(a, ruleId, dados) : criarRegra(a, dados)));
}
export async function ativarRegraAction(ws: string, board: string, ruleId: string, enabled: boolean) {
  return comBoard(ws, board, (a) => ativarRegra(a, ruleId, enabled));
}

export async function exibicaoKanbanAction(ws: string, board: string, dados: { campos: string[]; prazo: string | null }) {
  return comBoard(ws, board, (a) => definirExibicaoKanban(a, dados));
}

// ---------------------------------------------------------------------------
// Automações e ações
// ---------------------------------------------------------------------------

export async function salvarAutomacaoAction(ws: string, board: string, id: string | null, dados: DadosAutomacao) {
  return comBoard(ws, board, (a) => salvarAutomacao(a, id, dados));
}
export async function ativarAutomacaoAction(ws: string, board: string, id: string, enabled: boolean) {
  return comBoard(ws, board, (a) => ativarAutomacao(a, id, enabled));
}
export async function arquivarAutomacaoAction(ws: string, board: string, id: string) {
  return comBoard(ws, board, (a) => arquivarAutomacao(a, id));
}
export async function salvarAcaoAction(ws: string, board: string, id: string | null, dados: DadosAcao) {
  return comBoard(ws, board, (a) => salvarAcao(a, id, dados));
}
export async function arquivarAcaoAction(ws: string, board: string, id: string) {
  return comBoard(ws, board, (a) => arquivarAcao(a, id));
}

/** Execução serializável para a UI. */
export interface ExecucaoUI {
  id: string;
  status: string;
  env: string;
  erro: string | null;
  log: unknown[];
}
type ResultadoExecucao = { ok: true; execucao: ExecucaoUI } | { ok: false; motivo: string };
const paraUI = (r: { id: string; status: string; env: string; error: string | null; log: unknown }): ExecucaoUI => ({ id: r.id, status: r.status, env: r.env, erro: r.error, log: r.log as unknown[] });

async function comExecucao(ws: string, board: string, fn: (a: { wsId: string; boardId: string; actor: Actor }) => Promise<{ id: string; status: string; env: string; error: string | null; log: unknown }>): Promise<ResultadoExecucao> {
  let r: ExecucaoUI | null = null;
  const res = await comBoard(ws, board, async (a) => {
    r = paraUI(await fn(a));
  });
  return res.ok ? { ok: true, execucao: r! } : res;
}

/** "Testar com card X": roda em modo teste (nada é gravado) e devolve o log. */
export async function testarAutomacaoAction(ws: string, board: string, id: string, cardId: string) {
  return comExecucao(ws, board, (a) => testarAutomacao(a, id, cardId));
}
export async function reexecutarAction(ws: string, board: string, runId: string) {
  return comExecucao(ws, board, (a) => reexecutar(a, runId));
}

/** Cards do board para escolher no teste (busca por título ou número). */
export async function buscarCardsDoBoardAction(ws: string, board: string, termo: string) {
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  exigirConfigurador(ctx);
  return buscarCards(ctx.ws.id, b.id, String(termo ?? "").slice(0, 100), []);
}
