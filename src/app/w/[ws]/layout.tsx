import { Marca } from "@/components/marca";
import { Sidebar, SCRIPT_SIDEBAR } from "@/components/sidebar";
import { exigirMembro, podeConfigurar } from "@/server/acesso";
import { boardsDoWorkspace, workspacesArquivadosDoOwner, workspacesDoUsuario } from "@/server/consultas";

export const dynamic = "force-dynamic";

export default async function LayoutWorkspace({ children, params }: { children: React.ReactNode; params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  // Arquivado: só o owner entra, e só as configurações do workspace respondem (as demais páginas dão 404).
  const ctx = await exigirMembro(ws, { permitirArquivado: true });
  const [boards, workspaces, arquivados] = await Promise.all([
    ctx.ws.arquivado ? [] : boardsDoWorkspace(ctx.ws.id),
    workspacesDoUsuario(ctx.usuario.id),
    workspacesArquivadosDoOwner(ctx.usuario.id),
  ]);
  return (
    <div className="min-h-screen">
      {/* Aplica o estado salvo da sidebar antes da pintura (sem piscar). */}
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_SIDEBAR }} />
      <Sidebar
        ws={ctx.ws.slug}
        wsNome={ctx.ws.name}
        usuario={ctx.usuario.nome}
        boards={boards.map((b) => ({ slug: b.slug, name: b.name, kind: b.kind }))}
        podeCriar={podeConfigurar(ctx) && !ctx.ws.arquivado}
        workspaces={workspaces.map((w) => ({ slug: w.slug, name: w.name }))}
        arquivados={arquivados.length}
        configuraWorkspace={podeConfigurar(ctx)}
        marca={<Marca tamanho={22} />}
      />
      <div className="flex min-h-screen flex-col pl-60 transition-[padding] recolhida:pl-14">{children}</div>
    </div>
  );
}
