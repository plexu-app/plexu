"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CalendarClock, Plus } from "lucide-react";
import { toast } from "sonner";
import { moverCardAction } from "@/app/w/[ws]/actions";
import { useNovoCard } from "@/components/board-shell";
import type { CartaoKanban } from "@/components/kanban-dados";
import { iniciais } from "@/components/sidebar";
import { idCurto, tituloOu } from "@/lib/formatar";
import { cn } from "@/lib/utils";

export type { CartaoKanban };

export interface ColunaKanban {
  id: string;
  nome: string;
  terminal: boolean;
  cor: string;
}

export function Kanban({ ws, board, colunas, cards }: { ws: string; board: string; colunas: ColunaKanban[]; cards: CartaoKanban[] }) {
  const router = useRouter();
  const [lista, setLista] = useState(cards);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const abrirNovo = useNovoCard();
  useEffect(() => setLista(cards), [cards]);

  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  function aoSoltar(e: DragEndEvent) {
    setArrastando(null);
    const id = String(e.active.id);
    const destino = e.over ? String(e.over.id) : null;
    const card = lista.find((c) => c.id === id);
    if (!card || !destino || destino === card.phaseId) return;
    const anterior = lista;
    setLista(lista.map((c) => (c.id === id ? { ...c, phaseId: destino } : c)));
    iniciar(async () => {
      const r = await moverCardAction(ws, board, id, destino);
      if (!r.ok) {
        setLista(anterior);
        toast.error("Não foi possível mover", { description: r.motivo });
      } else {
        router.refresh();
      }
    });
  }

  const emArraste = lista.find((c) => c.id === arrastando);
  return (
    <DndContext
      id={`kanban-${board}`}
      sensors={sensores}
      onDragStart={(e) => setArrastando(String(e.active.id))}
      onDragEnd={aoSoltar}
      onDragCancel={() => setArrastando(null)}
    >
      <div className="flex h-full items-start gap-3 overflow-x-auto p-4" aria-busy={pendente}>
        {colunas.map((col) => (
          <Coluna
            key={col.id}
            coluna={col}
            cards={lista.filter((c) => c.phaseId === col.id)}
            href={(id) => `/w/${ws}/b/${board}/c/${id}`}
            onNovo={() => abrirNovo(col.id)}
          />
        ))}
      </div>
      <DragOverlay>{emArraste ? <CartaoVisual card={emArraste} flutuando /> : null}</DragOverlay>
    </DndContext>
  );
}

function Coluna({ coluna, cards, href, onNovo }: { coluna: ColunaKanban; cards: CartaoKanban[]; href: (id: string) => string; onNovo: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.id });
  return (
    <section
      ref={setNodeRef}
      data-fase={coluna.nome}
      aria-label={`Fase ${coluna.nome}`}
      className={cn("flex max-h-full w-[300px] shrink-0 flex-col rounded-lg bg-muted", isOver && "ring-2 ring-primary/50")}
    >
      <header className="flex items-center gap-2 rounded-t-lg border-t-[3px] px-3 py-2" style={{ borderTopColor: coluna.cor }}>
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: coluna.cor }} aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{coluna.nome}</h2>
        {coluna.terminal && <span className="rounded border bg-background px-1 text-xs text-muted-foreground">final</span>}
        <span className="min-w-6 rounded-full bg-background px-1.5 text-center text-xs font-medium text-muted-foreground" aria-label={`${cards.length} cards`}>
          {cards.length}
        </span>
        <button
          type="button"
          onClick={onNovo}
          className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
          aria-label={`Novo card em ${coluna.nome}`}
          title={`Novo card em ${coluna.nome}`}
        >
          <Plus className="size-4" />
        </button>
      </header>
      <ul className="flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {cards.map((c) => (
          <li key={c.id}>
            <CartaoArrastavel card={c} href={href(c.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CartaoArrastavel({ card, href }: { card: CartaoKanban; href: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("touch-none", isDragging && "opacity-40")}>
      <CartaoVisual card={card} href={href} />
    </div>
  );
}

function CartaoVisual({ card, href, flutuando }: { card: CartaoKanban; href?: string; flutuando?: boolean }) {
  const corpo = (
    <div
      data-card={flutuando ? undefined : card.id}
      className={cn("flex flex-col gap-1.5 rounded-md border bg-background px-3 py-2 text-sm shadow-xs", flutuando && "rotate-1 shadow-lg")}
    >
      <div className="font-medium leading-snug">{tituloOu(card.title, card.id)}</div>
      {card.campos.length > 0 && (
        <dl className="flex flex-col gap-0.5 text-xs">
          {card.campos.map((f) => (
            <div key={f.nome} className="flex gap-1.5">
              <dt className="shrink-0 text-muted-foreground">{f.nome}:</dt>
              <dd className="truncate">{f.texto}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex items-center gap-2 pt-0.5">
        <span className="font-mono text-xs text-muted-foreground">{idCurto(card.id)}</span>
        {card.prazo && (
          <span
            className={cn("inline-flex items-center gap-1 rounded px-1 text-xs", card.prazo.atrasado ? "bg-destructive/10 font-medium text-destructive-strong" : "text-muted-foreground")}
            title={card.prazo.atrasado ? "Prazo vencido" : "Prazo"}
          >
            <CalendarClock className="size-3" aria-hidden />
            {card.prazo.texto}
          </span>
        )}
        {card.responsavel && (
          <span
            className="ml-auto flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary-strong"
            title={`Responsável: ${card.responsavel}`}
            aria-label={`Responsável: ${card.responsavel}`}
          >
            {iniciais(card.responsavel)}
          </span>
        )}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} scroll={false} className="block hover:[&>div]:border-primary/50" draggable={false}>
      {corpo}
    </Link>
  ) : (
    corpo
  );
}
