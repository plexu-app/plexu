// Migrador simples, reutilizável: cria o banco se não existir e aplica src/db/migrations/*.sql em ordem, uma vez cada.
// Usado por `pnpm db:migrate` (src/db/migrate.ts), pelo container e pelo setup global do vitest.
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DIR_MIGRACOES = process.env.MIGRATIONS_DIR ?? join(process.cwd(), "src", "db", "migrations");

/** Troca o nome do banco numa URL postgres://… */
export function comBanco(url: string, banco: string): string {
  const u = new URL(url);
  u.pathname = `/${banco}`;
  return u.toString();
}

/**
 * Garante que o banco da URL existe. Só tenta criar se a conexão falhar com 3D000
 * (banco inexistente); para isso conecta no banco "postgres" do mesmo servidor.
 */
export async function garantirBanco(url: string): Promise<boolean> {
  const nome = decodeURIComponent(new URL(url).pathname.slice(1));
  const teste = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await teste`select 1`;
    return false;
  } catch (e) {
    if ((e as { code?: string }).code !== "3D000") throw e;
  } finally {
    await teste.end();
  }
  if (!/^[A-Za-z0-9_]+$/.test(nome)) throw new Error(`nome de banco inválido: ${nome}`);
  const admin = postgres(comBanco(url, "postgres"), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`create database "${nome}"`);
  } catch (e) {
    if ((e as { code?: string }).code !== "42P04") throw e; // criado em paralelo por outro processo
  } finally {
    await admin.end();
  }
  return true;
}

/** Aplica as migrações pendentes; devolve o total de arquivos de migração. */
export async function migrar(url: string, dir = DIR_MIGRACOES, log: (m: string) => void = () => {}): Promise<number> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`select pg_advisory_lock(hashtext('plexu:migracoes'))`;
    await sql`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`;
    const aplicadas = new Set((await sql`select name from _migrations`).map((r) => r.name as string));
    const arquivos = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const f of arquivos) {
      if (aplicadas.has(f)) continue;
      await sql.begin(async (tx) => {
        await tx.unsafe(readFileSync(join(dir, f), "utf8"));
        await tx`insert into _migrations (name) values (${f})`;
      });
      log(`applying ${f}... ok`);
    }
    return arquivos.length;
  } finally {
    await sql.end();
  }
}
