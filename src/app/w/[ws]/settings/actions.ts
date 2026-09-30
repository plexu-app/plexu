"use server";
// Ciclo de vida do workspace (owner): arquivar, restaurar e excluir. A permissão é conferida no core.
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { arquivarWorkspace, CoreError, restaurarWorkspace, type Actor } from "@/core";
import { exigirConfigurador, exigirMembro } from "@/server/acesso";
import { removerVariavel, salvarSmtp, salvarVariavel, type DadosSmtp } from "@/server/automacoes";
import { ErroConfig } from "@/server/config";
import { excluirWorkspaceComArquivos } from "@/server/workspace";

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

export async function arquivarWorkspaceAction(ws: string): Promise<Resultado> {
  const ctx = await exigirMembro(ws, { permitirArquivado: true });
  const r = await tentar(() => arquivarWorkspace({ workspaceId: ctx.ws.id, actor: ctx.actor }));
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  redirect("/");
}

export async function restaurarWorkspaceAction(ws: string): Promise<Resultado> {
  const ctx = await exigirMembro(ws, { permitirArquivado: true });
  const r = await tentar(() => restaurarWorkspace({ workspaceId: ctx.ws.id, actor: ctx.actor }));
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  redirect(`/w/${ws}`);
}

export async function excluirWorkspaceAction(ws: string, confirmacao: string): Promise<Resultado> {
  const ctx = await exigirMembro(ws, { permitirArquivado: true });
  const r = await tentar(() => excluirWorkspaceComArquivos({ workspaceId: ctx.ws.id, actor: ctx.actor, confirmacao: String(confirmacao ?? "") }));
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  redirect("/");
}

// ---------------------------------------------------------------------------
// Variáveis e SMTP (usados pelas automações) — owner/admin
// ---------------------------------------------------------------------------

async function comConfigurador(ws: string, fn: (a: { wsId: string; actor: Actor }) => Promise<unknown>): Promise<Resultado> {
  const ctx = await exigirMembro(ws);
  const r = await tentar(async () => {
    exigirConfigurador(ctx);
    await fn({ wsId: ctx.ws.id, actor: ctx.actor });
  });
  if (r.ok) revalidatePath(`/w/${ws}/settings`);
  return r;
}

export async function salvarVariavelAction(ws: string, key: string, value: string, secreta: boolean) {
  return comConfigurador(ws, (a) => salvarVariavel(a, String(key ?? ""), String(value ?? ""), secreta === true));
}
export async function removerVariavelAction(ws: string, key: string) {
  return comConfigurador(ws, (a) => removerVariavel(a, String(key ?? "")));
}
export async function salvarSmtpAction(ws: string, dados: DadosSmtp) {
  return comConfigurador(ws, (a) => salvarSmtp(a, dados));
}
