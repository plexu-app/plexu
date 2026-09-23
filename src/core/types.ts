// Tipos compartilhados do core: transação, ator, erros.
import type { db } from "../db";
import type { cards } from "../db/schema";

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type CardRow = typeof cards.$inferSelect;

export type ActorType = "user" | "automation" | "api" | "system" | "import" | "form";

/** Quem executa a operação. id é obrigatório, exceto para o ator "system". */
export type Actor =
  | { type: Exclude<ActorType, "system">; id: string }
  | { type: "system"; id: string | null };

export type CodigoCore =
  | "nao_encontrado"
  | "validacao"
  | "regra"
  | "obrigatorio"
  | "somente_leitura"
  | "campo_travado"
  | "unicidade"
  | "relacao_exclusiva"
  | "relacao_invalida"
  | "sequencia"
  | "ator_invalido";

export class CoreError extends Error {
  readonly codigo: CodigoCore;
  readonly ruleId: string | null;
  readonly campos: string[];
  constructor(codigo: CodigoCore, motivo: string, extra: { ruleId?: string | null; campos?: string[] } = {}) {
    super(motivo);
    this.name = "CoreError";
    this.codigo = codigo;
    this.ruleId = extra.ruleId ?? null;
    this.campos = extra.campos ?? [];
  }
}

/** Opções comuns das operações do core. Com tx, a operação roda em savepoint dessa transação. */
export interface OpcoesOp {
  tx?: Tx;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export function validarAtor(actor: Actor | undefined): asserts actor is Actor {
  const tipos: ActorType[] = ["user", "automation", "api", "system", "import", "form"];
  if (!actor || !tipos.includes(actor.type)) throw new CoreError("ator_invalido", "actor.type obrigatório");
  if (actor.type === "system") {
    if (actor.id !== null && !ehUuid(actor.id)) throw new CoreError("ator_invalido", "actor.id deve ser uuid ou null");
  } else if (!ehUuid(actor.id)) {
    throw new CoreError("ator_invalido", `actor.id (uuid) obrigatório para ator '${actor.type}'`);
  }
}
