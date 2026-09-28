import "server-only";
import { notFound, redirect } from "next/navigation";
import type { Actor } from "@/core";
import { boardPorSlug, cardDoBoard, membroDoWorkspace, type BoardCompleto, type Papel } from "./consultas";
import { usuarioAtual, type UsuarioSessao } from "./auth/sessao";
import { ErroConfig } from "./config";

export interface Contexto {
  usuario: UsuarioSessao;
  ws: { id: string; slug: string; name: string; arquivado: boolean };
  papel: Papel;
  actor: Actor;
}

export async function exigirUsuario(): Promise<UsuarioSessao> {
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  return u;
}

/**
 * Usuário logado e membro do workspace; senão login/404. Toda server action começa aqui.
 * Workspace arquivado dá 404, salvo com permitirArquivado (só o owner: configurações do workspace).
 */
export async function exigirMembro(wsSlug: string, opcoes: { permitirArquivado?: boolean } = {}): Promise<Contexto> {
  const usuario = await exigirUsuario();
  const m = await membroDoWorkspace(usuario.id, wsSlug, { incluirArquivado: opcoes.permitirArquivado });
  if (!m) notFound();
  return { usuario, ws: m.ws, papel: m.papel, actor: { type: "user", id: usuario.id } };
}

export function podeConfigurar(ctx: Contexto): boolean {
  return ctx.papel === "owner" || ctx.papel === "admin";
}

export function exigirConfigurador(ctx: Contexto): void {
  if (!podeConfigurar(ctx)) throw new ErroConfig("Apenas owner ou admin podem configurar o workspace.");
}

export async function exigirBoard(ctx: Contexto, boardSlug: string): Promise<BoardCompleto> {
  const b = await boardPorSlug(ctx.ws.id, boardSlug);
  if (!b) notFound();
  return b;
}

/** Card não excluído que pertence ao board (e, portanto, ao workspace). */
export async function exigirCard(board: BoardCompleto, cardId: string) {
  const c = await cardDoBoard(board.id, cardId);
  if (!c) notFound();
  return c;
}
