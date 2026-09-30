import { describe, expect, it } from "vitest";
import { slugCampo } from "./slug";

describe("slugCampo", () => {
  it("identificador CEL de no máximo 40 caracteres, mesmo com o prefixo c_", () => {
    const k = slugCampo("69. Imobilizados, equipamentos e materiais de campo");
    expect(k).toMatch(/^[a-z_][a-z0-9_]{0,39}$/);
    expect(k.startsWith("c_69_imobilizados")).toBe(true);
    expect(slugCampo("Nome do campo")).toBe("nome_do_campo");
  });
});
