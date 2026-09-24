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
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { criarCardAction, moverCardAction } from "@/app/w/[ws]/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { idCurto, tituloOu } from "@/lib/formatar";
import { moverLocal, type CardKanban } from "@/lib/kanban";
import { cn } from "@/lib/utils";

export type { CardKanban };

export interface ColunaKanban {
  id: string | null;
  nome: string;
  terminal: boolean;
}

export function Kanban({ ws, board, colunas, cards }: { ws: string; board: string; colunas: ColunaKanban[]; cards: CardKanban[] }) {
  const router = useRouter();
  const [lista, setLista] = useState(cards);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  useEffect(() => setLista(cards), [cards]);

  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const podeArrastar = colunas.length > 1 || colunas[0]?.id !== null;

  function aoSoltar(e: DragEndEvent) {
    setArrastando(null);
    const id = String(e.active.id);
    const destino = e.over ? String(e.over.id) : null;
    const card = lista.find((c) => c.id === id);
    if (!card || !destino || destino === card.phaseId) return;
    const anterior = lista;
    setLista(moverLocal(lista, id, destino));
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
    <DndContext sensors={sensores} onDragStart={(e) => setArrastando(String(e.active.id))} onDragEnd={aoSoltar} onDragCancel={() => setArrastando(null)}>
      <div className="flex h-full gap-3 overflow-x-auto p-4" aria-busy={pendente}>
        {colunas.map((col, i) => (
          <Coluna
            key={col.id ?? "unica"}
            coluna={col}
            cards={lista.filter((c) => c.phaseId === col.id)}
            href={(id) => `/w/${ws}/b/${board}/c/${id}`}
            arrastavel={podeArrastar}
            onNovo={
              i === 0 || col.id === null
                ? () =>
                    iniciar(async () => {
                      const r = await criarCardAction(ws, board, col.id);
                      if (r && !r.ok) toast.error("Não foi possível criar", { description: r.motivo });
                    })
                : undefined
            }
          />
        ))}
      </div>
      <DragOverlay>{emArraste ? <CartaoVisual card={emArraste} flutuando /> : null}</DragOverlay>
    </DndContext>
  );
}

function Coluna({
  coluna,
  cards,
  href,
  arrastavel,
  onNovo,
}: {
  coluna: ColunaKanban;
  cards: CardKanban[];
  href: (id: string) => string;
  arrastavel: boolean;
  onNovo?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.id ?? "__sem_fase", disabled: coluna.id === null });
  return (
    <section
      ref={setNodeRef}
      data-fase={coluna.nome}
      aria-label={`Fase ${coluna.nome}`}
      className={cn("flex w-72 shrink-0 flex-col rounded-lg bg-muted/70", isOver && "ring-2 ring-primary/50")}
    >
      <header className="flex items-center justify-between px-3 py-2">
        <h2 className="text-sm font-semibold">
          {coluna.nome}
          {coluna.terminal && (
            <Badge variant="outline" className="ml-2">
              final
            </Badge>
          )}
        </h2>
        <span className="text-xs text-muted-foreground">{cards.length}</span>
      </header>
      <ul className="flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {cards.map((c) => (
          <li key={c.id}>{arrastavel ? <CartaoArrastavel card={c} href={href(c.id)} /> : <CartaoVisual card={c} href={href(c.id)} />}</li>
        ))}
      </ul>
      {onNovo && (
        <div className="p-2 pt-0">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onNovo}>
            <Plus /> Novo card
          </Button>
        </div>
      )}
    </section>
  );
}

function CartaoArrastavel({ card, href }: { card: CardKanban; href: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("touch-none", isDragging && "opacity-40")}>
      <CartaoVisual card={card} href={href} />
    </div>
  );
}

function CartaoVisual({ card, href, flutuando }: { card: CardKanban; href?: string; flutuando?: boolean }) {
  const corpo = (
    <div data-card={card.id} className={cn("rounded-md border bg-background p-2.5 text-sm shadow-xs", flutuando && "rotate-1 shadow-lg")}>
      <div className="font-medium">{tituloOu(card.title, card.id)}</div>
      <div className="mt-1 font-mono text-[11px] text-muted-foreground">{idCurto(card.id)}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:[&>div]:border-primary/50" draggable={false}>
      {corpo}
    </Link>
  ) : (
    corpo
  );
}
