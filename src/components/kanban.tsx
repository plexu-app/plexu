"use client";
// Kanban (docs/design/plexu-mockups.html, tela 01): colunas de 300px sem borda, cabeçalho numerado com a
// cor da fase na borda superior, contador mono e "+"; cartão em --paper com etiqueta, título, grade
// rótulo/valor e rodapé (responsável, prazo relativo, tempo na fase). Ao arrastar: cartão com borda
// --accent, coluna alvo em --paper e fases bloqueadas por regra em tracejado, com o motivo no tooltip.
// Sem sombra, rotação ou escala.
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
import { Check, Clock, Plus } from "lucide-react";
import { toast } from "sonner";
import { movimentosAction, moverCardAction } from "@/app/w/[ws]/actions";
import { useBuscaBoard, useNovoCard } from "@/components/board-shell";
import type { CartaoKanban } from "@/components/kanban-dados";
import { iniciais } from "@/components/sidebar";
import { tituloOu } from "@/lib/formatar";
import { cn } from "@/lib/utils";

export type { CartaoKanban };

export interface ColunaKanban {
  id: string;
  nome: string;
  terminal: boolean;
  cor: string;
}

/** Bloqueio de fase para o cartão em arraste: fase → motivo. */
type Bloqueios = Map<string, string>;

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Busca do cabeçalho: todas as palavras no título ou nos campos do cartão. */
function casaBusca(c: CartaoKanban, busca: string) {
  const palavras = semAcento(busca).split(/\s+/).filter(Boolean);
  if (!palavras.length) return true;
  const texto = semAcento([c.title, ...c.campos.map((f) => f.texto), c.responsavel ?? ""].join(" "));
  return palavras.every((p) => texto.includes(p));
}

export function Kanban({ ws, board, colunas, cards }: { ws: string; board: string; colunas: ColunaKanban[]; cards: CartaoKanban[] }) {
  const router = useRouter();
  const [lista, setLista] = useState(cards);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [bloqueios, setBloqueios] = useState<Bloqueios>(new Map());
  const [pendente, iniciar] = useTransition();
  const abrirNovo = useNovoCard();
  const busca = useBuscaBoard();
  useEffect(() => setLista(cards), [cards]);

  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  async function aoIniciar(id: string) {
    setArrastando(id);
    setBloqueios(new Map());
    const movs = await movimentosAction(ws, board, id);
    setBloqueios(new Map(movs.filter((m) => !m.permitido).map((m) => [m.faseId, m.motivo ?? "Movimento bloqueado por regra"])));
  }

  function aoSoltar(e: DragEndEvent) {
    setArrastando(null);
    setBloqueios(new Map());
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
  const visiveis = lista.filter((c) => casaBusca(c, busca));
  return (
    <DndContext
      id={`kanban-${board}`}
      sensors={sensores}
      onDragStart={(e) => void aoIniciar(String(e.active.id))}
      onDragEnd={aoSoltar}
      onDragCancel={() => {
        setArrastando(null);
        setBloqueios(new Map());
      }}
    >
      <div className="flex h-full items-start gap-3 overflow-x-auto px-5 py-4" aria-busy={pendente}>
        {colunas.map((col, i) => (
          <Coluna
            key={col.id}
            numero={i + 1}
            coluna={col}
            cards={visiveis.filter((c) => c.phaseId === col.id)}
            total={lista.filter((c) => c.phaseId === col.id).length}
            bloqueio={arrastando && emArraste?.phaseId !== col.id ? bloqueios.get(col.id) : undefined}
            href={(id) => `/w/${ws}/b/${board}/c/${id}`}
            onNovo={() => abrirNovo(col.id)}
          />
        ))}
      </div>
      <DragOverlay>{emArraste ? <CartaoVisual card={emArraste} flutuando /> : null}</DragOverlay>
    </DndContext>
  );
}

function Coluna({
  numero,
  coluna,
  cards,
  total,
  bloqueio,
  href,
  onNovo,
}: {
  /** Posição da fase (o cabeçalho mostra "01. Nome"). */
  numero: number;
  coluna: ColunaKanban;
  cards: CartaoKanban[];
  total: number;
  /** Motivo do bloqueio para o cartão em arraste (regra can_enter, obrigatórios). */
  bloqueio?: string;
  href: (id: string) => string;
  onNovo: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.id });
  return (
    <section
      ref={setNodeRef}
      data-fase={coluna.nome}
      data-bloqueada={bloqueio ? "" : undefined}
      aria-label={`Fase ${coluna.nome}`}
      title={bloqueio}
      className={cn(
        "flex max-h-full w-[300px] shrink-0 flex-col gap-2 rounded border border-transparent transition-colors",
        isOver && !bloqueio && "bg-paper",
        bloqueio && "border-dashed border-line",
      )}
    >
      <header
        className="flex items-center gap-2 rounded border border-t-[3px] border-line bg-paper px-2.5 py-2"
        style={{ borderTopColor: coluna.cor }}
      >
        <h2 className="min-w-0 truncate text-[13.5px] font-semibold">
          {String(numero).padStart(2, "0")}. {coluna.nome}
        </h2>
        <span className="ml-auto font-mono text-[11px] text-ink-3" aria-label={`${total} cartões`}>
          {total}
        </span>
        {coluna.terminal && <Check className="size-3.5 text-ink-3" aria-label="fase final" />}
        <button
          type="button"
          onClick={onNovo}
          className="grid size-5 place-items-center rounded-[3px] border border-line text-ink-3 hover:border-accent hover:text-accent"
          aria-label={`Novo cartão em ${coluna.nome}`}
          title={`Novo cartão em ${coluna.nome}`}
        >
          <Plus className="size-3.5" />
        </button>
      </header>
      {bloqueio && (
        <p className="px-2.5 text-xs text-ink-3" role="note">
          {bloqueio}
        </p>
      )}
      <ul className="flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto">
        {cards.map((c) => (
          <li key={c.id}>
            <CartaoArrastavel card={c} href={href(c.id)} concluido={coluna.terminal} />
          </li>
        ))}
        {total === 0 && <li className="rounded border border-dashed border-line px-3 py-4 text-center text-[12.5px] text-ink-3">Nenhum cartão nesta fase.</li>}
      </ul>
    </section>
  );
}

function CartaoArrastavel({ card, href, concluido }: { card: CartaoKanban; href: string; concluido: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("touch-none", isDragging && "opacity-40")}>
      <CartaoVisual card={card} href={href} concluido={concluido} />
    </div>
  );
}

/** Cor estável do avatar (uma das cores de fase), pelo nome. */
const corAvatar = (nome: string) => `var(--f${([...nome].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 5) + 1})`;

/** Prazo relativo ao dia de hoje, como no mockup ("vence em 5d"). */
function textoPrazo(p: NonNullable<CartaoKanban["prazo"]>) {
  if (p.atrasado) return `venceu há ${-p.dias}d`;
  if (p.dias === 0) return "vence hoje";
  return p.dias > 0 ? `vence em ${p.dias}d` : p.texto;
}

function CartaoVisual({ card, href, flutuando, concluido }: { card: CartaoKanban; href?: string; flutuando?: boolean; concluido?: boolean }) {
  const etiquetas = card.campos.filter((f) => f.tipo === "select" || f.tipo === "multi_select");
  const grade = card.campos.filter((f) => !etiquetas.includes(f));
  const corpo = (
    <div
      data-card={flutuando ? undefined : card.id}
      className={cn("flex flex-col gap-2 rounded border border-line bg-paper px-3 pb-2 pt-2.5 text-ink", flutuando && "border-accent")}
    >
      {etiquetas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {etiquetas.flatMap((f) =>
            f.texto.split(", ").map((t) => (
              <span key={`${f.nome}:${t}`} title={f.nome} className="rounded-[3px] bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-accent">
                {t}
              </span>
            )),
          )}
        </div>
      )}
      <div className="text-sm font-semibold leading-[1.3] tracking-[-0.01em]">{tituloOu(card.title, card.id)}</div>
      {grade.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {grade.map((f) => (
            <div key={f.nome} className="min-w-0">
              <dt className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">{f.nome}</dt>
              <dd className="truncate text-[13px]">{f.texto}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex items-center gap-2.5 border-t border-line-2 pt-2 text-xs text-ink-3">
        {card.responsavel && (
          <span
            className="grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-on-cor"
            style={{ background: corAvatar(card.responsavel) }}
            title={`Responsável: ${card.responsavel}`}
            aria-label={`Responsável: ${card.responsavel}`}
          >
            {iniciais(card.responsavel)}
          </span>
        )}
        {concluido ? (
          <span>concluído</span>
        ) : (
          card.prazo && (
            <span className={cn(card.prazo.atrasado && "font-semibold text-err")} title={`Prazo: ${card.prazo.texto}`}>
              {textoPrazo(card.prazo)}
            </span>
          )
        )}
        {card.naFase !== null && !concluido && (
          <span className="ml-auto flex items-center gap-1" title="Tempo nesta fase">
            <Clock className="size-3" aria-hidden />
            {card.naFase === 0 ? "entrou hoje" : `${card.naFase}d na fase`}
          </span>
        )}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} scroll={false} className="block rounded hover:[&>div]:border-ink-3 focus-visible:outline-2 focus-visible:outline-accent" draggable={false}>
      {corpo}
    </Link>
  ) : (
    corpo
  );
}
