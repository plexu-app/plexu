// Ciclo de vida do workspace no servidor: arquivado some das listas e do acesso (salvo o owner nas
// configurações); excluir apaga os arquivos dos anexos do disco depois do commit.
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { arquivarWorkspace, createCard, restaurarWorkspace } from "@/core";
import { criarBoard, criarCampo, criarWorkspace } from "@/core/__tests__/fixtures";
import { db } from "@/db";
import { users, workspaceMembers } from "@/db/schema";
import { ArmazenamentoDisco } from "../anexos/armazenamento";
import { abrirDownload, receberUpload } from "../anexos/servico";
import { membroDoWorkspace, workspacesArquivadosDoOwner, workspacesDoUsuario } from "../consultas";
import { excluirWorkspaceComArquivos } from "../workspace";

let dir: string;
let arm: ArmazenamentoDisco;
let w: Awaited<ReturnType<typeof criarWorkspace>>;
let colega: string;
let anexo: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "plexu-ws-"));
  arm = new ArmazenamentoDisco(dir);
  w = await criarWorkspace();
  const [u] = await db.insert(users).values({ email: `c-${w.ws.id}@teste.dev`, name: "Colega" }).returning();
  await db.insert(workspaceMembers).values({ workspaceId: w.ws.id, userId: u.id, orgRole: "member" });
  colega = u.id;
  const b = await criarBoard(w.ws.id, "contratos");
  const campo = await criarCampo(b.id, { slug: "doc", type: "attachment" });
  const [a] = await receberUpload({ usuarioId: w.user.id, ws: w.ws.slug, board: "contratos", fieldId: campo, arquivos: [new File(["pdf"], "d.pdf", { type: "application/pdf" })] }, arm);
  await createCard({ boardId: b.id, props: { doc: [a.id] }, actor: w.actor });
  anexo = a.id;
});

describe("workspace arquivado", () => {
  it("some das listas e do acesso; o owner o vê nas configurações e em arquivados", async () => {
    await arquivarWorkspace({ workspaceId: w.ws.id, actor: w.actor });
    expect((await workspacesDoUsuario(w.user.id)).map((x) => x.slug)).not.toContain(w.ws.slug);
    expect(await membroDoWorkspace(w.user.id, w.ws.slug)).toBeNull();
    expect(await membroDoWorkspace(colega, w.ws.slug, { incluirArquivado: true })).toBeNull();
    expect((await membroDoWorkspace(w.user.id, w.ws.slug, { incluirArquivado: true }))?.ws.arquivado).toBe(true);
    expect((await workspacesArquivadosDoOwner(w.user.id)).map((x) => x.slug)).toEqual([w.ws.slug]);
    expect(await workspacesArquivadosDoOwner(colega)).toEqual([]);
    await expect(abrirDownload({ usuarioId: w.user.id, id: anexo }, arm)).rejects.toMatchObject({ status: 404 });

    await restaurarWorkspace({ workspaceId: w.ws.id, actor: w.actor });
    expect((await workspacesDoUsuario(colega)).map((x) => x.slug)).toContain(w.ws.slug);
    expect((await abrirDownload({ usuarioId: w.user.id, id: anexo }, arm)).filename).toBe("d.pdf");
  });
});

describe("workspace excluído", () => {
  it("remove os arquivos dos anexos do disco e some de tudo", async () => {
    expect(await readdir(dir, { recursive: true })).not.toHaveLength(0);
    const r = await excluirWorkspaceComArquivos({ workspaceId: w.ws.id, actor: w.actor, confirmacao: w.ws.name }, arm);
    expect(r.removidos.anexos).toBe(1);
    expect(r.arquivosNaoRemovidos).toBe(0);
    const sobra = (await readdir(dir, { recursive: true, withFileTypes: true })).filter((e) => e.isFile());
    expect(sobra).toEqual([]);
    expect(await membroDoWorkspace(w.user.id, w.ws.slug, { incluirArquivado: true })).toBeNull();
    expect(await workspacesArquivadosDoOwner(w.user.id)).toEqual([]);
  });
});
