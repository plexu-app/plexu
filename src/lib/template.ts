// Formato de template do Plexu (docs/TEMPLATE.md): configuração de um ou mais boards em JSON —
// fases, campos, relações, regras — sem cards. Base de snapshots, templates e importadores.
// Tudo é referenciado por `key` (estável, legível) em vez de UUID; o importador resolve as keys.
// Puro: tipos, normalização e validação. A escrita no banco fica em src/db/template.ts.
import { parse } from "./expr";
import { TIPOS_VALIDOS } from "./config-campos";

export const VERSAO_TEMPLATE = 1;

export type TipoRegra = "can_enter" | "can_leave" | "can_back" | "can_edit" | "can_delete" | "can_create";
export const TIPOS_REGRA: TipoRegra[] = ["can_enter", "can_leave", "can_back", "can_edit", "can_delete", "can_create"];

export interface FaseTemplate {
  key: string;
  name: string;
  terminal?: boolean;
  color?: string | null;
}

export interface AjusteFaseTemplate {
  phase: string;
  visible?: boolean | null;
  editable?: boolean | null;
  required?: boolean | null;
}

export interface CampoTemplate {
  key: string;
  name: string;
  type: string;
  help?: string | null;
  /** Expressões CEL (null = sem). "true" = sempre obrigatório. */
  required?: string | null;
  visible?: string | null;
  default?: string | null;
  unique?: boolean;
  /** Decisão 18-revisada: keys das fases onde o campo é preenchido. */
  fill_phases?: string[];
  editable_everywhere?: boolean;
  options?: string[];
  currency?: { code: string };
  multiple?: boolean;
  relation?: {
    /** key de um board do template, ou slug de um board que já existe no workspace de destino. */
    board: string;
    cardinality?: "one" | "many";
    exclusive?: boolean;
    is_parent?: boolean;
    inverse_name?: string;
    filter?: string;
  };
  sequence?: { pattern: string; scope?: "global" | "year" | "month" | "day" | "parent"; seed?: number; pad?: number; parent_field?: string };
  /** via: key de relação deste board, ou "<board>.<campo>" para relação de outro board que aponta para este. */
  rollup?: { via: string; agg: "count" | "sum" | "avg" | "min" | "max"; expr?: string; filter?: string; format?: "currency" };
  dynamic_text?: { template: string };
  phase_settings?: AjusteFaseTemplate[];
}

export interface RegraTemplate {
  kind: TipoRegra;
  /** key da fase (null = todas). */
  phase?: string | null;
  field?: string | null;
  expr: string;
  message?: string | null;
  enabled?: boolean;
}

/** Espaço reservado: o Plexu ainda não executa automações; ficam registradas para revisão. */
export interface AutomacaoTemplate {
  key: string;
  name: string;
  trigger: { event: string; phase?: string | null; fields?: string[] };
  condition?: string | null;
  actions: { type: string; params?: Record<string, unknown> }[];
  /** "pendente": sem equivalente ainda; o importador não cria nada, só conta. */
  status: "pendente";
  note?: string;
}

export interface BoardTemplate {
  key: string;
  name: string;
  kind: "workflow" | "database";
  title_field?: string | null;
  phases: FaseTemplate[];
  fields: CampoTemplate[];
  rules?: RegraTemplate[];
  automations?: AutomacaoTemplate[];
}

export interface Template {
  plexu_template: number;
  name: string;
  description?: string;
  boards: BoardTemplate[];
}

export interface ErroTemplate {
  onde: string;
  mensagem: string;
}

const KEY = /^[a-z0-9_][a-z0-9_-]{0,47}$/;
const CAMPO_KEY = /^[a-z_][a-z0-9_]{0,39}$/;

/**
 * Valida a estrutura: keys únicas e referenciadas, tipos conhecidos, config por tipo e expressões
 * CEL que compilam. `externos`: slugs de boards que já existem no destino (para relações de fora).
 */
export function validarTemplate(t: Template, externos: Iterable<string> = []): ErroTemplate[] {
  const erros: ErroTemplate[] = [];
  const err = (onde: string, mensagem: string) => erros.push({ onde, mensagem });
  if (t?.plexu_template !== VERSAO_TEMPLATE) err("template", `plexu_template deve ser ${VERSAO_TEMPLATE}`);
  if (!Array.isArray(t?.boards) || !t.boards.length) {
    err("template", "sem boards");
    return erros;
  }
  const boards = new Map(t.boards.map((b) => [b.key, b]));
  const fora = new Set(externos);
  if (boards.size !== t.boards.length) err("template", "keys de board repetidas");
  const expr = (onde: string, fonte: string | null | undefined) => {
    if (!fonte) return;
    const r = parse(fonte);
    if (!r.ok) err(onde, `expressão inválida: ${r.erro.mensagem}`);
  };

  for (const b of t.boards) {
    const ob = `board ${b.key}`;
    if (!KEY.test(b.key ?? "")) err(ob, "key inválida (minúsculas, dígitos, _ ou -)");
    if (!b.name?.trim()) err(ob, "nome obrigatório");
    if (b.kind !== "workflow" && b.kind !== "database") err(ob, "kind deve ser workflow ou database");
    const fases = new Set((b.phases ?? []).map((f) => f.key));
    if (fases.size !== (b.phases ?? []).length) err(ob, "keys de fase repetidas");
    const campos = new Map((b.fields ?? []).map((c) => [c.key, c]));
    if (campos.size !== (b.fields ?? []).length) err(ob, "keys de campo repetidas");
    if (b.title_field && !campos.has(b.title_field)) err(ob, `title_field ${b.title_field} não existe`);

    for (const c of b.fields ?? []) {
      const oc = `${ob} › campo ${c.key}`;
      if (!CAMPO_KEY.test(c.key ?? "")) err(oc, "key inválida (identificador CEL: minúsculas, dígitos e _)");
      if (!TIPOS_VALIDOS.has(c.type)) err(oc, `tipo desconhecido: ${c.type}`);
      for (const f of c.fill_phases ?? []) if (!fases.has(f)) err(oc, `fill_phases: fase ${f} não existe`);
      for (const a of c.phase_settings ?? []) if (!fases.has(a.phase)) err(oc, `phase_settings: fase ${a.phase} não existe`);
      expr(`${oc} › required`, c.required);
      expr(`${oc} › visible`, c.visible);
      expr(`${oc} › default`, c.default);
      if ((c.type === "select" || c.type === "multi_select") && !c.options?.length) err(oc, "seleção sem opções");
      if (c.type === "relation") {
        const alvo = c.relation?.board;
        if (!alvo) err(oc, "relação sem board");
        else if (!boards.has(alvo) && !fora.has(alvo)) err(oc, `relação para board desconhecido: ${alvo}`);
        expr(`${oc} › relation.filter`, c.relation?.filter);
      }
      if (c.type === "sequence") {
        if (!/\{n(:\d+)?\}/.test(c.sequence?.pattern ?? "")) err(oc, "sequence.pattern precisa conter {n}");
        if (c.sequence?.scope === "parent" && !campos.has(c.sequence.parent_field ?? "")) err(oc, "sequence.parent_field não existe");
      }
      if (c.type === "rollup") {
        const via = c.rollup?.via ?? "";
        const [bk, ck] = via.includes(".") ? via.split(".") : [b.key, via];
        const rel = boards.get(bk)?.fields.find((x) => x.key === ck);
        if (!rel || rel.type !== "relation") err(oc, `rollup.via não é uma relação: ${via}`);
        else if (bk !== b.key && rel.relation?.board !== b.key) err(oc, `rollup.via ${via} não aponta para este board`);
        if (c.rollup?.agg !== "count" && !c.rollup?.expr) err(oc, "rollup sem expr (campo a agregar)");
        expr(`${oc} › rollup.filter`, c.rollup?.filter);
      }
      if (c.type === "dynamic_text") {
        if (!c.dynamic_text?.template) err(oc, "dynamic_text sem template");
        for (const m of c.dynamic_text?.template?.matchAll(/\{([^{}]+)\}/g) ?? []) {
          const s = m[1].trim();
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) expr(`${oc} › dynamic_text`, s);
        }
      }
    }
    for (const [i, r] of (b.rules ?? []).entries()) {
      const or = `${ob} › regra ${i + 1}`;
      if (!TIPOS_REGRA.includes(r.kind)) err(or, `kind inválido: ${r.kind}`);
      if (r.phase && !fases.has(r.phase)) err(or, `fase ${r.phase} não existe`);
      if (r.field && !campos.has(r.field)) err(or, `campo ${r.field} não existe`);
      if (!r.expr?.trim()) err(or, "expr obrigatória");
      else expr(or, r.expr);
    }
  }
  return erros;
}

/** Resumo para mensagens: contagens por board. */
export function resumoTemplate(t: Template) {
  return t.boards.map((b) => ({
    board: b.key,
    fases: b.phases.length,
    campos: b.fields.length,
    regras: b.rules?.length ?? 0,
    automacoesPendentes: b.automations?.length ?? 0,
  }));
}
