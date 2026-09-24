import "server-only";
// Escritas de configuração (workspace, boards). Nunca tocam em cards: isso é do src/core.
// Toda mudança emite config.changed na mesma transação (decisão 13).
import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { boards, fields, phases, users, workspaceMembers, workspaces } from "@/db/schema";
import { emitirEventoConfig, type Actor } from "@/core";
import { slugify, slugLivre } from "@/lib/slug";
import { hashSenha, validarSenha } from "./auth/senha";

export class ErroConfig extends Error {}

export interface PrimeiroAcessoInput {
  workspace: string;
  nome: string;
  email: string;
  senha: string;
}

/** Cria o primeiro usuário (owner) e o primeiro workspace. Só funciona com o banco sem usuários. */
export async function primeiroAcesso(input: PrimeiroAcessoInput) {
  const erroSenha = validarSenha(input.senha);
  if (erroSenha) throw new ErroConfig(erroSenha);
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErroConfig("e-mail inválido");
  if (!input.nome.trim() || !input.workspace.trim()) throw new ErroConfig("nome e workspace são obrigatórios");
  const hash = await hashSenha(input.senha);

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('plexu:primeiro-acesso'))`);
    const [{ n }] = await tx.select({ n: count() }).from(users);
    if (n > 0) throw new ErroConfig("o primeiro acesso já foi feito");
    const [u] = await tx.insert(users).values({ email, name: input.nome.trim(), auth: { senha: hash, sv: 0 } }).returning();
    const [ws] = await tx.insert(workspaces).values({ slug: slugify(input.workspace), name: input.workspace.trim() }).returning();
    await tx.insert(workspaceMembers).values({ workspaceId: ws.id, userId: u.id, orgRole: "owner" });
    const actor: Actor = { type: "user", id: u.id };
    await emitirEventoConfig(tx, { workspaceId: ws.id, boardId: null, actor }, { entidade: "workspace", acao: "created", id: ws.id, dados: { slug: ws.slug, name: ws.name } });
    return { userId: u.id, wsSlug: ws.slug };
  });
}

const FASES_PADRAO = [{ name: "A fazer" }, { name: "Em andamento" }, { name: "Concluído", isTerminal: true }];

/** Board novo com campo de título "Título"; workflow ganha 3 fases padrão. */
export async function criarBoard(wsId: string, actor: Actor, input: { nome: string; kind: "workflow" | "database" }) {
  const nome = input.nome.trim();
  if (!nome) throw new ErroConfig("nome obrigatório");
  if (input.kind !== "workflow" && input.kind !== "database") throw new ErroConfig("tipo inválido");
  return db.transaction(async (tx) => {
    const usados = await tx.select({ slug: boards.slug }).from(boards).where(eq(boards.workspaceId, wsId));
    const slug = slugLivre(slugify(nome), usados.map((b) => b.slug));
    const [b] = await tx.insert(boards).values({ workspaceId: wsId, slug, name: nome, kind: input.kind }).returning();
    const [titulo] = await tx
      .insert(fields)
      .values({ boardId: b.id, type: "text", name: "Título", slug: "titulo", position: 0 })
      .returning();
    await tx.update(boards).set({ titleFieldId: titulo.id }).where(and(eq(boards.id, b.id)));
    if (input.kind === "workflow") {
      await tx.insert(phases).values(FASES_PADRAO.map((f, i) => ({ boardId: b.id, name: f.name, position: i, isTerminal: f.isTerminal ?? false })));
    }
    await emitirEventoConfig(tx, { workspaceId: wsId, boardId: b.id, actor }, { entidade: "board", acao: "created", id: b.id, dados: { slug, name: nome, kind: input.kind } });
    return { slug };
  });
}
