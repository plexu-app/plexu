// Conteúdo do card para o painel lateral (página /c/[card]).
import Link from "next/link";
import { estadoDosCampos, movimentosDoCard } from "@/core";
import { Comentarios } from "@/components/card/comentarios";
import { FormCampos } from "@/components/card/form-campos";
import { LateralCard } from "@/components/card/lateral-card";
import { SeletorRelacao } from "@/components/card/seletor-relacao";
import { SheetCard } from "@/components/card/sheet-card";
import { SubTabela } from "@/components/card/sub-tabela";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/misc";
import { montarCartoes } from "@/components/kanban-dados";
import { origemDoCampo } from "@/lib/fase-origem";
import { descreverEvento, formatarDataHora, formatarValor, idCurto, TIPOS_CALCULADOS_UI, tituloOu, valorDoCard, type CampoFmt } from "@/lib/formatar";
import { exigirBoard, exigirCard, exigirMembro } from "@/server/acesso";
import { ajustesDoBoard } from "@/server/config-board";
import { camposDaFase, hojeSP, obrigatoriosPossiveis } from "../_lib/campos-da-fase";
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

export async function PainelCard({ ws, board, cardId, voltarPara }: { ws: string; board: string; cardId: string; voltarPara: string }) {
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  const card = await exigirCard(b, cardId);

  const [estado, movimentos, relacoes, comentarios, eventos, membros] = await Promise.all([
    estadoDosCampos({ cardId: card.id, actor: ctx.actor }),
    card.phaseId ? movimentosDoCard({ cardId: card.id, actor: ctx.actor }) : Promise.resolve(null),
    relacoesDoCard(b, card.id),
    comentariosDoCard(card.id),
    eventosDoCard(card.id),
    membrosDoWorkspace(ctx.ws.id),
  ]);

  const outros = new Map<string, BoardCompleto>();
  for (const id of new Set([...relacoes.proprias, ...relacoes.inversas].map((r) => r.outroBoard.id).filter(Boolean))) {
    const ob = await boardPorId(ctx.ws.id, id);
    if (ob) outros.set(id, ob);
  }
  // Criação de filhos: formulário completo da fase inicial de cada board relacionado e seus obrigatórios.
  const criacao = new Map(
    await Promise.all(
      [...outros.values()].map(async (ob) => {
        const ajustes = await ajustesDoBoard(ob.id);
        const f0 = ob.fases[0] ?? null;
        return [
          ob.id,
          {
            faseNovo: { id: f0?.id ?? null, nome: f0?.name ?? "", campos: camposDaFase(ob, ajustes, f0?.id ?? null) },
            obrigatorios: obrigatoriosPossiveis(ob, ajustes, f0?.id ?? null),
          },
        ] as const;
      }),
    ),
  );
  const hoje = hojeSP();

  const pessoas = Object.fromEntries(membros.map((m) => [m.id, m.nome]));
  // Colunas: à esquerda, campos cuja fase de origem é anterior à atual e que não são editáveis nela
  // (leitura, agrupados por fase); no centro, o formulário da fase atual com o resto dos visíveis.
  const fase = b.fases.find((f) => f.id === card.phaseId);
  const mapaPessoas = new Map(Object.entries(pessoas));
  const faseAnterior = (c: CampoUI) => {
    const o = origemDoCampo(c.config);
    const f = o ? b.fases.find((x) => x.id === o) : undefined;
    return fase && f && f.position < fase.position ? f : undefined;
  };
  const visiveis = b.campos.filter((c) => c.type !== "relation" && estado[c.id]?.visivel !== false);
  const naEsquerda = (c: CampoUI) => !!faseAnterior(c) && (estado[c.id]?.editavel === false || TIPOS_CALCULADOS_UI.has(c.type));
  const camposForm = visiveis.filter((c) => !naEsquerda(c)).map((c) => ({ campo: c, valor: valorDoCard(c, card), estado: estado[c.id] }));
  const gruposAnteriores = b.fases
    .filter((f) => fase && f.position < fase.position)
    .map((f) => ({
      fase: f,
      itens: visiveis
        .filter((c) => naEsquerda(c) && faseAnterior(c)?.id === f.id)
        .map((c) => ({ campo: c, texto: formatarValor(c, valorDoCard(c, card), mapaPessoas) }))
        .filter((x) => x.texto !== ""),
    }))
    .filter((g) => g.itens.length > 0);
  const cartao = montarCartoes([card], b.campos, {
    titleFieldId: b.titleFieldId,
    prazoField: b.settings.kanban_due_field ?? null,
    pessoas: mapaPessoas,
    hoje,
  })[0];
  const posicao = new Map(b.fases.map((f) => [f.id, f.position]));
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

  const relacionados = [
    ...relacoes.proprias.map((r) => {
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
          {...criacao.get(ob.id)!}
          hoje={hoje}
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
    }),
    ...relacoes.inversas.map((r) => {
      const ob = outros.get(r.outroBoard.id);
      if (!ob) return null;
      if (ehSubTabela(r.campo, "destino")) {
        return (
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
            {...criacao.get(ob.id)!}
            hoje={hoje}
          />
        );
      }
      if (!r.cards.length) return null;
      return (
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
      );
    }),
  ].filter((x) => x !== null);

  return (
    <SheetCard
      key={card.id}
      cardId={card.id}
      titulo={tituloOu(card.title, card.id)}
      fase={fase ? { id: fase.id, nome: fase.name } : null}
      status={card.status}
      voltarPara={voltarPara}
      anteriores={
        fase ? (
          <>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fases anteriores</h3>
            {gruposAnteriores.length === 0 && <p className="text-sm text-muted-foreground">Nada preenchido em fases anteriores.</p>}
            {gruposAnteriores.map((g) => (
              <details key={g.fase.id} open className="rounded-md border" data-fase-anterior={g.fase.name}>
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{g.fase.name}</summary>
                <dl className="flex flex-col gap-2 border-t px-3 py-2">
                  {g.itens.map((x) => (
                    <div key={x.campo.id} data-campo-anterior={x.campo.name}>
                      <dt className="text-xs text-muted-foreground">{x.campo.name}</dt>
                      <dd className="text-sm break-words">{x.texto}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ))}
          </>
        ) : null
      }
      atual={
        <>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{fase ? `Nesta fase: ` : "Campos"}</h3>
          <FormCampos key={card.updatedAt.toISOString()} ws={ws} board={b.slug} cardId={card.id} campos={camposForm} pessoas={pessoas} />
        </>
      }
      lateral={
        <LateralCard
          ws={ws}
          board={b.slug}
          cardId={card.id}
          voltarPara={voltarPara}
          responsavel={cartao?.responsavel ?? null}
          prazo={cartao?.prazo ?? null}
          movimentos={
            movimentos?.map((m) => ({
              ...m,
              nome: b.fases.find((f) => f.id === m.faseId)?.name ?? "",
              volta: !!fase && (posicao.get(m.faseId) ?? 0) < fase.position,
            })) ?? null
          }
        />
      }
      abas={{
        relacionados: relacionados.length ? (
          <div className="flex flex-col gap-4">{relacionados}</div>
        ) : (
          <p className="text-sm text-muted-foreground">Este board não tem relações configuradas.</p>
        ),
        comentarios: (
          <Comentarios
            ws={ws}
            board={b.slug}
            cardId={card.id}
            itens={comentarios.map((c) => ({ id: c.id, body: c.body, autor: c.autor ?? "sistema", quando: formatarDataHora(c.createdAt) }))}
          />
        ),
        historico: (
          <ol className="flex flex-col gap-3 text-sm" data-testid="historico">
            {eventos.map((e) => (
              <li key={e.id} className="flex flex-col">
                <span>
                  <span className="font-medium">{e.ator ?? (e.actorType === "user" ? "usuário" : e.actorType)}</span> {descreverEvento(e, ctxEventos)}
                </span>
                <span className="text-xs text-muted-foreground">{formatarDataHora(e.occurredAt)}</span>
              </li>
            ))}
          </ol>
        ),
      }}
      contagens={{ relacionados: relacoes.proprias.reduce((n, r) => n + r.cards.length, 0) + relacoes.inversas.reduce((n, r) => n + r.cards.length, 0), comentarios: comentarios.length }}
    />
  );
}
