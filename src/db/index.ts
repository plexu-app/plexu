import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "postgres://plexu:plexu@localhost:5433/plexu";

// O next dev reavalia este módulo a cada hot reload (e uma vez por bundle de rota). Sem cache, cada
// reavaliação abria um pool novo e os antigos ficavam com conexões ociosas até esgotar o Postgres
// ("too many clients already"). Fora de produção o pool fica em globalThis e sobrevive às recargas
// (o mesmo padrão do PrismaClient no Next). Em produção o módulo é avaliado uma vez só.
const global = globalThis as unknown as { plexuSql?: ReturnType<typeof postgres> };
const client = global.plexuSql ?? postgres(url, { max: 10 });
if (process.env.NODE_ENV !== "production") global.plexuSql = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
