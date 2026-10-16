// Card aberto (docs/design/prompt-redesign-pr2.md, B): monta as três colunas no servidor e entrega ao
// casco cliente (components/card/card-aberto). Usado pela rota interceptada (modal sobre o board) e pela
// página direta /w/[ws]/c/[card].
//  Esquerda: título, abas (Formulário, Atividades, Anexos, Comentários, E-mail); no Formulário, os cards
//  conectados (pais e filhos) e o histórico por fase ("Formulário inicial" + fases já percorridas).
//  Centro: a fase atual (descrição e campos em uma coluna, com relações editáveis na posição delas).
//  Direita: mover (só destinos que as regras deixam), responsável, prazo, ações.
import Link from "next/link";
import { notFound } from "next/navigation";
import { Settings2 } from "lucide-react";
import { estadoDosCampos, movimentosDoCard } from "@/core";
import { AcoesCard } from "@/components/card/acoes-card";
import { CardAberto, Compartilhar } from "@/components/card/card-aberto";
import { Comentarios } from "@/components/card/comentarios";
import { ConexoesCard, type MiniCard } from "@/components/card/conexoes-card";
import { FormCampos } from "@/components/card/form-campos";
import { HistoricoFases, type SecaoHistorico } from "@/components/card/historico-fases";
import { LateralCard } from "@/components/card/lateral-card";
import { SeletorRelacao } from "@/components/card/seletor-relacao";
import { SubTabela } from "@/components/card/sub-tabela";
import { corDaFase, montarCartoes } from "@/components/kanban-dados";
import { coresDosBoards } from "@/lib/cores";
import { fasesValidas } from "@/lib/fases-preenchimento";
import { descreverEvento, formatarDataHora, formatarValor, idCurto, TIPOS_CALCULADOS_UI, tituloOu, valorDoCard, type CampoFmt } from "@/lib/formatar";
import { hrefCard } from "@/lib/rotas";
import { exigirBoard, exigirCard, exigirMembro, podeConfigurar } from "@/server/acesso";
import { anexosPorIds } from "@/server/anexos/servico";
import { acoesDoCard } from "@/server/automacoes";
import { ajustesDoBoard } from "@/server/config-board";
import { origemDoEspelho } from "@/server/espelhos";
import {
  anexosDoCard,
  boardPorId,
  boardsDoWorkspace,
  cardDoWorkspace,
  comentariosDoCard,
  eventosDoCard,
  membrosDoWorkspace,
  nomeDoUsuario,
  relacoesDoCard,
  titulosDeCards,
  type BoardCompleto,
  type CampoUI,
} from "@/server/consultas";
import { camposDaFase, hojeSP, obrigatoriosPossiveis } from "../b/[board]/_lib/campos-da-fase";

const DIA = 86_400_000;
const haQuanto = (d: Date) => {
  const n = Math.floor((Date.now() - d.getTime()) / DIA);
  return n <= 0 ? "hoje" : n === 1 ? "há 1 dia" : `há ${n} dias`;
};

export async function CardServidor({ ws, cardId, modo }: { ws: string; cardId: string; modo: "modal" | "pagina" }) {
  const ctx = await exigirMembro(ws);
  const resumo = await cardDoWorkspace(ctx.ws.id, cardId);
  if (!resumo) notFound();
  const b = await exigirBoard(ctx, resumo.boardSlug);
  const card = await exigirCard(b, cardId);

  const [estado, movimentos, relacoes, comentarios, eventos, membros, todosBoards, anexosCard, criador] = await Promise.all([
    estadoDosCampos({ cardId: card.id, actor: ctx.actor }),
    card.phaseId ? movimentosDoCard({ cardId: card.id, actor: ctx.actor }) : Promise.resolve(null),
    relacoesDoCard(b, card.id),
    comentariosDoCard(card.id),
    eventosDoCard(card.id),
    membrosDoWorkspace(ctx.ws.id),
    boardsDoWorkspace(ctx.ws.id),
    anexosDoCard(ctx.ws.id, card.id),
    nomeDoUsuario(card.createdBy),
  ]);
  const cores = coresDosBoards(todosBoards);

  const outros = new Map<string, BoardCompleto>();
  for (const id of new Set([...relacoes.proprias, ...relacoes.inversas].map((r) => r.outroBoard.id).filter(Boolean))) {
    const ob = await boardPorId(ctx.ws.id, id);
    if (ob) outros.set(id, ob);
  }
  // Criação de filhos pela sub-tabela: formulário da fase inicial de cada board relacionado.
  const criacao = new Map(
    await Promise.all(
      [...outros.values()].map(async (ob) => {
        const ajustes = await ajustesDoBoard(ob.id);
        const f0 = ob.fases[0] ?? null;
        return [
          ob.id,
          {
            faseNovo: { id: f0?.id ?? null, nome: f0?.name ?? "", campos: camposDaFase(ob, ajustes, f0?.id ?? null), nomes: Object.fromEntries(ob.campos.map((c) => [c.id, c.name])) },
            obrigatorios: obrigatoriosPossiveis(ob, ajustes, f0?.id ?? null),
          },
        ] as const;
      }),
    ),
  );
  const hoje = hojeSP();
  const pessoas = Object.fromEntries(membros.map((m) => [m.id, m.nome]));
  const mapaPessoas = new Map(Object.entries(pessoas));
  const indiceFase = b.fases.findIndex((f) => f.id === card.phaseId);
  const fase = indiceFase >= 0 ? b.fases[indiceFase] : undefined;
  const corFase = fase ? corDaFase(fase.color, indiceFase) : null;
  const corDe = (ob: BoardCompleto, faseId: string | null) => {
    const i = ob.fases.findIndex((f) => f.id === faseId);
    return i >= 0 ? { nome: ob.fases[i].name, cor: corDaFase(ob.fases[i].color, i) } : null;
  };

  const ehSubTabela = (c: CampoUI) => {
    const cfg = (c.config.relation ?? {}) as { is_parent?: boolean; cardinality?: string };
    return !cfg.is_parent && cfg.cardinality !== "one";
  };
  const propriaDe = new Map(relacoes.proprias.map((r) => [r.campo.id, r]));
  const editavel = (c: CampoUI) => estado[c.id]?.editavel !== false && !TIPOS_CALCULADOS_UI.has(c.type);

  // Fase "dona" de um campo já percorrida: a última fase de preenchimento antes da atual, se a atual não é uma delas.
  const faseAnterior = (c: CampoUI) => {
    if (!fase) return undefined;
    const fs = fasesValidas(c.config, b.fases);
    if (!fs.length || fs.some((f) => f.id === fase.id)) return undefined;
    return fs.filter((f) => f.position < fase.position).at(-1);
  };
  const visiveis = b.campos.filter((c) => estado[c.id]?.visivel !== false && (c.type !== "relation" || propriaDe.has(c.id)));
  const naEsquerda = (c: CampoUI) => !!faseAnterior(c) && !(c.type === "relation" && editavel(c));
  const textoDe = (c: CampoUI) =>
    c.type === "relation" ? (propriaDe.get(c.id)?.cards ?? []).map((x) => tituloOu(x.title, x.id)).join(", ") : formatarValor(c, valorDoCard(c, card), mapaPessoas);
  const linksDe = (c: CampoUI) => {
    const r = propriaDe.get(c.id);
    return r ? r.cards.map((x) => ({ href: hrefCard(ws, x.id), texto: tituloOu(x.title, x.id) })) : undefined;
  };

  // Histórico por fase: "Formulário inicial" (primeira fase) e as fases já percorridas.
  const detalheCriacao = `Criado por ${criador ?? "alguém"} · ${haQuanto(card.createdAt)}`;
  const percorridas = fase ? b.fases.filter((f) => f.position < fase.position) : [];
  const secoes: SecaoHistorico[] = (percorridas.length ? percorridas : [null]).map((f, i) => ({
    id: f?.id ?? "inicial",
    titulo: i === 0 ? "Formulário inicial" : f!.name,
    detalhe: i === 0 ? detalheCriacao : undefined,
    cor: f ? corDaFase(f.color, b.fases.indexOf(f)) : null,
    itens: f
      ? visiveis
          .filter((c) => naEsquerda(c) && faseAnterior(c)?.id === f.id)
          .map((c) => ({
            campo: { id: c.id, name: c.name, type: c.type, config: c.config },
            valor: valorDoCard(c, card),
            texto: textoDe(c),
            editavel: c.type !== "relation" && editavel(c),
            links: c.type === "relation" ? linksDe(c) : undefined,
          }))
      : [],
  }));

  // Cards conectados (pais e filhos): mini-cards.
  const miniDe = (x: (typeof relacoes.proprias)[number]["cards"][number], ob: BoardCompleto, relacao: string, desligar: MiniCard["desligar"]): MiniCard => {
    const [c] = montarCartoes([x], ob.campos, { titleFieldId: ob.titleFieldId, kanbanFields: ob.settings.kanban_fields, pessoas: mapaPessoas, hoje });
    return {
      id: x.id,
      href: hrefCard(ws, x.id),
      titulo: tituloOu(x.title, x.id),
      relacao,
      board: { nome: ob.name, cor: cores.get(ob.id) ?? "var(--f5)" },
      fase: corDe(ob, x.phaseId),
      campos: c.campos.slice(0, 2),
      desligar,
    };
  };
  const conectados: MiniCard[] = [
    ...relacoes.proprias.flatMap((r) => {
      const ob = outros.get(r.outroBoard.id);
      return ob ? r.cards.map((x) => miniDe(x, ob, r.campo.name, { campoId: r.campo.id, lado: "origem" })) : [];
    }),
    ...relacoes.inversas.flatMap((r) => {
      const ob = outros.get(r.outroBoard.id);
      const nome = String((r.campo.config.relation as { inverse_name?: string } | undefined)?.inverse_name ?? "") || r.campo.name;
      return ob ? r.cards.map((x) => miniDe(x, ob, nome, { campoId: r.campo.id, lado: "destino" })) : [];
    }),
  ];

  // Centro: formulário da fase atual.
  const camposForm: { campo: CampoUI; valor: unknown; estado: (typeof estado)[string]; exibicao?: string; inicialRelacao?: { id: string; title: string }[] }[] = visiveis
    .filter((c) => !naEsquerda(c))
    .map((c) => ({ campo: c, valor: valorDoCard(c, card), estado: estado[c.id] }));
  for (const f of camposForm.filter((x) => x.campo.type === "lookup")) {
    const o = await origemDoEspelho(ctx.ws.id, b, f.campo);
    if (o?.campo.type !== "relation") continue;
    const ids = Array.isArray(f.valor) ? (f.valor as string[]) : [];
    const t = await titulosDeCards(ids);
    const itens = ids.map((id) => ({ id, title: t.get(id) ?? "" }));
    Object.assign(f, { exibicao: itens.map((i) => tituloOu(i.title, i.id)).join(", "), inicialRelacao: itens });
  }
  const idsAnexos = b.campos.filter((c) => c.type === "attachment").flatMap((c) => (Array.isArray(card.props[c.id]) ? (card.props[c.id] as string[]) : []));
  const anexos = await anexosPorIds(ctx.ws.id, idsAnexos);
  const relacoesNoForm = Object.fromEntries(
    camposForm
      .filter((x) => x.campo.type === "relation")
      .flatMap(({ campo }) => {
        const r = propriaDe.get(campo.id)!;
        const ob = outros.get(r.outroBoard.id);
        if (!ob) return [];
        const podeEditar = estado[campo.id]?.editavel !== false;
        return [
          [
            campo.id,
            ehSubTabela(campo) ? (
              <SubTabela
                ws={ws}
                board={b.slug}
                cardId={card.id}
                campo={{ id: campo.id, name: campo.name }}
                colunasConfig={(campo.config.relation as { table_fields?: { field: string; editable?: boolean }[] } | undefined)?.table_fields}
                lado="origem"
                boardFilho={{ id: ob.id, slug: ob.slug, name: ob.name, campos: ob.campos, titleFieldId: ob.titleFieldId }}
                linhas={r.cards}
                pessoas={pessoas}
                {...criacao.get(ob.id)!}
                hoje={hoje}
                editavel={podeEditar}
              />
            ) : (
              <SeletorRelacao
                ws={ws}
                board={b.slug}
                cardId={card.id}
                campo={{ id: campo.id, name: campo.name, unico: (campo.config.relation as { cardinality?: string })?.cardinality === "one" }}
                boardAlvo={{ slug: ob.slug, name: ob.name }}
                ligados={r.cards.map((c) => ({ id: c.id, title: c.title }))}
                editavel={podeEditar}
              />
            ),
          ],
        ];
      }),
  );

  const [cartao] = montarCartoes([card], b.campos, { titleFieldId: b.titleFieldId, prazoField: b.settings.kanban_due_field ?? null, pessoas: mapaPessoas, hoje });

  // Atividades: eventos do card (quem, quando, o quê); movimentos com as cores das fases.
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
    pessoas: mapaPessoas,
  };
  const chipFase = (id: unknown) => {
    const i = b.fases.findIndex((f) => f.id === id);
    if (i < 0) return <span className="text-ink-3">sem fase</span>;
    const cor = corDaFase(b.fases[i].color, i);
    return (
      <span className="inline-flex items-center gap-1 rounded border px-1.5 py-px text-xs" style={{ background: `color-mix(in srgb, ${cor} 10%, transparent)`, borderColor: `color-mix(in srgb, ${cor} 35%, transparent)` }}>
        {b.fases[i].name}
      </span>
    );
  };
  const atividades = (
    <ol className="flex flex-col gap-4 border-l border-line pl-4 text-sm" data-testid="historico">
      {eventos.map((e) => {
        const d = (e.data ?? {}) as { from_phase?: string; to_phase?: string };
        return (
          <li key={e.id} className="relative" data-evento={e.type}>
            <i className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-line" aria-hidden />
            <p>
              <span className="font-medium">{e.ator ?? (e.actorType === "user" ? "usuário" : e.actorType)}</span>{" "}
              {e.type === "card.moved" ? (
                <>
                  moveu de {chipFase(d.from_phase)} para {chipFase(d.to_phase)}
                  <span className="sr-only"> ({descreverEvento(e, ctxEventos)})</span>
                </>
              ) : (
                descreverEvento(e, ctxEventos)
              )}
            </p>
            <p className="font-mono text-[11px] text-ink-3">{formatarDataHora(e.occurredAt)}</p>
          </li>
        );
      })}
    </ol>
  );

  // Anexos: todos os do card, agrupados por campo.
  const grupos = new Map<string, typeof anexosCard>();
  for (const a of anexosCard) {
    const nome = a.campoId ? (b.campos.find((c) => c.id === a.campoId)?.name ?? "Campo removido") : a.comentarioId ? "Comentários" : "Outros";
    grupos.set(nome, [...(grupos.get(nome) ?? []), a]);
  }
  const abaAnexos = grupos.size ? (
    <div className="flex flex-col gap-5" data-anexos-card>
      {[...grupos].map(([nome, itens]) => (
        <section key={nome} aria-label={nome}>
          <h3 className="mb-2 text-[13px] font-semibold">{nome}</h3>
          <ul className="flex flex-col gap-1.5">
            {itens.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded border border-line px-3 py-2 text-sm">
                <a href={`/api/anexos/${a.id}`} className="min-w-0 flex-1 truncate hover:underline">
                  {a.nome}
                </a>
                <span className="font-mono text-[11px] text-ink-3">{a.tamanho ? `${Math.max(1, Math.round(a.tamanho / 1024))} KB` : ""}</span>
                <span className="font-mono text-[11px] text-ink-3">{formatarDataHora(a.criadoEm)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  ) : (
    <p className="text-sm text-ink-3">Nenhum anexo neste card.</p>
  );

  const titleField = b.campos.find((c) => c.id === b.titleFieldId);
  const tituloEditavel = titleField && titleField.type === "text" && estado[titleField.id]?.editavel !== false ? { campoId: titleField.id, valor: String(card.props[titleField.id] ?? "") } : null;
  const posicao = new Map(b.fases.map((f) => [f.id, f.position]));
  const configura = podeConfigurar(ctx);

  return (
    <CardAberto
      key={card.id}
      modo={modo}
      ws={ws}
      board={b.slug}
      cardId={card.id}
      voltarPara={`/w/${ws}/b/${b.slug}`}
      titulo={tituloOu(card.title, card.id)}
      tituloEditavel={tituloEditavel}
      contagens={{ atividades: eventos.length, anexos: anexosCard.length, comentarios: comentarios.length }}
      esquerda={{
        formulario: (
          <div className="flex flex-col gap-8">
            <ConexoesCard ws={ws} board={b.slug} cardId={card.id} itens={conectados} />
            <HistoricoFases ws={ws} board={b.slug} cardId={card.id} secoes={secoes} pessoas={pessoas} />
          </div>
        ),
        atividades,
        anexos: abaAnexos,
        comentarios: (
          <Comentarios
            ws={ws}
            board={b.slug}
            cardId={card.id}
            itens={comentarios.map((c) => ({ id: c.id, body: c.body, autor: c.autor ?? "sistema", quando: formatarDataHora(c.createdAt) }))}
          />
        ),
        email: <p className="text-sm text-ink-3">Em breve: enviar e receber e-mails pelo card.</p>,
      }}
      centro={
        <>
          <header className="mb-4 flex items-center gap-2" data-cabecalho-fase-atual>
            <span className="text-[13px] text-ink-2">Fase atual</span>
            {fase && corFase ? (
              <span
                className="inline-flex h-6 items-center rounded-full border px-2.5 text-[12.5px] font-medium"
                style={{ background: `color-mix(in srgb, ${corFase} 10%, transparent)`, borderColor: `color-mix(in srgb, ${corFase} 35%, transparent)`, color: `color-mix(in srgb, ${corFase} 62%, var(--ink))` }}
                data-testid="fase-card"
              >
                {fase.name}
              </span>
            ) : (
              <span className="text-[13px] text-ink-3" data-testid="fase-card">
                {b.kind === "database" ? b.name : "sem fase"}
              </span>
            )}
            {configura && fase && (
              <Link href={`/w/${ws}/b/${b.slug}/settings?aba=fases&fase=${fase.id}`} className="grid size-6 place-items-center rounded text-ink-3 hover:bg-bg hover:text-ink" aria-label="Configurar esta fase" title="Configurar fase">
                <Settings2 className="size-3.5" />
              </Link>
            )}
            {card.status !== "open" && <span className="rounded border border-line px-1.5 py-px font-mono text-[10px] uppercase text-ink-3">{card.status === "done" ? "concluído" : "cancelado"}</span>}
            <Compartilhar ws={ws} cardId={card.id} />
          </header>
          {fase?.descricao && (
            <p className="mb-5 text-[13px] text-ink-2" data-descricao-fase>
              {fase.descricao}
            </p>
          )}
          {/* Sem key por updatedAt: remontar a cada gravação apagava o que se digitava em outro campo. */}
          <FormCampos ws={ws} board={b.slug} cardId={card.id} campos={camposForm} pessoas={pessoas} relacoes={relacoesNoForm} anexos={anexos} />
        </>
      }
      direita={
        <LateralCard
          ws={ws}
          board={b.slug}
          cardId={card.id}
          voltarPara={`/w/${ws}/b/${b.slug}`}
          responsavel={cartao?.responsavel ?? null}
          prazo={cartao?.prazo ?? null}
          configurarMovimentacao={configura && fase ? `/w/${ws}/b/${b.slug}/settings?aba=regras` : null}
          movimentos={
            movimentos?.map((m) => {
              const i = b.fases.findIndex((f) => f.id === m.faseId);
              const p = posicao.get(m.faseId) ?? 0;
              return {
                ...m,
                nome: b.fases[i]?.name ?? "",
                cor: corDaFase(b.fases[i]?.color ?? null, i),
                volta: !!fase && p < fase.position,
                anterior: !!fase && i === indiceFase - 1,
              };
            }) ?? null
          }
          acoes={<AcoesCard ws={ws} board={b.slug} cardId={card.id} acoes={await acoesDoCard(b.id, card.id, ctx.actor)} />}
        />
      }
    />
  );
}
