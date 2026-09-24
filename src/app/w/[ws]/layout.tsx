import { Marca } from "@/components/marca";
import { Sidebar } from "@/components/sidebar";
import { exigirMembro, podeConfigurar } from "@/server/acesso";
import { boardsDoWorkspace } from "@/server/consultas";

export const dynamic = "force-dynamic";

export default async function LayoutWorkspace({ children, params }: { children: React.ReactNode; params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await exigirMembro(ws);
  const boards = await boardsDoWorkspace(ctx.ws.id);
  return (
    <div className="min-h-screen">
      <Sidebar
        ws={ctx.ws.slug}
        wsNome={ctx.ws.name}
        usuario={ctx.usuario.nome}
        boards={boards.map((b) => ({ slug: b.slug, name: b.name, kind: b.kind }))}
        podeCriar={podeConfigurar(ctx)}
        marca={<Marca tamanho={22} />}
      />
      <div className="flex min-h-screen flex-col pl-60">{children}</div>
    </div>
  );
}
