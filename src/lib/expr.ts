// Motor de expressões (regras, condições, visibilidade, fórmulas).
// Contrato: docs/PRODUTO.md decisão 15 e docs/schema.sql (tabela rules).
//
// Sintaxe: CEL (Common Expression Language), via @marcbachmann/cel-js.
// Contexto exposto, em português:
//   card.<slug>                      valor de campo do card atual (props + computed); ausente == null
//   pai.<slug>                       card pai (relação is_parent) ou null
//   pais(<rel>) / filhos(<rel>)      lista de cards ligados pela relação
//     .todos(x, cond) .algum(x, cond)  quantificadores (x opcional: sem x, usar "item")
//     .contar()  .soma(<slug>)         agregações
//   fase, fase_origem, fase_destino  nomes/ids de fase (string ou null)
//   usuario                          { id, email, ... } do usuário que dispara a ação
//   hoje()                           data local do servidor, "AAAA-MM-DD" (sobreponível no contexto)
//   existe(<board>, x, cond)         algum card do board satisfaz cond (x opcional: usar "item")
//   cartoes(<board>)                 lista de cards de um board do workspace
// Todas as macros padrão do CEL continuam disponíveis (all, exists, filter, map, size...).
// has(card.x) reflete presença real da chave em props/computed (campo ausente lê null).
// Limites estruturais em LIMITES; @marcbachmann/cel-js fixado em VERSAO_CEL_JS.
//
// O motor não acessa banco: filhos/pais/cartoes vêm de um resolver injetado no contexto,
// com os dados já carregados pelo chamador.

import {
  Environment,
  EvaluationError,
  ParseError,
  TypeError as CelTypeError,
  serialize,
  type ASTNode,
} from "@marcbachmann/cel-js";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

/** Dados de um card como a expressão os vê: slug do campo → valor (props + computed). */
export type Registro = Record<string, unknown>;

/** Fonte de dados para relações e consultas. Recebe dados já carregados; nunca vai ao banco. */
export interface ExprResolver {
  /** Cards ligados ao card atual pela relação, no lado "filhos". */
  filhos(relacao: string): Registro[];
  /** Cards ligados ao card atual pela relação, no lado "pais". */
  pais(relacao: string): Registro[];
  /** Cards de um board do workspace (base de existe(board, ...) e cartoes(board)). */
  cartoes(board: string): Registro[];
}

export interface ExprContext {
  card: Registro;
  pai?: Registro | null;
  fase?: string | null;
  fase_origem?: string | null;
  fase_destino?: string | null;
  usuario?: Registro | null;
  /** Data de referência de hoje(). Padrão: data local do servidor no momento da avaliação. */
  hoje?: string | Date;
  resolver?: Partial<ExprResolver>;
}

export interface Posicao {
  inicio: number;
  fim: number;
}

/** Referências usadas por uma expressão (para dependências, invalidação de rollups e lint). */
export interface Referencias {
  /** Slugs lidos em card.<slug>. */
  card: string[];
  /** Slugs lidos em pai.<slug>. */
  pai: string[];
  /** Relações usadas em filhos(<rel>). */
  filhos: string[];
  /** Relações usadas em pais(<rel>). */
  pais: string[];
  /** Boards usados em existe(<board>, ...) e cartoes(<board>). */
  boards: string[];
  /** Globais usados: fase, fase_origem, fase_destino, usuario, hoje. */
  globais: string[];
}

export type TipoAviso = "tautologia" | "contradicao" | "redundancia" | "referencia_dinamica";

export interface Aviso {
  tipo: TipoAviso;
  mensagem: string;
  posicao: Posicao;
}

export type CodigoErro = "sintaxe" | "tipo" | "avaliacao";

export class ExprError extends Error {
  readonly codigo: CodigoErro;
  readonly posicao?: Posicao;
  constructor(mensagem: string, codigo: CodigoErro, posicao?: Posicao) {
    super(mensagem);
    this.name = "ExprError";
    this.codigo = codigo;
    this.posicao = posicao;
  }
}

export interface ExprCompilada {
  readonly fonte: string;
  readonly referencias: Referencias;
  readonly avisos: Aviso[];
  /** Avalia e devolve o valor (inteiros CEL viram number; registros viram objetos). */
  evaluate(ctx: ExprContext): unknown;
  /** Avalia exigindo resultado booleano (regras, condições, visibilidade). */
  evaluateBool(ctx: ExprContext): boolean;
}

export type ParseResultado =
  | { ok: true; referencias: Referencias; avisos: Aviso[] }
  | { ok: false; erro: { codigo: CodigoErro; mensagem: string; posicao?: Posicao } };

// ---------------------------------------------------------------------------
// Registro: card visto pela expressão. Campo ausente lê como null (nunca erro).
// ---------------------------------------------------------------------------

class RegistroExpr extends Map<string, unknown> {
  override get(chave: string): unknown {
    return super.has(chave) ? super.get(chave) : null;
  }
}

function normalizarValor(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(normalizarValor);
  if (v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    return paraRegistro(v as Registro);
  }
  return v;
}

function paraRegistro(obj: Registro): RegistroExpr {
  // Chave com undefined é tratada como ausente (has() false, leitura null).
  return new RegistroExpr(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, normalizarValor(v)]),
  );
}

function normalizarSaida(v: unknown): unknown {
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Map) return Object.fromEntries([...v.entries()].map(([k, x]) => [k, normalizarSaida(x)]));
  if (Array.isArray(v)) return v.map(normalizarSaida);
  if (v !== null && typeof v === "object" && "value" in v && typeof (v as { value: unknown }).value === "bigint") {
    return Number((v as { value: bigint }).value); // UnsignedInt
  }
  return v;
}

function dataLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// Estado da avaliação em curso. As funções registradas no ambiente não recebem o
// contexto CEL, então resolver e data de referência ficam aqui durante a chamada
// (a avaliação é síncrona; o valor anterior é restaurado ao sair).
// ---------------------------------------------------------------------------

interface EstadoAvaliacao {
  hoje: string;
  resolver: Partial<ExprResolver>;
}

let estado: EstadoAvaliacao | null = null;

function estadoAtual(): EstadoAvaliacao {
  if (!estado) throw new ExprError("função de contexto usada fora de uma avaliação", "avaliacao");
  return estado;
}

function resolverLista(metodo: keyof ExprResolver, arg: string): RegistroExpr[] {
  const fn = estadoAtual().resolver[metodo];
  if (!fn) throw new ExprError(`contexto não fornece ${metodo}(); resolver ausente`, "avaliacao");
  return fn(arg).map(paraRegistro);
}

// ---------------------------------------------------------------------------
// Macros em português. Reescrevem a árvore para as macros padrão do CEL
// (all / exists), reaproveitando o expansor da biblioteca. Esta parte depende de
// detalhes internos do @marcbachmann/cel-js (ast.clone/meta e parser.registry).
// ---------------------------------------------------------------------------

interface NoInterno {
  op: string;
  args: unknown;
  start: number;
  end: number;
  meta: { check: unknown; evaluate: unknown };
  clone(op: unknown, args: unknown): NoInterno;
  setMeta(chave: string, valor: unknown): NoInterno;
}

/** Versão da biblioteca contra a qual o acoplamento interno abaixo foi verificado. */
export const VERSAO_CEL_JS = "8.0.0";

const AVISO_INTERNO =
  "@marcbachmann/cel-js mudou internamente; revisar as macros PT-BR (todos/algum/existe/has) em src/lib/expr.ts";

/** Garante que um detalhe interno da biblioteca ainda existe; falha com orientação. */
export function exigirInterno(condicao: unknown, oQue: string): void {
  if (!condicao) throw new Error(`${AVISO_INTERNO}: ${oQue} ausente`);
}

interface MacroOpts {
  ast: NoInterno;
  args: NoInterno[];
  receiver: NoInterno | null;
  methodName: string;
  parser: {
    registry: {
      findMacro(nome: string, comReceptor: boolean, n: number): { handler(o: MacroOpts): unknown } | undefined;
    };
  };
}

const VARIAVEL_IMPLICITA = "item";

function erroSintaxe(mensagem: string, no: NoInterno): ParseError {
  return new ParseError({ code: "macro_invalida", message: mensagem, node: no as unknown as ASTNode });
}

function expandirPara(nomeCel: "all" | "exists", o: MacroOpts, args: NoInterno[], receiver: NoInterno): unknown {
  exigirInterno(typeof o.parser?.registry?.findMacro === "function", "parser.registry.findMacro");
  const macro = o.parser.registry.findMacro(nomeCel, true, 2);
  if (!macro || typeof macro.handler !== "function") exigirInterno(false, `macro CEL '${nomeCel}'`);
  return (macro as { handler(o: MacroOpts): unknown }).handler({ ...o, args, receiver, methodName: nomeCel });
}

function variavelEPredicado(o: MacroOpts, args: NoInterno[], nome: string): [NoInterno, NoInterno] {
  if (args.length === 2) return [args[0], args[1]];
  const id = acharIdentificador(args[0], VARIAVEL_IMPLICITA);
  if (!id) {
    throw erroSintaxe(`${nome}(cond) sem variável precisa referenciar "${VARIAVEL_IMPLICITA}" na condição`, o.ast);
  }
  return [id, args[0]];
}

function quantificador(nome: "todos" | "algum") {
  const nomeCel = nome === "todos" ? "all" : "exists";
  return (o: MacroOpts) => {
    if (!o.receiver) throw erroSintaxe(`${nome}() só pode ser chamado sobre uma lista`, o.ast);
    return expandirPara(nomeCel, o, variavelEPredicado(o, o.args, nome), o.receiver);
  };
}

function existe(o: MacroOpts) {
  const [board, ...resto] = o.args;
  exigirInterno(typeof o.ast?.clone === "function", "ast.clone");
  exigirInterno(o.ast.meta && typeof o.ast.meta.check === "function", "ast.meta.check");
  const opCall = { name: "call", check: o.ast.meta.check, evaluate: o.ast.meta.evaluate };
  const receiver = o.ast.clone(opCall, ["cartoes", [board]]);
  return expandirPara("exists", o, variavelEPredicado(o, resto, "existe"), receiver);
}

// has(card.x) padrão do CEL veria todo campo como presente, porque campo ausente
// lê como null. Substituímos a macro nos nós has(...) da árvore para refletir a
// presença real da chave em props/computed (null presente conta como presente).
interface ChecadorInterno {
  check(no: unknown, ctx: unknown): unknown;
  getType(nome: string): unknown;
  createError(codigo: string, mensagem: string, no: unknown): Error;
}
interface AvaliadorInterno {
  run(no: unknown, ctx: unknown): unknown;
}

function presente(obj: unknown, chave: string): boolean {
  if (obj instanceof Map) return Map.prototype.has.call(obj, chave) && obj.get(chave) !== undefined;
  if (obj !== null && typeof obj === "object") {
    return Object.hasOwn(obj, chave) && (obj as Record<string, unknown>)[chave] !== undefined;
  }
  return false;
}

function macroHas(no: ASTNode) {
  const arg = (no.args as [string, ASTNode[]])[1][0];
  return {
    async: false,
    typeCheck(checker: ChecadorInterno, _m: unknown, ctx: unknown) {
      if (!arg || arg.op !== ".") throw checker.createError("invalid_macro_argument", "has() exige campo: has(card.x)", no);
      checker.check(arg.args[0], ctx);
      return checker.getType("bool");
    },
    evaluate(ev: AvaliadorInterno, _m: unknown, ctx: unknown) {
      const [obj, chave] = arg.args as [ASTNode, string];
      return presente(ev.run(obj, ctx), chave);
    },
  };
}

function substituirHas(no: ASTNode) {
  if (no.op === "call" && no.args[0] === "has" && no.args[1].length === 1) {
    const interno = no as unknown as NoInterno;
    exigirInterno(typeof interno.setMeta === "function", "ast.setMeta");
    interno.setMeta("macro", macroHas(no));
  }
  for (const f of filhosDoNo(no)) substituirHas(f);
}

// ---------------------------------------------------------------------------
// Limites estruturais (proteção contra expressões gigantes ou aninhadas demais)
// ---------------------------------------------------------------------------

export const LIMITES = {
  /** Tamanho máximo do texto da expressão, em caracteres. */
  caracteres: 20_000,
  /** Profundidade máxima de aninhamento (parênteses, chamadas, ternários). */
  profundidade: 40,
  /** Número máximo de nós da árvore. */
  nos: 2_000,
  elementosLista: 500,
  entradasMapa: 200,
  argumentosChamada: 16,
} as const;

const NOME_LIMITE: Record<string, [string, number]> = {
  maxDepth: ["profundidade", LIMITES.profundidade],
  maxAstNodes: ["nós", LIMITES.nos],
  maxListElements: ["elementos de lista", LIMITES.elementosLista],
  maxMapEntries: ["entradas de mapa", LIMITES.entradasMapa],
  maxCallArguments: ["argumentos por chamada", LIMITES.argumentosChamada],
};

// ---------------------------------------------------------------------------
// Ambiente CEL (singleton: instanciar é caro)
// ---------------------------------------------------------------------------

function criarAmbiente(): Environment {
  const env = new Environment({
    unlistedVariablesAreDyn: false,
    homogeneousAggregateLiterals: false,
    limits: {
      maxDepth: LIMITES.profundidade,
      maxAstNodes: LIMITES.nos,
      maxListElements: LIMITES.elementosLista,
      maxMapEntries: LIMITES.entradasMapa,
      maxCallArguments: LIMITES.argumentosChamada,
    },
  })
    .registerType("Registro", RegistroExpr)
    .registerVariable("card", "Registro")
    .registerVariable("pai", "dyn")
    .registerVariable("fase", "dyn")
    .registerVariable("fase_origem", "dyn")
    .registerVariable("fase_destino", "dyn")
    .registerVariable("usuario", "dyn")
    .registerFunction("hoje(): string", () => estadoAtual().hoje)
    .registerFunction("filhos(string): list<dyn>", (rel: string) => resolverLista("filhos", rel))
    .registerFunction("pais(string): list<dyn>", (rel: string) => resolverLista("pais", rel))
    .registerFunction("cartoes(string): list<dyn>", (board: string) => resolverLista("cartoes", board))
    .registerFunction("list.todos(ast, ast): bool", quantificador("todos"))
    .registerFunction("list.todos(ast): bool", quantificador("todos"))
    .registerFunction("list.algum(ast, ast): bool", quantificador("algum"))
    .registerFunction("list.algum(ast): bool", quantificador("algum"))
    .registerFunction("existe(ast, ast, ast): bool", existe)
    .registerFunction("existe(ast, ast): bool", existe)
    .registerFunction("list.contar(): int", (lista: unknown[]) => BigInt(lista.length))
    .registerFunction("list.soma(string): double", (lista: unknown[], slug: string) =>
      lista.reduce<number>((acc, item) => acc + numero(item instanceof Map ? item.get(slug) : null), 0),
    )
    .registerFunction("list.soma(): double", (lista: unknown[]) =>
      lista.reduce<number>((acc, item) => acc + numero(item), 0),
    );

  // Valores de campos numéricos chegam do JSON como double; literais inteiros são int.
  // CEL puro não mistura os dois em aritmética; aqui promovemos para double.
  const ops: Record<string, (a: number, b: number) => number> = {
    "+": (a, b) => a + b,
    "-": (a, b) => a - b,
    "*": (a, b) => a * b,
    "/": (a, b) => a / b,
    "%": (a, b) => a % b,
  };
  for (const [op, fn] of Object.entries(ops)) {
    env.registerOperator(`double ${op} int`, (a: number, b: bigint) => fn(a, Number(b)));
    env.registerOperator(`int ${op} double`, (a: bigint, b: number) => fn(Number(a), b));
  }
  return env;
}

function numero(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return 0;
}

let ambiente: Environment | undefined;
function obterAmbiente(): Environment {
  return (ambiente ??= criarAmbiente());
}

// ---------------------------------------------------------------------------
// Percurso da árvore
// ---------------------------------------------------------------------------

function ehNo(x: unknown): x is ASTNode {
  return typeof x === "object" && x !== null && typeof (x as { op?: unknown }).op === "string";
}

function filhosDoNo(no: ASTNode): ASTNode[] {
  const args: unknown = no.args;
  if (ehNo(args)) return [args];
  if (!Array.isArray(args)) return [];
  const saida: ASTNode[] = [];
  for (const a of args) {
    if (ehNo(a)) saida.push(a);
    else if (Array.isArray(a)) for (const b of a) if (ehNo(b)) saida.push(b);
  }
  return saida;
}

function acharIdentificador(no: NoInterno, nome: string): NoInterno | null {
  const n = no as unknown as ASTNode;
  if (n.op === "id" && n.args === nome) return no;
  for (const f of filhosDoNo(n)) {
    const r = acharIdentificador(f as unknown as NoInterno, nome);
    if (r) return r;
  }
  return null;
}

function posicaoDe(no: ASTNode): Posicao {
  return { inicio: no.start, fim: no.end };
}

function literalString(no: ASTNode | undefined): string | null {
  return no && no.op === "value" && typeof no.args === "string" ? no.args : null;
}

const GLOBAIS = new Set(["fase", "fase_origem", "fase_destino", "usuario"]);

function coletarReferencias(raiz: ASTNode, avisos: Aviso[]): Referencias {
  const sets = {
    card: new Set<string>(),
    pai: new Set<string>(),
    filhos: new Set<string>(),
    pais: new Set<string>(),
    boards: new Set<string>(),
    globais: new Set<string>(),
  };

  const registrarArg = (fn: string, destino: Set<string>, arg: ASTNode | undefined, no: ASTNode) => {
    const lit = literalString(arg);
    if (lit !== null) destino.add(lit);
    else avisos.push({
      tipo: "referencia_dinamica",
      mensagem: `${fn}() com argumento não literal: dependência não rastreável`,
      posicao: posicaoDe(no),
    });
  };

  const visitar = (no: ASTNode) => {
    if (no.op === ".") {
      const [obj, campo] = no.args;
      if (obj.op === "id" && obj.args === "card") sets.card.add(campo);
      else if (obj.op === "id" && obj.args === "pai") sets.pai.add(campo);
    } else if (no.op === "id") {
      if (GLOBAIS.has(no.args)) sets.globais.add(no.args);
    } else if (no.op === "call") {
      const [nome, args] = no.args;
      if (nome === "hoje") sets.globais.add("hoje");
      else if (nome === "filhos") registrarArg(nome, sets.filhos, args[0], no);
      else if (nome === "pais") registrarArg(nome, sets.pais, args[0], no);
      else if (nome === "cartoes" || nome === "existe") registrarArg(nome, sets.boards, args[0], no);
    }
    for (const f of filhosDoNo(no)) visitar(f);
  };
  visitar(raiz);

  const ordenar = (s: Set<string>) => [...s].sort();
  return {
    card: ordenar(sets.card),
    pai: ordenar(sets.pai),
    filhos: ordenar(sets.filhos),
    pais: ordenar(sets.pais),
    boards: ordenar(sets.boards),
    globais: ordenar(sets.globais),
  };
}

// ---------------------------------------------------------------------------
// Lint: tautologias, contradições e redundâncias simples em cadeias de || e &&.
// Cada operando vira um "átomo" (chave, operador, constante); pares sobre a mesma
// chave são testados por amostragem nos pontos críticos das constantes.
// ---------------------------------------------------------------------------

type Constante = number | string | boolean | null;
type OperadorAtomo = "==" | "!=" | "<" | "<=" | ">" | ">=";

interface Atomo {
  chave: string;
  op: OperadorAtomo;
  valor: Constante;
  no: ASTNode;
}

const COMPARACOES = new Set<string>(["==", "!=", "<", "<=", ">", ">="]);
const INVERSO: Record<OperadorAtomo, OperadorAtomo> = {
  "==": "==", "!=": "!=", "<": ">", "<=": ">=", ">": "<", ">=": "<=",
};

function constanteDe(no: ASTNode): Constante | undefined {
  if (no.op !== "value") return undefined;
  const v = no.args;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean" || v === null) return v;
  return undefined;
}

function atomoDe(no: ASTNode): Atomo | null {
  if (COMPARACOES.has(no.op)) {
    const [esq, dir] = no.args as [ASTNode, ASTNode];
    const cDir = constanteDe(dir);
    const cEsq = constanteDe(esq);
    const op = no.op as OperadorAtomo;
    if (cDir !== undefined && cEsq === undefined) return { chave: serialize(esq), op, valor: cDir, no };
    if (cEsq !== undefined && cDir === undefined) return { chave: serialize(dir), op: INVERSO[op], valor: cEsq, no };
    return null;
  }
  if (no.op === "!_") return { chave: serialize(no.args), op: "==", valor: false, no };
  if (no.op === "value") return null;
  return { chave: serialize(no), op: "==", valor: true, no };
}

const OUTRO = Symbol("outro");
type Amostra = Constante | typeof OUTRO;

function amostras(a: Atomo, b: Atomo): Amostra[] | null {
  const numerico = typeof a.valor === "number" && typeof b.valor === "number";
  if (numerico) {
    const lo = Math.min(a.valor as number, b.valor as number);
    const hi = Math.max(a.valor as number, b.valor as number);
    return [lo - 1, lo, (lo + hi) / 2, hi, hi + 1];
  }
  const soIgualdade = (x: Atomo) => x.op === "==" || x.op === "!=";
  if (!soIgualdade(a) || !soIgualdade(b)) return null;
  if (typeof a.valor === "boolean" && typeof b.valor === "boolean") return [true, false];
  return [a.valor, b.valor, OUTRO];
}

function satisfaz(atomo: Atomo, v: Amostra): boolean {
  switch (atomo.op) {
    case "==": return v === atomo.valor;
    case "!=": return v !== atomo.valor;
    default: {
      if (typeof v !== "number" || typeof atomo.valor !== "number") return false;
      const c = atomo.valor;
      return atomo.op === "<" ? v < c : atomo.op === "<=" ? v <= c : atomo.op === ">" ? v > c : v >= c;
    }
  }
}

function operandos(no: ASTNode, op: "||" | "&&"): ASTNode[] {
  if (no.op !== op) return [no];
  const [a, b] = no.args as [ASTNode, ASTNode];
  return [...operandos(a, op), ...operandos(b, op)];
}

function lintGrupo(no: ASTNode, op: "||" | "&&", avisos: Aviso[]) {
  const itens = operandos(no, op);
  const posicao = posicaoDe(no);
  const conjuncao = op === "&&";
  const texto = (x: ASTNode) => serialize(x);

  for (const item of itens) {
    const c = constanteDe(item);
    if (typeof c !== "boolean") continue;
    if (c === !conjuncao) {
      avisos.push({
        tipo: conjuncao ? "contradicao" : "tautologia",
        mensagem: conjuncao ? "'false' em && torna a expressão sempre falsa" : "'true' em || torna a expressão sempre verdadeira",
        posicao,
      });
    } else {
      avisos.push({ tipo: "redundancia", mensagem: `'${String(c)}' não altera o resultado de ${op}`, posicao });
    }
  }

  const atomos = itens.map(atomoDe);
  for (let i = 0; i < atomos.length; i++) {
    const a = atomos[i];
    for (let j = i + 1; j < atomos.length; j++) {
      const b = atomos[j];
      if (texto(itens[i]) === texto(itens[j])) {
        avisos.push({ tipo: "redundancia", mensagem: `'${texto(itens[i])}' repetido em ${op}`, posicao });
        continue;
      }
      if (!a || !b || a.chave !== b.chave) continue;
      const pontos = amostras(a, b);
      if (!pontos) continue;
      const par = `'${texto(a.no)}' e '${texto(b.no)}'`;
      if (conjuncao) {
        if (!pontos.some((p) => satisfaz(a, p) && satisfaz(b, p))) {
          avisos.push({ tipo: "contradicao", mensagem: `${par} nunca são verdadeiros ao mesmo tempo`, posicao });
        } else if (pontos.every((p) => !satisfaz(a, p) || satisfaz(b, p))) {
          avisos.push({ tipo: "redundancia", mensagem: `'${texto(b.no)}' já é garantido por '${texto(a.no)}'`, posicao });
        } else if (pontos.every((p) => !satisfaz(b, p) || satisfaz(a, p))) {
          avisos.push({ tipo: "redundancia", mensagem: `'${texto(a.no)}' já é garantido por '${texto(b.no)}'`, posicao });
        }
      } else if (pontos.every((p) => satisfaz(a, p) || satisfaz(b, p))) {
        avisos.push({ tipo: "tautologia", mensagem: `${par} cobrem todos os valores: sempre verdadeiro`, posicao });
      } else if (pontos.every((p) => !satisfaz(a, p) || satisfaz(b, p))) {
        avisos.push({ tipo: "redundancia", mensagem: `'${texto(a.no)}' já está coberto por '${texto(b.no)}'`, posicao });
      } else if (pontos.every((p) => !satisfaz(b, p) || satisfaz(a, p))) {
        avisos.push({ tipo: "redundancia", mensagem: `'${texto(b.no)}' já está coberto por '${texto(a.no)}'`, posicao });
      }
    }
  }
}

function lintArvore(no: ASTNode, avisos: Aviso[], pai?: string) {
  if ((no.op === "||" || no.op === "&&") && pai !== no.op) lintGrupo(no, no.op, avisos);
  for (const f of filhosDoNo(no)) lintArvore(f, avisos, no.op);
}

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

function posicaoErro(e: { range?: { start: number; end: number } }): Posicao | undefined {
  return e.range ? { inicio: e.range.start, fim: e.range.end } : undefined;
}

function converterErro(e: unknown): ExprError {
  if (e instanceof ExprError) return e;
  if (e instanceof ParseError && e.code === "limit_exceeded") {
    const chave = /Exceeded (\w+)/.exec(e.summary)?.[1] ?? "";
    const [nome, valor] = NOME_LIMITE[chave] ?? ["tamanho", 0];
    return new ExprError(`expressão excede o limite de ${nome} (${valor})`, "sintaxe", posicaoErro(e));
  }
  if (e instanceof ParseError) return new ExprError(e.summary, "sintaxe", posicaoErro(e));
  if (e instanceof CelTypeError) return new ExprError(e.summary, "tipo", posicaoErro(e));
  if (e instanceof EvaluationError) return new ExprError(e.summary, "avaliacao", posicaoErro(e));
  if (e instanceof Error) return new ExprError(e.message, "avaliacao");
  return new ExprError(String(e), "avaliacao");
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

function analisar(fonte: string) {
  if (typeof fonte !== "string" || fonte.trim() === "") {
    throw new ExprError("expressão vazia", "sintaxe", { inicio: 0, fim: 0 });
  }
  if (fonte.length > LIMITES.caracteres) {
    throw new ExprError(`expressão excede o limite de caracteres (${LIMITES.caracteres})`, "sintaxe", {
      inicio: LIMITES.caracteres,
      fim: fonte.length,
    });
  }
  const env = obterAmbiente();
  let programa: ReturnType<Environment["parse"]>;
  try {
    programa = env.parse(fonte);
    substituirHas(programa.ast);
  } catch (e) {
    throw converterErro(e);
  }
  const checagem = programa.check();
  if (!checagem.valid) throw converterErro(checagem.error);

  const avisos: Aviso[] = [];
  const referencias = coletarReferencias(programa.ast, avisos);
  lintArvore(programa.ast, avisos);
  return { programa, referencias, avisos };
}

/** Compila uma expressão. Lança ExprError em erro de sintaxe ou de tipo. */
export function compile(fonte: string): ExprCompilada {
  const { programa, referencias, avisos } = analisar(fonte);

  const evaluate = (ctx: ExprContext): unknown => {
    const hoje = ctx.hoje instanceof Date ? dataLocal(ctx.hoje) : ctx.hoje ?? dataLocal(new Date());
    const anterior = estado;
    estado = { hoje, resolver: ctx.resolver ?? {} };
    try {
      const resultado = programa({
        card: paraRegistro(ctx.card ?? {}),
        pai: ctx.pai ? paraRegistro(ctx.pai) : null,
        fase: ctx.fase ?? null,
        fase_origem: ctx.fase_origem ?? null,
        fase_destino: ctx.fase_destino ?? null,
        usuario: ctx.usuario ? paraRegistro(ctx.usuario) : null,
      });
      if (resultado instanceof Promise) throw new ExprError("expressão assíncrona não suportada", "avaliacao");
      return normalizarSaida(resultado);
    } catch (e) {
      throw converterErro(e);
    } finally {
      estado = anterior;
    }
  };

  return {
    fonte,
    referencias,
    avisos,
    evaluate,
    evaluateBool(ctx) {
      const r = evaluate(ctx);
      if (typeof r !== "boolean") {
        throw new ExprError(`expressão deve resultar em booleano; obteve ${descreverValor(r)}`, "tipo");
      }
      return r;
    },
  };
}

/** Valida sintaxe e tipos sem avaliar; devolve referências e avisos de lint. */
export function parse(fonte: string): ParseResultado {
  try {
    const { referencias, avisos } = analisar(fonte);
    return { ok: true, referencias, avisos };
  } catch (e) {
    const erro = converterErro(e);
    return { ok: false, erro: { codigo: erro.codigo, mensagem: erro.message, posicao: erro.posicao } };
  }
}

/** Só os avisos de lint (lista vazia se a expressão for inválida). */
export function lint(fonte: string): Aviso[] {
  const r = parse(fonte);
  return r.ok ? r.avisos : [];
}

/** Atalho: compila e avalia uma vez. */
export function evaluate(fonte: string, ctx: ExprContext): unknown {
  return compile(fonte).evaluate(ctx);
}

/** Atalho para regras: compila e avalia exigindo booleano. */
export function evaluateBool(fonte: string, ctx: ExprContext): boolean {
  return compile(fonte).evaluateBool(ctx);
}

function descreverValor(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "lista";
  return typeof v === "object" ? "mapa" : `${typeof v} (${String(v)})`;
}
