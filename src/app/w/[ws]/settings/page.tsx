import { ConfigSmtp, Variaveis } from "@/components/workspace/variaveis";
import { ZonaDePerigo } from "@/components/workspace/zona-de-perigo";
import { exigirMembro, podeConfigurar } from "@/server/acesso";
import { smtpDoWorkspaceUI, variaveisDoWorkspace } from "@/server/automacoes";

export default async function ConfiguracoesWorkspace({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await exigirMembro(ws, { permitirArquivado: true });
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6">
      <header>
        <h1 className="text-lg font-semibold">Configurações do workspace</h1>
        <p className="text-sm text-muted-foreground">{ctx.ws.name}</p>
      </header>
      {ctx.ws.arquivado && (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          Este workspace está arquivado: não aparece na barra lateral nem nas listas. Os dados estão intactos.
        </p>
      )}
      {podeConfigurar(ctx) && !ctx.ws.arquivado && (
        <>
          <Variaveis ws={ctx.ws.slug} variaveis={await variaveisDoWorkspace(ctx.ws.id)} />
          <ConfigSmtp ws={ctx.ws.slug} atual={await smtpDoWorkspaceUI(ctx.ws.id)} />
        </>
      )}
      {ctx.papel === "owner" ? (
        <ZonaDePerigo ws={ctx.ws.slug} nome={ctx.ws.name} arquivado={ctx.ws.arquivado} />
      ) : (
        <p className="text-sm text-muted-foreground">Apenas o owner pode arquivar ou excluir o workspace.</p>
      )}
    </main>
  );
}
