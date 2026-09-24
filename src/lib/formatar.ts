// Formatação para exibição (PT-BR). Puro: usado em server e client components.

export const TIPOS_CALCULADOS_UI = new Set(["sequence", "rollup", "dynamic_text", "formula", "lookup"]);

export interface CampoFmt {
  id: string;
  name: string;
  type: string;
  config?: Record<string, unknown>;
}

/** Primeiros 8 caracteres do uuid, para identificar cards com título repetido. */
export const idCurto = (id: string) => id.slice(0, 8);

export const tituloOu = (title: string | null | undefined, id: string) => (title && title.trim()) || `Sem título · ${idCurto(id)}`;

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 });

export function formatarData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function formatarDataHora(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
}

/** Valor bruto de props/computed → texto. pessoas: id → nome. */
export function formatarValor(campo: CampoFmt, v: unknown, pessoas?: Map<string, string>): string {
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return "";
  switch (campo.type) {
    case "currency": {
      const code = (campo.config?.currency as { code?: string } | undefined)?.code;
      return typeof v === "number"
        ? code && code !== "BRL"
          ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: code }).format(v)
          : moeda.format(v)
        : String(v);
    }
    case "rollup": {
      const fmt = (campo.config?.rollup as { format?: string } | undefined)?.format;
      if (typeof v !== "number") return String(v);
      return fmt === "currency" ? moeda.format(v) : numero.format(v);
    }
    case "number":
      return typeof v === "number" ? numero.format(v) : String(v);
    case "lookup": {
      // Valor de card relacionado: sem o tipo de origem, formata o básico (número, sim/não, listas).
      const um = (x: unknown) => (typeof x === "number" ? numero.format(x) : x === true ? "Sim" : x === false ? "Não" : typeof x === "object" && x ? JSON.stringify(x) : String(x));
      return Array.isArray(v) ? v.map(um).join(", ") : um(v);
    }
    case "date":
      return formatarData(String(v));
    case "datetime":
      return formatarDataHora(String(v));
    case "boolean":
      return v === true ? "Sim" : v === false ? "Não" : String(v);
    case "person":
      return (Array.isArray(v) ? v : [v]).map((id) => pessoas?.get(String(id)) ?? idCurto(String(id))).join(", ");
    case "cpf": {
      const s = String(v);
      return /^\d{11}$/.test(s) ? `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}` : s;
    }
    case "cnpj": {
      const s = String(v);
      return /^[0-9A-Z]{12}\d{2}$/.test(s) ? `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}` : s;
    }
    default:
      if (Array.isArray(v)) return v.map(String).join(", ");
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
  }
}

export interface EventoFmt {
  type: string;
  data: unknown;
}

export interface ContextoEventos {
  campos: Map<string, CampoFmt>;
  fases: Map<string, string>;
  cards?: Map<string, string>;
  pessoas?: Map<string, string>;
}

/** Evento do log → frase curta para o histórico do card. */
export function descreverEvento(e: EventoFmt, ctx: ContextoEventos): string {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const fase = (id: unknown) => (id ? ctx.fases.get(String(id)) ?? "fase removida" : "sem fase");
  const card = (id: unknown) => ctx.cards?.get(String(id)) ?? idCurto(String(id ?? ""));
  switch (e.type) {
    case "card.created":
      return d.phase_id ? `criou o card em ${fase(d.phase_id)}` : "criou o card";
    case "card.moved":
      return `moveu de ${fase(d.from_phase)} para ${fase(d.to_phase)}`;
    case "card.field_updated": {
      const campo = ctx.campos.get(String(d.field_id));
      const nome = campo?.name ?? "campo removido";
      const fmt = (v: unknown) => (campo ? formatarValor(campo, v, ctx.pessoas) : String(v ?? "")) || "vazio";
      const prefixo = d.computed ? "recalculou" : "alterou";
      return `${prefixo} ${nome}: ${fmt(d.old)} → ${fmt(d.new)}`;
    }
    case "card.link_added":
    case "card.link_removed": {
      const nome = ctx.campos.get(String(d.field_id))?.name ?? "relação";
      const outro = d.lado === "destino" ? d.from_card_id : d.to_card_id;
      const verbo = e.type === "card.link_added" ? "ligou" : "desligou";
      return `${verbo} ${card(outro)} (${nome})`;
    }
    case "card.deleted":
      return "excluiu o card";
    case "card.restored":
      return "restaurou o card";
    case "comment.added":
      return "comentou";
    default:
      return e.type;
  }
}

const EM_COMPUTED = new Set(["rollup", "dynamic_text", "formula", "lookup"]);

/**
 * Valor de um campo no card: calculados vêm de computed; o resto (inclusive sequence) de props.
 * Lookup: modo "ref" em computed, modo "copy" em props.
 */
export function valorDoCard(campo: { id: string; type: string }, card: { props: Record<string, unknown>; computed: Record<string, unknown> }): unknown {
  if (campo.type === "lookup") return card.computed[campo.id] ?? card.props[campo.id] ?? null;
  return (EM_COMPUTED.has(campo.type) ? card.computed[campo.id] : card.props[campo.id]) ?? null;
}
