"use client";
// Card aberto (docs/design/prompt-redesign-pr2.md, B1/B2): modal centrado (margem de 8px, até 1440px,
// raio 12px) sobre o board, ou a página do card quando o link é aberto direto. Três colunas: esquerda
// (564px, rolagem própria: título, abas em pill, conexões e histórico), centro (564px, rolagem própria:
// fase atual) e direita (276px, fixa: mover, responsável, prazo, ações). Fechar = X, Esc ou clique no véu.
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import * as D from "@radix-ui/react-dialog";
import { Copy, Ellipsis, Link2, Printer, Trash, X } from "lucide-react";
import { toast } from "sonner";
import { duplicarCardAction, excluirCardAction, salvarCamposAction } from "@/app/w/[ws]/actions";
import { itemMenu, Menu } from "@/components/ui/menu";
import { nomeInput } from "@/lib/form-campos";
import { hrefCard } from "@/lib/rotas";
import { cn } from "@/lib/utils";

export type AbaCard = "formulario" | "atividades" | "anexos" | "comentarios" | "email";
const ABAS: { id: AbaCard; rotulo: string }[] = [
  { id: "formulario", rotulo: "Formulário" },
  { id: "atividades", rotulo: "Atividades" },
  { id: "anexos", rotulo: "Anexos" },
  { id: "comentarios", rotulo: "Comentários" },
  { id: "email", rotulo: "E-mail" },
];

export function CardAberto({
  modo,
  ws,
  board,
  cardId,
  voltarPara,
  titulo,
  tituloEditavel,
  esquerda,
  contagens,
  centro,
  direita,
}: {
  modo: "modal" | "pagina";
  ws: string;
  board: string;
  cardId: string;
  /** Board do card: para onde a página direta volta ao fechar. */
  voltarPara: string;
  titulo: string;
  /** Campo de título editável (texto): edição inline no título. */
  tituloEditavel: { campoId: string; valor: string } | null;
  esquerda: Record<AbaCard, React.ReactNode>;
  contagens: Partial<Record<AbaCard, number>>;
  centro: React.ReactNode;
  direita: React.ReactNode;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const [aba, setAba] = useState<AbaCard>("formulario");
  const fechar = () => (modo === "modal" ? router.back() : router.push(voltarPara, { scroll: false }));
  // Modal (slot @modal): navegar para fora do card (link da sidebar, do board…) mantém o slot montado;
  // sem a URL do card, o modal some.
  if (modo === "modal" && !caminho.endsWith(`/c/${cardId}`)) return null;

  const corpo = (
    <>
      <AcoesTopo ws={ws} board={board} cardId={cardId} aoExcluir={fechar} fechar={fechar} />
      <div
        className="grid h-full min-h-0 grid-cols-[minmax(0,564px)_minmax(0,564px)_276px] pl-8 max-[1099px]:grid-cols-1 max-[1099px]:overflow-y-auto max-[1099px]:pl-4"
        data-testid="colunas-card"
      >
        <section aria-label="Card" data-testid="coluna-esquerda" className="min-h-0 overflow-y-auto py-6 pr-6 max-[1099px]:overflow-visible">
          <Titulo modo={modo} ws={ws} board={board} cardId={cardId} titulo={titulo} editavel={tituloEditavel} />
          <nav role="tablist" aria-label="Seções do card" className="mt-4 flex flex-wrap gap-2" data-abas-card>
            {ABAS.map((a) => (
              <button
                key={a.id}
                role="tab"
                type="button"
                aria-selected={aba === a.id}
                onClick={() => setAba(a.id)}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-full px-2 py-1 text-[12.5px] leading-none text-ink-2 hover:text-ink",
                  aba === a.id && "bg-bg font-medium text-ink",
                )}
                data-aba-card={a.rotulo}
              >
                {a.rotulo}
                {!!contagens[a.id] && <span className="font-mono text-[10px] text-ink-3">{contagens[a.id]}</span>}
              </button>
            ))}
          </nav>
          {ABAS.map((a) => (
            <div key={a.id} role="tabpanel" aria-label={a.rotulo} hidden={aba !== a.id} className="mt-5">
              {esquerda[a.id]}
            </div>
          ))}
        </section>
        <section aria-label="Fase atual" data-testid="coluna-atual" className="min-h-0 overflow-y-auto border-l border-line p-6 max-[1099px]:overflow-visible">
          {centro}
        </section>
        <aside aria-label="Ações do card" data-testid="coluna-lateral" className="flex min-h-0 flex-col gap-6 border-l border-line px-5 pb-6 pt-16">
          {direita}
        </aside>
      </div>
    </>
  );

  if (modo === "pagina")
    return (
      <div className="relative mx-auto my-2 h-[calc(100vh-16px)] w-[calc(100%-16px)] max-w-[1440px] overflow-hidden rounded-xl border border-line bg-paper text-ink" data-testid="painel-card" data-modo="pagina">
        {corpo}
      </div>
    );
  return (
    <D.Root open onOpenChange={(v) => !v && fechar()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-veu" data-veu-card />
        <D.Content
          aria-describedby={undefined}
          data-testid="painel-card"
          data-modo="modal"
          className="fixed inset-2 z-50 mx-auto max-w-[1440px] overflow-hidden rounded-xl bg-paper text-ink outline-none"
        >
          {corpo}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Título 20px/700; editável no lugar quando o campo de título é texto e pode ser editado. */
function Titulo({
  modo,
  ws,
  board,
  cardId,
  titulo,
  editavel,
}: {
  modo: "modal" | "pagina";
  ws: string;
  board: string;
  cardId: string;
  titulo: string;
  editavel: { campoId: string; valor: string } | null;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const campo = useRef<HTMLInputElement>(null);
  const Tag = modo === "modal" ? D.Title : "h1";
  const salvar = (valor: string) => {
    setEditando(false);
    if (!editavel || valor.trim() === editavel.valor.trim()) return;
    const fd = new FormData();
    fd.append("campos", editavel.campoId);
    fd.append(nomeInput(editavel.campoId), valor.trim());
    iniciar(async () => {
      const r = await salvarCamposAction(ws, board, cardId, fd);
      if (r.ok) router.refresh();
      else toast.error("Não foi possível salvar o título", { description: r.motivo });
    });
  };
  if (editando && editavel)
    return (
      <input
        ref={campo}
        autoFocus
        defaultValue={editavel.valor}
        aria-label="Título do card"
        className="w-full rounded border border-accent bg-paper px-2 py-0.5 text-xl font-bold tracking-[-0.02em] outline-none"
        onBlur={(e) => salvar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") salvar(e.currentTarget.value);
          if (e.key === "Escape") {
            e.stopPropagation();
            setEditando(false);
          }
        }}
      />
    );
  return (
    <Tag
      className={cn("break-words pr-2 text-xl font-bold leading-7 tracking-[-0.02em]", editavel && "cursor-text rounded hover:bg-bg", pendente && "opacity-60")}
      data-testid="titulo-card"
      onClick={editavel ? () => setEditando(true) : undefined}
      title={editavel ? "Clique para editar o título" : undefined}
    >
      {titulo}
    </Tag>
  );
}

/** Ações no topo direito: ⋯ (copiar link, duplicar, imprimir, excluir) e fechar; botões redondos de 32px. */
function AcoesTopo({ ws, board, cardId, aoExcluir, fechar }: { ws: string; board: string; cardId: string; aoExcluir: () => void; fechar: () => void }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const redondo = "grid size-8 place-items-center rounded-full border border-line bg-paper text-ink-2 hover:bg-bg hover:text-ink";
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}${hrefCard(ws, cardId)}`);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar o link");
    }
  };
  return (
    <div className="absolute right-4 top-4 z-10 flex gap-2" data-acoes-topo>
      <Menu
        rotulo="Mais ações do card"
        alinhar="end"
        gatilho={(p) => (
          <button type="button" {...p} className={redondo} aria-label="Mais ações do card">
            <Ellipsis className="size-4" />
          </button>
        )}
      >
        <button type="button" className={itemMenu} onClick={copiar}>
          <Link2 className="size-3.5" /> Copiar link
        </button>
        <button
          type="button"
          className={itemMenu}
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await duplicarCardAction(ws, cardId);
              if (r.ok) {
                toast.success("Card duplicado");
                router.push(hrefCard(ws, r.id), { scroll: false });
              } else toast.error("Não foi possível duplicar", { description: r.motivo });
            })
          }
        >
          <Copy className="size-3.5" /> Duplicar
        </button>
        <button type="button" className={itemMenu} onClick={() => window.print()}>
          <Printer className="size-3.5" /> Imprimir
        </button>
        <button
          type="button"
          className={cn(itemMenu, "text-err hover:text-err")}
          disabled={pendente}
          onClick={() => {
            if (!window.confirm("Excluir este card?")) return;
            iniciar(async () => {
              const r = await excluirCardAction(ws, board, cardId);
              if (r.ok) {
                toast.success("Card excluído");
                aoExcluir();
              } else toast.error("Não foi possível excluir", { description: r.motivo });
            });
          }}
        >
          <Trash className="size-3.5" /> Excluir
        </button>
      </Menu>
      <button type="button" className={redondo} aria-label="Fechar" onClick={fechar}>
        <X className="size-4" />
      </button>
    </div>
  );
}

/** "Compartilhar" do cabeçalho da fase atual: copia o link do card. */
export function Compartilhar({ ws, cardId }: { ws: string; cardId: string }) {
  return (
    <button
      type="button"
      className="ml-auto inline-flex h-8 items-center gap-1.5 rounded border border-line px-2.5 text-[13px] text-ink-2 hover:bg-bg hover:text-ink"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${location.origin}${hrefCard(ws, cardId)}`);
          toast.success("Link copiado");
        } catch {
          toast.error("Não foi possível copiar o link");
        }
      }}
    >
      <Link2 className="size-3.5" /> Compartilhar
    </button>
  );
}
