// Import/export de templates (src/lib/template.ts, docs/TEMPLATE.md) no banco. Só configuração:
// workspace, boards, fases, campos, ajustes por fase e regras. Nunca toca em cards nem card_links.
// Cada entidade criada emite config.changed (decisão 13), como a tela de configurações.
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { emitirEventoConfig, garantirIndiceExclusivo, type Actor } from "../core";
import { normalizarConfig, type ContextoConfig } from "../lib/config-campos";
import { fasesDoCampo } from "../lib/fases-preenchimento";
import { slugify, slugLivre } from "../lib/slug";
import { validarTemplate, VERSAO_TEMPLATE, type BoardTemplate, type CampoTemplate, type Template } from "../lib/template";
import { db } from "./index";
import { boards, fieldPhaseSettings, fields, phases, rules, users, workspaceMembers, workspaces } from "./schema";

export class ErroImportacao extends Error {
  constructor(public erros: { onde: string; mensagem: string }[]) {
    super(erros.map((e) => `${e.onde}: ${e.mensagem}`).join("\n"));
  }
}

export interface OpcoesImportacao {
  /** Nome do workspace de destino; criado se não existir (slug derivado do nome). */
  workspace: string;
  /** E-mail de um usuário existente, adicionado como owner do workspace (se ainda não for membro). */
  membro?: string;
}

export interface ResultadoImportacao {
  workspace: { id: string; slug: string; criado: boolean };
  boards: { key: string; slug: string; id: string }[];
  automacoesPendentes: number;
}

type Config = Record<string, unknown>;

/** Config do campo no formato do banco, com keys já trocadas por ids. */
function configDoCampo(
  c: CampoTemplate,
  b: BoardTemplate,
  ids: { boards: Map<string, string>; fases: Map<string, string>; campos: Map<string, string> },
): Config {
  const campo = (bk: string, ck: string) => ids.campos.get(`${bk}.${ck}`) ?? "";
  const cfg: Config = {};
  if (c.options) cfg.options = c.options;
  if (c.currency) cfg.currency = c.currency;
  if (c.multiple) cfg.multiple = true;
  if (c.relation) {
    cfg.relation = {
      target_board: ids.boards.get(c.relation.board) ?? "",
      cardinality: c.relation.cardinality ?? "many",
      exclusive: c.relation.exclusive === true,
      is_parent: c.relation.is_parent === true,
      ...(c.relation.inverse_name ? { inverse_name: c.relation.inverse_name } : {}),
      ...(c.relation.filter ? { filter_expr: c.relation.filter } : {}),
    };
  }
  if (c.sequence) {
    cfg.sequence = { ...c.sequence, ...(c.sequence.parent_field ? { parent_field: campo(b.key, c.sequence.parent_field) } : {}) };
  }
  if (c.rollup) {
    const [bk, ck] = c.rollup.via.includes(".") ? c.rollup.via.split(".") : [b.key, c.rollup.via];
    cfg.rollup = {
      via_field: campo(bk, ck),
      agg: c.rollup.agg,
      ...(c.rollup.expr ? { expr: c.rollup.expr } : {}),
      ...(c.rollup.filter ? { filter_expr: c.rollup.filter } : {}),
      ...(c.rollup.format ? { format: c.rollup.format } : {}),
    };
  }
  if (c.dynamic_text) cfg.dynamic_text = c.dynamic_text;
  if (c.fill_phases?.length) {
    cfg.fill_phases = c.fill_phases.map((f) => ids.fases.get(`${b.key}.${f}`) ?? "");
    if (c.editable_everywhere) cfg.editable_everywhere = true;
  }
  return cfg;
}

export async function importarTemplate(t: Template, op: OpcoesImportacao): Promise<ResultadoImportacao> {
  return db.transaction(async (tx) => {
    // Workspace (criado se preciso) e boards que já existem nele (alvos externos de relações).
    const slugWs = slugify(op.workspace);
    let [ws] = await tx.select().from(workspaces).where(eq(workspaces.slug, slugWs));
    const criado = !ws;
    if (!ws) [ws] = await tx.insert(workspaces).values({ slug: slugWs, name: op.workspace, settings: { timezone: "America/Sao_Paulo" } }).returning();
    let actor: Actor = { type: "system", id: null };
    if (op.membro) {
      const [u] = await tx.select().from(users).where(eq(users.email, op.membro));
      if (!u) throw new ErroImportacao([{ onde: "membro", mensagem: `usuário ${op.membro} não existe` }]);
      await tx.insert(workspaceMembers).values({ workspaceId: ws.id, userId: u.id, orgRole: "owner" }).onConflictDoNothing();
      actor = { type: "import", id: u.id };
    }
    const existentes = await tx.select({ id: boards.id, slug: boards.slug, name: boards.name }).from(boards).where(and(eq(boards.workspaceId, ws.id), isNull(boards.archivedAt)));
    const erros = validarTemplate(t, existentes.map((b) => b.slug));
    if (erros.length) throw new ErroImportacao(erros);
    const evento = (boardId: string | null, entidade: "workspace" | "board" | "phase" | "field" | "rule", id: string, dados?: Record<string, unknown>) =>
      emitirEventoConfig(tx, { workspaceId: ws.id, boardId, actor }, { entidade, acao: "created", id, dados: { ...dados, template: t.name } });
    if (criado) await evento(null, "workspace", ws.id, { slug: slugWs });

    const ids = {
      boards: new Map(existentes.map((b) => [b.slug, b.id])),
      fases: new Map<string, string>(),
      campos: new Map<string, string>(),
    };
    const usados = existentes.map((b) => b.slug);
    const saida: ResultadoImportacao["boards"] = [];

    // 1) boards, fases e campos (config provisória), para ter todos os ids antes das referências.
    for (const b of t.boards) {
      const slug = slugLivre(slugify(b.key), usados);
      usados.push(slug);
      const [nb] = await tx.insert(boards).values({ workspaceId: ws.id, name: b.name, slug, kind: b.kind }).returning();
      ids.boards.set(b.key, nb.id);
      saida.push({ key: b.key, slug, id: nb.id });
      await evento(nb.id, "board", nb.id, { slug });
      for (const [i, f] of b.phases.entries()) {
        const [nf] = await tx.insert(phases).values({ boardId: nb.id, name: f.name, position: i, isTerminal: f.terminal === true, color: f.color ?? null }).returning();
        ids.fases.set(`${b.key}.${f.key}`, nf.id);
        await evento(nb.id, "phase", nf.id, { name: f.name });
      }
      for (const [i, c] of b.fields.entries()) {
        const [nc] = await tx
          .insert(fields)
          .values({ boardId: nb.id, slug: c.key, name: c.name, type: c.type as never, position: i, config: {} })
          .returning();
        ids.campos.set(`${b.key}.${c.key}`, nc.id);
      }
    }

    // 2) config de cada campo, validada como na tela de configurações.
    const relsTodas = (await tx.select({ id: fields.id, boardId: fields.boardId, config: fields.config }).from(fields).where(and(eq(fields.type, "relation"), isNull(fields.archivedAt))))
      .map((r) => ({ id: r.id, boardId: r.boardId, target: String(((r.config as Config).relation as { target_board?: string } | undefined)?.target_board ?? "") }));
    const relsTemplate = t.boards.flatMap((b) =>
      b.fields.filter((c) => c.type === "relation").map((c) => ({ id: ids.campos.get(`${b.key}.${c.key}`)!, boardId: ids.boards.get(b.key)!, target: ids.boards.get(c.relation!.board) ?? "" })),
    );
    const nomesBoards = new Map([...existentes.map((b) => [b.id, b.name] as const), ...t.boards.map((b) => [ids.boards.get(b.key)!, b.name] as const)]);
    for (const b of t.boards) {
      const boardId = ids.boards.get(b.key)!;
      const relacoes = new Map(
        [...relsTodas, ...relsTemplate].filter((r) => r.boardId === boardId || r.target === boardId).map((r) => [r.id, { boardId: r.boardId, target: r.target }]),
      );
      const ctx: ContextoConfig = {
        boardId,
        boards: nomesBoards,
        relacoes,
        campos: b.fields.map((c) => ({ id: ids.campos.get(`${b.key}.${c.key}`)!, slug: c.key, type: c.type })),
        fases: new Set(b.phases.map((f) => ids.fases.get(`${b.key}.${f.key}`)!)),
      };
      for (const c of b.fields) {
        const fieldId = ids.campos.get(`${b.key}.${c.key}`)!;
        let config: Config;
        try {
          config = normalizarConfig(c.type, configDoCampo(c, b, ids), ctx);
        } catch (e) {
          throw new ErroImportacao([{ onde: `board ${b.key} › campo ${c.key}`, mensagem: (e as Error).message }]);
        }
        await tx
          .update(fields)
          .set({
            config,
            helpText: c.help ?? null,
            requiredExpr: c.required ?? null,
            visibleExpr: c.visible ?? null,
            defaultValueExpr: c.default ?? null,
            uniqueValue: c.unique === true,
          })
          .where(eq(fields.id, fieldId));
        if ((config.relation as { exclusive?: boolean } | undefined)?.exclusive) await garantirIndiceExclusivo(tx, fieldId);
        for (const a of c.phase_settings ?? []) {
          await tx.insert(fieldPhaseSettings).values({
            fieldId,
            phaseId: ids.fases.get(`${b.key}.${a.phase}`)!,
            visible: a.visible ?? null,
            editable: a.editable ?? null,
            required: a.required ?? null,
          });
        }
        await evento(boardId, "field", fieldId, { slug: c.key, type: c.type });
      }
      if (b.title_field) await tx.update(boards).set({ titleFieldId: ids.campos.get(`${b.key}.${b.title_field}`)! }).where(eq(boards.id, boardId));
      for (const [i, r] of (b.rules ?? []).entries()) {
        const [nr] = await tx
          .insert(rules)
          .values({
            boardId,
            kind: r.kind,
            phaseId: r.phase ? ids.fases.get(`${b.key}.${r.phase}`)! : null,
            fieldId: r.field ? ids.campos.get(`${b.key}.${r.field}`)! : null,
            expr: r.expr,
            message: r.message ?? null,
            position: i,
            enabled: r.enabled !== false,
          })
          .returning();
        await evento(boardId, "rule", nr.id, { kind: r.kind });
      }
    }
    return {
      workspace: { id: ws.id, slug: slugWs, criado },
      boards: saida,
      automacoesPendentes: t.boards.reduce((n, b) => n + (b.automations?.length ?? 0), 0),
    };
  });
}

/**
 * Exporta boards de um workspace como template. Relações para boards fora da lista saem com o slug
 * do board (o importador as resolve no workspace de destino, se existirem lá).
 */
export async function exportarTemplate(wsSlug: string, boardSlugs: string[], nome?: string): Promise<Template> {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, wsSlug));
  if (!ws) throw new Error(`workspace ${wsSlug} não encontrado`);
  const bs = await db.select().from(boards).where(and(eq(boards.workspaceId, ws.id), inArray(boards.slug, boardSlugs), isNull(boards.archivedAt)));
  const faltando = boardSlugs.filter((s) => !bs.some((b) => b.slug === s));
  if (faltando.length) throw new Error(`boards não encontrados em ${wsSlug}: ${faltando.join(", ")}`);
  const ids = bs.map((b) => b.id);
  const [fs, ps, rs] = await Promise.all([
    db.select().from(fields).where(and(inArray(fields.boardId, ids), isNull(fields.archivedAt))).orderBy(asc(fields.position), asc(fields.name)),
    db.select().from(phases).where(and(inArray(phases.boardId, ids), isNull(phases.archivedAt))).orderBy(asc(phases.position)),
    db.select().from(rules).where(inArray(rules.boardId, ids)).orderBy(asc(rules.position)),
  ]);
  const aps = fs.length ? await db.select().from(fieldPhaseSettings).where(inArray(fieldPhaseSettings.fieldId, fs.map((f) => f.id))) : [];
  // Alvos de relação fora da lista: slug do board no workspace.
  const alvos = [...new Set(fs.map((f) => ((f.config as Config).relation as { target_board?: string } | undefined)?.target_board).filter((x): x is string => !!x))];
  const todosAlvos = alvos.length ? await db.select({ id: boards.id, slug: boards.slug }).from(boards).where(inArray(boards.id, alvos)) : [];
  const slugBoard = new Map([...todosAlvos, ...bs].map((b) => [b.id, b.slug]));
  const outrosCampos = await db.select({ id: fields.id, slug: fields.slug, boardId: fields.boardId }).from(fields);
  const refCampo = new Map(outrosCampos.map((f) => [f.id, f]));

  const keyFase = new Map<string, string>();
  for (const b of bs) {
    const usadas: string[] = [];
    for (const p of ps.filter((p) => p.boardId === b.id)) {
      const k = slugLivre(slugify(p.name).replace(/-/g, "_"), usadas);
      usadas.push(k);
      keyFase.set(p.id, k);
    }
  }

  const campoTemplate = (f: typeof fs[number], b: typeof bs[number]): CampoTemplate => {
    const cfg = f.config as Config;
    const c: CampoTemplate = { key: f.slug, name: f.name, type: f.type };
    if (f.helpText) c.help = f.helpText;
    if (f.requiredExpr) c.required = f.requiredExpr;
    if (f.visibleExpr) c.visible = f.visibleExpr;
    if (f.defaultValueExpr) c.default = f.defaultValueExpr;
    if (f.uniqueValue) c.unique = true;
    const fases = fasesDoCampo(cfg).map((id) => keyFase.get(id)).filter((x): x is string => !!x);
    if (fases.length) {
      c.fill_phases = fases;
      if (cfg.editable_everywhere === true) c.editable_everywhere = true;
    }
    if (Array.isArray(cfg.options)) c.options = (cfg.options as unknown[]).map((o) => (typeof o === "string" ? o : String((o as { value?: string }).value ?? "")));
    if (cfg.currency) c.currency = cfg.currency as { code: string };
    if (cfg.multiple === true) c.multiple = true;
    const rel = cfg.relation as Config | undefined;
    if (rel) {
      c.relation = {
        board: slugBoard.get(String(rel.target_board)) ?? String(rel.target_board),
        cardinality: rel.cardinality === "one" ? "one" : "many",
        ...(rel.exclusive ? { exclusive: true } : {}),
        ...(rel.is_parent ? { is_parent: true } : {}),
        ...(rel.inverse_name ? { inverse_name: String(rel.inverse_name) } : {}),
        ...(rel.filter_expr ? { filter: String(rel.filter_expr) } : {}),
      };
    }
    const seq = cfg.sequence as Config | undefined;
    if (seq) {
      c.sequence = {
        pattern: String(seq.pattern),
        scope: seq.scope as NonNullable<CampoTemplate["sequence"]>["scope"],
        seed: Number(seq.seed ?? 1),
        pad: Number(seq.pad ?? 4),
        ...(seq.parent_field ? { parent_field: refCampo.get(String(seq.parent_field))?.slug } : {}),
      };
    }
    const ro = cfg.rollup as Config | undefined;
    if (ro) {
      const via = refCampo.get(String(ro.via_field));
      c.rollup = {
        via: via ? (via.boardId === b.id ? via.slug : `${slugBoard.get(via.boardId) ?? via.boardId}.${via.slug}`) : String(ro.via_field),
        agg: ro.agg as NonNullable<CampoTemplate["rollup"]>["agg"],
        ...(ro.expr ? { expr: String(ro.expr) } : {}),
        ...(ro.filter_expr ? { filter: String(ro.filter_expr) } : {}),
        ...(ro.format === "currency" ? { format: "currency" as const } : {}),
      };
    }
    if (cfg.dynamic_text) c.dynamic_text = cfg.dynamic_text as { template: string };
    const ajustes = aps.filter((a) => a.fieldId === f.id && a.phaseId && keyFase.has(a.phaseId));
    if (ajustes.length) c.phase_settings = ajustes.map((a) => ({ phase: keyFase.get(a.phaseId!)!, visible: a.visible, editable: a.editable, required: a.required }));
    return c;
  };

  return {
    plexu_template: VERSAO_TEMPLATE,
    name: nome ?? `${ws.name}: ${bs.map((b) => b.name).join(", ")}`,
    boards: boardSlugs.map((s) => {
      const b = bs.find((x) => x.slug === s)!;
      const campos = fs.filter((f) => f.boardId === b.id);
      const board: BoardTemplate = {
        key: b.slug,
        name: b.name,
        kind: b.kind,
        title_field: campos.find((f) => f.id === b.titleFieldId)?.slug ?? null,
        phases: ps.filter((p) => p.boardId === b.id).map((p) => ({ key: keyFase.get(p.id)!, name: p.name, ...(p.isTerminal ? { terminal: true } : {}), ...(p.color ? { color: p.color } : {}) })),
        fields: campos.map((f) => campoTemplate(f, b)),
      };
      const regras = rs
        .filter((r) => r.boardId === b.id)
        .map((r) => ({
          kind: r.kind,
          phase: r.phaseId ? keyFase.get(r.phaseId) ?? null : null,
          ...(r.fieldId ? { field: refCampo.get(r.fieldId)?.slug ?? null } : {}),
          expr: r.expr,
          message: r.message,
          ...(r.enabled ? {} : { enabled: false }),
        }));
      return regras.length ? { ...board, rules: regras } : board;
    }),
  };
}
