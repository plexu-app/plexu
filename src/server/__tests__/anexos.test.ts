// Upload/download de anexos: serviço (acesso, tipos, limite) e rotas (sessão, multipart, cabeçalhos).
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createCard, deleteCard } from "@/core";
import { criarBoard, criarCampo, criarWorkspace } from "@/core/__tests__/fixtures";
import { db } from "@/db";
import { users, workspaceMembers } from "@/db/schema";
import { ArmazenamentoDisco } from "../anexos/armazenamento";
import { abrirDownload, ErroAnexo, receberUpload } from "../anexos/servico";

const sessao = vi.hoisted(() => ({ usuario: null as null | { id: string; email: string; nome: string } }));
vi.mock("@/server/auth/sessao", () => ({ usuarioAtual: async () => sessao.usuario }));

let dir: string;
let arm: ArmazenamentoDisco;
const W = { slug: "", id: "", dono: "", colega: "", estranho: "", campo: "", board: "" };

const arquivo = (name: string, conteudo: string, type = "application/pdf") => new File([conteudo], name, { type });
const texto = async (s: ReadableStream<Uint8Array>) => new Response(s).text();

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "plexu-anexos-"));
  process.env.ATTACHMENTS_DIR = dir;
  arm = new ArmazenamentoDisco(dir);
  const w = await criarWorkspace();
  Object.assign(W, { slug: w.ws.slug, id: w.ws.id, dono: w.user.id });
  const [colega] = await db.insert(users).values({ email: `colega-${Date.now()}@teste.dev`, name: "Colega" }).returning();
  await db.insert(workspaceMembers).values({ workspaceId: w.ws.id, userId: colega.id, orgRole: "member" });
  W.colega = colega.id;
  W.estranho = (await criarWorkspace()).user.id;
  const b = await criarBoard(w.ws.id, "contratos");
  W.board = "contratos";
  W.campo = await criarCampo(b.id, { slug: "escopo", type: "attachment", config: { accept: ".pdf,.docx" } });
  await criarCampo(b.id, { slug: "objeto", type: "text" });
});

const upload = (usuarioId: string, arquivos: File[], limite = 1024) =>
  receberUpload({ usuarioId, ws: W.slug, board: W.board, fieldId: W.campo, arquivos }, arm, limite);

describe("serviço de anexos", () => {
  it("upload grava arquivo com chave aleatória e linha provisória; nome original preservado", async () => {
    const [a] = await upload(W.dono, [arquivo("Escopo técnico v2.pdf", "%PDF-1 conteúdo")]);
    expect(a).toMatchObject({ filename: "Escopo técnico v2.pdf", size: Buffer.byteLength("%PDF-1 conteúdo"), mime: "application/pdf" });
    const pastas = await readdir(dir);
    expect(pastas.length).toBeGreaterThan(0);
    const baixado = await abrirDownload({ usuarioId: W.dono, id: a.id }, arm);
    expect(await texto(baixado.corpo)).toBe("%PDF-1 conteúdo");
  });

  it("recusa tipo não aceito, arquivo acima do limite, campo errado e quem não é membro", async () => {
    const e = (p: Promise<unknown>) => p.then(() => null, (x) => x as ErroAnexo);
    expect((await e(upload(W.dono, [arquivo("foto.png", "x", "image/png")])))?.status).toBe(415);
    expect((await e(upload(W.dono, [arquivo("grande.pdf", "x".repeat(2000))])))?.status).toBe(413);
    expect((await e(upload(W.estranho, [arquivo("a.pdf", "x")])))?.status).toBe(404);
    const campoErrado = await e(receberUpload({ usuarioId: W.dono, ws: W.slug, board: W.board, fieldId: "00000000-0000-4000-8000-000000000000", arquivos: [arquivo("a.pdf", "x")] }, arm));
    expect(campoErrado?.status).toBe(400);
  });

  it("download: provisório só para quem enviou; ligado ao card, para membros; card excluído ou não membro → 404", async () => {
    const [a] = await upload(W.dono, [arquivo("contrato.pdf", "assinado")]);
    const nega = (usuarioId: string) => abrirDownload({ usuarioId, id: a.id }, arm).then(() => null, (x) => (x as ErroAnexo).status);
    expect(await nega(W.colega)).toBe(404);
    const card = await createCard({ boardId: (await boardId()), props: { objeto: "Obra", escopo: [a.id] }, actor: { type: "user", id: W.dono } });
    expect(await texto((await abrirDownload({ usuarioId: W.colega, id: a.id }, arm)).corpo)).toBe("assinado");
    expect(await nega(W.estranho)).toBe(404);
    await deleteCard({ cardId: card.id, actor: { type: "user", id: W.dono } });
    expect(await nega(W.dono)).toBe(404);
  });
});

async function boardId() {
  const { boards } = await import("@/db/schema");
  const { and } = await import("drizzle-orm");
  return (await db.select().from(boards).where(and(eq(boards.workspaceId, W.id), eq(boards.slug, W.board))))[0].id;
}

describe("rotas /api/anexos", () => {
  it("sem sessão: 401 no upload e no download", async () => {
    const { POST } = await import("@/app/api/anexos/route");
    const { GET } = await import("@/app/api/anexos/[id]/route");
    sessao.usuario = null;
    expect((await POST(new Request("http://x/api/anexos", { method: "POST", body: new FormData() }))).status).toBe(401);
    expect((await GET(new Request("http://x"), { params: Promise.resolve({ id: "x" }) })).status).toBe(401);
  });

  it("upload multipart e download com Content-Disposition do nome original; acesso negado vira 404", async () => {
    const { POST } = await import("@/app/api/anexos/route");
    const { GET } = await import("@/app/api/anexos/[id]/route");
    sessao.usuario = { id: W.dono, email: "d@x", nome: "Dono" };
    const fd = new FormData();
    fd.append("ws", W.slug);
    fd.append("board", W.board);
    fd.append("fieldId", W.campo);
    fd.append("arquivo", arquivo("Relatório final.pdf", "conteúdo do pdf"));
    const r = await POST(new Request("http://x/api/anexos", { method: "POST", body: fd }));
    expect(r.status).toBe(200);
    const { anexos } = (await r.json()) as { anexos: { id: string; filename: string }[] };
    expect(anexos[0].filename).toBe("Relatório final.pdf");

    const d = await GET(new Request("http://x"), { params: Promise.resolve({ id: anexos[0].id }) });
    expect(d.status).toBe(200);
    expect(d.headers.get("content-type")).toBe("application/pdf");
    expect(d.headers.get("content-disposition")).toBe(`attachment; filename="Relatorio final.pdf"; filename*=UTF-8''${encodeURIComponent("Relatório final.pdf")}`);
    expect(d.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await d.text()).toBe("conteúdo do pdf");

    sessao.usuario = { id: W.estranho, email: "e@x", nome: "Estranho" };
    expect((await GET(new Request("http://x"), { params: Promise.resolve({ id: anexos[0].id }) })).status).toBe(404);
  });
});
