// Visão Lista (docs/design/prompt-redesign-pr2.md, A4): colunas de sistema + campos do board, linhas
// já formatadas no servidor. Puro (server e client).
import { formatarData, formatarValor, TIPOS_CALCULADOS_UI, tituloOu, valorDoCard, type CampoFmt } from "./formatar";

export interface ColunaLista {
  id: string;
  nome: string;
  /** Tipo do campo (ícone e chip); colunas de sistema usam "sistema". */
  tipo: string;
  /** Ordenável no servidor. */
  ordenavel: boolean;
}

export interface LinhaLista {
  id: string;
  titulo: string;
  faseId: string | null;
  /** Texto exibido por coluna. */
  textos: Record<string, string>;
  /** Cor da fase atual (chip da coluna Fase atual). */
  corFase: string | null;
}

/** Colunas de sistema, nesta ordem (Etiquetas fica de fora: o modelo não tem etiquetas). */
export function colunasDeSistema(comFases: boolean): ColunaLista[] {
  return [
    ...(comFases ? [{ id: "__fase", nome: "Fase atual", tipo: "sistema", ordenavel: true }] : []),
    { id: "__titulo", nome: "Título", tipo: "sistema", ordenavel: true },
    { id: "__vencimento", nome: "Vencimento", tipo: "sistema", ordenavel: true },
    { id: "__responsaveis", nome: "Responsáveis", tipo: "sistema", ordenavel: false },
    ...(comFases ? [{ id: "__tempo_fase", nome: "Tempo na fase", tipo: "sistema", ordenavel: true }] : []),
    { id: "__tempo_fluxo", nome: comFases ? "Tempo no fluxo" : "Criado há", tipo: "sistema", ordenavel: true },
    { id: "__atualizacao", nome: "Última atualização", tipo: "sistema", ordenavel: true },
  ];
}

/** Todas as colunas disponíveis: sistema e campos do board (exceto o título e as relações). */
export function colunasDisponiveis(campos: CampoFmt[], titleFieldId: string | null, comFases: boolean): ColunaLista[] {
  return [
    ...colunasDeSistema(comFases),
    ...campos.filter((c) => c.type !== "relation" && c.id !== titleFieldId).map((c) => ({ id: c.id, nome: c.name, tipo: c.type, ordenavel: c.type !== "attachment" })),
  ];
}

/** Colunas visíveis: as salvas na view (que ainda existem, na ordem salva), ou todas. */
export function colunasVisiveis(disponiveis: ColunaLista[], salvas: unknown): ColunaLista[] {
  const ids = Array.isArray(salvas) ? salvas.filter((x): x is string => typeof x === "string") : [];
  const escolhidas = ids.map((id) => disponiveis.find((c) => c.id === id)).filter((c): c is ColunaLista => !!c);
  return escolhidas.length ? escolhidas : disponiveis;
}

export interface CardParaLista {
  id: string;
  title: string;
  phaseId: string | null;
  status: string;
  props: Record<string, unknown>;
  computed: Record<string, unknown>;
  assignees: string[];
  dueAt: Date | null;
  phaseEnteredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const diaEmSP = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

export function linhasDaLista(
  cards: CardParaLista[],
  campos: CampoFmt[],
  opcoes: {
    fases: Map<string, { nome: string; cor: string }>;
    pessoas: Map<string, string>;
    prazoField?: string | null;
    /** Formata durações (o chamador escolhe o formato; o servidor passa duracaoCurta). */
    duracao: (ms: number) => string;
    agora?: number;
  },
): LinhaLista[] {
  const agora = opcoes.agora ?? Date.now();
  const prazoCampo = opcoes.prazoField ? campos.find((c) => c.id === opcoes.prazoField) : undefined;
  const pessoaCampos = campos.filter((c) => c.type === "person");
  return cards.map((c) => {
    const textos: Record<string, string> = {};
    const fase = c.phaseId ? opcoes.fases.get(c.phaseId) : undefined;
    textos.__fase = fase?.nome ?? "";
    textos.__titulo = tituloOu(c.title, c.id);
    const prazo = c.dueAt ? diaEmSP(c.dueAt) : prazoCampo ? String(valorDoCard(prazoCampo, c) ?? "").slice(0, 10) : "";
    textos.__vencimento = /^\d{4}-\d{2}-\d{2}$/.test(prazo) ? formatarData(prazo) : "";
    const ids = [...new Set([...c.assignees, ...pessoaCampos.flatMap((p) => [c.props[p.id]].flat().filter((x): x is string => typeof x === "string"))])];
    textos.__responsaveis = ids.map((id) => opcoes.pessoas.get(id) ?? "").filter(Boolean).join(", ");
    textos.__tempo_fase = c.phaseEnteredAt ? opcoes.duracao(agora - c.phaseEnteredAt.getTime()) : "";
    textos.__tempo_fluxo = opcoes.duracao(agora - c.createdAt.getTime());
    textos.__atualizacao = opcoes.duracao(agora - c.updatedAt.getTime());
    for (const campo of campos) textos[campo.id] = formatarValor(campo, valorDoCard(campo, c), opcoes.pessoas);
    return { id: c.id, titulo: textos.__titulo, faseId: c.phaseId, textos, corFase: fase?.cor ?? null };
  });
}

/** Tipos guardados em computed (ordenação lê de lá). */
export const ehCalculado = (tipo: string) => TIPOS_CALCULADOS_UI.has(tipo);
