"use client";
// Histórico por fase (prompt PR 2, B2): "Formulário inicial" (com quem criou e quando) e uma seção por
// fase já percorrida, na ordem. Campos vazios ficam escondidos, com "mostrar campos vazios" no fim.
import { useState } from "react";
import { CampoAnterior } from "@/components/card/campo-anterior";

export interface ItemHistorico {
  campo: { id: string; name: string; type: string; config: Record<string, unknown> };
  valor: unknown;
  texto: string;
  editavel: boolean;
  links?: { href: string; texto: string }[];
}

export interface SecaoHistorico {
  id: string;
  titulo: string;
  /** Linha abaixo do título (ex.: "Criado por Ana · há 3 dias"). */
  detalhe?: string;
  cor: string | null;
  itens: ItemHistorico[];
}

export function HistoricoFases({ ws, board, cardId, secoes, pessoas }: { ws: string; board: string; cardId: string; secoes: SecaoHistorico[]; pessoas: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-6" data-historico-fases>
      {secoes.map((s) => (
        <Secao key={s.id} ws={ws} board={board} cardId={cardId} s={s} pessoas={pessoas} />
      ))}
    </div>
  );
}

function Secao({ ws, board, cardId, s, pessoas }: { ws: string; board: string; cardId: string; s: SecaoHistorico; pessoas: Record<string, string> }) {
  const [vazios, setVazios] = useState(false);
  const preenchidos = s.itens.filter((i) => i.texto !== "" || i.links?.length);
  const qtdVazios = s.itens.length - preenchidos.length;
  const mostrados = vazios ? s.itens : preenchidos;
  return (
    <section aria-label={s.titulo} data-fase-anterior={s.titulo}>
      <header className="mb-3 border-b border-line-2 pb-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold">
          {s.cor && <i className="size-2 shrink-0 rounded-[2px]" style={{ background: s.cor }} aria-hidden />}
          {s.titulo}
        </h3>
        {s.detalhe && <p className="mt-0.5 text-xs text-ink-3">{s.detalhe}</p>}
      </header>
      {mostrados.length > 0 ? (
        <dl className="flex flex-col gap-3">
          {mostrados.map((x) => (
            <CampoAnterior
              key={x.campo.id}
              ws={ws}
              board={board}
              cardId={cardId}
              campo={x.campo}
              valor={x.valor}
              texto={x.texto}
              editavel={x.editavel}
              pessoas={pessoas}
              links={x.links}
            />
          ))}
        </dl>
      ) : (
        !qtdVazios && <p className="text-xs text-ink-3">Os campos desta fase estão em Fase atual.</p>
      )}
      {qtdVazios > 0 && (
        <button type="button" className="mt-3 text-xs text-accent hover:underline" onClick={() => setVazios((v) => !v)}>
          {vazios ? "esconder campos vazios" : `mostrar campos vazios (${qtdVazios})`}
        </button>
      )}
    </section>
  );
}
