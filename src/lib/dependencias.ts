// "Dependências do campo" (prompt PR 2, C1): onde o campo é usado — regras, automações, condicionais,
// expressões de outros campos, campos calculados e relações. Puro: recebe a estrutura do board.
import type { Condicional } from "./condicionais";

export interface Dependencia {
  tipo: "regra" | "automacao" | "condicional" | "expressao" | "calculado" | "relacao" | "cartao";
  nome: string;
}

interface CampoDep {
  id: string;
  slug: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  visibleExpr: string | null;
  requiredExpr: string | null;
  defaultValueExpr: string | null;
}

const ROTULO_REGRA: Record<string, string> = {
  can_enter: "entrar na fase",
  can_leave: "sair da fase",
  can_back: "voltar de fase",
  can_edit: "editar campo",
  can_create: "criar card",
  can_delete: "excluir card",
};

/** O texto (expressão, JSON de config) menciona o campo: card.<slug>, {slug} de modelo ou o id. */
export function menciona(texto: string | null | undefined, campo: { id: string; slug: string }): boolean {
  if (!texto) return false;
  const slug = campo.slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return texto.includes(campo.id) || new RegExp(`\\b(card|pai)\\.${slug}\\b`).test(texto) || new RegExp(`\\{\\s*${slug}\\s*\\}`).test(texto);
}

export function dependenciasDosCampos(
  campos: CampoDep[],
  extras: {
    regras: { kind: string; expr: string; fieldId: string | null; message: string | null }[];
    automacoes: { nome: string; trigger: unknown; condicao: string | null; steps: unknown }[];
    condicionais: Condicional[];
    kanban: { campos?: string[]; prazo?: string | null };
  },
): Record<string, Dependencia[]> {
  const saida: Record<string, Dependencia[]> = {};
  for (const f of campos) {
    const lista: Dependencia[] = [];
    for (const r of extras.regras) {
      if (r.fieldId === f.id || menciona(r.expr, f)) lista.push({ tipo: "regra", nome: `Regra de ${ROTULO_REGRA[r.kind] ?? r.kind}${r.message ? `: ${r.message}` : ""}` });
    }
    for (const a of extras.automacoes) {
      if (menciona(JSON.stringify([a.trigger, a.steps]), f) || menciona(a.condicao, f)) lista.push({ tipo: "automacao", nome: `Automação: ${a.nome}` });
    }
    for (const c of extras.condicionais) {
      const alvo = [...c.seVerdadeiro, ...c.seFalso].some((x) => x.campos.includes(f.id));
      if (alvo || menciona(c.condicao, f)) lista.push({ tipo: "condicional", nome: `Condicional: ${c.nome}${alvo ? "" : " (na condição)"}` });
    }
    for (const o of campos) {
      if (o.id === f.id) continue;
      if ([o.visibleExpr, o.requiredExpr, o.defaultValueExpr].some((e) => menciona(e, f))) lista.push({ tipo: "expressao", nome: `Expressão do campo ${o.name}` });
      const cfg = o.config ?? {};
      const via = (k: string) => (cfg[k] as { via_field?: string } | undefined)?.via_field === f.id;
      // rollup/lookup: a relação por onde passam (a expressão do rollup fala de campos do outro board)
      if (via("rollup") || via("lookup") || menciona(JSON.stringify(cfg.dynamic_text ?? null), f))
        lista.push({ tipo: "calculado", nome: `Campo calculado ${o.name}` });
      const rel = cfg.relation as { lock_fields_while_linked?: string[] } | undefined;
      if (rel?.lock_fields_while_linked?.includes(f.id)) lista.push({ tipo: "relacao", nome: `Travado pela relação ${o.name}` });
      if ((cfg.sequence as { parent_field?: string } | undefined)?.parent_field && [f.id, f.slug].includes(String((cfg.sequence as { parent_field?: string }).parent_field)))
        lista.push({ tipo: "relacao", nome: `Escopo da sequência ${o.name}` });
    }
    if (extras.kanban.campos?.includes(f.id)) lista.push({ tipo: "cartao", nome: "Campos no card do kanban" });
    if (extras.kanban.prazo === f.id) lista.push({ tipo: "cartao", nome: "Prazo do card no kanban" });
    saida[f.id] = lista;
  }
  return saida;
}
