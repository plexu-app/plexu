import "server-only";
import { cookies } from "next/headers";
import { segredoApp } from "../env";
import { usuarioPorId } from "../consultas";
import { assinarToken, verificarToken } from "./token";

export const COOKIE_SESSAO = "plexu_sessao";
const DURACAO_S = 60 * 60 * 24 * 30;

export async function criarSessao(userId: string, versao: number): Promise<void> {
  const e = Math.floor(Date.now() / 1000) + DURACAO_S;
  (await cookies()).set(COOKIE_SESSAO, assinarToken({ u: userId, v: versao, e }, segredoApp()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACAO_S,
  });
}

export async function encerrarSessao(): Promise<void> {
  (await cookies()).delete(COOKIE_SESSAO);
}

export interface UsuarioSessao {
  id: string;
  email: string;
  nome: string;
}

/** Usuário da sessão, ou null se não houver sessão válida (assinatura, validade e versão). */
export async function usuarioAtual(): Promise<UsuarioSessao | null> {
  const p = verificarToken((await cookies()).get(COOKIE_SESSAO)?.value, segredoApp());
  if (!p) return null;
  const u = await usuarioPorId(p.u);
  if (!u || (u.versaoSessao ?? 0) !== p.v) return null;
  return { id: u.id, email: u.email, nome: u.nome };
}
