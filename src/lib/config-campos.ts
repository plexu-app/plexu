// Catálogo de tipos de campo e validação/normalização da config por tipo (puro; testável).

export const TIPOS_CAMPO: { tipo: string; rotulo: string; calculado?: boolean }[] = [
  { tipo: "text", rotulo: "Texto" },
  { tipo: "long_text", rotulo: "Texto longo" },
  { tipo: "number", rotulo: "Número" },
  { tipo: "currency", rotulo: "Moeda" },
  { tipo: "date", rotulo: "Data" },
  { tipo: "datetime", rotulo: "Data e hora" },
  { tipo: "boolean", rotulo: "Sim/não" },
  { tipo: "select", rotulo: "Seleção" },
  { tipo: "multi_select", rotulo: "Seleção múltipla" },
  { tipo: "person", rotulo: "Pessoa" },
  { tipo: "cpf", rotulo: "CPF" },
  { tipo: "cnpj", rotulo: "CNPJ" },
  { tipo: "attachment", rotulo: "Anexo" },
  { tipo: "relation", rotulo: "Relação" },
  { tipo: "lookup", rotulo: "Valor de card relacionado", calculado: true },
  { tipo: "sequence", rotulo: "Sequência (numeração)", calculado: true },
  { tipo: "rollup", rotulo: "Rollup (soma/contagem)", calculado: true },
  { tipo: "dynamic_text", rotulo: "Texto calculado", calculado: true },
];

export const TIPOS_VALIDOS = new Set(TIPOS_CAMPO.map((t) => t.tipo));

export class ErroConfigCampo extends Error {}

export interface ContextoConfig {
  /** id do board do campo */
  boardId: string;
  /** boards do workspace (id → nome) */
  boards: Map<string, string>;
  /** campos de relação utilizáveis como via_field: do próprio board ou de outros apontando para ele */
  relacoes: Map<string, { boardId: string; target: string }>;
  /** campos do próprio board (id e slug), para parent_field e lock */
  campos: { id: string; slug: string; type: string }[];
  /** fases ativas do board, para fill_phases (ausente: fases não são aceitas) */
  fases?: Set<string>;
}

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const inteiro = (v: unknown, padrao: number, min: number, max: number, nome: string) => {
  if (v === undefined || v === null || v === "") return padrao;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new ErroConfigCampo(`${nome} deve ser inteiro entre ${min} e ${max}`);
  return n;
};

/**
 * Valida e normaliza config conforme o tipo, mais as fases de preenchimento (fill_phases,
 * editable_everywhere; qualquer tipo; decisão 18-revisada). origin_phase_id legado vira fill_phases.
 * Lança ErroConfigCampo com mensagem clara.
 */
export function normalizarConfig(tipo: string, bruto: unknown, ctx: ContextoConfig): Record<string, unknown> {
  const config = normalizarPorTipo(tipo, bruto, ctx);
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as { fill_phases?: unknown; origin_phase_id?: unknown; editable_everywhere?: unknown };
  const lista = Array.isArray(b.fill_phases) ? b.fill_phases.map(texto) : [texto(b.origin_phase_id)];
  const fases = [...new Set(lista.filter(Boolean))];
  if (!fases.length) return config;
  for (const f of fases) if (!ctx.fases?.has(f)) throw new ErroConfigCampo("fase de preenchimento inválida");
  return { ...config, fill_phases: fases, ...(b.editable_everywhere === true ? { editable_everywhere: true } : {}) };
}

function normalizarPorTipo(tipo: string, bruto: unknown, ctx: ContextoConfig): Record<string, unknown> {
  if (!TIPOS_VALIDOS.has(tipo)) throw new ErroConfigCampo(`tipo de campo inválido: ${tipo}`);
  const c = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  switch (tipo) {
    case "select":
    case "multi_select": {
      const opcoes = (Array.isArray(c.options) ? c.options : [])
        .map((o) => (typeof o === "string" ? o.trim() : texto((o as { value?: unknown })?.value)))
        .filter(Boolean);
      if (!opcoes.length) throw new ErroConfigCampo("informe ao menos uma opção");
      if (new Set(opcoes).size !== opcoes.length) throw new ErroConfigCampo("opções repetidas");
      return { options: opcoes };
    }
    case "currency": {
      const code = texto((c.currency as { code?: unknown } | undefined)?.code) || "BRL";
      if (!/^[A-Z]{3}$/.test(code)) throw new ErroConfigCampo("código de moeda deve ter 3 letras (ex.: BRL)");
      return { currency: { code } };
    }
    case "person":
      return { multiple: c.multiple === true };
    case "relation": {
      const r = (c.relation ?? {}) as Record<string, unknown>;
      const alvo = texto(r.target_board);
      if (!ctx.boards.has(alvo)) throw new ErroConfigCampo("escolha o board de destino da relação");
      const cardinalidade = r.cardinality === "one" ? "one" : "many";
      const lock = (Array.isArray(r.lock_fields_while_linked) ? r.lock_fields_while_linked : []).map(String);
      for (const id of lock) if (!ctx.campos.some((x) => x.id === id)) throw new ErroConfigCampo("campo travado inválido");
      return {
        relation: {
          target_board: alvo,
          cardinality: cardinalidade,
          exclusive: r.exclusive === true,
          is_parent: r.is_parent === true,
          ...(texto(r.inverse_name) ? { inverse_name: texto(r.inverse_name) } : {}),
          ...(texto(r.filter_expr) ? { filter_expr: texto(r.filter_expr) } : {}),
          ...(lock.length ? { lock_fields_while_linked: lock } : {}),
        },
      };
    }
    case "sequence": {
      const s = (c.sequence ?? {}) as Record<string, unknown>;
      const escopo = texto(s.scope) || "global";
      if (!["global", "year", "month", "day", "parent"].includes(escopo)) throw new ErroConfigCampo("escopo de sequência inválido");
      const pattern = texto(s.pattern) || "{n}";
      if (!/\{n(:\d+)?\}/.test(pattern)) throw new ErroConfigCampo("o padrão precisa conter {n}");
      const parent = texto(s.parent_field);
      if (escopo === "parent") {
        const rel = ctx.campos.find((x) => (x.id === parent || x.slug === parent) && x.type === "relation");
        if (!rel) throw new ErroConfigCampo("escopo 'pai' exige um campo de relação deste board como pai");
      }
      return {
        sequence: {
          pattern,
          scope: escopo,
          seed: inteiro(s.seed, 1, 0, 1_000_000_000, "semente"),
          pad: inteiro(s.pad, 4, 0, 12, "zeros à esquerda"),
          ...(escopo === "parent" ? { parent_field: parent } : {}),
        },
      };
    }
    case "lookup": {
      const l = (c.lookup ?? {}) as Record<string, unknown>;
      const via = texto(l.via_field);
      if (!ctx.relacoes.has(via)) throw new ErroConfigCampo("escolha a relação que leva ao card relacionado");
      const path = texto(l.path);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(path)) throw new ErroConfigCampo("informe o campo do card relacionado (slug, ou titulo/fase/status)");
      return { lookup: { via_field: via, path, mode: l.mode === "copy" ? "copy" : "ref" } };
    }
    case "rollup": {
      const r = (c.rollup ?? {}) as Record<string, unknown>;
      const via = texto(r.via_field);
      if (!ctx.relacoes.has(via)) throw new ErroConfigCampo("escolha a relação que o rollup agrega");
      const agg = texto(r.agg) || "count";
      if (!["count", "sum", "avg", "min", "max"].includes(agg)) throw new ErroConfigCampo("agregação inválida");
      const expr = texto(r.expr);
      if (agg !== "count" && !expr) throw new ErroConfigCampo(`informe o campo (slug) a agregar com ${agg}`);
      const format = r.format === "currency" ? "currency" : undefined;
      return {
        rollup: {
          via_field: via,
          agg,
          ...(expr ? { expr } : {}),
          ...(texto(r.filter_expr) ? { filter_expr: texto(r.filter_expr) } : {}),
          ...(format ? { format } : {}),
        },
      };
    }
    case "dynamic_text": {
      const t = texto((c.dynamic_text as { template?: unknown } | undefined)?.template);
      if (!t) throw new ErroConfigCampo("informe o modelo do texto, ex.: {numero} · {qtd} parcelas");
      return { dynamic_text: { template: t } };
    }
    default:
      return {};
  }
}

/** Expressões CEL embutidas na config (para validar com parse()). */
export function expressoesDaConfig(config: Record<string, unknown>): { onde: string; fonte: string }[] {
  const saida: { onde: string; fonte: string }[] = [];
  const rel = config.relation as { filter_expr?: string } | undefined;
  if (rel?.filter_expr) saida.push({ onde: "filtro da relação", fonte: rel.filter_expr });
  const ro = config.rollup as { expr?: string; filter_expr?: string } | undefined;
  if (ro?.expr && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(ro.expr)) saida.push({ onde: "expressão do rollup", fonte: ro.expr });
  if (ro?.filter_expr) saida.push({ onde: "filtro do rollup", fonte: ro.filter_expr });
  const dt = config.dynamic_text as { template?: string } | undefined;
  for (const m of dt?.template?.matchAll(/\{([^{}]+)\}/g) ?? []) {
    const s = m[1].trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) saida.push({ onde: "trecho do texto calculado", fonte: s });
  }
  return saida;
}
