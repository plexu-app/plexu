import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "postgres://plexu:plexu@localhost:5433/plexu";
const client = postgres(url, { max: 10 });
export const db = drizzle(client, { schema });
export type Db = typeof db;
