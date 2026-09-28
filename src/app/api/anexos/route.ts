// POST /api/anexos (multipart): ws, board, fieldId e um ou mais "arquivo". Autenticado pela sessão.
// Devolve [{ id, filename, size, mime }]; o id entra no campo de anexo ao salvar/criar o card.
import { usuarioAtual } from "@/server/auth/sessao";
import { ErroAnexo, receberUpload } from "@/server/anexos/servico";

export async function POST(req: Request) {
  const u = await usuarioAtual();
  if (!u) return Response.json({ erro: "não autenticado" }, { status: 401 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ erro: "envio multipart inválido" }, { status: 400 });
  }
  const texto = (k: string) => String(form.get(k) ?? "");
  const arquivos = form.getAll("arquivo").filter((x): x is File => typeof x === "object" && x !== null && "arrayBuffer" in x);
  try {
    const anexos = await receberUpload({ usuarioId: u.id, ws: texto("ws"), board: texto("board"), fieldId: texto("fieldId"), arquivos });
    return Response.json({ anexos });
  } catch (e) {
    if (e instanceof ErroAnexo) return Response.json({ erro: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ erro: "erro inesperado ao enviar o anexo" }, { status: 500 });
  }
}
