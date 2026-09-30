import { describe, expect, it } from "vitest";
import { cifrar, decifrar, mascarar } from "../segredos";

process.env.APP_SECRET ??= "segredo-de-teste-com-mais-de-16-caracteres";

describe("segredos", () => {
  it("cifra com IV aleatório e decifra; adulteração é recusada", () => {
    const a = cifrar("s3nh@");
    expect(a).not.toContain("s3nh@");
    expect(cifrar("s3nh@")).not.toBe(a);
    expect(decifrar(a)).toBe("s3nh@");
    const partes = a.split(":");
    partes[3] = Buffer.from("outra").toString("base64url");
    expect(() => decifrar(partes.join(":"))).toThrow();
  });

  it("mascara segredos em textos de log", () => {
    expect(mascarar("Bearer abc123 e abc123", ["abc123"])).toBe("Bearer •••• e ••••");
  });
});
