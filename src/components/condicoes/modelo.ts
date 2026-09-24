// Modelo do construtor visual de condições ↔ CEL. Puro (sem React), testável.
// Representa: grupos E/OU aninhados de condições [campo] [operador] [valor].
// O que não cabe no modelo (filhos(), funções, negação, aritmética…) só existe no modo avançado.
import { parse as parseCelAst, type ASTNode } from "@marcbachmann/cel-js";

export type Operador = "==" | "!=" | ">" | ">=" | "<" | "<=" | "contem" | "em" | "vazio" | "preenchido";
export type Literal = string | number | boolean;

export interface Condicao {
  tipo: "condicao";
  /** Caminho CEL do campo: card.<slug>, pai.<slug>, fase, fase_origem, fase_destino, usuario.<x> */
  campo: string;
  op: Operador;
  /** Ausente para vazio/preenchido; lista para "em". */
  valor?: Literal | Literal[];
}

export interface Grupo {
  tipo: "grupo";
  op: "&&" | "||";
  itens: No[];
}

export type No = Condicao | Grupo;

export const grupoVazio = (op: "&&" | "||" = "&&"): Grupo => ({ tipo: "grupo", op, itens: [] });

// ---------------------------------------------------------------------------
// Modelo → CEL
// ---------------------------------------------------------------------------

export function literalCel(v: Literal): string {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (!Number.isFinite(v)) throw new Error(`número inválido: ${v}`);
  return String(v);
}

function condicaoCel(c: Condicao): string {
  switch (c.op) {
    case "vazio":
      return `${c.campo} == null`;
    case "preenchido":
      return `${c.campo} != null`;
    case "contem":
      return `${c.campo}.contains(${literalCel(String(c.valor ?? ""))})`;
    case "em": {
      const lista = Array.isArray(c.valor) ? c.valor : c.valor === undefined ? [] : [c.valor];
      return `${c.campo} in [${lista.map(literalCel).join(", ")}]`;
    }
    default:
      if (c.valor === undefined || Array.isArray(c.valor)) throw new Error(`condição sem valor: ${c.campo} ${c.op}`);
      return `${c.campo} ${c.op} ${literalCel(c.valor)}`;
  }
}

/** Gera CEL canônico. Grupo vazio = "true". Subgrupos vão entre parênteses. */
export function gerarCel(no: No): string {
  if (no.tipo === "condicao") return condicaoCel(no);
  if (no.itens.length === 0) return "true";
  if (no.itens.length === 1) return gerarCel(no.itens[0]);
  return no.itens.map((i) => (i.tipo === "grupo" && i.itens.length > 1 ? `(${gerarCel(i)})` : gerarCel(i))).join(` ${no.op} `);
}

// ---------------------------------------------------------------------------
// CEL → modelo (null quando não representável)
// ---------------------------------------------------------------------------

const RAIZES = new Set(["card", "pai", "usuario"]);
const GLOBAIS = new Set(["fase", "fase_origem", "fase_destino"]);
const COMPARACOES = new Set(["==", "!=", ">", ">=", "<", "<="]);

function caminho(n: ASTNode): string | null {
  if (n.op === "id") return GLOBAIS.has(n.args) ? n.args : null;
  if (n.op === ".") {
    const [obj, campo] = n.args;
    if (obj.op === "id" && RAIZES.has(obj.args) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(campo)) return `${obj.args}.${campo}`;
  }
  return null;
}

const NULO = Symbol("nulo");

function literal(n: ASTNode): Literal | typeof NULO | undefined {
  if (n.op === "-_" && n.args.op === "value") {
    const v = literal(n.args);
    return typeof v === "number" ? -v : undefined;
  }
  if (n.op !== "value") return undefined;
  const v = n.args;
  if (v === null) return NULO;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  return undefined;
}

function deAst(n: ASTNode): No | null {
  if (n.op === "&&" || n.op === "||") {
    const itens: No[] = [];
    for (const lado of n.args) {
      const x = deAst(lado);
      if (!x) return null;
      if (x.tipo === "grupo" && x.op === n.op) itens.push(...x.itens);
      else itens.push(x);
    }
    return { tipo: "grupo", op: n.op, itens };
  }
  if (n.op === "value" && n.args === true) return grupoVazio();
  if (COMPARACOES.has(n.op)) {
    const [esq, dir] = n.args as [ASTNode, ASTNode];
    const campo = caminho(esq);
    const v = literal(dir);
    if (!campo || v === undefined) return null;
    if (v === NULO) {
      if (n.op === "==") return { tipo: "condicao", campo, op: "vazio" };
      if (n.op === "!=") return { tipo: "condicao", campo, op: "preenchido" };
      return null;
    }
    return { tipo: "condicao", campo, op: n.op as Operador, valor: v };
  }
  if (n.op === "in") {
    const [esq, dir] = n.args as [ASTNode, ASTNode];
    const campo = caminho(esq);
    if (!campo || dir.op !== "list") return null;
    const valores = dir.args.map(literal);
    if (valores.some((v) => v === undefined || v === NULO)) return null;
    return { tipo: "condicao", campo, op: "em", valor: valores as Literal[] };
  }
  if (n.op === "rcall") {
    const [metodo, receptor, args] = n.args;
    const campo = caminho(receptor);
    const v = args.length === 1 ? literal(args[0]) : undefined;
    if (metodo === "contains" && campo && typeof v === "string") return { tipo: "condicao", campo, op: "contem", valor: v };
  }
  return null;
}

/** Converte CEL em modelo; null se a sintaxe for inválida ou a expressão não couber no modo visual. */
export function parseCel(fonte: string): Grupo | null {
  const s = fonte.trim();
  if (!s) return grupoVazio();
  let ast: ASTNode;
  try {
    ast = parseCelAst(s).ast;
  } catch {
    return null;
  }
  const no = deAst(ast);
  if (!no) return null;
  return no.tipo === "grupo" ? no : { tipo: "grupo", op: "&&", itens: [no] };
}

// ---------------------------------------------------------------------------
// Resumo em português
// ---------------------------------------------------------------------------

const TEXTO_OP: Record<Operador, string> = {
  "==": "é",
  "!=": "não é",
  ">": ">",
  ">=": "≥",
  "<": "<",
  "<=": "≤",
  contem: "contém",
  em: "é um de",
  vazio: "está vazio",
  preenchido: "está preenchido",
};

const fmtLiteral = (v: Literal) => (typeof v === "boolean" ? (v ? "sim" : "não") : typeof v === "string" ? `"${v}"` : String(v).replace(".", ","));

/** "Objeto está preenchido e Valor global > 1000". rotulo: caminho → nome amigável. */
export function resumir(no: No, rotulo: (campo: string) => string = (c) => c): string {
  if (no.tipo === "grupo") {
    if (!no.itens.length) return "sempre";
    const partes = no.itens.map((i) => (i.tipo === "grupo" && i.itens.length > 1 ? `(${resumir(i, rotulo)})` : resumir(i, rotulo)));
    return partes.join(no.op === "&&" ? " e " : " ou ");
  }
  const nome = rotulo(no.campo);
  if (no.op === "vazio" || no.op === "preenchido") return `${nome} ${TEXTO_OP[no.op]}`;
  const valor = Array.isArray(no.valor) ? no.valor.map(fmtLiteral).join(", ") : no.valor === undefined ? "?" : fmtLiteral(no.valor);
  return `${nome} ${TEXTO_OP[no.op]} ${valor}`;
}
