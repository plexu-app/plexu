// Fixtures de configuração para testes de integração (workspace, board, fases, campos, regras).
// Cards nunca são criados aqui: só via core.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { boards, fieldPhaseSettings, fields, phases, rules, users, workspaceMembers, workspaces } from "../../db/schema";
import type { Actor } from "../types";

export const FUSO = "America/Sao_Paulo";

export async function criarWorkspace() {
  const sufixo = randomUUID().slice(0, 8);
  const [ws] = await db
    .insert(workspaces)
    .values({ slug: `teste-${sufixo}`, name: `Teste ${sufixo}`, settings: { timezone: FUSO } })
    .returning();
  const [u] = await db.insert(users).values({ email: `u-${sufixo}@teste.dev`, name: "Ana Teste" }).returning();
  await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: u.id, orgRole: "owner" });
  const actor: Actor = { type: "user", id: u.id };
  return { ws, user: u, actor };
}

export async function criarBoard(
  workspaceId: string,
  slug: string,
  fases: { name: string; terminal?: boolean }[] = [],
  kind: "workflow" | "database" = fases.length ? "workflow" : "database",
) {
  const [b] = await db.insert(boards).values({ workspaceId, slug, name: slug, kind }).returning();
  const ids: Record<string, string> = {};
  for (const [i, f] of fases.entries()) {
    const [p] = await db
      .insert(phases)
      .values({ boardId: b.id, name: f.name, position: i, isTerminal: f.terminal ?? false })
      .returning();
    ids[f.name] = p.id;
  }
  return { id: b.id, fases: ids };
}

export interface CampoFixture {
  slug: string;
  type: string;
  name?: string;
  config?: Record<string, unknown>;
  requiredExpr?: string;
  visibleExpr?: string;
  uniqueValue?: boolean;
  defaultValueExpr?: string;
  validation?: Record<string, unknown>;
}

export async function criarCampo(boardId: string, c: CampoFixture): Promise<string> {
  const [f] = await db
    .insert(fields)
    .values({
      boardId,
      slug: c.slug,
      type: c.type as never,
      name: c.name ?? c.slug,
      config: c.config ?? {},
      requiredExpr: c.requiredExpr,
      visibleExpr: c.visibleExpr,
      uniqueValue: c.uniqueValue ?? false,
      defaultValueExpr: c.defaultValueExpr,
      validation: c.validation,
    })
    .returning();
  return f.id;
}

export async function definirTitulo(boardId: string, fieldId: string) {
  await db.update(boards).set({ titleFieldId: fieldId }).where(eq(boards.id, boardId));
}

export async function ajustarFase(
  fieldId: string,
  phaseId: string,
  a: { required?: boolean; editable?: boolean; visible?: boolean },
) {
  await db.insert(fieldPhaseSettings).values({ fieldId, phaseId, ...a });
}

export async function criarRegra(r: {
  boardId: string;
  kind: "can_enter" | "can_leave" | "can_back" | "can_edit" | "can_delete" | "can_create";
  expr: string;
  phaseId?: string;
  fieldId?: string;
  message?: string;
  onFail?: Record<string, unknown>;
}): Promise<string> {
  const [row] = await db.insert(rules).values(r).returning();
  return row.id;
}
