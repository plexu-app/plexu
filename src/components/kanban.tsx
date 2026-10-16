"use client";
// Kanban (docs/design/prompt-redesign-pr2.md, A2/A3). Área em --bg com borda superior e padding-left de
// 24px; fase de 280px com cards de 256px; cabeçalho de 40px com a barra de 3px da cor da fase, nome,
// contador mono, "+" (fases que aceitam criação) e, no hover, configurar e ⋯. Cada fase carrega 15
// cards e o resto rolando (IntersectionObserver); o contador vem de count(*) no servidor.
// Arrastar: cartão com borda --accent, coluna-alvo em --paper, fases bloqueadas por regra tracejadas
// com o motivo; a UI move na hora e o servidor confirma (sem recarregar as colunas).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
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
import { Archive, Clock, Ellipsis, GitFork, History, Link2, MessageSquare, Paperclip, Plus, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { maisCartoesAction, movimentosAction, moverNoKanbanAction } from "@/app/w/[ws]/actions";
import { useNovoCard } from "@/components/board-shell";
import { IconeTipo } from "@/components/icone-tipo";
import type { CartaoKanban } from "@/components/kanban-dados";
import { iniciais } from "@/components/sidebar";
import { itemMenu, Menu } from "@/components/ui/menu";
import type { FiltrosBoard } from "@/lib/filtros";
import { tituloOu } from "@/lib/formatar";
import { hrefCard } from "@/lib/rotas";
import { duracaoCurta } from "@/lib/tempo";
import { cn } from "@/lib/utils";

export type { CartaoKanban };

export interface ColunaKanban {
  id: string;
  nome: string;
  terminal: boolean;
  cor: string;
  /** Cards na fase com os filtros atuais (count(*) no servidor). */
  total: number;
  /** phases.settings.description: aparece quando a fase está vazia. */
  descricao: string | null;
  /** Primeira fase (formulário inicial) ou allow_create. */
  podeCriar: boolean;
}

/** Bloqueio de fase para o cartão em arraste: fase → motivo. */
type Bloqueios = Map<string, string>;

interface EstadoColuna {
  cards: CartaoKanban[];
  total: number;
  carregando: boolean;
}

const juntar = (atual: CartaoKanban[], novos: CartaoKanban[]) => {
  const vistos = new Set(atual.map((c) => c.id));
  return [...atual, ...novos.filter((c) => !vistos.has(c.id))];
};

export function Kanban({
  ws,
  board,
  colunas,
  cards,
  filtros,
  podeConfigurar,
}: {
  ws: string;
  board: string;
  colunas: ColunaKanban[];
  /** Primeira página de cada fase. */
  cards: CartaoKanban[];
  filtros: FiltrosBoard;
  podeConfigurar: boolean;
}) {
  const inicial = useCallback(
    () => new Map(colunas.map((c) => [c.id, { cards: cards.filter((x) => x.phaseId === c.id), total: c.total, carregando: false } satisfies EstadoColuna])),
    [colunas, cards],
  );
  const [estado, setEstado] = useState<Map<string, EstadoColuna>>(inicial);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [bloqueios, setBloqueios] = useState<Bloqueios>(new Map());
  const [pendente, iniciar] = useTransition();
  const abrirNovo = useNovoCard();
  // Nova renderização do servidor (filtros, criação, volta do card): recomeça das primeiras páginas.
  useEffect(() => setEstado(inicial()), [inicial]);

  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const todos = [...estado.values()].flatMap((c) => c.cards);
  const emArraste = todos.find((c) => c.id === arrastando);

  const carregarMais = useCallback(
    async (faseId: string) => {
      const atual = estado.get(faseId);
      if (!atual || atual.carregando || atual.cards.length >= atual.total) return;
      setEstado((m) => new Map(m).set(faseId, { ...atual, carregando: true }));
      try {
        const novos = await maisCartoesAction(ws, board, faseId, atual.cards.length, filtros);
        setEstado((m) => {
          const c = m.get(faseId);
          if (!c) return m;
          const cardsNovos = juntar(c.cards, novos);
          // Página vazia antes do total (cards saíram da fase por outro caminho): para de pedir.
          return new Map(m).set(faseId, { cards: cardsNovos, total: novos.length ? c.total : cardsNovos.length, carregando: false });
        });
      } catch {
        setEstado((m) => new Map(m).set(faseId, { ...atual, carregando: false }));
      }
    },
    [estado, ws, board, filtros],
  );

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
    const card = todos.find((c) => c.id === id);
    if (!card || !destino || destino === card.phaseId || !card.phaseId) return;
    const origem = card.phaseId;
    const anterior = estado;
    const movido = { ...card, phaseId: destino, tempos: { ...card.tempos, fase: 0 } };
    setEstado((m) => {
      const n = new Map(m);
      const o = n.get(origem)!;
      const d = n.get(destino)!;
      n.set(origem, { ...o, cards: o.cards.filter((c) => c.id !== id), total: o.total - 1 });
      n.set(destino, { ...d, cards: [movido, ...d.cards], total: d.total + 1 });
      return n;
    });
    iniciar(async () => {
      const r = await moverNoKanbanAction(ws, board, id, destino);
      if (!r.ok) {
        setEstado(anterior);
        toast.error("Não foi possível mover", { description: r.motivo });
      } else if (r.cartao) {
        const cartao = r.cartao;
        setEstado((m) => {
          const d = m.get(destino);
          return d ? new Map(m).set(destino, { ...d, cards: d.cards.map((c) => (c.id === id ? cartao : c)) }) : m;
        });
      }
    });
  }

  const primeira = colunas[0];
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
      <div className="flex h-full items-start overflow-x-auto border-t border-line bg-bg pl-6" aria-busy={pendente} data-kanban>
        {colunas.map((col, i) => {
          const e = estado.get(col.id) ?? { cards: [], total: col.total, carregando: false };
          return (
            <Coluna
              key={col.id}
              numero={i + 1}
              coluna={col}
              estado={e}
              bloqueio={arrastando && emArraste?.phaseId !== col.id ? bloqueios.get(col.id) : undefined}
              href={(id) => hrefCard(ws, board, id)}
              onNovo={() => abrirNovo(col.id)}
              onMais={() => void carregarMais(col.id)}
              configurar={podeConfigurar ? `/w/${ws}/b/${board}/settings?aba=fases&fase=${col.id}` : null}
            />
          );
        })}
      </div>
      {primeira?.podeCriar && (
        <button
          type="button"
          onClick={() => abrirNovo(primeira.id)}
          className="fixed bottom-6 left-[256px] z-20 inline-flex h-10 items-center gap-2 rounded-full border border-accent bg-accent px-4 text-[13px] font-medium text-accent-ink hover:opacity-90 recolhida:left-20"
        >
          <Plus className="size-4" aria-hidden /> Criar novo cartão
        </button>
      )}
      <DragOverlay>
        {emArraste ? <CartaoVisual card={emArraste} flutuando concluido={colunas.find((c) => c.id === emArraste.phaseId)?.terminal} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Coluna({
  numero,
  coluna,
  estado,
  bloqueio,
  href,
  onNovo,
  onMais,
  configurar,
}: {
  /** Posição da fase (o cabeçalho mostra "01. Nome"). */
  numero: number;
  coluna: ColunaKanban;
  estado: EstadoColuna;
  /** Motivo do bloqueio para o cartão em arraste (regra can_enter, obrigatórios). */
  bloqueio?: string;
  href: (id: string) => string;
  onNovo: () => void;
  onMais: () => void;
  /** Link para configurar a fase (só quem configura o board). */
  configurar: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.id });
  const sentinela = useRef<HTMLLIElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const faltam = estado.cards.length < estado.total;
  // Rolagem infinita dentro da coluna: a sentinela no fim da lista pede a próxima página.
  useEffect(() => {
    const alvo = sentinela.current;
    if (!alvo || !faltam) return;
    const obs = new IntersectionObserver((es) => es.some((x) => x.isIntersecting) && onMais(), { root: lista.current, rootMargin: "200px" });
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [faltam, onMais, estado.cards.length]);

  return (
    <section
      ref={setNodeRef}
      data-fase={coluna.nome}
      data-bloqueada={bloqueio ? "" : undefined}
      aria-label={`Fase ${coluna.nome}`}
      title={bloqueio}
      className={cn(
        "mt-4 flex max-h-[calc(100%-16px)] w-[280px] shrink-0 flex-col rounded transition-colors",
        isOver && !bloqueio && "bg-paper",
        // contorno (não borda): não tira largura dos cards de 256px
        bloqueio && "outline-1 -outline-offset-1 outline-dashed outline-line",
      )}
    >
      <header
        className="group mx-3 flex h-10 shrink-0 items-center gap-2 rounded border border-t-[3px] border-line bg-paper px-3"
        style={{ borderTopColor: coluna.cor }}
        data-cabecalho-fase
      >
        {coluna.terminal && <Archive className="size-3.5 shrink-0 text-ink-3" aria-label="fase final" />}
        <h2 className="min-w-0 flex-1 truncate text-[13.5px] font-semibold" title={coluna.nome}>
          {String(numero).padStart(2, "0")}. {coluna.nome}
        </h2>
        <span className="font-mono text-[11px] text-ink-3" aria-label={`${estado.total} cartões`}>
          {estado.total}
        </span>
        <span className="hidden items-center gap-0.5 group-focus-within:flex group-hover:flex">
          {configurar && (
            <Link href={configurar} className="grid size-5 place-items-center rounded-[3px] text-ink-3 hover:text-ink" aria-label={`Configurar fase ${coluna.nome}`} title="Configurar fase">
              <Settings2 className="size-3.5" />
            </Link>
          )}
          <Menu
            rotulo={`Opções da fase ${coluna.nome}`}
            alinhar="end"
            gatilho={(p) => (
              <button type="button" {...p} className="grid size-5 place-items-center rounded-[3px] text-ink-3 hover:text-ink" aria-label={`Mais opções da fase ${coluna.nome}`}>
                <Ellipsis className="size-3.5" />
              </button>
            )}
          >
            {coluna.podeCriar && (
              <button type="button" className={itemMenu} onClick={onNovo}>
                <Plus className="size-3.5" /> Novo cartão nesta fase
              </button>
            )}
            {configurar && (
              <Link href={configurar} className={itemMenu}>
                <Settings2 className="size-3.5" /> Configurar fase
              </Link>
            )}
            <button
              type="button"
              className={itemMenu}
              onClick={() => void navigator.clipboard?.writeText(`${location.origin}${location.pathname}#fase-${coluna.id}`)}
            >
              <Link2 className="size-3.5" /> Copiar link da fase
            </button>
          </Menu>
        </span>
        {coluna.podeCriar && (
          <button
            type="button"
            onClick={onNovo}
            className="grid size-5 shrink-0 place-items-center rounded-[3px] border border-line text-ink-3 hover:border-accent hover:text-accent"
            aria-label={`Novo cartão em ${coluna.nome}`}
            title={`Novo cartão em ${coluna.nome}`}
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </header>
      {bloqueio && (
        <p className="mx-3 mt-2 text-xs text-ink-3" role="note">
          {bloqueio}
        </p>
      )}
      <ul ref={lista} className="flex min-h-16 flex-1 flex-col overflow-y-auto px-3 pb-20 pt-2" data-lista-fase>
        {estado.cards.map((c) => (
          <li key={c.id} className="mb-2">
            <CartaoArrastavel card={c} href={href(c.id)} concluido={coluna.terminal} />
          </li>
        ))}
        {faltam && (
          <li ref={sentinela} className="py-2 text-center font-mono text-[11px] text-ink-3" data-carregando-fase>
            {estado.carregando ? "carregando…" : `${estado.total - estado.cards.length} a carregar`}
          </li>
        )}
        {estado.total === 0 && (
          <li className="rounded border border-dashed border-line px-3 py-6 text-center text-[12.5px] text-ink-3" data-fase-vazia>
            {coluna.descricao ?? "Nenhum cartão nesta fase."}
          </li>
        )}
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

/** Prazo relativo ao dia de hoje ("vence em 5d"). */
function textoPrazo(p: NonNullable<CartaoKanban["prazo"]>) {
  if (p.atrasado) return `venceu há ${-p.dias}d`;
  if (p.dias === 0) return "vence hoje";
  return p.dias > 0 ? `vence em ${p.dias}d` : p.texto;
}

const CHIP = new Set(["select", "multi_select"]);

function CartaoVisual({ card, href, flutuando, concluido }: { card: CartaoKanban; href?: string; flutuando?: boolean; concluido?: boolean }) {
  const router = useRouter();
  const [verConexoes, setVerConexoes] = useState(true);
  const corpo = (
    <div
      data-card={flutuando ? undefined : card.id}
      className={cn("rounded border border-line bg-paper text-ink", flutuando && "border-accent")}
    >
      <div className="relative pb-3 pl-2 pr-3 pt-3" data-corpo-cartao>
        <div className="line-clamp-4 pr-5 text-sm font-semibold leading-5 tracking-[-0.01em]" data-titulo-cartao>
          {tituloOu(card.title, card.id)}
        </div>
        {card.conexoes.length > 0 && (
          <button
            type="button"
            className="absolute right-3 top-3 grid size-4 place-items-center text-ink-3 hover:text-ink"
            aria-label={verConexoes ? "Esconder conexões" : "Mostrar conexões"}
            aria-pressed={verConexoes}
            title="Conexões"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setVerConexoes((v) => !v);
            }}
          >
            <GitFork className="size-3.5" />
          </button>
        )}
        {card.campos.length > 0 && (
          <dl className="mt-2 flex flex-col gap-2">
            {card.campos.map((f) => (
              <div key={f.nome} className="min-w-0" data-campo-cartao={f.nome}>
                <dt className="flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] text-ink-3">
                  <IconeTipo tipo={f.tipo} className="size-4" />
                  <span className="truncate">{f.nome}</span>
                </dt>
                <dd className="mt-0.5 truncate text-xs">
                  {CHIP.has(f.tipo) ? (
                    <span className="flex flex-wrap gap-1">
                      {f.texto.split(", ").map((t) => (
                        <span key={t} className="rounded-[3px] bg-line-2 px-1.5 py-px text-[11px] text-ink-2">
                          {t}
                        </span>
                      ))}
                    </span>
                  ) : (
                    f.texto
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-semibold text-ink-3" data-rodape-cartao>
          {card.responsavel && (
            <span
              className="grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-on-cor"
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
              <span className={cn(card.prazo.atrasado && "text-err")} title={`Prazo: ${card.prazo.texto}`}>
                {textoPrazo(card.prazo)}
              </span>
            )
          )}
          {card.comentarios > 0 && (
            <span className="flex items-center gap-0.5" title={`${card.comentarios} comentário(s)`}>
              <MessageSquare className="size-3" aria-hidden /> {card.comentarios}
            </span>
          )}
          {card.anexos > 0 && (
            <span className="flex items-center gap-0.5" title={`${card.anexos} anexo(s)`}>
              <Paperclip className="size-3" aria-hidden /> {card.anexos}
            </span>
          )}
          <span className="ml-auto flex items-center gap-2" data-tempos>
            <span className="flex items-center gap-0.5" title="Tempo total no fluxo">
              <History className="size-3" aria-hidden />
              {duracaoCurta(card.tempos.fluxo)}
            </span>
            {card.tempos.fase !== null && (
              <span
                className={cn("flex items-center gap-0.5", card.alerta === "prazo" ? "text-err" : card.alerta === "sla" ? "text-warn" : undefined)}
                title={card.alerta === "prazo" ? "Tempo na fase atual (prazo do card vencido)" : card.alerta === "sla" ? "Tempo na fase atual (passou do SLA da fase)" : "Tempo na fase atual"}
                data-tempo-fase={card.alerta ?? "normal"}
              >
                <Clock className="size-3" aria-hidden />
                {duracaoCurta(card.tempos.fase)}
              </span>
            )}
            <span className="flex items-center gap-0.5" title="Tempo desde a última atualização">
              <RefreshCw className="size-3" aria-hidden />
              {duracaoCurta(card.tempos.atualizacao)}
            </span>
          </span>
        </div>
      </div>
      {card.conexoes.length > 0 && verConexoes && (
        <div className="flex flex-col gap-2 border-t border-line px-3 pb-3 pt-2" data-conexoes-cartao>
          {card.conexoes.map((c) => (
            <div key={c.id} className="min-w-0">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] text-ink-3">
                <Link2 className="size-3" aria-hidden /> {c.board}
              </div>
              <span
                className="mt-1 block max-w-full truncate rounded-[3px] border px-1.5 py-0.5 text-[11.5px] text-ink"
                style={{ background: `color-mix(in srgb, ${c.cor} 12%, transparent)`, borderColor: `color-mix(in srgb, ${c.cor} 35%, transparent)` }}
                title={c.titulo}
              >
                {c.titulo}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  return href ? (
    <Link
      href={href}
      scroll={false}
      prefetch={false}
      onMouseEnter={() => router.prefetch(href)}
      className="block rounded hover:[&>div]:border-ink-3 focus-visible:outline-2 focus-visible:outline-accent"
      draggable={false}
    >
      {corpo}
    </Link>
  ) : (
    corpo
  );
}
