// Token de sessão assinado (HMAC-SHA256). Puro: sem cookies nem banco.
import { createHmac, timingSafeEqual } from "node:crypto";

export interface PayloadSessao {
  /** id do usuário */
  u: string;
  /** versão de sessão do usuário (users.auth.sv): incrementar invalida sessões antigas */
  v: number;
  /** expiração (epoch em segundos) */
  e: number;
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");

function assinatura(corpo: string, segredo: string): string {
  return createHmac("sha256", segredo).update(corpo).digest("base64url");
}

export function assinarToken(p: PayloadSessao, segredo: string): string {
  const corpo = b64(JSON.stringify(p));
  return `${corpo}.${assinatura(corpo, segredo)}`;
}

/** Payload se a assinatura confere e não expirou; null caso contrário. */
export function verificarToken(token: string | undefined, segredo: string, agora = Date.now()): PayloadSessao | null {
  if (!token) return null;
  const [corpo, sig, ...resto] = token.split(".");
  if (!corpo || !sig || resto.length) return null;
  const esperada = Buffer.from(assinatura(corpo, segredo));
  const recebida = Buffer.from(sig);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
  try {
    const p = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) as PayloadSessao;
    if (typeof p.u !== "string" || typeof p.v !== "number" || typeof p.e !== "number") return null;
    return p.e * 1000 > agora ? p : null;
  } catch {
    return null;
  }
}
