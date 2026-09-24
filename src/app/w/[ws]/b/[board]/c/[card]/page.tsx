import Link from "next/link";
import { estadoDosCampos } from "@/core";
import { Comentarios } from "@/components/card/comentarios";
import { FormCampos } from "@/components/card/form-campos";
import { MoverPara } from "@/components/card/mover-para";
import { SeletorRelacao } from "@/components/card/seletor-relacao";
import { SubTabela } from "@/components/card/sub-tabela";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/misc";
import { descreverEvento, formatarDataHora, idCurto, tituloOu, valorDoCard, type CampoFmt } from "@/lib/formatar";
import { exigirBoard, exigirCard, exigirMembro } from "@/server/acesso";
import {
  boardPorId,
  comentariosDoCard,
  eventosDoCard,
  membrosDoWorkspace,
  relacoesDoCard,
  titulosDeCards,
  type BoardCompleto,
  type CampoUI,
} from "@/server/consultas";

export default async function PaginaCard({ params }: { params: Promise<{ ws: string; board: string; card: string }> }) {
  const { ws, board, card: cardId } = await params;
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  const card = await exigirCard(b, cardId);

  const [estado, relacoes, comentarios, eventos, membros] = await Promise.all([
    estadoDosCampos({ cardId: card.id, actor: ctx.actor }),
    relacoesDoCard(b, card.id),
    comentariosDoCard(card.id),
    eventosDoCard(card.id),
    membrosDoWorkspace(ctx.ws.id),
  ]);

  // Boards do outro lado das relações (campos para a sub-tabela)
  const outrosIds = [...new Set([...relacoes.proprias, ...relacoes.inversas].map((r) => r.outroBoard.id).filter(Boolean))];
  const outros = new Map<string, BoardCompleto>();
  for (const id of outrosIds) {
    const ob = await boardPorId(ctx.ws.id, id);
    if (ob) outros.set(id, ob);
  }

  const fase = b.fases.find((f) => f.id === card.phaseId);
  const pessoas = Object.fromEntries(membros.map((m) => [m.id, m.nome]));

  const camposForm = b.campos
    .filter((c) => c.type !== "relation" && estado[c.id]?.visivel !== false)
    .map((c) => ({ campo: c, valor: valorDoCard(c, card), estado: estado[c.id] }));

  const ehSubTabela = (c: CampoUI, lado: "origem" | "destino") => {
    const cfg = (c.config.relation ?? {}) as { is_parent?: boolean; cardinality?: string };
    return lado === "origem" ? !cfg.is_parent && cfg.cardinality !== "one" : !!cfg.is_parent;
  };

  // Histórico
  const camposHist = new Map<string, CampoFmt>(b.campos.map((c) => [c.id, c]));
  for (const ob of outros.values()) for (const c of ob.campos) if (!camposHist.has(c.id)) camposHist.set(c.id, c);
  const idsLigados = eventos
    .filter((e) => e.type.startsWith("card.link_"))
    .flatMap((e) => {
      const d = e.data as { from_card_id?: string; to_card_id?: string };
      return [d.from_card_id, d.to_card_id].filter((x): x is string => !!x);
    });
  const titulos = await titulosDeCards([...new Set(idsLigados)]);
  const ctxEventos = {
    campos: camposHist,
    fases: new Map(b.fases.map((f) => [f.id, f.name])),
    cards: new Map([...titulos].map(([id, t]) => [id, `${tituloOu(t, id)} (${idCurto(id)})`])),
    pessoas: new Map(Object.entries(pessoas)),
  };

  const base = `/w/${ws}/b/${b.slug}`;
  return (
    <main className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)_360px] gap-4 p-4">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={base} className="text-sm text-muted-foreground hover:underline">
            ← {b.name}
          </Link>
          <h1 className="text-xl font-semibold" data-testid="titulo-card">
            {tituloOu(card.title, card.id)}
          </h1>
          <span className="font-mono text-xs text-muted-foreground" title={card.id}>
            {idCurto(card.id)}
          </span>
          {fase && <Badge variant="secondary">{fase.name}</Badge>}
          {card.status !== "open" && <Badge variant="outline">{card.status === "done" ? "concluído" : "cancelado"}</Badge>}
          {b.fases.length > 0 && (
            <div className="ml-auto">
              <MoverPara key={card.phaseId ?? ""} ws={ws} board={b.slug} cardId={card.id} faseAtual={card.phaseId} fases={b.fases.map((f) => ({ id: f.id, nome: f.name }))} />
            </div>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Campos</CardTitle>
          </CardHeader>
          <CardContent>
            <FormCampos key={card.updatedAt.toISOString()} ws={ws} board={b.slug} cardId={card.id} campos={camposForm} pessoas={pessoas} />
          </CardContent>
        </Card>

        {relacoes.proprias.map((r) => {
          const ob = outros.get(r.outroBoard.id);
          if (!ob) return null;
          return ehSubTabela(r.campo, "origem") ? (
            <SubTabela
              key={r.campo.id}
              ws={ws}
              board={b.slug}
              cardId={card.id}
              campo={{ id: r.campo.id, name: r.campo.name }}
              lado="origem"
              boardFilho={{ id: ob.id, slug: ob.slug, name: ob.name, campos: ob.campos, titleFieldId: ob.titleFieldId }}
              linhas={r.cards}
              pessoas={pessoas}
            />
          ) : (
            <SeletorRelacao
              key={r.campo.id}
              ws={ws}
              board={b.slug}
              cardId={card.id}
              campo={{ id: r.campo.id, name: r.campo.name, unico: (r.campo.config.relation as { cardinality?: string })?.cardinality === "one" }}
              boardAlvo={{ slug: ob.slug, name: ob.name }}
              ligados={r.cards.map((c) => ({ id: c.id, title: c.title }))}
              editavel={estado[r.campo.id]?.editavel !== false}
            />
          );
        })}

        {relacoes.inversas.map((r) => {
          const ob = outros.get(r.outroBoard.id);
          if (!ob) return null;
          return ehSubTabela(r.campo, "destino") ? (
            <SubTabela
              key={r.campo.id}
              ws={ws}
              board={b.slug}
              cardId={card.id}
              campo={{ id: r.campo.id, name: String((r.campo.config.relation as { inverse_name?: string })?.inverse_name ?? ob.name) }}
              lado="destino"
              boardFilho={{ id: ob.id, slug: ob.slug, name: ob.name, campos: ob.campos, titleFieldId: ob.titleFieldId }}
              linhas={r.cards}
              pessoas={pessoas}
            />
          ) : r.cards.length ? (
            <Card key={r.campo.id}>
              <CardHeader>
                <CardTitle>
                  Referenciado em {ob.name} · {r.campo.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 text-sm">
                {r.cards.map((c) => (
                  <Link key={c.id} href={`/w/${ws}/b/${ob.slug}/c/${c.id}`} className="rounded-md border px-2 py-1 hover:border-primary/50">
                    {tituloOu(c.title, c.id)} <span className="font-mono text-xs text-muted-foreground">{idCurto(c.id)}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null;
        })}
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        <Comentarios
          ws={ws}
          board={b.slug}
          cardId={card.id}
          itens={comentarios.map((c) => ({ id: c.id, body: c.body, autor: c.autor ?? "sistema", quando: formatarDataHora(c.createdAt) }))}
        />
        <Card>
          <CardHeader>
            <CardTitle>Histórico</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-2 text-sm" data-testid="historico">
              {eventos.map((e) => (
                <li key={e.id} className="flex flex-col">
                  <span>
                    <span className="font-medium">{e.ator ?? (e.actorType === "user" ? "usuário" : e.actorType)}</span> {descreverEvento(e, ctxEventos)}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatarDataHora(e.occurredAt)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </aside>
    </main>
  );
}
