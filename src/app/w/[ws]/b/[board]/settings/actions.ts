"use server";
// Configuração do board (owner/admin). Sem SQL aqui: tudo via src/server/config-board.
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { Actor } from "@/core";
import { exigirBoard, exigirConfigurador, exigirMembro } from "@/server/acesso";
import { ErroConfig } from "@/server/config";
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
