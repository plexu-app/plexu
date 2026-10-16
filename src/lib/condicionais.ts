// Condicionais em campos (prompt PR 2, C1): "se <condição>, quando verdadeiro faça X, quando falso faça Y",
// em lista ordenada. Compiladas para o que o core já entende: visible_expr / required_expr de cada campo e
// regras can_edit ("bloquear edição"). Puro e testável.
//
// Semântica:
//  - "Exibir" num campo faz ele começar oculto (só aparece quando a ação vale); "Ocultar" faz começar
//    visível. O mesmo para "Tornar obrigatório" (começa opcional) e "Tornar opcional" (começa obrigatório).
//  - A ordem importa: as condicionais são aplicadas em sequência e a última que se aplica vence.
//  - "Bloquear edição": regra can_edit do campo que só permite editar quando nenhuma condicional bloqueia.

export type AcaoCondicional = "exibir" | "ocultar" | "obrigatorio" | "opcional" | "bloquear";

export const ACOES_CONDICIONAL: { acao: AcaoCondicional; rotulo: string }[] = [
  { acao: "exibir", rotulo: "Exibir" },
  { acao: "ocultar", rotulo: "Ocultar" },
  { acao: "obrigatorio", rotulo: "Tornar obrigatório" },
  { acao: "opcional", rotulo: "Tornar opcional" },
  { acao: "bloquear", rotulo: "Bloquear edição" },
];

export interface AcaoEmCampos {
  acao: AcaoCondicional;
  campos: string[];
}

export interface Condicional {
  id: string;
  nome: string;
  /** Expressão CEL (do construtor de condições). */
  condicao: string;
  seVerdadeiro: AcaoEmCampos[];
  seFalso: AcaoEmCampos[];
}

export interface Compilado {
  /** visible_expr por campo (só campos com exibir/ocultar). */
  visivel: Record<string, string>;
  /** required_expr por campo (só campos com obrigatório/opcional). */
  obrigatorio: Record<string, string>;
  /** Regra can_edit por campo: expressão que precisa ser verdadeira para editar, e quais condicionais bloqueiam. */
  bloqueio: Record<string, { expr: string; nomes: string[] }>;
}

const P = (e: string) => (/^[\w.]+$/.test(e) || /^\(.*\)$/.test(e) ? e : `(${e})`);

/** `c ? a : b` simplificado quando a ou b é true/false. */
function se(c: string, a: string, b: string): string {
  if (a === b) return a;
  if (a === "true" && b === "false") return P(c);
  if (a === "false" && b === "true") return `!${P(c)}`;
  if (a === "true") return `${P(c)} || ${P(b)}`;
  if (a === "false") return `!${P(c)} && ${P(b)}`;
  if (b === "true") return `!${P(c)} || ${P(a)}`;
  if (b === "false") return `${P(c)} && ${P(a)}`;
  return `${P(c)} ? ${P(a)} : ${P(b)}`;
}

/** Valor que a condicional dá ao aspecto num campo: no ramo verdadeiro e no falso (undefined = não mexe). */
function efeito(c: Condicional, campo: string, sim: AcaoCondicional, nao: AcaoCondicional): { v?: string; f?: string } {
  const em = (lista: AcaoEmCampos[]) => {
    for (const a of [...lista].reverse()) {
      if (!a.campos.includes(campo)) continue;
      if (a.acao === sim) return "true";
      if (a.acao === nao) return "false";
    }
    return undefined;
  };
  return { v: em(c.seVerdadeiro), f: em(c.seFalso) };
}

function aspecto(lista: Condicional[], campo: string, sim: AcaoCondicional, nao: AcaoCondicional): string | null {
  const toca = lista.filter((c) => [...c.seVerdadeiro, ...c.seFalso].some((a) => a.campos.includes(campo) && (a.acao === sim || a.acao === nao)));
  if (!toca.length) return null;
  const usaSim = toca.some((c) => [...c.seVerdadeiro, ...c.seFalso].some((a) => a.campos.includes(campo) && a.acao === sim));
  let e = usaSim ? "false" : "true";
  for (const c of toca) {
    const { v, f } = efeito(c, campo, sim, nao);
    e = se(c.condicao.trim() || "true", v ?? e, f ?? e);
  }
  return e;
}

export function compilarCondicionais(lista: Condicional[]): Compilado {
  const campos = [...new Set(lista.flatMap((c) => [...c.seVerdadeiro, ...c.seFalso].flatMap((a) => a.campos)))];
  const saida: Compilado = { visivel: {}, obrigatorio: {}, bloqueio: {} };
  for (const id of campos) {
    const v = aspecto(lista, id, "exibir", "ocultar");
    if (v !== null) saida.visivel[id] = v;
    const r = aspecto(lista, id, "obrigatorio", "opcional");
    if (r !== null) saida.obrigatorio[id] = r;
    // Bloquear: pode editar quando nenhuma condicional que bloqueia o campo está no ramo que bloqueia.
    const permite: string[] = [];
    const nomes: string[] = [];
    for (const c of lista) {
      const cond = c.condicao.trim() || "true";
      const naVerdade = c.seVerdadeiro.some((a) => a.acao === "bloquear" && a.campos.includes(id));
      const naFalsidade = c.seFalso.some((a) => a.acao === "bloquear" && a.campos.includes(id));
      if (naVerdade && naFalsidade) permite.push("false");
      else if (naVerdade) permite.push(`!${P(cond)}`);
      else if (naFalsidade) permite.push(P(cond));
      else continue;
      nomes.push(c.nome);
    }
    if (permite.length) saida.bloqueio[id] = { expr: permite.includes("false") ? "false" : permite.join(" && "), nomes };
  }
  return saida;
}

/** Valida a lista (ids e campos existentes, ações conhecidas); devolve a lista limpa ou o motivo. */
export function normalizarCondicionais(entrada: unknown, camposValidos: Set<string>): Condicional[] | string {
  if (!Array.isArray(entrada)) return "lista de condicionais inválida";
  const acoes = new Set(ACOES_CONDICIONAL.map((a) => a.acao));
  const saida: Condicional[] = [];
  for (const [i, bruto] of entrada.entries()) {
    const c = (bruto ?? {}) as Record<string, unknown>;
    const nome = String(c.nome ?? "").trim().slice(0, 120);
    if (!nome) return `condicional ${i + 1}: dê um nome`;
    const ramos = (x: unknown): AcaoEmCampos[] | string => {
      if (!Array.isArray(x)) return [];
      const r: AcaoEmCampos[] = [];
      for (const a of x as Record<string, unknown>[]) {
        const acao = String(a?.acao ?? "") as AcaoCondicional;
        if (!acoes.has(acao)) return `condicional "${nome}": ação inválida`;
        const campos = [...new Set((Array.isArray(a.campos) ? a.campos : []).map(String))];
        if (campos.some((id) => !camposValidos.has(id))) return `condicional "${nome}": campo inexistente`;
        if (campos.length) r.push({ acao, campos });
      }
      return r;
    };
    const v = ramos(c.seVerdadeiro);
    const f = ramos(c.seFalso);
    if (typeof v === "string") return v;
    if (typeof f === "string") return f;
    if (!v.length && !f.length) return `condicional "${nome}": escolha ao menos uma ação`;
    saida.push({ id: String(c.id ?? "") || `c${i + 1}`, nome, condicao: String(c.condicao ?? "").trim(), seVerdadeiro: v, seFalso: f });
  }
  return saida;
}
