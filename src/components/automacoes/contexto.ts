// Dados de configuração que os editores de automação e ação precisam (vêm da página de settings).
import type { CampoCondicao } from "@/components/condicoes/construtor";

export interface CampoRef {
  id: string;
  slug: string;
  name: string;
  type: string;
}

export interface BoardRef {
  id: string;
  name: string;
  campos: CampoRef[];
  fases: { id: string; name: string }[];
}

/** Relação que liga este board a outro (de qualquer lado). */
export interface RelacaoRef {
  id: string;
  rotulo: string;
  /** Board do outro lado. */
  outro: string;
}

export interface ContextoAutomacoes {
  ws: string;
  board: string;
  boardId: string;
  fases: { id: string; name: string }[];
  campos: CampoRef[];
  boards: BoardRef[];
  relacoes: RelacaoRef[];
  condicoes: CampoCondicao[];
}

/** Campos que um passo pode preencher (calculados não). */
export const editavel = (c: CampoRef) => !["rollup", "dynamic_text", "formula", "sequence", "lookup"].includes(c.type);
