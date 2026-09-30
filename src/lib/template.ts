// Formato de template do Plexu (docs/TEMPLATE.md): configuração de um ou mais boards em JSON —
// fases, campos, relações, regras — sem cards. Base de snapshots, templates e importadores.
// Tudo é referenciado por `key` (estável, legível) em vez de UUID; o importador resolve as keys.
// Puro: tipos, normalização e validação. A escrita no banco fica em src/db/template.ts.
import { parse } from "./expr";
import { TIPOS_VALIDOS } from "./config-campos";
import { normalizarGatilho, normalizarPassos } from "./automacoes";

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
  /** Formato de campos de texto: regex (JavaScript) e mensagem mostrada abaixo do campo quando não bate. */
  validation?: { regex?: string; message?: string; description?: string };
  /** Decisão 18-revisada: keys das fases onde o campo é preenchido. */
  fill_phases?: string[];
  editable_everywhere?: boolean;
  options?: string[];
  currency?: { code: string };
  multiple?: boolean;
  /** Anexo: extensões/tipos aceitos (".pdf, image/*"). */
  accept?: string;
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
  /** Valor de card relacionado. via como em rollup; path: slug do campo lá (ou titulo, fase, status). */
  /** editable_writeback (só "ref"): editar o espelho grava no card de origem. */
  lookup?: { via: string; path: string; mode?: "ref" | "copy"; editable_writeback?: boolean };
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
/** Automação sem equivalente no Plexu (ainda): o importador não cria nada, só conta. */
export interface AutomacaoPendente {
  key: string;
  name: string;
  trigger: { event: string; phase?: string | null; fields?: string[] };
  condition?: string | null;
  actions: { type: string; params?: Record<string, unknown> }[];
  status: "pendente";
  note?: string;
}

/**
 * Automação do motor v1 (src/lib/automacoes.ts) com keys no lugar de ids: fases e campos por key do
 * board; relações como em rollup.via ("campo" deste board ou "board.campo"); em all_children_in_phase,
 * a fase é do board dos filhos; em create_related_card, board/fase/campos são do board do novo card.
 */
export interface AutomacaoConvertida {
  key: string;
  name: string;
  status: "convertida";
  /** Padrão: draft (não dispara até alguém publicar). */
  env?: "draft" | "test" | "published";
  trigger: Record<string, unknown> & { type: string };
  condition?: string | null;
  steps: (Record<string, unknown> & { type: string })[];
  suppress_triggers?: boolean;
  note?: string;
}

export type AutomacaoTemplate = AutomacaoPendente | AutomacaoConvertida;

/** Resolve keys do template (fase, campo, board) para a referência final (id no importador). */
export interface ResolvedorRefs {
  fase(boardKey: string, faseKey: string): string | null;
  campo(boardKey: string, campoKey: string): string | null;
  board(boardKey: string): string | null;
}

/**
 * Troca as keys de uma automação convertida pelas referências do resolvedor (ids ao importar). Devolve
 * erros legíveis em vez de lançar, para a validação listar tudo de uma vez.
 */
export function referenciasAutomacao(a: AutomacaoConvertida, b: BoardTemplate, t: Template, r: ResolvedorRefs) {
  const erros: string[] = [];
  const boards = new Map(t.boards.map((x) => [x.key, x]));
  const exigir = <T>(v: T | null, msg: string): T | string => (v === null || v === undefined ? (erros.push(msg), "") : v);
  const fase = (bk: string, k: unknown) => exigir(r.fase(bk, String(k ?? "")), `fase ${String(k)} não existe em ${bk}`);
  const campo = (bk: string, k: unknown) => exigir(r.campo(bk, String(k ?? "")), `campo ${String(k)} não existe em ${bk}`);
  /** Relação "campo" ou "board.campo" que liga b a outro board; devolve id e o board do outro lado. */
  const relacao = (via: unknown): { id: string; outro: string } => {
    const v = String(via ?? "");
    const [bk, ck] = v.includes(".") ? v.split(".") : [b.key, v];
    const rel = boards.get(bk)?.fields.find((x) => x.key === ck && x.type === "relation");
    const outro = rel ? (bk === b.key ? rel.relation?.board ?? "" : bk) : "";
    if (!rel || (bk !== b.key && rel.relation?.board !== b.key)) {
      erros.push(`relação ${v} não liga este board a outro`);
      return { id: "", outro: "" };
    }
    return { id: String(campo(bk, ck)), outro };
  };
  const g = { ...a.trigger };
  if (g.type === "card_entered_phase" || g.type === "card_left_phase") g.phase = fase(b.key, g.phase);
  if (g.type === "field_updated") g.fields = ((g.fields as unknown[]) ?? []).map((f) => campo(b.key, f));
  if (g.type === "scheduled" && g.date_field !== undefined) g.date_field = campo(b.key, g.date_field);
  if (g.type === "all_children_in_phase") {
    const rel = relacao(g.relation);
    g.relation = rel.id;
    if (rel.outro) g.phase = fase(rel.outro, g.phase);
  }
  const steps = (a.steps ?? []).map((p0) => {
    const p: Record<string, unknown> = { ...p0 };
    if (p.type === "move_card") p.phase = fase(b.key, p.phase);
    if (p.type === "set_field") p.field = campo(b.key, p.field);
    if (p.type === "create_related_card") {
      const alvo = String(p.board ?? "");
      if (!boards.has(alvo)) erros.push(`board ${alvo} não existe no template`);
      else {
        if (p.relation) {
          const rel = relacao(p.relation);
          if (rel.outro && rel.outro !== alvo) erros.push(`relação ${String(p.relation)} não liga ao board ${alvo}`);
          p.relation = rel.id;
        }
        if (p.phase) p.phase = fase(alvo, p.phase);
        p.fields = Object.fromEntries(Object.entries((p.fields ?? {}) as Record<string, string>).map(([k, v]) => [campo(alvo, k), v]));
      }
      p.board = exigir(r.board(alvo), `board ${alvo} não existe`);
    }
    return p;
  });
  return { trigger: g, steps, erros };
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
      if (c.validation?.regex) {
        try {
          new RegExp(c.validation.regex);
        } catch (e) {
          err(oc, `validation.regex inválido: ${(e as Error).message}`);
        }
      }
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
      if (c.type === "lookup") {
        const via = c.lookup?.via ?? "";
        const [bk, ck] = via.includes(".") ? via.split(".") : [b.key, via];
        const rel = boards.get(bk)?.fields.find((x) => x.key === ck);
        if (!rel || rel.type !== "relation") err(oc, `lookup.via não é uma relação: ${via}`);
        else if (bk !== b.key && rel.relation?.board !== b.key) err(oc, `lookup.via ${via} não aponta para este board`);
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.lookup?.path ?? "")) err(oc, "lookup.path deve ser o identificador de um campo do card relacionado");
        if (c.lookup?.editable_writeback && c.lookup.mode === "copy") err(oc, "lookup.editable_writeback só vale com mode \"ref\"");
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
    for (const a of b.automations ?? []) {
      const oa = `${ob} › automação ${a.key}`;
      if (a.status === "pendente") continue;
      if (a.status !== "convertida") {
        err(oa, "status deve ser pendente ou convertida");
        continue;
      }
      if (!a.name?.trim()) err(oa, "nome obrigatório");
      if (a.env && !["draft", "test", "published"].includes(a.env)) err(oa, `env inválido: ${a.env}`);
      const refs = referenciasAutomacao(a, b, t, {
        fase: (bk, k) => (boards.get(bk)?.phases.some((f) => f.key === k) ? k : null),
        campo: (bk, k) => (boards.get(bk)?.fields.some((c) => c.key === k) ? k : null),
        board: (bk) => (boards.has(bk) ? bk : null),
      });
      for (const m of refs.erros) err(oa, m);
      if (!refs.erros.length)
        try {
          normalizarGatilho(refs.trigger);
          if (!normalizarPassos(refs.steps).length) err(oa, "sem passos");
        } catch (e) {
          err(oa, (e as Error).message);
        }
      expr(`${oa} › condição`, a.condition);
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
    automacoesPendentes: (b.automations ?? []).filter((a) => a.status === "pendente").length,
    automacoes: (b.automations ?? []).filter((a) => a.status === "convertida").length,
  }));
}
