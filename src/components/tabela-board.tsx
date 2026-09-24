"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Calculator, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/misc";
import { idCurto } from "@/lib/formatar";
import { filtrarLinhas, type ColunaTabela, type LinhaTabela } from "@/lib/tabela";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});
const helper = createColumnHelper<typeof features, LinhaTabela>();

export function TabelaBoard({ ws, board, colunas, linhas }: { ws: string; board: string; colunas: ColunaTabela[]; linhas: LinhaTabela[] }) {
  const [termo, setTermo] = useState("");
  const dados = useMemo(() => filtrarLinhas(linhas, termo), [linhas, termo]);

  const defs = useMemo(
    () =>
      helper.columns([
        helper.accessor((l) => l.titulo.toLocaleLowerCase("pt-BR"), {
          id: "__titulo",
          header: "Card",
          cell: (info) => {
            const l = info.row.original;
            return (
              <Link href={`/w/${ws}/b/${board}/c/${l.id}?v=tabela`} scroll={false} className="font-medium hover:underline">
                {l.titulo}
                <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{idCurto(l.id)}</span>
              </Link>
            );
          },
        }),
        ...colunas.map((c) =>
          helper.accessor((l) => l.ordem[c.id] ?? null, {
            id: c.id,
            header: c.nome,
            sortUndefined: "last",
            cell: (info) => info.row.original.textos[c.id] ?? "",
          }),
        ),
      ]),
    [colunas, ws, board],
  );

  const table = useTable({ features, columns: defs, data: dados });

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 px-6 py-4">
      <div className="flex items-center gap-2">
        <Search className="size-4 text-muted-foreground" />
        <Input className="max-w-sm" aria-label="Filtrar" placeholder="Filtrar por texto…" value={termo} onChange={(e) => setTermo(e.target.value)} />
        <span className="text-xs text-muted-foreground">
          {dados.length} de {linhas.length}
        </span>
      </div>
      <Table>
        <THead>
          {table.getHeaderGroups().map((g) => (
            <Tr key={g.id}>
              {g.headers.map((h) => {
                const ordem = h.column.getIsSorted();
                const col = colunas.find((c) => c.id === h.column.id);
                return (
                  <Th key={h.id} className="whitespace-nowrap" aria-sort={ordem === "asc" ? "ascending" : ordem === "desc" ? "descending" : "none"}>
                    <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={h.column.getToggleSortingHandler()}>
                      <table.FlexRender header={h} />
                      {col?.calculado && <Calculator className="size-3 text-primary" aria-label="calculado" />}
                      {ordem === "asc" ? <ArrowUp className="size-3" /> : ordem === "desc" ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                    </button>
                  </Th>
                );
              })}
            </Tr>
          ))}
        </THead>
        <TBody>
          {table.getRowModel().rows.map((r) => (
            <Tr key={r.id} data-linha={r.original.id}>
              {r.getAllCells().map((c) => (
                <Td key={c.id} className="max-w-72 truncate whitespace-nowrap">
                  <table.FlexRender cell={c} />
                </Td>
              ))}
            </Tr>
          ))}
          {dados.length === 0 && (
            <Tr>
              <Td colSpan={colunas.length + 1} className="text-muted-foreground">
                Nenhum card.
              </Td>
            </Tr>
          )}
        </TBody>
      </Table>
    </div>
  );
}
