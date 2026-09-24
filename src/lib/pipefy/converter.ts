// Converte exports de estrutura do Pipefy (scripts/pipefy-export.ts) em template do Plexu
// (src/lib/template.ts) e produz os dados do relatório de conversão. Puro e genérico: nenhuma
// regra depende de nomes de pipes/campos; só de tipos, ids e padrões (séries numeradas, fórmulas,
// "move de volta se"). Mapeamentos em docs/TEMPLATE.md (seção Pipefy).
import { slugCampo, slugify } from "../slug";
import { VERSAO_TEMPLATE, type AutomacaoTemplate, type BoardTemplate, type CampoTemplate, type RegraTemplate, type Template } from "../template";
import type { PfAutomacao, PfCampo, PfCondicao, PfCondicional, PfExport, PfFase } from "./export";

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------

export type DestinoAutomacao = "regra" | "rollup" | "dynamic_text" | "absorvida" | "pendente";

export interface LinhaCampo {
  origem: string;
  tipoOrigem: string;
  fase: string | null;
  destino: string | null;
  tipoDestino: string | null;
  nota?: string;
}

export interface LinhaAutomacao {
  origem: string;
  ativa: boolean;
  gatilho: string;
  condicao: string;
  acao: string;
  destino: DestinoAutomacao;
  /** Chave do artefato Plexu (regra, campo ou automação pendente). */
  ref: string | null;
  nota?: string;
}

export interface RelatorioBoard {
  board: string;
  nome: string;
  origem: { id: string; tipo: "pipe" | "table"; nome: string };
  campos: LinhaCampo[];
  automacoes: LinhaAutomacao[];
  conexoes: { campo: string; alvo: string; destino: string }[];
  condicionais: { total: number; convertidas: number; naoConvertidas: string[] };
  naoRepresentado: { item: string; motivo: string }[];
  /** Regras vindas de automações. */
  regras: number;
  /** Regras vindas da configuração de fases/conexões (destinos permitidos, filho obrigatório). */
  regrasConfig: number;
  rollups: number;
  textosCalculados: number;
  pendentes: number;
}

export interface Relatorio {
  anonimizado: boolean;
  boards: RelatorioBoard[];
  naoExportavel: string[];
  totais: { automacoes: number; ativas: number; regras: number; regrasConfig: number; rollups: number; textosCalculados: number; absorvidas: number; pendentes: number };
}

// ---------------------------------------------------------------------------
// Tipos de campo
// ---------------------------------------------------------------------------

const TIPOS: Record<string, { tipo: string; nota?: string }> = {
  short_text: { tipo: "text" },
  long_text: { tipo: "long_text" },
  email: { tipo: "text", nota: "e-mail vira texto (sem validação de formato)" },
  phone: { tipo: "text", nota: "telefone vira texto" },
  time: { tipo: "text", nota: "hora vira texto" },
  number: { tipo: "number" },
  currency: { tipo: "currency" },
  date: { tipo: "date" },
  datetime: { tipo: "datetime" },
  due_date: { tipo: "datetime", nota: "vencimento vira data e hora (prazo do card não é mapeado)" },
  select: { tipo: "select" },
  radio_vertical: { tipo: "select" },
  radio_horizontal: { tipo: "select" },
  checklist_vertical: { tipo: "multi_select" },
  checklist_horizontal: { tipo: "multi_select" },
  label_select: { tipo: "multi_select", nota: "etiquetas viram seleção múltipla" },
  assignee_select: { tipo: "person" },
  attachment: { tipo: "attachment" },
  cpf: { tipo: "cpf" },
  cnpj: { tipo: "cnpj" },
  id: { tipo: "sequence", nota: "id do card vira sequência {n}" },
  connector: { tipo: "relation" },
};
const NUMERICOS = new Set(["number", "currency"]);

const SERIE = /^(.*?)(\d{1,3})(\D*)$/;

/** Tira parênteses externos só quando envolvem a expressão inteira ("(a) && (b)" fica como está). */
export function semParenteses(s: string): string {
  let t = s.trim();
  while (t.startsWith("(") && t.endsWith(")")) {
    let nivel = 0;
    let envolve = true;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === "(") nivel++;
      else if (t[i] === ")") nivel--;
      if (nivel === 0 && i < t.length - 1) {
        envolve = false;
        break;
      }
    }
    if (!envolve) break;
    t = t.slice(1, -1).trim();
  }
  return t;
}

// ---------------------------------------------------------------------------
// Estado interno
// ---------------------------------------------------------------------------

interface Serie {
  tipo: "conexao" | "campo";
  relKey: string;
  alvo: BoardConv | null;
  /** série de campo: key do campo no board filho que recebe o valor de cada membro. */
  campoFilho?: string;
  nome: string;
  membros: PfCampo[];
}

interface CampoConv {
  pf: PfCampo;
  faseKey: string | null;
  faseNome: string | null;
  campo: CampoTemplate | null;
  serie?: Serie;
}

interface BoardConv {
  exp: PfExport;
  key: string;
  tpl: BoardTemplate;
  fases: { pf: PfFase; key: string }[];
  campos: CampoConv[];
  porRef: Map<string, CampoConv>;
  series: Serie[];
  /** Automações deste board (deduplicadas; dono = pipe do gatilho). */
  autos: PfAutomacao[];
  rel: RelatorioBoard;
}

const unico = (base: string, usados: Set<string>, sep = "_") => {
  let k = base;
  for (let i = 2; usados.has(k); i++) k = `${base}${sep}${i}`;
  usados.add(k);
  return k;
};

const plural = (s: string) => (/s$/i.test(s) ? s : `${s}s`);
const limparNome = (s: string) => s.replace(/[\s:.–—-]+$/g, "").replace(/^[\s:.–—-]+/g, "").trim();
const nomeBase = (nome: string) => nome.replace(/\(c[óo]pia \d+\)/gi, "").replace(/\d+/g, "#").replace(/\s+/g, " ").trim();

function camposDoRepo(e: PfExport, fases: { pf: PfFase; key: string }[]): { pf: PfCampo; faseKey: string | null; faseNome: string | null }[] {
  if (e.tipo === "table") return (e.repo.table_fields ?? []).map((pf) => ({ pf, faseKey: null, faseNome: null }));
  const primeira = fases[0] ?? null;
  return [
    ...(e.repo.start_form_fields ?? []).map((pf) => ({ pf, faseKey: primeira?.key ?? null, faseNome: primeira ? `${primeira.pf.name} (formulário inicial)` : "formulário inicial" })),
    ...fases.flatMap((f) => (f.pf.fields ?? []).map((pf) => ({ pf, faseKey: f.key, faseNome: f.pf.name }))),
  ];
}

// ---------------------------------------------------------------------------
// Condições Pipefy → CEL
// ---------------------------------------------------------------------------

type Ref =
  | { k: "fase" }
  | { k: "card"; slug: string; tipo: string }
  | { k: "filho"; rel: string; slug: string; tipo: string; generalizado: boolean };

function literal(v: string | null, tipo: string): string {
  const s = v ?? "";
  if (NUMERICOS.has(tipo) && s.trim() !== "" && Number.isFinite(Number(s))) return String(Number(s));
  return JSON.stringify(s);
}

function exprBase(x: string, tipo: string, op: string, v: string | null): string | null {
  const L = literal(v, tipo);
  const multi = tipo === "multi_select";
  switch (op) {
    case "blank":
      return `${x} == null`;
    case "present":
      return `${x} != null`;
    case "equals":
      return multi ? `(${x} != null && ${L} in ${x})` : `${x} == ${L}`;
    case "not_equals":
      return multi ? `!(${x} != null && ${L} in ${x})` : `${x} != ${L}`;
    case "greater_than":
      return `${x} > ${L}`;
    case "less_than":
      return `${x} < ${L}`;
    case "greater_than_or_equal":
    case "greater_or_equal":
      return `${x} >= ${L}`;
    case "less_than_or_equal":
    case "less_or_equal":
      return `${x} <= ${L}`;
    case "contains":
      return multi ? `(${x} != null && ${L} in ${x})` : `(${x} != null && string(${x}).contains(${L}))`;
    case "not_contains":
      return multi ? `!(${x} != null && ${L} in ${x})` : `!(${x} != null && string(${x}).contains(${L}))`;
    default:
      return null;
  }
}

class Conversor {
  boards: BoardConv[] = [];
  porRepo = new Map<string, BoardConv>();
  nomeFase = new Map<string, string>();
  keyFase = new Map<string, { board: BoardConv; key: string; index: number }>();
  chaveBoards = new Set<string>();

  constructor(
    private exports: PfExport[],
    private anonimizado: boolean,
  ) {}

  run(nome: string): { template: Template; relatorio: Relatorio } {
    for (const e of this.exports) this.criarBoard(e);
    this.distribuirAutomacoes();
    for (const b of this.boards) this.detectarSeries(b);
    for (const b of this.boards) this.mapearCampos(b);
    for (const b of this.boards) this.resolverSeriesDeCampo(b);
    for (const b of this.boards) this.condicionais(b);
    for (const b of this.boards) this.automacoes(b);
    for (const b of this.boards) this.regrasDeFase(b);
    for (const b of this.boards) this.finalizar(b);
    const rel = this.boards.map((b) => b.rel);
    const soma = (f: (r: RelatorioBoard) => number) => rel.reduce((n, r) => n + f(r), 0);
    return {
      template: { plexu_template: VERSAO_TEMPLATE, name: nome, description: "Convertido de exports de estrutura do Pipefy.", boards: this.boards.map((b) => b.tpl) },
      relatorio: {
        anonimizado: this.anonimizado,
        boards: rel,
        naoExportavel: [...new Set(this.exports.flatMap((e) => e.nao_exportavel ?? []))],
        totais: {
          automacoes: soma((r) => r.automacoes.length),
          ativas: soma((r) => r.automacoes.filter((a) => a.ativa).length),
          regras: soma((r) => r.regras),
          regrasConfig: soma((r) => r.regrasConfig),
          rollups: soma((r) => r.rollups),
          textosCalculados: soma((r) => r.textosCalculados),
          absorvidas: soma((r) => r.automacoes.filter((a) => a.destino === "absorvida").length),
          pendentes: soma((r) => r.pendentes),
        },
      },
    };
  }

  /** A API lista a automação no pipe do gatilho e no pipe onde ela age: fica só no dono do gatilho. */
  distribuirAutomacoes() {
    const vistas = new Set<string>();
    for (const b of this.boards)
      for (const a of b.exp.automacoes) {
        if (vistas.has(a.id)) continue;
        vistas.add(a.id);
        const dono = (a.event_repo?.id ? this.porRepo.get(a.event_repo.id) : undefined) ?? b;
        dono.autos.push(a);
      }
  }

  // -- boards e fases ------------------------------------------------------

  criarBoard(e: PfExport) {
    const key = unico(slugify(e.repo.name, 40), this.chaveBoards, "-");
    const usadas = new Set<string>();
    const fases = [...(e.repo.phases ?? [])]
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((pf) => ({ pf, key: unico(slugCampo(pf.name), usadas) }));
    const b: BoardConv = {
      exp: e,
      key,
      fases,
      campos: [],
      porRef: new Map(),
      series: [],
      autos: [],
      tpl: {
        key,
        name: e.repo.name,
        kind: e.tipo === "table" || !fases.length ? "database" : "workflow",
        phases: fases.map((f) => ({ key: f.key, name: f.pf.name, ...(f.pf.done ? { terminal: true } : {}) })),
        fields: [],
        rules: [],
        automations: [],
      },
      rel: {
        board: key,
        nome: e.repo.name,
        origem: { id: e.id, tipo: e.tipo, nome: e.repo.name },
        campos: [],
        automacoes: [],
        conexoes: [],
        condicionais: { total: 0, convertidas: 0, naoConvertidas: [] },
        naoRepresentado: [],
        regras: 0,
        regrasConfig: 0,
        rollups: 0,
        textosCalculados: 0,
        pendentes: 0,
      },
    };
    this.boards.push(b);
    this.porRepo.set(e.id, b);
    this.porRepo.set(e.repo.id, b);
    fases.forEach((f, i) => {
      this.nomeFase.set(f.pf.id, f.pf.name);
      this.keyFase.set(f.pf.id, { board: b, key: f.key, index: i });
    });
  }

  // -- séries numeradas ----------------------------------------------------

  detectarSeries(b: BoardConv) {
    const grupos = new Map<string, { pf: PfCampo; prefixo: string; sufixo: string; n: number }[]>();
    for (const { pf } of camposDoRepo(b.exp, b.fases)) {
      if (pf.type === "statement") continue;
      const m = pf.label.match(SERIE);
      if (!m) continue;
      const alvo = pf.type === "connector" ? `c:${pf.connectedRepo?.id ?? "?"}` : `t:${pf.type}`;
      const k = `${alvo}|${m[1].trim().toLowerCase()}#${m[3].trim().toLowerCase()}`;
      const g = grupos.get(k) ?? [];
      g.push({ pf, prefixo: m[1], sufixo: m[3], n: Number(m[2]) });
      grupos.set(k, g);
    }
    for (const [k, g] of grupos) {
      if (g.length < 3 || new Set(g.map((x) => x.n)).size !== g.length) continue;
      const nome = limparNome(`${g[0].prefixo}${g[0].sufixo}`) || `Série ${b.series.length + 1}`;
      if (k.startsWith("c:")) {
        const alvo = this.porRepo.get(g[0].pf.connectedRepo?.id ?? "") ?? null;
        b.series.push({ tipo: "conexao", relKey: "", alvo, nome, membros: g.map((x) => x.pf) });
      } else {
        b.series.push({ tipo: "campo", relKey: "", alvo: null, nome, membros: g.map((x) => x.pf) });
      }
    }
  }

  // -- campos --------------------------------------------------------------

  mapearCampos(b: BoardConv) {
    const usados = new Set<string>();
    const membro = new Map<string, Serie>();
    for (const s of b.series) for (const m of s.membros) membro.set(m.id, s);
    const serieCriada = new Set<Serie>();
    const conexaoPorNumeros = (s: Serie) => {
      const nums = (x: Serie) => new Set(x.membros.map((m) => Number(m.label.match(SERIE)![2])));
      const alvo = nums(s);
      return b.series.find((c) => c.tipo === "conexao" && [...alvo].every((n) => nums(c).has(n)));
    };

    for (const { pf, faseKey, faseNome } of camposDoRepo(b.exp, b.fases)) {
      const cc: CampoConv = { pf, faseKey, faseNome, campo: null };
      b.campos.push(cc);
      b.porRef.set(pf.id, cc);
      if (pf.internal_id) b.porRef.set(String(pf.internal_id), cc);
      const linha = (destino: string | null, tipoDestino: string | null, nota?: string) =>
        b.rel.campos.push({ origem: pf.label, tipoOrigem: pf.type, fase: faseNome, destino, tipoDestino, ...(nota ? { nota } : {}) });

      const s = membro.get(pf.id);
      if (s) {
        cc.serie = s;
        if (s.tipo === "conexao") {
          if (!serieCriada.has(s)) {
            serieCriada.add(s);
            if (s.alvo) {
              s.relKey = unico(slugCampo(plural(s.nome)), usados);
              b.tpl.fields.push({
                key: s.relKey,
                name: plural(s.nome),
                type: "relation",
                ...(faseKey ? { fill_phases: [faseKey] } : {}),
                relation: { board: s.alvo.key, cardinality: "many", inverse_name: slugCampo(b.tpl.name).slice(0, 40) },
              });
              b.rel.conexoes.push({ campo: `${s.nome} (${s.membros.length} campos numerados)`, alvo: s.alvo.tpl.name, destino: `relação 1:N ${s.relKey}` });
            } else {
              b.rel.naoRepresentado.push({ item: `série ${s.nome} (${s.membros.length} conexões)`, motivo: `alvo fora do conjunto exportado (${pf.connectedRepo?.name ?? pf.connectedRepo?.id})` });
            }
          }
          linha(s.relKey || null, s.relKey ? "relation (1:N)" : null, `membro da série ${s.nome}`);
        } else {
          const con = conexaoPorNumeros(s);
          if (con) {
            s.alvo = con.alvo;
            s.relKey = con.relKey;
          }
          linha(null, null, `membro da série ${s.nome}: ver board filho`);
        }
        continue;
      }

      if (pf.type === "statement") {
        linha(null, null, "texto informativo do formulário: sem equivalente");
        b.rel.naoRepresentado.push({ item: pf.label, motivo: "statement (texto fixo do formulário) não é campo" });
        continue;
      }
      const map = TIPOS[pf.type];
      if (!map) {
        linha(null, null, `tipo ${pf.type} sem equivalente`);
        b.rel.naoRepresentado.push({ item: pf.label, motivo: `tipo de campo ${pf.type} sem equivalente no Plexu` });
        continue;
      }
      const c: CampoTemplate = { key: unico(slugCampo(pf.label), usados), name: pf.label, type: map.tipo };
      if (pf.help || pf.description) c.help = pf.help || pf.description;
      if (pf.required) c.required = "true";
      if (pf.unique) c.unique = true;
      if (faseKey) {
        c.fill_phases = [faseKey];
        if (pf.editable) c.editable_everywhere = true;
      }
      if (map.tipo === "select" || map.tipo === "multi_select") {
        const ops = pf.type === "label_select" ? (b.exp.repo.labels ?? []).map((l) => l.name) : (pf.options ?? []);
        if (!ops.length) {
          linha(null, null, "seleção sem opções exportadas");
          b.rel.naoRepresentado.push({ item: pf.label, motivo: "seleção sem opções na API" });
          continue;
        }
        c.options = [...new Set(ops.map(String))];
      }
      if (map.tipo === "currency") c.currency = { code: "BRL" };
      if (map.tipo === "sequence") {
        c.sequence = { pattern: "{n}", scope: "global", seed: 1, pad: 0 };
        delete c.required;
        delete c.editable_everywhere;
      }
      if (map.tipo === "relation") {
        const alvo = this.porRepo.get(pf.connectedRepo?.id ?? "");
        const nomeAlvo = pf.connectedRepo?.name ?? pf.connectedRepo?.id ?? "?";
        if (!alvo) {
          linha(null, null, `conexão para fora do conjunto (${nomeAlvo})`);
          b.rel.conexoes.push({ campo: pf.label, alvo: nomeAlvo, destino: "não convertida (alvo fora do conjunto exportado)" });
          b.rel.naoRepresentado.push({ item: pf.label, motivo: `conexão com ${nomeAlvo}, que não foi exportado` });
          continue;
        }
        const um = pf.canConnectMultiples === false;
        // Exclusividade nunca é inferida: só por opção explícita no template.
        c.relation = { board: alvo.key, cardinality: um ? "one" : "many" };
        b.rel.conexoes.push({
          campo: pf.label,
          alvo: alvo.tpl.name,
          destino: `relação ${um ? "1 card" : "vários cards"} ${c.key}`,
        });
      }
      cc.campo = c;
      b.tpl.fields.push(c);
      linha(c.key, c.type, map.nota);
    }
    const tf = b.exp.repo.title_field?.id ? b.porRef.get(b.exp.repo.title_field.id)?.campo : null;
    // Título do card é texto: conexão/anexo/seleção múltipla como título não funcionam (sem lookup).
    const titulavel = (c: CampoTemplate | null | undefined) => !!c && !["relation", "attachment", "multi_select"].includes(c.type);
    b.tpl.title_field = (titulavel(tf) ? tf!.key : null) ?? b.tpl.fields.find((f) => f.type === "text")?.key ?? null;
    if (tf && !titulavel(tf))
      b.rel.naoRepresentado.push({
        item: `título do card = ${tf.name}`,
        motivo: `campo ${tf.type} não serve de título (o Pipefy mostra o título do card conectado; falta lookup): usado ${b.tpl.title_field ?? "nenhum"}`,
      });
  }

  /** Série de campos: um campo no board filho (reaproveita o destino de uma automação de cópia). */
  resolverSeriesDeCampo(b: BoardConv) {
    for (const s of b.series.filter((x) => x.tipo === "campo")) {
      const tipoPf = s.membros[0].type;
      const map = TIPOS[tipoPf];
      if (!s.alvo || !s.relKey) {
        b.rel.naoRepresentado.push({
          item: `série ${s.nome} (${s.membros.length} campos)`,
          motivo: "campos numerados sem série de conexão correspondente; revisar como board filho",
        });
        continue;
      }
      // Automação que copia cada membro para um campo do filho: esse campo passa a ser o editado.
      const ids = new Set(s.membros.flatMap((m) => [m.id, String(m.internal_id ?? "")]));
      let destino: string | undefined;
      for (const a of b.autos) {
        if (a.action_id !== "update_card_field" || a.action_repo_v2?.id !== s.alvo.exp.repo.id) continue;
        for (const fm of a.action_params?.field_map ?? []) {
          const refs = [...(fm.value ?? "").matchAll(/%\{([^}|]+)/g)].map((x) => x[1]);
          if (refs.length === 1 && ids.has(refs[0])) destino = s.alvo.porRef.get(fm.fieldId)?.campo?.key ?? destino;
        }
      }
      if (!destino && map) {
        const usados = new Set(s.alvo.tpl.fields.map((f) => f.key));
        destino = unico(slugCampo(s.nome), usados);
        const c: CampoTemplate = { key: destino, name: s.nome, type: map.tipo };
        if (map.tipo === "select" || map.tipo === "multi_select") c.options = [...new Set((s.membros[0].options ?? []).map(String))];
        if (map.tipo === "currency") c.currency = { code: "BRL" };
        s.alvo.tpl.fields.push(c);
        s.alvo.rel.campos.push({ origem: `${s.nome} (série de ${b.tpl.name})`, tipoOrigem: tipoPf, fase: null, destino, tipoDestino: c.type, nota: "campo criado a partir de série numerada do board pai" });
      }
      s.campoFilho = destino;
      b.rel.naoRepresentado.push({
        item: `série ${s.nome} (${s.membros.length} campos)`,
        motivo: `representada por 1 campo em cada card de ${s.alvo.tpl.name} (${destino ?? "?"}), não por campos numerados no pai`,
      });
    }
  }

  // -- referências e condições ---------------------------------------------

  ref(b: BoardConv, addr: string): Ref | string {
    if (addr === "current_phase") return { k: "fase" };
    if (addr === "title") {
      // "title" = título do card: o campo de título do board.
      const t = b.tpl.fields.find((f) => f.key === b.tpl.title_field);
      return t ? { k: "card", slug: t.key, tipo: t.type } : "título do card sem campo de título";
    }
    if (addr.includes(".")) {
      const [a, f] = addr.split(".");
      const cc = b.porRef.get(a);
      const s = cc?.serie?.tipo === "conexao" ? cc.serie : undefined;
      const rel = s?.relKey || cc?.campo?.key;
      const alvo = s?.alvo ?? (cc?.campo?.relation ? this.boards.find((x) => x.key === cc.campo!.relation!.board) : undefined);
      const filho = alvo?.porRef.get(f)?.campo;
      if (!cc || !rel || !alvo || !filho) return `campo ${addr} não convertido`;
      return { k: "filho", rel, slug: filho.key, tipo: filho.type, generalizado: !!s };
    }
    const cc = b.porRef.get(addr);
    if (!cc) return `campo ${addr} desconhecido`;
    if (cc.serie?.tipo === "campo" && cc.serie.relKey && cc.serie.campoFilho) {
      const tipo = cc.serie.alvo?.tpl.fields.find((f) => f.key === cc.serie!.campoFilho)?.type ?? "text";
      return { k: "filho", rel: cc.serie.relKey, slug: cc.serie.campoFilho, tipo, generalizado: true };
    }
    if (!cc.campo) return `campo ${cc.pf.label} não convertido`;
    return { k: "card", slug: cc.campo.key, tipo: cc.campo.type };
  }

  /** CEL da condição (OU entre grupos, E dentro do grupo), ou o motivo de não converter. */
  condicao(b: BoardConv, c: PfCondicao | null | undefined): { expr: string | null; generalizada: boolean } | string {
    const exps = c?.expressions ?? [];
    if (!exps.length) return { expr: null, generalizada: false };
    let generalizada = false;
    const partes = new Map<string, string>();
    for (const x of exps) {
      const r = this.ref(b, x.field_address);
      if (typeof r === "string") return r;
      let e: string | null;
      if (r.k === "fase") {
        const nome = this.nomeFase.get(x.value ?? "") ?? x.value ?? "";
        e =
          x.operation === "equals"
            ? `fase == ${JSON.stringify(nome)}`
            : x.operation === "not_equals"
              ? `fase != ${JSON.stringify(nome)}`
              : x.operation === "blank"
                ? "fase == null"
                : x.operation === "present"
                  ? "fase != null"
                  : null;
      } else if (r.k === "card") {
        e = exprBase(`card.${r.slug}`, r.tipo, x.operation, x.value);
      } else {
        generalizada ||= r.generalizado;
        const dentro = exprBase(`p.${r.slug}`, r.tipo, x.operation, x.value);
        e = dentro ? `filhos(${JSON.stringify(r.rel)}).algum(p, ${dentro})` : null;
      }
      if (!e) return `operação ${x.operation} sem equivalente`;
      partes.set(String(x.structure_id), e);
    }
    const estrutura = c?.expressions_structure?.length ? c.expressions_structure : [exps.map((x) => String(x.structure_id))];
    const grupos = estrutura.map((g) => g.map((id) => partes.get(String(id))).filter((x): x is string => !!x)).filter((g) => g.length);
    const expr = grupos.map((g) => (g.length > 1 ? `(${g.join(" && ")})` : g[0])).join(" || ");
    return { expr: grupos.length > 1 ? expr : semParenteses(expr), generalizada };
  }

  descreverCondicao(b: BoardConv, c: PfCondicao | null | undefined): string {
    const exps = c?.expressions ?? [];
    if (!exps.length) return "—";
    return exps
      .map((x) => {
        const cc = b.porRef.get(x.field_address.split(".")[0]);
        const nome = x.field_address === "current_phase" ? "fase" : cc?.pf.label ?? x.field_address;
        const v = x.field_address === "current_phase" ? this.nomeFase.get(x.value ?? "") ?? x.value : x.value;
        return `${nome} ${x.operation}${v ? ` "${v}"` : ""}`;
      })
      .join(c?.expressions_structure && c.expressions_structure.length > 1 ? " OU " : " E ");
  }

  // -- condicionais de campo → visible ---------------------------------------

  condicionais(b: BoardConv) {
    const todas: PfCondicional[] = [...(b.exp.repo.startFormFieldConditions ?? []), ...(b.exp.repo.phases ?? []).flatMap((f) => f.fieldConditions ?? [])];
    const porCampo = new Map<string, { mostra: string[]; esconde: string[] }>();
    for (const fc of todas) {
      b.rel.condicionais.total++;
      const r = this.condicao(b, fc.condition);
      if (typeof r === "string" || !r.expr) {
        b.rel.condicionais.naoConvertidas.push(`${fc.name || fc.id}: ${typeof r === "string" ? r : "sem condição"}`);
        continue;
      }
      let ok = false;
      for (const a of fc.actions ?? []) {
        const cc = a.phaseField ? b.porRef.get(a.phaseField.id) : undefined;
        if (!cc?.campo) continue;
        const e = porCampo.get(cc.campo.key) ?? { mostra: [], esconde: [] };
        // show+true / hide+false: visível quando a condição vale; hide+true / show+false: oculto quando vale.
        if ((a.actionId === "show" && a.whenEvaluator) || (a.actionId === "hide" && !a.whenEvaluator)) e.mostra.push(r.expr);
        else e.esconde.push(r.expr);
        porCampo.set(cc.campo.key, e);
        ok = true;
      }
      if (ok) b.rel.condicionais.convertidas++;
      else b.rel.condicionais.naoConvertidas.push(`${fc.name || fc.id}: campos-alvo não convertidos`);
    }
    for (const [key, e] of porCampo) {
      const c = b.tpl.fields.find((f) => f.key === key)!;
      const mostra = [...new Set(e.mostra)];
      const esconde = [...new Set(e.esconde)];
      const partes = [...(mostra.length ? [mostra.length > 1 ? `(${mostra.map((x) => `(${x})`).join(" || ")})` : `(${mostra[0]})`] : []), ...esconde.map((x) => `!(${x})`)];
      c.visible = semParenteses(partes.join(" && "));
    }
  }

  // -- automações ------------------------------------------------------------

  automacoes(b: BoardConv) {
    const bloqueios: { fase: string; ok: string; mensagem: string; linhas: LinhaAutomacao[] }[] = [];
    const pendentes = new Map<string, { a: PfAutomacao; linhas: LinhaAutomacao[] }>();
    const membros = new Map<string, Serie>();
    for (const s of b.series) for (const m of s.membros) for (const id of [m.id, String(m.internal_id ?? "")]) if (id) membros.set(id, s);

    for (const a of b.autos) {
      const gatilho = this.descreverGatilho(b, a);
      const linha: LinhaAutomacao = {
        origem: a.name,
        ativa: a.active !== false,
        gatilho,
        condicao: this.descreverCondicao(b, a.condition),
        acao: this.descreverAcao(a),
        destino: "pendente",
        ref: null,
      };
      b.rel.automacoes.push(linha);

      // Fórmulas → rollup / dynamic_text
      if (a.action_id === "run_a_formula" && this.formula(b, a, linha)) continue;

      // "Move de volta se condição" → can_enter da fase de destino do movimento
      const para = a.event_params?.to_phase_id;
      const volta = a.action_params?.to_phase_id;
      if (a.event_id === "card_moved" && a.action_id === "move_single_card" && para && volta) {
        const fp = this.keyFase.get(para);
        const fv = this.keyFase.get(volta);
        const r = this.condicao(b, a.condition);
        if (fp?.board === b && fv?.board === b && fv.index < fp.index && typeof r !== "string" && r.expr) {
          bloqueios.push({ fase: fp.key, ok: `!(${r.expr})`, mensagem: a.name.replace(/\(c[óo]pia \d+\)/gi, "").trim(), linhas: [linha] });
          linha.destino = "regra";
          if (r.generalizada) linha.nota = "condição sobre um item da série generalizada para todos os filhos";
          continue;
        }
      }

      // Cópia de um membro de série de campo para o filho: o campo passa a ser editado no filho.
      const copiaDeSerie =
        a.action_id === "update_card_field" &&
        (a.action_params?.field_map ?? []).length > 0 &&
        (a.action_params?.field_map ?? []).every((fm) => {
          const refs = [...(fm.value ?? "").matchAll(/%\{([^}|]+)/g)].map((x) => x[1]);
          const s = refs.length === 1 ? membros.get(refs[0]) : undefined;
          return s?.tipo === "campo" && s.alvo?.exp.repo.id === a.action_repo_v2?.id && s.alvo?.porRef.get(fm.fieldId)?.campo?.key === s.campoFilho;
        });
      if (copiaDeSerie) {
        linha.destino = "absorvida";
        linha.nota = "o campo numerado virou campo do card filho; a cópia deixa de existir";
        continue;
      }

      // Sem equivalente: automação pendente (séries de nomes iguais viram uma só)
      const chave = `${a.event_id}|${a.action_id}|${nomeBase(a.name)}`;
      const p = pendentes.get(chave) ?? { a, linhas: [] };
      p.linhas.push(linha);
      pendentes.set(chave, p);
    }

    // Bloqueios iguais em várias fases viram uma regra só.
    const porExpr = new Map<string, typeof bloqueios>();
    for (const x of bloqueios) porExpr.set(x.ok, [...(porExpr.get(x.ok) ?? []), x]);
    for (const [ok, xs] of porExpr) {
      const fases = [...new Set(xs.map((x) => x.fase))];
      const regra: RegraTemplate =
        fases.length === 1
          ? { kind: "can_enter", phase: fases[0], expr: ok, message: xs[0].mensagem }
          : {
              kind: "can_enter",
              phase: null,
              expr: `!(fase_destino in [${fases.map((f) => JSON.stringify(b.tpl.phases.find((p) => p.key === f)!.name)).join(", ")}]) || ${ok}`,
              message: xs[0].mensagem,
            };
      b.tpl.rules!.push(regra);
      b.rel.regras++;
      const ref = `regra ${b.tpl.rules!.length}`;
      for (const x of xs) for (const l of x.linhas) l.ref = ref;
      if (xs.length > 1) for (const x of xs) for (const l of x.linhas) l.nota = [l.nota, `${xs.length} automações iguais em fases diferentes → 1 regra`].filter(Boolean).join("; ");
    }

    let n = 0;
    for (const { a, linhas } of pendentes.values()) {
      const key = `a${++n}`;
      const r = this.condicao(b, a.condition);
      const fase = this.keyFase.get(a.event_params?.to_phase_id ?? a.event_params?.inPhaseId ?? "")?.key ?? null;
      const auto: AutomacaoTemplate = {
        key,
        name: linhas.length > 1 ? `${nomeBase(a.name).replace(/#/g, "N")} (série de ${linhas.length})` : a.name,
        trigger: {
          event: a.event_id,
          phase: fase,
          fields: (a.event_params?.triggerFields ?? []).map((f) => b.porRef.get(f.id)?.campo?.key ?? f.label ?? f.id),
        },
        condition: typeof r === "string" ? null : r.expr,
        actions: [
          {
            type: a.action_id,
            params: {
              ...(a.action_repo_v2 ? { repo: this.porRepo.get(a.action_repo_v2.id)?.key ?? a.action_repo_v2.name ?? a.action_repo_v2.id } : {}),
              ...(a.action_params?.to_phase_id ? { to_phase: this.nomeFase.get(a.action_params.to_phase_id) ?? a.action_params.to_phase_id } : {}),
              ...(a.action_params?.field_map?.length ? { campos: a.action_params.field_map.map((fm) => this.nomeCampo(fm.fieldId)) } : {}),
            },
          },
        ],
        status: "pendente",
        ...(typeof r === "string" ? { note: `condição não convertida: ${r}` } : linhas.length > 1 ? { note: "série de automações numeradas: no Plexu, uma por card filho" } : {}),
      };
      b.tpl.automations!.push(auto);
      b.rel.pendentes++;
      for (const l of linhas) {
        l.ref = key;
        if (linhas.length > 1) l.nota = `agrupada: ${linhas.length} automações → 1 pendente`;
      }
    }
  }

  formula(b: BoardConv, a: PfAutomacao, linha: LinhaAutomacao): boolean {
    const fms = a.action_params?.field_map ?? [];
    if (fms.length !== 1) return false;
    const fm = fms[0];
    const alvoBoard = this.porRepo.get(a.action_repo_v2?.id ?? "") ?? b;
    const alvo = alvoBoard.porRef.get(fm.fieldId)?.campo;
    const m = (fm.value ?? "").match(/^\s*(SUM|SUBTRACT|MULTIPLY|DIVIDE)\s*\((.*)\)\s*$/is);
    if (!alvo || !m) return false;
    const refs = [...m[2].matchAll(/%\{([^}|]+)\}/g)].map((x) => x[1]);
    const op = m[1].toUpperCase();
    if (!refs.length) return false;

    // SUM de <membro da série>.<campo do filho> → rollup sum na relação 1:N
    const pontos = refs.map((r) => r.split("."));
    if (op === "SUM" && pontos.every((p) => p.length === 2)) {
      const series = new Set(pontos.map((p) => alvoBoard.porRef.get(p[0])?.serie));
      const filhos = new Set(pontos.map((p) => p[1]));
      const s = [...series][0];
      if (series.size === 1 && s?.tipo === "conexao" && s.relKey && s.alvo && filhos.size === 1) {
        const campoFilho = s.alvo.porRef.get([...filhos][0])?.campo;
        if (!campoFilho) return false;
        if (alvo.type !== "rollup") {
          const formato = alvo.type === "currency" ? ({ format: "currency" } as const) : {};
          delete alvo.required;
          delete alvo.editable_everywhere;
          delete alvo.currency;
          alvo.type = "rollup";
          alvo.rollup = { via: s.relKey, agg: "sum", expr: campoFilho.key, ...formato };
          alvoBoard.rel.rollups++;
          alvoBoard.rel.campos.find((l) => l.destino === alvo.key)!.tipoDestino = "rollup";
        }
        linha.destino = "rollup";
        linha.ref = alvo.key;
        linha.nota = `soma de ${s.alvo.tpl.name}.${campoFilho.key} pela relação ${s.relKey}`;
        const gemeo = alvoBoard.tpl.fields.find((f) => f !== alvo && f.type === "rollup" && f.rollup?.via === s.relKey && f.rollup?.expr === campoFilho.key && !f.rollup?.filter);
        if (gemeo) {
          const gatilho = (a.event_params?.triggerFields ?? []).map((t) => alvoBoard.porRef.get(t.id)?.serie).find((x) => x?.tipo === "campo");
          linha.nota += `; soma o mesmo campo que ${gemeo.key}: a diferença estava no gatilho da automação — defina rollup.filter` + (gatilho?.campoFilho ? ` (provável: sobre ${s.alvo.tpl.name}.${gatilho.campoFilho})` : "");
        }
        return true;
      }
      return false;
    }
    // Operação entre campos do próprio card → texto calculado
    if (pontos.every((p) => p.length === 1)) {
      const slugs = refs.map((r) => alvoBoard.porRef.get(r)?.campo?.key);
      if (slugs.some((x) => !x)) return false;
      const sinal = { SUM: " + ", SUBTRACT: " - ", MULTIPLY: " * ", DIVIDE: " / " }[op]!;
      if (alvo.type !== "dynamic_text") {
        delete alvo.required;
        delete alvo.editable_everywhere;
        delete alvo.currency;
        alvo.type = "dynamic_text";
        alvo.dynamic_text = { template: `{${slugs.map((x) => `card.${x}`).join(sinal)}}` };
        alvoBoard.rel.textosCalculados++;
        alvoBoard.rel.campos.find((l) => l.destino === alvo.key)!.tipoDestino = "dynamic_text";
      }
      linha.destino = "dynamic_text";
      linha.ref = alvo.key;
      return true;
    }
    return false;
  }

  nomeCampo(id: string): string {
    for (const b of this.boards) {
      const c = b.porRef.get(id);
      if (c) return c.campo?.key ?? c.pf.label;
    }
    return id;
  }

  descreverGatilho(b: BoardConv, a: PfAutomacao): string {
    const p = a.event_params ?? {};
    const fase = this.nomeFase.get(p.to_phase_id ?? p.inPhaseId ?? p.fromPhaseId ?? "");
    const campos = (p.triggerFields ?? []).map((f) => b.porRef.get(f.id)?.pf.label ?? f.label ?? f.id);
    return [a.event_id, fase ? `fase ${fase}` : "", campos.length ? `campos: ${campos.join(", ")}` : ""].filter(Boolean).join(" · ");
  }

  descreverAcao(a: PfAutomacao): string {
    const destino = a.action_repo_v2 ? this.porRepo.get(a.action_repo_v2.id)?.tpl.name ?? a.action_repo_v2.name ?? a.action_repo_v2.id : "";
    const fase = a.action_params?.to_phase_id ? this.nomeFase.get(a.action_params.to_phase_id) ?? a.action_params.to_phase_id : "";
    return [a.action_id, destino ? `em ${destino}` : "", fase ? `→ ${fase}` : ""].filter(Boolean).join(" ");
  }

  // -- regras vindas da configuração de fase/conexão ---------------------------

  regrasDeFase(b: BoardConv) {
    const nomes = new Map(b.fases.map((f) => [f.pf.id, f.pf.name]));
    for (const f of b.fases) {
      const destinos = (f.pf.cards_can_be_moved_to_phases ?? []).map((x) => nomes.get(x.id)).filter((x): x is string => !!x);
      const outras = b.fases.filter((x) => x !== f).length;
      if (!f.pf.cards_can_be_moved_to_phases || destinos.length >= outras) continue;
      b.tpl.rules!.push({
        kind: "can_enter",
        phase: null,
        expr: `fase_origem != ${JSON.stringify(f.pf.name)} || fase_destino in [${destinos.map((d) => JSON.stringify(d)).join(", ")}]`,
        message: `Destinos permitidos a partir de ${f.pf.name}: ${destinos.join(", ") || "nenhum"}`,
      });
      b.rel.regrasConfig++;
    }
    const terminais = b.fases.filter((f) => f.pf.done).map((f) => JSON.stringify(f.pf.name));
    for (const cc of b.campos) {
      const rel = cc.serie?.tipo === "conexao" ? cc.serie.relKey : cc.campo?.type === "relation" ? cc.campo.key : "";
      if (!rel || !cc.pf.childMustExistToFinishParent || !terminais.length) continue;
      if (b.tpl.rules!.some((r) => r.expr.includes(`filhos(${JSON.stringify(rel)}).contar() > 0`))) continue;
      b.tpl.rules!.push({ kind: "can_enter", phase: null, expr: `!(fase_destino in [${terminais.join(", ")}]) || filhos(${JSON.stringify(rel)}).contar() > 0`, message: `${cc.pf.label}: é preciso ao menos um card ligado para finalizar` });
      b.rel.regrasConfig++;
    }
    for (const cc of b.campos) {
      if (cc.pf.allChildrenMustBeDoneToFinishParent || cc.pf.allChildrenMustBeDoneToMoveParent)
        b.rel.naoRepresentado.push({ item: `${cc.pf.label}: filhos concluídos para mover/finalizar o pai`, motivo: "exige a fase dos cards ligados nas expressões (ainda não exposta em filhos())" });
    }
  }

  finalizar(b: BoardConv) {
    if (!b.tpl.rules?.length) delete b.tpl.rules;
    if (!b.tpl.automations?.length) delete b.tpl.automations;
  }
}

/** Converte exports (um por pipe/database) em template + relatório. */
export function converterPipefy(exports: PfExport[], opcoes: { nome?: string; anonimizar?: boolean } = {}) {
  const entrada = opcoes.anonimizar ? anonimizarExports(exports) : exports;
  return new Conversor(entrada, !!opcoes.anonimizar).run(opcoes.nome ?? (opcoes.anonimizar ? "Template convertido" : entrada.map((e) => e.repo.name).join(" + ")));
}

// ---------------------------------------------------------------------------
// Anonimização: troca nomes por genéricos preservando estrutura (séries, opções, referências).
// ---------------------------------------------------------------------------

export function anonimizarExports(exports: PfExport[]): PfExport[] {
  const es = JSON.parse(JSON.stringify(exports)) as PfExport[];
  // Só letras (A, B, …, Z, AA, AB…): rótulos anônimos não podem terminar em número, senão viram "série".
  const letras = (i: number): string => (i >= 26 ? letras(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));
  const repos = new Map<string, string>();
  es.forEach((e, i) => {
    const nome = `Board ${letras(i)}`;
    repos.set(e.id, nome);
    repos.set(e.repo.id, nome);
  });
  let externos = 0;
  const nomeRepo = (id: string) => {
    if (!repos.has(id)) repos.set(id, `Board externo ${++externos}`);
    return repos.get(id)!;
  };
  const radicais = new Map<string, string>();
  const anonimo = (texto: string, prefixo: string) => {
    const radical = texto.replace(/\d+/g, "#");
    if (!radicais.has(`${prefixo}|${radical}`)) radicais.set(`${prefixo}|${radical}`, `${prefixo} ${letras([...radicais.keys()].filter((k) => k.startsWith(`${prefixo}|`)).length)}`);
    const nums = texto.match(/\d+/g) ?? [];
    return [radicais.get(`${prefixo}|${radical}`)!, ...nums].join(" ");
  };
  const idsCampo = new Map<string, string>();
  const opcoesPorCampo = new Map<string, Map<string, string>>();

  for (const e of es) {
    e.repo.name = nomeRepo(e.id);
    e.repo.labels = (e.repo.labels ?? []).map((l, i) => ({ id: l.id, name: `Etiqueta ${i + 1}` }));
    const fases = e.repo.phases ?? [];
    fases.forEach((f, i) => (f.name = `Fase ${i + 1}`));
    const campos = [...(e.repo.start_form_fields ?? []), ...(e.repo.table_fields ?? []), ...fases.flatMap((f) => f.fields ?? [])];
    for (const c of campos) {
      const novo = `f_${c.internal_id ?? c.id.replace(/[^a-z0-9]/gi, "").slice(0, 8)}`;
      idsCampo.set(c.id, novo);
      const ops = new Map((c.options ?? []).map((o, i) => [String(o), `Opção ${i + 1}`]));
      opcoesPorCampo.set(novo, ops);
      if (c.internal_id) opcoesPorCampo.set(String(c.internal_id), ops);
      c.id = novo;
      c.label = anonimo(c.label, "Campo");
      c.options = c.options ? c.options.map((o) => ops.get(String(o))!) : c.options;
      c.help = null;
      c.description = null;
      if (c.connectedRepo) c.connectedRepo = { ...c.connectedRepo, name: nomeRepo(c.connectedRepo.id) };
    }
  }
  const valor = (addr: string, v: string | null) => {
    if (v == null || addr === "current_phase" || v === "" || Number.isFinite(Number(v))) return v;
    const ops = opcoesPorCampo.get(addr.split(".").at(-1)!);
    return ops?.get(v) ?? "valor";
  };
  const condicao = (c: PfCondicao | null | undefined) => {
    for (const x of c?.expressions ?? []) x.value = valor(x.field_address, x.value);
  };
  for (const e of es) {
    if (e.repo.title_field?.id) e.repo.title_field = { id: idsCampo.get(e.repo.title_field.id) ?? e.repo.title_field.id };
    const conds = [...(e.repo.startFormFieldConditions ?? []), ...(e.repo.phases ?? []).flatMap((f) => f.fieldConditions ?? [])];
    conds.forEach((fc, i) => {
      fc.name = `Condicional ${i + 1}`;
      condicao(fc.condition);
      for (const a of fc.actions ?? []) if (a.phaseField) a.phaseField = { id: idsCampo.get(a.phaseField.id) ?? a.phaseField.id };
    });
    for (const a of e.automacoes) {
      a.name = anonimo(a.name, "Automação");
      condicao(a.condition);
      if (a.action_repo_v2) a.action_repo_v2 = { ...a.action_repo_v2, name: nomeRepo(a.action_repo_v2.id) };
      if (a.event_repo) a.event_repo = { ...a.event_repo, name: nomeRepo(a.event_repo.id) };
      if (a.event_params?.triggerFields) a.event_params.triggerFields = a.event_params.triggerFields.map((f) => ({ id: idsCampo.get(f.id) ?? f.id }));
      for (const fm of a.action_params?.field_map ?? []) {
        if (fm.inputMode === "fixed_value") fm.value = "valor";
        // Fórmulas mantêm função e referências; cópias mantêm só as referências (sem texto literal).
        else if (fm.value && !/^\s*[A-Z_]+\s*\(/.test(fm.value)) fm.value = (fm.value.match(/%\{[^}]+\}/g) ?? []).join(" ");
      }
    }
  }
  return es;
}
