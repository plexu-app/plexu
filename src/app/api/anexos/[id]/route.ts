// GET /api/anexos/<id>: download com o nome original (Content-Disposition). Exige sessão e acesso ao
// card do anexo; a pasta de anexos nunca é servida estaticamente.
import { contentDisposition } from "@/lib/anexos";
import { usuarioAtual } from "@/server/auth/sessao";
import { abrirDownload, ErroAnexo } from "@/server/anexos/servico";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await usuarioAtual();
  if (!u) return Response.json({ erro: "não autenticado" }, { status: 401 });
  try {
    const a = await abrirDownload({ usuarioId: u.id, id: (await params).id });
    return new Response(a.corpo, {
      headers: {
        "content-type": a.mime || "application/octet-stream",
        "content-length": String(a.size),
        "content-disposition": contentDisposition(a.filename),
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof ErroAnexo) return Response.json({ erro: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ erro: "erro inesperado ao baixar o anexo" }, { status: 500 });
  }
}
