// Busca e filtros do board, na URL (?q=, ?resp=, ?atrasados=1): compartilhados pelo kanban e pela lista,
// aplicados no servidor (a paginação não deixa filtrar só o que já foi carregado). Puro.

export interface FiltrosBoard {
  /** Texto: título ou qualquer valor do card. */
  q: string;
  /** Responsável (id do usuário): assignees ou campo pessoa. */
  resp: string | null;
  /** Só cards abertos com prazo vencido. */
  atrasados: boolean;
}

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

const pegar = (sp: Params, k: string) => {
  const v = sp instanceof URLSearchParams ? sp.get(k) : sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? "";
};

export function lerFiltros(sp: Params): FiltrosBoard {
  const resp = pegar(sp, "resp");
  return {
    q: pegar(sp, "q").trim().slice(0, 200),
    resp: /^[0-9a-f-]{36}$/i.test(resp) ? resp : null,
    atrasados: pegar(sp, "atrasados") === "1",
  };
}

export const temFiltro = (f: FiltrosBoard) => !!(f.q || f.resp || f.atrasados);
