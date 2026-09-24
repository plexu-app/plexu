import Link from "next/link";
import { AbasBoard } from "@/components/abas-board";
import { exigirBoard, exigirMembro } from "@/server/acesso";

export default async function LayoutBoard({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ws: string; board: string }>;
}) {
  const { ws, board } = await params;
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  const base = `/w/${ws}/b/${b.slug}`;
  const abas = [{ href: base, rotulo: b.kind === "workflow" ? "Kanban" : "Registros" }];
  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <div className="flex items-center gap-4 border-b px-4 py-2">
        <nav className="text-sm text-muted-foreground">
          <Link href={`/w/${ws}`} className="hover:underline">
            Boards
          </Link>
          <span className="px-1">/</span>
          <Link href={base} className="font-semibold text-foreground">
            {b.name}
          </Link>
        </nav>
        <AbasBoard abas={abas} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
