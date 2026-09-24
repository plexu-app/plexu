"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { buscarRelacionaveisAction, desligarAction, ligarAction } from "@/app/w/[ws]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/misc";
import { idCurto, tituloOu } from "@/lib/formatar";

interface Item {
  id: string;
  title: string;
}

/** Busca com espera curta entre teclas, para não chamar o servidor a cada caractere. */
export function useBusca(buscar: (termo: string) => Promise<Item[]>, ativo: boolean) {
  const [termo, setTermo] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    const t = setTimeout(async () => {
      const r = await buscar(termo);
      if (vivo) setItens(r);
    }, 200);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [termo, ativo, buscar]);
  return { termo, setTermo, itens };
}

/** Busca e liga cards de outro board a um campo de relação (card da página é a origem). */
export function BuscaRelacao({
  ws,
  board,
  cardId,
  fieldId,
  excluir,
  rotulo,
}: {
  ws: string;
  board: string;
  cardId: string;
  fieldId: string;
  excluir: string[];
  rotulo: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const chave = excluir.join(",");
  const buscar = useCallback(
    (t: string) => buscarRelacionaveisAction(ws, board, fieldId, t, chave ? chave.split(",") : []),
    [ws, board, fieldId, chave],
  );
  const { termo, setTermo, itens } = useBusca(buscar, aberto);
  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <Search className="size-4 text-muted-foreground" />
        <Input
          aria-label={rotulo}
          placeholder="Buscar por título ou id…"
          value={termo}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          onChange={(e) => setTermo(e.target.value)}
        />
      </div>
      {aberto && (
        <ul role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-background shadow-lg">
          {itens.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Nada encontrado</li>}
          {itens.map((i) => (
            <li key={i.id} role="option" aria-selected={false}>
              <button
                type="button"
                disabled={pendente}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  iniciar(async () => {
                    const r = await ligarAction(ws, board, cardId, fieldId, i.id);
                    if (r.ok) {
                      setTermo("");
                      setAberto(false);
                      router.refresh();
                    } else toast.error("Não foi possível ligar", { description: r.motivo });
                  })
                }
              >
                <span>{tituloOu(i.title, i.id)}</span>
                <span className="font-mono text-xs text-muted-foreground">{idCurto(i.id)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SeletorRelacao({
  ws,
  board,
  cardId,
  campo,
  boardAlvo,
  ligados,
  editavel,
}: {
  ws: string;
  board: string;
  cardId: string;
  campo: { id: string; name: string; unico: boolean };
  boardAlvo: { slug: string; name: string };
  ligados: Item[];
  editavel: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <Card data-relacao={campo.name}>
      <CardHeader>
        <CardTitle>
          {campo.name} <span className="font-normal text-muted-foreground">· {boardAlvo.name}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {ligados.length === 0 && <p className="text-sm text-muted-foreground">Nenhum card ligado.</p>}
        <ul className="flex flex-wrap gap-2">
          {ligados.map((c) => (
            <li key={c.id} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
              <Link href={`/w/${ws}/b/${boardAlvo.slug}/c/${c.id}`} className="hover:underline">
                {tituloOu(c.title, c.id)}
              </Link>
              <span className="font-mono text-xs text-muted-foreground">{idCurto(c.id)}</span>
              {editavel && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  aria-label={`Desligar ${c.title}`}
                  disabled={pendente}
                  onClick={() =>
                    iniciar(async () => {
                      const r = await desligarAction(ws, board, cardId, campo.id, c.id, "origem");
                      if (r.ok) router.refresh();
                      else toast.error("Não foi possível desligar", { description: r.motivo });
                    })
                  }
                >
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {editavel && (!campo.unico || ligados.length === 0) && (
          <BuscaRelacao ws={ws} board={board} cardId={cardId} fieldId={campo.id} excluir={ligados.map((c) => c.id)} rotulo={`Ligar ${campo.name}`} />
        )}
      </CardContent>
    </Card>
  );
}
