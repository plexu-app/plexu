import { saudeDoBanco } from "@/server/consultas";

export async function GET() {
  try {
    return Response.json({ ok: true, db: await saudeDoBanco(), version: process.env.npm_package_version ?? "dev" });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
