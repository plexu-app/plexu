// Cor de cada board (marcador da sidebar, chip de conexão no cartão). Puro: server e client.

/** Fluxos alternam as cores de fase (--f1..--f4) pela posição entre os fluxos; bases usam o cinza --f5. */
export function corDoBoard(kind: "workflow" | "database", indice: number) {
  return kind === "database" ? "var(--f5)" : `var(--f${(indice % 4) + 1})`;
}

/** Cor de cada board da lista (na ordem da sidebar: fluxos e bases contados à parte). */
export function coresDosBoards(boards: { id: string; kind: "workflow" | "database" }[]): Map<string, string> {
  const fluxos = boards.filter((b) => b.kind === "workflow");
  return new Map(boards.map((b) => [b.id, corDoBoard(b.kind, b.kind === "workflow" ? fluxos.indexOf(b) : 0)]));
}
