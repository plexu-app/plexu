import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const [{ now }] = await db.execute<{ now: string }>(sql`select now()`);
    return Response.json({ ok: true, db: now, version: process.env.npm_package_version ?? "dev" });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
