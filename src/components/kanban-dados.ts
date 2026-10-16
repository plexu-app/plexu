// Dados do cartão do kanban (puro; testável sem React). O servidor monta; o cliente só desenha.
import { formatarData, formatarValor, TIPOS_CALCULADOS_UI, valorDoCard } from "@/lib/formatar";
import { slaEmMs } from "@/lib/tempo";

/** Card relacionado (N:1 marcado "mostrar no card") no sub-rodapé do cartão. */
export interface ConexaoCartao {
  /** Nome do board relacionado. */
  board: string;
  /** Cor do board (a mesma do marcador da sidebar). */
  cor: string;
  id: string;
  titulo: string;
  href: string;
}

export interface CartaoKanban {
  id: string;
  title: string;
  phaseId: string | null;
  /** Campos resumidos já formatados (só os preenchidos), na ordem configurada. */
  campos: { nome: string; texto: string; tipo: string }[];
  responsavel: string | null;
  /** Prazo: data formatada, se venceu (só card aberto) e dias até ele (negativo: passou). */
  prazo: { texto: string; atrasado: boolean; dias: number } | null;
  /** Durações em ms, calculadas no servidor: no fluxo (desde a criação), na fase atual, desde a última atualização. */
  tempos: { fluxo: number; fase: number | null; atualizacao: number };
  /** Cor do "tempo na fase": passou do prazo do card (vermelho) ou do SLA da fase (laranja). */
  alerta: "prazo" | "sla" | null;
  comentarios: number;
  anexos: number;
  conexoes: ConexaoCartao[];
}

interface CampoMin {
  id: string;
  name: string;
  type: string;
  config?: Record<string, unknown>;
}

/** Cores de fase do design (tokens --f1..--f5, docs/DESIGN.md). Fase sem cor usa a da posição. */
export const PALETA_FASES = ["f1", "f2", "f3", "f4", "f5"] as const;

/** Cor CSS da fase: token (f1..f5) vira var(--fN); cor gravada pelo usuário (#rrggbb) vale como está. */
export const corDaFase = (cor: string | null, indice: number) => {
  const c = cor ?? PALETA_FASES[indice % PALETA_FASES.length];
  return /^f[1-5]$/.test(c) ? `var(--${c})` : c;
};

/** Máximo de campos no cartão e quantos entram sem configuração. */
export const MAX_CAMPOS_CARTAO = 8;
export const PADRAO_CAMPOS_CARTAO = 6;

const BONS_PARA_CARTAO = new Set(["select", "currency", "number", "date", "person", "text", "rollup", "multi_select", "cnpj", "cpf", "sequence", "boolean", "lookup"]);

/**
 * Campos do cartão: os configurados em settings.kanban_fields (que ainda existem, até 8, na ordem);
 * sem configuração, os 6 primeiros campos "curtos" do board, exceto o título.
 */
export function camposDoCartao<T extends CampoMin>(campos: T[], titleFieldId: string | null, configurados?: string[]): T[] {
  if (configurados?.length) {
    return configurados.map((id) => campos.find((c) => c.id === id)).filter((c): c is T => !!c).slice(0, MAX_CAMPOS_CARTAO);
  }
  return campos
    .filter((c) => c.id !== titleFieldId && BONS_PARA_CARTAO.has(c.type) && (!TIPOS_CALCULADOS_UI.has(c.type) || c.type === "rollup" || c.type === "lookup"))
    .slice(0, PADRAO_CAMPOS_CARTAO);
}

/** Data (AAAA-MM-DD) no fuso do produto. */
const diaEmSP = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

/** Dias de `de` até `ate` (datas AAAA-MM-DD). */
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000);

export interface ExtrasCartoes {
  comentarios?: Map<string, number>;
  anexos?: Map<string, number>;
  conexoes?: Map<string, ConexaoCartao[]>;
}

export function montarCartoes(
  cards: {
    id: string;
    title: string;
    phaseId: string | null;
    status: string;
    props: Record<string, unknown>;
    computed: Record<string, unknown>;
    assignees: string[];
    dueAt: Date | null;
    phaseEnteredAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
  }[],
  campos: CampoMin[],
  opcoes: {
    titleFieldId: string | null;
    kanbanFields?: string[];
    prazoField?: string | null;
    pessoas: Map<string, string>;
    hoje: string;
    /** Instante de referência (ms) para as durações; padrão: agora. */
    agora?: number;
    /** SLA por fase (phases.sla). */
    slaPorFase?: Map<string, unknown>;
    extras?: ExtrasCartoes;
  },
): CartaoKanban[] {
  const chave = camposDoCartao(campos, opcoes.titleFieldId, opcoes.kanbanFields);
  const pessoaCampo = campos.find((c) => c.type === "person");
  const prazoCampo = opcoes.prazoField ? campos.find((c) => c.id === opcoes.prazoField) : undefined;
  const agora = opcoes.agora ?? Date.now();
  return cards.map((c) => {
    const valores = chave
      .map((f) => ({ nome: f.name, texto: formatarValor(f, valorDoCard(f, c), opcoes.pessoas), tipo: f.type }))
      .filter((v) => v.texto !== "");
    const idPessoa = c.assignees[0] ?? (pessoaCampo ? [c.props[pessoaCampo.id]].flat()[0] : undefined);
    const bruto = c.dueAt ? diaEmSP(c.dueAt) : prazoCampo ? String(valorDoCard(prazoCampo, c) ?? "").slice(0, 10) : "";
    const prazo = /^\d{4}-\d{2}-\d{2}$/.test(bruto)
      ? { texto: formatarData(bruto), atrasado: c.status === "open" && bruto < opcoes.hoje, dias: diasEntre(opcoes.hoje, bruto) }
      : null;
    const naFase = c.phaseEnteredAt ? agora - c.phaseEnteredAt.getTime() : null;
    const sla = c.phaseId ? slaEmMs(opcoes.slaPorFase?.get(c.phaseId)) : null;
    return {
      id: c.id,
      title: c.title,
      phaseId: c.phaseId,
      campos: valores,
      responsavel: idPessoa ? opcoes.pessoas.get(String(idPessoa)) ?? null : null,
      prazo,
      tempos: {
        fluxo: c.createdAt ? agora - c.createdAt.getTime() : 0,
        fase: naFase,
        atualizacao: c.updatedAt ? agora - c.updatedAt.getTime() : 0,
      },
      alerta: prazo?.atrasado ? "prazo" : sla !== null && naFase !== null && c.status === "open" && naFase > sla ? "sla" : null,
      comentarios: opcoes.extras?.comentarios?.get(c.id) ?? 0,
      anexos: opcoes.extras?.anexos?.get(c.id) ?? 0,
      conexoes: opcoes.extras?.conexoes?.get(c.id) ?? [],
    };
  });
}
