import "server-only";
// Upload e download de anexos, com as checagens de acesso. As rotas (src/app/api/anexos) só fazem a
// ponte HTTP; aqui fica a regra, testável sem servidor.
//
// Upload: grava o arquivo e a linha em attachments sem card (provisório). O core liga o anexo ao card
// quando o id entra num campo de anexo (createCard/updateFields), e recusa id de outro card.
// Download: só membro do workspace; anexo de card exige card ativo; provisório, só quem enviou.
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { attachments, cards, workspaceMembers } from "@/db/schema";
import { problemaNoArquivo } from "@/lib/anexos";
import { boardPorSlug, membroDoWorkspace } from "../consultas";
import { armazenamentoPadrao, limiteBytes, novaChave, type Armazenamento } from "./armazenamento";

export class ErroAnexo extends Error {
  constructor(
    public status: 400 | 401 | 404 | 413 | 415,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export interface AnexoInfo {
  id: string;
  filename: string;
  size: number;
  mime: string | null;
}

interface ArquivoRecebido {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export async function receberUpload(
  p: { usuarioId: string; ws: string; board: string; fieldId: string; arquivos: ArquivoRecebido[] },
  arm: Armazenamento = armazenamentoPadrao(),
  limite = limiteBytes(),
): Promise<AnexoInfo[]> {
  const m = await membroDoWorkspace(p.usuarioId, p.ws);
  if (!m) throw new ErroAnexo(404, "workspace não encontrado");
  const b = await boardPorSlug(m.ws.id, p.board);
  const campo = b?.campos.find((c) => c.id === p.fieldId && c.type === "attachment");
  if (!b || !campo) throw new ErroAnexo(400, "campo de anexo não encontrado neste board");
  if (!p.arquivos.length) throw new ErroAnexo(400, "nenhum arquivo enviado");
  const accept = typeof campo.config.accept === "string" ? campo.config.accept : "";
  for (const a of p.arquivos) {
    const problema = problemaNoArquivo(a, accept, limite);
    if (problema) throw new ErroAnexo(a.size > limite ? 413 : a.size <= 0 ? 400 : 415, problema);
  }
  const saida: AnexoInfo[] = [];
  for (const a of p.arquivos) {
    const chave = novaChave();
    await arm.gravar(chave, new Uint8Array(await a.arrayBuffer()));
    const [row] = await db
      .insert(attachments)
      .values({
        workspaceId: m.ws.id,
        fieldId: campo.id,
        cardId: null,
        storageKey: chave,
        filename: a.name.slice(0, 255) || "arquivo",
        mime: a.type || null,
        size: a.size,
        uploadedBy: p.usuarioId,
      })
      .returning();
    saida.push({ id: row.id, filename: row.filename, size: row.size ?? a.size, mime: row.mime });
  }
  return saida;
}

export async function abrirDownload(
  p: { usuarioId: string; id: string },
  arm: Armazenamento = armazenamentoPadrao(),
): Promise<AnexoInfo & { corpo: ReadableStream<Uint8Array> }> {
  const naoEncontrado = new ErroAnexo(404, "anexo não encontrado");
  if (!/^[0-9a-f-]{36}$/i.test(p.id)) throw naoEncontrado;
  const [a] = await db.select().from(attachments).where(eq(attachments.id, p.id));
  if (!a) throw naoEncontrado;
  // Mesmo 404 para "não existe" e "sem acesso": não revela anexos de outros workspaces.
  const [membro] = await db
    .select({ u: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, a.workspaceId), eq(workspaceMembers.userId, p.usuarioId)));
  if (!membro) throw naoEncontrado;
  if (a.cardId) {
    const [c] = await db.select({ id: cards.id }).from(cards).where(and(eq(cards.id, a.cardId), isNull(cards.deletedAt)));
    if (!c) throw naoEncontrado;
  } else if (a.uploadedBy !== p.usuarioId) {
    throw naoEncontrado;
  }
  const corpo = await arm.ler(a.storageKey);
  if (!corpo) throw naoEncontrado;
  return { id: a.id, filename: a.filename, size: a.size ?? 0, mime: a.mime, corpo };
}

/** Metadados de anexos (para mostrar nome/tamanho no formulário), só do workspace informado. */
export async function anexosPorIds(workspaceId: string, ids: string[]): Promise<Record<string, AnexoInfo>> {
  if (!ids.length) return {};
  const rows = await db
    .select({ id: attachments.id, filename: attachments.filename, size: attachments.size, mime: attachments.mime })
    .from(attachments)
    .where(and(eq(attachments.workspaceId, workspaceId), inArray(attachments.id, ids)));
  return Object.fromEntries(rows.map((r) => [r.id, { id: r.id, filename: r.filename, size: r.size ?? 0, mime: r.mime }]));
}
