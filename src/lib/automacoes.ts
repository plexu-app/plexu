// Automações (modo simples) e ações: formato de gatilhos e passos, validação e modelos {{ }}.
// Puro (sem banco): usado pelo motor (src/automacoes), pela configuração e pela UI.
import { parse } from "./expr";
import { parseCron } from "./cron";

// ---------------------------------------------------------------------------
// Gatilhos
// ---------------------------------------------------------------------------

export type Gatilho =
  | { type: "card_created" }
  | { type: "card_entered_phase"; phase: string }
  | { type: "card_left_phase"; phase: string }
  /** fields vazio = qualquer campo. */
  | { type: "field_updated"; fields: string[] }
  /** relation: campo de relação entre o card (pai) e os filhos; phase: fase dos filhos. */
  | { type: "all_children_in_phase"; relation: string; phase: string }
  /** Campo de data ± offset_days, na hora time (HH:MM); ou recorrência cron (5 campos). */
  | { type: "scheduled"; date_field: string; offset_days: number; time: string }
  | { type: "scheduled"; cron: string };

export type TipoGatilho = Gatilho["type"];

export const TIPOS_GATILHO: { tipo: TipoGatilho; rotulo: string }[] = [
  { tipo: "card_created", rotulo: "Card criado" },
  { tipo: "card_entered_phase", rotulo: "Card entrou na fase" },
  { tipo: "card_left_phase", rotulo: "Card saiu da fase" },
  { tipo: "field_updated", rotulo: "Campo alterado" },
  { tipo: "all_children_in_phase", rotulo: "Todos os filhos na fase" },
  { tipo: "scheduled", rotulo: "Agendado (data do card ou recorrência)" },
];

// ---------------------------------------------------------------------------
// Passos
// ---------------------------------------------------------------------------

/**
 * Card(s) em que um passo age. Padrão: o card do gatilho. parent/children: os cards ligados a ele pela
 * relação, com o mesmo sentido de pai/pais()/filhos() nas expressões (relação is_parent: origem é filho;
 * relação comum: a origem vê os destinos como filhos). Expressões e modelos são avaliados no card do gatilho.
 */
export type Alvo = { type: "self" } | { type: "parent" | "children"; relation: string };

export const ROTULO_ALVO: Record<Alvo["type"], string> = { self: "Este card", parent: "Pai", children: "Filhos" };

export type Passo =
  | { type: "move_card"; phase: string; target?: Alvo }
  /** value literal (null limpa) ou expr (CEL no contexto do card do gatilho). */
  | { type: "set_field"; field: string; value?: unknown; expr?: string; target?: Alvo }
  /** Cria card em board; relation (opcional) liga ao card do gatilho; fields: id do campo → CEL. */
  | { type: "create_related_card"; board: string; relation?: string | null; phase?: string | null; fields: Record<string, string> }
  | { type: "send_email"; to: string; subject: string; body: string }
  | { type: "http_request"; method: string; url: string; headers?: Record<string, string>; body?: string }
  | { type: "add_comment"; body: string; target?: Alvo };

export type TipoPasso = Passo["type"];

export const TIPOS_PASSO: { tipo: TipoPasso; rotulo: string }[] = [
  { tipo: "move_card", rotulo: "Mover card" },
  { tipo: "set_field", rotulo: "Preencher campo" },
  { tipo: "create_related_card", rotulo: "Criar card relacionado" },
  { tipo: "send_email", rotulo: "Enviar e-mail" },
  { tipo: "http_request", rotulo: "Requisição HTTP" },
  { tipo: "add_comment", rotulo: "Comentar no card" },
];

export const METODOS_HTTP = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

// ---------------------------------------------------------------------------
// Validação (mensagens para quem configura)
// ---------------------------------------------------------------------------

export class ErroAutomacao extends Error {}

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const exigir = (cond: unknown, msg: string) => {
  if (!cond) throw new ErroAutomacao(msg);
};
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function exprValida(fonte: string, onde: string) {
  const r = parse(fonte);
  if (!r.ok) throw new ErroAutomacao(`${onde}: ${r.erro.mensagem}`);
}

/** Valida os {{ }} de um modelo (cada trecho é CEL, exceto var.NOME). */
export function validarModelo(modelo: string, onde: string) {
  for (const t of trechosModelo(modelo)) if (t.tipo === "expr") exprValida(t.valor, onde);
}

export function normalizarGatilho(g: unknown): Gatilho {
  const o = (g ?? {}) as Record<string, unknown>;
  switch (o.type) {
    case "card_created":
      return { type: "card_created" };
    case "card_entered_phase":
    case "card_left_phase":
      exigir(texto(o.phase), "escolha a fase do gatilho");
      return { type: o.type, phase: texto(o.phase) };
    case "field_updated":
      return { type: "field_updated", fields: Array.isArray(o.fields) ? [...new Set(o.fields.map(String).filter(Boolean))] : [] };
    case "all_children_in_phase":
      exigir(texto(o.relation), "escolha a relação com os filhos");
      exigir(texto(o.phase), "escolha a fase dos filhos");
      return { type: "all_children_in_phase", relation: texto(o.relation), phase: texto(o.phase) };
    case "scheduled": {
      if (texto(o.cron)) {
        try {
          parseCron(texto(o.cron));
        } catch (e) {
          throw new ErroAutomacao((e as Error).message);
        }
        return { type: "scheduled", cron: texto(o.cron) };
      }
      exigir(texto(o.date_field), "escolha o campo de data (ou informe uma recorrência cron)");
      const offset = Number(o.offset_days ?? 0);
      exigir(Number.isInteger(offset) && Math.abs(offset) <= 3650, "dias antes/depois: inteiro entre -3650 e 3650");
      const time = texto(o.time) || "08:00";
      exigir(HORA.test(time), "hora no formato HH:MM");
      return { type: "scheduled", date_field: texto(o.date_field), offset_days: offset, time };
    }
    default:
      throw new ErroAutomacao(`gatilho desconhecido: ${String(o.type)}`);
  }
}

/** Alvo do passo; "este card" some do JSON (compatível com passos sem target). */
function alvoDe(o: Record<string, unknown>, onde: string): { target?: Alvo } {
  const t = (o.target ?? {}) as Record<string, unknown>;
  if (!o.target || t.type === "self" || !t.type) return {};
  exigir(t.type === "parent" || t.type === "children", `${onde}: alvo inválido`);
  exigir(texto(t.relation), `${onde}: escolha a relação do alvo`);
  return { target: { type: t.type as "parent" | "children", relation: texto(t.relation) } };
}

export function normalizarPasso(p: unknown, i: number): Passo {
  const o = (p ?? {}) as Record<string, unknown>;
  const onde = `passo ${i + 1}`;
  switch (o.type) {
    case "move_card":
      exigir(texto(o.phase), `${onde}: escolha a fase de destino`);
      return { type: "move_card", phase: texto(o.phase), ...alvoDe(o, onde) };
    case "set_field": {
      exigir(texto(o.field), `${onde}: escolha o campo`);
      if (texto(o.expr)) {
        exprValida(texto(o.expr), onde);
        return { type: "set_field", field: texto(o.field), expr: texto(o.expr), ...alvoDe(o, onde) };
      }
      return { type: "set_field", field: texto(o.field), value: o.value === undefined || o.value === "" ? null : o.value, ...alvoDe(o, onde) };
    }
    case "create_related_card": {
      exigir(texto(o.board), `${onde}: escolha o board do novo card`);
      const fields: Record<string, string> = {};
      for (const [k, v] of Object.entries((o.fields ?? {}) as Record<string, unknown>)) {
        if (!texto(v)) continue;
        exprValida(texto(v), `${onde} (${k})`);
        fields[k] = texto(v);
      }
      return { type: "create_related_card", board: texto(o.board), relation: texto(o.relation) || null, phase: texto(o.phase) || null, fields };
    }
    case "send_email":
      exigir(texto(o.to), `${onde}: informe o destinatário`);
      exigir(texto(o.subject), `${onde}: informe o assunto`);
      for (const k of ["to", "subject", "body"]) validarModelo(texto(o[k]), `${onde} (${k})`);
      return { type: "send_email", to: texto(o.to), subject: texto(o.subject), body: String(o.body ?? "") };
    case "http_request": {
      const method = texto(o.method).toUpperCase() || "POST";
      exigir((METODOS_HTTP as readonly string[]).includes(method), `${onde}: método HTTP inválido`);
      exigir(/^https?:\/\//i.test(texto(o.url)) || texto(o.url).startsWith("{{"), `${onde}: URL deve começar com http:// ou https://`);
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries((o.headers ?? {}) as Record<string, unknown>)) if (texto(k)) headers[texto(k)] = String(v ?? "");
      for (const v of [texto(o.url), String(o.body ?? ""), ...Object.values(headers)]) validarModelo(v, onde);
      return { type: "http_request", method, url: texto(o.url), headers, body: String(o.body ?? "") };
    }
    case "add_comment":
      exigir(texto(o.body), `${onde}: escreva o comentário`);
      validarModelo(texto(o.body), onde);
      return { type: "add_comment", body: texto(o.body), ...alvoDe(o, onde) };
    default:
      throw new ErroAutomacao(`${onde}: tipo de passo desconhecido: ${String(o.type)}`);
  }
}

export function normalizarPassos(ps: unknown): Passo[] {
  const lista = Array.isArray(ps) ? ps : [];
  exigir(lista.length <= 50, "no máximo 50 passos");
  return lista.map(normalizarPasso);
}

// ---------------------------------------------------------------------------
// Modelos: "Olá {{ card.nome }}", "Bearer {{ var.TOKEN }}"
// ---------------------------------------------------------------------------

export type Trecho = { tipo: "texto"; valor: string } | { tipo: "expr"; valor: string } | { tipo: "var"; valor: string };

export function trechosModelo(modelo: string): Trecho[] {
  const saida: Trecho[] = [];
  const re = /\{\{\s*([\s\S]*?)\s*\}\}/g;
  let ultimo = 0;
  for (const m of modelo.matchAll(re)) {
    if (m.index! > ultimo) saida.push({ tipo: "texto", valor: modelo.slice(ultimo, m.index) });
    const v = /^var\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(m[1]);
    saida.push(v ? { tipo: "var", valor: v[1] } : { tipo: "expr", valor: m[1] });
    ultimo = m.index! + m[0].length;
  }
  if (ultimo < modelo.length) saida.push({ tipo: "texto", valor: modelo.slice(ultimo) });
  return saida;
}

/** Texto de um valor no modelo: null vira vazio; listas por vírgula; objetos em JSON. */
export function textoDoValor(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(textoDoValor).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
