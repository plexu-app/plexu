// Variáveis e conexões do workspace. Valores secretos ficam cifrados no banco (AES-256-GCM, chave
// derivada do APP_SECRET) e só são decifrados aqui, na hora de executar um passo.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { connections, variables } from "../db/schema";
import type { Tx } from "../core";

const PREFIXO = "v1";

function chave(): Buffer {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 16) throw new Error("APP_SECRET ausente ou curto: necessário para variáveis secretas");
  return createHash("sha256").update(`plexu:variaveis:${s}`).digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [PREFIXO, iv.toString("base64url"), c.getAuthTag().toString("base64url"), dados.toString("base64url")].join(":");
}

export function decifrar(cifrado: string): string {
  const [v, iv, tag, dados] = cifrado.split(":");
  if (v !== PREFIXO || !iv || !tag || dados === undefined) throw new Error("variável secreta em formato inválido");
  const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(dados, "base64url")), d.final()]).toString("utf8");
}

export interface Variaveis {
  valores: Map<string, string>;
  /** Valores secretos em claro, para mascarar no log. */
  segredos: string[];
}

export async function lerVariaveis(workspaceId: string, tx: Tx | typeof db = db): Promise<Variaveis> {
  const rows = await tx.select().from(variables).where(eq(variables.workspaceId, workspaceId));
  const valores = new Map<string, string>();
  const segredos: string[] = [];
  for (const r of rows) {
    const v = r.isSecret ? decifrar(r.value) : r.value;
    valores.set(r.key, v);
    if (r.isSecret && v) segredos.push(v);
  }
  return { valores, segredos };
}

/** Grava (ou troca) uma variável; secreta é cifrada. */
export async function gravarVariavel(workspaceId: string, key: string, value: string, isSecret: boolean, tx: Tx | typeof db = db) {
  const valor = isSecret ? cifrar(value) : value;
  await tx
    .insert(variables)
    .values({ workspaceId, key, value: valor, isSecret })
    .onConflictDoUpdate({ target: [variables.workspaceId, variables.key], set: { value: valor, isSecret } });
}

export interface Smtp {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

/** SMTP do workspace: a primeira conexão do tipo smtp (senha na variável secreta secret_ref). */
export async function smtpDoWorkspace(workspaceId: string, vars: Variaveis, tx: Tx | typeof db = db): Promise<Smtp | null> {
  const [c] = await tx.select().from(connections).where(and(eq(connections.workspaceId, workspaceId), eq(connections.type, "smtp"))).limit(1);
  if (!c) return null;
  const cfg = c.config as Record<string, unknown>;
  const host = String(cfg.host ?? "").trim();
  const from = String(cfg.from ?? "").trim();
  if (!host || !from) return null;
  return {
    host,
    port: Number(cfg.port ?? 587),
    secure: cfg.secure === true,
    user: cfg.user ? String(cfg.user) : undefined,
    pass: c.secretRef ? vars.valores.get(c.secretRef) : undefined,
    from,
  };
}

/** Troca cada segredo por •••• (log de execução e respostas). */
export function mascarar(texto: string, segredos: string[]): string {
  let s = texto;
  for (const x of segredos) if (x.length >= 3) s = s.split(x).join("••••");
  return s;
}
