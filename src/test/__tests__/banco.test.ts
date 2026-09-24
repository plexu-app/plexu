import { describe, expect, it } from "vitest";
import { comBanco } from "../../db/migrar";
import { urlDeTeste } from "../banco";

describe("bancos separados", () => {
  it("troca só o nome do banco na URL", () => {
    expect(comBanco("postgres://u:s@h:5433/plexu", "plexu_test")).toBe("postgres://u:s@h:5433/plexu_test");
    expect(comBanco("postgres://u:s@h:5433/plexu?sslmode=require", "x")).toBe("postgres://u:s@h:5433/x?sslmode=require");
  });

  it("vitest usa plexu_test no servidor de DATABASE_URL; TEST_DATABASE_URL vence", () => {
    expect(urlDeTeste({ DATABASE_URL: "postgres://u:s@db:5432/plexu" })).toBe("postgres://u:s@db:5432/plexu_test");
    expect(urlDeTeste({})).toBe("postgres://plexu:plexu@localhost:5433/plexu_test");
    expect(urlDeTeste({ TEST_DATABASE_URL: "postgres://x/y", DATABASE_URL: "postgres://a/b" })).toBe("postgres://x/y");
  });

  it("a suíte roda no banco de teste", () => {
    expect(new URL(process.env.DATABASE_URL!).pathname).toBe("/plexu_test");
  });
});
