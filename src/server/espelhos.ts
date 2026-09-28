import "server-only";
// Espelhos (lookup): de qual board e campo vem o valor. Mesma resolução do core (origemDoLookup), para
// a UI e as actions: desenhar o input com o tipo da origem e interpretar o formulário.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fields } from "@/db/schema";
import { boardPorId, titulosDeCards, type BoardCompleto, type CampoUI } from "./consultas";

export interface OrigemEspelho {
  board: BoardCompleto;
  campo: CampoUI;
  /** O espelho grava na origem (lookup "ref" com editable_writeback). */
  editavel: boolean;
}

export async function origemDoEspelho(wsId: string, b: BoardCompleto, campo: CampoUI): Promise<OrigemEspelho | null> {
  if (campo.type !== "lookup") return null;
  const cfg = (campo.config.lookup ?? {}) as { via_field?: string; path?: string; mode?: string; editable_writeback?: boolean };
  if (!cfg.via_field || !cfg.path) return null;
  const propria = b.campos.find((c) => c.id === cfg.via_field && c.type === "relation");
  let boardId: string | undefined;
  if (propria) boardId = String((propria.config.relation as { target_board?: string } | undefined)?.target_board ?? "");
  else [{ boardId } = { boardId: undefined }] = await db.select({ boardId: fields.boardId }).from(fields).where(eq(fields.id, cfg.via_field));
  const board = boardId ? await boardPorId(wsId, boardId) : null;
  const origem = board?.campos.find((c) => c.slug === cfg.path);
  if (!board || !origem) return null;
  return { board, campo: origem, editavel: cfg.mode !== "copy" && cfg.editable_writeback === true };
}

/**
 * Para exibir: espelhos cuja origem é uma relação guardam ids de cards em computed; troca pelos
 * títulos desses cards (kanban, tabela e painel mostram nomes, e filtro/ordenação usam o texto).
 */
export async function comTitulosDosEspelhos<T extends { computed: Record<string, unknown> }>(wsId: string, b: BoardCompleto, cards: T[]): Promise<T[]> {
  const espelhos: string[] = [];
  for (const c of b.campos.filter((x) => x.type === "lookup")) {
    const o = await origemDoEspelho(wsId, b, c);
    if (o?.campo.type === "relation") espelhos.push(c.id);
  }
  if (!espelhos.length) return cards;
  const ids = [...new Set(cards.flatMap((c) => espelhos.flatMap((f) => (Array.isArray(c.computed[f]) ? (c.computed[f] as string[]) : []))))];
  const titulos = await titulosDeCards(ids);
  return cards.map((c) => {
    const computed = { ...c.computed };
    for (const f of espelhos) if (Array.isArray(computed[f])) computed[f] = (computed[f] as string[]).map((id) => titulos.get(id) || id).join(", ");
    return { ...c, computed };
  });
}
