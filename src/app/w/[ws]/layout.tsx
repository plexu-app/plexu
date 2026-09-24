import Link from "next/link";
import { LogOut } from "lucide-react";
import { Marca } from "@/components/marca";
import { Button } from "@/components/ui/button";
import { sair } from "@/app/auth-actions";
import { exigirMembro } from "@/server/acesso";

export const dynamic = "force-dynamic";

export default async function LayoutWorkspace({ children, params }: { children: React.ReactNode; params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await exigirMembro(ws);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-12 items-center gap-3 border-b px-4">
        <Link href={`/w/${ctx.ws.slug}`} className="flex items-center gap-2 font-semibold">
          <Marca tamanho={24} />
          <span>{ctx.ws.name}</span>
        </Link>
        <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
          <span>{ctx.usuario.nome}</span>
          <form action={sair}>
            <Button variant="ghost" size="sm" type="submit" aria-label="Sair">
              <LogOut /> Sair
            </Button>
          </form>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
