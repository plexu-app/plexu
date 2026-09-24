import { describe, expect, it } from "vitest";
import { conferirSenha, hashSenha, validarSenha } from "../senha";
import { assinarToken, verificarToken } from "../token";

const SEGREDO = "segredo-de-teste-com-32-caracteres!!";

describe("token de sessão", () => {
  const agora = Date.UTC(2026, 8, 23);
  const p = { u: "u1", v: 0, e: Math.floor(agora / 1000) + 60 };

  it("assina e verifica", () => {
    expect(verificarToken(assinarToken(p, SEGREDO), SEGREDO, agora)).toEqual(p);
  });

  it("recusa assinatura errada, adulteração, expiração e lixo", () => {
    const t = assinarToken(p, SEGREDO);
    expect(verificarToken(t, "outro-segredo-qualquer-123456", agora)).toBeNull();
    const [corpo, sig] = t.split(".");
    const adulterado = Buffer.from(JSON.stringify({ ...p, u: "admin" })).toString("base64url");
    expect(verificarToken(`${adulterado}.${sig}`, SEGREDO, agora)).toBeNull();
    expect(verificarToken(t, SEGREDO, agora + 61_000)).toBeNull();
    expect(verificarToken(`${corpo}.${sig}.x`, SEGREDO, agora)).toBeNull();
    expect(verificarToken("abc", SEGREDO, agora)).toBeNull();
    expect(verificarToken(undefined, SEGREDO, agora)).toBeNull();
  });
});

describe("senha", () => {
  it("valida tamanho", () => {
    expect(validarSenha("curta")).toMatch(/8 caracteres/);
    expect(validarSenha("x".repeat(73))).toMatch(/72/);
    expect(validarSenha("senha-boa-1")).toBeNull();
  });

  it("hash bcrypt confere só a senha certa", async () => {
    const h = await hashSenha("senha-boa-1", 4);
    expect(h).toMatch(/^\$2[aby]\$04\$/);
    expect(await conferirSenha("senha-boa-1", h)).toBe(true);
    expect(await conferirSenha("senha-ruim-1", h)).toBe(false);
    expect(await conferirSenha("qualquer", undefined)).toBe(false);
  });
});

describe("APP_SECRET", () => {
  it("recusa ausente, exemplo e curto; aceita 32+", async () => {
    const { problemaNoSegredo, SEGREDO_EXEMPLO } = await import("../segredo");
    expect(problemaNoSegredo(undefined)).toMatch(/não definido/);
    expect(problemaNoSegredo("  ")).toMatch(/não definido/);
    expect(problemaNoSegredo(SEGREDO_EXEMPLO)).toMatch(/exemplo/);
    expect(problemaNoSegredo("change-me")).toMatch(/exemplo/);
    expect(problemaNoSegredo("a".repeat(31))).toMatch(/curto/);
    expect(problemaNoSegredo("f".repeat(64))).toBeNull();
  });
});
