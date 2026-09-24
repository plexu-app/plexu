// Hash de senha com bcrypt (bcryptjs: JS puro, sem binário nativo).
import bcrypt from "bcryptjs";

export const CUSTO_BCRYPT = 12;
export const SENHA_MINIMA = 8;

export function validarSenha(senha: string): string | null {
  if (typeof senha !== "string" || senha.length < SENHA_MINIMA) return `a senha precisa de pelo menos ${SENHA_MINIMA} caracteres`;
  if (senha.length > 72) return "a senha pode ter no máximo 72 caracteres"; // limite do bcrypt
  return null;
}

export function hashSenha(senha: string, custo = CUSTO_BCRYPT): Promise<string> {
  return bcrypt.hash(senha, custo);
}

export async function conferirSenha(senha: string, hash: string | undefined): Promise<boolean> {
  if (!hash) {
    await bcrypt.hash(senha, 4); // tempo parecido quando o usuário não existe
    return false;
  }
  return bcrypt.compare(senha, hash);
}
