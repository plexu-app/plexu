// Efeitos externos dos passos (e-mail e HTTP). Injetáveis: testes usam dublês; em "test" nada daqui roda.
import nodemailer from "nodemailer";
import type { Smtp } from "./segredos";

export interface RequisicaoHttp {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface RespostaHttp {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface Efeitos {
  email(smtp: Smtp, msg: { to: string; subject: string; text: string }): Promise<{ id?: string }>;
  http(req: RequisicaoHttp): Promise<RespostaHttp>;
}

/** Falha que vale tentar de novo (rede, 5xx, 429). */
export class ErroTransitorio extends Error {}

export const LIMITE_RESPOSTA = 10_000;
const TIMEOUT_MS = 15_000;

export const efeitosReais: Efeitos = {
  async email(smtp, msg) {
    const t = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass ?? "" } : undefined,
      connectionTimeout: TIMEOUT_MS,
    });
    try {
      const r = await t.sendMail({ from: smtp.from, to: msg.to, subject: msg.subject, text: msg.text });
      return { id: r.messageId };
    } catch (e) {
      throw new ErroTransitorio(`SMTP: ${(e as Error).message}`);
    }
  },
  async http(req) {
    let r: Response;
    try {
      r = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.method === "GET" || req.method === "DELETE" ? undefined : req.body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "follow",
      });
    } catch (e) {
      throw new ErroTransitorio(`HTTP: ${(e as Error).message}`);
    }
    const body = (await r.text()).slice(0, LIMITE_RESPOSTA);
    const headers: Record<string, string> = {};
    for (const k of ["content-type", "location"]) {
      const v = r.headers.get(k);
      if (v) headers[k] = v;
    }
    return { status: r.status, headers, body };
  },
};
