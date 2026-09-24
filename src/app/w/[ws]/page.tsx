import Link from "next/link";
import { Database, KanbanSquare } from "lucide-react";
import { CriarBoard } from "@/components/criar-board";
import { Badge, Card } from "@/components/ui/misc";
import { exigirMembro, podeConfigurar } from "@/server/acesso";
import { boardsDoWorkspace } from "@/server/consultas";

export default async function Boards({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await exigirMembro(ws);
  const lista = await boardsDoWorkspace(ctx.ws.id);
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Boards</h1>
      </div>
      {lista.length === 0 && <p className="text-sm text-muted-foreground">Nenhum board ainda.</p>}
      <ul className="grid grid-cols-3 gap-3">
        {lista.map((b) => (
          <li key={b.id}>
            <Link href={`/w/${ws}/b/${b.slug}`}>
              <Card className="flex h-full flex-col gap-2 p-4 transition-colors hover:border-primary/50">
                <div className="flex items-center gap-2 font-medium">
                  {b.kind === "workflow" ? <KanbanSquare className="size-4" /> : <Database className="size-4" />}
                  {b.name}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{b.kind === "workflow" ? "fluxo" : "base"}</Badge>
                  {b.cards} {b.cards === 1 ? "card" : "cards"}
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      {podeConfigurar(ctx) && <CriarBoard ws={ws} />}
    </main>
  );
}
