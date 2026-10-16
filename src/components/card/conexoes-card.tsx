"use client";
// "Este card está conectado a" (prompt PR 2, B2): cards relacionados (pais e filhos) como mini-cards
// com borda de 1px: título, e grade de 2 colunas com até 4 campos (board de origem, fase atual com a
// cor, campos resumidos do board). Menu ⋯ com abrir e desconectar; "Mostrar mais" depois de 3.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ellipsis, ExternalLink, Unlink } from "lucide-react";
import { toast } from "sonner";
import { desligarAction } from "@/app/w/[ws]/actions";
import { IconeTipo } from "@/components/icone-tipo";
import { itemMenu, Menu } from "@/components/ui/menu";

export interface MiniCard {
  id: string;
  href: string;
  titulo: string;
  /** Relação (nome do campo, do ponto de vista deste card). */
  relacao: string;
  board: { nome: string; cor: string };
  fase: { nome: string; cor: string } | null;
  campos: { nome: string; texto: string; tipo: string }[];
  /** Como desligar: campo da relação e de que lado este card está. */
  desligar: { campoId: string; lado: "origem" | "destino" };
}

const VISIVEIS = 3;

export function ConexoesCard({ ws, board, cardId, itens }: { ws: string; board: string; cardId: string; itens: MiniCard[] }) {
  const [todos, setTodos] = useState(false);
  if (!itens.length) return null;
  const mostrados = todos ? itens : itens.slice(0, VISIVEIS);
  return (
    <section aria-label="Conexões" data-conexoes>
      <h3 className="mb-3 text-[13px] font-semibold">Este card está conectado a</h3>
      <ul className="flex flex-col gap-2">
        {mostrados.map((c) => (
          <li key={`${c.desligar.campoId}:${c.id}`}>
            <Mini ws={ws} board={board} cardId={cardId} c={c} />
          </li>
        ))}
      </ul>
      {itens.length > VISIVEIS && (
        <button type="button" className="mt-2 text-[13px] text-accent hover:underline" onClick={() => setTodos((v) => !v)}>
          {todos ? "Mostrar menos" : `Mostrar mais (${itens.length - VISIVEIS})`}
        </button>
      )}
    </section>
  );
}

function Mini({ ws, board, cardId, c }: { ws: string; board: string; cardId: string; c: MiniCard }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const grade = [
    { nome: "Board", texto: c.board.nome, cor: c.board.cor, tipo: "relation" },
    ...(c.fase ? [{ nome: "Fase atual", texto: c.fase.nome, cor: c.fase.cor, tipo: "select" }] : []),
    ...c.campos.map((f) => ({ ...f, cor: null as string | null })),
  ].slice(0, 4);
  return (
    <article className="rounded border border-line bg-paper p-3" data-mini-card={c.titulo}>
      <div className="flex items-start gap-2">
        <Link href={c.href} className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline" title={c.titulo}>
          {c.titulo}
        </Link>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">{c.relacao}</span>
        <Menu
          rotulo={`Opções de ${c.titulo}`}
          alinhar="end"
          gatilho={(p) => (
            <button type="button" {...p} className="grid size-5 shrink-0 place-items-center rounded text-ink-3 hover:bg-bg hover:text-ink" aria-label={`Opções de ${c.titulo}`}>
              <Ellipsis className="size-4" />
            </button>
          )}
        >
          <Link href={c.href} className={itemMenu}>
            <ExternalLink className="size-3.5" /> Abrir
          </Link>
          <button
            type="button"
            className={itemMenu}
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await desligarAction(ws, board, cardId, c.desligar.campoId, c.id, c.desligar.lado);
                if (r.ok) {
                  toast.success("Desconectado");
                  router.refresh();
                } else toast.error("Não foi possível desconectar", { description: r.motivo });
              })
            }
          >
            <Unlink className="size-3.5" /> Desconectar
          </button>
        </Menu>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
        {grade.map((g) => (
          <div key={g.nome} className="min-w-0">
            <dt className="flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] text-ink-3">
              <IconeTipo tipo={g.tipo} className="size-3.5" />
              <span className="truncate">{g.nome}</span>
            </dt>
            <dd className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs">
              {g.cor && <i className="size-2 shrink-0 rounded-[2px]" style={{ background: g.cor }} aria-hidden />}
              <span className="truncate">{g.texto}</span>
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
