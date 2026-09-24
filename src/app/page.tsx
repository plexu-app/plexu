import { redirect } from "next/navigation";
import { usuarioAtual } from "@/server/auth/sessao";
import { haUsuarios, workspacesDoUsuario } from "@/server/consultas";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await haUsuarios())) redirect("/setup");
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  const [ws] = await workspacesDoUsuario(u.id);
  if (!ws) {
    return <main className="p-10 text-sm">Sua conta não participa de nenhum workspace. Peça um convite a um administrador.</main>;
  }
  redirect(`/w/${ws.slug}`);
}
