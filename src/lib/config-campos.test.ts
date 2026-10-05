import { describe, expect, it } from "vitest";
import { normalizarConfig, type ContextoConfig } from "./config-campos";

const ctx: ContextoConfig = {
  boardId: "pai",
  boards: new Map([["pai", "Pai"], ["filho", "Filho"]]),
  relacoes: new Map(),
  campos: [],
  camposPorBoard: new Map([["filho", [{ id: "data", type: "date" }, { id: "nome", type: "text" }, { id: "rel", type: "relation" }]]]),
};
const rel = (table_fields: unknown) => normalizarConfig("relation", { relation: { target_board: "filho", table_fields } }, ctx).relation as { table_fields?: unknown };

describe("relation.table_fields (colunas da sub-tabela)", () => {
  it("normaliza, remove repetidos e mantém a ordem", () => {
    expect(rel([{ field: "nome" }, { field: "data", editable: true }, { field: "nome" }]).table_fields).toEqual([
      { field: "nome", editable: false },
      { field: "data", editable: true },
    ]);
    expect(rel(undefined).table_fields).toBeUndefined();
  });
  it("recusa campo de outro board, relação e edição em tipo não editável", () => {
    expect(() => rel([{ field: "x" }])).toThrow(/não é um campo do board de destino/);
    expect(() => rel([{ field: "rel" }])).toThrow(/não é um campo do board de destino/);
    expect(() => rel([{ field: "nome", editable: true }])).toThrow(/edição na tabela/);
  });
});
