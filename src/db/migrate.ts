// `pnpm db:migrate`: cria o banco de DATABASE_URL se não existir e aplica as migrações pendentes.
// Também roda no container (scripts/migrate.mjs, com MIGRATIONS_DIR).
import { garantirBanco, migrar } from "./migrar";

const url = process.env.DATABASE_URL ?? "postgres://plexu:plexu@localhost:5433/plexu";
if (await garantirBanco(url)) console.log(`banco criado: ${new URL(url).pathname.slice(1)}`);
const total = await migrar(url, undefined, console.log);
console.log(`migrations up to date (${total})`);
