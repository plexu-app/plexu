// Montagem de linhas da tabela de board (puro; testável).
import { formatarValor, TIPOS_CALCULADOS_UI, tituloOu, valorDoCard, type CampoFmt } from "./formatar";

export interface ColunaTabela {
  id: string;
  nome: string;
  tipo: string;
  calculado: boolean;
}

export interface LinhaTabela {
  id: string;
  titulo: string;
  fase: string;
  /** Texto exibido por coluna. */
  textos: Record<string, string>;
  /** Valor para ordenação: número para numéricos, texto minúsculo para o resto, null se vazio. */
  ordem: Record<string, number | string | null>;
}

const NUMERICOS = new Set(["number", "currency", "rollup"]);

export function colunasDaTabela(campos: CampoFmt[], titleFieldId: string | null, comFase: boolean): ColunaTabela[] {
  const cols = campos
    .filter((c) => c.type !== "relation" && c.id !== titleFieldId)
    .map((c) => ({ id: c.id, nome: c.name, tipo: c.type, calculado: TIPOS_CALCULADOS_UI.has(c.type) }));
  return comFase ? [{ id: "__fase", nome: "Fase", tipo: "text", calculado: false }, ...cols] : cols;
}

export function linhasDaTabela(
  cards: { id: string; title: string; phaseId: string | null; props: Record<string, unknown>; computed: Record<string, unknown> }[],
  campos: CampoFmt[],
  fases: Map<string, string>,
  pessoas?: Map<string, string>,
): LinhaTabela[] {
  return cards.map((c) => {
    const textos: Record<string, string> = {};
    const ordem: Record<string, number | string | null> = {};
    const fase = c.phaseId ? fases.get(c.phaseId) ?? "" : "";
    textos.__fase = fase;
    ordem.__fase = fase ? fase.toLocaleLowerCase("pt-BR") : null;
    for (const campo of campos) {
      const v = valorDoCard(campo, c);
      textos[campo.id] = formatarValor(campo, v, pessoas);
      ordem[campo.id] =
        v === null || v === ""
          ? null
          : NUMERICOS.has(campo.type) && typeof v === "number"
            ? v
            : textos[campo.id].toLocaleLowerCase("pt-BR");
    }
    return { id: c.id, titulo: tituloOu(c.title, c.id), fase, textos, ordem };
  });
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Filtro simples: todas as palavras do termo aparecem no título, id ou algum valor exibido. */
export function filtrarLinhas(linhas: LinhaTabela[], termo: string): LinhaTabela[] {
  const palavras = semAcento(termo).split(/\s+/).filter(Boolean);
  if (!palavras.length) return linhas;
  return linhas.filter((l) => {
    const alvo = semAcento([l.titulo, l.id, ...Object.values(l.textos)].join(" "));
    return palavras.every((p) => alvo.includes(p));
  });
}
