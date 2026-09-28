import Link from "next/link";
import { RestaurarWorkspace } from "@/components/workspace/zona-de-perigo";
import { exigirUsuario } from "@/server/acesso";
import { workspacesArquivadosDoOwner, workspacesDoUsuario } from "@/server/consultas";

export const dynamic = "force-dynamic";

/** Workspaces arquivados de que o usuário é owner: restaurar, ou abrir as configurações para excluir. */
export default async function Arquivados() {
  const u = await exigirUsuario();
  const [lista, ativos] = await Promise.all([workspacesArquivadosDoOwner(u.id), workspacesDoUsuario(u.id)]);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Workspaces arquivados</h1>
        {ativos[0] && (
          <Link href={`/w/${ativos[0].slug}`} className="text-sm text-muted-foreground hover:text-foreground">
            Voltar
          </Link>
        )}
      </header>
      {lista.length === 0 && <p className="text-sm text-muted-foreground">Nenhum workspace arquivado.</p>}
      <ul className="flex flex-col divide-y rounded-lg border">
        {lista.map((w) => (
          <li key={w.id} className="flex items-center justify-between gap-4 px-4 py-3" data-arquivado={w.name}>
            <span className="min-w-0">
              <span className="block truncate font-medium">{w.name}</span>
              <span className="text-xs text-muted-foreground">Arquivado em {w.archivedAt?.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <Link href={`/w/${w.slug}/settings`} className="text-sm text-muted-foreground hover:text-foreground">
                Configurações
              </Link>
              <RestaurarWorkspace ws={w.slug} nome={w.name} />
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
