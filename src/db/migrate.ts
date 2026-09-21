// Migrador simples: aplica src/db/migrations/*.sql em ordem, uma vez cada.
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Diretório das migrações: MIGRATIONS_DIR ou <cwd>/src/db/migrations (funciona no dev e no container).
const dir = process.env.MIGRATIONS_DIR ?? join(process.cwd(), "src", "db", "migrations");
const url = process.env.DATABASE_URL ?? "postgres://plexu:plexu@localhost:5433/plexu";
const sql = postgres(url, { max: 1, onnotice: () => {} });

await sql`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`;
const applied = new Set((await sql`select name from _migrations`).map((r) => r.name as string));
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

for (const f of files) {
  if (applied.has(f)) continue;
  process.stdout.write(`applying ${f}... `);
  await sql.begin(async (tx) => {
    await tx.unsafe(readFileSync(join(dir, f), "utf8"));
    await tx`insert into _migrations (name) values (${f})`;
  });
  console.log("ok");
}
console.log(`migrations up to date (${files.length})`);
await sql.end();
