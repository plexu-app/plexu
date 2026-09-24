import Link from "next/link";
import { Database, KanbanSquare } from "lucide-react";
import { NovoBoard } from "@/components/criar-board";
import { exigirMembro, podeConfigurar } from "@/server/acesso";
import { boardsDoWorkspace } from "@/server/consultas";

export default async function Boards({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await exigirMembro(ws);
  const lista = await boardsDoWorkspace(ctx.ws.id);
  return (
    <main className="mx-auto w-full max-w-[1400px] px-6 py-6">
      <h1 className="mb-4 text-lg font-semibold">Boards</h1>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        {lista.map((b) => {
          const Icone = b.kind === "workflow" ? KanbanSquare : Database;
          return (
            <li key={b.id}>
              <Link
                href={`/w/${ws}/b/${b.slug}`}
                className="flex h-full min-h-28 flex-col justify-between gap-3 rounded-lg border bg-background p-4 shadow-xs transition hover:border-primary/50 hover:shadow-sm"
              >
                <span className="flex items-center gap-2 font-medium">
                  <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icone className="size-4" />
                  </span>
                  {b.name}
                </span>
                <span className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{b.kind === "workflow" ? "Fluxo" : "Base"}</span>
                  <span>
                    {b.cards} {b.cards === 1 ? "card" : "cards"}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
        {podeConfigurar(ctx) && (
          <li>
            <NovoBoard ws={ws} variante="bloco" />
          </li>
        )}
      </ul>
      {lista.length === 0 && !podeConfigurar(ctx) && <p className="text-sm text-muted-foreground">Nenhum board ainda.</p>}
    </main>
  );
}
