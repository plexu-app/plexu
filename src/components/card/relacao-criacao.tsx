"use client";
// Seletor de relação N:1 no formulário de criação (o card ainda não existe): busca no board alvo e
// guarda os ids escolhidos em inputs ocultos f:<field_id>; o core liga ao criar o card.
import { useCallback, useState } from "react";
import { Search, X } from "lucide-react";
import { buscarRelacionaveisAction } from "@/app/w/[ws]/actions";
import { useBusca } from "@/components/card/seletor-relacao";
import { Input } from "@/components/ui/input";
import { idCurto, tituloOu } from "@/lib/formatar";
import { nomeInput } from "@/lib/form-campos";

interface Item {
  id: string;
  title: string;
}

export function RelacaoNaCriacao({
  ws,
  board,
  campo,
  id,
  obrigatorio,
  aoMudar,
}: {
  ws: string;
  /** Board do card que está sendo criado (a busca usa o alvo da relação configurada nele). */
  board: string;
  campo: { id: string; name: string; config: Record<string, unknown> };
  id: string;
  obrigatorio?: boolean;
  aoMudar: () => void;
}) {
  const [escolhidos, setEscolhidos] = useState<Item[]>([]);
  const [aberto, setAberto] = useState(false);
  const unico = (campo.config.relation as { cardinality?: string } | undefined)?.cardinality === "one" || !!(campo.config.relation as { is_parent?: boolean } | undefined)?.is_parent;
  const chave = escolhidos.map((e) => e.id).join(",");
  const buscar = useCallback((t: string) => buscarRelacionaveisAction(ws, board, campo.id, t, chave ? chave.split(",") : []), [ws, board, campo.id, chave]);
  const { termo, setTermo, itens } = useBusca(buscar, aberto);
  const mudar = (lista: Item[]) => {
    setEscolhidos(lista);
    // Os inputs ocultos mudam depois do render: avisa o formulário no próximo quadro.
    requestAnimationFrame(aoMudar);
  };

  return (
    <div className="flex flex-col gap-2">
      {escolhidos.map((e) => (
        <input key={e.id} type="hidden" name={nomeInput(campo.id)} value={e.id} />
      ))}
      {escolhidos.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {escolhidos.map((e) => (
            <li key={e.id} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm" data-escolhido={tituloOu(e.title, e.id)}>
              {tituloOu(e.title, e.id)} <span className="font-mono text-xs text-muted-foreground">{idCurto(e.id)}</span>
              <button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-muted" aria-label={`Remover ${tituloOu(e.title, e.id)}`} onClick={() => mudar(escolhidos.filter((x) => x.id !== e.id))}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {(!unico || escolhidos.length === 0) && (
        <div className="relative">
          <div className="flex items-center gap-2">
            <Search className="size-4 text-muted-foreground" />
            <Input
              id={id}
              aria-label={campo.name}
              aria-required={obrigatorio || undefined}
              placeholder="Buscar por título ou id…"
              value={termo}
              onFocus={() => setAberto(true)}
              onBlur={() => setTimeout(() => setAberto(false), 150)}
              onChange={(e) => setTermo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            />
          </div>
          {aberto && (
            <ul role="listbox" aria-label={`Opções de ${campo.name}`} className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-background shadow-lg">
              {itens.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Nada encontrado</li>}
              {itens.map((i) => (
                <li key={i.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      mudar(unico ? [i] : [...escolhidos, i]);
                      setTermo("");
                      setAberto(false);
                    }}
                  >
                    <span>{tituloOu(i.title, i.id)}</span>
                    <span className="font-mono text-xs text-muted-foreground">{idCurto(i.id)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
