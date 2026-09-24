"use server";
import { redirect } from "next/navigation";
import { conferirSenha } from "@/server/auth/senha";
import { criarSessao, encerrarSessao } from "@/server/auth/sessao";
import { ErroConfig, primeiroAcesso } from "@/server/config";
import { credenciaisPorEmail, usuarioPorId } from "@/server/consultas";

export interface EstadoForm {
  erro?: string;
  /** Valores digitados (sem senhas), para repreencher o formulário após erro. */
  valores?: Record<string, string>;
}

const semSenha = (form: FormData) =>
  Object.fromEntries([...form.entries()].filter(([k, v]) => k !== "senha" && typeof v === "string").map(([k, v]) => [k, String(v)]));

export async function entrar(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const email = String(form.get("email") ?? "");
  const senha = String(form.get("senha") ?? "");
  const cred = await credenciaisPorEmail(email);
  if (!(await conferirSenha(senha, cred?.hash)) || !cred) return { erro: "E-mail ou senha incorretos.", valores: semSenha(form) };
  await criarSessao(cred.id, cred.versaoSessao);
  redirect("/");
}

export async function criarPrimeiroAcesso(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  let userId: string;
  let wsSlug: string;
  try {
    ({ userId, wsSlug } = await primeiroAcesso({
      workspace: String(form.get("workspace") ?? ""),
      nome: String(form.get("nome") ?? ""),
      email: String(form.get("email") ?? ""),
      senha: String(form.get("senha") ?? ""),
    }));
  } catch (e) {
    if (e instanceof ErroConfig) return { erro: e.message, valores: semSenha(form) };
    throw e;
  }
  const u = await usuarioPorId(userId);
  await criarSessao(userId, u?.versaoSessao ?? 0);
  redirect(`/w/${wsSlug}`);
}

export async function sair(): Promise<void> {
  await encerrarSessao();
  redirect("/login");
}
