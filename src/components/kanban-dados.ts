// Dados do cartão do kanban (puro; testável sem React).
import { formatarData, formatarValor, TIPOS_CALCULADOS_UI, valorDoCard } from "@/lib/formatar";

export interface CartaoKanban {
  id: string;
  title: string;
  phaseId: string | null;
  /** Até 3 campos-chave já formatados (só os preenchidos); seleções viram etiqueta no topo do cartão. */
  campos: { nome: string; texto: string; tipo: string }[];
  responsavel: string | null;
  /** Prazo: data formatada, se venceu (só card aberto) e dias até ele (negativo: passou). */
  prazo: { texto: string; atrasado: boolean; dias: number } | null;
  /** Dias completos na fase atual (null sem data de entrada). */
  naFase: number | null;
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

const BONS_PARA_CARTAO = new Set(["select", "currency", "number", "date", "person", "text", "rollup", "multi_select", "cnpj", "cpf", "sequence"]);

/**
 * Campos do cartão: os configurados em settings.kanban_fields (que ainda existem, até 3);
 * sem configuração, os 3 primeiros campos "curtos" do board, exceto o título.
 */
export function camposDoCartao<T extends CampoMin>(campos: T[], titleFieldId: string | null, configurados?: string[]): T[] {
  if (configurados?.length) {
    return configurados.map((id) => campos.find((c) => c.id === id)).filter((c): c is T => !!c).slice(0, 3);
  }
  return campos.filter((c) => c.id !== titleFieldId && BONS_PARA_CARTAO.has(c.type) && !TIPOS_CALCULADOS_UI.has(c.type)).slice(0, 3);
}

/** Data (AAAA-MM-DD) no fuso do produto. */
const diaEmSP = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

/** Dias de `de` até `ate` (datas AAAA-MM-DD). */
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000);

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
  }[],
  campos: CampoMin[],
  opcoes: { titleFieldId: string | null; kanbanFields?: string[]; prazoField?: string | null; pessoas: Map<string, string>; hoje: string },
): CartaoKanban[] {
  const chave = camposDoCartao(campos, opcoes.titleFieldId, opcoes.kanbanFields);
  const pessoaCampo = campos.find((c) => c.type === "person");
  const prazoCampo = opcoes.prazoField ? campos.find((c) => c.id === opcoes.prazoField) : undefined;
  return cards.map((c) => {
    const valores = chave
      .map((f) => ({ nome: f.name, texto: formatarValor(f, valorDoCard(f, c), opcoes.pessoas), tipo: f.type }))
      .filter((v) => v.texto !== "");
    const idPessoa = c.assignees[0] ?? (pessoaCampo ? [c.props[pessoaCampo.id]].flat()[0] : undefined);
    const bruto = c.dueAt ? c.dueAt.toISOString().slice(0, 10) : prazoCampo ? String(valorDoCard(prazoCampo, c) ?? "").slice(0, 10) : "";
    return {
      id: c.id,
      title: c.title,
      phaseId: c.phaseId,
      campos: valores,
      responsavel: idPessoa ? opcoes.pessoas.get(String(idPessoa)) ?? null : null,
      prazo: /^\d{4}-\d{2}-\d{2}$/.test(bruto)
        ? { texto: formatarData(bruto), atrasado: c.status === "open" && bruto < opcoes.hoje, dias: diasEntre(opcoes.hoje, bruto) }
        : null,
      naFase: c.phaseEnteredAt ? Math.max(0, diasEntre(diaEmSP(c.phaseEnteredAt), opcoes.hoje)) : null,
    };
  });
}
